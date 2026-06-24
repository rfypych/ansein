'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { CaretLeft as ChevronLeft, CaretRight as ChevronRight, Copy as CopyPlus, Cpu, Crown, FileText, Folder as FolderSearch, Funnel as Filter, Key as KeyRound, LinkSimple as Link2, Lock, Note as StickyNote, Play, Robot as Bot, Shield, ShieldCheck, Sparkle as Sparkles, Star, User as UserIcon, UserMinus, UserPlus, Warning as AlertTriangle, Waveform } from '@phosphor-icons/react'
import { http } from '@/lib/http'
import { useAuthStore, authUserRole } from '@/lib/auth-store'
import { Badge, EmptyState, Spinner } from '@/components/ansein/ui'
import { formatDate, formatRelative } from '@/lib/format'
import { can } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AuditEntry {
  id: number
  user_id: number | null
  action: string
  target_type: string
  target_id: number | null
  ip_address: string
  extra_metadata: Record<string, unknown>
  prev_hash: string
  entry_hash: string
  created_at: string
}

interface AuditPage {
  items: AuditEntry[]
  total: number
  page: number
  page_size: number
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'user.password.change': Lock,
  'user.profile.update': UserIcon,
  'user.profile.view': UserIcon,
  'profile.view': UserIcon,
  'user.role.change': Crown,
  'user.activate': ShieldCheck,
  'user.deactivate': UserMinus,
  'user.create': UserPlus,
  'investigation.pipeline.complete': Cpu,
  'investigation.pipeline.start': Play,
  'investigation.pipeline.failed': AlertTriangle,
  'investigation.duplicate': CopyPlus,
  'investigation.create': FolderSearch,
  'investigation.delete': FolderSearch,
  'investigation.star': Star,
  'investigation.unstar': Star,
  'auth.login': KeyRound,
  'auth.register': KeyRound,
  'copilot.ask': Bot,
  'source.add': FileText,
  'source.upload': FileText,
  'source.delete': FileText,
  'analysis.view': Sparkles,
  'note.create': StickyNote,
  'note.delete': StickyNote,
  'note.update': StickyNote,
}

const ACTION_COLORS: Record<string, string> = {
  'user.password.change': '#f43f5e',
  'user.profile.update': '#06b6d4',
  'profile.view': '#06b6d4',
  'user.role.change': '#fb7185',
  'user.activate': '#10b981',
  'user.deactivate': '#ef4444',
  'user.create': '#8b5cf6',
  'investigation.pipeline.complete': '#10b981',
  'investigation.pipeline.start': '#f59e0b',
  'investigation.pipeline.failed': '#f43f5e',
  'investigation.duplicate': '#a78bfa',
  'investigation.create': '#14b8a6',
  'investigation.delete': '#f43f5e',
  'investigation.star': '#f59e0b',
  'investigation.unstar': '#64748b',
  'auth.login': '#f59e0b',
  'auth.register': '#f59e0b',
  'copilot.ask': '#8b5cf6',
  'source.add': '#0d9488',
  'source.upload': '#0d9488',
  'source.delete': '#f43f5e',
  'analysis.view': '#a78bfa',
  'note.create': '#06b6d4',
  'note.delete': '#f43f5e',
  'note.update': '#06b6d4',
}

const ACTION_GROUPS = [
  { key: 'all', label: 'All events' },
  { key: 'auth', label: 'Authentication', match: /auth\./ },
  { key: 'user', label: 'Account & Admin', match: /user\.|profile\./ },
  { key: 'investigation', label: 'Investigations', match: /investigation\.|source\.|analysis\./ },
  { key: 'note', label: 'Notes', match: /note\./ },
  { key: 'copilot', label: 'Copilot', match: /copilot\./ },
]

function getActionColor(action: string): string {
  for (const [key, color] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key) || action === key) return color
  }
  return '#64748b'
}

