/**
 * Export service — JSON, STIX 2.1, PDF (HTML-based for portability).
 * Ported from backend/app/services/export_service.py
 */
import { v5 as uuidv5 } from 'uuid'
import type { Entity, Investigation, Relationship, Source, AnalysisRun } from '@prisma/client'
import { safeParseJson } from '@/lib/api'

const STIX_NAMESPACE = 'a6f3c4d2-1b5e-4f8a-9c0b-7d2e3f5a8b9c'

interface ExportBundle {
  investigation: {
    id: number
    title: string
    description: string
    status: string
    severity_score: number
    tags: string[]
    created_at: string
    updated_at: string
  }
  sources: Array<{
    source_type: string
    title: string
    content: string
    content_hash: string
    created_at: string
  }>
  entities: Array<{
    id: number
    entity_type: string
    value: string
    confidence: number
    enrichment: Record<string, unknown>
    source_method: string
  }>
  relationships: Array<{
    source_id: number
    target_id: number
    relation_type: string
    weight: number
    evidence: string
  }>
  analysis: {
    narrative: string
    actor_hypothesis: Record<string, unknown>
    severity_score: number
    recommendations: string[]
    admiralty_code: string
    model_used: string
    created_at: string
  } | null
  exported_at: string
}

export function buildJsonExport(
  inv: Investigation,
  sources: Source[],
  entities: Entity[],
  rels: Relationship[],
  analysis: AnalysisRun | null
): ExportBundle {
  return {
    investigation: {
      id: inv.id,
      title: inv.title,
      description: inv.description,
      status: inv.status,
      severity_score: inv.severityScore,
      tags: safeParseJson<string[]>(inv.tags, []),
      created_at: inv.createdAt.toISOString(),
      updated_at: inv.updatedAt.toISOString(),
    },
    sources: sources.map((s) => ({
      source_type: s.sourceType,
      title: s.title,
      content: s.content,
      content_hash: s.contentHash,
      created_at: s.createdAt.toISOString(),
    })),
    entities: entities.map((e) => ({
      id: e.id,
      entity_type: e.entityType,
      value: e.value,
      confidence: e.confidence,
      enrichment: safeParseJson<Record<string, unknown>>(e.enrichment, {}),
      source_method: e.sourceMethod,
    })),
    relationships: rels.map((r) => ({
      source_id: r.sourceId,
      target_id: r.targetId,
      relation_type: r.relationType,
      weight: r.weight,
      evidence: r.evidence,
    })),
    analysis: analysis
      ? {
          narrative: analysis.narrative,
          actor_hypothesis: safeParseJson<Record<string, unknown>>(analysis.actorHypothesis, {}),
          severity_score: analysis.severityScore,
          recommendations: safeParseJson<string[]>(analysis.recommendations, []),
          admiralty_code: analysis.admiraltyCode,
          model_used: analysis.modelUsed,
          created_at: analysis.createdAt.toISOString(),
        }
      : null,
    exported_at: new Date().toISOString(),
  }
}

// --------------------------------------------------------- STIX 2.1
function stixId(type: string, intId: number): string {
  return `${type}--${uuidv5(String(intId), STIX_NAMESPACE)}`
}

function stixPattern(entityType: string, value: string): string {
  switch (entityType) {
    case 'ioc_ip':
      return `[ipv4-addr:value = '${value}']`
    case 'ioc_domain':
      return `[domain-name:value = '${value}']`
    case 'ioc_url':
      return `[url:value = '${value}']`
    case 'ioc_hash':
      return `[file:hashes.'SHA-256' = '${value}']`
    default:
      return `[x-ansein:${entityType} = '${value}']`
  }
}

function stixTypeFor(entityType: string): string {
  switch (entityType) {
    case 'ioc_ip':
    case 'ioc_domain':
    case 'ioc_url':
    case 'ioc_hash':
    case 'ioc_wallet':
      return 'indicator'
    case 'malware':
      return 'malware'
    case 'threat_actor':
      return 'threat-actor'
    case 'tool':
      return 'tool'
    case 'vulnerability':
      return 'vulnerability'
    case 'target':
    case 'identity':
      return 'identity'
    case 'location':
      return 'location'
    case 'technique':
      return 'x-mitre-attack-pattern'
    default:
      return 'x-ansein-entity'
  }
}

