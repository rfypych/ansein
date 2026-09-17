/**
 * Free OSINT Enrichment Engine — 100% Free & No API Key Required.
 * Integrates:
 *   - abuse.ch ThreatFox (IOCs: IP, Domain, Hash, URL)
 *   - abuse.ch URLhaus (URLs, Payloads)
 *   - CISA Known Exploited Vulnerabilities (CVE lookup)
 *   - OSV.dev (Open Source Vulnerability database)
 *   - IP Geolocation & ASN via Free IP API
 *   - DNS over HTTPS (Cloudflare 1.1.1.1) for Domain resolution
 */

export interface FreeEnrichmentResult {
  nvd?: {
    found: boolean
    description?: string
    cvss_v3?: number
    cvss_v31?: number
    severity?: string
    cwe?: string
    published?: string
  }
  threatfox?: {
    found: boolean
    threat_type?: string
    malware_printable?: string
    confidence_level?: number
    first_seen?: string
    tags?: string[]
  }
  urlhaus?: {
    found: boolean
    url_status?: string
    threat?: string
    tags?: string[]
    host?: string
  }
  cisa_kev?: {
    is_known_exploited: boolean
    cve_id?: string
    vendor_project?: string
    product?: string
    vulnerability_name?: string
    date_added?: string
    required_action?: string
  }
  osv?: {
    found: boolean
    details?: string
    aliases?: string[]
    summary?: string
  }
  geo_ip?: {
    country?: string
    country_code?: string
    city?: string
    region?: string
    asn?: string
    isp?: string
  }
  dns?: {
    resolved_ips?: string[]
  }
}

/**
 * abuse.ch bulk-export matching.
 *
 * HARD TRUTH (verified 2026-09-17): abuse.ch URLhaus/ThreatFox *API* endpoints
 * now return 401 Unauthorized without an Auth-Key — the old keyless API calls
 * silently returned nothing. The bulk EXPORTS (URLhaus csv_online ~3.4MB,
 * ThreatFox csv/recent ~1.7MB) remain fully public and are updated within
 * minutes. So: match locally against the exports (free, keyless, fresh), and
 * use the live API only when the user supplies their free abuse.ch key.
 */
const DUMP_TTL_MS = 3600_000
const THREATFOX_CSV_URL = 'https://threatfox.abuse.ch/export/csv/recent/'
const URLHAUS_CSV_URL = 'https://urlhaus.abuse.ch/downloads/csv_online/'

interface ThreatfoxRow {
  value: string
  type: string
  threat: string
  malware: string
  confidence: string
  firstSeen: string
  tags: string[]
}

interface UrlhausRow {
  url: string
  host: string
  status: string
  threat: string
  tags: string[]
  date: string
}

interface DumpCache<T> {
  at: number
  rows: T[]
  byValue: Map<string, T>
}

