/**
 * Client-side auth store (Zustand + persist).
 * Stores the access token in localStorage for SPA-style auth.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/lib/rbac'

export type { Role }

export interface AuthUser {
  id: number
  email: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  /**
   * RBAC role. Optional because pre-RBAC persisted sessions may not have it;
   * callers should use the `getUserRole()` helper from @/lib/rbac to safely
   * derive a role (falling back to is_superuser for backward compat).
   */
  role?: Role
  created_at: string
}

/**
 * Safe role accessor for an AuthUser — falls back to inferring from
 * is_superuser for sessions created before the role field existed.
 */
export function authUserRole(u: AuthUser | null | undefined): Role {
  if (!u) return 'analyst'
  if (u.role === 'analyst' || u.role === 'editor' || u.role === 'admin') return u.role
  return u.is_superuser ? 'admin' : 'analyst'
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
