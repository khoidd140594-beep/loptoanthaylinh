// @ts-nocheck
import React, { useMemo, useRef, useState } from 'react'
import {
  Presentation, UploadCloud, FileText, FileType, Sigma, Settings, Save, Wand2,
  Loader2, Download, ExternalLink, Sparkles, AlertCircle, CheckCircle2,
  Image as ImageIcon, ClipboardPaste, Trash2, Play, ListChecks,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Services mới (đã dựng)
import {
  structureMarkdownIntoSlides,
  PRESENTATION_MODELS,
  DEFAULT_PRESENTATION_MODEL,
} from '@/services/slideStructureService'
import { generatePresentationHtml } from '@/services/presentationHtml'
import { wordToMarkdown } from '@/services/wordToMarkdownService'
import { texFileToQuizQuestions } from '@/services/texToQuiz'
import { generateInteractiveQuizHtml } from '@/services/interactiveQuizHtml'
import { extractQuizFromText } from '@/services/markdownToQuiz'
import MarkdownReview from '@/components/MarkdownReview'
import { usePresentationStore } from '@/store/presentationStore'

// Services PDF (PORT từ app standalone vào @/services trước khi dùng)
import {
  processOriginalDocument,
  hasDocumentImageMarkers,
  refineDocumentImageMarkers,
  replaceDocumentImageMarkers,
  replaceUnresolvedImageMarkers,
} from '@/services/aiService'
import { renderPdfToImages } from '@/services/presentationPdfUtils'

type Phase = 'idle' | 'extracting' | 'review' | 'structuring' | 'ready'

const KEY_API = 'pres_gemini_key'
const KEY_MODEL = 'pres_model'
const KEY_MAXPAGES = 'pres_max_pages'

const MODEL_LABEL: Record<string, string> = {
  'gemini-3.6-flash': 'Gemini 3.6 Flash — chất lượng cao nhất',
  'gemini-3.5-flash': 'Gemini 3.5 Flash — cân bằng',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite — nhanh',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite — nhanh, tiết kiệm',
  'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
}

/** Lấy danh sách ảnh base64 trong Markdown (dùng cho thống kê số hình). */
function extractMarkdownImages(md: string): Array<{ full: string; src: string }> {
  const re = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)]+)\)/g
  const out: Array<{ full: string; src: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(md)) !== null) out.push({ full: m[0], src: m[1] })
  return out
}

