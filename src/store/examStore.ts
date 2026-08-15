import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

interface ExamState {
  exams: any[]
  loading: boolean
  loadExams: () => Promise<void>
  createExam: (examData: any, title: string) => Promise<string>
  deleteExam: (id: string) => Promise<void>
  getExamData: (id: string) => Promise<any>
  getExamConfig: (id: string) => Promise<{ pointsConfig: any; questions: any[] }> // ✅ MỚI
}

export const useExamStore = create<ExamState>((set, get) => ({
  exams: [],
  loading: false,

  loadExams: async () => {
  set({ loading: true })
  try {
    const { data, error } = await supabase
      .from('exams')
      .select('id, title, created_at, exam_type:data->>exam_type')
      .order('created_at', { ascending: false })
    if (error) throw error
    set({ exams: data || [] })
  } finally {
    set({ loading: false })
  }
},

  createExam: async (examData, title) => {
    // getSession() đọc cache, không gọi network như getUser()
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.from('exams').insert([{
      title,
      data:       examData,
      created_by: session?.user?.id,
    }]).select('id').single()
    if (error) throw error
    await get().loadExams()
    return data.id
  },

  deleteExam: async (id) => {
    // Gỡ liên kết bài học (lessons.exam_id không có ON DELETE SET NULL)
    await supabase.from('lessons').update({ exam_id: null }).eq('exam_id', id)
    const { error } = await supabase.from('exams').delete().eq('id', id)
    if (error) throw error
    await get().loadExams()
  },

  // Dùng cho xem trước đề — cần toàn bộ data
  getExamData: async (id) => {
    const { data, error } = await supabase
      .from('exams').select('data').eq('id', id).single()
    if (error) throw error
    return data.data
  },

  // ✅ Dùng cho cấu hình điểm — chỉ fetch 2 subfield của JSONB thay vì cả cột data
  // PostgREST JSON path: data->field → chỉ trả đúng phần cần, payload nhỏ hơn ~10-50x
  getExamConfig: async (id) => {
    const { data, error } = await supabase
      .from('exams')
      .select('pointsConfig:data->pointsConfig, questions:data->questions')
      .eq('id', id)
      .single()
    if (error) throw error
    // Cast as any: Supabase infers JSONB path as complex union type, incompatible with any[]
    const d = data as any
    return {
      pointsConfig: d.pointsConfig ?? null,
      questions:    d.questions   ?? [],
    }
  },
}))
