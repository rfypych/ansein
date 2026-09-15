import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler } from '@/lib/api'
import { decodeToken, makeTokenPair } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const RefreshSchema = z.object({
  refresh_token: z.string(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = RefreshSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', 'refresh_token is required')
  }
  type RefreshPayload = { type: string; sub: string }
  const payload = await decodeToken<RefreshPayload>(parsed.data.refresh_token)
  if (!payload || payload.type !== 'refresh') {
    return jsonError(401, 'invalid_token', 'Invalid or expired refresh token')
  }
  const userId = Number(payload.sub)
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) {
    return jsonError(401, 'invalid_token', 'User not found or inactive')
  }
  const tokens = await makeTokenPair({
    id: user.id,
    email: user.email,
    isSuperuser: user.isSuperuser,
  })
  return ok(tokens)
})
