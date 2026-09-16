import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  safeParseJson,
} from '@/lib/api'
import { decayEntity } from '@/lib/engines/decay'

export const dynamic = 'force-dynamic'

async function list(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const entities = await db.entity.findMany({
    where: { investigationId: invId },
    orderBy: { confidence: 'desc' },
  })
  const now = new Date()
  return ok(
    entities.map((e) => {
      const decay = decayEntity(e.entityType, e.confidence, e.createdAt, now)
      return {
        id: e.id,
        entity_type: e.entityType,
        value: e.value,
        normalized: e.normalized,
        confidence: e.confidence,
        source_method: e.sourceMethod,
        enrichment: safeParseJson<Record<string, unknown>>(e.enrichment, {}),
        created_at: e.createdAt.toISOString(),
        decayed_confidence: decay.decayed_confidence,
        age_days: decay.age_days,
        freshness: decay.freshness,
      }
    })
  )
}

export const GET = withErrorHandler(list)
