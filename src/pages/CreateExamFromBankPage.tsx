// @ts-nocheck
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, Filter, Plus, Minus, Trash2, RefreshCw, Eye, ChevronUp, ChevronDown, Save } from 'lucide-react'
import { useQuestionBankStore } from '@/store/questionBankStore'
import { useExamStore } from '@/store/examStore'
import { createDefaultPointsConfig } from '@/services/scoringService'
import MathText from '@/components/MathText'
import Modal from '@/components/Modal'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────
const GRADES = [6, 7, 8, 9, 10, 11, 12]
const DIFFICULTY_MAP = {
  know:       { label: 'Nhận biết',  color: 'bg-green-100 text-green-700 border-green-200' },
  understand: { label: 'Thông hiểu', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  apply:      { label: 'Vận dụng',   color: 'bg-orange-100 text-orange-700 border-orange-200' },
}
const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'TN',
  true_false:      'ĐS',
  short_answer:    'TLN',
  writing:         'TL',
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>{text}</span>
}

// ─── Renumber questions by type for exam format ───────────────────────────────
function buildExamQuestions(selected: any[]) {
  const counters: Record<string, number> = {
    multiple_choice: 0, true_false: 0, short_answer: 0, writing: 0,
  }
  const partMap: Record<string, number> = {
    multiple_choice: 1, true_false: 2, short_answer: 3, writing: 4,
  }

  return selected.map(item => {
    const q = { ...item.question_data }
    const type = q.type || 'multiple_choice'
    const part = partMap[type] ?? 1
    counters[type] = (counters[type] || 0) + 1
    return {
      ...q,
      number: part * 100 + counters[type],
      part,
    }
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreateExamFromBankPage() {
  const navigate = useNavigate()
  const { questions, loading, topics, loadQuestions, loadTopics } = useQuestionBankStore()
  const { createExam } = useExamStore()

  // Filters
  const [filterGrade,  setFilterGrade]  = useState<number | null>(null)
  const [filterTopic,  setFilterTopic]  = useState('')
  const [filterDiff,   setFilterDiff]   = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [search,       setSearch]       = useState('')

  // Selected questions (ordered)
  const [selected, setSelected] = useState<any[]>([])

  // Exam settings
  const [title,     setTitle]     = useState('')
  const [timeLimit, setTimeLimit] = useState(45)

  // UI
  const [previewQ,  setPreviewQ]  = useState<any>(null)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    void loadQuestions()
    void loadTopics()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => {
    loadQuestions({
      grade:         filterGrade ?? undefined,
      topic:         filterTopic || undefined,
      difficulty:    filterDiff  || undefined,
      question_type: filterType  || undefined,
    })
  }

  const clearFilters = () => {
    setFilterGrade(null); setFilterTopic(''); setFilterDiff(''); setFilterType(''); setSearch('')
    loadQuestions()
  }

  // Client-side search
  const displayed = useMemo(() => {
    if (!search.trim()) return questions
    const q = search.toLowerCase()
    return questions.filter(item =>
      item.question_data?.text?.toLowerCase().includes(q) ||
      item.topic?.toLowerCase().includes(q)
    )
  }, [questions, search])

  // IDs already selected
  const selectedIds = useMemo(() => new Set(selected.map(s => s.id)), [selected])

  const addQuestion = (item: any) => {
    if (selectedIds.has(item.id)) return
    setSelected(prev => [...prev, item])
  }

  const removeQuestion = (id: string) => {
    setSelected(prev => prev.filter(s => s.id !== id))
  }

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = [...selected]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSelected(next)
  }

  // Stats
  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of selected) {
      const t = s.question_type || 'multiple_choice'
      counts[t] = (counts[t] || 0) + 1
    }
    return counts
  }, [selected])

  const handleSave = async () => {
    if (!title.trim())       return toast.error('Vui lòng nhập tên đề thi')
    if (selected.length === 0) return toast.error('Chọn ít nhất 1 câu hỏi')

    setSaving(true)
    try {
      const questions = buildExamQuestions(selected)
      const pointsConfig = createDefaultPointsConfig(questions)

      const examData = {
        title: title.trim(),
        timeLimit,
        questions,
        sections: [],
        answers:  {},
        pointsConfig,
        source: 'question_bank',
      }

      const examId = await createExam(examData, title.trim())
      toast.success(`Tạo đề "${title}" thành công! (${selected.length} câu)`)
      navigate('/exams')
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi tạo đề')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Wand2 className="w-7 h-7 text-teal-600" /> Tạo đề từ ngân hàng câu hỏi
          </h1>
          <p className="text-gray-400 text-sm mt-1">Chọn câu hỏi từ ngân hàng, sắp xếp và lưu thành đề thi</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || selected.length === 0 || !title.trim()}
          className="btn-teal flex items-center gap-2 shadow-lg shadow-teal-500/20 disabled:opacity-50"
        >
          {saving
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang lưu...</>
            : <><Save className="w-4 h-4" /> Lưu đề thi</>}
        </button>
      </div>

      {/* Exam settings bar */}
      <div className="card p-4 flex flex-wrap gap-4 items-end bg-gradient-to-r from-teal-50 to-white border-teal-200">
        <div className="flex-1 min-w-48">
          <label className="block text-xs font-bold text-gray-600 mb-1.5">Tên đề thi *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="VD: Kiểm tra 15 phút - Hàm số - Lớp 12"
            className="input"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs font-bold text-gray-600 mb-1.5">Thời gian (phút)</label>
          <input
            type="number"
            value={timeLimit}
            onChange={e => setTimeLimit(Number(e.target.value))}
            className="input text-center font-bold"
            min={5} max={180}
          />
        </div>
        {/* Stats */}
        <div className="flex gap-3 ml-auto">
          {Object.entries(stats).map(([type, count]) => (
            <div key={type} className="text-center bg-white rounded-xl border border-gray-200 px-3 py-1.5 shadow-sm">
              <p className="text-lg font-black text-teal-700">{count}</p>
              <p className="text-[10px] font-bold text-gray-500">{TYPE_LABEL[type] || type}</p>
            </div>
          ))}
          <div className="text-center bg-teal-600 rounded-xl px-3 py-1.5 shadow-sm">
            <p className="text-lg font-black text-white">{selected.length}</p>
            <p className="text-[10px] font-bold text-teal-100">Tổng</p>
          </div>
        </div>
      </div>

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT: Question bank browser */}
        <div className="space-y-3">
          <h2 className="font-bold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-teal-600 text-white rounded-full text-xs flex items-center justify-center font-black">1</span>
            Chọn câu từ ngân hàng
          </h2>

          {/* Filters */}
          <div className="card p-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select value={filterGrade ?? ''} onChange={e => setFilterGrade(e.target.value ? Number(e.target.value) : null)} className="input text-sm py-2">
                <option value="">Tất cả lớp</option>
                {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
              </select>
              <input value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
                placeholder="Chủ đề..." className="input text-sm py-2" list="bank-topics" />
              <datalist id="bank-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
              <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)} className="input text-sm py-2">
                <option value="">Mức độ</option>
                {Object.entries(DIFFICULTY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input text-sm py-2">
                <option value="">Loại</option>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm nội dung câu hỏi..." className="input text-sm py-2 flex-1" />
              <button onClick={applyFilters} className="btn-teal px-3 py-2 text-sm">Lọc</button>
              <button onClick={clearFilters} className="btn-outline px-3 py-2 text-sm">Xóa</button>
            </div>
          </div>

          {/* Question list */}
          <div className="card overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
              {loading ? (
                <div className="py-10 text-center"><RefreshCw className="w-5 h-5 animate-spin text-teal-500 mx-auto" /></div>
              ) : displayed.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">Không có câu hỏi nào. Hãy thay đổi bộ lọc.</div>
              ) : (
                displayed.map(item => {
                  const diff = DIFFICULTY_MAP[item.difficulty as keyof typeof DIFFICULTY_MAP]
                  const isAdded = selectedIds.has(item.id)
                  return (
                    <div key={item.id} className={`flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors ${isAdded ? 'bg-teal-50/50' : ''}`}>
                      {/* Add/added button */}
                      <button
                        onClick={() => isAdded ? removeQuestion(item.id) : addQuestion(item)}
                        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all border-2 mt-0.5 ${
                          isAdded
                            ? 'bg-teal-600 border-teal-700 text-white hover:bg-red-500 hover:border-red-600'
                            : 'bg-white border-gray-300 text-gray-400 hover:border-teal-500 hover:text-teal-600'
                        }`}
                        title={isAdded ? 'Bỏ chọn' : 'Thêm vào đề'}
                      >
                        {isAdded ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1 mb-1">
                          <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">Lớp {item.grade}</span>
                          <span className="text-[10px] font-bold text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">{item.topic}</span>
                          {diff && <Badge text={diff.label} color={diff.color} />}
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">{TYPE_LABEL[item.question_type] || item.question_type}</span>
                        </div>
                        <div className="text-sm text-gray-700 line-clamp-2 leading-snug">
                          <MathText html={item.question_data?.text || ''} className="text-sm text-gray-700" />
                        </div>
                      </div>

                      {/* Preview button */}
                      <button
                        onClick={() => setPreviewQ(item)}
                        className="shrink-0 p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                        title="Xem trước"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
              <span>{displayed.length} câu trong ngân hàng</span>
              <span className="text-teal-600 font-bold">{selectedIds.size} đã chọn</span>
            </div>
          </div>
        </div>

        {/* RIGHT: Selected questions */}
        <div className="space-y-3">
          <h2 className="font-bold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-teal-600 text-white rounded-full text-xs flex items-center justify-center font-black">2</span>
            Câu hỏi trong đề ({selected.length})
          </h2>

          <div className="card overflow-hidden">
            {selected.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Wand2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-gray-500">Chưa chọn câu hỏi nào</p>
                <p className="text-sm mt-1">Nhấn nút <strong>+</strong> ở cột bên trái để thêm</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
                {selected.map((item, idx) => {
                  const diff = DIFFICULTY_MAP[item.difficulty as keyof typeof DIFFICULTY_MAP]
                  return (
                    <div key={item.id} className="flex items-start gap-2 p-3 hover:bg-gray-50 transition-colors group">
                      {/* Order number */}
                      <span className="w-6 h-6 bg-teal-100 text-teal-700 rounded-full text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1 mb-1">
                          <span className="text-[10px] font-bold text-gray-500">{item.topic}</span>
                          {diff && <Badge text={diff.label} color={diff.color} />}
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">{TYPE_LABEL[item.question_type] || item.question_type}</span>
                        </div>
                        <div className="text-sm text-gray-700 line-clamp-2">
                          <MathText html={item.question_data?.text || ''} className="text-sm text-gray-700" />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 transition-all" title="Lên">
                          <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        <button onClick={() => moveQuestion(idx, 1)} disabled={idx === selected.length - 1}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30 transition-all" title="Xuống">
                          <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        <button onClick={() => removeQuestion(item.id)}
                          className="p-1 hover:bg-red-100 rounded transition-all" title="Xóa">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {selected.length > 0 && (
              <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <button onClick={() => setSelected([])} className="text-xs text-red-500 hover:text-red-700 font-bold transition-colors">
                  Xóa tất cả
                </button>
                <div className="flex gap-2 text-xs text-gray-500">
                  {Object.entries(stats).map(([type, count]) => (
                    <span key={type}>{TYPE_LABEL[type]}: <strong className="text-teal-700">{count}</strong></span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save reminder */}
          {selected.length > 0 && title.trim() && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-bold text-teal-800 text-sm">Sẵn sàng tạo đề</p>
                <p className="text-teal-700 text-xs mt-0.5">
                  "<strong>{title}</strong>" · {selected.length} câu · {timeLimit} phút
                </p>
              </div>
              <button onClick={handleSave} disabled={saving}
                className="ml-auto btn-teal px-5 py-2 text-sm font-bold shadow-md shrink-0">
                {saving ? 'Đang lưu...' : 'Lưu đề →'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      <Modal open={!!previewQ} onClose={() => setPreviewQ(null)} title="Xem câu hỏi" size="lg">
        {previewQ && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge text={`Lớp ${previewQ.grade}`} color="bg-teal-100 text-teal-700 border-teal-200" />
              <Badge text={previewQ.topic} color="bg-purple-100 text-purple-700 border-purple-200" />
              {DIFFICULTY_MAP[previewQ.difficulty as keyof typeof DIFFICULTY_MAP] && (
                <Badge
                  text={DIFFICULTY_MAP[previewQ.difficulty as keyof typeof DIFFICULTY_MAP].label}
                  color={DIFFICULTY_MAP[previewQ.difficulty as keyof typeof DIFFICULTY_MAP].color}
                />
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
              <MathText html={previewQ.question_data?.text || ''} block className="text-gray-800 font-medium text-sm leading-relaxed" />
              {previewQ.question_data?.images?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {previewQ.question_data.images.map((img: any, i: number) => {
                    const src = img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}`
                      : img.data ? `data:${img.type || 'image/png'};base64,${img.data}` : null
                    return src ? <img key={i} src={src} className="max-h-48 rounded-lg border border-gray-200 object-contain" /> : null
                  })}
                </div>
              )}
              {previewQ.question_data?.options?.map((opt: any, idx: number) => {
                const letter = (opt.letter || String.fromCharCode(65 + idx)).toUpperCase()
                const isCorrect = previewQ.question_data?.type === 'multiple_choice'
                  ? letter === previewQ.question_data?.correctAnswer?.toUpperCase()
                  : previewQ.question_data?.correctAnswer?.toLowerCase().includes(letter.toLowerCase())
                return (
                  <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded-xl border ${
                    isCorrect ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-100'
                  }`}>
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                      isCorrect ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>{letter}</span>
                    <MathText html={opt.text || ''} className={`text-sm ${isCorrect ? 'text-blue-800 font-semibold' : 'text-gray-700'}`} />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between pt-2">
              <button
                onClick={() => {
                  if (selectedIds.has(previewQ.id)) removeQuestion(previewQ.id)
                  else addQuestion(previewQ)
                  setPreviewQ(null)
                }}
                className={selectedIds.has(previewQ.id) ? 'btn-outline text-red-500 border-red-200 px-6 py-2' : 'btn-teal px-6 py-2'}
              >
                {selectedIds.has(previewQ.id) ? '− Bỏ khỏi đề' : '+ Thêm vào đề'}
              </button>
              <button onClick={() => setPreviewQ(null)} className="btn-outline px-6 py-2">Đóng</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
