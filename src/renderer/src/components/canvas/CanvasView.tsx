import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  FileText,
  LayoutGrid,
  Maximize2,
  Minus,
  Plus,
  Trash2,
  Type,
  ExternalLink,
  Link2
} from 'lucide-react'
import { api, useStore } from '../../state/store'
import { cn, basename, stripExt, debounce } from '../../lib/utils'
import { useContextMenu } from '../ContextMenu'

type Side = 'top' | 'right' | 'bottom' | 'left'

interface CanvasNode {
  id: string
  type: 'text' | 'file' | 'group' | 'link'
  text?: string
  file?: string
  url?: string
  label?: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

interface CanvasEdge {
  id: string
  fromNode: string
  fromSide?: Side
  toNode: string
  toSide?: Side
  label?: string
  color?: string
}

interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

const EMPTY: CanvasData = { nodes: [], edges: [] }

const COLORS: Record<string, string> = {
  '1': '#e5484d',
  '2': '#f59e0b',
  '3': '#eab308',
  '4': '#12b981',
  '5': '#0ea5e9',
  '6': '#a855f7'
}

export function CanvasView({ path }: { path: string }): React.JSX.Element {
  const [data, setData] = useState<CanvasData>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [connect, setConnect] = useState<{ nodeId: string; side: Side; x: number; y: number } | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
    | { kind: 'node'; id: string; offsetX: number; offsetY: number; moved: boolean }
    | { kind: 'resize'; id: string; startX: number; startY: number; width: number; height: number }
    | null
  >(null)
  const saveRef = useRef<((next: CanvasData) => void) | null>(null)
  const menu = useContextMenu()

  useEffect(() => {
    let alive = true
    void api.fs
      .read(path)
      .then((raw) => {
        if (!alive) return
        try {
          const parsed = JSON.parse(raw) as CanvasData
          setData({ nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] })
        } catch {
          setData(EMPTY)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => {
      alive = false
    }
  }, [path])

  useEffect(() => {
    const save = debounce((next: CanvasData) => {
      void api.fs.write(path, JSON.stringify({ nodes: next.nodes, edges: next.edges }, null, 2))
    }, 450)
    saveRef.current = save
    return () => save.cancel()
  }, [path])

  const commit = useCallback((next: CanvasData) => {
    setData(next)
    saveRef.current?.(next)
  }, [])

  const toCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = hostRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k }
  }

  const updateNode = (id: string, patch: Partial<CanvasNode>, save = false): void => {
    setData((current) => {
      const next = { ...current, nodes: current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }
      if (save) saveRef.current?.(next)
      return next
    })
  }

  const addNode = (type: CanvasNode['type'], at?: { x: number; y: number }): void => {
    const point = at ?? toCanvas(
      (hostRef.current?.getBoundingClientRect().left ?? 0) + 260,
      (hostRef.current?.getBoundingClientRect().top ?? 0) + 180
    )
    const node: CanvasNode = {
      id: `node-${Math.random().toString(36).slice(2, 9)}`,
      type,
      x: Math.round(point.x),
      y: Math.round(point.y),
      width: type === 'group' ? 420 : 260,
      height: type === 'group' ? 280 : type === 'text' ? 130 : 120,
      text: type === 'text' ? '' : undefined,
      label: type === 'group' ? 'Group' : undefined
    }
    commit({ ...data, nodes: [...data.nodes, node] })
    setSelected(node.id)
    if (type === 'text') setEditing(node.id)
  }

  const addFileNode = async (): Promise<void> => {
    const item = await pickNote()
    if (!item) return
    const point = toCanvas(
      (hostRef.current?.getBoundingClientRect().left ?? 0) + 300,
      (hostRef.current?.getBoundingClientRect().top ?? 0) + 220
    )
    const node: CanvasNode = {
      id: `node-${Math.random().toString(36).slice(2, 9)}`,
      type: 'file',
      file: item,
      x: Math.round(point.x),
      y: Math.round(point.y),
      width: 300,
      height: weatherHeight(item)
    }
    commit({ ...data, nodes: [...data.nodes, node] })
    setSelected(node.id)
  }

  const deleteSelected = (): void => {
    if (selected) {
      commit({
        nodes: data.nodes.filter((n) => n.id !== selected),
        edges: data.edges.filter((e) => e.fromNode !== selected && e.toNode !== selected)
      })
      setSelected(null)
    } else if (selectedEdge) {
      commit({ ...data, edges: data.edges.filter((e) => e.id !== selectedEdge) })
      setSelectedEdge(null)
    }
  }

  /* ---------- pointer interactions ---------- */

  const onBackgroundPointerDown = (event: React.PointerEvent): void => {
    if (event.button !== 0) return
    setSelected(null)
    setSelectedEdge(null)
    dragRef.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const onNodePointerDown = (event: React.PointerEvent, node: CanvasNode): void => {
    event.stopPropagation()
    setSelected(node.id)
    setSelectedEdge(null)
    const point = toCanvas(event.clientX, event.clientY)
    dragRef.current = {
      kind: 'node',
      id: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      moved: false
    }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const onResizePointerDown = (event: React.PointerEvent, node: CanvasNode): void => {
    event.stopPropagation()
    event.preventDefault()
    dragRef.current = {
      kind: 'resize',
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      width: node.width,
      height: node.height
    }
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    if (connect) {
      const point = toCanvas(event.clientX, event.clientY)
      setConnect({ ...connect, x: point.x, y: point.y })
      return
    }
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      setView({
        ...view,
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY)
      })
    } else if (drag.kind === 'node') {
      const point = toCanvas(event.clientX, event.clientY)
      drag.moved = true
      updateNode(drag.id, { x: Math.round(point.x - drag.offsetX), y: Math.round(point.y - drag.offsetY) })
    } else if (drag.kind === 'resize') {
      const dx = (event.clientX - drag.startX) / view.k
      const dy = (event.clientY - drag.startY) / view.k
      updateNode(drag.id, {
        width: Math.max(140, Math.round(drag.width + dx)),
        height: Math.max(70, Math.round(drag.height + dy))
      })
    }
  }

  const endPointer = (): void => {
    const drag = dragRef.current
    if (drag && drag.kind === 'node' && drag.moved) {
      saveRef.current?.(data)
    } else if (drag && drag.kind === 'resize') {
      saveRef.current?.(data)
    }
    dragRef.current = null
  }

  const onWheel = (event: React.WheelEvent): void => {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      const rect = hostRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top
      const nextK = Math.min(2.4, Math.max(0.22, view.k * (event.deltaY < 0 ? 1.09 : 0.92)))
      const ratio = nextK / view.k
      setView({ k: nextK, x: mx - (mx - view.x) * ratio, y: my - (my - view.y) * ratio })
    } else {
      setView({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY })
    }
  }

