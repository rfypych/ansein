/**
 * Graph engine — builds D3-compatible graph data.
 * Ported from backend/app/engines/graph.py
 */
import type { EntityType } from '@/lib/engines/extraction'
import { detectCommunities, getCommunityStats } from '@/lib/engines/community-detection'

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

/**
 * Distinct color palette for communities (8 hues). Chosen to contrast with
 * the entity-type palette while remaining readable on the noir background.
 * Indexed by community ID modulo 8.
 */
export const COMMUNITY_COLORS: string[] = [
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#22d3ee', // cyan
  '#84cc16', // lime
  '#fb923c', // orange
  '#a78bfa', // light violet
]

export interface GraphNode {
  id: number
  label: string
  type: EntityType
  color: string
  icon: string
  confidence: number
  enrichment: boolean
  /** Detected community ID (Louvain). 0 if isolated or single-node graph. */
  community: number
  /** ISO timestamp of when the underlying entity row was created (4D temporal). */
  createdAt?: string
}

export interface GraphEdge {
  source: number
  target: number
  label: string
  weight: number
  evidence: string
  /** ISO timestamp of when the underlying relationship row was created (4D temporal). */
  createdAt?: string
}

export interface GraphCommunity {
  id: number
  size: number
  color: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  communities: GraphCommunity[]
  /** Earliest entity/relationship creation timestamp — start of the timeline slider. */
  minDate?: string | null
  /** Latest entity/relationship creation timestamp — end of the timeline slider. */
  maxDate?: string | null
}

interface EntityRow {
  id: number
  entityType: EntityType
  value: string
  confidence: number
  enrichment: unknown
  createdAt?: Date | string
}

interface RelationshipRow {
  sourceId: number
  targetId: number
  relationType: string
  weight: number
  evidence: string
  createdAt?: Date | string
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
    // Enrichment may be a parsed Json object (JSONB) or legacy raw string
    let hasEnrich = false
    try {
      const parsed =
        typeof e.enrichment === 'string'
          ? JSON.parse(e.enrichment || '{}')
          : (e.enrichment ?? {})
      hasEnrich = !!parsed && Object.keys(parsed as object).length > 0
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
      // default — overwritten after community detection below
      community: 0,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    }
  })

  const edges: GraphEdge[] = keptRels.map((r) => ({
    source: r.sourceId,
    target: r.targetId,
    label: r.relationType,
    weight: r.weight,
    evidence: r.evidence,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  }))

  // Detect communities (simplified Louvain) and assign a community ID to each
  // node. Nodes with no edges end up in their own singleton community.
  const communityMap = detectCommunities(
    nodes.map((n) => ({ id: n.id })),
    edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight }))
  )
  for (const n of nodes) {
    n.community = communityMap.get(n.id) ?? 0
  }

  // Build community summary list (top 8 by size) for the legend.
  const stats = getCommunityStats(communityMap)
  const communities: GraphCommunity[] = stats.sizes
    .slice(0, COMMUNITY_COLORS.length)
    .map((s, i) => ({
      id: s.id,
      size: s.size,
      color: COMMUNITY_COLORS[i % COMMUNITY_COLORS.length],
    }))

  // 4D temporal range — earliest and latest creation timestamps across all
  // nodes and edges. Surfaces the slider bounds to the client.
  const allTs: number[] = []
  for (const n of nodes) {
    if (n.createdAt) {
      const t = Date.parse(n.createdAt)
      if (!Number.isNaN(t)) allTs.push(t)
    }
  }
  for (const e of edges) {
    if (e.createdAt) {
      const t = Date.parse(e.createdAt)
      if (!Number.isNaN(t)) allTs.push(t)
    }
  }
  const minDate = allTs.length ? new Date(Math.min(...allTs)).toISOString() : null
  const maxDate = allTs.length ? new Date(Math.max(...allTs)).toISOString() : null

  return { nodes, edges, communities, minDate, maxDate }
}
