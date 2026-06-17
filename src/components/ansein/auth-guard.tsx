'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Client-side guard — redirects unauthenticated users to /login.
 * Used by the protected /app/* layout.
 *
 * Waits for Zustand persist to rehydrate from localStorage before
 * making the auth decision. This prevents a flash redirect to /login
 * on hard page loads.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter()
  const accessToken = useAuthStore((s) => s.accessToken)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    // Mount tracking is the standard pattern for avoiding SSR/CSR hydration
    // mismatches with client-only state (like localStorage-backed auth).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasMounted(true)
  }, [])

  useEffect(() => {
    if (hasMounted && !accessToken) {
      router.replace('/login')
    }
  }, [hasMounted, accessToken, router])

  if (!hasMounted || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ansein-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--ansein-border-strong)] border-t-[var(--ansein-primary)] ansein-spin" />
          <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-muted)]">
            Authenticating…
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
