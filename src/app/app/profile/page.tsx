'use client'

import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  Loader2,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  Save,
  FolderSearch,
  Bot,
  Calendar,
  Crown,
  Shield,
} from 'lucide-react'
import { http } from '@/lib/http'
import { useAuthStore, type AuthUser, authUserRole, type Role } from '@/lib/auth-store'
import { Badge, Spinner, AnimatedNumber } from '@/components/ansein/ui'
import { formatDate } from '@/lib/format'
import { ROLE_DESCRIPTIONS, ROLE_COLORS, type Role as RbacRole } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ProfileData {
  id: number
  email: string
  full_name: string
  is_active: boolean
  is_superuser: boolean
  role: Role
  created_at: string
  last_login_at: string | null
  stats: {
    investigations: number
    copilot_sessions: number
  }
}

export default function ProfilePage() {
  const qc = useQueryClient()
  const setUser = useAuthStore((s) => s.setUser)
  const authUser = useAuthStore((s) => s.user)
  const role = authUserRole(authUser)
  const [fullName, setFullName] = useState('')
  const [fullNameLoaded, setFullNameLoaded] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => http.get<ProfileData>('/users/me'),
  })

  // Initialise full_name field once data loads (render-phase state update — React 19 pattern)
  if (!fullNameLoaded && profileQuery.data) {
    setFullName(profileQuery.data.full_name)
    setFullNameLoaded(true)
  }

  const updateProfileMutation = useMutation({
    mutationFn: (data: { full_name: string }) =>
      http.patch<{ full_name: string; email: string }>('/users/me/profile', data),
    onSuccess: (data) => {
      // Also update the auth store so the sidebar reflects the new name
      const current = useAuthStore.getState().user
      if (current) {
        const updated: AuthUser = {
          ...current,
          full_name: data.full_name,
        }
        setUser(updated)
      }
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['me'] })
      toast.success('Profile updated')
    },
  })

  const changePwMutation = useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      http.post('/users/me/password', data),
    onSuccess: () => {
      setCurrentPw('')
      setNewPw('')
      toast.success('Password changed')
    },
    onError: (err) => {
      const e = err as Error & { status?: number; code?: string }
      if (e.code === 'invalid_credentials') {
        toast.error('Current password is incorrect')
      } else if (e.code === 'same_password') {
        toast.error('New password must differ from current')
      } else {
        toast.error(e.message || 'Failed to change password')
      }
    },
  })

  function handleUpdateProfile(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('Full name cannot be empty')
      return
    }
    updateProfileMutation.mutate({ full_name: fullName.trim() })
  }

  function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPw.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    changePwMutation.mutate({ current_password: currentPw, new_password: newPw })
  }

  if (profileQuery.isLoading) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const p = profileQuery.data
  if (!p) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <div className="ansein-card rounded-xl p-8 text-center text-[var(--ansein-text-muted)]">
          Could not load profile.
        </div>
      </div>
    )
  }

  const displayRole: Role = (p.role || (p.is_superuser ? 'admin' : 'analyst')) as Role
  const roleColors = ROLE_COLORS[displayRole as RbacRole]

  const initials = (p.full_name || p.email)[0]?.toUpperCase() || 'A'

  // Compute account age
  const accountAge = (() => {
    const created = new Date(p.created_at)
    const now = new Date()
    const diffMs = now.getTime() - created.getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    if (hours < 1) return 'less than an hour'
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''}`
    if (days < 30) return `${days} day${days > 1 ? 's' : ''}`
    if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''}`
    return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''}`
  })()

  // Generate a deterministic gradient from the user's email
  const avatarGradient = (() => {
    const hash = (p.email || 'default').split('').reduce((s, c) => s + c.charCodeAt(0), 0)
    const hue1 = hash % 360
    const hue2 = (hue1 + 60) % 360
    return `linear-gradient(135deg, hsl(${hue1}, 70%, 45%) 0%, hsl(${hue2}, 70%, 35%) 100%)`
  })()

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">
          Account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)]">
          Profile
        </h1>
        <p className="text-sm text-[var(--ansein-text-muted)] mt-1">
          Manage your account details and security settings.
        </p>
      </div>

      {/* Identity card */}
      <div className="ansein-card rounded-xl p-6 mb-6 relative overflow-hidden">
        {/* Decorative gradient banner */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: avatarGradient }}
        />
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-white text-xl font-semibold flex-shrink-0 ring-2 ring-[var(--ansein-bg)] shadow-lg"
            style={{ background: avatarGradient }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-[var(--ansein-text)]">
                {p.full_name || 'Analyst'}
              </h2>
              {/* Role badge — RBAC */}
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border capitalize',
                  roleColors.bg,
                  roleColors.fg,
                  roleColors.border
                )}
                title={ROLE_DESCRIPTIONS[displayRole as RbacRole]}
              >
                {displayRole === 'admin' ? <Crown className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                {displayRole}
              </span>
              {!p.is_active && <Badge color="danger">Inactive</Badge>}
            </div>
            <p className="text-sm text-[var(--ansein-text-muted)] mt-0.5 ansein-mono">{p.email}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--ansein-text-dim)]">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Joined {formatDate(p.created_at)}
              </span>
              {p.last_login_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Last login {formatDate(p.last_login_at)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)]">
                <Calendar className="h-2.5 w-2.5" />
                Member for {accountAge}
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-[var(--ansein-border)]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10 border border-teal-500/20 text-[var(--ansein-primary)]">
              <FolderSearch className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold ansein-mono text-[var(--ansein-text)]">
                <AnimatedNumber value={p.stats.investigations} />
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                Investigations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xl font-semibold ansein-mono text-[var(--ansein-text)]">
                <AnimatedNumber value={p.stats.copilot_sessions} />
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                Copilot chats
              </p>
            </div>
          </div>
        </div>

        {/* Role description row */}
        <div className="mt-4 pt-4 border-t border-[var(--ansein-border)] flex items-start gap-2.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--ansein-primary)] flex-shrink-0 mt-0.5" />
          <div className="text-xs text-[var(--ansein-text-muted)] leading-relaxed">
            <span className="font-medium text-[var(--ansein-text)] capitalize">{displayRole}</span>
            <span className="text-[var(--ansein-text-dim)]"> · </span>
            <span>{ROLE_DESCRIPTIONS[displayRole as RbacRole]}</span>
            {displayRole === 'admin' && (
              <>
                {' · '}
                <Link href="/app/admin" className="text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)] underline underline-offset-2">
                  Admin console →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Update profile */}
      <form onSubmit={handleUpdateProfile} className="ansein-card rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-1 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-[var(--ansein-primary)]" />
          Display name
        </h3>
        <p className="text-xs text-[var(--ansein-text-muted)] mb-4">
          Your name appears in the sidebar and on shared reports.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
              placeholder="Your full name"
              maxLength={120}
            />
          </div>
          <button
            type="submit"
            disabled={updateProfileMutation.isPending || !fullName.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {updateProfileMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </button>
        </div>

        {/* Email (read-only) */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
            Email <span className="text-[var(--ansein-text-dim)] normal-case">(read-only)</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
            <input
              type="email"
              readOnly
              value={p.email}
              className="w-full pl-9 pr-3 py-2 rounded-md bg-[var(--ansein-surface)]/50 border border-[var(--ansein-border)] text-sm text-[var(--ansein-text-muted)] ansein-mono cursor-not-allowed"
            />
          </div>
          <p className="text-[10px] text-[var(--ansein-text-dim)] mt-1">
            Email changes require administrator assistance.
          </p>
        </div>
      </form>

      {/* Change password */}
      <form onSubmit={handleChangePassword} className="ansein-card rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-1 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[var(--ansein-primary)]" />
          Change password
        </h3>
        <p className="text-xs text-[var(--ansein-text-muted)] mb-4">
          Use at least 8 characters. Avoid common patterns.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
              Current password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)]"
              >
                {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full pl-9 pr-10 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)]"
              >
                {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {newPw && (
              <div className="mt-1.5 flex items-center gap-1">
                {[0, 1, 2, 3].map((i) => {
                  const strength = passwordStrength(newPw)
                  const filled = i < strength
                  return (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-colors"
                      style={{
                        background: filled
                          ? strength <= 1
                            ? '#f43f5e'
                            : strength === 2
                            ? '#f59e0b'
                            : strength === 3
                            ? '#facc15'
                            : '#10b981'
                          : 'var(--ansein-border)',
                      }}
                    />
                  )
                })}
                <span className="text-[10px] ansein-mono text-[var(--ansein-text-dim)] ml-2 w-16">
                  {['weak', 'fair', 'good', 'strong'][passwordStrength(newPw) - 1] || 'weak'}
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={changePwMutation.isPending || !currentPw || !newPw}
          className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {changePwMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Update password
        </button>
      </form>

      {/* Security note */}
      <div className="mt-6 p-4 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--ansein-text-muted)] leading-relaxed">
          Passwords are hashed with bcrypt (12 rounds) and never stored in plaintext. After changing
          your password, your other sessions remain valid until their access tokens expire.
        </p>
      </div>
    </div>
  )
}

function passwordStrength(pw: string): number {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++
  return Math.max(1, Math.min(4, score))
}
