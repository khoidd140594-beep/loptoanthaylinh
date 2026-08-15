// @ts-nocheck
import { useEffect, useState, useRef } from 'react'
import MathText from '@/components/MathText'
import {
  Database, Plus, Search, Filter, Trash2, Eye, Pencil, RefreshCw,
  Upload, ChevronDown, Check, X, FileText, AlertCircle, CheckSquare, Square, Sparkles, Paperclip, Image as ImageIcon
} from 'lucide-react'
import { useQuestionBankStore } from '@/store/questionBankStore'
import { useAuthStore } from '@/store/authStore'
import { parseWordToExam } from '@/services/mathWordParserService'
import { parseTexToExam } from '@/services/texParserService'
import { createDefaultPointsConfig } from '@/services/scoringService'
import Modal from '@/components/Modal'
import SimilarQuestionModal from '@/components/SimilarQuestionModal'
import ImageAttachModal, { AttachedImage } from '@/components/ImageAttachModal'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────────────────────────
const GRADES = [6, 7, 8, 9, 10, 11, 12]

const DIFFICULTY_MAP = {
  know:       { label: 'Nhận biết',   color: 'bg-green-100 text-green-700 border-green-200' },
  understand: { label: 'Thông hiểu',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
  apply:      { label: 'Vận dụng',    color: 'bg-orange-100 text-orange-700 border-orange-200' },
}

const TYPE_MAP: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false:      'Đúng/Sai',
  short_answer:    'Trả lời ngắn',
  writing:         'Tự luận',
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {text}
    </span>
  )
}

