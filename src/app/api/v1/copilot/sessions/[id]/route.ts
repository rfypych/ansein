import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ok, jsonError, withErrorHandler, requireUser, safeParseJson, handlePrismaError } from '@/lib/api'

export const dynamic = 'force-dynamic'

const RenameSchema = z.object({
  title: z.string().min(1).max(120),
})

async function renameSession(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const sid = Number(id)
  if (!Number.isFinite(sid)) return jsonError(400, 'invalid_id', 'Invalid session ID')
  const existing = await db.chatSession.findFirst({ where: { id: sid, userId: user.id } })
  if (!existing) return jsonError(404, 'not_found', 'Chat session not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = RenameSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  try {
    const updated = await db.chatSession.update({
      where: { id: sid },
      data: { title: parsed.data.title },
    })
    return ok({
      id: updated.id,
      title: updated.title,
      updated_at: updated.updatedAt.toISOString(),
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

async function deleteSession(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const sid = Number(id)
  if (!Number.isFinite(sid)) return jsonError(400, 'invalid_id', 'Invalid session ID')
  const existing = await db.chatSession.findFirst({ where: { id: sid, userId: user.id } })
  if (!existing) return jsonError(404, 'not_found', 'Chat session not found')
  await db.chatSession.delete({ where: { id: sid } })
  return ok({ message: 'Deleted' })
}

async function listMessages(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

export const PATCH = withErrorHandler(renameSession)
export const DELETE = withErrorHandler(deleteSession)
export const GET = withErrorHandler(listMessages)
