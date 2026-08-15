// @ts-nocheck
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Users, BookOpen, Calendar, ChevronLeft, ChevronRight,
  Eye, EyeOff, Clock, Cake, TrendingUp, X, Banknote, CalendarCheck
} from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { fmtVNDShort } from '@/lib/helpers'

// ─── Helpers & Types ────────────────────────────────────────────────────────
interface BirthdayStudent {
  id: string
  full_name: string
  student_code: string
  date_of_birth: string
  daysUntil: number
  ageThisYear: number
}

function daysUntilBirthday(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [, month, day] = isoDate.split('-').map(Number)
  const thisYear = today.getFullYear()
  let next = new Date(thisYear, month - 1, day)
  next.setHours(0, 0, 0, 0)
  if (next < today) {
    next = new Date(thisYear + 1, month - 1, day)
    next.setHours(0, 0, 0, 0)
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

function ageThisYear(isoDate: string): number {
  const [year] = isoDate.split('-').map(Number)
  return new Date().getFullYear() - year
}

/** Tên thứ tiếng Việt chuẩn */
const DAY_LABELS = ['THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7', 'CN']

/** Regex lọc lớp theo từng ngày trong tuần (0 = Thứ 2 ... 6 = Chủ Nhật) */
const DAY_PATTERNS = [
  [/thứ\s*2|thứ\s*hai|t2/i],
  [/thứ\s*3|thứ\s*ba|t3/i],
  [/thứ\s*4|thứ\s*tư|t4/i],
  [/thứ\s*5|thứ\s*năm|t5/i],
  [/thứ\s*6|thứ\s*sáu|t6/i],
  [/thứ\s*7|thứ\s*bảy|t7/i],
  [/chủ\s*nhật|cn/i],
]

/** Trích xuất thời gian học từ chuỗi schedule */
function extractTime(scheduleStr: string) {
  if (!scheduleStr) return '17h-19h'
  const match = scheduleStr.match(/\d{1,2}h(?:\d{2})?\s*-\s*\d{1,2}h(?:\d{2})?|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/i)
  return match ? match[0] : scheduleStr
}

/** Format ngày hiển thị tiêu đề */
function formatHeaderDate(date: Date) {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
  const dayName = days[date.getDay()]
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dayName}, ${dd}/${mm}/${yyyy}`
}

/** Format chuỗi phạm vi tuần dd/mm – dd/mm/yyyy */
function formatWeekRange(monday: Date, sunday: Date) {
  const d1 = String(monday.getDate()).padStart(2, '0')
  const m1 = String(monday.getMonth() + 1).padStart(2, '0')
  const d2 = String(sunday.getDate()).padStart(2, '0')
  const m2 = String(sunday.getMonth() + 1).padStart(2, '0')
  const y2 = sunday.getFullYear()
  return `${d1}/${m1} – ${d2}/${m2}/${y2}`
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: Dashboard
// ══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { profile, isAdmin } = useAuthStore()
  const { classes, students, payments, loadClasses, loadStudents, loadPayments } = useDataStore()

  const [loaded, setLoaded] = useState(false)
  const [todayAtt, setTodayAtt] = useState(0)
  const [recentPays, setRecentPays] = useState<any[]>([])
  const [birthdayStudents, setBirthdayStudents] = useState<BirthdayStudent[]>([])
  const [showStudentCount, setShowStudentCount] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)

  const loadDashboard = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10)

      await Promise.all([
        loadClasses(),
        loadStudents(),
        loadPayments(),

        supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('date', todayStr)
          .then(({ count }) => setTodayAtt(count ?? 0)),

        supabase
          .from('payments')
          .select('id, amount, method, date, student_id, students(full_name)')
          .order('date', { ascending: false })
          .limit(5)
          .then(({ data }) => setRecentPays(data || [])),

        supabase
          .from('students')
          .select('id, full_name, student_code, date_of_birth')
          .eq('status', 'active')
          .not('date_of_birth', 'is', null)
          .then(({ data }) => {
            if (!data) return
            const upcoming: BirthdayStudent[] = (data as any[])
              .map((s) => ({
                ...s,
                daysUntil: daysUntilBirthday(s.date_of_birth),
                ageThisYear: ageThisYear(s.date_of_birth),
              }))
              .filter((s) => s.daysUntil <= 7)
              .sort((a, b) => a.daysUntil - b.daysUntil)
            setBirthdayStudents(upcoming)
          }),
      ])
    } finally {
      setLoaded(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  // Tính các ngày trong tuần đang chọn (Thứ 2 -> Chủ Nhật)
  const weekDays = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const day = today.getDay()
    const diffToMon = day === 0 ? -6 : 1 - day
    const monday = new Date(today)
    monday.setDate(today.getDate() + diffToMon + weekOffset * 7)

    const list: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      list.push(d)
    }
    return list
  }, [weekOffset])

  const activeClasses = classes.filter((c) => c.status === 'active').length
  const activeStudents = students.filter((s) => s.status === 'active').length
  const totalRevenue = payments.reduce((s, p) => s + (p.amount ?? 0), 0)

  const todayDateStr = new Date().toDateString()

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">LỚP TOÁN THẦY LĨNH</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Xin chào, <span className="font-semibold text-slate-700">{profile?.name || 'Thầy Lĩnh'}</span> 👋
          </p>
        </div>
        <span className="text-sm font-medium text-slate-400 self-start sm:self-auto">
          {formatHeaderDate(new Date())}
        </span>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Lớp đang mở */}
        <div className="bg-white rounded-2xl border border-teal-100/80 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lớp đang mở</p>
            <p className="text-3xl font-extrabold text-slate-800 leading-tight mt-0.5">{activeClasses}</p>
            <p className="text-xs text-slate-400 mt-0.5">lớp học đang hoạt động</p>
          </div>
        </div>

        {/* Card 2: Học sinh */}
        <div className="bg-white rounded-2xl border border-teal-100/80 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Học sinh</p>
              <p className="text-3xl font-extrabold text-slate-800 leading-tight mt-0.5">
                {showStudentCount ? activeStudents : '•••'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">đang theo học</p>
            </div>
          </div>
          <button
            onClick={() => setShowStudentCount(!showStudentCount)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title={showStudentCount ? 'Ẩn số lượng' : 'Hiện số lượng'}
          >
            {showStudentCount ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* ── Lịch học tuần này ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-teal-100/80 shadow-sm overflow-hidden p-5 sm:p-6">
        {/* Header điều hướng tuần */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            <h2 className="text-lg font-extrabold text-slate-800">Lịch học tuần này</h2>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors"
            >
              Hôm nay
            </button>
            <button
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
              title="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg ml-1">
              {formatWeekRange(weekDays[0], weekDays[6])}
            </span>
          </div>
        </div>

        {/* Lưới 7 cột Thứ 2 -> Chủ Nhật */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {weekDays.map((dateObj, idx) => {
            const isToday = dateObj.toDateString() === todayDateStr
            const dateNum = dateObj.getDate()

            // Tìm các lớp có lịch vào thứ này
            const dayClasses = classes.filter((c) => {
              if (c.status !== 'active') return false
              const sched = (c.schedule || '').toLowerCase()
              return DAY_PATTERNS[idx].some((p) => p.test(sched))
            })

            return (
              <div
                key={idx}
                className={`flex flex-col rounded-xl border transition-all ${
                  isToday
                    ? 'border-teal-400 bg-teal-50/40 shadow-sm'
                    : 'border-slate-100 bg-slate-50/30'
                }`}
              >
                {/* Header ngày */}
                <div
                  className={`p-3 text-center border-b rounded-t-xl ${
                    isToday
                      ? 'bg-teal-100/60 border-teal-200'
                      : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {DAY_LABELS[idx]}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <span
                      className={`text-base font-extrabold ${
                        isToday
                          ? 'w-7 h-7 bg-teal-600 text-white rounded-full flex items-center justify-center shadow-sm'
                          : 'text-slate-800'
                      }`}
                    >
                      {dateNum}
                    </span>
                  </div>
                  {isToday && (
                    <span className="inline-block text-[9px] font-black text-teal-700 bg-teal-200/80 px-2 py-0.5 rounded-full uppercase mt-1">
                      HÔM NAY
                    </span>
                  )}
                </div>

                {/* Danh sách lớp trong ngày */}
                <div className="p-2.5 flex-1 flex flex-col gap-2 min-h-[140px]">
                  {dayClasses.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-xs italic text-slate-400 font-medium">Không có lớp</span>
                    </div>
                  ) : (
                    dayClasses.map((cls) => (
                      <div
                        key={cls.id}
                        className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-2xs hover:border-teal-300 transition-colors"
                      >
                        <p className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">
                          {(cls as any).class_name || (cls as any).name}
                        </p>
                        <div className="flex items-center justify-between gap-1 mt-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-700">
                            {(cls as any).subject || 'Toán'}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {extractTime(cls.schedule || '')}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Birthday Banner ───────────────────────────────────────────── */}
      <BirthdayBanner students={birthdayStudents} />

      {/* ── Bottom Panel: Thống kê bổ sung ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAdmin() && (
          <div className="bg-white rounded-2xl border border-teal-100/80 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              Học phí gần đây
            </h3>
            {recentPays.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-6">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-2.5">
                {recentPays.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <div>
                      <p className="font-semibold text-xs text-slate-800">{p.students?.full_name ?? '—'}</p>
                      <p className="text-[10px] text-slate-400">
                        {p.date ? new Date(p.date).toLocaleDateString('vi-VN') : '—'} ·{' '}
                        {p.method === 'transfer' ? '🏦 Chuyển khoản' : '💵 Tiền mặt'}
                      </p>
                    </div>
                    <span className="font-extrabold text-emerald-600 text-xs">{fmtVNDShort(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-teal-100/80 p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
            <CalendarCheck className="w-4 h-4 text-teal-600" />
            Thông tin nhanh
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
              <p className="text-xs text-slate-400 font-medium">Điểm danh hôm nay</p>
              <p className="text-xl font-black text-slate-800 mt-1">{todayAtt}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">bản ghi</p>
            </div>
            {isAdmin() && (
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                <p className="text-xs text-slate-400 font-medium">Tổng thu học phí</p>
                <p className="text-xl font-black text-emerald-600 mt-1">{fmtVNDShort(totalRevenue)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">tổng doanh thu</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BirthdayBanner({ students }: { students: BirthdayStudent[] }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || students.length === 0) return null

  const today = students.filter((s) => s.daysUntil === 0)
  const upcoming = students.filter((s) => s.daysUntil > 0)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-white flex-shrink-0 shadow-sm">
            <Cake className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-amber-900 text-xs mb-1.5 flex items-center gap-2">
              Sinh nhật sắp tới
              <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {students.length} học sinh
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {today.map((s) => (
                <div key={s.id} className="bg-orange-100 border border-orange-300 rounded-lg px-2.5 py-1 text-xs">
                  🎂 <strong className="text-orange-900">{s.full_name}</strong> (Hôm nay!)
                </div>
              ))}
              {upcoming.map((s) => (
                <div key={s.id} className="bg-white border border-amber-200 rounded-lg px-2.5 py-1 text-xs text-amber-900">
                  🎁 {s.full_name} ({s.daysUntil === 1 ? 'Ngày mai' : `còn ${s.daysUntil} ngày`})
                </div>
              ))}
            </div>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

