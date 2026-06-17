import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, getClientIp, safeStringifyJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function getMe(req: NextRequest) {
  const user = await requireUser(req)
  const [invCount, sessionCount] = await Promise.all([
    db.investigation.count({ where: { userId: user.id } }),
    db.chatSession.count({ where: { userId: user.id } }),
  ])
  // Write an audit log entry for the profile view (lightweight)
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'profile.view',
      targetType: 'user',
      targetId: user.id,
      ipAddress: getClientIp(req),
      extraMetadata: safeStringifyJson({ ts: new Date().toISOString() }),
    },
  }).catch(() => {
    // audit log failure should not break the request
  })
  return ok({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    is_active: user.isActive,
    is_superuser: user.isSuperuser,
    created_at: user.createdAt.toISOString(),
    last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    stats: {
      investigations: invCount,
      copilot_sessions: sessionCount,
    },
  })
}

export const GET = withErrorHandler(getMe)
