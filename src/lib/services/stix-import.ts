/**
 * STIX 2.1 Import Parser — Parses STIX 2.1 Bundles (OASIS standard)
 * into Ansein entities and relationships.
 * Compatible with OpenCTI, MISP, AlienVault, and MITRE ATT&CK STIX 2.1 files.
 */

export interface ParsedStixObject {
  type: string
  id: string
  name?: string
  value?: string
  pattern?: string
  description?: string
  source_ref?: string
  target_ref?: string
  relationship_type?: string
  confidence?: number
  created?: string
}

export interface StixImportResult {
  title: string
  description: string
  entities: Array<{
    entityType: string
    value: string
    confidence: number
    stixId: string
  }>
  relationships: Array<{
    sourceStixId: string
    targetStixId: string
    relationType: string
    evidence: string
  }>
}

function parseStixPattern(pattern: string): { type: string; value: string } | null {
  // e.g. [ipv4-addr:value = '192.168.1.1']
  const ipMatch = pattern.match(/ipv4-addr:value\s*=\s*'([^']+)'/i)
  if (ipMatch) return { type: 'ioc_ip', value: ipMatch[1] }

  const ip6Match = pattern.match(/ipv6-addr:value\s*=\s*'([^']+)'/i)
  if (ip6Match) return { type: 'ioc_ip', value: ip6Match[1] }

  const domainMatch = pattern.match(/domain-name:value\s*=\s*'([^']+)'/i)
  if (domainMatch) return { type: 'ioc_domain', value: domainMatch[1] }

  const urlMatch = pattern.match(/url:value\s*=\s*'([^']+)'/i)
  if (urlMatch) return { type: 'ioc_url', value: urlMatch[1] }

  const hashMatch = pattern.match(/file:hashes\.(?:MD5|SHA-1|SHA-256)\s*=\s*'([^']+)'/i)
  if (hashMatch) return { type: 'ioc_hash', value: hashMatch[1] }

  return null
}

export function parseStixBundle(bundleJson: any): StixImportResult {
  const bundle = typeof bundleJson === 'string' ? JSON.parse(bundleJson) : bundleJson
  const objects: ParsedStixObject[] = Array.isArray(bundle?.objects) ? bundle.objects : []

  let title = 'Imported STIX 2.1 Bundle'
  let description = ''
  const entities: StixImportResult['entities'] = []
  const relationships: StixImportResult['relationships'] = []

  for (const obj of objects) {
    if (!obj.type || !obj.id) continue

    // Detect Report or Grouping as investigation metadata
    if (obj.type === 'report' || obj.type === 'grouping') {
      if (obj.name) title = obj.name
      if (obj.description) description = obj.description
      continue
    }

    if (obj.type === 'indicator') {
      const parsed = obj.pattern ? parseStixPattern(obj.pattern) : null
      const val = parsed?.value || obj.name || obj.value || obj.id
      const entType = parsed?.type || (val.includes('/') ? 'ioc_url' : val.includes('.') ? 'ioc_domain' : 'ioc_hash')
      entities.push({
        entityType: entType,
        value: val,
        confidence: typeof obj.confidence === 'number' ? obj.confidence / 100 : 0.8,
        stixId: obj.id,
      })
    } else if (obj.type === 'malware') {
      entities.push({
        entityType: 'malware',
        value: obj.name || obj.id,
        confidence: 0.9,
        stixId: obj.id,
      })
    } else if (obj.type === 'threat-actor' || obj.type === 'intrusion-set') {
      entities.push({
        entityType: 'threat_actor',
        value: obj.name || obj.id,
        confidence: 0.9,
        stixId: obj.id,
      })
    } else if (obj.type === 'attack-pattern' || obj.type === 'x-mitre-attack-pattern') {
      entities.push({
        entityType: 'technique',
        value: obj.name || obj.id,
        confidence: 0.85,
        stixId: obj.id,
      })
    } else if (obj.type === 'vulnerability') {
      entities.push({
        entityType: 'vulnerability',
        value: obj.name || obj.id,
        confidence: 0.9,
        stixId: obj.id,
      })
    } else if (obj.type === 'tool') {
      entities.push({
        entityType: 'tool',
        value: obj.name || obj.id,
        confidence: 0.85,
        stixId: obj.id,
      })
    } else if (obj.type === 'campaign') {
      entities.push({
        entityType: 'threat_actor',
        value: obj.name || obj.id,
        confidence: 0.9,
        stixId: obj.id,
      })
    } else if (obj.type === 'infrastructure') {
      entities.push({
        entityType: 'target',
        value: obj.name || obj.id,
        confidence: 0.8,
        stixId: obj.id,
      })
    } else if (obj.type === 'location') {
      entities.push({
        entityType: 'location',
        value: obj.name || (obj as any).country || obj.id,
        confidence: 0.85,
        stixId: obj.id,
      })
    } else if (obj.type === 'identity') {
      entities.push({
        entityType: 'identity',
        value: obj.name || obj.id,
        confidence: 0.85,
        stixId: obj.id,
      })
    // ---------------- STIX 2.1 Native Cyber-observable Objects (SCOs)
    } else if (obj.type === 'ipv4-addr' || obj.type === 'ipv6-addr') {
      entities.push({
        entityType: 'ioc_ip',
        value: obj.value || obj.name || obj.id,
        confidence: 0.95,
        stixId: obj.id,
      })
    } else if (obj.type === 'domain-name') {
      entities.push({
        entityType: 'ioc_domain',
        value: (obj.value || obj.name || obj.id).toLowerCase(),
        confidence: 0.9,
        stixId: obj.id,
      })
    } else if (obj.type === 'url') {
      entities.push({
        entityType: 'ioc_url',
        value: obj.value || obj.name || obj.id,
        confidence: 0.95,
        stixId: obj.id,
      })
    } else if (obj.type === 'file') {
      const hashes = (obj as any).hashes || {}
      const hashVal = hashes['SHA-256'] || hashes['SHA-1'] || hashes['MD5'] || obj.name || obj.id
      entities.push({
        entityType: 'ioc_hash',
        value: hashVal,
        confidence: 0.95,
        stixId: obj.id,
      })
    } else if (obj.type === 'relationship' && obj.source_ref && obj.target_ref) {
      relationships.push({
        sourceStixId: obj.source_ref,
        targetStixId: obj.target_ref,
        relationType: obj.relationship_type || 'related-to',
        evidence: obj.description || '',
      })
    }
  }

  return { title, description, entities, relationships }
}
