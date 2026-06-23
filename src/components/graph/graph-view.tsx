'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Pause, Play, Network, Clock, Rewind } from 'lucide-react'

/**
 * Community color palette — 8 distinct hues. Must stay in sync with
 * COMMUNITY_COLORS in src/lib/engines/graph.ts (kept duplicated here to avoid
 * pulling server-only modules into the client bundle).
 */
const COMMUNITY_COLORS: string[] = [
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#22d3ee', // cyan
  '#84cc16', // lime
  '#fb923c', // orange
  '#a78bfa', // light violet
]

type ColorMode = 'community' | 'type'

interface GraphNode {
  id: number
  label: string
  type: string
  color: string
  icon: string
  confidence: number
  enrichment: boolean
  community?: number
  /** ISO timestamp — when the underlying entity row was created (4D temporal). */
  createdAt?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphEdge {
  source: number | GraphNode
  target: number | GraphNode
  label: string
  weight: number
  evidence: string
  /** ISO timestamp — when the underlying relationship row was created (4D temporal). */
  createdAt?: string
}

interface GraphCommunity {
  id: number
  size: number
  color: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  communities?: GraphCommunity[]
  /** Earliest creation timestamp across nodes+edges — start of the timeline slider. */
  minDate?: string | null
  /** Latest creation timestamp across nodes+edges — end of the timeline slider. */
  maxDate?: string | null
}

interface GraphViewProps {
  data: GraphData
  height?: number | string
}

export function GraphView({ data, height = 'calc(100vh - 360px)' }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [simRunning, setSimRunning] = useState(true)
  const hasCommunities = !!(
    data.communities &&
    data.communities.length > 0 &&
    data.nodes.some((n) => typeof n.community === 'number')
  )
  const [colorMode, setColorMode] = useState<ColorMode>(hasCommunities ? 'community' : 'type')
  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const svgSelRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null)

  // -------- 4D temporal slider state --------
  // timelineAt is a Unix timestamp in ms; null = "show everything" (slider at
  // the rightmost end). HasTemporal is false when the data has no createdAt
  // info (e.g. legacy investigations), in which case the slider is hidden.
  const minTs = data.minDate ? Date.parse(data.minDate) : NaN
  const maxTs = data.maxDate ? Date.parse(data.maxDate) : NaN
  const hasTemporal = Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > minTs
  // Slider value drives the filter: nodes/edges with createdAt > timelineAt are hidden.
  const [timelineAt, setTimelineAt] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRafRef = useRef<number | null>(null)
  // Live D3 selections — captured by the main render effect so the timeline
  // filter effect can update visibility WITHOUT restarting the simulation.
  // Typed loosely (any) because the precise D3 Selection generics depend on
  // the call chain that produced them and aren't worth pinning down for an
  // internal implementation detail.
  const nodeSelRef = useRef<d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null>(null)
  const linkSelRef = useRef<d3.Selection<SVGPathElement, GraphEdge & { source: unknown; target: unknown }, SVGGElement, unknown> | null>(null)
  const edgeLabelSelRef = useRef<d3.Selection<SVGGElement, GraphEdge & { source: unknown; target: unknown }, SVGGElement, unknown> | null>(null)
  // Mirror timelineAt into a ref so the inline D3 click handler (rebound only
  // on sim restart) always sees the latest value without being a dep.
  const timelineAtRef = useRef<number | null>(null)
  useEffect(() => {
    timelineAtRef.current = timelineAt
  }, [timelineAt])

  // Initialize / reset the slider to "show all" when the underlying graph data
  // changes (e.g. user switches investigations, pipeline re-runs).
  useEffect(() => {

    setTimelineAt(null)

    setIsPlaying(false)
  }, [data])

  // Stop any in-flight playback raf on unmount.
  useEffect(() => {
    return () => {
      if (playbackRafRef.current) cancelAnimationFrame(playbackRafRef.current)
    }
  }, [])

  // Build a communityId → color lookup from data.communities (the top-8 list
  // prepared by the graph builder). Communities outside the top-8 fall back to
  // COMMUNITY_COLORS[id % 8].
  const communityColorMap = useCallback((): Map<number, string> => {
    const m = new Map<number, string>()
    if (data.communities) {
      for (const c of data.communities) m.set(c.id, c.color)
    }
    return m
  }, [data.communities])

