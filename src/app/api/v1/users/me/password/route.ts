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
} from '@/lib/api'
import { hashPassword, verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
})

async function changePassword(req: NextRequest) {
  const user = await requireUser(req)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const { current_password, new_password } = parsed.data
  if (current_password === new_password) {
    return jsonError(400, 'same_password', 'New password must differ from current password')
  }

  const valid = await verifyPassword(current_password, user.hashedPassword)
  if (!valid) {
    return jsonError(401, 'invalid_credentials', 'Current password is incorrect')
  }

  const hashed = await hashPassword(new_password)
  try {
    await db.user.update({
      where: { id: user.id },
      data: { hashedPassword: hashed },
    })
    // Audit log the password change
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'user.password.change',
        targetType: 'user',
        targetId: user.id,
        ipAddress: getClientIp(req),
        extraMetadata: { ts: new Date().toISOString() },
      },
    }).catch(() => {})
    return ok({ message: 'Password updated successfully' })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const POST = withErrorHandler(changePassword)