export default function CreatePresentationPage() {
  const store = usePresentationStore()

  // ─── Cài đặt (localStorage) ───
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_API) || '')
  const [model, setModel] = useState(() => localStorage.getItem(KEY_MODEL) || DEFAULT_PRESENTATION_MODEL)
  const [maxPages, setMaxPages] = useState(() => Number(localStorage.getItem(KEY_MAXPAGES)) || 30)

  const saveSettings = () => {
    localStorage.setItem(KEY_API, apiKey.trim())
    localStorage.setItem(KEY_MODEL, model)
    localStorage.setItem(KEY_MAXPAGES, String(maxPages))
    toast.success('Đã lưu cấu hình')
    setShowSettings(false)
  }

  // ─── Trạng thái xử lý ───
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [deck, setDeck] = useState<any>(null)
  const [html, setHtml] = useState('')
  const [saving, setSaving] = useState(false)

  const busy = phase === 'extracting' || phase === 'structuring'
  const images = useMemo(() => extractMarkdownImages(markdown), [markdown])
  const isWord = file && /\.docx?$/i.test(file.name)
  const isLatex = file && /\.tex$/i.test(file.name)
  const sourceType = isWord ? 'word' : isLatex ? 'latex' : 'pdf'

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPhase('idle'); setMarkdown(''); setDeck(null); setHtml(''); setProgress('')
  }

  // ─── Bước 1: trích nội dung → Markdown ───
  async function extract() {
    if (!file) return toast.error('Hãy chọn file PDF, Word hoặc LaTeX.')
    if (!isLatex && !apiKey.trim()) { setShowSettings(true); return toast.error('Chưa nhập Gemini API key.') }

    setPhase('extracting'); setProgress('Đang đọc tệp gốc...'); setMarkdown(''); setDeck(null); setHtml('')
    try {
      // ─── LATEX ex_test → QUIZ TƯƠNG TÁC (teal), KHÔNG qua AI chia slide ───
      if (isLatex) {
        setProgress('Đang đọc LaTeX & biên dịch TikZ...')
        const { questions, title } = await texFileToQuizQuestions(file, setProgress)
        if (!questions.length) throw new Error('Không tìm thấy câu hỏi trong file .tex.')
        const generated = generateInteractiveQuizHtml(questions, title)
        setDeck({ title, slides: questions })   // slides.length = số câu (để lưu/hiển thị)
        setHtml(generated)
        setPhase('ready'); setProgress('')
        toast.success(`Đã tạo bài trình chiếu tương tác: ${questions.length} câu`)
        return
      }

      let md = ''
      if (isWord) {
        // WORD: lấy hình inline + MathType → Markdown, không cần OCR.
        setProgress('Đang đọc Word (hình inline + MathType)...')
        const r = await wordToMarkdown(file)
        md = r.markdown
        toast.success(`Word: ${r.imageCount} ảnh, ${r.mathTypeCount} công thức MathType`)
      } else {
        // PDF: Gemini OCR nguyên file → Markdown; cắt hình sau khi OCR xong.
        setProgress(`Đang OCR PDF bằng ${model}...`)
        const raw = await processOriginalDocument({
          apiKey, engine: 'gemini', model, sourceFiles: [file], maxPages,
          onText: (t) => setMarkdown(t),
        })

        md = raw
        if (hasDocumentImageMarkers(raw)) {
          setProgress('OCR xong. Đang lấy ảnh trang để cắt hình...')
          try {
            const rendered = await renderPdfToImages(file, {
              maxPages, scale: 2,
              onProgress: (c, t) => setProgress(`Đang lấy ảnh trang ${c}/${t}...`),
            })
            const pageMap = new Map(rendered.map((p) => [p.pageNumber, p.imageDataUrl]))
            if (pageMap.size > 0) {
              setProgress('Đang định vị và cắt hình...')
              const refined = await refineDocumentImageMarkers({ apiKey, model, markdown: raw, pageImages: pageMap })
              md = await replaceDocumentImageMarkers(refined, pageMap, file)
            } else {
              md = replaceUnresolvedImageMarkers(raw)
            }
          } catch (err) {
            console.warn('Không cắt được hình, giữ ghi chú thay thế:', err)
            md = replaceUnresolvedImageMarkers(raw)
          }
        }
      }

      setMarkdown(md)
      setPhase('review')
      setProgress('')
      toast.success('Đã trích xong nội dung. Kiểm tra ảnh rồi tạo slide.')
    } catch (e: any) {
      setPhase('idle'); setProgress('')
      toast.error(e?.message || 'Lỗi khi trích nội dung.')
    }
  }

  // ─── Bước 2: chia slide + dựng HTML ───
  async function buildDeck() {
    if (!markdown.trim()) return
    setPhase('structuring'); setProgress(`Đang chia slide bằng ${model}...`)
    try {
      const built = await structureMarkdownIntoSlides({
        apiKey, model, markdown, lessonTitle: file?.name.replace(/\.(pdf|docx?)$/i, ''),
      })
      const generated = generatePresentationHtml(built)
      setDeck(built); setHtml(generated)
      setPhase('ready'); setProgress('')
      toast.success(`Đã tạo ${built.slides.length} slide`)
    } catch (e: any) {
      setPhase('review'); setProgress('')
      toast.error(e?.message || 'Lỗi khi chia slide.')
    }
  }

  // ─── Bước 2 (kiểu quiz): tách câu hỏi từ markdown → quiz tương tác ───
  function buildQuiz() {
    if (!markdown.trim()) return
    setPhase('structuring'); setProgress('Đang tách câu hỏi...')
    try {
      const questions = extractQuizFromText(markdown)
      if (!questions.length) {
        setPhase('review'); setProgress('')
        toast.error('Không tách được câu hỏi. Tài liệu này có thể là bài giảng — hãy dùng "Chia slide".')
        return
      }
      const title = file?.name.replace(/\.(pdf|docx?)$/i, '') || 'Bài trình chiếu'
      const generated = generateInteractiveQuizHtml(questions, title)
      setDeck({ title, slides: questions })
      setHtml(generated)
      setPhase('ready'); setProgress('')
      toast.success(`Đã tạo quiz tương tác: ${questions.length} câu`)
    } catch (e: any) {
      setPhase('review'); setProgress('')
      toast.error(e?.message || 'Lỗi khi tạo quiz.')
    }
  }

  // ─── Xuất / lưu ───
  function downloadHtml() {
    const name = (file?.name.replace(/\.(pdf|docx?)$/i, '') || 'bai_giang') + '.html'
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  function openInNewTab() {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function saveToSupabase() {
    if (!deck || !html) return
    setSaving(true)
    try {
      await store.savePresentation({
        title: deck.title,
        sourceType,
        html,
        slideCount: deck.slides.length,
        model,
      })
      toast.success('Đã lưu vào thư viện (Supabase)')
    } catch (e: any) {
      toast.error(e?.message || 'Lỗi khi lưu.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-teal-100">
        <div>
          <h1 className="text-2xl font-bold text-teal-800 flex items-center gap-2">
            <Presentation className="w-6 h-6 text-teal-600" /> Tạo bài giảng trình chiếu
          </h1>
          <p className="text-sm text-gray-500 mt-1">PDF (OCR) · Word (MathType) · LaTeX ex_test (TikZ) → slide trình chiếu bằng AI</p>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="btn-outline flex items-center gap-2">
          <Settings className="w-4 h-4" /> Cấu hình
        </button>
      </div>

      {/* CÀI ĐẶT */}
      {showSettings && (
        <div className="bg-teal-50 border-2 border-teal-200 p-6 rounded-2xl shadow-inner">
          <h3 className="font-bold text-teal-900 mb-4">⚙️ Cấu hình Gemini</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-teal-700 mb-1">Gemini API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..." className="w-full px-4 py-2 rounded-xl border border-teal-300 focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-teal-700 mb-1">Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-teal-300 focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white">
                {PRESENTATION_MODELS.map((m) => <option key={m} value={m}>{MODEL_LABEL[m] || m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-teal-700 mb-1">Số trang tối đa (PDF)</label>
              <input type="number" min={1} max={100} value={maxPages}
                onChange={(e) => setMaxPages(Math.min(100, Math.max(1, Number(e.target.value) || 30)))}
                className="w-full px-4 py-2 rounded-xl border border-teal-300 focus:ring-2 focus:ring-teal-500 focus:outline-none" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={saveSettings} className="btn-teal flex items-center gap-2 px-6">
              <Save className="w-4 h-4" /> Lưu cấu hình
            </button>
          </div>
        </div>
      )}

      {/* KHU LÀM VIỆC */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 min-h-[60vh]">
        {/* CHỌN FILE */}
        {phase === 'idle' && (
          <div className="max-w-2xl mx-auto mt-6 border-2 border-dashed border-teal-200 bg-teal-50/30 rounded-3xl p-10 text-center">
            <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <UploadCloud className="w-10 h-10 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Tải lên PDF, Word hoặc LaTeX</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">PDF được OCR bằng Gemini và cắt hình; Word lấy hình inline + MathType; LaTeX ex_test biên dịch TikZ thành hình.</p>
            <div className="relative inline-block">
              <input type="file" accept=".pdf,.doc,.docx,.tex" onChange={onPickFile}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
              <div className="flex items-center justify-center gap-3 px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg">
                Chọn file
              </div>
            </div>
            {file && (
              <div className="mt-8 flex flex-col items-center gap-4">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-teal-50 text-teal-700 rounded-lg text-sm font-medium border border-teal-200">
                  {isWord ? <FileType className="w-4 h-4" /> : isLatex ? <Sigma className="w-4 h-4" /> : <FileText className="w-4 h-4" />} {file.name}
                </span>
                <button onClick={extract} className="px-10 py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl shadow-lg flex items-center gap-2">
                  <Play className="w-4 h-4" /> Bắt đầu
                </button>
              </div>
            )}
          </div>
        )}

        {/* ĐANG XỬ LÝ */}
        {busy && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-teal-600 animate-spin mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">{phase === 'extracting' ? 'Đang trích nội dung...' : 'Đang chia slide...'}</h3>
            <p className="text-gray-500">{progress}</p>
          </div>
        )}

        {/* DUYỆT NỘI DUNG (xem trước trực quan) + TẠO SLIDE/QUIZ */}
        {phase === 'review' && (
          <div className="space-y-5">
            <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 border border-gray-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
                <div>
                  <h3 className="font-bold text-gray-800">Đã trích nội dung</h3>
                  <p className="text-xs text-gray-500">{markdown.length.toLocaleString('vi-VN')} ký tự · {images.length} hình</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={buildDeck} className="btn-outline flex items-center gap-2 px-4 py-2 text-sm">
                  <Wand2 className="w-4 h-4" /> Chia slide (bài giảng)
                </button>
                <button onClick={buildQuiz} className="btn-teal flex items-center gap-2 px-4 py-2 text-sm">
                  <ListChecks className="w-4 h-4" /> Tạo quiz tương tác
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <ImageIcon className="w-4 h-4 text-teal-600" /> Xem trước — rê chuột vào ảnh để Xoá / Thay ngay tại chỗ
            </div>
            <MarkdownReview markdown={markdown} onChange={setMarkdown} />

            <details className="rounded-xl border border-gray-200">
              <summary className="px-4 py-3 cursor-pointer font-medium text-gray-700 text-sm">Sửa Markdown thô (tuỳ chọn)</summary>
              <textarea value={markdown} onChange={(e) => setMarkdown(e.target.value)} spellCheck={false}
                className="w-full h-72 p-4 font-mono text-xs border-t border-gray-200 focus:outline-none" />
            </details>
          </div>
        )}

        {/* KẾT QUẢ */}
        {phase === 'ready' && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 border border-gray-200">
              <div className="flex items-center gap-3">
                <Sparkles className="w-7 h-7 text-amber-500" />
                <div>
                  <h3 className="font-bold text-gray-800">{deck?.title}</h3>
                  <p className="text-xs text-gray-500">{deck?.slides?.length} slide · {model}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPhase('review')} className="btn-outline flex items-center gap-2 px-3 py-2 text-sm">Sửa lại</button>
                <button onClick={openInNewTab} className="btn-outline flex items-center gap-2 px-3 py-2 text-sm"><ExternalLink className="w-4 h-4" /> Mở tab mới</button>
                <button onClick={downloadHtml} className="btn-outline flex items-center gap-2 px-3 py-2 text-sm"><Download className="w-4 h-4" /> Tải HTML</button>
                <button onClick={saveToSupabase} disabled={saving} className="btn-teal flex items-center gap-2 px-4 py-2 text-sm">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu vào thư viện
                </button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-200 bg-white" style={{ height: '70vh' }}>
              <iframe title="preview" srcDoc={html} sandbox="allow-scripts allow-same-origin allow-popups"
                className="w-full h-full border-0" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
