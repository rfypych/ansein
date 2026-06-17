import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  ok,
  withErrorHandler,
  requireUser,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Aggregated cross-investigation stats for the dashboard.
 * Returns: entity type distribution, top entities, recent activity, etc.
 */
async function overview(req: NextRequest) {
  const user = await requireUser(req)

  // Get all investigation IDs owned by this user
  const investigations = await db.investigation.findMany({
    where: { userId: user.id },
    select: { id: true },
  })
  const invIds = investigations.map((i) => i.id)

  if (invIds.length === 0) {
    return ok({
      entity_types: [],
      top_entities: [],
      total_entities: 0,
      total_relationships: 0,
    })
  }

  // Entity type distribution (across all investigations)
  const typeGroups = await db.entity.groupBy({
    by: ['entityType'],
    where: { investigationId: { in: invIds } },
    _count: true,
    orderBy: { _count: { entityType: 'desc' } },
  })

  // Top entities (by frequency — same value across investigations)
  // SQLite doesn't support full-text or array grouping well, so we do a simple groupBy on value
  const valueGroups = await db.entity.groupBy({
    by: ['value', 'entityType'],
    where: { investigationId: { in: invIds } },
    _count: true,
    orderBy: { _count: { value: 'desc' } },
    take: 8,
  })

  const totalEntities = typeGroups.reduce((s, g) => s + g._count, 0)

  return ok({
    entity_types: typeGroups.map((g) => ({
      type: g.entityType,
      count: g._count,
    })),
    top_entities: valueGroups.map((g) => ({
      value: g.value,
      type: g.entityType,
      count: g._count,
    })),
    total_entities: totalEntities,
    total_relationships: await db.relationship.count({
      where: { investigationId: { in: invIds } },
    }),
  })
}

export const GET = withErrorHandler(overview)