  // Pick the rendered color for a node based on the active color mode.
  const colorFor = useCallback(
    (n: GraphNode): string => {
      if (colorMode === 'community' && typeof n.community === 'number') {
        return (
          communityColorMap().get(n.community) ||
          COMMUNITY_COLORS[n.community % COMMUNITY_COLORS.length]
        )
      }
      return n.color
    },
    [colorMode, communityColorMap]
  )

  // Handle node click — stable callback so D3 doesn't need to rebind
  const handleNodeClick = useCallback((event: MouseEvent, d: GraphNode) => {
    event.stopPropagation()
    setSelectedNode(d)
  }, [])

  /**
   * Apply the 4D temporal filter to the live D3 selections. Hidden elements
   * get opacity 0 + display:none; visible elements get opacity 1 + display ''.
   *
   * This function is invoked:
   *   - Once after the main render effect sets up the selections (initial state).
   *   - On every timelineAt change via the dedicated filter effect below.
   *
   * The simulation is NOT restarted — node positions are preserved so dragging
   * the slider feels smooth.
   */
  const applyTimelineFilter = useCallback((at: number | null) => {
    const nodeSel = nodeSelRef.current
    const linkSel = linkSelRef.current
    const edgeLabelSel = edgeLabelSelRef.current
    if (!nodeSel || !linkSel || !edgeLabelSel) return
    if (at == null) {
      // Show everything.
      nodeSel.style('display', '').attr('opacity', 1)
      linkSel.style('display', '').attr('stroke-opacity', 0.6)
      edgeLabelSel.style('display', '').attr('opacity', 0.8)
      return
    }
    nodeSel
      .style('display', (n) => {
        if (!n.createdAt) return ''
        return Date.parse(n.createdAt) <= at ? '' : 'none'
      })
      .attr('opacity', (n) => {
        if (!n.createdAt) return 1
        return Date.parse(n.createdAt) <= at ? 1 : 0
      })
    linkSel
      .style('display', (l) => {
        const sTs = (l.source as GraphNode).createdAt
        const tTs = (l.target as GraphNode).createdAt
        const sOk = !sTs || Date.parse(sTs) <= at
        const tOk = !tTs || Date.parse(tTs) <= at
        return sOk && tOk ? '' : 'none'
      })
      .attr('stroke-opacity', (l) => {
        const sTs = (l.source as GraphNode).createdAt
        const tTs = (l.target as GraphNode).createdAt
        const sOk = !sTs || Date.parse(sTs) <= at
        const tOk = !tTs || Date.parse(tTs) <= at
        return sOk && tOk ? 0.6 : 0
      })
    edgeLabelSel
      .style('display', (l) => {
        const sTs = (l.source as GraphNode).createdAt
        const tTs = (l.target as GraphNode).createdAt
        const sOk = !sTs || Date.parse(sTs) <= at
        const tOk = !tTs || Date.parse(tTs) <= at
        return sOk && tOk ? '' : 'none'
      })
      .attr('opacity', (l) => {
        const sTs = (l.source as GraphNode).createdAt
        const tTs = (l.target as GraphNode).createdAt
        const sOk = !sTs || Date.parse(sTs) <= at
        const tOk = !tTs || Date.parse(tTs) <= at
        return sOk && tOk ? 0.8 : 0
      })
  }, [])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return
    if (!data.nodes.length) return

    const container = containerRef.current
    const width = container.clientWidth
    const heightNum = typeof height === 'number' ? height : Math.max(500, container.clientHeight)

    // Clone data to avoid mutating props
    const nodes: GraphNode[] = data.nodes.map((n) => ({ ...n }))
    const links = data.edges.map((e) => ({ ...e }))

    // Clear previous
    const svgSel = d3.select(svgRef.current)
    svgSel.selectAll('*').remove()

    svgSel
      .attr('width', width)
      .attr('height', heightNum)
      .attr('viewBox', [0, 0, width, heightNum])

    svgSelRef.current = svgSel

    // Grid pattern
    if (showGrid) {
      const defs = svgSel.append('defs')
      const pattern = defs
        .append('pattern')
        .attr('id', 'grid')
        .attr('width', 40)
        .attr('height', 40)
        .attr('patternUnits', 'userSpaceOnUse')
      pattern.append('circle')
        .attr('cx', 20)
        .attr('cy', 20)
        .attr('r', 0.8)
        .attr('fill', '#1f2538')
      svgSel.append('rect')
        .attr('width', width)
        .attr('height', heightNum)
        .attr('fill', 'url(#grid)')
    }

