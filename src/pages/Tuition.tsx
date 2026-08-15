import { useEffect, useState, useMemo } from 'react'
import { Banknote, Plus, CheckCircle, XCircle, Mail, Send, Loader2, MessageCircle, Copy } from 'lucide-react'
import { useDataStore } from '@/store/dataStore'
import { fmtVNDShort, countDaysInMonth, parseSchedule } from '@/lib/helpers'
import Modal from '@/components/Modal'
import VietQRModal from '@/components/VietQRModal'
import { format, endOfMonth } from 'date-fns'
import type { PaymentMethod } from '@/types'
import toast from 'react-hot-toast'
import ZaloSendDialog from '@/components/ZaloSendDialog'
import {
  fetchZaloSentLog,
  type ZaloLogRef,
  type ZaloRecipient,
  type ZaloSentMap,
} from '@/services/zaloService'

interface TuitionRow {
  student:       { id: string; full_name: string; student_code: string }
  planned:       number
  absentCount:   number
  attended:      number
  feePerSession: number
  totalFee:      number
  paidAmount:    number
  debt:          number
  isPaid:        boolean
}

export default function Tuition() {
  const {
    classes, students, enrollments, attendance, payments,
    loadClasses, loadStudents, loadEnrollments,
    loadAttendance, loadPayments, addPayment,
  } = useDataStore()

  const now = new Date()
  const [selClass, setSelClass] = useState('')
  const [month, setMonth]       = useState(format(now, 'yyyy-MM'))
  const [payModal, setPayModal] = useState<TuitionRow | null>(null)
  const [qrModal, setQrModal]   = useState<TuitionRow | null>(null)
  const [payForm, setPayForm]   = useState({ amount: '', method: 'cash' as PaymentMethod, note: '' })
  const [saving, setSaving]     = useState(false)
  const [sending, setSending]   = useState(false)
  const [sendResult, setSendResult] = useState<{sent:number;skipped:number;errors:number}|null>(null)
  const [zaloModal, setZaloModal]   = useState<{row:TuitionRow;msg:string;qrUrl:string;phone:string}|null>(null)
  const [copiedZalo, setCopiedZalo] = useState<'text'|'img'|null>(null)
  const [confirmModal, setConfirmModal] = useState<{studentName:string;amount:number;studentId:string;phone:string;email:string}|null>(null)
  const [sendingConfirm, setSendingConfirm] = useState(false)

  // ── Gửi Zalo tự động qua zalo-service ──────────────────────────────────────
  // Khác với zaloModal (copy tay): đường này backend tự gửi, có hàng đợi và
  // giãn cách 8–15 giây giữa mỗi tin.
  const [autoZalo, setAutoZalo] = useState<{ title: string; recipients: ZaloRecipient[] } | null>(null)
  const [sentLog, setSentLog]   = useState<ZaloSentMap>({})

  // ── Load nền khi mount (bỏ function refs khỏi deps để tránh infinite loop) ──
  useEffect(() => {
    void Promise.all([loadClasses(), loadStudents(), loadEnrollments(), loadPayments()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load điểm danh + thanh toán khi đổi lớp/tháng ─────────
  useEffect(() => {
    if (!selClass) return
    const [y, m] = month.split('-')
    const from = `${y}-${m}-01`
    const to   = format(endOfMonth(new Date(+y, +m - 1)), 'yyyy-MM-dd')
    void loadAttendance(selClass, from, to)
    void loadPayments(selClass)        // ✅ Reload thanh toán theo lớp mỗi khi đổi lớp/tháng
    setSentLog({})
    void refreshSentLog()
  }, [selClass, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const tuitionData = useMemo((): TuitionRow[] => {
    if (!selClass) return []
    const cls = classes.find(c => c.id === selClass)
    if (!cls) return []

    const [y, m] = month.split('-')
    const from = `${y}-${m}-01`
    const to   = format(endOfMonth(new Date(+y, +m - 1)), 'yyyy-MM-dd')

    // ✅ FIX 1: Fallback về planned_sessions khi schedule trống/không parse được.
    //    Nếu schedule rỗng → weekdays=[] → countDaysInMonth=0 → totalFee=0 → isPaid=true (SAI).
    //    Giờ dùng planned_sessions của lớp làm giá trị dự phòng.
    const weekdays = parseSchedule((cls as any).schedule ?? '')
    const planned  = weekdays.length > 0
      ? countDaysInMonth(+y, +m, weekdays)
      : ((cls as any).planned_sessions ?? 0)

    return enrollments
      .filter(e => e.class_id === selClass && e.status === 'active')
      .flatMap(e => {
        const student = students.find(s => s.id === e.student_id)
        if (!student) return []

        const attRecords = attendance.filter(
          a =>
            a.class_id   === selClass &&
            a.student_id === e.student_id &&
            a.date >= from &&
            a.date <= to
        )
        // ✅ NGHIỆP VỤ ĐÚNG: chỉ đếm buổi thực sự có điểm danh present=true
        //    planned - absent (cũ) → tính tiền dù chưa điểm danh → SAI
        //    Giờ: mỗi lần tick "có mặt" → attended+1 → totalFee tăng theo
        const attended      = attRecords.filter(a => a.present).length
        const absentCount   = attRecords.filter(a => !a.present).length
        const feePerSession = (cls as any).fee_per_session ?? 0
        const totalFee      = attended * feePerSession

        // ✅ FIX 2: Schema dùng field `date`, không phải `paid_at`.
        //    p.paid_at luôn undefined → payments không bao giờ được tính → paidAmount=0
        //    → debt=totalFee → nhưng nếu totalFee=0 thì isPaid=true (bẫy từ Fix 1).
        const paidAmount = payments
          .filter(
            p =>
              p.class_id   === selClass &&
              p.student_id === e.student_id &&
              (p as any).date >= from &&   // ✅ dùng p.date thay vì p.paid_at
              (p as any).date <= to
          )
          .reduce((s, p) => s + (p.amount ?? 0), 0)

        const debt = Math.max(0, totalFee - paidAmount)

        return [{
          student: {
            id:           student.id,
            full_name:    student.full_name,
            student_code: student.student_code,
          },
          planned, absentCount, attended, feePerSession,
          totalFee, paidAmount, debt,
          isPaid: debt <= 0 && totalFee > 0, // ✅ FIX 3: totalFee=0 không được tính là "đã đóng"
        }]
      })
  }, [selClass, month, classes, enrollments, students, attendance, payments])

  // ── Gửi nhắc học phí qua Gmail (GAS) ───────────────────────────────────────
  const sendReminders = async (onlyStudentId?: string) => {
    if (!selClass || !month) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/send-tuition-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId:    selClass,
          month,
          studentIds: onlyStudentId ? [onlyStudentId] : undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setSendResult(data.summary)
      toast.success(`✅ Đã gửi ${data.summary.sent} email nhắc học phí`)
    } catch (e: any) {
      toast.error('Lỗi gửi email: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  // ── Dựng nội dung tin + QR cho một học sinh ────────────────────────────────
  // Dùng chung cho cả hai đường: gửi tay (copy + mở zalo.me) và gửi tự động
  // qua zalo-service. Phụ huynh nhận được nội dung giống hệt nhau.
  const buildZaloContent = (row: TuitionRow) => {
    const student    = students.find((s: any) => s.id === row.student.id)
    // Ưu tiên cột zalo, không có thì lùi về parent_phone.
    const phone      = (student as any)?.zalo || (student as any)?.parent_phone || ''
    const [y, m]     = month.split('-')
    const monthLabel = 'tháng ' + parseInt(m) + '/' + y
    const monthCode  = 'T' + m.padStart(2,'0') + y
    const debt       = row.debt > 0 ? row.debt : row.totalFee
    const line       = '----------------------------'

    const msg = '📚 Thông báo học phí ' + monthLabel + '\n'
              + line + '\n'
              + 'Học sinh: '       + row.student.full_name + '\n'
              + 'Số buổi học: '    + String(row.attended) + '\n'
              + 'Học phí/buổi: '   + fmtVNDShort(row.feePerSession) + '\n'
              + 'Tổng học phí: '   + fmtVNDShort(row.totalFee) + '\n'
              + 'Đã đóng: '        + fmtVNDShort(row.paidAmount) + '\n'
              + 'Cần thanh toán: ' + fmtVNDShort(debt) + '\n'
              + line + '\n'
              + 'Vui lòng thanh toán trước cuối tháng. Cảm ơn! 🙏'

    const bankId      = import.meta.env.VITE_BANK_ID      || ''
    const bankAccount = import.meta.env.VITE_BANK_ACCOUNT || ''
    const bankName    = import.meta.env.VITE_BANK_NAME    || import.meta.env.VITE_BANK_ACCOUNT_NAME || ''
    const addInfo     = 'HP ' + row.student.student_code + ' ' + monthCode
    const qrUrl       = bankId && bankAccount
      ? 'https://img.vietqr.io/image/' + bankId + '-' + bankAccount + '-compact2.png'
        + '?amount=' + debt
        + '&addInfo=' + encodeURIComponent(addInfo)
        + '&accountName=' + encodeURIComponent(bankName)
      : ''

    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '84')
    return { msg, qrUrl, phone, cleanPhone }
  }

  // ── Nhắn Zalo thủ công: hiện modal copy nội dung + mở zalo.me ──────────────
  // Giữ lại làm đường dự phòng cho lúc session Zalo hết hạn.
  const sendZalo = (row: TuitionRow) => {
    const { msg, qrUrl, cleanPhone } = buildZaloContent(row)
    setZaloModal({ row, msg, qrUrl, phone: cleanPhone })
    setCopiedZalo(null)
  }

  // ── Gửi Zalo tự động ───────────────────────────────────────────────────────
  const zaloLog: ZaloLogRef | undefined = selClass
    ? { kind: 'TUITION', classId: selClass, periodKey: month }
    : undefined

  /**
   * Đổi một dòng học phí thành người nhận, kèm QR chuyển khoản.
   *
   * QR đi dưới dạng url để backend tự tải — không đi qua proxy Vercel nên
   * không đụng trần body 4.5MB.
   *
   * Không đính QR khi: đã đóng đủ (QR vô nghĩa), lớp chưa cấu hình tài khoản
   * (link sẽ là link rác), hoặc số tiền bằng 0 (app ngân hàng từ chối).
   */
  const toRecipient = (row: TuitionRow): ZaloRecipient => {
    const { msg, qrUrl, phone } = buildZaloContent(row)
    const debt = row.debt > 0 ? row.debt : row.totalFee
    const attachQr = !!qrUrl && !row.isPaid && debt > 0

    return {
      id:      row.student.id,
      name:    row.student.full_name,
      phone,
      message: msg,
      ...(attachQr
        ? { files: [{ filename: `QR_${row.student.student_code}.png`, url: qrUrl }] }
        : {}),
    }
  }

  const refreshSentLog = async () => {
    if (!zaloLog) return
    try {
      setSentLog(await fetchZaloSentLog(zaloLog))
    } catch {
      // Không lấy được nhật ký thì chỉ mất phần cảnh báo gửi trùng, vẫn gửi được.
      setSentLog({})
    }
  }

  const openAutoZalo = (rows: TuitionRow[], title: string) => {
    if (rows.length === 0) {
      toast.error('Không có học sinh nào để gửi')
      return
    }
    setAutoZalo({ title, recipients: rows.map(toRecipient) })
  }

  const copyZaloContent = async (type: 'text' | 'img') => {
    if (!zaloModal) return
    if (type === 'text') {
      try {
        await navigator.clipboard.writeText(zaloModal.msg)
        setCopiedZalo('text')
        setTimeout(() => setCopiedZalo(null), 2500)
      } catch { toast.error('Không copy được') }
    } else {
      try {
        const res  = await fetch(zaloModal.qrUrl)
        const blob = await res.blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopiedZalo('img')
        setTimeout(() => setCopiedZalo(null), 2500)
      } catch {
        // Fallback: tải ảnh xuống
        const a = document.createElement('a')
        a.href     = zaloModal.qrUrl
        a.download = 'QR_' + zaloModal.row.student.student_code + '.png'
        a.click()
        toast.success('Đã tải QR xuống, gửi vào Zalo nhé!')
      }
    }
  }

  // ── Gửi xác nhận thanh toán qua Gmail ──────────────────────────────────────
  const sendConfirmEmail = async () => {
    if (!confirmModal) return
    setSendingConfirm(true)
    try {
      const res = await fetch(import.meta.env.VITE_GAS_EMAIL_URL || '', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow',
        body: JSON.stringify({
          type:          'payment_confirm',
          secret:        import.meta.env.VITE_GAS_WEBHOOK_SECRET || '',
          parentEmail:   confirmModal.email,
          studentName:   confirmModal.studentName,
          amount:        confirmModal.amount,
          transactionId: 'THU-' + Date.now(),
          transferAt:    new Date().toISOString(),
          centerName:    import.meta.env.VITE_CENTER_NAME || 'EduCenter',
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'GAS lỗi')
      toast.success('✅ Đã gửi email xác nhận!')
      setConfirmModal(null)
    } catch (e: any) {
      toast.error('Lỗi gửi email: ' + e.message)
    } finally {
      setSendingConfirm(false)
    }
  }

  // ── Gửi xác nhận thanh toán qua Zalo ────────────────────────────────────────
  const sendConfirmZalo = async () => {
    if (!confirmModal) return
    const [y, m] = month.split('-')
    const msg = '✅ Xác nhận thanh toán học phí\n'
              + '----------------------------\n'
              + 'Học sinh: '   + confirmModal.studentName + '\n'
              + 'Số tiền: '    + fmtVNDShort(confirmModal.amount) + '\n'
              + 'Thời gian: '  + new Date().toLocaleDateString('vi-VN') + '\n'
              + 'Tháng: '      + parseInt(m) + '/' + y + '\n'
              + '----------------------------\n'
              + 'Trung tâm đã nhận được học phí. Cảm ơn quý phụ huynh! 🙏'
    try {
      await navigator.clipboard.writeText(msg)
      toast.success('✅ Đã copy! Dán vào Zalo và gửi.')
    } catch { toast.error('Không copy được') }
    if (confirmModal.phone) window.open('https://zalo.me/' + confirmModal.phone, '_blank')
    else window.open('https://chat.zalo.me', '_blank')
    setConfirmModal(null)
  }

  const openPay = (row: TuitionRow) => {
    setQrModal(row)    // ✅ Mở modal QR trước, GV chọn thu tiền mặt hay QR
  }

  const openManualPay = (row: TuitionRow) => {
    setQrModal(null)
    setPayModal(row)
    setPayForm({ amount: String(row.debt || row.totalFee), method: 'cash', note: '' })
  }

  const savePay = async () => {
    const amt = parseFloat(payForm.amount)
    if (!payForm.amount || isNaN(amt) || amt <= 0) {
      toast.error('Nhập số tiền hợp lệ')
      return
    }
    if (!payModal) return
    setSaving(true)
    try {
      await addPayment({
        student_id: payModal.student.id,
        class_id:   selClass,
        amount:     amt,
        method:     payForm.method,
        note:       payForm.note || null,
      })
      // ✅ Reload thanh toán theo lớp ngay sau khi ghi nhận
      await loadPayments(selClass)
      toast.success(`✅ Đã ghi nhận ${fmtVNDShort(amt)} từ ${payModal.student.full_name}`)

      // ✅ Hỏi gửi xác nhận cho phụ huynh
      const student = students.find(s => s.id === payModal.student.id)
      setConfirmModal({
        studentName: payModal.student.full_name,
        amount:      amt,
        studentId:   payModal.student.id,
        phone:       ((student as any)?.zalo || (student as any)?.parent_phone || '').replace(/\D/g,'').replace(/^0/,'84'),
        email:       (student as any)?.email || '',
      })
      setPayModal(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi khi lưu')
    } finally {
      setSaving(false)
    }
  }

  const [yDisp, mDisp] = month.split('-')
  const totalFee  = tuitionData.reduce((s, d) => s + d.totalFee,  0)
  const totalPaid = tuitionData.reduce((s, d) => s + d.paidAmount, 0)
  const totalDebt = tuitionData.reduce((s, d) => s + d.debt,       0)
  const debtors   = tuitionData.filter(d => !d.isPaid && d.totalFee > 0).length

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="section-title flex items-center gap-2">
          <Banknote className="w-7 h-7 text-teal-600" /> Học phí
        </h1>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Lớp học</label>
            <select
              value={selClass}
              onChange={e => setSelClass(e.target.value)}
              className="input"
            >
              <option value="">— Chọn lớp —</option>
              {classes.filter(c => c.status === 'active').map(c => (
                <option key={c.id} value={c.id}>
                  {(c as any).class_name || (c as any).name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tháng</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="input"
            />
          </div>
        </div>
      </div>

      {selClass && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Tổng học phí', value: fmtVNDShort(totalFee),  color: 'bg-teal-50 text-teal-700' },
              { label: 'Đã thu',       value: fmtVNDShort(totalPaid), color: 'bg-green-50 text-green-700' },
              { label: 'Cần thanh toán',       value: fmtVNDShort(totalDebt), color: 'bg-red-50 text-red-700' },
              { label: 'Chưa đóng',   value: `${debtors} học sinh`,  color: 'bg-amber-50 text-amber-700' },
            ].map(s => (
              <div key={s.label} className={`card p-4 ${s.color}`}>
                <p className="text-xs font-bold opacity-70 mb-1">{s.label}</p>
                <p className="text-xl font-extrabold">{s.value}</p>
              </div>
            ))}
          </div>

          {/* ── Nút gửi nhắc học phí ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-teal-100 rounded-2xl px-5 py-3 shadow-sm">
            <div>
              <p className="font-bold text-gray-700 text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-teal-600" /> Gửi nhắc học phí qua Gmail
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Gửi email + QR chuyển khoản cho {debtors} phụ huynh còn nợ
              </p>
            </div>
            <div className="flex items-center gap-3">
              {sendResult && (
                <span className="text-xs text-gray-500">
                  ✅ {sendResult.sent} gửi · ⏭ {sendResult.skipped} bỏ qua · ❌ {sendResult.errors} lỗi
                </span>
              )}
              <button
                onClick={() => sendReminders()}
                disabled={sending || debtors === 0}
                className="btn-teal flex items-center gap-2 text-sm py-2 disabled:opacity-50"
              >
                {sending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi...</>
                  : <><Send className="w-4 h-4" /> Gửi nhắc ({debtors} HS)</>}
              </button>
            </div>
          </div>

          {/* ── Nút gửi Zalo hàng loạt ───────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-blue-100 rounded-2xl px-5 py-3 shadow-sm">
            <div>
              <p className="font-bold text-gray-700 text-sm flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-blue-500" /> Gửi thông báo học phí qua Zalo
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Tự động gửi cho {debtors} phụ huynh còn nợ, kèm QR chuyển khoản riêng từng em
              </p>
            </div>
            <button
              onClick={() =>
                openAutoZalo(
                  tuitionData.filter(d => !d.isPaid && d.totalFee > 0),
                  `Gửi học phí tháng ${mDisp}/${yDisp}`,
                )
              }
              disabled={debtors === 0}
              className="btn-teal flex items-center gap-2 text-sm py-2 disabled:opacity-50"
              style={{ background: '#3b82f6' }}
            >
              <MessageCircle className="w-4 h-4" /> Gửi Zalo ({debtors} HS)
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-teal-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Học phí tháng {mDisp}/{yDisp}</h3>
              <span className="text-sm text-gray-400">{tuitionData.length} học sinh</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-teal-50">
                    {[
                      'Học sinh', 'Buổi dự kiến', 'Vắng', 'Đã học',
                      'Phí/buổi', 'Tổng phí', 'Đã đóng', 'Cần thanh toán', 'Trạng thái', '',
                    ].map(h => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-teal-700 font-bold text-xs whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tuitionData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-gray-400">
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                  {tuitionData.map(d => (
                    <tr
                      key={d.student.id}
                      className="border-b border-teal-50 hover:bg-teal-50/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-800">{d.student.full_name}</p>
                        <p className="text-xs text-gray-400">{d.student.student_code}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{d.planned}</td>
                      <td className="px-4 py-3 text-center text-red-500 font-bold">{d.absentCount}</td>
                      <td className="px-4 py-3 text-center text-teal-600 font-bold">{d.attended}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtVNDShort(d.feePerSession)}</td>
                      <td className="px-4 py-3 font-bold text-teal-700">{fmtVNDShort(d.totalFee)}</td>
                      <td className="px-4 py-3 text-green-600 font-bold">{fmtVNDShort(d.paidAmount)}</td>
                      <td className="px-4 py-3 font-extrabold text-red-600">
                        {d.debt > 0 ? fmtVNDShort(d.debt) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {d.totalFee === 0 ? (
                          <span className="text-gray-400 text-xs italic">Chưa có dữ liệu</span>
                        ) : d.isPaid ? (
                          <span className="badge-paid flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Đã đóng
                          </span>
                        ) : (
                          <span className="badge-debt flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Cần thanh toán
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                        {!d.isPaid && d.totalFee > 0 && (
                          <button
                            onClick={() => openPay(d)}
                            className="btn-teal text-xs py-1.5 px-3 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Thu tiền
                          </button>
                        )}
                        {/* Nút gửi nhắc qua email */}
                        <button
                          onClick={() => sendReminders(d.student.id)}
                          disabled={sending}
                          className="p-1.5 text-teal-500 hover:bg-teal-50 rounded-lg border border-teal-100 transition disabled:opacity-40"
                          title="Gửi nhắc học phí qua Gmail"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </button>
                        {/* Gửi Zalo tự động qua zalo-service */}
                        <button
                          onClick={() => openAutoZalo([d], `Gửi học phí — ${d.student.full_name}`)}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg border border-blue-100 transition relative"
                          title="Gửi Zalo tự động (kèm QR chuyển khoản)"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {sentLog[d.student.id] && (
                            <span
                              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-500"
                              title="Đã gửi thông báo này"
                            />
                          )}
                        </button>
                        {/* Dự phòng: copy nội dung + mở zalo.me, dùng khi session Zalo hết hạn */}
                        <button
                          onClick={() => sendZalo(d)}
                          className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg border border-gray-100 transition"
                          title="Copy nội dung để nhắn tay"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ✅ VietQR Modal */}
      {qrModal && (
        <VietQRModal
          open={!!qrModal}
          onClose={() => setQrModal(null)}
          studentName={qrModal.student.full_name}
          studentCode={qrModal.student.student_code}
          amount={qrModal.debt > 0 ? qrModal.debt : qrModal.totalFee}
          month={month}
          onConfirmManual={() => openManualPay(qrModal)}
        />
      )}

      <Modal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        title="Ghi nhận thanh toán"
        size="sm"
      >
        {payModal && (
          <div className="space-y-4">
            <div className="bg-teal-50 rounded-xl p-4">
              <p className="font-bold text-teal-800">{payModal.student.full_name}</p>
              <p className="text-sm text-teal-600">
                Cần thanh toán: <strong>{fmtVNDShort(payModal.debt)}</strong>
              </p>
            </div>
            <div>
              <label className="label">Số tiền (đ) *</label>
              <input
                type="number"
                value={payForm.amount}
                onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Hình thức</label>
              <select
                value={payForm.method}
                onChange={e => setPayForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}
                className="input"
              >
                <option value="cash">💵 Tiền mặt</option>
                <option value="transfer">🏦 Chuyển khoản</option>
                <option value="seapay">📱 SeaPay</option>
              </select>
            </div>
            <div>
              <label className="label">Ghi chú</label>
              <input
                value={payForm.note}
                onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Đóng học phí tháng..."
                className="input"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPayModal(null)} className="btn-outline">Hủy</button>
              <button
                onClick={() => { void savePay() }}
                disabled={saving}
                className="btn-teal"
              >
                {saving ? 'Đang lưu...' : '✅ Xác nhận'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm Payment Modal ───────────────────────────────────────── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-center">
              <div className="text-4xl mb-1">✅</div>
              <p className="text-white font-bold text-base">Đã thu học phí thành công!</p>
              <p className="text-emerald-100 text-sm mt-0.5">
                {confirmModal.studentName} · {fmtVNDShort(confirmModal.amount)}
              </p>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Gửi thông báo xác nhận đến phụ huynh qua:
              </p>

              {/* Gmail */}
              <button
                onClick={sendConfirmEmail}
                disabled={sendingConfirm || !confirmModal.email}
                className="w-full py-3 flex items-center justify-between px-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition disabled:opacity-40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📧</span>
                  <div className="text-left">
                    <p className="font-bold text-gray-800 text-sm">Gửi Gmail</p>
                    <p className="text-xs text-gray-400">
                      {confirmModal.email || 'Chưa có email trong hồ sơ'}
                    </p>
                  </div>
                </div>
                {sendingConfirm
                  ? <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                  : <Mail className="w-4 h-4 text-red-400" />}
              </button>

              {/* Zalo */}
              <button
                onClick={sendConfirmZalo}
                disabled={sendingConfirm}
                className="w-full py-3 flex items-center justify-between px-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">💬</span>
                  <div className="text-left">
                    <p className="font-bold text-gray-800 text-sm">Nhắn Zalo</p>
                    <p className="text-xs text-gray-400">
                      {confirmModal.phone ? 'Copy nội dung + mở Zalo' : 'Mở Zalo Web (tìm thủ công)'}
                    </p>
                  </div>
                </div>
                <MessageCircle className="w-4 h-4 text-blue-400" />
              </button>

              <button
                onClick={() => setConfirmModal(null)}
                className="w-full py-2.5 text-gray-400 hover:text-gray-600 text-sm font-semibold transition"
              >
                Bỏ qua, không gửi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zalo Share Modal ─────────────────────────────────────────── */}
      {zaloModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-400 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-white" />
                <span className="text-white font-bold">Gửi qua Zalo</span>
              </div>
              <button onClick={() => setZaloModal(null)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="p-4 space-y-3">
              {/* Bước 1: Copy text */}
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-500">① Nội dung tin nhắn</span>
                  <button onClick={() => copyZaloContent('text')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold transition
                      ${copiedZalo === 'text' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                    {copiedZalo === 'text' ? '✓ Đã copy' : 'Copy text'}
                  </button>
                </div>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{zaloModal.msg}</pre>
              </div>

              {/* Bước 2: Copy QR */}
              {zaloModal.qrUrl && (
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500">② Ảnh QR chuyển khoản</span>
                    <button onClick={() => copyZaloContent('img')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition
                        ${copiedZalo === 'img' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                      {copiedZalo === 'img' ? '✓ Đã copy' : 'Copy QR'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <img src={zaloModal.qrUrl} alt="QR" className="w-20 h-20 rounded-xl border border-blue-200 shrink-0" />
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Bấm <strong>Copy QR</strong> → vào Zalo → <strong>Ctrl+V</strong> để gửi ảnh.<br/><br/>
                      Nếu không paste được → ảnh tự tải xuống → đính kèm vào Zalo.
                    </p>
                  </div>
                </div>
              )}

              {/* Bước 3: Mở Zalo */}
              <button
                onClick={() => window.open(zaloModal.phone ? 'https://zalo.me/' + zaloModal.phone : 'https://chat.zalo.me', '_blank')}
                className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" />
                {zaloModal.phone ? '③ Mở chat Zalo với phụ huynh' : '③ Mở Zalo Web'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hộp thoại gửi Zalo tự động ──────────────────────────────────────── */}
      <ZaloSendDialog
        open={!!autoZalo}
        title={autoZalo?.title ?? 'Gửi Zalo'}
        recipients={autoZalo?.recipients ?? []}
        log={zaloLog}
        sentLog={sentLog}
        onSent={refreshSentLog}
        onClose={() => setAutoZalo(null)}
        // Học phí đã tự đính QR riêng từng em. Cho chọn thêm file thì file đó
        // đi giống nhau tới mọi người — dễ lộ thông tin của gia đình khác.
        allowAttachments={false}
      />
    </div>
  )
}
