// @ts-nocheck
// src/pages/StudentProgressPage.tsx
// Phiếu học tập — trang phụ huynh xem khi quét QR trên thẻ học viên.
//
// Đường vào: /progress?code=HS001
// KHÔNG yêu cầu đăng nhập, nên mọi truy vấn ở đây chạy bằng anon key. Đó cũng là
// lý do trang chỉ đọc, không có nút sửa gì.
//
// Thiết kế cho điện thoại trước: phụ huynh gần như luôn mở bằng camera điện thoại.

import { useEffect, useState } from 'react'
import {
  GraduationCap, CalendarCheck, ClipboardCheck, MonitorPlay,
  Search, AlertCircle, CheckCircle2, Clock, XCircle, Printer,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import StudentGradesSection from '@/components/StudentGradesSection'

/* ------------------------------------------------------------------ *
 * Phụ trợ
 * ------------------------------------------------------------------ */

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN')
}

function pct(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

/** Thẻ số liệu nhỏ ở đầu mỗi khối. */
function Stat({ icon: Icon, label, value, tone = 'teal' }) {
  const tones = {
    teal:  'bg-teal-50 text-teal-700 border-teal-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red:   'bg-red-50 text-red-600 border-red-100',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <p className="font-black text-lg leading-tight mt-0.5">{value}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Trang
 * ------------------------------------------------------------------ */

export default function StudentProgressPage() {
  const [codeInput, setCodeInput] = useState('')
  const [student, setStudent]     = useState(null)
  const [classNames, setClassNames] = useState([])
  const [attendance, setAttendance] = useState([])
  const [examResults, setExamResults] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [searched, setSearched]   = useState(false)

  // Mã trên thẻ học viên đi kèm trong URL → tra luôn, phụ huynh không phải gõ.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      setCodeInput(code.toUpperCase())
      void lookup(code)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lookup = async (rawCode) => {
    const code = String(rawCode || '').trim()
    if (!code) { setError('Nhập mã học sinh in trên thẻ'); return }

    setLoading(true)
    setError('')
    setSearched(true)
    setStudent(null)

    try {
      // 1. Học sinh
      const { data: stu } = await supabase
        .from('students')
        .select('id, full_name, student_code, grade, school, date_of_birth, status')
        .ilike('student_code', code)
        .maybeSingle()

      if (!stu) {
        setError(`Không tìm thấy học sinh có mã "${code}". Kiểm tra lại mã in trên thẻ.`)
        return
      }
      setStudent(stu)

      // 2. Lớp đang học
      const { data: enrolls } = await supabase
        .from('enrollments')
        .select('class_id')
        .eq('student_id', stu.id)
        .eq('status', 'active')

      const classIds = (enrolls || []).map(e => e.class_id)

      if (classIds.length > 0) {
        const { data: classes } = await supabase
          .from('classes')
          .select('class_name, subject')
          .in('id', classIds)
        setClassNames(classes || [])
      } else {
        setClassNames([])
      }

      // 3. Điểm danh — lấy 120 buổi gần nhất là quá đủ cho một năm học
      const { data: att } = await supabase
        .from('attendance')
        .select('date, present, late, status, note, class_id')
        .eq('student_id', stu.id)
        .order('date', { ascending: false })
        .limit(120)
      setAttendance(att || [])

      // 4. Kết quả thi trực tuyến
      const { data: subs } = await supabase
        .from('exam_submissions')
        .select('id, room_id, score, correct_count, status, submitted_at')
        .eq('student_id', stu.id)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .limit(30)

      const roomIds = [...new Set((subs || []).map(s => s.room_id).filter(Boolean))]
      const examTitles = {}

      if (roomIds.length > 0) {
        const { data: rooms } = await supabase
          .from('exam_rooms')
          .select('id, exam_id')
          .in('id', roomIds)

        const examIds = [...new Set((rooms || []).map(r => r.exam_id).filter(Boolean))]
        const titleByExam = {}

        if (examIds.length > 0) {
          const { data: exams } = await supabase.from('exams').select('id, title').in('id', examIds)
          for (const ex of exams || []) titleByExam[ex.id] = ex.title
        }
        for (const room of rooms || []) examTitles[room.id] = titleByExam[room.exam_id] || 'Bài thi'
      }

      setExamResults((subs || []).map(s => ({ ...s, title: examTitles[s.room_id] || 'Bài thi' })))
    } catch (e) {
      setError('Không tải được dữ liệu. Thử lại sau ít phút.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  /* ── Tổng hợp điểm danh ─────────────────────────────────────── */
  const attStats = (() => {
    const total   = attendance.length
    const late    = attendance.filter(a => a.late || a.status === 'late').length
    const present = attendance.filter(a => a.present || a.status === 'present' || a.status === 'late').length
    return { total, present, late, absent: total - present }
  })()

  /* ── Màn hình nhập mã ───────────────────────────────────────── */
  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-teal-50 p-6 text-center border-b border-teal-100">
            <div className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <GraduationCap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-teal-800">Phiếu học tập</h1>
            <p className="text-teal-600 text-sm mt-1">Xem điểm danh, điểm kiểm tra và kết quả thi</p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Mã học sinh</label>
              <input
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') void lookup(codeInput) }}
                placeholder="VD: HS001"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition-all font-mono font-bold text-lg text-center uppercase tracking-widest"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1.5 text-center">
                Mã in ở mặt trước thẻ học viên, ngay dưới tên con
              </p>
            </div>

            {searched && error && (
              <div className="flex items-start gap-2 rounded-xl border-2 border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={() => void lookup(codeInput)}
              disabled={loading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/30 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang tra cứu...
                </>
              ) : (
                <><Search className="w-4 h-4" /> XEM PHIẾU HỌC TẬP</>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Phiếu học tập ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          section { break-inside: avoid; }
        }
      `}</style>

      {/* Đầu trang */}
      <header className="bg-gradient-to-br from-teal-600 to-teal-800 text-white">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-200">Phiếu học tập</p>
              <h1 className="text-2xl sm:text-3xl font-black mt-1 leading-tight">{student.full_name}</h1>
              <p className="font-mono text-sm text-teal-100 mt-1">{student.student_code}</p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {student.grade && (
                  <span className="text-xs font-bold bg-white/15 px-2.5 py-1 rounded-lg">Khối {student.grade}</span>
                )}
                {classNames.map((c, i) => (
                  <span key={i} className="text-xs font-bold bg-white/15 px-2.5 py-1 rounded-lg">
                    {c.class_name}{c.subject ? ` · ${c.subject}` : ''}
                  </span>
                ))}
                {student.status === 'inactive' && (
                  <span className="text-xs font-bold bg-red-500/80 px-2.5 py-1 rounded-lg">Đã nghỉ học</span>
                )}
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="no-print shrink-0 bg-white/15 hover:bg-white/25 rounded-xl p-2.5 transition"
              title="In phiếu"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Điểm danh ── */}
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-teal-600" />
            <h2 className="font-black text-gray-800">Điểm danh</h2>
            <span className="text-xs text-gray-400">({attStats.total} buổi)</span>
          </div>

          {attStats.total === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">Chưa có dữ liệu điểm danh.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4">
                <Stat icon={CheckCircle2} label="Có mặt" value={attStats.present} tone="green" />
                <Stat icon={Clock} label="Đi muộn" value={attStats.late} tone="amber" />
                <Stat icon={XCircle} label="Vắng" value={attStats.absent} tone="red" />
                <Stat label="Tỉ lệ đi học" value={`${pct(attStats.present, attStats.total)}%`} tone="teal" />
              </div>

              {/* Thanh tỉ lệ đi học */}
              <div className="px-4 pb-4">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                  <div className="bg-green-500" style={{ width: `${pct(attStats.present - attStats.late, attStats.total)}%` }} />
                  <div className="bg-amber-400" style={{ width: `${pct(attStats.late, attStats.total)}%` }} />
                </div>
              </div>

              {/* 10 buổi gần nhất */}
              <div className="border-t border-gray-50">
                <p className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  10 buổi gần nhất
                </p>
                <div className="divide-y divide-gray-50">
                  {attendance.slice(0, 10).map((a, i) => {
                    const isLate    = a.late || a.status === 'late'
                    const isPresent = a.present || a.status === 'present' || isLate
                    return (
                      <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-gray-700">{fmtDate(a.date)}</span>
                          {a.note && <p className="text-xs text-gray-400 truncate">{a.note}</p>}
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                          isLate ? 'bg-amber-50 text-amber-700'
                          : isPresent ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-600'
                        }`}>
                          {isLate ? 'Đi muộn' : isPresent ? 'Có mặt' : 'Vắng'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Điểm kiểm tra trên lớp ── */}
        <StudentGradesSection studentId={student.id} />

        {/* ── Kết quả thi trực tuyến ── */}
        <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <MonitorPlay className="w-5 h-5 text-teal-600" />
            <h2 className="font-black text-gray-800">Thi trực tuyến</h2>
            <span className="text-xs text-gray-400">({examResults.length} bài)</span>
          </div>

          {examResults.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">Chưa có bài thi trực tuyến nào.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {examResults.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 text-sm leading-snug">{r.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtDate(r.submitted_at)}
                      {r.correct_count !== null && r.correct_count !== undefined && ` · ${r.correct_count} câu đúng`}
                    </p>
                  </div>
                  <span className={`font-black text-xl shrink-0 ${
                    Number(r.score) >= 8 ? 'text-green-600'
                    : Number(r.score) >= 5 ? 'text-teal-600'
                    : 'text-red-500'
                  }`}>
                    {Math.round(Number(r.score) * 100) / 100}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Đổi học sinh khác */}
        <div className="no-print pt-2 pb-8 text-center">
          <button
            onClick={() => { setStudent(null); setCodeInput(''); setSearched(false); setError('') }}
            className="text-sm font-bold text-teal-600 hover:text-teal-800 transition"
          >
            ← Tra cứu học sinh khác
          </button>
          <p className="text-xs text-gray-400 mt-3">
            Số liệu cập nhật theo thời gian giáo viên nhập. Có thắc mắc, phụ huynh liên hệ trực tiếp trung tâm.
          </p>
        </div>
      </main>
    </div>
  )
}