export function buildStixBundle(
  inv: Investigation,
  entities: Entity[],
  rels: Relationship[]
): {
  type: 'bundle'
  id: string
  objects: unknown[]
} {
  const objects: unknown[] = []
  const idMap = new Map<number, string>()

  // Investigation as Identity / x-ansein-case
  objects.push({
    type: 'identity',
    id: stixId('identity', inv.id * 1000000 + 1),
    name: inv.title,
    identity_class: 'organization',
    description: inv.description,
    created: inv.createdAt.toISOString(),
    modified: inv.updatedAt.toISOString(),
  })

  for (const e of entities) {
    const stixType = stixTypeFor(e.entityType)
    const id = stixId(stixType, e.id)
    idMap.set(e.id, id)
    const baseObj: Record<string, unknown> = {
      type: stixType,
      id,
      created: e.createdAt.toISOString(),
      modified: e.createdAt.toISOString(),
    }
    if (stixType === 'indicator') {
      baseObj.name = e.value
      baseObj.pattern_type = 'stix'
      baseObj.pattern = stixPattern(e.entityType, e.value)
      baseObj.valid_from = e.createdAt.toISOString()
    } else if (stixType === 'malware') {
      baseObj.name = e.value
      baseObj.is_family = false
    } else if (stixType === 'threat-actor') {
      baseObj.name = e.value
      baseObj.roles = ['malicious-actor']
    } else if (stixType === 'tool' || stixType === 'vulnerability') {
      baseObj.name = e.value
    } else if (stixType === 'identity') {
      baseObj.name = e.value
      baseObj.identity_class = 'organization'
    } else if (stixType === 'location') {
      baseObj.name = e.value
    } else {
      baseObj.name = e.value
      baseObj.value = e.value
    }
    objects.push(baseObj)
  }

  // Relationships
  for (const r of rels) {
    const srcRef = idMap.get(r.sourceId)
    const tgtRef = idMap.get(r.targetId)
    if (!srcRef || !tgtRef) continue
    objects.push({
      type: 'relationship',
      id: stixId('relationship', r.id),
      relationship_type: r.relationType,
      source_ref: srcRef,
      target_ref: tgtRef,
      created: r.createdAt.toISOString(),
      modified: r.createdAt.toISOString(),
      description: r.evidence,
    })
  }

  return {
    type: 'bundle',
    id: `bundle--ansein-${inv.id}`,
    objects,
  }
}

