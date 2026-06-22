'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Play,
  Loader2,
  Trash2,
  Download,
  FileText,
  Upload,
  Plus,
  Send,
  Bot,
  Network,
  Bug,
  Wrench,
  Code,
  ShieldAlert,
  Globe,
  Link as LinkIcon,
  Hash,
  CreditCard,
  Crosshair,
  MapPin,
  User,
  Users,
  AlertTriangle,
  Activity,
  Lightbulb,
  Cpu,
  Sparkles,
  Tag,
  ChevronRight,
  Search,
  Copy,
  Check,
  CopyPlus,
  FileJson,
  FileCode,
  CheckCircle2,
  Circle,
  X as XIcon,
  ClipboardList,
  ArrowDownToLine,
  Keyboard,
  XCircle,
  FileSearch,
  Eye,
  Maximize2,
  Star,
  StickyNote,
  Pin,
  PinOff,
  Pencil,
  History,
  Lock,
  KeyRound,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react'
import { http } from '@/lib/http'
import { Badge, SeverityMeter, EmptyState, Spinner } from '@/components/ansein/ui'
import { EntityDetailModal } from '@/components/ansein/entity-detail-modal'
import { ExportLink } from '@/components/ansein/export-link'
import { Markdown } from '@/components/ansein/markdown'
import { GraphView } from '@/components/graph/graph-view'
import { VirtualizedEntityTable } from '@/components/ansein/virtualized-entity-table'
import { VoiceInputButton } from '@/components/ansein/voice-input-button'
import {
  statusColor,
  formatRelative,
  formatDate,
  admiraltyLabel,
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_COLORS,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  threat_actor: Users,
  malware: Bug,
  tool: Wrench,
  technique: Code,
  vulnerability: ShieldAlert,
  ioc_ip: Globe,
  ioc_domain: LinkIcon,
  ioc_url: LinkIcon,
  ioc_hash: Hash,
  ioc_wallet: CreditCard,
  target: Crosshair,
  location: MapPin,
  identity: User,
}

type Tab = 'overview' | 'sources' | 'graph' | 'entities' | 'analysis' | 'copilot' | 'notes' | 'activity'

interface Investigation {
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

interface Note {
  id: number
  investigation_id: number
  user_id: number
  author_name: string
  body: string
  pinned: boolean
  created_at: string
  updated_at: string
}

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

interface Source {
  id: number
  source_type: string
  title: string
  content: string
  content_hash: string
  mime_type: string
  size_bytes: number
  created_at: string
}

interface Entity {
  id: number
  entity_type: string
  value: string
  normalized: string
  confidence: number
  source_method: string
  enrichment: Record<string, unknown>
  created_at: string
}

interface Relationship {
  id: number
  source_id: number
  target_id: number
  relation_type: string
  weight: number
  evidence: string
}

interface ThreatHypothesis {
  scenario: string
  confidence: number
  reasoning: string
  next_steps: string[]
}

interface Analysis {
  id: number
  narrative: string
  actor_hypothesis: Record<string, unknown>
  severity_score: number
  recommendations: string[]
  admiralty_code: string
  confidence: number
  model_used: string
  tokens_used: number
  created_at: string
  hypotheses?: ThreatHypothesis[]
}

interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  citations: string[]
  tokens_used: number
  created_at: string
}

export default function InvestigationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [id, setId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    params.then((p) => setId(Number(p.id)))
  }, [params])

  // Keyboard shortcuts: 1-6 to switch tabs, ? to show help
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      const tabMap: Record<string, Tab> = {
        '1': 'overview',
        '2': 'sources',
        '3': 'graph',
        '4': 'entities',
        '5': 'analysis',
        '6': 'copilot',
        '7': 'notes',
        '8': 'activity',
      }
      if (tabMap[key]) {
        e.preventDefault()
        setTab(tabMap[key])
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const invQuery = useQuery({
    queryKey: ['investigation', id],
    queryFn: () => http.get<Investigation>(`/investigations/${id}`),
    enabled: id !== null,
    refetchInterval: (q) => {
      const status = (q.state.data as Investigation | undefined)?.status
      return status && ['extracting', 'enriching', 'analyzing'].includes(status) ? 3000 : false
    },
  })

  const pipelineMutation = useMutation({
    mutationFn: () => http.post<Investigation>(`/investigations/${id}/pipeline`),
    onSuccess: () => {
      toast.success('Pipeline completed')
      qc.invalidateQueries({ queryKey: ['investigation', id] })
      qc.invalidateQueries({ queryKey: ['entities', id] })
      qc.invalidateQueries({ queryKey: ['graph', id] })
      qc.invalidateQueries({ queryKey: ['analysis', id] })
      qc.invalidateQueries({ queryKey: ['sources', id] })
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Pipeline failed')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => http.delete(`/investigations/${id}`),
    onSuccess: () => {
      toast.success('Investigation deleted')
      router.push('/app/investigations')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: () => http.post<{ id: number }>(`/investigations/${id}/duplicate`),
    onSuccess: (data) => {
      toast.success('Investigation duplicated')
      qc.invalidateQueries({ queryKey: ['investigations'] })
      router.push(`/app/investigations/${data.id}`)
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to duplicate')
    },
  })

  const starMutation = useMutation({
    mutationFn: (isStarred: boolean) =>
      http.patch(`/investigations/${id}`, { is_starred: isStarred }),
    onMutate: async (isStarred) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ['investigation', id] })
      const previous = qc.getQueryData<Investigation>(['investigation', id])
      if (previous) {
        qc.setQueryData<Investigation>(['investigation', id], {
          ...previous,
          is_starred: isStarred,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['investigation', id], ctx.previous)
      }
      toast.error('Failed to update star')
    },
    onSuccess: (_data, isStarred) => {
      toast.success(isStarred ? 'Starred investigation' : 'Removed star')
      qc.invalidateQueries({ queryKey: ['investigations'] })
    },
  })

  if (id === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    )
  }

  if (invQuery.isError && !invQuery.isLoading) {
    return (
      <div className="px-6 py-12 max-w-3xl mx-auto">
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6 text-rose-400" />}
          title="Investigation not found"
          description="The investigation may have been deleted, or you don't have access to it."
          action={
            <Link
              href="/app/investigations"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to list
            </Link>
          }
        />
      </div>
    )
  }

  const inv = invQuery.data
  const isRunning = inv && ['extracting', 'enriching', 'analyzing'].includes(inv.status)

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <Link
        href="/app/investigations"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All investigations
      </Link>

      {invQuery.isLoading || !inv ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Title row */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium border', statusColor(inv.status).bg, statusColor(inv.status).text, statusColor(inv.status).border)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', statusColor(inv.status).dot, isRunning && 'animate-pulse')} />
                    {inv.status}
                  </span>
                  <span className="ansein-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ansein-text-dim)]">
                    Case #{inv.id}
                  </span>
                  <span className="text-[10px] text-[var(--ansein-text-dim)]">
                    · Updated {formatRelative(inv.updated_at)}
                  </span>
                  {inv.is_starred && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      Starred
                    </span>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--ansein-text)]">
                  {inv.title}
                </h1>
                {inv.description && (
                  <p className="text-sm text-[var(--ansein-text-muted)] mt-2 max-w-2xl leading-relaxed">
                    {inv.description}
                  </p>
                )}
                {inv.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {inv.tags.map((t, i) => (
                      <span key={i} className="ansein-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)]">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons — grouped with dividers */}
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap md:flex-nowrap">
                {/* Primary: Run pipeline */}
                <button
                  onClick={() => pipelineMutation.mutate()}
                  disabled={isRunning || pipelineMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isRunning || pipelineMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {isRunning ? inv.status : 'Running…'}
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Run pipeline
                    </>
                  )}
                </button>

                {/* Divider */}
                <div className="h-6 w-px bg-[var(--ansein-border)] mx-0.5 hidden md:block" />

                {/* Star toggle */}
                <button
                  onClick={() => starMutation.mutate(!inv.is_starred)}
                  disabled={starMutation.isPending}
                  className={cn(
                    'inline-flex items-center justify-center h-[38px] w-[38px] rounded-md border transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                    inv.is_starred
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
                      : 'border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] hover:text-amber-400 hover:border-amber-500/30'
                  )}
                  title={inv.is_starred ? 'Remove star' : 'Star this investigation'}
                  aria-label={inv.is_starred ? 'Remove star' : 'Star this investigation'}
                >
                  <Star className={cn('h-4 w-4', inv.is_starred && 'fill-current')} />
                </button>

                {/* Divider */}
                <div className="h-6 w-px bg-[var(--ansein-border)] mx-0.5 hidden md:block" />

                {/* Export group */}
                <ExportLink
                  path={`/export/${inv.id}/pdf`}
                  filename={`ansein-investigation-${inv.id}.pdf`}
                  mimeType="text/html"
                  label="PDF"
                  printMode
                />
                <ExportLink
                  path={`/export/${inv.id}/json`}
                  filename={`ansein-investigation-${inv.id}.json`}
                  mimeType="application/json"
                  label="JSON"
                  icon={<FileJson className="h-3.5 w-3.5" />}
                />
                <ExportLink
                  path={`/export/${inv.id}/stix`}
                  filename={`ansein-investigation-${inv.id}-stix.json`}
                  mimeType="application/json"
                  label="STIX"
                  icon={<FileCode className="h-3.5 w-3.5" />}
                />

                {/* Divider */}
                <div className="h-6 w-px bg-[var(--ansein-border)] mx-0.5 hidden md:block" />

                {/* Duplicate + Delete */}
                <button
                  onClick={() => duplicateMutation.mutate()}
                  disabled={duplicateMutation.isPending}
                  className="inline-flex items-center justify-center h-[38px] w-[38px] rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  title="Duplicate investigation"
                >
                  {duplicateMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CopyPlus className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this investigation? This cannot be undone.')) {
                      deleteMutation.mutate()
                    }
                  }}
                  className="inline-flex items-center justify-center h-[38px] w-[38px] rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors"
                  title="Delete investigation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatTile label="Sources" value={inv.source_count} icon={<FileText className="h-3.5 w-3.5" />} />
            <StatTile label="Entities" value={inv.entity_count} icon={<Network className="h-3.5 w-3.5" />} />
            <StatTile label="Relationships" value={inv.relationship_count} icon={<Activity className="h-3.5 w-3.5" />} />
            <div className="ansein-card rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Severity</p>
              <SeverityMeter score={inv.severity_score} size="sm" />
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-[var(--ansein-border)] mb-6">
            <div className="flex items-center gap-1 -mb-px overflow-x-auto ansein-no-scrollbar">
              {([
                ['overview', 'Overview', '1'],
                ['sources', 'Sources', '2'],
                ['graph', 'Graph', '3'],
                ['entities', 'Entities', '4'],
                ['analysis', 'Analysis', '5'],
                ['copilot', 'Copilot', '6'],
                ['notes', 'Notes', '7'],
                ['activity', 'Activity', '8'],
              ] as [Tab, string, string][]).map(([t, label, shortcut]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'group inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    tab === t
                      ? 'border-[var(--ansein-primary)] text-[var(--ansein-text)]'
                      : 'border-transparent text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)]'
                  )}
                >
                  {label}
                  <kbd
                    className={cn(
                      'hidden md:inline-block ansein-mono text-[9px] px-1 py-0.5 rounded border transition-colors',
                      tab === t
                        ? 'bg-[var(--ansein-surface-hover)] border-[var(--ansein-border-strong)] text-[var(--ansein-text-dim)]'
                        : 'bg-transparent border-[var(--ansein-border)] text-[var(--ansein-text-dim)] group-hover:border-[var(--ansein-border-strong)]'
                    )}
                  >
                    {shortcut}
                  </kbd>
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {tab === 'overview' && <OverviewTab inv={inv} onSwitchTab={setTab} />}
          {tab === 'sources' && <SourcesTab invId={inv.id} />}
          {tab === 'graph' && <GraphTab invId={inv.id} />}
          {tab === 'entities' && <EntitiesTab invId={inv.id} />}
          {tab === 'analysis' && <AnalysisTab invId={inv.id} />}
          {tab === 'copilot' && (
            <CopilotInline
              invId={inv.id}
              invTitle={inv.title}
              sessionId={activeSessionId}
              onSessionCreated={setActiveSessionId}
            />
          )}
          {tab === 'notes' && <NotesTab invId={inv.id} />}
          {tab === 'activity' && <ActivityTab invId={inv.id} />}
        </>
      )}

      {/* Keyboard shortcuts help modal */}
      {showShortcuts && <ShortcutsHelpModal onClose={() => setShowShortcuts(false)} />}

      {/* Floating shortcuts button */}
      <button
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors z-40"
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ============================================ Breadcrumb */
function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-[var(--ansein-text-dim)] mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-[var(--ansein-text-muted)] transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[var(--ansein-text-muted)]">{item.label}</span>
          )}
          {i < items.length - 1 && <ChevronRight className="h-3 w-3" />}
        </span>
      ))}
    </nav>
  )
}

