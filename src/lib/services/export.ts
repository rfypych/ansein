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
    hypotheses: Array<{ scenario: string; confidence: number; reasoning: string; next_steps: string[] }>
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
      is_false_positive: e.isFalsePositive,
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
          hypotheses: safeParseJson<Array<{ scenario: string; confidence: number; reasoning: string; next_steps: string[] }>>(analysis.hypotheses, []),
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
    // Analyst adjudication travels with the object (custom STIX property);
    // machine consumers (rules/TAXII) already exclude FPs upstream.
    if (e.isFalsePositive) baseObj.x_ansein_false_positive = true
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
/**
 * Build a self-contained, print-ready HTML executive report for an
 * investigation. The output is rendered in a browser print window, so the
 * HTML must be fully self-contained (inline CSS, inline SVG logo, no
 * external fonts or scripts).
 *
 * Layout:
 *   - Cover page (AnseIn logo, title, case ID, severity badge, classification banner)
 *   - Executive Summary (first ~500 chars of the narrative, broken into paragraphs)
 *   - Threat Assessment (severity progress bar + admiralty code explanation)
 *   - Key Findings (top entities grouped by type)
 *   - IOCs (table — type, value, confidence)
 *   - Recommendations (numbered list)
 *   - Attack Hypotheses (if any — each with confidence badge)
 *   - Relationships (condensed table)
 *   - Footer with page numbers + "CONFIDENTIAL" banner + generation timestamp
 */
