// @ts-nocheck
// components/SimilarQuestionModal.tsx
import { useState, useEffect } from 'react'
import {
  Wand2, RefreshCw, Check, Key, Save, Trash2,
  ChevronDown, ChevronUp, AlertCircle, Sparkles, Eye, EyeOff,
} from 'lucide-react'
import Modal from '@/components/Modal'
import MathText from '@/components/MathText'
import toast from 'react-hot-toast'
import {
  generateSimilarQuestions, testApiKey,
  getApiKey, setApiKey, SimilarQuestion,
} from '@/services/similarQuestionService'

// ─── Constants ────────────────────────────────────────────────────────────────
const MODELS = [
  { value: 'gemini-2.5-flash',            label: 'Gemini 2.5 Flash (Khuyên dùng)' },
  { value: 'gemini-2.5-flash-lite',       label: 'Gemini 2.5 Flash Lite (Nhanh)' },
  { value: 'gemini-2.0-flash',            label: 'Gemini 2.0 Flash' },
  { value: 'gemini-3-flash-preview',      label: 'Gemini 3 Flash Preview' },
]

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false:      'Đúng/Sai',
  short_answer:    'Trả lời ngắn',
  writing:         'Tự luận',
}

const DIFFICULTY_OPTIONS = [
  { value: 'know',       label: 'Nhận biết' },
  { value: 'understand', label: 'Thông hiểu' },
  { value: 'apply',      label: 'Vận dụng' },
]

