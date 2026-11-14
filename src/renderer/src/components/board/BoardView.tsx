import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng, toSvg } from 'html-to-image'
import {
  AlignLeft,
  ArrowUpRight,
  Cable,
  Circle,
  Copy,
  Download,
  FileText,
  Grid3x3,
  Magnet,
  Maximize,
  MousePointer2,
  PanelRight,
  Plus,
  Redo2,
  Search,
  Square,
  StickyNote,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { BoardDoc, BoardEdge, BoardNode, BoardShape, BoardStyle, BoardStylePreset, Box, ShapeKind } from '../../lib/board'
import {
  STACK_GAP,
  anchorFor,
  boardBounds,
  defaultStyle,
  emptyBoard,
  layoutStack,
  makePreset,
  newEdge,
  newNote,
  newShape,
  nodeBox,
  normaliseBoard,
  overlap,
  pointInBox,
  shapeBox,
  stackMembers,
  toOpml,
  toPlainText
} from '../../lib/board'
import { api, useStore } from '../../state/store'
import { assetUrl, basename, cn, isImage, stripExt, uid } from '../../lib/utils'
import { BoardInspector } from './BoardInspector'
import { useContextMenu, type MenuItem } from '../ContextMenu'

type Tool = 'select' | 'connect'

type DragState =
  | { kind: 'pan'; start: { x: number; y: number }; origin: { x: number; y: number } }
  | { kind: 'marquee'; start: { x: number; y: number }; additive: boolean; base: Set<string> }
  | {
      kind: 'move'
      start: { x: number; y: number }
      nodes: Map<string, { x: number; y: number }>
      shapes: Map<string, Box>
      anchorId: string | null
      snapshot: BoardDoc
      moved: boolean
    }
  | {
      kind: 'resize-node'
      id: string
      start: { x: number; y: number }
      width: number
      height: number
      autoHeight: boolean
      snapshot: BoardDoc
      moved: boolean
    }
  | {
      kind: 'resize-shape'
      id: string
      handle: string
      start: { x: number; y: number }
      box: Box
      snapshot: BoardDoc
      moved: boolean
    }

interface EdgeEditor {
  id: string
  x: number
  y: number
  value: string
}

export function BoardView({ path }: { path: string }): React.JSX.Element {
  const attachments = useStore((s) => s.settings.attachmentsFolder)
  const [board, setBoard] = useState<BoardDoc | null>(null)
  const boardRef = useRef<BoardDoc | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const viewRef = useRef(view)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const selectionRef = useRef(selection)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const selectedEdgeRef = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [editingNode, setEditingNode] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditor | null>(null)
  const [connect, setConnect] = useState<{ from: string; x: number; y: number } | null>(null)
  const connectRef = useRef<{ from: string; x: number; y: number } | null>(null)
  const [marquee, setMarquee] = useState<Box | null>(null)
  const [inspector, setInspector] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const spaceRef = useRef(false)
  const clipboardRef = useRef<{ nodes: BoardNode[]; shapes: BoardShape[]; edges: BoardEdge[] } | null>(null)
  const historyRef = useRef<{ past: BoardDoc[]; future: BoardDoc[] }>({ past: [], future: [] })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedRef = useRef(false)
  const dirtyRef = useRef(false)
  const versionRef = useRef(0)
  const draftRef = useRef('')
  const editingRef = useRef<string | null>(null)
  const menu = useContextMenu()

  useEffect(() => {
    viewRef.current = view
  }, [view])
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  useEffect(() => {
    selectedEdgeRef.current = selectedEdge
  }, [selectedEdge])
  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    editingRef.current = editingNode
  }, [editingNode])

  const clone = (doc: BoardDoc): BoardDoc => JSON.parse(JSON.stringify(doc)) as BoardDoc

  const pushHistory = useCallback((snapshot: BoardDoc) => {
    const history = historyRef.current
    history.past.push(snapshot)
    if (history.past.length > 80) history.past.shift()
    history.future = []
  }, [])

  const apply = useCallback(
    (next: BoardDoc, record = true) => {
      if (record && boardRef.current) pushHistory(clone(boardRef.current))
      boardRef.current = next
      dirtyRef.current = true
      versionRef.current++
      setBoard(next)
    },
    [pushHistory]
  )

  const fit = useCallback((doc?: BoardDoc, bounds?: Box) => {
    const host = hostRef.current
    const current = doc ?? boardRef.current
    if (!host || !current) return
    const rect = host.getBoundingClientRect()
    const box = bounds ?? boardBounds(current.nodes, current.shapes)
    const zoom = Math.min(2, Math.max(0.15, Math.min((rect.width - 120) / box.width, (rect.height - 120) / box.height)))
    const next = {
      zoom,
      x: rect.width / 2 - (box.x + box.width / 2) * zoom,
      y: rect.height / 2 - (box.y + box.height / 2) * zoom
    }
    viewRef.current = next
    setView(next)
  }, [])

  /* ---------- load / save ---------- */

  useEffect(() => {
    let alive = true
    setLoaded(false)
    loadedRef.current = false
    historyRef.current = { past: [], future: [] }
    setSelection(new Set())
    setSelectedEdge(null)
    void api.fs
      .read(path)
      .then((raw) => {
        if (!alive) return
        let doc: BoardDoc
        try {
          doc = normaliseBoard(JSON.parse(raw))
        } catch {
          doc = emptyBoard()
        }
        boardRef.current = doc
        setBoard(doc)
        setView(doc.view)
        viewRef.current = doc.view
        setLoaded(true)
        loadedRef.current = true
        dirtyRef.current = false
        requestAnimationFrame(() => fit(doc))
      })
      .catch(() => {
        if (!alive) return
        const doc = emptyBoard()
        boardRef.current = doc
        setBoard(doc)
        setLoaded(true)
        loadedRef.current = true
        dirtyRef.current = false
      })
    return () => {
      alive = false
    }
  }, [path, fit])

  useEffect(() => {
    if (!loaded || !board || !dirtyRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const version = versionRef.current
    saveTimer.current = setTimeout(() => {
      void api.fs
        .write(path, JSON.stringify({ ...board, view }, null, 2))
        .then(() => {
          if (versionRef.current === version) dirtyRef.current = false
        })
        .catch(() => {
          useStore.getState().toast('Could not save the board', 'error')
        })
    }, 450)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [board, view, loaded, path])

  useEffect(() => {
    return () => {
      let current = boardRef.current
      if (current && editingRef.current) {
        const node = current.nodes.find((n) => n.id === editingRef.current)
        if (node && draftRef.current !== (node.text ?? '')) {
          current = {
            ...current,
            nodes: current.nodes.map((n) => (n.id === node.id ? { ...n, text: draftRef.current } : n))
          }
          boardRef.current = current
          dirtyRef.current = true
        }
      }
      if (!dirtyRef.current || !current) return
      void api.fs.write(path, JSON.stringify({ ...current, view: viewRef.current }, null, 2))
    }
  }, [path])

  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => fit(), 60)
    return () => clearTimeout(timer)
  }, [loaded, fit])

  const point = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const host = hostRef.current
    const v = viewRef.current
    if (!host) return { x: 0, y: 0 }
    const rect = host.getBoundingClientRect()
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom }
  }, [])

  const snap = useCallback((value: number): number => {
    const grid = boardRef.current?.grid
    return grid?.snap ? Math.round(value / grid.size) * grid.size : Math.round(value)
  }, [])

  const hitTargetAt = useCallback((p: { x: number; y: number }, exclude?: string): { id: string; kind: 'node' | 'shape' } | null => {
    const current = boardRef.current
    if (!current) return null
    const nodes = [...current.nodes].sort((a, b) => b.z - a.z)
    for (const node of nodes) {
      if (node.id !== exclude && pointInBox(p.x, p.y, nodeBox(node))) return { id: node.id, kind: 'node' }
    }
    const shapes = [...current.shapes].sort((a, b) => b.z - a.z)
    for (const shape of shapes) {
      if (shape.id !== exclude && pointInBox(p.x, p.y, shapeBox(shape))) return { id: shape.id, kind: 'shape' }
    }
    return null
  }, [])

  /* ---------- editing ---------- */

  const addNote = useCallback(
    (p: { x: number; y: number }): void => {
      const current = boardRef.current
      if (!current) return
      const node = newNote(snap(p.x - 120), snap(p.y - 32))
      apply({ ...current, nodes: [...current.nodes, node] })
      setSelection(new Set([node.id]))
      setSelectedEdge(null)
      setEditingNode(node.id)
      setDraft('')
    },
    [apply, snap]
  )

  const addShape = useCallback(
    (kind: ShapeKind): void => {
      const current = boardRef.current
      const host = hostRef.current
      if (!current || !host) return
      const rect = host.getBoundingClientRect()
      const center = point(rect.left + rect.width / 2, rect.top + rect.height / 2)
      const shape = newShape(snap(center.x - 180), snap(center.y - 120), kind)
      apply({ ...current, shapes: [...current.shapes, shape] })
      setSelection(new Set([shape.id]))
      setSelectedEdge(null)
    },
    [apply, point, snap]
  )

  const commitNodeEdit = useCallback((): void => {
    if (!editingNode) return
    const current = boardRef.current
    if (!current) return
    const target = current.nodes.find((n) => n.id === editingNode)
    if (!target) {
      setEditingNode(null)
      return
    }
    if (draft === (target.text ?? '')) {
      setEditingNode(null)
      return
    }
    let nodes = current.nodes.map((node) => (node.id === editingNode ? { ...node, text: draft } : node))
    if (target.stackId) nodes = layoutStack(nodes, target.stackId)
    apply({ ...current, nodes })
    setEditingNode(null)
  }, [apply, draft, editingNode])

  const startEditing = (node: BoardNode): void => {
    if (node.type !== 'note') return
    setEditingNode(node.id)
    setDraft(node.text ?? '')
  }

  /* ---------- selection / drag ---------- */

  const startMove = (event: React.PointerEvent, ids: Set<string>, anchorId: string | null): void => {
    const current = boardRef.current
    const host = hostRef.current
    if (!current || !host) return
    const nodeIds = new Set<string>()
    const shapeIds = new Set<string>()
    for (const id of ids) {
      const node = current.nodes.find((n) => n.id === id)
      if (node) {
        nodeIds.add(node.id)
        if (node.stackId) for (const member of stackMembers(current.nodes, node.stackId)) nodeIds.add(member.id)
      }
      if (current.shapes.some((s) => s.id === id)) shapeIds.add(id)
    }
    for (const shape of current.shapes) {
      if (!shapeIds.has(shape.id) || !shape.magnetic) continue
      for (const node of current.nodes) {
        if (overlap(shapeBox(shape), nodeBox(node))) nodeIds.add(node.id)
      }
    }
    const nodes = new Map<string, { x: number; y: number }>()
    for (const id of nodeIds) {
      const node = current.nodes.find((n) => n.id === id)
      if (node) nodes.set(id, { x: node.x, y: node.y })
    }
    const shapes = new Map<string, Box>()
    for (const id of shapeIds) {
      const shape = current.shapes.find((s) => s.id === id)
      if (shape) shapes.set(id, shapeBox(shape))
    }
    dragRef.current = {
      kind: 'move',
      start: point(event.clientX, event.clientY),
      nodes,
      shapes,
      anchorId,
      snapshot: clone(current),
      moved: false
    }
    host.setPointerCapture(event.pointerId)
  }

  const onNodePointerDown = (event: React.PointerEvent, node: BoardNode): void => {
    event.stopPropagation()
    if (event.button !== 0) return
    if (tool === 'connect' || event.metaKey) {
      startConnect(event, node.id)
      return
    }
    if (editingNode) commitNodeEdit()
    let next = new Set(selectionRef.current)
    if (event.shiftKey) {
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
    } else if (!next.has(node.id)) {
      next = new Set([node.id])
    }
    setSelection(next)
    setSelectedEdge(null)
    if (next.has(node.id)) startMove(event, next, node.id)
  }

  const onShapePointerDown = (event: React.PointerEvent, shape: BoardShape): void => {
    event.stopPropagation()
    if (event.button !== 0) return
    if (tool === 'connect') {
      startConnect(event, shape.id)
      return
    }
    let next = new Set(selectionRef.current)
    if (event.shiftKey) {
      if (next.has(shape.id)) next.delete(shape.id)
      else next.add(shape.id)
    } else if (!next.has(shape.id)) {
      next = new Set([shape.id])
    }
    setSelection(next)
    setSelectedEdge(null)
    if (next.has(shape.id)) startMove(event, next, shape.id)
  }

  const startConnect = (event: React.PointerEvent, from: string): void => {
    const host = hostRef.current
    if (!host) return
    event.stopPropagation()
    const p = point(event.clientX, event.clientY)
    connectRef.current = { from, x: p.x, y: p.y }
    setConnect(connectRef.current)
    host.setPointerCapture(event.pointerId)
  }

  const onHostPointerDown = (event: React.PointerEvent): void => {
    if (event.button === 1 || spaceRef.current) {
      event.preventDefault()
      dragRef.current = {
        kind: 'pan',
        start: { x: event.clientX, y: event.clientY },
        origin: { x: viewRef.current.x, y: viewRef.current.y }
      }
      hostRef.current?.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) return
    if (editingNode) commitNodeEdit()
    const p = point(event.clientX, event.clientY)
    if (!event.shiftKey) {
      setSelection(new Set())
      setSelectedEdge(null)
    }
    dragRef.current = {
      kind: 'marquee',
      start: p,
      additive: event.shiftKey,
      base: event.shiftKey ? new Set(selectionRef.current) : new Set()
    }
    setMarquee({ x: p.x, y: p.y, width: 0, height: 0 })
    hostRef.current?.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    if (connectRef.current) {
      const p = point(event.clientX, event.clientY)
      connectRef.current = { ...connectRef.current, x: p.x, y: p.y }
      setConnect(connectRef.current)
      return
    }
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      const next = {
        ...viewRef.current,
        x: drag.origin.x + (event.clientX - drag.start.x),
        y: drag.origin.y + (event.clientY - drag.start.y)
      }
      viewRef.current = next
      setView(next)
      return
    }
    if (drag.kind === 'marquee') {
      const p = point(event.clientX, event.clientY)
      setMarquee({
        x: Math.min(drag.start.x, p.x),
        y: Math.min(drag.start.y, p.y),
        width: Math.abs(p.x - drag.start.x),
        height: Math.abs(p.y - drag.start.y)
      })
      return
    }
    if (drag.kind === 'move') {
      const p = point(event.clientX, event.clientY)
      let dx = p.x - drag.start.x
      let dy = p.y - drag.start.y
      if (boardRef.current?.grid.snap && drag.anchorId) {
        const anchor = drag.nodes.get(drag.anchorId)
        if (anchor) {
          dx = snap(anchor.x + dx) - anchor.x
          dy = snap(anchor.y + dy) - anchor.y
        }
      }
      if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      if (!drag.moved) {
        pushHistory(drag.snapshot)
        drag.moved = true
      }
      const current = boardRef.current
      if (!current) return
      const nodes = current.nodes.map((node) => {
        const origin = drag.nodes.get(node.id)
        return origin ? { ...node, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) } : node
      })
      const shapes = current.shapes.map((shape) => {
        const origin = drag.shapes.get(shape.id)
        return origin ? { ...shape, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) } : shape
      })
      const next = { ...current, nodes, shapes }
      boardRef.current = next
      setBoard(next)
      return
    }
    if (drag.kind === 'resize-node') {
      const p = point(event.clientX, event.clientY)
      const dx = p.x - drag.start.x
      const dy = p.y - drag.start.y
      if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      if (!drag.moved) {
        pushHistory(drag.snapshot)
        drag.moved = true
      }
      const width = Math.max(120, snap(drag.width + dx))
      const height = drag.autoHeight ? drag.height : Math.max(40, snap(drag.height + dy))
      const current = boardRef.current
      if (!current) return
      const next = {
        ...current,
        nodes: current.nodes.map((node) => (node.id === drag.id ? { ...node, width, height } : node))
      }
      boardRef.current = next
      setBoard(next)
      return
    }
    if (drag.kind === 'resize-shape') {
      const p = point(event.clientX, event.clientY)
      const dx = p.x - drag.start.x
      const dy = p.y - drag.start.y
      if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
      if (!drag.moved) {
        pushHistory(drag.snapshot)
        drag.moved = true
      }
      let { x, y, width, height } = drag.box
      if (drag.handle.includes('e')) width = snap(width + dx)
      if (drag.handle.includes('s')) height = snap(height + dy)
      if (drag.handle.includes('w')) {
        x = snap(x + dx)
        width = drag.box.width - (x - drag.box.x)
      }
      if (drag.handle.includes('n')) {
        y = snap(y + dy)
        height = drag.box.height - (y - drag.box.y)
      }
      width = Math.max(80, width)
      height = Math.max(60, height)
      const current = boardRef.current
      if (!current) return
      const next = {
        ...current,
        shapes: current.shapes.map((shape) => (shape.id === drag.id ? { ...shape, x, y, width, height } : shape))
      }
      boardRef.current = next
      setBoard(next)
    }
  }

  const onPointerUp = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (connectRef.current) {
      const active = connectRef.current
      const p = point(event.clientX, event.clientY)
      const target = hitTargetAt(p, active.from)
      if (target) {
        const current = boardRef.current
        if (current) {
          const exists = current.edges.some(
            (edge) =>
              (edge.from === active.from && edge.to === target.id) ||
              (edge.from === target.id && edge.to === active.from)
          )
          if (!exists) {
            const edge = newEdge(active.from, target.id)
            apply({ ...current, edges: [...current.edges, edge] })
            setSelectedEdge(edge.id)
            setSelection(new Set())
          }
        }
      }
      connectRef.current = null
      setConnect(null)
      dragRef.current = null
      return
    }
    if (drag?.kind === 'move' && !drag.moved && drag.anchorId && !event.shiftKey) {
      setSelection(new Set([drag.anchorId]))
    }
    if (drag?.kind === 'marquee') {
      const box = marquee
      if (box) {
        const current = boardRef.current
        if (current) {
          const next = new Set(drag.additive ? drag.base : [])
          for (const node of current.nodes) if (overlap(box, nodeBox(node))) next.add(node.id)
          for (const shape of current.shapes) if (overlap(box, shapeBox(shape))) next.add(shape.id)
          setSelection(next)
        }
      }
      setMarquee(null)
    }
    dragRef.current = null
  }

  const startNodeResize = (event: React.PointerEvent, node: BoardNode): void => {
    event.stopPropagation()
    const host = hostRef.current
    if (!host) return
    dragRef.current = {
      kind: 'resize-node',
      id: node.id,
      start: point(event.clientX, event.clientY),
      width: node.width,
      height: node.height,
      autoHeight: node.autoHeight,
      snapshot: clone(boardRef.current!),
      moved: false
    }
    host.setPointerCapture(event.pointerId)
  }

  const startShapeResize = (event: React.PointerEvent, shape: BoardShape, handle: string): void => {
    event.stopPropagation()
    const host = hostRef.current
    if (!host) return
    dragRef.current = {
      kind: 'resize-shape',
      id: shape.id,
      handle,
      start: point(event.clientX, event.clientY),
      box: shapeBox(shape),
      snapshot: clone(boardRef.current!),
      moved: false
    }
    host.setPointerCapture(event.pointerId)
  }

  /* ---------- measurement ---------- */

  const measureNode = useCallback((id: string, height: number): void => {
    const current = boardRef.current
    if (!current) return
    const node = current.nodes.find((n) => n.id === id)
    if (!node || !node.autoHeight) return
    const nextHeight = Math.max(36, Math.round(height))
    if (Math.abs(node.height - nextHeight) < 1) return
    let nodes = current.nodes.map((n) => (n.id === id ? { ...n, height: nextHeight } : n))
    if (node.stackId) nodes = layoutStack(nodes, node.stackId)
    const next = { ...current, nodes }
    boardRef.current = next
    dirtyRef.current = true
    versionRef.current++
    setBoard(next)
  }, [])

  /* ---------- commands ---------- */

  const deleteSelection = useCallback((): void => {
    const current = boardRef.current
    if (!current) return
    const edgeId = selectedEdgeRef.current
    if (edgeId) {
      apply({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }, true)
      setSelectedEdge(null)
      return
    }
    const ids = selectionRef.current
    if (!ids.size) return
    const nodes = current.nodes.filter((node) => !ids.has(node.id))
    const shapes = current.shapes.filter((shape) => !ids.has(shape.id))
    const edges = current.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to))
    const affectedStacks = new Set(
      current.nodes.filter((node) => ids.has(node.id) && node.stackId).map((node) => node.stackId as string)
    )
    let nextNodes = nodes
    for (const stackId of affectedStacks) nextNodes = layoutStack(nextNodes, stackId)
    apply({ ...current, nodes: nextNodes, shapes, edges })
    setSelection(new Set())
    setSelectedEdge(null)
  }, [apply])

  const duplicateSelection = useCallback((): void => {
    const current = boardRef.current
    if (!current) return
    const ids = selectionRef.current
    if (!ids.size) return
    const nodes = current.nodes.filter((node) => ids.has(node.id))
    const shapes = current.shapes.filter((shape) => ids.has(shape.id))
    const edges = current.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    const map = new Map<string, string>()
    const newNodes = nodes.map((node) => {
      const id = uid('node')
      map.set(node.id, id)
      return { ...node, id, x: node.x + 30, y: node.y + 30, stackId: undefined, stackIndex: undefined }
    })
    const newShapes = shapes.map((shape) => ({ ...shape, id: uid('shape'), x: shape.x + 30, y: shape.y + 30 }))
    const newEdges = edges.map((edge) => ({
      ...edge,
      id: uid('edge'),
      from: map.get(edge.from) ?? edge.from,
      to: map.get(edge.to) ?? edge.to
    }))
    apply({
      ...current,
      nodes: [...current.nodes, ...newNodes],
      shapes: [...current.shapes, ...newShapes],
      edges: [...current.edges, ...newEdges]
    })
    setSelection(new Set([...newNodes.map((n) => n.id), ...newShapes.map((s) => s.id)]))
  }, [apply])

  const copySelection = useCallback((): void => {
    const current = boardRef.current
    if (!current) return
    const ids = selectionRef.current
    const nodes = current.nodes.filter((node) => ids.has(node.id))
    const shapes = current.shapes.filter((shape) => ids.has(shape.id))
    const edges = current.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    clipboardRef.current = { nodes, shapes, edges }
  }, [])

  const pasteSelection = useCallback((): void => {
    const current = boardRef.current
    const clip = clipboardRef.current
    if (!current || !clip) return
    const map = new Map<string, string>()
    const nodes = clip.nodes.map((node) => {
      const id = uid('node')
      map.set(node.id, id)
      return { ...node, id, x: node.x + 30, y: node.y + 30 }
    })
    const shapes = clip.shapes.map((shape) => ({ ...shape, id: uid('shape'), x: shape.x + 30, y: shape.y + 30 }))
    const edges = clip.edges.map((edge) => ({
      ...edge,
      id: uid('edge'),
      from: map.get(edge.from) ?? edge.from,
      to: map.get(edge.to) ?? edge.to
    }))
    apply({
      ...current,
      nodes: [...current.nodes, ...nodes],
      shapes: [...current.shapes, ...shapes],
      edges: [...current.edges, ...edges]
    })
    setSelection(new Set([...nodes.map((n) => n.id), ...shapes.map((s) => s.id)]))
  }, [apply])

  const undo = useCallback((): void => {
    const history = historyRef.current
    if (!history.past.length || !boardRef.current) return
    history.future.push(clone(boardRef.current))
    const previous = history.past.pop()!
    boardRef.current = previous
    setBoard(previous)
    setSelection(new Set())
    setSelectedEdge(null)
  }, [])

  const redo = useCallback((): void => {
    const history = historyRef.current
    if (!history.future.length || !boardRef.current) return
    history.past.push(clone(boardRef.current))
    const next = history.future.pop()!
    boardRef.current = next
    setBoard(next)
    setSelection(new Set())
    setSelectedEdge(null)
  }, [])

  const patchNodes = useCallback(
    (patch: Partial<BoardNode>): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      apply({ ...current, nodes: current.nodes.map((node) => (ids.has(node.id) ? { ...node, ...patch } : node)) })
    },
    [apply]
  )

  const patchStyle = useCallback(
    (patch: Partial<BoardStyle>): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      apply({
        ...current,
        nodes: current.nodes.map((node) =>
          ids.has(node.id) && node.type === 'note' ? { ...node, style: { ...node.style, ...patch } } : node
        )
      })
    },
    [apply]
  )

  const patchShapes = useCallback(
    (patch: Partial<BoardShape>): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      apply({ ...current, shapes: current.shapes.map((shape) => (ids.has(shape.id) ? { ...shape, ...patch } : shape)) })
    },
    [apply]
  )

  const patchEdge = useCallback(
    (patch: Partial<BoardEdge>): void => {
      const current = boardRef.current
      const id = selectedEdgeRef.current
      if (!current || !id) return
      apply({ ...current, edges: current.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)) })
    },
    [apply]
  )

  const alignSelection = useCallback(
    (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      const boxes: { id: string; box: Box }[] = []
      for (const node of current.nodes) if (ids.has(node.id)) boxes.push({ id: node.id, box: nodeBox(node) })
      for (const shape of current.shapes) if (ids.has(shape.id)) boxes.push({ id: shape.id, box: shapeBox(shape) })
      if (boxes.length < 2) return
      const minX = Math.min(...boxes.map((b) => b.box.x))
      const maxX = Math.max(...boxes.map((b) => b.box.x + b.box.width))
      const minY = Math.min(...boxes.map((b) => b.box.y))
      const maxY = Math.max(...boxes.map((b) => b.box.y + b.box.height))
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const place = (box: Box): Partial<Box> => {
        if (mode === 'left') return { x: minX }
        if (mode === 'right') return { x: maxX - box.width }
        if (mode === 'hcenter') return { x: cx - box.width / 2 }
        if (mode === 'top') return { y: minY }
        if (mode === 'bottom') return { y: maxY - box.height }
        return { y: cy - box.height / 2 }
      }
      const updates = new Map(boxes.map((b) => [b.id, place(b.box)]))
      apply({
        ...current,
        nodes: current.nodes.map((node) => (updates.has(node.id) ? { ...node, ...updates.get(node.id) } : node)),
        shapes: current.shapes.map((shape) => (updates.has(shape.id) ? { ...shape, ...updates.get(shape.id) } : shape))
      })
    },
    [apply]
  )

  const distribute = useCallback(
    (axis: 'h' | 'v'): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      const items = [
        ...current.nodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, box: nodeBox(n) })),
        ...current.shapes.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, box: shapeBox(s) }))
      ]
      if (items.length < 3) return
      items.sort((a, b) => (axis === 'h' ? a.box.x - b.box.x : a.box.y - b.box.y))
      const first = items[0].box
      const last = items[items.length - 1].box
      const total = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y
      const sum = items.reduce((acc, item) => acc + (axis === 'h' ? item.box.width : item.box.height), 0)
      const gap = (total - sum) / (items.length - 1)
      let cursor = axis === 'h' ? first.x : first.y
      const updates = new Map<string, Partial<Box>>()
      for (const item of items) {
        updates.set(item.id, axis === 'h' ? { x: cursor } : { y: cursor })
        cursor += (axis === 'h' ? item.box.width : item.box.height) + gap
      }
      apply({
        ...current,
        nodes: current.nodes.map((node) => (updates.has(node.id) ? { ...node, ...updates.get(node.id) } : node)),
        shapes: current.shapes.map((shape) => (updates.has(shape.id) ? { ...shape, ...updates.get(shape.id) } : shape))
      })
    },
    [apply]
  )

  const sameSize = useCallback(
    (axis: 'width' | 'height'): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      const values = [
        ...current.nodes.filter((n) => ids.has(n.id)).map((n) => n[axis]),
        ...current.shapes.filter((s) => ids.has(s.id)).map((s) => s[axis])
      ]
      if (!values.length) return
      const max = Math.max(...values)
      apply({
        ...current,
        nodes: current.nodes.map((node) => (ids.has(node.id) ? { ...node, [axis]: max } : node)),
        shapes: current.shapes.map((shape) => (ids.has(shape.id) ? { ...shape, [axis]: max } : shape))
      })
    },
    [apply]
  )

  const layerSelection = useCallback(
    (direction: 'front' | 'back'): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      const max = Math.max(10, ...current.nodes.map((n) => n.z), ...current.shapes.map((s) => s.z))
      const min = Math.min(0, ...current.nodes.map((n) => n.z), ...current.shapes.map((s) => s.z))
      const nextZ = direction === 'front' ? max + 1 : min - 1
      apply({
        ...current,
        nodes: current.nodes.map((node) => (ids.has(node.id) ? { ...node, z: nextZ } : node)),
        shapes: current.shapes.map((shape) => (ids.has(shape.id) ? { ...shape, z: nextZ } : shape))
      })
    },
    [apply]
  )

  const stackSelection = useCallback((): void => {
    const current = boardRef.current
    if (!current) return
    const ids = selectionRef.current
    const notes = current.nodes
      .filter((node) => ids.has(node.id) && node.type === 'note')
      .sort((a, b) => a.y - b.y || a.x - b.x)
    if (notes.length < 2) return
    const stackId = uid('stack')
    const width = Math.max(...notes.map((n) => n.width))
    const x = notes[0].x
    const index = new Map(notes.map((node, i) => [node.id, i]))
    let nodes = current.nodes.map((node) => {
      const order = index.get(node.id)
      return order === undefined
        ? node
        : { ...node, stackId, stackIndex: order, x, width, y: order === 0 ? notes[0].y : node.y }
    })
    nodes = layoutStack(nodes, stackId)
    apply({ ...current, nodes })
  }, [apply])

  const unstackSelection = useCallback((): void => {
    const current = boardRef.current
    if (!current) return
    const ids = selectionRef.current
    const stacks = new Set(
      current.nodes.filter((node) => ids.has(node.id) && node.stackId).map((node) => node.stackId as string)
    )
    let nodes = current.nodes.map((node) =>
      ids.has(node.id) && node.stackId ? { ...node, stackId: undefined, stackIndex: undefined } : node
    )
    for (const stackId of stacks) nodes = layoutStack(nodes, stackId)
    apply({ ...current, nodes })
  }, [apply])

  const moveInStack = useCallback(
    (direction: -1 | 1): void => {
      const current = boardRef.current
      if (!current) return
      const selected = current.nodes.find((node) => selectionRef.current.has(node.id) && node.stackId)
      if (!selected?.stackId) return
      const members = stackMembers(current.nodes, selected.stackId)
      const index = members.findIndex((node) => node.id === selected.id)
      const swap = index + direction
      if (swap < 0 || swap >= members.length) return
      const reordered = [...members]
      ;[reordered[index], reordered[swap]] = [reordered[swap], reordered[index]]
      const order = new Map(reordered.map((node, i) => [node.id, i]))
      let nodes = current.nodes.map((node) =>
        node.stackId === selected.stackId ? { ...node, stackIndex: order.get(node.id) ?? node.stackIndex } : node
      )
      nodes = layoutStack(nodes, selected.stackId)
      apply({ ...current, nodes })
    },
    [apply]
  )

  const addStackedNote = useCallback((): void => {
    const current = boardRef.current
    if (!current) return
    const selected = current.nodes.find((node) => selectionRef.current.has(node.id) && node.stackId)
    const stackId = selected?.stackId
    if (!selected || !stackId) return
    const at = (selected.stackIndex ?? 0) + 1
    const node = newNote(selected.x, selected.y + selected.height + STACK_GAP, '', selected.style)
    node.width = selected.width
    node.stackId = stackId
    node.stackIndex = at
    let nodes = current.nodes.map((other) =>
      other.stackId === stackId && (other.stackIndex ?? 0) >= at
        ? { ...other, stackIndex: (other.stackIndex ?? 0) + 1 }
        : other
    )
    nodes = [...nodes, node]
    nodes = layoutStack(nodes, stackId)
    apply({ ...current, nodes })
    setSelection(new Set([node.id]))
    setEditingNode(node.id)
    setDraft('')
  }, [apply])

  const savePreset = useCallback(
    (name: string): void => {
      const current = boardRef.current
      if (!current) return
      const note = current.nodes.find((node) => selectionRef.current.has(node.id) && node.type === 'note')
      if (!note) return
      apply({ ...current, presets: [...current.presets, makePreset(name, note.style)] })
    },
    [apply]
  )

  const applyPreset = useCallback(
    (preset: BoardStylePreset): void => {
      const current = boardRef.current
      if (!current) return
      const ids = selectionRef.current
      apply({
        ...current,
        nodes: current.nodes.map((node) =>
          ids.has(node.id) && node.type === 'note' ? { ...node, style: { ...preset.style } } : node
        )
      })
    },
    [apply]
  )

  const deletePreset = useCallback(
    (id: string): void => {
      const current = boardRef.current
      if (!current) return
      apply({ ...current, presets: current.presets.filter((preset) => preset.id !== id) })
    },
    [apply]
  )

  /* ---------- search ---------- */

  const searchHits = useMemo(() => {
    if (!board || !search.trim()) return []
    const needle = search.toLowerCase()
    return board.nodes.filter((node) => {
      const value = `${node.text ?? ''} ${node.caption ?? ''} ${node.file ?? ''}`.toLowerCase()
      return value.includes(needle)
    })
  }, [board, search])

  const focusNode = useCallback((node: BoardNode) => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const zoom = viewRef.current.zoom
    const next = {
      zoom,
      x: rect.width / 2 - (node.x + node.width / 2) * zoom,
      y: rect.height / 2 - (node.y + node.height / 2) * zoom
    }
    viewRef.current = next
    setView(next)
  }, [])

  useEffect(() => {
    if (!searchOpen || !searchHits.length) return
    focusNode(searchHits[Math.min(searchIndex, searchHits.length - 1)])
  }, [searchIndex, searchHits, searchOpen, focusNode])

  /* ---------- import ---------- */

  const addFileNode = (file: string, p: { x: number; y: number }, current: BoardDoc): void => {
    const node = newNote(snap(p.x - 100), snap(p.y - 40), stripExt(basename(file)))
    node.type = 'file'
    node.file = file
    node.height = 110
    apply({ ...current, nodes: [...current.nodes, node] })
    setSelection(new Set([node.id]))
  }

  const onDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    const target = point(event.clientX, event.clientY)
    const slatePath = event.dataTransfer.getData('text/slate-path')
    const current = boardRef.current
    if (!current) return
    if (slatePath) {
      addFileNode(slatePath, target, current)
      return
    }
    const dropped = Array.from(event.dataTransfer.files)
      .map((file) => api.files.pathFor(file))
      .filter(Boolean)
    if (!dropped.length) return
    const imported = await api.fs.importFiles(dropped, attachments)
    await useStore.getState().refreshVault()
    let nodes = [...current.nodes]
    imported.forEach((file, index) => {
      const node = isImage(file)
        ? {
            ...newNote(target.x + index * 20, target.y + index * 20),
            type: 'image' as const,
            file,
            width: 280,
            height: 200,
            autoHeight: false,
            text: '',
            style: { ...defaultStyle(), fill: 'transparent', borderStyle: 'none' as const, shadow: false, padding: 0 }
          }
        : {
            ...newNote(target.x + index * 20, target.y + index * 20),
            type: 'file' as const,
            file,
            text: stripExt(basename(file)),
            height: 110
          }
      nodes = [...nodes, node]
    })
    apply({ ...boardRef.current!, nodes })
  }

  /* ---------- export ---------- */

  const exportPngData = async (): Promise<string | null> => {
    const host = hostRef.current
    if (!host) return null
    const previousView = viewRef.current
    const previousSelection = selectionRef.current
    setSelection(new Set())
    setSelectedEdge(null)
    fit()
    await new Promise((resolve) => setTimeout(resolve, 160))
    setExporting(true)
    await new Promise((resolve) => setTimeout(resolve, 60))
    try {
      return await toPng(host, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(host).backgroundColor || '#17171a'
      })
    } finally {
      setExporting(false)
      setSelection(previousSelection)
      viewRef.current = previousView
      setView(previousView)
    }
  }

  const exportBoard = async (format: 'png' | 'pdf' | 'svg' | 'opml' | 'txt'): Promise<void> => {
    const current = boardRef.current
    if (!current) return
    const name = stripExt(basename(path))
    if (format === 'opml') {
      const result = await api.export.text(toOpml(current.nodes, current.shapes), name, 'opml', 'OPML outline')
      if (result.ok) useStore.getState().toast('Exported OPML', 'success')
      return
    }
    if (format === 'txt') {
      const result = await api.export.text(toPlainText(current.nodes, current.shapes), name, 'txt', 'Plain text')
      if (result.ok) useStore.getState().toast('Exported text', 'success')
      return
    }
    if (format === 'svg') {
      const host = hostRef.current
      if (!host) return
      const previous = viewRef.current
      fit()
      await new Promise((resolve) => setTimeout(resolve, 160))
      try {
        const svg = await toSvg(host, { cacheBust: true })
        const result = await api.export.svg(svg, name)
        if (result.ok) useStore.getState().toast('Exported SVG', 'success')
      } finally {
        viewRef.current = previous
        setView(previous)
      }
      return
    }
    const dataUrl = await exportPngData()
    if (!dataUrl) return
    if (format === 'png') {
      const result = await api.export.png(dataUrl, name)
      if (result.ok) useStore.getState().toast('Exported PNG', 'success')
      return
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; background: #ffffff; }
      body { display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; }
    </style></head><body><img src="${dataUrl}" /></body></html>`
    const result = await api.export.pdf(html, name)
    if (result.ok) useStore.getState().toast('Exported PDF', 'success')
  }

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
      if (editing) return
      const meta = event.metaKey || event.ctrlKey
      if (event.code === 'Space') {
        spaceRef.current = true
        event.preventDefault()
        return
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        const current = boardRef.current
        if (!current) return
        setSelection(new Set([...current.nodes.map((n) => n.id), ...current.shapes.map((s) => s.id)]))
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }
      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (meta && event.key === "'") {
        event.preventDefault()
        stackSelection()
        return
      }
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        addStackedNote()
        return
      }
      if (meta && event.key === '0') {
        event.preventDefault()
        fit()
        return
      }
      if (event.key === 'Escape') {
        setConnect(null)
        setMarquee(null)
        setSelectedEdge(null)
        setSelection(new Set())
        setSearchOpen(false)
        setEditingNode(null)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelection()
        return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const ids = selectionRef.current
        if (!ids.size) return
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const current = boardRef.current
        if (!current) return
        apply({
          ...current,
          nodes: current.nodes.map((node) => (ids.has(node.id) ? { ...node, x: node.x + dx, y: node.y + dy } : node)),
          shapes: current.shapes.map((shape) => (ids.has(shape.id) ? { ...shape, x: shape.x + dx, y: shape.y + dy } : shape))
        })
        return
      }
      if (event.key === 'z' && !meta) {
        const host = hostRef.current
        if (!host) return
        const previous = viewRef.current
        fit()
        const restore = (): void => {
          viewRef.current = previous
          setView(previous)
          window.removeEventListener('keyup', restore)
        }
        window.addEventListener('keyup', restore)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') spaceRef.current = false
    }
    const onBoardFind = (): void => setSearchOpen(true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('slate:board-find', onBoardFind)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('slate:board-find', onBoardFind)
    }
  }, [addStackedNote, apply, copySelection, deleteSelection, duplicateSelection, fit, pasteSelection, redo, stackSelection, undo])

  /* ---------- render ---------- */

  if (!board) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="spinner" />
      </div>
    )
  }

  const selectedNodes = board.nodes.filter((node) => selection.has(node.id))
  const selectedShapes = board.shapes.filter((shape) => selection.has(shape.id))
  const edge = board.edges.find((item) => item.id === selectedEdge) ?? null
  const noteCount = board.nodes.filter((node) => node.type === 'note').length

  const contextForNode = (event: React.MouseEvent, node: BoardNode): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!selection.has(node.id)) setSelection(new Set([node.id]))
    const items: MenuItem[] = [
      { label: 'Edit', onSelect: () => startEditing(node) },
      { label: 'Duplicate', icon: Copy, onSelect: duplicateSelection },
      { label: 'Bring to front', icon: ArrowUpRight, onSelect: () => layerSelection('front') },
      { label: 'Send to back', onSelect: () => layerSelection('back') },
      { separator: true }
    ]
    if (node.stackId) {
      items.push({ label: 'Add note below', icon: Plus, onSelect: addStackedNote })
      items.push({ label: 'Remove from stack', onSelect: unstackSelection })
    } else {
      items.push({ label: 'Stack selected notes', onSelect: stackSelection, disabled: selectedNodes.length < 2 })
    }
    items.push({ separator: true }, { label: 'Delete', icon: Trash2, danger: true, onSelect: deleteSelection })
    menu.open(event, items)
  }

  const contextForEdge = (event: React.MouseEvent, target: BoardEdge): void => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedEdge(target.id)
    setSelection(new Set())
    menu.open(event, [
      { label: 'Edit label', onSelect: () => startEdgeLabelEdit(target) },
      {
        label: target.arrowEnd ? 'Remove end arrow' : 'Add end arrow',
        onSelect: () => patchEdgeForId(target.id, { arrowEnd: !target.arrowEnd })
      },
      {
        label: target.arrowStart ? 'Remove start arrow' : 'Add start arrow',
        onSelect: () => patchEdgeForId(target.id, { arrowStart: !target.arrowStart })
      },
      { separator: true },
      {
        label: 'Delete connection',
        icon: Trash2,
        danger: true,
        onSelect: () => {
          apply({ ...boardRef.current!, edges: boardRef.current!.edges.filter((e) => e.id !== target.id) })
          setSelectedEdge(null)
        }
      }
    ])
  }

  const patchEdgeForId = (id: string, patch: Partial<BoardEdge>): void => {
    const current = boardRef.current
    if (!current) return
    apply({ ...current, edges: current.edges.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  }

  const startEdgeLabelEdit = (target: BoardEdge): void => {
    const from = board.nodes.find((n) => n.id === target.from)
    const to = board.nodes.find((n) => n.id === target.to)
    if (!from || !to) return
    setEdgeEditor({
      id: target.id,
      x: (from.x + from.width / 2 + to.x + to.width / 2) / 2,
      y: (from.y + from.height / 2 + to.y + to.height / 2) / 2,
      value: target.label
    })
  }

  return (
    <div className={cn('board', exporting && 'is-exporting')}>
      <div className="board-toolbar">
        <div className="board-title">
          <span>{stripExt(basename(path))}</span>
        </div>
        <div className="segmented">
          <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select / move">
            <MousePointer2 size={13} /> Select
          </button>
          <button className={tool === 'connect' ? 'active' : ''} onClick={() => setTool('connect')} title="Drag from one note to another">
            <Cable size={13} /> Connect
          </button>
        </div>
        <button
          className="icon-btn"
          title="Add note (double-click canvas too)"
          onClick={() => {
            const host = hostRef.current
            if (!host) return
            const rect = host.getBoundingClientRect()
            addNote(point(rect.left + rect.width / 2, rect.top + rect.height / 2))
          }}
        >
          <StickyNote size={15} />
        </button>
        <button
          className="icon-btn"
          title="Add background shape"
          onClick={(event) =>
            menu.open(event, [
              { label: 'Rectangle', icon: Square, onSelect: () => addShape('rect') },
              { label: 'Rounded rectangle', onSelect: () => addShape('rounded') },
              { label: 'Ellipse', icon: Circle, onSelect: () => addShape('ellipse') }
            ])
          }
        >
          <Square size={15} />
        </button>
        <button
          className="icon-btn"
          title="Arrange"
          disabled={selection.size < 2}
          onClick={(event) =>
            menu.open(event, [
              { label: 'Align left', onSelect: () => alignSelection('left') },
              { label: 'Align centre', onSelect: () => alignSelection('hcenter') },
              { label: 'Align right', onSelect: () => alignSelection('right') },
              { separator: true },
              { label: 'Align top', onSelect: () => alignSelection('top') },
              { label: 'Align middle', onSelect: () => alignSelection('vcenter') },
              { label: 'Align bottom', onSelect: () => alignSelection('bottom') },
              { separator: true },
              { label: 'Distribute horizontally', onSelect: () => distribute('h') },
              { label: 'Distribute vertically', onSelect: () => distribute('v') },
              { separator: true },
              { label: 'Same width', onSelect: () => sameSize('width') },
              { label: 'Same height', onSelect: () => sameSize('height') }
            ])
          }
        >
          <AlignLeft size={15} />
        </button>
        <button
          className="icon-btn"
          title="Stack selected notes (⌘')"
          disabled={selectedNodes.filter((node) => node.type === 'note').length < 2}
          onClick={stackSelection}
        >
          <Plus size={15} />
        </button>
        <div className="board-toolbar-spacer" />
        <button className="icon-btn" onClick={undo} title="Undo (⌘Z)">
          <Undo2 size={15} />
        </button>
        <button className="icon-btn" onClick={redo} title="Redo (⇧⌘Z)">
          <Redo2 size={15} />
        </button>
        <button
          className="icon-btn"
          title="Grid & snapping"
          onClick={(event) =>
            menu.open(event, [
              {
                label: board.grid.visible ? 'Hide grid' : 'Show grid',
                icon: Grid3x3,
                onSelect: () =>
                  boardRef.current &&
                  apply({ ...boardRef.current, grid: { ...boardRef.current.grid, visible: !boardRef.current.grid.visible } }, false)
              },
              {
                label: board.grid.snap ? 'Disable snapping' : 'Enable snapping',
                onSelect: () =>
                  boardRef.current &&
                  apply({ ...boardRef.current, grid: { ...boardRef.current.grid, snap: !boardRef.current.grid.snap } }, false)
              },
              { separator: true },
              ...([10, 20, 40] as const).map((size) => ({
                label: `${size}px grid`,
                onSelect: () =>
                  boardRef.current && apply({ ...boardRef.current, grid: { ...boardRef.current.grid, size } }, false)
              }))
            ])
          }
        >
          <Grid3x3 size={15} />
        </button>
        <button className={cn('icon-btn', searchOpen && 'active')} onClick={() => setSearchOpen((open) => !open)} title="Find on board (⌘F)">
          <Search size={15} />
        </button>
        <button
          className="icon-btn"
          title="Export"
          onClick={(event) =>
            menu.open(event, [
              { label: 'PNG image', icon: Download, onSelect: () => void exportBoard('png') },
              { label: 'PDF', onSelect: () => void exportBoard('pdf') },
              { label: 'SVG', onSelect: () => void exportBoard('svg') },
              { separator: true },
              { label: 'OPML outline', onSelect: () => void exportBoard('opml') },
              { label: 'Plain text', onSelect: () => void exportBoard('txt') }
            ])
          }
        >
          <Download size={15} />
        </button>
        <button className={cn('icon-btn', inspector && 'active')} onClick={() => setInspector((open) => !open)} title="Inspector">
          <PanelRight size={15} />
        </button>
      </div>

      <div className="board-main">
        <div
          ref={hostRef}
          className="board-canvas"
          style={{
            backgroundSize: `${board.grid.size * view.zoom}px ${board.grid.size * view.zoom}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundImage: board.grid.visible
              ? 'radial-gradient(circle, var(--border-strong) 1px, transparent 1px)'
              : 'none'
          }}
          onPointerDown={onHostPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            connectRef.current = null
            setConnect(null)
            dragRef.current = null
            setMarquee(null)
          }}
          onLostPointerCapture={() => {
            connectRef.current = null
            setConnect(null)
            dragRef.current = null
            setMarquee(null)
          }}
          onDoubleClick={(event) => {
            if (event.target !== event.currentTarget) return
            addNote(point(event.clientX, event.clientY))
          }}
          onWheel={(event) => {
            event.preventDefault()
            const v = viewRef.current
            if (event.metaKey || event.ctrlKey) {
              const host = hostRef.current
              if (!host) return
              const rect = host.getBoundingClientRect()
              const mx = event.clientX - rect.left
              const my = event.clientY - rect.top
              const zoom = Math.min(2.5, Math.max(0.15, v.zoom * (event.deltaY < 0 ? 1.1 : 0.9)))
              const ratio = zoom / v.zoom
              const next = { zoom, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio }
              viewRef.current = next
              setView(next)
            } else {
              const next = { ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }
              viewRef.current = next
              setView(next)
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void onDrop(event)}
        >
          <div className="board-transform" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <svg className="board-edges" width="1" height="1" aria-hidden>
              <defs>
                <marker id="board-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
                <marker id="board-arrow-start" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>
              {board.edges.map((item) => {
                const from = board.nodes.find((n) => n.id === item.from)
                const to = board.nodes.find((n) => n.id === item.to)
                const fromShape = board.shapes.find((s) => s.id === item.from)
                const toShape = board.shapes.find((s) => s.id === item.to)
                const fromBox = from ? nodeBox(from) : fromShape ? shapeBox(fromShape) : null
                const toBox = to ? nodeBox(to) : toShape ? shapeBox(toShape) : null
                if (!fromBox || !toBox) return null
                const a = anchorFor(fromBox, toBox)
                const b = anchorFor(toBox, fromBox)
                const dotted = item.style === 'dotted' || (item.style === 'auto' && !item.arrowStart && !item.arrowEnd)
                return (
                  <g key={item.id}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={selectedEdge === item.id ? 'var(--accent)' : item.color}
                      strokeWidth={selectedEdge === item.id ? item.width + 1 : item.width}
                      strokeDasharray={dotted ? '4 4' : undefined}
                      markerEnd={item.arrowEnd ? 'url(#board-arrow)' : undefined}
                      markerStart={item.arrowStart ? 'url(#board-arrow-start)' : undefined}
                      style={{ pointerEvents: 'none' }}
                    />
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setSelectedEdge(item.id)
                        setSelection(new Set())
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        startEdgeLabelEdit(item)
                      }}
                      onContextMenu={(event) => contextForEdge(event, item)}
                    />
                    {item.label && (
                      <g
                        transform={`translate(${(a.x + b.x) / 2}, ${(a.y + b.y) / 2})`}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        onDoubleClick={(event) => {
                          event.stopPropagation()
                          setEdgeEditor({
                            id: item.id,
                            x: (a.x + b.x) / 2,
                            y: (a.y + b.y) / 2,
                            value: item.label
                          })
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          setSelectedEdge(item.id)
                          setSelection(new Set())
                        }}
                      >
                        <rect
                          x={-item.label.length * 3.3 - 6}
                          y={-9}
                          width={item.label.length * 6.6 + 12}
                          height={18}
                          rx={4}
                          fill="var(--bg-elevated)"
                          stroke="var(--border)"
                        />
                        <text textAnchor="middle" y={4} fontSize={11} fill="var(--text-secondary)" fontFamily="var(--font-ui)">
                          {item.label}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
              {connect &&
                (() => {
                  const source = board.nodes.find((n) => n.id === connect.from) ?? board.shapes.find((s) => s.id === connect.from)
                  const box = source ? ('width' in source && 'style' in source ? nodeBox(source as BoardNode) : shapeBox(source as BoardShape)) : null
                  if (!box) return null
                  const a = anchorFor(box, { x: connect.x, y: connect.y, width: 1, height: 1 })
                  return <line x1={a.x} y1={a.y} x2={connect.x} y2={connect.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" />
                })()}
            </svg>

            <div className="board-shape-layer">
            {board.shapes.map((shape) => (
              <div
                key={shape.id}
                className={cn('board-shape', selection.has(shape.id) && 'selected', shape.magnetic && 'magnetic')}
                data-shape-id={shape.id}
                style={{
                  left: shape.x,
                  top: shape.y,
                  width: shape.width,
                  height: shape.height,
                  background: shape.fill,
                  opacity: shape.fillOpacity,
                  borderStyle: shape.borderStyle === 'none' ? 'none' : shape.borderStyle,
                  borderWidth: shape.borderWidth,
                  borderColor: shape.borderColor,
                  borderRadius: shape.shape === 'ellipse' ? '50%' : shape.shape === 'rounded' ? 16 : 0,
                  boxShadow: shape.shadow ? 'var(--shadow)' : 'none',
                  zIndex: shape.z
                }}
                onPointerDown={(event) => onShapePointerDown(event, shape)}
                onDoubleClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setSelection(new Set([shape.id]))
                  menu.open(event, [
                    {
                      label: shape.magnetic ? 'Turn off magnetic' : 'Make magnetic',
                      icon: Magnet,
                      onSelect: () => patchShapes({ magnetic: !shape.magnetic })
                    },
                    { label: 'Bring forward', onSelect: () => layerSelection('front') },
                    { label: 'Send back', onSelect: () => layerSelection('back') },
                    { separator: true },
                    { label: 'Delete shape', icon: Trash2, danger: true, onSelect: deleteSelection }
                  ])
                }}
              >
                {selection.has(shape.id) &&
                  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                    <span
                      key={handle}
                      className={`board-handle shape-${handle}`}
                      onPointerDown={(event) => startShapeResize(event, shape, handle)}
                    />
                  ))}
              </div>
            ))}
            </div>

            <div className="board-node-layer">
            {[...board.nodes].sort((a, b) => a.z - b.z).map((node) => (
              <BoardNote
                key={node.id}
                node={node}
                selected={selection.has(node.id)}
                hit={searchHits.some((h) => h.id === node.id)}
                editing={editingNode === node.id}
                draft={draft}
                onDraft={setDraft}
                onPointerDown={onNodePointerDown}
                onDoubleClick={startEditing}
                onResize={startNodeResize}
                onMeasure={measureNode}
                onEditDone={commitNodeEdit}
                onContextMenu={contextForNode}
                onOpenFile={(file) => void useStore.getState().openNote(file, { history: true })}
                onStartConnect={startConnect}
              />
            ))}
            </div>

            {edgeEditor && (
              <input
                className="board-edge-input"
                style={{ left: edgeEditor.x, top: edgeEditor.y }}
                value={edgeEditor.value}
                autoFocus
                onChange={(event) => setEdgeEditor({ ...edgeEditor, value: event.target.value })}
                onBlur={() => {
                  const current = boardRef.current
                  if (current) {
                    apply({
                      ...current,
                      edges: current.edges.map((item) =>
                        item.id === edgeEditor.id ? { ...item, label: edgeEditor.value.trim() } : item
                      )
                    })
                  }
                  setEdgeEditor(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                  if (event.key === 'Escape') setEdgeEditor(null)
                }}
              />
            )}

            {marquee && (
              <div
                className="board-marquee"
                style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
              />
            )}
          </div>

          {searchOpen && (
            <div className="board-search">
              <Search size={14} />
              <input
                autoFocus
                value={search}
                placeholder="Find on this board…"
                onChange={(event) => {
                  setSearch(event.target.value)
                  setSearchIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setSearchIndex((searchIndex + (event.shiftKey ? -1 : 1) + searchHits.length) % Math.max(1, searchHits.length))
                  if (event.key === 'Escape') setSearchOpen(false)
                }}
              />
              <span className="board-search-count">{search ? `${searchHits.length ? searchIndex + 1 : 0} / ${searchHits.length}` : ''}</span>
              <button className="icon-btn" onClick={() => setSearchIndex((searchIndex - 1 + searchHits.length) % Math.max(1, searchHits.length))}>
                ↑
              </button>
              <button className="icon-btn" onClick={() => setSearchIndex((searchIndex + 1) % Math.max(1, searchHits.length))}>
                ↓
              </button>
              <button className="icon-btn" onClick={() => setSearchOpen(false)}>
                <X size={13} />
              </button>
            </div>
          )}

          <div className="board-footer">
            <span>{noteCount} note{noteCount === 1 ? '' : 's'}</span>
            <span>{selection.size ? `${selection.size} selected` : ''}</span>
            <span>{board.edges.length} connections</span>
            <span className="spacer" />
            <button className="icon-btn" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.15, v.zoom / 1.15) }))} title="Zoom out">
              <ZoomOut size={13} />
            </button>
            <input
              className="board-zoom"
              type="range"
              min={0.15}
              max={2.5}
              step={0.05}
              value={view.zoom}
              onChange={(event) => {
                const zoom = Number(event.target.value)
                const host = hostRef.current
                if (!host) return
                const rect = host.getBoundingClientRect()
                const cx = rect.width / 2
                const cy = rect.height / 2
                const ratio = zoom / viewRef.current.zoom
                const next = { zoom, x: cx - (cx - viewRef.current.x) * ratio, y: cy - (cy - viewRef.current.y) * ratio }
                viewRef.current = next
                setView(next)
              }}
            />
            <button className="icon-btn" onClick={() => setView((v) => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.15) }))} title="Zoom in">
              <ZoomIn size={13} />
            </button>
            <span style={{ width: 36, textAlign: 'right' }}>{Math.round(view.zoom * 100)}%</span>
            <button className="icon-btn" onClick={() => fit()} title="Fit board">
              <Maximize size={13} />
            </button>
          </div>

          {board.nodes.length === 0 && !editingNode && (
            <div className="board-empty">
              <StickyNote size={28} />
              <div>Double-click anywhere to create a note</div>
              <div className="board-empty-sub">Select a note and drag its edge handle to connect · ⌘F to find</div>
            </div>
          )}
        </div>

        {inspector && (
          <BoardInspector
            board={board}
            nodes={selectedNodes}
            shapes={selectedShapes}
            edge={edge}
            onNodes={patchNodes}
            onStyle={patchStyle}
            onShapes={patchShapes}
            onEdge={patchEdge}
            onDeleteEdge={deleteSelection}
            onAlign={alignSelection}
            onDistribute={distribute}
            onSameWidth={() => sameSize('width')}
            onSameHeight={() => sameSize('height')}
            onLayer={layerSelection}
            onStack={stackSelection}
            onUnstack={unstackSelection}
            onMoveStack={moveInStack}
            onAddStacked={addStackedNote}
            onSavePreset={savePreset}
            onApplyPreset={applyPreset}
            onDeletePreset={deletePreset}
          />
        )}
      </div>
    </div>
  )
}

