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
  const [roster, setRoster] = useState<any[]>([])   // ✅ MỚI: toàn bộ HS trong lớp của phòng
  const [loading, setLoading] = useState(true)

  const [selectedSub, setSelectedSub] = useState<any>(null)
  const [showEssayGrader, setShowEssayGrader] = useState(false)

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
      setExam(roomData.exams)

      const { data: subs } = await supabase
        .from('exam_submissions')
        .select('*, students(full_name, student_code)')
        .eq('room_id', roomId)
        .order('submitted_at', { ascending: false })

      setSubmissions(subs || [])

      // ✅ MỚI: Lấy toàn bộ học sinh đang học trong lớp gắn với phòng thi
      // để hiển thị cả những bạn CHƯA nộp (mặc định 0đ).
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
        // Phòng không gắn lớp → không có danh sách lớp, chỉ dựa vào bài nộp
        setRoster([])
      }
    } catch (err) {
      toast.error('Không thể tải dữ liệu kết quả')
    } finally {
      setLoading(false)
    }
  }

  // Xác định loại đề (TSA hay thường) - kiểm tra data.exam_type hoặc title prefix [TSA]
  const isTSAExam = exam?.data?.exam_type === 'tsa' || exam?.title?.startsWith('[TSA]')

  // ✅ MỚI: Gộp danh sách lớp + bài nộp thành 1 bảng xếp hạng theo điểm.
  // - Mỗi học sinh 1 dòng (nếu nộp nhiều lần thì lấy lần mới nhất).
  // - HS chưa nộp → điểm 0, trạng thái "not_submitted".
  // - Sắp xếp điểm giảm dần; cùng điểm thì người đã nộp xếp trên, rồi theo tên.
  const rows = useMemo(() => {
    // submissions đã order submitted_at desc → bản ghi đầu là mới nhất.
    const subByStudent = new Map<string, any>()
    for (const sub of submissions) {
      const sid = sub.student_id
      if (sid && !subByStudent.has(sid)) subByStudent.set(sid, sub)
    }

    // Hợp nhất: học sinh trong lớp + học sinh đã nộp nhưng không còn trong lớp.
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

      // ── Tính correctCount tuỳ loại đề ──
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

      // Trạng thái
      let status: 'submitted' | 'in_progress' | 'not_submitted'
      if (!sub) status = 'not_submitted'
      else if (sub.status === 'submitted') status = 'submitted'
      else status = 'in_progress'

      // Điểm thật để hiển thị; điểm dùng sắp xếp (HS chưa nộp = 0)
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

  const submittedCount = rows.filter(r => r.status === 'submitted').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/exam-rooms')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft className="w-6 h-6 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="section-title text-2xl">Kết quả: {room?.exams?.title}</h1>
              {isTSAExam && (
                <span className="bg-orange-100 text-orange-700 text-xs font-black px-2 py-0.5 rounded-full border border-orange-200">TSA</span>
              )}
            </div>
            <p className="text-gray-400 text-sm">
              Mã phòng: <span className="font-mono font-bold text-teal-600">{room?.code}</span>
              {' · '}{rows.length} học sinh · đã nộp {submittedCount}/{rows.length}
            </p>
          </div>
        </div>

        {/* Nút chấm tự luận chỉ hiện với đề thường */}
        {!isTSAExam && (
          <button
            onClick={() => setShowEssayGrader(true)}
            className="btn-teal bg-violet-600 hover:bg-violet-700 flex items-center gap-2 w-max"
          >
            <BrainCircuit className="w-4 h-4" /> Chấm Tự luận AI
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-4 text-center font-bold text-gray-600 w-16">#</th>
              <th className="px-6 py-4 text-left font-bold text-gray-600">Học sinh</th>
              <th className="px-6 py-4 text-center font-bold text-gray-600">Trạng thái</th>
              <th className="px-6 py-4 text-center font-bold text-gray-600">Điểm</th>
              <th className="px-6 py-4 text-center font-bold text-gray-600">
                {isTSAExam ? 'Câu đúng hoàn toàn' : 'Số câu đúng'}
              </th>
              <th className="px-6 py-4 text-right font-bold text-gray-600">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, idx) => {
              const notSubmitted = row.status === 'not_submitted'

              return (
                <tr
                  key={row.key}
                  className={`hover:bg-teal-50/30 transition-colors ${notSubmitted ? 'opacity-70' : ''}`}
                >
                  {/* Xếp hạng */}
                  <td className="px-4 py-4 text-center">
                    <span className={`font-black ${idx < 3 && !notSubmitted ? 'text-teal-600' : 'text-gray-400'}`}>
                      {idx + 1}
                    </span>
                  </td>

                  {/* Học sinh */}
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-800">{row.student.full_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{row.student.student_code}</div>
                  </td>

                  {/* Trạng thái */}
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      row.status === 'submitted'
                        ? 'bg-green-100 text-green-700'
                        : row.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {row.status === 'submitted'
                        ? 'Đã nộp'
                        : row.status === 'in_progress'
                          ? 'Đang làm'
                          : 'Chưa nộp'}
                    </span>
                  </td>

                  {/* Điểm: HS chưa nộp mặc định 0.00 */}
                  <td className={`px-6 py-4 text-center font-bold text-lg ${
                    notSubmitted ? 'text-gray-400' : 'text-teal-600'
                  }`}>
                    {notSubmitted
                      ? '0.00'
                      : (row.rawScore != null ? row.rawScore.toFixed(2) : '—')}
                  </td>

                  {/* Số câu đúng */}
                  <td className="px-6 py-4 text-center text-gray-600">
                    {row.status === 'submitted'
                      ? <span className="font-semibold">{row.correctCount}<span className="text-gray-400 font-normal">/{row.totalQCount}</span></span>
                      : notSubmitted
                        ? <span className="text-gray-400">0<span className="font-normal">/{row.totalQCount}</span></span>
                        : '—'}
                  </td>

                  {/* Hành động: chỉ có nút xem khi có bài nộp */}
                  <td className="px-6 py-4 text-right">
                    {row.formattedSub ? (
                      <button
                        onClick={() => setSelectedSub(row.formattedSub)}
                        className="p-2 text-teal-600 hover:bg-teal-100 rounded-lg transition-all"
                        title="Xem chi tiết câu trả lời"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

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
        // Lấy đúng đề học sinh đã làm
        const studentExam = selectedSub.scoreBreakdown?.shuffled_exam
          || selectedSub.score_breakdown?.shuffled_exam
          || exam.data

        const isThisTSA = studentExam?.exam_type === 'tsa' || isTSAExam

        if (isThisTSA) {
          return (
            <TSASubmissionDetailView
              submission={selectedSub}
              exam={{ ...studentExam, title: exam.title }}
              room={room}
              onClose={() => setSelectedSub(null)}
            />
          )
        }

        return (
          <SubmissionDetailView
            submission={selectedSub}
            exam={{ ...studentExam, title: exam.title }}
            room={room}
            onClose={() => setSelectedSub(null)}
          />
        )
      })()}
    </div>
  )
}
