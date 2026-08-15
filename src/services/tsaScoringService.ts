/**
 * tsaScoringService.ts
 * Dịch vụ chấm điểm cho đề thi TSA – 6 dạng câu hỏi
 */

import type { TSAExamData, TSAQuestion, TSAQuestionType } from './tsaParserService'
import { getCorrectAnswer } from './tsaParserService'

// ─────────────────────────────────────────────────────────────────────────────
// POINTS CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export interface TSAPointsConfig {
  maxScore: number            // Tổng điểm tối đa (mặc định 10)
  multipleChoice: {           // Phần I
    pointsPerQuestion: number
  }
  trueFalse: {                // Phần II – thang điểm bậc thang
    pointsPerQuestion: number
    /** true = điểm tỉ lệ theo số mệnh đề đúng, false = toàn bộ hoặc không */
    gradedScoring: boolean
  }
  multipleSelect: {           // Phần III
    pointsPerQuestion: number
    /** true = chỉ tính điểm khi chọn chính xác hoàn toàn */
    strictMatch: boolean
  }
  dragDrop: {                 // Phần IV
    pointsPerQuestion: number
    /** undefined = chia đều cho số slot */
    pointsPerSlot?: number
  }
  fillBlank: {                // Phần V
    pointsPerQuestion: number
    /** undefined = chia đều cho số ô trống */
    pointsPerBlank?: number
  }
  matching: {                 // Phần VI
    pointsPerQuestion: number
    /** undefined = chia đều cho số cặp */
    pointsPerPair?: number
  }
}

