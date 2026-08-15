// @ts-nocheck
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlaySquare, MonitorPlay, LogOut, ChevronRight, BookOpen, UserCircle, GraduationCap, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import StudentGradesSection from '@/components/StudentGradesSection'

export default function StudentPortal() {
  const navigate = useNavigate()
  const [student, setStudent]   = useState<any>(null)
  const [courses, setCourses]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)

  // Form đăng nhập
  const [studentCodeInput, setStudentCodeInput] = useState('')
  const [passwordInput, setPasswordInput]       = useState('')
  const [roomCodeInput, setRoomCodeInput]       = useState('')
  const [showPassword, setShowPassword]         = useState(false)
  const [isLoggingIn, setIsLoggingIn]           = useState(false)

  // Dashboard
  const [dashboardRoomCode, setDashboardRoomCode] = useState('')

  useEffect(() => {
    // ✅ Đọc ?code= từ URL để pre-fill mã phòng
    // VD: /thi?code=HSJJ3 → tự điền mã phòng
    const params = new URLSearchParams(window.location.search)
    const codeFromUrl = params.get('code')
    if (codeFromUrl) setRoomCodeInput(codeFromUrl.toUpperCase())

    const sessionStr = sessionStorage.getItem('current_student')
    if (sessionStr) {
      setStudent(JSON.parse(sessionStr))
      fetchCourses()
    } else {
      setLoading(false)
    }
  }, [])

  // ── Tải khóa học đã xuất bản, đúng lớp ─────────────────────
  const fetchCourses = async () => {
    try {
      const sessionStr = sessionStorage.getItem('current_student')
      if (!sessionStr) { setLoading(false); return }
      const studentData = JSON.parse(sessionStr)

      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', studentData.id)
        .eq('status', 'active')

      const myClassIds = enrolls?.map(e => e.class_id) || []

      const { data: allCourses, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const filteredCourses = (allCourses || []).filter(course => {
        if (!course.is_published) return false
        if (!course.assigned_class_ids || course.assigned_class_ids.length === 0) return false
        return course.assigned_class_ids.some((id: string) => myClassIds.includes(id))
      })

      setCourses(filteredCourses)
    } catch (error) {
      console.error('Lỗi tải khóa học:', error)
    } finally {
      setLoading(false)
    }
  }

  // ── Xác minh học sinh (mã + mật khẩu) ──────────────────────
  const verifyStudent = async (code: string, password: string) => {
    if (!code.trim()) { toast.error('Vui lòng nhập Mã học sinh!'); return null }
    if (!password.trim()) { toast.error('Vui lòng nhập Mật khẩu!'); return null }

    const { data, error } = await supabase
      .from('students')
      .select('*')
      .ilike('student_code', code.trim())
      .maybeSingle()

    if (error || !data) { toast.error('Sai Mã học sinh! Vui lòng kiểm tra lại.'); return null }
    if (data.status === 'inactive') { toast.error('Tài khoản học sinh này đã bị khóa hoặc nghỉ học.'); return null }
    if (!data.password) { toast.error('Tài khoản này chưa được đặt mật khẩu. Vui lòng liên hệ giáo viên.'); return null }
    if (data.password !== password.trim()) { toast.error('Sai mật khẩu! Vui lòng kiểm tra lại.'); return null }

    sessionStorage.setItem('current_student', JSON.stringify(data))
    sessionStorage.setItem('studentName', data.full_name)
    sessionStorage.setItem('student_name', data.full_name)
    return data
  }

  // ── Vào thi (từ trang login) ─────────────────────────────────
  const handleQuickJoinExam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomCodeInput.trim()) return toast.error('Vui lòng nhập Mã phòng thi!')

    setIsLoggingIn(true)
    const toastId = toast.loading('Đang tìm phòng...')

    try {
      // ✅ Check phòng TRƯỚC — nếu công khai thì bỏ qua đăng nhập
      const { data: room, error: roomErr } = await supabase
        .from('exam_rooms')
        .select('*')
        .ilike('code', roomCodeInput.trim())
        .maybeSingle()

      if (roomErr || !room) throw new Error('Mã phòng thi không tồn tại')
      if (room.status === 'closed') throw new Error('Phòng thi này đã đóng')

      // ✅ Phòng công khai → vào thẳng, không cần login
      // ExamRoomPage sẽ hiện form nhập tên khách
      if (room.settings?.publicAccess) {
        toast.success('Đang vào phòng...', { id: toastId })
        navigate(`/exam-room/${room.id}`)
        return
      }

      // Phòng thường → yêu cầu đăng nhập
      const studentData = await verifyStudent(studentCodeInput, passwordInput)
      if (!studentData) { toast.dismiss(toastId); return }

      if (room.class_id) {
        const { data: enrolled } = await supabase
          .from('enrollments')
          .select('id')
          .eq('class_id', room.class_id)
          .eq('student_id', studentData.id)
          .eq('status', 'active')
          .maybeSingle()

        if (!enrolled) throw new Error('Bạn không có tên trong danh sách lớp của phòng thi này')
      }

      toast.success('Đang vào phòng...', { id: toastId })
      navigate(`/exam-room/${room.id}`, { state: { studentName: studentData.full_name } })
    } catch (err: any) {
      toast.error(err.message, { id: toastId })
    } finally {
      setIsLoggingIn(false)
    }
  }

  // ── Vào Dashboard xem khóa học ───────────────────────────────
  const handleGoToDashboard = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoggingIn(true)
    try {
      const studentData = await verifyStudent(studentCodeInput, passwordInput)
      if (!studentData) return
      setStudent(studentData)
      toast.success(`Xin chào, ${studentData.full_name}!`)
      fetchCourses()
    } catch {
      toast.error('Lỗi kết nối máy chủ!')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // ── Vào phòng thi từ Dashboard ───────────────────────────────
  const handleDashboardJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dashboardRoomCode.trim()) return toast.error('Vui lòng nhập mã phòng!')

    const toastId = toast.loading('Đang tìm phòng thi...')
    try {
      const { data: room, error: roomErr } = await supabase
        .from('exam_rooms')
        .select('*')
        .ilike('code', dashboardRoomCode.trim())
        .maybeSingle()

      if (roomErr || !room) throw new Error('Không tìm thấy phòng thi này!')
      if (room.status === 'closed') throw new Error('Phòng thi đã đóng!')

      // Phòng công khai → vào thẳng (đã có session học sinh thật)
      if (!room.settings?.publicAccess && room.class_id) {
        const { data: enrolled } = await supabase
          .from('enrollments')
          .select('id')
          .eq('class_id', room.class_id)
          .eq('student_id', student.id)
          .eq('status', 'active')
          .maybeSingle()

        if (!enrolled) throw new Error('Bạn không có tên trong danh sách lớp của phòng thi này')
      }

      toast.success('Đang vào phòng...', { id: toastId })
      navigate(`/exam-room/${room.id}`, { state: { studentName: student.full_name } })
    } catch (err: any) {
      toast.error(err.message, { id: toastId })
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('current_student')
    sessionStorage.removeItem('studentName')
    sessionStorage.removeItem('student_name')
    setStudent(null)
    setStudentCodeInput('')
    setPasswordInput('')
    setRoomCodeInput('')
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 font-bold text-teal-700">Đang tải dữ liệu...</p>
      </div>
    )
  }

  // ── GIAO DIỆN ĐĂNG NHẬP ─────────────────────────────────────
  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

          {/* Header */}
          <div className="bg-teal-50 p-6 text-center border-b border-teal-100">
            <div className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-teal-800">Cổng Học Sinh</h1>
            <p className="text-teal-600 text-sm mt-1">Hệ thống giáo dục EduCenter</p>
          </div>

          <form className="p-6 space-y-4">

            {/* Mã phòng thi — đặt lên đầu để nổi bật */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Mã phòng thi{' '}
                <span className="text-gray-400 font-normal text-xs">(Bắt buộc nếu vào thi)</span>
              </label>
              <input
                type="text"
                value={roomCodeInput}
                onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="VD: HSJJ3"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/20 transition-all font-mono font-bold text-lg text-center uppercase tracking-widest"
              />
              {/* ✅ Gợi ý cho phòng công khai */}
              {roomCodeInput.length >= 4 && (
                <p className="text-xs text-gray-400 mt-1 text-center">
                  💡 Nếu đây là phòng công khai, bạn không cần nhập mã học sinh
                </p>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 text-center">THÔNG TIN HỌC SINH (nếu phòng có yêu cầu)</p>

              {/* Mã học sinh */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Mã học sinh</label>
                <input
                  type="text"
                  value={studentCodeInput}
                  onChange={e => setStudentCodeInput(e.target.value.toUpperCase())}
                  placeholder="VD: HS001"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all font-mono font-bold text-lg text-center uppercase tracking-widest"
                />
              </div>

              {/* Mật khẩu */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-teal-500" /> Mật khẩu
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all font-bold text-lg text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-teal-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Cảnh báo giám sát */}
            <div className="bg-amber-50 text-amber-700 p-3 rounded-lg flex gap-2 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>Hệ thống có giám sát chuyển tab. Vui lòng tập trung làm bài.</p>
            </div>

            {/* Nút hành động */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleGoToDashboard}
                disabled={isLoggingIn}
                className="flex-1 py-3.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-xl transition-all border-2 border-teal-100 hover:border-teal-200 disabled:opacity-50"
              >
                📚 KHÓA HỌC
              </button>
              <button
                type="submit"
                onClick={handleQuickJoinExam}
                disabled={isLoggingIn}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center shadow-lg shadow-teal-500/30 disabled:opacity-50"
              >
                {isLoggingIn ? 'ĐANG VÀO...' : 'VÀO THI ⚡'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ── DASHBOARD (đã đăng nhập) ─────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-teal-700">
            <BookOpen className="w-8 h-8" />
            <div>
              <h1 className="font-extrabold text-lg leading-tight">EduCenter</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-500">Cổng Học Sinh</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-teal-50 px-3 py-1.5 rounded-full border border-teal-100">
              <UserCircle className="w-5 h-5 text-teal-600" />
              <span className="text-sm font-bold text-teal-800">{student.full_name || student.name}</span>
            </div>
            <button onClick={handleLogout} className="text-sm font-bold text-gray-500 hover:text-red-600 flex items-center gap-1 transition">
              <LogOut className="w-4 h-4" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 space-y-10">
        {/* Vào phòng thi từ Dashboard */}
        <section className="bg-gradient-to-br from-teal-500 to-teal-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10 transform translate-x-8 -translate-y-8">
            <MonitorPlay className="w-64 h-64" />
          </div>
          <div className="relative z-10 max-w-lg">
            <h2 className="text-3xl font-black mb-2">Tham gia thi trực tuyến</h2>
            <p className="text-teal-100 mb-6">Nhập mã phòng do giáo viên cung cấp để bắt đầu làm bài kiểm tra.</p>
            <form onSubmit={handleDashboardJoinRoom} className="flex gap-2">
              <input
                type="text"
                value={dashboardRoomCode}
                onChange={e => setDashboardRoomCode(e.target.value.toUpperCase())}
                placeholder="NHẬP MÃ PHÒNG (VD: HSJJ3)"
                className="flex-1 px-6 py-4 rounded-xl text-gray-800 font-black text-lg outline-none uppercase tracking-widest border-4 border-transparent focus:border-teal-300 shadow-lg placeholder:font-medium placeholder:tracking-normal"
              />
              <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-black px-8 py-4 rounded-xl shadow-lg transition-transform active:scale-95">
                VÀO THI
              </button>
            </form>
          </div>
        </section>

        {/* Điểm kiểm tra — ẩn khi em chưa có điểm nào */}
        <StudentGradesSection studentId={student.id} hideWhenEmpty />

        {/* Khóa học của tôi */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <PlaySquare className="w-6 h-6 text-teal-600" />
            <h2 className="text-2xl font-black text-gray-800">Khóa học & Bài giảng</h2>
          </div>
          {courses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-gray-200">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-600">Chưa có khóa học nào</h3>
              <p className="text-gray-400 mt-1">Hiện tại bạn chưa được giao khóa học nào hoặc khóa học chưa được xuất bản.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(course => (
                <div
                  key={course.id}
                  onClick={() => navigate(`/course-viewer/${course.id}/${student.id}`)}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col h-full"
                >
                  <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <PlaySquare className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 mb-2 line-clamp-2">{course.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">{course.description || 'Chưa có mô tả'}</p>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-teal-600 font-bold text-sm group-hover:text-teal-700">
                    <span>Vào học ngay</span>
                    <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