  const startConnect = (event: React.PointerEvent, nodeId: string, side: Side): void => {
    event.stopPropagation()
    event.preventDefault()
    const point = toCanvas(event.clientX, event.clientY)
    setConnect({ nodeId, side, x: point.x, y: point.y })
  }

  const finishConnect = (node: CanvasNode): void => {
    if (!connect || connect.nodeId === node.id) {
      setConnect(null)
      return
    }
    const edge: CanvasEdge = {
      id: `edge-${Math.random().toString(36).slice(2, 9)}`,
      fromNode: connect.nodeId,
      fromSide: connect.side,
      toNode: node.id,
      toSide: opposite(connect.side)
    }
    commit({ ...data, edges: [...data.edges, edge] })
    setConnect(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelected()
      }
      if (event.key === 'Escape') {
        setConnect(null)
        setSelected(null)
        setSelectedEdge(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const fit = (): void => {
    if (!data.nodes.length) return
    const rect = hostRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...data.nodes.map((n) => n.x))
    const maxX = Math.max(...data.nodes.map((n) => n.x + n.width))
    const minY = Math.min(...data.nodes.map((n) => n.y))
    const maxY = Math.max(...data.nodes.map((n) => n.y + n.height))
    const pad = 80
    const k = Math.min(1.4, Math.min((rect.width - pad) / (maxX - minX), (rect.height - pad) / (maxY - minY)))
    setView({
      k: Math.max(0.25, k),
      x: (rect.width - (maxX - minX) * k) / 2 - minX * k,
      y: (rect.height - (maxY - minY) * k) / 2 - minY * k
    })
  }

  useEffect(() => {
    if (loaded && data.nodes.length) {
      const timer = window.setTimeout(fit, 60)
      return () => window.clearTimeout(timer)
    }
  }, [loaded])

  const nodeMap = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes])

