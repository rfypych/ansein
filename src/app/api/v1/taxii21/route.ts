import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildStixBundle } from '@/lib/services/export'

export const dynamic = 'force-dynamic'

/**
 * TAXII 2.1 Serverless Collections Discovery & Objects Endpoint.
 * Allows external SIEMs, MISP, and OpenCTI instances to poll intelligence directly.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const path = url.pathname

  // TAXII Server Discovery / Server Status
  if (path.endsWith('/taxii21') || path.endsWith('/taxii21/')) {
    return NextResponse.json({
      title: 'AnseIn Serverless CTI TAXII 2.1 Server',
      description: 'Zero-cost serverless threat intelligence sharing endpoint',
      contact: 'admin@ansein.local',
      default: '/api/v1/taxii21/root',
      api_roots: ['/api/v1/taxii21/root'],
    }, {
      headers: { 'Content-Type': 'application/taxii+json;version=2.1' },
    })
  }

  // API Root information
  if (path.endsWith('/root') || path.endsWith('/root/')) {
    return NextResponse.json({
      title: 'Default API Root',
      description: 'AnseIn Public Intelligence Feed',
      versions: ['application/taxii+json;version=2.1'],
      max_content_length: 10485760,
    }, {
      headers: { 'Content-Type': 'application/taxii+json;version=2.1' },
    })
  }

  // Collections list
  if (path.endsWith('/collections') || path.endsWith('/collections/')) {
    return NextResponse.json({
      collections: [
        {
          id: '91a7b452-e421-4f93-b1d5-8d9e6f3b2c1a',
          title: 'AnseIn Public Threat Intelligence',
          description: 'High-confidence indicators and threat actor correlations',
          can_read: true,
          can_write: false,
          media_types: ['application/stix+json;version=2.1'],
        },
      ],
    }, {
      headers: { 'Content-Type': 'application/taxii+json;version=2.1' },
    })
  }

  // Collection Objects (STIX 2.1 Bundle)
  const investigations = await db.investigation.findMany({
    where: { severityScore: { gte: 50 } },
    take: 10,
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
    headers: { 'Content-Type': 'application/taxii+json;version=2.1' },
  })
}
