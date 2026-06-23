'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowSquareOut as ExternalLink, Bug, Check, Code, Copy, CreditCard, Crosshair, Globe, Graph as Network, Hash, Link as LinkIcon, MapPin, ShieldCheck, ShieldWarning as ShieldAlert, User, Users, Warning as AlertTriangle, Wrench, X } from '@phosphor-icons/react'
import { http } from '@/lib/http'
import { Badge, Spinner } from '@/components/ansein/ui'
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

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

interface EntityDetailModalProps {
  entityId: number | null
  investigationId: number
  onClose: () => void
}

interface EntityDetail {
  id: number
  entity_type: string
  value: string
  normalized: string
  confidence: number
  source_method: string
  enrichment: Record<string, Record<string, unknown>>
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

interface EntityBrief {
  id: number
  entity_type: string
  value: string
  confidence: number
}

export function EntityDetailModal({
  entityId,
  investigationId,
  onClose,
}: EntityDetailModalProps) {
  const [copied, setCopied] = useState(false)

  const entityQuery = useQuery({
    queryKey: ['entities', investigationId],
    queryFn: () => http.get<EntityDetail[]>(`/entities/${investigationId}`),
    enabled: entityId !== null,
  })
  const relsQuery = useQuery({
    queryKey: ['relationships', investigationId],
    queryFn: () => http.get<Relationship[]>(`/entities/${investigationId}/relationships`),
    enabled: entityId !== null,
  })

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (entityId !== null) {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  }, [entityId, onClose])

  if (entityId === null) return null

  const entity = entityQuery.data?.find((e) => e.id === entityId)
  if (!entity) {
    return (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center px-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative bg-card border border-border rounded-xl p-8 flex items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading entity…</p>
        </div>
      </div>
    )
  }

  const Icon = ENTITY_ICONS[entity.entity_type] || Network
  const color = ENTITY_TYPE_COLORS[entity.entity_type] || '#64748b'
  const enrKeys = Object.keys(entity.enrichment || {}).filter(
    (k) => entity.enrichment[k] && Object.keys(entity.enrichment[k] || {}).length > 0
  )

  // Find relationships involving this entity
  const allRels = relsQuery.data || []
  const allEntities = entityQuery.data || []
  const involved = allRels.filter((r) => r.source_id === entityId || r.target_id === entityId)
  const findOther = (r: Relationship): EntityBrief | undefined => {
    const otherId = r.source_id === entityId ? r.target_id : r.source_id
    return allEntities.find((e) => e.id === otherId)
  }

