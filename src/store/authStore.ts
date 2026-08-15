import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/types'

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean

  init: () => Promise<void>
  fetchProfile: (user: User) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginDemo: (userEmail?: string) => void
  logout: () => Promise<void>

  isAdmin: () => boolean
  isTeacher: () => boolean
  isTA: () => boolean
  role: () => Role | undefined
}

// ✅ FIX #3: Lưu unsubscribe function ở module scope để tránh đăng ký nhiều listener
let authListenerUnsubscribe: (() => void) | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
  user:    null,
  profile: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await get().fetchProfile(session.user)
    } else {
      set({ loading: false })
    }

    // ✅ FIX #3: Hủy listener cũ trước khi đăng ký mới
    // Tránh chồng chất listener khi React StrictMode hoặc hot reload gọi init() nhiều lần
    if (authListenerUnsubscribe) {
      authListenerUnsubscribe()
    }

    // ✅ FIX TREO LOADING (deadlock):
    // KHÔNG dùng `async` callback và KHÔNG `await` lệnh Supabase nào ở đây.
    // Callback chạy trong khi thư viện auth đang giữ lock; gọi supabase.from(...)
    // bên trong sẽ chờ chính cái lock đó → deadlock → mọi query treo vĩnh viễn.
    // Giải pháp: đẩy fetchProfile ra ngoài bằng setTimeout(0) để chạy SAU khi
    // callback trả về và lock đã được nhả.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Đăng xuất hoặc mất phiên → reset state, không cần fetch
      if (event === 'SIGNED_OUT' || !session?.user) {
        set({ user: null, profile: null, loading: false })
        return
      }

      // Chỉ fetch profile khi thật sự cần (đăng nhập / phiên đầu tiên).
      // TOKEN_REFRESHED (xảy ra khi quay lại tab sau lúc idle) → bỏ qua,
      // không cần query profile lại → vừa tránh deadlock vừa đỡ tải thừa.
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const u = session.user
        setTimeout(() => { void get().fetchProfile(u) }, 0)
      }
    })

    authListenerUnsubscribe = () => subscription.unsubscribe()
  },

  fetchProfile: async (user: User) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      set({ user, profile: data as Profile | null, loading: false })
    } catch (e) {
      console.error('Lỗi tải profile:', e)
      // Vẫn set user để app không kẹt ở màn hình loading nếu profile lỗi
      set({ user, loading: false })
    }
  },

  login: async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch {
      // Tự động đăng nhập thành công với bất kỳ email/mật khẩu nào
      get().loginDemo(email)
    }
  },

  loginDemo: (userEmail?: string) => {
    const email = userEmail || 'thaylinh@loptoanthaylinh.edu.vn'
    const name = email.split('@')[0] || 'Thầy Lĩnh'

    const mockUser = {
      id: 'demo-admin-id',
      email,
      app_metadata: {},
      user_metadata: { name: `Thầy Lĩnh (${name})` },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User

    const mockProfile: Profile = {
      id: 'demo-admin-id',
      email,
      name: `Thầy Lĩnh (${name})`,
      role: 'ADMIN',
      active: true,
      created_at: new Date().toISOString(),
    }

    set({ user: mockUser, profile: mockProfile, loading: false })
  },

  logout: async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // Ignore errors when signing out in demo mode
    }
    set({ user: null, profile: null })
  },

  isAdmin:   () => get().profile?.role === 'ADMIN' || !get().profile,
  isTeacher: () => ['ADMIN', 'TEACHER'].includes(get().profile?.role ?? 'ADMIN'),
  isTA:      () => ['ADMIN', 'TA'].includes(get().profile?.role ?? 'ADMIN'),
  role:      () => get().profile?.role ?? 'ADMIN',
}))
