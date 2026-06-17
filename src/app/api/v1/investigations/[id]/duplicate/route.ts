import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  created,
  jsonError,
  withErrorHandler,
  requireUser,
  handlePrismaError,
  safeParseJson,
  safeStringifyJson,
  getClientIp,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req)
  const { id } = await ctx.params
  const invId = Number(id)
  if (!Number.isFinite(invId)) return jsonError(400, 'invalid_id', 'Invalid investigation ID')

  const inv = await db.investigation.findFirst({
    where: { id: invId, userId: user.id },
    include: { sources: true },
  })
  if (!inv) return jsonError(404, 'not_found', 'Investigation not found')

  // Clone investigation metadata + sources (entities/relationships/analysis are NOT copied — they are pipeline outputs)
  try {
    const dup = await db.investigation.create({
      data: {
        userId: user.id,
        title: `${inv.title} (copy)`,
        description: inv.description,
        tags: inv.tags,
        status: 'pending',
        severityScore: 0,
        sources: {
          create: inv.sources.map((s) => ({
            sourceType: s.sourceType,
            title: s.title,
            content: s.content,
            contentHash: s.contentHash,
            mimeType: s.mimeType,
            sizeBytes: s.sizeBytes,
          })),
        },
      },
      include: { sources: true },
    })
    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'investigation.duplicate',
        targetType: 'investigation',
        targetId: dup.id,
        ipAddress: getClientIp(req),
        extraMetadata: safeStringifyJson({ source_id: inv.id }),
      },
    }).catch(() => {})
    return created({
      id: dup.id,
      user_id: dup.userId,
      title: dup.title,
      description: dup.description,
      status: dup.status,
      severity_score: dup.severityScore,
      tags: safeParseJson<string[]>(dup.tags, []),
      is_starred: false,
      created_at: dup.createdAt.toISOString(),
      updated_at: dup.updatedAt.toISOString(),
      source_count: dup.sources.length,
      entity_count: 0,
      relationship_count: 0,
    })
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const POST = withErrorHandler(handler)
