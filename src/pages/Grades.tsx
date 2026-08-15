import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardCheck, Plus, Save, RefreshCw, Users, MessageCircle,
  Pencil, Trash2, Table2, ListOrdered, Download,
} from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import Modal from '@/components/Modal'
import ZaloSendDialog from '@/components/ZaloSendDialog'
import { fmt } from '@/lib/helpers'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  fetchZaloSentLog,
  type ZaloLogRef,
  type ZaloRecipient,
  type ZaloSentMap,
} from '@/services/zaloService'
import {
  listGradeColumns, listScoresByColumns, createGradeColumn,
  updateGradeColumn, deleteGradeColumn, upsertGradeScores,
  fmtScore, toTen, weightedAverage, classify, rankOf,
  type GradeColumn, type GradeScore,
} from '@/services/gradesService'

/** Nhận cả '8.5' và '8,5' — bàn phím tiếng Việt hay ra dấu phẩy. */
function parseScore(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!text) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : NaN
}

type DraftRow = { score: string; comment: string }
type ColumnForm = { title: string; exam_date: string; max_score: string; weight: string; note: string }

const EMPTY_FORM: ColumnForm = {
  title: '',
  exam_date: format(new Date(), 'yyyy-MM-dd'),
  max_score: '10',
  weight: '1',
  note: '',
}

