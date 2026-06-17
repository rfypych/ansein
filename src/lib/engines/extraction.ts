/**
 * Extraction engine — hybrid Regex → LLM pipeline.
 * Ported from backend/app/engines/extraction.py
 */
import { createHash } from 'node:crypto'

export type EntityType =
  | 'threat_actor'
  | 'malware'
  | 'tool'
  | 'technique'
  | 'vulnerability'
  | 'ioc_ip'
  | 'ioc_domain'
  | 'ioc_url'
  | 'ioc_hash'
  | 'ioc_wallet'
  | 'target'
  | 'location'
  | 'identity'

export interface ExtractedEntity {
  entity_type: EntityType
  value: string
  normalized: string
  confidence: number
  source_method: 'regex' | 'llm'
}

export interface ExtractedRelationship {
  source: string // normalized lower
  target: string // normalized lower
  relation_type: string
  weight: number
  evidence: string
}

export interface UserKeys {
  openai_api_key?: string
  groq_api_key?: string
  preferred_llm?: string
}

// ---------------------------------------------------------------- regexes
const RE = {
  IPV4: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  IPV6: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g,
  DOMAIN: /\b(?!\.)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b/gi,
  URL: /\bhttps?:\/\/[^\s<>"')]+/gi,
  EMAIL: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}\b/gi,
  MD5: /\b[a-fA-F0-9]{32}\b/g,
  SHA1: /\b[a-fA-F0-9]{40}\b/g,
  SHA256: /\b[a-fA-F0-9]{64}\b/g,
  SHA512: /\b[a-fA-F0-9]{128}\b/g,
  CVE: /\bCVE-\d{4}-\d{4,7}\b/gi,
  BTC_LEGACY: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
  BTC_BECH32: /\bbc1[ac-hj-np-z02-9]{6,87}\b/gi,
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|css|js|svg|webp|ico|woff2?|ttf)$/i

function isValidIpv4(v: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v)) return false
  const parts = v.split('.').map(Number)
  if (parts.length !== 4) return false
  return parts.every((p) => p >= 0 && p <= 255)
}

export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalizeValue(type: EntityType, value: string): string {
  if (type.startsWith('ioc_')) return value.toLowerCase()
  if (type === 'vulnerability') return value.toUpperCase()
  return value.trim()
}

interface RegexHit {
  entity_type: EntityType
  value: string
  confidence: number
}

