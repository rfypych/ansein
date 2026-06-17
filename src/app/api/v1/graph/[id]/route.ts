import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import { buildGraph } from '@/lib/engines/graph'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const [entities, rels] = await Promise.all([
    db.entity.findMany({ where: { investigationId: invId } }),
    db.relationship.findMany({ where: { investigationId: invId } }),
  ])

  const graph = buildGraph(
    entities.map((e) => ({
      id: e.id,
      entityType: e.entityType as any,
      value: e.value,
      confidence: e.confidence,
      enrichment: e.enrichment,
    })),
    rels.map((r) => ({
      sourceId: r.sourceId,
      targetId: r.targetId,
      relationType: r.relationType,
      weight: r.weight,
      evidence: r.evidence,
    }))
  )
  return ok(graph)
}

export const GET = withErrorHandler(handler)