// --------------------------------------------------------- PDF (HTML report)
export function buildPdfHtml(
  inv: Investigation,
  entities: Entity[],
  rels: Relationship[],
  analysis: AnalysisRun | null
): string {
  const tags = safeParseJson<string[]>(inv.tags, [])
  const recs = analysis ? safeParseJson<string[]>(analysis.recommendations, []) : []
  const actor = analysis ? safeParseJson<Record<string, unknown>>(analysis.actorHypothesis, {}) : {}
  const entityRows = entities
    .slice(0, 50)
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.entityType)}</td><td style="font-family:monospace">${escapeHtml(e.value)}</td><td>${(e.confidence * 100).toFixed(0)}%</td></tr>`
    )
    .join('')
  const relRows = rels
    .slice(0, 50)
    .map(
      (r) =>
        `<tr><td>#${r.sourceId}</td><td>#${r.targetId}</td><td>${escapeHtml(r.relationType)}</td><td>${r.weight.toFixed(2)}</td></tr>`
    )
    .join('')
  const recList = recs.map((r) => `<li>${escapeHtml(r)}</li>`).join('')

  const severity = inv.severityScore
  const severityColor = severity >= 70 ? '#dc2626' : severity >= 40 ? '#ea580c' : '#16a34a'

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(inv.title)} — AnseIn Report</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.55; }
  h1 { font-size: 22pt; margin: 0 0 4pt 0; color: #0a0d14; letter-spacing: -0.5pt; }
  h2 { font-size: 14pt; margin: 22pt 0 6pt 0; color: #0a0d14; border-bottom: 2px solid #0d9488; padding-bottom: 3pt; }
  .meta { color: #64748b; font-size: 9pt; margin-bottom: 18pt; }
  .badge { display: inline-block; padding: 2pt 8pt; border-radius: 3pt; background: ${severityColor}; color: #fff; font-size: 9pt; font-weight: 600; }
  .tag { display: inline-block; padding: 1pt 6pt; border-radius: 3pt; background: #f1f5f9; color: #475569; font-size: 8pt; margin-right: 4pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 9.5pt; }
  th { background: #0f172a; color: #fff; padding: 5pt 8pt; text-align: left; font-weight: 600; }
  td { padding: 4pt 8pt; border-bottom: 1px solid #cbd5e1; }
  tr:nth-child(even) td { background: #f8fafc; }
  .narrative { white-space: pre-wrap; }
  ul { padding-left: 18pt; }
  .footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #cbd5e1; color: #94a3b8; font-size: 8pt; }
  .actor-card { background: #f8fafc; border-left: 3pt solid #0d9488; padding: 8pt 12pt; margin: 6pt 0; font-size: 10pt; }
  .actor-card strong { color: #0a0d14; }
</style></head><body>
  <h1>AnseIn Threat Intelligence Report</h1>
  <div class="meta">
    ${escapeHtml(inv.title)} &nbsp;·&nbsp; Status: <strong>${escapeHtml(inv.status)}</strong> &nbsp;·&nbsp;
    Severity: <span class="badge">${severity.toFixed(0)}/100</span><br>
    Generated: ${new Date().toISOString()} &nbsp;·&nbsp; Case ID: #${inv.id}<br>
    ${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
  </div>

  ${inv.description ? `<h2>Description</h2><p>${escapeHtml(inv.description)}</p>` : ''}

  ${analysis?.narrative ? `<h2>Threat Narrative</h2><div class="narrative">${escapeHtml(analysis.narrative).replace(/\n/g, '<br>')}</div>` : ''}

  ${actor && Object.keys(actor).length > 0 ? `
  <h2>Actor Hypothesis</h2>
  <div class="actor-card">
    <p><strong>Actor:</strong> ${escapeHtml(String(actor.actor || 'Unknown'))}</p>
    <p><strong>Confidence:</strong> ${escapeHtml(String(actor.confidence || ''))} &nbsp;·&nbsp; <strong>Origin:</strong> ${escapeHtml(String(actor.origin || ''))}</p>
    <p><strong>Motivation:</strong> ${escapeHtml(String(actor.motivation || ''))}</p>
    <p><strong>Reasoning:</strong> ${escapeHtml(String(actor.reasoning || ''))}</p>
  </div>` : ''}

  ${recList ? `<h2>Recommendations</h2><ul>${recList}</ul>` : ''}

  <h2>Extracted Entities (${entities.length}${entities.length > 50 ? ', first 50 shown' : ''})</h2>
  <table>
    <thead><tr><th>Type</th><th>Value</th><th>Confidence</th></tr></thead>
    <tbody>${entityRows || '<tr><td colspan=3>(none)</td></tr>'}</tbody>
  </table>

  <h2>Relationships (${rels.length}${rels.length > 50 ? ', first 50 shown' : ''})</h2>
  <table>
    <thead><tr><th>Source</th><th>Target</th><th>Relation</th><th>Weight</th></tr></thead>
    <tbody>${relRows || '<tr><td colspan=4>(none)</td></tr>'}</tbody>
  </table>

  <div class="footer">
    Generated by AnseIn v3.0 — Advanced Neural Security Extractor Intelligence.
    Admiralty code: ${escapeHtml(analysis?.admiraltyCode || 'N/A')} &nbsp;·&nbsp;
    Model: ${escapeHtml(analysis?.modelUsed || 'N/A')} &nbsp;·&nbsp;
    Tokens: ${analysis?.tokensUsed || 0}
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
