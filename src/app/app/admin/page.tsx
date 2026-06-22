'use client'

import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield,
  Users,
  Crown,
  Pencil,
  Activity,
  Search,
  UserPlus,
  UserMinus,
  Check,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  FolderSearch,
  Bot,
  Cpu,
  Workflow,
  ShieldAlert,
  Mail,
  KeyRound,
  Lock,
  Settings,
  ShieldCheck,
  ChevronDown,
  X,
} from 'lucide-react'
import { http } from '@/lib/http'
import { useAuthStore, type AuthUser, authUserRole, type Role } from '@/lib/auth-store'
import { Badge, Spinner, AnimatedNumber, EmptyState, DonutChart } from '@/components/ansein/ui'
import { formatDate } from '@/lib/format'
import { ROLE_DESCRIPTIONS, ROLE_COLORS, type Role as RbacRole } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ============================================ Types */

interface UserRow {
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
    audit_events: number
  }
}

interface UsersList {
  items: UserRow[]
  total: number
}

const ROLE_OPTIONS: Array<{ value: Role; label: string; description: string }> = [
  { value: 'analyst', label: 'Analyst', description: 'Own data only — view, create, run pipelines, copilot' },
  { value: 'editor', label: 'Editor', description: 'Any investigation, tags, all export formats' },
  { value: 'admin', label: 'Admin', description: 'Full workspace control — users, settings, playbooks, audit' },
]

/* ============================================ Admin Page */

export default function AdminPage() {
  const authUser = useAuthStore((s) => s.user)
  const role = authUserRole(authUser)
  const isAdmin = role === 'admin'

  if (!isAdmin) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <div className="ansein-card rounded-xl">
          <EmptyState
            icon={<Shield className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
            title="Administrator access required"
            description="This page is only visible to workspace administrators."
            className="py-16"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">
          Administration
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)] flex items-center gap-3">
          Admin console
          <Badge color="danger" dot>Admin</Badge>
        </h1>
        <p className="text-sm text-[var(--ansein-text-muted)] mt-1">
          Manage users, roles, and monitor workspace health.
        </p>
      </div>

      {/* System Overview */}
      <SystemOverview />

      {/* User Management */}
      <UserManagementSection />
    </div>
  )
}

/* ============================================ System Overview */

