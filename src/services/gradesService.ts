// src/services/gradesService.ts
// Truy vấn và tính toán cho phần nhập điểm.
//
// Dùng chung giữa trang giáo viên (Grades.tsx) và phiếu học tập của học sinh
// (StudentGradesSection.tsx), để công thức điểm trung bình chỉ tồn tại một chỗ.

import { supabase } from '@/lib/supabase';

export interface GradeColumn {
  id: string;
  class_id: string;
  title: string;
  exam_date: string | null;
  max_score: number;
  weight: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GradeScore {
  id: string;
  column_id: string;
  student_id: string;
  /** null = chưa nhập hoặc vắng kiểm tra. Khác hẳn 0 điểm. */
  score: number | null;
  comment: string | null;
  updated_at: string;
}

/** Một dòng trong phiếu học tập của học sinh. */
export interface StudentGradeRow {
  columnId: string;
  title: string;
  examDate: string | null;
  maxScore: number;
  weight: number;
  className: string;
  score: number | null;
  comment: string | null;
  /** Điểm trung bình của cả lớp ở bài này (thang gốc, chưa quy đổi). */
  classAvg: number | null;
  /** Hạng trong số các bạn đã có điểm. null nếu em này chưa có điểm. */
  rank: number | null;
  /** Số bạn đã có điểm ở bài này. */
  scoredCount: number;
}

export interface GradeColumnInput {
  class_id: string;
  title: string;
  exam_date: string | null;
  max_score: number;
  weight: number;
  note: string | null;
}

/* ------------------------------------------------------------------ *
 * Định dạng và tính toán
 * ------------------------------------------------------------------ */

/** 8 → '8', 8.5 → '8.5', 8.25 → '8.25'. Bỏ số 0 vô nghĩa ở cuối. */
export function fmtScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return String(Math.round(value * 100) / 100);
}

/** Quy đổi điểm về thang 10 để so sánh giữa các bài có thang khác nhau. */
export function toTen(score: number, maxScore: number): number {
  if (!maxScore) return 0;
  return (score / maxScore) * 10;
}

/**
 * Điểm trung bình có hệ số, quy về thang 10.
 * Bài chưa có điểm không được tính (không kéo trung bình xuống).
 */
