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
export async function queryThreatFox(queryTerm: string): Promise<FreeEnrichmentResult['threatfox']> {
  const data = await fetchWithTimeout('https://threatfox-api.abuse.ch/api/v1/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  return { found: false }
}

// ---------------------------------------------------- URLhaus (abuse.ch)
export async function queryURLhaus(urlOrHost: string, isHost = false): Promise<FreeEnrichmentResult['urlhaus']> {
  const endpoint = isHost
    ? `https://urlhaus-api.abuse.ch/v1/host/`
    : `https://urlhaus-api.abuse.ch/v1/url/`

  const body = new URLSearchParams()
  if (isHost) {
    body.append('host', urlOrHost)
  } else {
    body.append('url', urlOrHost)
  }

  const data = await fetchWithTimeout(endpoint, {
    method: 'POST',
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
  value: string
): Promise<FreeEnrichmentResult> {
  const out: FreeEnrichmentResult = {}

  if (entityType === 'ioc_ip') {
    const [tf, geo] = await Promise.all([
      queryThreatFox(value),
      queryFreeGeoIP(value),
    ])
    if (tf?.found) out.threatfox = tf
    if (geo?.country) out.geo_ip = geo
  } else if (entityType === 'ioc_domain') {
    const [tf, uh, dns] = await Promise.all([
      queryThreatFox(value),
      queryURLhaus(value, true),
      queryCloudflareDNS(value),
    ])
    if (tf?.found) out.threatfox = tf
    if (uh?.found) out.urlhaus = uh
    if (dns?.resolved_ips?.length) out.dns = dns
  } else if (entityType === 'ioc_url') {
    const [tf, uh] = await Promise.all([
      queryThreatFox(value),
      queryURLhaus(value, false),
    ])
    if (tf?.found) out.threatfox = tf
    if (uh?.found) out.urlhaus = uh
  } else if (entityType === 'ioc_hash') {
    const tf = await queryThreatFox(value)
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
