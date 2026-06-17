import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  safeParseJson,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Investigation-scoped audit activity feed.
 * Returns audit log entries where target_id = invId AND target_type = 'investigation',
 * plus any events whose extra_metadata.investigation_id = invId (e.g. note.* actions).
 */
async function list(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')

  // Verify ownership
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  // Get all audit logs that target this investigation directly OR via metadata.
  // We pull the last 100 audit logs for this user and filter, since SQLite LIKE
  // on a JSON text column is the most efficient way to scan metadata.
  const logs = await db.auditLog.findMany({
    where: {
      OR: [
        { targetType: 'investigation', targetId: invId },
        { action: { startsWith: 'note.' }, extraMetadata: { contains: `"investigation_id":${invId}` } },
        { action: { startsWith: 'note.' }, extraMetadata: { contains: `"investigation_id": ${invId}` } },
        { action: 'investigation.pipeline.start', extraMetadata: { contains: `"investigation_id":${invId}` } },
        { action: 'investigation.pipeline.start', extraMetadata: { contains: `"investigation_id": ${invId}` } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return ok({
    items: logs.map((a) => ({
      id: a.id,
      user_id: a.userId,
      action: a.action,
      target_type: a.targetType,
      target_id: a.targetId,
      ip_address: a.ipAddress,
      extra_metadata: safeParseJson<Record<string, unknown>>(a.extraMetadata, {}),
      created_at: a.createdAt.toISOString(),
    })),
    total: logs.length,
  })
}

export const GET = withErrorHandler(list)
