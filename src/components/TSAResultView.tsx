// @ts-nocheck
/**
 * TSAResultView.tsx
 * Màn hình kết quả sau khi học sinh nộp bài TSA.
 * Tương đương ResultView.tsx nhưng hỗ trợ đầy đủ 6 dạng câu hỏi TSA.
 */

import React, { useMemo } from 'react'
import MathText from './MathText'
import { formatTSAScore, getTSAGrade, TSA_SECTION_COLORS } from '../services/tsaScoringService'
import type { TSAExamData, TSAQuestion, TSASectionId } from '../services/tsaParserService'
import type { TSAScoreBreakdown, TSAQuestionScore } from '../services/tsaScoringService'
import { Clock, AlertTriangle, CheckCircle2, XCircle, Minus, BookOpen } from 'lucide-react'

interface TSAResultViewProps {
  submission: any
  room: any
  exam: TSAExamData & { title: string }
  onExit: () => void
}

export default function TSAResultView({ submission, room, exam, onExit }: TSAResultViewProps) {
  const sb: TSAScoreBreakdown = submission.scoreBreakdown || submission.score_breakdown || {}
  const isPending = sb.pending_score || !sb.sections
  const canShowAnswers = room.settings?.showCorrectAnswers !== false
  const canShowExplanations = room.settings?.showExplanations !== false

  const percentage = sb.percentage ?? 0
  const totalScore = sb.totalScore ?? submission.totalScore ?? 0
  const maxScore = sb.maxScore ?? sb.pointsConfig?.maxScore ?? 10
  const gradeInfo = getTSAGrade(percentage)

  const formatDuration = (s: number) => `${Math.floor(s / 60)} phút ${s % 60} giây`

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)' }}>
      {percentage >= 80 && (
        <>
          <style>{`
            @keyframes confetti { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
            .tsa-confetti { position:fixed; top:-10px; animation:confetti 3s ease-in-out forwards; pointer-events:none; z-index:9999; }
          `}</style>
          {[...Array(18)].map((_, i) => (
            <div key={i} className="tsa-confetti text-2xl" style={{ left:`${Math.random()*100}%`, animationDelay:`${Math.random()*2}s` }}>
              {['🎉','⭐','🌟','✨','🎊'][i % 5]}
            </div>
          ))}
        </>
      )}

      {/* ── Header ── */}
      <div className="text-white p-6" style={{ background: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-2">🎉 Đã nộp bài thành công!</h1>
          <p className="text-teal-100 text-sm">{room.examTitle || exam.title}</p>
          <div className="inline-flex items-center gap-2 mt-2 bg-white/10 px-3 py-1.5 rounded-full text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            ĐỀ THI TSA
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">

        {/* ── Điểm tổng ── */}
        <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8">
          {isPending ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4 animate-bounce">⏳</div>
              <h2 className="text-xl font-black text-gray-700 mb-2">Đang chấm điểm...</h2>
              <p className="text-gray-400 text-sm">Điểm sẽ được cập nhật sớm</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className={`w-28 h-28 ${gradeInfo.bg} border-4 ${gradeInfo.border} rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                  <div>
                    <div className="text-3xl mb-0.5">{gradeInfo.emoji}</div>
                    <div className={`text-2xl font-black ${gradeInfo.color}`}>{gradeInfo.grade}</div>
                  </div>
                </div>
                <div className={`inline-block px-4 py-1.5 rounded-full ${gradeInfo.bg} border ${gradeInfo.border} ${gradeInfo.color} font-bold text-sm`}>
                  {gradeInfo.label}
                </div>
              </div>

              <div className="text-center mb-6">
                <div className="text-5xl font-black mb-1">
                  <span className="text-teal-600">{formatTSAScore(totalScore)}</span>
                  <span className="text-gray-300 text-3xl">/{maxScore}</span>
                </div>
                <div className="text-xl font-bold text-gray-400">{percentage}%</div>
              </div>

              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="text-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-2xl font-black text-slate-700">{submission.totalQuestions ?? exam.totalQuestions}</div>
                  <div className="text-xs text-slate-500 font-bold">Tổng câu</div>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="text-2xl font-black text-emerald-700">
                    {sb.sections?.reduce((n, s) => n + s.fullyCorrect, 0) ?? 0}
                  </div>
                  <div className="text-xs text-emerald-600 font-bold">Câu đúng hoàn toàn</div>
                </div>
                {submission.duration > 0 && (
                  <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="text-lg font-black text-blue-700">{formatDuration(submission.duration)}</div>
                    <div className="text-xs text-blue-600 font-bold">Thời gian làm</div>
                  </div>
                )}
              </div>

              {/* Section breakdown */}
              {sb.sections && sb.sections.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-3">📊 Điểm theo phần</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {sb.sections.map(section => {
                      const colors = TSA_SECTION_COLORS[section.sectionId as TSASectionId]
                      return (
                        <div key={section.sectionId} className={`rounded-2xl p-4 border-2 ${colors.light} ${colors.border}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`w-6 h-6 rounded-full ${colors.dot} text-white flex items-center justify-center font-black text-xs`}>
                              {section.sectionId}
                            </span>
                            <span className="text-xs font-bold text-gray-700 truncate">{section.sectionName}</span>
                          </div>
                          <div className="text-2xl font-black text-gray-800">
                            {formatTSAScore(section.earnedPoints)}
                            <span className="text-sm font-normal text-gray-400">/{formatTSAScore(section.maxPoints)}đ</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {section.fullyCorrect}/{section.total} câu đúng
                            {section.partial > 0 && <span className="text-amber-600"> · {section.partial} phần</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tab switch warning */}
              {(submission.tabSwitchCount > 0 || (submission as any).tab_switches > 0) && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Đã chuyển tab <strong>{submission.tabSwitchCount || (submission as any).tab_switches}</strong> lần trong khi thi</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Chi tiết từng câu ── */}
        {canShowAnswers && sb.sections && exam.sections && (
          <div className="space-y-6">
            {exam.sections.map(section => {
              const sectionScore = sb.sections?.find(s => s.sectionId === section.id)
              const colors = TSA_SECTION_COLORS[section.id]
              return (
                <div key={section.id} className="rounded-2xl overflow-hidden shadow-lg border border-gray-100">
                  <div className={`bg-gradient-to-r ${colors.gradient} p-4 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-white/20 text-white font-black flex items-center justify-center">{section.id}</span>
                      <div>
                        <div className="text-white font-black text-sm">{section.name}</div>
                        <div className="text-white/70 text-xs">{section.questions.length} câu</div>
                      </div>
                    </div>
                    {sectionScore && (
                      <div className="text-white text-right">
                        <div className="font-black text-xl">{formatTSAScore(sectionScore.earnedPoints)}<span className="text-white/60 text-sm">/{formatTSAScore(sectionScore.maxPoints)}đ</span></div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white divide-y divide-gray-100">
                    {section.questions.map(q => {
                      const qScore = sb.questionScores?.[q.id]
                      const studentAns = submission.answers?.[q.id]
                      return (
                        <TSAQuestionReview
                          key={q.id}
                          question={q}
                          studentAnswer={studentAns}
                          questionScore={qScore}
                          canShowAnswers={canShowAnswers}
                          canShowExplanations={canShowExplanations}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Exit button */}
        <div className="pb-8 text-center">
          <button
            onClick={onExit}
            className="px-10 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-2xl shadow-lg transition-all hover:scale-105"
          >
            ← Thoát
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION REVIEW DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

function TSAQuestionReview({ question, studentAnswer, questionScore, canShowAnswers, canShowExplanations }: {
  question: TSAQuestion
  studentAnswer: any
  questionScore?: TSAQuestionScore
  canShowAnswers: boolean
  canShowExplanations: boolean
}) {
  const isSkipped = questionScore?.isSkipped ?? !studentAnswer
  const isCorrect = questionScore?.isFullyCorrect ?? false
  const hasPartial = !isSkipped && !isCorrect && (questionScore?.earnedPoints ?? 0) > 0

  const statusBg = isSkipped ? 'bg-gray-50' : isCorrect ? 'bg-emerald-50/60' : hasPartial ? 'bg-amber-50/60' : 'bg-red-50/40'
  const statusBorder = isSkipped ? '' : isCorrect ? 'border-l-4 border-emerald-400' : hasPartial ? 'border-l-4 border-amber-400' : 'border-l-4 border-red-400'

  return (
    <div className={`${statusBg} ${statusBorder}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <span className={`px-2.5 py-1 rounded-lg text-xs font-black text-white ${
          isSkipped ? 'bg-gray-400' : isCorrect ? 'bg-emerald-500' : hasPartial ? 'bg-amber-500' : 'bg-red-500'
        }`}>
          Câu {question.number}
        </span>
        {questionScore && (
          <span className={`ml-auto text-sm font-black ${
            isCorrect ? 'text-emerald-600' : hasPartial ? 'text-amber-600' : 'text-gray-400'
          }`}>
            {formatTSAScore(questionScore.earnedPoints)}/{formatTSAScore(questionScore.maxPoints)}đ
          </span>
        )}
        {isSkipped && <span className="ml-auto text-xs text-gray-400 font-bold">Bỏ trống</span>}
        {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
        {!isSkipped && !isCorrect && !hasPartial && <XCircle className="w-4 h-4 text-red-500 ml-auto" />}
        {hasPartial && <span className="ml-auto text-xs text-amber-600 font-bold">⚡ Phần</span>}
      </div>

      <div className="px-4 py-4">
        <MathText html={question.text} className="text-gray-800 text-sm leading-relaxed mb-4" block />

        {/* Answer review by type */}
        {question.type === 'tsa_multiple_choice' && (
          <MCReview question={question} studentAnswer={studentAnswer} canShowAnswers={canShowAnswers} />
        )}
        {question.type === 'tsa_true_false' && (
          <TFReview question={question} studentAnswer={studentAnswer} questionScore={questionScore} canShowAnswers={canShowAnswers} />
        )}
        {question.type === 'tsa_multiple_select' && (
          <MSReview question={question} studentAnswer={studentAnswer} canShowAnswers={canShowAnswers} />
        )}
        {question.type === 'tsa_drag_drop' && (
          <DDReview question={question} studentAnswer={studentAnswer} questionScore={questionScore} canShowAnswers={canShowAnswers} />
        )}
        {question.type === 'tsa_fill_blank' && (
          <FBReview question={question} studentAnswer={studentAnswer} questionScore={questionScore} canShowAnswers={canShowAnswers} />
        )}
        {question.type === 'tsa_matching' && (
          <MatchReview question={question} studentAnswer={studentAnswer} questionScore={questionScore} canShowAnswers={canShowAnswers} />
        )}

        {/* Solution */}
        {canShowExplanations && (question.solution || question.solutionImages?.length > 0) && (
          <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-xl">
            <span className="text-blue-700 font-bold text-sm">💡 Lời giải: </span>
            {question.solution && <div className="text-sm text-gray-700 mt-1"><MathText html={question.solution} block /></div>}
            {question.solutionImages?.length > 0 && (
              <div className="my-2 flex flex-wrap gap-2">
                {question.solutionImages.map((img: any, idx: number) => (
                  <img key={idx} src={img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : ''} alt={`Hình lời giải ${idx + 1}`} className="max-h-40 rounded border block" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── I. Trắc nghiệm ──────────────────────────────────────────────────────────
function MCReview({ question, studentAnswer, canShowAnswers }) {
  return (
    <div className="space-y-2">
      {(question.choiceOptions ?? []).map((opt, idx) => {
        const letter = String.fromCharCode(65 + idx)
        const isSelected = studentAnswer?.toUpperCase() === opt.letter.toUpperCase()
        const isCorrectOpt = opt.isCorrect
        const highlight = isSelected && canShowAnswers
          ? isCorrectOpt ? 'border-emerald-400 bg-emerald-50' : 'border-red-400 bg-red-50'
          : isSelected ? 'border-amber-400 bg-amber-50'
          : canShowAnswers && isCorrectOpt ? 'border-emerald-300 bg-emerald-50/50'
          : 'border-gray-200 bg-gray-50'
        return (
          <div key={opt.letter} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 ${highlight}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${
              isSelected ? (canShowAnswers && isCorrectOpt ? 'bg-emerald-500' : canShowAnswers ? 'bg-red-500' : 'bg-amber-500')
              : canShowAnswers && isCorrectOpt ? 'bg-emerald-400'
              : 'bg-gray-300'
            }`}>{letter}</span>
            <MathText html={opt.text} className="flex-1 text-sm text-gray-700" />
            {isSelected && <span className="text-xs font-bold shrink-0">{canShowAnswers ? (isCorrectOpt ? '✅' : '❌') : '▶ Bạn chọn'}</span>}
            {!isSelected && canShowAnswers && isCorrectOpt && <span className="text-xs text-emerald-600 font-bold shrink-0">✓ Đáp án</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── II. Đúng/Sai ────────────────────────────────────────────────────────────
function TFReview({ question, studentAnswer, questionScore, canShowAnswers }) {
  const detail = questionScore?.detail ?? {}
  return (
    <div className="rounded-xl border-2 border-teal-200 overflow-hidden text-sm">
      <div className={`grid ${canShowAnswers ? 'grid-cols-[1fr_72px_72px_56px]' : 'grid-cols-[1fr_80px]'} bg-teal-600 text-white text-xs font-black`}>
        <div className="px-3 py-2.5">Mệnh đề</div>
        <div className="py-2.5 text-center">Bạn chọn</div>
        {canShowAnswers && <div className="py-2.5 text-center bg-teal-700">Đáp án</div>}
        {canShowAnswers && <div className="py-2.5 text-center bg-teal-800">Kết quả</div>}
      </div>
      {(question.tfStatements ?? []).map((stmt, idx) => {
        const d = detail[stmt.label] ?? {}
        const userVal = studentAnswer?.[stmt.label]
        const isMatch = d.isMatch
        return (
          <div key={stmt.label} className={`grid ${canShowAnswers ? 'grid-cols-[1fr_72px_72px_56px]' : 'grid-cols-[1fr_80px]'} border-t border-teal-100 ${
            userVal ? (isMatch === true ? 'bg-emerald-50/50' : isMatch === false ? 'bg-red-50/50' : '') : 'bg-gray-50/30'
          }`}>
            <div className="px-3 py-3 flex gap-2 items-start">
              <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[11px] font-black flex items-center justify-center shrink-0">{String.fromCharCode(97 + idx)}</span>
              <MathText html={stmt.text} className="flex-1 text-xs text-gray-800" />
            </div>
            <div className="text-center py-3 border-l border-teal-100">
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${userVal === 'T' ? 'bg-blue-100 text-blue-700' : userVal === 'F' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                {userVal === 'T' ? 'Đúng' : userVal === 'F' ? 'Sai' : '—'}
              </span>
            </div>
            {canShowAnswers && <>
              <div className="text-center py-3 border-l border-teal-100 bg-teal-50/30">
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${stmt.isTrue ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {stmt.isTrue ? 'Đúng' : 'Sai'}
                </span>
              </div>
              <div className="text-center py-3 border-l border-teal-100">
                {isMatch === null || isMatch === undefined ? <span className="text-gray-300">—</span> : isMatch ? <span className="text-emerald-600 font-bold">✔</span> : <span className="text-red-500 font-bold">✖</span>}
              </div>
            </>}
          </div>
        )
      })}
    </div>
  )
}

// ── III. Chọn nhiều ─────────────────────────────────────────────────────────
function MSReview({ question, studentAnswer, canShowAnswers }) {
  const selected: string[] = Array.isArray(studentAnswer) ? studentAnswer.map(l => l.toUpperCase()) : []
  return (
    <div className="space-y-2">
      {canShowAnswers && (
        <p className="text-xs text-violet-600 font-bold mb-2">
          Đáp án đúng: {(question.choiceOptions ?? []).filter(o => o.isCorrect).map((o, i) => String.fromCharCode(65 + (question.choiceOptions ?? []).indexOf(o))).join(', ')}
        </p>
      )}
      {(question.choiceOptions ?? []).map((opt, idx) => {
        const letter = String.fromCharCode(65 + idx)
        const isSelected = selected.includes(opt.letter.toUpperCase())
        const isCorrectOpt = opt.isCorrect
        const color = isSelected && canShowAnswers
          ? isCorrectOpt ? 'border-emerald-400 bg-emerald-50' : 'border-red-400 bg-red-50'
          : isSelected ? 'border-violet-400 bg-violet-50'
          : canShowAnswers && isCorrectOpt ? 'border-emerald-200 bg-emerald-50/30'
          : 'border-gray-200 bg-gray-50'
        return (
          <div key={opt.letter} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 ${color}`}>
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-violet-500 border-violet-500' : 'border-gray-300'}`}>
              {isSelected && <span className="text-white text-[10px] font-black">✓</span>}
            </div>
            <span className={`w-6 h-6 rounded-full text-xs font-black text-white flex items-center justify-center shrink-0 ${isSelected ? 'bg-violet-500' : 'bg-gray-300'}`}>{letter}</span>
            <MathText html={opt.text} className="flex-1 text-sm text-gray-700" />
            {isSelected && canShowAnswers && (isCorrectOpt ? <span className="text-emerald-600 text-xs font-bold">✅</span> : <span className="text-red-500 text-xs font-bold">❌</span>)}
            {!isSelected && canShowAnswers && isCorrectOpt && <span className="text-emerald-500 text-xs font-bold">✓ Cần chọn</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── IV. Kéo thả ─────────────────────────────────────────────────────────────
function DDReview({ question, studentAnswer, questionScore, canShowAnswers }) {
  const detail = questionScore?.detail ?? {}
  const bank = question.dragBank ?? []
  const dropCount = question.dropCount ?? 0
  const getItemText = (id?: string) => bank.find(b => b.id === id)?.text

  return (
    <div className="space-y-2">
      {Array.from({ length: dropCount }, (_, i) => {
        const slotKey = `slot_${i + 1}`
        const d = detail[slotKey] ?? {}
        const studentItemId = studentAnswer?.[slotKey]
        const studentText = getItemText(studentItemId)
        const correctText = getItemText(d.correctItemId)
        const isMatch = d.isMatch

        return (
          <div key={slotKey} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
            !studentItemId ? 'border-gray-200 bg-gray-50'
            : canShowAnswers ? (isMatch ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50')
            : 'border-teal-300 bg-teal-50'
          }`}>
            <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 font-black text-xs flex items-center justify-center shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 font-bold mb-1">Bạn điền:</div>
              {studentText
                ? <MathText html={studentText} className="text-sm font-bold text-gray-800" />
                : <span className="text-gray-400 italic text-sm">Bỏ trống</span>}
            </div>
            {canShowAnswers && !isMatch && correctText && (
              <div className="text-right">
                <div className="text-xs text-emerald-600 font-bold mb-1">Đáp án:</div>
                <MathText html={correctText} className="text-sm text-emerald-700 font-bold" />
              </div>
            )}
            {canShowAnswers && <span className="shrink-0">{!studentItemId ? '—' : isMatch ? '✅' : '❌'}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── V. Điền khuyết ──────────────────────────────────────────────────────────
function FBReview({ question, studentAnswer, questionScore, canShowAnswers }) {
  const detail = questionScore?.detail ?? {}
  const blanks = question.blanks ?? []

  return (
    <div className="space-y-2">
      {blanks.map(blank => {
        const d = detail[blank.index] ?? {}
        const studentAns = studentAnswer?.[blank.index]
        const isMatch = d.isMatch

        return (
          <div key={blank.index} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
            !studentAns ? 'border-gray-200 bg-gray-50'
            : canShowAnswers ? (isMatch ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50')
            : 'border-rose-200 bg-rose-50'
          }`}>
            <span className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-black text-xs flex items-center justify-center shrink-0">{blank.index}</span>
            <div className="flex-1">
              <span className="text-xs text-gray-500 font-bold">Bạn trả lời: </span>
              <span className="font-bold text-gray-800 text-sm">{studentAns || <em className="text-gray-400 font-normal">Bỏ trống</em>}</span>
            </div>
            {canShowAnswers && !isMatch && d.correctAnswer && (
              <div className="text-right text-sm">
                <span className="text-emerald-600 font-bold">{d.correctAnswer}</span>
              </div>
            )}
            {canShowAnswers && <span className="shrink-0">{!studentAns ? '—' : isMatch ? '✅' : '❌'}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── VI. Ghép đôi ─────────────────────────────────────────────────────────────
function MatchReview({ question, studentAnswer, questionScore, canShowAnswers }) {
  const detail = questionScore?.detail ?? {}
  const left = question.matchLeft ?? []
  const right = question.matchRight ?? []
  const getRightText = (letter?: string) => right.find(r => r.letter === letter?.toLowerCase())?.text

  return (
    <div className="rounded-xl border-2 border-cyan-200 overflow-hidden">
      {left.map((item, idx) => {
        const d = detail[item.num] ?? {}
        const studentLetter = studentAnswer?.[item.num]
        const correctLetter = d.correctLetter
        const isMatch = d.isMatch
        const studentText = getRightText(studentLetter)
        const correctText = getRightText(correctLetter)

        return (
          <div key={item.num} className={`flex gap-3 p-3 ${idx > 0 ? 'border-t border-cyan-100' : ''} ${
            !studentLetter ? 'bg-gray-50'
            : canShowAnswers ? (isMatch ? 'bg-emerald-50/50' : 'bg-red-50/40')
            : 'bg-white'
          }`}>
            <span className="w-7 h-7 rounded-full bg-cyan-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">{item.num}</span>
            <div className="flex-1 min-w-0">
              <MathText html={item.text} className="text-xs text-gray-700 mb-2" />
              <div className="flex items-center gap-2 flex-wrap">
                <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                  !studentLetter ? 'border-gray-200 text-gray-400 bg-gray-50'
                  : canShowAnswers ? (isMatch ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800')
                  : 'border-cyan-300 bg-cyan-50 text-cyan-800'
                }`}>
                  {studentLetter ? `${studentLetter}. ` : '— Bỏ trống'}
                  {studentText && <MathText html={studentText.substring(0, 40)} className="inline" />}
                </div>
                {canShowAnswers && !isMatch && correctLetter && (
                  <div className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold">
                    ✓ {correctLetter}. <MathText html={(correctText ?? '').substring(0, 40)} className="inline" />
                  </div>
                )}
                {canShowAnswers && studentLetter && <span>{isMatch ? '✅' : '❌'}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
