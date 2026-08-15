import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface QuestionBankItem {
  id: string
  created_at: string
  created_by: string | null
  grade: number
  topic: string
  difficulty: 'know' | 'understand' | 'apply'
  question_type: string
  question_data: any   // Question object từ types.ts
  source_file: string | null
  tags: string[]
}

export interface QuestionBankFilters {
  grade?: number | null
  topic?: string
  difficulty?: string
  question_type?: string
  search?: string
}

interface QuestionBankState {
  questions: QuestionBankItem[]
  loading: boolean
  topics: string[]   // danh sách chủ đề đã có để gợi ý

  loadQuestions: (filters?: QuestionBankFilters) => Promise<void>
  addQuestions: (items: Omit<QuestionBankItem, 'id' | 'created_at' | 'created_by'>[]) => Promise<number>
  updateQuestion: (id: string, updates: Partial<QuestionBankItem>) => Promise<void>
  deleteQuestion: (id: string) => Promise<void>
  deleteQuestions: (ids: string[]) => Promise<void>
  loadTopics: () => Promise<void>
}

export const useQuestionBankStore = create<QuestionBankState>((set, get) => ({
  questions: [],
  loading: false,
  topics: [],

  loadQuestions: async (filters = {}) => {
    set({ loading: true })
    try {
      let q = supabase.from('question_bank').select('*')

      if (filters.grade)          q = q.eq('grade', filters.grade)
      if (filters.difficulty)     q = q.eq('difficulty', filters.difficulty)
      if (filters.question_type)  q = q.eq('question_type', filters.question_type)
      if (filters.topic)          q = q.ilike('topic', `%${filters.topic}%`)

      q = q.order('created_at', { ascending: false })

      const { data, error } = await q
      if (error) throw error
      set({ questions: data || [] })
    } finally {
      set({ loading: false })
    }
  },

  addQuestions: async (items) => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id

    const rows = items.map(item => ({ ...item, created_by: userId }))
    const { data, error } = await supabase.from('question_bank').insert(rows).select('id')
    if (error) throw error

    // Reload và cập nhật topics
    await get().loadQuestions()
    await get().loadTopics()
    return data?.length || 0
  },

  updateQuestion: async (id, updates) => {
    const { error } = await supabase.from('question_bank').update(updates).eq('id', id)
    if (error) throw error
    set(s => ({
      questions: s.questions.map(q => q.id === id ? { ...q, ...updates } : q)
    }))
  },

  deleteQuestion: async (id) => {
    const { error } = await supabase.from('question_bank').delete().eq('id', id)
    if (error) {
      console.error('deleteQuestion error:', error)
      throw new Error(error.message || 'Lỗi xóa câu hỏi')
    }
    set(s => ({ questions: s.questions.filter(q => q.id !== id) }))
  },

  deleteQuestions: async (ids) => {
    const { error } = await supabase.from('question_bank').delete().in('id', ids)
    if (error) {
      console.error('deleteQuestions error:', error)
      throw new Error(error.message || 'Lỗi xóa câu hỏi')
    }
    set(s => ({ questions: s.questions.filter(q => !ids.includes(q.id)) }))
  },

  loadTopics: async () => {
    const { data } = await supabase
      .from('question_bank')
      .select('topic')
      .order('topic')
    const unique = [...new Set((data || []).map((r: any) => r.topic))].filter(Boolean)
    set({ topics: unique })
  },
}))
