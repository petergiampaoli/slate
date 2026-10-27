import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom'
import { Maximize2, Minus, Plus, Search, X } from 'lucide-react'
import { useStore } from '../../state/store'
import { dirname } from '../../lib/utils'

interface GraphNode extends SimulationNodeDatum {
  id: string
  title: string
  group: string
  degree: number
  radius: number
  color: string
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

const PALETTE = ['#7c6cf0', '#4aa8d8', '#3fb98f', '#d9a441', '#d9668c', '#9a7bd6', '#4fb0a5', '#c27b4f']

function colorFor(group: string): string {
  let hash = 0
  for (let i = 0; i < group.length; i++) hash = (hash * 31 + group.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export function GraphView({ mode = 'global', seed }: { mode?: 'global' | 'local'; seed?: string }): React.JSX.Element {
  const index = useStore((s) => s.index)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const [, forceTick] = useState(0)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])
  const simRef = useRef<Simulation<GraphNode, GraphLink> | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const tickRef = useRef<number | null>(null)

  const graph = useMemo(() => {
    const allPaths = Object.keys(index.notes)
    let allowed = new Set(allPaths)
    if (mode === 'local' && seed) {
      allowed = new Set([seed])
      let frontier = [seed]
      for (let d = 0; d < 2; d++) {
        const next: string[] = []
        for (const path of frontier) {
          for (const link of index.notes[path]?.links ?? []) {
            if (link.resolved && !allowed.has(link.resolved)) {
              allowed.add(link.resolved)
              next.push(link.resolved)
            }
          }
          for (const backlink of index.backlinks[path] ?? []) {
            if (!allowed.has(backlink.source)) {
              allowed.add(backlink.source)
              next.push(backlink.source)
            }
          }
        }
        frontier = next
      }
      allowed.delete('')
    }

    const degree = new Map<string, number>()
    const edges: { source: string; target: string }[] = []
    const seen = new Set<string>()
    for (const note of Object.values(index.notes)) {
      if (!allowed.has(note.path)) continue
      for (const link of note.links) {
        if (!link.resolved || !allowed.has(link.resolved) || link.resolved === note.path) continue
        const key = [note.path, link.resolved].sort().join('→')
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ source: note.path, target: link.resolved })
        degree.set(note.path, (degree.get(note.path) ?? 0) + 1)
        degree.set(link.resolved, (degree.get(link.resolved) ?? 0) + 1)
      }
    }

    const nodes: GraphNode[] = [...allowed].map((id) => {
      const meta = index.notes[id]
      const group = dirname(id).split('/')[0] || 'root'
      const deg = degree.get(id) ?? 0
      return {
        id,
        title: meta?.title ?? id,
        group,
        degree: deg,
        radius: 4.5 + Math.min(11, Math.sqrt(deg) * 3.4),
        color: colorFor(group)
      }
    })
    return { nodes, edges }
  }, [index, mode, seed])

  /* ----- simulation ----- */
  useEffect(() => {
    const nodes: GraphNode[] = graph.nodes.map((n, i) => ({
      ...n,
      x: Math.cos((i / Math.max(1, graph.nodes.length)) * Math.PI * 2) * 180 + (Math.random() - 0.5) * 40,
      y: Math.sin((i / Math.max(1, graph.nodes.length)) * Math.PI * 2) * 180 + (Math.random() - 0.5) * 40
    }))
    const links: GraphLink[] = graph.edges.map((e) => ({ source: e.source, target: e.target }))
    nodesRef.current = nodes
    linksRef.current = links

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(mode === 'local' ? 80 : 65)
          .strength(0.55)
      )
      .force('charge', forceManyBody().strength(mode === 'local' ? -260 : -170).distanceMax(420))
      .force('center', forceCenter(0, 0).strength(0.06))
      .force('collide', forceCollide<GraphNode>().radius((d) => d.radius + 8))
      .force('x', forceX(0).strength(0.02))
      .force('y', forceY(0).strength(0.02))
      .alphaDecay(0.028)

    sim.on('tick', () => {
      if (tickRef.current) return
      tickRef.current = requestAnimationFrame(() => {
        tickRef.current = null
        forceTick((t) => t + 1)
      })
    })
    simRef.current = sim
    forceTick((t) => t + 1)

    return () => {
      sim.stop()
      if (tickRef.current) cancelAnimationFrame(tickRef.current)
    }
  }, [graph, mode])

  /* ----- zoom behaviour ----- */
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 5])
      .on('zoom', (event) => {
        select(gRef.current).attr('transform', event.transform.toString())
      })
    zoomRef.current = zoomBehavior
    select(svgRef.current).call(zoomBehavior).on('dblclick.zoom', null)
    const rect = svgRef.current.getBoundingClientRect()
    select(svgRef.current).call(
      zoomBehavior.transform,
      zoomIdentity.translate(rect.width / 2, rect.height / 2).scale(1)
    )
    return () => {
      if (svgRef.current) select(svgRef.current).on('.zoom', null)
    }
  }, [])

  /* ----- node dragging (pointer events, zoom-aware) ----- */
  const dragRef = useRef<{ node: GraphNode; dx: number; dy: number } | null>(null)

  const toGraphPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const t = zoomTransform(svg)
    return { x: (clientX - rect.left - t.x) / t.k, y: (clientY - rect.top - t.y) / t.k }
  }

  const onNodePointerDown = (event: React.PointerEvent, node: GraphNode): void => {
    event.stopPropagation()
    event.preventDefault()
    const point = toGraphPoint(event.clientX, event.clientY)
    dragRef.current = { node, dx: (node.x ?? 0) - point.x, dy: (node.y ?? 0) - point.y }
    simRef.current?.alphaTarget(0.2).restart()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    const dragState = dragRef.current
    if (!dragState) return
    const point = toGraphPoint(event.clientX, event.clientY)
    dragState.node.fx = point.x + dragState.dx
    dragState.node.fy = point.y + dragState.dy
    forceTick((t) => t + 1)
  }

  const endDrag = (): void => {
    const dragState = dragRef.current
    if (!dragState) return
    dragState.node.fx = null
    dragState.node.fy = null
    dragRef.current = null
    simRef.current?.alphaTarget(0)
  }

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    select(svgRef.current).transition().duration(180).call(zoomRef.current.scaleBy, factor)
  }, [])

  const fit = useCallback(() => {
    const svg = svgRef.current
    const nodes = nodesRef.current
    if (!svg || !nodes.length) return
    const xs = nodes.map((n) => n.x ?? 0)
    const ys = nodes.map((n) => n.y ?? 0)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const width = svg.clientWidth
    const height = svg.clientHeight
    const scale = Math.min(2.4, 0.86 / Math.max((maxX - minX + 120) / width, (maxY - minY + 120) / height))
    const tx = width / 2 - ((minX + maxX) / 2) * scale
    const ty = height / 2 - ((minY + maxY) / 2) * scale
    select(svg)
      .transition()
      .duration(320)
      .call(zoomRef.current!.transform, zoomIdentity.translate(tx, ty).scale(scale))
  }, [])

  const nodes = nodesRef.current
  const links = linksRef.current
  const highlighted = useMemo(() => {
    if (!hover) return null
    const set = new Set<string>([hover])
    for (const link of links) {
      const s = typeof link.source === 'string' ? link.source : link.source.id
      const t = typeof link.target === 'string' ? link.target : link.target.id
      if (s === hover) set.add(t)
      if (t === hover) set.add(s)
    }
    return set
  }, [hover, links, nodes.length])

  useEffect(() => {
    if (!graph.nodes.length) return
    const timer = window.setTimeout(fit, 650)
    return () => window.clearTimeout(timer)
  }, [graph, fit])

  const open = (node: GraphNode): void => {
    void useStore.getState().openNote(node.id, { history: true })
  }

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <defs>
          <radialGradient id="graph-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="var(--bg-inset)" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#graph-vignette)" />
        <g ref={gRef}>
          <g className="graph-links">
            {links.map((link, i) => {
              const s = link.source as GraphNode
              const t = link.target as GraphNode
              if (typeof s === 'string' || typeof t === 'string') return null
              const activeEdge =
                hover && (s.id === hover || t.id === hover)
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={activeEdge ? 'var(--accent)' : 'var(--border-strong)'}
                  strokeWidth={activeEdge ? 1.6 : 0.9}
                  strokeOpacity={highlighted && !activeEdge ? 0.16 : 0.55}
                />
              )
            })}
          </g>
          <g className="graph-nodes">
            {nodes.map((node) => {
              const dim = highlighted ? !highlighted.has(node.id) : false
              const matched = query.trim() ? node.title.toLowerCase().includes(query.toLowerCase()) : false
              return (
                <g
                  key={node.id}
                  className="graph-node"
                  transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                  style={{ cursor: 'pointer', opacity: dim ? 0.22 : 1 }}
                  onPointerDown={(e) => onNodePointerDown(e, node)}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    open(node)
                  }}
                >
                  {matched && <circle r={node.radius + 6} fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.7} />}
                  <circle
                    r={node.radius}
                    fill={node.color}
                    fillOpacity={0.9}
                    stroke="var(--bg-surface)"
                    strokeWidth={1.4}
                  />
                  <text
                    y={node.radius + 11}
                    textAnchor="middle"
                    fontSize={mode === 'local' ? 10 : 9.5}
                    fill="var(--text-secondary)"
                    style={{ pointerEvents: 'none', fontFamily: 'var(--font-ui)' }}
                    opacity={mode === 'local' || hover === node.id || node.degree > 4 || Boolean(query) || nodes.length < 40 ? 0.95 : 0}
                  >
                    {node.title.length > 26 ? `${node.title.slice(0, 25)}…` : node.title}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
        <div className="search-box" style={{ margin: 0, width: 220, background: 'var(--bg-elevated)' }}>
          <Search size={13} style={{ color: 'var(--text-faint)' }} />
          <input value={query} placeholder="Find a note…" onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => setQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 4 }}>
        <button className="icon-btn" onClick={() => zoomBy(1.35)} title="Zoom in">
          <Plus size={15} />
        </button>
        <button className="icon-btn" onClick={() => zoomBy(0.74)} title="Zoom out">
          <Minus size={15} />
        </button>
        <button className="icon-btn" onClick={fit} title="Fit to view">
          <Maximize2 size={14} />
        </button>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 14,
          fontSize: 11,
          color: 'var(--text-faint)',
          display: 'flex',
          gap: 12
        }}
      >
        <span>
          {nodes.length} node{nodes.length === 1 ? '' : 's'}
        </span>
        <span>
          {links.length} link{links.length === 1 ? '' : 's'}
        </span>
        <span>{mode === 'local' ? 'Local graph · 2 hops' : 'Vault graph'}</span>
      </div>
    </div>
  )
}