export default function Grades() {
  const { classes, students, enrollments, loadClasses, loadStudents, loadEnrollments } = useDataStore()

  const [selClass, setSelClass]   = useState('')
  const [columns, setColumns]     = useState<GradeColumn[]>([])
  const [scores, setScores]       = useState<GradeScore[]>([])
  const [activeId, setActiveId]   = useState('')
  const [view, setView]           = useState<'entry' | 'matrix'>('entry')

  const [draft, setDraft]   = useState<Record<string, DraftRow>>({})
  const [dirty, setDirty]   = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Modal tạo / sửa cột điểm
  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<GradeColumn | null>(null)
  const [form, setForm]           = useState<ColumnForm>(EMPTY_FORM)
  const [savingCol, setSavingCol] = useState(false)

  // Gửi Zalo
  const [autoZalo, setAutoZalo] = useState<{ title: string; recipients: ZaloRecipient[] } | null>(null)
  const [sentLog, setSentLog]   = useState<ZaloSentMap>({})

  // Nhấn Enter để nhảy sang ô điểm của em tiếp theo.
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    void loadClasses()
    void loadStudents()
    void loadEnrollments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleClasses = classes.filter(c => c.status === 'active')

  const enrolledStudents = useMemo(() => (
    selClass
      ? enrollments
          .filter(e => e.class_id === selClass && e.status === 'active')
          .map(e => students.find(s => s.id === e.student_id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined)
          .sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))
      : []
  ), [selClass, enrollments, students])

  const activeColumn = columns.find(c => c.id === activeId) ?? null

  const className = (() => {
    const c = classes.find(x => x.id === selClass) as any
    return c ? (c.class_name || c.name || '') : ''
  })()

  /* ── Tải cột điểm + toàn bộ điểm của lớp ───────────────────────────────── */
  const reload = async (classId: string, keepActive?: string) => {
    setLoaded(false)
    try {
      const cols = await listGradeColumns(classId)
      setColumns(cols)
      setScores(await listScoresByColumns(cols.map(c => c.id)))

      const next = keepActive && cols.some(c => c.id === keepActive) ? keepActive : (cols[0]?.id ?? '')
      setActiveId(next)
    } catch (e: any) {
      toast.error(e.message || 'Không tải được bảng điểm')
      setColumns([])
      setScores([])
      setActiveId('')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    if (!selClass) {
      setColumns([]); setScores([]); setActiveId(''); setLoaded(false)
      return
    }
    setDirty(false)
    void reload(selClass)
  }, [selClass]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Dựng draft từ điểm đã lưu của cột đang chọn ───────────────────────── */
  useEffect(() => {
    if (!activeId) { setDraft({}); return }

    const next: Record<string, DraftRow> = {}
    for (const s of enrolledStudents) {
      const rec = scores.find(x => x.column_id === activeId && x.student_id === s.id)
      next[s.id] = {
        score: rec?.score === null || rec?.score === undefined ? '' : String(rec.score),
        comment: rec?.comment ?? '',
      }
    }
    setDraft(next)
    setDirty(false)
  }, [activeId, scores, enrolledStudents])

  /* ── Nhật ký gửi Zalo, khóa theo id cột điểm ───────────────────────────── */
  const zaloLog: ZaloLogRef | undefined =
    selClass && activeId ? { kind: 'GRADES', classId: selClass, periodKey: activeId } : undefined

  const refreshSentLog = async () => {
    if (!zaloLog) return
    try {
      setSentLog(await fetchZaloSentLog(zaloLog))
    } catch {
      // Mất nhật ký thì chỉ mất phần cảnh báo gửi trùng, không chặn gửi.
      setSentLog({})
    }
  }

  useEffect(() => {
    setSentLog({})
    void refreshSentLog()
  }, [selClass, activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Thống kê cột đang chọn ────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const values = Object.values(draft)
      .map(d => parseScore(d.score))
      .filter((v): v is number => v !== null && Number.isFinite(v))

    if (values.length === 0) return { count: 0, avg: null as number | null, max: null as number | null, min: null as number | null }
    return {
      count: values.length,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
      max: Math.max(...values),
      min: Math.min(...values),
    }
  }, [draft])

  /** Điểm đã LƯU của cột (để tính hạng khi soạn tin — không lấy từ draft). */
  const savedScoresOf = (columnId: string) =>
    scores.filter(s => s.column_id === columnId && s.score !== null).map(s => Number(s.score))

  /* ── Nhập liệu ─────────────────────────────────────────────────────────── */
  const setCell = (sid: string, field: keyof DraftRow, value: string) => {
    setDirty(true)
    setDraft(d => ({ ...d, [sid]: { ...(d[sid] ?? { score: '', comment: '' }), [field]: value } }))
  }

  const save = async () => {
    if (!activeColumn) return
    const max = Number(activeColumn.max_score)

    const rows: Array<{ column_id: string; student_id: string; score: number | null; comment: string | null }> = []
    const badNames: string[] = []

    for (const s of enrolledStudents) {
      const d = draft[s.id] ?? { score: '', comment: '' }
      const value = parseScore(d.score)

      if (value !== null && (Number.isNaN(value) || value < 0 || value > max)) {
        badNames.push(s.full_name)
        continue
      }

      rows.push({
        column_id: activeColumn.id,
        student_id: s.id,
        score: value,
        comment: d.comment.trim() || null,
      })
    }

    if (badNames.length > 0) {
      toast.error(`Điểm phải trong khoảng 0–${fmtScore(max)}: ${badNames.slice(0, 3).join(', ')}${badNames.length > 3 ? '…' : ''}`)
      return
    }

    setSaving(true)
    try {
      await upsertGradeScores(rows)
      setDirty(false)
      toast.success(`✅ Đã lưu ${rows.filter(r => r.score !== null).length} điểm — ${activeColumn.title}`)
      await reload(selClass, activeColumn.id)
    } catch (e: any) {
      toast.error(e.message || 'Không lưu được điểm')
    } finally {
      setSaving(false)
    }
  }

  /* ── Cột điểm: tạo / sửa / xóa ─────────────────────────────────────────── */
  const openCreate = () => {
    if (!selClass) return toast.error('Chọn lớp trước')
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (col: GradeColumn) => {
    setEditing(col)
    setForm({
      title: col.title,
      exam_date: col.exam_date ?? format(new Date(), 'yyyy-MM-dd'),
      max_score: String(col.max_score),
      weight: String(col.weight),
      note: col.note ?? '',
    })
    setFormOpen(true)
  }

  const submitColumn = async () => {
    const title = form.title.trim()
    if (!title) return toast.error('Nhập tên bài kiểm tra')

    const maxScore = Number(form.max_score.replace(',', '.'))
    const weight   = Number(form.weight.replace(',', '.'))
    if (!Number.isFinite(maxScore) || maxScore <= 0) return toast.error('Điểm tối đa phải là số lớn hơn 0')
    if (!Number.isFinite(weight) || weight < 0)      return toast.error('Hệ số phải là số không âm')

    setSavingCol(true)
    try {
      if (editing) {
        await updateGradeColumn(editing.id, {
          title, exam_date: form.exam_date || null, max_score: maxScore, weight, note: form.note.trim() || null,
        })
        toast.success('Đã cập nhật bài kiểm tra')
        await reload(selClass, editing.id)
      } else {
        const created = await createGradeColumn({
          class_id: selClass,
          title,
          exam_date: form.exam_date || null,
          max_score: maxScore,
          weight,
          note: form.note.trim() || null,
        })
        toast.success('Đã tạo cột điểm mới')
        await reload(selClass, created.id)
        setView('entry')
      }
      setFormOpen(false)
    } catch (e: any) {
      toast.error(e.message || 'Không lưu được bài kiểm tra')
    } finally {
      setSavingCol(false)
    }
  }

  const removeColumn = async (col: GradeColumn) => {
    const entered = scores.filter(s => s.column_id === col.id && s.score !== null).length
    const warning = entered > 0
      ? `Cột "${col.title}" đang có ${entered} điểm. Xóa cột là xóa luôn các điểm này. Tiếp tục?`
      : `Xóa cột "${col.title}"?`

    if (!window.confirm(warning)) return

    try {
      await deleteGradeColumn(col.id)
      toast.success('Đã xóa cột điểm')
      await reload(selClass)
    } catch (e: any) {
      toast.error(e.message || 'Không xóa được')
    }
  }

  /* ── Bảng tổng hợp ─────────────────────────────────────────────────────── */
  const scoreAt = (studentId: string, columnId: string) => {
    const rec = scores.find(s => s.student_id === studentId && s.column_id === columnId)
    return rec?.score === null || rec?.score === undefined ? null : Number(rec.score)
  }

  const averageOf = (studentId: string) =>
    weightedAverage(columns.map(col => ({
      score: scoreAt(studentId, col.id),
      maxScore: Number(col.max_score),
      weight: Number(col.weight),
    })))

  const exportCsv = () => {
    if (columns.length === 0) return toast.error('Lớp này chưa có cột điểm nào')

    const header = ['Mã HS', 'Họ tên', ...columns.map(c => `${c.title} (/${fmtScore(Number(c.max_score))})`), 'TB (thang 10)']
    const lines = enrolledStudents.map(s => [
      s.student_code,
      s.full_name,
      ...columns.map(c => {
        const v = scoreAt(s.id, c.id)
        return v === null ? '' : fmtScore(v)
      }),
      fmtScore(averageOf(s.id)),
    ])

    // \uFEFF để Excel nhận UTF-8, không thì tên tiếng Việt thành ký tự lạ.
    const csv = '\uFEFF' + [header, ...lines]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `bang-diem-${className || 'lop'}-${format(new Date(), 'yyyyMMdd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Soạn tin Zalo ─────────────────────────────────────────────────────── */
  const buildMessage = (student: any) => {
    if (!activeColumn) return ''

    const saved = savedScoresOf(activeColumn.id)
    const value = scoreAt(student.id, activeColumn.id)
    const max   = Number(activeColumn.max_score)
    const avg   = saved.length ? saved.reduce((a, b) => a + b, 0) / saved.length : null
    const comment = (scores.find(s => s.column_id === activeColumn.id && s.student_id === student.id)?.comment ?? '').trim()
    const overall = averageOf(student.id)

    return [
      '📊 Kết quả kiểm tra',
      '----------------------------',
      `Bài: ${activeColumn.title}`,
      activeColumn.exam_date ? `Ngày: ${fmt(activeColumn.exam_date)}` : '',
      `Học sinh: ${student.full_name}`,
      className ? `Lớp: ${className}` : '',
      '----------------------------',
      value === null
        ? 'Điểm: chưa có (vắng kiểm tra)'
        : `Điểm: ${fmtScore(value)}/${fmtScore(max)}`,
      value !== null && saved.length > 1
        ? `Hạng trong lớp: ${rankOf(value, saved)}/${saved.length}`
        : '',
      avg !== null ? `Điểm trung bình lớp: ${fmtScore(avg)}/${fmtScore(max)}` : '',
      overall !== null ? `Trung bình cả kỳ: ${fmtScore(overall)}/10 (${classify(overall)})` : '',
      comment ? `Nhận xét: ${comment}` : '',
      '----------------------------',
      'Trung tâm xin thông báo để phụ huynh nắm được tình hình học tập của con.',
    ].filter(Boolean).join('\n')
  }

  const toRecipient = (student: any): ZaloRecipient => ({
    id: student.id,
    name: student.full_name,
    // Ưu tiên cột zalo, không có thì lùi về parent_phone.
    phone: student.zalo || student.parent_phone || '',
    message: buildMessage(student),
  })

  const openZalo = (list: any[], title: string) => {
    if (!activeColumn) return toast.error('Chọn cột điểm trước')
    if (list.length === 0) return toast.error('Không có học sinh nào để gửi')
    if (dirty) return toast.error('Bạn còn điểm chưa lưu. Bấm "Lưu điểm" trước khi gửi.')
    setAutoZalo({ title, recipients: list.map(toRecipient) })
  }

  // Chỉ gửi cho phụ huynh của em ĐÃ có điểm lưu trong cột này.
  const notifiable = activeColumn
    ? enrolledStudents.filter(s => scoreAt(s.id, activeColumn.id) !== null)
    : []

  /* ── Giao diện ─────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-teal-600" /> Nhập điểm
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Mỗi bài kiểm tra là một cột điểm. Điểm nhập ở đây hiện luôn trong phiếu học tập của học sinh.
          </p>
        </div>
      </div>

      {/* ── Chọn lớp ── */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Chọn lớp</label>
            <select value={selClass} onChange={e => setSelClass(e.target.value)} className="input">
              <option value="">— Chọn lớp —</option>
              {visibleClasses.map(c => (
                <option key={c.id} value={c.id}>
                  {(c as any).class_name || (c as any).name} ({(c as any).subject})
                </option>
              ))}
            </select>
          </div>
          <button onClick={openCreate} disabled={!selClass} className="btn-teal flex items-center gap-2 disabled:opacity-40">
            <Plus className="w-4 h-4" /> Bài kiểm tra mới
          </button>
        </div>
      </div>

      {selClass && (
        <>
          {/* ── Danh sách cột điểm đã nhập ── */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-800 text-gray-800 text-sm">
                Các cột điểm đã có {columns.length > 0 && <span className="text-gray-400">({columns.length})</span>}
              </h2>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setView('entry')}
                  className={`text-xs font-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                    view === 'entry' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" /> Nhập điểm
                </button>
                <button
                  onClick={() => setView('matrix')}
                  className={`text-xs font-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                    view === 'matrix' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" /> Bảng tổng hợp
                </button>
              </div>
            </div>

            {!loaded ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-7 h-7 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
              </div>
            ) : columns.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">
                Chưa có bài kiểm tra nào. Bấm <strong>Bài kiểm tra mới</strong> để tạo cột điểm đầu tiên.
              </p>
            ) : (
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {columns.map(col => {
                  const entered = scores.filter(s => s.column_id === col.id && s.score !== null).length
                  const isActive = col.id === activeId
                  return (
                    <div
                      key={col.id}
                      onClick={() => setActiveId(col.id)}
                      className={`shrink-0 w-56 rounded-xl border-2 p-3 cursor-pointer transition-all ${
                        isActive
                          ? 'border-teal-500 bg-teal-50 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-teal-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-800 text-sm text-gray-800 leading-snug line-clamp-2">{col.title}</p>
                        <div className="flex gap-0.5 shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(col) }}
                            className="p-1 text-gray-400 hover:text-teal-600 rounded"
                            title="Sửa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); void removeColumn(col) }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="Xóa cột điểm"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {col.exam_date ? fmt(col.exam_date) : 'Chưa đặt ngày'} · thang {fmtScore(Number(col.max_score))}
                        {Number(col.weight) !== 1 && ` · hệ số ${fmtScore(Number(col.weight))}`}
                      </p>
                      <p className={`text-xs font-700 mt-2 ${
                        entered === 0 ? 'text-gray-400'
                        : entered < enrolledStudents.length ? 'text-amber-600'
                        : 'text-green-600'
                      }`}>
                        Đã nhập {entered}/{enrolledStudents.length} HS
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Nhập điểm cho cột đang chọn ── */}
          {view === 'entry' && activeColumn && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-3 flex-wrap">
                  <div className="bg-teal-100 text-teal-700 px-3 py-1.5 rounded-xl text-sm font-700">
                    Đã nhập: {stats.count}/{enrolledStudents.length}
                  </div>
                  <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-xl text-sm font-700">
                    TB lớp: {fmtScore(stats.avg)}
                  </div>
                  <div className="bg-green-100 text-green-700 px-3 py-1.5 rounded-xl text-sm font-700">
                    Cao nhất: {fmtScore(stats.max)}
                  </div>
                  <div className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl text-sm font-700">
                    Thấp nhất: {fmtScore(stats.min)}
                  </div>
                </div>

                <div className="flex gap-2 ml-auto flex-wrap">
                  <button onClick={save} disabled={saving || !loaded} className="btn-teal flex items-center gap-2 text-sm py-2">
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Đang lưu...' : 'Lưu điểm'}
                  </button>
                  <button
                    onClick={() => openZalo(notifiable, `Điểm ${activeColumn.title} — cả lớp`)}
                    disabled={notifiable.length === 0}
                    className="btn-outline text-sm py-2 px-4 flex items-center gap-1.5 disabled:opacity-40"
                    title="Gửi điểm cho phụ huynh của những em đã có điểm"
                  >
                    <MessageCircle className="w-4 h-4" /> Gửi Zalo ({notifiable.length})
                  </button>
                </div>
              </div>

              <div className="card overflow-hidden">
                {enrolledStudents.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Chưa có học sinh trong lớp này</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
                        <th className="px-4 py-3 text-left text-white font-700 text-xs">#</th>
                        <th className="px-4 py-3 text-left text-white font-700 text-xs">Học sinh</th>
                        <th className="px-4 py-3 text-center text-white font-700 text-xs w-32">
                          Điểm /{fmtScore(Number(activeColumn.max_score))}
                        </th>
                        <th className="px-4 py-3 text-left text-white font-700 text-xs">Nhận xét</th>
                        <th className="px-4 py-3 text-center text-white font-700 text-xs">TB kỳ</th>
                        <th className="px-4 py-3 text-center text-white font-700 text-xs">Zalo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolledStudents.map((s, i) => {
                        const d = draft[s.id] ?? { score: '', comment: '' }
                        const value = parseScore(d.score)
                        const invalid = value !== null && (Number.isNaN(value) || value < 0 || value > Number(activeColumn.max_score))
                        const overall = averageOf(s.id)

                        return (
                          <tr key={s.id} className="border-b border-teal-50 hover:bg-teal-50/30 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-700 text-gray-800">{s.full_name}</p>
                              <p className="text-xs text-gray-400">{s.student_code}</p>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input
                                ref={el => { inputRefs.current[i] = el }}
                                value={d.score}
                                onChange={e => setCell(s.id, 'score', e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    inputRefs.current[i + 1]?.focus()
                                  }
                                }}
                                inputMode="decimal"
                                placeholder="—"
                                className={`input text-center font-800 py-1.5 w-20 mx-auto ${
                                  invalid ? 'border-red-400 text-red-600' : ''
                                }`}
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <input
                                value={d.comment}
                                onChange={e => setCell(s.id, 'comment', e.target.value)}
                                placeholder="Nhận xét gửi kèm cho phụ huynh..."
                                className="input text-xs py-1.5 w-full"
                              />
                            </td>
                            <td className="px-4 py-2.5 text-center text-xs font-700 text-gray-600">
                              {fmtScore(overall)}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => openZalo([s], `Điểm ${activeColumn.title} — ${s.full_name}`)}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-100 transition relative"
                                title="Gửi điểm bài này cho phụ huynh"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                {sentLog[s.id] && (
                                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500" />
                                )}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {dirty && (
                <p className="text-xs font-700 text-amber-600">
                  Có thay đổi chưa lưu. Điểm chỉ vào phiếu học tập và gửi được cho phụ huynh sau khi bấm "Lưu điểm".
                </p>
              )}
            </>
          )}

          {/* ── Bảng tổng hợp ── */}
          {view === 'matrix' && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="font-800 text-gray-800 text-sm">Bảng điểm cả lớp</h2>
                <button onClick={exportCsv} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Xuất CSV
                </button>
              </div>

              {columns.length === 0 || enrolledStudents.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Table2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Chưa có dữ liệu để tổng hợp</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-sm min-w-full">
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
                        <th className="px-4 py-3 text-left text-white font-700 text-xs sticky left-0 z-10 bg-teal-600">
                          Học sinh
                        </th>
                        {columns.map(col => (
                          <th key={col.id} className="px-3 py-3 text-center text-white font-700 text-xs whitespace-nowrap">
                            <span title={`${col.title} · thang ${fmtScore(Number(col.max_score))} · hệ số ${fmtScore(Number(col.weight))}`}>
                              {col.title.length > 16 ? `${col.title.slice(0, 16)}…` : col.title}
                            </span>
                            <span className="block text-[10px] opacity-70">/{fmtScore(Number(col.max_score))}</span>
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center text-white font-700 text-xs">TB /10</th>
                        <th className="px-3 py-3 text-center text-white font-700 text-xs">Xếp loại</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolledStudents.map(s => {
                        const overall = averageOf(s.id)
                        return (
                          <tr key={s.id} className="border-b border-teal-50 hover:bg-teal-50/30">
                            <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                              <p className="font-700 text-gray-800 whitespace-nowrap">{s.full_name}</p>
                              <p className="text-xs text-gray-400">{s.student_code}</p>
                            </td>
                            {columns.map(col => {
                              const v = scoreAt(s.id, col.id)
                              const ten = v === null ? null : toTen(v, Number(col.max_score))
                              return (
                                <td key={col.id} className="px-3 py-2.5 text-center">
                                  <span className={`font-800 ${
                                    ten === null ? 'text-gray-300'
                                    : ten >= 8 ? 'text-green-600'
                                    : ten >= 5 ? 'text-gray-700'
                                    : 'text-red-500'
                                  }`}>
                                    {v === null ? '—' : fmtScore(v)}
                                  </span>
                                </td>
                              )
                            })}
                            <td className="px-3 py-2.5 text-center font-800 text-teal-700">{fmtScore(overall)}</td>
                            <td className="px-3 py-2.5 text-center text-xs font-700 text-gray-500 whitespace-nowrap">
                              {classify(overall)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal tạo / sửa cột điểm ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Sửa bài kiểm tra' : 'Bài kiểm tra mới'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Tên bài kiểm tra *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="VD: Kiểm tra 15 phút — Chương 1"
              className="input"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ngày kiểm tra</label>
              <input
                type="date"
                value={form.exam_date}
                onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Điểm tối đa</label>
              <input
                value={form.max_score}
                onChange={e => setForm(f => ({ ...f, max_score: e.target.value }))}
                inputMode="decimal"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Hệ số</label>
            <input
              value={form.weight}
              onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
              inputMode="decimal"
              className="input"
            />
            <p className="text-xs text-gray-400 mt-1">
              Dùng khi tính trung bình. Kiểm tra 15 phút để 1, giữa kỳ để 2, cuối kỳ để 3.
            </p>
          </div>

          <div>
            <label className="label">Ghi chú</label>
            <input
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Nội dung kiểm tra, phạm vi ôn tập..."
              className="input"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setFormOpen(false)} className="btn-outline flex-1">Hủy</button>
            <button onClick={submitColumn} disabled={savingCol} className="btn-teal flex-1 flex items-center justify-center gap-2">
              {savingCol ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editing ? 'Cập nhật' : 'Tạo cột điểm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Hộp thoại gửi Zalo ── */}
      <ZaloSendDialog
        open={!!autoZalo}
        title={autoZalo?.title ?? 'Gửi Zalo'}
        recipients={autoZalo?.recipients ?? []}
        log={zaloLog}
        sentLog={sentLog}
        onSent={refreshSentLog}
        onClose={() => setAutoZalo(null)}
        // Cho đính kèm để giáo viên gửi ảnh bài làm hoặc đáp án.
        allowAttachments
      />
    </div>
  )
}
