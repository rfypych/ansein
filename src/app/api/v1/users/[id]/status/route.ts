import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  getClientIp,
  safeStringifyJson,
  handlePrismaError,
} from '@/lib/api'
import { appendAuditLog } from '@/lib/audit-chain'
import { canManageUsers, getUserRole, type Role } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const StatusSchema = z.object({
  is_active: z.boolean(),
})

/**
 * PATCH /api/v1/users/[id]/status
 *
 * Admin-only endpoint to activate or deactivate a user.
 * Deactivated users cannot log in (checked at login and token validation).
 * Writes a hash-chained audit log entry.
 *
 * Safety:
 * - Caller must have the `user.manage` permission (admin).
 * - Target user must exist.
 * - Admin cannot deactivate themselves (to prevent lockout).
 */
async function changeStatus(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(req)
  if (!canManageUsers(caller)) {
    return jsonError(403, 'forbidden', 'Administrator access required to change user status')
  }
  const { id } = await ctx.params
  const targetId = Number(id)
  if (!Number.isFinite(targetId)) {
    return jsonError(400, 'invalid_id', 'Invalid user ID')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = StatusSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const newStatus = parsed.data.is_active

  const target = await db.user.findUnique({ where: { id: targetId } })
  if (!target) {
    return jsonError(404, 'not_found', 'User not found')
  }

  // Prevent self-deactivation
  if (caller.id === targetId && !newStatus) {
    return jsonError(422, 'self_deactivate', 'You cannot deactivate your own account')
  }

  // No-op short-circuit
  if (target.isActive === newStatus) {
    return ok({
      id: target.id,
      email: target.email,
      full_name: target.fullName,
      is_active: target.isActive,
      role: getUserRole(target),
      changed: false,
    })
  }

  try {
    const updated = await db.user.update({
      where: { id: targetId },
      data: { isActive: newStatus },
    })
    await appendAuditLog(db, {
      userId: caller.id,
      action: newStatus ? 'user.activate' : 'user.deactivate',
      targetType: 'user',
      targetId: targetId,
      ipAddress: getClientIp(req),
      extraMetadata: {
        target_user_id: targetId,
        target_email: target.email,
        previous_status: target.isActive,
        new_status: newStatus,
      },
    })
    return ok({
      id: updated.id,
      email: updated.email,
      full_name: updated.fullName,
      is_active: updated.isActive,
      role: getUserRole(updated),
      changed: true,
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const PATCH = withErrorHandler(changeStatus)
