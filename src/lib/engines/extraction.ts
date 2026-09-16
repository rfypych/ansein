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
  // Custom OpenAI-compatible LLM provider
  custom_llm_api_key?: string
  custom_llm_base_url?: string
  custom_llm_model?: string
}

// ---------------------------------------------------------------- defanging
/**
 * Defang common CTI evasive notations so regexes can match cleanly.
 * e.g.:
 *  hxxp:// -> http://
 *  hxxps:// -> https://
 *  185[.]220[.]101[.]5 -> 185.220.101.5
 *  evil[dot]com -> evil.com
 */
export function defang(input: string): string {
  if (!input) return ''
  return input
    .replace(/\bhxxp(s?):\/\//gi, 'http$1://')
    .replace(/\bme\s*\[\s*\.\s*\]\s*ga\b/gi, 'mega')
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .replace(/\{\.\}/g, '.')
    .replace(/\[dot\]/gi, '.')
    .replace(/\(dot\)/gi, '.')
    .replace(/\{dot\}/gi, '.')
    .replace(/\[colon\]/gi, ':')
    .replace(/\(colon\)/gi, ':')
    .replace(/\[:\/\/\]/g, '://')
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

// Extensions and local filenames that must NEVER be parsed as domains
const FILE_OR_CODE_EXT = /\.(bin|dll|so|dylib|exe|sys|drv|json|xml|yaml|yml|py|sh|ps1|bat|cmd|vbs|js|ts|tsx|jsx|c|cpp|h|hpp|rs|go|java|class|jar|war|tar|gz|bz2|xz|zip|7z|rar|iso|img|vmdk|tmp|bak|old|swp|pid|lock|txt|log|conf|cfg|ini|inf|reg|dat|db|sqlite|sql|csv|tsv|md|pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|css|svg|webp|ico|woff2?|ttf|otf|eot)$/i

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

export function regexExtract(rawText: string): RegexHit[] {
  const text = defang(rawText)
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
  // Domains (strictly filter files, code extensions, and invalid TLDs)
  for (const m of text.matchAll(RE.DOMAIN)) {
    const v = m[0].toLowerCase()
    if (FILE_OR_CODE_EXT.test(v)) continue
    // Filter out common false-positive filenames / version strings (e.g. v1.0.0, 1.2.3)
    if (/^\d+(\.\d+)+$/.test(v)) continue
    // TLD must have at least 2 alpha characters
    const parts = v.split('.')
    const tld = parts[parts.length - 1]
    if (!/^[a-z]{2,24}$/.test(tld)) continue
    // Skip if it looks like an IP address or partial octet
    if (parts.every((p) => /^\d+$/.test(p))) continue

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

async function callLlmExtractChunk(
  chunk: string,
  userKeys: UserKeys
): Promise<RegexHit[]> {
  try {
    const { chatCompletion } = await import('@/lib/llm')
    const resp = await chatCompletion({
      messages: [
        { role: 'system', content: LLM_SYSTEM },
        { role: 'user', content: LLM_EXTRACTION_PROMPT + '\n```\n' + chunk + '\n```\n' },
      ],
      temperature: 0,
      maxTokens: 2048,
      userKeys,
    })
    if (!resp.content) return []
    const cleaned = resp.content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
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
      // Don't let LLM re-introduce file extensions as domains
      if (t === 'ioc_domain' && FILE_OR_CODE_EXT.test(v.toLowerCase())) continue
      const c = Math.min(1, Math.max(0, Number(item.confidence ?? 0.5) || 0.5))
      out.push({ entity_type: t, value: v, confidence: c })
    }
    return out
  } catch (e) {
    console.warn('[extraction] LLM chunk failed:', e)
    return []
  }
}

async function llmExtract(
  text: string,
  userKeys: UserKeys
): Promise<RegexHit[]> {
  if (text.length < 80) return []
  
  // For massive documents (up to 50k+ chars), use sliding chunks so no threat actor/TTP is lost
  const CHUNK_SIZE = 7500
  const CHUNK_OVERLAP = 500
  const chunks: string[] = []
  
  if (text.length <= CHUNK_SIZE) {
    chunks.push(text)
  } else {
    let start = 0
    // Process up to 5 strategic chunks (up to ~35,000 characters)
    while (start < text.length && chunks.length < 5) {
      const end = Math.min(start + CHUNK_SIZE, text.length)
      chunks.push(text.slice(start, end))
      start += CHUNK_SIZE - CHUNK_OVERLAP
    }
  }

  const allHits: RegexHit[] = []
  for (const chunk of chunks) {
    const chunkHits = await callLlmExtractChunk(chunk, userKeys)
    allHits.push(...chunkHits)
  }
  return allHits
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

// ---------------------------------------------------------------- Relationships Pass
const LLM_RELATIONSHIPS_PROMPT = `You are a cyber threat intelligence extractor.
Given the text below and a list of extracted entities (each with an 'id'), identify relationships between these entities based ONLY on the text. Look deeply for implicit relationships (e.g. communicating, ownership, targeting).
Return a JSON array of objects. Each object MUST have:
- "source_id": the integer 'id' of the source entity
- "target_id": the integer 'id' of the target entity
- "relation_type": a snake_case string (e.g. communicates_with, targets, located_in, uses, owns, drops, resolves_to, related_to)
- "weight": float between 0.0 and 1.0 (use higher weights for explicit links)
- "evidence": a short quote from the text
Only use 'id's from the provided list. Return [] if no relationships exist.

TEXT:
`

export async function llmInferRelationships(
  entities: ExtractedEntity[],
  text: string,
  userKeys: UserKeys = {}
): Promise<ExtractedRelationship[]> {
  if (entities.length < 2 || text.length < 50) return []
  
  // Combine with heuristic inference as a reliable foundation
  const heuristicRels = inferRelationships(entities, text)
  const relMap = new Map<string, ExtractedRelationship>()
  for (const hr of heuristicRels) {
    relMap.set(`${hr.source}|${hr.target}|${hr.relation_type}`, hr)
  }

  // Provide up to 16,000 characters of text for relationship context
  const excerpt = text.length <= 16000 ? text : text.slice(0, 16000)
  
  // Prioritize pivot entities if there are too many to fit in a single prompt
  const sortedEntities = [...entities].sort((a, b) => {
    const priority = (type: EntityType) => {
      switch (type) {
        case 'threat_actor': return 1
        case 'malware': return 2
        case 'vulnerability': return 3
        case 'tool': return 4
        case 'technique': return 5
        case 'ioc_ip': return 6
        case 'ioc_domain': return 7
        default: return 8
      }
    }
    return priority(a.entity_type) - priority(b.entity_type)
  })
  const selectedEntities = sortedEntities.slice(0, 45)

  // Assign IDs to entities for the LLM prompt
  const idMap = new Map<number, ExtractedEntity>()
  const entitiesListForPrompt = selectedEntities.map((e, idx) => {
    idMap.set(idx + 1, e)
    return { id: idx + 1, type: e.entity_type, value: e.normalized }
  })

  const entitiesListJson = JSON.stringify(entitiesListForPrompt, null, 2)

  let content: string | null = null
  try {
    const { chatCompletion } = await import('@/lib/llm')
    const resp = await chatCompletion({
      messages: [
        { role: 'system', content: 'You output strict JSON, no prose.' },
        { role: 'user', content: LLM_RELATIONSHIPS_PROMPT + '\n```\n' + excerpt + '\n```\n\nENTITIES:\n```json\n' + entitiesListJson + '\n```\n' },
      ],
      temperature: 0.1,
      maxTokens: 2048,
      userKeys,
    })
    content = resp.content
  } catch (e) {
    console.warn('[extraction] LLM relationships failed:', e)
    return heuristicRels
  }
  
  if (!content) return heuristicRels
  
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
    
  try {
    const arr = JSON.parse(cleaned) as any[]
    if (!Array.isArray(arr)) return inferRelationships(entities, text)
    
    const out: ExtractedRelationship[] = []
    const seen = new Set<string>()
    
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      
      const sourceId = parseInt(item.source_id, 10)
      const targetId = parseInt(item.target_id, 10)
      const rel = String(item.relation_type || '').trim().toLowerCase()
      
      if (isNaN(sourceId) || isNaN(targetId) || !rel) continue
      
      const srcEntity = idMap.get(sourceId)
      const tgtEntity = idMap.get(targetId)
      
      if (!srcEntity || !tgtEntity) continue
      
      const source = srcEntity.normalized.toLowerCase()
      const target = tgtEntity.normalized.toLowerCase()
      
      if (source === target) continue
      
      const key = `${source}|${target}|${rel}`
      if (seen.has(key)) continue
      seen.add(key)
      
      out.push({
        source,
        target,
        relation_type: rel,
        weight: Math.min(1, Math.max(0, Number(item.weight) || 0.5)),
        evidence: String(item.evidence || '').slice(0, 200)
      })
    }
    
    // Merge LLM inferred relationships with heuristic relationships
    for (const rel of out) {
      relMap.set(`${rel.source}|${rel.target}|${rel.relation_type}`, rel)
    }
    
    return Array.from(relMap.values())
  } catch (e) {
    return heuristicRels
  }
}