/* ============================================ Shortcuts Help Modal */
function ShortcutsHelpModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ['1'], desc: 'Switch to Overview tab' },
    { keys: ['2'], desc: 'Switch to Sources tab' },
    { keys: ['3'], desc: 'Switch to Graph tab' },
    { keys: ['4'], desc: 'Switch to Entities tab' },
    { keys: ['5'], desc: 'Switch to Analysis tab' },
    { keys: ['6'], desc: 'Switch to Copilot tab' },
    { keys: ['7'], desc: 'Switch to Notes tab' },
    { keys: ['8'], desc: 'Switch to Activity tab' },
    { keys: ['?'], desc: 'Toggle this shortcuts panel' },
    { keys: ['Esc'], desc: 'Close modals / panels' },
    { keys: ['⌘', 'K'], desc: 'Open command palette (anywhere)' },
  ]
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 ansein-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md ansein-card rounded-xl p-6 border-[var(--ansein-border-strong)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <Keyboard className="h-4 w-4 text-[var(--ansein-primary)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--ansein-text)]">Keyboard shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-[var(--ansein-surface)] transition-colors"
            >
              <span className="text-sm text-[var(--ansein-text-muted)]">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="ansein-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-[var(--ansein-text)]"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--ansein-text-dim)] mt-4 text-center">
          Shortcuts are disabled while typing in input fields.
        </p>
      </div>
    </div>
  )
}

/* ============================================ Overview tab */
function OverviewTab({ inv, onSwitchTab }: { inv: Investigation; onSwitchTab: (t: Tab) => void }) {
  const qc = useQueryClient()
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)

  const entitiesQuery = useQuery({
    queryKey: ['entities', inv.id],
    queryFn: () => http.get<Entity[]>(`/entities/${inv.id}`),
  })

  const addTagMutation = useMutation({
    mutationFn: (tags: string[]) =>
      http.patch(`/investigations/${inv.id}`, { tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investigation', inv.id] })
      setNewTag('')
      setShowTagInput(false)
      toast.success('Tag added')
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to add tag')
    },
  })

  const removeTagMutation = useMutation({
    mutationFn: (tags: string[]) =>
      http.patch(`/investigations/${inv.id}`, { tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['investigation', inv.id] })
      toast.success('Tag removed')
    },
  })

  function handleAddTag() {
    const t = newTag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
    if (!t || inv.tags.includes(t)) return
    addTagMutation.mutate([...inv.tags, t])
  }

  function handleRemoveTag(tag: string) {
    removeTagMutation.mutate(inv.tags.filter((t) => t !== tag))
  }

  // Compute IOC counts for summary card
  const entities = entitiesQuery.data || []
  const iocTypes = ['ioc_ip', 'ioc_domain', 'ioc_url', 'ioc_hash', 'ioc_wallet', 'cve', 'vulnerability']
  const iocEntities = entities.filter((e) => iocTypes.includes(e.entity_type))
  const iocByType = iocEntities.reduce((acc, e) => {
    const t = e.entity_type === 'vulnerability' ? 'cve' : e.entity_type
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  function copyAllIOCs() {
    const lines = iocEntities.map((e) => e.value)
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedAll(true)
      toast.success(`Copied ${lines.length} IOCs to clipboard`)
      setTimeout(() => setCopiedAll(false), 1500)
    })
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Pipeline timeline */}
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-5 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--ansein-primary)]" />
            Pipeline progress
          </h3>
          <PipelineTimeline status={inv.status} />
        </div>

        {/* Investigation summary */}
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--ansein-primary)]" />
            Investigation summary
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Status</p>
              <p className="text-[var(--ansein-text)] capitalize">{inv.status}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Created</p>
              <p className="text-[var(--ansein-text)]">{formatDate(inv.created_at)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Last updated</p>
              <p className="text-[var(--ansein-text)]">{formatDate(inv.updated_at)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Severity</p>
              <SeverityMeter score={inv.severity_score} size="sm" />
            </div>
          </div>

          {/* Tags */}
          <div className="mt-5 pt-4 border-t border-[var(--ansein-border)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">Tags</p>
              <button
                onClick={() => setShowTagInput(!showTagInput)}
                className="text-[10px] text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)] flex items-center gap-1"
              >
                <Plus className="h-2.5 w-2.5" />
                Add
              </button>
            </div>
            {showTagInput && (
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag() }}
                  placeholder="new-tag"
                  className="flex-1 px-2 py-1 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-xs focus:outline-none focus:border-[var(--ansein-primary)]"
                />
                <button
                  onClick={handleAddTag}
                  disabled={!newTag.trim() || addTagMutation.isPending}
                  className="px-2 py-1 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-xs font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
            {inv.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {inv.tags.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 ansein-mono text-[10px] px-2 py-0.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] group hover:border-[var(--ansein-border-strong)]"
                  >
                    #{t}
                    <button
                      onClick={() => handleRemoveTag(t)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--ansein-text-dim)] hover:text-rose-400 transition-all"
                    >
                      <XIcon className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--ansein-text-dim)]">No tags yet</p>
            )}
          </div>
        </div>

        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4">How to investigate</h3>
          <ol className="space-y-3">
            <Step n={1} title="Add sources" desc="Paste raw text, upload files, or reference URLs in the Sources tab." action={() => onSwitchTab('sources')} />
            <Step n={2} title="Run the pipeline" desc="Click 'Run pipeline' above. Extraction → enrichment → analysis runs in one click." />
            <Step n={3} title="Explore the graph" desc="Visualise entities and relationships in the Graph tab." action={() => onSwitchTab('graph')} />
            <Step n={4} title="Review analysis" desc="Read the AI-generated narrative, severity, and recommendations." action={() => onSwitchTab('analysis')} />
            <Step n={5} title="Ask the Copilot" desc="Query your investigation data with grounded RAG chat." action={() => onSwitchTab('copilot')} />
          </ol>
        </div>
      </div>

      <div className="space-y-6">
        {/* IOC summary card */}
        {iocEntities.length > 0 && (
          <div className="ansein-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--ansein-text)] flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 border border-amber-500/30">
                  <Crosshair className="h-3.5 w-3.5 text-amber-400" />
                </div>
                IOC summary
              </h3>
              <button
                onClick={copyAllIOCs}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[10px] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
                title="Copy all IOC values to clipboard"
              >
                {copiedAll ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy all
                  </>
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {Object.entries(iocByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const color = ENTITY_TYPE_COLORS[type] || '#64748b'
                  const label = type === 'cve' ? 'CVE' : ENTITY_TYPE_LABELS[type] || type
                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between p-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        <span className="text-[10px] uppercase tracking-wider text-[var(--ansein-text-muted)] ansein-mono">
                          {label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold ansein-mono text-[var(--ansein-text)]">
                        {count}
                      </span>
                    </div>
                  )
                })}
            </div>
            <button
              onClick={() => onSwitchTab('entities')}
              className="w-full text-[10px] text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)] text-center transition-colors"
            >
              View all entities →
            </button>
          </div>
        )}

        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4">Quick actions</h3>
          <div className="space-y-2">
            <QuickAction icon={<FileText className="h-3.5 w-3.5" />} label="Add a source" onClick={() => onSwitchTab('sources')} />
            <QuickAction icon={<Network className="h-3.5 w-3.5" />} label="View graph" onClick={() => onSwitchTab('graph')} />
            <QuickAction icon={<Bot className="h-3.5 w-3.5" />} label="Ask Copilot" onClick={() => onSwitchTab('copilot')} />
            <ExportLink
              path={`/export/${inv.id}/json`}
              filename={`ansein-investigation-${inv.id}.json`}
              mimeType="application/json"
              variant="link"
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:bg-[var(--ansein-surface)] transition-colors"
              icon={<span className="flex items-center gap-2"><FileJson className="h-3.5 w-3.5" />Export JSON</span>}
            />
            <ExportLink
              path={`/export/${inv.id}/stix`}
              filename={`ansein-investigation-${inv.id}-stix.json`}
              mimeType="application/json"
              variant="link"
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:bg-[var(--ansein-surface)] transition-colors"
              icon={<span className="flex items-center gap-2"><FileCode className="h-3.5 w-3.5" />Export STIX 2.1</span>}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================ Pipeline Timeline */
