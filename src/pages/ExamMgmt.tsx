import { useEffect, useState } from 'react'
import { FileUp, FileText, Trash2, RefreshCw, Eye, Edit2, Save, X, Settings, Target, Paperclip } from 'lucide-react'
import { useExamStore } from '@/store/examStore'
import { parseWordToExam } from '@/services/mathWordParserService'
import { parseTexToExam } from '@/services/texParserService'
import { createDefaultPointsConfig } from '@/services/scoringService'
import { parseTexToTSAExam, validateTSAExamData } from '@/services/tsaParserService'
import { buildDefaultPointsConfig } from '@/services/tsaScoringService'
import { fmt } from '@/lib/helpers'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import MathText from '@/components/MathText'
import PointsConfigEditor from '@/components/PointsConfigEditor'
import TSAPreviewModal from '@/components/TSAPreviewModal'
import ImageAttachModal, { AttachedImage } from '@/components/ImageAttachModal'
import toast from 'react-hot-toast'

export default function ExamMgmt() {
  const { exams, loading, loadExams, createExam, deleteExam } = useExamStore()
  const [uploading, setUploading] = useState(false)

  // ── Tab: normal | tsa ──
  const [activeTab, setActiveTab] = useState<'normal' | 'tsa'>('normal')

  // ── TSA upload state ──
  const [tsaFile, setTsaFile] = useState<File | null>(null)
  const [tsaProgress, setTsaProgress] = useState<string[]>([])
  const [tsaParsing, setTsaParsing] = useState(false)

  // ── TSA preview state ──
  const [tsaPreview, setTsaPreview] = useState<{ data: any; id: string; title: string } | null>(null)
  const [tsaPreviewing, setTsaPreviewing] = useState<string | null>(null)

  // State xem trước
  const [previewData, setPreviewData] = useState<any>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)

  // State chỉnh sửa câu hỏi
  const [editingQuestionId, setEditingQuestionId] = useState<string | number | null>(null)
  const [editForm, setEditForm] = useState<any>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // State chèn ảnh
  const [imageAttachTarget, setImageAttachTarget] = useState<any>(null) // question object

  // State cấu hình điểm
  const [configExam, setConfigExam] = useState<any>(null)

  useEffect(() => {
    void loadExams()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upload đề Word (.docx) ────────────────────────────────────────────────
  const handleUploadWord = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const toastId = toast.loading('Đang phân tích file Word...')
    try {
      const examData = await parseWordToExam(file)
      examData.pointsConfig = createDefaultPointsConfig(examData.questions || [])
      toast.loading('Đang lưu lên Supabase...', { id: toastId })
      const title = file.name.replace(/\.docx$/i, '')
      await createExam(examData, title)
      toast.success('Tải đề thi Word thành công!', { id: toastId })
    } catch (error: any) {
      toast.error(`Lỗi: ${error.message || 'Không thể đọc file Word'}`, { id: toastId })
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  // ── Upload đề LaTeX (.tex) ─────────────────────────────────────────────────
  const handleUploadLatex = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const toastId = toast.loading('Đang phân tích file LaTeX...')
    try {
      const examData = await parseTexToExam(file, (msg) => console.log(msg))
      examData.pointsConfig = createDefaultPointsConfig(examData.questions || [])
      toast.loading('Đang lưu lên Supabase...', { id: toastId })
      const title = file.name.replace(/\.tex$/i, '')
      await createExam(examData, title)
      toast.success('Tải đề thi LaTeX thành công!', { id: toastId })
    } catch (error: any) {
      toast.error(`Lỗi: ${error.message || 'Không thể đọc file LaTeX'}`, { id: toastId })
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  // ── Upload đề TSA (.tex) ─────────────────────────────────────────────────
  const handleUploadTSA = async () => {
    if (!tsaFile) return toast.error('Vui lòng chọn file .tex trước')
    setTsaParsing(true)
    setTsaProgress([])
    const toastId = toast.loading('Đang phân tích file TSA...')
    try {
      const examData = await parseTexToTSAExam(tsaFile, (msg) => {
        setTsaProgress(prev => [...prev, msg])
      })

      const { valid, errors, warnings } = validateTSAExamData(examData)
      if (!valid) {
        errors.forEach(e => toast.error(e))
        toast.dismiss(toastId)
        return
      }
      if (warnings.length > 0) {
        warnings.forEach(w => toast(w, { icon: '⚠️' }))
      }

      const pointsConfig = buildDefaultPointsConfig(examData)
      const dataToSave = { ...examData, exam_type: 'tsa', pointsConfig }

      toast.loading('Đang lưu lên Supabase...', { id: toastId })
      const { error } = await supabase.from('exams').insert({
        title: `[TSA] ${tsaFile.name.replace(/\.tex$/i, '')}`,
        data: dataToSave,
      })
      if (error) throw error

      toast.success(
        `✅ Tải lên thành công! ${examData.totalQuestions} câu / ${examData.sections.length} phần`,
        { id: toastId }
      )
      setTsaFile(null)
      setTsaProgress([])
      loadExams()
    } catch (e: any) {
      toast.error('Lỗi: ' + (e.message || 'Không parse được file TSA'), { id: toastId })
    } finally {
      setTsaParsing(false)
    }
  }

  // ── Xóa đề ──────────────────────────────────────────────────────────────
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Bạn có chắc muốn xóa đề: ${title}?`)) return
    try {
      await deleteExam(id)
      toast.success('Đã xóa đề thi')
    } catch (e) {
      toast.error('Lỗi khi xóa')
    }
  }

  // ── Xem trước đề thường ─────────────────────────────────────────────────────
  const handlePreview = async (id: string, title: string) => {
    setPreviewing(id)
    const toastId = toast.loading('Đang tải dữ liệu đề thi...')
    try {
      // Fetch trực tiếp từ Supabase — tránh cache stale của store
      const { data: examRow, error } = await supabase
        .from('exams').select('id, data, title').eq('id', id).single()
      if (error || !examRow) throw new Error(error?.message || 'Không tải được đề thi')
      setPreviewData({ id, title, ...examRow.data })
      toast.success('Tải thành công', { id: toastId })
    } catch (e: any) {
      toast.error('Lỗi tải đề thi: ' + (e.message || ''), { id: toastId })
    } finally {
      setPreviewing(null)
    }
  }

  // ── Xem trước đề TSA ─────────────────────────────────────────────────────
  const handlePreviewTSA = async (id: string, title: string) => {
    setTsaPreviewing(id)
    const toastId = toast.loading('Đang tải đề TSA...')
    try {
      // Fetch trực tiếp từ Supabase — tránh cache stale của store
      const { data: examRow, error } = await supabase
        .from('exams').select('id, data, title').eq('id', id).single()
      if (error || !examRow) throw new Error(error?.message || 'Không tải được đề TSA')
      if (!examRow.data) throw new Error('Dữ liệu đề thi trống, vui lòng tải lại trang')
      setTsaPreview({ data: examRow.data, id, title })
      toast.success('Tải thành công', { id: toastId })
    } catch (e: any) {
      toast.error('Lỗi tải đề TSA: ' + (e.message || ''), { id: toastId })
    } finally {
      setTsaPreviewing(null)
    }
  }

  // ── Cấu hình điểm ───────────────────────────────────────────────────────
  const handleOpenConfig = async (id: string, title: string) => {
    const toastId = toast.loading('Đang tải cấu hình...')
    try {
      // Fetch trực tiếp từ Supabase — tránh cache stale của store
      const { data: examRow, error } = await supabase
        .from('exams').select('id, data, title').eq('id', id).single()
      if (error || !examRow) throw new Error(error?.message || 'Không tải được cấu hình')
      const questions = examRow.data?.questions || []
      const pointsConfig = examRow.data?.pointsConfig || null
      const config = pointsConfig || createDefaultPointsConfig(questions)
      setConfigExam({ id, title, data: { questions, pointsConfig }, config })
      toast.success('Đã tải', { id: toastId })
    } catch (e: any) {
      toast.error('Lỗi tải cấu hình: ' + (e.message || ''), { id: toastId })
    }
  }

  // ── Edit câu hỏi ─────────────────────────────────────────────────────────
  const startEditing = (q: any) => {
    setEditingQuestionId(q.number)
    setEditForm(JSON.parse(JSON.stringify(q)))
  }

  const saveQuestionEdit = async () => {
    if (!editForm) return
    setSavingEdit(true)
    const toastId = toast.loading('Đang lưu thay đổi...')
    try {
      const updatedQuestions = previewData.questions.map((q: any) =>
        q.number === editForm.number ? editForm : q
      )
      const updatedAnswers = { ...(previewData.answers || {}) }
      if (editForm.correctAnswer) updatedAnswers[editForm.number] = editForm.correctAnswer
      else delete updatedAnswers[editForm.number]

      const newExamPayload = { ...previewData, questions: updatedQuestions, answers: updatedAnswers }
      const { error } = await supabase.from('exams').update({ data: newExamPayload }).eq('id', previewData.id)
      if (error) throw error

      setPreviewData((prev: any) => ({ ...prev, questions: updatedQuestions, answers: updatedAnswers }))
      setEditingQuestionId(null)
      setEditForm(null)
      toast.success('Đã cập nhật câu hỏi thành công!', { id: toastId })
    } catch (err: any) {
      toast.error('Lỗi khi lưu câu hỏi: ' + err.message, { id: toastId })
    } finally {
      setSavingEdit(false)
    }
  }

  let globalQuestionNumber = 1

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="page-header flex justify-between items-start">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <FileText className="w-7 h-7 text-teal-600" /> Ngân hàng đề thi
          </h1>
          <p className="text-gray-400 text-sm mt-1">Phân tích tự động và cấu hình điểm thi</p>
        </div>

        {/* Upload buttons - chỉ hiện khi ở tab thường */}
        {activeTab === 'normal' && (
          <div className="flex items-center gap-3">
            <label className={`btn-teal flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
              {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {uploading ? 'Đang xử lý...' : 'Tải lên từ Word'}
              <input type="file" accept=".docx" className="hidden" onChange={handleUploadWord} disabled={uploading} />
            </label>

            <label className={`px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-70 pointer-events-none' : ''}`}>
              {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              {uploading ? 'Đang xử lý...' : 'Tải lên từ LaTeX'}
              <input type="file" accept=".tex" className="hidden" onChange={handleUploadLatex} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex border-b-2 border-gray-200 gap-1">
        <button
          onClick={() => setActiveTab('normal')}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-all -mb-0.5 flex items-center gap-2 ${
            activeTab === 'normal'
              ? 'border-teal-600 text-teal-700 bg-teal-50 rounded-t-xl'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" /> Đề thường
          <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-1.5 py-0.5 rounded-full">
            LaTeX / Word
          </span>
        </button>
        <button
          onClick={() => setActiveTab('tsa')}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-all -mb-0.5 flex items-center gap-2 ${
            activeTab === 'tsa'
              ? 'border-orange-500 text-orange-700 bg-orange-50 rounded-t-xl'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Target className="w-4 h-4" /> Đề TSA
          <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-orange-200">
            6 dạng câu
          </span>
        </button>
      </div>

      {/* ── Tab TSA: Upload ── */}
      {activeTab === 'tsa' && (
        <div className="card space-y-5 p-6">
          {/* Info banner */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <Target className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-orange-800 text-base mb-1">📋 Đề thi TSA — Tư duy khoa học</h3>
                <p className="text-sm text-orange-700 mb-3">
                  Upload file <code className="bg-orange-100 px-1 rounded">.tex</code> để tạo đề TSA. Hệ thống sẽ tự động nhận dạng:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'I', name: 'Trắc nghiệm', sub: '4-6 đáp án', color: 'bg-blue-100 text-blue-700' },
                    { id: 'II', name: 'Đúng / Sai', sub: '2-6 mệnh đề', color: 'bg-teal-100 text-teal-700' },
                    { id: 'III', name: 'Chọn nhiều', sub: 'Nhiều đáp án đúng', color: 'bg-violet-100 text-violet-700' },
                    { id: 'IV', name: 'Kéo thả', sub: 'Bank + Slot', color: 'bg-orange-100 text-orange-700' },
                    { id: 'V', name: 'Điền khuyết', sub: '1-3+ ô trống', color: 'bg-rose-100 text-rose-700' },
                    { id: 'VI', name: 'Ghép đôi', sub: '4-6 cặp', color: 'bg-cyan-100 text-cyan-700' },
                  ].map(s => (
                    <div key={s.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${s.color} border border-current/20`}>
                      <span className="font-black text-[10px] opacity-60">{s.id}.</span>
                      <div>
                        <div className="font-bold text-[11px]">{s.name}</div>
                        <div className="text-[10px] opacity-70">{s.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* File input */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Chọn file LaTeX (.tex) *
            </label>
            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              tsaFile ? 'border-orange-400 bg-orange-50' : 'border-gray-300 hover:border-orange-300 hover:bg-orange-50/30'
            }`}>
              <input
                type="file" accept=".tex"
                onChange={e => {
                  setTsaFile(e.target.files?.[0] ?? null)
                  setTsaProgress([])
                }}
                className="hidden" id="tsa-file-input"
              />
              <label htmlFor="tsa-file-input" className="cursor-pointer">
                {tsaFile ? (
                  <div>
                    <div className="text-2xl mb-2">📄</div>
                    <p className="font-bold text-orange-700">{tsaFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(tsaFile.size / 1024).toFixed(1)} KB · Nhấp để thay đổi</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-3xl mb-2">📂</div>
                    <p className="font-bold text-gray-600">Nhấp để chọn file .tex</p>
                    <p className="text-xs text-gray-400 mt-1">Hoặc kéo thả vào đây</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Progress log */}
          {tsaProgress.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 max-h-52 overflow-y-auto border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 font-mono text-xs font-bold">Log phân tích</span>
              </div>
              {tsaProgress.map((msg, i) => (
                <div key={i} className="text-green-300 font-mono text-xs leading-relaxed">{msg}</div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <div className="flex gap-3">
            <button
              onClick={handleUploadTSA}
              disabled={!tsaFile || tsaParsing}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
                !tsaFile || tsaParsing
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 hover:scale-105 shadow-orange-200'
              }`}
            >
              {tsaParsing
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang phân tích...</>
                : <><FileUp className="w-4 h-4" /> Parse & Tải lên đề TSA</>}
            </button>
            {tsaFile && !tsaParsing && (
              <button
                onClick={() => { setTsaFile(null); setTsaProgress([]) }}
                className="px-4 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
              >
                Hủy
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Giao diện 4 cột theo Khối lớp (Khối 6, Khối 7, Khối 8, Khối 9) ── */}
      {loading && exams.length === 0 ? (
        <div className="card py-16 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-500 mx-auto" />
          <p className="text-gray-400 text-sm mt-2">Đang tải danh sách đề thi...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { grade: 6, label: 'Khối 6', color: 'blue', border: 'border-blue-300', headerBg: 'bg-blue-50/60', text: 'text-blue-600', badgeBg: 'bg-blue-100 text-blue-700' },
            { grade: 7, label: 'Khối 7', color: 'emerald', border: 'border-emerald-300', headerBg: 'bg-emerald-50/60', text: 'text-emerald-600', badgeBg: 'bg-emerald-100 text-emerald-700' },
            { grade: 8, label: 'Khối 8', color: 'orange', border: 'border-orange-300', headerBg: 'bg-orange-50/60', text: 'text-orange-600', badgeBg: 'bg-orange-100 text-orange-700' },
            { grade: 9, label: 'Khối 9', color: 'purple', border: 'border-purple-300', headerBg: 'bg-purple-50/60', text: 'text-purple-600', badgeBg: 'bg-purple-100 text-purple-700' },
          ].map(col => {
            // Lọc đề thi thuộc khối tương ứng
            const gradeExams = exams.filter(exam => {
              const isTSA = (exam as any).exam_type === 'tsa' || exam.title?.startsWith('[TSA]')
              if (activeTab === 'tsa' && !isTSA) return false
              if (activeTab === 'normal' && isTSA) return false

              const title = (exam.title || '').toLowerCase()
              const examGrade = (exam as any).grade || (exam.data as any)?.grade
              
              // Nếu có thuộc tính grade rõ ràng
              if (examGrade) return Number(examGrade) === col.grade

              // Phân tích từ tiêu đề
              if (title.includes(`k${col.grade}`) || title.includes(`khối ${col.grade}`) || title.includes(`lớp ${col.grade}`) || title.startsWith(`${col.grade}.`)) {
                return true
              }

              // Nếu đề số tự do (ví dụ 6.15.8 -> Khối 6, 8.05.1 -> Khối 8)
              if (title.startsWith(`${col.grade}`)) return true

              // Mặc định phân bổ đều nếu không chứa số khối khác
              if (col.grade === 6 && !title.includes('7') && !title.includes('8') && !title.includes('9')) return true
              if (col.grade === 8 && (title.includes('8') || title.includes('buổi'))) return true
              return false
            })

            return (
              <div key={col.grade} className={`card border-t-4 ${col.border} min-h-[480px] flex flex-col p-4 bg-white shadow-sm hover:shadow-md transition-shadow`}>
                {/* Column Header */}
                <div className={`flex items-center justify-between p-2.5 rounded-xl ${col.headerBg} mb-3`}>
                  <span className={`font-black text-sm ${col.text}`}>{col.label}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                    {gradeExams.length} đề
                  </span>
                </div>

                {/* Exams List */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-1">
                  {gradeExams.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-xs text-gray-400 italic">
                      Chưa có đề thi
                    </div>
                  ) : (
                    gradeExams.map(exam => {
                      const isTSA = (exam as any).exam_type === 'tsa' || exam.title?.startsWith('[TSA]')
                      return (
                        <div
                          key={exam.id}
                          className="p-3 border border-gray-100 rounded-xl hover:border-teal-200 hover:shadow-sm bg-white transition-all space-y-2 group"
                        >
                          <div className="font-bold text-gray-800 text-xs leading-snug line-clamp-2 group-hover:text-teal-700">
                            {exam.title}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {fmt(new Date(exam.created_at), 'dd/MM/yyyy HH:mm')}
                          </div>

                          {/* Action Icon Row */}
                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-gray-50 text-gray-400">
                            {!isTSA && (
                              <button
                                onClick={() => handleOpenConfig(exam.id, exam.title)}
                                className="p-1 hover:text-orange-500 hover:bg-orange-50 rounded transition"
                                title="Cấu hình điểm"
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isTSA ? (
                              <button
                                onClick={() => handlePreview(exam.id, exam.title)}
                                disabled={previewing === exam.id}
                                className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                title="Xem trước & Chỉnh sửa"
                              >
                                {previewing === exam.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePreviewTSA(exam.id, exam.title)}
                                disabled={tsaPreviewing === exam.id}
                                className="p-1 hover:text-orange-600 hover:bg-orange-50 rounded transition"
                                title="Xem trước & Chỉnh sửa đề TSA"
                              >
                                {tsaPreviewing === exam.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            )}

                            <button
                              onClick={() => handleDelete(exam.id, exam.title)}
                              className="p-1 hover:text-red-600 hover:bg-red-50 rounded transition"
                              title="Xóa đề thi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal cấu hình điểm ── */}
      <Modal open={!!configExam} onClose={() => setConfigExam(null)} title="" size="3xl">
        {configExam && (
          <div className="-m-6">
            <PointsConfigEditor
              config={configExam.config}
              onChange={async (newConfig) => {
                const newData = { ...configExam.data, pointsConfig: newConfig }
                await supabase.from('exams').update({ data: newData }).eq('id', configExam.id)
                toast.success('Lưu cấu hình điểm thành công!')
                setConfigExam(null)
              }}
              onClose={() => setConfigExam(null)}
            />
          </div>
        )}
      </Modal>

      {/* ── Modal xem trước & chỉnh sửa đề thường ── */}
      <Modal
        open={!!previewData}
        onClose={() => { if (!savingEdit) setPreviewData(null); setEditingQuestionId(null) }}
        title={`Xem trước & Biên tập: ${previewData?.title}`}
        size="3xl"
      >
        <div className="space-y-8 max-h-[75vh] overflow-y-auto pr-2 bg-gray-50 p-4 rounded-xl">
          {[1, 2, 3, 4].map(part => {
            const questionsInPart = previewData?.questions?.filter((q: any) => {
              const qPart = typeof q.part === 'string' ? parseInt(q.part.replace(/\D/g, '')) : q.part
              return qPart === part
            }) || []
            if (questionsInPart.length === 0) return null

            const partTitles: Record<number, { title: string; desc: string; color: string }> = {
              1: { title: 'PHẦN 1. TRẮC NGHIỆM NHIỀU LỰA CHỌN', desc: 'Mỗi câu chọn 1 đáp án đúng (A, B, C, D)', color: 'bg-blue-600' },
              2: { title: 'PHẦN 2. TRẮC NGHIỆM ĐÚNG/SAI', desc: 'Chọn Đúng hoặc Sai cho mỗi ý a, b, c, d', color: 'bg-emerald-600' },
              3: { title: 'PHẦN 3. TRẢ LỜI NGẮN', desc: 'Điền đáp án số vào ô trống', color: 'bg-orange-600' },
              4: { title: 'PHẦN 4. TỰ LUẬN', desc: 'Trình bày lời giải chi tiết', color: 'bg-violet-600' },
            }
            const info = partTitles[part]

            return (
              <div key={part} className="space-y-4">
                <div className={`p-4 rounded-xl shadow-md text-white ${info.color} bg-gradient-to-r from-black/10 to-transparent`}>
                  <h3 className="font-bold text-lg">{info.title}</h3>
                  <p className="text-sm opacity-90">{info.desc}</p>
                </div>

                {questionsInPart.map((q: any) => {
                  const displayQNum = globalQuestionNumber++
                  const isEditingThis = editingQuestionId === q.number

                  return (
                    <div key={q.number} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-teal-100 text-teal-700 font-bold rounded-full flex items-center justify-center flex-shrink-0">
                            {displayQNum}
                          </div>
                          <span className="text-xs text-gray-400 font-mono">ID: {q.number}</span>
                        </div>
                        {!isEditingThis ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setImageAttachTarget(q)}
                              className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 transition-all border ${
                                q.images?.length > 0
                                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                  : 'btn-outline hover:bg-gray-50'
                              }`}
                              title="Chèn ảnh vào câu này"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              {q.images?.length > 0 ? `${q.images.length} ảnh` : 'Chèn ảnh'}
                            </button>
                            <button onClick={() => startEditing(q)} className="btn-outline py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-all">
                              <Edit2 className="w-3.5 h-3.5" /> Sửa câu này
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={saveQuestionEdit} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm">
                              <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            <button onClick={() => { setEditingQuestionId(null); setEditForm(null) }} disabled={savingEdit} className="bg-gray-200 hover:bg-gray-300 text-gray-700 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 transition-all">
                              <X className="w-3.5 h-3.5" /> Hủy
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Chế độ xem */}
                      {!isEditingThis ? (
                        <div className="space-y-4">
                          <div className="pl-12">
                            <MathText html={q.text} block className="text-gray-800 font-medium text-base leading-relaxed" />
                            {q.images?.map((img: any, idx: number) => (
                              <img key={idx} src={img.base64 ? `data:${img.contentType || 'image/png'};base64,${img.base64}` : `data:image/png;base64,${img.data}`} className="max-h-64 mt-3 rounded-lg border border-gray-200 shadow-sm" alt={`Ảnh câu ${displayQNum}`} />
                            ))}
                          </div>

                          {part === 1 && q.options?.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-12">
                              {q.options.map((opt: any, idx: number) => {
                                const isCorrect = q.correctAnswer?.toUpperCase() === opt.letter.toUpperCase()
                                const displayLetter = String.fromCharCode(65 + idx)
                                return (
                                  <div key={opt.letter} className={`flex items-start gap-3 p-3 rounded-xl border-2 ${isCorrect ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isCorrect ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>{displayLetter}</span>
                                    <MathText html={opt.text} className={`text-sm pt-0.5 ${isCorrect ? 'text-blue-800 font-medium' : 'text-gray-700'}`} />
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {part === 2 && q.options?.length > 0 && (
                            <div className="pl-12">
                              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                <div className="grid grid-cols-[1fr_80px_80px] bg-slate-100 border-b border-gray-200 text-xs font-bold text-gray-500 text-center uppercase tracking-wider">
                                  <div className="py-2.5 px-4 text-left">Mệnh đề</div>
                                  <div className="py-2.5 border-l border-gray-200 text-emerald-700 bg-emerald-50/50">Đúng</div>
                                  <div className="py-2.5 border-l border-gray-200 text-red-700 bg-red-50/50">Sai</div>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {q.options.map((opt: any, idx: number) => {
                                    const isTrue = q.correctAnswer?.toLowerCase().includes(opt.letter.toLowerCase())
                                    const displayLetter = String.fromCharCode(97 + idx)
                                    return (
                                      <div key={opt.letter} className={`grid grid-cols-[1fr_80px_80px] text-sm items-stretch ${isTrue ? 'bg-emerald-50/30' : 'bg-red-50/30'}`}>
                                        <div className="p-3 flex gap-2.5 items-start">
                                          <span className={`font-bold mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white shadow-sm flex-shrink-0 ${isTrue ? 'bg-emerald-500' : 'bg-red-400'}`}>{displayLetter}</span>
                                          <MathText html={opt.text} className="text-gray-700 leading-relaxed pt-px" />
                                        </div>
                                        <div className={`border-l border-gray-200 flex items-center justify-center ${isTrue ? 'bg-emerald-500 text-white' : ''}`}>
                                          {isTrue ? <span className="font-bold text-sm">✓</span> : <span className="w-3 h-3 border border-gray-300 rounded-full bg-white" />}
                                        </div>
                                        <div className={`border-l border-gray-200 flex items-center justify-center ${!isTrue ? 'bg-red-500 text-white' : ''}`}>
                                          {!isTrue ? <span className="font-bold text-sm">✕</span> : <span className="w-3 h-3 border border-gray-300 rounded-full bg-white" />}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )}

                          {part === 3 && q.correctAnswer && (
                            <div className="pl-12">
                              <div className="inline-block bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
                                <span className="text-orange-800 font-bold text-sm">Đáp án: </span>
                                <span className="text-orange-900 font-bold text-lg ml-1">{q.correctAnswer}</span>
                              </div>
                            </div>
                          )}

                          {q.solution && (
                            <div className="pl-12">
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                <span className="font-bold text-slate-700 text-sm block mb-2">💡 Lời giải chi tiết:</span>
                                <MathText html={q.solution} className="text-sm text-slate-700 leading-relaxed" block />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Chế độ chỉnh sửa */
                        <div className="space-y-4 pl-4 border-l-4 border-amber-400 bg-amber-50/30 p-4 rounded-r-xl">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nội dung câu hỏi *</label>
                            <textarea value={editForm.text} onChange={e => setEditForm({ ...editForm, text: e.target.value })} className="input font-mono text-sm" rows={3} />
                          </div>

                          {part === 1 && editForm.options && (
                            <div className="space-y-3">
                              <label className="block text-xs font-bold text-gray-500">Các phương án và đáp án đúng</label>
                              <div className="grid grid-cols-1 gap-2">
                                {editForm.options.map((opt: any, idx: number) => {
                                  const letter = opt.letter.toUpperCase()
                                  const isCorrect = editForm.correctAnswer?.toUpperCase() === letter
                                  return (
                                    <div key={opt.letter} className="flex items-center gap-2">
                                      <button type="button" onClick={() => setEditForm({ ...editForm, correctAnswer: letter })} className={`w-8 h-8 rounded-full font-bold text-xs flex-shrink-0 transition-all ${isCorrect ? 'bg-blue-600 text-white border-2 border-blue-700' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'}`}>{letter}</button>
                                      <input type="text" value={opt.text} onChange={e => { const newOpts = [...editForm.options]; newOpts[idx].text = e.target.value; setEditForm({ ...editForm, options: newOpts }) }} className="input py-1 text-sm flex-1" />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {part === 2 && editForm.options && (
                            <div className="space-y-3">
                              <label className="block text-xs font-bold text-gray-500">Các mệnh đề và trạng thái Đúng / Sai</label>
                              <div className="space-y-2">
                                {editForm.options.map((opt: any, idx: number) => {
                                  const letter = opt.letter.toLowerCase()
                                  const isTrue = editForm.correctAnswer?.toLowerCase().includes(letter)
                                  const handleToggleTF = () => {
                                    let arr = editForm.correctAnswer ? editForm.correctAnswer.toLowerCase().split(',').filter(Boolean) : []
                                    arr = isTrue ? arr.filter((x: string) => x !== letter) : [...arr, letter]
                                    setEditForm({ ...editForm, correctAnswer: arr.sort().join(',') })
                                  }
                                  return (
                                    <div key={opt.letter} className="flex items-start gap-2">
                                      <button type="button" onClick={handleToggleTF} className={`py-1.5 px-3 rounded-lg text-xs font-bold flex-shrink-0 ${isTrue ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>
                                        Mệnh đề {letter.toUpperCase()}: {isTrue ? 'ĐÚNG' : 'SAI'}
                                      </button>
                                      <input type="text" value={opt.text} onChange={e => { const newOpts = [...editForm.options]; newOpts[idx].text = e.target.value; setEditForm({ ...editForm, options: newOpts }) }} className="input py-1 text-sm flex-1" />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {part === 3 && (
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1">Đáp án đúng *</label>
                              <input type="text" value={editForm.correctAnswer || ''} onChange={e => setEditForm({ ...editForm, correctAnswer: e.target.value })} className="input py-1.5 font-bold text-orange-700" />
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Lời giải chi tiết</label>
                            <textarea value={editForm.solution || ''} onChange={e => setEditForm({ ...editForm, solution: e.target.value })} className="input font-mono text-xs" rows={2} placeholder="Nhập lời giải..." />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </Modal>
      {/* ── Modal TSA Preview ── */}
      {tsaPreview && (
        <TSAPreviewModal
          examData={tsaPreview.data}
          examId={tsaPreview.id}
          examTitle={tsaPreview.title}
          onClose={() => setTsaPreview(null)}
          onSaved={(updated) => setTsaPreview(prev => prev ? { ...prev, data: updated } : null)}
        />
      )}

      {/* ── Modal chèn ảnh câu hỏi ── */}
      {imageAttachTarget && previewData && (
        <ImageAttachModal
          open={true}
          onClose={() => setImageAttachTarget(null)}
          questionLabel={`Câu ${imageAttachTarget.number}`}
          currentImages={imageAttachTarget.images || []}
          onSave={async (imgs: AttachedImage[]) => {
            // Cập nhật question trong previewData và lưu lên Supabase
            const updatedQuestions = previewData.questions.map((q: any) =>
              q.number === imageAttachTarget.number
                ? { ...q, images: imgs }
                : q
            )
            const newExamPayload = { ...previewData, questions: updatedQuestions }
            const { error } = await supabase
              .from('exams')
              .update({ data: newExamPayload })
              .eq('id', previewData.id)
            if (error) { toast.error('Lỗi lưu ảnh: ' + error.message); return }
            setPreviewData(newExamPayload)
            setImageAttachTarget(null)
            toast.success(`Đã lưu ${imgs.length} ảnh vào câu ${imageAttachTarget.number}`)
          }}
        />
      )}
    </div>
  )
}
