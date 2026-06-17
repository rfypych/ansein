import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ok,
  jsonError,
  withErrorHandler,
  requireUser,
  safeParseJson,
  safeStringifyJson,
  getClientIp,
  handlePrismaError,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  status: z
    .enum(['pending', 'extracting', 'enriching', 'analyzing', 'completed', 'failed'])
    .optional(),
  is_starred: z.boolean().optional(),
})

function investigationOut(inv: {
  id: number
  userId: number
  title: string
  description: string
  status: string
  severityScore: number
  tags: string
  isStarred: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: inv.id,
    user_id: inv.userId,
    title: inv.title,
    description: inv.description,
    status: inv.status,
    severity_score: inv.severityScore,
    tags: safeParseJson<string[]>(inv.tags, []),
    is_starred: inv.isStarred,
    created_at: inv.createdAt.toISOString(),
    updated_at: inv.updatedAt.toISOString(),
  }
}

async function getOne(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const inv = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')
  const [sourceCount, entityCount, relCount] = await Promise.all([
    db.source.count({ where: { investigationId: invId } }),
    db.entity.count({ where: { investigationId: invId } }),
    db.relationship.count({ where: { investigationId: invId } }),
  ])
  return ok({
    ...investigationOut(inv),
    source_count: sourceCount,
    entity_count: entityCount,
    relationship_count: relCount,
  })
}

async function update(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')
  const existing = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!existing) return jsonError(404, 'not_found', 'Investigation not found')

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
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.description !== undefined) data.description = parsed.data.description
  if (parsed.data.tags !== undefined) data.tags = safeStringifyJson(parsed.data.tags)
  if (parsed.data.status !== undefined) data.status = parsed.data.status
  if (parsed.data.is_starred !== undefined) data.isStarred = parsed.data.is_starred

  try {
    const inv = await db.investigation.update({ where: { id: invId }, data })
    // Audit log for star/unstar toggle (best-effort)
    if (parsed.data.is_starred !== undefined) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: parsed.data.is_starred ? 'investigation.star' : 'investigation.unstar',
          targetType: 'investigation',
          targetId: invId,
          ipAddress: getClientIp(req),
          extraMetadata: safeStringifyJson({ investigation_id: invId }),
        },
      }).catch(() => {})
    }
    return ok(investigationOut(inv))
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
  const existing = await db.investigation.findFirst({ where: { id: invId, userId: user.id } })
  if (!existing) return jsonError(404, 'not_found', 'Investigation not found')
  await db.investigation.delete({ where: { id: invId } })
  return ok({ message: 'Deleted' })
}

export const GET = withErrorHandler(getOne)
export const PATCH = withErrorHandler(update)
export const DELETE = withErrorHandler(remove)