function PipelineTimeline({ status }: { status: string }) {
  const steps = [
    { key: 'pending', label: 'Ingest', icon: FileText, color: '#64748b' },
    { key: 'extracting', label: 'Extract', icon: Search, color: '#06b6d4' },
    { key: 'enriching', label: 'Enrich', icon: ShieldAlert, color: '#14b8a6' },
    { key: 'analyzing', label: 'Analyse', icon: Cpu, color: '#f59e0b' },
    { key: 'completed', label: 'Complete', icon: CheckCircle2, color: '#10b981' },
  ]

  const statusOrder: Record<string, number> = {
    pending: 0,
    extracting: 1,
    enriching: 2,
    analyzing: 3,
    completed: 4,
    failed: 4,
  }

  const currentIndex = statusOrder[status] ?? 0
  const isFailed = status === 'failed'

  return (
    <div className="flex items-center gap-0 w-full">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex || (i === 4 && status === 'completed')
        const isCurrent = i === currentIndex && !isFailed
        const isPending = i > currentIndex
        const StepIcon = step.icon

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                  isCompleted
                    ? 'border-[var(--ansein-primary)] bg-[var(--ansein-primary)]/15'
                    : isCurrent
                    ? 'border-[var(--ansein-primary)] bg-[var(--ansein-primary)]/20 ansein-glow'
                    : isFailed && i === currentIndex
                    ? 'border-rose-500 bg-rose-500/15'
                    : 'border-[var(--ansein-border)] bg-[var(--ansein-surface)]'
                )}
              >
                {isCurrent && status !== 'completed' ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: step.color }} />
                ) : isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--ansein-primary)]" />
                ) : isFailed && i === currentIndex ? (
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                ) : (
                  <StepIcon className="h-4 w-4 text-[var(--ansein-text-dim)]" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] ansein-mono uppercase tracking-wider whitespace-nowrap',
                  isCompleted
                    ? 'text-[var(--ansein-primary)]'
                    : isCurrent
                    ? 'text-[var(--ansein-text)] font-semibold'
                    : 'text-[var(--ansein-text-dim)]'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-1 mt-[-18px]">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    isCompleted
                      ? 'bg-[var(--ansein-primary)]'
                      : isCurrent
                      ? 'bg-gradient-to-r from-[var(--ansein-primary)] to-[var(--ansein-border)]'
                      : 'bg-[var(--ansein-border)]'
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Step({ n, title, desc, action }: { n: number; title: string; desc: string; action?: () => void }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] ansein-mono text-xs text-[var(--ansein-primary)] flex-shrink-0">
        {n}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--ansein-text)]">{title}</p>
        <p className="text-xs text-[var(--ansein-text-muted)] mt-0.5">{desc}</p>
        {action && (
          <button onClick={action} className="mt-1 text-xs text-[var(--ansein-primary)] hover:text-[var(--ansein-primary-hover)]">
            Go →
          </button>
        )}
      </div>
    </li>
  )
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:bg-[var(--ansein-surface)] transition-colors"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
    </button>
  )
}

function StatTile({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="ansein-card rounded-lg p-3.5">
      <div className="flex items-center gap-1.5 text-[var(--ansein-text-dim)] mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.15em] font-medium">{label}</span>
      </div>
      <p className="text-xl font-semibold ansein-mono text-[var(--ansein-text)] tabular-nums">{value}</p>
    </div>
  )
}

