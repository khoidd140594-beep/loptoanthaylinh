// @ts-nocheck
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import ResultView from '@/components/ResultView'
import PDFExamRoom from '@/components/PDFExamRoom'
import ExamRoom from '@/components/ExamRoom'
import TSAExamRoom from '@/components/TSAExamRoom'
import TSAResultView from '@/components/TSAResultView'
import { shuffleExamForStudent } from '@/services/mergeExamsService'
import { scoreTSAExam } from '@/services/tsaScoringService'
import toast from 'react-hot-toast'

export default function ExamRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [student, setStudent] = useState<any>(null)
  const [room, setRoom] = useState<any>(null)
  const [exam, setExam] = useState<any>(null)
  const [currentExamData, setCurrentExamData] = useState<any>(null)

  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [submissionId, setSubmissionId] = useState<string | undefined>()
  const [submittedResult, setSubmittedResult] = useState<any>(null)

  // ✅ Trạng thái cho chế độ thi công khai
  const [waitingForGuestName, setWaitingForGuestName] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestNameError, setGuestNameError] = useState('')

  useEffect(() => {
    // Safari private mode / iOS strict mode có thể throw SecurityError
    let savedStudent: any = null
    try {
      const sessionStr = sessionStorage.getItem('current_student')
      savedStudent = sessionStr ? JSON.parse(sessionStr) : null
    } catch {
      savedStudent = null
    }

    const loadRoom = async () => {
      try {
        const { data: roomData, error: roomErr } = await supabase
          .from('exam_rooms').select('*').eq('id', roomId).single()
        if (roomErr || !roomData) throw new Error('Không tìm thấy phòng thi')

        const now = new Date()
        if (roomData.opens_at && now < new Date(roomData.opens_at)) {
          throw new Error(`Đề thi chưa mở. Thời gian mở: ${new Date(roomData.opens_at).toLocaleString('vi-VN')}`)
        }

        setRoom(roomData)

        if (!savedStudent) {
          if (roomData.settings?.publicAccess) {
            setWaitingForGuestName(true)
            setLoading(false)
          } else {
            toast.error('Vui lòng đăng nhập qua cổng thi')
            navigate('/thi')
          }
          return
        }

        // Kiểm tra xem học sinh có thuộc lớp được giao đề thi này không
        if (roomData.class_id && !roomData.settings?.publicAccess) {
          const { data: enrollment } = await supabase
            .from('enrollments')
            .select('id')
            .eq('student_id', savedStudent.id)
            .eq('class_id', roomData.class_id)
            .eq('status', 'active')
            .maybeSingle()

          if (!enrollment) {
            throw new Error('Bạn không thuộc lớp học được giao bài thi này!')
          }
        }

        setStudent(savedStudent)
        await loadExamData(roomData, savedStudent)
      } catch (err: any) {
        toast.error(err.message)
        navigate('/thi')
      } finally {
        setLoading(false)
      }
    }

    loadRoom()
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadExamData = async (roomData: any, currentStudent: any) => {
    const { data: examData, error: examErr } = await supabase
      .from('exams').select('id, data, title').eq('id', roomData.exam_id).single()
    if (examErr || !examData) throw new Error('Không tìm thấy đề thi')
    setExam(examData)

    const isTSA = examData.data?.exam_type === 'tsa'
    const isPdf = !!examData.data?.pdfUrl || !!examData.data?.pdfDriveUrl || !!examData.data?.pdfBase64

    const { data: submission } = await supabase
      .from('exam_submissions').select('*')
      .eq('room_id', roomData.id).eq('student_id', currentStudent.id).maybeSingle()

    let finalExamData = examData.data

    if (submission && submission.score_breakdown?.shuffled_exam) {
      finalExamData = submission.score_breakdown.shuffled_exam
      // Restore pointsConfig sau shuffle
      if (!finalExamData.pointsConfig && examData.data?.pointsConfig) {
        finalExamData = { ...finalExamData, pointsConfig: examData.data.pointsConfig }
      }
    } else if (!isPdf && !isTSA && roomData.settings?.shuffle) {
      // TSA không shuffle — cấu trúc câu hỏi quá phức tạp
      const shuffled = shuffleExamForStudent(examData.data)
      finalExamData = { ...shuffled, pointsConfig: examData.data.pointsConfig }
    }

    setCurrentExamData(finalExamData)

    if (submission) {
      setSubmissionId(submission.id)
      if (submission.status === 'submitted') {
        const b = submission.score_breakdown || {}

        // ── TSA: đọc breakdown từ sections ──
        if (isTSA) {
          setSubmittedResult({
            ...submission,
            student: currentStudent,
            percentage: b.percentage || 0,
            totalScore: submission.score || b.totalScore || 0,
            correctCount: b.sections?.reduce((n: number, s: any) => n + (s.fullyCorrect ?? 0), 0) ?? 0,
            totalQuestions: finalExamData.totalQuestions || 0,
            scoreBreakdown: b,
            answers: submission.answers,
          })
        } else {
          const correct = (b.multipleChoice?.correct || 0) + (b.trueFalse?.correct || 0) + (b.shortAnswer?.correct || 0)
          const total = (b.multipleChoice?.total || 0) + (b.trueFalse?.total || 0) + (b.shortAnswer?.total || 0) || finalExamData.questions?.length
          setSubmittedResult({
            ...submission, student: currentStudent, percentage: b.percentage || 0,
            totalScore: submission.score || b.totalScore || 0, correctCount: correct,
            wrongCount: Math.max(0, total - correct), totalQuestions: total,
            scoreBreakdown: b, answers: submission.answers,
          })
        }
      } else {
        setAnswers(submission.answers || {})
      }
    } else {
      const studentName = currentStudent.name || currentStudent.full_name || 'Học sinh';
      const breakdownPayload = isTSA
        ? { exam_type: 'tsa', exam_id: examData.id }
        : { shuffled_exam: finalExamData };

      const { data: newSub } = await supabase
        .from('exam_submissions')
        .insert([{
          room_id: roomData.id,
          student_id: currentStudent.id,
          student_name: studentName,
          status: 'in_progress',
          answers: {},
          score_breakdown: breakdownPayload,
        }])
        .select('id')
        .maybeSingle()

      if (newSub?.id) {
        setSubmissionId(newSub.id)
      } else {
        const { data: existing } = await supabase.from('exam_submissions')
          .select('id').eq('room_id', roomData.id).eq('student_id', currentStudent.id).maybeSingle()
        if (existing?.id) setSubmissionId(existing.id)
      }
    }
  }

  // ── Guest name handler ───────────────────────────────────────────────────
  const handleGuestStart = async () => {
    if (!guestName.trim()) { setGuestNameError('Vui lòng nhập họ tên của bạn'); return }
    setGuestNameError('')
    setLoading(true)
    try {
      // Lấy lại guest từ session nếu đã có (tránh tạo UUID mới mỗi lần reload)
      let savedGuest: any = null
      try { savedGuest = JSON.parse(sessionStorage.getItem('current_student') || 'null') } catch {}
      const isReturningGuest = savedGuest?.isGuest && savedGuest?.full_name === guestName.trim()

      const guestStudent = isReturningGuest ? savedGuest : {
        id: crypto.randomUUID(),
        full_name: guestName.trim(),
        student_code: `GUEST_${Date.now()}`,
        isGuest: true,
      }

      // ── Bắt buộc: upsert guest vào bảng students để thoả FK constraint ──
      // exam_submissions và exam_sessions đều có student_id FK → students.id
      // student_code prefix GUEST_ để dễ phân biệt khi cần dọn dẹp sau
      await supabase.from('students').upsert({
        id: guestStudent.id,
        student_code: guestStudent.student_code,
        full_name: guestStudent.full_name,
        status: 'active',
      }, { onConflict: 'id', ignoreDuplicates: true })

      sessionStorage.setItem('current_student', JSON.stringify(guestStudent))
      setStudent(guestStudent)
      setWaitingForGuestName(false)
      await loadExamData(room, guestStudent)
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải đề thi')
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async () => {
    if (!confirm('Bạn có muốn thi lại? Kết quả cũ sẽ bị xóa hoàn toàn.')) return
    try {
      await supabase.from('exam_submissions').delete().eq('id', submissionId)
      window.location.reload()
    } catch (e) {
      toast.error('Lỗi khi làm mới bài thi')
    }
  }

  // ── RENDER: Form nhập tên khách ─────────────────────────────────────────
  if (waitingForGuestName) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl shadow-teal-100 p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🌐</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800">Phòng thi công khai</h1>
            <p className="text-gray-500 text-sm mt-2">{room?.exams?.title || 'Đề thi'}</p>
            <div className="mt-3 inline-flex items-center gap-2 bg-teal-50 text-teal-700 text-xs font-bold px-3 py-1.5 rounded-full border border-teal-200">
              ⏱ Thời gian: {room?.time_limit} phút
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Họ và tên của bạn *</label>
              <input
                type="text" value={guestName}
                onChange={e => { setGuestName(e.target.value); setGuestNameError('') }}
                onKeyDown={e => e.key === 'Enter' && handleGuestStart()}
                placeholder="VD: Nguyễn Văn A" autoFocus
                className={`w-full px-4 py-3 rounded-xl border-2 text-base font-semibold outline-none transition ${guestNameError ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-teal-500'}`}
              />
              {guestNameError && <p className="text-red-500 text-xs mt-1 font-medium">{guestNameError}</p>}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">Tên của bạn sẽ được hiển thị trong bảng kết quả. Không cần tài khoản hay mã học sinh.</p>
            <button onClick={handleGuestStart} className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl text-base shadow-lg shadow-teal-500/30 transition active:scale-95">
              Bắt đầu thi →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RENDER: Kết quả TSA ─────────────────────────────────────────────────
  if (submittedResult && currentExamData?.exam_type === 'tsa') {
    return (
      <TSAResultView
        submission={submittedResult}
        room={{ ...room, examTitle: exam?.title, settings: room?.settings || { showCorrectAnswers: true, showExplanations: true } }}
        exam={{ ...currentExamData, title: exam?.title }}
        onExit={() => { sessionStorage.removeItem('current_student'); navigate('/thi') }}
      />
    )
  }

  // ── RENDER: Kết quả thường ──────────────────────────────────────────────
  if (submittedResult && currentExamData) {
    const mappedRoom = { ...room, examTitle: exam?.title, settings: room?.settings || { showCorrectAnswers: true, showExplanations: true } }
    return (
      <div className="relative">
        <ResultView
          submission={submittedResult} room={mappedRoom}
          exam={{ ...currentExamData, title: exam?.title }}
          onExit={() => { sessionStorage.removeItem('current_student'); navigate('/thi') }}
        />
        {room.settings?.allowRetry && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <button onClick={handleRetry} className="px-6 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-full font-bold shadow-xl hover:bg-blue-50 hover:scale-105 transition">
              🔄 Bắt đầu thi lại
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading || !currentExamData) {
    return <div className="min-h-screen flex items-center justify-center text-teal-600 font-bold">♻️ Đang tải dữ liệu...</div>
  }

  const normalizedStudent = {
    ...student,
    name: student?.name || student?.full_name || 'Học sinh',
    full_name: student?.full_name || student?.name || 'Học sinh',
    className: student?.className || student?.class_name || '',
  }

  // ── RENDER: Đề PDF ──────────────────────────────────────────────────────
  const isPdfExam = !!currentExamData.pdfUrl || !!currentExamData.pdfDriveUrl || !!currentExamData.pdfBase64
  if (isPdfExam) {
    return (
      <PDFExamRoom
        room={room}
        exam={{ ...currentExamData, id: exam.id, title: exam.title }}
        student={normalizedStudent}
        existingSubmissionId={submissionId}
        onSubmitted={setSubmittedResult}
        onExit={() => { sessionStorage.removeItem('current_student'); navigate('/thi') }}
      />
    )
  }

  // ── RENDER: Đề TSA ──────────────────────────────────────────────────────
  if (currentExamData.exam_type === 'tsa') {
    return (
      <TSAExamRoom
        room={room}
        exam={{ ...currentExamData, id: exam.id, title: exam.title }}
        student={normalizedStudent}
        existingSubmissionId={submissionId}
        initialAnswers={answers}
        onSubmitted={(result) => {
          // Tính điểm ngay ở client nếu chưa có
          if (result.pending_score || !result.scoreBreakdown?.sections) {
            try {
              const breakdown = scoreTSAExam(currentExamData, result.answers || {})
              // Cập nhật score vào DB bất đồng bộ
              if (result.id || submissionId) {
                supabase.from('exam_submissions').update({
                  score: breakdown.totalScore,
                  correct_count: breakdown.sections.reduce((n, s) => n + s.fullyCorrect, 0),
                  score_breakdown: { ...breakdown, shuffled_exam: currentExamData },
                }).eq('id', result.id || submissionId).then(() => {})
              }
              result = {
                ...result,
                totalScore: breakdown.totalScore,
                percentage: breakdown.percentage,
                correctCount: breakdown.sections.reduce((n, s) => n + s.fullyCorrect, 0),
                scoreBreakdown: breakdown,
              }
            } catch (e) {
              console.warn('TSA scoring error:', e)
            }
          }
          setSubmittedResult(result)
        }}
        onExit={() => { sessionStorage.removeItem('current_student'); navigate('/thi') }}
      />
    )
  }

  // ── RENDER: Đề Word / LaTeX ─────────────────────────────────────────────
  return (
    <ExamRoom
      room={room}
      exam={{ ...currentExamData, id: exam.id, title: exam.title }}
      student={normalizedStudent}
      existingSubmissionId={submissionId}
      initialAnswers={answers}
      onSubmitted={setSubmittedResult}
      onExit={() => { sessionStorage.removeItem('current_student'); navigate('/thi') }}
    />
  )
}