  if (!loaded) return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><div className="spinner" /></div>

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="pane-header">
        <div className="breadcrumb">
          <LayoutGrid size={12} />
          <span className="crumb current">{stripExt(basename(path))}</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>
            {data.nodes.length} cards · {data.edges.length} connections
          </span>
        </div>
        <div className="sidebar-actions" style={{ opacity: 1 }}>
          <button className="icon-btn" title="Add text card" onClick={() => addNode('text')}>
            <Type size={15} />
          </button>
          <button className="icon-btn" title="Add note card" onClick={() => void addFileNode()}>
            <FileText size={15} />
          </button>
          <button className="icon-btn" title="Add group" onClick={() => addNode('group')}>
            <Plus size={15} />
          </button>
          <button className="icon-btn" title="Delete selected" onClick={deleteSelected} disabled={!selected && !selectedEdge}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div
        ref={hostRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: dragRef.current?.kind === 'pan' ? 'grabbing' : 'default' }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        onWheel={onWheel}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) addNode('text', toCanvas(e.clientX, e.clientY))
        }}
        onContextMenu={(e) =>
          menu.open(e, [
            { label: 'Add text card', icon: Type, onSelect: () => addNode('text', toCanvas(e.clientX, e.clientY)) },
            { label: 'Add note card', icon: FileText, onSelect: () => void addFileNode() },
            { label: 'Add group', onSelect: () => addNode('group', toCanvas(e.clientX, e.clientY)) },
            { separator: true },
            { label: 'Fit to view', icon: Maximize2, onSelect: fit },
            { label: 'Reset zoom', onSelect: () => setView({ x: 0, y: 0, k: 1 }) }
          ])
        }
      >
        <div
          style={{
            position: 'absolute',
            transformOrigin: '0 0',
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            inset: 0
          }}
        >
          <svg
            style={{ position: 'absolute', left: -4000, top: -4000, width: 8000, height: 8000, overflow: 'visible', pointerEvents: 'none' }}
          >
            <defs>
              <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
              </marker>
            </defs>
            <g transform="translate(4000,4000)">
              {data.edges.map((edge) => {
                const from = nodeMap.get(edge.fromNode)
                const to = nodeMap.get(edge.toNode)
                if (!from || !to) return null
                const a = anchorPoint(from, edge.fromSide ?? 'right')
                const b = anchorPoint(to, edge.toSide ?? 'left')
                const path = bezier(a, b)
                return (
                  <g key={edge.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        setSelectedEdge(edge.id)
                        setSelected(null)
                      }}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={selectedEdge === edge.id ? 'var(--accent)' : 'var(--text-faint)'}
                      strokeWidth={selectedEdge === edge.id ? 2.4 : 1.6}
                      markerEnd="url(#canvas-arrow)"
                    />
                    {edge.label && (
                      <text
                        x={(a.x + b.x) / 2}
                        y={(a.y + b.y) / 2 - 6}
                        fontSize={11}
                        textAnchor="middle"
                        fill="var(--text-muted)"
                      >
                        {edge.label}
                      </text>
                    )}
                  </g>
                )
              })}
              {connect && (() => {
                const from = nodeMap.get(connect.nodeId)
                if (!from) return null
                const a = anchorPoint(from, connect.side)
                return (
                  <path
                    d={bezier(a, { x: connect.x, y: connect.y })}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    markerEnd="url(#canvas-arrow)"
                  />
                )
              })()}
            </g>
          </svg>

          {data.nodes.map((node) => (
            <CanvasCard
              key={node.id}
              node={node}
              selected={selected === node.id}
              editing={editing === node.id}
              onPointerDown={(e) => onNodePointerDown(e, node)}
              onPointerUp={() => finishConnect(node)}
              onResize={(e) => onResizePointerDown(e, node)}
              onDoubleClick={() => node.type === 'text' || node.type === 'group' ? setEditing(node.id) : openFile(node)}
              onStartConnect={(e, side) => startConnect(e, node.id, side)}
              onContextMenu={(e) => {
                e.stopPropagation()
                setSelected(node.id)
                menu.open(e, [
                  ...(node.type === 'text' || node.type === 'group'
                    ? [{ label: 'Edit text', icon: Type, onSelect: () => setEditing(node.id) }]
                    : []),
                  ...(node.type === 'file'
                    ? [{ label: 'Open note', icon: ExternalLink, onSelect: () => openFile(node) }]
                    : []),
                  { heading: 'Colour' },
                  ...Object.entries(COLORS).map(([key, color]) => ({
                    label: key,
                    onSelect: () => updateNode(node.id, { color: key }, true),
                    icon: undefined,
                    danger: false
                  })),
                  { label: 'No colour', onSelect: () => updateNode(node.id, { color: undefined }, true) },
                  { separator: true },
                  {
                    label: 'Delete card',
                    icon: Trash2,
                    danger: true,
                    onSelect: () => {
                      commit({
                        nodes: data.nodes.filter((n) => n.id !== node.id),
                        edges: data.edges.filter((e) => e.fromNode !== node.id && e.toNode !== node.id)
                      })
                      setSelected(null)
                    }
                  }
                ])
              }}
              onEditDone={(text) => {
                updateNode(node.id, node.type === 'group' ? { label: text } : { text }, true)
                setEditing(null)
              }}
            />
          ))}
        </div>

        <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button className="icon-btn" onClick={() => setView({ ...view, k: Math.min(2.4, view.k * 1.15) })}>
            <Plus size={14} />
          </button>
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', minWidth: 34, textAlign: 'center', alignSelf: 'center' }}>
            {Math.round(view.k * 100)}%
          </span>
          <button className="icon-btn" onClick={() => setView({ ...view, k: Math.max(0.22, view.k * 0.87) })}>
            <Minus size={14} />
          </button>
          <button className="icon-btn" onClick={fit} title="Fit to view">
            <Maximize2 size={13} />
          </button>
        </div>

        {data.nodes.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
              color: 'var(--text-faint)',
              fontSize: 12.5,
              textAlign: 'center',
              lineHeight: 1.8
            }}
          >
            <div>
              <LayoutGrid size={30} style={{ opacity: 0.35, marginBottom: 10 }} />
              <div>Double-click anywhere to add a card</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Drag from a card’s edge handle to connect two notes</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CanvasCard({
  node,
  selected,
  editing,
  onPointerDown,
  onPointerUp,
  onResize,
  onDoubleClick,
  onStartConnect,
  onContextMenu,
  onEditDone
}: {
  node: CanvasNode
  selected: boolean
  editing: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onResize: (e: React.PointerEvent) => void
  onDoubleClick: () => void
  onStartConnect: (e: React.PointerEvent, side: Side) => void
  onContextMenu: (e: React.MouseEvent) => void
  onEditDone: (text: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(node.type === 'group' ? node.label ?? '' : node.text ?? '')
  const index = useStore((s) => s.index)
  const accent = node.color ? COLORS[node.color] : undefined

  useEffect(() => {
    setDraft(node.type === 'group' ? node.label ?? '' : node.text ?? '')
  }, [editing, node.label, node.text, node.type])

  const fileTitle = node.file ? index.notes[node.file]?.title ?? stripExt(basename(node.file)) : ''
  const excerpt = node.file ? index.notes[node.file]?.excerpt ?? '' : ''

  return (
    <div
      className={cn('canvas-card', selected && 'selected', node.type === 'group' && 'is-group')}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        borderColor: accent ?? undefined,
        background: node.type === 'group' ? 'transparent' : accent ? `color-mix(in srgb, ${accent} 10%, var(--bg-elevated))` : undefined
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick()
      }}
      onContextMenu={onContextMenu}
    >
      {node.type === 'group' && (
        <div className="canvas-group-label" style={{ color: accent }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => onEditDone(draft)}
              onKeyDown={(e) => e.key === 'Enter' && onEditDone(draft)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            node.label || 'Group'
          )}
        </div>
      )}

      {node.type === 'file' && (
        <div className="canvas-file-card">
          <div className="canvas-file-title">
            <FileText size={13} /> {fileTitle}
          </div>
          <div className="canvas-file-excerpt">{excerpt || 'Empty note'}</div>
          <div className="canvas-file-path">{node.file}</div>
        </div>
      )}

      {node.type === 'link' && (
        <div className="canvas-file-card">
          <div className="canvas-file-title">
            <Link2 size={13} /> {node.url}
          </div>
        </div>
      )}

      {node.type === 'text' &&
        (editing ? (
          <textarea
            autoFocus
            className="canvas-text-edit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onEditDone(draft)}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Type something…"
          />
        ) : (
          <div className="canvas-text">
            {node.text ? (
              node.text.split('\n').map((line, i) => <div key={i}>{line || '\u00a0'}</div>)
            ) : (
              <span style={{ color: 'var(--text-faint)' }}>Double-click to edit</span>
            )}
          </div>
        ))}

      {selected && (
        <>
          {(['top', 'right', 'bottom', 'left'] as Side[]).map((side) => (
            <span
              key={side}
              className={`canvas-handle handle-${side}`}
              onPointerDown={(e) => onStartConnect(e, side)}
              title="Drag to connect"
            />
          ))}
          <span className="canvas-resize" onPointerDown={onResize} />
          <span className="canvas-arrow-badge">
            <ArrowRight size={10} />
          </span>
        </>
      )}
    </div>
  )
}

