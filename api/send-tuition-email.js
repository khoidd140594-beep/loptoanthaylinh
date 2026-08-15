/**
 * api/send-tuition-email.js
 * Gửi nhắc học phí qua Gmail (GAS) cho học sinh còn nợ
 *
 * POST /api/send-tuition-email
 * Body: { classId, month, studentIds? }   ← studentIds tuỳ chọn, nếu rỗng = gửi tất cả còn nợ
 */

import { createClient } from "@supabase/supabase-js";
import { format, endOfMonth } from "date-fns";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Gọi GAS gửi email ────────────────────────────────────────────────────────
async function callGAS(payload) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  if (!gasUrl) throw new Error("GAS_EMAIL_URL chưa được cấu hình");

  const res = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({
      type:   "tuition",
      secret: process.env.GAS_WEBHOOK_SECRET || "",
      ...payload,
    }),
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || "GAS trả về lỗi");
    return data;
  } catch {
    throw new Error(`GAS response không hợp lệ: ${text.slice(0, 100)}`);
  }
}

// ─── Tính học phí của 1 học sinh trong tháng ─────────────────────────────────
function calcTuition(cls, attRecords, payRecords, from, to) {
  // Buổi dự kiến: dùng planned_sessions (đã fix trước đó)
  const planned = cls.planned_sessions || 0;

  const attended    = attRecords.filter(a => a.present).length;
  const absences    = attRecords.filter(a => !a.present).length;
  const feePerSession = cls.fee_per_session || 0;
  const totalFee    = attended * feePerSession;

  const paidAmount  = payRecords
    .filter(p => p.date >= from && p.date <= to)
    .reduce((s, p) => s + (p.amount || 0), 0);

  const debt = Math.max(0, totalFee - paidAmount);

  return { planned, attended, absences, feePerSession, totalFee, paidAmount, debt };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { classId, month, studentIds } = req.body || {};
  if (!classId || !month) {
    return res.status(400).json({ error: "Thiếu classId hoặc month" });
  }

  const [y, m] = month.split("-");
  const from   = `${y}-${m}-01`;
  const to     = format(endOfMonth(new Date(+y, +m - 1)), "yyyy-MM-dd");

  try {
    // ── Lấy thông tin lớp ────────────────────────────────────────────────────
    const { data: cls, error: clsErr } = await supabase
      .from("classes")
      .select("id, class_name, subject, fee_per_session, planned_sessions")
      .eq("id", classId)
      .single();
    if (clsErr) throw clsErr;

    // ── Lấy danh sách học sinh đang học ──────────────────────────────────────
    let enrollQuery = supabase
      .from("enrollments")
      .select("student_id, students(id, full_name, student_code, email, parent_name)")
      .eq("class_id", classId)
      .eq("status", "active");

    if (studentIds?.length) {
      enrollQuery = enrollQuery.in("student_id", studentIds);
    }

    const { data: enrollments, error: enrErr } = await enrollQuery;
    if (enrErr) throw enrErr;

    // ── Lấy toàn bộ điểm danh + thanh toán của lớp trong tháng ──────────────
    const [{ data: allAtt }, { data: allPay }] = await Promise.all([
      supabase.from("attendance")
        .select("student_id, date, present")
        .eq("class_id", classId)
        .gte("date", from).lte("date", to),
      supabase.from("payments")
        .select("student_id, date, amount")
        .eq("class_id", classId),
    ]);

    // ── Gửi email từng học sinh còn nợ ───────────────────────────────────────
    const results = [];

    for (const enr of enrollments || []) {
      const student = enr.students;
      if (!student?.email) {
        results.push({ studentName: student?.full_name, skipped: "Không có email" });
        continue;
      }

      const attRecords = (allAtt || []).filter(a => a.student_id === student.id);
      const payRecords = (allPay || []).filter(p => p.student_id === student.id);
      const tuition    = calcTuition(cls, attRecords, payRecords, from, to);

      // Chỉ gửi nếu còn nợ (hoặc force gửi nếu có studentIds cụ thể)
      if (tuition.debt <= 0 && !studentIds?.length) {
        results.push({ studentName: student.full_name, skipped: "Đã đóng đủ" });
        continue;
      }

      try {
        await callGAS({
          parentEmail:      student.email,
          studentName:      student.full_name,
          className:        cls.class_name,
          month:            `${parseInt(m)}/${y}`,
          plannedSessions:  tuition.planned,
          absences:         tuition.absences,
          attendedSessions: tuition.attended,
          feePerSession:    tuition.feePerSession,
          totalFee:         tuition.totalFee,
          paidAmount:       tuition.paidAmount,
          debt:             tuition.debt,
          // Thông tin ngân hàng để GAS tự tạo QR trong email
          bankId:           process.env.BANK_ID          || "",
          bankAccount:      process.env.BANK_ACCOUNT     || "",
          bankAccountName:  process.env.BANK_ACCOUNT_NAME || "",
          centerName:       process.env.CENTER_NAME      || "EduCenter",
          // ✅ Thêm studentCode để GAS tạo nội dung CK chuẩn cho QR
          studentCode:      student.student_code || "",
        });

        // Ghi log vào Supabase
        await supabase.from("email_logs").insert({
          student_id:      student.id,
          class_id:        classId,
          type:            "tuition",
          recipient_email: student.email,
          subject:         `Nhắc học phí tháng ${parseInt(m)}/${y} – ${student.full_name}`,
          status:          "sent",
        });

        results.push({ studentName: student.full_name, email: student.email, sent: true, debt: tuition.debt });

      } catch (emailErr) {
        console.error(`Email error for ${student.full_name}:`, emailErr.message);

        await supabase.from("email_logs").insert({
          student_id:  student.id,
          class_id:    classId,
          type:        "tuition",
          recipient_email: student.email,
          status:      "error",
          error_msg:   emailErr.message,
        });

        results.push({ studentName: student.full_name, sent: false, error: emailErr.message });
      }
    }

    const sentCount    = results.filter(r => r.sent).length;
    const skippedCount = results.filter(r => r.skipped).length;
    const errorCount   = results.filter(r => r.sent === false).length;

    return res.status(200).json({
      ok: true,
      summary: { sent: sentCount, skipped: skippedCount, errors: errorCount },
      results,
    });

  } catch (err) {
    console.error("send-tuition-email error:", err);
    return res.status(500).json({ error: err.message });
  }
}
