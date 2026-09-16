import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, getClientIp } from '@/lib/api'
import { getUserRole } from '@/lib/rbac'
import { appendAuditLog } from '@/lib/audit-chain'

export const dynamic = 'force-dynamic'

async function getMe(req: NextRequest) {
  const user = await requireUser(req)
  const [invCount, sessionCount] = await Promise.all([
    db.investigation.count({ where: { userId: user.id } }),
    db.chatSession.count({ where: { userId: user.id } }),
  ])
  // Write an audit log entry for the profile view (lightweight, hash-chained)
  await appendAuditLog(db, {
    userId: user.id,
    action: 'profile.view',
    targetType: 'user',
    targetId: user.id,
    ipAddress: getClientIp(req),
    extraMetadata: { ts: new Date().toISOString() },
  })
  return ok({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    is_active: user.isActive,
    is_superuser: user.isSuperuser,
    role: getUserRole(user),
    created_at: user.createdAt.toISOString(),
    last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    stats: {
      investigations: invCount,
      copilot_sessions: sessionCount,
    },
  })
}

export const GET = withErrorHandler(getMe)
