import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  getClientIp,
  safeStringifyJson,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(120),
})

async function updateProfile(req: NextRequest) {
  const user = await requireUser(req)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data: { fullName: parsed.data.full_name.trim() },
    })
    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.profile.update',
        targetType: 'user',
        targetId: user.id,
        ipAddress: getClientIp(req),
        extraMetadata: { ts: new Date().toISOString() },
      },
    }).catch(() => {})
    return ok({
      id: updated.id,
      email: updated.email,
      full_name: updated.fullName,
      is_active: updated.isActive,
      is_superuser: updated.isSuperuser,
      created_at: updated.createdAt.toISOString(),
      last_login_at: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const PATCH = withErrorHandler(updateProfile)
