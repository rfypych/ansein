import { NextRequest } from 'next/server'
import { z } from 'zod'
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
import { canChangeUserRole, normalizeRole, getUserRole, type Role } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const RoleSchema = z.object({
  role: z.enum(['analyst', 'editor', 'admin']),
})

/**
 * PATCH /api/v1/users/[id]/role
 *
 * Admin-only endpoint to change a user's role. Writes a hash-chained audit
 * log entry recording the previous and new roles.
 *
 * Safety:
 * - Caller must have the `user.change_role` permission (admin).
 * - Target user must exist.
 * - The role value is validated against the known enum.
 * - Self-demotion is permitted (the admin simply loses admin powers) — we
 *   flag it in the audit log so it's visible after the fact.
 */
async function changeRole(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireUser(req)
  if (!canChangeUserRole(caller)) {
    return jsonError(403, 'forbidden', 'Administrator access required to change user roles')
  }
  const { id } = await ctx.params
  const targetId = Number(id)
  if (!Number.isFinite(targetId)) {
    return jsonError(400, 'invalid_id', 'Invalid user ID')
  }
  
  if (caller.id === targetId) {
    return jsonError(403, 'forbidden', 'You cannot change your own role.')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = RoleSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid role')
  }
  const newRole = normalizeRole(parsed.data.role) as Role | null
  if (!newRole) {
    return jsonError(422, 'invalid_role', 'Role must be analyst, editor, or admin')
  }

  const target = await db.user.findUnique({ where: { id: targetId } })
  if (!target) {
    return jsonError(404, 'not_found', 'User not found')
  }
  const previousRole = getUserRole(target)

  // No-op short-circuit (avoids spurious audit entries)
  if (previousRole === newRole) {
    return ok({
      id: target.id,
      email: target.email,
      full_name: target.fullName,
      role: previousRole,
      previous_role: previousRole,
      changed: false,
    })
  }

  try {
    const updated = await db.user.update({
      where: { id: targetId },
      // Keep isSuperuser in sync with role === 'admin' for backward compat.
      data: { role: newRole, isSuperuser: newRole === 'admin' },
    })
    await appendAuditLog(db, {
      userId: caller.id,
      action: 'user.role.change',
      targetType: 'user',
      targetId: targetId,
      ipAddress: getClientIp(req),
      extraMetadata: {
        target_user_id: targetId,
        target_email: target.email,
        previous_role: previousRole,
        new_role: newRole,
        self_demotion: caller.id === targetId,
      },
    })
    return ok({
      id: updated.id,
      email: updated.email,
      full_name: updated.fullName,
      role: newRole,
      previous_role: previousRole,
      changed: true,
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const PATCH = withErrorHandler(changeRole)
