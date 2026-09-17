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
} from '@/lib/api'
import { persistSource } from '@/lib/services/source-intake'

export const dynamic = 'force-dynamic'

const SourceSchema = z.object({
  source_type: z.enum(['text', 'file', 'url', 'email']),
  title: z.string().max(255).optional().default(''),
  content: z.string().max(2_000_000),
  mime_type: z.string().max(100).optional().default('text/plain'),
})

function sourceOut(s: {
  id: number
  investigationId: number
  sourceType: string
  title: string
  content: string
  contentHash: string
  mimeType: string
  sizeBytes: number
  createdAt: Date
}) {
  return {
    id: s.id,
    investigation_id: s.investigationId,
    source_type: s.sourceType,
    title: s.title,
    content: s.content,
    content_hash: s.contentHash,
    mime_type: s.mimeType,
    size_bytes: s.sizeBytes,
    created_at: s.createdAt.toISOString(),
  }
}

async function list(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')
  const sources = await db.source.findMany({
    where: { investigationId: invId },
    orderBy: { createdAt: 'desc' },
  })
  return ok(sources.map(sourceOut))
}

async function add(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = SourceSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }

  try {
    const s = await persistSource(invId, user.id, getClientIp(req), {
      sourceType: parsed.data.source_type,
      title: parsed.data.title,
      content: parsed.data.content,
      mimeType: parsed.data.mime_type,
    })
    return created(sourceOut(s))
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

async function remove(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  const url = new URL(req.url)
  const sourceId = url.searchParams.get('source_id')
  if (!sourceId) return jsonError(400, 'missing_param', 'source_id query param is required')
  const sid = Number(sourceId)
  if (!Number.isFinite(sid)) return jsonError(400, 'invalid_id', 'Invalid source ID')

  const existing = await db.source.findFirst({ where: { id: sid, investigationId: invId } })
  if (!existing) return jsonError(404, 'not_found', 'Source not found')
  await db.source.delete({ where: { id: sid } })
  // Audit: source removed
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'source.delete',
      targetType: 'investigation',
      targetId: invId,
      ipAddress: getClientIp(req),
      extraMetadata: { investigation_id: invId, source_id: sid },
    },
  }).catch(() => {})
  return ok({ message: 'Deleted' })
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(add)
export const DELETE = withErrorHandler(remove)
