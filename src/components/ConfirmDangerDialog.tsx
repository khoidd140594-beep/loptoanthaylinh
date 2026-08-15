import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  /** Mô tả việc sắp xảy ra. Nói rõ cái gì mất, không nói chung chung. */
  children: React.ReactNode
  /** Chữ người dùng phải gõ đúng mới bật được nút. Bỏ trống = xác nhận thường. */
  confirmWord?: string
  confirmLabel?: string
  tone?: 'danger' | 'warn'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Hộp thoại cho việc không hoàn tác được.
 *
 * Khi có `confirmWord`, người dùng phải gõ đúng chữ đó mới bấm được nút. Đây là
 * chỗ dừng có chủ ý: xoá hàng loạt rất dễ bấm nhầm, và dữ liệu học phí mất là
 * mất bằng chứng khi phụ huynh thắc mắc.
 */
export default function ConfirmDangerDialog({
  open,
  title,
  children,
  confirmWord,
  confirmLabel = 'Xoá vĩnh viễn',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  if (!open) return null

  const ready = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase()

  const headerBg =
    tone === 'danger'
      ? 'linear-gradient(135deg,#dc2626,#ef4444)'
      : 'linear-gradient(135deg,#d97706,#f59e0b)'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border-2 border-red-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 text-white" style={{ background: headerBg }}>
          <h3 className="flex items-center gap-2 font-800">
            <AlertTriangle className="w-5 h-5" /> {title}
          </h3>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
            className="rounded-lg p-1 transition hover:bg-white/20 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-gray-700">
          <div className="leading-relaxed">{children}</div>

          {confirmWord && (
            <div>
              <label className="label">
                Gõ <span className="font-mono text-red-600">{confirmWord}</span> để xác nhận
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
                autoComplete="off"
                placeholder={confirmWord}
                className="input font-mono"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t-2 border-gray-100 bg-gray-50 px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-5 py-2.5 text-sm font-600 text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready || busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-700 text-white shadow transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
