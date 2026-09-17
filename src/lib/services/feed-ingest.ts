/**
 * Threat-feed collector — CISA KEV + URLhaus + ThreatFox, all free & keyless.
 *
 * Runs lazily via after() in the feeds route (serve DB instantly, refresh in
 * background when stale) instead of Vercel Cron, so there is no secret to
 * manage and no scheduler to operate. Worst case the UI shows the last good
 * snapshot with its age — never an empty page because CISA had a bad minute.
 */
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export interface CollectedFeedItem {
  source: string
  itemType: string
  indicator: string
  title: string
  description: string
  detail: Record<string, unknown>
  confidence: number
  seenAt: Date
}

async function getJson(url: string, init?: RequestInit, timeoutMs = 12000): Promise<any | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function collectCisaKev(out: CollectedFeedItem[]): Promise<void> {
  const data = await getJson(
    'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
  )
  const vulns = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : []
  for (const v of vulns) {
    if (!v?.cveID) continue
    out.push({
      source: 'CISA KEV',
      itemType: 'vulnerability',
      indicator: String(v.cveID),
      title: String(v.cveID),
      description: `${v.vendorProject || ''} ${v.product || ''} - ${v.vulnerabilityName || ''}`.trim(),
      detail: {
        vendorProject: v.vendorProject,
        product: v.product,
        vulnerabilityName: v.vulnerabilityName,
        dateAdded: v.dateAdded,
        requiredAction: v.requiredAction,
      },
      confidence: 1.0,
      seenAt: v.dateAdded ? new Date(v.dateAdded) : new Date(),
    })
  }
}

async function collectUrlhaus(out: CollectedFeedItem[]): Promise<void> {
  // The /v1/urls/recent API now 401s without a key — use the public
  // csv_online dump (updated every few minutes) instead.
  const { getUrlhausRecent } = await import('@/lib/engines/free-enrichment')
  const rows = await getUrlhausRecent(100)
  for (const u of rows) {
    out.push({
      source: 'URLhaus',
      itemType: 'ioc_url',
      indicator: u.url,
      title: u.url.slice(0, 120),
      description: `Malware URL (${u.threat || 'malware_download'}) - Status: ${u.status || 'unknown'}`,
      detail: { threat: u.threat, url_status: u.status, host: u.host, date_added: u.date },
      confidence: 0.9,
      seenAt: u.date ? new Date(u.date) : new Date(),
    })
  }
}

async function collectThreatfox(out: CollectedFeedItem[]): Promise<void> {
  // Same story: get_iocs API 401s anonymously — public csv/recent dump.
  const { getThreatfoxRecent } = await import('@/lib/engines/free-enrichment')
  const rows = await getThreatfoxRecent(150)
  for (const ioc of rows) {
    const t = (ioc.type || '').toLowerCase()
    const itemType = t.includes('ip')
      ? 'ioc_ip'
      : t.includes('domain')
        ? 'ioc_domain'
        : t.includes('url')
          ? 'ioc_url'
          : t.includes('hash')
            ? 'ioc_hash'
            : 'ioc_domain'
    const value = itemType === 'ioc_ip' ? ioc.value.split(':')[0] : ioc.value
    out.push({
      source: 'ThreatFox',
      itemType,
      indicator: value,
      title: value.slice(0, 120),
      description: `${ioc.threat || 'malware'}${ioc.malware ? ` (${ioc.malware})` : ''}`,
      detail: { threat_type: ioc.threat, malware: ioc.malware, confidence_level: ioc.confidence, first_seen: ioc.firstSeen, tags: ioc.tags },
      confidence: 0.85,
      seenAt: ioc.firstSeen ? new Date(ioc.firstSeen) : new Date(),
    })
  }
}

/**
 * Fetch all three feeds and upsert into feed_items. Never throws — a dead
 * upstream must not break the request that triggered the refresh.
 * Returns per-source counts for observability.
 */
export async function refreshFeedCache(): Promise<Record<string, number>> {
  const items: CollectedFeedItem[] = []
  const counts: Record<string, number> = { 'CISA KEV': 0, URLhaus: 0, ThreatFox: 0 }
  await Promise.all([
    collectCisaKev(items).catch(() => {}),
    collectUrlhaus(items).catch(() => {}),
    collectThreatfox(items).catch(() => {}),
  ])
  for (const item of items) {
    try {
      await db.feedItem.upsert({
        where: { source_indicator: { source: item.source, indicator: item.indicator } },
        update: {
          title: item.title,
          description: item.description,
          detail: item.detail as Prisma.InputJsonValue,
          confidence: item.confidence,
          lastSeen: new Date(),
        },
        create: {
          source: item.source,
          itemType: item.itemType,
          indicator: item.indicator,
          title: item.title,
          description: item.description,
          detail: item.detail as Prisma.InputJsonValue,
          confidence: item.confidence,
          firstSeen: Number.isNaN(item.seenAt.getTime()) ? new Date() : item.seenAt,
        },
      })
      counts[item.source] = (counts[item.source] || 0) + 1
    } catch {
      // One bad row (oversize indicator, invalid date) skips silently
    }
  }
  return counts
}

/** Staleness gate: refresh when the newest cached row is older than this. */
export const FEED_STALE_MS = 6 * 3600_000