function anchorPoint(node: CanvasNode, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y }
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height }
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 }
    default:
      return { x: node.x + node.width, y: node.y + node.height / 2 }
  }
}

function opposite(side: Side): Side {
  return side === 'left' ? 'right' : side === 'right' ? 'left' : side === 'top' ? 'bottom' : 'top'
}

function bezier(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(50, Math.abs(b.x - a.x) * 0.45)
  const dy = Math.max(50, Math.abs(b.y - a.y) * 0.45)
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const c1 = horizontal ? { x: a.x + (b.x > a.x ? dx : -dx), y: a.y } : { x: a.x, y: a.y + (b.y > a.y ? dy : -dy) }
  const c2 = horizontal ? { x: b.x - (b.x > a.x ? dx : -dx), y: b.y } : { x: b.x, y: b.y - (b.y > a.y ? dy : -dy) }
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

async function pickNote(): Promise<string | null> {
  return new Promise((resolve) => {
    const state = useStore.getState()
    const notes = Object.keys(state.index.notes)
    if (!notes.length) {
      resolve(null)
      return
    }
    state.showModal({
      type: 'prompt',
      title: 'Add note card',
      label: 'Type the vault path of a note, e.g. Projects/Slate.md',
      value: notes[0],
      placeholder: 'Note path',
      submitLabel: 'Add card',
      onSubmit: (value) => {
        state.hideModal()
        const found = notes.find((n) => n.toLowerCase() === value.toLowerCase()) ??
          notes.find((n) => n.toLowerCase().includes(value.toLowerCase()))
        resolve(found ?? null)
      }
    })
    window.setTimeout(() => {
      const modal = useStore.getState().modal
      if (modal && modal.type === 'prompt') resolve(null)
    }, 60000)
  })
}

function weatherHeight(path: string): number {
  const note = useStore.getState().index.notes[path]
  if (!note) return 160
  return Math.max(140, Math.min(360, 90 + Math.min(270, note.words / 3)))
}

function openFile(node: CanvasNode): void {
  if (node.type === 'file' && node.file) void useStore.getState().openNote(node.file, { history: true })
  if (node.type === 'link' && node.url) void api.shell.openExternal(node.url)
}
