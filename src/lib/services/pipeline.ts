/**
 * Pipeline orchestrator — runs extract → enrich → analyze.
 * Ported from backend/app/services/investigation_service.py
 *
 * The pipeline is synchronous; status transitions:
 * pending → extracting → enriching → analyzing → completed (or failed)
 */
import { db } from '@/lib/db'
import { extractEntities, llmInferRelationships, type UserKeys } from '@/lib/engines/extraction'
import { enrichEntity, type EnrichmentData } from '@/lib/engines/enrichment'
import { analyze, type EntityForAnalysis } from '@/lib/engines/analysis'
import { decrypt } from '@/lib/crypto'
import { safeParseJson, safeStringifyJson } from '@/lib/api'
import { appendAuditLog } from '@/lib/audit-chain'

/** Write an audit log entry (best-effort — never throws). */
function audit(userId: number, action: string, targetType: string, targetId: number, extra: Record<string, unknown> = {}) {
// Hash-chained audit append — best-effort, never blocks the request.
  appendAuditLog(db, {
    userId,
    action,
    targetType,
    targetId,
    ipAddress: '',
    extraMetadata: safeStringifyJson({ ts: new Date().toISOString(), ...extra }),
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// SOAR playbook execution — runs after every pipeline completion.
// Trigger types:
//   severity_threshold — value: number (0-100). Fires when severity_score >= value.
//   entity_type        — value: EntityType string. Fires when any extracted
//                         entity of that type is present.
//   alert_type         — value: 'phishing'|'malware'|'c2'|'suspicious'|'custom'.
//                         Fires when the investigation has that tag (set by
//                         webhook ingest or manually).
//   always             — no value. Fires on every completed pipeline run.
interface PlaybookTrigger {
  type: 'severity_threshold' | 'entity_type' | 'alert_type' | 'always'
  value?: number | string
}

interface PlaybookAction {
  type: 'notify' | 'tag' | 'star' | 'export'
  params: Record<string, unknown>
}

interface PlaybookRow {
  id: number
  userId: number
  name: string
  trigger: string
  actions: string
  enabled: boolean
}

/** Decide whether a playbook's trigger matches the pipeline result. */
function playbookMatches(
  trigger: PlaybookTrigger | null,
  ctx: {
    severityScore: number
    entityTypes: Set<string>
    tags: string[]
  }
): boolean {
  if (!trigger) return false
  switch (trigger.type) {
    case 'always':
      return true
    case 'severity_threshold': {
      const threshold = typeof trigger.value === 'number' ? trigger.value : Number(trigger.value)
      if (!Number.isFinite(threshold)) return false
      return ctx.severityScore >= threshold
    }
    case 'entity_type': {
      const t = typeof trigger.value === 'string' ? trigger.value : String(trigger.value ?? '')
      return t ? ctx.entityTypes.has(t) : false
    }
    case 'alert_type': {
      const t = typeof trigger.value === 'string' ? trigger.value : String(trigger.value ?? '')
      if (!t) return false
      // Tags are stored as `alert_type:phishing` or just `phishing` (webhook
      // ingest uses the bare alert_type as a tag). Match either.
      return ctx.tags.includes(t) || ctx.tags.includes(`alert_type:${t}`)
    }
    default:
      return false
  }
}

/** Apply a single action to the investigation. Best-effort — never throws. */
async function applyAction(
  investigationId: number,
  userId: number,
  action: PlaybookAction,
  playbookName: string
): Promise<void> {
  try {
    switch (action.type) {
      case 'tag': {
        const tag = typeof action.params.tag === 'string' ? action.params.tag : `playbook:${playbookName}`
        if (!tag) return
        const inv = await db.investigation.findUnique({ where: { id: investigationId } })
        if (!inv) return
        const existing = safeParseJson<string[]>(inv.tags, [])
        if (existing.includes(tag)) return // idempotent — don't double-tag
        existing.push(tag)
        await db.investigation.update({
          where: { id: investigationId },
          data: { tags: safeStringifyJson(existing) },
        })
        break
      }
      case 'star': {
        await db.investigation.update({
          where: { id: investigationId },
          data: { isStarred: true },
        })
        break
      }
      case 'notify':
      case 'export': {
        // 'notify' and 'export' are recorded as audit-log entries — the
        // front-end can surface them as toasts/recent activity. (A future
        // iteration could push these through a websocket for live notify.)
        // For 'export', we log the intent; the actual JSON blob can be
        // fetched on demand from the existing /export/{id}/json endpoint.
        break
      }
      default:
        break
    }
  } catch (e) {
    console.error(`[playbook] action ${action.type} failed:`, e)
  }
}

/**
 * Fetch the user's enabled playbooks, evaluate each trigger against the
 * pipeline result, and execute matching actions. Logs an audit entry per
 * fired playbook so the audit timeline reflects automation.
 */
async function runPlaybooks(
  investigationId: number,
  userId: number,
  result: {
    severityScore: number
    entityTypes: Set<string>
    tags: string[]
  }
): Promise<void> {
  let playbooks: PlaybookRow[]
  try {
    playbooks = await db.playbook.findMany({ where: { userId, enabled: true } })
  } catch (e) {
    console.error('[playbook] fetch failed:', e)
    return
  }
  for (const p of playbooks) {
    const trigger = safeParseJson<PlaybookTrigger | null>(p.trigger, null)
    const actions = safeParseJson<PlaybookAction[]>(p.actions, [])
    if (!playbookMatches(trigger, result)) continue
    // Trigger matched — execute actions in order.
    for (const a of actions) {
      await applyAction(investigationId, userId, a, p.name)
    }
    // Audit: playbook fired (with the trigger that matched + actions taken).
    await appendAuditLog(db, {
      userId,
      action: 'playbook.fired',
      targetType: 'investigation',
      targetId: investigationId,
      ipAddress: '',
      extraMetadata: safeStringifyJson({
        ts: new Date().toISOString(),
        playbook_id: p.id,
        playbook_name: p.name,
        trigger: trigger ? `${trigger.type}=${trigger.value ?? ''}` : 'none',
        actions: actions.map((a) => a.type),
        severity: result.severityScore,
      }),
    }).catch(() => {})
  }
}

export interface PipelineProgress {
  step: 'extracting' | 'enriching' | 'analyzing' | 'completed' | 'failed'
  message?: string
}

async function getUserKeys(userId: number): Promise<UserKeys & { virustotal_api_key?: string; abuseipdb_api_key?: string; shodan_api_key?: string }> {
  const settings = await db.userSettings.findUnique({ where: { userId } })
  if (!settings) return {}
  return {
    openai_api_key: settings.openaiApiKey ? decrypt(settings.openaiApiKey) : undefined,
    groq_api_key: settings.groqApiKey ? decrypt(settings.groqApiKey) : undefined,
    preferred_llm: settings.preferredLlm,
    custom_llm_api_key: settings.customLlmApiKey ? decrypt(settings.customLlmApiKey) : undefined,
    custom_llm_base_url: settings.customLlmBaseUrl || undefined,
    custom_llm_model: settings.customLlmModel || undefined,
    virustotal_api_key: settings.virustotalApiKey ? decrypt(settings.virustotalApiKey) : undefined,
    abuseipdb_api_key: settings.abuseipdbApiKey ? decrypt(settings.abuseipdbApiKey) : undefined,
    shodan_api_key: settings.shodanApiKey ? decrypt(settings.shodanApiKey) : undefined,
  }
}

/**
 * Lightweight concurrency pool to process tasks in parallel without overflowing external APIs.
 * Ensures 100+ entities are enriched in seconds rather than triggering Vercel 60s timeouts.
 */
async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  iteratorFn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const ret: R[] = new Array(items.length)
  const executing = new Set<Promise<void>>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const p = Promise.resolve().then(() => iteratorFn(item, i)).then((res) => {
      ret[i] = res
    })
    const e: Promise<void> = p.then(() => {
      executing.delete(e)
    })
    executing.add(e)

    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return ret
}

export async function runPipeline(investigationId: number, userId: number): Promise<void> {
  const inv = await db.investigation.findFirst({
    where: { id: investigationId, userId },
    include: { sources: true },
  })
  if (!inv) throw new Error('Investigation not found')

  const userKeys = await getUserKeys(userId)

  try {
    // Step 1: extracting
    await db.investigation.update({ where: { id: inv.id }, data: { status: 'extracting' } })

    const text = inv.sources.map((s) => s.content).join('\n\n')
    if (!text.trim()) {
      await db.investigation.update({ where: { id: inv.id }, data: { status: 'pending' } })
      return
    }

    // Wipe existing entities / relationships / analysis (idempotent re-run)
    await db.relationship.deleteMany({ where: { investigationId: inv.id } })
    await db.entity.deleteMany({ where: { investigationId: inv.id } })
    await db.analysisRun.deleteMany({ where: { investigationId: inv.id } })

    const { entities: extracted } = await extractEntities(text, userKeys)

    // Persist entities; build value→id map for relationship wiring
    const valueToId = new Map<string, number>()
    for (const e of extracted) {
      const created = await db.entity.create({
        data: {
          investigationId: inv.id,
          entityType: e.entity_type,
          value: e.value,
          normalized: e.normalized,
          confidence: e.confidence,
          enrichment: '{}',
          sourceMethod: e.source_method,
        },
      })
      valueToId.set(e.normalized.toLowerCase(), created.id)
    }

    // Step 2: enriching with concurrent pool (concurrency: 6) to avoid serverless timeout
    await db.investigation.update({ where: { id: inv.id }, data: { status: 'enriching' } })
    const allEntities = await db.entity.findMany({ where: { investigationId: inv.id } })

    const entitiesForAnalysis: EntityForAnalysis[] = await asyncPool(allEntities, 6, async (e) => {
      let enrichment: EnrichmentData = {}
      if (e.entityType.startsWith('ioc_') || e.entityType === 'ioc_wallet' || e.entityType === 'vulnerability') {
        enrichment = await enrichEntity(
          e.entityType as any,
          e.value,
          {
            virustotal_api_key: userKeys.virustotal_api_key,
            abuseipdb_api_key: userKeys.abuseipdb_api_key,
            shodan_api_key: userKeys.shodan_api_key,
          }
        )
        await db.entity.update({ where: { id: e.id }, data: { enrichment: safeStringifyJson(enrichment) } })
      } else {
        // Read any existing enrichment
        enrichment = safeParseJson<EnrichmentData>(e.enrichment, {})
      }
      return {
        entity_type: e.entityType as any,
        value: e.value,
        confidence: e.confidence,
        enrichment,
      }
    })

    // Persist relationships
    const rels = await llmInferRelationships(extracted, text, userKeys)
    for (const r of rels) {
      const srcId = valueToId.get(r.source)
      const tgtId = valueToId.get(r.target)
      if (!srcId || !tgtId || srcId === tgtId) continue
      await db.relationship.create({
        data: {
          investigationId: inv.id,
          sourceId: srcId,
          targetId: tgtId,
          relationType: r.relation_type,
          weight: r.weight,
          evidence: r.evidence,
        },
      })
    }

    // Step 3: analyzing
    await db.investigation.update({ where: { id: inv.id }, data: { status: 'analyzing' } })

    // Merge enrichment per-provider for admiralty computation
    const merged: EnrichmentData = {}
    for (const e of entitiesForAnalysis) {
      for (const [k, v] of Object.entries(e.enrichment || {})) {
        if (!merged[k]) merged[k] = v as Record<string, unknown>
      }
    }

    const result = await analyze(entitiesForAnalysis, merged, userKeys, text.slice(0, 25000))

    const analysisRun = await db.analysisRun.create({
      data: {
        investigationId: inv.id,
        narrative: result.narrative,
        actorHypothesis: safeStringifyJson(result.actor_hypothesis),
        severityScore: result.severity_score,
        recommendations: safeStringifyJson(result.recommendations),
        hypotheses: safeStringifyJson(result.hypotheses),
        admiraltyCode: result.admiralty_code,
        confidence: result.confidence,
        modelUsed: result.model_used,
        tokensUsed: result.tokens_used,
      },
    })

    await db.investigation.update({
      where: { id: inv.id },
      data: {
        status: 'completed',
        severityScore: result.severity_score,
      },
    })

    audit(userId, 'investigation.pipeline.complete', 'investigation', inv.id, {
      entities: entitiesForAnalysis.length,
      severity: result.severity_score,
      model: result.model_used,
      tokens: result.tokens_used,
    })

    void analysisRun

    // Step 4: SOAR — evaluate playbooks against the pipeline result.
    // Fetch the (possibly updated) tags + entity types, then fire any matching
    // playbooks. Errors here are caught inside runPlaybooks and never bubble
    // up to fail the pipeline.
    try {
      const [invFresh, freshEntities] = await Promise.all([
        db.investigation.findUnique({ where: { id: inv.id } }),
        db.entity.findMany({ where: { investigationId: inv.id } }),
      ])
      const tags = safeParseJson<string[]>(invFresh?.tags || '[]', [])
      const entityTypes = new Set<string>(freshEntities.map((e) => e.entityType))
      await runPlaybooks(inv.id, userId, {
        severityScore: result.severity_score,
        entityTypes,
        tags,
      })
    } catch (e) {
      console.error('[playbook] orchestration failed:', e)
    }
  } catch (e) {
    console.error('[pipeline] failed:', e)
    await db.investigation.update({
      where: { id: inv.id },
      data: { status: 'failed' },
    })
    throw e
  }
}
