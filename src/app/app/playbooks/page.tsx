'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Workflow,
  Plus,
  Trash2,
  Power,
  Bell,
  Tag,
  Star,
  FileDown,
  Loader2,
  Check,
  AlertTriangle,
  ShieldAlert,
  Zap,
  X,
  GripVertical,
} from 'lucide-react'
import { http } from '@/lib/http'
import { useAuthStore, authUserRole } from '@/lib/auth-store'
import { Badge, Spinner, EmptyState } from '@/components/ansein/ui'
import { canManagePlaybooks } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ---------------------------------------------------------------- types
interface PlaybookAction {
  type: 'notify' | 'tag' | 'star' | 'export'
  params: Record<string, unknown>
}

interface PlaybookTrigger {
  type: 'severity_threshold' | 'entity_type' | 'alert_type' | 'always'
  value?: number | string
}

interface Playbook {
  id: number
  user_id: number
  name: string
  description: string
  trigger: PlaybookTrigger | null
  actions: PlaybookAction[]
  enabled: boolean
  created_at: string
  updated_at: string
}

const TRIGGER_TYPES: Array<{ value: PlaybookTrigger['type']; label: string; description: string }> = [
  { value: 'severity_threshold', label: 'Severity threshold', description: 'Fires when pipeline severity ≥ value' },
  { value: 'entity_type', label: 'Entity type present', description: 'Fires when an entity of the given type is extracted' },
  { value: 'alert_type', label: 'Alert type (webhook)', description: 'Fires when a webhook ingest carries this alert_type tag' },
  { value: 'always', label: 'Always', description: 'Fires on every completed pipeline run' },
]

const ACTION_TYPES: Array<{ value: PlaybookAction['type']; label: string; icon: typeof Bell; color: string }> = [
  { value: 'notify', label: 'Notify', icon: Bell, color: '#22d3ee' },
  { value: 'tag', label: 'Add tag', icon: Tag, color: '#f59e0b' },
  { value: 'star', label: 'Star investigation', icon: Star, color: '#facc15' },
  { value: 'export', label: 'Export JSON', icon: FileDown, color: '#a78bfa' },
]

const ENTITY_TYPES = [
  'threat_actor', 'malware', 'tool', 'technique', 'vulnerability',
  'ioc_ip', 'ioc_domain', 'ioc_url', 'ioc_hash', 'ioc_wallet',
  'target', 'location', 'identity',
]

const ALERT_TYPES = ['phishing', 'malware', 'c2', 'suspicious', 'custom']