/* ============================================ Sources tab */
function SourcesTab({ invId }: { invId: number }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [previewSource, setPreviewSource] = useState<Source | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sourcesQuery = useQuery({
    queryKey: ['sources', invId],
    queryFn: () => http.get<Source[]>(`/ingest/${invId}/sources`),
  })

  const addMutation = useMutation({
    mutationFn: (data: { source_type: string; title: string; content: string }) =>
      http.post(`/ingest/${invId}/sources`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources', invId] })
      qc.invalidateQueries({ queryKey: ['investigation', invId] })
      setTitle('')
      setContent('')
      toast.success('Source added')
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const content_b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Strip the data URL prefix (e.g. "data:text/plain;base64,")
          const base64 = result.includes(',') ? result.split(',')[1] : result
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      return http.post(`/ingest/${invId}/sources/upload`, {
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        content_b64,
        title: file.name,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources', invId] })
      qc.invalidateQueries({ queryKey: ['investigation', invId] })
      toast.success('File uploaded')
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Upload failed')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (sourceId: number) =>
      http.delete(`/ingest/${invId}/sources?source_id=${sourceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources', invId] })
      qc.invalidateQueries({ queryKey: ['investigation', invId] })
      toast.success('Source deleted')
    },
  })

  function handleAdd() {
    if (!content.trim()) return
    setAdding(true)
    addMutation.mutate(
      { source_type: 'text', title: title || 'Untitled source', content },
      { onSettled: () => setAdding(false) }
    )
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMutation.mutate(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const sources = sourcesQuery.data || []

  // File type icon helper
  function getFileIcon(mime: string) {
    if (mime.includes('json')) return FileJson
    if (mime.includes('html') || mime.includes('xml')) return FileCode
    if (mime.includes('csv')) return ClipboardList
    return FileText
  }

  return (
    <>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Add source */}
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <Plus className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
            </div>
            Add source
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Phishing email body"
                className="w-full px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--ansein-text-muted)] uppercase tracking-wider mb-1.5">
                Content
              </label>
              <textarea
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste raw threat intelligence text here — IOCs, malware descriptions, threat reports, etc."
                className="w-full px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm ansein-mono focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] resize-y"
              />
              <p className="text-[10px] text-[var(--ansein-text-dim)] mt-1">
                {content.length} characters
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleAdd}
                disabled={!content.trim() || adding}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-sm font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add text source
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-sm text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] disabled:opacity-60 transition-colors"
              >
                {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Upload file (5MB)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                className="hidden"
                accept=".txt,.md,.json,.csv,.log,.html,.xml,.eml"
              />
            </div>
          </div>
        </div>

        {/* Sources list */}
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
                <FileText className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
              </div>
              Sources
              <Badge color="slate">{sources.length}</Badge>
            </span>
          </h3>

          {sourcesQuery.isLoading ? (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          ) : sources.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5 text-[var(--ansein-primary)]" />}
              title="No sources yet"
              description="Add a text source or upload a file to populate this investigation."
              variant="branded"
              className="py-8"
            />
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {sources.map((s) => {
                const FileIcon = getFileIcon(s.mime_type)
                return (
                  <div
                    key={s.id}
                    onClick={() => setPreviewSource(s)}
                    className="p-3 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] hover:border-[var(--ansein-border-strong)] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--ansein-bg)] border border-[var(--ansein-border)] group-hover:border-[var(--ansein-border-strong)] transition-colors">
                            <FileIcon className="h-3 w-3 text-[var(--ansein-primary)]" />
                          </div>
                          <Badge color="primary">{s.source_type}</Badge>
                          <p className="text-sm font-medium text-[var(--ansein-text)] truncate group-hover:text-[var(--ansein-primary)] transition-colors">
                            {s.title}
                          </p>
                        </div>
                        <p className="text-[10px] text-[var(--ansein-text-dim)] mt-1.5 ansein-mono pl-8">
                          {(s.size_bytes / 1024).toFixed(1)} KB · {s.mime_type} · {formatRelative(s.created_at)}
                        </p>
                        {s.content && (
                          <p className="text-xs text-[var(--ansein-text-muted)] mt-2 line-clamp-2 ansein-mono pl-8">
                            {s.content.slice(0, 200)}
                            {s.content.length > 200 ? '…' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setPreviewSource(s)
                          }}
                          className="text-[var(--ansein-text-dim)] hover:text-[var(--ansein-primary)] transition-colors p-1"
                          title="View full source"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation()
                            if (confirm('Delete this source?')) deleteMutation.mutate(s.id)
                          }}
                          className="text-[var(--ansein-text-dim)] hover:text-rose-400 transition-colors p-1"
                          title="Delete source"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Source preview modal */}
      {previewSource && (
        <SourcePreviewModal source={previewSource} onClose={() => setPreviewSource(null)} />
      )}
    </>
  )
}

/* ============================================ Source Preview Modal */
function SourcePreviewModal({ source, onClose }: { source: Source; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function copyContent() {
    if (!source.content) return
    navigator.clipboard.writeText(source.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 ansein-fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl max-h-[85vh] ansein-card rounded-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--ansein-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30 flex-shrink-0">
              <FileText className="h-4 w-4 text-[var(--ansein-primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--ansein-text)] truncate">{source.title}</h2>
              <p className="text-[10px] text-[var(--ansein-text-dim)] ansein-mono">
                {source.source_type} · {(source.size_bytes / 1024).toFixed(1)} KB · {source.mime_type} · {formatDate(source.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {source.content && (
              <button
                onClick={copyContent}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--ansein-border)] bg-[var(--ansein-surface)] text-xs text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors p-1.5"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {source.content ? (
            <pre className="text-xs ansein-mono text-[var(--ansein-text-muted)] whitespace-pre-wrap break-words leading-relaxed">
              {source.content}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-8 w-8 text-[var(--ansein-text-dim)] mb-3" />
              <p className="text-sm text-[var(--ansein-text-muted)]">No previewable content</p>
              <p className="text-xs text-[var(--ansein-text-dim)] mt-1">
                This source may be a binary file or empty.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--ansein-border)] flex items-center justify-between">
          <p className="text-[10px] text-[var(--ansein-text-dim)] ansein-mono">
            Content hash: {source.content_hash?.slice(0, 16) || '—'}…
          </p>
          <p className="text-[10px] text-[var(--ansein-text-dim)]">
            Press <kbd className="ansein-mono text-[9px] px-1 py-0.5 rounded border border-[var(--ansein-border)] bg-[var(--ansein-surface)]">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  )
}

/* ============================================ Graph tab */
function GraphTab({ invId }: { invId: number }) {
  // The graph API returns nodes/edges with `created_at` ISO timestamps plus
  // minDate/maxDate on the root — those power the 4D temporal slider. We pass
  // the full payload straight through to GraphView (no client-side reshape).
  const { data, isLoading } = useQuery({
    queryKey: ['graph', invId],
    queryFn: () => http.get<{
      nodes: Array<{ id: number; createdAt?: string; created_at?: string }>
      edges: Array<{ source: number; target: number; createdAt?: string; created_at?: string }>
      minDate?: string | null
      maxDate?: string | null
    }>(`/graph/${invId}`),
  })

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="ansein-card rounded-xl">
        <EmptyState
          icon={<Network className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
          title="No graph data"
          description="Run the extraction pipeline to populate the knowledge graph. The graph visualises entities and their relationships."
          className="py-16"
        />
      </div>
    )
  }

  // The graph API serialises `createdAt` as `createdAt` (camelCase, from the
  // GraphNode interface). If a future version changes the wire format, we
  // normalise both snake_case and camelCase here so the GraphView stays
  // compatible.
  const normalised = {
    ...data,
    nodes: data.nodes.map((n) => ({
      ...n,
      createdAt: n.createdAt ?? (n as { created_at?: string }).created_at,
    })),
    edges: data.edges.map((e) => ({
      ...e,
      createdAt: e.createdAt ?? (e as { created_at?: string }).created_at,
    })),
  }

  return <GraphView data={normalised as any} height="calc(100vh - 360px)" />
}

/* ============================================ Entities tab */
function EntitiesTab({ invId }: { invId: number }) {
  const entitiesQuery = useQuery({
    queryKey: ['entities', invId],
    queryFn: () => http.get<Entity[]>(`/entities/${invId}`),
  })
  const relsQuery = useQuery({
    queryKey: ['relationships', invId],
    queryFn: () => http.get<Relationship[]>(`/entities/${invId}/relationships`),
  })

  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<string | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [maliciousOnly, setMaliciousOnly] = useState(false)
  const [minConfidence, setMinConfidence] = useState(0)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  if (entitiesQuery.isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    )
  }

  const entities = entitiesQuery.data || []
  const rels = relsQuery.data || []

  if (entities.length === 0) {
    return (
      <div className="ansein-card rounded-xl">
        <EmptyState
          icon={<Network className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
          title="No entities yet"
          description="Run the extraction pipeline to extract entities (IOCs, actors, malware, etc.) from your sources."
          className="py-16"
        />
      </div>
    )
  }

  // Group by type
  const byType = entities.reduce((acc, e) => {
    if (!acc[e.entity_type]) acc[e.entity_type] = []
    acc[e.entity_type].push(e)
    return acc
  }, {} as Record<string, Entity[]>)

  // Helper: check if an entity is malicious via enrichment
  function isEntityMalicious(e: Entity): boolean {
    const enrKeys = Object.keys(e.enrichment || {}).filter(
      (k) => e.enrichment[k] && Object.keys(e.enrichment[k] as object).length > 0
    )
    return enrKeys.some((k) => {
      const d = e.enrichment[k] as Record<string, unknown>
      return (typeof d?.malicious === 'number' && d.malicious > 0) ||
        (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
    })
  }

  // Filtered entities
  const filtered = entities.filter((e) => {
    if (activeType && e.entity_type !== activeType) return false
    if (maliciousOnly && !isEntityMalicious(e)) return false
    if (e.confidence * 100 < minConfidence) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return e.value.toLowerCase().includes(q) || e.entity_type.toLowerCase().includes(q)
    }
    return true
  })

  // Compute malicious count for the badge
  const maliciousCount = entities.filter(isEntityMalicious).length

  function copyEntityValue(e: Entity) {
    navigator.clipboard.writeText(e.value).then(() => {
      setCopiedId(e.id)
      setTimeout(() => setCopiedId(null), 1200)
    })
  }

  return (
    <div className="space-y-6">
      {/* Entity type statistics summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Object.entries(byType)
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 6)
          .map(([type, items]) => {
            const color = ENTITY_TYPE_COLORS[type] || '#64748b'
            const Icon = ENTITY_ICONS[type] || Network
            const pct = Math.round((items.length / entities.length) * 100)
            return (
              <button
                key={type}
                onClick={() => setActiveType(activeType === type ? null : type)}
                className={cn(
                  'ansein-card rounded-lg p-3 text-left transition-all relative overflow-hidden',
                  activeType === type ? 'ring-1 ring-[var(--ansein-primary)]' : 'ansein-card-hover'
                )}
              >
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono truncate">
                    {ENTITY_TYPE_LABELS[type] || type}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-xl font-bold ansein-mono text-[var(--ansein-text)]">
                    {items.length}
                  </span>
                  <span className="text-[10px] text-[var(--ansein-text-dim)]">{pct}%</span>
                </div>
              </button>
            )
          })}
      </div>

      {/* Search + filter row */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ansein-text-dim)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter entities by value or type…"
            className="w-full pl-9 pr-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)]"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--ansein-text-muted)]">
          <Badge color="primary">{filtered.length}/{entities.length}</Badge>
          <Badge color="slate">{rels.length} rels</Badge>
          {maliciousCount > 0 && (
            <Badge color="danger" dot>{maliciousCount} malicious</Badge>
          )}
          <button
            onClick={() => {
              const csv = [
                'type,value,confidence,method',
                ...filtered.map((e) => `${e.entity_type},"${e.value}",${(e.confidence * 100).toFixed(0)}%,${e.source_method}`)
              ].join('\n')
              navigator.clipboard.writeText(csv).then(() => toast.success('Copied CSV to clipboard'))
            }}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
            title="Copy filtered entities as CSV"
          >
            <ClipboardList className="h-3 w-3" />
            CSV
          </button>
          <button
            onClick={() => {
              const json = JSON.stringify(filtered.map((e) => ({
                type: e.entity_type,
                value: e.value,
                confidence: e.confidence,
                method: e.source_method,
                enrichment: e.enrichment,
              })), null, 2)
              navigator.clipboard.writeText(json).then(() => toast.success('Copied JSON to clipboard'))
            }}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
            title="Copy filtered entities as JSON"
          >
            <ArrowDownToLine className="h-3 w-3" />
            JSON
          </button>
        </div>
      </div>

      {/* Advanced filters: malicious toggle + confidence slider */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center ansein-card rounded-lg p-3">
        <button
          onClick={() => setMaliciousOnly((v) => !v)}
          disabled={maliciousCount === 0}
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
            maliciousOnly
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/40'
              : 'bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] border-[var(--ansein-border)] hover:text-rose-400 hover:border-rose-500/30',
            maliciousCount === 0 && 'opacity-40 cursor-not-allowed'
          )}
          title={maliciousCount === 0 ? 'No malicious entities detected' : 'Toggle malicious-only filter'}
        >
          <ShieldAlert className="h-3 w-3" />
          Malicious only
          {maliciousCount > 0 && (
            <span className="ansein-mono text-[10px] px-1 rounded bg-rose-500/20">{maliciousCount}</span>
          )}
        </button>
        <div className="h-5 w-px bg-[var(--ansein-border)] hidden sm:block" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono whitespace-nowrap">
            Min confidence
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="flex-1 h-1 accent-[var(--ansein-primary)] cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--ansein-primary) ${minConfidence}%, var(--ansein-border) ${minConfidence}%)`,
              borderRadius: '9999px',
            }}
          />
          <span className="ansein-mono text-xs text-[var(--ansein-text)] w-10 text-right tabular-nums">
            {minConfidence}%
          </span>
          {minConfidence > 0 && (
            <button
              onClick={() => setMinConfidence(0)}
              className="text-[10px] text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
              title="Reset confidence filter"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Type filter chips + view toggle */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveType(null)}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] ansein-mono border transition-colors',
              activeType === null
                ? 'bg-[var(--ansein-primary)] text-[var(--ansein-bg)] border-[var(--ansein-primary)]'
                : 'bg-[var(--ansein-surface)] text-[var(--ansein-text-muted)] border-[var(--ansein-border)] hover:text-[var(--ansein-text)]'
            )}
          >
            All · {entities.length}
          </button>
          {Object.entries(byType)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([type, items]) => {
              const color = ENTITY_TYPE_COLORS[type] || '#64748b'
              const isActive = activeType === type
              return (
                <button
                  key={type}
                  onClick={() => setActiveType(isActive ? null : type)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ansein-mono transition-all"
                  style={{
                    background: isActive ? `${color}30` : `${color}15`,
                    color,
                    border: `1px solid ${color}${isActive ? '60' : '30'}`,
                  }}
                >
                  {ENTITY_TYPE_LABELS[type] || type} · {items.length}
                </button>
              )
            })}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] flex-shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
              viewMode === 'grid'
                ? 'bg-[var(--ansein-primary)]/15 text-[var(--ansein-primary)]'
                : 'text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)]'
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-3 w-3" />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1',
              viewMode === 'table'
                ? 'bg-[var(--ansein-primary)]/15 text-[var(--ansein-primary)]'
                : 'text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)]'
            )}
            title="Table view"
          >
            <TableIcon className="h-3 w-3" />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      {/* Entity grid or table */}
      {filtered.length === 0 ? (
        <div className="ansein-card rounded-xl py-10 text-center text-sm text-[var(--ansein-text-muted)]">
          No entities match your filter.
        </div>
      ) : viewMode === 'table' ? (
        <VirtualizedEntityTable
          entities={filtered}
          onSelect={(id) => setSelectedEntityId(id)}
          height={560}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => {
            const Icon = ENTITY_ICONS[e.entity_type] || Network
            const color = ENTITY_TYPE_COLORS[e.entity_type] || '#64748b'
            const enrKeys = Object.keys(e.enrichment || {}).filter(
              (k) => e.enrichment[k] && Object.keys(e.enrichment[k] as object).length > 0
            )
            // Check for malicious enrichment
            const isMalicious = enrKeys.some((k) => {
              const d = e.enrichment[k] as Record<string, unknown>
              return (typeof d?.malicious === 'number' && d.malicious > 0) ||
                (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
            })
            return (
              <div
                key={e.id}
                onClick={() => setSelectedEntityId(e.id)}
                className="ansein-card ansein-card-hover rounded-lg p-4 cursor-pointer relative overflow-hidden"
              >
                {/* Type accent line at top */}
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(90deg, ${color}, ${color}40)` }}
                />
                {isMalicious && (
                  <div className="absolute top-2 right-2 flex h-1.5 w-1.5 rounded-full bg-rose-500" title="Malicious enrichment" />
                )}
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono">
                      {ENTITY_TYPE_LABELS[e.entity_type] || e.entity_type}
                    </p>
                    <p className="text-sm font-medium text-[var(--ansein-text)] truncate ansein-mono" title={e.value}>
                      {e.value}
                    </p>
                  </div>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation()
                      copyEntityValue(e)
                    }}
                    className="p-1 text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] transition-colors"
                    title="Copy value"
                  >
                    {copiedId === e.id ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--ansein-text-dim)]">
                  <span className="flex items-center gap-1">
                    via <span className="ansein-mono text-[var(--ansein-text-muted)]">{e.source_method}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 w-12 rounded-full bg-[var(--ansein-border)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(e.confidence * 100).toFixed(0)}%`,
                          background: color
                        }}
                      />
                    </div>
                    <span className="ansein-mono">{(e.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {enrKeys.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {enrKeys.map((k) => {
                      const d = e.enrichment[k] as Record<string, unknown>
                      const mal = (typeof d?.malicious === 'number' && d.malicious > 0) ||
                        (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
                      return (
                        <span
                          key={k}
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded ansein-mono',
                            mal
                              ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                              : 'bg-teal-500/10 border border-teal-500/20 text-teal-300'
                          )}
                        >
                          {k}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Relationships table */}
      {rels.length > 0 && (
        <div className="ansein-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--ansein-primary)]" />
            Relationships
            <Badge color="slate">{rels.length}</Badge>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ansein-border)]">
                  <th className="text-left text-[10px] uppercase tracking-wider text-[var(--ansein-text-dim)] py-2 pr-4">Source</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[var(--ansein-text-dim)] py-2 pr-4">Relation</th>
                  <th className="text-left text-[10px] uppercase tracking-wider text-[var(--ansein-text-dim)] py-2 pr-4">Target</th>
                  <th className="text-right text-[10px] uppercase tracking-wider text-[var(--ansein-text-dim)] py-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {rels.slice(0, 50).map((r) => {
                  const src = entities.find((e) => e.id === r.source_id)
                  const tgt = entities.find((e) => e.id === r.target_id)
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--ansein-border)] last:border-0 hover:bg-[var(--ansein-surface)]/40 transition-colors"
                    >
                      <td className="py-2 pr-4 ansein-mono text-xs text-[var(--ansein-text)]">
                        <button
                          onClick={() => src && setSelectedEntityId(src.id)}
                          className="hover:underline truncate text-left"
                          style={{ color: ENTITY_TYPE_COLORS[src?.entity_type || ''] }}
                        >
                          {src?.value || `#${r.source_id}`}
                        </button>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] ansein-mono">
                          {r.relation_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 ansein-mono text-xs text-[var(--ansein-text)]">
                        <button
                          onClick={() => tgt && setSelectedEntityId(tgt.id)}
                          className="hover:underline truncate text-left"
                          style={{ color: ENTITY_TYPE_COLORS[tgt?.entity_type || ''] }}
                        >
                          {tgt?.value || `#${r.target_id}`}
                        </button>
                      </td>
                      <td className="py-2 text-right ansein-mono text-xs text-[var(--ansein-text-muted)]">
                        {r.weight.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rels.length > 50 && (
              <p className="text-xs text-[var(--ansein-text-dim)] mt-2 text-center">
                Showing first 50 of {rels.length} relationships
              </p>
            )}
          </div>
        </div>
      )}

      {/* Entity detail modal */}
      <EntityDetailModal
        entityId={selectedEntityId}
        investigationId={invId}
        onClose={() => setSelectedEntityId(null)}
      />
    </div>
  )
}

/* ============================================ Analysis tab */
function AnalysisTab({ invId }: { invId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analysis', invId],
    queryFn: () => http.get<Analysis>(`/analysis/${invId}`),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="ansein-card rounded-xl">
        <EmptyState
          icon={<Lightbulb className="h-6 w-6 text-[var(--ansein-text-dim)]" />}
          title="No analysis yet"
          description="Run the extraction pipeline to generate a cognitive threat analysis. The analysis includes a narrative, severity score, Admiralty code, and recommendations."
          className="py-16"
        />
      </div>
    )
  }

  const actor = data.actor_hypothesis as {
    actor?: string
    confidence?: number
    motivation?: string
    origin?: string
    reasoning?: string
  }
  const adm = admiraltyLabel(data.admiralty_code)
  const severityTier = data.severity_score >= 70 ? 'HIGH' : data.severity_score >= 40 ? 'MEDIUM' : data.severity_score > 0 ? 'LOW' : 'NONE'
  const severityColor = data.severity_score >= 70 ? '#f43f5e' : data.severity_score >= 40 ? '#f59e0b' : data.severity_score > 0 ? '#10b981' : '#64748b'

  // Normalize actor confidence (0-1 or 0-100 scale)
  const actorConf = actor?.confidence || 0
  const actorConfDisplay = actorConf > 1 ? actorConf : actorConf * 100

  return (
    <div className="space-y-6">
      {/* Severity + Admiralty + Model row */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="ansein-card rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: severityColor }} />
          <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-3">Severity score</p>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold ansein-mono" style={{ color: severityColor }}>
              {data.severity_score.toFixed(0)}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-md mb-1.5"
              style={{ background: `${severityColor}20`, color: severityColor, border: `1px solid ${severityColor}40` }}
            >
              {severityTier}
            </span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-[var(--ansein-border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${data.severity_score}%`, background: `linear-gradient(90deg, ${severityColor}cc, ${severityColor})` }}
            />
          </div>
        </div>
        <div className="ansein-card rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-[var(--ansein-primary)]" />
          <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-3">Admiralty code</p>
          <p className={cn('text-3xl font-bold ansein-mono', adm.color)}>{data.admiralty_code}</p>
          <p className={cn('text-xs mt-2 leading-relaxed', adm.color)}>{adm.label}</p>
        </div>
        <div className="ansein-card rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-3">Analysis model</p>
          <p className="text-sm font-medium text-[var(--ansein-text)] ansein-mono flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[var(--ansein-primary)]" />
            {data.model_used || 'heuristic'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[10px] text-[var(--ansein-text-dim)] mb-1">Confidence</p>
              <div className="h-1.5 rounded-full bg-[var(--ansein-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--ansein-primary)]"
                  style={{ width: `${(data.confidence * 100).toFixed(0)}%` }}
                />
              </div>
            </div>
            <span className="text-xs ansein-mono text-[var(--ansein-text-muted)]">{(data.confidence * 100).toFixed(0)}%</span>
          </div>
          <p className="text-[10px] text-[var(--ansein-text-dim)] mt-2">
            {data.tokens_used.toLocaleString()} tokens consumed
          </p>
        </div>
      </div>

      {/* Narrative */}
      {data.narrative && (
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <Sparkles className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
            </div>
            Threat narrative
          </h3>
          <Markdown content={data.narrative} />
        </div>
      )}

      {/* Actor hypothesis */}
      {actor && Object.keys(actor).length > 0 && (
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/15 border border-rose-500/30">
              <Users className="h-3.5 w-3.5 text-rose-400" />
            </div>
            Actor hypothesis
          </h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Identified actor</p>
              <p className="text-[var(--ansein-text)] font-semibold">{actor.actor || 'Unknown'}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--ansein-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${actorConfDisplay.toFixed(0)}%`,
                      background: actorConfDisplay >= 70 ? '#10b981' : actorConfDisplay >= 40 ? '#f59e0b' : '#64748b'
                    }}
                  />
                </div>
                <span className="text-xs ansein-mono text-[var(--ansein-text-muted)]">{actorConfDisplay.toFixed(0)}%</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Origin</p>
              <p className="text-[var(--ansein-text)]">{actor.origin || 'Unknown'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Motivation</p>
              <p className="text-[var(--ansein-text-muted)]">{actor.motivation || 'Unknown'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1">Reasoning</p>
              <Markdown content={actor.reasoning || 'No reasoning provided.'} />
            </div>
          </div>
        </div>
      )}

      {/* Attack Hypotheses */}
      {data.hypotheses && data.hypotheses.length > 0 && (
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/15 border border-rose-500/30">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            </div>
            Attack hypotheses
          </h3>
          <div className="space-y-3">
            {data.hypotheses.map((h, i) => {
              const confColor = h.confidence >= 70 ? '#f43f5e' : h.confidence >= 40 ? '#f59e0b' : '#64748b'
              return (
                <div
                  key={i}
                  className="rounded-lg p-4 bg-[var(--ansein-surface)] border border-[var(--ansein-border)] relative overflow-hidden"
                  style={{ borderLeft: `3px solid ${confColor}` }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold text-[var(--ansein-text)]">{h.scenario}</p>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ansein-mono flex-shrink-0"
                      style={{ background: `${confColor}20`, color: confColor, border: `1px solid ${confColor}40` }}
                    >
                      {h.confidence}%
                    </span>
                  </div>
                  {h.reasoning && (
                    <div className="text-xs text-[var(--ansein-text-muted)] leading-relaxed mb-2">
                      <Markdown content={h.reasoning} />
                    </div>
                  )}
                  {h.next_steps && h.next_steps.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--ansein-border)]">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--ansein-text-dim)] ansein-mono mb-1.5">
                        Recommended next steps
                      </p>
                      <ol className="space-y-1">
                        {h.next_steps.map((step, j) => (
                          <li key={j} className="flex items-start gap-2 text-xs text-[var(--ansein-text-muted)]">
                            <span className="flex h-4 w-4 items-center justify-center rounded bg-[var(--ansein-bg)] border border-[var(--ansein-border)] ansein-mono text-[9px] text-[var(--ansein-primary)] flex-shrink-0 mt-0.5">
                              {j + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="ansein-card rounded-xl p-6">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 border border-amber-500/30">
              <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
            </div>
            Recommendations
          </h3>
          <ul className="space-y-3">
            {data.recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] ansein-mono text-[10px] text-[var(--ansein-primary)] flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <Markdown content={r} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Generated at */}
      <div className="flex items-center justify-center gap-2 text-xs text-[var(--ansein-text-dim)]">
        <Cpu className="h-3 w-3" />
        Analysis generated {formatDate(data.created_at)} by AnseIn cognitive engine
      </div>
    </div>
  )
}

/* ============================================ Copilot inline tab */
function CopilotInline({
  invId,
  invTitle,
  sessionId,
  onSessionCreated,
}: {
  invId: number
  invTitle: string
  sessionId: number | null
  onSessionCreated: (id: number) => void
}) {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Voice input: snapshot of the input value when listening started, so we
  // can append transcribed text rather than overwriting whatever the analyst
  // had already typed.
  const voiceAnchorRef = useRef('')

  useEffect(() => {
    if (!currentSessionId) return
    http.get<ChatMessage[]>(`/copilot/sessions/${currentSessionId}/messages`).then((msgs) => {
      setMessages(msgs)
    }).catch(() => {
      // ignore
    })
  }, [currentSessionId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    voiceAnchorRef.current = ''
    setSending(true)

    // Optimistic add user message
    setMessages((m) => [
      ...m,
      {
        id: Date.now(),
        role: 'user',
        content: userMsg,
        citations: [],
        tokens_used: 0,
        created_at: new Date().toISOString(),
      },
    ])

    try {
      const resp = await http.post<{
        session_id: number
        message: ChatMessage
      }>('/copilot/ask', {
        session_id: currentSessionId || undefined,
        investigation_id: invId,
        message: userMsg,
      })
      if (!currentSessionId) {
        setCurrentSessionId(resp.session_id)
        onSessionCreated(resp.session_id)
        qc.invalidateQueries({ queryKey: ['copilot-sessions'] })
      }
      setMessages((m) => [...m, resp.message])
    } catch (err) {
      const e = err as Error
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: 'assistant',
          content: `Sorry, I hit an error: ${e.message}`,
          citations: [],
          tokens_used: 0,
          created_at: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-360px)] min-h-[500px]">
      <div className="ansein-card rounded-xl flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--ansein-border)] flex items-center gap-2">
          <Bot className="h-4 w-4 text-[var(--ansein-primary)]" />
          <div>
            <p className="text-sm font-medium text-[var(--ansein-text)]">Investigation Copilot</p>
            <p className="text-[10px] text-[var(--ansein-text-dim)]">
              Grounded in "{invTitle}" · {currentSessionId ? 'session active' : 'new session'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ansein-surface)] border border-[var(--ansein-border)] mb-3">
                <Bot className="h-5 w-5 text-[var(--ansein-primary)]" />
              </div>
              <p className="text-sm font-medium text-[var(--ansein-text)]">Ask the Copilot</p>
              <p className="text-xs text-[var(--ansein-text-muted)] mt-1 max-w-sm">
                I can answer questions about this investigation's entities, enrichment, and analysis. Try:
              </p>
              <div className="mt-4 space-y-1.5">
                {[
                  'What threats are present in this investigation?',
                  'Which IOCs have malicious enrichment data?',
                  'Summarise the actor hypothesis.',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="block text-xs text-left px-3 py-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors w-80 max-w-full"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'flex gap-3',
                  m.role === 'user' ? 'flex-row-reverse' : ''
                )}
              >
                <div
                  className={cn(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                    m.role === 'user'
                      ? 'bg-[var(--ansein-primary)] text-[var(--ansein-bg)]'
                      : 'bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-primary)]'
                  )}
                >
                  {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={cn(
                    'flex-1 max-w-[80%] px-3.5 py-2.5 rounded-lg text-sm leading-relaxed',
                    m.role === 'user'
                      ? 'bg-[var(--ansein-primary)]/10 border border-[var(--ansein-primary)]/20 text-[var(--ansein-text)]'
                      : 'bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text)]'
                  )}
                >
                  {m.role === 'assistant' ? (
                    <Markdown content={m.content} />
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--ansein-border)] flex flex-wrap gap-1">
                      <span className="text-[10px] text-[var(--ansein-text-dim)]">Cites:</span>
                      {m.citations.slice(0, 5).map((c, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--ansein-bg)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] ansein-mono">
                          {c.length > 24 ? c.slice(0, 22) + '…' : c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-primary)]">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="bg-[var(--ansein-surface)] border border-[var(--ansein-border)] rounded-lg px-3.5 py-2.5 text-sm text-[var(--ansein-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-2" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[var(--ansein-border)]">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about this investigation (type or speak)…"
              className="flex-1 px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none focus:border-[var(--ansein-primary)] focus:ring-1 focus:ring-[var(--ansein-primary)] resize-none max-h-32"
              style={{ minHeight: '38px' }}
            />
            <VoiceInputButton
              disabled={sending}
              onTranscript={(interim) => {
                if (!voiceAnchorRef.current && !input) {
                  voiceAnchorRef.current = input
                }
                const base = voiceAnchorRef.current || input
                const merged = base ? `${base} ${interim}`.trim() : interim
                setInput(merged)
              }}
              onFinal={(finalChunk) => {
                const base = voiceAnchorRef.current || input
                voiceAnchorRef.current = base ? `${base} ${finalChunk}`.trim() : finalChunk
                setInput(voiceAnchorRef.current)
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-[var(--ansein-text-dim)] mt-1.5 text-center">
            Press Enter to send · Shift+Enter for new line · Click the mic to speak · Answers are grounded in this investigation's data only.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ============================================ Notes Tab */
function NotesTab({ invId }: { invId: number }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const notesQuery = useQuery({
    queryKey: ['notes', invId],
    queryFn: () => http.get<{ items: Note[]; total: number }>(`/investigations/${invId}/notes`),
  })

  const createMutation = useMutation({
    mutationFn: (body: string) =>
      http.post<Note>(`/investigations/${invId}/notes`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', invId] })
      setDraft('')
      toast.success('Note added')
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to add note')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ noteId, body, pinned }: { noteId: number; body?: string; pinned?: boolean }) =>
      http.patch(`/investigations/${invId}/notes/${noteId}`, {
        ...(body !== undefined ? { body } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', invId] })
      setEditingId(null)
      setEditBody('')
      toast.success('Note updated')
    },
    onError: (err) => {
      const e = err as Error
      toast.error(e.message || 'Failed to update note')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => http.delete(`/investigations/${invId}/notes/${noteId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes', invId] })
      toast.success('Note deleted')
    },
  })

  const notes = notesQuery.data?.items || []
  const pinnedNotes = notes.filter((n) => n.pinned)
  const otherNotes = notes.filter((n) => !n.pinned)

  function handleCreate() {
    const trimmed = draft.trim()
    if (!trimmed) return
    createMutation.mutate(trimmed)
  }

  function startEdit(note: Note) {
    setEditingId(note.id)
    setEditBody(note.body)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function saveEdit() {
    if (editingId === null) return
    const trimmed = editBody.trim()
    if (!trimmed) return
    updateMutation.mutate({ noteId: editingId, body: trimmed })
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Composer */}
        <div className="ansein-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
              <StickyNote className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
            </div>
            <h3 className="text-sm font-semibold text-[var(--ansein-text)]">Add a note</h3>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Capture an observation, hypothesis, link, or follow-up. Notes are visible to anyone with access to this investigation."
            rows={4}
            className="w-full px-3 py-2.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm text-[var(--ansein-text)] placeholder:text-[var(--ansein-text-dim)] focus:outline-none focus:border-[var(--ansein-primary)] resize-y min-h-[100px]"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-[var(--ansein-text-dim)]">
              {draft.length} / 10000 chars · Markdown supported
            </p>
            <button
              onClick={handleCreate}
              disabled={!draft.trim() || createMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-xs font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Post note
            </button>
          </div>
        </div>

        {/* Notes list */}
        {notesQuery.isLoading ? (
          <div className="py-12 flex justify-center">
            <Spinner />
          </div>
        ) : notes.length === 0 ? (
          <div className="ansein-card rounded-xl">
            <EmptyState
              icon={<StickyNote className="h-5 w-5 text-[var(--ansein-primary)]" />}
              title="No notes yet"
              description="Use notes to capture observations, hypotheses, and analyst-to-analyst context that doesn't fit elsewhere."
              variant="branded"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {pinnedNotes.length > 0 && (
              <div className="space-y-3">
                <p className="px-1 text-[10px] uppercase tracking-widest text-amber-400/80 ansein-mono flex items-center gap-1.5">
                  <Pin className="h-3 w-3" />
                  Pinned
                </p>
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    editing={editingId === note.id}
                    editBody={editBody}
                    textareaRef={textareaRef}
                    onEditBodyChange={setEditBody}
                    onStartEdit={() => startEdit(note)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => { setEditingId(null); setEditBody('') }}
                    onDelete={() => deleteMutation.mutate(note.id)}
                    onTogglePin={() =>
                      updateMutation.mutate({ noteId: note.id, pinned: !note.pinned })
                    }
                    saving={updateMutation.isPending}
                  />
                ))}
              </div>
            )}
            {otherNotes.length > 0 && (
              <div className="space-y-3">
                {pinnedNotes.length > 0 && (
                  <p className="px-1 text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono">
                    All notes
                  </p>
                )}
                {otherNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    editing={editingId === note.id}
                    editBody={editBody}
                    textareaRef={textareaRef}
                    onEditBodyChange={setEditBody}
                    onStartEdit={() => startEdit(note)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => { setEditingId(null); setEditBody('') }}
                    onDelete={() => deleteMutation.mutate(note.id)}
                    onTogglePin={() =>
                      updateMutation.mutate({ noteId: note.id, pinned: !note.pinned })
                    }
                    saving={updateMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="space-y-6">
        <div className="ansein-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            Analyst notes
          </h3>
          <p className="text-xs text-[var(--ansein-text-muted)] leading-relaxed">
            Notes are an enduring record of analyst reasoning. Use them to capture:
          </p>
          <ul className="mt-3 space-y-2 text-xs text-[var(--ansein-text-muted)]">
            <li className="flex gap-2">
              <span className="text-amber-400 flex-shrink-0">·</span>
              Hypotheses and confidence levels
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 flex-shrink-0">·</span>
              Links to external intel feeds
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 flex-shrink-0">·</span>
              Follow-up actions or owners
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400 flex-shrink-0">·</span>
              Caveats and false-positive notes
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-[var(--ansein-border)] grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold ansein-mono text-[var(--ansein-text)]">
                {notes.length}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                Total
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold ansein-mono text-amber-400">
                {pinnedNotes.length}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                Pinned
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------- Note Card */
function NoteCard({
  note,
  editing,
  editBody,
  textareaRef,
  onEditBodyChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onTogglePin,
  saving,
}: {
  note: Note
  editing: boolean
  editBody: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onEditBodyChange: (v: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
  saving: boolean
}) {
  const isEdited = new Date(note.updated_at).getTime() > new Date(note.created_at).getTime() + 1000
  return (
    <div
      className={cn(
        'ansein-card rounded-xl p-5 relative overflow-hidden transition-colors',
        note.pinned && 'border-amber-500/30'
      )}
    >
      {note.pinned && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/60" />
      )}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ansein-primary)] to-[var(--ansein-primary-hover)] text-[var(--ansein-bg)] text-xs font-semibold flex-shrink-0">
            {note.author_name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--ansein-text)] truncate">
              {note.author_name}
            </p>
            <p className="text-[10px] text-[var(--ansein-text-dim)] flex items-center gap-1.5">
              {formatRelative(note.created_at)}
              {isEdited && <span className="italic">· edited</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onTogglePin}
            disabled={saving}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              note.pinned
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-[var(--ansein-text-dim)] hover:text-amber-400 hover:bg-[var(--ansein-surface)]'
            )}
            title={note.pinned ? 'Unpin note' : 'Pin note to top'}
          >
            {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          {!editing && (
            <button
              onClick={onStartEdit}
              className="p-1.5 rounded-md text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] hover:bg-[var(--ansein-surface)] transition-colors"
              title="Edit note"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Delete this note?')) onDelete()
            }}
            className="p-1.5 rounded-md text-[var(--ansein-text-dim)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Delete note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={editBody}
            onChange={(e) => onEditBodyChange(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-sm text-[var(--ansein-text)] focus:outline-none focus:border-[var(--ansein-primary)] resize-y min-h-[100px]"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={onCancelEdit}
              className="px-2.5 py-1 rounded-md text-xs text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSaveEdit}
              disabled={saving || !editBody.trim()}
              className="px-2.5 py-1 rounded-md bg-[var(--ansein-primary)] text-[var(--ansein-bg)] text-xs font-medium hover:bg-[var(--ansein-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-[var(--ansein-text-muted)] leading-relaxed whitespace-pre-wrap break-words">
          {note.body}
        </div>
      )}
    </div>
  )
}

/* ============================================ Activity Tab */
const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  'investigation.pipeline.start': Play,
  'investigation.pipeline.complete': CheckCircle2,
  'investigation.pipeline.failed': AlertTriangle,
  'investigation.duplicate': CopyPlus,
  'investigation.star': Star,
  'investigation.unstar': Star,
  'investigation.delete': Trash2,
  'source.add': FileText,
  'source.delete': Trash2,
  'note.create': StickyNote,
  'note.delete': StickyNote,
  'note.update': StickyNote,
  'copilot.ask': Bot,
}

const ACTIVITY_COLORS: Record<string, string> = {
  'investigation.pipeline.start': '#f59e0b',
  'investigation.pipeline.complete': '#10b981',
  'investigation.pipeline.failed': '#f43f5e',
  'investigation.duplicate': '#a78bfa',
  'investigation.star': '#f59e0b',
  'investigation.unstar': '#64748b',
  'investigation.delete': '#f43f5e',
  'source.add': '#0d9488',
  'source.delete': '#f43f5e',
  'note.create': '#06b6d4',
  'note.delete': '#f43f5e',
  'note.update': '#06b6d4',
  'copilot.ask': '#8b5cf6',
}

function activityLabel(action: string): string {
  const map: Record<string, string> = {
    'investigation.pipeline.start': 'Pipeline started',
    'investigation.pipeline.complete': 'Pipeline completed',
    'investigation.pipeline.failed': 'Pipeline failed',
    'investigation.duplicate': 'Investigation duplicated',
    'investigation.star': 'Starred investigation',
    'investigation.unstar': 'Removed star',
    'investigation.delete': 'Investigation deleted',
    'source.add': 'Source added',
    'source.delete': 'Source removed',
    'note.create': 'Note created',
    'note.delete': 'Note deleted',
    'note.update': 'Note updated',
    'copilot.ask': 'Copilot queried',
  }
  return map[action] || action.split(/[._]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function ActivityTab({ invId }: { invId: number }) {
  const query = useQuery({
    queryKey: ['investigation-activity', invId],
    queryFn: () => http.get<{ items: AuditEntry[]; total: number }>(`/investigations/${invId}/activity`),
    refetchInterval: 30_000,
  })

  const items = query.data?.items || []

  // Compute action breakdown for stats
  const actionBreakdown = items.reduce((acc, i) => {
    acc[i.action] = (acc[i.action] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Group items by day for timeline
  const dayBuckets: Record<string, AuditEntry[]> = {}
  for (const item of items) {
    const d = new Date(item.created_at)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    if (!dayBuckets[key]) dayBuckets[key] = []
    dayBuckets[key].push(item)
  }
  const dayKeys = Object.keys(dayBuckets).sort().reverse()

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {/* Header card */}
        <div className="ansein-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--ansein-primary)]/15 border border-[var(--ansein-primary)]/30">
                <History className="h-3.5 w-3.5 text-[var(--ansein-primary)]" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ansein-text)]">Activity timeline</h3>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono">
              {items.length} events
            </span>
          </div>
          <p className="text-xs text-[var(--ansein-text-muted)] mb-4">
            Tamper-evident record of all actions taken on this investigation.
          </p>

          {query.isLoading ? (
            <div className="py-12 flex justify-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5 text-[var(--ansein-primary)]" />}
              title="No activity yet"
              description="Actions taken on this investigation — adding sources, running the pipeline, posting notes — will appear here in chronological order."
              variant="branded"
            />
          ) : (
            <div className="space-y-6">
              {dayKeys.map((dayKey) => {
                const dayItems = dayBuckets[dayKey]
                const dayDate = new Date(dayKey + 'T00:00:00')
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const yesterday = new Date(today.getTime() - 86400000)
                const label =
                  dayDate.getTime() === today.getTime()
                    ? 'Today'
                    : dayDate.getTime() === yesterday.getTime()
                    ? 'Yesterday'
                    : dayDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                return (
                  <div key={dayKey}>
                    <p className="px-1 text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)] ansein-mono mb-3 flex items-center gap-2">
                      <span className="h-px flex-1 bg-[var(--ansein-border)]" />
                      {label}
                      <span className="text-[var(--ansein-text-dim)]/60">· {dayItems.length}</span>
                      <span className="h-px flex-1 bg-[var(--ansein-border)]" />
                    </p>
                    <div className="relative pl-6">
                      {/* Vertical timeline line */}
                      <div className="absolute left-[11px] top-1 bottom-1 w-px bg-[var(--ansein-border)]" />
                      <div className="space-y-3">
                        {dayItems.map((entry) => {
                          const Icon = ACTIVITY_ICONS[entry.action] || Activity
                          const color = ACTIVITY_COLORS[entry.action] || '#64748b'
                          const meta = entry.extra_metadata || {}
                          return (
                            <div key={entry.id} className="relative">
                              {/* Node on timeline */}
                              <div
                                className="absolute -left-6 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-[var(--ansein-bg)]"
                                style={{ borderColor: color }}
                              >
                                <Icon className="h-3 w-3" style={{ color }} />
                              </div>
                              <div className="ansein-card rounded-lg p-3 ml-2">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-[var(--ansein-text)] truncate">
                                      {activityLabel(entry.action)}
                                    </p>
                                    <p className="text-[10px] text-[var(--ansein-text-dim)] ansein-mono mt-0.5">
                                      {entry.action}
                                    </p>
                                  </div>
                                  <span className="text-[10px] text-[var(--ansein-text-dim)] whitespace-nowrap flex-shrink-0">
                                    {formatRelative(entry.created_at)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  {entry.ip_address && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)] ansein-mono">
                                      <Globe className="h-2 w-2" />
                                      {entry.ip_address}
                                    </span>
                                  )}
                                  {typeof meta.source_type === 'string' && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)] ansein-mono">
                                      {meta.source_type}
                                    </span>
                                  )}
                                  {typeof meta.severity_score === 'number' && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ansein-mono"
                                      style={{
                                        background: `${meta.severity_score >= 70 ? '#f43f5e' : meta.severity_score >= 40 ? '#f59e0b' : '#10b981'}20`,
                                        color: meta.severity_score >= 70 ? '#f43f5e' : meta.severity_score >= 40 ? '#f59e0b' : '#10b981',
                                      }}
                                    >
                                      sev {Math.round(meta.severity_score as number)}
                                    </span>
                                  )}
                                  {typeof meta.size_bytes === 'number' && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-dim)] ansein-mono">
                                      {formatBytes(meta.size_bytes as number)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel: action breakdown */}
      <div className="space-y-6">
        <div className="ansein-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-4 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            Action breakdown
          </h3>
          {items.length === 0 ? (
            <p className="text-xs text-[var(--ansein-text-dim)] text-center py-4">
              No activity to summarise
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(actionBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([action, count]) => {
                  const color = ACTIVITY_COLORS[action] || '#64748b'
                  const pct = Math.round((count / items.length) * 100)
                  return (
                    <div key={action} className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs text-[var(--ansein-text-muted)] flex-1 min-w-0 truncate">
                        {activityLabel(action)}
                      </span>
                      <span className="ansein-mono text-xs text-[var(--ansein-text)] flex-shrink-0">
                        {count}
                      </span>
                      <span className="ansein-mono text-[10px] text-[var(--ansein-text-dim)] w-8 text-right flex-shrink-0">
                        {pct}%
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        <div className="ansein-card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--ansein-text)] mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-[var(--ansein-primary)]" />
            Tamper-evident
          </h3>
          <p className="text-xs text-[var(--ansein-text-muted)] leading-relaxed">
            Activity is recorded to a write-once audit log. Events cannot be edited or deleted by users — only appended.
          </p>
          <div className="mt-3 pt-3 border-t border-[var(--ansein-border)] grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold ansein-mono text-[var(--ansein-text)]">
                {items.length}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                Total events
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold ansein-mono text-[var(--ansein-primary)]">
                {Object.keys(actionBreakdown).length}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[var(--ansein-text-dim)]">
                Action types
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* Helper: format bytes for activity feed */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ============================================ Entity Table View */
function EntityTableView({ entities, onSelect }: { entities: Entity[]; onSelect: (id: number) => void }) {
  return (
    <div className="ansein-card rounded-xl overflow-hidden">
      <div className="overflow-x-auto ansein-scrollbar">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--ansein-border)] bg-[var(--ansein-surface)]/50">
              <th className="text-left py-2.5 px-3 font-medium text-[var(--ansein-text-dim)] uppercase tracking-[0.15em] text-[10px]">Type</th>
              <th className="text-left py-2.5 px-3 font-medium text-[var(--ansein-text-dim)] uppercase tracking-[0.15em] text-[10px]">Value</th>
              <th className="text-left py-2.5 px-3 font-medium text-[var(--ansein-text-dim)] uppercase tracking-[0.15em] text-[10px]">Method</th>
              <th className="text-right py-2.5 px-3 font-medium text-[var(--ansein-text-dim)] uppercase tracking-[0.15em] text-[10px]">Confidence</th>
              <th className="text-left py-2.5 px-3 font-medium text-[var(--ansein-text-dim)] uppercase tracking-[0.15em] text-[10px]">Enrichment</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => {
              const color = ENTITY_TYPE_COLORS[e.entity_type] || '#64748b'
              const enrKeys = Object.keys(e.enrichment || {}).filter(
                (k) => e.enrichment[k] && Object.keys(e.enrichment[k] as object).length > 0
              )
              const isMalicious = enrKeys.some((k) => {
                const d = e.enrichment[k] as Record<string, unknown>
                return (typeof d?.malicious === 'number' && d.malicious > 0) ||
                  (typeof d?.abuse_score === 'number' && d.abuse_score >= 75)
              })
              return (
                <tr
                  key={e.id}
                  onClick={() => onSelect(e.id)}
                  className="border-b border-[var(--ansein-border)] last:border-0 hover:bg-[var(--ansein-surface)] cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 px-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] ansein-mono"
                      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
                    >
                      {ENTITY_TYPE_LABELS[e.entity_type] || e.entity_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="ansein-mono text-[var(--ansein-text)] group-hover:text-[var(--ansein-primary)] transition-colors break-all">
                      {e.value}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[var(--ansein-text-muted)] ansein-mono">{e.source_method}</td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="ansein-mono text-[var(--ansein-text)] tabular-nums">
                      {(e.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {enrKeys.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {isMalicious && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-rose-500/10 border border-rose-500/30 text-rose-400 ansein-mono">
                            <span className="h-1 w-1 rounded-full bg-rose-400" />
                            Malicious
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--ansein-text-dim)] ansein-mono">
                          {enrKeys.join(', ')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[var(--ansein-text-dim)]">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
