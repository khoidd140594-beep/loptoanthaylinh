// @ts-nocheck
// components/ImageAttachModal.tsx
// Modal chèn ảnh thủ công vào câu hỏi (upload file hoặc paste Ctrl+V)
// Ảnh lưu dạng base64 trong question.images[] — tương thích ExamRoom & ResultView

import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Clipboard, X, Check, Image as ImageIcon, Trash2, ZoomIn } from 'lucide-react'
import Modal from '@/components/Modal'
import toast from 'react-hot-toast'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AttachedImage {
  base64: string        // raw base64, không có data:... prefix
  contentType: string   // 'image/png' | 'image/jpeg' | ...
  name?: string         // tên file gốc (tuỳ chọn)
}

interface ImageAttachModalProps {
  open: boolean
  onClose: () => void
  questionLabel: string           // VD: "Câu 3" để hiển thị trong title
  currentImages: AttachedImage[]  // ảnh đang có
  onSave: (images: AttachedImage[]) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fileToAttached(file: File): Promise<AttachedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64  = dataUrl.split(',')[1]
      resolve({ base64, contentType: file.type || 'image/png', name: file.name })
    }
    reader.onerror = () => reject(new Error('Không đọc được file'))
    reader.readAsDataURL(file)
  })
}

function blobToAttached(blob: Blob, name = 'paste.png'): Promise<AttachedImage> {
  return fileToAttached(new File([blob], name, { type: blob.type || 'image/png' }))
}

function dataUrl(img: AttachedImage) {
  return `data:${img.contentType};base64,${img.base64}`
}

function sizeKb(base64: string) {
  return Math.round((base64.length * 3) / 4 / 1024)
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImageAttachModal({
  open, onClose, questionLabel, currentImages, onSave,
}: ImageAttachModalProps) {
  const [images, setImages]       = useState<AttachedImage[]>([])
  const [tab, setTab]             = useState<'upload' | 'paste'>('upload')
  const [dragging, setDragging]   = useState(false)
  const [zoomed, setZoomed]       = useState<string | null>(null)
  const [adding, setAdding]       = useState(false)
  const fileRef                   = useRef<HTMLInputElement>(null)
  const pasteRef                  = useRef<HTMLDivElement>(null)

  // Sync state khi mở modal
  useEffect(() => {
    if (open) setImages(currentImages ? [...currentImages] : [])
  }, [open, currentImages])

  // Lắng nghe Ctrl+V toàn cục khi tab paste đang active
  useEffect(() => {
    if (!open || tab !== 'paste') return
    const handler = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || [])
      const imgItem = items.find(i => i.type.startsWith('image/'))
      if (!imgItem) { toast.error('Clipboard không có ảnh. Hãy copy ảnh trước rồi paste.'); return }
      const blob = imgItem.getAsFile()
      if (!blob) return
      await addBlob(blob)
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [open, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const addBlob = async (blob: Blob, name?: string) => {
    setAdding(true)
    try {
      // Resize nếu ảnh quá lớn (> 1MB base64 ~ 750KB file)
      const attached = await blobToAttached(blob, name)
      if (attached.base64.length > 1_000_000) {
        toast.error('Ảnh quá lớn (>750KB). Vui lòng dùng ảnh nhỏ hơn.')
        return
      }
      setImages(prev => [...prev, attached])
      toast.success('Đã thêm ảnh!')
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi thêm ảnh')
    } finally {
      setAdding(false)
    }
  }

  // ── Upload file ──
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imgs.length === 0) { toast.error('Chỉ hỗ trợ file ảnh (PNG, JPG, GIF, WebP)'); return }
    for (const f of imgs) await addBlob(f, f.name)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag & drop ──
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  // ── Remove ──
  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Save ──
  const handleSave = () => {
    onSave(images)
    onClose()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={`📎 Chèn ảnh — ${questionLabel}`} size="xl">
        <div className="space-y-4">

          {/* ── Tab chọn cách thêm ── */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {([
              { key: 'upload', icon: Upload,    label: 'Upload file' },
              { key: 'paste',  icon: Clipboard, label: 'Paste (Ctrl+V)' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition ${
                  tab === key
                    ? 'bg-white text-teal-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* ── Upload tab ── */}
          {tab === 'upload' && (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-teal-500 bg-teal-50 scale-[1.01]'
                  : 'border-gray-300 hover:border-teal-400 hover:bg-teal-50/30'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Upload className="w-7 h-7 text-teal-600" />
              </div>
              <p className="font-bold text-gray-700">Kéo thả ảnh vào đây</p>
              <p className="text-sm text-gray-400 mt-1">hoặc nhấp để chọn file · PNG, JPG, GIF, WebP</p>
              <p className="text-xs text-gray-300 mt-2">Tối đa ~750KB mỗi ảnh</p>
            </div>
          )}

          {/* ── Paste tab ── */}
          {tab === 'paste' && (
            <div
              ref={pasteRef}
              className="border-2 border-dashed border-violet-300 bg-violet-50 rounded-2xl p-8 text-center"
            >
              <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Clipboard className="w-7 h-7 text-violet-600" />
              </div>
              <p className="font-bold text-gray-700">Nhấn <kbd className="bg-white border border-gray-200 rounded px-2 py-0.5 text-xs font-mono shadow-sm">Ctrl</kbd> + <kbd className="bg-white border border-gray-200 rounded px-2 py-0.5 text-xs font-mono shadow-sm">V</kbd> để dán ảnh</p>
              <p className="text-sm text-gray-400 mt-2">Chụp màn hình hoặc copy ảnh từ bất kỳ đâu rồi paste vào đây</p>
              {adding && (
                <div className="mt-4 flex items-center justify-center gap-2 text-violet-600 font-bold text-sm">
                  <div className="w-4 h-4 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                  Đang xử lý...
                </div>
              )}
            </div>
          )}

          {/* ── Danh sách ảnh đã thêm ── */}
          {images.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {images.length} ảnh đã chèn
                </p>
                <button
                  onClick={() => setImages([])}
                  className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Xóa tất cả
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((img, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
                    <img
                      src={dataUrl(img)}
                      alt={img.name || `Ảnh ${i + 1}`}
                      className="w-full h-full object-contain p-1"
                    />
                    {/* Overlay actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        onClick={() => setZoomed(dataUrl(img))}
                        className="p-1.5 bg-white/90 rounded-lg text-gray-700 hover:text-teal-600"
                        title="Xem to"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeImage(i)}
                        className="p-1.5 bg-white/90 rounded-lg text-gray-700 hover:text-red-600"
                        title="Xóa ảnh này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Size badge */}
                    <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[9px] font-mono px-1 rounded">
                      {sizeKb(img.base64)}KB
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {images.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 text-sm text-gray-400">
              <ImageIcon className="w-4 h-4 shrink-0" />
              Chưa có ảnh nào. Thêm ảnh ở trên để hiển thị trong câu hỏi.
            </div>
          )}

          {/* ── Footer ── */}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-sm transition shadow-md"
            >
              <Check className="w-4 h-4" />
              Lưu {images.length} ảnh vào câu hỏi
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Zoom lightbox ── */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setZoomed(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={zoomed} alt="Xem to" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            <button
              onClick={() => setZoomed(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700 hover:text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
