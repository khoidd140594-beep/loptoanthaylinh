// @ts-nocheck
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'        // ✅ FIX #1: import useParams
import { Lock, CheckCircle, PlayCircle, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LessonExamRoom from '@/components/LessonExamRoom'
import InteractiveVideoPlayer from '@/components/InteractiveVideoPlayer'
import toast from 'react-hot-toast'

// ✅ FIX #1: Bỏ props — lấy từ URL params thay vì props
// App.tsx dùng <StudentCourseViewer /> mà không truyền props,
// nên courseId và studentId luôn là undefined nếu dùng props.
export default function StudentCourseViewer() {
  // ✅ FIX #1: Đọc params từ URL /:courseId/:studentId
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>()

  const [course, setCourse] = useState<any>(null)
  const [progress, setProgress] = useState<any[]>([])
  const [activeLesson, setActiveLesson] = useState<any>(null)
  const [showPractice, setShowPractice] = useState(false)
  const [activeTab, setActiveTab] = useState<'video' | 'pdf'>('video')
  const [studentName, setStudentName] = useState('Học sinh')

  useEffect(() => {
    const sessionStr = sessionStorage.getItem('current_student')
    if (sessionStr) {
      const currentStudent = JSON.parse(sessionStr)
      setStudentName(currentStudent.full_name || currentStudent.name || 'Học sinh')
    }

    // ✅ FIX #2: Guard — không query khi params còn undefined
    if (!courseId || !studentId) return

    const fetchData = async () => {
      const { data: courseData } = await supabase
        .from('courses')
        .select('*, chapters(*, lessons(*))')
        .eq('id', courseId)
        .single()
      
      const { data: progressData } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', studentId)

      setCourse(courseData)
      setProgress(progressData || [])
      
      if (courseData?.chapters?.[0]?.lessons?.[0]) {
        setActiveLesson(courseData.chapters[0].lessons[0])
      }
    }

    fetchData()
  }, [courseId, studentId])

  const isUnlocked = (lesson: any) => {
    // ✅ Nếu khóa học cho phép xem tự do — mở tất cả bài
    if (course?.free_access) return true
    // Bài đầu tiên luôn mở khóa
    if (
      course?.chapters?.[0]?.lessons?.[0] &&
      lesson.order_index === 1 &&
      course.chapters[0].lessons[0].id === lesson.id
    ) return true
    const p = progress.find(item => item.lesson_id === lesson.id)
    return p?.is_unlocked || false
  }

  const handlePracticeSubmitted = async (percentage: number) => {
    try {
      // ✅ FIX #3: Thêm is_unlocked: true để không reset trạng thái mở khóa
      // Nếu upsert không có is_unlocked và record chưa tồn tại, default sẽ là false
      // → học sinh sẽ bị mất quyền truy cập bài hiện tại sau khi nộp bài
      await supabase.from('student_progress').upsert({
        student_id: studentId,
        lesson_id: activeLesson.id,
        is_unlocked: true,          // ✅ FIX #3
        is_passed: percentage >= 80,
        highest_score: percentage,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id,lesson_id' })

      if (percentage >= 80) {
        toast.success('🎉 Bạn đã đạt trên 80% và hoàn thành bài học!')
        // Reload progress để sidebar cập nhật unlock bài tiếp theo
        const { data: progressData } = await supabase
          .from('student_progress')
          .select('*')
          .eq('student_id', studentId)
        setProgress(progressData || [])
      } else {
        toast.error(`⚠️ Điểm của bạn là ${percentage}%. Cần đạt 80% để qua bài.`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setShowPractice(false)
    }
  }

  // Hiển thị loading nếu params chưa có (edge case)
  if (!courseId || !studentId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 font-bold">
        Không tìm thấy thông tin khóa học. Vui lòng quay lại và thử lại.
      </div>
    )
  }

  if (showPractice && activeLesson?.exam_id) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="p-4 bg-gray-100 flex items-center border-b shadow-sm">
          <button
            onClick={() => setShowPractice(false)}
            className="flex items-center gap-2 text-gray-600 hover:text-red-600 font-bold transition"
          >
            <ChevronLeft /> Thoát luyện tập
          </button>
        </div>
        <div className="flex-1 relative">
          <LessonExamRoom 
            examId={activeLesson.exam_id} 
            studentName={studentName}
            onSubmitted={handlePracticeSubmitted}
            onExit={() => setShowPractice(false)} 
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white">
      <aside className="w-80 border-r overflow-y-auto p-4 bg-gray-50 custom-scrollbar">
        <h2 className="font-bold text-lg mb-6">{course?.title}</h2>
        {course?.chapters
          ?.sort((a: any, b: any) => a.order_index - b.order_index)
          .map((chapter: any) => (
            <div key={chapter.id} className="mb-6">
              <h3 className="text-xs font-black text-gray-400 uppercase mb-3">{chapter.title}</h3>
              <div className="space-y-2">
                {chapter.lessons
                  ?.sort((a: any, b: any) => a.order_index - b.order_index)
                  .map((lesson: any) => {
                    const unlocked = isUnlocked(lesson)
                    const passed   = progress.find(p => p.lesson_id === lesson.id)?.is_passed
                    return (
                      <button
                        key={lesson.id}
                        disabled={!unlocked}
                        onClick={() => { setActiveLesson(lesson); setActiveTab('video') }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          activeLesson?.id === lesson.id
                            ? 'bg-teal-600 text-white shadow-lg'
                            : 'hover:bg-teal-50'
                        } ${!unlocked ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                      >
                        {passed
                          ? <CheckCircle className="w-5 h-5 text-green-400" />
                          : unlocked
                          ? <PlayCircle className="w-5 h-5 text-teal-400" />
                          : <Lock className="w-5 h-5" />}
                        <span className="text-sm font-bold text-left">{lesson.title}</span>
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
      </aside>

      <main className="flex-1 flex flex-col">
        {activeLesson ? (
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-white shadow-sm z-10">
              <h1 className="font-extrabold text-xl">{activeLesson.title}</h1>
              <div className="flex items-center gap-3">
                {/* ✅ Nút mở link học tập — hiện khi bài có external_url */}
                {activeLesson.external_url && (
                  <a
                    href={activeLesson.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-purple-600 text-white font-bold px-6 py-2 rounded-xl shadow-md hover:bg-purple-700 transition flex items-center gap-2"
                  >
                    🔗 Mở link học tập
                  </a>
                )}
                {activeLesson.exam_id && (
                  <button
                    onClick={() => setShowPractice(true)}
                    className="bg-teal-600 text-white font-bold px-6 py-2 rounded-xl shadow-md hover:bg-teal-700 transition"
                  >
                    ✏️ Luyện tập ngay
                  </button>
                )}
              </div>
            </div>
            {/* Tab bar — chỉ hiện khi bài có cả video lẫn PDF */}
            {activeLesson.video_url && activeLesson.pdf_url && (
              <div className="flex border-b border-gray-200 bg-white shrink-0">
                <button
                  onClick={() => setActiveTab('video')}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'video'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🎬 Video bài giảng
                </button>
                <button
                  onClick={() => setActiveTab('pdf')}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'pdf'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📄 Tài liệu PDF
                </button>
              </div>
            )}

            <div className="flex-1 bg-gray-200 relative">
              {/* Video — hiện khi có video và (không có PDF hoặc đang ở tab video) */}
              {activeLesson.video_url && (!activeLesson.pdf_url || activeTab === 'video') && (
                <InteractiveVideoPlayer
                  key={activeLesson.id}            /* ✅ FIX: đổi bài → remount player → nạp đúng video mới */
                  lesson={activeLesson}
                  onComplete={() => handlePracticeSubmitted(100)}
                />
              )}
              {/* PDF — hiện khi có PDF và (không có video hoặc đang ở tab pdf) */}
              {activeLesson.pdf_url && (!activeLesson.video_url || activeTab === 'pdf') && (
                <iframe
                  key={activeLesson.id}
                  src={`${activeLesson.pdf_url}#toolbar=0`}
                  className="w-full h-full border-none"
                />
              )}
              {/* Không có video/PDF */}
              {!activeLesson.video_url && !activeLesson.pdf_url && (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4 p-6 text-center">
                  {activeLesson.external_url ? (
                    <>
                      <p className="text-gray-500 font-medium">Bài học này có một liên kết học tập bên ngoài.</p>
                      <a
                        href={activeLesson.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-purple-600 text-white font-bold px-8 py-3 rounded-xl shadow-md hover:bg-purple-700 transition flex items-center gap-2"
                      >
                        🔗 Mở link học tập
                      </a>
                    </>
                  ) : (
                    <span>Không có tài liệu PDF / Video</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 font-bold text-lg">
            Chọn một bài học để bắt đầu
          </div>
        )}
      </main>
    </div>
  )
}
