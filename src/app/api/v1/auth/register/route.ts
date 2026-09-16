import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { jsonError, withErrorHandler, handlePrismaError } from '@/lib/api'
import { hashPassword, makeTokenPair } from '@/lib/auth'
import { setAuthCookies } from '@/lib/cookies'

export const dynamic = 'force-dynamic'

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  full_name: z.string().max(120).optional().default(''),
})

export const POST = withErrorHandler(async (req: NextRequest) => {
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
  const isFirstUser = userCount === 0
  const role = isFirstUser ? 'admin' : 'analyst'
  const isSuperuser = isFirstUser

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
        role,
        isSuperuser,
      },
    })
    await db.userSettings.create({ data: { userId: user.id } })
    const tokens = await makeTokenPair({
      id: user.id,
      email: user.email,
      isSuperuser: user.isSuperuser,
    })
    const res = NextResponse.json(
      {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          is_active: user.isActive,
          is_superuser: user.isSuperuser,
          role: user.role === 'admin' ? 'admin' : user.role === 'editor' ? 'editor' : 'analyst',
          created_at: user.createdAt.toISOString(),
          last_login_at: null,
        },
      },
      { status: 201 }
    )
    setAuthCookies(res, tokens)
    return res
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
})
