import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// Khớp bảng `presentations` (metadata) + bucket Storage `presentations` chứa file .html
export interface PresentationRow {
  id: string
  created_at: string
  created_by: string | null
  title: string
  source_type: 'pdf' | 'word' | 'latex'
  lesson_id: string | null
  storage_path: string
  slide_count: number
  model: string | null
}

const BUCKET = 'presentations'

interface SavePresentationInput {
  title: string
  sourceType: 'pdf' | 'word' | 'latex'
  html: string
  slideCount: number
  model?: string
  lessonId?: string | null
}

interface PresentationState {
  presentations: PresentationRow[]
  loading: boolean
  loadPresentations: (lessonId?: string) => Promise<void>
  savePresentation: (input: SavePresentationInput) => Promise<PresentationRow>
  deletePresentation: (id: string) => Promise<void>
  getPublicUrl: (storagePath: string) => string
  fetchHtml: (storagePath: string) => Promise<string>
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentations: [],
  loading: false,

  loadPresentations: async (lessonId) => {
    set({ loading: true })
    try {
      let q = supabase.from('presentations').select('*').order('created_at', { ascending: false })
      if (lessonId) q = q.eq('lesson_id', lessonId)
      const { data, error } = await q
      if (error) throw error
      set({ presentations: (data ?? []) as PresentationRow[] })
    } finally {
      set({ loading: false })
    }
  },

  savePresentation: async (input) => {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? null

    // Tạo id trước để đặt tên file trùng khoá chính.
    const id = crypto.randomUUID()
    const storagePath = `${id}.html`

    // 1) Upload HTML lên Storage (không nhét vào cột row để tránh phình bảng).
    const blob = new Blob([input.html], { type: 'text/html;charset=utf-8' })
    const up = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, blob, { contentType: 'text/html;charset=utf-8', upsert: true })
    if (up.error) throw new Error(`Lỗi tải HTML lên Storage: ${up.error.message}`)

    // 2) Lưu metadata.
    const row = {
      id,
      title: input.title,
      source_type: input.sourceType,
      lesson_id: input.lessonId ?? null,
      storage_path: storagePath,
      slide_count: input.slideCount,
      model: input.model ?? null,
      created_by: userId,
    }
    const { data, error } = await supabase.from('presentations').insert(row).select().single()
    if (error) {
      // Rollback file đã upload nếu ghi metadata lỗi.
      await supabase.storage.from(BUCKET).remove([storagePath])
      throw new Error(`Lỗi lưu presentation: ${error.message}`)
    }

    const saved = data as PresentationRow
    set(s => ({ presentations: [saved, ...s.presentations] }))
    return saved
  },

  deletePresentation: async (id) => {
    const row = get().presentations.find(p => p.id === id)
    if (row) await supabase.storage.from(BUCKET).remove([row.storage_path])
    const { error } = await supabase.from('presentations').delete().eq('id', id)
    if (error) throw error
    set(s => ({ presentations: s.presentations.filter(p => p.id !== id) }))
  },

  getPublicUrl: (storagePath) => {
    return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
  },

  fetchHtml: async (storagePath) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
    if (error) throw error
    return await data.text()
  },
}))
