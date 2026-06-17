/**
 * Pipeline orchestrator — runs extract → enrich → analyze.
 * Ported from backend/app/services/investigation_service.py
 *
 * The pipeline is synchronous; status transitions:
 * pending → extracting → enriching → analyzing → completed (or failed)
 */
import { db } from '@/lib/db'
import { extractEntities, inferRelationships, type UserKeys } from '@/lib/engines/extraction'
import { enrichEntity, type EnrichmentData } from '@/lib/engines/enrichment'
import { analyze, type EntityForAnalysis } from '@/lib/engines/analysis'
import { decrypt } from '@/lib/crypto'
import { safeParseJson, safeStringifyJson } from '@/lib/api'

/** Write an audit log entry (best-effort — never throws). */
function audit(userId: number, action: string, targetType: string, targetId: number, extra: Record<string, unknown> = {}) {
  db.auditLog.create({
    data: {
      userId,
      action,
      targetType,
      targetId,
      ipAddress: '',
      extraMetadata: safeStringifyJson({ ts: new Date().toISOString(), ...extra }),
    },
  }).catch(() => {})
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
    virustotal_api_key: settings.virustotalApiKey ? decrypt(settings.virustotalApiKey) : undefined,
    abuseipdb_api_key: settings.abuseipdbApiKey ? decrypt(settings.abuseipdbApiKey) : undefined,
    shodan_api_key: settings.shodanApiKey ? decrypt(settings.shodanApiKey) : undefined,
  }
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

    // Step 2: enriching
    await db.investigation.update({ where: { id: inv.id }, data: { status: 'enriching' } })
    const entitiesForAnalysis: EntityForAnalysis[] = []
    const allEntities = await db.entity.findMany({ where: { investigationId: inv.id } })
    for (const e of allEntities) {
      let enrichment: EnrichmentData = {}
      if (e.entityType.startsWith('ioc_') || e.entityType === 'ioc_wallet') {
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
      entitiesForAnalysis.push({
        entity_type: e.entityType as any,
        value: e.value,
        confidence: e.confidence,
        enrichment,
      })
    }

    // Persist relationships
    const rels = inferRelationships(extracted, text)
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

    const result = await analyze(entitiesForAnalysis, merged, userKeys, text.slice(0, 4000))

    const analysisRun = await db.analysisRun.create({
      data: {
        investigationId: inv.id,
        narrative: result.narrative,
        actorHypothesis: safeStringifyJson(result.actor_hypothesis),
        severityScore: result.severity_score,
        recommendations: safeStringifyJson(result.recommendations),
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
  } catch (e) {
    console.error('[pipeline] failed:', e)
    await db.investigation.update({
      where: { id: inv.id },
      data: { status: 'failed' },
    })
    throw e
  }
}