  function copyValue() {
    navigator.clipboard.writeText(entity!.value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Compute provider summary
  function providerSummary(name: string, data: Record<string, unknown>): { malicious: boolean; score?: number; summary: string } {
    const m = data.malicious as number | undefined
    const s = data.suspicious as number | undefined
    const abuse = data.abuse_score as number | undefined
    const rep = data.reputation as number | undefined
    const malicious = (typeof m === 'number' && m > 0) || (typeof abuse === 'number' && abuse >= 75)
    const score = typeof abuse === 'number' ? abuse : typeof m === 'number' ? m : undefined
    const parts: string[] = []
    if (typeof m === 'number' && m > 0) parts.push(`${m} malicious`)
    if (typeof s === 'number' && s > 0) parts.push(`${s} suspicious`)
    if (typeof abuse === 'number') parts.push(`${abuse}% abuse`)
    if (typeof rep === 'number') parts.push(`rep ${rep}`)
    return { malicious, score, summary: parts.join(' · ') || 'no verdicts' }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[10vh] px-4 pb-4 overflow-y-auto"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm ansein-fade-in" />
      <div
        className="relative w-full max-w-2xl bg-card border border-border rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b border-border flex items-start gap-3"
          style={{ background: `linear-gradient(135deg, ${color}10, transparent)` }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Badge color="slate">{ENTITY_TYPE_LABELS[entity.entity_type] || entity.entity_type}</Badge>
              <span className="text-[10px] ansein-mono uppercase tracking-widest text-muted-foreground/50">
                via {entity.source_method}
              </span>
              <span className="text-[10px] ansein-mono text-muted-foreground/50">
                conf {(entity.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-foreground ansein-mono truncate flex-1" title={entity.value}>
                {entity.value}
              </p>
              <button
                onClick={copyValue}
                className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                title="Copy value"
              >
                {copied ? <Check weight="duotone" className="h-3.5 w-3.5 text-emerald-400" /> : <Copy weight="duotone" className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-card transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X weight="duotone" className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
          {/* Enrichment */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2 flex items-center gap-1.5">
              <ShieldCheck weight="duotone" className="h-3.5 w-3.5" />
              Enrichment
              <Badge color="slate">{enrKeys.length} providers</Badge>
            </h3>
            {enrKeys.length === 0 ? (
              <div className="rounded-md bg-card border border-border p-4 text-xs text-muted-foreground">
                No enrichment data for this entity. Configure VirusTotal, AbuseIPDB, or Shodan API
                keys in Settings to populate enrichment on the next pipeline run.
              </div>
            ) : (
              <div className="space-y-2">
                {enrKeys.map((k) => {
                  const data = entity.enrichment[k]
                  const summary = providerSummary(k, data)
                  const ProvIcon = k === 'shodan' ? Globe : k === 'abuseipdb' ? AlertTriangle : ShieldCheck
                  return (
                    <div
                      key={k}
                      className="rounded-md bg-card border border-border p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ProvIcon
                            className={cn(
                              'h-3.5 w-3.5',
                              summary.malicious ? 'text-rose-400' : 'text-emerald-400'
                            )}
                          />
                          <span className="text-sm font-medium text-foreground capitalize">
                            {k}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'text-[10px] ansein-mono px-1.5 py-0.5 rounded',
                            summary.malicious
                              ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          )}
                        >
                          {summary.malicious ? 'MALICIOUS' : 'BENIGN'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground ansein-mono mb-2">
                        {summary.summary}
                      </p>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        {Object.entries(data)
                          .filter(([_, v]) => v !== '' && v !== null && v !== undefined && (!Array.isArray(v) || v.length > 0))
                          .slice(0, 8)
                          .map(([kk, vv]) => (
                            <div key={kk} className="flex flex-col">
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50">
                                {kk.replace(/_/g, ' ')}
                              </span>
                              <span className="text-foreground ansein-mono truncate" title={String(vv)}>
                                {Array.isArray(vv) ? vv.join(', ') : String(vv)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Relationships */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2 flex items-center gap-1.5">
              <Activity weight="duotone" className="h-3.5 w-3.5" />
              Relationships
              <Badge color="slate">{involved.length}</Badge>
            </h3>
            {involved.length === 0 ? (
              <div className="rounded-md bg-card border border-border p-4 text-xs text-muted-foreground">
                No relationships involving this entity were inferred from the source text.
              </div>
            ) : (
              <div className="space-y-1.5">
                {involved.slice(0, 20).map((r) => {
                  const other = findOther(r)
                  const isSource = r.source_id === entityId
                  const otherColor = ENTITY_TYPE_COLORS[other?.entity_type || ''] || '#64748b'
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border text-xs"
                    >
                      <span className="ansein-mono text-muted-foreground/50">
                        {isSource ? '→' : '←'}
                      </span>
                      <span className="ansein-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
                        {r.relation_type}
                      </span>
                      <span className="ansein-mono text-foreground truncate" title={other?.value}>
                        {other?.value || `#${isSource ? r.target_id : r.source_id}`}
                      </span>
                      <span className="ml-auto text-[10px] ansein-mono text-muted-foreground/50 flex-shrink-0">
                        w={r.weight.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
                {involved.length > 20 && (
                  <p className="text-[10px] text-muted-foreground/50 text-center pt-1">
                    Showing 20 of {involved.length}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Evidence (if any relationships have evidence snippets) */}
          {involved.some((r) => r.evidence) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2 flex items-center gap-1.5">
                <ExternalLink weight="duotone" className="h-3.5 w-3.5" />
                Evidence snippets
              </h3>
              <div className="space-y-2">
                {involved
                  .filter((r) => r.evidence)
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={`ev-${r.id}`}
                      className="rounded-md bg-card border-l-2 border-primary p-3"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">
                        {r.relation_type} · weight {r.weight.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground ansein-mono leading-relaxed">
                        "{r.evidence}"
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Meta */}
          <section className="pt-2 border-t border-border text-[10px] text-muted-foreground/50 flex items-center justify-between">
            <span>Entity ID #{entity.id}</span>
            <span>Extracted {formatRelative(entity.created_at)}</span>
          </section>
        </div>
      </div>
    </div>
  )
}
