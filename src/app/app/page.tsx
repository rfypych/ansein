'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  FolderSearch,
  Activity,
  Bot,
  KeyRound,
  ArrowRight,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Eye,
  FileText,
  Play,
  CopyPlus,
  User,
  ShieldCheck,
  Star,
  Target,
  Network,
} from 'lucide-react'
import { http } from '@/lib/http'
import { useAuthStore } from '@/lib/auth-store'
import { Badge, EmptyState, SeverityMeter, Spinner, AnimatedNumber, ProgressRing, Sparkline, DonutChart } from '@/components/ansein/ui'
import { DashboardSkeleton } from '@/components/ansein/skeletons'
import { statusColor, formatRelative, severityColor, ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS } from '@/lib/format'
import { cn } from '@/lib/utils'

interface InvestigationItem {
  id: number
  title: string
  description: string
  status: string
  severity_score: number
  tags: string[]
  is_starred: boolean
  created_at: string
  updated_at: string
  source_count: number
  entity_count: number
  relationship_count: number
}

interface InvestigationList {
  items: InvestigationItem[]
  total: number
}

interface UserSettings {
  has_openai: boolean
  has_groq: boolean
  has_virustotal: boolean
  has_abuseipdb: boolean
  has_shodan: boolean
  preferred_llm: string
}

type ChatSessionList = Array<{
  id: number
  title: string
  updated_at: string
}>

interface AuditEntry {
  id: number
  action: string
  target: string
  ip: string
  meta: string
  created_at: string
}

interface AuditList {
  items: AuditEntry[]
  total: number
}

