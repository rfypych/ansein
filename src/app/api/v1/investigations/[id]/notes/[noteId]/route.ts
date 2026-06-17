import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  getClientIp,
  safeStringifyJson,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  pinned: z.boolean().optional(),
})

async function update(req: NextRequest, ctx: { params: Promise<{ id: string; noteId: string }> }) {
  const user = await requireUser(req)
  const { id, noteId } = await ctx.params
  const invId = Number(id)
  const nId = Number(noteId)
  if (!Number.isFinite(invId) || !Number.isFinite(nId)) {
    return jsonError(400, 'invalid_id', 'Invalid ID')
  }

  // Verify investigation ownership
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  // Verify note belongs to investigation; user can edit any note on their investigation
  const note = await db.investigationNote.findFirst({ where: { id: nId, investigationId: invId } })
  if (!note) return jsonError(404, 'not_found', 'Note not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.body !== undefined) data.body = parsed.data.body
  if (parsed.data.pinned !== undefined) data.pinned = parsed.data.pinned

  try {
    const updated = await db.investigationNote.update({
      where: { id: nId },
      data,
    })
    return ok({
      id: updated.id,
      investigation_id: updated.investigationId,
      user_id: updated.userId,
      body: updated.body,
      pinned: updated.pinned,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

async function remove(req: NextRequest, ctx: { params: Promise<{ id: string; noteId: string }> }) {
  const user = await requireUser(req)
  const { id, noteId } = await ctx.params
  const invId = Number(id)
  const nId = Number(noteId)
  if (!Number.isFinite(invId) || !Number.isFinite(nId)) {
    return jsonError(400, 'invalid_id', 'Invalid ID')
  }

  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const note = await db.investigationNote.findFirst({ where: { id: nId, investigationId: invId } })
  if (!note) return jsonError(404, 'not_found', 'Note not found')

  await db.investigationNote.delete({ where: { id: nId } })

  // Audit log (best-effort)
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'note.delete',
      targetType: 'investigation',
      targetId: invId,
      ipAddress: getClientIp(req),
      extraMetadata: safeStringifyJson({ note_id: nId }),
    },
  }).catch(() => {})

  return ok({ message: 'Deleted' })
}

export const PATCH = withErrorHandler(update)
export const DELETE = withErrorHandler(remove)
