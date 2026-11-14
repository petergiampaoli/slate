import { uid } from './utils'

export type BoardNodeType = 'note' | 'image' | 'file'
export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted'
export type TextAlign = 'left' | 'center' | 'right'
export type ShapeKind = 'rect' | 'rounded' | 'ellipse'

export interface BoardStyle {
  fontFamily: 'sans' | 'serif' | 'mono'
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  textColor: string
  fill: string
  borderStyle: BorderStyle
  borderWidth: number
  borderColor: string
  radius: number
  shadow: boolean
  align: TextAlign
  fade: boolean
  padding: number
}

export interface BoardNode {
  id: string
  type: BoardNodeType
  x: number
  y: number
  width: number
  height: number
  autoHeight: boolean
  text?: string
  file?: string
  caption?: string
  stackId?: string
  stackIndex?: number
  z: number
  style: BoardStyle
}

export interface BoardEdge {
  id: string
  from: string
  to: string
  label: string
  arrowStart: boolean
  arrowEnd: boolean
  color: string
  width: number
  style: 'auto' | 'dotted' | 'solid'
}

export interface BoardShape {
  id: string
  x: number
  y: number
  width: number
  height: number
  shape: ShapeKind
  fill: string
  fillOpacity: number
  borderStyle: BorderStyle
  borderWidth: number
  borderColor: string
  shadow: boolean
  magnetic: boolean
  z: number
}

export interface BoardStylePreset {
  id: string
  name: string
  style: BoardStyle
}

export interface BoardDoc {
  version: 1
  nodes: BoardNode[]
  edges: BoardEdge[]
  shapes: BoardShape[]
  presets: BoardStylePreset[]
  view: { x: number; y: number; zoom: number }
  grid: { size: number; snap: boolean; visible: boolean }
}

export const BOARD_EXTENSION = 'board'
export const STACK_GAP = 10

export function isBoardFile(path: string): boolean {
  return path.toLowerCase().endsWith('.board')
}

export function defaultStyle(): BoardStyle {
  return {
    fontFamily: 'sans',
    fontSize: 13.5,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    textColor: 'var(--text)',
    fill: 'var(--bg-elevated)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: 'var(--border-strong)',
    radius: 8,
    shadow: true,
    align: 'left',
    fade: false,
    padding: 12
  }
}

export function emptyBoard(): BoardDoc {
  return {
    version: 1,
    nodes: [],
    edges: [],
    shapes: [],
    presets: [],
    view: { x: 0, y: 0, zoom: 1 },
    grid: { size: 20, snap: true, visible: true }
  }
}

export function newNote(x: number, y: number, text = '', style?: BoardStyle): BoardNode {
  return {
    id: uid('node'),
    type: 'note',
    x: Math.round(x),
    y: Math.round(y),
    width: 240,
    height: 64,
    autoHeight: true,
    text,
    z: 10,
    style: { ...(style ?? defaultStyle()) }
  }
}

export function newShape(x: number, y: number, shape: ShapeKind = 'rounded'): BoardShape {
  return {
    id: uid('shape'),
    x: Math.round(x),
    y: Math.round(y),
    width: 360,
    height: 240,
    shape,
    fill: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    fillOpacity: 1,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
    shadow: false,
    magnetic: false,
    z: 0
  }
}

export function newEdge(from: string, to: string): BoardEdge {
  return {
    id: uid('edge'),
    from,
    to,
    label: '',
    arrowStart: false,
    arrowEnd: false,
    color: 'var(--text-muted)',
    width: 1.5,
    style: 'auto'
  }
}

export function normaliseBoard(raw: unknown): BoardDoc {
  const base = emptyBoard()
  if (!raw || typeof raw !== 'object') return base
  const doc = raw as Partial<BoardDoc>
  const nodes = Array.isArray(doc.nodes)
    ? doc.nodes.map((node, index) => ({
        ...newNote(0, 0),
        ...node,
        style: { ...defaultStyle(), ...(node.style ?? {}) },
        z: node.z ?? 10 + index
      }))
    : []
  const shapes = Array.isArray(doc.shapes)
    ? doc.shapes.map((shape) => ({ ...newShape(0, 0), ...shape }))
    : []
  const edges = Array.isArray(doc.edges)
    ? doc.edges.map((edge) => ({ ...newEdge('', ''), ...edge }))
    : []
  return {
    version: 1,
    nodes,
    shapes,
    edges,
    presets: Array.isArray(doc.presets) ? doc.presets : [],
    view: { x: doc.view?.x ?? 0, y: doc.view?.y ?? 0, zoom: doc.view?.zoom ?? 1 },
    grid: { ...base.grid, ...(doc.grid ?? {}) }
  }
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export function nodeBox(node: BoardNode): Box {
  return { x: node.x, y: node.y, width: node.width, height: node.height }
}

export function shapeBox(shape: BoardShape): Box {
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
}

export function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function pointInBox(x: number, y: number, box: Box): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
}

export function boardBounds(nodes: BoardNode[], shapes: BoardShape[]): Box {
  const boxes = [...nodes.map(nodeBox), ...shapes.map(shapeBox)]
  if (!boxes.length) return { x: -200, y: -150, width: 400, height: 300 }
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: minX, y: minY, width: Math.max(120, maxX - minX), height: Math.max(80, maxY - minY) }
}

