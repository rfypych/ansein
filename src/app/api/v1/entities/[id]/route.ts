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
  // Cross-case correlation: how many OTHER investigations of this user
  // contain the same (type, normalized) indicator. One grouped query —
  // this is the cheap version of OpenCTI's observable correlation.
  let seenCounts: Record<string, number> = {}
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT e."normalized" AS n, e."entity_type" AS t, COUNT(DISTINCT e."investigation_id")::int AS c
       FROM "entities" e
       WHERE e."investigation_id" <> $1
         AND e."investigation_id" IN (SELECT "id" FROM "investigations" WHERE "user_id" = $2 AND "id" <> $1)
         AND (e."entity_type", e."normalized") IN (SELECT "entity_type", "normalized" FROM "entities" WHERE "investigation_id" = $1)
       GROUP BY e."normalized", e."entity_type"`,
      invId,
      user.id
    )) as Array<{ n: string; t: string; c: number }>
    for (const r of rows) seenCounts[`${r.t}|${String(r.n).toLowerCase()}`] = Number(r.c)
  } catch {
    seenCounts = {}
  }
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
        seen_in_cases: seenCounts[`${e.entityType}|${e.normalized.toLowerCase()}`] || 0,
      }
    })
  )
}

export const GET = withErrorHandler(list)
