import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, parsePageParams, safeParseJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function list(req: NextRequest) {
  const user = await requireUser(req)
  if (!user.isSuperuser) {
    return jsonError(403, 'forbidden', 'Administrator access required')
  }
  const { page, pageSize } = parsePageParams(req)
  const [total, items] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return ok({
    items: items.map((a) => ({
      id: a.id,
      user_id: a.userId,
      action: a.action,
      target_type: a.targetType,
      target_id: a.targetId,
      ip_address: a.ipAddress,
      extra_metadata: safeParseJson<Record<string, unknown>>(a.extraMetadata, {}),
      created_at: a.createdAt.toISOString(),
    })),
    total,
    page,
    page_size: pageSize,
  })
}

export const GET = withErrorHandler(list)
