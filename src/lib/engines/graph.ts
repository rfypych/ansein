/**
 * Graph engine — builds D3-compatible graph data.
 * Ported from backend/app/engines/graph.py
 */
import type { EntityType } from '@/lib/engines/extraction'

export const COLOR_MAP: Record<EntityType, string> = {
  threat_actor: '#dc2626',
  malware: '#7c3aed',
  tool: '#0d9488',
  technique: '#0891b2',
  vulnerability: '#ea580c',
  ioc_ip: '#16a34a',
  ioc_domain: '#65a30d',
  ioc_url: '#9333ea',
  ioc_hash: '#0d9488',
  ioc_wallet: '#a16207',
  target: '#db2777',
  location: '#475569',
  identity: '#64748b',
}

export const ICON_MAP: Record<EntityType, string> = {
  threat_actor: 'users',
  malware: 'bug',
  tool: 'wrench',
  technique: 'code',
  vulnerability: 'shield',
  ioc_ip: 'globe',
  ioc_domain: 'link',
  ioc_url: 'external-link',
  ioc_hash: 'hash',
  ioc_wallet: 'credit-card',
  target: 'crosshair',
  location: 'map-pin',
  identity: 'user',
}

export interface GraphNode {
  id: number
  label: string
  type: EntityType
  color: string
  icon: string
  confidence: number
  enrichment: boolean
}

export interface GraphEdge {
  source: number
  target: number
  label: string
  weight: number
  evidence: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface EntityRow {
  id: number
  entityType: EntityType
  value: string
  confidence: number
  enrichment: string
}

interface RelationshipRow {
  sourceId: number
  targetId: number
  relationType: string
  weight: number
  evidence: string
}

export function buildGraph(
  entities: EntityRow[],
  relationships: RelationshipRow[],
  maxNodes = 500
): GraphData {
  // If over the limit, keep top-degree nodes
  let keptEntities = entities
  let keptRels = relationships
  if (entities.length > maxNodes) {
    const degree = new Map<number, number>()
    for (const r of relationships) {
      degree.set(r.sourceId, (degree.get(r.sourceId) || 0) + 1)
      degree.set(r.targetId, (degree.get(r.targetId) || 0) + 1)
    }
    const sortedIds = entities
      .map((e) => ({ id: e.id, deg: degree.get(e.id) || 0 }))
      .sort((a, b) => b.deg - a.deg)
      .slice(0, maxNodes)
      .map((x) => x.id)
    const idSet = new Set(sortedIds)
    keptEntities = entities.filter((e) => idSet.has(e.id))
    keptRels = relationships.filter((r) => idSet.has(r.sourceId) && idSet.has(r.targetId))
  }

  const nodes: GraphNode[] = keptEntities.map((e) => {
    let hasEnrich = false
    try {
      const parsed = JSON.parse(e.enrichment || '{}')
      hasEnrich = !!parsed && Object.keys(parsed).length > 0
    } catch {
      hasEnrich = false
    }
    return {
      id: e.id,
      label: e.value.length > 32 ? e.value.slice(0, 30) + '…' : e.value,
      type: e.entityType,
      color: COLOR_MAP[e.entityType] || '#64748b',
      icon: ICON_MAP[e.entityType] || 'circle',
      confidence: e.confidence,
      enrichment: hasEnrich,
    }
  })

  const edges: GraphEdge[] = keptRels.map((r) => ({
    source: r.sourceId,
    target: r.targetId,
    label: r.relationType,
    weight: r.weight,
    evidence: r.evidence,
  }))

  return { nodes, edges }
}
