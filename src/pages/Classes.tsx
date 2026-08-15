// @ts-nocheck
import { useEffect, useState } from 'react'
import { Plus, Pencil, Users, BookOpen, User, Trash2, Search, Archive, CheckSquare } from 'lucide-react'
import ConfirmDangerDialog from '@/components/ConfirmDangerDialog'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import Modal from '@/components/Modal'
import { fmtVNDShort } from '@/lib/helpers'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase' // ✅ Thêm supabase để gọi lệnh xóa trực tiếp

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu (vd: "tram" khớp "Trâm")
const normalizeText = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')

const EMPTY = {
  class_name: '', subject: 'Toán', grade: '', teacher_id: '', fee_per_session: '',
  planned_sessions: '', start_date: '', max_students: 30,
  room: '', school: '', schedule: '', note: '', status: 'active'
}

export default function Classes() {
  const { classes, students, enrollments, profiles, loadClasses, loadStudents, loadEnrollments, loadProfiles,
    addClass, updateClass, enroll, unenroll } = useDataStore()
  
  // ✅ Lấy thêm user từ AuthStore để biết ai đang đăng nhập
  const { user, isAdmin } = useAuthStore() as any
  
  const [modal, setModal]       = useState<'form' | 'roster' | null>(null)
  const [editing, setEditing]   = useState<any>(null)
  const [form, setForm]         = useState(EMPTY)
  const [selClass, setSelClass] = useState<any>(null)
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')
  const [rosterSearch, setRosterSearch] = useState('')
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    setDataLoading(true)
    void Promise.all([loadClasses(), loadStudents(), loadEnrollments(), loadProfiles()])
      .finally(() => setDataLoading(false))
  }, [])

  // ✅ Nếu là Giáo viên tạo lớp, tự động gán teacher_id là ID của giáo viên đó
  const openAdd  = () => { 
    setEditing(null); 
    setForm({ ...EMPTY, teacher_id: isAdmin() ? '' : user?.id }); 
    setModal('form');
  }
  const openEdit = (c: any) => { setEditing(c); setForm({ ...c }); setModal('form') }
  const openRoster = (c: any) => { setSelClass(c); setRosterSearch(''); setModal('roster') }

  const save = async () => {
    if (!form.class_name) return toast.error('Nhập tên lớp')
    setSaving(true)
    try {
      const payload: any = {
        ...form,
        fee_per_session: Number(form.fee_per_session) || 0,
        planned_sessions: Number(form.planned_sessions) || 0,
        max_students: Number(form.max_students) || 30,
        start_date: form.start_date || null,
        teacher_id: form.teacher_id || null
      }

      if (editing) await updateClass(editing.id, payload)
      else await addClass(payload)

      toast.success(editing ? 'Đã cập nhật lớp' : 'Đã thêm lớp mới')
      setModal(null)
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  // ── Chọn nhiều lớp để xử lý hàng loạt ─────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<null | 'delete' | 'close'>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runBulk = async () => {
    const ids = [...selected]
    if (ids.length === 0) return

    setBulkBusy(true)
    const tid = toast.loading(bulkAction === 'delete' ? 'Đang xoá...' : 'Đang đóng lớp...')

    try {
      if (bulkAction === 'delete') {
        const { error } = await supabase.from('classes').delete().in('id', ids)
        if (error) throw error
        toast.success(`Đã xoá ${ids.length} lớp`, { id: tid })
      } else {
        // Đóng lớp: giữ nguyên toàn bộ dữ liệu, chỉ ẩn khỏi các danh sách đang mở.
        const { error } = await supabase.from('classes').update({ status: 'inactive' }).in('id', ids)
        if (error) throw error
        toast.success(`Đã đóng ${ids.length} lớp`, { id: tid })
      }

      setSelected(new Set())
      setBulkAction(null)
      loadClasses()
      loadEnrollments()
    } catch (e: any) {
      toast.error(e.message || 'Không thực hiện được', { id: tid })
    } finally {
      setBulkBusy(false)
    }
  }

  // ✅ HÀM XÓA LỚP HỌC TRỰC TIẾP
  const handleDeleteClass = async (id: string, className: string) => {
    const confirmMsg = `Thầy/Cô có chắc chắn muốn xóa lớp "${className}"?\n\nHệ thống sẽ tự động dọn dẹp TOÀN BỘ danh sách học sinh, điểm danh và dữ liệu học phí thuộc lớp này. Hành động không thể hoàn tác!`
    if (!window.confirm(confirmMsg)) return;

    const toastId = toast.loading('Đang xóa lớp học...');
    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Đã xóa lớp học thành công!', { id: toastId });
      loadClasses(); // Tải lại danh sách lớp ngầm
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xóa lớp học!', { id: toastId });
    }
  }

  // ✅ LỌC LỚP HỌC: Admin thấy hết, Giáo viên chỉ thấy lớp do mình phụ trách
  const myClasses = isAdmin() ? classes : classes.filter((c: any) => c.teacher_id === user?.id)

  const filtered = myClasses.filter(c =>
    (c as any).class_name?.toLowerCase().includes(search.toLowerCase()) ||
    ((c as any).subject || '').toLowerCase().includes(search.toLowerCase())
  )

  // Chỉ thao tác trên những lớp đang hiện ra sau khi tìm kiếm.
  const visibleIds     = filtered.map((c: any) => c.id)
  const selectedInView = visibleIds.filter(id => selected.has(id))
  const allChecked     = visibleIds.length > 0 && selectedInView.length === visibleIds.length

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) visibleIds.forEach(id => next.delete(id))
      else visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const selectedClasses = classes.filter((c: any) => selected.has(c.id))
  // Lớp còn học sinh thì xoá là kéo theo điểm danh và học phí của cả lớp.
  const selectedWithStudents = selectedClasses.filter((c: any) =>
    enrollments.some(e => e.class_id === c.id && e.status === 'active'),
  )

  const rosterStudents: any[] = selClass
    ? enrollments
        .filter(e => e.class_id === selClass.id && e.status === 'active')
        .map(e => students.find(s => s.id === e.student_id))
        .filter(Boolean)
    : []

  const unenrolledStudents: any[] = selClass
    ? students.filter(s => !enrollments.find(e => e.class_id === selClass.id && e.student_id === s.id && e.status === 'active'))
    : []

  // Lọc danh sách "Thêm học sinh vào lớp" theo tên hoặc mã học sinh (không phân biệt dấu)
  const filteredUnenrolled: any[] = (() => {
    const q = normalizeText(rosterSearch.trim())
    if (!q) return unenrolledStudents
    return unenrolledStudents.filter(s =>
      normalizeText(s.full_name).includes(q) ||
      normalizeText(s.student_code).includes(q)
    )
  })()

  const inp = (field: keyof typeof EMPTY, extra = {}) => ({
    value: form[field] || '',
    onChange: (e: any) => setForm(f => ({ ...f, [field]: e.target.value })),
    className: 'input',
    ...extra,
  })

  const teachers = profiles.filter(p => p.role === 'TEACHER' || p.role === 'ADMIN')

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-teal-600" /> Lớp học {isAdmin() ? '(Tất cả)' : 'của tôi'}
          </h1>
          <p className="text-gray-400 text-sm">{myClasses.length} lớp · {myClasses.filter((c:any)=>c.status==='active').length} đang mở</p>
        </div>
        
        {/* ✅ Bỏ chặn isAdmin, cho phép GV tạo lớp */}
        <button onClick={openAdd} className="btn-teal flex items-center gap-2">
          <Plus className="w-4 h-4" /> Thêm lớp
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Tìm lớp học, môn học..." className="input max-w-sm" />

      {/* ── Thanh hành động khi có lớp được chọn ─────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-teal-300 bg-teal-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-700 text-teal-800">
            <CheckSquare className="w-4 h-4" />
            Đã chọn {selected.size} lớp
            {selectedWithStudents.length > 0 && (
              <span className="font-600 text-teal-600">({selectedWithStudents.length} lớp còn học sinh)</span>
            )}
          </span>

          <button
            onClick={() => setSelected(new Set())}
            className="text-xs font-600 text-teal-600 underline hover:text-teal-800"
          >
            Bỏ chọn
          </button>

          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => setBulkAction('close')}
              className="btn-outline inline-flex items-center gap-1.5 py-2 text-sm"
              title="Giữ nguyên dữ liệu, chỉ đánh dấu lớp đã đóng"
            >
              <Archive className="w-4 h-4" /> Đóng lớp
            </button>
            <button
              onClick={() => setBulkAction('delete')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-700 text-white shadow transition hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4" /> Xoá vĩnh viễn
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden shadow-xl border-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Chọn tất cả"
                    className="h-4 w-4 cursor-pointer accent-white"
                  />
                </th>
                {['Tên lớp','Môn','Giáo viên','Khối','Học phí','Lịch','Phòng','Sĩ số','Trạng thái','Thao tác'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-white font-bold text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataLoading ? (
                <tr><td colSpan={11} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2 text-teal-500">
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    <span className="text-sm font-medium">Đang tải dữ liệu...</span>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">Chưa có lớp học nào</td></tr>
              ) : null}
              {!dataLoading && filtered.map((c: any, i) => {
                const count = enrollments.filter(e => e.class_id === c.id && e.status === 'active').length
                const teacher = profiles.find(p => p.id === c.teacher_id)
                
                return (
                  <tr key={c.id} className={`border-b border-teal-50 hover:bg-teal-50/50 transition-colors ${i%2===0?'bg-white':'bg-teal-50/20'}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Chọn lớp ${c.class_name}`}
                        className="h-4 w-4 cursor-pointer accent-teal-600"
                      />
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">{c.class_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.subject}</td>
                    <td className="px-4 py-3">
                      {teacher ? (
                        <div className="flex items-center gap-1.5 text-teal-700 font-semibold whitespace-nowrap">
                          <User className="w-3.5 h-3.5" /> {teacher.name || teacher.email}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Chưa có GV</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.grade}</td>
                    <td className="px-4 py-3 font-bold text-teal-700">{fmtVNDShort(c.fee_per_session)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.schedule || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.room || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openRoster(c)} className="flex items-center gap-1 text-teal-600 hover:text-teal-800 font-bold bg-teal-50 px-2 py-1 rounded-md border border-teal-100 transition-colors">
                        <Users className="w-3.5 h-3.5" /> {count}/{c.max_students||'∞'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={c.status==='active'?'badge-active':'badge-inactive'}>
                        {c.status==='active'?'Đang mở':'Đóng'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-teal-600 hover:bg-teal-100 rounded-lg transition-all" title="Sửa thông tin lớp">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {/* ✅ NÚT XÓA LỚP */}
                        <button onClick={() => handleDeleteClass(c.id, c.class_name)} className="p-1.5 text-red-500 hover:bg-red-100 hover:text-red-700 rounded-lg transition-all" title="Xóa lớp học này">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal==='form'} onClose={() => setModal(null)}
        title={editing ? `Sửa lớp: ${editing.class_name}` : 'Thêm lớp mới'} size="2xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <label className="label">Tên lớp học *</label>
            <input {...inp('class_name')} placeholder="VD: Toán 10A" />
          </div>
          <div>
            <label className="label">Trạng thái</label>
            <select {...inp('status')} className="input">
              <option value="active">Đang mở</option>
              <option value="inactive">Đóng lớp</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="label font-bold text-teal-700">Giáo viên phụ trách</label>
            {/* ✅ Nếu là GV, khóa cứng dropdown tên GV để họ không tự gán lớp cho người khác */}
            <select {...inp('teacher_id')} className="input border-teal-200" disabled={!isAdmin()}>
              {isAdmin() ? (
                <>
                  <option value="">— Chưa phân công —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name || t.email} ({t.role})</option>
                  ))}
                </>
              ) : (
                <option value={user?.id}>{user?.user_metadata?.full_name || user?.email || 'Bản thân tôi'}</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Môn học</label>
            <select {...inp('subject')} className="input">
              {['Toán','Lý','Hóa','Anh','Văn','Sinh','Sử','Địa','Tin'].map(s=>(
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Khối lớp</label>
            <input {...inp('grade')} placeholder="Khối 10..." />
          </div>

          <div className="md:col-span-2">
            <label className="label">Trường</label>
            <input {...inp('school')} placeholder="THPT..." />
          </div>
          <div>
            <label className="label">Học phí/buổi</label>
            <input {...inp('fee_per_session')} type="number" placeholder="150000" />
          </div>
          <div>
            <label className="label">Số buổi/tháng</label>
            <input {...inp('planned_sessions')} type="number" placeholder="8" />
          </div>

          <div className="md:col-span-2">
            <label className="label">Ngày bắt đầu</label>
            <input {...inp('start_date')} type="date" />
          </div>
          <div>
            <label className="label">Sĩ số tối đa</label>
            <input {...inp('max_students')} type="number" />
          </div>
          <div>
            <label className="label">Phòng học</label>
            <input {...inp('room')} placeholder="P.101..." />
          </div>

          <div className="md:col-span-4">
            <label className="label">Lịch học chi tiết</label>
            <input {...inp('schedule')} placeholder="VD: Thứ 2 (18h-20h), Thứ 5 (17h-19h)" />
          </div>

          <div className="md:col-span-4">
            <label className="label">Ghi chú thêm</label>
            <input {...inp('note')} placeholder="Ghi chú về tài liệu, yêu cầu..." className="input" />
          </div>
        </div>

        <div className="flex gap-3 mt-5 justify-end border-t border-gray-100 pt-4 sticky bottom-0 bg-white pb-2">
          <button onClick={() => setModal(null)} className="btn-outline px-6">Hủy</button>
          <button onClick={save} disabled={saving} className="btn-teal px-8 shadow-md">
            {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Thêm lớp học'}
          </button>
        </div>
      </Modal>

      <Modal open={modal==='roster'} onClose={() => setModal(null)}
        title={`Danh sách học sinh – ${selClass?.class_name}`} size="lg">
        <div className="space-y-4">
          <h4 className="font-bold text-teal-700">Đang học ({rosterStudents.length})</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar border border-teal-100 rounded-xl p-2 bg-gray-50">
            {rosterStudents.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Chưa có học sinh</p>}
            {rosterStudents.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                <div>
                  <p className="font-bold text-sm text-gray-800">{s.full_name}</p>
                  <p className="text-xs text-gray-400">{s.student_code} · {s.school}</p>
                </div>
                {/* ✅ Bỏ chặn isAdmin, cho phép GV gỡ học sinh khỏi lớp của mình */}
                <button onClick={async () => { await unenroll(s.id, selClass.id); toast.success('Đã bỏ ghi danh') }}
                  className="text-xs text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-colors font-bold">Bỏ đăng ký</button>
              </div>
            ))}
          </div>

          {/* ✅ Bỏ chặn isAdmin, cho phép GV xếp lớp cho học sinh (Từ toàn bộ danh sách trường) */}
          {unenrolledStudents.length > 0 && (
            <>
              <h4 className="font-bold text-gray-600 pt-2 border-t border-gray-100 mt-2">Thêm học sinh vào lớp</h4>

              {/* Thanh tìm kiếm học sinh */}
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={rosterSearch}
                  onChange={e => setRosterSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc mã học sinh…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-300"
                />
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar border border-gray-200 rounded-xl p-2 bg-gray-50">
                {filteredUnenrolled.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">Không tìm thấy học sinh phù hợp</p>
                )}
                {filteredUnenrolled.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm hover:border-teal-300 transition-colors">
                    <div>
                      <p className="font-bold text-sm text-gray-800">{s.full_name}</p>
                      <p className="text-xs text-gray-400">{s.student_code}</p>
                    </div>
                    <button onClick={async () => { await enroll(s.id, selClass.id); toast.success(`Đã thêm ${s.full_name}`) }}
                      className="text-xs btn-teal py-1.5 px-3 shadow-sm">Thêm vào lớp</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Xác nhận xoá lớp vĩnh viễn ─────────────────────────────────── */}
      <ConfirmDangerDialog
        open={bulkAction === 'delete'}
        title={`Xoá ${selected.size} lớp học`}
        busy={bulkBusy}
        confirmWord="XOA"
        onConfirm={runBulk}
        onClose={() => !bulkBusy && setBulkAction(null)}
      >
        <p className="mb-2">
          Xoá lớp là mất luôn <strong>danh sách học sinh, toàn bộ điểm danh và lịch sử học phí</strong>
          {' '}của lớp đó. Học sinh vẫn còn trong hệ thống, nhưng dữ liệu gắn với lớp thì không.
          Không hoàn tác được.
        </p>

        <div className="mb-2 max-h-28 overflow-auto rounded-xl border-2 border-red-100 bg-red-50/50 px-3 py-2 text-[13px]">
          {selectedClasses.slice(0, 30).map((c: any) => {
            const n = enrollments.filter(e => e.class_id === c.id && e.status === 'active').length
            return (
              <div key={c.id}>
                {c.class_name}
                {n > 0 && <span className="font-700 text-red-600"> — còn {n} học sinh</span>}
              </div>
            )
          })}
          {selectedClasses.length > 30 && <div>… và {selectedClasses.length - 30} lớp nữa</div>}
        </div>

        <p className="text-gray-500">
          Lớp đã kết thúc nhưng cần giữ sổ sách thì dùng <strong>Đóng lớp</strong> — lớp biến khỏi
          các danh sách đang mở mà dữ liệu vẫn còn.
        </p>
      </ConfirmDangerDialog>

      {/* ── Xác nhận đóng lớp ──────────────────────────────────────────── */}
      <ConfirmDangerDialog
        open={bulkAction === 'close'}
        title={`Đóng ${selected.size} lớp học`}
        tone="warn"
        confirmLabel="Đóng lớp"
        busy={bulkBusy}
        onConfirm={runBulk}
        onClose={() => !bulkBusy && setBulkAction(null)}
      >
        <p>
          Các lớp này chuyển sang trạng thái <strong>Đóng</strong> và không còn hiện trong ô chọn
          lớp ở trang Điểm danh, Học phí. Toàn bộ dữ liệu <strong>giữ nguyên</strong>.
        </p>
        <p className="mt-2 text-gray-500">
          Muốn mở lại thì sửa lớp và đổi trạng thái về <strong>Đang mở</strong>.
        </p>
      </ConfirmDangerDialog>
    </div>
  )
}