/** Minimal quoted-CSV line parser (fields may contain commas inside quotes). Exported for the regression harness. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQ = true
    } else if (ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

async function fetchTextWithTimeout(url: string, timeoutMs = 25000): Promise<string | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

let tfCache: DumpCache<ThreatfoxRow> | null = null
let tfInflight: Promise<DumpCache<ThreatfoxRow> | null> | null = null
let uhCache: DumpCache<UrlhausRow> | null = null
let uhInflight: Promise<DumpCache<UrlhausRow> | null> | null = null

function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase()
  } catch {
    const m = rawUrl.toLowerCase().match(/^(?:https?:\/\/)?([^/:?#\s]+)/)
    return m ? m[1] : ''
  }
}

async function ensureThreatfoxDump(): Promise<DumpCache<ThreatfoxRow> | null> {
  if (tfCache && Date.now() - tfCache.at < DUMP_TTL_MS) return tfCache
  if (tfInflight) return tfInflight
  tfInflight = (async () => {
    try {
      const text = await fetchTextWithTimeout(THREATFOX_CSV_URL)
      if (!text) return null
      const rows: ThreatfoxRow[] = []
      const byValue = new Map<string, ThreatfoxRow>()
      for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue
        const c = parseCsvLine(line)
        // first_seen, ioc_id, ioc_value, ioc_type, threat_type, fk_malware,
        // malware_alias, malware_printable, last_seen, confidence, ..., tags, ...
        if (c.length < 10 || !c[2]) continue
        const row: ThreatfoxRow = {
          value: c[2],
          type: c[3] || '',
          threat: c[4] || '',
          malware: c[7] || '',
          confidence: c[9] || '',
          firstSeen: c[0] || '',
          tags: (c[12] || '').split(',').map((t) => t.trim()).filter(Boolean),
        }
        rows.push(row)
        const key = row.value.toLowerCase()
        if (!byValue.has(key)) byValue.set(key, row)
      }
      tfCache = { at: Date.now(), rows, byValue }
      return tfCache
    } catch {
      return null
    } finally {
      tfInflight = null
    }
  })()
  return tfInflight
}

async function ensureUrlhausDump(): Promise<DumpCache<UrlhausRow> | null> {
  if (uhCache && Date.now() - uhCache.at < DUMP_TTL_MS) return uhCache
  if (uhInflight) return uhInflight
  uhInflight = (async () => {
    try {
      const text = await fetchTextWithTimeout(URLHAUS_CSV_URL)
      if (!text) return null
      const rows: UrlhausRow[] = []
      const byValue = new Map<string, UrlhausRow>()
      for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue
        const c = parseCsvLine(line)
        // id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter
        if (c.length < 7 || !c[2]) continue
        const row: UrlhausRow = {
          url: c[2],
          host: hostOf(c[2]),
          status: c[3] || '',
          threat: c[5] || '',
          tags: (c[6] || '').split(',').map((t) => t.trim()).filter(Boolean),
          date: c[1] || '',
        }
        rows.push(row)
        if (!byValue.has(row.url.toLowerCase())) byValue.set(row.url.toLowerCase(), row)
        if (row.host && !byValue.has('host:' + row.host)) byValue.set('host:' + row.host, row)
      }
      uhCache = { at: Date.now(), rows, byValue }
      return uhCache
    } catch {
      return null
    } finally {
      uhInflight = null
    }
  })()
  return uhInflight
}

/** Recent ThreatFox rows (file order is newest-first) for feed collection. */
export async function getThreatfoxRecent(limit = 150): Promise<ThreatfoxRow[]> {
  const dump = await ensureThreatfoxDump()
  return (dump?.rows || []).slice(0, limit)
}

/** Recent URLhaus rows, newest first, for feed collection. */
export async function getUrlhausRecent(limit = 100): Promise<UrlhausRow[]> {
  const dump = await ensureUrlhausDump()
  if (!dump) return []
  return [...dump.rows]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit)
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 4000): Promise<any | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(url, { ...opts, signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------- ThreatFox (abuse.ch)
// Live API first (only with a free user key — anonymous calls 401 since
// 2024), then the public bulk-export dump (keyless, minutes fresh).
export async function queryThreatFox(
  queryTerm: string,
  apiKey?: string
): Promise<FreeEnrichmentResult['threatfox']> {
  if (apiKey) {
    const data = await fetchWithTimeout('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Auth-Key': apiKey },
      body: JSON.stringify({ query: 'search_ioc', search_term: queryTerm }),
    })
    if (data?.query_status === 'ok' && Array.isArray(data.data) && data.data.length > 0) {
      const hit = data.data[0]
      return {
        found: true,
        threat_type: hit.threat_type_desc || hit.threat_type,
        malware_printable: hit.malware_printable,
        confidence_level: hit.confidence_level,
        first_seen: hit.first_seen,
        tags: hit.tags || [],
      }
    }
  }

  const dump = await ensureThreatfoxDump()
  const hit = dump?.byValue.get(queryTerm.toLowerCase())
  if (hit) {
    return {
      found: true,
      threat_type: hit.threat,
      malware_printable: hit.malware || undefined,
      confidence_level: Number(hit.confidence) || undefined,
      first_seen: hit.firstSeen || undefined,
      tags: hit.tags,
    }
  }
  return { found: false }
}

