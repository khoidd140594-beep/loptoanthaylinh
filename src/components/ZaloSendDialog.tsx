import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  Paperclip,
  RotateCcw,
  Send,
  X,
} from 'lucide-react'
import {
  isUsableZaloPhone,
  sendZaloBulk,
  sendZaloFiles,
  sendZaloMessage,
  waitForZaloJob,
  type ZaloJob,
  type ZaloLogRef,
  type ZaloRecipient,
  type ZaloSentMap,
} from '@/services/zaloService'
import { MAX_FILES, fmtSize, prepareFiles, stripPreview, type ZaloFileInput } from '@/services/zaloFiles'

interface Props {
  open: boolean
  title: string
  recipients: ZaloRecipient[]
  onClose: () => void
  /**
   * Cho phép đính file hay không. Mặc định true.
   * Đặt false ở những chỗ tuyệt đối không nên gửi ảnh (ví dụ gửi điểm hàng loạt).
   */
  allowAttachments?: boolean
  /** Khoá nhật ký đã gửi. Có giá trị này thì mới ghi và cảnh báo gửi trùng. */
  log?: ZaloLogRef
  /** Nhật ký hiện có, do trang truyền vào để cảnh báo gửi trùng. */
  sentLog?: ZaloSentMap
  /** Gọi sau khi gửi xong, để trang tải lại nhật ký. */
  onSent?: () => void
}

type SendState = 'idle' | 'sending' | 'queued' | 'done' | 'error'

function fmtSentAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'không rõ thời điểm'
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Khối cảnh báo dùng chung, đổi màu theo mức độ. */
function Notice({
  tone = 'warn',
  icon,
  children,
}: {
  tone?: 'warn' | 'danger' | 'ok' | 'info'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const tones = {
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-red-200 bg-red-50 text-red-700',
    ok: 'border-green-200 bg-green-50 text-green-800',
    info: 'border-teal-200 bg-teal-50 text-teal-800',
  }
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border-2 px-4 py-3 text-sm ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-teal-100 bg-teal-50/40 px-3 py-2">
      <p className="label mb-0.5">{label}</p>
      <p className={`text-base font-800 ${danger ? 'text-red-500' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

export default function ZaloSendDialog({
  open,
  title,
  recipients,
  onClose,
  allowAttachments = true,
  log,
  sentLog,
  onSent,
}: Props) {
  const [singleMessage, setSingleMessage] = useState('')
  const [comment, setComment] = useState('')
  const [state, setState] = useState<SendState>('idle')
  const [error, setError] = useState('')
  const [job, setJob] = useState<ZaloJob | null>(null)
  const [files, setFiles] = useState<ZaloFileInput[]>([])
  const [preparing, setPreparing] = useState(false)
  const [confirmShared, setConfirmShared] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setSingleMessage(recipients.length === 1 ? recipients[0]?.message || '' : '')
    setComment('')
    setState('idle')
    setError('')
    setJob(null)
    setFiles([])
    setConfirmShared(false)
    setConfirmResend(false)
    // Khởi tạo lại mỗi lần hộp thoại được mở.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const validRecipients = useMemo(
    () => recipients.filter((recipient) => isUsableZaloPhone(recipient.phone)),
    [recipients],
  )
  const missingPhone = recipients.length - validRecipients.length

  const isBulk = recipients.length > 1

  // Những người đã từng được gửi thông báo này. Cảnh báo mềm, không chặn cứng:
  // nhật ký ghi lúc tin vào hàng đợi, nếu tin đó thất bại thì vẫn phải gửi lại được.
  const alreadySent = useMemo(() => {
    if (!sentLog) return []
    return validRecipients
      .map((recipient) => ({ recipient, entry: sentLog[recipient.id] }))
      .filter((item) => item.entry)
  }, [sentLog, validRecipients])

  const needsResendConfirm = alreadySent.length > 0

  // File đính ở đây là GIỐNG NHAU cho mọi người nhận. Với tin gửi hàng loạt,
  // đây là chỗ dễ làm lộ thông tin riêng của học sinh khác nên phải xác nhận.
  const needsConfirm = isBulk && files.length > 0

  function withComment(message: string) {
    const note = comment.trim()
    return note ? `${message.trim()}\n\nNhận xét: ${note}` : message.trim()
  }

  const preview =
    recipients.length === 1
      ? singleMessage
      : validRecipients[0]
        ? withComment(validRecipients[0].message)
        : ''

  async function onPickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files || [])
    if (picked.length === 0) return

    setPreparing(true)
    setError('')

    try {
      const room = MAX_FILES - files.length
      if (room <= 0) throw new Error(`Đã đủ ${MAX_FILES} file.`)

      if (picked.length > room) {
        setError(`Chỉ thêm được ${room} file nữa, những file sau sẽ bị bỏ qua.`)
      }

      const fresh = await prepareFiles(picked.slice(0, room))
      setFiles((prev) => [...prev, ...fresh])
      setConfirmShared(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xử lý được file.')
    } finally {
      setPreparing(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setConfirmShared(false)
  }

  async function send() {
    if (validRecipients.length === 0) {
      setError('Không có phụ huynh nào có số điện thoại hợp lệ.')
      setState('error')
      return
    }

    if (needsConfirm && !confirmShared) {
      setError('Vui lòng xác nhận rằng file đính kèm không chứa thông tin riêng của học sinh khác.')
      setState('error')
      return
    }

    if (needsResendConfirm && !confirmResend) {
      setError('Thông báo này đã được gửi trước đó. Vui lòng xác nhận nếu bạn muốn gửi lại.')
      setState('error')
      return
    }

    const sharedFiles = files.length > 0 ? stripPreview(files) : undefined

    const payload =
      recipients.length === 1
        ? [{ ...validRecipients[0], message: singleMessage.trim() }]
        : validRecipients.map((recipient) => ({
            ...recipient,
            message: withComment(recipient.message),
          }))

    // Có file thì nội dung được phép để trống (ảnh tự nói thay lời).
    if (!sharedFiles && payload.some((recipient) => !recipient.message)) {
      setError('Nội dung tin nhắn không được để trống.')
      setState('error')
      return
    }

    setState('sending')
    setError('')
    setJob(null)

    try {
      let jobId: string

      if (payload.length === 1) {
        const only = payload[0]
        // File riêng của từng người (nếu trang gọi đã gắn) được ưu tiên.
        const attach = only.files ? stripPreview(only.files) : sharedFiles

        jobId = attach
          ? await sendZaloFiles({ ...only, files: attach }, log)
          : await sendZaloMessage(only, log)
      } else {
        jobId = await sendZaloBulk(
          payload.map((recipient) => ({
            ...recipient,
            files: recipient.files ? stripPreview(recipient.files) : sharedFiles,
          })),
          log,
        )
      }

      // Nhật ký đã được ghi ở phía server, báo trang tải lại để hiện dấu.
      onSent?.()

      setState('queued')
      const result = await waitForZaloJob(jobId, setJob)

      if (!result || result.status !== 'done') {
        setState('queued')
        return
      }

      setState('done')
      if (result.failed > 0) {
        setError(`${result.failed}/${result.total} tin gửi thất bại. Kiểm tra kết quả bên dưới.`)
      }
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'Không gửi được Zalo.')
    }
  }

  if (!open) return null

  const busy = state === 'sending' || preparing
  const locked = busy || state === 'done'
  const totalBytes = files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-teal-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 text-white"
          style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}
        >
          <h3 className="flex items-center gap-2 font-800">
            <MessageCircle className="w-5 h-5" /> {title}
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

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Người nhận" value={validRecipients.length} />
            <Stat label="Thiếu/sai SĐT" value={missingPhone} danger={missingPhone > 0} />
            {files.length > 0 && (
              <Stat label="File đính kèm" value={`${files.length} · ${fmtSize(totalBytes)}`} />
            )}
            {job && <Stat label="Tiến độ" value={`${job.sent + job.failed}/${job.total}`} />}
          </div>

          {recipients.length === 1 ? (
            <div>
              <label className="label">Nội dung tin nhắn</label>
              <textarea
                className="input font-mono text-xs leading-relaxed"
                rows={10}
                value={singleMessage}
                onChange={(event) => setSingleMessage(event.target.value)}
                disabled={locked}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="label">Nhận xét chung (không bắt buộc)</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Nhập nhận xét muốn thêm vào cuối tin nhắn của từng học sinh..."
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={locked}
                />
              </div>
              <div>
                <label className="label">
                  Xem trước — {validRecipients[0]?.name || 'chưa có người nhận'}
                </label>
                <textarea
                  className="input bg-gray-50 font-mono text-xs leading-relaxed"
                  rows={9}
                  readOnly
                  value={preview}
                />
              </div>
            </>
          )}

          {/* ── Đính kèm ảnh và file ── */}
          {allowAttachments && (
            <div>
              <label className="label">Ảnh / file đính kèm (không bắt buộc, tối đa {MAX_FILES})</label>

              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={onPickFiles}
                disabled={locked || files.length >= MAX_FILES}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={locked || files.length >= MAX_FILES}
                className="btn-outline inline-flex items-center gap-1.5 py-2 text-sm"
              >
                {preparing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
                {preparing ? 'Đang xử lý ảnh...' : 'Chọn ảnh hoặc file'}
              </button>

              {files.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {files.map((file, index) => (
                    <div
                      key={`${file.filename}_${index}`}
                      className="relative rounded-xl border-2 border-teal-100 bg-white p-1.5"
                    >
                      {file.previewUrl ? (
                        <img
                          src={file.previewUrl}
                          alt={file.filename}
                          className="h-16 w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 items-center justify-center text-gray-300">
                          <FileText className="w-7 h-7" />
                        </div>
                      )}
                      <p className="mt-1 truncate text-[10px] font-600 text-gray-600" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="text-[10px] text-gray-400">{fmtSize(file.sizeBytes || 0)}</p>

                      {!locked && (
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          aria-label={`Bỏ ${file.filename}`}
                          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-xs text-gray-400">
                Ảnh được tự động nén về khoảng 1600px trước khi gửi, vẫn đọc rõ bảng điểm hay phiếu
                học phí. File lớn hơn {fmtSize(2_600_000)} cần tải lên Drive rồi gửi bằng link.
              </p>
            </div>
          )}

          {/* Cảnh báo gửi trùng */}
          {needsResendConfirm && (
            <Notice tone="warn" icon={<RotateCcw className="w-4 h-4" />}>
              <strong>
                {alreadySent.length === validRecipients.length
                  ? isBulk
                    ? 'Cả danh sách này đã được gửi thông báo trước đó.'
                    : 'Phụ huynh này đã được gửi thông báo trước đó.'
                  : `${alreadySent.length}/${validRecipients.length} phụ huynh đã được gửi thông báo này trước đó.`}
              </strong>

              <div className="my-2 max-h-24 overflow-auto text-[13px]">
                {alreadySent.slice(0, 30).map(({ recipient, entry }) => (
                  <div key={recipient.id}>
                    {recipient.name} — {fmtSentAt(entry!.at)}
                  </div>
                ))}
                {alreadySent.length > 30 && <div>… và {alreadySent.length - 30} người nữa</div>}
              </div>

              <label className="flex cursor-pointer items-start gap-2 font-700">
                <input
                  type="checkbox"
                  checked={confirmResend}
                  onChange={(event) => setConfirmResend(event.target.checked)}
                  disabled={locked}
                  className="mt-0.5 h-4 w-4 accent-teal-600"
                />
                <span>Tôi vẫn muốn gửi lại.</span>
              </label>
            </Notice>
          )}

          {/* Cảnh báo quan trọng: gửi hàng loạt thì file giống nhau cho tất cả */}
          {needsConfirm && (
            <Notice tone="danger" icon={<AlertTriangle className="w-4 h-4" />}>
              <strong>
                {files.length === 1 ? 'File này' : `${files.length} file này`} sẽ được gửi giống
                nhau cho cả {validRecipients.length} phụ huynh.
              </strong>
              <p className="my-1.5">
                Nếu là ảnh chụp bảng điểm cả lớp, phiếu học phí của nhiều em, hay danh sách có tên
                học sinh khác thì <strong>đừng gửi</strong> — mỗi phụ huynh sẽ thấy thông tin của
                những gia đình còn lại. Muốn gửi riêng từng em thì bấm nút Zalo ở đúng dòng của em đó.
              </p>
              <label className="flex cursor-pointer items-start gap-2 font-700">
                <input
                  type="checkbox"
                  checked={confirmShared}
                  onChange={(event) => setConfirmShared(event.target.checked)}
                  disabled={locked}
                  className="mt-0.5 h-4 w-4 accent-teal-600"
                />
                <span>Tôi đã kiểm tra, file này không chứa thông tin riêng của học sinh khác.</span>
              </label>
            </Notice>
          )}

          {missingPhone > 0 && (
            <Notice tone="warn" icon={<AlertTriangle className="w-4 h-4" />}>
              Hệ thống sẽ bỏ qua {missingPhone} học sinh chưa có số điện thoại phụ huynh hợp lệ.
            </Notice>
          )}

          {state === 'queued' && (
            <Notice tone="info">
              Tin nhắn đã được đưa vào hàng đợi. Backend vẫn tiếp tục gửi nếu bạn đóng hộp này.
            </Notice>
          )}

          {state === 'done' && (
            <Notice tone="ok" icon={<CheckCircle2 className="w-5 h-5" />}>
              Đã gửi thành công {job?.sent || 0}/{job?.total || validRecipients.length} tin.
            </Notice>
          )}

          {error && (
            <Notice tone="danger" icon={<AlertTriangle className="w-4 h-4" />}>
              {error}
            </Notice>
          )}

          {job?.results && job.results.some((result) => !result.ok) && (
            <div className="max-h-28 overflow-auto rounded-xl border-2 border-red-100 bg-red-50/50 px-3 py-2 text-[13px] text-red-600">
              {job.results
                .filter((result) => !result.ok)
                .map((result, index) => (
                  <div key={`${result.to}_${index}`}>
                    {result.to}: {result.error || 'Gửi thất bại'}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t-2 border-teal-100 bg-teal-50/40 px-5 py-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-5 py-2.5 text-sm font-600 text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {state === 'done' || state === 'queued' ? 'Đóng' : 'Hủy'}
          </button>
          {state !== 'done' && state !== 'queued' && (
            <button
              onClick={send}
              disabled={
                busy ||
                validRecipients.length === 0 ||
                (needsConfirm && !confirmShared) ||
                (needsResendConfirm && !confirmResend) ||
                (recipients.length === 1 && !singleMessage.trim() && files.length === 0)
              }
              className="btn-teal inline-flex items-center gap-2 text-sm"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {busy
                ? 'Đang gửi...'
                : `Gửi ${validRecipients.length} tin${files.length ? ` + ${files.length} file` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
