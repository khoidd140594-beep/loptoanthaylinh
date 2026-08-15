// @ts-nocheck
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import {
  LayoutDashboard, Users, BookOpen, CalendarCheck, Banknote,
  Mail, Settings, LogOut, FileText, MonitorPlay, ScanText,
  GraduationCap, Sigma, FilePlus, PlaySquare, Zap, FileType, CreditCard,
  ClipboardList, Database, Wand2, Presentation, Link2, ClipboardCheck,
} from 'lucide-react'

export default function Layout() {
  const authStore = useAuthStore() as any
  const user      = authStore.user
  const isAdmin   = authStore.isAdmin
  const location  = useLocation()
  const navigate  = useNavigate()

  const handleSignOut = async () => {
    if (authStore.logout) await authStore.logout()
    else if (authStore.signOut) await authStore.signOut()
    navigate('/login')
  }

  const menuGroups = [
    {
      title: 'Quản lý Đào tạo',
      items: [
        { path: '/',           icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/classes',    icon: BookOpen,        label: 'Lớp học' },
        { path: '/students',   icon: Users,           label: 'Học sinh' },
        { path: '/attendance', icon: CalendarCheck,   label: 'Điểm danh' },
        { path: '/grades',     icon: ClipboardCheck,  label: 'Nhập điểm' },
      ],
    },
    {
      title: 'Học liệu & Thi cử',
      items: [
        { path: '/courses',           icon: PlaySquare,    label: 'Khóa học & Bài giảng' },
        { path: '/create-presentation', icon: Presentation, label: 'Tạo bài giảng' },  // ← MỚI
        { path: '/exams',             icon: FileText,      label: 'Ngân hàng đề' },
        { path: '/question-bank',      icon: Database,   label: 'Ngân hàng câu hỏi' },
        { path: '/create-exam-from-bank', icon: Wand2,      label: 'Tạo đề từ ngân hàng' },
        { path: '/create-pdf-exam',   icon: FilePlus,      label: 'Tạo đề PDF' },
        { path: '/create-tex-exam',   icon: Sigma,         label: 'Tạo đề LaTeX' },
        { path: '/create-worksheet',  icon: ClipboardList, label: 'Phiếu Bài Tập' },  // ← MỚI
        { path: '/exam-rooms',        icon: MonitorPlay,   label: 'Phòng thi' },
        { path: '/phieu-grader',      icon: Zap,           label: 'Chấm Phiếu AI' },
      ],
    },
    {
      title: 'Công cụ bổ trợ',
      items: [
        { path: '/ocr',         icon: ScanText, label: 'Smart OCR' },
        { path: '/latex-tools', icon: Sigma,    label: 'Công cụ LaTeX' },
        { path: '/word-tools',  icon: FileType, label: 'Công cụ Word' },
      ],
    },
    {
      title: 'Hệ thống',
      adminOnly: true,
      items: [
        { path: '/student-cards', icon: CreditCard,     label: 'In thẻ học viên', adminOnly: true },
        { path: '/tuition',       icon: Banknote,       label: 'Học phí',         adminOnly: true },
        { path: '/email',         icon: Mail,           label: 'Email / Zalo',    adminOnly: true },
        { path: '/ket-noi-zalo',  icon: Link2,          label: 'Kết nối Zalo',    adminOnly: true },
        { path: '/users',         icon: Settings,       label: 'Người dùng',      adminOnly: true },
      ],
    },
  ]

  const displayName = user?.name || user?.full_name || user?.email || 'Giáo viên'
  const displayChar = displayName.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-teal-700 text-white flex flex-col shadow-xl z-20 hidden md:flex shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-teal-600/50 bg-teal-800/30">
          <GraduationCap className="w-8 h-8 text-teal-100" />
          <div>
            <h1 className="font-bold text-lg leading-tight">EduCenter</h1>
            <p className="text-[10px] text-teal-200 uppercase tracking-widest">Hệ thống Quản lý</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-2 custom-scrollbar">
          {menuGroups.map((group, idx) => {
            if (group.adminOnly && !isAdmin()) return null
            return (
              <div key={idx} className="mb-6">
                <h3 className="px-3 text-[10px] font-extrabold text-teal-300/80 uppercase tracking-widest mb-2 mt-2">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    if (item.adminOnly && !isAdmin()) return null
                    const isActive = location.pathname === item.path ||
                      (item.path !== '/' && location.pathname.startsWith(item.path))
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                          isActive
                            ? 'bg-white text-teal-700 font-bold shadow-md transform scale-[1.02]'
                            : 'text-teal-50 hover:bg-teal-600 hover:text-white hover:translate-x-1'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${isActive ? 'text-teal-600' : 'opacity-80'}`} />
                        <span className="text-sm">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-teal-600/50 bg-teal-800/30">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 rounded-full bg-teal-600 border-2 border-teal-400 flex items-center justify-center font-bold">
              {displayChar}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold truncate text-white">{displayName}</p>
              <p className="text-[10px] text-teal-200 uppercase tracking-widest">{user?.role || 'TEACHER'}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-teal-100 bg-teal-800/50 hover:bg-red-500 hover:text-white transition-all"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50/50">
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
