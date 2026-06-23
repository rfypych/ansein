'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ShieldCheck,
  Zap,
  Network,
  Brain,
  Check,
} from 'lucide-react'
import { BrandMark } from '@/components/ansein/brand'
import { http } from '@/lib/http'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TokenPairResponse {
  access_token: string
  refresh_token: string
  user: AuthUser
}

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Hybrid extraction',
    desc: 'Regex + LLM pipeline catches every IOC',
  },
  {
    icon: Network,
    title: 'Knowledge graph',
    desc: 'Visualise entities and relationships',
  },
  {
    icon: Brain,
    title: 'Cognitive analysis',
    desc: 'AI narratives with severity scoring',
  },
  {
    icon: ShieldCheck,
    title: 'BYOK encrypted',
    desc: 'AES-256-GCM keys at rest',
  },
]

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '#64748b' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  const levels = [
    { label: 'Too short', color: '#f43f5e' },
    { label: 'Weak', color: '#f43f5e' },
    { label: 'Fair', color: '#f59e0b' },
    { label: 'Good', color: '#06b6d4' },
    { label: 'Strong', color: '#10b981' },
    { label: 'Excellent', color: '#10b981' },
  ]
  return { score, ...levels[Math.min(score, 5)] }
}

export default function RegisterPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [isFirstAccount, setIsFirstAccount] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    http.get<{ admin_exists: boolean }>('/setup')
      .then(res => setIsFirstAccount(!res.admin_exists))
      .catch(() => setIsFirstAccount(false))
      .finally(() => setChecking(false))
  }, [])

  const strength = passwordStrength(password)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await http.post<TokenPairResponse>('/auth/register', {
        email,
        password,
        full_name: fullName,
      })
      login({ access_token: data.access_token, refresh_token: data.refresh_token }, data.user)
      toast.success(data.user.is_superuser ? 'Admin account created' : 'Account created')
      router.push('/app')
    } catch (err) {
      const e = err as Error & { status?: number }
      setError(e.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ---------- Left: branded panel ---------- */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-card">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #14b8a6 1px, transparent 1px), linear-gradient(to bottom, #14b8a6 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Animated gradient orbs */}
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.08] blur-3xl"
          style={{ background: 'radial-gradient(circle, #14b8a6, transparent 70%)', animation: 'ansein-float 8s ease-in-out infinite' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.05] blur-3xl"
          style={{ background: 'radial-gradient(circle, #f59e0b, transparent 70%)', animation: 'ansein-float 10s ease-in-out infinite reverse' }}
        />

        <div className="relative flex flex-col justify-between p-12 w-full">
          {/* Brand */}
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ChevronLeft className="h-4 w-4" />
            Back to home
          </Link>

          {/* Center content */}
          <div className="flex flex-col items-start max-w-md">
            <BrandMark size={56} />
            <h1 className="mt-8 text-4xl font-semibold tracking-tight text-foreground leading-tight">
              Start extracting
              <br />
              <span className="ansein-gradient-text">threat intel.</span>
            </h1>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Create your workspace in seconds. No CLI, no infrastructure setup —
              just an email and password.
            </p>

            {/* Admin hint */}
            {!checking && isFirstAccount && (
              <div className="mt-6 flex items-start gap-2.5 p-3 rounded-md bg-teal-500/5 border border-teal-500/20 text-teal-300/90 text-xs w-full">
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  The first registered user is granted <strong>superuser</strong> privileges.
                  Subsequent registrations are standard analysts.
                </span>
              </div>
            )}

            {/* Highlights */}
            <div className="mt-8 grid grid-cols-2 gap-4 w-full">
              {HIGHLIGHTS.map((h) => {
                const Icon = h.icon
                return (
                  <div key={h.title} className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-card border border-border text-primary flex-shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{h.title}</p>
                      <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{h.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <p className="text-[10px] text-muted-foreground/50 ansein-mono">
            v3.0 · MySQL-ready · Open-source CTI/OSINT platform
          </p>
        </div>
      </div>

      {/* ---------- Right: form ---------- */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative">
        {/* Mobile back link */}
        <Link
          href="/"
          className="lg:hidden absolute top-6 left-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <p className="ansein-mono text-xs uppercase tracking-widest text-muted-foreground/50 mb-1">
              New workspace
            </p>
            <h2 className="text-2xl font-semibold text-foreground tracking-tight">
              Create your account
            </h2>
            <p className="text-sm text-muted-foreground mt-1 h-5">
              {!checking && isFirstAccount ? 'First account becomes the workspace administrator.' : ''}
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="full_name"
                className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5"
              >
                Full name <span className="text-muted-foreground/50 normal-case">(optional)</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="Alex Analyst"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="analyst@company.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              {/* Password strength meter */}
              {password && (
                <div className="mt-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all"
                        style={{
                          background: i <= strength.score ? strength.color : 'border',
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground/50">
                      Strength: <span style={{ color: strength.color }}>{strength.label}</span>
                    </span>
                    {strength.score >= 4 && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                        <Check className="h-2.5 w-2.5" />
                        Strong
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-primary hover:text-primary/90 font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
