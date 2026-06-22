/**
 * Community detection — simplified Louvain algorithm.
 *
 * Implements single-level modularity optimization (no graph aggregation step).
 * Each node starts in its own community; we iteratively move nodes to a
 * neighbouring community that yields the greatest modularity gain until no
 * further improvement is possible.
 *
 * References:
 *  - Blondel et al. "Fast unfolding of communities in large networks" (2008)
 *  - Modularity gain ΔQ for moving node i into community C:
 *      ΔQ ∝ k_i,in(C) − (Σ_tot(C) · k_i) / (2m)
 *    where:
 *      k_i,in(C) = sum of edge weights from i to nodes in C
 *      Σ_tot(C)  = sum of degrees of nodes in C
 *      k_i        = weighted degree of i
 *      m          = total edge weight
 *
 * Edge cases handled:
 *  - Empty graph → empty Map
 *  - Single node → {0: 0}
 *  - Disconnected components → each component forms its own community(ies)
 *  - Isolated nodes (no edges) → each gets its own community
 */

export interface CommunityNode {
  id: number
}

export interface CommunityEdge {
  source: number
  target: number
  weight: number
}

export interface CommunityStat {
  count: number
  sizes: { id: number; size: number }[]
}

/** Small epsilon to avoid floating-point noise when comparing gains. */
const EPS = 1e-12

/** Maximum passes over the node set before bailing out (safety). */
const MAX_ITERATIONS = 25

/**
 * Detect communities in an undirected, weighted graph.
 * Returns a Map of nodeId → communityId, where community IDs are
 * renumbered to a contiguous 0..N-1 range ordered by first appearance.
 */
export function detectCommunities(
  nodes: CommunityNode[],
  edges: CommunityEdge[]
): Map<number, number> {
  const result = new Map<number, number>()

  // Edge case: empty graph
  if (nodes.length === 0) return result

  // Edge case: single node
  if (nodes.length === 1) {
    result.set(nodes[0].id, 0)
    return result
  }

  // Initialise: every node in its own community
  const community = new Map<number, number>()
  let nextComm = 0
  for (const n of nodes) {
    community.set(n.id, nextComm++)
  }

  // Build undirected adjacency list. Edges referencing unknown nodes are
  // ignored, self-loops are skipped, and parallel edges are summed.
  const adj = new Map<number, Map<number, number>>()
  for (const n of nodes) adj.set(n.id, new Map())

  let totalWeight = 0
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue
    if (e.source === e.target) continue
    const w = Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1
    adj.get(e.source)!.set(e.target, (adj.get(e.source)!.get(e.target) || 0) + w)
    adj.get(e.target)!.set(e.source, (adj.get(e.target)!.get(e.source) || 0) + w)
    totalWeight += w
  }

  // 2m = sum of all edge weights (both directions). Guard against zero.
  const twoM = totalWeight > 0 ? totalWeight * 2 : 1

  // Weighted degree of each node
  const degree = new Map<number, number>()
  for (const n of nodes) {
    let d = 0
    for (const w of adj.get(n.id)!.values()) d += w
    degree.set(n.id, d)
  }

  // No edges → every node stays in its own community
  if (totalWeight === 0) {
    return renumber(community)
  }

  // Iterative modularity optimization
  let improved = true
  let iterations = 0

  while (improved && iterations < MAX_ITERATIONS) {
    improved = false
    iterations++

    // Σ_tot per community — maintained online as nodes move
    const sigmaTot = new Map<number, number>()
    for (const n of nodes) {
      const c = community.get(n.id)!
      sigmaTot.set(c, (sigmaTot.get(c) || 0) + degree.get(n.id)!)
    }

    for (const n of nodes) {
      const i = n.id
      const ki = degree.get(i)!
      const neighbors = adj.get(i)!
      const currentComm = community.get(i)!

      // k_i,in per neighbouring community (weight from i into that community)
      const kInByComm = new Map<number, number>()
      for (const [j, w] of neighbors) {
        const c = community.get(j)!
        kInByComm.set(c, (kInByComm.get(c) || 0) + w)
      }

      // Candidates: current community + every neighbouring community
      const candidates = new Set<number>(kInByComm.keys())
      candidates.add(currentComm)

      let bestComm = currentComm
      let bestGain = 0 // require strict improvement over staying put

      for (const c of candidates) {
        // Σ_tot for community C, excluding i itself if C is current
        let sigmaC = sigmaTot.get(c) || 0
        if (c === currentComm) sigmaC -= ki

        const gain = (kInByComm.get(c) || 0) - (sigmaC * ki) / twoM
        if (gain > bestGain + EPS) {
          bestGain = gain
          bestComm = c
        }
      }

      if (bestComm !== currentComm) {
        // Move i: update Σ_tot bookkeeping
        sigmaTot.set(currentComm, (sigmaTot.get(currentComm) || 0) - ki)
        sigmaTot.set(bestComm, (sigmaTot.get(bestComm) || 0) + ki)
        community.set(i, bestComm)
        improved = true
      }
    }
  }

  return renumber(community)
}

/**
 * Renumber community IDs to a contiguous 0..N-1 range, preserving the order
 * in which communities are first encountered during iteration.
 */
function renumber(community: Map<number, number>): Map<number, number> {
  const idMap = new Map<number, number>()
  let next = 0
  const out = new Map<number, number>()
  for (const [nodeId, c] of community) {
    if (!idMap.has(c)) idMap.set(c, next++)
    out.set(nodeId, idMap.get(c)!)
  }
  return out
}

/**
 * Compute summary statistics for a community assignment.
 * Returns the number of distinct communities and a sizes array
 * sorted by size (descending).
 */
export function getCommunityStats(communities: Map<number, number>): CommunityStat {
  const counts = new Map<number, number>()
  for (const c of communities.values()) {
    counts.set(c, (counts.get(c) || 0) + 1)
  }
  const sizes = Array.from(counts.entries())
    .map(([id, size]) => ({ id, size }))
    .sort((a, b) => b.size - a.size || a.id - b.id)
  return { count: counts.size, sizes }
}
