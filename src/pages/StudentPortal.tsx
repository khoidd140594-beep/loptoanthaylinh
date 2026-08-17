// @ts-nocheck
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GraduationCap, Lock, Eye, EyeOff, AlertCircle, LogOut, Camera, BookOpen,
  PlaySquare, ChevronRight, CheckCircle2, Clock, Play, Award, Sparkles, Key
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

  // Form nhập mã phòng thi
  const [inputRoomCode, setInputRoomCode] = useState('')
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)

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

      // 3. Tải các phòng thi liên quan (theo lớp + phòng mở công khai + tất cả phòng thi)
      let roomQuery = supabase
        .from('exam_rooms')
        .select('*, exams(id, title, duration), classes(id, class_name)')
        .order('created_at', { ascending: false })

      if (myClassIds.length > 0) {
        roomQuery = roomQuery.or(`class_id.in.(${myClassIds.join(',')}),class_id.is.null`)
      }

      const { data: rooms, error: roomsErr } = await roomQuery
      if (roomsErr || !rooms || rooms.length === 0) {
        // Fallback: Tải tất cả các phòng thi để đảm bảo học sinh không bị bỏ sót bài giao
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
    } finally {
      setLoading(false)
    }
  }

  // Vào phòng thi theo Mã phòng (Code)
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = inputRoomCode.trim().toUpperCase()
    if (!code) return toast.error('Vui lòng nhập Mã phòng thi!')

    setIsJoiningRoom(true)
    try {
      const { data: room, error } = await supabase
        .from('exam_rooms')
        .select('id, status')
        .ilike('code', code)
        .maybeSingle()

      if (error || !room) {
        return toast.error(`Không tìm thấy phòng thi với mã "${code}"!`)
      }

      if (room.status === 'closed') {
        return toast.error('Phòng thi này đã đóng!')
      }

      toast.success('Đang chuyển tới phòng thi...')
      navigate(`/exam-room/${room.id}`)
    } catch (err) {
      toast.error('Không thể truy cập phòng thi!')
    } finally {
      setIsJoiningRoom(false)
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

  // Danh sách các buổi học (Tự động quét số buổi từ các phòng thi, VD: Buổi 14, Buổi 5...)
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
      new Set([...Array.from(foundSessionNums), 4, 3, 2, 1])
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
            codeName: 'Đề 1',
            room: de1Room,
            submission: de1Sub,
            score: de1Sub ? (de1Sub.score ?? de1Sub.total_score ?? '—') : '—',
            status: de1Sub ? 'Đã hoàn thành' : de1Room ? 'Có thể vào thi' : '—'
          },
          {
            codeName: 'Đề 2',
            room: de2Room,
            submission: de2Sub,
            score: de2Sub ? (de2Sub.score ?? de2Sub.total_score ?? '—') : '—',
            status: de2Sub ? 'Đã hoàn thành' : de2Room ? 'Có thể vào thi' : '—'
          }
        ]
      }
    })

    // Gom các phòng thi còn lại (không đặt tên Buổi X) vào mục Đề thi giao trực tiếp
    const otherRooms = examRooms.filter(r => !matchedRoomIds.has(r.id))
    if (otherRooms.length > 0) {
      sessions.unshift({
        sessionNum: 999,
        name: 'Bài thi giao trực tiếp',
        exams: otherRooms.map(r => {
          const sub = submissions.find(s => s.room_id === r.id)
          return {
            codeName: r.exams?.title || r.name || `Mã: ${r.code}`,
            room: r,
            submission: sub,
            score: sub ? (sub.score ?? sub.total_score ?? '—') : '—',
            status: sub ? 'Đã hoàn thành' : r.status === 'closed' ? 'Đã đóng' : 'Có thể vào thi'
          }
        })
      })
    }

    return sessions
  }, [examRooms, submissions])

  // ── 1. GIAO DIỆN ĐĂNG NHẬP (Chưa Đăng Nhập) ─────────────────────────
  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-200 via-teal-100 to-emerald-300 flex flex-col items-center justify-center p-4 py-10 font-sans">
        
        {/* Main Login Card */}
        <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden border border-teal-100/50 transform transition-all">
          
          {/* Top Banner Header */}
          <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-8 text-center text-white relative overflow-hidden">
            {/* Background Decorative Circles */}
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-400/20 rounded-full blur-lg pointer-events-none" />

            {/* Icon Cap */}
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-inner border border-white/30">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>

            {/* Titles */}
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

          {/* Form Content */}
          <form onSubmit={handleLogin} className="p-6 sm:p-8 space-y-5 bg-white">
            <h3 className="text-center font-extrabold text-gray-800 text-xl tracking-wider uppercase mb-2">
              ĐĂNG NHẬP CỔNG THI
            </h3>

            {/* Mã học sinh */}
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

            {/* Mật khẩu */}
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

            {/* Cảnh báo giám sát */}
            <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-3 text-amber-900 text-xs font-medium leading-snug">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>Hệ thống có giám sát chuyển tab. Vui lòng tập trung làm bài thi.</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold py-4 rounded-2xl text-base shadow-lg shadow-teal-600/30 hover:shadow-teal-600/50 transition-all active:scale-[0.99] disabled:opacity-60 uppercase tracking-wide"
            >
              {isLoggingIn ? 'ĐANG KẾT NỐI...' : 'VÀO HỆ THỐNG'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-teal-900 font-semibold opacity-80 tracking-wide">
          © 2025 LỚP TOÁN THẦY LĨNH – Powered by React + Supabase
        </p>
      </div>
    )
  }

  // ── 2. GIAO DIỆN BẢNG ĐIỀU KHIỂN (Đã Đăng Nhập) ─────────────────────
  return (
    <div className="min-h-screen bg-gray-50/70 flex flex-col font-sans">
      
      {/* Navbar Header */}
      <header className="bg-white shadow-sm border-b border-teal-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          
          {/* Logo & Center Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-gray-900 text-lg leading-tight tracking-tight">
                LỚP TOÁN THẦY LĨNH
              </h1>
              <p className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">
                CỔNG THI HỌC SINH
              </p>
            </div>
          </div>

          {/* Student Profile & Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {/* Student Info Tag */}
            <div className="flex items-center gap-2.5 bg-teal-50/80 border border-teal-100 rounded-full px-3.5 py-1.5 shadow-sm">
              <div className="relative w-8 h-8 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-xs overflow-hidden border border-teal-200">
                {student.avatar_url ? (
                  <img src={student.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="uppercase">{student.full_name?.charAt(0) || 'HS'}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-gray-800">
                  {student.full_name}
                </span>
                <span className="bg-teal-100 text-teal-800 font-mono text-[11px] font-bold px-2 py-0.5 rounded-full uppercase border border-teal-200">
                  {student.student_code}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <button
              onClick={() => setModal('avatar')}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold py-1.5 px-3 rounded-full border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" /> Đổi ảnh
            </button>

            <button
              onClick={() => setModal('password')}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold py-1.5 px-3 rounded-full border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" /> Đổi mật khẩu
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-bold py-1.5 px-3.5 rounded-full border border-red-200 text-red-500 bg-red-50/30 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6">
        
        {/* Warning Notice Box */}
        <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-900 text-xs sm:text-sm font-medium leading-relaxed shadow-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-800 font-bold">Lưu ý quan trọng:</strong> Hệ thống có tính năng giám sát chuyển tab/thoát màn hình khi đang làm bài. Các em hãy tập trung và không chuyển tab khi đang làm bài thi để tránh bị nhắc nhở hoặc khóa bài tự động.
          </div>
        </div>

        {/* Direct Exam Entry Card (Vào thi trực tiếp không cần mã phòng) */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-700 rounded-3xl p-5 sm:p-6 text-white shadow-xl space-y-4 border border-teal-500/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-teal-600/50">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-amber-400 text-gray-900 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" /> THI TRỰC TIẾP KHÔNG CẦN MÃ PHÒNG
              </div>
              <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2 text-white drop-shadow">
                <Play className="w-6 h-6 text-amber-300 fill-current" /> VÀO LÀM BÀI THI NGAY
              </h2>
              <p className="text-xs text-teal-100 mt-1">
                Bấm nút <strong className="text-amber-300 font-extrabold">"Vào làm bài"</strong> ở các phòng thi bên dưới để tham gia thi ngay lập tức mà không cần gõ mã phòng.
              </p>
            </div>

            {/* Form nhập mã phòng dự phòng */}
            <form onSubmit={handleJoinByCode} className="flex items-center gap-2 bg-teal-900/50 p-2 rounded-2xl border border-teal-500/40">
              <input
                type="text"
                value={inputRoomCode}
                onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                placeholder="Mã phòng (VD: 80RQF)"
                maxLength={10}
                className="px-3 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white font-mono font-bold text-center uppercase tracking-wider placeholder:text-teal-200/60 focus:bg-white focus:text-gray-900 focus:outline-none transition-all w-36 text-xs"
              />
              <button
                type="submit"
                disabled={isJoiningRoom}
                className="bg-amber-400 hover:bg-amber-300 text-gray-900 font-extrabold px-3 py-2 rounded-xl text-xs whitespace-nowrap shadow transition-all active:scale-95 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <Key className="w-3.5 h-3.5" />
                {isJoiningRoom ? 'Đang tìm...' : 'Vào theo mã'}
              </button>
            </form>
          </div>

          {/* Quick Access Active Rooms List */}
          {examRooms.filter(r => r.status !== 'closed').length > 0 ? (
            <div className="space-y-2.5 pt-1">
              <p className="text-xs font-extrabold text-amber-200 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-amber-300" /> Các phòng thi đang mở (Click thi trực tiếp ngay):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {examRooms.filter(r => r.status !== 'closed').map(room => {
                  const sub = submissions.find(s => s.room_id === room.id)
                  const roomTitle = room.exams?.title || room.name || `Phòng thi ${room.code}`

                  return (
                    <div
                      key={room.id}
                      className="bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md rounded-2xl p-3.5 flex flex-col justify-between gap-3 transition-all group shadow-sm"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-black text-white text-sm leading-snug group-hover:text-amber-200 transition-colors">
                            {roomTitle}
                          </h4>
                          <span className="bg-amber-400/20 text-amber-200 font-mono text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300/30 shrink-0">
                            {room.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-teal-100 mt-1 font-medium">
                          {room.exams?.duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-300" /> {room.exams.duration} phút
                            </span>
                          )}
                          {room.classes?.class_name && (
                            <span className="opacity-80">Lớp: {room.classes.class_name}</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/exam-room/${room.id}`)}
                        className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-gray-950 font-black text-xs py-2.5 px-3 rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {sub ? 'Xem lại bài thi' : 'VÀO LÀM BÀI NGAY (TRỰC TIẾP)'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-teal-900/30 border border-teal-500/30 rounded-2xl p-4 text-center text-xs text-teal-100 font-medium">
              Hiện tại không có phòng thi nào mở trực tiếp. Thầy cô sẽ mở phòng thi khi tới giờ làm bài!
            </div>
          )}
        </div>

        {/* Assigned Exam Rooms Card Section */}
        {examRooms.length > 0 && (
          <div className="bg-white rounded-3xl border-2 border-teal-100 shadow-sm p-5 sm:p-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-teal-900 uppercase tracking-wide flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-600" /> Danh Sách Phòng Thi / Bài Tập Được Giao ({examRooms.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {examRooms.map(room => {
                const sub = submissions.find(s => s.room_id === room.id)
                const roomTitle = room.exams?.title || room.name || `Phòng thi ${room.code}`
                const isClosed = room.status === 'closed'

                return (
                  <div
                    key={room.id}
                    className="border-2 border-teal-100 hover:border-teal-300 rounded-2xl p-4 bg-teal-50/20 hover:bg-teal-50/50 transition-all flex flex-col justify-between gap-3 shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-extrabold text-gray-900 text-base leading-snug">
                          {roomTitle}
                        </h4>
                        <span className="bg-teal-100 text-teal-800 font-mono text-xs font-bold px-2.5 py-1 rounded-lg border border-teal-200 shrink-0">
                          {room.code}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2">
                        {room.classes?.class_name && (
                          <span className="bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded">
                            Lớp: {room.classes.class_name}
                          </span>
                        )}
                        {room.exams?.duration && (
                          <span className="flex items-center gap-1 text-gray-500 font-medium">
                            <Clock className="w-3.5 h-3.5 text-teal-600" /> {room.exams.duration} phút
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-teal-100/60 mt-1">
                      <div>
                        {sub ? (
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Đã nộp ({sub.score ?? sub.total_score ?? '—'}đ)
                          </span>
                        ) : isClosed ? (
                          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                            Đã đóng phòng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-100/70 px-3 py-1 rounded-full">
                            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                            Đang mở thi
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => navigate(`/exam-room/${room.id}`)}
                        disabled={isClosed}
                        className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-sm inline-flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {sub ? 'Xem lại bài' : 'Vào làm bài'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Progress Report & Results Section Card */}
        <div className="bg-white rounded-3xl border-2 border-teal-100 shadow-sm p-5 sm:p-7 space-y-6">
          
          {/* Section 1 Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-800 text-gray-900 flex items-center gap-2">
                📊 Báo Cáo Tiến Độ & Kết Quả Học Tập
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Bảng theo dõi buổi học và biểu đồ kết quả điểm số, thời gian làm bài của học sinh.
              </p>
            </div>

            {/* Summary Badges */}
            <div className="flex items-center gap-2.5">
              <span className="bg-teal-50 text-teal-800 border border-teal-200 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-sm">
                Bài đã làm: <strong className="text-teal-700 text-sm ml-1">{completedExamsCount}</strong>
              </span>

              <span className="bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold px-3.5 py-1.5 rounded-full shadow-sm">
                Điểm TB: <strong className="text-amber-700 text-sm ml-1">{avgScoreDisplay}</strong>
              </span>
            </div>
          </div>

          {/* Section 2 Detailed Table */}
          <div className="space-y-3.5">
            <h3 className="text-sm font-800 text-teal-900 uppercase tracking-wide flex items-center gap-2">
              📋 BẢNG TỔNG HỢP KẾT QUẢ CHI TIẾT
            </h3>

            <div className="overflow-x-auto custom-scrollbar border-2 border-teal-100 rounded-2xl shadow-sm">
              <table className="w-full text-sm text-center">
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
                    <th className="px-5 py-3.5 text-white font-extrabold text-xs uppercase w-32 border-r border-teal-500/30">
                      Buổi học
                    </th>
                    <th className="px-5 py-3.5 text-white font-extrabold text-xs uppercase w-32 border-r border-teal-500/30">
                      Mã đề
                    </th>
                    <th className="px-5 py-3.5 text-white font-extrabold text-xs uppercase w-36 border-r border-teal-500/30">
                      Điểm số
                    </th>
                    <th className="px-5 py-3.5 text-white font-extrabold text-xs uppercase">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sessionList.map(session => (
                    session.exams.map((examItem, idx) => (
                      <tr key={`${session.name}-${examItem.codeName}`} className="hover:bg-teal-50/30 transition-colors">
                        {/* Buổi học column với rowSpan động */}
                        {idx === 0 && (
                          <td
                            rowSpan={session.exams.length}
                            className="px-5 py-4 font-extrabold text-gray-800 text-sm bg-gray-50/50 border-r border-gray-100 border-b border-gray-200"
                          >
                            {session.name}
                          </td>
                        )}

                        {/* Mã đề */}
                        <td className="px-5 py-3.5 font-semibold text-gray-700 text-xs border-r border-gray-100">
                          {examItem.codeName}
                        </td>

                        {/* Điểm số */}
                        <td className="px-5 py-3.5 font-bold text-teal-700 text-sm border-r border-gray-100">
                          {examItem.score}
                        </td>

                        {/* Trạng thái / Thao tác */}
                        <td className="px-5 py-3.5 text-xs">
                          {examItem.room ? (
                            <button
                              onClick={() => navigate(`/exam-room/${examItem.room.id}`)}
                              className="btn-teal py-1.5 px-4 text-xs font-bold rounded-xl shadow-sm inline-flex items-center gap-1"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" /> Vào làm bài
                            </button>
                          ) : (
                            <span className="text-gray-400 font-medium">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Khóa học & Bài giảng của học sinh (Nếu có) */}
        {courses.length > 0 && (
          <div className="bg-white rounded-3xl border border-teal-100 p-6 space-y-4 shadow-sm">
            <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
              <PlaySquare className="w-5 h-5 text-teal-600" /> Khóa học & Bài giảng được giao
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map(course => (
                <div
                  key={course.id}
                  onClick={() => navigate(`/course-viewer/${course.id}/${student.id}`)}
                  className="bg-gray-50 hover:bg-teal-50/50 border border-gray-200 hover:border-teal-300 rounded-2xl p-4 transition-all cursor-pointer group"
                >
                  <h4 className="font-bold text-gray-900 group-hover:text-teal-700 text-sm">{course.title}</h4>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{course.description || 'Chưa có mô tả'}</p>
                  <div className="mt-3 flex items-center justify-end text-xs font-bold text-teal-600 group-hover:translate-x-1 transition-transform">
                    <span>Vào học</span> <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