function getActionLabel(action: string): string {
  return action
    .split(/[._]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function AuditPage() {
  const user = useAuthStore((s) => s.user)
  const role = authUserRole(user)
  const isFullScope = role === 'editor' || role === 'admin'
  const canVerify = can(user, 'audit.verify_chain')
  const [page, setPage] = useState(1)
  const [activeGroup, setActiveGroup] = useState('all')
  const pageSize = 25

  const query = useQuery({
    queryKey: ['audit', page, pageSize],
    queryFn: () => http.get<AuditPage>(`/audit?page=${page}&page_size=${pageSize}`),
  })

  // Hash chain verification (POST /audit — runs verifyAuditChain on the most
  // recent sample of entries). Admin-only; hidden from editor/analyst UI.
  const [chainStatus, setChainStatus] = useState<
    | { valid: boolean; brokenAt: number | null; sampleSize: number; scannedAt: string }
    | null
  >(null)

  const verifyMutation = useMutation({
    mutationFn: () =>
      http.post<{
        valid: boolean
        brokenAt: number | null
        sample_size: number
      }>('/audit', {}),
    onSuccess: (data) => {
      setChainStatus({
        valid: data.valid,
        brokenAt: data.brokenAt,
        sampleSize: data.sample_size,
        scannedAt: new Date().toISOString(),
      })
      if (data.valid) {
        toast.success(`Chain intact — verified ${data.sample_size} entries`)
      } else {
        toast.error(`Chain broken at entry #${data.brokenAt}`)
      }
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Verification failed')
    },
  })

  // Analysts and editors always have at least their own scope, so we no
  // longer hard-block the page — we just render the appropriate copy.

  const allItems = query.data?.items || []
  const total = query.data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Client-side filter by group
  const group = ACTION_GROUPS.find((g) => g.key === activeGroup)
  const items = activeGroup === 'all' || !group?.match
    ? allItems
    : allItems.filter((i) => group.match!.test(i.action))

  // Compute action type breakdown for stats
  const actionBreakdown = allItems.reduce((acc, i) => {
    const prefix = i.action.split('.')[0]
    acc[prefix] = (acc[prefix] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="ansein-mono text-xs uppercase tracking-widest text-muted-foreground/50 mb-1">
            {isFullScope ? 'Security forensics' : 'Personal activity'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-3 flex-wrap">
            {isFullScope ? 'Audit log' : 'My activity'}
            <Badge color={isFullScope ? 'primary' : 'slate'} dot>
              {isFullScope ? 'Workspace scope' : 'Own scope'}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isFullScope
              ? 'Tamper-evident, hash-chained record of all security-relevant actions across the workspace.'
              : 'A hash-chained record of your own actions. Workspace-wide events are visible to editors and administrators.'}
          </p>
        </div>
        {/* Verify chain button — admin-only */}
        {canVerify && (
          <button
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border transition-colors flex-shrink-0',
              chainStatus?.valid === false
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25'
                : chainStatus?.valid === true
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/50',
            )}
            title="Recompute hashes for the most recent entries and verify the chain is intact"
          >
            {verifyMutation.isPending ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : chainStatus?.valid === false ? (
              <AlertTriangle weight="duotone" className="h-3.5 w-3.5" />
            ) : chainStatus?.valid === true ? (
              <ShieldCheck weight="duotone" className="h-3.5 w-3.5" />
            ) : (
              <Link2 weight="duotone" className="h-3.5 w-3.5" />
            )}
            {verifyMutation.isPending
              ? 'Verifying…'
              : chainStatus?.valid === false
                ? `Chain broken at #${chainStatus.brokenAt}`
                : chainStatus?.valid === true
                  ? `Chain intact (${chainStatus.sampleSize} checked)`
                  : 'Verify chain'}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Total events" value={total} icon={<Waveform weight="duotone" className="h-3.5 w-3.5" />} color="#14b8a6" />
        <StatTile label="This page" value={items.length} icon={<Shield weight="duotone" className="h-3.5 w-3.5" />} color="#f59e0b" />
        <StatTile label="Action types" value={Object.keys(actionBreakdown).length} icon={<Filter weight="duotone" className="h-3.5 w-3.5" />} color="#a78bfa" />
        <StatTile label="Page" value={`${page}/${totalPages}`} icon={<Waveform weight="duotone" className="h-3.5 w-3.5" />} color="#06b6d4" />
      </div>

      {/* Action type breakdown */}
      {Object.keys(actionBreakdown).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 border border-primary/30">
              <Waveform weight="duotone" className="h-3.5 w-3.5 text-primary" />
            </div>
            Action breakdown
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(actionBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const pct = Math.round((count / allItems.length) * 100)
                const color = getActionColor(`${type}.`)
                return (
                  <div
                    key={type}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-card border border-border"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground ansein-mono">
                      {type}
                    </span>
                    <span className="text-xs font-semibold ansein-mono text-foreground">{count}</span>
                    <span className="text-[9px] text-muted-foreground/50">({pct}%)</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Group filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ACTION_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setActiveGroup(g.key)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
              activeGroup === g.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/50'
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Timeline view */}
      {query.isLoading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState
            icon={<Waveform weight="duotone" className="h-6 w-6 text-muted-foreground/50" />}
            title={activeGroup === 'all' ? 'No audit events yet' : 'No matching events'}
            description={
              activeGroup === 'all'
                ? 'Audit events appear here as users interact with the workspace.'
                : 'Try selecting a different filter.'
            }
            className="py-12"
          />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Timeline list */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-0 bottom-0 w-px bg-[border]" />

            <div className="divide-y divide-border">
              {items.map((e) => {
                const Icon = ACTION_ICONS[e.action] || Activity
                const color = getActionColor(e.action)
                const extraKeys = Object.keys(e.extra_metadata || {})
                return (
                  <div
                    key={e.id}
                    className="relative flex items-start gap-3 px-4 py-3 hover:bg-card/40 transition-colors group"
                  >
                    {/* Timeline node */}
                    <div className="relative z-10 flex-shrink-0 mt-0.5">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-background"
                        style={{ borderColor: color, color }}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {getActionLabel(e.action)}
                          </span>
                          <span className="ansein-mono text-[10px] text-muted-foreground/50">
                            {e.action}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                          <span className="ansein-mono">{formatRelative(e.created_at)}</span>
                          <span>·</span>
                          <span className="ansein-mono">{formatDate(e.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        {e.target_type && (
                          <span className="inline-flex items-center gap-1">
                            <span className="ansein-mono">{e.target_type}</span>
                            {e.target_id && <span className="text-muted-foreground/50">#{e.target_id}</span>}
                          </span>
                        )}
                        {e.ip_address && (
                          <span className="inline-flex items-center gap-1 ansein-mono">
                            <span className="text-muted-foreground/50">IP:</span>
                            {e.ip_address}
                          </span>
                        )}
                        {e.user_id && (
                          <span className="inline-flex items-center gap-1 ansein-mono">
                            <UserIcon weight="duotone" className="h-2.5 w-2.5" />
                            user #{e.user_id}
                          </span>
                        )}
                      </div>
                      {extraKeys.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {extraKeys.slice(0, 4).map((k) => (
                            <span
                              key={k}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground/50 ansein-mono"
                            >
                              {k}={String(e.extra_metadata[k]).slice(0, 24)}
                            </span>
                          ))}
                          {extraKeys.length > 4 && (
                            <span className="text-[9px] text-muted-foreground/50">
                              +{extraKeys.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                      {/* Hash-chain fingerprint — abbreviated SHA-256 entry hash */}
                      {e.entry_hash && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-primary/8 border border-primary/25 text-primary ansein-mono"
                            title={`prev: ${e.prev_hash || '(genesis)'}\nhash: ${e.entry_hash}`}
                          >
                            <Link2 weight="duotone" className="h-2 w-2" />
                            {e.prev_hash ? '↳' : '◇'} {e.entry_hash.slice(0, 12)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground/50 ansein-mono">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft weight="duotone" className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground ansein-mono px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight weight="duotone" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note */}
      <p className="mt-6 text-xs text-muted-foreground/50 text-center">
        Audit entries are immutable, hash-chained, and retained indefinitely. Each row's
        <span className="ansein-mono text-primary"> entry_hash</span> depends on the
        previous row's hash, making historical tampering detectable.
      </p>
    </div>
  )
}

function StatTile({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-center gap-1.5 text-muted-foreground/50 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-lg font-semibold ansein-mono text-foreground">{value}</p>
    </div>
  )
}
