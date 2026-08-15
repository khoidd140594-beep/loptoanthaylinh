// @ts-nocheck
import { useEffect, useState, useCallback } from 'react'
import { Users, BookOpen, CalendarCheck, Banknote, TrendingUp, Cake, ChevronRight, X } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { fmtVNDShort, fmt } from '@/lib/helpers'
import type { LucideIcon } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────
type Color = 'teal' | 'green' | 'amber' | 'red'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  color?: Color
}

interface BirthdayStudent {
  id: string
  full_name: string
  student_code: string
  date_of_birth: string   // ISO yyyy-mm-dd
  daysUntil: number       // 0 = hôm nay, 1 = ngày mai, ...
  ageThisYear: number
}

// ─── Constants ──────────────────────────────────────────────────────────────
const colorMap: Record<Color, string> = {
  teal:  'from-teal-500 to-teal-400',
  green: 'from-green-500 to-green-400',
  amber: 'from-amber-500 to-amber-400',
  red:   'from-red-500 to-red-400',
}

const BIRTHDAY_WINDOW_DAYS = 7   // Thông báo trước bao nhiêu ngày

// ─── Helper: tính số ngày đến sinh nhật tiếp theo ───────────────────────────
function daysUntilBirthday(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [, month, day] = isoDate.split('-').map(Number)
  const thisYear  = today.getFullYear()

  let next = new Date(thisYear, month - 1, day)
  next.setHours(0, 0, 0, 0)

  if (next < today) {
    // Sinh nhật năm nay đã qua → tính sang năm sau
    next = new Date(thisYear + 1, month - 1, day)
    next.setHours(0, 0, 0, 0)
  }

  return Math.round((next.getTime() - today.getTime()) / 86_400_000)
}

function ageThisYear(isoDate: string): number {
  const [year] = isoDate.split('-').map(Number)
  return new Date().getFullYear() - year
}

