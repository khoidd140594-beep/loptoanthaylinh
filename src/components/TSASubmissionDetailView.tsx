// @ts-nocheck
/**
 * TSASubmissionDetailView.tsx
 * Modal xem chi tiết bài làm TSA cho giáo viên.
 * Tương đương SubmissionDetailView.tsx nhưng hỗ trợ 6 dạng câu hỏi TSA.
 */

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import MathText from './MathText'
import { formatTSAScore, getTSAGrade, TSA_SECTION_COLORS } from '../services/tsaScoringService'
import type { TSAExamData, TSAQuestion, TSASectionId } from '../services/tsaParserService'
import type { TSAScoreBreakdown } from '../services/tsaScoringService'
import { X, AlertTriangle, Clock, CheckCircle2, XCircle } from 'lucide-react'

interface TSASubmissionDetailViewProps {
  submission: any
  exam: TSAExamData & { title: string }
  room?: any
  onClose: () => void
}

export default function TSASubmissionDetailView({ submission, exam, room, onClose }: TSASubmissionDetailViewProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const sbRaw: TSAScoreBreakdown = submission.scoreBreakdown || submission.score_breakdown || {}
  const isPending = sbRaw.pending_score || !sbRaw.sections
  const totalScore = submission.totalScore ?? submission.score ?? sbRaw.totalScore ?? 0
  const percentage = submission.percentage ?? sbRaw.percentage ?? 0
  const maxScore = sbRaw.maxScore ?? sbRaw.pointsConfig?.maxScore ?? 10
  const gradeInfo = getTSAGrade(percentage)

  const studentAnswers = submission.answers ?? {}

  const formatDuration = (s: number) => {
    if (!s) return '—'
    return `${Math.floor(s / 60)}p ${s % 60}s`
  }

  const content = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-50 rounded-2xl w-full max-w-5xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-white/15 text-white text-xs font-black px-2 py-0.5 rounded-full border border-white/20">TSA</span>
                <h2 className="text-lg font-black">Chi tiết bài làm</h2>
              </div>
              <p className="text-white/70 text-sm">
                {submission.student?.name || 'Học sinh'}
                {submission.student?.studentCode && <span className="ml-2 font-mono opacity-70">· {submission.student.studentCode}</span>}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Score summary bar ── */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-5 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Total */}
            <div className={`rounded-xl p-4 border-2 ${gradeInfo.bg} ${gradeInfo.border}`}>
              <div className="text-xs font-bold uppercase text-gray-500 mb-1">Tổng điểm</div>
              <div className={`text-3xl font-black ${gradeInfo.color}`}>
                {formatTSAScore(totalScore)}
                <span className="text-base font-normal text-gray-300">/{maxScore}</span>
              </div>
              <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${gradeInfo.bg} ${gradeInfo.color}`}>
                {gradeInfo.emoji} {gradeInfo.label}
              </span>
            </div>

            {/* Percentage */}
            <div className="rounded-xl p-4 border-2 bg-blue-50 border-blue-200">
              <div className="text-xs font-bold uppercase text-blue-500 mb-1">Tỉ lệ đúng</div>
              <div className="text-3xl font-black text-blue-700">{percentage}%</div>
              <div className="text-xs text-blue-500 mt-1">{exam.totalQuestions} câu tổng</div>
            </div>

            {/* Duration */}
            <div className="rounded-xl p-4 border-2 bg-gray-50 border-gray-200">
              <div className="text-xs font-bold uppercase text-gray-500 mb-1">
                <Clock className="w-3 h-3 inline mr-1" />Thời gian
              </div>
              <div className="text-xl font-black text-gray-700">{formatDuration(submission.duration || submission.duration_seconds)}</div>
              {(submission.tabSwitchCount > 0 || (submission as any).tab_switches > 0) && (
                <div className="text-xs text-amber-600 font-bold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {submission.tabSwitchCount || (submission as any).tab_switches} lần chuyển tab
                </div>
              )}
            </div>

            {/* Status */}
            <div className="rounded-xl p-4 border-2 bg-slate-50 border-slate-200">
              <div className="text-xs font-bold uppercase text-slate-500 mb-1">Trạng thái</div>
              <div className={`text-sm font-black ${isPending ? 'text-amber-600' : 'text-green-700'}`}>
                {isPending ? '⏳ Chờ chấm' : '✅ Đã chấm'}
              </div>
              {submission.submitted_at && (
                <div className="text-xs text-gray-400 mt-1">{new Date(submission.submitted_at).toLocaleString('vi-VN')}</div>
              )}
            </div>
          </div>

          {/* Section breakdown pills */}
          {sbRaw.sections && sbRaw.sections.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {sbRaw.sections.map(sec => {
                const colors = TSA_SECTION_COLORS[sec.sectionId as TSASectionId]
                return (
                  <div key={sec.sectionId} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${colors.badge}`}>
                    <span className={`w-4 h-4 rounded-full ${colors.dot} text-white flex items-center justify-center text-[9px] font-black`}>{sec.sectionId}</span>
                    {formatTSAScore(sec.earnedPoints)}/{formatTSAScore(sec.maxPoints)}đ
                    · {sec.fullyCorrect}/{sec.total}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Scrollable question list ── */}
        <div className="flex-1 overflow-y-auto">
          {exam.sections.map(section => {
            const colors = TSA_SECTION_COLORS[section.id]
            const secScore = sbRaw.sections?.find(s => s.sectionId === section.id)

            return (
              <div key={section.id}>
                {/* Section header */}
                <div className={`sticky top-0 z-10 bg-gradient-to-r ${colors.gradient} flex items-center justify-between px-5 py-3 border-b-4 ${colors.border}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white/20 text-white font-black flex items-center justify-center text-sm">{section.id}</span>
                    <span className="text-white font-black text-sm">{section.name}</span>
                    <span className="text-white/70 text-xs">({section.questions.length} câu)</span>
                  </div>
                  {secScore && (
                    <span className="text-white font-black text-base">
                      {formatTSAScore(secScore.earnedPoints)}<span className="text-white/60 text-sm">/{formatTSAScore(secScore.maxPoints)}đ</span>
                    </span>
                  )}
                </div>

                {/* Questions */}
                <div className="bg-white divide-y divide-gray-100">
                  {section.questions.map(q => {
                    const qScore = sbRaw.questionScores?.[q.id]
                    const ans = studentAnswers[q.id]
                    return (
                      <TSAQuestionDetail
                        key={q.id}
                        question={q}
                        studentAnswer={ans}
                        questionScore={qScore}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(content, document.body)
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION DETAIL DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

function TSAQuestionDetail({ question, studentAnswer, questionScore }) {
  const isSkipped = questionScore?.isSkipped ?? !studentAnswer
  const isCorrect = questionScore?.isFullyCorrect ?? false
  const hasPartial = !isSkipped && !isCorrect && (questionScore?.earnedPoints ?? 0) > 0
  const earned = questionScore?.earnedPoints ?? 0
  const maxPts = questionScore?.maxPoints ?? 0

  const headerBg = isSkipped ? 'bg-gray-50' : isCorrect ? 'bg-emerald-50' : hasPartial ? 'bg-amber-50' : 'bg-red-50'
  const numColor = isSkipped ? 'bg-gray-400' : isCorrect ? 'bg-emerald-500' : hasPartial ? 'bg-amber-500' : 'bg-red-500'
  const borderLeft = isSkipped ? '' : isCorrect ? 'border-l-4 border-emerald-400' : hasPartial ? 'border-l-4 border-amber-400' : 'border-l-4 border-red-400'

  return (
    <div className={`${borderLeft}`}>
      {/* Row header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${headerBg} border-b border-gray-100`}>
        <span className={`px-2 py-0.5 rounded-lg text-xs font-black text-white ${numColor}`}>
          Câu {question.number}
        </span>
        <span className="text-xs text-gray-500 font-medium">
          {isSkipped ? '— Bỏ trống' : isCorrect ? '✅ Đúng hoàn toàn' : hasPartial ? '⚡ Đúng một phần' : '❌ Sai'}
        </span>
        {!isSkipped && maxPts > 0 && (
          <span className={`ml-auto text-sm font-black ${isCorrect ? 'text-emerald-600' : hasPartial ? 'text-amber-600' : 'text-red-500'}`}>
            {formatTSAScore(earned)}/{formatTSAScore(maxPts)}đ
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        <MathText html={question.text} className="text-sm text-gray-800 leading-relaxed mb-3" block />

        {question.type === 'tsa_multiple_choice' && <DetailMC question={question} answer={studentAnswer} />}
        {question.type === 'tsa_true_false' && <DetailTF question={question} answer={studentAnswer} qScore={questionScore} />}
        {question.type === 'tsa_multiple_select' && <DetailMS question={question} answer={studentAnswer} />}
        {question.type === 'tsa_drag_drop' && <DetailDD question={question} answer={studentAnswer} qScore={questionScore} />}
        {question.type === 'tsa_fill_blank' && <DetailFB question={question} answer={studentAnswer} qScore={questionScore} />}
        {question.type === 'tsa_matching' && <DetailMatch question={question} answer={studentAnswer} qScore={questionScore} />}
      </div>
    </div>
  )
}

// ── Detail: MC ───────────────────────────────────────────────────────────────
function DetailMC({ question, answer }) {
  return (
    <div className="space-y-1.5">
      {(question.choiceOptions ?? []).map((opt, idx) => {
        const letter = String.fromCharCode(65 + idx)
        const isSelected = answer?.toUpperCase() === opt.letter.toUpperCase()
        const isCorrectOpt = opt.isCorrect
        return (
          <div key={opt.letter} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
            isSelected && isCorrectOpt ? 'border-emerald-300 bg-emerald-50' :
            isSelected && !isCorrectOpt ? 'border-red-300 bg-red-50' :
            isCorrectOpt ? 'border-emerald-200 bg-emerald-50/40' :
            'border-gray-100 bg-gray-50'
          }`}>
            <span className={`w-6 h-6 rounded-full text-xs font-black text-white flex items-center justify-center shrink-0 ${
              isSelected && isCorrectOpt ? 'bg-emerald-500' :
              isSelected ? 'bg-red-500' :
              isCorrectOpt ? 'bg-emerald-400' : 'bg-gray-300'
            }`}>{letter}</span>
            <MathText html={opt.text} className="flex-1 text-xs text-gray-700" />
            {isSelected && <span className="text-xs shrink-0">{isCorrectOpt ? '✅ HS chọn / Đáp án' : '❌ HS chọn'}</span>}
            {!isSelected && isCorrectOpt && <span className="text-xs text-emerald-600 shrink-0 font-bold">✓ Đáp án đúng</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Detail: TF ───────────────────────────────────────────────────────────────
function DetailTF({ question, answer, qScore }) {
  const detail = qScore?.detail ?? {}
  return (
    <div className="rounded-xl border-2 border-teal-200 overflow-hidden text-xs">
      <div className="grid grid-cols-[1fr_64px_64px_64px_56px] bg-teal-700 text-white font-black text-center border-b border-teal-600">
        <div className="px-3 py-2 text-left">Mệnh đề</div>
        <div className="py-2">HS chọn</div>
        <div className="py-2 bg-teal-800">Đáp án</div>
        <div className="py-2 bg-teal-900">Kết quả</div>
        <div className="py-2 bg-slate-800">Điểm</div>
      </div>
      {(question.tfStatements ?? []).map((stmt, idx) => {
        const d = detail[stmt.label] ?? {}
        const userVal = answer?.[stmt.label]
        return (
          <div key={stmt.label} className={`grid grid-cols-[1fr_64px_64px_64px_56px] border-t border-teal-100 ${d.isMatch === true ? 'bg-emerald-50/40' : d.isMatch === false ? 'bg-red-50/40' : 'bg-gray-50/30'}`}>
            <div className="px-3 py-2.5 flex gap-2 items-center">
              <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 text-[9px] font-black flex items-center justify-center shrink-0">{String.fromCharCode(97 + idx)}</span>
              <MathText html={stmt.text} className="text-[11px] text-gray-700" />
            </div>
            <div className="text-center py-2.5 border-l border-teal-100 font-bold">{userVal === 'T' ? <span className="text-blue-700">Đúng</span> : userVal === 'F' ? <span className="text-orange-700">Sai</span> : <span className="text-gray-300">—</span>}</div>
            <div className="text-center py-2.5 border-l border-teal-100 bg-teal-50/30 font-bold">{stmt.isTrue ? <span className="text-emerald-700">Đúng</span> : <span className="text-red-700">Sai</span>}</div>
            <div className="text-center py-2.5 border-l border-teal-100 font-bold text-base">{d.isMatch === undefined ? '—' : d.isMatch ? <span className="text-emerald-600">✔</span> : <span className="text-red-500">✖</span>}</div>
            <div className="text-center py-2.5 border-l border-slate-200 text-xs font-bold text-gray-500">{d.isMatch ? '✓' : '0'}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Detail: MS ───────────────────────────────────────────────────────────────
function DetailMS({ question, answer }) {
  const selected: string[] = Array.isArray(answer) ? answer.map(l => l.toUpperCase()) : []
  const correctSet = new Set((question.choiceOptions ?? []).filter(o => o.isCorrect).map(o => o.letter.toUpperCase()))
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-violet-600 font-bold mb-2">
        Đúng: {[...correctSet].join(', ')} | HS chọn: {selected.join(', ') || '—'}
      </div>
      {(question.choiceOptions ?? []).map((opt, idx) => {
        const letter = String.fromCharCode(65 + idx)
        const isSelected = selected.includes(opt.letter.toUpperCase())
        const isCorrectOpt = opt.isCorrect
        return (
          <div key={opt.letter} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
            isSelected && isCorrectOpt ? 'border-emerald-300 bg-emerald-50' :
            isSelected ? 'border-red-300 bg-red-50' :
            isCorrectOpt ? 'border-emerald-100 bg-emerald-50/30' :
            'border-gray-100 bg-gray-50'
          }`}>
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[9px] font-black ${isSelected ? 'bg-violet-500 border-violet-500 text-white' : 'border-gray-300'}`}>{isSelected && '✓'}</div>
            <span className={`w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center shrink-0 ${isSelected ? 'bg-violet-500' : 'bg-gray-300'}`}>{letter}</span>
            <MathText html={opt.text} className="flex-1 text-xs text-gray-700" />
            {isSelected && <span className="text-xs shrink-0">{isCorrectOpt ? '✅' : '❌'}</span>}
            {!isSelected && isCorrectOpt && <span className="text-xs text-emerald-600 shrink-0">✓ Cần chọn</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Detail: DD ───────────────────────────────────────────────────────────────
function DetailDD({ question, answer, qScore }) {
  const detail = qScore?.detail ?? {}
  const bank = question.dragBank ?? []
  const getItemText = (id?: string) => bank.find(b => b.id === id)?.text
  const dropCount = question.dropCount ?? 0

  return (
    <div className="space-y-2">
      {Array.from({ length: dropCount }, (_, i) => {
        const slot = `slot_${i + 1}`
        const d = detail[slot] ?? {}
        const studentId = answer?.[slot]
        const studentText = getItemText(studentId)
        const correctText = getItemText(d.correctItemId)
        return (
          <div key={slot} className={`flex items-center gap-3 p-2.5 rounded-xl border ${d.isMatch ? 'border-emerald-200 bg-emerald-50' : d.isMatch === false ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 font-black text-[10px] flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-gray-500 font-bold">HS điền: </span>
              {studentText ? <MathText html={studentText} className="text-xs font-bold text-gray-800 inline" /> : <span className="text-gray-400 italic text-xs">Bỏ trống</span>}
            </div>
            {!d.isMatch && correctText && (
              <div className="text-right">
                <span className="text-[10px] text-emerald-600 font-bold">Đáp án: </span>
                <MathText html={correctText} className="text-xs text-emerald-700 font-bold inline" />
              </div>
            )}
            <span className="shrink-0 text-sm">{!studentId ? '—' : d.isMatch ? '✅' : '❌'}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Detail: FB ───────────────────────────────────────────────────────────────
function DetailFB({ question, answer, qScore }) {
  const detail = qScore?.detail ?? {}
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {(question.blanks ?? []).map(blank => {
        const d = detail[blank.index] ?? {}
        const studentAns = answer?.[blank.index]
        return (
          <div key={blank.index} className={`p-3 rounded-xl border-2 ${d.isMatch ? 'border-emerald-300 bg-emerald-50' : studentAns ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-black text-[10px] flex items-center justify-center">{blank.index}</span>
              <span className="text-[10px] font-bold text-gray-500 uppercase">Ô trống {blank.index}</span>
              <span className="ml-auto text-sm">{!studentAns ? '—' : d.isMatch ? '✅' : '❌'}</span>
            </div>
            <div className="text-xs space-y-1">
              <div><span className="text-gray-500">HS trả lời: </span><strong className="text-gray-800">{studentAns || <em className="text-gray-400 font-normal">Bỏ trống</em>}</strong></div>
              {!d.isMatch && d.correctAnswer && <div><span className="text-emerald-600">Đáp án đúng: </span><strong className="text-emerald-800">{d.correctAnswer}</strong></div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Detail: Match ─────────────────────────────────────────────────────────────
function DetailMatch({ question, answer, qScore }) {
  const detail = qScore?.detail ?? {}
  const right = question.matchRight ?? []
  const getRightText = (letter?: string) => right.find(r => r.letter === letter?.toLowerCase())?.text

  return (
    <div className="rounded-xl border-2 border-cyan-200 overflow-hidden">
      <div className="grid grid-cols-[1fr_130px_130px_40px] bg-cyan-700 text-white text-[10px] font-black border-b border-cyan-600">
        <div className="px-3 py-2">Cột trái</div>
        <div className="py-2 text-center border-l border-cyan-600">HS ghép</div>
        <div className="py-2 text-center border-l border-cyan-600 bg-cyan-800">Đáp án đúng</div>
        <div className="py-2 text-center border-l border-cyan-600 bg-slate-800">KQ</div>
      </div>
      {(question.matchLeft ?? []).map((item, idx) => {
        const d = detail[item.num] ?? {}
        const studentLetter = answer?.[item.num]
        const studentText = getRightText(studentLetter)
        const correctText = getRightText(d.correctLetter)
        return (
          <div key={item.num} className={`grid grid-cols-[1fr_130px_130px_40px] border-t border-cyan-100 ${d.isMatch === true ? 'bg-emerald-50/40' : d.isMatch === false ? 'bg-red-50/40' : 'bg-gray-50/20'}`}>
            <div className="px-3 py-3 flex gap-1.5 items-start">
              <span className="w-4 h-4 rounded-full bg-cyan-600 text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{item.num}</span>
              <MathText html={item.text} className="text-[11px] text-gray-700" />
            </div>
            <div className="px-2 py-3 border-l border-cyan-100 text-[11px]">
              {studentLetter
                ? <span className={`font-bold ${d.isMatch ? 'text-emerald-700' : 'text-red-700'}`}>{studentLetter}. <MathText html={(studentText ?? '').substring(0, 35)} className="inline" /></span>
                : <span className="text-gray-300">—</span>}
            </div>
            <div className="px-2 py-3 border-l border-cyan-100 text-[11px] bg-cyan-50/30">
              {d.correctLetter && <span className="text-emerald-700 font-bold">{d.correctLetter}. <MathText html={(correctText ?? '').substring(0, 35)} className="inline" /></span>}
            </div>
            <div className="text-center py-3 border-l border-slate-200 text-base">
              {d.isMatch === undefined ? '—' : d.isMatch ? <span className="text-emerald-600">✔</span> : <span className="text-red-500">✖</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