export function weightedAverage(
  rows: Array<{ score: number | null; maxScore: number; weight: number }>,
): number | null {
  let totalWeight = 0;
  let totalPoints = 0;

  for (const row of rows) {
    if (row.score === null || row.score === undefined) continue;
    const weight = row.weight > 0 ? row.weight : 1;
    totalPoints += toTen(row.score, row.maxScore) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return Math.round((totalPoints / totalWeight) * 100) / 100;
}

/** Xếp loại theo thang 10, dùng cho phiếu học tập và tin nhắn Zalo. */
export function classify(avgTen: number | null): string {
  if (avgTen === null) return 'Chưa có điểm';
  if (avgTen >= 8) return 'Giỏi';
  if (avgTen >= 6.5) return 'Khá';
  if (avgTen >= 5) return 'Trung bình';
  return 'Cần cố gắng';
}

/** Hạng của một điểm trong danh sách điểm (điểm cao hơn = hạng nhỏ hơn). */
export function rankOf(score: number, allScores: number[]): number {
  return allScores.filter((s) => s > score).length + 1;
}

/* ------------------------------------------------------------------ *
 * Cột điểm
 * ------------------------------------------------------------------ */

export async function listGradeColumns(classId: string): Promise<GradeColumn[]> {
  const { data, error } = await supabase
    .from('grade_columns')
    .select('*')
    .eq('class_id', classId)
    .order('exam_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as GradeColumn[];
}

export async function createGradeColumn(input: GradeColumnInput): Promise<GradeColumn> {
  const { data, error } = await supabase
    .from('grade_columns')
    .insert([input])
    .select()
    .single();

  if (error) {
    // 23505 = unique violation trên (class_id, title, exam_date)
    if (error.code === '23505') {
      throw new Error('Lớp này đã có bài kiểm tra cùng tên trong cùng ngày.');
    }
    throw error;
  }
  return data as GradeColumn;
}

export async function updateGradeColumn(
  id: string,
  updates: Partial<GradeColumnInput>,
): Promise<GradeColumn> {
  const { data, error } = await supabase
    .from('grade_columns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as GradeColumn;
}

/** Xóa cột điểm. Điểm của học sinh trong cột bị xóa theo (on delete cascade). */
export async function deleteGradeColumn(id: string): Promise<void> {
  const { error } = await supabase.from('grade_columns').delete().eq('id', id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 * Ô điểm
 * ------------------------------------------------------------------ */

export async function listScoresByColumns(columnIds: string[]): Promise<GradeScore[]> {
  if (columnIds.length === 0) return [];

  const { data, error } = await supabase
    .from('grade_scores')
    .select('*')
    .in('column_id', columnIds);

  if (error) throw error;
  return (data ?? []) as GradeScore[];
}

export async function upsertGradeScores(
  rows: Array<{
    column_id: string;
    student_id: string;
    score: number | null;
    comment: string | null;
  }>,
): Promise<GradeScore[]> {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('grade_scores')
    .upsert(rows, { onConflict: 'column_id,student_id' })
    .select();

  if (error) throw error;
  return (data ?? []) as GradeScore[];
}

/* ------------------------------------------------------------------ *
 * Phiếu học tập của học sinh
 * ------------------------------------------------------------------ */

/**
 * Toàn bộ điểm của một học sinh, kèm trung bình lớp và hạng ở từng bài.
 *
 * Tách thành nhiều truy vấn nhỏ thay vì một câu join lồng: cách này không phụ
 * thuộc vào tên quan hệ mà PostgREST tự suy ra, nên không vỡ khi đổi khóa ngoại.
 */
export async function fetchStudentGradeSheet(studentId: string): Promise<StudentGradeRow[]> {
  if (!studentId) return [];

  // 1. Điểm của chính em này
  const { data: mine, error: mineError } = await supabase
    .from('grade_scores')
    .select('column_id, score, comment')
    .eq('student_id', studentId);

  if (mineError) throw mineError;
  const myScores = (mine ?? []) as Array<{
    column_id: string;
    score: number | null;
    comment: string | null;
  }>;

  if (myScores.length === 0) return [];
  const columnIds = myScores.map((s) => s.column_id);

  // 2. Thông tin các bài kiểm tra
  const { data: cols, error: colError } = await supabase
    .from('grade_columns')
    .select('id, class_id, title, exam_date, max_score, weight')
    .in('id', columnIds);

  if (colError) throw colError;
  const columns = (cols ?? []) as Array<
    Pick<GradeColumn, 'id' | 'class_id' | 'title' | 'exam_date' | 'max_score' | 'weight'>
  >;

  // 3. Tên lớp
  const classIds = [...new Set(columns.map((c) => c.class_id))];
  const classNames: Record<string, string> = {};

  if (classIds.length > 0) {
    const { data: classes } = await supabase
      .from('classes')
      .select('id, class_name')
      .in('id', classIds);

    for (const cls of (classes ?? []) as Array<{ id: string; class_name: string }>) {
      classNames[cls.id] = cls.class_name;
    }
  }

  // 4. Điểm của cả lớp ở các bài đó, để tính trung bình và hạng
  const peers = await listScoresByColumns(columnIds);
  const peerScores: Record<string, number[]> = {};

  for (const row of peers) {
    if (row.score === null) continue;
    (peerScores[row.column_id] ??= []).push(Number(row.score));
  }

  const columnById = new Map(columns.map((c) => [c.id, c]));

  const rows: StudentGradeRow[] = myScores
    .map((mineRow) => {
      const col = columnById.get(mineRow.column_id);
      if (!col) return null;

      const all = peerScores[col.id] ?? [];
      const avg = all.length
        ? Math.round((all.reduce((sum, v) => sum + v, 0) / all.length) * 100) / 100
        : null;

      return {
        columnId: col.id,
        title: col.title,
        examDate: col.exam_date,
        maxScore: Number(col.max_score),
        weight: Number(col.weight),
        className: classNames[col.class_id] ?? '',
        score: mineRow.score === null ? null : Number(mineRow.score),
        comment: mineRow.comment,
        classAvg: avg,
        rank: mineRow.score === null ? null : rankOf(Number(mineRow.score), all),
        scoredCount: all.length,
      } satisfies StudentGradeRow;
    })
    .filter((row): row is StudentGradeRow => row !== null);

  // Bài mới nhất lên trước; bài chưa có ngày xuống cuối.
  rows.sort((a, b) => (b.examDate ?? '').localeCompare(a.examDate ?? ''));
  return rows;
}

/** Phiếu học tập tra theo mã học sinh, dùng cho /progress?code=HS001 */
export async function fetchGradeSheetByStudentCode(code: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, student_code, grade')
    .ilike('student_code', code.trim())
    .maybeSingle();

  if (error || !data) return { student: null, rows: [] as StudentGradeRow[] };

  return {
    student: data as { id: string; full_name: string; student_code: string; grade: string | null },
    rows: await fetchStudentGradeSheet(data.id),
  };
}
