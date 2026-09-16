import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildStixBundle } from '@/lib/services/export'
import { requireUser } from '@/lib/api'

export const dynamic = 'force-dynamic'

const TAXII_CT = 'application/taxii+json;version=2.1'
const COLLECTION_ID = '91a7b452-e421-4f93-b1d5-8d9e6f3b2c1a'

/**
 * TAXII 2.1 Serverless Collections Discovery & Objects Endpoint.
 * Allows external SIEMs, MISP, and OpenCTI instances to poll intelligence directly.
 *
 * SECURITY: every endpoint requires a Bearer user token (same JWT as the app).
 * Objects are scoped to the authenticated user's own investigations — there is
 * no cross-tenant leak. Supports `limit` and `added_after` query params for
 * incremental polling like OpenCTI's TAXII collections.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.pathname

  // TAXII Server Discovery / Server Status (public metadata only, no objects)
  if (path.endsWith('/taxii21') || path.endsWith('/taxii21/')) {
    return NextResponse.json({
      title: 'AnseIn Serverless CTI TAXII 2.1 Server',
      description: 'Zero-cost serverless threat intelligence sharing endpoint (auth required)',
      contact: 'admin@ansein.local',
      default: '/api/v1/taxii21/root',
      api_roots: ['/api/v1/taxii21/root'],
    }, {
      headers: { 'Content-Type': TAXII_CT },
    })
  }

  // Everything below requires authentication (cookie or Bearer user token)
  let userId: number
  try {
    const user = await requireUser(req)
    userId = user.id
  } catch {
    return NextResponse.json(
      { title: 'Unauthorized', description: 'Provide a Bearer user token or session cookie' },
      { status: 401, headers: { 'Content-Type': TAXII_CT } }
    )
  }

  // API Root information
  if (path.endsWith('/root') || path.endsWith('/root/')) {
    return NextResponse.json({
      title: 'Default API Root',
      description: 'AnseIn user-scoped intelligence feed',
      versions: ['application/taxii+json;version=2.1'],
      max_content_length: 10485760,
    }, {
      headers: { 'Content-Type': TAXII_CT },
    })
  }

  // Collections list
  if (path.endsWith('/collections') || path.endsWith('/collections/')) {
    return NextResponse.json({
      collections: [
        {
          id: COLLECTION_ID,
          title: 'AnseIn User Threat Intelligence',
          description: 'High-confidence indicators from your completed investigations',
          can_read: true,
          can_write: false,
          media_types: ['application/stix+json;version=2.1'],
        },
      ],
    }, {
      headers: { 'Content-Type': TAXII_CT },
    })
  }

  // Collection Objects (STIX 2.1 Bundle) — user-scoped, paginated, incremental
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '10')))
  const addedAfterRaw = url.searchParams.get('added_after')
  let addedAfter: Date | undefined
  if (addedAfterRaw) {
    const parsed = new Date(addedAfterRaw)
    if (!Number.isNaN(parsed.getTime())) addedAfter = parsed
  }

  const investigations = await db.investigation.findMany({
    where: {
      userId,
      severityScore: { gte: 50 },
      ...(addedAfter ? { updatedAt: { gt: addedAfter } } : {}),
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    include: {
      entities: true,
      relationships: true,
    },
  })

  const allObjects: unknown[] = []

  for (const inv of investigations) {
    const bundle = buildStixBundle(inv, inv.entities, inv.relationships)
    allObjects.push(...(bundle.objects as unknown[]))
  }

  return NextResponse.json({
    more: false,
    objects: allObjects,
  }, {
    headers: { 'Content-Type': TAXII_CT },
  })
}