// ─── ApiKey Panel ─────────────────────────────────────────────────────────────
function ApiKeyPanel({ apiKey, model, onKeyChange, onModelChange }: {
  apiKey: string; model: string
  onKeyChange: (k: string) => void
  onModelChange: (m: string) => void
}) {
  const [input, setInput]     = useState('')
  const [show, setShow]       = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus]   = useState<'idle'|'ok'|'err'>('idle')
  const [errMsg, setErrMsg]   = useState('')

  const handleSave = async () => {
    if (!input.trim()) return
    if (!input.trim().startsWith('AIza')) {
      toast.error('API Key phải bắt đầu bằng "AIza"')
      return
    }
    setTesting(true)
    setStatus('idle')
    const result = await testApiKey(input.trim(), model)
    setTesting(false)
    if (result.ok) {
      setApiKey(input.trim())
      onKeyChange(input.trim())
      setStatus('ok')
      setInput('')
      toast.success('API Key hợp lệ và đã lưu!')
    } else {
      setStatus('err')
      setErrMsg(result.error || 'Key không hợp lệ')
    }
  }

  return (
    <div className="space-y-3">
      {/* Model selector */}
      <div>
        <label className="block text-xs font-bold text-gray-600 mb-1">Model Gemini</label>
        <select
          value={model}
          onChange={e => onModelChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400"
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Key input */}
      <div>
        <label className="block text-xs font-bold text-gray-600 mb-1">
          Gemini API Key{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
            className="text-teal-600 underline font-normal">(Lấy miễn phí)</a>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={show ? 'text' : 'password'}
              value={input}
              onChange={e => { setInput(e.target.value); setStatus('idle') }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="AIzaSy..."
              className={`w-full px-3 py-2 pr-9 text-sm border rounded-xl focus:outline-none focus:border-teal-400 ${
                status === 'err' ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            <button
              onClick={() => setShow(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!input.trim() || testing}
            className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {testing ? 'Kiểm tra...' : 'Lưu key'}
          </button>
        </div>
        {status === 'err' && (
          <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {errMsg}
          </p>
        )}
        {status === 'ok' && (
          <p className="mt-1 text-xs text-teal-600 flex items-center gap-1">
            <Check className="w-3 h-3" /> Key hợp lệ — đã lưu
          </p>
        )}
      </div>

      {/* Current key status */}
      {apiKey && (
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
          <span className="text-xs text-teal-700 font-medium flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-teal-500" />
            Đang dùng: <code className="font-mono">{apiKey.slice(0,8)}••••{apiKey.slice(-4)}</code>
          </span>
          <button
            onClick={() => { setApiKey(''); onKeyChange(''); setStatus('idle') }}
            className="text-xs text-red-500 hover:text-red-700 font-bold"
          >
            Xóa
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Single Question Editor ───────────────────────────────────────────────────
function QuestionEditor({ q, index, onChange, onRemove }: {
  q: SimilarQuestion; index: number
  onChange: (u: SimilarQuestion) => void
  onRemove: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const updateOption = (i: number, text: string) => {
    const opts = [...(q.options || [])]
    opts[i] = { ...opts[i], text }
    onChange({ ...q, options: opts })
  }

  const isCorrect = (letter: string) =>
    q.correctAnswer?.toUpperCase().split(',').map(s => s.trim()).includes(letter.toUpperCase())

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-50 to-gray-50 border-b border-gray-100">
        <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-black flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200 shrink-0">
          {TYPE_LABEL[q.type] || q.type}
        </span>
        {/* Preview collapsed */}
        {collapsed && (
          <span className="text-xs text-gray-500 truncate flex-1">
            {q.text.replace(/<[^>]+>/g,'').slice(0,80)}...
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => setPreviewMode(v => !v)}
            className={`p-1.5 rounded-lg text-xs font-bold transition ${
              previewMode ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title="Xem trước MathJax"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove()}
            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition"
            title="Xóa câu này"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCollapsed(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Nội dung câu hỏi */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Nội dung câu hỏi
            </label>
            {previewMode ? (
              <div className="min-h-[60px] p-3 bg-violet-50 border border-violet-200 rounded-xl">
                <MathText html={q.text} block className="text-sm text-gray-800 leading-relaxed" />
              </div>
            ) : (
              <textarea
                value={q.text}
                onChange={e => onChange({ ...q, text: e.target.value })}
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-teal-400 resize-none font-mono bg-gray-50"
                placeholder="Nội dung câu hỏi, dùng $...$ cho công thức toán"
              />
            )}
          </div>

          {/* Options */}
          {q.options && q.options.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Các lựa chọn
                <span className="ml-1 text-gray-400 font-normal normal-case">(đánh dấu = đáp án đúng)</span>
              </label>
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const correct = isCorrect(opt.letter)
                  return (
                    <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition ${
                      correct ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white'
                    }`}>
                      {/* Letter badge + click to toggle correct */}
                      <button
                        onClick={() => {
                          if (q.type === 'multiple_choice') {
                            onChange({ ...q, correctAnswer: opt.letter.toUpperCase() })
                          } else {
                            // true_false: toggle
                            const cur = q.correctAnswer?.toLowerCase().split(',').filter(Boolean) || []
                            const lc  = opt.letter.toLowerCase()
                            const next = cur.includes(lc) ? cur.filter(x => x !== lc) : [...cur, lc]
                            onChange({ ...q, correctAnswer: next.sort().join(',') })
                          }
                        }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition ${
                          correct ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={correct ? 'Đang là đáp án đúng' : 'Nhấn để chọn làm đáp án đúng'}
                      >
                        {opt.letter.toUpperCase()}
                      </button>

                      {previewMode ? (
                        <div className="flex-1 text-sm text-gray-700">
                          <MathText html={opt.text} className="text-sm" />
                        </div>
                      ) : (
                        <input
                          value={opt.text}
                          onChange={e => updateOption(i, e.target.value)}
                          className="flex-1 px-2.5 py-1 text-sm border-0 bg-transparent focus:outline-none font-mono"
                          placeholder={`Nội dung lựa chọn ${opt.letter.toUpperCase()}`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                💡 Nhấn vào chữ cái để chọn/bỏ chọn đáp án đúng
              </p>
            </div>
          )}

          {/* Short answer / writing: correctAnswer input */}
          {(!q.options || q.options.length === 0) && q.type !== 'writing' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Đáp án đúng
              </label>
              <input
                value={q.correctAnswer || ''}
                onChange={e => onChange({ ...q, correctAnswer: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-teal-400 font-bold text-teal-700"
                placeholder="Nhập đáp án, dùng $...$ cho số/công thức"
              />
            </div>
          )}

          {/* Solution */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Lời giải
            </label>
            {previewMode ? (
              <div className="min-h-[48px] p-3 bg-green-50 border border-green-200 rounded-xl">
                <MathText html={q.solution || '<em class="text-gray-400">Chưa có lời giải</em>'} block
                  className="text-sm text-gray-700 leading-relaxed" />
              </div>
            ) : (
              <textarea
                value={q.solution || ''}
                onChange={e => onChange({ ...q, solution: e.target.value })}
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 resize-none font-mono bg-gray-50"
                placeholder="Hướng dẫn giải chi tiết, dùng $...$ cho công thức"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
interface SimilarQuestionModalProps {
  open: boolean
  onClose: () => void
  sourceItem: any
  onSave: (questions: SimilarQuestion[], meta: { grade: number; topic: string; difficulty: string }) => Promise<void>
}

export default function SimilarQuestionModal({
  open, onClose, sourceItem, onSave,
}: SimilarQuestionModalProps) {
  const [apiKey, setApiKeyState]   = useState(() => getApiKey())
  const [model, setModel]          = useState('gemini-2.5-flash')
  const [count, setCount]          = useState(3)
  const [grade, setGrade]          = useState(10)
  const [topic, setTopic]          = useState('')
  const [difficulty, setDifficulty] = useState('know')

  const [generating, setGenerating] = useState(false)
  const [progressLog, setProgressLog] = useState<string[]>([])
  const [questions, setQuestions]   = useState<SimilarQuestion[]>([])
  const [saving, setSaving]         = useState(false)
  const [showSettings, setShowSettings] = useState(!getApiKey())

  useEffect(() => {
    if (open && sourceItem) {
      setGrade(sourceItem.grade || 10)
      setTopic(sourceItem.topic || '')
      setDifficulty(sourceItem.difficulty || 'know')
      setQuestions([])
      setProgressLog([])
    }
  }, [open, sourceItem])

  const handleGenerate = async () => {
    if (!apiKey) { setShowSettings(true); toast.error('Vui lòng nhập API Key trước'); return }
    setGenerating(true)
    setProgressLog([])
    setQuestions([])
    try {
      const result = await generateSimilarQuestions(
        sourceItem.question_data,
        count,
        model,
        apiKey,
        (msg) => setProgressLog(prev => [...prev, msg])
      )
      setQuestions(result)
    } catch (err: any) {
      toast.error(err.message || 'Không tạo được câu hỏi')
      setProgressLog(prev => [...prev, `❌ ${err.message}`])
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!topic.trim()) { toast.error('Vui lòng nhập chủ đề'); return }
    setSaving(true)
    try {
      await onSave(questions, { grade, topic, difficulty })
      onClose()
    } catch (err: any) {
      toast.error('Lỗi khi lưu: ' + (err.message || ''))
    } finally {
      setSaving(false)
    }
  }

  if (!sourceItem) return null

  return (
    <Modal open={open} onClose={onClose} title="✨ Tạo câu hỏi tương tự — Gemini AI" size="3xl">
      <div className="space-y-5">

        {/* ── 1. Câu hỏi gốc ── */}
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black text-violet-500 uppercase tracking-wider">Câu hỏi gốc</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
              {TYPE_LABEL[sourceItem.question_type] || sourceItem.question_type}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
              Lớp {sourceItem.grade}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
              {sourceItem.topic}
            </span>
          </div>
          <div className="bg-white/70 rounded-xl p-3 border border-violet-100">
            <MathText html={sourceItem.question_data?.text || ''} block
              className="text-sm text-gray-800 leading-relaxed" />
          </div>
          {sourceItem.question_data?.options?.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {sourceItem.question_data.options.map((opt: any) => (
                <div key={opt.letter} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border ${
                  sourceItem.question_data.correctAnswer?.toUpperCase().includes(opt.letter.toUpperCase())
                    ? 'bg-teal-100 border-teal-300 font-bold text-teal-800'
                    : 'bg-white/60 border-violet-100 text-gray-600'
                }`}>
                  <span className="font-black">{opt.letter.toUpperCase()}.</span>
                  <MathText html={opt.text} className="text-xs" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 2. Cài đặt API & Model ── */}
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <Key className="w-4 h-4 text-amber-500" />
              Cài đặt API Key & Model
              {apiKey && <span className="text-[10px] font-bold text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">✓ Đã cấu hình</span>}
            </span>
            {showSettings ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showSettings && (
            <div className="p-4 border-t border-gray-100">
              <ApiKeyPanel
                apiKey={apiKey}
                model={model}
                onKeyChange={setApiKeyState}
                onModelChange={setModel}
              />
            </div>
          )}
        </div>

        {/* ── 3. Tham số tạo câu hỏi ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Số câu tạo</label>
            <select value={count} onChange={e => setCount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400">
              {[1,2,3,5].map(n => <option key={n} value={n}>{n} câu</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Khối lớp</label>
            <select value={grade} onChange={e => setGrade(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400">
              {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>Lớp {g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Chủ đề *</label>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400"
              placeholder="VD: Hàm số..." />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Mức độ</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-teal-400">
              {DIFFICULTY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        {/* ── 4. Nút tạo ── */}
        <button
          onClick={handleGenerate}
          disabled={generating || !apiKey}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            generating || !apiKey
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white hover:from-teal-700 hover:to-cyan-700 shadow-lg shadow-teal-200'
          }`}
        >
          {generating
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang tạo câu hỏi...</>
            : <><Sparkles className="w-4 h-4" /> Tạo {count} câu hỏi tương tự</>}
        </button>

        {/* ── 5. Progress log ── */}
        {progressLog.length > 0 && (
          <div className="bg-gray-900 rounded-xl px-4 py-3 border border-gray-700">
            {progressLog.map((msg, i) => (
              <div key={i} className={`font-mono text-xs leading-relaxed ${
                msg.startsWith('❌') ? 'text-red-400' : 'text-teal-300'
              }`}>{msg}</div>
            ))}
          </div>
        )}

        {/* ── 6. Kết quả ── */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Check className="w-4 h-4 text-teal-500" />
                {questions.length} câu — Chỉnh sửa trước khi lưu
              </p>
              <button onClick={handleGenerate} disabled={generating}
                className="text-xs text-teal-600 font-bold flex items-center gap-1 hover:text-teal-800 disabled:opacity-40">
                <RefreshCw className="w-3 h-3" /> Tạo lại
              </button>
            </div>

            {questions.map((q, i) => (
              <QuestionEditor
                key={i} q={q} index={i}
                onChange={updated => setQuestions(prev => prev.map((x, j) => j === i ? updated : x))}
                onRemove={() => setQuestions(prev => prev.filter((_, j) => j !== i))}
              />
            ))}

            {/* Save bar */}
            <div className="sticky bottom-0 flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-2xl shadow-lg">
              <p className="text-xs text-gray-400">
                Lưu vào: <strong className="text-gray-700">Lớp {grade}</strong> ·{' '}
                <strong className="text-gray-700">{topic || '(chưa có chủ đề)'}</strong> ·{' '}
                <strong className="text-gray-700">{DIFFICULTY_OPTIONS.find(d => d.value === difficulty)?.label}</strong>
              </p>
              <button
                onClick={handleSave}
                disabled={saving || questions.length === 0 || !topic.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition shadow-md disabled:opacity-40 whitespace-nowrap"
              >
                {saving
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang lưu...</>
                  : <><Save className="w-4 h-4" /> Lưu {questions.length} câu vào ngân hàng</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
