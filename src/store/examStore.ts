import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

interface ExamState {
  exams: any[]
  loading: boolean
  dbError: string | null
  loadExams: () => Promise<void>
  createExam: (examData: any, title: string) => Promise<string>
  deleteExam: (id: string) => Promise<void>
  getExamData: (id: string) => Promise<any>
  getExamConfig: (id: string) => Promise<{ pointsConfig: any; questions: any[] }>
}

export const useExamStore = create<ExamState>((set, get) => ({
  exams: [],
  loading: false,
  dbError: null,

  loadExams: async () => {
    set({ loading: true, dbError: null })
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, created_at, exam_type:data->>exam_type')
        .order('created_at', { ascending: false })

      if (error) {
        if (error.code === '42P01' || error.message?.includes("Could not find the table 'public.exams'")) {
          set({ dbError: "Cơ sở dữ liệu Supabase chưa tạo bảng 'public.exams'. Vui lòng chạy lệnh SQL khởi tạo bảng." })
        } else {
          set({ dbError: error.message })
        }
        set({ exams: [] })
        return
      }

      set({ exams: data || [], dbError: null })
    } catch (err: any) {
      set({ dbError: err.message || 'Lỗi khi tải danh sách đề thi' })
    } finally {
      set({ loading: false })
    }
  },

  createExam: async (examData, title) => {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.from('exams').insert([{
      title,
      data:       examData,
      created_by: session?.user?.id,
    }]).select('id').single()
    
    if (error) {
      if (error.code === '42P01' || error.message?.includes("Could not find the table 'public.exams'")) {
        throw new Error("Cơ sở dữ liệu Supabase chưa có bảng 'public.exams'. Vui lòng vào Supabase Dashboard -> SQL Editor để tạo bảng!")
      }
      throw error
    }
    
    await get().loadExams()
    return data.id
  },

  deleteExam: async (id) => {
    await supabase.from('lessons').update({ exam_id: null }).eq('exam_id', id)
    const { error } = await supabase.from('exams').delete().eq('id', id)
    if (error) throw error
    await get().loadExams()
  },

  getExamData: async (id) => {
    const { data, error } = await supabase
      .from('exams').select('data').eq('id', id).single()
    if (error) throw error
    return data.data
  },

  getExamConfig: async (id) => {
    const { data, error } = await supabase
      .from('exams')
      .select('pointsConfig:data->pointsConfig, questions:data->questions')
      .eq('id', id)
      .single()
    if (error) throw error
    const d = data as any
    return {
      pointsConfig: d.pointsConfig ?? null,
      questions:    d.questions   ?? [],
    }
  },
}))
