'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { ZoomIn, ZoomOut, Maximize2, Grid3x3, Pause, Play } from 'lucide-react'

interface GraphNode {
  id: number
  label: string
  type: string
  color: string
  icon: string
  confidence: number
  enrichment: boolean
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

interface GraphEdge {
  source: number
  target: number
  label: string
  weight: number
  evidence: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
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
  const simulationRef = useRef<d3.Simulation<GraphNode, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const svgSelRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null)

  // Handle node click — stable callback so D3 doesn't need to rebind
  const handleNodeClick = useCallback((event: MouseEvent, d: GraphNode) => {
    event.stopPropagation()
    setSelectedNode(d)
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

    const edgeLabel = edgeLabelGroup
      .append('text')
      .attr('font-size', 9)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-family', 'var(--font-geist-mono), monospace')
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

    // Node glow (subtle)
    node
      .append('circle')
      .attr('r', (d) => 12 + d.confidence * 10)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', 0.08)
      .attr('stroke', 'none')

    // Node circles
    node
      .append('circle')
      .attr('r', (d) => 8 + d.confidence * 8)
      .attr('fill', (d) => d.color)
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

    // Node hover title
    node
      .append('title')
      .text((d) => `[${d.type}] ${d.label}\nconfidence: ${(d.confidence * 100).toFixed(0)}%${d.enrichment ? '\nenriched: yes' : ''}`)

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
      .attr('font-family', 'var(--font-geist-mono), monospace')
      .text((d) => (d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label))

    // Click handler — use native event listener to avoid D3 interference
    node.on('click', function (event, d) {
      event.stopPropagation()
      setSelectedNode(d)
      // Highlight connected edges
      node.transition().duration(200).attr('opacity', (n) =>
        n.id === d.id || links.some((l) =>
          (l.source as GraphNode).id === d.id && (l.target as GraphNode).id === n.id ||
          (l.target as GraphNode).id === d.id && (l.source as GraphNode).id === n.id
        ) ? 1 : 0.3
      )
      link.transition().duration(200).attr('stroke-opacity', (l) =>
        (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 0.9 : 0.1
      )
      edgeLabelGroup.transition().duration(200).attr('opacity', (l) =>
        (l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id ? 1 : 0.1
      )
    })

    // Background click resets highlight
    svgSel.on('click.reset', () => {
      setSelectedNode(null)
      node.transition().duration(200).attr('opacity', 1)
      link.transition().duration(200).attr('stroke-opacity', 0.6)
      edgeLabelGroup.transition().duration(200).attr('opacity', 0.8)
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

    return () => {
      resizeObs.disconnect()
      sim.stop()
    }
  }, [data, height, showGrid])

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

  return (
    <div className="relative ansein-graph-bg rounded-lg border border-[var(--ansein-border)] overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0">
        {data.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div>
              <Grid3x3 className="h-10 w-10 text-[var(--ansein-text-dim)] mx-auto mb-3" />
              <p className="text-sm text-[var(--ansein-text-muted)]">
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
            className="p-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.3)}
            className="p-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 rounded-md bg-[var(--ansein-surface)] border border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)] hover:border-[var(--ansein-border-strong)] transition-colors"
            title="Reset view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggleSimulation}
            className={
              'p-1.5 rounded-md border transition-colors ' +
              (simRunning
                ? 'bg-[var(--ansein-primary)]/10 border-[var(--ansein-primary)]/30 text-[var(--ansein-primary)]'
                : 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)]')
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
                ? 'bg-[var(--ansein-primary)]/10 border-[var(--ansein-primary)]/30 text-[var(--ansein-primary)]'
                : 'bg-[var(--ansein-surface)] border-[var(--ansein-border)] text-[var(--ansein-text-muted)] hover:text-[var(--ansein-text)]')
            }
            title="Toggle grid"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Selected node info panel */}
      {selectedNode && (
        <div className="absolute bottom-3 left-3 right-3 md:right-auto md:w-80 ansein-card rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-lg flex-shrink-0 border flex items-center justify-center"
              style={{
                background: `${selectedNode.color}20`,
                borderColor: `${selectedNode.color}40`,
              }}
            >
              <div className="h-4 w-4 rounded-full" style={{ background: selectedNode.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider ansein-mono text-[var(--ansein-text-dim)]">
                {selectedNode.type.replace(/_/g, ' ')}
              </p>
              <p className="text-sm font-medium text-[var(--ansein-text)] break-all">
                {selectedNode.label}
              </p>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--ansein-text-muted)]">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: selectedNode.color }} />
                  confidence: {(selectedNode.confidence * 100).toFixed(0)}%
                </span>
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
                <div className="mt-3 pt-3 border-t border-[var(--ansein-border)]">
                  <p className="text-[9px] uppercase tracking-widest text-[var(--ansein-text-dim)] mb-1.5">
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
                            <span className="text-[var(--ansein-text-dim)] ansein-mono">{e.label}</span>
                            <span className="text-[var(--ansein-text-dim)]">→</span>
                            <span className="text-[var(--ansein-text-muted)] truncate ansein-mono">
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
              className="text-[var(--ansein-text-dim)] hover:text-[var(--ansein-text)] text-xs flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Legend + Stats */}
      {data.nodes.length > 0 && (
        <div className="absolute top-3 left-3 ansein-card rounded-md p-2.5 max-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] uppercase tracking-widest ansein-mono text-[var(--ansein-text-dim)]">
              Graph
            </p>
            <div className="flex items-center gap-2 text-[10px] ansein-mono">
              <span className="text-[var(--ansein-primary)]">{data.nodes.length} nodes</span>
              <span className="text-[var(--ansein-text-dim)]">·</span>
              <span className="text-amber-400">{data.edges.length} edges</span>
            </div>
          </div>
          {data.edges.length === 0 && (
            <p className="text-[9px] text-amber-400/70 mb-1.5">
              No relationships detected. Click a node to inspect.
            </p>
          )}
          <p className="text-[9px] uppercase tracking-widest ansein-mono text-[var(--ansein-text-dim)] mb-1.5">
            Entity types
          </p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            {Array.from(new Set(data.nodes.map((n) => n.type))).slice(0, 8).map((t) => {
              const n = data.nodes.find((x) => x.type === t)!
              const count = data.nodes.filter((x) => x.type === t).length
              return (
                <div key={t} className="flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ background: n.color }}
                  />
                  <span className="text-[var(--ansein-text-muted)] truncate">{t.replace(/_/g, ' ')}</span>
                  <span className="text-[var(--ansein-text-dim)] ml-auto ansein-mono">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
