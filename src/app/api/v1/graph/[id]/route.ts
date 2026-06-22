import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import { buildGraph } from '@/lib/engines/graph'

export const dynamic = 'force-dynamic'

/**
 * Parse an ISO date string into a Date. Returns null if the input is missing
 * or unparseable. Used by the ?before= and ?after= query params that drive the
 * 4D temporal slider on the graph view.
 */
function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return null
  return new Date(t)
}

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const url = new URL(req.url)
  const before = parseDateParam(url.searchParams.get('before'))
  const after = parseDateParam(url.searchParams.get('after'))

  const [entities, rels] = await Promise.all([
    db.entity.findMany({ where: { investigationId: invId } }),
    db.relationship.findMany({ where: { investigationId: invId } }),
  ])

  // Apply optional temporal filters at the API layer so the caller can request
  // a sliced view of the graph (e.g. for the timeline slider "before" bound).
  // Filtering here (vs. on the client) means we don't ship the full graph
  // payload over the wire when the user is only looking at a slice.
  const filteredEntities = entities.filter((e) => {
    if (before && e.createdAt.getTime() > before.getTime()) return false
    if (after && e.createdAt.getTime() < after.getTime()) return false
    return true
  })
  const filteredEntityIds = new Set(filteredEntities.map((e) => e.id))
  const filteredRels = rels.filter((r) => {
    if (!filteredEntityIds.has(r.sourceId) || !filteredEntityIds.has(r.targetId)) return false
    if (before && r.createdAt.getTime() > before.getTime()) return false
    if (after && r.createdAt.getTime() < after.getTime()) return false
    return true
  })

  const graph = buildGraph(
    filteredEntities.map((e) => ({
      id: e.id,
      entityType: e.entityType as any,
      value: e.value,
      confidence: e.confidence,
      enrichment: e.enrichment,
      createdAt: e.createdAt,
    })),
    filteredRels.map((r) => ({
      sourceId: r.sourceId,
      targetId: r.targetId,
      relationType: r.relationType,
      weight: r.weight,
      evidence: r.evidence,
      createdAt: r.createdAt,
    }))
  )

  // Always return the full temporal range (computed from the unfiltered
  // entity/relationship set) so the client slider bounds stay stable even
  // when the API is called with ?before=/?after= filters.
  const allTs: number[] = []
  for (const e of entities) allTs.push(e.createdAt.getTime())
  for (const r of rels) allTs.push(r.createdAt.getTime())
  if (allTs.length) {
    graph.minDate = new Date(Math.min(...allTs)).toISOString()
    graph.maxDate = new Date(Math.max(...allTs)).toISOString()
  } else {
    graph.minDate = null
    graph.maxDate = null
  }

  return ok(graph)
}

export const GET = withErrorHandler(handler)