// ─── Sub-component: StatCard ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'teal' }: StatCardProps) {
  return (
    <div className="card p-6 flex items-center gap-4">
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      <div>
        <p className="text-gray-500 text-sm font-semibold">{label}</p>
        <p className="text-2xl font-extrabold text-gray-800">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Sub-component: BirthdayBanner ──────────────────────────────────────────
function BirthdayBanner({ students }: { students: BirthdayStudent[] }) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || students.length === 0) return null

  const today    = students.filter(s => s.daysUntil === 0)
  const upcoming = students.filter(s => s.daysUntil > 0)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 shadow-sm">
      {/* Decorative dots */}
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-amber-100 opacity-60" />
      <div className="absolute -right-2 top-8 w-12 h-12 rounded-full bg-orange-100 opacity-40" />

      <div className="relative px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Cake className="w-5 h-5 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2">
                Sinh nhật sắp tới
                <span className="bg-amber-200 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {students.length} học sinh
                </span>
              </p>

              <div className="flex flex-wrap gap-2">
                {/* Sinh nhật hôm nay */}
                {today.map(s => (
                  <div key={s.id}
                    className="flex items-center gap-2 bg-orange-100 border border-orange-300 rounded-xl px-3 py-2 shadow-sm">
                    <span className="text-base">🎂</span>
                    <div>
                      <p className="font-bold text-orange-800 text-sm leading-tight">{s.full_name}</p>
                      <p className="text-orange-600 text-xs">{s.student_code} · {s.ageThisYear} tuổi · <strong>Hôm nay!</strong></p>
                    </div>
                  </div>
                ))}
                {/* Sắp tới */}
                {upcoming.map(s => (
                  <div key={s.id}
                    className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2 hover:border-amber-300 transition-colors">
                    <span className="text-base">🎁</span>
                    <div>
                      <p className="font-semibold text-amber-900 text-sm leading-tight">{s.full_name}</p>
                      <p className="text-amber-600 text-xs">
                        {s.student_code} · {s.ageThisYear} tuổi ·{' '}
                        {s.daysUntil === 1
                          ? <strong>Ngày mai</strong>
                          : <span>còn {s.daysUntil} ngày</span>
                        }
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {today.length > 0 && (
                <p className="mt-3 text-xs text-orange-600 font-medium flex items-center gap-1">
                  🎉 Đừng quên gửi lời chúc mừng sinh nhật đến <strong>{today.map(s => s.full_name).join(', ')}</strong> hôm nay nhé!
                </p>
              )}
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
            title="Ẩn thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: Dashboard
// ══════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { profile, isAdmin } = useAuthStore()
  const { classes, students, payments, loadClasses, loadStudents, loadPayments } = useDataStore()

  const [loaded, setLoaded]             = useState(false)
  const [todayAtt, setTodayAtt]         = useState(0)
  const [recentPays, setRecentPays]     = useState<any[]>([])
  const [birthdayStudents, setBirthdayStudents] = useState<BirthdayStudent[]>([])

  const loadDashboard = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10)

      await Promise.all([
        loadClasses(),
        loadStudents(),
        loadPayments(),

        // Điểm danh hôm nay
        supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('date', todayStr)
          .then(({ count }) => setTodayAtt(count ?? 0)),

        // 5 thanh toán gần nhất
        supabase
          .from('payments')
          .select('id, amount, method, date, student_id, students(full_name)')
          .order('date', { ascending: false })
          .limit(5)
          .then(({ data }) => setRecentPays(data || [])),

        // ── Học sinh có sinh nhật trong 7 ngày tới ──
        // Lấy tất cả học sinh active có date_of_birth, tính ở client
        // (Postgres date arithmetic cho sinh nhật khá phức tạp với năm nhuận)
        supabase
          .from('students')
          .select('id, full_name, student_code, date_of_birth')
          .eq('status', 'active')
          .not('date_of_birth', 'is', null)
          .then(({ data }) => {
            if (!data) return
            const upcoming: BirthdayStudent[] = (data as any[])
              .map(s => ({
                ...s,
                daysUntil:   daysUntilBirthday(s.date_of_birth),
                ageThisYear: ageThisYear(s.date_of_birth),
              }))
              .filter(s => s.daysUntil <= BIRTHDAY_WINDOW_DAYS)
              .sort((a, b) => a.daysUntil - b.daysUntil)
            setBirthdayStudents(upcoming)
          }),
      ])
    } finally {
      setLoaded(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const activeClasses  = classes.filter(c => c.status === 'active').length
  const activeStudents = students.filter(s => s.status === 'active').length
  const totalRevenue   = payments.reduce((s, p) => s + (p.amount ?? 0), 0)

  if (!loaded) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Xin chào, <strong>{profile?.name ?? profile?.email}</strong> 👋
          </p>
        </div>
        <span className="text-sm text-gray-400">{fmt(new Date(), 'EEEE, dd/MM/yyyy')}</span>
      </div>

      {/* ── Birthday Banner ───────────────────────────────────────────── */}
      <BirthdayBanner students={birthdayStudents} />

      {/* ── Stat Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={BookOpen}      label="Lớp đang mở"      value={activeClasses}             sub="lớp học đang hoạt động" color="teal"  />
        <StatCard icon={Users}         label="Học sinh"          value={activeStudents}            sub="đang theo học"          color="green" />
        <StatCard icon={CalendarCheck} label="Điểm danh hôm nay" value={todayAtt}                 sub="bản ghi hôm nay"        color="amber" />
        {isAdmin() && (
          <StatCard icon={Banknote}    label="Tổng thu"          value={fmtVNDShort(totalRevenue)} sub="tổng doanh thu"         color="teal"  />
        )}
      </div>

      {/* ── Bottom panels ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAdmin() && (
          <div className="card p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-600" />
              Học phí gần đây
            </h3>
            {recentPays.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-3">
                {recentPays.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-teal-50">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">
                        {p.students?.full_name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {p.date ? fmt(p.date) : '—'} · {p.method === 'transfer' ? '🏦' : '💵'}
                      </p>
                    </div>
                    <span className="font-bold text-green-600 text-sm">{fmtVNDShort(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            Lớp học đang mở
          </h3>
          {classes.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Chưa có lớp học</p>
          ) : (
            <div className="space-y-3">
              {classes.filter(c => c.status === 'active').slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-teal-50">
                  <div>
                    <p className="font-semibold text-sm text-gray-800">
                      {(c as any).class_name || (c as any).name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {[(c as any).subject, (c as any).schedule].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                    Đang mở
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Upcoming Birthdays panel (mini list) ──────────────────── */}
        {birthdayStudents.length > 0 && (
          <div className="card p-6 lg:col-span-2">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Cake className="w-5 h-5 text-amber-500" />
              Sinh nhật trong {BIRTHDAY_WINDOW_DAYS} ngày tới
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {birthdayStudents.map(s => {
                const isToday = s.daysUntil === 0
                const isTomorrow = s.daysUntil === 1
                return (
                  <div key={s.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ${
                      isToday
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-amber-50/60 border-amber-100 hover:border-amber-200'
                    }`}>
                    <span className="text-2xl">{isToday ? '🎂' : '🎁'}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-800 truncate">{s.full_name}</p>
                      <p className="text-xs text-gray-400">{s.student_code} · {s.ageThisYear} tuổi</p>
                      <p className={`text-xs font-semibold mt-0.5 ${isToday ? 'text-orange-600' : 'text-amber-600'}`}>
                        {isToday ? '🎉 Hôm nay!' : isTomorrow ? 'Ngày mai' : `Còn ${s.daysUntil} ngày`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
