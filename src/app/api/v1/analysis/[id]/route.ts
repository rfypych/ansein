import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, safeParseJson } from '@/lib/api'
import { severityBreakdown } from '@/lib/engines/analysis'
import type { EnrichmentData } from '@/lib/engines/enrichment'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const [latest, entities] = await Promise.all([
    db.analysisRun.findFirst({
      where: { investigationId: invId },
      orderBy: { createdAt: 'desc' },
    }),
    db.entity.findMany({ where: { investigationId: invId } }),
  ])
  if (!latest) return jsonError(404, 'not_found', 'No analysis run yet')

  // Recompute the heuristic breakdown live from stored entities so the UI
  // can show exactly which factors produced the score — including a flag
  // when the stored (possibly LLM-set) score disagrees with the heuristic.
  const forAnalysis = entities.map((e) => ({
    entity_type: e.entityType,
    value: e.value,
    confidence: e.confidence,
    enrichment: safeParseJson<EnrichmentData>(e.enrichment, {}),
  }))
  const breakdown = severityBreakdown(forAnalysis, forAnalysis.map((e) => e.enrichment))

  return ok({
    id: latest.id,
    investigation_id: latest.investigationId,
    narrative: latest.narrative,
    actor_hypothesis: safeParseJson<Record<string, unknown>>(latest.actorHypothesis, {}),
    severity_score: latest.severityScore,
    severity_breakdown: breakdown,
    severity_agrees_with_heuristic: Math.abs(latest.severityScore - breakdown.total) <= 15,
    recommendations: safeParseJson<string[]>(latest.recommendations, []),
    hypotheses: safeParseJson<Array<{ scenario: string; confidence: number; reasoning: string; next_steps: string[] }>>(latest.hypotheses, []),
    admiralty_code: latest.admiraltyCode,
    confidence: latest.confidence,
    model_used: latest.modelUsed,
    tokens_used: latest.tokensUsed,
    provider: latest.provider || (latest.modelUsed === 'heuristic' ? 'heuristic' : 'unknown'),
    created_at: latest.createdAt.toISOString(),
  })
}

export const GET = withErrorHandler(handler)
