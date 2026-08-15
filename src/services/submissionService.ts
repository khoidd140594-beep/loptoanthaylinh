// src/services/submissionService.ts
import { supabase } from '@/lib/supabase';
import { calculateScore } from './scoringService';
import { Exam, StudentInfo } from '../types';

export const ensureSignedIn = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) console.warn("Lỗi đăng nhập ẩn danh:", error);
  }
};

export const createSubmission = async (params: {
  roomId: string;
  roomCode: string;
  examId: string;
  student: StudentInfo;
}) => {
  const { data: existing } = await supabase
    .from('exam_submissions')
    .select('id, status')
    .eq('room_id', params.roomId)
    .eq('student_id', params.student.id)
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('exam_submissions')
    .insert([{
      room_id: params.roomId,
      student_id: params.student.id,
      status: 'in_progress',
      answers: {},
      score_breakdown: {}
    }])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
};

/**
 * ✅ FIX ROOT CAUSE: Strip base64 images khỏi exam data trước khi lưu.
 * Ảnh base64 đã được lưu riêng trong bảng exam_images.
 * Chỉ giữ lại { id, filename, contentType } để có thể load lại sau.
 */
function stripImagesFromExam(exam: any): any {
  if (!exam) return exam;
  return {
    ...exam,
    questions: (exam.questions || []).map((q: any) => ({
      ...q,
      images: (q.images || []).map((img: any) => ({
        id: img.id,
        filename: img.filename,
        contentType: img.contentType,
        // Không lưu img.base64 để giảm kích thước
      }))
    }))
  };
}

export const submitExam = async (
  submissionId: string,
  answers: Record<number, string>,
  exam: Exam,
  metrics: {
    tabSwitchCount: number;
    tabSwitchWarnings: any[];
    autoSubmitted: boolean;
    duration: number;
  }
) => {
  // Chấm điểm tự động
  const scoreBreakdown = calculateScore(answers, exam);

  // ✅ FIX: Chuẩn hóa answers sang string keys để nhất quán với JSONB
  const normalizedAnswers: Record<string, string> = {};
  Object.entries(answers).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      normalizedAnswers[String(key)] = String(val);
    }
  });

  // ✅ FIX ROOT CAUSE: Lưu shuffled_exam vào score_breakdown
  // Khi shuffle bật, câu hỏi được đánh số lại từ 1 (1,2,3...N).
  // Nếu KHÔNG lưu lại, sau khi submit, giáo viên sẽ xem đề gốc (số 101,102...)
  // nhưng answers lại dùng key 1,2,3... → mismatch → hiển thị "bỏ trống".
  const examForStorage = stripImagesFromExam(exam);
  const fullBreakdown = {
    ...scoreBreakdown,
    shuffled_exam: examForStorage, // ← học sinh thấy đề nào, lưu đề đó
  };

  // ✅ FIX: Convert Date/Object → string để tránh Supabase JSONB serialization treo
  const safeWarnings = (metrics.tabSwitchWarnings || []).map((d: any) =>
    d instanceof Date ? d.toISOString() : String(d)
  );

  const { data, error } = await supabase
    .from('exam_submissions')
    .update({
      answers: normalizedAnswers,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      tab_switches: metrics.tabSwitchCount,
      tab_switch_warnings: safeWarnings,
      duration: metrics.duration,
      score: scoreBreakdown.totalScore,
      score_breakdown: fullBreakdown   // ← bao gồm cả shuffled_exam
    })
    .eq('id', submissionId)
    .select()
    .single();

  if (error) {
    console.error('submitExam DB error:', JSON.stringify(error));
    throw error;
  }
  return data;
};