// ---------------------------------------------------- URLhaus (abuse.ch)
// Same layered strategy: live API with user key, else public dump match.
export async function queryURLhaus(
  urlOrHost: string,
  isHost = false,
  apiKey?: string
): Promise<FreeEnrichmentResult['urlhaus']> {
  if (apiKey) {
    const endpoint = isHost
      ? `https://urlhaus-api.abuse.ch/api/v1/host/`
      : `https://urlhaus-api.abuse.ch/v1/url/`

    const body = new URLSearchParams()
    if (isHost) {
      body.append('host', urlOrHost)
    } else {
      body.append('url', urlOrHost)
    }

    const data = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Auth-Key': apiKey },
      body,
    })

    if (data?.query_status === 'ok') {
      return {
        found: true,
        url_status: data.url_status || data.host_status,
        threat: data.threat,
        tags: data.tags || [],
        host: data.host,
      }
    }
  }

  const dump = await ensureUrlhausDump()
  const key = isHost ? 'host:' + urlOrHost.toLowerCase() : urlOrHost.toLowerCase()
  let hit = dump?.byValue.get(key)
  if (!hit && !isHost) {
    hit = dump?.byValue.get('host:' + hostOf(urlOrHost))
  }
  if (hit) {
    return {
      found: true,
      url_status: hit.status,
      threat: hit.threat,
      tags: hit.tags,
      host: hit.host,
    }
  }
  return { found: false }
}

// ---------------------------------------------------- CISA KEV (Vulnerabilities)
let cisaKevCache: Map<string, any> | null = null
let cisaKevLastFetch = 0

async function getCisaCatalog(): Promise<Map<string, any>> {
  const now = Date.now()
  if (cisaKevCache && now - cisaKevLastFetch < 3600000) {
    return cisaKevCache
  }
  const data = await fetchWithTimeout(
    'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    {},
    10000
  )
  const map = new Map<string, any>()
  if (data?.vulnerabilities && Array.isArray(data.vulnerabilities)) {
    for (const v of data.vulnerabilities) {
      if (v.cveID) map.set(v.cveID.toUpperCase(), v)
    }
    cisaKevCache = map
    cisaKevLastFetch = now
  }
  return map
}

export async function queryCisaKev(cve: string): Promise<FreeEnrichmentResult['cisa_kev']> {
  try {
    const catalog = await getCisaCatalog()
    const hit = catalog.get(cve.toUpperCase())
    if (hit) {
      return {
        is_known_exploited: true,
        cve_id: hit.cveID,
        vendor_project: hit.vendorProject,
        product: hit.product,
        vulnerability_name: hit.vulnerabilityName,
        date_added: hit.dateAdded,
        required_action: hit.requiredAction,
      }
    }
  } catch {
    // fallback gracefully
  }
  return { is_known_exploited: false }
}

// ---------------------------------------------------- NVD 2.0 (free, no key, 5 req/30s anon)
export async function queryNVD(cve: string): Promise<FreeEnrichmentResult['nvd']> {
  const data = await fetchWithTimeout(
    `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${encodeURIComponent(cve.toUpperCase())}`,
    {},
    8000
  )
  const vuln = data?.vulnerabilities?.[0]?.cve
  if (!vuln) return { found: false }
  const m31 = vuln.metrics?.cvssMetricV31?.[0]
  const m30 = vuln.metrics?.cvssMetricV30?.[0]
  const best = m31 || m30
  const descs: Array<{ lang?: string; value?: string }> = vuln.descriptions || []
  const en = descs.find((d) => d.lang === 'en') || descs[0]
  const weaknesses: Array<{ description?: Array<{ value?: string }> }> = vuln.weaknesses || []
  const cwe = weaknesses[0]?.description?.[0]?.value
  return {
    found: true,
    description: en?.value?.slice(0, 500),
    cvss_v31: typeof m31?.cvssData?.baseScore === 'number' ? m31.cvssData.baseScore : undefined,
    cvss_v3: typeof m30?.cvssData?.baseScore === 'number' ? m30.cvssData.baseScore : undefined,
    severity: best?.baseSeverity,
    cwe,
    published: vuln.published,
  }
}

