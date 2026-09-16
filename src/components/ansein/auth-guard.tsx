'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'

/**
 * Client-side guard — redirects unauthenticated users to /login.
 * Used by the protected /app/* layout.
 *
 * Cookie-authoritative: the session is verified against GET /auth/me, which
 * reads the httpOnly `ansein_access` cookie. No token is ever read from
 * localStorage (tokens are not stored there anymore).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const logout = useAuthStore((s) => s.logout)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function verify() {
      try {
        const resp = await fetch('/api/v1/auth/me')
        if (!resp.ok) throw new Error('unauthenticated')
        const me = (await resp.json()) as AuthUser & {
          last_login_at?: string | null
        }
        if (cancelled) return
        setUser({
          id: me.id,
          email: me.email,
          full_name: me.full_name,
          is_active: me.is_active,
          is_superuser: me.is_superuser,
          role: me.role,
          created_at: me.created_at,
        })
        setVerified(true)
      } catch {
        if (cancelled) return
        logout()
        router.replace('/login')
      }
    }
    verify()
    return () => {
      cancelled = true
    }
  }, [router, setUser, logout])

  if (!verified || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary/50 border-t-primary ansein-spin" />
          <p className="ansein-mono text-xs uppercase tracking-widest text-muted-foreground">
            Authenticating…
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
