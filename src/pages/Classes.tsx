// @ts-nocheck
import { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, Users, BookOpen, User, Trash2, Search, Archive, CheckSquare, X, UserPlus, Filter } from 'lucide-react'
import ConfirmDangerDialog from '@/components/ConfirmDangerDialog'
import { useDataStore } from '@/store/dataStore'
import { useAuthStore } from '@/store/authStore'
import Modal from '@/components/Modal'
import { fmtVNDShort } from '@/lib/helpers'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu (vd: "tram" khớp "Trâm")
const normalizeText = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')

const EMPTY = {
  class_name: '', subject: 'Toán', grade: '', teacher_id: '', fee_per_session: '',
  planned_sessions: '', start_date: '', max_students: 30,
  room: '', school: '', schedule: '', note: '', status: 'active'
}

const GRADE_OPTIONS = ['Tất cả', 'Khối 6', 'Khối 7', 'Khối 8', 'Khối 9', 'Khối 10', 'Khối 11', 'Khối 12']

export default function Classes() {
  const { classes, students, enrollments, profiles, loadClasses, loadStudents, loadEnrollments, loadProfiles,
    addClass, updateClass, enroll, unenroll } = useDataStore()
  
  const { user, isAdmin } = useAuthStore() as any
  
  const [modal, setModal]       = useState<'form' | 'roster' | 'addStudent' | null>(null)
  const [editing, setEditing]   = useState<any>(null)
  const [form, setForm]         = useState(EMPTY)
  const [selClass, setSelClass] = useState<any>(null)
  const [saving, setSaving]     = useState(false)
  
  // Filters & Search
  const [search, setSearch]           = useState('')
  const [gradeFilter, setGradeFilter] = useState('Tất cả')
  const [rosterSearch, setRosterSearch] = useState('')
  const [addStudentSearch, setAddStudentSearch] = useState('')
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    setDataLoading(true)
    void Promise.all([loadClasses(), loadStudents(), loadEnrollments(), loadProfiles()])
      .finally(() => setDataLoading(false))
  }, [])

  // Nếu là Giáo viên tạo lớp, tự động gán teacher_id là ID của giáo viên đó
  const openAdd = () => { 
    setEditing(null); 
    setForm({ ...EMPTY, teacher_id: isAdmin() ? '' : user?.id }); 
    setModal('form');
  }
  
  const openEdit = (c: any, e?: React.MouseEvent) => { 
    if (e) e.stopPropagation();
    setEditing(c); 
    setForm({ ...c }); 
    setModal('form');
  }

  const openAddStudentModal = (c?: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (c) setSelClass(c);
    setAddStudentSearch('');
    setModal('addStudent');
  }

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

  const toggleOne = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
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

  // HÀM XÓA LỚP HỌC TRỰC TIẾP
  const handleDeleteClass = async (id: string, className: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const confirmMsg = `Thầy/Cô có chắc chắn muốn xóa lớp "${className}"?\n\nHệ thống sẽ tự động dọn dẹp TOÀN BỘ danh sách học sinh, điểm danh và dữ liệu học phí thuộc lớp này. Hành động không thể hoàn tác!`
    if (!window.confirm(confirmMsg)) return;

    const toastId = toast.loading('Đang xóa lớp học...');
    try {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Đã xóa lớp học thành công!', { id: toastId });
      if (selClass?.id === id) setSelClass(null);
      loadClasses();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xóa lớp học!', { id: toastId });
    }
  }

  // LỌC LỚP HỌC: Admin thấy hết, Giáo viên chỉ thấy lớp do mình phụ trách
  const myClasses = useMemo(() => {
    return isAdmin() ? classes : classes.filter((c: any) => c.teacher_id === user?.id)
  }, [classes, user, isAdmin])

  const filtered = useMemo(() => {
    return myClasses.filter(c => {
      const matchSearch = normalizeText(c.class_name).includes(normalizeText(search)) ||
                          normalizeText(c.subject || '').includes(normalizeText(search)) ||
                          normalizeText(c.grade || '').includes(normalizeText(search));
      
      const matchGrade = gradeFilter === 'Tất cả' ||
                         (c.grade || '').toLowerCase().includes(gradeFilter.toLowerCase().replace('khối ', ''));
      
      return matchSearch && matchGrade;
    })
  }, [myClasses, search, gradeFilter])

  // Tự động chọn lớp đầu tiên nếu chưa chọn lớp nào hoặc lớp đang chọn bị lọc mất
  useEffect(() => {
    if (filtered.length > 0) {
      if (!selClass || !filtered.some(c => c.id === selClass.id)) {
        setSelClass(filtered[0])
      }
    } else {
      setSelClass(null)
    }
  }, [filtered])

  const activeClassesCount = useMemo(() => {
    return myClasses.filter((c: any) => c.status === 'active').length
  }, [myClasses])

  // Danh sách học sinh trong lớp đang chọn
  const rosterStudents = useMemo(() => {
    if (!selClass) return [];
    return enrollments
      .filter(e => e.class_id === selClass.id && e.status === 'active')
      .map(e => ({
        ...students.find(s => s.id === e.student_id),
        enrolled_at: e.created_at || e.enrolled_at
      }))
      .filter(s => s && s.id);
  }, [selClass, enrollments, students]);

  // Tìm kiếm học sinh trong lớp đang chọn
  const filteredRosterStudents = useMemo(() => {
    const q = normalizeText(rosterSearch.trim())
    if (!q) return rosterStudents
    return rosterStudents.filter(s =>
      normalizeText(s.full_name || '').includes(q) ||
      normalizeText(s.student_code || '').includes(q) ||
      normalizeText(s.phone || '').includes(q)
    )
  }, [rosterStudents, rosterSearch])

  // Danh sách học sinh chưa đăng ký lớp đang chọn
  const unenrolledStudents = useMemo(() => {
    if (!selClass) return [];
    return students.filter(s => !enrollments.find(e => e.class_id === selClass.id && e.student_id === s.id && e.status === 'active'))
  }, [selClass, students, enrollments])

  const filteredUnenrolled = useMemo(() => {
    const q = normalizeText(addStudentSearch.trim())
    if (!q) return unenrolledStudents
    return unenrolledStudents.filter(s =>
      normalizeText(s.full_name || '').includes(q) ||
      normalizeText(s.student_code || '').includes(q) ||
      normalizeText(s.phone || '').includes(q)
    )
  }, [unenrolledStudents, addStudentSearch])

  const selectedClasses = classes.filter((c: any) => selected.has(c.id))
  const selectedWithStudents = selectedClasses.filter((c: any) =>
    enrollments.some(e => e.class_id === c.id && e.status === 'active'),
  )

  const inp = (field: keyof typeof EMPTY, extra = {}) => ({
    value: form[field] || '',
    onChange: (e: any) => setForm(f => ({ ...f, [field]: e.target.value })),
    className: 'input',
    ...extra,
  })

  const teachers = profiles.filter(p => p.role === 'TEACHER' || p.role === 'ADMIN')

  return (
    <div className="space-y-5">
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-teal-100">
        <div>
          <h1 className="text-2xl font-800 text-teal-950 flex items-center gap-2.5">
            <BookOpen className="w-7 h-7 text-teal-600" />
            Lớp học {isAdmin() ? '(Tất cả)' : 'của tôi'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {myClasses.length} lớp học · <span className="font-semibold text-teal-700">{activeClassesCount} lớp đang hoạt động</span>
          </p>
        </div>
        
        <button onClick={openAdd} className="btn-teal flex items-center justify-center gap-2 shadow-md py-2.5 px-5">
          <Plus className="w-5 h-5" /> Thêm lớp
        </button>
      </div>

      {/* ── Bulk Actions Bar ─────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-teal-300 bg-teal-50 px-5 py-3 shadow-sm animate-fade-in">
          <span className="flex items-center gap-2 text-sm font-700 text-teal-900">
            <CheckSquare className="w-4 h-4 text-teal-600" />
            Đã chọn {selected.size} lớp
            {selectedWithStudents.length > 0 && (
              <span className="font-600 text-teal-700">({selectedWithStudents.length} lớp còn học sinh)</span>
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
              className="btn-outline inline-flex items-center gap-1.5 py-1.5 px-3 text-xs"
              title="Giữ nguyên dữ liệu, chỉ đánh dấu lớp đã đóng"
            >
              <Archive className="w-4 h-4" /> Đóng lớp
            </button>
            <button
              onClick={() => setBulkAction('delete')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-700 text-white shadow transition hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4" /> Xoá vĩnh viễn
            </button>
          </div>
        </div>
      )}

      {/* ── 2-Column Master Detail Split View ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ── LEFT COLUMN: Class Cards & Filters (5 cols) ─────────────── */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm space-y-3.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm lớp học, môn học..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Grade Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 text-xs">
              {GRADE_OPTIONS.map(g => {
                const active = gradeFilter === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGradeFilter(g)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                      active
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Class List */}
          <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1 custom-scrollbar">
            {dataLoading ? (
              <div className="bg-white rounded-2xl p-10 text-center text-teal-600 shadow-sm border border-teal-100">
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  <span className="text-sm font-semibold">Đang tải danh sách lớp học...</span>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow-sm border border-gray-100">
                <p className="text-sm font-medium">Không tìm thấy lớp học phù hợp</p>
              </div>
            ) : (
              filtered.map((c: any) => {
                const count = enrollments.filter(e => e.class_id === c.id && e.status === 'active').length
                const teacher = profiles.find(p => p.id === c.teacher_id)
                const isSelected = selClass?.id === c.id

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelClass(c)}
                    className={`group relative bg-white rounded-2xl p-4 border cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-2 border-teal-500 ring-4 ring-teal-500/10 shadow-md'
                        : 'border-gray-200 hover:border-teal-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Card Top Header */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-xs font-700 bg-gray-100 text-teal-800">
                          {c.grade || 'Khác'}
                        </span>
                        <span className={c.status === 'active' ? 'text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md' : 'text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md'}>
                          {c.status === 'active' ? 'Đang mở' : 'Đóng'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => openAddStudentModal(c, e)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-transform active:scale-95 shadow-sm"
                          title="Thêm học sinh vào lớp"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => openEdit(c, e)}
                          className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Sửa thông tin lớp"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClass(c.id, c.class_name, e)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa lớp học này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Class Name */}
                    <h3 className="font-800 text-gray-900 text-base leading-snug group-hover:text-teal-700 transition-colors">
                      {c.class_name}
                    </h3>

                    {/* Subject & Teacher */}
                    <p className="text-xs text-gray-500 mt-1">
                      Môn: <span className="font-semibold text-gray-700">{c.subject || 'Toán'}</span>
                      {teacher && (
                        <> · GV: <span className="font-semibold text-teal-700">{teacher.name || teacher.email}</span></>
                      )}
                    </p>

                    {/* Schedule & Roster count pill */}
                    <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-gray-100">
                      <span className="text-[11px] text-gray-400 font-medium truncate max-w-[210px]" title={c.schedule}>
                        {c.schedule || 'Chưa xếp lịch'}
                      </span>

                      <div className="flex items-center gap-1 text-xs font-700 text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">
                        <Users className="w-3.5 h-3.5 text-teal-600" />
                        <span>{count}/{c.max_students || '∞'}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Selected Class Roster Detail (7 cols) ──────── */}
        <div className="lg:col-span-7">
          {selClass ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-4 p-5">
              {/* Header inside right detail card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-800 text-gray-900 flex items-center gap-2 flex-wrap">
                    <span>Danh sách học sinh</span>
                    <span className="text-gray-400 font-normal">·</span>
                    <span className="text-teal-700">{selClass.class_name}</span>
                    <span className="bg-teal-100 text-teal-800 text-xs font-700 px-2.5 py-0.5 rounded-full">
                      {rosterStudents.length} học sinh
                    </span>
                  </h2>
                </div>

                <button
                  onClick={() => openAddStudentModal(selClass)}
                  className="btn-teal flex items-center gap-1.5 text-xs py-2 px-3.5 rounded-xl shadow-sm"
                >
                  <UserPlus className="w-4 h-4" /> Thêm học sinh
                </button>
              </div>

              {/* Roster Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={rosterSearch}
                  onChange={e => setRosterSearch(e.target.value)}
                  placeholder="Tìm tên hoặc mã học sinh trong lớp..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white transition-all"
                />
                {rosterSearch && (
                  <button onClick={() => setRosterSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Student List View */}
              {rosterStudents.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-gray-400 text-sm font-medium">Chưa có học sinh nào đăng ký lớp này</p>
                  <button
                    onClick={() => openAddStudentModal(selClass)}
                    className="mt-3 text-xs text-teal-600 font-700 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Bấm vào đây để thêm học sinh
                  </button>
                </div>
              ) : filteredRosterStudents.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  Không tìm thấy học sinh khớp với từ khóa "{rosterSearch}"
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar border border-gray-100 rounded-xl">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs font-700 text-gray-600 uppercase border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">STT</th>
                        <th className="px-4 py-3">Mã HS</th>
                        <th className="px-4 py-3">Họ và tên</th>
                        <th className="px-4 py-3">Trường</th>
                        <th className="px-4 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRosterStudents.map((s, idx) => (
                        <tr key={s.id} className="hover:bg-teal-50/40 transition-colors">
                          <td className="px-4 py-3 text-center text-gray-400 font-medium text-xs">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-semibold text-teal-700 text-xs">
                            {s.student_code || '—'}
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-800">
                            {s.full_name}
                            {s.phone && (
                              <span className="block text-[11px] font-normal text-gray-400">{s.phone}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {s.school || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={async () => {
                                await unenroll(s.id, selClass.id)
                                toast.success(`Đã bỏ đăng ký học sinh ${s.full_name}`)
                              }}
                              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 font-semibold transition-colors"
                            >
                              Gỡ khỏi lớp
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-semibold text-gray-600">Vui lòng chọn một lớp học bên trái</p>
              <p className="text-xs text-gray-400 mt-1">Hoặc thêm lớp mới để xem danh sách học sinh</p>
            </div>
          )}
        </div>

      </div>

      {/* ── MODAL: Thêm học sinh vào lớp ─────────────────────────────── */}
      <Modal
        open={modal === 'addStudent'}
        onClose={() => setModal(null)}
        title={`Thêm học sinh vào lớp - ${selClass?.class_name}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Chọn học sinh từ danh sách bên dưới để ghi danh vào lớp <strong className="text-teal-700">{selClass?.class_name}</strong>.
          </p>

          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={addStudentSearch}
              onChange={e => setAddStudentSearch(e.target.value)}
              placeholder="Tìm theo tên, mã học sinh hoặc SĐT..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white"
            />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar border border-gray-100 rounded-xl p-2 bg-gray-50">
            {filteredUnenrolled.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">
                {unenrolledStudents.length === 0
                  ? 'Tất cả học sinh đã được thêm vào lớp này'
                  : 'Không tìm thấy học sinh phù hợp'}
              </p>
            ) : (
              filteredUnenrolled.map(s => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm hover:border-teal-400 transition-all"
                >
                  <div>
                    <p className="font-bold text-sm text-gray-800">{s.full_name}</p>
                    <p className="text-xs text-gray-400">
                      Mã HS: <span className="font-semibold text-teal-600">{s.student_code || '—'}</span>
                      {s.school && <> · Trường: {s.school}</>}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      await enroll(s.id, selClass.id)
                      toast.success(`Đã thêm ${s.full_name} vào lớp`)
                    }}
                    className="btn-teal text-xs py-1.5 px-3.5 rounded-lg shadow-sm"
                  >
                    + Thêm vào lớp
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button onClick={() => setModal(null)} className="btn-outline px-6 text-xs py-2">
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL: Form Thêm / Sửa lớp ──────────────────────────────── */}
      <Modal
        open={modal === 'form'}
        onClose={() => setModal(null)}
        title={editing ? `Sửa lớp: ${editing.class_name}` : 'Thêm lớp mới'}
        size="2xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <label className="label">Tên lớp học *</label>
            <input {...inp('class_name')} placeholder="VD: LỚP TOÁN THẦY VIỆT-TOÁN 8–2K13–2627" />
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
            <input {...inp('grade')} placeholder="VD: Khối 8, Khối 10..." />
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
            <input {...inp('max_students')} type="number" placeholder="300" />
          </div>
          <div>
            <label className="label">Phòng học</label>
            <input {...inp('room')} placeholder="P.101..." />
          </div>

          <div className="md:col-span-4">
            <label className="label">Lịch học chi tiết</label>
            <input {...inp('schedule')} placeholder="VD: TỐI THỨ 6(19H30–21H30) VÀ CHIỀU CHỦ NHẬT..." />
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

      {/* ── Confirm Dialogs ─────────────────────────────────────────── */}
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
          {selectedClasses.length > 30 && <div>… and {selectedClasses.length - 30} lớp nữa</div>}
        </div>
      </ConfirmDangerDialog>

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
      </ConfirmDangerDialog>
    </div>
  )
}
