import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Link2,
  Loader2,
  QrCode,
  RefreshCcw,
  Smartphone,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getZaloHealth,
  getZaloLoginState,
  startZaloLogin,
  type ZaloHealth,
  type ZaloLoginState,
} from '@/services/zaloService'

const PHASE_LABEL: Record<string, string> = {
  idle: 'Chưa bắt đầu',
  waiting_scan: 'Đang chờ quét mã',
  scanned: 'Đã quét — bấm Đồng ý trên điện thoại',
  done: 'Đã kết nối',
  expired: 'Mã QR đã hết hạn',
  declined: 'Đã từ chối trên điện thoại',
  error: 'Không kết nối được',
}

const ZALO_LABEL: Record<string, string> = {
  ready: 'Đang hoạt động',
  connecting: 'Đang kết nối...',
  expired: 'Phiên đã hết hạn — cần đăng nhập lại',
  disconnected: 'Chưa kết nối',
}

function fmtTime(iso?: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-teal-100 bg-teal-50/40 px-4 py-3">
      <p className="label mb-1">{label}</p>
      <p className="text-base font-800 text-gray-800">{value}</p>
    </div>
  )
}

export default function ZaloConnection() {
  const [health, setHealth] = useState<ZaloHealth | null>(null)
  const [login, setLogin] = useState<ZaloLoginState>({ phase: 'idle' })
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Chỉ hỏi trạng thái đăng nhập khi đang có phiên chạy, tránh gọi API vô ích.
  const [polling, setPolling] = useState(false)

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await getZaloHealth())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không lấy được tình trạng Zalo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshHealth()
    const timer = setInterval(refreshHealth, 15_000)
    return () => clearInterval(timer)
  }, [refreshHealth])

  useEffect(() => {
    if (!polling) return

    const timer = setInterval(async () => {
      try {
        const state = await getZaloLoginState()
        setLogin(state)

        // Dừng hỏi khi phiên kết thúc, dù thành công hay không.
        if (['done', 'declined', 'error'].includes(state.phase)) {
          setPolling(false)
          if (state.phase === 'done') {
            void refreshHealth()
            toast.success('Đã kết nối tài khoản Zalo')
          }
        }
      } catch {
        // Bỏ qua lỗi tạm thời, lượt sau thử lại.
      }
    }, 2_000)

    return () => clearInterval(timer)
  }, [polling, refreshHealth])

  async function start() {
    setStarting(true)
    try {
      await startZaloLogin()
      setPolling(true)
      setLogin({ phase: 'waiting_scan' })
      setCopied(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không tạo được mã QR')
    } finally {
      setStarting(false)
    }
  }

  async function copySession() {
    if (!login.sessionB64) return
    await navigator.clipboard?.writeText(login.sessionB64)
    setCopied(true)
    toast.success('Đã sao chép. Dán vào biến ZALO_SESSION trên Render.')
    setTimeout(() => setCopied(false), 3_000)
  }

  const connected = health?.zalo === 'ready'
  const scanning = ['waiting_scan', 'scanned'].includes(login.phase)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Link2 className="w-7 h-7 text-teal-600" /> Kết nối Zalo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tài khoản Zalo dùng để gửi thông báo cho phụ huynh
          </p>
        </div>
      </div>

      {/* ── Tình trạng hiện tại ── */}
      <div className="card p-5">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-400 py-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-600">Đang kiểm tra...</span>
          </div>
        ) : (
          <>
            <div
              className={`flex items-center gap-2.5 mb-4 font-800 ${
                connected ? 'text-green-600' : 'text-red-500'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-current shrink-0" />
              {ZALO_LABEL[health?.zalo || ''] || health?.zalo || 'Không rõ'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat label="Kết nối lúc" value={<span className="text-sm">{fmtTime(health?.connectedAt)}</span>} />
              <Stat label="Còn gửi được hôm nay" value={`${health?.quotaLeft ?? '—'} tin`} />
              <Stat label="Đang chờ trong hàng đợi" value={`${health?.queueDepth ?? 0} tin`} />
            </div>

            {health?.lastError && !connected && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{health.lastError}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Đăng nhập bằng QR ── */}
      <div className="card p-5">
        <h2 className="font-800 text-gray-800 mb-3">Đăng nhập tài khoản Zalo</h2>

        {!scanning && login.phase !== 'done' && (
          <>
            <p className="text-sm text-gray-500 leading-relaxed">
              Chuẩn bị điện thoại trước khi bấm: mở Zalo → <strong>Thêm</strong> (góc dưới phải) →
              biểu tượng <strong>QR</strong> ở góc trên. Mã chỉ sống khoảng một phút.
            </p>

            {connected && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Zalo đang hoạt động bình thường. Đăng nhập lại sẽ thay tài khoản mà cả trung tâm
                  đang dùng để nhắn phụ huynh — chỉ làm khi thực sự cần đổi số.
                </span>
              </div>
            )}

            <button onClick={start} disabled={starting} className="btn-teal mt-4 inline-flex items-center gap-2">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              {starting ? 'Đang tạo mã...' : login.phase === 'idle' ? 'Tạo mã QR' : 'Tạo mã QR mới'}
            </button>

            {['expired', 'declined', 'error'].includes(login.phase) && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {PHASE_LABEL[login.phase]}
                  {login.error ? ` — ${login.error}` : ''}
                </span>
              </div>
            )}
          </>
        )}

        {scanning && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex items-center gap-2 font-700 text-teal-700">
              <Smartphone className="w-5 h-5" />
              {PHASE_LABEL[login.phase]}
              {login.name ? ` — ${login.name}` : ''}
            </div>

            {login.qrImage ? (
              <img
                src={`data:image/png;base64,${login.qrImage}`}
                alt="Mã QR đăng nhập Zalo"
                width={240}
                height={240}
                className="rounded-2xl border-2 border-teal-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-60 w-60 items-center justify-center rounded-2xl border-2 border-dashed border-teal-200">
                <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
              </div>
            )}

            <button onClick={start} disabled={starting} className="btn-outline text-sm py-2 inline-flex items-center gap-1.5">
              <RefreshCcw className="w-4 h-4" /> Tạo mã khác
            </button>
          </div>
        )}

        {login.phase === 'done' && (
          <div className="flex items-start gap-2.5 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-3 text-sm font-600 text-green-800">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              Đã kết nối{login.name ? ` tài khoản ${login.name}` : ''}. Hệ thống dùng được ngay.
            </span>
          </div>
        )}
      </div>

      {/* ── Lưu phiên để khỏi quét lại ── */}
      {login.phase === 'done' && login.sessionB64 && (
        <div className="card p-5">
          <h2 className="font-800 text-gray-800 mb-3">Còn một bước để khỏi quét lại</h2>

          <div className="flex items-start gap-2.5 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Render xoá dữ liệu mỗi lần khởi động lại. Nếu bỏ qua bước này, vài ngày nữa bạn sẽ
              phải quét QR lại từ đầu.
            </span>
          </div>

          <ol className="my-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
            <li>Bấm nút sao chép bên dưới</li>
            <li>
              Mở Render → chọn service → tab <strong>Environment</strong>
            </li>
            <li>
              Sửa biến <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">ZALO_SESSION</code>,
              dán giá trị vừa sao chép
            </li>
            <li>
              Bấm <strong>Save Changes</strong>
            </li>
          </ol>

          <textarea
            readOnly
            rows={4}
            value={login.sessionB64}
            onClick={(event) => event.currentTarget.select()}
            className="input font-mono text-[11px] leading-tight"
          />

          <button onClick={copySession} className="btn-teal mt-3 inline-flex items-center gap-2">
            <Copy className="w-4 h-4" /> {copied ? 'Đã sao chép' : 'Sao chép chuỗi phiên'}
          </button>

          <p className="mt-3 text-xs font-600 text-red-500">
            Chuỗi này tương đương mật khẩu tài khoản Zalo. Đừng gửi qua chat, đừng lưu vào file
            dùng chung.
          </p>
        </div>
      )}
    </div>
  )
}
