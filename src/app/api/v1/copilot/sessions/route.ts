import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  created,
  jsonError,
  withErrorHandler,
  requireUser,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

function sessionOut(s: {
  id: number
  userId: number
  investigationId: number | null
  title: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: s.id,
    user_id: s.userId,
    investigation_id: s.investigationId,
    title: s.title,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  }
}

async function list(req: NextRequest) {
  const user = await requireUser(req)
  const sessions = await db.chatSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  })
  return ok(sessions.map(sessionOut))
}

async function create(req: NextRequest) {
  const user = await requireUser(req)
  const url = new URL(req.url)
  const investigationIdParam = url.searchParams.get('investigation_id')
  const title = url.searchParams.get('title') || 'New Chat'

  let investigationId: number | null = null
  if (investigationIdParam) {
    investigationId = Number(investigationIdParam)
    if (!Number.isFinite(investigationId)) {
      return jsonError(400, 'invalid_id', 'Invalid investigation_id')
    }
    // Verify ownership
    const inv = await db.investigation.findFirst({
      where: { id: investigationId, userId: user.id },
    })
    if (!inv) return jsonError(404, 'not_found', 'Investigation not found')
  }

  const session = await db.chatSession.create({
    data: {
      userId: user.id,
      investigationId,
      title,
    },
  })
  return created(sessionOut(session))
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(create)
