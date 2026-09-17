import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { jsonError, withErrorHandler } from '@/lib/api'
import { decodeToken, makeTokenPair } from '@/lib/auth'
import { getCookieToken, setAuthCookies, REFRESH_COOKIE } from '@/lib/cookies'

export const dynamic = 'force-dynamic'

const RefreshSchema = z.object({
  refresh_token: z.string().optional(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Prefer the httpOnly cookie; accept a body token for transitional compat.
  let bodyToken: string | undefined
  try {
    const body: unknown = await req.json()
    const parsed = RefreshSchema.safeParse(body)
    if (parsed.success) bodyToken = parsed.data.refresh_token
  } catch {
    // No JSON body — cookie-only refresh. Fine.
  }
  const refreshToken = getCookieToken(req, REFRESH_COOKIE) || bodyToken
  if (!refreshToken) {
    return jsonError(401, 'invalid_token', 'No refresh token provided')
  }
  type RefreshPayload = { type: string; sub: string; version?: number }
  const payload = await decodeToken<RefreshPayload>(refreshToken)
  if (!payload || payload.type !== 'refresh') {
    return jsonError(401, 'invalid_token', 'Invalid or expired refresh token')
  }
  const userId = Number(payload.sub)
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !user.isActive) {
    return jsonError(401, 'invalid_token', 'User not found or inactive')
  }
  // Revoked generation (logout / password change bumps token_version)
  if ((payload.version ?? 0) !== user.tokenVersion) {
    return jsonError(401, 'revoked', 'Session revoked — please sign in again')
  }
  const tokens = await makeTokenPair({
    id: user.id,
    email: user.email,
    isSuperuser: user.isSuperuser,
    tokenVersion: user.tokenVersion,
  })
  const res = NextResponse.json(tokens)
  setAuthCookies(res, tokens)
  return res
})