export function buildPdfHtml(
  inv: Investigation,
  entities: Entity[],
  rels: Relationship[],
  analysis: AnalysisRun | null
): string {
  const tags = safeParseJson<string[]>(inv.tags, [])
  const recs = analysis ? safeParseJson<string[]>(analysis.recommendations, []) : []
  const actor = analysis ? safeParseJson<Record<string, unknown>>(analysis.actorHypothesis, {}) : {}
  const hypos = analysis
    ? safeParseJson<Array<{ scenario: string; confidence: number; reasoning: string; next_steps: string[] }>>(analysis.hypotheses, [])
    : []
  const severity = inv.severityScore
  const severityColor = severity >= 70 ? '#dc2626' : severity >= 40 ? '#ea580c' : severity > 0 ? '#16a34a' : '#64748b'
  const severityLabel = severity >= 70 ? 'HIGH' : severity >= 40 ? 'MEDIUM' : severity > 0 ? 'LOW' : 'NONE'
  const classification = severity >= 70 ? 'CONFIDENTIAL // TLP:RED' : severity >= 40 ? 'CONFIDENTIAL // TLP:AMBER' : 'TLP:CLEAR'
  const generatedAt = new Date()
  const generatedAtIso = generatedAt.toISOString()
  const generatedAtDisplay = generatedAt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })

  // ---- Executive summary: first ~500 chars of narrative, broken into 2-3 paragraphs
  const narrative = (analysis?.narrative || inv.description || '').trim()
  const summarySource = narrative.slice(0, 500)
  const summaryParagraphs = splitIntoParagraphs(summarySource, 3)

  // ---- Key findings: group entities by type, take top 3 per group
  const entitiesByType: Record<string, Entity[]> = {}
  for (const e of entities) {
    if (!entitiesByType[e.entityType]) entitiesByType[e.entityType] = []
    entitiesByType[e.entityType].push(e)
  }
  const keyFindingTypes = Object.entries(entitiesByType)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
  const iocTypes = new Set(['ioc_ip', 'ioc_domain', 'ioc_url', 'ioc_hash', 'ioc_wallet'])
  const iocEntities = entities.filter((e) => iocTypes.has(e.entityType)).slice(0, 50)
  const hasIocs = iocEntities.length > 0

  // ---- Admiralty code explanation
  const admiraltyCode = analysis?.admiraltyCode || 'C2'
  const admiraltyExplanation = explainAdmiralty(admiraltyCode)

  // ---- IOCs table rows
  const iocRows = iocEntities
    .map((e) => {
      const enrich = safeParseJson<Record<string, unknown>>(e.enrichment, {})
      const conf = Math.round((e.confidence || 0) * 100)
      const confColor = conf >= 70 ? '#16a34a' : conf >= 40 ? '#ea580c' : '#64748b'
      const malicious =
        (typeof enrich.malicious === 'number' && enrich.malicious > 0) ||
        (typeof enrich.abuse_score === 'number' && enrich.abuse_score >= 75)
      const badge = malicious
        ? '<span class="pill pill-bad">MALICIOUS</span>'
        : conf >= 70
        ? '<span class="pill pill-ok">VERIFIED</span>'
        : '<span class="pill pill-meh">UNVERIFIED</span>'
      return `<tr>
        <td>${escapeHtml(humanEntityType(e.entityType))}</td>
        <td class="mono">${escapeHtml(e.value)}</td>
        <td style="text-align:center">${badge}</td>
        <td style="text-align:center">
          <div class="conf-bar"><div class="conf-fill" style="width:${conf}%;background:${confColor}"></div></div>
          <span class="conf-num" style="color:${confColor}">${conf}%</span>
        </td>
      </tr>`
    })
    .join('')

  // ---- Key findings bullet list
  const keyFindingsHtml = keyFindingTypes
    .map(([type, list]) => {
      const top = list.slice(0, 3).map((e) => escapeHtml(e.value)).join(', ')
      return `<li>
        <strong>${escapeHtml(humanEntityType(type))}</strong>
        <span class="muted">(${list.length})</span>:
        <span class="mono">${top}${list.length > 3 ? '…' : ''}</span>
      </li>`
    })
    .join('') || '<li class="muted">No entities extracted.</li>'

  // ---- Recommendations numbered list
  const recList = recs.length
    ? `<ol>${recs.map((r, i) => `<li value="${i + 1}">${escapeHtml(r)}</li>`).join('')}</ol>`
    : '<p class="muted">No recommendations recorded. Run the analysis pipeline to generate recommendations.</p>'

  // ---- Attack hypotheses
  const hyposHtml = hypos.length
    ? hypos
        .map((h) => {
          const conf = Number(h.confidence) || 0
          const color = conf >= 70 ? '#dc2626' : conf >= 40 ? '#ea580c' : '#64748b'
          const steps = (h.next_steps || [])
            .map((s) => `<li>${escapeHtml(s)}</li>`)
            .join('')
          return `<div class="hypothesis" style="border-left-color:${color}">
            <div class="hypothesis-head">
              <strong>${escapeHtml(h.scenario || 'Untitled hypothesis')}</strong>
              <span class="pill" style="background:${color}1a;color:${color};border-color:${color}40">CONFIDENCE ${conf.toFixed(0)}%</span>
            </div>
            ${h.reasoning ? `<p class="muted">${escapeHtml(h.reasoning)}</p>` : ''}
            ${steps ? `<ol class="steps">${steps}</ol>` : ''}
          </div>`
        })
        .join('')
    : ''

  // ---- Relationships table (condensed)
  const relRows = rels
    .slice(0, 30)
    .map((r) => {
      const src = entities.find((e) => e.id === r.sourceId)
      const tgt = entities.find((e) => e.id === r.targetId)
      return `<tr>
        <td class="mono">${src ? escapeHtml(truncateStr(src.value, 28)) : '#' + r.sourceId}</td>
        <td><span class="rel-arrow">→</span> <em>${escapeHtml(r.relationType)}</em></td>
        <td class="mono">${tgt ? escapeHtml(truncateStr(tgt.value, 28)) : '#' + r.targetId}</td>
        <td style="text-align:center">${r.weight.toFixed(2)}</td>
      </tr>`
    })
    .join('')
  const relTable = relRows
    ? `<table>
        <thead><tr><th>Source</th><th>Relation</th><th>Target</th><th>Weight</th></tr></thead>
        <tbody>${relRows}</tbody>
      </table>
      ${rels.length > 30 ? `<p class="muted small">+ ${rels.length - 30} more relationship${rels.length - 30 === 1 ? '' : 's'} omitted for brevity.</p>` : ''}`
    : '<p class="muted">No relationships recorded.</p>'

  // ---- AnseIn logo (inline SVG — matches BrandMark)
  const logoSvg = `<svg width="40" height="40" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#14b8a6"/>
    <rect x="1" y="1" width="30" height="30" rx="7" fill="#0d9488"/>
    <rect x="8" y="9" width="16" height="2" rx="1" fill="#0a0e16" fill-opacity="0.5"/>
    <rect x="10" y="14" width="12" height="2" rx="1" fill="#0a0e16" fill-opacity="0.7"/>
    <rect x="12" y="19" width="8" height="2" rx="1" fill="#0a0e16" fill-opacity="0.9"/>
    <circle cx="16" cy="24" r="3" fill="#f59e0b"/>
    <circle cx="16" cy="24" r="3" fill="#fbbf24" fill-opacity="0.4"/>
  </svg>`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(inv.title)} — AnseIn Executive Report</title>