    // Arrow marker for edges
    const defs = svgSel.append('defs')
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#475569')

    // Container groups (zoomable)
    const g = svgSel.append('g')

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString())
      })
    svgSel.call(zoom)
    zoomRef.current = zoom

    // Click on background deselects
    svgSel.on('click', () => {
      setSelectedNode(null)
    })

    // Simulation — tuned for stability
    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphEdge & { source: unknown; target: unknown }>(links as any)
          .id((d) => d.id)
          .distance(100)
          .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, heightNum / 2))
      .force('collide', d3.forceCollide<GraphNode>().radius((d) => 16 + d.confidence * 12).strength(0.8))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(heightNum / 2).strength(0.05))
      .alphaDecay(0.03)

    simulationRef.current = sim

    // Edges — curved paths for better visibility
    const link = g
      .append('g')
      .attr('stroke', '#334155')
      .attr('stroke-opacity', 0.6)
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('stroke-width', (d) => Math.max(1.5, Math.min(3.5, d.weight * 2)))
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow)')

    // Edge labels — background pill for readability
    const edgeLabelGroup = g
      .append('g')
      .selectAll('g')
      .data(links)
      .join('g')
      .attr('opacity', 0.8)

    edgeLabelGroup
      .append('rect')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('fill', '#0a0e16')
      .attr('stroke', '#1f2538')
      .attr('stroke-width', 0.5)

    edgeLabelGroup
      .append('text')
      .attr('font-size', 9)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'var(--font-courier), monospace')
      .text((d) => d.label)

    // Node groups
    const node = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          // Filter: only start drag on left-click with movement
          .on('start', (event, d) => {
            // Don't restart simulation here — prevents scatter on click
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            // Only restart the simulation if it's cold (alpha near 0)
            if (sim.alpha() < 0.05) {
              sim.alpha(0.3).restart()
              setSimRunning(true)
            }
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            // Release the node
            d.fx = null
            d.fy = null
          })
      )

    // Node glow (subtle) — uses active color (community or type)
    node
      .append('circle')
      .attr('r', (d) => 12 + d.confidence * 10)
      .attr('fill', (d) => colorFor(d))
      .attr('fill-opacity', 0.08)
      .attr('stroke', 'none')

    // Node circles — colored by community in community mode, else by entity type
    node
      .append('circle')
      .attr('r', (d) => 8 + d.confidence * 8)
      .attr('fill', (d) => colorFor(d))
      .attr('stroke', '#0a0e16')
      .attr('stroke-width', 2)

    // Enriched indicator ring
    node
      .filter((d) => d.enrichment)
      .append('circle')
      .attr('r', (d) => 8 + d.confidence * 8 + 4)
      .attr('fill', 'none')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5)
      .attr('stroke-dasharray', '3 3')

    // Node hover title — includes community when available
    node
      .append('title')
      .text(
        (d) =>
          `[${d.type}] ${d.label}\nconfidence: ${(d.confidence * 100).toFixed(0)}%${
            typeof d.community === 'number' ? `\ncommunity: #${d.community}` : ''
          }${d.enrichment ? '\nenriched: yes' : ''}`
      )

    // Node labels — with background for readability
    const nodeLabelGroup = node
      .append('g')
      .attr('transform', (d) => `translate(0, ${8 + d.confidence * 8 + 14})`)

    nodeLabelGroup
      .append('rect')
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('fill', '#0a0e16')
      .attr('fill-opacity', 0.7)
      .each(function (d) {
        const textLen = d.label.length > 20 ? 18 : d.label.length
        d3.select(this)
          .attr('x', -(textLen * 3 + 4))
          .attr('y', -6)
          .attr('width', textLen * 6 + 8)
          .attr('height', 12)
      })

    nodeLabelGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 9)
      .attr('fill', '#cbd5e1')
      .attr('font-family', 'var(--font-courier), monospace')
      .text((d) => (d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label))

    // Click handler — when community data is available, highlight every node
    // in the same community (and edges internal to that community). Otherwise
    // fall back to direct-neighbour highlighting.
    node.on('click', function (event, d) {
      event.stopPropagation()
      setSelectedNode(d)
      const hasComm = typeof d.community === 'number'
      node.transition().duration(200).attr('opacity', (n) => {
        // Respect the timeline filter — nodes outside the current time window
        // stay hidden regardless of community membership.
        if (timelineAtRef.current != null && n.createdAt && Date.parse(n.createdAt) > timelineAtRef.current) {
          return 0
        }
        if (hasComm) return n.community === d.community ? 1 : 0.2
        return (
          n.id === d.id ||
          links.some(
            (l) =>
              ((l.source as GraphNode).id === d.id && (l.target as GraphNode).id === n.id) ||
              ((l.target as GraphNode).id === d.id && (l.source as GraphNode).id === n.id)
          )
        ) ? 1 : 0.3
      })
      link.transition().duration(200).attr('stroke-opacity', (l) => {
        if (timelineAtRef.current != null) {
          const sTs = (l.source as GraphNode).createdAt
          const tTs = (l.target as GraphNode).createdAt
          const sOk = !sTs || Date.parse(sTs) <= timelineAtRef.current
          const tOk = !tTs || Date.parse(tTs) <= timelineAtRef.current
          if (!sOk || !tOk) return 0
        }
        if (hasComm) {
          return (l.source as GraphNode).community === d.community &&
            (l.target as GraphNode).community === d.community
            ? 0.9
            : 0.05
        }
        return (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 0.9 : 0.1
      })
      edgeLabelGroup.transition().duration(200).attr('opacity', (l) => {
        if (timelineAtRef.current != null) {
          const sTs = (l.source as GraphNode).createdAt
          const tTs = (l.target as GraphNode).createdAt
          const sOk = !sTs || Date.parse(sTs) <= timelineAtRef.current
          const tOk = !tTs || Date.parse(tTs) <= timelineAtRef.current
          if (!sOk || !tOk) return 0
        }
        if (hasComm) {
          return (l.source as GraphNode).community === d.community &&
            (l.target as GraphNode).community === d.community
            ? 1
            : 0.1
        }
        return (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 1 : 0.1
      })
    })

    // Background click resets highlight
    svgSel.on('click.reset', () => {
      setSelectedNode(null)
      node.transition().duration(200).attr('opacity', (n) => {
        if (timelineAtRef.current != null && n.createdAt && Date.parse(n.createdAt) > timelineAtRef.current) {
          return 0
        }
        return 1
      })
      link.transition().duration(200).attr('stroke-opacity', (l) => {
        if (timelineAtRef.current != null) {
          const sTs = (l.source as GraphNode).createdAt
          const tTs = (l.target as GraphNode).createdAt
          const sOk = !sTs || Date.parse(sTs) <= timelineAtRef.current
          const tOk = !tTs || Date.parse(tTs) <= timelineAtRef.current
          if (!sOk || !tOk) return 0
        }
        return 0.6
      })
      edgeLabelGroup.transition().duration(200).attr('opacity', (l) => {
        if (timelineAtRef.current != null) {
          const sTs = (l.source as GraphNode).createdAt
          const tTs = (l.target as GraphNode).createdAt
          const sOk = !sTs || Date.parse(sTs) <= timelineAtRef.current
          const tOk = !tTs || Date.parse(tTs) <= timelineAtRef.current
          if (!sOk || !tOk) return 0
        }
        return 0.8
      })
    })

    // Tick — update positions
    sim.on('tick', () => {
      link
        .attr('d', (d) => {
          const sx = (d.source as GraphNode).x!
          const sy = (d.source as GraphNode).y!
          const tx = (d.target as GraphNode).x!
          const ty = (d.target as GraphNode).y!
          // Curved path for better visual
          const mx = (sx + tx) / 2
          const my = (sy + ty) / 2
          // Offset the control point slightly for a gentle curve
          const dx = tx - sx
          const dy = ty - sy
          const dr = Math.sqrt(dx * dx + dy * dy)
          const curveOffset = Math.min(20, dr * 0.1)
          return `M${sx},${sy}Q${mx + (dy / dr) * curveOffset},${my - (dx / dr) * curveOffset},${tx},${ty}`
        })
      edgeLabelGroup
        .attr('transform', (d) => {
          const sx = (d.source as GraphNode).x!
          const sy = (d.source as GraphNode).y!
          const tx = (d.target as GraphNode).x!
          const ty = (d.target as GraphNode).y!
          return `translate(${(sx + tx) / 2},${(sy + ty) / 2})`
        })
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    // Stop simulation after it settles
    sim.on('end', () => {
      setSimRunning(false)
    })

    // Resize observer
    const resizeObs = new ResizeObserver(() => {
      const newW = container.clientWidth
      if (newW !== width) {
        svgSel.attr('width', newW)
        sim.force('center', d3.forceCenter(newW / 2, heightNum / 2))
        sim.force('x', d3.forceX(newW / 2).strength(0.05))
        sim.alpha(0.1).restart()
      }
    })
    resizeObs.observe(container)

    // Capture D3 selections so the timeline-filter effect can update visibility
    // WITHOUT restarting the simulation (smooth scrubbing).
    nodeSelRef.current = node
    linkSelRef.current = link as unknown as d3.Selection<SVGPathElement, GraphEdge & { source: unknown; target: unknown }, SVGGElement, unknown>
    edgeLabelSelRef.current = edgeLabelGroup as unknown as d3.Selection<SVGGElement, GraphEdge & { source: unknown; target: unknown }, SVGGElement, unknown>

    // Apply the current timeline filter to the freshly-rendered graph so the
    // initial state matches the slider position (e.g. user reloads the page
    // mid-playback).
    applyTimelineFilter(timelineAtRef.current)

    return () => {
      resizeObs.disconnect()
      sim.stop()
      nodeSelRef.current = null
      linkSelRef.current = null
      edgeLabelSelRef.current = null
    }
  }, [data, height, showGrid, colorMode, colorFor])



  // Filter effect — fires on every slider change. Does NOT restart the sim.
  useEffect(() => {
    applyTimelineFilter(timelineAt)
  }, [timelineAt, applyTimelineFilter])

  function zoomBy(factor: number) {
    if (!svgSelRef.current || !zoomRef.current) return
    svgSelRef.current.transition().call(zoomRef.current.scaleBy, factor)
  }

  function resetZoom() {
    if (!svgSelRef.current || !zoomRef.current) return
    svgSelRef.current.transition().call(zoomRef.current.transform, d3.zoomIdentity)
  }

  function toggleSimulation() {
    if (!simulationRef.current) return
    const sim = simulationRef.current
    if (simRunning) {
      sim.stop()
      setSimRunning(false)
    } else {
      sim.alpha(0.3).restart()
      setSimRunning(true)
    }
  }

  // -------- Timeline playback controls --------
  /** Start auto-advancing the slider from start to end over ~10 seconds. */
  function startPlayback() {
    if (!hasTemporal) return
    const start = minTs
    const end = maxTs
    const duration = 10000 // 10 seconds end-to-end
    const t0 = performance.now()
    // If the user is mid-scrub, animate from current position; else from start.
    const fromTs = timelineAt != null ? timelineAt : start
    const span = end - fromTs
    if (span <= 0) {
      // Already at end — rewind to start first.
      setTimelineAt(start)
    }
    setIsPlaying(true)
    const tick = (now: number) => {
      const elapsed = now - t0
      const progress = Math.min(1, elapsed / duration)
      const next = fromTs + span * progress
      setTimelineAt(next)
      if (progress < 1) {
        playbackRafRef.current = requestAnimationFrame(tick)
      } else {
        // Snap to "show all" at the end so all nodes are visible.
        setTimelineAt(null)
        setIsPlaying(false)
        playbackRafRef.current = null
      }
    }
    playbackRafRef.current = requestAnimationFrame(tick)
  }

  function stopPlayback() {
    if (playbackRafRef.current) {
      cancelAnimationFrame(playbackRafRef.current)
      playbackRafRef.current = null
    }
    setIsPlaying(false)
  }

  function rewindTimeline() {
    stopPlayback()
    setTimelineAt(minTs)
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    stopPlayback()
    const v = Number(e.target.value)
    if (v >= maxTs) {
      // At the rightmost end → show all (matches spec: "When slider is at the
      // end (latest date), show all nodes").
      setTimelineAt(null)
    } else {
      setTimelineAt(v)
    }
  }

  // Format a timestamp for the slider labels (date only, no seconds).
  function fmtDate(ts: number): string {
    try {
      const d = new Date(ts)
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  // Slider value (must be a finite number for the input element). When
  // timelineAt is null (show all), use maxTs so the thumb sits at the right.
  const sliderValue = timelineAt != null ? timelineAt : maxTs
  // Count of visible nodes at the current slider position — for the live count.
  const visibleNodeCount =
    timelineAt == null
      ? data.nodes.length
      : data.nodes.filter((n) => !n.createdAt || Date.parse(n.createdAt) <= timelineAt).length
  const visibleEdgeCount =
    timelineAt == null
      ? data.edges.length
      : data.edges.filter((e) => {
          const src = data.nodes.find((n) => n.id === (e.source as unknown as number))
          const tgt = data.nodes.find((n) => n.id === (e.target as unknown as number))
          const sOk = !src?.createdAt || Date.parse(src.createdAt) <= timelineAt
          const tOk = !tgt?.createdAt || Date.parse(tgt.createdAt) <= timelineAt
          return sOk && tOk
        }).length

  // Resolve a community ID to a hex color for use in the selected-node panel.
  function communityColor(id: number): string {
    return (
      communityColorMap().get(id) || COMMUNITY_COLORS[id % COMMUNITY_COLORS.length]
    )
  }

  // Unused-but-stable: avoids the React Compiler warning about identity churn.
  void handleNodeClick

  return (
    <div className="relative bg-background rounded-lg border border-border overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0">
        {data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div>
              <Grid3x3 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No graph data yet. Run the extraction pipeline to populate the knowledge graph.
              </p>
            </div>
          </div>
        ) : (
          <svg ref={svgRef} className="w-full h-full" />
        )}
      </div>

      {/* Controls */}
      {data.nodes.length > 0 && (
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(1.3)}
            className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.3)}
            className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            title="Reset view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleSimulation}
            className={
              'p-1.5 rounded-md border transition-colors ' +
              (simRunning
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground')
            }
            title={simRunning ? 'Pause simulation' : 'Resume simulation'}
          >
            {simRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setShowGrid((s) => !s)}
            className={
              'p-1.5 rounded-md border transition-colors ' +
              (showGrid
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground')
            }
            title="Toggle grid"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          {hasCommunities && (
            <button
              onClick={() => setColorMode((m) => (m === 'community' ? 'type' : 'community'))}
              className={
                'p-1.5 rounded-md border transition-colors ' +
                (colorMode === 'community'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground')
              }
              title={
                colorMode === 'community'
                  ? 'Coloring by community — click to switch to entity type'
                  : 'Coloring by entity type — click to switch to community'
              }
            >
              <Network className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Selected node info panel */}
      {selectedNode && (
        <div className="absolute bottom-3 left-3 right-3 md:right-auto md:w-80 bg-card border border-border rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-lg flex-shrink-0 border flex items-center justify-center"
              style={{
                background: `${colorFor(selectedNode)}20`,
                borderColor: `${colorFor(selectedNode)}40`,
              }}
            >
              <div className="h-4 w-4 rounded-full" style={{ background: colorFor(selectedNode) }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider ansein-mono text-muted-foreground/50">
                {selectedNode.type.replace(/_/g, ' ')}
              </p>
              <p className="text-sm font-medium text-foreground break-all">
                {selectedNode.label}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: selectedNode.color }} />
                  confidence: {(selectedNode.confidence * 100).toFixed(0)}%
                </span>
                {typeof selectedNode.community === 'number' && (
                  <span className="flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: communityColor(selectedNode.community) }}
                    />
                    community #{selectedNode.community}
                  </span>
                )}
                {selectedNode.enrichment && (
                  <span className="text-teal-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                    enriched
                  </span>
                )}
              </div>
              {/* Show connected relationships */}
              {data.edges.filter((e) =>
                e.source === selectedNode.id || e.target === selectedNode.id
              ).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-1.5">
                    Relationships
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {data.edges
                      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                      .map((e, i) => {
                        const targetNode = data.nodes.find((n) =>
                          e.source === selectedNode.id ? n.id === e.target : n.id === e.source
                        )
                        return (
                          <div key={i} className="flex items-center gap-1.5 text-[10px]">
                            <span className="text-muted-foreground/50 ansein-mono">{e.label}</span>
                            <span className="text-muted-foreground/50">→</span>
                            <span className="text-muted-foreground truncate ansein-mono">
                              {targetNode?.label || '?'}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-muted-foreground/50 hover:text-foreground text-xs flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Legend + Stats */}
      {data.nodes.length > 0 && (
        <div className="absolute top-3 left-3 bg-card border border-border rounded-md p-2.5 max-w-[210px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] uppercase tracking-widest ansein-mono text-muted-foreground/50">
              Graph
            </p>
            <div className="flex items-center gap-2 text-[10px] ansein-mono">
              <span className="text-primary">{data.nodes.length} nodes</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-amber-400">{data.edges.length} edges</span>
            </div>
          </div>
          {data.edges.length === 0 && (
            <p className="text-[9px] text-amber-400/70 mb-1.5">
              No relationships detected. Click a node to inspect.
            </p>
          )}
          {/* Communities legend — shown when community data exists */}
          {hasCommunities && data.communities && data.communities.length > 0 && (
            <div className={colorMode === 'community' ? '' : 'opacity-50'}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] uppercase tracking-widest ansein-mono text-muted-foreground/50">
                  Communities
                </p>
                <span className="text-[9px] text-muted-foreground/50 ansein-mono">
                  {data.communities.length} cluster{data.communities.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-y-0.5 text-[10px] mb-2">
                {data.communities.map((c) => (
                  <div key={c.id} className="flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{ background: c.color }}
                    />
                    <span className="text-muted-foreground truncate">cluster #{c.id}</span>
                    <span className="text-muted-foreground/50 ml-auto ansein-mono">{c.size}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[9px] uppercase tracking-widest ansein-mono text-muted-foreground/50 mb-1.5">
            Entity types
          </p>
          <div
            className={
              'grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] ' +
              (colorMode === 'type' ? '' : 'opacity-50')
            }
          >
            {Array.from(new Set(data.nodes.map((n) => n.type))).slice(0, 8).map((t) => {
              const n = data.nodes.find((x) => x.type === t)!
              const count = data.nodes.filter((x) => x.type === t).length
              return (
                <div key={t} className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ background: n.color }}
                  />
                  <span className="text-muted-foreground truncate">{t.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground/50 ml-auto ansein-mono">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4D Timeline Playback Slider */}
      {data.nodes.length > 0 && hasTemporal && (
        <div className="absolute bottom-0 left-0 right-0 bg-card border border-border border-t border-border rounded-none px-4 py-2.5">
          <div className="flex items-center gap-3">
            {/* Playback buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={rewindTimeline}
                className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                title="Rewind to start"
              >
                <Rewind className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={isPlaying ? stopPlayback : startPlayback}
                className={
                  'p-1.5 rounded-md border transition-colors ' +
                  (isPlaying
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90')
                }
                title={isPlaying ? 'Pause playback' : 'Play timeline (~10s)'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Clock icon + start label */}
            <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] ansein-mono text-muted-foreground/50">
              <Clock className="h-3 w-3" />
              <span>{fmtDate(minTs)}</span>
            </div>

            {/* Range slider */}
            <input
              type="range"
              min={minTs}
              max={maxTs}
              step={(maxTs - minTs) / 1000}
              value={sliderValue}
              onChange={handleSliderChange}
              aria-label="Timeline playback"
              className="ansein-timeline-slider flex-1"
            />

            {/* End label + live count */}
            <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] ansein-mono text-muted-foreground/50">
              <span>{fmtDate(maxTs)}</span>
            </div>
          </div>

          {/* Status row: live count + current position */}
          <div className="mt-1.5 flex items-center justify-between text-[9px] uppercase tracking-widest ansein-mono">
            <span className="text-muted-foreground/50">
              <span className="text-primary">{visibleNodeCount}</span>
              <span className="mx-1">/</span>
              <span>{data.nodes.length} nodes</span>
              <span className="mx-2">·</span>
              <span className="text-amber-400">{visibleEdgeCount}</span>
              <span className="mx-1">/</span>
              <span>{data.edges.length} edges</span>
            </span>
            <span className="text-muted-foreground/50">
              {timelineAt == null
                ? 'showing all · drag to scrub'
                : `at ${fmtDate(timelineAt)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
