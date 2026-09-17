import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { db } from '@/lib/db'
import { ok, withErrorHandler, requireUser } from '@/lib/api'
import { refreshFeedCache, FEED_STALE_MS } from '@/lib/services/feed-ingest'

export const dynamic = 'force-dynamic'

interface FeedItem {
  id: string
  source: 'CISA KEV' | 'URLhaus' | 'ThreatFox'
  type: string
  indicator: string
  description: string
  date: string
  confidence: number
}

function toApi(r: {
  id: number
  source: string
  itemType: string
  indicator: string
  description: string
  confidence: number
  firstSeen: Date
}): FeedItem {
  return {
    id: String(r.id),
    source: (r.source === 'ThreatFox' ? 'ThreatFox' : r.source === 'URLhaus' ? 'URLhaus' : 'CISA KEV') as FeedItem['source'],
    type: r.itemType,
    indicator: r.indicator,
    description: r.description,
    date: r.firstSeen.toISOString().slice(0, 10),
    confidence: r.confidence,
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireUser(req)
  const url = new URL(req.url)
  const feedSource = url.searchParams.get('source') // 'cisa' | 'urlhaus' | 'threatfox' | 'all'
  const where =
    feedSource === 'cisa'
      ? { source: 'CISA KEV' }
      : feedSource === 'urlhaus'
        ? { source: 'URLhaus' }
        : feedSource === 'threatfox'
          ? { source: 'ThreatFox' }
          : {}

  let rows = await db.feedItem.findMany({
    where,
    orderBy: { lastSeen: 'desc' },
    take: 100,
  })

  // Cold cache (fresh deploy): collect inline once so the page is never empty.
  if (rows.length === 0) {
    await refreshFeedCache().catch(() => {})
    rows = await db.feedItem.findMany({ where, orderBy: { lastSeen: 'desc' }, take: 100 })
  } else {
    // Stale cache: serve instantly, refresh in background after responding.
    const newest = rows.reduce((m, r) => Math.max(m, r.lastSeen.getTime()), 0)
    if (Date.now() - newest > FEED_STALE_MS) {
      after(() => refreshFeedCache().catch(() => {}))
    }
  }

  return ok({
    total: rows.length,
    items: rows.map(toApi),
  })
})
