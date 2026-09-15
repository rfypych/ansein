import { NextRequest } from 'next/server'
import { ok, jsonError, withErrorHandler, requireUser } from '@/lib/api'

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

async function fetchCisaKev(): Promise<FeedItem[]> {
  try {
    const res = await fetch(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const vulns = (data?.vulnerabilities || []).slice(0, 30)
    return vulns.map((v: any) => ({
      id: v.cveID,
      source: 'CISA KEV',
      type: 'vulnerability',
      indicator: v.cveID,
      description: `${v.vendorProject} ${v.product} - ${v.vulnerabilityName}`,
      date: v.dateAdded,
      confidence: 1.0,
    }))
  } catch {
    return []
  }
}

async function fetchUrlhaus(): Promise<FeedItem[]> {
  try {
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/limit/30/', {
      next: { revalidate: 1800 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const urls = (data?.urls || []).slice(0, 30)
    return urls.map((u: any) => ({
      id: String(u.id),
      source: 'URLhaus',
      type: 'ioc_url',
      indicator: u.url,
      description: `Malware URL (${u.threat || 'malware_download'}) - Status: ${u.url_status}`,
      date: u.date_added,
      confidence: 0.9,
    }))
  } catch {
    return []
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireUser(req)
  const url = new URL(req.url)
  const feedSource = url.searchParams.get('source') // 'cisa' | 'urlhaus' | 'all'

  let items: FeedItem[] = []

  if (feedSource === 'cisa') {
    items = await fetchCisaKev()
  } else if (feedSource === 'urlhaus') {
    items = await fetchUrlhaus()
  } else {
    const [cisa, urlhaus] = await Promise.all([fetchCisaKev(), fetchUrlhaus()])
    items = [...cisa, ...urlhaus].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }

  return ok({
    total: items.length,
    items,
  })
})