export function anchorFor(from: Box, to: Box, side?: 'top' | 'right' | 'bottom' | 'left'): { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' } {
  if (side) {
    return {
      x: side === 'left' ? from.x : side === 'right' ? from.x + from.width : from.x + from.width / 2,
      y: side === 'top' ? from.y : side === 'bottom' ? from.y + from.height : from.y + from.height / 2,
      side
    }
  }
  const fromCx = from.x + from.width / 2
  const fromCy = from.y + from.height / 2
  const toCx = to.x + to.width / 2
  const toCy = to.y + to.height / 2
  const dx = toCx - fromCx
  const dy = toCy - fromCy
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: from.x + from.width, y: fromCy, side: 'right' }
      : { x: from.x, y: fromCy, side: 'left' }
  }
  return dy > 0
    ? { x: fromCx, y: from.y + from.height, side: 'bottom' }
    : { x: fromCx, y: from.y, side: 'top' }
}

/** Re-flow a stack from its first note, preserving height. */
export function layoutStack(nodes: BoardNode[], stackId: string): BoardNode[] {
  const members = nodes.filter((node) => node.stackId === stackId).sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0))
  if (!members.length) return nodes
  const first = members[0]
  const width = Math.max(...members.map((node) => node.width))
  const x = first.x
  let y = first.y
  const positions = new Map<string, { x: number; y: number; width: number }>()
  for (const node of members) {
    positions.set(node.id, { x, y, width })
    y += node.height + STACK_GAP
  }
  return nodes.map((node) => {
    const pos = positions.get(node.id)
    return pos ? { ...node, ...pos } : node
  })
}

export function stackMembers(nodes: BoardNode[], stackId: string): BoardNode[] {
  return nodes.filter((node) => node.stackId === stackId).sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0))
}

export function stackBounds(nodes: BoardNode[], stackId: string): Box | null {
  const members = stackMembers(nodes, stackId)
  if (!members.length) return null
  return boardBounds(members, [])
}

/* ------------------------------------------------------------------ */
/* Text export                                                         */
/* ------------------------------------------------------------------ */

export function spatialOrder(nodes: BoardNode[]): BoardNode[] {
  const stacks = new Map<string, BoardNode[]>()
  for (const node of nodes) {
    if (node.stackId) {
      const list = stacks.get(node.stackId) ?? []
      list.push(node)
      stacks.set(node.stackId, list)
    }
  }
  const stackAnchors = new Map<string, BoardNode>()
  for (const [id, members] of stacks) {
    const sorted = [...members].sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0))
    stackAnchors.set(id, sorted[0])
  }
  const items: { node: BoardNode; stackId?: string }[] = []
  const usedStacks = new Set<string>()
  for (const node of nodes) {
    if (node.stackId) {
      if (usedStacks.has(node.stackId)) continue
      usedStacks.add(node.stackId)
      const anchor = stackAnchors.get(node.stackId)!
      items.push({ node: anchor, stackId: node.stackId })
    } else {
      items.push({ node })
    }
  }
  items.sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x)
  const out: BoardNode[] = []
  for (const item of items) {
    if (item.stackId) {
      const sorted = [...stacks.get(item.stackId)!].sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0))
      out.push(...sorted)
    } else {
      out.push(item.node)
    }
  }
  return out
}

export function toPlainText(nodes: BoardNode[], shapes: BoardShape[]): string {
  const lines: string[] = []
  for (const shape of shapes) {
    const inside = nodes.filter((node) => pointInBox(node.x + node.width / 2, node.y + node.height / 2, shape))
    if (!inside.length) continue
    lines.push(`## Group`)
    for (const node of inside) lines.push(node.text ?? '')
    lines.push('')
  }
  const grouped = new Set(shapes.flatMap((shape) => nodes.filter((node) => pointInBox(node.x + node.width / 2, node.y + node.height / 2, shape)).map((node) => node.id)))
  for (const node of spatialOrder(nodes)) {
    if (grouped.has(node.id)) continue
    lines.push(node.text ?? node.caption ?? '')
    lines.push('')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function toOpml(nodes: BoardNode[], shapes: BoardShape[]): string {
  const used = new Set<string>()
  const outlines: string[] = []
  for (const shape of shapes) {
    const inside = nodes.filter((node) => pointInBox(node.x + node.width / 2, node.y + node.height / 2, shape))
    if (!inside.length) continue
    inside.forEach((node) => used.add(node.id))
    outlines.push(
      `    <outline text="Group" _note="">\n${inside
        .map((node) => `      <outline text="${escapeXml(node.text ?? '')}" />`)
        .join('\n')}\n    </outline>`
    )
  }
  for (const node of spatialOrder(nodes)) {
    if (used.has(node.id)) continue
    outlines.push(`    <outline text="${escapeXml(node.text ?? node.caption ?? '')}" />`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Slate board</title>\n  </head>\n  <body>\n${outlines.join('\n')}\n  </body>\n</opml>\n`
}

export function makePreset(name: string, style: BoardStyle): BoardStylePreset {
  return { id: uid('preset'), name, style: { ...style } }
}