// ---------------------------------------------------------------- page
export default function PlaybooksPage() {
  const user = useAuthStore((s) => s.user)
  const role = authUserRole(user)
  const canEdit = canManagePlaybooks(user)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const playbooksQuery = useQuery({
    queryKey: ['playbooks'],
    queryFn: () => http.get<{ items: Playbook[] }>('/playbooks'),
  })

  const toggleMutation = useMutation({
    mutationFn: async (p: Playbook) =>
      http.patch<Playbook>(`/playbooks/${p.id}`, { enabled: !p.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playbooks'] })
      toast.success('Playbook updated')
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => http.delete(`/playbooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playbooks'] })
      toast.success('Playbook deleted')
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to delete'),
  })

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="ansein-mono text-xs uppercase tracking-widest text-muted-foreground/50 mb-1">
            SOAR
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Playbooks
            {!canEdit && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-card border border-border text-muted-foreground align-middle">
                Read-only · {role}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated actions triggered when pipeline results match a condition.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New playbook
          </button>
        )}
      </div>

      {/* What is SOAR callout */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-lg bg-primary/[0.04] border border-primary/15">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 border border-primary/20 flex-shrink-0">
          <Zap className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Security Orchestration, Automation, and Response.</strong>{' '}
          Playbooks run automatically after every pipeline completion. Each playbook defines a <em>trigger</em> (e.g. severity ≥ 70)
          and a list of <em>actions</em> (notify, tag, star, export). When a trigger matches the pipeline result, the actions fire
          in order — no manual triage required.
        </div>
      </div>

      {playbooksQuery.isLoading ? (
        <div className="py-12 flex justify-center">
          <Spinner />
        </div>
      ) : playbooksQuery.data?.items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState
            icon={<Workflow className="h-6 w-6 text-muted-foreground/50" />}
            title="No playbooks yet"
            description="Create your first playbook to automate responses when pipeline results match a condition."
            className="py-16"
            action={
              canEdit ? (
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create playbook
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {playbooksQuery.data!.items.map((p) => (
            <PlaybookCard
              key={p.id}
              playbook={p}
              canEdit={canEdit}
              onToggle={() => toggleMutation.mutate(p)}
              onDelete={() => deleteMutation.mutate(p.id)}
              toggling={toggleMutation.isPending}
            />
          ))}
        </div>
      )}

      {showCreate && canEdit && (
        <CreatePlaybookModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['playbooks'] })
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- card
function PlaybookCard({
  playbook,
  canEdit,
  onToggle,
  onDelete,
  toggling,
}: {
  playbook: Playbook
  canEdit: boolean
  onToggle: () => void
  onDelete: () => void
  toggling: boolean
}) {
  const triggerMeta = TRIGGER_TYPES.find((t) => t.value === playbook.trigger?.type)
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-5 relative overflow-hidden transition-opacity',
        !playbook.enabled && 'opacity-60'
      )}
    >
      {!playbook.enabled && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[border]" />
      )}
      {playbook.enabled && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
      )}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 bg-primary/10 border border-primary/20 text-primary">
          <Workflow className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{playbook.name}</h3>
            {playbook.enabled ? (
              <Badge color="success" dot>Active</Badge>
            ) : (
              <Badge color="slate" dot>Disabled</Badge>
            )}
            <span className="text-[10px] text-muted-foreground/50 ansein-mono ml-auto">
              #{playbook.id}
            </span>
          </div>
          {playbook.description && (
            <p className="text-xs text-muted-foreground mb-3">{playbook.description}</p>
          )}

          {/* Trigger */}
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1">
              Trigger
            </p>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-card border border-border text-xs">
              <ShieldAlert className="h-3 w-3 text-amber-400" />
              <span className="text-muted-foreground">{triggerMeta?.label || 'No trigger'}</span>
              {playbook.trigger?.value !== undefined && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <code className="ansein-mono text-primary">
                    {String(playbook.trigger.value)}
                  </code>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1">
              Actions ({playbook.actions.length})
            </p>
            {playbook.actions.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic">No actions</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {playbook.actions.map((a, i) => {
                  const meta = ACTION_TYPES.find((m) => m.value === a.type)!
                  const Icon = meta.icon
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px]"
                      style={{
                        background: `${meta.color}10`,
                        borderColor: `${meta.color}30`,
                        color: meta.color,
                      }}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{meta.label}</span>
                      {a.params && Object.keys(a.params).length > 0 && (
                        <code className="ansein-mono opacity-70 ml-1">
                          {JSON.stringify(a.params)}
                        </code>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50 ansein-mono">
              Updated {new Date(playbook.updated_at).toLocaleString()}
            </span>
            {canEdit && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggle}
                  disabled={toggling}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors',
                    playbook.enabled
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/15'
                      : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                  )}
                  title={playbook.enabled ? 'Disable playbook' : 'Enable playbook'}
                >
                  {toggling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Power className="h-3 w-3" />
                  )}
                  {playbook.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border bg-rose-500/5 border-rose-500/20 text-rose-300 hover:bg-rose-500/10 transition-colors"
                  title="Delete playbook"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- create modal
function CreatePlaybookModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<PlaybookTrigger['type']>('severity_threshold')
  const [triggerValue, setTriggerValue] = useState<string>('70')
  const [actions, setActions] = useState<PlaybookAction[]>([
    { type: 'tag', params: { tag: 'high-severity' } },
  ])

  const createMutation = useMutation({
    mutationFn: async () => {
      const trigger: PlaybookTrigger | null =
        triggerType === 'always'
          ? { type: 'always' }
          : {
              type: triggerType,
              value:
                triggerType === 'severity_threshold'
                  ? Number(triggerValue)
                  : triggerValue,
            }
      return http.post<Playbook>('/playbooks', {
        name,
        description,
        trigger,
        actions,
        enabled: true,
      })
    },
    onSuccess: () => {
      toast.success('Playbook created')
      onCreated()
    },
    onError: (e) => toast.error((e as Error).message || 'Failed to create playbook'),
  })

  function addAction(type: PlaybookAction['type']) {
    const params: Record<string, unknown> = {}
    if (type === 'tag') params.tag = 'new-tag'
    if (type === 'notify') params.message = 'Playbook triggered'
    setActions((a) => [...a, { type, params }])
  }

  function updateAction(idx: number, patch: Partial<PlaybookAction>) {
    setActions((a) => a.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
  }

  function removeAction(idx: number) {
    setActions((a) => a.filter((_, i) => i !== idx))
  }

  function submit() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (triggerType === 'severity_threshold') {
      const n = Number(triggerValue)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast.error('Severity threshold must be 0–100')
        return
      }
    }
    if (triggerType !== 'always' && !triggerValue.trim()) {
      toast.error('Trigger value is required')
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto ansein-scrollbar">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            New playbook
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-card/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1.5">
              Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. High-severity auto-tag"
              className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this playbook do?"
              rows={2}
              className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1.5">
              Trigger
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {TRIGGER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTriggerType(t.value)
                    // Pre-fill a sensible default value when switching types.
                    if (t.value === 'severity_threshold') setTriggerValue('70')
                    else if (t.value === 'entity_type') setTriggerValue('ioc_ip')
                    else if (t.value === 'alert_type') setTriggerValue('phishing')
                  }}
                  className={cn(
                    'flex flex-col items-start px-3 py-2 rounded-md text-left border transition-all',
                    triggerType === t.value
                      ? 'bg-primary/10 border-primary/40 text-foreground'
                      : 'bg-card border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  <span className="text-xs font-medium">{t.label}</span>
                  <span className="text-[10px] text-muted-foreground/50 mt-0.5">{t.description}</span>
                </button>
              ))}
            </div>
            {triggerType !== 'always' && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50">
                  Value
                </label>
                {triggerType === 'severity_threshold' ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground ansein-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                ) : triggerType === 'entity_type' ? (
                  <select
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={triggerValue}
                    onChange={(e) => setTriggerValue(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {ALERT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] uppercase tracking-widest ansein-mono text-muted-foreground/50">
                Actions
              </label>
              <div className="flex items-center gap-1">
                {ACTION_TYPES.map((a) => {
                  const Icon = a.icon
                  return (
                    <button
                      key={a.value}
                      onClick={() => addAction(a.value)}
                      title={`Add ${a.label} action`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors"
                      style={{
                        background: `${a.color}10`,
                        borderColor: `${a.color}30`,
                        color: a.color,
                      }}
                    >
                      <Icon className="h-3 w-3" />
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  )
                })}
              </div>
            </div>
            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic px-3 py-2 rounded-md bg-card border border-border border-dashed">
                No actions yet. Use the buttons above to add one.
              </p>
            ) : (
              <div className="space-y-1.5">
                {actions.map((a, i) => {
                  const meta = ACTION_TYPES.find((m) => m.value === a.type)!
                  const Icon = meta.icon
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-md bg-card border border-border"
                    >
                      <GripVertical className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: meta.color }} />
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{meta.label}</span>
                      {/* Action-specific params */}
                      {a.type === 'tag' && (
                        <input
                          type="text"
                          value={(a.params.tag as string) || ''}
                          onChange={(e) => updateAction(i, { params: { ...a.params, tag: e.target.value } })}
                          placeholder="tag name"
                          className="flex-1 px-2 py-1 rounded bg-background border border-border text-xs ansein-mono text-foreground focus:outline-none focus:border-primary"
                        />
                      )}
                      {a.type === 'notify' && (
                        <input
                          type="text"
                          value={(a.params.message as string) || ''}
                          onChange={(e) => updateAction(i, { params: { ...a.params, message: e.target.value } })}
                          placeholder="notification message"
                          className="flex-1 px-2 py-1 rounded bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary"
                        />
                      )}
                      {a.type === 'star' && (
                        <span className="text-xs text-muted-foreground/50 italic flex-1">No parameters</span>
                      )}
                      {a.type === 'export' && (
                        <span className="text-xs text-muted-foreground/50 italic flex-1">Triggers a JSON export of the investigation</span>
                      )}
                      <button
                        onClick={() => removeAction(i)}
                        className="p-1 text-muted-foreground/50 hover:text-rose-400 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Validation hint */}
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/[0.04] border border-amber-500/15">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Playbooks run automatically after every pipeline completion for this workspace. The trigger is evaluated against the pipeline result; if it matches, all actions fire in order.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={createMutation.isPending || !name.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Create playbook
          </button>
        </div>
      </div>
    </div>
  )
}
