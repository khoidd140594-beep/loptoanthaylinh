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
  roomCode?: string;
  examId?: string;
  student: StudentInfo;
}) => {
  const studentId = params.student?.id;
  if (!studentId) {
    console.warn('createSubmission: Thiếu student.id');
    return null;
  }

  // 1. Kiểm tra xem đã có submission chưa
  const { data: existing } = await supabase
    .from('exam_submissions')
    .select('id, status')
    .eq('room_id', params.roomId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // 2. Chưa có thì insert bản ghi mới
  const studentName = params.student.name || (params.student as any).full_name || '';
  const { data, error } = await supabase
    .from('exam_submissions')
    .insert([{
      room_id: params.roomId,
      student_id: studentId,
      student_name: studentName,
      status: 'in_progress',
      answers: {},
      score_breakdown: {}
    }])
    .select('id')
    .maybeSingle();

  if (data?.id) return data.id;

  // 3. Nếu insert gặp lỗi (ví dụ race condition), query lại lần nữa
  const { data: retry } = await supabase
    .from('exam_submissions')
    .select('id')
    .eq('room_id', params.roomId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (retry?.id) return retry.id;
  if (error) console.error('createSubmission error:', error);
  return null;
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
  answers: Record<number | string, string>,
  exam: Exam,
  metrics: {
    tabSwitchCount: number;
    tabSwitchWarnings: any[];
    autoSubmitted: boolean;
    duration: number;
  }
) => {
  // Chấm điểm tự động an toàn
  const scoreBreakdown = calculateScore(answers || {}, exam || { questions: [] } as any);

  // ✅ FIX: Chuẩn hóa answers sang string keys để nhất quán với JSONB
  const normalizedAnswers: Record<string, string> = {};
  if (answers) {
    Object.entries(answers).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        normalizedAnswers[String(key)] = String(val);
      }
    });
  }

  // ✅ FIX ROOT CAUSE: Lưu shuffled_exam vào score_breakdown
  const examForStorage = stripImagesFromExam(exam);
  const fullBreakdown = {
    ...scoreBreakdown,
    shuffled_exam: examForStorage, // ← học sinh thấy đề nào, lưu đề đó
  };

  // ✅ FIX: Convert Date/Object → string để tránh Supabase JSONB serialization treo
  const safeWarnings = (metrics?.tabSwitchWarnings || []).map((d: any) =>
    d instanceof Date ? d.toISOString() : String(d)
  );

  const { data, error } = await supabase
    .from('exam_submissions')
    .update({
      answers: normalizedAnswers,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      tab_switches: metrics?.tabSwitchCount || 0,
      tab_switch_warnings: safeWarnings,
      duration: metrics?.duration || 0,
      score: scoreBreakdown.totalScore,
      score_breakdown: fullBreakdown   // ← bao gồm cả shuffled_exam
    })
    .eq('id', submissionId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('submitExam DB error:', JSON.stringify(error));
    throw error;
  }

  // Fallback nếu RLS không trả về dữ liệu select
  return data || {
    id: submissionId,
    answers: normalizedAnswers,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    score: scoreBreakdown.totalScore,
    score_breakdown: fullBreakdown,
  };
};
