/**
 * Client-side auth store (Zustand + persist).
 * Stores the access token in localStorage for SPA-style auth.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: number
  email: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  setTokens: (a: string, r: string) => void
  setUser: (u: AuthUser) => void
  login: (tokens: { access_token: string; refresh_token: string }, user: AuthUser) => void
  logout: () => void
  isAuthed: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (a, r) => set({ accessToken: a, refreshToken: r }),
      setUser: (u) => set({ user: u }),
      login: (tokens, user) =>
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
      isAuthed: () => !!get().accessToken,
    }),
    {
      name: 'ansein-auth',
    }
  )
)

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('ansein-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.accessToken || null
  } catch {
    return null
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('ansein-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.refreshToken || null
  } catch {
    return null
  }
}