interface StatsOverview {
  entity_types: Array<{ type: string; count: number }>
  top_entities: Array<{ value: string; type: string; count: number }>
  total_entities: number
  total_relationships: number
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const investigations = useQuery({
    queryKey: ['investigations', 'recent'],
    queryFn: () => http.get<InvestigationList>('/investigations?page=1&page_size=5'),
    refetchInterval: 30_000,
  })
  const allInvestigations = useQuery({
    queryKey: ['investigations', 'all'],
    queryFn: () => http.get<InvestigationList>('/investigations?page=1&page_size=100'),
  })
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => http.get<UserSettings>('/settings'),
  })
  const sessions = useQuery({
    queryKey: ['copilot-sessions'],
    queryFn: () => http.get<ChatSessionList>('/copilot/sessions'),
  })
  const audit = useQuery({
    queryKey: ['dashboard-audit'],
    queryFn: () => http.get<AuditList>('/audit?page=1&page_size=5'),
  })
  const stats = useQuery({
    queryKey: ['stats-overview'],
    queryFn: () => http.get<StatsOverview>('/stats/overview'),
  })

  const recentInv = investigations.data?.items || []
  const totalInv = investigations.data?.total || 0
  const keysConfigured = settings.data
    ? [
        settings.data.has_openai,
        settings.data.has_groq,
        settings.data.has_virustotal,
        settings.data.has_abuseipdb,
        settings.data.has_shodan,
      ].filter(Boolean).length
    : 0
  const totalSessions = sessions.data?.length || 0
  const recentActivity = recentInv.length
    ? formatRelative(recentInv[0].updated_at)
    : '—'

  // Severity distribution
  const allInv = allInvestigations.data?.items || []
  const severityBuckets = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }
  for (const inv of allInv) {
    if (inv.severity_score >= 70) severityBuckets.HIGH++
    else if (inv.severity_score >= 40) severityBuckets.MEDIUM++
    else if (inv.severity_score > 0) severityBuckets.LOW++
    else severityBuckets.NONE++
  }
  const totalForChart = allInv.length || 1

  // Audit action icons
  const auditIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'investigation.pipeline.complete': CheckCircle2,
    'investigation.duplicate': CopyPlus,
    'investigation.create': Plus,
    'investigation.star': Star,
    'investigation.unstar': Star,
    'user.password.change': ShieldCheck,
    'profile.view': Eye,
    'user.profile.update': User,
    'note.create': FileText,
    'note.delete': FileText,
  }

  // Severity trend: group investigations by day for last 14 days
  const now = Date.now()
  const dayMs = 86400000
  const trendBuckets: { date: Date; scores: number[]; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * dayMs)
    d.setHours(0, 0, 0, 0)
    trendBuckets.push({ date: d, scores: [], count: 0 })
  }
  for (const inv of allInv) {
    const invDate = new Date(inv.updated_at)
    invDate.setHours(0, 0, 0, 0)
    const idx = trendBuckets.findIndex((b) => b.date.getTime() === invDate.getTime())
    if (idx >= 0) {
      trendBuckets[idx].scores.push(inv.severity_score)
      trendBuckets[idx].count++
    }
  }
  const trendData = trendBuckets.map((b) =>
    b.scores.length ? Math.round(b.scores.reduce((s, v) => s + v, 0) / b.scores.length) : 0
  )
  const hasTrend = trendBuckets.some((b) => b.count > 0)

  // Compute top entities across all investigations
  // (we'll need a new endpoint for this; for now use severity distribution + trend)

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="ansein-mono text-xs uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">
          Workspace overview
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ansein-text)]">
          Welcome back, {user?.full_name || user?.email?.split('@')[0] || 'Analyst'}
        </h1>
        <p className="text-sm text-[var(--ansein-text-muted)] mt-1">
          Here&apos;s what&apos;s happening across your threat intelligence workspace.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Investigations"
          value={totalInv}
          icon={<FolderSearch className="h-4 w-4" />}
          accent="teal"
          loading={investigations.isLoading}
        />
        <StatCard
          label="Recent activity"
          value={recentActivity}
          sub={recentActivity ? `last update ${recentActivity}` : 'no activity yet'}
          icon={<Activity className="h-4 w-4" />}
          accent="amber"
          loading={investigations.isLoading}
        />
        <StatCard
          label="Copilot chats"
          value={totalSessions}
          icon={<Bot className="h-4 w-4" />}
          accent="violet"
          loading={sessions.isLoading}
        />
        <StatCard
          label="API keys"
          value={`${keysConfigured}/5`}
          sub={keysConfigured === 0 ? 'configure in settings' : 'keys configured'}
          icon={<KeyRound className="h-4 w-4" />}
          accent={keysConfigured === 0 ? 'rose' : 'emerald'}
          loading={settings.isLoading}
        />
      </div>

      {/* Main content area */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent investigations */}
        <div className="lg:col-span-2 ansein-card rounded-xl p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--ansein-border)]">
            <div>
              <h2 className="text-base font-semibold text-[var(--ansein-text)]">
                Recent investigations
              </h2>
              <p className="text-sm text-[var(--ansein-text-muted)] mt-0.5">
                Your most recently updated cases.
              </p>
            </div>
            <Link
              href="/app/investigations"
              className="text-xs text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)] inline-flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {investigations.isLoading ? (
            <div className="py-12 flex justify-center">
              <Spinner />
            </div>
          ) : recentInv.length === 0 ? (
            <EmptyState
              icon={<FolderSearch className="h-5 w-5 text-[var(--ansein-text-dim)]" />}
              title="No investigations yet"
              description="Create your first investigation to start extracting threat intelligence from raw data."
              action={
                <Link
                  href="/app/investigations/new"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New investigation
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-[var(--ansein-border)]">
              {recentInv.map((inv) => {
                const s = statusColor(inv.status)
                const sev = severityColor(inv.severity_score)
                return (
                  <Link
                    key={inv.id}
                    href={`/app/investigations/${inv.id}`}
                    className="flex items-center gap-4 py-3.5 group hover:bg-[var(--ansein-surface)]/50 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-[var(--ansein-text)] truncate group-hover:text-[var(--ansein-primary)] transition-colors">
                          {inv.title}
                        </h3>
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border', s.bg, s.text, s.border)}>
                          <span className={cn('h-1 w-1 rounded-full', s.dot)} />
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ansein-text-dim)] mt-0.5">
                        {inv.entity_count} entities · {inv.relationship_count} relationships · {inv.source_count} sources · updated {formatRelative(inv.updated_at)}
                      </p>
                    </div>
                    <SeverityMeter score={inv.severity_score} size="sm" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Severity trend sparkline */}
          <div className="ansein-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--ansein-text)] flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--ansein-primary)]" />
                Severity trend
              </h3>
              <span className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono">
                14d
              </span>
            </div>
            {hasTrend ? (
              <>
                <div className="flex items-end gap-3 mb-3">
                  <Sparkline data={trendData} width={220} height={48} color="#f43f5e" fillOpacity={0.2} strokeWidth={2} />
                  <div className="ml-auto text-right">
                    <p className="text-2xl font-semibold ansein-mono text-[var(--ansein-text)]">
                      {trendData.filter((v) => v > 0).length > 0
                        ? Math.round(trendData.reduce((s, v) => s + v, 0) / trendData.filter((v) => v > 0).length)
                        : 0}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                      Avg score
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--ansein-text-dim)] ansein-mono">
                  <span>{trendBuckets[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <span>{trendBuckets[trendBuckets.length - 1].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-[var(--ansein-text-dim)] text-center py-4">
                No recent activity to trend
              </p>
            )}
          </div>

          {/* Severity distribution */}
          <div className="ansein-card rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--ansein-primary)]" />
              Severity distribution
            </h3>
            {allInv.length === 0 ? (
              <p className="text-xs text-[var(--ansein-text-dim)] text-center py-4">
                No investigation data yet
              </p>
            ) : (
              <>
                {/* Progress ring showing high-severity percentage */}
                <div className="flex items-center justify-center mb-5 pb-4 border-b border-[var(--ansein-border)]">
                  <ProgressRing
                    value={Math.round((severityBuckets.HIGH / totalForChart) * 100)}
                    size={84}
                    strokeWidth={7}
                    color="#f43f5e"
                    label={`${Math.round((severityBuckets.HIGH / totalForChart) * 100)}%`}
                    sublabel="HIGH"
                  />
                </div>
                <div className="space-y-3">
                  {([
                    { label: 'HIGH', color: '#f43f5e', bg: 'bg-rose-500/10' },
                    { label: 'MEDIUM', color: '#f59e0b', bg: 'bg-amber-500/10' },
                    { label: 'LOW', color: '#10b981', bg: 'bg-emerald-500/10' },
                    { label: 'NONE', color: '#64748b', bg: 'bg-slate-500/10' },
                  ] as const).map((tier) => {
                    const count = severityBuckets[tier.label]
                    const pct = Math.round((count / totalForChart) * 100)
                    return (
                      <div key={tier.label}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: tier.color }} />
                            <span className="text-xs font-medium text-[var(--ansein-text)]">{tier.label}</span>
                          </div>
                          <span className="text-xs ansein-mono text-[var(--ansein-text-muted)]">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--ansein-border)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: tier.color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Recent activity feed */}
          <div className="ansein-card rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--ansein-primary)]" />
              Activity feed
            </h3>
            {audit.isLoading ? (
              <div className="py-4 flex justify-center">
                <Spinner />
              </div>
            ) : audit.data?.items?.length === 0 ? (
              <p className="text-xs text-[var(--ansein-text-dim)] text-center py-4">
                No activity recorded yet
              </p>
            ) : (
              <div className="space-y-3">
                {(audit.data?.items || []).map((entry) => {
                  const Icon = auditIconMap[entry.action] || Activity
                  // Better labels: "note.create" → "Note created", "investigation.pipeline.complete" → "Pipeline completed"
                  const parts = entry.action.split('.')
                  const verb = parts[parts.length - 1]
                  const subject = parts.length > 1 ? parts[0] : ''
                  let actionLabel: string
                  if (verb === 'create') actionLabel = subject ? `${subject[0].toUpperCase()}${subject.slice(1)} created` : 'Created'
                  else if (verb === 'delete') actionLabel = subject ? `${subject[0].toUpperCase()}${subject.slice(1)} deleted` : 'Deleted'
                  else if (verb === 'update') actionLabel = subject ? `${subject[0].toUpperCase()}${subject.slice(1)} updated` : 'Updated'
                  else if (verb === 'complete') actionLabel = 'Pipeline completed'
                  else if (verb === 'duplicate') actionLabel = 'Investigation duplicated'
                  else if (verb === 'change') actionLabel = 'Password changed'
                  else if (verb === 'view') actionLabel = subject ? `${subject[0].toUpperCase()}${subject.slice(1)} viewed` : 'Viewed'
                  else if (verb === 'star') actionLabel = 'Investigation starred'
                  else if (verb === 'unstar') actionLabel = 'Investigation unstarred'
                  else actionLabel = entry.action.split(/[._]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                  return (
                    <div key={entry.id} className="flex items-start gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] flex-shrink-0 mt-0.5">
                        <Icon className="h-3 w-3 text-[var(--ansein-primary)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[var(--ansein-text)] truncate">{actionLabel}</p>
                        <p className="text-[10px] text-[var(--ansein-text-dim)]">{formatRelative(entry.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick start */}
          <div className="ansein-card rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--ansein-primary)]" />
              Quick start
            </h3>
            <ol className="space-y-3">
              {[
                { step: '1', text: 'Create an investigation case', href: '/app/investigations/new' },
                { step: '2', text: 'Add threat data sources (text/file/URL)', href: '/app/investigations/new' },
                { step: '3', text: 'Run the extraction pipeline', href: '/app/investigations' },
                { step: '4', text: 'Query the Copilot for insights', href: '/app/copilot' },
              ].map((s) => (
                <li key={s.step}>
                  <Link
                    href={s.href}
                    className="flex items-center gap-3 text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] ansein-mono text-xs text-[var(--ansein-primary)] flex-shrink-0">
                      {s.step}
                    </span>
                    {s.text}
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          {/* Top threats — highest severity investigations */}
          {(() => {
            const topThreats = [...allInv]
              .filter((i) => i.severity_score > 0)
              .sort((a, b) => b.severity_score - a.severity_score)
              .slice(0, 4)
            if (topThreats.length === 0) return null
            const sevHex = (score: number) =>
              score >= 70 ? '#f43f5e' : score >= 40 ? '#f59e0b' : '#10b981'
            return (
              <div className="ansein-card rounded-xl p-6">
                <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-rose-400" />
                  Top threats
                </h3>
                <div className="space-y-2">
                  {topThreats.map((inv) => {
                    const sev = severityColor(inv.severity_score)
                    const hex = sevHex(inv.severity_score)
                    return (
                      <Link
                        key={inv.id}
                        href={`/app/investigations/${inv.id}`}
                        className="flex items-center gap-2.5 p-2 rounded-md hover:bg-[var(--ansein-surface)] transition-colors group"
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ansein-mono flex-shrink-0"
                          style={{ background: `${hex}20`, color: hex, border: `1px solid ${hex}40` }}
                        >
                          {Math.round(inv.severity_score)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[var(--ansein-text)] truncate group-hover:text-[var(--ansein-primary)] transition-colors">
                            {inv.title}
                          </p>
                          <p className="text-[10px] text-[var(--ansein-text-dim)] uppercase tracking-wider">
                            {sev.label} · {inv.entity_count} entities
                          </p>
                        </div>
                        {inv.is_starred && (
                          <Star className="h-3 w-3 text-amber-400 fill-current flex-shrink-0" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Entity type donut */}
          {(() => {
            const types = stats.data?.entity_types || []
            if (types.length === 0) return null
            const donutData = types.slice(0, 6).map((t) => ({
              label: ENTITY_TYPE_LABELS[t.type] || t.type,
              value: t.count,
              color: ENTITY_TYPE_COLORS[t.type] || '#64748b',
            }))
            const totalEntities = stats.data?.total_entities || 0
            return (
              <div className="ansein-card rounded-xl p-6">
                <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
                  <Network className="h-4 w-4 text-[var(--ansein-primary)]" />
                  Entity types
                </h3>
                <div className="flex items-center gap-4">
                  <DonutChart
                    data={donutData}
                    size={120}
                    strokeWidth={14}
                    centerLabel={String(totalEntities)}
                    centerSublabel="Total"
                  />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {donutData.map((d) => (
                      <div key={d.label} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                          <span className="text-[var(--ansein-text-muted)] truncate">{d.label}</span>
                        </div>
                        <span className="ansein-mono text-[var(--ansein-text)] flex-shrink-0">
                          {d.value}
                          <span className="text-[var(--ansein-text-dim)] ml-1">
                            ({Math.round((d.value / (totalEntities || 1)) * 100)}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* BYOK status */}
          <div className="ansein-card rounded-xl p-6">
            <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[var(--ansein-primary)]" />
              BYOK status
            </h3>
            <div className="space-y-2">
              {[
                { name: 'OpenAI', ok: settings.data?.has_openai },
                { name: 'Groq', ok: settings.data?.has_groq },
                { name: 'VirusTotal', ok: settings.data?.has_virustotal },
                { name: 'AbuseIPDB', ok: settings.data?.has_abuseipdb },
                { name: 'Shodan', ok: settings.data?.has_shodan },
              ].map((k) => (
                <div key={k.name} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--ansein-text-muted)]">{k.name}</span>
                  {k.ok === undefined ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : k.ok ? (
                    <Badge color="success" dot>
                      Configured
                    </Badge>
                  ) : (
                    <Badge color="warning" dot>
                      Not set
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <Link
              href="/app/settings"
              className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)]"
            >
              Manage keys
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  loading,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  accent: 'teal' | 'amber' | 'violet' | 'rose' | 'emerald'
  loading?: boolean
}) {
  const accentColorMap = {
    teal: '#14b8a6',
    amber: '#f59e0b',
    violet: '#8b5cf6',
    rose: '#f43f5e',
    emerald: '#10b981',
  }
  const color = accentColorMap[accent]
  return (
    <div className="ansein-card ansein-card-hover rounded-xl p-5 group">
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{
            background: `${color}12`,
            color,
            border: `1px solid ${color}30`,
          }}
        >
          {icon}
        </div>
        {loading && <Spinner className="h-3.5 w-3.5" />}
      </div>
      <div>
        <div className="text-2xl font-semibold ansein-mono text-[var(--ansein-text)] tabular-nums">
          {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        </div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--ansein-text-dim)] mt-1.5 font-medium">
          {label}
        </div>
        {sub && <div className="text-xs text-[var(--ansein-text-muted)] mt-1.5 truncate">{sub}</div>}
      </div>
    </div>
  )
}
