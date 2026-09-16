import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildStixBundle } from '@/lib/services/export'
import { requireUser } from '@/lib/api'

export const dynamic = 'force-dynamic'

const TAXII_CT = 'application/taxii+json;version=2.1'
const COLLECTION_ID = '91a7b452-e421-4f93-b1d5-8d9e6f3b2c1a'

/**
 * TAXII 2.1 Serverless Collections Discovery & Objects Endpoint
 * (optional catch-all: serves /taxii21, /taxii21/root,
 * /taxii21/collections and /taxii21/collections/:id/objects).
 * Allows external SIEMs, MISP, and OpenCTI instances to poll intelligence directly.
 *
 * SECURITY: every endpoint except server discovery requires a Bearer user
 * token (same JWT as the app) or session cookie. Objects are scoped to the
 * authenticated user's own investigations — no cross-tenant leak. Supports
 * `limit` and `added_after` query params for incremental polling like
 * OpenCTI's TAXII collections.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug?: string[] }> }
) {
  const { slug = [] } = await ctx.params
  const seg = (i: number) => (slug[i] || '').toLowerCase()

  // TAXII Server Discovery (public metadata only, no objects)
  if (slug.length === 0) {
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

  // API Root information: /taxii21/root
  if (seg(0) === 'root' && slug.length === 1) {
    return NextResponse.json({
      title: 'Default API Root',
      description: 'AnseIn user-scoped intelligence feed',
      versions: ['application/taxii+json;version=2.1'],
      max_content_length: 10485760,
    }, {
      headers: { 'Content-Type': TAXII_CT },
    })
  }

  // Collections list: /taxii21/collections
  if (seg(0) === 'collections' && slug.length === 1) {
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

  // Collection Objects: /taxii21/collections/:id/objects (+ /objects alias)
  // User-scoped, paginated, incremental. Cursor pagination: pass the `next`
  // value from the previous response as `cursor` (opaque base64url of the
  // last investigation's updatedAt+id), like OpenCTI's TAXII collections.
  const inCollectionsPath = seg(0) === 'collections'
  if (inCollectionsPath && seg(1) !== COLLECTION_ID.toLowerCase() && seg(1) !== COLLECTION_ID) {
    return NextResponse.json(
      { title: 'Not found', description: 'Unknown TAXII collection' },
      { status: 404, headers: { 'Content-Type': TAXII_CT } }
    )
  }
  const isObjects =
    (inCollectionsPath && seg(2) === 'objects') ||
    seg(0) === 'objects'
  if (!isObjects) {
    return NextResponse.json(
      { title: 'Not found', description: 'Unknown TAXII endpoint' },
      { status: 404, headers: { 'Content-Type': TAXII_CT } }
    )
  }

  const url = new URL(req.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '10')))
  const addedAfterRaw = url.searchParams.get('added_after')
  let addedAfter: Date | undefined
  if (addedAfterRaw) {
    const parsed = new Date(addedAfterRaw)
    if (!Number.isNaN(parsed.getTime())) addedAfter = parsed
  }
  // Decode opaque cursor -> keyset position (updatedAt desc, id desc)
  let cursorTime: Date | undefined
  let cursorId = Number.MAX_SAFE_INTEGER
  const cursorRaw = url.searchParams.get('cursor')
  if (cursorRaw) {
    try {
      const decoded = JSON.parse(Buffer.from(cursorRaw, 'base64url').toString('utf8')) as {
        t?: string
        i?: number
      }
      const t = decoded.t ? new Date(decoded.t) : null
      if (t && !Number.isNaN(t.getTime())) {
        cursorTime = t
        if (Number.isFinite(decoded.i)) cursorId = Number(decoded.i)
      }
    } catch {
      // Malformed cursor — ignore and start from the beginning
    }
  }

  const investigations = await db.investigation.findMany({
    where: {
      userId,
      severityScore: { gte: 50 },
      ...(addedAfter ? { updatedAt: { gt: addedAfter } } : {}),
      ...(cursorTime
        ? {
            OR: [
              { updatedAt: { lt: cursorTime } },
              { updatedAt: cursorTime, id: { lt: cursorId } },
            ],
          }
        : {}),
    },
    take: limit + 1, // +1 probes whether a next page exists
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    include: {
      entities: true,
      relationships: true,
    },
  })

  const page = investigations.slice(0, limit)
  const allObjects: unknown[] = []

  for (const inv of page) {
    const bundle = buildStixBundle(inv, inv.entities, inv.relationships)
    allObjects.push(...(bundle.objects as unknown[]))
  }

  const hasMore = investigations.length > limit
  const last = page[page.length - 1]
  const next =
    hasMore && last
      ? `/api/v1/taxii21/collections/${COLLECTION_ID}/objects?limit=${limit}` +
        (addedAfterRaw ? `&added_after=${encodeURIComponent(addedAfterRaw)}` : '') +
        `&cursor=${Buffer.from(JSON.stringify({ t: last.updatedAt.toISOString(), i: last.id })).toString('base64url')}`
      : undefined

  return NextResponse.json({
    more: hasMore,
    ...(next ? { next } : {}),
    objects: allObjects,
  }, {
    headers: { 'Content-Type': TAXII_CT },
  })
}
