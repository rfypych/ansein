import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, safeParseJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const sid = Number(id)
  if (!Number.isFinite(sid)) return jsonError(400, 'invalid_id', 'Invalid session ID')
  const session = await db.chatSession.findFirst({ where: { id: sid, userId: user.id } })
  if (!session) return jsonError(404, 'not_found', 'Chat session not found')
  const messages = await db.chatMessage.findMany({
    where: { sessionId: sid },
    orderBy: { id: 'asc' },
  })
  return ok(
    messages.map((m) => ({
      id: m.id,
      session_id: m.sessionId,
      role: m.role,
      content: m.content,
      citations: safeParseJson<string[]>(m.citations, []),
      tokens_used: m.tokensUsed,
      created_at: m.createdAt.toISOString(),
    }))
  )
}

export const GET = withErrorHandler(handler)
