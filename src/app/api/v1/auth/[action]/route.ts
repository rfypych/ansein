import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, created, jsonError, withErrorHandler, handlePrismaError } from '@/lib/api'
import { hashPassword, makeTokenPair } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  full_name: z.string().max(120).optional().default(''),
})

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

const RefreshSchema = z.object({
  refresh_token: z.string(),
})

function userOut(u: {
  id: number
  email: string
  fullName: string
  isActive: boolean
  isSuperuser: boolean
  createdAt: Date
  lastLoginAt: Date | null
}) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    is_active: u.isActive,
    is_superuser: u.isSuperuser,
    created_at: u.createdAt.toISOString(),
    last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }
}

async function register(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const { email, password, full_name } = parsed.data

  const userCount = await db.user.count()
  const isSuperuser = userCount === 0

  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
  if (existing) {
    return jsonError(409, 'conflict', 'Email already registered')
  }

  const hashed = await hashPassword(password)
  try {
    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        hashedPassword: hashed,
        fullName: full_name,
        isSuperuser,
      },
    })
    await db.userSettings.create({ data: { userId: user.id } })
    const tokens = await makeTokenPair({
      id: user.id,
      email: user.email,
      isSuperuser: user.isSuperuser,
    })
    return created({ ...tokens, user: userOut(user) })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

async function login(req: NextRequest) {
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
  const { verifyPassword } = await import('@/lib/auth')
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
  return ok({ ...tokens, user: userOut(user) })
}

async function refresh(req: NextRequest) {
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
  const { decodeToken, makeTokenPair } = await import('@/lib/auth')
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
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()
  if (action === 'refresh') return refresh(req)
  if (action === 'login') return login(req)
  if (action === 'register') return register(req)
  return jsonError(404, 'not_found', `Auth endpoint "${action}" not found`)
})
