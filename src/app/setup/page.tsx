'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Database,
  UserCog,
  Loader2,
  AlertCircle,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { Brand } from '@/components/ansein/brand'
import { http } from '@/lib/http'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'
import { toast } from 'sonner'

interface SetupStatus {
  setup_required: boolean
  database_configured: boolean
  database_connected: boolean
  admin_exists: boolean
  app_env: string
}

interface TokenPairResponse {
  access_token: string
  refresh_token: string
  user: AuthUser
}

type Step = 'loading' | 'admin' | 'done'

export default function SetupWizardPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [step, setStep] = useState<Step>('loading')
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Poll setup status on mount
  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const s = await http.get<SetupStatus>('/setup/status')
        if (cancelled) return
        setStatus(s)
        if (!s.setup_required) {
          router.replace('/login')
          return
        }
        // Database is configured via env — skip directly to admin creation
        setStep('admin')
      } catch {
        if (cancelled) return
        setTimeout(check, 1500)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [router])

  async function handleCreateAdmin(e: React.FormEvent) {
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
      // Mark setup complete (best-effort)
      try {
        await http.post('/setup/complete')
      } catch {
        // ignore
      }
      setStep('done')
      toast.success('Administrator account created')
      setTimeout(() => router.push('/app'), 1500)
    } catch (err) {
      const e = err as Error
      setError(e.message || 'Failed to create admin account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Brand size={40} />
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <StepDot
            label="Database"
            state={
              step === 'loading'
                ? status?.database_connected
                  ? 'done'
                  : 'pending'
                : 'done'
            }
          />
          <Connector />
          <StepDot
            label="Admin"
            state={
              step === 'loading' ? 'pending' : step === 'admin' ? 'active' : 'done'
            }
          />
          <Connector />
          <StepDot label="Done" state={step === 'done' ? 'active' : 'pending'} />
        </div>

        {/* Loading step */}
        {step === 'loading' && (
          <div className="ansein-card rounded-xl p-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto text-[var(--ansein-primary)] animate-spin mb-4" />
            <p className="text-sm text-[var(--ansein-text-muted)]">
              Checking system status…
            </p>
          </div>
        )}

        {/* Admin step */}
        {step === 'admin' && (
          <div className="ansein-card rounded-xl p-7">
            <div className="flex items-start gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/30 text-[var(--ansein-primary)]">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--ansein-text)]">
                  Create administrator account
                </h2>
                <p className="text-sm text-[var(--ansein-text-muted)] mt-0.5">
                  The first user becomes the workspace superuser.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] transition-colors"
                  placeholder="Alex Analyst"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] transition-colors"
                  placeholder="admin@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] transition-colors"
                  placeholder="At least 8 characters"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating admin…
                  </>
                ) : (
                  'Create admin & sign in'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Done step */}
        {step === 'done' && (
          <div className="ansein-card rounded-xl p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-[var(--ansein-text)]">
              Setup complete
            </h2>
            <p className="text-sm text-[var(--ansein-text-muted)] mt-1.5">
              Redirecting you to your workspace…
            </p>
            <div className="flex justify-center mt-5">
              <Loader2 className="h-4 w-4 text-[var(--ansein-primary)] animate-spin" />
            </div>
          </div>
        )}

        {/* Status info card */}
        {status && step !== 'done' && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            <StatusTile
              icon={<Database className="h-3.5 w-3.5" />}
              label="Database"
              ok={status.database_connected}
            />
            <StatusTile
              icon={<Server className="h-3.5 w-3.5" />}
              label="API"
              ok={true}
            />
            <StatusTile
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Admin"
              ok={status.admin_exists}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function StepDot({ label, state }: { label: string; state: 'pending' | 'active' | 'done' }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={
          'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border ' +
          (state === 'done'
            ? 'bg-[var(--ansein-primary)] border-[var(--ansein-primary)] text-[var(--ansein-bg)]'
            : state === 'active'
            ? 'bg-[var(--ansein-surface-2)] border-[var(--ansein-primary)] text-[var(--ansein-primary)]'
            : 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] text-[var(--ansein-text-dim)]')
        }
      >
        {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : label[0]}
      </div>
      <span
        className={
          'text-[10px] uppercase tracking-wider ansein-mono ' +
          (state === 'pending'
            ? 'text-[var(--ansein-text-dim)]'
            : 'text-[var(--ansein-text-muted)]')
        }
      >
        {label}
      </span>
    </div>
  )
}

function Connector() {
  return <div className="h-px w-8 bg-[var(--ansein-border-strong)] mt-3.5" />
}

function StatusTile({ icon, label, ok }: { icon: React.ReactNode; label: string; ok: boolean }) {
  return (
    <div
      className={
        'flex items-center gap-1.5 px-2.5 py-2 rounded-md border text-[11px] ' +
        (ok
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
          : 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] text-[var(--ansein-text-dim)]')
      }
    >
      {icon}
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  )
}
