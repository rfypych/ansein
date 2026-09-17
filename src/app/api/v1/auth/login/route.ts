import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { jsonError, withErrorHandler, getClientIp } from '@/lib/api'
import { verifyPassword, makeTokenPair } from '@/lib/auth'
import { setAuthCookies } from '@/lib/cookies'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  // Per-IP brute-force brake: 10 attempts/minute (per-instance, best-effort
  // on serverless — see rate-limit.ts for the honest limitation note).
  const rl = checkRateLimit(`login:${getClientIp(req)}`, 10, 60_000)
  if (!rl.allowed) {
    const res = NextResponse.json(
      { detail: 'Too many login attempts, try again shortly', code: 'rate_limited' },
      { status: 429 }
    )
    res.headers.set('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)))
    return res
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', 'Invalid email or password')
  }
  const { email, password } = parsed.data
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) {
    return jsonError(401, 'invalid_credentials', 'Invalid email or password')
  }
  const valid = await verifyPassword(password, user.hashedPassword)
  if (!valid) {
    return jsonError(401, 'invalid_credentials', 'Invalid email or password')
  }
  if (!user.isActive) {
    return jsonError(403, 'inactive', 'Account is inactive')
  }
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })
  const tokens = await makeTokenPair({
    id: user.id,
    email: user.email,
    isSuperuser: user.isSuperuser,
  })
  // Tokens are delivered BOTH as httpOnly cookies (primary, XSS-safe) and in
  // the body (transitional compat). The client must not persist them.
  const res = NextResponse.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      is_active: user.isActive,
      is_superuser: user.isSuperuser,
      role: user.role === 'admin' ? 'admin' : user.role === 'editor' ? 'editor' : 'analyst',
      created_at: user.createdAt.toISOString(),
      last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    },
  })
  setAuthCookies(res, tokens)
  return res
})
