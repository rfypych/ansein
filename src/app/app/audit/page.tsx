'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield,
  Activity,
  User as UserIcon,
  FolderSearch,
  Bot,
  Cpu,
  Lock,
  KeyRound,
  Filter,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FileText,
  Sparkles,
  Play,
  StickyNote,
  Star,
  AlertTriangle,
} from 'lucide-react'
import { http } from '@/lib/http'
import { useAuthStore } from '@/lib/auth-store'
import { Badge, EmptyState, Spinner } from '@/components/ansein/ui'
import { formatDate, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

interface AuditEntry {
  id: number
  user_id: number | null
  action: string
  target_type: string
  target_id: number | null
  ip_address: string
  extra_metadata: Record<string, unknown>
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
  { key: 'user', label: 'Account', match: /user\.|profile\./ },
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
  const [page, setPage] = useState(1)
  const [activeGroup, setActiveGroup] = useState('all')
  const pageSize = 25

  const query = useQuery({
    queryKey: ['audit', page, pageSize],
    queryFn: () => http.get<AuditPage>(`/audit?page=${page}&page_size=${pageSize}`),
  })

  if (!user?.is_superuser) {
    return (
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <EmptyState
          icon={<Shield className="h-6 w-6 text-rose-400" />}
          title="Administrator access required"
          description="The audit log is only visible to workspace administrators."
          className="py-16"
        />
      </div>
    )
  }

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
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">
          Security forensics
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)]">
          Audit log
        </h1>
        <p className="text-sm text-[var(--ansein-text-muted)] mt-1">
          Tamper-evident record of all security-relevant actions across the workspace.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile label="Total events" value={total} icon={<Activity className="h-3.5 w-3.5" />} color="#14b8a6" />
        <StatTile label="This page" value={items.length} icon={<Shield className="h-3.5 w-3.5" />} color="#f59e0b" />
        <StatTile label="Action types" value={Object.keys(actionBreakdown).length} icon={<Filter className="h-3.5 w-3.5" />} color="#a78bfa" />
        <StatTile label="Page" value={`${page}/${totalPages}`} icon={<Activity className="h-3.5 w-3.5" />} color="#06b6d4" />
      </div>

      {/* Action type breakdown */}
      {Object.keys(actionBreakdown).length > 0 && (
        <div className="ansein-card rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <Activity className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
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
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] uppercase tracking-wider text-[var(--ansein-text-muted)] ansein-mono">
                      {type}
                    </span>
                    <span className="text-xs font-semibold ansein-mono text-[var(--ansein-text)]">{count}</span>
                    <span className="text-[9px] text-[var(--ansein-text-dim)]">({pct}%)</span>
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
                ? 'bg-[var(--ansein-primary)] text-[var(--ansein-bg)] border-[var(--ansein-primary)]'
                : 'bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] border-[var(--ansein-border)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)]'
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
        <div className="ansein-card rounded-xl">
          <EmptyState
            icon={<Activity className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
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
        <div className="ansein-card rounded-xl overflow-hidden">
          {/* Timeline list */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-0 bottom-0 w-px bg-[var(--ansein-border)]" />

            <div className="divide-y divide-[var(--ansein-border)]">
              {items.map((e) => {
                const Icon = ACTION_ICONS[e.action] || Activity
                const color = getActionColor(e.action)
                const extraKeys = Object.keys(e.extra_metadata || {})
                return (
                  <div
                    key={e.id}
                    className="relative flex items-start gap-3 px-4 py-3 hover:bg-[var(--ansein-surface)]/40 transition-colors group"
                  >
                    {/* Timeline node */}
                    <div className="relative z-10 flex-shrink-0 mt-0.5">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[var(--ansein-bg)]"
                        style={{ borderColor: color, color }}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--ansein-text)]">
                            {getActionLabel(e.action)}
                          </span>
                          <span className="ansein-mono text-[10px] text-[var(--ansein-text-dim)]">
                            {e.action}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--ansein-text-dim)]">
                          <span className="ansein-mono">{formatRelative(e.created_at)}</span>
                          <span>·</span>
                          <span className="ansein-mono">{formatDate(e.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--ansein-text-muted)]">
                        {e.target_type && (
                          <span className="inline-flex items-center gap-1">
                            <span className="ansein-mono">{e.target_type}</span>
                            {e.target_id && <span className="text-[var(--ansein-text-dim)]">#{e.target_id}</span>}
                          </span>
                        )}
                        {e.ip_address && (
                          <span className="inline-flex items-center gap-1 ansein-mono">
                            <span className="text-[var(--ansein-text-dim)]">IP:</span>
                            {e.ip_address}
                          </span>
                        )}
                        {e.user_id && (
                          <span className="inline-flex items-center gap-1 ansein-mono">
                            <UserIcon className="h-2.5 w-2.5" />
                            user #{e.user_id}
                          </span>
                        )}
                      </div>
                      {extraKeys.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {extraKeys.slice(0, 4).map((k) => (
                            <span
                              key={k}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)] ansein-mono"
                            >
                              {k}={String(e.extra_metadata[k]).slice(0, 24)}
                            </span>
                          ))}
                          {extraKeys.length > 4 && (
                            <span className="text-[9px] text-[var(--ansein-text-dim)]">
                              +{extraKeys.length - 4} more
                            </span>
                          )}
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--ansein-border)]">
              <p className="text-xs text-[var(--ansein-text-dim)] ansein-mono">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-[var(--ansein-text-muted)] ansein-mono px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note */}
      <p className="mt-6 text-xs text-[var(--ansein-text-dim)] text-center">
        Audit entries are immutable and retained indefinitely. Contact your database administrator
        for archival policies.
      </p>
    </div>
  )
}

function StatTile({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <div className="ansein-card rounded-lg p-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-center gap-1.5 text-[var(--ansein-text-dim)] mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-lg font-semibold ansein-mono text-[var(--ansein-text)]">{value}</p>
    </div>
  )
}
