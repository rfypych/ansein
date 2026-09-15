/**
 * Enrichment engine — calls VirusTotal, AbuseIPDB, Shodan.
 * Ported from backend/app/engines/enrichment.py
 * All providers fail gracefully (return {} on error).
 */
import type { EntityType } from '@/lib/engines/extraction'
import { enrichWithFreeSources } from '@/lib/engines/free-enrichment'

export interface EnrichmentData {
  [provider: string]: Record<string, unknown>
}

export interface UserEnrichKeys {
  virustotal_api_key?: string
  abuseipdb_api_key?: string
  shodan_api_key?: string
}

const VT_BASE = 'https://www.virustotal.com/api/v3'
const ABUSE_BASE = 'https://api.abuseipdb.com/api/v2'
const SHODAN_BASE = 'https://api.shodan.io'

function envKey(name: string): string {
  return process.env[name] || ''
}

async function safeFetch(url: string, opts: RequestInit = {}, timeoutMs = 8000): Promise<any | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const resp = await fetch(url, { ...opts, signal: ctrl.signal })
    clearTimeout(t)
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

// ---------------------------------------------------- VirusTotal
async function vtIp(ip: string, key: string): Promise<Record<string, unknown>> {
  const data = await safeFetch(`${VT_BASE}/ip_addresses/${ip}`, {
    headers: { 'x-apikey': key },
  })
  if (!data?.data?.attributes) return {}
  const a = data.data.attributes
  return {
    reputation: a.reputation ?? 0,
    malicious: a.last_analysis_stats?.malicious ?? 0,
    suspicious: a.last_analysis_stats?.suspicious ?? 0,
    harmless: a.last_analysis_stats?.harmless ?? 0,
    country: a.country ?? '',
    as_owner: a.as_owner ?? '',
  }
}

async function vtDomain(domain: string, key: string): Promise<Record<string, unknown>> {
  const data = await safeFetch(`${VT_BASE}/domains/${domain}`, {
    headers: { 'x-apikey': key },
  })
  if (!data?.data?.attributes) return {}
  const a = data.data.attributes
  return {
    reputation: a.reputation ?? 0,
    malicious: a.last_analysis_stats?.malicious ?? 0,
    suspicious: a.last_analysis_stats?.suspicious ?? 0,
    harmless: a.last_analysis_stats?.harmless ?? 0,
    registrar: a.registrar ?? '',
    creation_date: a.creation_date ?? '',
    categories: Object.values(a.categories || {}).slice(0, 5),
  }
}

async function vtFile(hash: string, key: string): Promise<Record<string, unknown>> {
  const data = await safeFetch(`${VT_BASE}/files/${hash}`, {
    headers: { 'x-apikey': key },
  })
  if (!data?.data?.attributes) return {}
  const a = data.data.attributes
  return {
    malicious: a.last_analysis_stats?.malicious ?? 0,
    suspicious: a.last_analysis_stats?.suspicious ?? 0,
    harmless: a.last_analysis_stats?.harmless ?? 0,
    type_description: a.type_description ?? '',
    popular_threat_name: a.popular_threat_classification?.popular_threat_name?.[0]?.value ?? '',
    names: (a.names || []).slice(0, 10),
  }
}

async function vtUrl(url: string, key: string): Promise<Record<string, unknown>> {
  // VT URL endpoint expects URL-safe base64 of the URL (not hashed)
  const b64 = Buffer.from(url).toString('base64url').replace(/=+$/, '')
  const data = await safeFetch(`${VT_BASE}/urls/${b64}`, {
    headers: { 'x-apikey': key },
  })
  if (!data?.data?.attributes) return {}
  const a = data.data.attributes
  return {
    malicious: a.last_analysis_stats?.malicious ?? 0,
    suspicious: a.last_analysis_stats?.suspicious ?? 0,
    harmless: a.last_analysis_stats?.harmless ?? 0,
    title: a.title ?? '',
    final_url: a.final_url ?? '',
  }
}

