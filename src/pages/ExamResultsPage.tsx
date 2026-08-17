import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, BrainCircuit, Eye } from 'lucide-react'
import Modal from '@/components/Modal'
import EssayGraderPanel from '@/components/EssayGraderPanel'
import SubmissionDetailView from '@/components/SubmissionDetailView'
import TSASubmissionDetailView from '@/components/TSASubmissionDetailView'
import toast from 'react-hot-toast'

export default function ExamResultsPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [room, setRoom] = useState<any>(null)
  const [exam, setExam] = useState<any>(null)
  const [submissions, setSubmissions] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedSub, setSelectedSub] = useState<any>(null)
  const [showEssayGrader, setShowEssayGrader] = useState(false)
  const [activeTab, setActiveTab] = useState<'submitted' | 'not_submitted'>('not_submitted')

  useEffect(() => {
    loadAllData()
  }, [roomId])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const { data: roomData } = await supabase
        .from('exam_rooms')
        .select('*, exams(title, data)')
        .eq('id', roomId)
        .single()

      setRoom(roomData)
      setExam(roomData?.exams)

      const { data: subs } = await supabase
        .from('exam_submissions')
        .select('*, students(full_name, student_code)')
        .eq('room_id', roomId)
        .order('submitted_at', { ascending: false })

      setSubmissions(subs || [])

      const classId = roomData?.class_id
      if (classId) {
        const { data: enr } = await supabase
          .from('enrollments')
          .select('student_id, students(id, full_name, student_code)')
          .eq('class_id', classId)
          .eq('status', 'active')

        const list = (enr || [])
          .map((e: any) => (Array.isArray(e.students) ? e.students[0] : e.students))
          .filter(Boolean)
        setRoster(list)
      } else {
        setRoster([])
      }
    } catch (err) {
      toast.error('Không thể tải dữ liệu kết quả')
    } finally {
      setLoading(false)
    }
  }

  const isTSAExam = exam?.data?.exam_type === 'tsa' || exam?.title?.startsWith('[TSA]')

  const rows = useMemo(() => {
    const subByStudent = new Map<string, any>()
    for (const sub of submissions) {
      const sid = sub.student_id
      if (sid && !subByStudent.has(sid)) subByStudent.set(sid, sub)
    }

    const studentMap = new Map<string, any>()
    for (const st of roster) {
      if (st?.id) studentMap.set(st.id, st)
    }
    for (const sub of submissions) {
      const sid = sub.student_id
      if (sid && !studentMap.has(sid)) {
        studentMap.set(sid, {
          id: sid,
          full_name: sub.students?.full_name,
          student_code: sub.students?.student_code,
        })
      }
    }

    const computed = Array.from(studentMap.values()).map((st: any) => {
      const sub = subByStudent.get(st.id) || null
      const sb = sub?.score_breakdown || {}

      let computedCorrectCount = 0
      let totalQCount = 0

      if (isTSAExam) {
        const tsaSections = sb.sections ?? []
        computedCorrectCount = tsaSections.reduce((n: number, s: any) => n + (s.fullyCorrect ?? 0), 0)
        totalQCount = tsaSections.reduce((n: number, s: any) => n + (s.total ?? 0), 0)
          || exam?.data?.totalQuestions || 0
      } else {
        const mcCorrect = sb.multipleChoice?.correct || 0
        const tfCorrect = sb.trueFalse?.correct || 0
        const saCorrect = sb.shortAnswer?.correct || 0
        computedCorrectCount = mcCorrect + tfCorrect + saCorrect

        const examQuestions = exam?.data?.questions || []
        totalQCount = examQuestions.length ||
          ((sb.multipleChoice?.total || 0) + (sb.trueFalse?.total || 0) + (sb.shortAnswer?.total || 0))
      }

      let status: 'submitted' | 'in_progress' | 'not_submitted'
      if (!sub) status = 'not_submitted'
      else if (sub.status === 'submitted') status = 'submitted'
      else status = 'in_progress'

      const rawScore = sub ? (sub.score ?? sb.totalScore ?? null) : null
      const sortScore = rawScore ?? 0
      const correctCount = sub ? (sub.correct_count ?? computedCorrectCount) : 0

      const formattedSub = sub ? {
        ...sub,
        student: {
          name: sub.students?.full_name ?? st.full_name,
          className: '',
          studentCode: sub.students?.student_code ?? st.student_code,
        },
        roomCode: room?.code,
        totalScore: sub.score || sb.totalScore || 0,
        percentage: sb.percentage || 0,
        correctCount: sub.correct_count ?? computedCorrectCount,
        totalQuestions: totalQCount,
        duration: sub.duration || 0,
        tabSwitchCount: sub.tab_switches || 0,
        scoreBreakdown: sb,
        answers: sub.answers,
      } : null

      return {
        key: st.id,
        student: st,
        sub,
        status,
        rawScore,
        sortScore,
        correctCount,
        totalQCount,
        formattedSub,
      }
    })

    computed.sort((a, b) => {
      if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore
      const rank = (s: string) => (s === 'not_submitted' ? 1 : 0)
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      return (a.student.full_name || '').localeCompare(b.student.full_name || '', 'vi')
    })

    return computed
  }, [submissions, roster, exam, isTSAExam, room])

  if (loading) return <div className="p-20 text-center text-teal-600 font-bold">Đang tải bảng điểm...</div>

  const submittedRows = rows.filter(r => r.status === 'submitted')
  const notSubmittedRows = rows.filter(r => r.status === 'not_submitted' || r.status === 'in_progress')

  return (
    <div className="space-y-6 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/exam-rooms')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              Kết quả: {room?.exams?.title || room?.name}
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Mã phòng: <strong className="font-mono text-teal-700 font-extrabold uppercase">{room?.code}</strong> · <span className="text-teal-600 font-bold">{submittedRows.length}/{rows.length} đã nộp</span> · <span className="text-rose-600 font-bold">{notSubmittedRows.length} chưa nộp</span>
            </p>
          </div>
        </div>

        {/* Nút chấm tự luận */}
        {!isTSAExam && (
          <button
            onClick={() => setShowEssayGrader(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-sm flex items-center gap-2"
          >
            <BrainCircuit className="w-4 h-4" /> Chấm Tự luận AI
          </button>
        )}
      </div>

      {/* Tabs Đã làm / Chưa làm exact like design 2 */}
      <div className="border-b border-gray-200 flex items-center gap-6 text-sm font-bold">
        <button
          onClick={() => setActiveTab('submitted')}
          className={`pb-3.5 transition-colors relative flex items-center gap-2 ${
            activeTab === 'submitted'
              ? 'text-teal-700 font-extrabold border-b-2 border-teal-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>📝 Đã làm ({submittedRows.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('not_submitted')}
          className={`pb-3.5 transition-colors relative flex items-center gap-2 ${
            activeTab === 'not_submitted'
              ? 'text-teal-700 font-extrabold border-b-2 border-teal-600'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <span>⏳ Chưa làm ({notSubmittedRows.length})</span>
        </button>
      </div>

      {/* Tab 1: Danh sách Chưa làm (Grid các thẻ học sinh) */}
      {activeTab === 'not_submitted' && (
        <div className="bg-emerald-50/30 rounded-3xl border border-teal-100 p-6 space-y-6 shadow-2xs">
          {/* Box Cảnh báo màu vàng/đỏ nhạt đúng ảnh 2 */}
          <div className="bg-rose-50/80 border border-rose-200/80 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-xs sm:text-sm font-bold">
            <span className="text-lg">⚠️</span>
            <span>Danh sách các bạn chưa hoàn thành bài tập về nhà, hãy nhanh chóng làm trước buổi học tiếp theo!!!!</span>
          </div>

          {/* Grid Học Sinh Chưa Làm (4 Cột) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {notSubmittedRows.map((row) => (
              <div
                key={row.key}
                className="bg-white border border-gray-200/80 rounded-2xl p-4 text-center font-extrabold text-gray-800 text-sm shadow-2xs hover:border-teal-300 transition-colors"
              >
                {row.student.full_name || 'Học sinh'}
              </div>
            ))}
          </div>

          {notSubmittedRows.length === 0 && (
            <div className="text-center py-10 text-xs text-gray-400 font-medium italic">
              Tất cả học sinh đã hoàn thành bài tập! 🎉
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Danh sách Đã làm (Bảng kết quả) */}
      {activeTab === 'submitted' && (
        <div className="card overflow-hidden bg-white rounded-3xl border border-teal-100 shadow-2xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-4 text-center font-bold text-gray-600 w-16">#</th>
                <th className="px-6 py-4 text-left font-bold text-gray-600">Học sinh</th>
                <th className="px-6 py-4 text-center font-bold text-gray-600">Trạng thái</th>
                <th className="px-6 py-4 text-center font-bold text-gray-600">Điểm</th>
                <th className="px-6 py-4 text-center font-bold text-gray-600">Số câu đúng</th>
                <th className="px-6 py-4 text-right font-bold text-gray-600">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {submittedRows.map((row, idx) => (
                <tr key={row.key} className="hover:bg-teal-50/30 transition-colors">
                  <td className="px-4 py-4 text-center font-bold text-teal-700">{idx + 1}</td>
                  <td className="px-6 py-4">
                    <div className="font-extrabold text-gray-800">{row.student.full_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{row.student.student_code}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-extrabold">
                      Đã nộp
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-black text-teal-700 text-lg">
                    {row.rawScore != null ? row.rawScore.toFixed(2) : '—'}
                  </td>
                  <td className="px-6 py-4 text-center text-gray-700 font-bold">
                    {row.correctCount}/{row.totalQCount}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {row.formattedSub && (
                      <button
                        onClick={() => setSelectedSub(row.formattedSub)}
                        className="p-2 text-teal-600 hover:bg-teal-100 rounded-xl transition-all"
                        title="Xem chi tiết câu trả lời"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {submittedRows.length === 0 && (
            <div className="text-center py-12 text-xs text-gray-400 font-medium italic">
              Chưa có học sinh nào nộp bài.
            </div>
          )}
        </div>
      )}

      {/* Modal chấm tự luận (chỉ đề thường) */}
      {!isTSAExam && (
        <Modal open={showEssayGrader} onClose={() => setShowEssayGrader(false)} title="Chấm bài tự luận bằng Gemini AI" size="3xl">
          <div className="p-2">
            <EssayGraderPanel
              submissions={submissions.map(s => ({ ...s, student: { name: s.students?.full_name } }))}
              questions={exam?.data?.questions || []}
              onScoreUpdate={loadAllData}
            />
          </div>
        </Modal>
      )}

      {/* Modal chi tiết bài làm */}
      {selectedSub && (() => {
        const studentExam = selectedSub.scoreBreakdown?.shuffled_exam
          || selectedSub.score_breakdown?.shuffled_exam
          || exam?.data

        const isThisTSA = studentExam?.exam_type === 'tsa' || isTSAExam

        if (isThisTSA) {
          return (
            <TSASubmissionDetailView
              submission={selectedSub}
              exam={{ ...studentExam, title: exam?.title }}
              room={room}
              onClose={() => setSelectedSub(null)}
            />
          )
        }

        return (
          <SubmissionDetailView
            submission={selectedSub}
            exam={{ ...studentExam, title: exam?.title }}
            room={room}
            onClose={() => setSelectedSub(null)}
          />
        )
      })()}
    </div>
  )
}
