// @ts-nocheck
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GraduationCap, Lock, Eye, EyeOff, AlertCircle, LogOut, Camera, BookOpen,
  PlaySquare, ChevronRight, CheckCircle2, Clock, Play, Award, Sparkles, Key, AlertTriangle, Zap
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import Modal from '@/components/Modal'

export default function StudentPortal() {
  const navigate = useNavigate()
  const [student, setStudent]       = useState<any>(null)
  const [courses, setCourses]       = useState<any[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [examRooms, setExamRooms]   = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  // Form đăng nhập
  const [studentCodeInput, setStudentCodeInput] = useState('')
  const [passwordInput, setPasswordInput]       = useState('')
  const [showPassword, setShowPassword]         = useState(false)
  const [isLoggingIn, setIsLoggingIn]           = useState(false)

  // Modals đổi mật khẩu & đổi ảnh
  const [modal, setModal]             = useState<'password' | 'avatar' | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [avatarUrlInput, setAvatarUrlInput]   = useState('')
  const [savingModal, setSavingModal] = useState(false)

  useEffect(() => {
    const sessionStr = sessionStorage.getItem('current_student')
    if (sessionStr) {
      try {
        const studentData = JSON.parse(sessionStr)
        setStudent(studentData)
        setAvatarUrlInput(studentData.avatar_url || '')
        loadStudentData(studentData.id)
      } catch {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  // Tải dữ liệu kết quả thi & phòng thi
  const loadStudentData = async (studentId: string) => {
    setLoading(true)
    try {
      // 1. Tải enrollments của học sinh để lấy danh sách class_id
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', studentId)
        .eq('status', 'active')

      const myClassIds = enrolls?.map(e => e.class_id).filter(Boolean) || []

      // 2. Tải bài nộp (submissions) của học sinh
      const { data: subData } = await supabase
        .from('exam_submissions')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

      setSubmissions(subData || [])

      // 3. Tải các phòng thi liên quan
      let roomQuery = supabase
        .from('exam_rooms')
        .select('*, exams(id, title, duration), classes(id, class_name)')
        .order('created_at', { ascending: false })

      if (myClassIds.length > 0) {
        roomQuery = roomQuery.or(`class_id.in.(${myClassIds.join(',')}),class_id.is.null`)
      }

      const { data: rooms, error: roomsErr } = await roomQuery
      if (roomsErr || !rooms || rooms.length === 0) {
        const { data: allRooms } = await supabase
          .from('exam_rooms')
          .select('*, exams(id, title, duration), classes(id, class_name)')
          .order('created_at', { ascending: false })
        setExamRooms(allRooms || [])
      } else {
        setExamRooms(rooms)
      }

      // 4. Tải khóa học
      const { data: allCourses } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false })

      const filteredCourses = (allCourses || []).filter(course => {
        if (!course.is_published) return false
        if (!course.assigned_class_ids || course.assigned_class_ids.length === 0) return false
        return course.assigned_class_ids.some((id: string) => myClassIds.includes(id))
      })

      setCourses(filteredCourses)
    } catch (err) {
      console.error('Lỗi tải dữ liệu học sinh:', err)
    } font-sans finally {
      setLoading(false)
    }
  }

  // Xác minh đăng nhập học sinh
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentCodeInput.trim()) return toast.error('Vui lòng nhập Mã học sinh!')
    if (!passwordInput.trim()) return toast.error('Vui lòng nhập Mật khẩu!')

    setIsLoggingIn(true)
    const toastId = toast.loading('Đang đăng nhập...')

    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .ilike('student_code', studentCodeInput.trim())
        .maybeSingle()

      if (error) {
        console.error('Lỗi khi tìm mã học sinh:', error)
        throw new Error('Lỗi kết nối hoặc phân quyền dữ liệu. Vui lòng thử lại!')
      }
      if (!data) throw new Error('Sai Mã học sinh! Vui lòng kiểm tra lại.')
      if (data.status === 'inactive') throw new Error('Tài khoản học sinh này đã bị khóa hoặc nghỉ học.')
      if (!data.password) throw new Error('Tài khoản chưa cài mật khẩu. Vui lòng liên hệ giáo viên.')
      if (data.password !== passwordInput.trim()) throw new Error('Sai mật khẩu! Vui lòng thử lại.')

      sessionStorage.setItem('current_student', JSON.stringify(data))
      sessionStorage.setItem('studentName', data.full_name)
      sessionStorage.setItem('student_name', data.full_name)

      setStudent(data)
      setAvatarUrlInput(data.avatar_url || '')
      toast.success(`Đăng nhập thành công! Xin chào ${data.full_name}`, { id: toastId })
      loadStudentData(data.id)
    } catch (err: any) {
      toast.error(err.message || 'Lỗi đăng nhập!', { id: toastId })
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('current_student')
    sessionStorage.removeItem('studentName')
    sessionStorage.removeItem('student_name')
    setStudent(null)
    setStudentCodeInput('')
    setPasswordInput('')
    setSubmissions([])
    setExamRooms([])
  }

  // Đổi mật khẩu
  const handleChangePassword = async () => {
    if (!newPassword.trim()) return toast.error('Nhập mật khẩu mới')
    if (newPassword !== confirmPassword) return toast.error('Mật khẩu xác nhận không khớp')
    setSavingModal(true)
    try {
      const { error } = await supabase
        .from('students')
        .update({ password: newPassword.trim() })
        .eq('id', student.id)

      if (error) throw error
      toast.success('Đã đổi mật khẩu thành công!')
      setStudent(prev => ({ ...prev, password: newPassword.trim() }))
      sessionStorage.setItem('current_student', JSON.stringify({ ...student, password: newPassword.trim() }))
      setModal(null)
      setNewPassword('')
      setConfirmPassword('')
    } catch (e: any) {
      toast.error(e.message || 'Không đổi được mật khẩu')
    } finally {
      setSavingModal(false)
    }
  }

  // Đổi ảnh đại diện
  const handleChangeAvatar = async () => {
    setSavingModal(true)
    try {
      const { error } = await supabase
        .from('students')
        .update({ avatar_url: avatarUrlInput.trim() })
        .eq('id', student.id)

      if (error) throw error
      toast.success('Đã cập nhật ảnh đại diện!')
      setStudent(prev => ({ ...prev, avatar_url: avatarUrlInput.trim() }))
      sessionStorage.setItem('current_student', JSON.stringify({ ...student, avatar_url: avatarUrlInput.trim() }))
      setModal(null)
    } catch (e: any) {
      toast.error(e.message || 'Lỗi cập nhật ảnh')
    } finally {
      setSavingModal(false)
    }
  }

  // Tính toán số bài đã làm & Điểm TB
  const completedExamsCount = useMemo(() => submissions.length, [submissions])

  const avgScoreDisplay = useMemo(() => {
    if (submissions.length === 0) return 'N/A'
    const scores = submissions.map(s => {
      if (s.score !== undefined && s.score !== null) return Number(s.score)
      if (s.total_score !== undefined && s.total_score !== null) return Number(s.total_score)
      return null
    }).filter(s => s !== null) as number[]

    if (scores.length === 0) return 'N/A'
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return `${avg.toFixed(1)}/10`
  }, [submissions])

  // Danh sách các buổi học & Đề thi tương ứng
  const sessionList = useMemo(() => {
    const foundSessionNums = new Set<number>()
    const matchedRoomIds = new Set<string>()

    examRooms.forEach(r => {
      const roomTitle = r.exams?.title || r.name || r.code || ''
      const match = roomTitle.match(/buổi\s*(\d+)/i)
      if (match) {
        foundSessionNums.add(parseInt(match[1], 10))
      }
    })

    const sessionNums = Array.from(
      new Set([...Array.from(foundSessionNums), 5, 4, 3, 2, 1])
    ).sort((a, b) => b - a)

    const sessions = sessionNums.map(sessionNum => {
      const de1Room = examRooms.find(r => {
        const title = (r.exams?.title || r.name || r.code || '').toLowerCase()
        return title.includes(`buổi ${sessionNum}`) && (title.includes('đề 1') || title.includes('đề 01'))
      })
      const de2Room = examRooms.find(r => {
        const title = (r.exams?.title || r.name || r.code || '').toLowerCase()
        return title.includes(`buổi ${sessionNum}`) && (title.includes('đề 2') || title.includes('đề 02'))
      })

      if (de1Room) matchedRoomIds.add(de1Room.id)
      if (de2Room) matchedRoomIds.add(de2Room.id)

      const de1Sub = submissions.find(s => de1Room && s.room_id === de1Room.id)
      const de2Sub = submissions.find(s => de2Room && s.room_id === de2Room.id)

      return {
        sessionNum,
        name: `Buổi ${sessionNum}`,
        exams: [
          {
            codeName: 'Đề 2',
            room: de2Room,
            submission: de2Sub,
            score: de2Sub ? (de2Sub.score ?? de2Sub.total_score ?? '—') : '—',
            statusText: de2Sub ? `${de2Sub.score ?? de2Sub.total_score}đ` : de2Room ? 'Chưa thi' : '—'
          },
          {
            codeName: 'Đề 1',
            room: de1Room,
            submission: de1Sub,
            score: de1Sub ? (de1Sub.score ?? de1Sub.total_score ?? '—') : (de1Room ? 'Chưa thi' : '—'),
            statusText: de1Sub ? `${de1Sub.score ?? de1Sub.total_score}đ` : de1Room ? 'Chưa thi' : '—'
          }
        ]
      }
    })

    // Gom các phòng thi còn lại (không đặt tên Buổi X)
    const otherRooms = examRooms.filter(r => !matchedRoomIds.has(r.id))
    if (otherRooms.length > 0) {
      sessions.unshift({
        sessionNum: 999,
        name: 'Đề thi khác',
        exams: otherRooms.map(r => {
          const sub = submissions.find(s => s.room_id === r.id)
          return {
            codeName: r.exams?.title || r.name || `Phòng ${r.code}`,
            room: r,
            submission: sub,
            score: sub ? (sub.score ?? sub.total_score ?? '—') : (r.status === 'closed' ? '—' : 'Chưa thi'),
            statusText: sub ? 'Đã hoàn thành' : r.status === 'closed' ? 'Đã đóng' : 'Chưa thi'
          }
        })
      })
    }

    return sessions
  }, [examRooms, submissions])

  // Đếm số bài tập chưa làm
  const uncompletedExamsCount = useMemo(() => {
    let count = 0
    examRooms.forEach(room => {
      if (room.status !== 'closed') {
        const sub = submissions.find(s => s.room_id === room.id)
        if (!sub) count++
      }
    })
    return count
  }, [examRooms, submissions])

  // ── 1. GIAO DIỆN ĐĂNG NHẬP (Chưa Đăng Nhập) ─────────────────────────
  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-200 via-teal-100 to-emerald-300 flex flex-col items-center justify-center p-4 py-10 font-sans">
        <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden border border-teal-100/50 transform transition-all">
          <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-8 text-center text-white relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-inner border border-white/30">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-wide text-white drop-shadow-sm">
              LỚP TOÁN THẦY LĨNH
            </h1>
            <h2 className="text-lg font-bold text-white/95 mt-1">
              Bài Tập Về Nhà
            </h2>
            <p className="text-xs text-white/80 italic mt-2.5 max-w-xs mx-auto leading-relaxed">
              Sau mỗi buổi học thầy sẽ giao 2 đề thi, các học trò cố gắng làm hết 2 đề thi này
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-6 sm:p-8 space-y-5 bg-white">
            <h3 className="text-center font-extrabold text-gray-800 text-xl tracking-wider uppercase mb-2">
              ĐĂNG NHẬP CỔNG THI
            </h3>

            <div>
              <label className="block text-xs font-bold text-teal-800 mb-1.5 uppercase tracking-wide">
                MÃ HỌC SINH *
              </label>
              <input
                type="text"
                value={studentCodeInput}
                onChange={e => setStudentCodeInput(e.target.value.toUpperCase())}
                placeholder="VD: HS001"
                className="w-full px-4 py-3 bg-gray-50/80 border-2 border-teal-100 rounded-2xl text-center font-mono font-bold text-base text-gray-800 uppercase tracking-widest focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-gray-300 placeholder:font-normal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-teal-800 mb-1.5 uppercase tracking-wide">
                MẬT KHẨU *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full px-4 py-3 pr-12 bg-gray-50/80 border-2 border-teal-100 rounded-2xl text-center font-bold text-base text-gray-800 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 transition-all placeholder:text-gray-300 placeholder:font-normal"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-500 hover:text-teal-700 transition-colors p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3 text-amber-900 text-xs font-medium leading-snug">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>Hệ thống có giám sát chuyển tab. Vui lòng tập trung làm bài thi.</span>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold py-4 rounded-2xl text-base shadow-lg shadow-teal-600/30 hover:shadow-teal-600/50 transition-all active:scale-[0.99] disabled:opacity-60 uppercase tracking-wide"
            >
              {isLoggingIn ? 'ĐANG KẾT NỐI...' : 'VÀO HỆ THỐNG'}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-teal-900 font-semibold opacity-80 tracking-wide">
          © LỚP TOÁN THẦY LĨNH – CỔNG THI HỌC SINH
        </p>
      </div>
    )
  }

  // ── 2. GIAO DIỆN BẢNG ĐIỀU KHIỂN HỌC SINH (Đã Đăng Nhập) ────────────
  return (
    <div className="min-h-screen bg-emerald-50/20 flex flex-col font-sans pb-12">
      
      {/* Top Header Navbar */}
      <header className="bg-white border-b border-teal-100 sticky top-0 z-20 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          
          {/* Logo & Brand Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-extrabold text-teal-700 text-xl tracking-tight leading-none uppercase">
                LỚP TOÁN THẦY LĨNH
              </h1>
              <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mt-1">
                CỔNG THI HỌC SINH
              </p>
            </div>
          </div>

          {/* Profile Badge & Navigation Control Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            
            {/* Student Info Pill */}
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200/80 rounded-full px-3 py-1 shadow-xs">
              <div className="relative w-8 h-8 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs overflow-hidden">
                {student.avatar_url ? (
                  <img src={student.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="uppercase">{student.full_name?.charAt(0) || 'L'}</span>
                )}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-teal-500 rounded-full border border-white flex items-center justify-center text-[7px] text-white">
                  📷
                </div>
              </div>
              <div className="flex items-center gap-1.5 font-bold text-sm text-gray-800">
                <span>{student.full_name || 'Học sinh'}</span>
                <span className="bg-teal-100 text-teal-800 text-[10px] font-mono px-2 py-0.5 rounded-md font-bold uppercase">
                  {student.student_code}
                </span>
              </div>
            </div>

            {/* Header Action Buttons exact design from screenshot */}
            <button
              onClick={() => setModal('avatar')}
              className="inline-flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 rounded-xl border border-teal-300 text-teal-700 bg-white hover:bg-teal-50 shadow-2xs transition-colors"
            >
              <Camera className="w-4 h-4 text-teal-600" /> Đổi ảnh
            </button>

            <button
              onClick={() => setModal('password')}
              className="inline-flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 rounded-xl border border-teal-300 text-teal-700 bg-white hover:bg-teal-50 shadow-2xs transition-colors"
            >
              <Lock className="w-4 h-4 text-teal-600" /> Đổi mật khẩu
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-bold py-2 px-3.5 rounded-xl border border-rose-200 text-rose-600 bg-rose-50/60 hover:bg-rose-100/80 transition-colors"
            >
              <LogOut className="w-4 h-4 text-rose-500" /> Đăng xuất
            </button>

          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        
        {/* Banner 1: CẢNH BÁO HOÀN THÀNH BÀI TẬP (Giống hệt ảnh đính kèm) */}
        <div className="bg-rose-50/90 border border-rose-200/90 rounded-2xl p-5 shadow-xs flex items-center gap-4 text-rose-900">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-600/20">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-rose-900 flex items-center gap-2 tracking-wide">
              <span>⚠️ CẢNH BÁO HOÀN THÀNH BÀI TẬP</span>
            </h3>
            <p className="text-sm font-medium mt-1 text-rose-800">
              Em còn <strong className="text-rose-700 font-black text-lg px-1">{uncompletedExamsCount > 0 ? uncompletedExamsCount : 1}</strong> bài tập chưa làm. Vui lòng hoàn thành hết bài tập về nhà!
            </p>
          </div>
        </div>

        {/* Banner 2: Lưu ý quan trọng (Giống hệt ảnh đính kèm) */}
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4.5 shadow-xs flex items-start gap-3 text-amber-900 text-xs sm:text-sm font-medium leading-relaxed">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-900 font-bold">Lưu ý quan trọng:</strong> Hệ thống có tính năng giám sát chuyển tab/thoát màn hình khi đang làm bài. Các em hãy tập trung và không chuyển tab khi đang làm bài thi để tránh bị nhắc nhở hoặc khóa bài tự động.
          </div>
        </div>

        {/* Section Báo Cáo Tiến Độ & Kết Quả Học Tập */}
        <div className="bg-white rounded-3xl border border-teal-100 shadow-sm p-6 sm:p-8 space-y-6">
          
          {/* Header Báo Cáo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2 tracking-tight">
                📊 Báo Cáo Tiến Độ & Kết Quả Học Tập
              </h2>
              <p className="text-xs text-gray-500 mt-1 font-medium">
                Bảng theo dõi buổi học và biểu đồ kết quả điểm số, thời gian làm bài của học sinh.
              </p>
            </div>

            {/* Badges: Bài đã làm & Điểm TB */}
            <div className="flex items-center gap-3">
              <span className="bg-teal-50 text-teal-800 border border-teal-200/70 text-xs font-bold px-4 py-2 rounded-full shadow-2xs">
                Bài đã làm: <strong className="text-teal-700 text-sm ml-1">{completedExamsCount}</strong>
              </span>

              <span className="bg-amber-50 text-amber-800 border border-amber-200/70 text-xs font-bold px-4 py-2 rounded-full shadow-2xs">
                Điểm TB: <strong className="text-amber-700 text-sm ml-1">{avgScoreDisplay}</strong>
              </span>
            </div>
          </div>

          {/* Subtitle BẢNG TỔNG HỢP KẾT QUẢ CHI TIẾT */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
              📋 BẢNG TỔNG HỢP KẾT QUẢ CHI TIẾT
            </h3>

            {/* Main Table Styled Exactly as Requested */}
            <div className="overflow-hidden border border-teal-100 rounded-2xl shadow-2xs">
              <table className="w-full text-sm text-center">
                <thead>
                  <tr className="bg-teal-700 text-white font-black text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 border-r border-teal-600/40 w-1/5 text-center">
                      Buổi học
                    </th>
                    <th className="px-6 py-4 border-r border-teal-600/40 w-1/5 text-center">
                      Mã đề
                    </th>
                    <th className="px-6 py-4 border-r border-teal-600/40 w-1/5 text-center">
                      Điểm số
                    </th>
                    <th className="px-6 py-4 text-center">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sessionList.map((session) => (
                    session.exams.map((examItem, idx) => {
                      const isClickable = examItem.room && examItem.room.status !== 'closed'
                      
                      return (
                        <tr key={`${session.name}-${examItem.codeName}`} className="hover:bg-teal-50/20 transition-colors">
                          {/* Col 1: Buổi học (Rowspan) */}
                          {idx === 0 && (
                            <td
                              rowSpan={session.exams.length}
                              className="px-6 py-5 font-black text-gray-900 text-base bg-gray-50/40 border-r border-gray-100 border-b border-gray-100 align-middle text-center"
                            >
                              {session.name}
                            </td>
                          )}

                          {/* Col 2: Mã đề */}
                          <td className="px-6 py-4 font-bold text-gray-700 text-sm border-r border-gray-100">
                            {examItem.codeName}
                          </td>

                          {/* Col 3: Điểm số */}
                          <td className="px-6 py-4 font-bold text-gray-600 text-sm border-r border-gray-100">
                            {examItem.score}
                          </td>

                          {/* Col 4: Trạng thái & Nút VÀO THI ⚡ */}
                          <td className="px-6 py-4 text-center">
                            {examItem.submission ? (
                              <button
                                onClick={() => navigate(`/exam-room/${examItem.room.id}`)}
                                className="bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 py-1.5 px-4 rounded-xl text-xs font-extrabold transition-all"
                              >
                                Xem lại bài ({examItem.submission.score ?? examItem.submission.total_score}đ)
                              </button>
                            ) : examItem.room ? (
                              <button
                                onClick={() => navigate(`/exam-room/${examItem.room.id}`)}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-2 px-5 rounded-xl text-xs shadow-sm hover:shadow transition-all transform active:scale-95 inline-flex items-center gap-1.5"
                              >
                                <span>Vào thi</span>
                                <Zap className="w-3.5 h-3.5 fill-current text-amber-300" />
                              </button>
                            ) : (
                              <span className="text-gray-400 font-medium">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </main>

      {/* ── MODAL: Đổi mật khẩu ─────────────────────────────────────── */}
      <Modal open={modal === 'password'} onClose={() => setModal(null)} title="Đổi mật khẩu tài khoản" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Mật khẩu mới *</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới"
              className="input"
            />
          </div>
          <div>
            <label className="label">Xác nhận mật khẩu *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setModal(null)} className="btn-outline text-xs px-4 py-2">Hủy</button>
            <button onClick={handleChangePassword} disabled={savingModal} className="btn-teal text-xs px-5 py-2">
              {savingModal ? 'Đang lưu...' : 'Lưu mật khẩu'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL: Đổi ảnh đại diện ─────────────────────────────────── */}
      <Modal open={modal === 'avatar'} onClose={() => setModal(null)} title="Đổi ảnh đại diện" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Đường dẫn ảnh (URL) *</label>
            <input
              type="url"
              value={avatarUrlInput}
              onChange={e => setAvatarUrlInput(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="input text-xs"
            />
          </div>
          {avatarUrlInput && (
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-2">Xem trước:</p>
              <img src={avatarUrlInput} alt="Preview" className="w-16 h-16 rounded-full mx-auto object-cover border-2 border-teal-400 shadow" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setModal(null)} className="btn-outline text-xs px-4 py-2">Hủy</button>
            <button onClick={handleChangeAvatar} disabled={savingModal} className="btn-teal text-xs px-5 py-2">
              {savingModal ? 'Đang lưu...' : 'Cập nhật ảnh'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