// ---------------------------------------------------- OSV.dev (Open Source Vulns)
export async function queryOSV(cve: string): Promise<FreeEnrichmentResult['osv']> {
  const data = await fetchWithTimeout(`https://api.osv.dev/v1/vulns/${encodeURIComponent(cve)}`)
  if (data && data.id) {
    return {
      found: true,
      details: data.details,
      aliases: data.aliases || [],
      summary: data.summary,
    }
  }
  return { found: false }
}

// ---------------------------------------------------- Free IP Geolocation & ASN
// Primary: freeipapi.com (60 req/min, no key). Fallback: ip-api.com free tier
// (45 req/min, no key) — both 100% free. Either may 429 under burst load;
// callers treat {} as "no data", never as failure.
export async function queryFreeGeoIP(ip: string): Promise<FreeEnrichmentResult['geo_ip']> {
  const primary = await fetchWithTimeout(`https://freeipapi.com/api/json/${encodeURIComponent(ip)}`)
  if (primary && primary.countryName) {
    return {
      country: primary.countryName,
      country_code: primary.countryCode,
      city: primary.cityName,
      region: primary.regionName,
      asn: primary.asn || '',
      isp: primary.asnOrganization || '',
    }
  }
  const fallback = await fetchWithTimeout(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,as,isp,org`
  )
  if (fallback && fallback.status === 'success' && fallback.country) {
    return {
      country: fallback.country,
      country_code: fallback.countryCode,
      city: fallback.city,
      region: fallback.regionName,
      asn: fallback.as || '',
      isp: fallback.isp || fallback.org || '',
    }
  }
  return {}
}

// ---------------------------------------------------- Cloudflare 1.1.1.1 DoH
export async function queryCloudflareDNS(domain: string): Promise<FreeEnrichmentResult['dns']> {
  const data = await fetchWithTimeout(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
    { headers: { Accept: 'application/dns-json' } }
  )
  if (data?.Answer && Array.isArray(data.Answer)) {
    const ips = data.Answer.filter((a: any) => a.type === 1).map((a: any) => a.data)
    return { resolved_ips: ips }
  }
  return {}
}

// ---------------------------------------------------- Universal Free Enricher
export async function enrichWithFreeSources(
  entityType: string,
  value: string,
  opts: { abusech_api_key?: string } = {}
): Promise<FreeEnrichmentResult> {
  const out: FreeEnrichmentResult = {}
  const abKey = opts.abusech_api_key || undefined

  if (entityType === 'ioc_ip') {
    const [tf, geo] = await Promise.all([
      queryThreatFox(value, abKey),
      queryFreeGeoIP(value),
    ])
    if (tf?.found) out.threatfox = tf
    if (geo?.country) out.geo_ip = geo
  } else if (entityType === 'ioc_domain') {
    const [tf, uh, dns] = await Promise.all([
      queryThreatFox(value, abKey),
      queryURLhaus(value, true, abKey),
      queryCloudflareDNS(value),
    ])
    if (tf?.found) out.threatfox = tf
    if (uh?.found) out.urlhaus = uh
    if (dns?.resolved_ips?.length) out.dns = dns
  } else if (entityType === 'ioc_url') {
    const [tf, uh] = await Promise.all([
      queryThreatFox(value, abKey),
      queryURLhaus(value, false, abKey),
    ])
    if (tf?.found) out.threatfox = tf
    if (uh?.found) out.urlhaus = uh
  } else if (entityType === 'ioc_hash') {
    const tf = await queryThreatFox(value, abKey)
    if (tf?.found) out.threatfox = tf
  } else if (entityType === 'vulnerability') {
    const [kev, osv, nvd] = await Promise.all([
      queryCisaKev(value),
      queryOSV(value),
      queryNVD(value),
    ])
    if (kev?.is_known_exploited) out.cisa_kev = kev
    if (osv?.found) out.osv = osv
    if (nvd?.found) out.nvd = nvd
  }

  return out
}
