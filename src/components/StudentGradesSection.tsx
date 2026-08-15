// src/components/StudentGradesSection.tsx
// Phần điểm trong phiếu học tập của học sinh.
//
// Tự tải dữ liệu từ studentId, nên chỉ cần gắn một dòng vào trang là xong:
//   <StudentGradesSection studentId={student.id} />
//
// Dùng được cả ở /progress?code=... (phụ huynh quét QR trên thẻ học viên, không
// đăng nhập) và ở cổng học sinh sau khi đăng nhập.

import { useEffect, useState } from 'react'
import { ClipboardCheck, TrendingUp, Award } from 'lucide-react'
import {
  fetchStudentGradeSheet, weightedAverage, classify, fmtScore, toTen,
  type StudentGradeRow,
} from '@/services/gradesService'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN')
}

/** Màu theo điểm đã quy về thang 10. */
function toneOf(ten: number | null) {
  if (ten === null) return 'text-gray-300'
  if (ten >= 8) return 'text-green-600'
  if (ten >= 6.5) return 'text-teal-600'
  if (ten >= 5) return 'text-amber-600'
  return 'text-red-500'
}

interface Props {
  studentId: string
  /** Ẩn cả khối khi học sinh chưa có điểm nào, thay vì hiện ô rỗng. */
  hideWhenEmpty?: boolean
}

export default function StudentGradesSection({ studentId, hideWhenEmpty = false }: Props) {
  const [rows, setRows]       = useState<StudentGradeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let alive = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchStudentGradeSheet(studentId)
        if (alive) setRows(data)
      } catch {
        if (alive) setError('Không tải được bảng điểm')
      } finally {
        if (alive) setLoading(false)
      }
    }

    if (studentId) void load()
    else setLoading(false)

    return () => { alive = false }
  }, [studentId])

  const average = weightedAverage(
    rows.map(r => ({ score: r.score, maxScore: r.maxScore, weight: r.weight })),
  )

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-100 flex items-center justify-center">
        <div className="w-6 h-6 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-100 text-sm text-red-500">{error}</div>
    )
  }

  if (rows.length === 0 && hideWhenEmpty) return null

  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Đầu khối: trung bình chung */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-teal-600" />
          <h2 className="font-black text-gray-800">Kết quả kiểm tra</h2>
          <span className="text-xs text-gray-400">({rows.length} bài)</span>
        </div>

        {average !== null && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              <span className="text-gray-500">Trung bình</span>
              <span className="font-black text-teal-700 text-lg">{fmtScore(average)}</span>
              <span className="text-gray-400 text-xs">/10</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-100">
              {classify(average)}
            </span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">
          Chưa có điểm kiểm tra nào được nhập.
        </p>
      ) : (
        <>
          {/* Máy tính: bảng */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Bài kiểm tra</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Điểm</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">TB lớp</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Hạng</th>
                  <th className="px-5 py-2.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nhận xét</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const ten = row.score === null ? null : toTen(row.score, row.maxScore)
                  return (
                    <tr key={row.columnId} className="border-t border-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-bold text-gray-800">{row.title}</p>
                        {row.className && <p className="text-xs text-gray-400">{row.className}</p>}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(row.examDate)}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className={`font-black text-lg ${toneOf(ten)}`}>
                          {row.score === null ? '—' : fmtScore(row.score)}
                        </span>
                        <span className="text-gray-400 text-xs">/{fmtScore(row.maxScore)}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-gray-500">
                        {fmtScore(row.classAvg)}
                      </td>
                      <td className="px-3 py-3 text-center text-sm whitespace-nowrap">
                        {row.rank === null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-gray-700">
                            {row.rank <= 3 && <Award className="w-3.5 h-3.5 text-amber-500" />}
                            {row.rank}/{row.scoredCount}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 max-w-xs">
                        {row.comment || <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Điện thoại: thẻ, vì bảng 6 cột không đọc được trên màn hẹp */}
          <div className="sm:hidden divide-y divide-gray-50">
            {rows.map(row => {
              const ten = row.score === null ? null : toTen(row.score, row.maxScore)
              return (
                <div key={row.columnId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm leading-snug">{row.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtDate(row.examDate)}
                        {row.classAvg !== null && ` · TB lớp ${fmtScore(row.classAvg)}`}
                        {row.rank !== null && ` · hạng ${row.rank}/${row.scoredCount}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-black text-xl ${toneOf(ten)}`}>
                        {row.score === null ? '—' : fmtScore(row.score)}
                      </span>
                      <span className="text-gray-400 text-xs">/{fmtScore(row.maxScore)}</span>
                    </div>
                  </div>
                  {row.comment && <p className="text-xs text-gray-500 mt-1.5 italic">{row.comment}</p>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
