import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  safeParseJson,
} from '@/lib/api'
import { decayEntity } from '@/lib/engines/decay'
import { defang, isGroundedInText } from '@/lib/engines/extraction'

export const dynamic = 'force-dynamic'

async function list(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const [entities, sources] = await Promise.all([
    db.entity.findMany({
      where: { investigationId: invId },
      orderBy: { confidence: 'desc' },
    }),
    db.source.findMany({
      where: { investigationId: invId },
      select: { content: true },
    }),
  ])
  // Grounding corpus: all source text, defanged+lowered once. Regex hits are
  // grounded by construction; LLM paraphrases are verified here so the UI
  // can label (and rules can exclude) ungrounded values.
  const corpus = defang(sources.map((s) => s.content).join('\n')).toLowerCase()
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
      const grounded =
        e.sourceMethod === 'regex' ||
        e.sourceMethod === 'both' ||
        e.sourceMethod === 'stix_import' ||
        isGroundedInText(e.value, e.entityType, corpus)
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
        verified_in_text: grounded,
        is_false_positive: e.isFalsePositive,
      }
    })
  )
}

export const GET = withErrorHandler(list)

const AdjudicateSchema = z.object({
  entity_id: z.number().int(),
  is_false_positive: z.boolean(),
})

/**
 * PATCH /entities/[investigationId] — analyst adjudication.
 * Marks an entity as false positive (or clears it). FP entities are
 * excluded from SIEM rules and TAXII sharing, but kept in analyst exports
 * with their flag, so the decision itself stays auditable.
 */
const patch = withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = AdjudicateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', 'entity_id and is_false_positive are required')
  }
  const ent = await db.entity.findFirst({
    where: { id: parsed.data.entity_id, investigationId: invId },
  })
  if (!ent) return jsonError(404, 'not_found', 'Entity not found in this investigation')
  const updated = await db.entity.update({
    where: { id: ent.id },
    data: { isFalsePositive: parsed.data.is_false_positive },
  })
  return ok({ id: updated.id, is_false_positive: updated.isFalsePositive })
})

export const PATCH = patch
