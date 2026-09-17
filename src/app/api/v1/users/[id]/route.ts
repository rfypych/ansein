import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  getClientIp,
  handlePrismaError,
} from '@/lib/api'
import { appendAuditLog } from '@/lib/audit-chain'
import { canManageUsers } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/v1/users/[id] — admin-only user removal.
 *
 * Safety:
 * - Caller must have the `user.manage` permission (admin).
 * - You cannot delete your own account (prevents lockout-by-typo).
 * - The last superuser cannot be deleted (prevents a headless workspace).
 * - All owned investigations, notes, playbooks and settings cascade-delete
 *   via Prisma onDelete rules; audit rows keep userId=NULL (SetNull) so the
 *   trail survives the account.
 */
async function removeUser(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(req)
  if (!canManageUsers(caller)) {
    return jsonError(403, 'forbidden', 'Administrator access required to delete users')
  }
  const { id } = await ctx.params
  const targetId = Number(id)
  if (!Number.isFinite(targetId)) return jsonError(400, 'invalid_id', 'Invalid user ID')
  if (caller.id === targetId) {
    return jsonError(403, 'forbidden', 'You cannot delete your own account.')
  }

  const target = await db.user.findUnique({ where: { id: targetId } })
  if (!target) return jsonError(404, 'not_found', 'User not found')

  if (target.isSuperuser) {
    const superCount = await db.user.count({ where: { isSuperuser: true } })
    if (superCount <= 1) {
      return jsonError(403, 'forbidden', 'Cannot delete the last superuser account.')
    }
  }

  try {
    await db.user.delete({ where: { id: targetId } })
    await appendAuditLog(db, {
      userId: caller.id,
      action: 'user.delete',
      targetType: 'user',
      targetId,
      ipAddress: getClientIp(req),
      extraMetadata: { target_email: target.email, target_role: target.role },
    }).catch(() => {})
    return ok({ message: 'User deleted', id: targetId })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const DELETE = withErrorHandler(removeUser)
