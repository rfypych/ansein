import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  safeParseJson,
  getClientIp,
  safeStringifyJson,
} from '@/lib/api'
import { runPipeline } from '@/lib/services/pipeline'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for pipeline runs

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  // Block re-running while already in-progress
  if (['extracting', 'enriching', 'analyzing'].includes(inv.status)) {
    return jsonError(409, 'in_progress', `Investigation is already ${inv.status}. Wait for completion.`)
  }

  // Audit: pipeline start (best-effort)
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'investigation.pipeline.start',
      targetType: 'investigation',
      targetId: invId,
      ipAddress: getClientIp(req),
      extraMetadata: safeStringifyJson({ investigation_id: invId, from_status: inv.status }),
    },
  }).catch(() => {})

  try {
    await runPipeline(invId, user.id)
  } catch (e) {
    console.error('[pipeline] error:', e)
    // Audit: pipeline failed (best-effort)
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'investigation.pipeline.failed',
        targetType: 'investigation',
        targetId: invId,
        ipAddress: getClientIp(req),
        extraMetadata: safeStringifyJson({
          investigation_id: invId,
          error: e instanceof Error ? e.message.slice(0, 200) : 'unknown',
        }),
      },
    }).catch(() => {})
    return jsonError(500, 'pipeline_failed', e instanceof Error ? e.message : 'Pipeline failed')
  }

  // Audit: pipeline complete (best-effort)
  const refreshed = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'investigation.pipeline.complete',
      targetType: 'investigation',
      targetId: invId,
      ipAddress: getClientIp(req),
      extraMetadata: safeStringifyJson({
        investigation_id: invId,
        to_status: refreshed?.status || 'completed',
        severity_score: refreshed?.severityScore || 0,
      }),
    },
  }).catch(() => {})

  const updated = refreshed
  if (!updated) return jsonError(404, 'not_found', 'Investigation vanished')
  const [sourceCount, entityCount, relCount] = await Promise.all([
    db.source.count({ where: { investigationId: invId } }),
    db.entity.count({ where: { investigationId: invId } }),
    db.relationship.count({ where: { investigationId: invId } }),
  ])
  return ok({
    id: updated.id,
    user_id: updated.userId,
    title: updated.title,
    description: updated.description,
    status: updated.status,
    severity_score: updated.severityScore,
    tags: safeParseJson<string[]>(updated.tags, []),
    is_starred: updated.isStarred,
    created_at: updated.createdAt.toISOString(),
    updated_at: updated.updatedAt.toISOString(),
    source_count: sourceCount,
    entity_count: entityCount,
    relationship_count: relCount,
  })
}

export const POST = withErrorHandler(handler)
