// @ts-nocheck
/**
 * TSAExamRoom.tsx
 * Giao diện phòng thi TSA – hỗ trợ 6 dạng câu hỏi:
 *  I.   Trắc nghiệm nhiều lựa chọn  (4-6 đáp án)
 *  II.  Đúng / Sai                  (2-6 mệnh đề)
 *  III. Chọn nhiều đáp án đúng      (nhiều lựa chọn)
 *  IV.  Kéo thả                     (bank + slot tương tác trong đề bài)
 *  V.   Điền khuyết                 (1+ ô trống)
 *  VI.  Ghép đôi                    (matching pairs)
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import MathText from './MathText'
import { useExamSession, generateSessionId } from '../services/sessionService'
import { getTabDetectionService } from '../services/tabDetectionService'
import { ensureSignedIn, isValidUUID } from '../services/submissionService'
import type { TSAExamData, TSAQuestion, TSAQuestionType, TSASectionId } from '../services/tsaParserService'
import {
  Check, X, ChevronDown, ChevronUp, GripHorizontal,
  List, ToggleLeft, CheckSquare, MoveHorizontal, Type, Link2,
  Clock, Send, AlertTriangle, BookOpen
} from 'lucide-react'

type TSAAnswers = Record<string, any>

interface TSAExamRoomProps {
  room: any
  exam: TSAExamData & { id: string; title: string }
  student: { id: string; name: string; student_code?: string; className?: string; isGuest?: boolean }
  existingSubmissionId?: string
  initialAnswers?: TSAAnswers
  onSubmitted: (result: any) => void
  onExit: () => void
}

function isAnswered(q: TSAQuestion, ans: any): boolean {
  if (ans === undefined || ans === null) return false
  switch (q.type) {
    case 'tsa_multiple_choice':
      return typeof ans === 'string' && ans.length > 0
    case 'tsa_true_false':
      if (typeof ans !== 'object') return false
      return (q.tfStatements ?? []).every(s => ans[s.label] !== undefined)
    case 'tsa_multiple_select':
      return Array.isArray(ans) && ans.length > 0
    case 'tsa_drag_drop': {
      if (typeof ans !== 'object') return false
      const count = q.dropCount ?? 0
      return count > 0 && Object.keys(ans).length >= count
    }
    case 'tsa_fill_blank': {
      if (typeof ans !== 'object') return false
      const blanks = q.blanks ?? []
      return blanks.length > 0 && blanks.every(b => ans[b.index]?.trim?.())
    }
    case 'tsa_matching': {
      if (typeof ans !== 'object') return false
      const left = q.matchLeft ?? []
      return left.length > 0 && left.every(l => ans[l.num])
    }
    default: return false
  }
}

function countAnswered(questions: TSAQuestion[], answers: TSAAnswers): number {
  return questions.filter(q => isAnswered(q, answers[q.id])).length
}

const SECTION_STYLE: Record<TSASectionId, { gradient: string; border: string; icon: React.ReactNode; badge: string }> = {
  I:   { gradient: 'from-blue-600 to-indigo-700',    border: 'border-blue-400',   icon: <List className="w-4 h-4" />,         badge: 'bg-blue-100 text-blue-700 border-blue-300' },
  II:  { gradient: 'from-teal-600 to-emerald-700',   border: 'border-teal-400',   icon: <ToggleLeft className="w-4 h-4" />,    badge: 'bg-teal-100 text-teal-700 border-teal-300' },
  III: { gradient: 'from-violet-600 to-purple-700',  border: 'border-violet-400', icon: <CheckSquare className="w-4 h-4" />,  badge: 'bg-violet-100 text-violet-700 border-violet-300' },
  IV:  { gradient: 'from-orange-500 to-amber-600',   border: 'border-orange-400', icon: <MoveHorizontal className="w-4 h-4" />, badge: 'bg-orange-100 text-orange-700 border-orange-300' },
  V:   { gradient: 'from-rose-500 to-pink-600',      border: 'border-rose-400',   icon: <Type className="w-4 h-4" />,         badge: 'bg-rose-100 text-rose-700 border-rose-300' },
  VI:  { gradient: 'from-cyan-600 to-sky-700',       border: 'border-cyan-400',   icon: <Link2 className="w-4 h-4" />,        badge: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
}

const TSAExamRoom: React.FC<TSAExamRoomProps> = ({
  room, exam, student: studentRaw, existingSubmissionId, initialAnswers = {}, onSubmitted, onExit
}) => {
  const student = {
    ...studentRaw,
    name: studentRaw.name || (studentRaw as any).full_name || 'Học sinh',
    student_code: studentRaw.student_code || (studentRaw as any).student_code || '',
  }
  const [submissionId, setSubmissionId] = useState<string | null>(existingSubmissionId ?? null)
  const [answers, setAnswers] = useState<TSAAnswers>(initialAnswers)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isKicked, setIsKicked] = useState(false)
  const [kickedBy, setKickedBy] = useState('')
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [tabCount, setTabCount] = useState(0)
  const [activeSection, setActiveSection] = useState<TSASectionId | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<TSASectionId>>(new Set())

  const isSubmittingRef = useRef(false)
  const [mySessionId] = useState(() => generateSessionId())
  const handleSubmitRef = useRef<(force?: boolean, auto?: boolean) => void>(() => {})

  const limit = room.timeLimit || room.time_limit || 90
  const closesAtMs = room.closes_at ? new Date(room.closes_at).getTime() : null
  const [timeLeft, setTimeLeft] = useState(() =>
    closesAtMs ? Math.max(0, Math.floor((closesAtMs - Date.now()) / 1000)) : limit * 60
  )

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnswers = useRef<TSAAnswers>(initialAnswers)

  const handleAnswerChange = useCallback((qId: string, value: any) => {
    setAnswers(prev => {
      const next = { ...prev, [qId]: value }
      pendingAnswers.current = next
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => autoSave(pendingAnswers.current), 2000)
      return next
    })
  }, [])

  const autoSave = useCallback(async (currentAnswers: TSAAnswers) => {
    if (!submissionId) return
    try {
      await supabase.from('exam_submissions').update({ answers: currentAnswers }).eq('id', submissionId)
    } catch (e) { console.warn('Auto-save failed:', e) }
  }, [submissionId])

  const { reportTabSwitch, reportViolation, updateProgress, submitSession } = useExamSession({
    roomId: room.id,
    studentId: student.id,
    studentName: student.name,
    sessionId: mySessionId,
    className: student.className ?? '',
    totalQuestions: exam.totalQuestions,
    onKicked: (device) => { setKickedBy(device); setIsKicked(true) },
  })

  useEffect(() => {
    if (existingSubmissionId) {
      setSubmissionId(existingSubmissionId)
    }
  }, [existingSubmissionId])

  useEffect(() => {
    if (existingSubmissionId) return
    const init = async () => {
      try {
        if (!student.isGuest) await ensureSignedIn()

        if (student.isGuest) {
          await supabase.from('students').upsert({
            id: student.id,
            student_code: student.student_code || `GUEST_${Date.now()}`,
            full_name: student.name || student.full_name || 'Khách',
            status: 'active',
          }, { onConflict: 'id', ignoreDuplicates: true })
        }

        const { data: existing } = await supabase
          .from('exam_submissions')
          .select('id')
          .eq('room_id', room.id)
          .eq('student_id', student.id)
          .maybeSingle()

        if (existing?.id) {
          setSubmissionId(existing.id)
          return
        }

        const { data: newSub } = await supabase
          .from('exam_submissions')
          .insert([{
            room_id: room.id,
            student_id: student.id,
            student_name: student.name || student.full_name || 'Học sinh',
            status: 'in_progress',
            answers: {},
            score_breakdown: { exam_type: 'tsa', exam_id: exam.id },
          }])
          .select('id')
          .maybeSingle()

        if (newSub?.id) {
          setSubmissionId(newSub.id)
        } else {
          const { data: retry } = await supabase.from('exam_submissions')
            .select('id').eq('room_id', room.id).eq('student_id', student.id).maybeSingle()
          if (retry?.id) setSubmissionId(retry.id)
        }
      } catch (e) {
        console.error('Init submission error:', e)
      }
    }
    init()
  }, [existingSubmissionId, room.id, student, exam.id])

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { handleSubmitRef.current(true, true); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, []) // eslint-disable-line

  useEffect(() => {
    const svc = getTabDetectionService()
    svc.start({
      onTabSwitch: (count) => {
        setTabCount(count); setShowTabWarning(true)
        setTimeout(() => setShowTabWarning(false), 5000)
        if (!student.isGuest) reportTabSwitch()
      },
      onAutoSubmit: () => {
        if (!student.isGuest) {
          reportViolation({ type: 'auto_submit', timestamp: new Date().toISOString(), detail: 'Chuyển tab quá nhiều lần' })
          submitSession()
        }
        handleSubmit(true, true)
      }
    })
    return () => svc.stop()
  }, []) // eslint-disable-line

  const answeredTotal = useMemo(() =>
    (exam?.questions || []).reduce((n: number, q: any) => n + (isAnswered(q, answers[q.id]) ? 1 : 0), 0),
  [exam?.questions, answers])

  useEffect(() => { if (!student.isGuest) updateProgress(answeredTotal, timeLeft) }, [answeredTotal, timeLeft])

  const handleSubmit = useCallback(async (force = false, auto = false) => {
    if (!force && !showConfirm) { setShowConfirm(true); return }
    if (isSubmittingRef.current) return

    let currentSubId = submissionId || existingSubmissionId

    isSubmittingRef.current = true
    setIsSubmitting(true)
    setShowConfirm(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)

    const payload = {
      answers: pendingAnswers.current,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      duration: limit * 60 - timeLeft,
      tab_switches: tabCount,
      score: null,
      correct_count: 0,
      score_breakdown: {
        exam_type: 'tsa', exam_id: exam.id, autoSubmitted: auto, pending_score: true,
      }
    }

    try {
      let savedData: any = null

      if (currentSubId && isValidUUID(currentSubId)) {
        const { data, error } = await supabase.from('exam_submissions').update(payload)
          .eq('id', currentSubId)
          .select('id, answers, status, submitted_at, duration, tab_switches, score_breakdown')
          .maybeSingle()

        if (!error && data) savedData = data
      }

      if (!savedData) {
        const rawStudentId = student?.id
        const validStudentId = isValidUUID(rawStudentId) ? rawStudentId : null
        const studentName = student?.name || student?.full_name || 'Học sinh'

        const { data: inserted, error: insErr } = await supabase.from('exam_submissions')
          .insert([{
            room_id: room.id,
            student_id: validStudentId,
            student_name: studentName,
            ...payload
          }])
          .select('id, answers, status, submitted_at, duration, tab_switches, score_breakdown')
          .maybeSingle()

        if (!insErr && inserted) {
          savedData = inserted
        } else if (validStudentId) {
          // Retry without FK
          const { data: retryIns } = await supabase.from('exam_submissions')
            .insert([{
              room_id: room.id,
              student_id: null,
              student_name: studentName,
              ...payload
            }])
            .select('id, answers, status, submitted_at, duration, tab_switches, score_breakdown')
            .maybeSingle()

          if (retryIns) savedData = retryIns
        }
      }

      onSubmitted({
        id: savedData?.id || currentSubId || crypto.randomUUID(),
        ...(savedData ?? {}),
        student,
        totalScore: 0,
        percentage: 0,
        correctCount: 0,
        totalQuestions: exam.totalQuestions || exam.questions?.length || 0,
        scoreBreakdown: savedData?.score_breakdown ?? payload.score_breakdown,
        answers: savedData?.answers ?? pendingAnswers.current,
        pending_score: true,
      })
    } catch (err: any) {
      console.error('TSA Submit error:', err)
      onSubmitted({
        id: currentSubId || crypto.randomUUID(),
        student,
        totalScore: 0,
        percentage: 0,
        correctCount: 0,
        totalQuestions: exam.totalQuestions || exam.questions?.length || 0,
        scoreBreakdown: payload.score_breakdown,
        answers: pendingAnswers.current,
        pending_score: true,
      })
    } finally {
      isSubmittingRef.current = false
      setIsSubmitting(false)
    }
  }, [submissionId, existingSubmissionId, timeLeft, tabCount, showConfirm, exam, student, limit, room.id, onSubmitted])

  useEffect(() => { handleSubmitRef.current = handleSubmit }, [handleSubmit])

  const toggleSection = (id: TSASectionId) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60); const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  const progress = exam.totalQuestions > 0 ? (answeredTotal / exam.totalQuestions) * 100 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900">
      {/* Watermark */}
      <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden opacity-[0.04] select-none text-white font-black text-3xl whitespace-nowrap">
        <div style={{ transform: 'rotate(-30deg) translate(-20%, 60%)' }}>{student.name} — TSA — {room.code}</div>
        <div style={{ transform: 'rotate(-30deg) translate(20%, -40%)' }}>{student.name} — TSA — {room.code}</div>
      </div>

      {isKicked && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="text-5xl mb-4">📱</div>
            <h2 className="text-2xl font-bold text-red-700 mb-3">Phiên thi bị ngắt!</h2>
            <p className="text-gray-600 mb-4">Đăng nhập trên thiết bị khác: <strong>{kickedBy}</strong></p>
            <button onClick={onExit} className="w-full py-3 rounded-xl font-bold text-white bg-red-600">Thoát</button>
          </div>
        </div>
      )}

      {showTabWarning && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-bounce bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl font-bold text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />⚠️ Cảnh báo: Phát hiện chuyển tab! ({tabCount}/2)
        </div>
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-50 shadow-xl bg-gradient-to-r from-slate-800 to-slate-900 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-white text-sm">
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white text-sm leading-tight">{student.name}</p>
                <p className="text-xs text-white/60 font-mono">TSA · {room.code}</p>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-xl text-center min-w-[90px] flex items-center gap-2 ${timeLeft < 120 ? 'bg-red-500/90 animate-pulse' : 'bg-white/10'}`}>
              <Clock className="w-4 h-4 text-white/80" />
              <div className="text-xl font-mono font-black text-white">{formatTime(timeLeft)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>✍️ {answeredTotal}/{exam.totalQuestions} câu</span>
                <span className="font-bold text-white">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button
              onClick={() => { if (!isSubmitting) setShowConfirm(true) }}
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm transition-all shadow-lg ${
                isSubmitting ? 'bg-gray-500 cursor-not-allowed text-white'
                  : !submissionId ? 'bg-orange-400 text-white hover:scale-105 animate-pulse'
                  : 'bg-gradient-to-r from-amber-400 to-orange-500 text-white hover:scale-105'
              }`}
            >
              {isSubmitting
                ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang nộp...</>
                : !submissionId
                ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang khởi tạo...</>
                : <><Send className="w-3.5 h-3.5" /> Nộp bài</>}
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white/5 rounded-2xl p-4 mb-6 text-center border border-white/10 backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h1 className="text-lg font-black text-white">{exam.title}</h1>
          </div>
          <p className="text-white/50 text-xs">{exam.sections.length} phần · {exam.totalQuestions} câu · {limit} phút</p>
        </div>

        <div className="space-y-6">
          {exam.sections.map(section => {
            const style = SECTION_STYLE[section.id]
            const answered = countAnswered(section.questions, answers)
            const collapsed = collapsedSections.has(section.id)
            return (
              <div key={section.id} className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <button
                  onClick={() => toggleSection(section.id)}
                  className={`w-full bg-gradient-to-r ${style.gradient} ${style.border} border-b-4 p-4 flex items-center justify-between text-white`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">{section.id}</div>
                    <div className="text-left">
                      <div className="font-black text-base">{section.name}</div>
                      <div className="text-white/80 text-xs">{section.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${answered === section.questions.length ? 'bg-white text-green-700' : 'bg-white/20 text-white'}`}>
                      {answered}/{section.questions.length}
                    </div>
                    {collapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                  </div>
                </button>
                {!collapsed && (
                  <div className="bg-white divide-y divide-gray-100">
                    {section.questions.map((q) => (
                      <TSAQuestionCard
                        key={q.id}
                        question={q}
                        displayNum={q.number}
                        sectionStyle={style}
                        answer={answers[q.id]}
                        onChange={(val) => handleAnswerChange(q.id, val)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isSubmitting}
            className="px-10 py-4 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-black text-lg rounded-2xl shadow-2xl hover:scale-105 transition-all flex items-center gap-3 mx-auto disabled:opacity-60"
          >
            <Send className="w-5 h-5" /> Nộp bài
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="text-4xl mb-3">📤</div>
            <h3 className="text-xl font-black text-gray-800 mb-2">Xác nhận nộp bài?</h3>
            <p className="text-gray-500 text-sm mb-1">
              Đã trả lời <strong className="text-teal-600">{answeredTotal}/{exam.totalQuestions}</strong> câu
            </p>
            {answeredTotal < exam.totalQuestions && (
              <p className="text-amber-600 text-xs font-bold mt-2 bg-amber-50 px-3 py-2 rounded-xl">
                ⚠️ Còn {exam.totalQuestions - answeredTotal} câu chưa trả lời
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition">
                Tiếp tục làm
              </button>
              <button
                onClick={() => { if (!student.isGuest) submitSession(); handleSubmit(true) }}
                disabled={isSubmitting}
                className={`flex-1 py-3 rounded-xl font-bold text-white transition-all ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700'}`}
              >
                {isSubmitting
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Đang nộp...</span>
                  : '🚀 Nộp bài!'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TSAExamRoom

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION CARD DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

const TSAQuestionCard: React.FC<{
  question: TSAQuestion
  displayNum: number
  sectionStyle: typeof SECTION_STYLE[TSASectionId]
  answer: any
  onChange: (val: any) => void
}> = ({ question, displayNum, sectionStyle, answer, onChange }) => {
  const answered = isAnswered(question, answer)
  const TYPE_LABEL: Record<TSAQuestionType, string> = {
    tsa_multiple_choice: 'Trắc nghiệm',
    tsa_true_false: 'Đúng / Sai',
    tsa_multiple_select: 'Chọn nhiều',
    tsa_drag_drop: 'Kéo thả',
    tsa_fill_blank: 'Điền khuyết',
    tsa_matching: 'Ghép đôi',
  }
  return (
    <div className={`transition-all ${answered ? 'bg-teal-50/60' : 'bg-white'}`}>
      <div className={`flex items-center gap-3 px-5 py-3 border-b ${answered ? 'border-teal-100 bg-teal-50' : 'border-gray-100 bg-slate-50'}`}>
        <span className={`px-3 py-1 rounded-lg text-sm font-black text-white shadow-sm ${answered ? 'bg-teal-500' : 'bg-gray-400'}`}>
          Câu {displayNum}
        </span>
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold ${sectionStyle.badge}`}>
          {sectionStyle.icon} {TYPE_LABEL[question.type]}
        </span>
        {answered && (
          <span className="ml-auto flex items-center gap-1 text-xs font-bold text-teal-600">
            <Check className="w-3.5 h-3.5" /> Đã trả lời
          </span>
        )}
      </div>
      <div className="px-5 py-5">
        {/* Drag-drop dùng component riêng, các loại khác dùng MathText */}
        {question.type !== 'tsa_drag_drop' && (
          <MathText html={question.text} className="text-gray-800 text-[15px] leading-relaxed mb-4" block />
        )}

        {question.type === 'tsa_multiple_choice' && (
          <MultipleChoiceInput options={question.choiceOptions ?? []} answer={answer} onChange={onChange} />
        )}
        {question.type === 'tsa_true_false' && (
          <TrueFalseInput statements={question.tfStatements ?? []} answer={answer ?? {}} onChange={onChange} />
        )}
        {question.type === 'tsa_multiple_select' && (
          <MultipleSelectInput options={question.choiceOptions ?? []} answer={answer ?? []} onChange={onChange} />
        )}
        {question.type === 'tsa_drag_drop' && (
          <DragDropQuestion
            html={question.text}
            bank={question.dragBank ?? []}
            answer={answer ?? {}}
            onChange={onChange}
          />
        )}
        {question.type === 'tsa_fill_blank' && (
          <FillBlankInput blanks={question.blanks ?? []} answer={answer ?? {}} onChange={onChange} />
        )}
        {question.type === 'tsa_matching' && (
          <MatchingInput left={question.matchLeft ?? []} right={question.matchRight ?? []} answer={answer ?? {}} onChange={onChange} />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// I. TRẮC NGHIỆM NHIỀU LỰA CHỌN
// ─────────────────────────────────────────────────────────────────────────────

const MultipleChoiceInput: React.FC<{
  options: Array<{ letter: string; text: string }>
  answer: string | undefined
  onChange: (val: string) => void
}> = ({ options, answer, onChange }) => (
  <div className="space-y-2.5">
    {options.map((opt, idx) => {
      const displayLetter = String.fromCharCode(65 + idx)
      const selected = answer?.toUpperCase() === opt.letter.toUpperCase()
      return (
        <label key={opt.letter} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${selected ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
          <input type="radio" checked={selected} onChange={() => onChange(opt.letter)} className="hidden" />
          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 ${selected ? 'bg-amber-500' : 'bg-teal-500'}`}>{displayLetter}</span>
          <MathText html={opt.text} className="flex-1 text-gray-700 text-sm" />
          {selected && <Check className="w-5 h-5 text-amber-500 shrink-0" />}
        </label>
      )
    })}
  </div>
)

// ─────────────────────────────────────────────────────────────────────────────
// II. ĐÚNG / SAI
// ─────────────────────────────────────────────────────────────────────────────

const TrueFalseInput: React.FC<{
  statements: Array<{ label: string; text: string }>
  answer: Record<string, 'T' | 'F'>
  onChange: (val: Record<string, 'T' | 'F'>) => void
}> = ({ statements, answer, onChange }) => {
  const handleToggle = (label: string, val: 'T' | 'F') => {
    const next = { ...answer }
    if (next[label] === val) delete next[label]
    else next[label] = val
    onChange(next)
  }
  return (
    <div className="rounded-xl border-2 border-teal-600 overflow-hidden shadow-sm">
      <div className="grid grid-cols-[1fr_80px_80px] bg-teal-600 text-white text-xs font-black uppercase divide-x-2 divide-teal-500 border-b-2 border-teal-600">
        <div className="px-4 py-3">Mệnh đề</div>
        <div className="py-3 flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" /> Đúng</div>
        <div className="py-3 flex items-center justify-center gap-1"><X className="w-3.5 h-3.5" /> Sai</div>
      </div>
      <div className="divide-y-2 divide-teal-100">
        {statements.map((stmt, idx) => {
          const cVal = answer[stmt.label]
          return (
            <div key={stmt.label} className="grid grid-cols-[1fr_80px_80px] bg-white divide-x-2 divide-teal-100 hover:bg-teal-50/30 transition-colors">
              <div className="px-4 py-4 flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-[13px] font-black shrink-0 border border-teal-100">
                  {String.fromCharCode(97 + idx)}
                </span>
                <MathText html={stmt.text} className="flex-1 text-[14px] pt-0.5 text-gray-800" />
              </div>
              <button onClick={() => handleToggle(stmt.label, 'T')} className={`flex items-center justify-center transition-all outline-none ${cVal === 'T' ? 'bg-emerald-500 text-white' : 'text-gray-300 hover:bg-emerald-50'}`}>
                {cVal === 'T' && <Check className="w-6 h-6 stroke-[3]" />}
              </button>
              <button onClick={() => handleToggle(stmt.label, 'F')} className={`flex items-center justify-center transition-all outline-none ${cVal === 'F' ? 'bg-red-500 text-white' : 'text-gray-300 hover:bg-red-50'}`}>
                {cVal === 'F' && <X className="w-6 h-6 stroke-[3]" />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// III. CHỌN NHIỀU ĐÁP ÁN ĐÚNG
// ─────────────────────────────────────────────────────────────────────────────

const MultipleSelectInput: React.FC<{
  options: Array<{ letter: string; text: string }>
  answer: string[]
  onChange: (val: string[]) => void
}> = ({ options, answer, onChange }) => {
  const toggle = (letter: string) => {
    const next = answer.includes(letter) ? answer.filter(l => l !== letter) : [...answer, letter]
    onChange(next)
  }
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-violet-600 font-bold bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-200 w-fit">
        💡 Chọn tất cả các đáp án đúng (có thể chọn nhiều)
      </p>
      {options.map((opt, idx) => {
        const selected = answer.includes(opt.letter)
        const displayLetter = String.fromCharCode(65 + idx)
        return (
          <label key={opt.letter} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${selected ? 'border-violet-400 bg-violet-50 shadow-sm' : 'border-gray-200 bg-gray-50 hover:border-violet-200'}`}>
            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-violet-500 border-violet-500' : 'border-gray-300'}`}>
              {selected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
            </div>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 ${selected ? 'bg-violet-500' : 'bg-gray-400'}`}>{displayLetter}</span>
            <input type="checkbox" checked={selected} onChange={() => toggle(opt.letter)} className="hidden" />
            <MathText html={opt.text} className="flex-1 text-gray-700 text-sm" />
          </label>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// IV. KÉO THẢ — Slot tương tác ngay trong đề bài
// ─────────────────────────────────────────────────────────────────────────────

const DragDropQuestion: React.FC<{
  html: string
  bank: Array<{ id: string; text: string; correctSlot: number | null }>
  answer: Record<string, string>
  onChange: (val: Record<string, string>) => void
}> = ({ html, bank, answer, onChange }) => {
  const stemRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const initializedRef = useRef(false)

  // Refs để tránh stale closure trong DOM event handlers
  const answerRef = useRef(answer)
  const selectedRef = useRef(selected)
  const bankRef = useRef(bank)
  const onChangeRef = useRef(onChange)
  answerRef.current = answer
  selectedRef.current = selected
  bankRef.current = bank
  onChangeRef.current = onChange

  const updateSlots = useCallback(() => {
  if (!stemRef.current) return
  const toTypeset: HTMLElement[] = []   // ← thu thập các span cần typeset

  stemRef.current.querySelectorAll<HTMLElement>('.tsa-slot').forEach(el => {
    const n = el.dataset.slot!
    const key = `slot_${n}`
    const filledId = answerRef.current[key]
    const item = bankRef.current.find(b => b.id === filledId)
    const hasSel = selectedRef.current !== null

    el.innerHTML = ''

    if (item) {
      Object.assign(el.style, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: '80px', height: '40px', padding: '0 10px',
        background: '#d1fae5', border: '2px solid #10b981', borderRadius: '10px',
        fontWeight: '600', color: '#065f46', fontSize: '14px',
        verticalAlign: 'middle', margin: '0 5px', cursor: 'pointer',
        gap: '5px', boxShadow: 'none', animation: 'none',
      })
      const t = document.createElement('span')
      t.innerHTML = item.text   // chứa LaTeX chưa render
      toTypeset.push(t)         // ← đẩy vào queue typeset
      const x = document.createElement('button')
      Object.assign(x.style, {
        width: '16px', height: '16px', borderRadius: '50%',
        background: 'rgba(16,185,129,0.2)', color: '#065f46',
        border: 'none', cursor: 'pointer', fontSize: '12px',
        fontWeight: '900', flexShrink: '0', lineHeight: '1',
        padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
      })
      x.textContent = '×'
      x.title = 'Xóa'
      x.onclick = (e) => {
        e.stopPropagation()
        const next = { ...answerRef.current }
        delete next[key]
        onChangeRef.current(next)
      }
      el.appendChild(t)
      el.appendChild(x)
    } else if (hasSel) {
      Object.assign(el.style, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: '80px', height: '40px', padding: '0 14px',
        background: '#fff7ed', border: '2.5px dashed #f97316', borderRadius: '10px',
        fontWeight: '600', color: '#f97316', fontSize: '14px',
        verticalAlign: 'middle', margin: '0 5px', cursor: 'pointer',
        animation: 'tsa-slot-pulse 1.2s infinite', boxShadow: '0 0 0 0 rgba(249,115,22,0.3)',
      })
      el.textContent = `(${n})`
    } else {
      Object.assign(el.style, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: '80px', height: '40px', padding: '0 14px',
        background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '10px',
        fontWeight: '500', color: '#9ca3af', fontSize: '14px',
        verticalAlign: 'middle', margin: '0 5px', cursor: 'default',
        animation: 'none', boxShadow: 'none',
      })
      el.textContent = `(${n})`
    }

    el.onclick = () => {
      const sel = selectedRef.current
      const cur = answerRef.current
      if (sel) {
        const next = { ...cur }
        const prev = Object.entries(next).find(([, v]) => v === sel)?.[0]
        if (prev) delete next[prev]
        next[key] = sel
        onChangeRef.current(next)
        setSelected(null)
      } else if (cur[key]) {
        const next = { ...cur }
        delete next[key]
        onChangeRef.current(next)
      }
    }
  })

  // ← Typeset tất cả span mới điền vào, một lần duy nhất
  if (toTypeset.length > 0 && window.MathJax?.typesetPromise) {
    window.MathJax.typesetClear?.(toTypeset)
    window.MathJax.typesetPromise(toTypeset).catch(console.error)
  }
}, [])

  // Khởi tạo một lần: set innerHTML + chạy MathJax
  useEffect(() => {
    if (!stemRef.current || initializedRef.current) return
    stemRef.current.innerHTML = html
    const done = () => {
      initializedRef.current = true
      updateSlots()
    }
    if (window.MathJax?.typesetPromise) {
      window.MathJax.typesetClear?.([stemRef.current])
      window.MathJax.typesetPromise([stemRef.current]).then(done).catch(console.error)
    } else {
      done()
    }
  }, [html, updateSlots])

  // Cập nhật slot khi answer hoặc selected thay đổi
  useEffect(() => {
    if (initializedRef.current) updateSlots()
  }, [answer, selected, updateSlots])

  const placed = new Set(Object.values(answer))
  const answeredCount = Object.keys(answer).length

  return (
    <div className="space-y-4">
      {/* CSS animation cho slot đang chờ */}
      <style>{`
        @keyframes tsa-slot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.35); }
          50%       { box-shadow: 0 0 0 6px rgba(249,115,22,0); }
        }
      `}</style>

      {/* Đề bài với slot tương tác */}
      <div ref={stemRef} className="text-gray-800 text-[15px] leading-loose" />

      {/* Ngân hàng đáp án */}
      <div className="bg-orange-50 rounded-xl border-2 border-orange-200 p-4">
        <p className="text-xs font-black text-orange-700 mb-3 flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 shrink-0" />
          NGÂN HÀNG ĐÁP ÁN — Chọn thẻ rồi nhấp vào ô trống trong đề
        </p>
        <div className="flex flex-wrap gap-2">
          {bank.map(item => {
            const isPlaced = placed.has(item.id)
            const isSel = selected === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  // Nếu đã đặt rồi → xóa khỏi slot
                  const slot = Object.entries(answer).find(([, v]) => v === item.id)?.[0]
                  if (slot) {
                    const next = { ...answer }
                    delete next[slot]
                    onChange(next)
                    setSelected(null)
                  } else {
                    setSelected(p => p === item.id ? null : item.id)
                  }
                }}
                className={`px-4 py-2.5 rounded-xl border-2 font-bold text-sm transition-all min-h-[42px] ${
                  isPlaced
                    ? 'opacity-40 line-through border-gray-200 bg-gray-100 text-gray-400 cursor-pointer hover:opacity-70'
                    : isSel
                    ? 'border-orange-500 bg-orange-500 text-white ring-4 ring-orange-300 ring-offset-2 scale-105 shadow-lg shadow-orange-200'
                    : 'border-orange-300 bg-white text-orange-800 hover:border-orange-500 hover:bg-orange-50 shadow-sm hover:shadow-md'
                }`}
              >
                <MathText html={item.text} className="inline" />
              </button>
            )
          })}
        </div>
        {selected && (
          <p className="mt-2 text-xs text-orange-600 font-bold animate-pulse flex items-center gap-1">
            ✅ Đã chọn — nhấp vào ô
            <span className="bg-orange-100 border border-orange-300 px-1.5 py-0.5 rounded font-mono">(n)</span>
            trong đề để điền vào
          </p>
        )}
      </div>

      {/* Nút xóa tất cả */}
      {answeredCount > 0 && (
        <button
          onClick={() => { onChange({}); setSelected(null) }}
          className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg transition hover:bg-red-100"
        >
          ✕ Xóa tất cả đáp án
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V. ĐIỀN KHUYẾT
// ─────────────────────────────────────────────────────────────────────────────

const FillBlankInput: React.FC<{
  blanks: Array<{ index: number; width?: string }>
  answer: Record<number, string>
  onChange: (val: Record<number, string>) => void
}> = ({ blanks, answer, onChange }) => {
  const inputRefs = React.useRef<Record<number, HTMLInputElement | null>>({})
  const handleChange = (idx: number, val: string) => { onChange({ ...answer, [idx]: val }) }
  return (
    <div className="space-y-3">
      <div className="text-xs text-rose-700 font-bold bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 w-fit">
        ✏️ Điền số/đáp án vào từng ô trống
      </div>
      {blanks.map(blank => (
        <div key={blank.index} className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center font-black text-sm shrink-0">{blank.index}</span>
          <input
            ref={el => { inputRefs.current[blank.index] = el }}
            type="text"
            value={answer[blank.index] ?? ''}
            onChange={e => handleChange(blank.index, e.target.value)}
            placeholder={`Đáp án (${blank.index})`}
            className={`flex-1 px-4 py-2.5 border-2 rounded-xl focus:border-rose-400 outline-none font-bold text-gray-700 text-sm transition-colors ${answer[blank.index] ? 'border-rose-400 bg-rose-50' : 'border-gray-200'}`}
            style={{ maxWidth: blank.width ? `calc(${blank.width} * 3)` : '220px' }}
          />
          {answer[blank.index] && (
            <button onClick={() => handleChange(blank.index, '')} className="text-xs text-gray-400 hover:text-red-500 transition shrink-0" title="Xóa">✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VI. GHÉP ĐÔI
// ─────────────────────────────────────────────────────────────────────────────

const MatchingInput: React.FC<{
  left: Array<{ num: number; text: string }>
  right: Array<{ letter: string; text: string }>
  answer: Record<number, string>
  onChange: (val: Record<number, string>) => void
}> = ({ left, right, answer, onChange }) => {
  const handleSelect = (num: number, letter: string) => {
    const next = { ...answer }
    if (next[num] === letter) delete next[num]
    else next[num] = letter
    onChange(next)
  }
  const usedLetters = new Set(Object.values(answer))
  return (
    <div className="space-y-4">
      <div className="text-xs text-cyan-700 font-bold bg-cyan-50 px-3 py-1.5 rounded-lg border border-cyan-200 w-fit">
        🔗 Chọn đáp án cột phải phù hợp với mỗi ô cột trái
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Cột phải:</p>
        <div className="grid gap-2">
          {right.map(item => (
            <div key={item.letter} className="flex gap-2 items-start">
              <span className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-700 font-black text-sm flex items-center justify-center shrink-0 border border-cyan-200 mt-0.5">{item.letter}</span>
              <MathText html={item.text} className="flex-1 text-sm text-gray-700 pt-0.5" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Ghép với cột trái:</p>
        <div className="rounded-xl border-2 border-cyan-200 overflow-hidden">
          {left.map((item, idx) => {
            const chosen = answer[item.num]
            const chosenItem = right.find(r => r.letter === chosen)
            return (
              <div key={item.num} className={`flex items-start gap-3 p-4 ${idx > 0 ? 'border-t-2 border-cyan-100' : ''} ${chosen ? 'bg-cyan-50/60' : 'bg-white'}`}>
                <span className="w-7 h-7 rounded-full bg-cyan-600 text-white font-black text-sm flex items-center justify-center shrink-0 border border-cyan-700 mt-0.5">{item.num}</span>
                <div className="flex-1 min-w-0">
                  <MathText html={item.text} className="text-sm text-gray-800 mb-2" />
                  <div className="flex flex-wrap gap-1.5">
                    {right.map(rItem => {
                      const sel = chosen === rItem.letter
                      const takenByOther = usedLetters.has(rItem.letter) && !sel
                      return (
                        <button
                          key={rItem.letter}
                          onClick={() => handleSelect(item.num, rItem.letter)}
                          className={`w-8 h-8 rounded-lg text-sm font-black border-2 transition-all ${
                            sel ? 'bg-cyan-600 text-white border-cyan-600'
                            : takenByOther ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-default'
                            : 'bg-white text-cyan-700 border-cyan-300 hover:border-cyan-500 hover:bg-cyan-50'
                          }`}
                        >{rItem.letter}</button>
                      )
                    })}
                    {chosen && (
                      <span className="ml-2 text-xs font-bold text-cyan-600 flex items-center gap-1">
                        → <MathText html={chosenItem?.text.substring(0, 40) ?? ''} className="inline" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