// ---------------------------------------------------- AbuseIPDB
async function abuseIp(ip: string, key: string): Promise<Record<string, unknown>> {
  const data = await safeFetch(
    `${ABUSE_BASE}/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90&verbose`,
    { headers: { Key: key, Accept: 'application/json' } }
  )
  if (!data?.data) return {}
  const d = data.data
  return {
    abuse_score: d.abuseConfidenceScore ?? 0,
    country: d.countryCode ?? '',
    usage_type: d.usageType ?? '',
    isp: d.isp ?? '',
    total_reports: d.totalReports ?? 0,
  }
}

// ---------------------------------------------------- Shodan
async function shodanIp(ip: string, key: string): Promise<Record<string, unknown>> {
  const data = await safeFetch(`${SHODAN_BASE}/shodan/host/${ip}?key=${encodeURIComponent(key)}`)
  if (!data || data.error) return {}
  return {
    ports: data.ports || [],
    org: data.org || '',
    os: data.os || '',
    hostnames: (data.hostnames || []).slice(0, 5),
    vulns: (data.vulns || []).slice(0, 10),
  }
}

// ---------------------------------------------------- Admiralty code
/**
 * Compute the admiralty code (e.g. "A1", "C2", "F6") from enrichment sources.
 * Returns [code, adjusted_confidence].
 */
export function computeAdmiralty(
  enrichment: EnrichmentData,
  baseConfidence: number
): [string, number] {
  const sources = Object.keys(enrichment).filter(
    (k) => k !== 'mock' && enrichment[k] && Object.keys(enrichment[k] || {}).length > 0
  )
  if (sources.length === 0) {
    return ['F6', Math.max(0.1, baseConfidence * 0.6)]
  }
  let reliability = sources.length === 1 ? 'D' : 'B'
  let maliciousCount = 0
  for (const s of sources) {
    const d = enrichment[s]
    if (typeof d?.malicious === 'number' && d.malicious > 0) maliciousCount++
    if (typeof d?.abuse_score === 'number' && d.abuse_score >= 75) maliciousCount++
    if (s === 'threatfox' && d?.found) maliciousCount++
    if (s === 'urlhaus' && d?.found) maliciousCount++
    if (s === 'cisa_kev' && d?.is_known_exploited) maliciousCount++
  }
  if (maliciousCount >= 1 && reliability === 'D') reliability = 'C'
  if (maliciousCount >= 2 && reliability === 'B') reliability = 'A'
  const credibility = maliciousCount >= 1 ? '2' : '6'
  const multiplier = sources.length >= 2 ? 1.0 : 0.85
  return [`${reliability}${credibility}`, Math.min(1, Math.max(0.1, baseConfidence * multiplier))]
}

// ---------------------------------------------------- main entry
export async function enrichEntity(
  entityType: EntityType,
  value: string,
  keys: UserEnrichKeys
): Promise<EnrichmentData> {
  const vt = keys.virustotal_api_key || envKey('VIRUSTOTAL_API_KEY')
  const abuse = keys.abuseipdb_api_key || envKey('ABUSEIPDB_API_KEY')
  const shodan = keys.shodan_api_key || envKey('SHODAN_API_KEY')

  // Run 100% Free OSINT checks (ThreatFox, URLhaus, CISA KEV, FreeGeoIP, Cloudflare DoH)
  const freeData = await enrichWithFreeSources(entityType, value)
  const out: EnrichmentData = { ...freeData }

  if (entityType === 'ioc_ip') {
    if (vt) out.virustotal = await vtIp(value, vt)
    if (abuse) out.abuseipdb = await abuseIp(value, abuse)
    if (shodan) out.shodan = await shodanIp(value, shodan)
  } else if (entityType === 'ioc_domain') {
    if (vt) out.virustotal = await vtDomain(value, vt)
  } else if (entityType === 'ioc_hash') {
    if (vt) out.virustotal = await vtFile(value, vt)
  } else if (entityType === 'ioc_url') {
    if (vt) out.virustotal = await vtUrl(value, vt)
  } else if (entityType === 'ioc_wallet') {
    // No standard free enrichment for crypto wallets
  }
  return out
}