export function regexExtract(text: string): RegexHit[] {
  const hits: RegexHit[] = []
  const seen = new Set<string>()

  const addUnique = (type: EntityType, value: string, confidence: number) => {
    const normalized = normalizeValue(type, value)
    const key = `${type}|${normalized}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ entity_type: type, value, confidence })
  }

  // IPv4 (validated)
  for (const m of text.matchAll(RE.IPV4)) {
    if (isValidIpv4(m[0])) addUnique('ioc_ip', m[0], 0.95)
  }
  // IPv6 — only those containing ':' and not pure hex (avoid hash collision)
  for (const m of text.matchAll(RE.IPV6)) {
    if (m[0].includes(':') && !/^[0-9a-fA-F]+$/.test(m[0])) {
      addUnique('ioc_ip', m[0], 0.85)
    }
  }
  // URLs
  for (const m of text.matchAll(RE.URL)) {
    addUnique('ioc_url', m[0], 0.95)
  }
  // Emails
  for (const m of text.matchAll(RE.EMAIL)) {
    addUnique('identity', m[0], 0.85)
  }
  // Hashes — longest first
  for (const m of text.matchAll(RE.SHA512)) addUnique('ioc_hash', m[0], 0.98)
  for (const m of text.matchAll(RE.SHA256)) addUnique('ioc_hash', m[0], 0.98)
  for (const m of text.matchAll(RE.SHA1)) addUnique('ioc_hash', m[0], 0.95)
  for (const m of text.matchAll(RE.MD5)) addUnique('ioc_hash', m[0], 0.95)
  // CVE
  for (const m of text.matchAll(RE.CVE)) {
    addUnique('vulnerability', m[0].toUpperCase(), 0.95)
  }
  // BTC wallets
  for (const m of text.matchAll(RE.BTC_BECH32)) addUnique('ioc_wallet', m[0], 0.85)
  for (const m of text.matchAll(RE.BTC_LEGACY)) addUnique('ioc_wallet', m[0], 0.7)
  // Domains (filter image/css extensions)
  for (const m of text.matchAll(RE.DOMAIN)) {
    const v = m[0].toLowerCase()
    if (IMAGE_EXT.test(v)) continue
    addUnique('ioc_domain', v, 0.85)
  }

  return hits
}

// ---------------------------------------------------------------- LLM pass
const LLM_EXTRACTION_PROMPT = `You are a cyber threat intelligence extractor. From the text below, extract a JSON array of objects.
Each object MUST have keys: entity_type, value, confidence.
entity_type must be one of: threat_actor, malware, tool, target, technique, vulnerability, ioc_ip, ioc_domain, ioc_url, ioc_hash, location, identity.
Only include entities explicitly mentioned. Return [] if none.

TEXT:
`
const LLM_SYSTEM = 'You output strict JSON, no prose.'

async function llmExtract(
  text: string,
  userKeys: UserKeys
): Promise<RegexHit[]> {
  if (text.length < 80) return []
  const truncated = text.slice(0, 8000)
  let content: string | null = null
  try {
    const { chatCompletion } = await import('@/lib/llm')
    const resp = await chatCompletion({
      messages: [
        { role: 'system', content: LLM_SYSTEM },
        { role: 'user', content: LLM_EXTRACTION_PROMPT + '\n```\n' + truncated + '\n```\n' },
      ],
      temperature: 0,
      maxTokens: 2048,
      userKeys,
    })
    content = resp.content
  } catch (e) {
    console.warn('[extraction] LLM failed:', e)
    return []
  }
  if (!content) return []
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  try {
    const arr = JSON.parse(cleaned) as Array<{
      entity_type: string
      value: string
      confidence?: number
    }>
    if (!Array.isArray(arr)) return []
    const allowed = new Set<EntityType>([
      'threat_actor', 'malware', 'tool', 'target', 'technique', 'vulnerability',
      'ioc_ip', 'ioc_domain', 'ioc_url', 'ioc_hash', 'location', 'identity',
    ])
    const out: RegexHit[] = []
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const t = item.entity_type as EntityType
      if (!allowed.has(t)) continue
      const v = String(item.value || '').trim()
      if (!v) continue
      const c = Math.min(1, Math.max(0, Number(item.confidence ?? 0.5) || 0.5))
      out.push({ entity_type: t, value: v, confidence: c })
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------- public API
export async function extractEntities(
  text: string,
  userKeys: UserKeys = {}
): Promise<{ entities: ExtractedEntity[]; usedLlm: boolean }> {
  const regexHits = regexExtract(text)
  const llmHits = await llmExtract(text, userKeys)

  // Merge with dedup by (type, normalized.lower()) keeping highest confidence
  const byKey = new Map<string, ExtractedEntity>()
  for (const h of regexHits) {
    const normalized = normalizeValue(h.entity_type, h.value)
    const key = `${h.entity_type}|${normalized.toLowerCase()}`
    byKey.set(key, {
      entity_type: h.entity_type,
      value: h.value,
      normalized,
      confidence: h.confidence,
      source_method: 'regex',
    })
  }
  for (const h of llmHits) {
    const normalized = normalizeValue(h.entity_type, h.value)
    const key = `${h.entity_type}|${normalized.toLowerCase()}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        entity_type: h.entity_type,
        value: h.value,
        normalized,
        confidence: h.confidence,
        source_method: 'llm',
      })
    } else if (h.confidence > existing.confidence) {
      existing.confidence = h.confidence
      existing.source_method = 'llm'
    }
  }
  return {
    entities: Array.from(byKey.values()),
    usedLlm: llmHits.length > 0 || regexHits.length === 0,
  }
}

/**
 * Heuristic relationship inference.
 * Splits text into paragraphs; finds entities co-occurring in same paragraph;
 * infers relationship types per the original rules.
 */
export function inferRelationships(
  entities: ExtractedEntity[],
  text: string
): ExtractedRelationship[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  const out: ExtractedRelationship[] = []
  const seen = new Set<string>()

  const addRel = (
    src: ExtractedEntity,
    tgt: ExtractedEntity,
    relation_type: string,
    weight: number,
    evidence: string
  ) => {
    if (src.normalized.toLowerCase() === tgt.normalized.toLowerCase()) return
    const a = src.normalized.toLowerCase()
    const b = tgt.normalized.toLowerCase()
    const key = `${a}|${b}|${relation_type}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      source: a,
      target: b,
      relation_type,
      weight,
      evidence: evidence.slice(0, 200),
    })
  }

  for (const para of paragraphs) {
    const lower = para.toLowerCase()
    const present = entities.filter((e) => lower.includes(e.normalized.toLowerCase()))
    if (present.length < 2) continue

    const ips = present.filter((e) => e.entity_type === 'ioc_ip')
    const domains = present.filter((e) => e.entity_type === 'ioc_domain')
    const locations = present.filter((e) => e.entity_type === 'location')
    const actors = present.filter((e) => e.entity_type === 'threat_actor')
    const targets = present.filter((e) => e.entity_type === 'target')
    const malware = present.filter((e) => e.entity_type === 'malware')
    const identities = present.filter((e) => e.entity_type === 'identity')

    for (const ip of ips) for (const d of domains) addRel(ip, d, 'communicates_with', 0.6, para)
    for (const loc of locations) {
      for (const a of [...actors, ...targets, ...malware, ...identities]) {
        addRel(loc, a, 'located_in', 0.5, para)
      }
    }
    for (const a of actors) {
      for (const t of [...targets, ...malware]) addRel(a, t, 'targets', 0.7, para)
    }
  }

  return out
}
