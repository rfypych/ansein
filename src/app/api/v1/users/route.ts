import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  created,
  jsonError,
  withErrorHandler,
  requireUser,
  getClientIp,
  safeStringifyJson,
  handlePrismaError,
} from '@/lib/api'
import { appendAuditLog } from '@/lib/audit-chain'
import { canListUsers, canManageUsers, normalizeRole, getUserRole, type Role } from '@/lib/rbac'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/users
 *
 * Admin-only listing of every user in the workspace. Returns basic profile
 * info plus per-user investigation counts so the admin "User Management"
 * panel can render without N+1 calls.
 *
 * Non-admins receive a 403. (Analysts and editors should not be able to
 * enumerate the user base.)
 */
async function list(req: NextRequest) {
  const caller = await requireUser(req)
  if (!canListUsers(caller)) {
    return jsonError(403, 'forbidden', 'Administrator access required to list users')
  }

  const users = await db.user.findMany({
    orderBy: [{ id: 'asc' }],
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      isSuperuser: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { investigations: true, chatSessions: true, auditLogs: true } },
    },
  })

  return ok({
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.fullName,
      is_active: u.isActive,
      is_superuser: u.isSuperuser,
      role: getUserRole(u),
      created_at: u.createdAt.toISOString(),
      last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      stats: {
        investigations: u._count.investigations,
        copilot_sessions: u._count.chatSessions,
        audit_events: u._count.auditLogs,
      },
    })),
    total: users.length,
  })
}

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  full_name: z.string().max(120).optional().default(''),
  role: z.enum(['analyst', 'editor', 'admin']).optional().default('analyst'),
})

/**
 * POST /api/v1/users
 *
 * Admin-only endpoint to create a new user with a specific role.
 * This bypasses the self-registration flow, allowing administrators to
 * provision accounts directly.
 */
async function createUser(req: NextRequest) {
  const caller = await requireUser(req)
  if (!canManageUsers(caller)) {
    return jsonError(403, 'forbidden', 'Administrator access required to create users')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const { email, password, full_name, role } = parsed.data
  const normalizedRole = normalizeRole(role) as Role | null
  if (!normalizedRole) {
    return jsonError(422, 'invalid_role', 'Role must be analyst, editor, or admin')
  }

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
        role: normalizedRole,
        isSuperuser: normalizedRole === 'admin',
      },
    })
    await db.userSettings.create({ data: { userId: user.id } })
    await appendAuditLog(db, {
      userId: caller.id,
      action: 'user.create',
      targetType: 'user',
      targetId: user.id,
      ipAddress: getClientIp(req),
      extraMetadata: safeStringifyJson({
        target_user_id: user.id,
        target_email: user.email,
        role: normalizedRole,
      }),
    })
    return created({
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      is_active: user.isActive,
      role: normalizedRole,
      created_at: user.createdAt.toISOString(),
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(createUser)
