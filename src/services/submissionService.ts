// src/services/submissionService.ts
import { supabase } from '@/lib/supabase';
import { calculateScore } from './scoringService';
import { Exam, StudentInfo } from '../types';

export function isValidUUID(id?: any): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
}

export const ensureSignedIn = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) console.warn("Lỗi đăng nhập ẩn danh:", error);
    }
  } catch (e) {
    console.warn("ensureSignedIn exception:", e);
  }
};

export const createSubmission = async (params: {
  roomId: string;
  roomCode?: string;
  examId?: string;
  student: StudentInfo;
}) => {
  const rawId = params.student?.id;
  const validStudentId = isValidUUID(rawId) ? rawId : null;
  const studentName = params.student?.name || (params.student as any)?.full_name || '';

  try {
    // 1. Kiểm tra xem đã có submission chưa
    if (validStudentId) {
      const { data: existing } = await supabase
        .from('exam_submissions')
        .select('id, status')
        .eq('room_id', params.roomId)
        .eq('student_id', validStudentId)
        .maybeSingle();

      if (existing?.id) return existing.id;
    }

    // 2. Chưa có thì insert bản ghi mới
    const { data, error } = await supabase
      .from('exam_submissions')
      .insert([{
        room_id: params.roomId,
        student_id: validStudentId,
        student_name: studentName,
        status: 'in_progress',
        answers: {},
        score_breakdown: {}
      }])
      .select('id')
      .maybeSingle();

    if (data?.id) return data.id;

    // Nếu lỗi (ví dụ FK constraint), thử insert với student_id = null
    if (error && validStudentId) {
      const { data: retryNoFk } = await supabase
        .from('exam_submissions')
        .insert([{
          room_id: params.roomId,
          student_id: null,
          student_name: studentName,
          status: 'in_progress',
          answers: {},
          score_breakdown: {}
        }])
        .select('id')
        .maybeSingle();

      if (retryNoFk?.id) return retryNoFk.id;
    }

    // 3. Nếu insert gặp lỗi race condition, query lại
    if (validStudentId) {
      const { data: retry } = await supabase
        .from('exam_submissions')
        .select('id')
        .eq('room_id', params.roomId)
        .eq('student_id', validStudentId)
        .maybeSingle();

      if (retry?.id) return retry.id;
    }
  } catch (e) {
    console.error('createSubmission exception:', e);
  }

  return null;
};

/**
 * Strip base64 images khỏi exam data trước khi lưu.
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
      }))
    }))
  };
}

export const submitExam = async (
  submissionId: string | null | undefined,
  answers: Record<number | string, string>,
  exam: Exam,
  metrics: {
    tabSwitchCount: number;
    tabSwitchWarnings: any[];
    autoSubmitted: boolean;
    duration: number;
  },
  context?: {
    roomId?: string;
    student?: StudentInfo;
  }
) => {
  // Chấm điểm tự động an toàn
  const scoreBreakdown = calculateScore(answers || {}, exam || { questions: [] } as any);

  // Chuẩn hóa answers sang string keys
  const normalizedAnswers: Record<string, string> = {};
  if (answers) {
    Object.entries(answers).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        normalizedAnswers[String(key)] = String(val);
      }
    });
  }

  const examForStorage = stripImagesFromExam(exam);
  const fullBreakdown = {
    ...scoreBreakdown,
    shuffled_exam: examForStorage,
  };

  const safeWarnings = (metrics?.tabSwitchWarnings || []).map((d: any) =>
    d instanceof Date ? d.toISOString() : String(d)
  );

  const payload = {
    answers: normalizedAnswers,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    tab_switches: metrics?.tabSwitchCount || 0,
    tab_switch_warnings: safeWarnings,
    duration: metrics?.duration || 0,
    score: scoreBreakdown.totalScore,
    score_breakdown: fullBreakdown
  };

  // 1. Nếu có submissionId hợp lệ, thử update trước
  if (submissionId && isValidUUID(submissionId)) {
    try {
      const { data, error } = await supabase
        .from('exam_submissions')
        .update(payload)
        .eq('id', submissionId)
        .select()
        .maybeSingle();

      if (!error && data) {
        return data;
      }
      if (!error) {
        return { id: submissionId, ...payload };
      }
      console.warn('Update submission thất bại, chuyển sang fallback insert:', error);
    } catch (e) {
      console.warn('Update submission catch error:', e);
    }
  }

  // 2. Fallback: INSERT trực tiếp bản ghi nộp bài
  const roomId = context?.roomId;
  const rawStudentId = context?.student?.id;
  const validStudentId = isValidUUID(rawStudentId) ? rawStudentId : null;
  const studentName = context?.student?.name || (context?.student as any)?.full_name || '';

  if (roomId) {
    try {
      // Thử insert với student_id
      const { data: inserted, error: insErr } = await supabase
        .from('exam_submissions')
        .insert([{
          room_id: roomId,
          student_id: validStudentId,
          student_name: studentName,
          ...payload
        }])
        .select()
        .maybeSingle();

      if (!insErr && inserted) return inserted;
      if (!insErr) return { id: crypto.randomUUID(), ...payload };

      // Nếu lỗi FK (student_id không khớp bảng students), retry với student_id = null
      if (validStudentId) {
        const { data: retryIns, error: retryErr } = await supabase
          .from('exam_submissions')
          .insert([{
            room_id: roomId,
            student_id: null,
            student_name: studentName,
            ...payload
          }])
          .select()
          .maybeSingle();

        if (!retryErr && retryIns) return retryIns;
        if (!retryErr) return { id: crypto.randomUUID(), ...payload };
      }
    } catch (e) {
      console.error('Insert fallback catch error:', e);
    }
  }

  // 3. Đảm bảo UI luôn nhận kết quả chấm bài
  return {
    id: submissionId || crypto.randomUUID(),
    ...payload
  };
};
