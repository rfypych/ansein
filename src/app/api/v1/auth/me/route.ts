import { NextRequest } from 'next/server'
import { ok, jsonError, withErrorHandler, requireUser } from '@/lib/api'
import { getUserRole } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

async function me(req: NextRequest) {
  const user = await requireUser(req)
  return ok({
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    is_active: user.isActive,
    is_superuser: user.isSuperuser,
    role: getUserRole(user),
    created_at: user.createdAt.toISOString(),
    last_login_at: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  })
}

export const GET = withErrorHandler(me)
