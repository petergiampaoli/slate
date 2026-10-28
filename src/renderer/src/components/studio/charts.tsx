import { useMemo } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum
} from 'd3-force'
import type { ActivityPoint, StudioTheme, ThemeStat, WordMapData } from '../../lib/studio'

const W = 800
const AXIS = 'var(--text-faint)'
const LABEL = 'var(--text-secondary)'
const GRID = 'var(--border)'

interface SvgProps {
  height: number
  children: React.ReactNode
  ref?: React.Ref<SVGSVGElement>
}

export function ChartSvg({ height, children, ref }: SvgProps): React.JSX.Element {
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${height}`}
      className="studio-chart-svg"
      role="img"
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
    >
      {children}
    </svg>
  )
}

export function EmptyChart({ message }: { message: string }): React.JSX.Element {
  return <div className="studio-empty-chart">{message}</div>
}

/* ------------------------------------------------------------------ */
/* Bar list                                                            */
/* ------------------------------------------------------------------ */

export function BarListChart({
  items,
  palette,
  height,
  showValues = true,
  labelWidth = 190
}: {
  items: { label: string; value: number; color?: string }[]
  palette: string[]
  height?: number
  showValues?: boolean
  labelWidth?: number
}): React.JSX.Element {
  const rows = items.slice(0, 14)
  const computedHeight = height ?? Math.max(90, rows.length * 40 + 30)
  const max = Math.max(1, ...rows.map((r) => r.value))
  const barMax = W - labelWidth - 70

  return (
    <ChartSvg height={computedHeight}>
      {rows.map((row, i) => {
        const y = 12 + i * 40
        const width = Math.max(2, (row.value / max) * barMax)
        const color = row.color ?? palette[i % palette.length]
        return (
          <g key={`${row.label}-${i}`}>
            <text x={0} y={y + 17} fontSize={19} fill={LABEL} fontFamily="var(--font-ui)">
              {truncate(row.label, 26)}
            </text>
            <rect x={labelWidth} y={y + 2} width={barMax} height={22} rx={5} fill={GRID} opacity={0.35} />
            <rect x={labelWidth} y={y + 2} width={width} height={22} rx={5} fill={color} opacity={0.9} />
            {showValues && (
              <text x={labelWidth + barMax + 8} y={y + 19} fontSize={15} fill={AXIS} fontFamily="var(--font-ui)">
                {row.value.toLocaleString()}
              </text>
            )}
          </g>
        )
      })}
      {rows.length === 0 && <text x={0} y={28} fontSize={16} fill={AXIS}>No data for this selection.</text>}
    </ChartSvg>
  )
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export function ActivityChart({
  points,
  palette
}: {
  points: ActivityPoint[]
  palette: string[]
}): React.JSX.Element {
  const height = 280
  const left = 46
  const right = 16
  const top = 26
  const bottom = 42
  const plotW = W - left - right
  const plotH = height - top - bottom
  const maxWords = Math.max(1, ...points.map((p) => p.words))
  const maxNotes = Math.max(1, ...points.map((p) => p.notes))
  const slot = points.length ? plotW / points.length : plotW
  const barW = Math.max(3, Math.min(30, slot * 0.62))
  const accent = palette[0]
  const lineColor = palette[2] ?? palette[1] ?? accent

  if (!points.length) {
    return <ChartSvg height={height}><text x={0} y={24} fontSize={12} fill={AXIS}>No activity for this selection.</text></ChartSvg>
  }

  const linePoints = points
    .map((point, i) => {
      const x = left + slot * i + slot / 2
      const y = top + plotH - (point.notes / maxNotes) * plotH * 0.72
      return `${x},${y}`
    })
    .join(' ')

  return (
    <ChartSvg height={height}>
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
        const y = top + plotH - plotH * tick
        return (
          <g key={tick}>
            <line x1={left} y1={y} x2={W - right} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={left - 8} y={y + 5} fontSize={13} fill={AXIS} textAnchor="end" fontFamily="var(--font-ui)">
              {Math.round(maxWords * tick).toLocaleString()}
            </text>
          </g>
        )
      })}

      {points.map((point, i) => {
        const barH = Math.max(1, (point.words / maxWords) * plotH)
        const x = left + slot * i + slot / 2 - barW / 2
        return (
          <g key={point.key}>
            <rect x={x} y={top + plotH - barH} width={barW} height={barH} rx={3} fill={accent} opacity={0.85}>
              <title>{`${point.label}: ${point.words.toLocaleString()} words`}</title>
            </rect>
            {(points.length <= 14 || i % Math.ceil(points.length / 12) === 0) && (
              <text
                x={left + slot * i + slot / 2}
                y={height - 18}
                fontSize={13}
                fill={AXIS}
                textAnchor="middle"
                fontFamily="var(--font-ui)"
              >
                {point.label}
              </text>
            )}
          </g>
        )
      })}

      <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" opacity={0.9} />
      {points.map((point, i) => {
        const x = left + slot * i + slot / 2
        const y = top + plotH - (point.notes / maxNotes) * plotH * 0.72
        return <circle key={point.key} cx={x} cy={y} r={3} fill={lineColor}><title>{`${point.label}: ${point.notes} notes`}</title></circle>
      })}

      <g fontFamily="var(--font-ui)" fontSize={13} fill={AXIS}>
        <rect x={W - right - 150} y={2} width={8} height={8} rx={2} fill={accent} />
        <text x={W - right - 137} y={11}>words</text>
        <line x1={W - right - 86} y1={6} x2={W - right - 74} y2={6} stroke={lineColor} strokeWidth={2} />
        <circle cx={W - right - 80} cy={6} r={2.5} fill={lineColor} />
        <text x={W - right - 67} y={11}>notes</text>
      </g>
    </ChartSvg>
  )
}

/* ------------------------------------------------------------------ */
/* Word cloud                                                          */
/* ------------------------------------------------------------------ */

interface PlacedWord {
  term: string
  count: number
  x: number
  y: number
  size: number
  color: string
}

export function WordCloudChart({
  terms,
  palette,
  limit = 40
}: {
  terms: { term: string; count: number }[]
  palette: string[]
  limit?: number
}): React.JSX.Element {
  const height = 380
  const words = useMemo(() => layoutCloud(terms.slice(0, limit), palette, height), [terms, palette, limit])

  if (!words.length) {
    return <ChartSvg height={height}><text x={0} y={24} fontSize={12} fill={AXIS}>Not enough text to map yet.</text></ChartSvg>
  }

  return (
    <ChartSvg height={height}>
      {words.map((word, i) => (
        <text
          key={`${word.term}-${i}`}
          x={word.x}
          y={word.y}
          fontSize={word.size}
          fill={word.color}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="var(--font-ui)"
          fontWeight={word.size > 30 ? 600 : 500}
          opacity={0.92}
        >
          {word.term}
          <title>{`${word.term}: ${word.count}`}</title>
        </text>
      ))}
    </ChartSvg>
  )
}

function layoutCloud(
  terms: { term: string; count: number }[],
  palette: string[],
  height: number
): PlacedWord[] {
  if (!terms.length) return []
  const max = terms[0].count
  const min = terms[terms.length - 1].count
  const cx = W / 2
  const cy = height / 2
  const placed: PlacedWord[] = []
  const boxes: { x1: number; y1: number; x2: number; y2: number }[] = []

  terms.forEach((term, index) => {
    const ratio = max === min ? 1 : (term.count - min) / (max - min)
    const size = 17 + Math.pow(ratio, 0.72) * 38
    const width = term.term.length * size * 0.53 + 8
    const boxH = size * 1.12 + 4

    let angle = 0
    let radius = 0
    let x = cx
    let y = cy
    let attempts = 0
    while (attempts < 2200) {
      const halfW = width / 2
      const halfH = boxH / 2
      const box = { x1: x - halfW, y1: y - halfH, x2: x + halfW, y2: y + halfH }
      const fits =
        box.x1 > 4 &&
        box.x2 < W - 4 &&
        box.y1 > 4 &&
        box.y2 < height - 4 &&
        !boxes.some((b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2))
      if (fits) {
        boxes.push(box)
        break
      }
      angle += 0.32
      radius += 1.4
      x = cx + Math.cos(angle) * radius * 1.35
      y = cy + Math.sin(angle) * radius * 0.72
      attempts++
    }

    placed.push({
      term: term.term,
      count: term.count,
      x,
      y,
      size,
      color: palette[index % palette.length]
    })
  })

  return placed
}

/* ------------------------------------------------------------------ */
/* Force word map                                                      */
/* ------------------------------------------------------------------ */

interface MapNode extends SimulationNodeDatum {
  term: string
  count: number
}

export function WordMapChart({ data, palette }: { data: WordMapData; palette: string[] }): React.JSX.Element {
  const height = 440
  const layout = useMemo(() => {
    const nodes: MapNode[] = data.nodes.map((n, i) => ({
      term: n.term,
      count: n.count,
      x: W / 2 + Math.cos((i / Math.max(1, data.nodes.length)) * Math.PI * 2) * 140,
      y: height / 2 + Math.sin((i / Math.max(1, data.nodes.length)) * Math.PI * 2) * 110
    }))
    const links = data.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight }))
    if (!nodes.length) return { nodes, links }
    const sim = forceSimulation<MapNode>(nodes)
      .force(
        'link',
        forceLink<MapNode, { source: string; target: string; weight: number }>(links)
          .id((d) => d.term)
          .distance(95)
          .strength(0.35)
      )
      .force('charge', forceManyBody().strength(-210).distanceMax(420))
      .force('center', forceCenter(W / 2, height / 2))
      .force('collide', forceCollide<MapNode>().radius((d) => 18 + d.term.length * 3.6))
      .stop()
    for (let i = 0; i < 320; i++) sim.tick()
    for (const node of nodes) {
      node.x = Math.max(80, Math.min(W - 80, node.x ?? W / 2))
      node.y = Math.max(34, Math.min(height - 40, node.y ?? height / 2))
    }
    return { nodes, links }
  }, [data])

  if (!data.nodes.length) {
    return <ChartSvg height={height}><text x={0} y={24} fontSize={12} fill={AXIS}>Not enough recurring words to build a map.</text></ChartSvg>
  }

  const maxCount = Math.max(1, ...data.nodes.map((n) => n.count))
  const maxWeight = Math.max(1, ...data.edges.map((e) => e.weight))

  return (
    <ChartSvg height={height}>
      {layout.links.map((link, i) => {
        const source = link.source as unknown as MapNode
        const target = link.target as unknown as MapNode
        if (typeof source === 'string' || typeof target === 'string') return null
        return (
          <line
            key={i}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            stroke={GRID}
            strokeWidth={1 + (link.weight / maxWeight) * 3}
            opacity={0.25 + (link.weight / maxWeight) * 0.45}
          />
        )
      })}
      {layout.nodes.map((node, i) => {
        const radius = 8 + Math.sqrt(node.count / maxCount) * 14
        return (
          <g key={node.term}>
            <circle cx={node.x} cy={node.y} r={radius} fill={palette[i % palette.length]} opacity={0.85}>
              <title>{`${node.term}: ${node.count} notes`}</title>
            </circle>
            <text
              x={node.x}
              y={(node.y ?? 0) + radius + 12}
              fontSize={12}
              fill={LABEL}
              textAnchor="middle"
              fontFamily="var(--font-ui)"
            >
              {node.term}
            </text>
          </g>
        )
      })}
    </ChartSvg>
  )
}

/* ------------------------------------------------------------------ */
/* Theme heatmap                                                       */
/* ------------------------------------------------------------------ */

export function ThemeHeatmapChart({
  themes,
  buckets,
  values
}: {
  themes: StudioTheme[]
  buckets: { key: string; label: string }[]
  values: Record<string, number[]>
}): React.JSX.Element {
  const height = Math.max(160, themes.length * 36 + 74)
  const left = 150
  const top = 18
  const cellW = Math.max(14, Math.min(48, (W - left - 20) / Math.max(1, buckets.length)))
  const cellH = 26
  const max = Math.max(1, ...Object.values(values).flat())
  const shown = buckets.slice(-Math.floor((W - left - 20) / cellW))

  if (!themes.length || !buckets.length) {
    return <ChartSvg height={180}><text x={0} y={24} fontSize={12} fill={AXIS}>Add a theme and some dated notes to see the timeline.</text></ChartSvg>
  }

  return (
    <ChartSvg height={height}>
      {themes.map((theme, row) => {
        const series = (values[theme.id] ?? []).slice(-shown.length)
        return (
          <g key={theme.id}>
            <text x={0} y={top + row * (cellH + 8) + 18} fontSize={15} fill={LABEL} fontFamily="var(--font-ui)">
              {truncate(theme.name, 20)}
            </text>
            {shown.map((bucket, col) => {
              const value = series[col] ?? 0
              const opacity = value === 0 ? 0.06 : 0.18 + (value / max) * 0.78
              return (
                <g key={bucket.key}>
                  <rect
                    x={left + col * cellW}
                    y={top + row * (cellH + 8)}
                    width={cellW - 3}
                    height={cellH}
                    rx={4}
                    fill={theme.color}
                    opacity={opacity}
                  >
                    <title>{`${theme.name} · ${bucket.label}: ${value} notes`}</title>
                  </rect>
                  {value > 0 && cellW > 20 && (
                    <text
                      x={left + col * cellW + (cellW - 3) / 2}
                      y={top + row * (cellH + 8) + 17}
                      fontSize={13}
                      fill={value / max > 0.55 ? '#fff' : LABEL}
                      textAnchor="middle"
                      fontFamily="var(--font-ui)"
                    >
                      {value}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {shown.map((bucket, col) =>
        col % Math.max(1, Math.ceil(shown.length / 8)) === 0 ? (
          <text
            key={bucket.key}
            x={left + col * cellW + (cellW - 3) / 2}
            y={height - 22}
            fontSize={12.5}
            fill={AXIS}
            textAnchor="middle"
            fontFamily="var(--font-ui)"
          >
            {bucket.label}
          </text>
        ) : null
      )}

      <g fontFamily="var(--font-ui)" fontSize={13} fill={AXIS}>
        <rect x={left} y={height - 12} width={10} height={10} rx={2} fill={themes[0]?.color ?? paletteFallback} opacity={0.15} />
        <text x={left + 15} y={height - 4}>fewer notes</text>
        <rect x={left + 92} y={height - 12} width={10} height={10} rx={2} fill={themes[0]?.color ?? paletteFallback} opacity={0.9} />
        <text x={left + 107} y={height - 4}>more notes</text>
      </g>
    </ChartSvg>
  )
}

const paletteFallback = '#7c6cf0'

/* ------------------------------------------------------------------ */
/* Theme bars                                                          */
/* ------------------------------------------------------------------ */

export function ThemeBarsChart({ stats, palette }: { stats: ThemeStat[]; palette: string[] }): React.JSX.Element {
  return (
    <BarListChart
      items={stats.map((s) => ({ label: s.theme.name, value: s.mentions, color: s.theme.color || palette[0] }))}
      palette={palette}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Stat tiles                                                          */
/* ------------------------------------------------------------------ */

export function StatsChart({
  stats
}: {
  stats: { notes: number; words: number; average: number; links: number; tags: number; minutes: number }
}): React.JSX.Element {
  const height = 230
  const tiles = [
    { label: 'Notes', value: stats.notes },
    { label: 'Words', value: stats.words },
    { label: 'Avg. words / note', value: stats.average },
    { label: 'Links', value: stats.links },
    { label: 'Tags', value: stats.tags },
    { label: 'Reading time', value: stats.minutes, suffix: 'min' }
  ]
  const colW = W / 3
  const rowH = height / 2 - 6

  return (
    <ChartSvg height={height}>
      {tiles.map((tile, i) => {
        const col = i % 3
        const row = Math.floor(i / 3)
        const x = col * colW + 6
        const y = row * (rowH + 12) + 6
        return (
          <g key={tile.label}>
            <rect x={x} y={y} width={colW - 12} height={rowH} rx={10} fill="var(--bg-inset)" stroke={GRID} />
            <text x={x + 18} y={y + 52} fontSize={42} fontWeight={650} fill="var(--text)" fontFamily="var(--font-ui)">
              {tile.value.toLocaleString()}
              {tile.suffix ? <tspan fontSize={18} fill={LABEL}>{` ${tile.suffix}`}</tspan> : null}
            </text>
            <text x={x + 18} y={y + 80} fontSize={19} fill={AXIS} fontFamily="var(--font-ui)">
              {tile.label}
            </text>
          </g>
        )
      })}
    </ChartSvg>
  )
}

/* ------------------------------------------------------------------ */

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
