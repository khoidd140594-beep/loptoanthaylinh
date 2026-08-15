// @ts-nocheck
import { useEffect, useState, useRef } from 'react'
import { BookOpen, Plus, FileText, ChevronRight, Pencil, Check, X, Trash2, RefreshCw, Youtube, Users, Eye, EyeOff, Link as LinkIcon } from 'lucide-react'
import { useCourseStore } from '@/store/courseStore'
import { useExamStore } from '@/store/examStore'
import { useDataStore } from '@/store/dataStore' 
import { useAuthStore } from '@/store/authStore'
import { uploadPdfToSupabase } from '@/services/supabaseService'
import Modal from '@/components/Modal'
import toast from 'react-hot-toast'
import InteractiveVideoEditor from '@/components/InteractiveVideoEditor'

export default function CourseMgmt() {
  const { 
    courses, loadCourses, createCourse, updateCourse, deleteCourse,
    addChapter, updateChapter, deleteChapter,
    addLesson, updateLesson, deleteLesson 
  } = useCourseStore() as any;
  
  const { exams, loadExams } = useExamStore() as any;
  const { classes, loadClasses } = useDataStore() as any; 
  const { user, isAdmin } = useAuthStore() as any; 
  
  const [modalOpen, setModalOpen] = useState(false)
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [editState, setEditState] = useState<{ id: string, type: 'course'|'chapter'|'lesson', title: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLessonId, setUploadingLessonId] = useState<string | null>(null);
  const [attachExamLesson, setAttachExamLesson] = useState<any>(null);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [isRefreshingExams, setIsRefreshingExams] = useState(false);

  const [attachVideoLesson, setAttachVideoLesson] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [editingVideoLesson, setEditingVideoLesson] = useState<any>(null);

  // ✅ Gắn link học bất kỳ
  const [attachLinkLesson, setAttachLinkLesson] = useState<any>(null);
  const [linkUrl, setLinkUrl] = useState('');

  const [assigningCourse, setAssigningCourse] = useState<any>(null);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (loadCourses) loadCourses()
    if (loadExams) loadExams()
    if (loadClasses) loadClasses() 
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateCourse = async () => {
    if (!newCourseTitle.trim()) return toast.error('Vui lòng nhập tên khóa học')
    try {
      await createCourse({ title: newCourseTitle, description: 'Khóa học mới tạo', teacher_id: user?.id, is_published: false, free_access: false })
      toast.success('Đã tạo khóa học thành công!')
      setModalOpen(false)
      setNewCourseTitle('')
    } catch (error: any) { toast.error('Lỗi tạo khóa học!') }
  }

  const handleDeleteCourse = async (id: string, title: string) => {
    if (!confirm(`Xóa khóa học "${title}"? Toàn bộ dữ liệu sẽ mất.`)) return;
    try { await deleteCourse(id); toast.success('Đã xóa!'); } catch (e) { toast.error('Lỗi xóa khóa học!'); }
  }

  const handleTogglePublish = async (course: any) => {
    try {
      await updateCourse(course.id, { is_published: !course.is_published });
      toast.success(!course.is_published ? 'Đã XUẤT BẢN khóa học!' : 'Đã chuyển về BẢN NHÁP!');
    } catch (err) { toast.error('Lỗi cập nhật trạng thái!'); }
  }

  // ✅ Bật/tắt chế độ xem tự do
  const handleToggleFreeAccess = async (course: any) => {
    try {
      await updateCourse(course.id, { free_access: !course.free_access })
      toast.success(!course.free_access ? '🔓 Học sinh có thể xem tất cả video tự do!' : '🔒 Đã bật lại chế độ học theo trình tự!')
    } catch (err) { toast.error('Lỗi cập nhật!') }
  }

  const handleSaveAssignClasses = async () => {
    if (!assigningCourse) return;
    try {
      await updateCourse(assigningCourse.id, { assigned_class_ids: selectedClassIds });
      toast.success('Đã cập nhật danh sách lớp được học!');
      setAssigningCourse(null);
    } catch (err) { toast.error('Lỗi cập nhật lớp học!'); }
  }

  const handleAddChapter = async (courseId: string) => {
    try { await addChapter({ course_id: courseId, title: 'Chương mới', order_index: 1 }); toast.success('Đã thêm chương!'); } catch (e) { toast.error('Lỗi thêm chương!'); }
  }

  const handleDeleteChapter = async (id: string, title: string) => {
    if (!confirm(`Xóa chương "${title}"?`)) return;
    try { await deleteChapter(id); toast.success('Đã xóa!'); } catch (e) { toast.error('Lỗi!'); }
  }

  const handleAddLesson = async (chapterId: string) => {
    try { await addLesson({ chapter_id: chapterId, title: 'Bài học mới', order_index: 1 }); toast.success('Đã thêm bài học!'); } catch (e) { toast.error('Lỗi!'); }
  }

  const handleDeleteLesson = async (id: string, title: string) => {
    if (!confirm(`Xóa bài học "${title}"?`)) return;
    try { await deleteLesson(id); toast.success('Đã xóa!'); } catch (e) { toast.error('Lỗi!'); }
  }

  const handleSaveEdit = async () => {
    if (!editState || !editState.title.trim()) { setEditState(null); return; }
    try {
      if (editState.type === 'course') await updateCourse(editState.id, { title: editState.title });
      else if (editState.type === 'chapter') await updateChapter(editState.id, { title: editState.title });
      else if (editState.type === 'lesson') await updateLesson(editState.id, { title: editState.title });
      toast.success('Đã cập nhật tên!');
    } catch (err) { toast.error('Lỗi!'); } finally { setEditState(null); }
  }

  const handleTriggerUpload = (lessonId: string) => {
    setUploadingLessonId(lessonId);
    fileInputRef.current?.click();
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingLessonId) return;
    const toastId = toast.loading('Đang upload...');
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadPdfToSupabase(base64, file.name);
      await updateLesson(uploadingLessonId, { pdf_url: result.fileUrl });
      toast.success('Upload thành công!', { id: toastId });
    } catch(err) { toast.error('Lỗi upload!', { id: toastId }); } 
    finally { setUploadingLessonId(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  const handleRefreshExams = async () => {
    setIsRefreshingExams(true);
    await loadExams();
    setIsRefreshingExams(false);
    toast.success('Đã làm mới!');
  }

  const handleSaveAttachExam = async () => {
    if (!attachExamLesson || !selectedExamId) return toast.error('Chọn một đề thi!');
    try {
      await updateLesson(attachExamLesson.id, { exam_id: selectedExamId });
      toast.success('Gắn thành công!');
      setAttachExamLesson(null); setSelectedExamId('');
    } catch(err) { toast.error('Lỗi gắn bài tập!'); }
  }

  const handleSaveVideo = async () => {
    if (!videoUrl) return toast.error('Nhập link YouTube!');
    try {
      await updateLesson(attachVideoLesson.id, { video_url: videoUrl });
      toast.success('Gắn Video thành công!');
      setAttachVideoLesson(null); setVideoUrl('');
    } catch(err) { toast.error('Lỗi!'); }
  }

  // ✅ Lưu link học bất kỳ
  const handleSaveLink = async () => {
    if (!linkUrl.trim()) return toast.error('Nhập link!');
    try {
      await updateLesson(attachLinkLesson.id, { external_url: linkUrl });
      toast.success('Gắn link thành công!');
      setAttachLinkLesson(null); setLinkUrl('');
    } catch(err) { toast.error('Lỗi gắn link!'); }
  }

  const myClasses = isAdmin() ? classes : classes.filter((c: any) => c.teacher_id === user?.id);
  const myCourses = isAdmin() ? courses : courses?.filter((c: any) => c.teacher_id === user?.id);

  return (
    <div className="space-y-6">
      <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      <div className="flex justify-between items-center">
        <h1 className="section-title flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-teal-600" /> Quản lý Khóa học
        </h1>
        <button onClick={() => setModalOpen(true)} className="btn-teal flex items-center gap-2">
          <Plus className="w-4 h-4" /> Tạo khóa học mới
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {myCourses?.map((course: any) => (
          <div key={course.id} className={`card p-6 border-l-4 ${course.is_published ? 'border-teal-500' : 'border-gray-400 bg-gray-50/50'}`}>
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1">
                {editState?.id === course.id && editState.type === 'course' ? (
                  <div className="flex items-center gap-2 mb-1">
                    <input autoFocus value={editState.title} onChange={(e) => setEditState({ ...editState, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} className="text-xl font-bold text-gray-800 border-b-2 border-teal-500 outline-none bg-transparent px-1 w-full max-w-md" />
                    <button onClick={handleSaveEdit} className="text-green-600 p-1 hover:bg-green-50 rounded"><Check className="w-5 h-5"/></button>
                    <button onClick={() => setEditState(null)} className="text-gray-400 p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5"/></button>
                  </div>
                ) : (
                  <div className="flex items-center flex-wrap gap-3 group">
                    <h2 className="text-xl font-bold text-gray-800">{course.title}</h2>
                    
                    {/* Nút xuất bản / bản nháp */}
                    <button 
                      onClick={() => handleTogglePublish(course)} 
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition shadow-sm ${
                        course.is_published 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                        : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {course.is_published ? <><Eye className="w-3.5 h-3.5"/> Đã xuất bản</> : <><EyeOff className="w-3.5 h-3.5"/> Bản nháp</>}
                    </button>

                    {/* ✅ Nút xem tự do / theo trình tự */}
                    <button
                      onClick={() => handleToggleFreeAccess(course)}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition shadow-sm ${
                        course.free_access
                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
                      }`}
                      title={course.free_access ? 'Đang xem tự do — nhấn để đổi sang theo trình tự' : 'Đang theo trình tự — nhấn để cho xem tự do'}
                    >
                      {course.free_access ? '🔓 Xem tự do' : '🔒 Theo trình tự'}
                    </button>

                    <button onClick={() => { setAssigningCourse(course); setSelectedClassIds(course.assigned_class_ids || []); }} className="flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-lg border border-teal-200 hover:bg-teal-100 transition shadow-sm">
                      <Users className="w-3.5 h-3.5" /> 
                      {course.assigned_class_ids?.length > 0 ? `Đã giao cho ${course.assigned_class_ids.length} lớp` : 'Chưa giao lớp nào'}
                    </button>

                    <button onClick={() => setEditState({ id: course.id, type: 'course', title: course.title })} className="text-gray-400 hover:text-teal-600 opacity-0 group-hover:opacity-100 transition"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDeleteCourse(course.id, course.title)} className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
                <p className="text-gray-500 text-sm mt-2">{course.description}</p>
              </div>
            </div>

            <div className="space-y-4">
              {course.chapters?.sort((a:any, b:any) => a.order_index - b.order_index).map((chapter: any) => (
                <div key={chapter.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-3 group">
                    {editState?.id === chapter.id && editState.type === 'chapter' ? (
                      <div className="flex items-center gap-2 flex-1">
                        <ChevronRight className="w-4 h-4 text-teal-700" />
                        <input autoFocus value={editState.title} onChange={(e) => setEditState({ ...editState, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} className="font-bold text-teal-700 border-b border-teal-500 outline-none bg-transparent px-1 flex-1 max-w-sm" />
                        <button onClick={handleSaveEdit} className="text-green-600 p-1"><Check className="w-4 h-4"/></button>
                        <button onClick={() => setEditState(null)} className="text-gray-400 p-1"><X className="w-4 h-4"/></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 font-bold text-teal-700">
                        <ChevronRight className="w-4 h-4" /> {chapter.title}
                        <button onClick={() => setEditState({ id: chapter.id, type: 'chapter', title: chapter.title })} className="text-gray-400 hover:text-teal-600 opacity-0 group-hover:opacity-100 transition ml-2"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteChapter(chapter.id, chapter.title)} className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>

                  <div className="pl-6 space-y-2">
                    {chapter.lessons?.sort((a:any, b:any) => a.order_index - b.order_index).map((lesson: any) => (
                      <div key={lesson.id} className="flex flex-col bg-white p-3 rounded-lg border border-gray-100 shadow-sm group">
                        <div className="flex items-center justify-between">
                          {editState?.id === lesson.id && editState.type === 'lesson' ? (
                            <div className="flex items-center gap-2 flex-1">
                              <FileText className="w-4 h-4 text-gray-400" />
                              <input autoFocus value={editState.title} onChange={(e) => setEditState({ ...editState, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} className="text-sm font-medium border-b border-teal-500 outline-none bg-transparent px-1 flex-1 max-w-sm" />
                              <button onClick={handleSaveEdit} className="text-green-600 p-1"><Check className="w-4 h-4"/></button>
                              <button onClick={() => setEditState(null)} className="text-gray-400 p-1"><X className="w-4 h-4"/></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <FileText className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium">{lesson.title}</span>
                              <button onClick={() => setEditState({ id: lesson.id, type: 'lesson', title: lesson.title })} className="text-gray-400 hover:text-teal-600 opacity-0 group-hover:opacity-100 transition"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDeleteLesson(lesson.id, lesson.title)} className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-gray-400 flex flex-wrap gap-4 mt-2 ml-7 items-center">
                           {!lesson.pdf_url ? (
                             <button onClick={() => handleTriggerUpload(lesson.id)} disabled={uploadingLessonId === lesson.id} className="hover:text-teal-600 font-medium">
                               {uploadingLessonId === lesson.id ? '⏳ Đang tải...' : '📄 Upload PDF'}
                             </button>
                           ) : (
                             <div className="flex items-center gap-1 text-teal-600 font-medium">
                               ✅ Đã tải PDF <button onClick={() => updateLesson(lesson.id, { pdf_url: null })} className="text-[10px] text-red-400 hover:text-red-600">(Gỡ)</button>
                             </div>
                           )}

                           {!lesson.video_url ? (
                             <button onClick={() => setAttachVideoLesson(lesson)} className="hover:text-red-600 font-medium flex items-center gap-1">
                               <Youtube className="w-3 h-3" /> Nhúng Video
                             </button>
                           ) : (
                             <div className="flex items-center gap-1 text-red-600 font-medium">
                               ✅ Có Video <button onClick={() => updateLesson(lesson.id, { video_url: null, interactive_questions: [] })} className="text-[10px] text-gray-400 hover:text-red-600">(Gỡ)</button>
                               <span onClick={() => setEditingVideoLesson(lesson)} className="ml-2 px-2 py-0.5 bg-red-100 rounded text-[10px] cursor-pointer hover:bg-red-200">⚙️ Cài đặt câu hỏi</span>
                             </div>
                           )}
                           
                           {!lesson.exam_id ? (
                             <button onClick={() => setAttachExamLesson(lesson)} className="hover:text-blue-600 font-medium">✏️ Gắn Bài tập</button>
                           ) : (
                             <div className="flex items-center gap-1 text-blue-600 font-medium">
                               ✅ Có bài tập <button onClick={() => updateLesson(lesson.id, { exam_id: null })} className="text-[10px] text-red-400 hover:text-red-600">(Gỡ)</button>
                             </div>
                           )}

                           {/* ✅ Gắn link học bất kỳ */}
                           {!lesson.external_url ? (
                             <button onClick={() => setAttachLinkLesson(lesson)} className="hover:text-purple-600 font-medium flex items-center gap-1">
                               <LinkIcon className="w-3 h-3" /> Gắn Link
                             </button>
                           ) : (
                             <div className="flex items-center gap-1 text-purple-600 font-medium">
                               <a href={lesson.external_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">🔗 Mở Link</a>
                               <button onClick={() => updateLesson(lesson.id, { external_url: null })} className="text-[10px] text-red-400 hover:text-red-600">(Gỡ)</button>
                             </div>
                           )}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => handleAddLesson(chapter.id)} className="text-xs text-teal-600 font-bold hover:underline mt-2 inline-block">+ Thêm bài học mới</button>
                  </div>
                </div>
              ))}
              <button onClick={() => handleAddChapter(course.id)} className="btn-outline w-full text-xs py-2">+ Thêm chương mới</button>
            </div>
          </div>
        ))}
        {(!myCourses || myCourses.length === 0) && (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">Chưa có khóa học nào. Hãy tạo khóa học đầu tiên!</div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Tạo khóa học mới">
         <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Tên khóa học</label>
              <input type="text" value={newCourseTitle} onChange={e => setNewCourseTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:border-teal-500" placeholder="Ví dụ: Toán 9 - Học kì 1" autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setModalOpen(false)} className="btn-outline px-4 py-2">Hủy</button>
              <button onClick={handleCreateCourse} className="btn-teal px-6 py-2">Lưu khóa học</button>
            </div>
         </div>
      </Modal>

      <Modal open={!!assigningCourse} onClose={() => setAssigningCourse(null)} title="Giao khóa học cho lớp">
         <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-2">Khóa học: <strong className="text-teal-700">{assigningCourse?.title}</strong></p>
            <p className="text-xs text-gray-500 mb-4 italic">Học sinh thuộc các lớp được tích chọn dưới đây mới có thể thấy và học khóa này.</p>
            <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded-xl p-3 bg-gray-50">
              {myClasses?.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Bạn chưa có lớp học nào. Hãy tạo lớp trước!</p>}
              {myClasses?.map((cls: any) => {
                const isSelected = selectedClassIds.includes(cls.id);
                return (
                  <label key={cls.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${isSelected ? 'border-teal-500 bg-teal-50' : 'border-gray-200 bg-white hover:border-teal-300'}`}>
                    <input type="checkbox" className="w-5 h-5 text-teal-600 rounded cursor-pointer" checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedClassIds([...selectedClassIds, cls.id]);
                        else setSelectedClassIds(selectedClassIds.filter(id => id !== cls.id));
                      }}
                    />
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-sm">{cls.class_name}</p>
                      <p className="text-xs text-gray-500">{cls.subject} • {cls.grade}</p>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => setAssigningCourse(null)} className="btn-outline px-4 py-2">Hủy</button>
              <button onClick={handleSaveAssignClasses} className="btn-teal px-6 py-2 shadow-md">Lưu cài đặt</button>
            </div>
         </div>
      </Modal>

      <Modal open={!!attachVideoLesson} onClose={() => setAttachVideoLesson(null)} title="Nhúng Video YouTube">
         <div className="space-y-4">
            <p className="text-sm text-gray-600">Bài học: <strong className="text-red-600">{attachVideoLesson?.title}</strong></p>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Link YouTube</label>
              <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:border-red-500" placeholder="https://www.youtube.com/watch?v=..." autoFocus />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => { setAttachVideoLesson(null); setVideoUrl(''); }} className="btn-outline px-4 py-2">Hủy</button>
              <button onClick={handleSaveVideo} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-lg shadow-md flex items-center gap-2">
                <Youtube className="w-4 h-4"/> Lưu Video
              </button>
            </div>
         </div>
      </Modal>

      {/* ✅ Modal gắn link học bất kỳ */}
      <Modal open={!!attachLinkLesson} onClose={() => setAttachLinkLesson(null)} title="Gắn Link học tập">
         <div className="space-y-4">
            <p className="text-sm text-gray-600">Bài học: <strong className="text-purple-600">{attachLinkLesson?.title}</strong></p>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Đường dẫn (URL)</label>
              <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:border-purple-500" placeholder="https://..." autoFocus />
              <p className="text-xs text-gray-400 mt-1 italic">Khi học sinh bấm vào sẽ mở trang này ở tab mới.</p>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => { setAttachLinkLesson(null); setLinkUrl(''); }} className="btn-outline px-4 py-2">Hủy</button>
              <button onClick={handleSaveLink} className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-2 rounded-lg shadow-md flex items-center gap-2">
                <LinkIcon className="w-4 h-4"/> Lưu Link
              </button>
            </div>
         </div>
      </Modal>

      <Modal open={!!attachExamLesson} onClose={() => setAttachExamLesson(null)} title="Gắn bài tập cho Bài học">
         <div className="space-y-5">
            <p className="text-sm text-gray-600">Bài học: <strong className="text-teal-700">{attachExamLesson?.title}</strong></p>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-bold text-gray-700">Chọn Đề thi từ Ngân hàng</label>
                <button onClick={handleRefreshExams} disabled={isRefreshingExams} className="text-xs text-teal-600 font-bold hover:underline flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${isRefreshingExams ? 'animate-spin' : ''}`} /> Làm mới
                </button>
              </div>
              <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:border-teal-500 font-semibold">
                <option value="">-- Click để chọn đề thi --</option>
                {exams?.map((ex: any) => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <button onClick={() => { setAttachExamLesson(null); setSelectedExamId(''); }} className="btn-outline px-4 py-2">Hủy</button>
              <button onClick={handleSaveAttachExam} className="btn-teal px-6 py-2 shadow-md">Gắn bài tập</button>
            </div>
         </div>
      </Modal>

      {editingVideoLesson && (
        <InteractiveVideoEditor 
          lesson={editingVideoLesson} 
          onClose={() => setEditingVideoLesson(null)} 
          onSave={async (questions) => {
            await updateLesson(editingVideoLesson.id, { interactive_questions: questions });
            setEditingVideoLesson(null);
            toast.success('Lưu cài đặt câu hỏi thành công!');
          }} 
        />
      )}
    </div>
  )
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result?.toString().split(',')[1] || '')
    reader.readAsDataURL(file)
  })
}
