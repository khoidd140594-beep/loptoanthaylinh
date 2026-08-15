// @ts-nocheck
// services/texToQuiz.ts
//
// Đọc file .tex (ex_test) → danh sách câu hỏi cho bộ sinh quiz tương tác.
// Tái dùng parseTexToExam (đã có trong dự án) — nó lo phần TikZ→ảnh + LaTeX→HTML,
// ở đây chỉ ánh xạ ExamData.questions sang hình dạng mà interactiveQuizHtml cần.

import { parseTexToExam } from '@/services/texParserService'

export interface QuizQuestion {
  type: 'multiple_choice' | 'true_false' | 'short_answer'
  question: string
  options?: string[]
  correct?: number | null      // 1-based cho trắc nghiệm
  statements?: string[]
  correctAnswers?: number[]     // 0-based cho đúng/sai
  correct_answer?: string       // lời giải / đáp án hiện khi bấm "Kiểm tra"
}

export async function texFileToQuizQuestions(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<{ questions: QuizQuestion[]; title: string }> {
  const exam = await parseTexToExam(file, onProgress)
  const questions = (exam.questions || []).map(mapQuestion)
  const title = exam.title || file.name.replace(/\.tex$/i, '')
  return { questions, title }
}

function mapQuestion(q: any): QuizQuestion {
  const solution = q.solution ? String(q.solution) : ''
  const options = Array.isArray(q.options) ? q.options : []

  if (q.type === 'multiple_choice' || q.type === 'multichoice') {
    const texts = options.map((o: any) => o.text)
    let correct = options.findIndex((o: any) => o.isCorrect)
    if (correct < 0 && q.correctAnswer) {
      correct = String(q.correctAnswer).trim().toUpperCase().charCodeAt(0) - 65
    }
    return {
      type: 'multiple_choice',
      question: q.text,
      options: texts,
      correct: correct >= 0 ? correct + 1 : null,
      correct_answer: solution,
    }
  }

  if (q.type === 'true_false' || q.type === 'truefalse') {
    const stmts = options.map((o: any) => o.text)
    let idx = options.map((o: any, i: number) => (o.isCorrect ? i : -1)).filter((i: number) => i >= 0)
    if (idx.length === 0 && q.correctAnswer) {
      idx = String(q.correctAnswer)
        .split(',')
        .map((s: string) => s.trim().toLowerCase().charCodeAt(0) - 97)
        .filter((i: number) => i >= 0 && i < stmts.length)
    }
    return {
      type: 'true_false',
      question: q.text,
      statements: stmts,
      correctAnswers: idx,
      correct_answer: solution,
    }
  }

  // short_answer / writing / essay → ô nhập + hiện đáp án khi kiểm tra
  const ans = q.correctAnswer ? String(q.correctAnswer) : ''
  return {
    type: 'short_answer',
    question: q.text,
    correct_answer: (ans ? `<strong>Đáp án:</strong> ${ans}<br><br>` : '') + solution,
  }
}
