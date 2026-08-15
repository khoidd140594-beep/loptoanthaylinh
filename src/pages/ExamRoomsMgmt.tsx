// @ts-nocheck
import { useEffect, useState } from 'react'
import { MonitorPlay, Plus, Trash2, KeyRound, BarChart3, RefreshCw, Globe, Copy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useExamRoomStore } from '@/store/examRoomStore'
import { useExamStore } from '@/store/examStore'
import { useDataStore } from '@/store/dataStore'
import Modal from '@/components/Modal'
import toast from 'react-hot-toast'

export default function ExamRoomsMgmt() {
  const navigate = useNavigate()
  const { rooms, loading, loadRooms, createRoom, updateRoomStatus, deleteRoom } = useExamRoomStore()
  const { exams, loadExams } = useExamStore()
  const { classes, loadClasses } = useDataStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    exam_id: '',
    class_id: '',
    time_limit: 45,
    status: 'waiting',
    // ✅ FIX: Mặc định KHÔNG xáo trộn. Giáo viên chủ động tick nếu muốn.
    settings: { shuffle: false, allowRetry: false, publicAccess: false },
  })

  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    setDataLoading(true)
    void Promise.all([loadRooms(), loadExams(), loadClasses()])
      .finally(() => setDataLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.exam_id) return toast.error('Vui lòng chọn đề thi')
    if (!form.settings.publicAccess && !form.class_id) return toast.error('Vui lòng chọn lớp học')
    setSaving(true)
    try {
      await createRoom(form)
      toast.success('Mở phòng thi thành công!')
      setModalOpen(false)
      setForm({
        exam_id: '', class_id: '', time_limit: 45, status: 'waiting',
        // ✅ FIX: Reset cũng mặc định KHÔNG xáo trộn
        settings: { shuffle: false, allowRetry: false, publicAccess: false },
      })
    } catch (e) {
      toast.error('Lỗi khi mở phòng thi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, code) => {
    if (!confirm(`Xóa phòng thi mã [${code}]? Mọi bài làm của học sinh sẽ bị mất.`)) return
    try {
      await deleteRoom(id)
      toast.success('Đã xóa phòng thi')
    } catch (e) {
      toast.error('Lỗi khi xóa')
    }
  }

  const setSettings = (patch) =>
    setForm(f => ({ ...f, settings: { ...f.settings, ...patch } }))

  // Kiểm tra đề đang chọn có phải TSA không
  const selectedExam = exams.find(ex => ex.id === form.exam_id)
  const selectedIsTSA = !!selectedExam?.title?.startsWith('[TSA]')

  return (
    <div className="space-y-6">
      <div className="page-header flex justify-between items-start">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <MonitorPlay className="w-7 h-7 text-teal-600" /> Quản lý Phòng thi
          </h1>
          <p className="text-gray-400 text-sm mt-1">Giao đề và theo dõi kết quả thi của học sinh</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-teal flex items-center gap-2 shadow-lg shadow-teal-500/20">
          <Plus className="w-4 h-4" /> Mở phòng thi mới
        </button>
      </div>

      <div className="card overflow-hidden border-teal-100 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#0d9488,#14b8a6)' }}>
                <th className="px-4 py-4 text-left text-white font-bold text-xs uppercase tracking-wider">Mã phòng</th>
                <th className="px-4 py-4 text-left text-white font-bold text-xs uppercase tracking-wider">Đề thi</th>
                <th className="px-4 py-4 text-left text-white font-bold text-xs uppercase tracking-wider">Lớp học</th>
                <th className="px-4 py-4 text-center text-white font-bold text-xs uppercase tracking-wider">Thời lượng</th>
                <th className="px-4 py-4 text-left text-white font-bold text-xs uppercase tracking-wider">Trạng thái</th>
                <th className="px-4 py-4 text-right text-white font-bold text-xs uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-50">
              {dataLoading ? (
                <tr><td colSpan={6} className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-teal-500 mx-auto" /></td></tr>
              ) : rooms.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-gray-400">Chưa có phòng thi nào. Hãy mở phòng thi đầu tiên!</td></tr>
              ) : (
                rooms.map((room, i) => (
                  <tr key={room.id} className={`hover:bg-teal-50/40 transition-colors ${i % 2 === 0 ? '' : 'bg-teal-50/10'}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 font-mono text-lg font-extrabold text-teal-700 bg-teal-50 px-3 py-1 rounded-xl border border-teal-200 w-max shadow-sm">
                          <KeyRound className="w-4 h-4 opacity-50" /> {room.code}
                        </span>
                        {room.settings?.publicAccess && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            <Globe className="w-3 h-3" /> Công khai
                          </span>
                        )}
                        {room.exams?.title?.startsWith('[TSA]') && (
                          <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                            🎯 TSA
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-bold text-gray-800">{room.exams?.title || '—'}</td>
                    <td className="px-4 py-4 text-gray-600 font-medium">
                      {(room.classes)?.class_name || (room.classes)?.name || (room.settings?.publicAccess ? 'Tất cả' : '—')}
                    </td>
                    <td className="px-4 py-4 text-center font-bold text-gray-500">{room.time_limit} phút</td>
                    <td className="px-4 py-4">
                      <select
                        value={room.status}
                        onChange={(e) => updateRoomStatus(room.id, e.target.value)}
                        className={`text-[11px] font-extrabold px-2.5 py-1.5 rounded-full outline-none border-2 cursor-pointer transition-all ${
                          room.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                          room.status === 'closed' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        <option value="waiting">🟡 CHỜ BẮT ĐẦU</option>
                        <option value="active">🟢 ĐANG THI</option>
                        <option value="closed">🔴 ĐÃ KHÓA</option>
                      </select>
                    </td>
                    <td className="px-4 py-4 text-right flex justify-end gap-2">
                      {room.settings?.publicAccess && (
                        <button
                          onClick={() => {
                            const link = `${window.location.origin}/thi?code=${room.code}`
                            navigator.clipboard.writeText(link).then(() => toast.success('Đã copy link thi công khai!'))
                          }}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                          title="Copy link phòng công khai"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/exam-results/${room.id}`)}
                        className="p-2 text-teal-600 hover:bg-teal-100 rounded-xl transition-all border border-transparent hover:border-teal-200"
                        title="Xem bảng điểm & kết quả"
                      >
                        <BarChart3 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(room.id, room.code)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                        title="Xóa phòng"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Thiết lập phòng thi mới" size="md">
        <div className="space-y-5">
          <div className="bg-teal-50 p-4 rounded-2xl border border-teal-100">
            <p className="text-xs text-teal-700 font-bold uppercase tracking-wider mb-1">💡 Mẹo nhỏ:</p>
            <p className="text-xs text-teal-600 leading-relaxed">Chọn đề thi và lớp tương ứng. Mã phòng sẽ được hệ thống tạo ngẫu nhiên sau khi lưu.</p>
          </div>

          <div>
            <label className="label">1. Chọn đề thi từ thư viện *</label>
            <select
              value={form.exam_id}
              onChange={e => {
                const ex = exams.find(x => x.id === e.target.value)
                const isTSA = ex?.title?.startsWith('[TSA]')
                setForm(f => ({
                  ...f,
                  exam_id: e.target.value,
                  settings: { ...f.settings, shuffle: isTSA ? false : f.settings.shuffle },
                }))
              }}
              className="input font-semibold text-teal-900"
            >
              <option value="">-- Chọn đề thi --</option>
              {exams.map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.title?.startsWith('[TSA]') ? '🎯 ' : '📄 '}{ex.title}
                </option>
              ))}
            </select>
            {selectedIsTSA && (
              <div className="mt-2 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-3 py-2 rounded-lg font-bold">
                🎯 Đề TSA — xáo trộn câu hỏi tự động bị tắt
              </div>
            )}
          </div>

          <div>
            <label className="label">
              2. Giao cho lớp học nào?{form.settings.publicAccess ? ' (không bắt buộc)' : ' *'}
            </label>
            <select
              value={form.class_id}
              onChange={e => setForm({ ...form, class_id: e.target.value })}
              className="input"
            >
              <option value="">{form.settings.publicAccess ? '-- Không giới hạn lớp --' : '-- Chọn lớp học --'}</option>
              {classes.filter(c => c.status === 'active').map(c => (
                <option key={c.id} value={c.id}>{c.class_name || c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Thời gian (Phút)</label>
              <input
                type="number"
                value={form.time_limit}
                onChange={e => setForm({ ...form, time_limit: Number(e.target.value) })}
                className="input text-center font-bold text-lg"
              />
            </div>
            <div>
              <label className="label">Trạng thái phòng</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="input font-bold"
              >
                <option value="waiting">🟡 Chờ bắt đầu</option>
                <option value="active">🟢 Cho thi ngay</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4 bg-teal-50 border border-teal-100 rounded-xl">
            <label className={`flex items-center gap-3 ${selectedIsTSA ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={selectedIsTSA ? false : form.settings.shuffle}
                disabled={selectedIsTSA}
                onChange={e => !selectedIsTSA && setSettings({ shuffle: e.target.checked })}
                className="w-5 h-5 accent-teal-600 rounded cursor-pointer"
              />
              <div>
                <span className="text-gray-800 text-sm font-bold block">🔀 Xáo trộn câu hỏi & đáp án</span>
                <span className="text-gray-500 text-xs">
                  {selectedIsTSA
                    ? 'Không áp dụng cho đề TSA'
                    : 'Hệ thống tự trộn mỗi học sinh 1 mã đề — chỉ dùng cho đề Word'}
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.settings.allowRetry}
                onChange={e => setSettings({ allowRetry: e.target.checked })}
                className="w-5 h-5 accent-teal-600 rounded cursor-pointer"
              />
              <div>
                <span className="text-gray-800 text-sm font-bold block">🔄 Cho phép thi lại nhiều lần</span>
                <span className="text-gray-500 text-xs">Học sinh có thể làm lại bài, điểm mới sẽ ghi đè điểm cũ</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer border-t border-teal-200 pt-3 mt-1">
              <input
                type="checkbox"
                checked={form.settings.publicAccess}
                onChange={e => setSettings({ publicAccess: e.target.checked })}
                className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
              />
              <div>
                <span className="text-gray-800 text-sm font-bold block">
                  🌐 Thi công khai (không cần tài khoản)
                </span>
                <span className="text-gray-500 text-xs">
                  Bất kỳ ai có mã phòng đều thi được — chỉ cần nhập tên, không cần mã học sinh
                </span>
              </div>
            </label>

            {form.settings.publicAccess && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 mt-1">
                <span className="text-blue-500 text-lg leading-none">ℹ️</span>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Phòng thi công khai: học sinh ngoài trung tâm vẫn thi được. Kết quả vẫn được lưu theo tên tự điền. Không cần chọn lớp học.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-gray-100">
            <button onClick={() => setModalOpen(false)} className="btn-outline px-8 py-2.5">Đóng</button>
            <button onClick={handleCreate} disabled={saving} className="btn-teal px-10 py-2.5 font-bold shadow-lg shadow-teal-500/30">
              {saving ? 'Đang khởi tạo...' : 'Mở phòng thi'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
