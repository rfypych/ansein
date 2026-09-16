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
  parsePageParams,
  safeParseJson,
} from '@/lib/api'
import { canEditAnyInvestigation } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional().default(''),
  tags: z.array(z.string().max(60)).max(20).optional().default([]),
})

function investigationOut(inv: {
  id: number
  userId: number
  title: string
  description: string
  status: string
  severityScore: number
  tags: unknown
  isStarred: boolean
  createdAt: Date
  updatedAt: Date
}, counts?: { sources: number; entities: number; relationships: number }) {
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
    source_count: counts?.sources ?? 0,
    entity_count: counts?.entities ?? 0,
    relationship_count: counts?.relationships ?? 0,
  }
}

async function list(req: NextRequest) {
  const user = await requireUser(req)
  const { page, pageSize, url } = parsePageParams(req)
  const status = url.searchParams.get('status') || undefined
  const starred = url.searchParams.get('starred')
  const search = url.searchParams.get('q') || undefined
  const scope = url.searchParams.get('scope') // 'own' | 'all'
  
  // By default: analysts see own investigations. Editors and Admins see workspace-wide unless scope='own' requested.
  const isPrivileged = canEditAnyInvestigation(user)
  const filterOwn = scope === 'own' || (!isPrivileged && scope !== 'all')

  const where: { userId?: number; status?: string; isStarred?: boolean; OR?: Array<{ title?: { contains: string; mode?: 'insensitive' }; description?: { contains: string; mode?: 'insensitive' } }> } = {}
  if (filterOwn) {
    where.userId = user.id
  }
  if (status) where.status = status
  if (starred === '1' || starred === 'true') where.isStarred = true
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [total, items] = await Promise.all([
    db.investigation.count({ where }),
    db.investigation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // Get counts per investigation in one round-trip
  const ids = items.map((i) => i.id)
  const [sourceCounts, entityCounts, relCounts] = await Promise.all([
    db.source.groupBy({ by: ['investigationId'], where: { investigationId: { in: ids } }, _count: true }),
    db.entity.groupBy({ by: ['investigationId'], where: { investigationId: { in: ids } }, _count: true }),
    db.relationship.groupBy({ by: ['investigationId'], where: { investigationId: { in: ids } }, _count: true }),
  ])
  const sc = new Map(sourceCounts.map((r) => [r.investigationId, r._count]))
  const ec = new Map(entityCounts.map((r) => [r.investigationId, r._count]))
  const rc = new Map(relCounts.map((r) => [r.investigationId, r._count]))

  return ok({
    items: items.map((i) =>
      investigationOut(i, {
        sources: sc.get(i.id) || 0,
        entities: ec.get(i.id) || 0,
        relationships: rc.get(i.id) || 0,
      })
    ),
    total,
    page,
    page_size: pageSize,
  })
}

async function create(req: NextRequest) {
  const user = await requireUser(req)
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
    const inv = await db.investigation.create({
      data: {
        userId: user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        tags: parsed.data.tags,
        status: 'pending',
      },
    })
    return created(investigationOut(inv, { sources: 0, entities: 0, relationships: 0 }))
  } catch (e) {
    const err = handlePrismaError(e)
    return jsonError(err.status, err.code, err.message)
  }
}

export const GET = withErrorHandler(list)
export const POST = withErrorHandler(create)
export const DELETE = withErrorHandler(bulkDelete)

const BulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
})

async function bulkDelete(req: NextRequest) {
  const user = await requireUser(req)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'invalid_body', 'Invalid JSON body')
  }
  const parsed = BulkDeleteSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(422, 'validation_error', parsed.error.issues[0]?.message || 'Invalid input')
  }
  const ids = parsed.data.ids
  // Only delete investigations owned by this user
  const result = await db.investigation.deleteMany({
    where: { id: { in: ids }, userId: user.id },
  })
  return ok({ deleted: result.count, requested: ids.length })
}