function QuestionPreview({ q }: { q: any }) {
  return (
    <div className="space-y-3">
      {/* Nội dung câu hỏi */}
      <MathText html={q.text} block className="text-gray-800 font-medium text-sm leading-relaxed" />

      {/* Hình ảnh đính kèm câu hỏi */}
      {q.images && q.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {q.images.map((img: any, idx: number) => {
            const src = img.base64
              ? `data:${img.contentType || img.type || 'image/png'};base64,${img.base64}`
              : img.data
              ? `data:${img.type || 'image/png'};base64,${img.data}`
              : null
            if (!src) return null
            return (
              <img key={idx} src={src} alt={`Hình ${idx + 1}`}
                className="max-h-48 max-w-full rounded-lg border border-gray-200 shadow-sm object-contain" />
            )
          })}
        </div>
      )}

      {/* Phương án trắc nghiệm — mỗi phương án 1 dòng */}
      {q.type === 'multiple_choice' && q.options && q.options.length > 0 && (
        <div className="space-y-1.5">
          {q.options.map((opt: any, idx: number) => {
            const letter = (opt.letter || String.fromCharCode(65 + idx)).toUpperCase()
            const isCorrect = letter === q.correctAnswer?.toUpperCase()
            return (
              <div key={idx} className={`flex items-start gap-3 px-3 py-2 rounded-xl border ${
                isCorrect ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-100'
              }`}>
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                  isCorrect ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>{letter}</span>
                <div className="flex-1 min-w-0">
                  <MathText html={opt.text} className={`text-sm ${isCorrect ? 'text-blue-800 font-semibold' : 'text-gray-700'}`} />
                  {/* Hình ảnh của phương án */}
                  {opt.images && opt.images.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {opt.images.map((img: any, iIdx: number) => {
                        const src = img.base64
                          ? `data:${img.contentType || img.type || 'image/png'};base64,${img.base64}`
                          : img.data ? `data:${img.type || 'image/png'};base64,${img.data}` : null
                        return src ? <img key={iIdx} src={src} alt="" className="max-h-32 rounded border border-gray-200 object-contain" /> : null
                      })}
                    </div>
                  )}
                </div>
                {isCorrect && <span className="text-blue-500 shrink-0 font-bold text-sm">✓</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Mệnh đề đúng/sai */}
      {q.type === 'true_false' && q.options && q.options.length > 0 && (
        <div className="space-y-1.5">
          {q.options.map((opt: any, idx: number) => {
            const letter = (opt.letter || String.fromCharCode(97 + idx)).toLowerCase()
            const isTrue = q.correctAnswer?.toLowerCase().includes(letter)
            return (
              <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded-xl border ${
                isTrue ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`}>
                <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 mt-0.5 ${
                  isTrue ? 'bg-emerald-500 text-white' : 'bg-red-400 text-white'
                }`}>{letter.toUpperCase()}: {isTrue ? 'Đ' : 'S'}</span>
                <MathText html={opt.text} className="text-sm text-gray-700 leading-relaxed flex-1" />
              </div>
            )
          })}
        </div>
      )}

      {/* Đáp án trả lời ngắn */}
      {q.correctAnswer && q.type === 'short_answer' && (
        <div className="inline-block bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
          <span className="text-orange-800 font-bold text-sm">Đáp án: </span>
          <span className="text-orange-900 font-bold text-lg ml-1">{q.correctAnswer}</span>
        </div>
      )}
    </div>
  )
}

// ─── Step 1: Upload & Parse ───────────────────────────────────────────────────
function StepUpload({ onParsed }: { onParsed: (questions: any[], fileName: string) => void }) {
  const [fileType, setFileType] = useState<'word' | 'tex'>('word')
  const [parsing, setParsing] = useState(false)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setParsing(true)
    setProgressLog([])
    try {
      let examData: any
      if (fileType === 'word') {
        setProgressLog(['Đang phân tích file Word...'])
        examData = await parseWordToExam(file)
      } else {
        examData = await parseTexToExam(file, (msg) => setProgressLog(prev => [...prev, msg]))
      }

      const questions = examData.questions || []
      if (questions.length === 0) {
        toast.error('Không tìm thấy câu hỏi nào trong file')
        return
      }
      toast.success(`Tìm thấy ${questions.length} câu hỏi`)
      onParsed(questions, file.name)
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message || 'Không đọc được file'}`)
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const isWord = fileType === 'word'

  return (
    <div className="space-y-5">
      {/* ── Chọn loại nguồn ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { setFileType('word'); setProgressLog([]) }}
          className={`p-4 rounded-2xl border-2 text-left transition-all ${
            isWord ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-blue-300 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">📄</span>
            <span className={`font-black text-sm ${isWord ? 'text-blue-700' : 'text-gray-700'}`}>
              Ngân hàng Word
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            File <code className="bg-gray-100 px-1 rounded">.docx</code> — câu hỏi định dạng bảng Word thầy/cô soạn sẵn
          </p>
          <div className="mt-2 flex gap-1 flex-wrap">
            {['Trắc nghiệm', 'Đúng/Sai', 'Tự luận'].map(t => (
              <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{t}</span>
            ))}
          </div>
        </button>

        <button
          onClick={() => { setFileType('tex'); setProgressLog([]) }}
          className={`p-4 rounded-2xl border-2 text-left transition-all ${
            !isWord ? 'border-teal-500 bg-teal-50 shadow-sm' : 'border-gray-200 hover:border-teal-300 bg-white'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">∑</span>
            <span className={`font-black text-sm ${!isWord ? 'text-teal-700' : 'text-gray-700'}`}>
              Ngân hàng LaTeX
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            File <code className="bg-gray-100 px-1 rounded">.tex</code> — câu hỏi chuẩn LaTeX, hỗ trợ TikZ và công thức toán
          </p>
          <div className="mt-2 flex gap-1 flex-wrap">
            {['Trắc nghiệm', 'Đúng/Sai', 'Hình TikZ'].map(t => (
              <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">{t}</span>
            ))}
          </div>
        </button>
      </div>

      {/* ── Vùng upload ── */}
      <input
        ref={fileRef}
        type="file"
        accept={isWord ? '.docx' : '.tex'}
        onChange={handleFile}
        className="hidden"
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={parsing}
        className={`w-full py-10 border-2 border-dashed rounded-2xl flex flex-col items-center gap-3 transition disabled:opacity-50 ${
          isWord
            ? 'border-blue-300 text-blue-600 hover:bg-blue-50'
            : 'border-teal-300 text-teal-600 hover:bg-teal-50'
        }`}
      >
        {parsing ? (
          <>
            <RefreshCw className="w-8 h-8 animate-spin" />
            <span className="font-bold text-sm">
              {progressLog[progressLog.length - 1] || 'Đang xử lý...'}
            </span>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8" />
            <span className="font-bold">
              Nhấn để chọn file {isWord ? '.docx' : '.tex'}
            </span>
            <span className="text-xs text-gray-400">
              {isWord
                ? 'Hỗ trợ file Word (.docx) — câu hỏi định dạng bảng'
                : 'Hỗ trợ cấu trúc \\begin{ex}...\\end{ex}'}
            </span>
          </>
        )}
      </button>

      {/* ── Progress log (chỉ LaTeX) ── */}
      {!isWord && progressLog.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 max-h-40 overflow-y-auto border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-teal-400 font-mono text-xs font-bold">Log phân tích LaTeX</span>
          </div>
          {progressLog.map((msg, i) => (
            <div key={i} className="text-teal-300 font-mono text-xs leading-relaxed">{msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 2: Tag & Review ─────────────────────────────────────────────────────
function StepReview({
  questions, fileName, topics,
  onSave, onBack,
}: {
  questions: any[], fileName: string, topics: string[],
  onSave: (selected: any[], meta: any) => Promise<void>, onBack: () => void
}) {
  const [grade, setGrade] = useState<number>(10)
  const [topic, setTopic] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [showTopicList, setShowTopicList] = useState(false)
  const [difficulty, setDifficulty] = useState<'know' | 'understand' | 'apply'>('know')
  const [selected, setSelected] = useState<Set<number>>(new Set(questions.map((_, i) => i)))
  const [saving, setSaving] = useState(false)
  // Per-question difficulty override
  const [perDiff, setPerDiff] = useState<Record<number, string>>({})
  // Per-question images (chèn thủ công)
  const [questionImages, setQuestionImages] = useState<Record<number, AttachedImage[]>>({})
  const [imageModal, setImageModal] = useState<number | null>(null) // idx câu đang mở modal

  const filteredTopics = topics.filter(t => t.toLowerCase().includes(topicInput.toLowerCase()))

  const toggleAll = () => {
    if (selected.size === questions.length) setSelected(new Set())
    else setSelected(new Set(questions.map((_, i) => i)))
  }

  const handleSave = async () => {
    const finalTopic = topicInput.trim() || topic
    if (!finalTopic) { toast.error('Vui lòng nhập chủ đề'); return }
    if (selected.size === 0) { toast.error('Chọn ít nhất 1 câu hỏi'); return }

    setSaving(true)
    try {
      const items = [...selected].map(idx => {
        const q = questions[idx]
        const imgs = questionImages[idx] || []
        return {
          grade,
          topic: finalTopic,
          difficulty: (perDiff[idx] as any) || difficulty,
          question_type: q.type || 'multiple_choice',
          question_data: {
            ...q,
            images: [...(q.images || []), ...imgs],
          },
          source_file: fileName,
          tags: [],
        }
      })
      await onSave(items, { grade, topic: finalTopic, difficulty })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Meta form */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-teal-50 rounded-2xl border border-teal-100">
        {/* Grade */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1.5">Khối lớp *</label>
          <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="input">
            {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
        </div>

        {/* Topic autocomplete */}
        <div className="relative">
          <label className="block text-xs font-bold text-gray-600 mb-1.5">Chủ đề *</label>
          <input
            value={topicInput}
            onChange={e => { setTopicInput(e.target.value); setShowTopicList(true) }}
            onFocus={() => setShowTopicList(true)}
            onBlur={() => setTimeout(() => setShowTopicList(false), 150)}
            placeholder="VD: Hàm số bậc hai"
            className="input"
          />
          {showTopicList && filteredTopics.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto mt-1">
              {filteredTopics.map(t => (
                <button key={t} onMouseDown={() => { setTopicInput(t); setShowTopicList(false) }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 transition">
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1.5">Mức độ (mặc định)</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value as any)} className="input">
            {Object.entries(DIFFICULTY_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Questions list */}
      <div className="flex items-center justify-between">
        <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-teal-600 hover:text-teal-800">
          {selected.size === questions.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          {selected.size === questions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
        </button>
        <span className="text-sm text-gray-500">Đã chọn <strong>{selected.size}</strong> / {questions.length} câu</span>
      </div>

      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
        {questions.map((q, idx) => {
          const isSelected = selected.has(idx)
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                isSelected ? 'border-teal-400 bg-teal-50/60' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onClick={() => {
                const next = new Set(selected)
                if (next.has(idx)) next.delete(idx); else next.add(idx)
                setSelected(next)
              }}
            >
              <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                isSelected ? 'bg-teal-600 border-teal-600' : 'border-gray-300'
              }`}>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-bold text-gray-500">Câu {idx + 1}</span>
                  <Badge text={TYPE_MAP[q.type] || q.type} color="bg-gray-100 text-gray-600 border-gray-200" />
                  {/* Per-question difficulty */}
                  <select
                    value={perDiff[idx] || ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setPerDiff(p => ({ ...p, [idx]: e.target.value }))}
                    className={`text-xs font-bold px-2 py-0.5 rounded-full border outline-none cursor-pointer ${
                      DIFFICULTY_MAP[(perDiff[idx] || difficulty) as keyof typeof DIFFICULTY_MAP]?.color || ''
                    }`}
                  >
                    <option value="">-- mức độ mặc định --</option>
                    {Object.entries(DIFFICULTY_MAP).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  {/* Nút chèn ảnh */}
                  <button
                    onClick={e => { e.stopPropagation(); setImageModal(idx) }}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border transition ${
                      (questionImages[idx]?.length || 0) > 0
                        ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300'
                    }`}
                    title="Chèn ảnh vào câu hỏi này"
                  >
                    <Paperclip className="w-2.5 h-2.5" />
                    {(questionImages[idx]?.length || 0) > 0
                      ? `${questionImages[idx].length} ảnh`
                      : 'Chèn ảnh'}
                  </button>
                </div>
                <div className="text-sm text-gray-700 line-clamp-2">
                  <MathText html={q.text || ''} className="text-sm text-gray-700 line-clamp-2" />
                </div>
                {/* Preview thumbnails */}
                {(questionImages[idx]?.length || 0) > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {questionImages[idx].map((img, ii) => (
                      <img
                        key={ii}
                        src={`data:${img.contentType};base64,${img.base64}`}
                        alt={`Ảnh ${ii + 1}`}
                        className="h-10 w-10 object-cover rounded border border-amber-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-100">
        <button onClick={onBack} className="btn-outline px-6 py-2.5">← Quay lại</button>
        <button onClick={handleSave} disabled={saving || selected.size === 0} className="btn-teal px-8 py-2.5 font-bold shadow-lg shadow-teal-500/30">
          {saving ? <><RefreshCw className="w-4 h-4 animate-spin mr-2 inline" />Đang lưu...</> : `Lưu ${selected.size} câu hỏi →`}
        </button>
      </div>

      {/* Modal chèn ảnh */}
      {imageModal !== null && (
        <ImageAttachModal
          open={true}
          onClose={() => setImageModal(null)}
          questionLabel={`Câu ${imageModal + 1}`}
          currentImages={questionImages[imageModal] || []}
          onSave={(imgs) => {
            setQuestionImages(prev => ({ ...prev, [imageModal]: imgs }))
            setImageModal(null)
          }}
        />
      )}
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ item, topics, onSave, onClose }: {
  item: any, topics: string[],
  onSave: (updates: any) => Promise<void>, onClose: () => void
}) {
  const [grade, setGrade] = useState(item.grade)
  const [topic, setTopic] = useState(item.topic)
  const [difficulty, setDifficulty] = useState(item.difficulty)
  const [qText, setQText] = useState(item.question_data?.text || '')
  const [options, setOptions] = useState<any[]>(
    item.question_data?.options ? JSON.parse(JSON.stringify(item.question_data.options)) : []
  )
  const [correctAnswer, setCorrectAnswer] = useState(item.question_data?.correctAnswer || '')
  const [saving, setSaving] = useState(false)
  const qType = item.question_data?.type || 'multiple_choice'

  const updateOptionText = (idx: number, text: string) => {
    const next = [...options]
    next[idx] = { ...next[idx], text }
    setOptions(next)
  }

  const toggleTrueFalse = (letter: string) => {
    const arr = correctAnswer ? correctAnswer.toLowerCase().split(',').filter(Boolean) : []
    const lc = letter.toLowerCase()
    const next = arr.includes(lc) ? arr.filter(x => x !== lc) : [...arr, lc]
    setCorrectAnswer(next.sort().join(','))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        grade,
        topic,
        difficulty,
        question_data: { ...item.question_data, text: qText, options, correctAnswer },
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Meta */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Khối lớp</label>
          <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="input">
            {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Chủ đề</label>
          <input value={topic} onChange={e => setTopic(e.target.value)} className="input" list="edit-topics" />
          <datalist id="edit-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
        </div>
        <div>
          <label className="label">Mức độ</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="input">
            {Object.entries(DIFFICULTY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      {/* Nội dung câu hỏi */}
      <div>
        <label className="label">Nội dung câu hỏi</label>
        <textarea value={qText} onChange={e => setQText(e.target.value)} rows={3} className="input resize-none font-mono text-sm" />
      </div>

      {/* Phương án — Trắc nghiệm */}
      {qType === 'multiple_choice' && options.length > 0 && (
        <div>
          <label className="label">Phương án (nhấn chữ cái để chọn đáp án đúng)</label>
          <div className="space-y-2">
            {options.map((opt: any, idx: number) => {
              const letter = (opt.letter || String.fromCharCode(65 + idx)).toUpperCase()
              const isCorrect = correctAnswer?.toUpperCase() === letter
              return (
                <div key={idx} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectAnswer(letter)}
                    className={`w-8 h-8 rounded-full font-bold text-xs shrink-0 transition-all border-2 ${
                      isCorrect ? 'bg-teal-600 text-white border-teal-700' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {letter}
                  </button>
                  <input
                    type="text"
                    value={opt.text || ''}
                    onChange={e => updateOptionText(idx, e.target.value)}
                    className="input py-1.5 text-sm flex-1 font-mono"
                    placeholder={`Nội dung phương án ${letter}`}
                  />
                </div>
              )
            })}
          </div>
          {correctAnswer && (
            <p className="text-xs text-teal-700 font-bold mt-2">✅ Đáp án đúng: {correctAnswer}</p>
          )}
        </div>
      )}

      {/* Phương án — Đúng/Sai */}
      {qType === 'true_false' && options.length > 0 && (
        <div>
          <label className="label">Mệnh đề (nhấn nút để đổi Đúng/Sai)</label>
          <div className="space-y-2">
            {options.map((opt: any, idx: number) => {
              const letter = (opt.letter || String.fromCharCode(97 + idx)).toLowerCase()
              const isTrue = correctAnswer?.toLowerCase().includes(letter)
              return (
                <div key={idx} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleTrueFalse(letter)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold shrink-0 transition-all ${
                      isTrue ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {letter.toUpperCase()}: {isTrue ? 'ĐÚNG' : 'SAI'}
                  </button>
                  <input
                    type="text"
                    value={opt.text || ''}
                    onChange={e => updateOptionText(idx, e.target.value)}
                    className="input py-1.5 text-sm flex-1 font-mono"
                    placeholder={`Nội dung mệnh đề ${letter}`}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Đáp án — Trả lời ngắn / Tự luận */}
      {(qType === 'short_answer' || qType === 'writing') && (
        <div>
          <label className="label">Đáp án</label>
          <input value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)} className="input" placeholder="Nhập đáp án..." />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button onClick={onClose} className="btn-outline px-6 py-2">Hủy</button>
        <button onClick={handleSave} disabled={saving} className="btn-teal px-8 py-2 font-bold">
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function QuestionBankPage() {
  const { questions, loading, topics, loadQuestions, addQuestions, updateQuestion, deleteQuestion, deleteQuestions, loadTopics } = useQuestionBankStore()

  // Filters
  const [filterGrade, setFilterGrade]       = useState<number | null>(null)
  const [filterTopic, setFilterTopic]       = useState('')
  const [filterDiff, setFilterDiff]         = useState('')
  const [filterType, setFilterType]         = useState('')
  const [search, setSearch]                 = useState('')

  // UI state
  const [addModalOpen, setAddModalOpen]     = useState(false)
  const [addStep, setAddStep]               = useState<'upload' | 'review'>('upload')
  const [parsedQuestions, setParsedQuestions] = useState<any[]>([])
  const [parsedFileName, setParsedFileName]   = useState('')

  const [previewItem, setPreviewItem]       = useState<any>(null)
  const [editItem, setEditItem]             = useState<any>(null)
  const [similarItem, setSimilarItem]       = useState<any>(null)
  const [selectedIds, setSelectedIds]       = useState<Set<string>>(new Set())

  useEffect(() => {
    void loadQuestions()
    void loadTopics()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => {
    loadQuestions({
      grade: filterGrade,
      topic: filterTopic || undefined,
      difficulty: filterDiff || undefined,
      question_type: filterType || undefined,
    })
  }

  const clearFilters = () => {
    setFilterGrade(null); setFilterTopic(''); setFilterDiff(''); setFilterType(''); setSearch('')
    loadQuestions()
  }

  // Client-side search on top of server filters
  const displayed = search.trim()
    ? questions.filter(q => q.question_data?.text?.toLowerCase().includes(search.toLowerCase()) || q.topic.toLowerCase().includes(search.toLowerCase()))
    : questions

  const handleParsed = (qs: any[], fileName: string) => {
    setParsedQuestions(qs)
    setParsedFileName(fileName)
    setAddStep('review')
  }

  const handleSaveQuestions = async (items: any[]) => {
    const count = await addQuestions(items)
    toast.success(`Đã lưu ${count} câu hỏi vào ngân hàng!`)
    setAddModalOpen(false)
    setAddStep('upload')
    setParsedQuestions([])
  }

  const handleSaveSimilar = async (questions: any[], meta: { grade: number; topic: string; difficulty: string }) => {
    const items = questions.map(q => ({
      grade: meta.grade,
      topic: meta.topic,
      difficulty: meta.difficulty,
      question_type: q.type,
      question_data: q,
      source_file: `AI tương tự từ: ${similarItem?.source_file || 'ngân hàng'}`,
      tags: ['ai-generated'],
    }))
    await addQuestions(items)
    setSimilarItem(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa câu hỏi này?')) return
    try {
      await deleteQuestion(id)
      toast.success('Đã xóa')
    } catch (e: any) { toast.error(e?.message || 'Lỗi xóa') }
  }

  const handleDeleteSelected = async () => {
    if (!confirm(`Xóa ${selectedIds.size} câu hỏi đã chọn?`)) return
    try {
      await deleteQuestions([...selectedIds])
      setSelectedIds(new Set())
      toast.success(`Đã xóa ${selectedIds.size} câu hỏi`)
    } catch (e: any) { toast.error(e?.message || 'Lỗi xóa') }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === displayed.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(displayed.map(q => q.id)))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Database className="w-7 h-7 text-teal-600" /> Ngân hàng câu hỏi
          </h1>
          <p className="text-gray-400 text-sm mt-1">Lưu trữ và quản lý câu hỏi theo chủ đề, khối lớp, mức độ</p>
        </div>
        <button onClick={() => { setAddModalOpen(true); setAddStep('upload') }} className="btn-teal flex items-center gap-2 shadow-lg shadow-teal-500/20">
          <Plus className="w-4 h-4" /> Thêm câu hỏi
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Tổng câu hỏi', value: questions.length, color: 'text-teal-600' },
          { label: 'Trắc nghiệm',  value: questions.filter(q => q.question_type === 'multiple_choice').length, color: 'text-blue-600' },
          { label: 'Đúng/Sai',     value: questions.filter(q => q.question_type === 'true_false').length, color: 'text-purple-600' },
          { label: 'Chủ đề',       value: topics.length, color: 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <select value={filterGrade ?? ''} onChange={e => setFilterGrade(e.target.value ? Number(e.target.value) : null)} className="input">
            <option value="">Tất cả khối</option>
            {GRADES.map(g => <option key={g} value={g}>Lớp {g}</option>)}
          </select>

          <input value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
            placeholder="Chủ đề..." className="input" list="filter-topics" />
          <datalist id="filter-topics">
            {topics.map(t => <option key={t} value={t} />)}
          </datalist>

          <select value={filterDiff} onChange={e => setFilterDiff(e.target.value)} className="input">
            <option value="">Tất cả mức độ</option>
            {Object.entries(DIFFICULTY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input">
            <option value="">Tất cả loại</option>
            {Object.entries(TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <div className="flex gap-2">
            <button onClick={applyFilters} className="btn-teal flex-1 flex items-center justify-center gap-1 py-2 text-sm">
              <Filter className="w-4 h-4" /> Lọc
            </button>
            <button onClick={clearFilters} className="btn-outline px-3 py-2" title="Xóa bộ lọc">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo nội dung câu hỏi..." className="input pl-9" />
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-red-700">Đã chọn {selectedIds.size} câu</span>
          <button onClick={handleDeleteSelected} className="flex items-center gap-1 text-sm font-bold text-red-600 hover:text-red-800 bg-white border border-red-200 px-3 py-1.5 rounded-lg transition">
            <Trash2 className="w-4 h-4" /> Xóa tất cả
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-sm text-gray-500 hover:text-gray-700 ml-auto">Bỏ chọn</button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
              <th className="px-4 py-3 text-left w-8">
                <button onClick={toggleSelectAll} className="text-white">
                  {selectedIds.size === displayed.length && displayed.length > 0
                    ? <CheckSquare className="w-4 h-4" />
                    : <Square className="w-4 h-4 opacity-60" />}
                </button>
              </th>
              <th className="px-4 py-3 text-left text-white font-bold text-xs uppercase tracking-wider">Câu hỏi</th>
              <th className="px-4 py-3 text-left text-white font-bold text-xs uppercase tracking-wider w-24">Lớp</th>
              <th className="px-4 py-3 text-left text-white font-bold text-xs uppercase tracking-wider">Chủ đề</th>
              <th className="px-4 py-3 text-left text-white font-bold text-xs uppercase tracking-wider w-28">Mức độ</th>
              <th className="px-4 py-3 text-left text-white font-bold text-xs uppercase tracking-wider w-28">Loại</th>
              <th className="px-4 py-3 text-right text-white font-bold text-xs uppercase tracking-wider w-24">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-teal-500 mx-auto" /></td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-gray-500">Chưa có câu hỏi nào</p>
                <p className="text-sm mt-1">Nhấn "Thêm câu hỏi" để upload file Word/LaTeX</p>
              </td></tr>
            ) : (
              displayed.map((item, i) => {
                const diff = DIFFICULTY_MAP[item.difficulty as keyof typeof DIFFICULTY_MAP]
                return (
                  <tr key={item.id} className={`hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(item.id)}>
                        {selectedIds.has(item.id)
                          ? <CheckSquare className="w-4 h-4 text-teal-600" />
                          : <Square className="w-4 h-4 text-gray-400" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
                        <MathText html={item.question_data?.text || ''} className="text-sm text-gray-700 line-clamp-2" />
                      </p>
                      {item.source_file && (
                        <p className="text-[10px] text-gray-400 mt-0.5">📎 {item.source_file}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-teal-700">Lớp {item.grade}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700 font-medium">{item.topic}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge text={diff?.label || item.difficulty} color={diff?.color || 'bg-gray-100 text-gray-600 border-gray-200'} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600">{TYPE_MAP[item.question_type] || item.question_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setSimilarItem(item)} className="p-1.5 text-violet-500 hover:bg-violet-100 rounded-lg transition" title="Tạo câu hỏi tương tự">
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button onClick={() => setPreviewItem(item)} className="p-1.5 text-teal-600 hover:bg-teal-100 rounded-lg transition" title="Xem">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditItem(item)} className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition" title="Sửa">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition" title="Xóa">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        {displayed.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-right">
            Hiển thị {displayed.length} câu hỏi
          </div>
        )}
      </div>

      {/* Modal: Add questions */}
      <Modal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddStep('upload'); setParsedQuestions([]) }}
        title={addStep === 'upload' ? '📤 Upload file câu hỏi' : `📋 Xem lại & gán thẻ (${parsedQuestions.length} câu)`}
        size="2xl"
      >
        {addStep === 'upload' ? (
          <StepUpload onParsed={handleParsed} />
        ) : (
          <StepReview
            questions={parsedQuestions}
            fileName={parsedFileName}
            topics={topics}
            onSave={handleSaveQuestions}
            onBack={() => setAddStep('upload')}
          />
        )}
      </Modal>

      {/* Modal: Similar questions */}
      <SimilarQuestionModal
        open={!!similarItem}
        onClose={() => setSimilarItem(null)}
        sourceItem={similarItem}
        onSave={handleSaveSimilar}
      />

      {/* Modal: Preview */}
      <Modal open={!!previewItem} onClose={() => setPreviewItem(null)} title="Xem câu hỏi" size="lg">
        {previewItem && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge text={`Lớp ${previewItem.grade}`} color="bg-teal-100 text-teal-700 border-teal-200" />
              <Badge text={previewItem.topic} color="bg-purple-100 text-purple-700 border-purple-200" />
              <Badge text={DIFFICULTY_MAP[previewItem.difficulty as keyof typeof DIFFICULTY_MAP]?.label || previewItem.difficulty}
                color={DIFFICULTY_MAP[previewItem.difficulty as keyof typeof DIFFICULTY_MAP]?.color || ''} />
              <Badge text={TYPE_MAP[previewItem.question_type] || previewItem.question_type}
                color="bg-gray-100 text-gray-600 border-gray-200" />
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <QuestionPreview q={previewItem.question_data} />
            </div>
            {previewItem.question_data?.solution && (
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <p className="text-xs font-bold text-green-700 mb-2">💡 Lời giải:</p>
                <MathText html={previewItem.question_data.solution || ''} block className="text-sm text-green-800 leading-relaxed" />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Edit */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Chỉnh sửa câu hỏi" size="lg">
        {editItem && (
          <EditModal
            item={editItem}
            topics={topics}
            onSave={async (updates) => {
              await updateQuestion(editItem.id, updates)
              toast.success('Đã cập nhật!')
              setEditItem(null)
            }}
            onClose={() => setEditItem(null)}
          />
        )}
      </Modal>
    </div>
  )
}
