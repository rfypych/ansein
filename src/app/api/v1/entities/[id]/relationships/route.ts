import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

async function list(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const rels = await db.relationship.findMany({
    where: { investigationId: invId },
    orderBy: { weight: 'desc' },
  })
  return ok(
    rels.map((r) => ({
      id: r.id,
      source_id: r.sourceId,
      target_id: r.targetId,
      relation_type: r.relationType,
      weight: r.weight,
      evidence: r.evidence,
    }))
  )
}

export const GET = withErrorHandler(list)