function BoardNote({
  node,
  selected,
  hit,
  editing,
  draft,
  onDraft,
  onPointerDown,
  onDoubleClick,
  onResize,
  onMeasure,
  onEditDone,
  onContextMenu,
  onOpenFile,
  onStartConnect
}: {
  node: BoardNode
  selected: boolean
  hit: boolean
  editing: boolean
  draft: string
  onDraft: (value: string) => void
  onPointerDown: (event: React.PointerEvent, node: BoardNode) => void
  onDoubleClick: (node: BoardNode) => void
  onResize: (event: React.PointerEvent, node: BoardNode) => void
  onMeasure: (id: string, height: number) => void
  onEditDone: () => void
  onContextMenu: (event: React.MouseEvent, node: BoardNode) => void
  onOpenFile: (file: string) => void
  onStartConnect: (event: React.PointerEvent, from: string) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const index = useStore((s) => s.index)
  const style = node.style
  const css: React.CSSProperties = {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.autoHeight ? 'auto' : node.height,
    minHeight: 36,
    padding: style.padding,
    background: style.fill,
    color: style.textColor,
    borderStyle: style.borderStyle === 'none' ? 'none' : style.borderStyle,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    borderRadius: style.radius,
    boxShadow: style.shadow ? 'var(--shadow-sm)' : 'none',
    fontFamily:
      style.fontFamily === 'serif' ? 'var(--font-serif)' : style.fontFamily === 'mono' ? 'var(--font-mono)' : 'var(--font-ui)',
    fontSize: style.fontSize,
    fontWeight: style.bold ? 600 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration:
      [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
    textAlign: style.align,
    opacity: style.fade ? 0.55 : 1,
    zIndex: node.z
  }

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [draft, editing])

  useEffect(() => {
    if (editing) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 20)
      return () => clearTimeout(timer)
    }
  }, [editing])

  useEffect(() => {
    const element = ref.current
    if (!element || !node.autoHeight) return
    const observer = new ResizeObserver(() => {
      onMeasure(node.id, element.offsetHeight)
    })
    observer.observe(element)
    onMeasure(node.id, element.offsetHeight)
    return () => observer.disconnect()
  }, [node.id, node.autoHeight, onMeasure, node.width, node.text, node.type])

  const fileNote = node.type === 'file' && node.file ? index.notes[node.file] : undefined

  return (
    <div
      ref={ref}
      className={cn('board-node', `board-node-${node.type}`, selected && 'selected', hit && 'search-hit')}
      data-node-id={node.id}
      style={css}
      onPointerDown={(event) => onPointerDown(event, node)}
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (node.type === 'file' && node.file) onOpenFile(node.file)
        else onDoubleClick(node)
      }}
      onContextMenu={(event) => onContextMenu(event, node)}
    >
      {node.type === 'image' && node.file ? (
        <img src={assetUrl(node.file)} alt={node.caption ?? ''} draggable={false} />
      ) : editing ? (
        <textarea
          ref={textareaRef}
          className="board-note-input"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onEditDone}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onEditDone()
            }
            if (event.key === 'Enter' && event.metaKey) {
              event.preventDefault()
              onEditDone()
            }
          }}
          spellCheck={false}
          style={{
            fontFamily: 'inherit',
            fontSize: 'inherit',
            fontWeight: 'inherit',
            fontStyle: 'inherit',
            textDecoration: 'inherit',
            color: 'inherit',
            textAlign: style.align
          }}
        />
      ) : node.type === 'file' ? (
        <div className="board-file">
          <div className="board-file-title">
            <FileText size={13} /> {node.text || (node.file ? stripExt(basename(node.file)) : 'File')}
          </div>
          <div className="board-file-excerpt">{fileNote?.excerpt || node.file}</div>
        </div>
      ) : (
        <div className="board-note-text">{node.text || <span style={{ opacity: 0.45 }}>Double-click to edit</span>}</div>
      )}
      {selected && (
        <>
          <span className="board-handle node-se" onPointerDown={(event) => onResize(event, node)} />
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <span
              key={side}
              className={`board-connect-handle connect-${side}`}
              title="Drag to connect"
              onPointerDown={(event) => {
                event.stopPropagation()
                onStartConnect(event, node.id)
              }}
            />
          ))}
        </>
      )}
    </div>
  )
}
