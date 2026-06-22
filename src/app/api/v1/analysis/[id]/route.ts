import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, safeParseJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const latest = await db.analysisRun.findFirst({
    where: { investigationId: invId },
    orderBy: { createdAt: 'desc' },
  })
  if (!latest) return jsonError(404, 'not_found', 'No analysis run yet')

  return ok({
    id: latest.id,
    investigation_id: latest.investigationId,
    narrative: latest.narrative,
    actor_hypothesis: safeParseJson<Record<string, unknown>>(latest.actorHypothesis, {}),
    severity_score: latest.severityScore,
    recommendations: safeParseJson<string[]>(latest.recommendations, []),
    hypotheses: safeParseJson<Array<{ scenario: string; confidence: number; reasoning: string; next_steps: string[] }>>(latest.hypotheses, []),
    admiralty_code: latest.admiraltyCode,
    confidence: latest.confidence,
    model_used: latest.modelUsed,
    tokens_used: latest.tokensUsed,
    created_at: latest.createdAt.toISOString(),
  })
}

export const GET = withErrorHandler(handler)