/** Tạo config mặc định dựa trên cấu trúc đề thi */
export function buildDefaultPointsConfig(exam: TSAExamData): TSAPointsConfig {
  const sections = exam.sections
  const totalQ = exam.totalQuestions || 1

  // Phân bổ điểm theo tỉ lệ số câu (tổng = 10)
  const sectionRatios: Partial<Record<string, number>> = {}
  for (const s of sections) {
    sectionRatios[s.id] = s.questions.length / totalQ
  }

  const getPoints = (id: string) =>
    Math.round(((sectionRatios[id] ?? 0) * 10) * 100) / 100

  const mcSection = sections.find(s => s.id === 'I')
  const tfSection = sections.find(s => s.id === 'II')
  const msSection = sections.find(s => s.id === 'III')
  const ddSection = sections.find(s => s.id === 'IV')
  const fbSection = sections.find(s => s.id === 'V')
  const matchSection = sections.find(s => s.id === 'VI')

  const safeDivide = (total: number, count: number) =>
    count > 0 ? Math.round((total / count) * 1000) / 1000 : 0

  return {
    maxScore: 10,
    multipleChoice: {
      pointsPerQuestion: safeDivide(getPoints('I'), mcSection?.questions.length ?? 1),
    },
    trueFalse: {
      pointsPerQuestion: safeDivide(getPoints('II'), tfSection?.questions.length ?? 1),
      gradedScoring: true,
    },
    multipleSelect: {
      pointsPerQuestion: safeDivide(getPoints('III'), msSection?.questions.length ?? 1),
      strictMatch: true,
    },
    dragDrop: {
      pointsPerQuestion: safeDivide(getPoints('IV'), ddSection?.questions.length ?? 1),
    },
    fillBlank: {
      pointsPerQuestion: safeDivide(getPoints('V'), fbSection?.questions.length ?? 1),
    },
    matching: {
      pointsPerQuestion: safeDivide(getPoints('VI'), matchSection?.questions.length ?? 1),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-QUESTION SCORING
// ─────────────────────────────────────────────────────────────────────────────

export interface TSAQuestionScore {
  questionId: string
  sectionId: string
  type: TSAQuestionType
  maxPoints: number
  earnedPoints: number
  /** số đơn vị đúng (mệnh đề / slot / ô / cặp) */
  correctUnits: number
  totalUnits: number
  /** true = hoàn toàn đúng */
  isFullyCorrect: boolean
  /** true = chưa trả lời */
  isSkipped: boolean
  detail?: Record<string, any>
}

/** Normalize đáp án số: bỏ khoảng trắng, thống nhất dấu phẩy → chấm,
 *  strip ký tự LaTeX như $...$, \text{}, \mathrm{}, dấu ngoặc kép, etc.
 */
function normalizeNumericAnswer(ans: string): string {
  let s = (ans ?? '').trim()
  // Strip outer $...$ math delimiters (ví dụ đáp án lưu là "$64$")
  s = s.replace(/^\$+|\$+$/g, '').trim()
  // Strip LaTeX text wrappers
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/g, '$1')
  // Thống nhất
  s = s.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.')
  // Nếu là số thì normalize
  const n = Number(s)
  if (!isNaN(n) && s !== '') return n.toString()
  return s
}

export function scoreOneQuestion(
  q: TSAQuestion,
  studentAnswer: any,
  config: TSAPointsConfig
): TSAQuestionScore {
  const correct = getCorrectAnswer(q)
  const base: Omit<TSAQuestionScore, 'correctUnits' | 'totalUnits' | 'isFullyCorrect' | 'isSkipped' | 'earnedPoints'> = {
    questionId: q.id,
    sectionId: q.sectionId,
    type: q.type,
    maxPoints: 0,
  }

  switch (q.type) {
    // ── I. Trắc nghiệm nhiều lựa chọn ──────────────────────────────────────
    case 'tsa_multiple_choice': {
      const max = config.multipleChoice.pointsPerQuestion
      const isSkipped = !studentAnswer
      const isCorrect = !isSkipped && (studentAnswer as string)?.toUpperCase() === (correct as string)?.toUpperCase()
      return {
        ...base, maxPoints: max,
        earnedPoints: isCorrect ? max : 0,
        correctUnits: isCorrect ? 1 : 0, totalUnits: 1,
        isFullyCorrect: isCorrect, isSkipped,
        detail: { studentAnswer, correctAnswer: correct },
      }
    }

    // ── II. Đúng / Sai ───────────────────────────────────────────────────────
    case 'tsa_true_false': {
      const max = config.trueFalse.pointsPerQuestion
      const statements = q.tfStatements ?? []
      const total = statements.length
      const isSkipped = !studentAnswer || typeof studentAnswer !== 'object'
      let correctCount = 0
      const detail: Record<string, { isTrue: boolean; studentVal?: 'T' | 'F'; isMatch: boolean }> = {}

      for (const stmt of statements) {
        const correctVal = stmt.isTrue ? 'T' : 'F'
        const studentVal = isSkipped ? undefined : (studentAnswer as Record<string, 'T' | 'F'>)[stmt.label]
        const isMatch = studentVal === correctVal
        if (isMatch) correctCount++
        detail[stmt.label] = { isTrue: stmt.isTrue, studentVal, isMatch }
      }

      let earned = 0
      if (!isSkipped && total > 0) {
        if (config.trueFalse.gradedScoring) {
          // Tỉ lệ bậc thang: điểm tỉ lệ với số mệnh đề đúng
          earned = Math.round((correctCount / total) * max * 1000) / 1000
        } else {
          earned = correctCount === total ? max : 0
        }
      }

      return {
        ...base, maxPoints: max,
        earnedPoints: earned,
        correctUnits: correctCount, totalUnits: total,
        isFullyCorrect: correctCount === total, isSkipped,
        detail,
      }
    }

    // ── III. Chọn nhiều đáp án đúng ──────────────────────────────────────────
    case 'tsa_multiple_select': {
      const max = config.multipleSelect.pointsPerQuestion
      const correctSet = new Set((correct as string[]).map(l => l.toUpperCase()))
      const studentSet = new Set((Array.isArray(studentAnswer) ? studentAnswer : []).map((l: string) => l.toUpperCase()))
      const isSkipped = studentSet.size === 0

      const isExact = !isSkipped &&
        [...correctSet].every(l => studentSet.has(l)) &&
        [...studentSet].every(l => correctSet.has(l))

      // Điểm một phần: số đáp án chọn đúng
      const correctUnits = [...correctSet].filter(l => studentSet.has(l)).length
      const wrongSelections = [...studentSet].filter(l => !correctSet.has(l)).length
      const netCorrect = Math.max(0, correctUnits - wrongSelections)

      const earned = config.multipleSelect.strictMatch
        ? (isExact ? max : 0)
        : Math.round((netCorrect / correctSet.size) * max * 1000) / 1000

      return {
        ...base, maxPoints: max,
        earnedPoints: earned,
        correctUnits: isExact ? correctSet.size : correctUnits,
        totalUnits: correctSet.size,
        isFullyCorrect: isExact, isSkipped,
        detail: { correctAnswer: [...correctSet], studentAnswer: [...studentSet], wrongSelections },
      }
    }

    // ── IV. Kéo thả ──────────────────────────────────────────────────────────
    case 'tsa_drag_drop': {
      const max = config.dragDrop.pointsPerQuestion
      const dropCount = q.dropCount ?? 0
      const isSkipped = !studentAnswer || typeof studentAnswer !== 'object' || Object.keys(studentAnswer).length === 0
      const correctMap = correct as Record<string, string>  // { slot_1: "item_id" }

      let correctCount = 0
      const detail: Record<string, { correctItemId?: string; studentItemId?: string; isMatch: boolean }> = {}

      for (let i = 1; i <= dropCount; i++) {
        const slotKey = `slot_${i}`
        const correctItemId = correctMap[slotKey]
        const studentItemId = isSkipped ? undefined : (studentAnswer as Record<string, string>)[slotKey]
        const isMatch = !!correctItemId && studentItemId === correctItemId
        if (isMatch) correctCount++
        detail[slotKey] = { correctItemId, studentItemId, isMatch }
      }

      const perSlot = config.dragDrop.pointsPerSlot ?? (dropCount > 0 ? max / dropCount : 0)
      const earned = isSkipped ? 0 : Math.round(correctCount * perSlot * 1000) / 1000

      return {
        ...base, maxPoints: max,
        earnedPoints: Math.min(earned, max),
        correctUnits: correctCount, totalUnits: dropCount,
        isFullyCorrect: correctCount === dropCount && dropCount > 0,
        isSkipped, detail,
      }
    }

    // ── V. Điền khuyết ───────────────────────────────────────────────────────
    case 'tsa_fill_blank': {
      const max = config.fillBlank.pointsPerQuestion
      const blanks = q.blanks ?? []
      const total = blanks.length
      const isSkipped = !studentAnswer || typeof studentAnswer !== 'object' || Object.keys(studentAnswer).length === 0
      const correctAnswers = correct as Record<number, string>

      let correctCount = 0
      const detail: Record<number, { correctAnswer: string; studentAnswer?: string; isMatch: boolean }> = {}

      for (const blank of blanks) {
        const correctAns = correctAnswers[blank.index] ?? ''
        const studentAns = isSkipped ? undefined : (studentAnswer as Record<number, string>)[blank.index]
        const isMatch = !!studentAns && normalizeNumericAnswer(studentAns) === normalizeNumericAnswer(correctAns)
        if (isMatch) correctCount++
        detail[blank.index] = { correctAnswer: correctAns, studentAnswer: studentAns, isMatch }
      }

      const perBlank = config.fillBlank.pointsPerBlank ?? (total > 0 ? max / total : 0)
      const earned = isSkipped ? 0 : Math.round(correctCount * perBlank * 1000) / 1000

      return {
        ...base, maxPoints: max,
        earnedPoints: Math.min(earned, max),
        correctUnits: correctCount, totalUnits: total,
        isFullyCorrect: correctCount === total && total > 0,
        isSkipped, detail,
      }
    }

    // ── VI. Ghép đôi ─────────────────────────────────────────────────────────
    case 'tsa_matching': {
      const max = config.matching.pointsPerQuestion
      const leftItems = q.matchLeft ?? []
      const total = leftItems.length
      const isSkipped = !studentAnswer || typeof studentAnswer !== 'object' || Object.keys(studentAnswer).length === 0
      const correctPairs = correct as Record<number, string>

      let correctCount = 0
      const detail: Record<number, { correctLetter: string; studentLetter?: string; isMatch: boolean }> = {}

      for (const item of leftItems) {
        const correctLetter = correctPairs[item.num]
        const studentLetter = isSkipped ? undefined : (studentAnswer as Record<number, string>)[item.num]
        const isMatch = !!studentLetter && studentLetter.toLowerCase() === correctLetter?.toLowerCase()
        if (isMatch) correctCount++
        detail[item.num] = { correctLetter, studentLetter, isMatch }
      }

      const perPair = config.matching.pointsPerPair ?? (total > 0 ? max / total : 0)
      const earned = isSkipped ? 0 : Math.round(correctCount * perPair * 1000) / 1000

      return {
        ...base, maxPoints: max,
        earnedPoints: Math.min(earned, max),
        correctUnits: correctCount, totalUnits: total,
        isFullyCorrect: correctCount === total && total > 0,
        isSkipped, detail,
      }
    }

    default:
      return { ...base, maxPoints: 0, earnedPoints: 0, correctUnits: 0, totalUnits: 0, isFullyCorrect: false, isSkipped: true }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL EXAM SCORING
// ─────────────────────────────────────────────────────────────────────────────

export interface TSASectionBreakdown {
  sectionId: string
  sectionName: string
  total: number         // số câu
  fullyCorrect: number  // câu đúng hoàn toàn
  partial: number       // câu đúng một phần
  skipped: number
  maxPoints: number
  earnedPoints: number
  questionScores: TSAQuestionScore[]
}

export interface TSAScoreBreakdown {
  exam_type: 'tsa'
  totalScore: number
  maxScore: number
  percentage: number
  sections: TSASectionBreakdown[]
  questionScores: Record<string, TSAQuestionScore>  // key = questionId
  pointsConfig: TSAPointsConfig
  shuffled_exam?: TSAExamData
}

export function scoreTSAExam(
  exam: TSAExamData,
  studentAnswers: Record<string, any>,
  pointsConfigOverride?: Partial<TSAPointsConfig>
): TSAScoreBreakdown {
  const config = { ...buildDefaultPointsConfig(exam), ...pointsConfigOverride }

  const allScores: Record<string, TSAQuestionScore> = {}
  const sectionBreakdowns: TSASectionBreakdown[] = []
  let totalEarned = 0
  let totalMax = 0

  for (const section of exam.sections) {
    const qScores: TSAQuestionScore[] = []

    for (const q of section.questions) {
      const ans = studentAnswers[q.id]
      const score = scoreOneQuestion(q, ans, config)
      allScores[q.id] = score
      qScores.push(score)
    }

    const sectionMax = qScores.reduce((s, q) => s + q.maxPoints, 0)
    const sectionEarned = qScores.reduce((s, q) => s + q.earnedPoints, 0)
    const fullyCorrect = qScores.filter(q => q.isFullyCorrect).length
    const partial = qScores.filter(q => !q.isSkipped && !q.isFullyCorrect && q.earnedPoints > 0).length
    const skipped = qScores.filter(q => q.isSkipped).length

    totalEarned += sectionEarned
    totalMax += sectionMax

    sectionBreakdowns.push({
      sectionId: section.id,
      sectionName: section.name,
      total: section.questions.length,
      fullyCorrect,
      partial,
      skipped,
      maxPoints: sectionMax,
      earnedPoints: Math.round(sectionEarned * 1000) / 1000,
      questionScores: qScores,
    })
  }

  // Quy về thang maxScore
  const rawScore = totalMax > 0 ? (totalEarned / totalMax) * config.maxScore : 0
  const finalScore = Math.round(rawScore * 100) / 100
  const percentage = Math.round((rawScore / config.maxScore) * 100)

  return {
    exam_type: 'tsa',
    totalScore: finalScore,
    maxScore: config.maxScore,
    percentage,
    sections: sectionBreakdowns,
    questionScores: allScores,
    pointsConfig: config,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS dùng ở UI
// ─────────────────────────────────────────────────────────────────────────────

export function formatTSAScore(n: number): string {
  if (n === Math.floor(n)) return n.toString()
  return n.toFixed(2).replace(/\.?0+$/, '')
}

export function getTSAGrade(percentage: number) {
  if (percentage >= 90) return { grade: 'A+', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-300', emoji: '🏆', label: 'Xuất sắc' }
  if (percentage >= 80) return { grade: 'A',  color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-300', emoji: '🌟', label: 'Giỏi' }
  if (percentage >= 70) return { grade: 'B+', color: 'text-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-300',  emoji: '👍', label: 'Khá' }
  if (percentage >= 60) return { grade: 'B',  color: 'text-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-300',  emoji: '📚', label: 'Trung bình khá' }
  if (percentage >= 50) return { grade: 'C',  color: 'text-yellow-600',bg: 'bg-yellow-50',border: 'border-yellow-300',emoji: '💪', label: 'Trung bình' }
  if (percentage >= 40) return { grade: 'D',  color: 'text-orange-600',bg: 'bg-orange-50',border: 'border-orange-300',emoji: '📖', label: 'Yếu' }
  return                      { grade: 'F',  color: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-300',   emoji: '😞', label: 'Kém' }
}

/** Màu sắc cho từng section TSA */
export const TSA_SECTION_COLORS = {
  I:   { gradient: 'from-blue-600 to-indigo-700',    badge: 'bg-blue-100 text-blue-700 border-blue-300',     light: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  II:  { gradient: 'from-teal-600 to-emerald-700',   badge: 'bg-teal-100 text-teal-700 border-teal-300',     light: 'bg-teal-50',   border: 'border-teal-200',   dot: 'bg-teal-500' },
  III: { gradient: 'from-violet-600 to-purple-700',  badge: 'bg-violet-100 text-violet-700 border-violet-300', light: 'bg-violet-50', border: 'border-violet-200', dot: 'bg-violet-500' },
  IV:  { gradient: 'from-orange-500 to-amber-600',   badge: 'bg-orange-100 text-orange-700 border-orange-300', light: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  V:   { gradient: 'from-rose-500 to-pink-600',      badge: 'bg-rose-100 text-rose-700 border-rose-300',     light: 'bg-rose-50',   border: 'border-rose-200',   dot: 'bg-rose-500' },
  VI:  { gradient: 'from-cyan-600 to-sky-700',       badge: 'bg-cyan-100 text-cyan-700 border-cyan-300',     light: 'bg-cyan-50',   border: 'border-cyan-200',   dot: 'bg-cyan-500' },
} as const
