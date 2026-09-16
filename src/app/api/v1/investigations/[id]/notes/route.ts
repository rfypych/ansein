import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  created,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  getClientIp,
  safeStringifyJson,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  body: z.string().min(1).max(10000),
  pinned: z.boolean().optional().default(false),
})

function noteOut(n: {
  id: number
  investigationId: number
  userId: number
  body: string
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}, author?: { fullName?: string; email?: string }) {
  return {
    id: n.id,
    investigation_id: n.investigationId,
    user_id: n.userId,
    author_name: author?.fullName || author?.email?.split('@')[0] || 'Analyst',
    body: n.body,
    pinned: n.pinned,
    created_at: n.createdAt.toISOString(),
    updated_at: n.updatedAt.toISOString(),
  }
}

async function list(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')

  // Ensure investigation belongs to this user
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const notes = await db.investigationNote.findMany({
    where: { investigationId: invId },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  return ok({
    items: notes.map((n) => noteOut(n, n.user)),
    total: notes.length,
  })
}

async function create(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')

  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }

  try {
    const note = await db.investigationNote.create({
      data: {
        investigationId: invId,
        userId: user.id,
        body: parsed.data.body,
        pinned: parsed.data.pinned,
      },
      include: { user: { select: { fullName: true, email: true } } },
    })
    // Audit log (best-effort)
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'note.create',
        targetType: 'investigation',
        targetId: invId,
        ipAddress: getClientIp(req),
        extraMetadata: { note_id: note.id },
      },
    }).catch(() => {})
    return created(noteOut(note, note.user))
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(create)