<style>
  /* ---------- Page setup ---------- */
  @page {
    size: A4;
    margin: 18mm 16mm 22mm 16mm;
    @bottom-center {
      content: "CONFIDENTIAL — AnseIn Threat Intelligence Report  ·  Page " counter(page) " of " counter(pages);
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 8pt;
      color: #94a3b8;
    }
  }
  @page :first {
    margin: 0;
    @bottom-center { content: ""; }
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 10.5pt;
    line-height: 1.55;
    background: #ffffff;
  }
  .mono { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 9pt; }
  .muted { color: #64748b; }
  .small { font-size: 8.5pt; }

  /* ---------- Cover page ---------- */
  .cover {
    page-break-after: always;
    padding: 0;
    color: #fff;
    background: #0a0e16;
    height: 297mm;
    position: relative;
    overflow: hidden;
  }
  .cover-band {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 8mm;
    background: ${severityColor};
  }
  .cover-classification {
    position: absolute;
    top: 8mm; left: 0; right: 0;
    background: ${severity >= 40 ? '#1a0e0e' : '#0a1416'};
    color: ${severity >= 70 ? '#fecaca' : severity >= 40 ? '#fed7aa' : '#cbd5e1'};
    text-align: center;
    padding: 4mm 0;
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 2pt;
    border-bottom: 1px solid ${severityColor}55;
  }
  .cover-inner {
    padding: 38mm 22mm 22mm 22mm;
  }
  .cover-logo {
    display: flex;
    align-items: center;
    gap: 10pt;
    margin-bottom: 36pt;
  }
  .cover-logo-text {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  .cover-logo-text .wordmark {
    font-size: 20pt;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.3pt;
  }
  .cover-logo-text .wordmark .accent { color: #14b8a6; }
  .cover-logo-text .tagline {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 2pt;
    color: #64748b;
    margin-top: 2pt;
  }
  .cover-eyebrow {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 4pt;
    color: #14b8a6;
    margin-bottom: 8pt;
  }
  .cover-title {
    font-size: 30pt;
    font-weight: 700;
    line-height: 1.15;
    margin: 0 0 16pt 0;
    color: #fff;
    letter-spacing: -0.5pt;
  }
  .cover-meta {
    font-size: 9.5pt;
    color: #cbd5e1;
    margin-bottom: 24pt;
  }
  .cover-meta-row {
    display: flex;
    margin-bottom: 4pt;
  }
  .cover-meta-label {
    width: 80pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1pt;
    font-size: 8pt;
    padding-top: 1pt;
  }
  .cover-meta-value {
    color: #fff;
    flex: 1;
  }
  .cover-severity-block {
    margin-top: 18pt;
    padding: 14pt 16pt;
    background: #131a26;
    border-left: 4pt solid ${severityColor};
    border-radius: 3pt;
  }
  .cover-severity-row {
    display: flex;
    align-items: center;
    gap: 12pt;
  }
  .cover-severity-num {
    font-size: 32pt;
    font-weight: 700;
    color: ${severityColor};
    font-family: 'SF Mono', 'Menlo', monospace;
    line-height: 1;
  }
  .cover-severity-label {
    font-size: 11pt;
    font-weight: 700;
    color: #fff;
    letter-spacing: 2pt;
  }
  .cover-severity-bar {
    height: 6pt;
    background: #1f2937;
    border-radius: 3pt;
    margin-top: 8pt;
    overflow: hidden;
  }
  .cover-severity-fill {
    height: 100%;
    background: ${severityColor};
    border-radius: 3pt;
  }
  .cover-tags {
    margin-top: 14pt;
    display: flex;
    flex-wrap: wrap;
    gap: 4pt;
  }
  .cover-tag {
    background: #1f2937;
    color: #cbd5e1;
    padding: 2pt 8pt;
    border-radius: 3pt;
    font-size: 8pt;
    border: 1px solid #334155;
  }
  .cover-footer {
    position: absolute;
    bottom: 12mm;
    left: 22mm;
    right: 22mm;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    color: #64748b;
    font-size: 8pt;
    border-top: 1px solid #1f2937;
    padding-top: 8pt;
  }
  .cover-footer-right { text-align: right; }

  /* ---------- Section styling ---------- */
  .section { page-break-before: always; padding-top: 0; }
  .section:first-of-type { page-break-before: auto; }
  h1.section-title {
    font-size: 16pt;
    margin: 0 0 12pt 0;
    padding: 0 0 6pt 0;
    border-bottom: 2pt solid #0d9488;
    color: #0a0e16;
    letter-spacing: -0.2pt;
  }
  h2.subsection {
    font-size: 12pt;
    margin: 16pt 0 6pt 0;
    color: #0a0e16;
  }
  p { margin: 0 0 8pt 0; }
  ul, ol { padding-left: 18pt; margin: 0 0 8pt 0; }
  li { margin-bottom: 4pt; }

  /* ---------- Severity meter (assessment section) ---------- */
  .severity-meter {
    margin: 8pt 0 16pt 0;
    padding: 12pt 14pt;
    background: #f1f5f9;
    border-radius: 4pt;
  }
  .severity-meter-bar {
    height: 10pt;
    background: #e2e8f0;
    border-radius: 5pt;
    overflow: hidden;
    margin: 6pt 0;
  }
  .severity-meter-fill {
    height: 100%;
    background: ${severityColor};
    border-radius: 5pt;
  }
  .severity-meter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .severity-meter-label {
    font-weight: 700;
    color: ${severityColor};
    font-size: 12pt;
    letter-spacing: 1pt;
  }
  .severity-meter-num {
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 18pt;
    font-weight: 700;
    color: ${severityColor};
  }

  /* ---------- Admiralty code box ---------- */
  .admiralty {
    margin: 10pt 0;
    padding: 10pt 12pt;
    background: #fffbeb;
    border: 1pt solid #fde68a;
    border-radius: 3pt;
  }
  .admiralty-code {
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 16pt;
    font-weight: 700;
    color: #92400e;
    margin-bottom: 2pt;
  }
  .admiralty-desc {
    font-size: 9.5pt;
    color: #78350f;
  }

  /* ---------- Pills / badges ---------- */
  .pill {
    display: inline-block;
    padding: 1pt 6pt;
    border-radius: 3pt;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.5pt;
    border: 1px solid transparent;
  }
  .pill-ok { background: #dcfce7; color: #15803d; border-color: #86efac; }
  .pill-bad { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
  .pill-meh { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }

  /* ---------- Tables ---------- */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6pt 0 10pt 0;
    font-size: 9pt;
  }
  thead th {
    background: #0a0e16;
    color: #fff;
    padding: 5pt 8pt;
    text-align: left;
    font-weight: 600;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
  }
  tbody td {
    padding: 4pt 8pt;
    border-bottom: 1pt solid #e2e8f0;
    vertical-align: middle;
  }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  .conf-bar {
    width: 60pt;
    height: 4pt;
    background: #e2e8f0;
    border-radius: 2pt;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
    margin-right: 4pt;
  }
  .conf-fill {
    height: 100%;
    border-radius: 2pt;
  }
  .conf-num {
    font-family: 'SF Mono', 'Menlo', monospace;
    font-size: 8pt;
    font-weight: 700;
  }
  .rel-arrow { color: #0d9488; font-weight: 700; }

  /* ---------- Hypotheses ---------- */
  .hypothesis {
    border-left: 4pt solid #64748b;
    background: #f8fafc;
    padding: 10pt 12pt;
    margin: 8pt 0;
    border-radius: 0 3pt 3pt 0;
  }
  .hypothesis-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8pt;
    margin-bottom: 4pt;
  }
  .hypothesis-head strong { font-size: 10.5pt; color: #0a0e16; }
  ol.steps {
    margin-top: 6pt;
    padding-left: 16pt;
    font-size: 9pt;
    color: #334155;
  }
  ol.steps li { margin-bottom: 2pt; }

  /* ---------- Actor hypothesis card ---------- */
  .actor-card {
    background: #f8fafc;
    border-left: 3pt solid #0d9488;
    padding: 8pt 12pt;
    margin: 6pt 0;
    font-size: 9.5pt;
  }
  .actor-card p { margin: 2pt 0; }
  .actor-card strong { color: #0a0e16; }

  /* ---------- Document footer (every page except cover) ---------- */
  .doc-footer {
    margin-top: 18pt;
    padding-top: 6pt;
    border-top: 1pt solid #cbd5e1;
    color: #94a3b8;
    font-size: 7.5pt;
    display: flex;
    justify-content: space-between;
  }
</style></head>
<body>

  <!-- ============================================ Cover -->
  <section class="cover">
    <div class="cover-band" style="background:${severityColor}"></div>
    <div class="cover-classification">${escapeHtml(classification)}</div>
    <div class="cover-inner">
      <div class="cover-logo">
        ${logoSvg}
        <div class="cover-logo-text">
          <span class="wordmark">Anse<span class="accent">In</span></span>
          <span class="tagline">Threat Intelligence</span>
        </div>
      </div>

      <p class="cover-eyebrow">Executive Threat Intelligence Report</p>
      <h1 class="cover-title">${escapeHtml(inv.title)}</h1>

      <div class="cover-meta">
        <div class="cover-meta-row">
          <span class="cover-meta-label">Case ID</span>
          <span class="cover-meta-value mono">ANSEIN-${String(inv.id).padStart(6, '0')}</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-label">Status</span>
          <span class="cover-meta-value">${escapeHtml(inv.status)}</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-label">Created</span>
          <span class="cover-meta-value">${formatDatePdf(inv.createdAt)}</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-label">Last update</span>
          <span class="cover-meta-value">${formatDatePdf(inv.updatedAt)}</span>
        </div>
        ${analysis ? `
        <div class="cover-meta-row">
          <span class="cover-meta-label">Analyst</span>
          <span class="cover-meta-value">AnseIn automated pipeline · model: ${escapeHtml(analysis.modelUsed || 'N/A')}</span>
        </div>` : ''}
        <div class="cover-meta-row">
          <span class="cover-meta-label">Generated</span>
          <span class="cover-meta-value">${escapeHtml(generatedAtDisplay)} UTC</span>
        </div>
      </div>

      <div class="cover-severity-block">
        <div class="cover-severity-row">
          <div class="cover-severity-num">${severity.toFixed(0)}</div>
          <div>
            <div class="cover-severity-label">SEVERITY · ${severityLabel}</div>
            <div class="muted small" style="margin-top:2pt;color:#94a3b8">Out of 100</div>
          </div>
        </div>
        <div class="cover-severity-bar">
          <div class="cover-severity-fill" style="width:${Math.min(100, severity)}%"></div>
        </div>
      </div>

      ${tags.length ? `
      <div class="cover-tags">
        ${tags.map((t) => `<span class="cover-tag">${escapeHtml(t)}</span>`).join('')}
      </div>` : ''}
    </div>

    <div class="cover-footer">
      <div>
        <strong style="color:#cbd5e1">AnseIn</strong> · Advanced Neural Security Extractor Intelligence<br/>
        Generated ${escapeHtml(generatedAtDisplay)} UTC
      </div>
      <div class="cover-footer-right">
        ${escapeHtml(classification)}<br/>
        <span class="mono">Case ANSEIN-${String(inv.id).padStart(6, '0')}</span>
      </div>
    </div>
  </section>

  <!-- ============================================ Executive Summary -->
  <section class="section">
    <h1 class="section-title">Executive Summary</h1>
    ${summaryParagraphs.length
      ? summaryParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')
      : '<p class="muted">No narrative has been generated yet. Run the analysis pipeline to produce an executive summary.</p>'
    }
    ${narrative.length > 500
      ? `<p class="muted small">… ${narrative.length - 500} additional characters of analysis omitted. See the full narrative in the AnseIn web application.</p>`
      : ''
    }

    <h2 class="subsection">Case overview</h2>
    <p>
      This report covers investigation <strong>ANSEIN-${String(inv.id).padStart(6, '0')}</strong> ("${escapeHtml(inv.title)}"),
      which currently contains <strong>${entities.length}</strong> extracted entities, <strong>${rels.length}</strong>
      relationships, and ${analysis ? 'an attached automated threat assessment' : 'no completed threat assessment'}.
      The case is currently in the <strong>${escapeHtml(inv.status)}</strong> state with a severity score of
      <strong style="color:${severityColor}">${severity.toFixed(0)}/100 (${severityLabel})</strong>.
    </p>
    ${inv.description ? `<p class="muted small"><strong>Original description:</strong> ${escapeHtml(inv.description)}</p>` : ''}
  </section>

  <!-- ============================================ Threat Assessment -->
  <section class="section">
    <h1 class="section-title">Threat Assessment</h1>

    <div class="severity-meter">
      <div class="severity-meter-row">
        <div>
          <div class="muted small" style="text-transform:uppercase;letter-spacing:1pt">Severity score</div>
          <div class="severity-meter-label">${severityLabel}</div>
        </div>
        <div class="severity-meter-num">${severity.toFixed(0)}<span class="muted" style="font-size:10pt">/100</span></div>
      </div>
      <div class="severity-meter-bar">
        <div class="severity-meter-fill" style="width:${Math.min(100, severity)}%"></div>
      </div>
      <p class="muted small" style="margin-top:6pt">
        ${severity >= 70
          ? 'A HIGH severity rating indicates an active or imminent threat requiring immediate defensive action. Affected systems should be considered compromised until proven otherwise.'
          : severity >= 40
          ? 'A MEDIUM severity rating indicates a credible threat that warrants prompt attention. Defensive measures should be staged within the next operational cycle.'
          : severity > 0
          ? 'A LOW severity rating indicates an informational or background threat. Monitor for escalation and incorporate into baseline defenses.'
          : 'No severity score has been assigned. Run the analysis pipeline to generate a threat assessment.'
        }
      </p>
    </div>

    <h2 class="subsection">Source reliability (Admiralty Code)</h2>
    <div class="admiralty">
      <div class="admiralty-code">${escapeHtml(admiraltyCode)}</div>
      <div class="admiralty-desc">${escapeHtml(admiraltyExplanation)}</div>
    </div>
    <p class="muted small">
      The Admiralty Code is a two-character rating: the letter grades source reliability (A–F) and the
      number grades information credibility (1–6). Together they express how much weight an analyst
      should place on the underlying intelligence.
    </p>

    ${actor && Object.keys(actor).length > 0 ? `
    <h2 class="subsection">Threat actor hypothesis</h2>
    <div class="actor-card">
      <p><strong>Attributed actor:</strong> ${escapeHtml(String(actor.actor || 'Unknown'))}</p>
      <p><strong>Confidence:</strong> ${escapeHtml(String(actor.confidence || 'N/A'))} &nbsp;·&nbsp;
         <strong>Origin:</strong> ${escapeHtml(String(actor.origin || 'N/A'))}</p>
      <p><strong>Motivation:</strong> ${escapeHtml(String(actor.motivation || 'N/A'))}</p>
      ${actor.reasoning ? `<p><strong>Reasoning:</strong> ${escapeHtml(String(actor.reasoning))}</p>` : ''}
    </div>` : ''}
  </section>

  <!-- ============================================ Key Findings -->
  <section class="section">
    <h1 class="section-title">Key Findings</h1>
    <p>
      The extraction pipeline identified ${entities.length} entities across ${Object.keys(entitiesByType).length}
      type${Object.keys(entitiesByType).length === 1 ? '' : 's'}. The most significant categories are summarised below.
    </p>
    <ul>${keyFindingsHtml}</ul>

    <h2 class="subsection">Entity breakdown</h2>
    <table>
      <thead><tr><th>Type</th><th style="text-align:center">Count</th><th>Top values</th></tr></thead>
      <tbody>
        ${Object.entries(entitiesByType)
          .sort((a, b) => b[1].length - a[1].length)
          .map(([type, list]) => {
            const top = list.slice(0, 4).map((e) => escapeHtml(truncateStr(e.value, 30))).join(', ')
            return `<tr>
              <td>${escapeHtml(humanEntityType(type))}</td>
              <td style="text-align:center" class="mono">${list.length}</td>
              <td class="mono">${top}${list.length > 4 ? '…' : ''}</td>
            </tr>`
          })
          .join('') || '<tr><td colspan="3" class="muted">No entities extracted.</td></tr>'}
      </tbody>
    </table>
  </section>

  <!-- ============================================ IOCs -->
  ${hasIocs ? `
  <section class="section">
    <h1 class="section-title">Indicators of Compromise</h1>
    <p>The following ${iocEntities.length} indicator${iocEntities.length === 1 ? '' : 's'} of compromise (IOCs) were extracted${iocEntities.length === iocEntities.length ? '' : ` (showing first ${iocEntities.length})`}. Each is annotated with enrichment status and a confidence score derived from the extraction method and enrichment results.</p>
    <table>
      <thead><tr><th>Type</th><th>Value</th><th style="text-align:center">Status</th><th style="text-align:center">Confidence</th></tr></thead>
      <tbody>${iocRows || '<tr><td colspan="4" class="muted">(none)</td></tr>'}</tbody>
    </table>
  </section>` : ''}

  <!-- ============================================ Recommendations -->
  <section class="section">
    <h1 class="section-title">Recommendations</h1>
    ${recList}
  </section>

  <!-- ============================================ Attack Hypotheses -->
  ${hypos.length ? `
  <section class="section">
    <h1 class="section-title">Attack Hypotheses</h1>
    <p class="muted small">The following hypotheses were generated by the analysis engine. Each carries a confidence score representing the model&apos;s certainty based on the extracted evidence.</p>
    ${hyposHtml}
  </section>` : ''}

  <!-- ============================================ Relationships -->
  <section class="section">
    <h1 class="section-title">Relationship Graph</h1>
    <p>${rels.length} relationship${rels.length === 1 ? '' : 's'} recorded between extracted entities${rels.length > 30 ? ` (first 30 shown)` : ''}.</p>
    ${relTable}
  </section>

  <!-- ============================================ Document footer (visible on last page) -->
  <div class="doc-footer">
    <div>
      <strong>AnseIn v3.0</strong> · Advanced Neural Security Extractor Intelligence<br/>
      Generated ${escapeHtml(generatedAtIso)}
    </div>
    <div style="text-align:right">
      ${escapeHtml(classification)}<br/>
      Case ANSEIN-${String(inv.id).padStart(6, '0')} · Admiralty ${escapeHtml(admiraltyCode)}
    </div>
  </div>

</body></html>`
}

/* ----------------- helpers ----------------- */

function splitIntoParagraphs(text: string, max: number): string[] {
  if (!text) return []
  // Prefer natural paragraph breaks (double-newline) first.
  const natural = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (natural.length >= max) return natural.slice(0, max)
  // If we have fewer natural paragraphs than `max`, split long ones by sentence.
  const out: string[] = []
  const targetSentencesPerPara = Math.max(2, Math.ceil((natural.join(' ').split(/(?<=[.!?])\s+/).length) / max))
  for (const para of natural) {
    const sentences = para.split(/(?<=[.!?])\s+/).filter(Boolean)
    if (sentences.length <= targetSentencesPerPara || out.length + 1 >= max) {
      out.push(para)
    } else {
      for (let i = 0; i < sentences.length; i += targetSentencesPerPara) {
        if (out.length >= max) {
          // Append the remainder to the last paragraph to avoid dropping content.
          out[out.length - 1] += ' ' + sentences.slice(i).join(' ')
          break
        }
        out.push(sentences.slice(i, i + targetSentencesPerPara).join(' '))
      }
    }
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

function humanEntityType(t: string): string {
  const map: Record<string, string> = {
    threat_actor: 'Threat Actor',
    malware: 'Malware',
    tool: 'Tool',
    technique: 'Technique',
    vulnerability: 'Vulnerability',
    ioc_ip: 'IP Address',
    ioc_domain: 'Domain',
    ioc_url: 'URL',
    ioc_hash: 'File Hash',
    ioc_wallet: 'Crypto Wallet',
    target: 'Target',
    location: 'Location',
    identity: 'Identity',
  }
  return map[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function explainAdmiralty(code: string): string {
  if (!code || code.length < 2) return 'No Admiralty code assigned.'
  const reliability = code[0]
  const credibility = code.slice(1)
  const relMap: Record<string, string> = {
    A: 'Completely reliable source',
    B: 'Usually reliable source',
    C: 'Fairly reliable source',
    D: 'Not usually reliable source',
    E: 'Unreliable source',
    F: 'Source reliability cannot be judged',
  }
  const credMap: Record<string, string> = {
    '1': 'Confirmed by other sources',
    '2': 'Probably true',
    '3': 'Possibly true',
    '4': 'Doubtful',
    '5': 'Improbable',
    '6': 'Truth cannot be judged',
  }
  return `${relMap[reliability] || `Reliability code ${reliability}`}; information ${credMap[credibility] || `credibility code ${credibility}`}.`
}

function formatDatePdf(d: Date): string {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateStr(s: string, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
