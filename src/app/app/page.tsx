'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, ChartBar as BarChart3, CheckCircle as CheckCircle2, Clock, Copy as CopyPlus, Eye, FileText, Folder as FolderSearch, Graph as Network, Key as KeyRound, Play, Plus, Robot as Bot, ShieldCheck, ShieldWarning as ShieldAlert, Star, Target, TrendUp as TrendingUp, User, Warning as AlertTriangle, Waveform } from '@phosphor-icons/react'
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
  has_custom_llm: boolean
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

interface TimelineDay {
  date: string
  count: number
  avg_severity: number
}
interface TimelineResponse {
  scope: 'workspace' | 'own'
  days: TimelineDay[]
  total_in_window: number
  window_days: number
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
  const timeline = useQuery({
    queryKey: ['stats-timeline'],
    queryFn: () => http.get<TimelineResponse>('/stats/timeline'),
    refetchInterval: 60_000,
  })

  const recentInv = investigations.data?.items || []
  const totalInv = investigations.data?.total || 0
  const keysConfigured = settings.data
    ? [
        settings.data.has_openai,
        settings.data.has_groq,
        settings.data.has_custom_llm,
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
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1.5">
          Workspace overview
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome back, {user?.full_name || user?.email?.split('@')[0] || 'Analyst'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening across your threat intelligence workspace.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Investigations"
          value={totalInv}
          icon={<FolderSearch weight="duotone" className="h-4 w-4" />}
          accent="teal"
          loading={investigations.isLoading}
        />
        <StatCard
          label="Recent activity"
          value={recentActivity}
          sub={recentActivity ? `last update ${recentActivity}` : 'no activity yet'}
          icon={<Waveform weight="duotone" className="h-4 w-4" />}
          accent="amber"
          loading={investigations.isLoading}
        />
        <StatCard
          label="Copilot chats"
          value={totalSessions}
          icon={<Bot weight="duotone" className="h-4 w-4" />}
          accent="violet"
          loading={sessions.isLoading}
        />
        <StatCard
          label="API keys"
          value={`${keysConfigured}/6`}
          sub={keysConfigured === 0 ? 'configure in settings' : 'keys configured'}
          icon={<KeyRound weight="duotone" className="h-4 w-4" />}
          accent={keysConfigured === 0 ? 'rose' : 'emerald'}
          loading={settings.isLoading}
        />
      </div>

      {/* Main content area */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent investigations */}
        <div className="lg:col-span-2 bg-card border border-border/50 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-border/50">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Recent investigations
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your most recently updated cases.
              </p>
            </div>
            <Link
              href="/app/investigations"
              className="text-xs text-primary hover:text-primary/90 inline-flex items-center gap-1"
            >
              View all
              <ArrowRight weight="duotone" className="h-3 w-3" />
            </Link>
          </div>

          {investigations.isLoading ? (
            <div className="py-12 flex justify-center">
              <Spinner />
            </div>
          ) : recentInv.length === 0 ? (
            <EmptyState
              icon={<FolderSearch weight="duotone" className="h-5 w-5 text-muted-foreground/50" />}
              title="No investigations yet"
              description="Create your first investigation to start extracting threat intelligence from raw data."
              action={
                <Link
                  href="/app/investigations/new"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus weight="duotone" className="h-3.5 w-3.5" />
                  New investigation
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {recentInv.map((inv) => {
                const s = statusColor(inv.status)
                const sev = severityColor(inv.severity_score)
                return (
                  <Link
                    key={inv.id}
                    href={`/app/investigations/${inv.id}`}
                    className="flex items-center gap-4 py-3.5 group hover:bg-card/50 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {inv.title}
                        </h3>
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border', s.bg, s.text, s.border)}>
                          <span className={cn('h-1 w-1 rounded-full', s.dot)} />
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/50 mt-0.5">
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
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp weight="duotone" className="h-4 w-4 text-primary" />
                Severity trend
              </h3>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 ansein-mono">
                14d
              </span>
            </div>
            {hasTrend ? (
              <>
                <div className="flex items-end gap-3 mb-3">
                  <Sparkline data={trendData} width={220} height={48} color="#f43f5e" fillOpacity={0.2} strokeWidth={2} />
                  <div className="ml-auto text-right">
                    <p className="text-2xl font-semibold ansein-mono text-foreground">
                      {trendData.filter((v) => v > 0).length > 0
                        ? Math.round(trendData.reduce((s, v) => s + v, 0) / trendData.filter((v) => v > 0).length)
                        : 0}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
                      Avg score
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 ansein-mono">
                  <span>{trendBuckets[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <span>{trendBuckets[trendBuckets.length - 1].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground/50 text-center py-4">
                No recent activity to trend
              </p>
            )}
          </div>

          {/* Investigation Activity — 30-day bar chart */}
          <InvestigationActivityCard
            days={timeline.data?.days || []}
            scope={timeline.data?.scope || 'own'}
            totalInWindow={timeline.data?.total_in_window || 0}
            loading={timeline.isLoading}
          />

          {/* Severity distribution */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <ShieldAlert weight="duotone" className="h-4 w-4 text-primary" />
              Severity distribution
            </h3>
            {allInv.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 text-center py-4">
                No investigation data yet
              </p>
            ) : (
              <>
                {/* Progress ring showing high-severity percentage */}
                <div className="flex items-center justify-center mb-5 pb-4 border-b border-border">
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
                            <span className="text-xs font-medium text-foreground">{tier.label}</span>
                          </div>
                          <span className="text-xs ansein-mono text-muted-foreground">{count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[border] overflow-hidden">
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
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock weight="duotone" className="h-4 w-4 text-primary" />
              Activity feed
            </h3>
            {audit.isLoading ? (
              <div className="py-4 flex justify-center">
                <Spinner />
              </div>
            ) : audit.data?.items?.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 text-center py-4">
                No activity recorded yet
              </p>
            ) : (
              <div className="space-y-3">
                {(audit.data?.items || []).map((entry) => {
                  const Icon = auditIconMap[entry.action] || Waveform
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
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-card border border-border flex-shrink-0 mt-0.5">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground truncate">{actionLabel}</p>
                        <p className="text-[10px] text-muted-foreground/50">{formatRelative(entry.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Quick start */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp weight="duotone" className="h-4 w-4 text-primary" />
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
                    className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-card border border-border ansein-mono text-xs text-primary flex-shrink-0">
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
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target weight="duotone" className="h-4 w-4 text-rose-400" />
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
                        className="flex items-center gap-2.5 p-2 rounded-md hover:bg-card transition-colors group"
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ansein-mono flex-shrink-0"
                          style={{ background: `${hex}20`, color: hex, border: `1px solid ${hex}40` }}
                        >
                          {Math.round(inv.severity_score)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {inv.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                            {sev.label} · {inv.entity_count} entities
                          </p>
                        </div>
                        {inv.is_starred && (
                          <Star weight="duotone" className="h-3 w-3 text-amber-400 fill-current flex-shrink-0" />
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
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Network weight="duotone" className="h-4 w-4 text-primary" />
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
                          <span className="text-muted-foreground truncate">{d.label}</span>
                        </div>
                        <span className="ansein-mono text-foreground flex-shrink-0">
                          {d.value}
                          <span className="text-muted-foreground/50 ml-1">
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
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <KeyRound weight="duotone" className="h-4 w-4 text-primary" />
              BYOK status
            </h3>
            <div className="space-y-2">
              {[
                { name: 'OpenAI', ok: settings.data?.has_openai },
                { name: 'Groq', ok: settings.data?.has_groq },
                { name: 'Custom LLM', ok: settings.data?.has_custom_llm },
                { name: 'VirusTotal', ok: settings.data?.has_virustotal },
                { name: 'AbuseIPDB', ok: settings.data?.has_abuseipdb },
                { name: 'Shodan', ok: settings.data?.has_shodan },
              ].map((k) => (
                <div key={k.name} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{k.name}</span>
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
              className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/90"
            >
              Manage keys
              <ArrowRight weight="duotone" className="h-3 w-3" />
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
    <div className="bg-card border border-border/50 hover:border-primary/30 transition-all hover:shadow-md rounded-xl p-5 group">
      <div className="flex items-start justify-between mb-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors shadow-sm"
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
        <div className="text-3xl font-bold text-foreground tabular-nums tracking-tight">
          {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2 font-semibold">
          {label}
        </div>
        {sub && <div className="text-xs text-muted-foreground/70 mt-1 truncate">{sub}</div>}
      </div>
    </div>
  )
}

/* ============================================ Investigation Activity card */

/**
 * 30-day investigation-creation bar chart.
 *
 *   - Each bar = one day (oldest → newest, left to right)
 *   - Bar height = number of investigations created that day
 *   - Bar color intensity = average severity score for that day
 *   - Hover tooltip = date, count, avg severity
 *
 * Pure inline SVG — no external chart library needed.
 */
function InvestigationActivityCard({
  days,
  scope,
  totalInWindow,
  loading,
}: {
  days: TimelineDay[]
  scope: 'workspace' | 'own'
  totalInWindow: number
  loading: boolean
}) {
  // Chart geometry
  const width = 280
  const height = 96
  const padding = { top: 8, right: 4, bottom: 18, left: 4 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const barCount = days.length || 30
  const gap = 2
  const barW = Math.max(2, (innerW - (barCount - 1) * gap) / barCount)
  const maxCount = Math.max(1, ...days.map((d) => d.count))

  // Find peak day (for the "most active" callout)
  const peak = days.reduce<TimelineDay | null>(
    (best, d) => (!best || d.count > best.count ? d : best),
    null
  )
  const peakDate = peak && peak.count > 0 ? new Date(peak.date) : null

  // Average severity across the whole window (weighted by count)
  const weightedSum = days.reduce((s, d) => s + d.avg_severity * d.count, 0)
  const windowAvg = totalInWindow > 0 ? Math.round(weightedSum / totalInWindow) : 0

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 weight="duotone" className="h-4 w-4 text-primary" />
          Investigation activity
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 ansein-mono">
          30d · {scope}
        </span>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Spinner />
        </div>
      ) : totalInWindow === 0 ? (
        <p className="text-xs text-muted-foreground/50 text-center py-6">
          No investigations created in the last 30 days.
        </p>
      ) : (
        <>
          {/* Summary row */}
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-2xl font-semibold ansein-mono text-foreground tabular-nums">
                <AnimatedNumber value={totalInWindow} />
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-0.5">
                New in 30d
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold ansein-mono tabular-nums" style={{ color: severityColor(windowAvg).label === 'HIGH' ? '#f43f5e' : severityColor(windowAvg).label === 'MEDIUM' ? '#f59e0b' : windowAvg > 0 ? '#10b981' : '#64748b' }}>
                {windowAvg}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/50 mt-0.5">
                Avg severity
              </div>
            </div>
          </div>

          {/* SVG bar chart */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              width="100%"
              height={height}
              role="img"
              aria-label="30-day investigation creation bar chart"
              preserveAspectRatio="none"
              style={{ display: 'block' }}
            >
              {/* Baseline */}
              <line
                x1={padding.left}
                y1={padding.top + innerH}
                x2={padding.left + innerW}
                y2={padding.top + innerH}
                stroke="border"
                strokeWidth={1}
              />

              {days.map((d, i) => {
                const x = padding.left + i * (barW + gap)
                const h = maxCount > 0 ? (d.count / maxCount) * innerH : 0
                const y = padding.top + innerH - h
                // Color intensity from avg severity: 0 = dim teal, 100 = bright rose
                const sev = d.avg_severity || 0
                const color = severityColor(sev)
                const baseColor =
                  sev >= 70 ? '#f43f5e' : sev >= 40 ? '#f59e0b' : sev > 0 ? '#10b981' : '#14b8a6'
                // Opacity scales with how recent (peak highlight) — but mostly with count magnitude
                const opacity = d.count === 0 ? 0.18 : 0.55 + 0.45 * (d.count / maxCount)
                return (
                  <g key={d.date} className="ansein-activity-bar">
                    <title>{`${d.date} · ${d.count} investigation${d.count === 1 ? '' : 's'}${d.count > 0 ? ` · avg severity ${d.avg_severity.toFixed(0)} (${color.label})` : ''}`}</title>
                    {/* Hit area (transparent) so the entire column is hoverable */}
                    <rect
                      x={x - gap / 2}
                      y={padding.top}
                      width={barW + gap}
                      height={innerH}
                      fill="transparent"
                    />
                    {d.count > 0 && (
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(1, h)}
                        fill={baseColor}
                        opacity={opacity}
                        rx={1}
                      />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground/50 ansein-mono">
            <span>{days[0] ? new Date(days[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
            <span>{days[Math.floor(days.length / 2)] ? new Date(days[Math.floor(days.length / 2)].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
            <span>{days[days.length - 1] ? new Date(days[days.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
          </div>

          {/* Legend / peak callout */}
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground/50">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: '#14b8a6', opacity: 0.5 }} />
                None
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: '#10b981' }} />
                Low
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: '#f59e0b' }} />
                Medium
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: '#f43f5e' }} />
                High
              </span>
            </div>
            {peakDate && peak && peak.count > 0 && (
              <span className="ansein-mono">
                Peak: {peakDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {peak.count}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