function SystemOverview() {
  const authUser = useAuthStore((s) => s.user)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => http.get<UsersList>('/users'),
  })

  const users = usersQuery.data?.items || []
  const total = usersQuery.data?.total || 0
  const active = users.filter((u) => u.is_active).length
  const inactive = total - active

  const roleCounts: Record<Role, number> = { analyst: 0, editor: 0, admin: 0 }
  for (const u of users) {
    const r: Role = (u.role || (u.is_superuser ? 'admin' : 'analyst')) as Role
    roleCounts[r] = (roleCounts[r] || 0) + 1
  }

  const totalInvestigations = users.reduce((s, u) => s + u.stats.investigations, 0)
  const totalCopilot = users.reduce((s, u) => s + u.stats.copilot_sessions, 0)
  const totalAudit = users.reduce((s, u) => s + u.stats.audit_events, 0)

  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Users"
          value={total}
          color="#f43f5e"
          sub={`${active} active · ${inactive} inactive`}
        />
        <StatCard
          icon={<FolderSearch className="h-4 w-4" />}
          label="Investigations"
          value={totalInvestigations}
          color="#14b8a6"
          sub="Across all users"
        />
        <StatCard
          icon={<Bot className="h-4 w-4" />}
          label="Copilot chats"
          value={totalCopilot}
          color="#8b5cf6"
          sub="Total sessions"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Audit events"
          value={totalAudit}
          color="#f59e0b"
          sub="Hash-chained log"
        />
      </div>

      {/* Role distribution */}
      <div className="ansein-card rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/15 border border-rose-500/30">
            <Shield className="h-3.5 w-3.5 text-rose-400" />
          </div>
          Role distribution
        </h3>
        <div className="flex items-center gap-8">
          <DonutChart
            data={[
              { label: 'Analyst', value: roleCounts.analyst, color: '#2dd4bf' },
              { label: 'Editor', value: roleCounts.editor, color: '#fbbf24' },
              { label: 'Admin', value: roleCounts.admin, color: '#fb7185' },
            ]}
            size={120}
            strokeWidth={16}
            centerLabel={String(total)}
            centerSublabel="USERS"
          />
          <div className="flex-1 space-y-3">
            {ROLE_OPTIONS.map((opt) => {
              const count = roleCounts[opt.value]
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const colors = ROLE_COLORS[opt.value as RbacRole]
              return (
                <div key={opt.value} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border capitalize w-20 justify-center',
                      colors.bg,
                      colors.fg,
                      colors.border
                    )}
                  >
                    {opt.value === 'admin' ? <Crown className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                    {opt.value}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--ansein-border)]">
                    <div
                      className={cn('h-full rounded-full transition-all', colors.dot)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs ansein-mono text-[var(--ansein-text-muted)] w-10 text-right">
                    {count} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================ User Management Section */

function UserManagementSection() {
  const qc = useQueryClient()
  const authUser = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [pendingRoleFor, setPendingRoleFor] = useState<number | null>(null)
  const [pendingStatusFor, setPendingStatusFor] = useState<number | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => http.get<UsersList>('/users'),
  })

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) =>
      http.patch<{
        id: number
        role: Role
        previous_role: Role
        changed: boolean
      }>(`/users/${id}/role`, { role }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
      if (data.changed) {
        if (authUser?.id === vars.id) {
          if (authUser) {
            useAuthStore.getState().setUser({
              ...authUser,
              role: vars.role,
              is_superuser: vars.role === 'admin',
            })
          }
          toast.success(`Your role is now ${vars.role}`)
        } else {
          toast.success(`Role updated — ${vars.role}`)
        }
      } else {
        toast.info('No change — that user already had this role')
      }
      setPendingRoleFor(null)
    },
    onError: (err) => {
      const e = err as Error & { status?: number; code?: string }
      toast.error(e.message || 'Failed to update role')
      setPendingRoleFor(null)
    },
  })

  const changeStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      http.patch<{
        id: number
        is_active: boolean
        role: Role
        changed: boolean
      }>(`/users/${id}/status`, { is_active }),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      if (data.changed) {
        toast.success(vars.is_active ? 'User activated' : 'User deactivated')
      } else {
        toast.info('No change — user already had this status')
      }
      setPendingStatusFor(null)
    },
    onError: (err) => {
      const e = err as Error & { status?: number; code?: string }
      if (e.code === 'self_deactivate') {
        toast.error('You cannot deactivate your own account')
      } else {
        toast.error(e.message || 'Failed to update status')
      }
      setPendingStatusFor(null)
    },
  })

  const users = usersQuery.data?.items || []
  const total = usersQuery.data?.total || 0

  // Filter by search
  const filtered = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase()
        return (
          u.email.toLowerCase().includes(q) ||
          u.full_name.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
        )
      })
    : users

  const roleCounts: Record<Role, number> = { analyst: 0, editor: 0, admin: 0 }
  for (const u of users) {
    const r: Role = (u.role || (u.is_superuser ? 'admin' : 'analyst')) as Role
    roleCounts[r] = (roleCounts[r] || 0) + 1
  }

  return (
    <div className="ansein-card rounded-xl p-6">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--ansein-primary)]" />
            User Management
          </h3>
          <p className="text-xs text-[var(--ansein-text-muted)] mt-0.5">
            Manage workspace users and roles. {total} user{total === 1 ? '' : 's'} total ·{' '}
            <span className="text-rose-300">{roleCounts.admin} admin</span> ·{' '}
            <span className="text-amber-300">{roleCounts.editor} editor{roleCounts.editor === 1 ? '' : 's'}</span> ·{' '}
            <span className="text-teal-300">{roleCounts.analyst} analyst{roleCounts.analyst === 1 ? '' : 's'}</span>
          </p>
        </div>
        <button
          onClick={() => setShowCreateUser(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-xs font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors whitespace-nowrap"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Create user
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or role…"
          className="w-full pl-9 pr-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* User list */}
      {usersQuery.isLoading ? (
        <div className="py-6 flex justify-center">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
          title={search ? 'No users match your search' : 'No users found'}
          description={search ? 'Try a different search term.' : 'Create a user to get started.'}
          className="py-10"
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const uRole: Role = (u.role || (u.is_superuser ? 'admin' : 'analyst')) as Role
            const uColors = ROLE_COLORS[uRole as RbacRole]
            const isSelf = authUser?.id === u.id
            const isRolePending = pendingRoleFor === u.id
            const isStatusPending = pendingStatusFor === u.id
            return (
              <div
                key={u.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-md border transition-colors',
                  u.is_active
                    ? 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] hover:border-[var(--ansein-border-strong)]'
                    : 'bg-[var(--ansein-surface)]/50 border-[var(--ansein-border)] opacity-70'
                )}
              >
                {/* Avatar */}
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-semibold flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, hsl(${(u.id * 47) % 360}, 70%, 45%) 0%, hsl(${(u.id * 47 + 60) % 360}, 70%, 35%) 100%)`,
                  }}
                >
                  {(u.full_name || u.email)[0]?.toUpperCase() || '?'}
                </div>

                {/* Identity + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[var(--ansein-text)] truncate">
                      {u.full_name || 'Analyst'}
                    </p>
                    {isSelf && (
                      <Badge color="primary" dot>
                        You
                      </Badge>
                    )}
                    {!u.is_active && <Badge color="danger">Inactive</Badge>}
                  </div>
                  <p className="text-[11px] text-[var(--ansein-text-dim)] ansein-mono truncate">{u.email}</p>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-[var(--ansein-text-dim)]">
                    <span>{u.stats.investigations} inv.</span>
                    <span>{u.stats.copilot_sessions} chats</span>
                    <span>{u.stats.audit_events} events</span>
                    {u.last_login_at && (
                      <span className="hidden sm:inline">
                        last login {formatDate(u.last_login_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role selector */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="flex rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-bg)] overflow-hidden">
                    {ROLE_OPTIONS.map((opt) => {
                      const active = uRole === opt.value
                      const colors = ROLE_COLORS[opt.value as RbacRole]
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            if (uRole !== opt.value) {
                              setPendingRoleFor(u.id)
                              changeRoleMutation.mutate({ id: u.id, role: opt.value })
                            }
                          }}
                          disabled={isRolePending || isSelf}
                          title={isSelf ? 'You cannot change your own role' : opt.description}
                          className={cn(
                            'px-2.5 py-1.5 text-[11px] font-medium border-0 transition-colors capitalize',
                            active
                              ? cn(colors.bg, colors.fg)
                              : 'bg-transparent text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:bg-[var(--ansein-surface)]',
                            (isRolePending || isSelf) && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {opt.value}
                        </button>
                      )
                    })}
                  </div>
                  {isRolePending && <Spinner className="h-3.5 w-3.5" />}
                </div>

                {/* Activate/deactivate toggle */}
                <button
                  onClick={() => {
                    setPendingStatusFor(u.id)
                    changeStatusMutation.mutate({ id: u.id, is_active: !u.is_active })
                  }}
                  disabled={isStatusPending || isSelf}
                  title={
                    isSelf
                      ? 'You cannot deactivate your own account'
                      : u.is_active
                      ? 'Deactivate user'
                      : 'Activate user'
                  }
                  className={cn(
                    'inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors flex-shrink-0',
                    u.is_active
                      ? 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20',
                    (isStatusPending || isSelf) && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {isStatusPending ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : u.is_active ? (
                    <UserMinus className="h-3.5 w-3.5" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="mt-4 pt-4 border-t border-[var(--ansein-border)] flex items-start gap-2.5">
        <AlertCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-[var(--ansein-text-muted)] leading-relaxed">
          Role changes take effect immediately for new API requests. The user&apos;s current access
          token remains valid until it expires. Deactivated users cannot log in. You cannot deactivate
          your own account.
        </p>
      </div>

      {/* Create user modal */}
      {showCreateUser && (
        <CreateUserModal onClose={() => setShowCreateUser(false)} />
      )}
    </div>
  )
}

/* ============================================ Create User Modal */

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role>('analyst')

  const createUserMutation = useMutation({
    mutationFn: (data: { email: string; password: string; full_name: string; role: Role }) =>
      http.post<{
        id: number
        email: string
        full_name: string
        is_active: boolean
        role: Role
        created_at: string
      }>('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('User created successfully')
      onClose()
    },
    onError: (err) => {
      const e = err as Error & { status?: number; code?: string }
      if (e.code === 'conflict') {
        toast.error('Email already registered')
      } else {
        toast.error(e.message || 'Failed to create user')
      }
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    createUserMutation.mutate({
      email: email.trim().toLowerCase(),
      password,
      full_name: fullName.trim(),
      role: selectedRole,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 ansein-card rounded-xl p-6 border border-[var(--ansein-border)] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-base font-semibold text-[var(--ansein-text)] mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[var(--ansein-primary)]" />
          Create new user
        </h3>
        <p className="text-xs text-[var(--ansein-text-muted)] mb-5">
          Provision a new account directly. The user can change their password after first login.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
                placeholder="analyst@company.com"
                autoFocus
              />
            </div>
          </div>

          {/* Full name */}
          <div>
            <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
              Full name <span className="text-[var(--ansein-text-dim)] normal-case">(optional)</span>
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
                placeholder="Jane Analyst"
                maxLength={120}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
              Temporary password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full pl-9 pr-10 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)]"
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {password && (
              <div className="mt-1.5 flex items-center gap-1">
                {[0, 1, 2, 3].map((i) => {
                  const strength = passwordStrength(password)
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
                  {['weak', 'fair', 'good', 'strong'][passwordStrength(password) - 1] || 'weak'}
                </span>
              </div>
            )}
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-2">
              Role
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((opt) => {
                const colors = ROLE_COLORS[opt.value as RbacRole]
                const active = selectedRole === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedRole(opt.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 px-3 py-2.5 rounded-md border text-center transition-all',
                      active
                        ? cn(colors.bg, colors.fg, colors.border)
                        : 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)]'
                    )}
                  >
                    <span className="text-xs font-medium capitalize">{opt.label}</span>
                    <span className="text-[9px] leading-tight text-[var(--ansein-text-dim)]">{opt.description.split('—')[1]?.trim() || opt.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={createUserMutation.isPending || !email.trim() || password.length < 8}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {createUserMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Create user
          </button>
        </form>
      </div>
    </div>
  )
}

/* ============================================ Stat Card */

function StatCard({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
  sub?: string
}) {
  return (
    <div className="ansein-card rounded-lg p-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-center gap-1.5 text-[var(--ansein-text-dim)] mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-lg font-semibold ansein-mono text-[var(--ansein-text)]">
        <AnimatedNumber value={value} />
      </p>
      {sub && <p className="text-[9px] text-[var(--ansein-text-dim)] mt-0.5">{sub}</p>}
    </div>
  )
}

/* ============================================ Password Strength */

function passwordStrength(pw: string): number {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++
  return Math.max(1, Math.min(4, score))
}
