import type { VaultIndex } from './indexer'
import { dirname } from './utils'

export const STUDIO_FILE = '.slate/studio.json'

export type StudioChartType =
  | 'stats'
  | 'activity'
  | 'wordcloud'
  | 'wordmap'
  | 'tags'
  | 'themes'
  | 'heatmap'
  | 'folders'

export interface ChartTypeInfo {
  id: StudioChartType
  label: string
  description: string
  height: number
}

export const CHART_TYPES: ChartTypeInfo[] = [
  { id: 'stats', label: 'Project summary', description: 'Notes, words, links and reading time at a glance.', height: 250 },
  { id: 'activity', label: 'Writing activity', description: 'Words written per week or month.', height: 280 },
  { id: 'wordcloud', label: 'Word cloud', description: 'The words you use most across the selection.', height: 360 },
  { id: 'wordmap', label: 'Word map', description: 'Words that appear together, connected.', height: 420 },
  { id: 'themes', label: 'Theme frequency', description: 'How often each of your themes appears.', height: 300 },
  { id: 'heatmap', label: 'Theme timeline', description: 'Theme presence over time.', height: 320 },
  { id: 'tags', label: 'Tags', description: 'Tag usage across the selection.', height: 320 },
  { id: 'folders', label: 'Folders', description: 'Word count by folder or project.', height: 320 }
]

export interface StudioTheme {
  id: string
  name: string
  color: string
  keywords: string[]
}

export interface StudioScope {
  folder: string
  includeSubfolders: boolean
}

export interface StudioFilters {
  tags: string[]
  search: string
  dateFrom: string
  dateTo: string
}

export interface StudioSettings {
  limit: number
  bucket: 'week' | 'month'
  palette: string
  showLegend: boolean
  minCount: number
}

export interface StudioCard {
  id: string
  title: string
  subtitle: string
  type: StudioChartType
  scope: StudioScope
  filters: StudioFilters
  settings: StudioSettings
  span: 1 | 2
}

export interface StudioDoc {
  version: number
  cards: StudioCard[]
  themes: StudioTheme[]
}

export const PALETTES: Record<string, { label: string; colors: string[] }> = {
  violet: { label: 'Violet', colors: ['#7c6cf0', '#a78bfa', '#c4b5fd', '#6d5ce0', '#8b7cf6', '#5b45d6'] },
  ocean: { label: 'Ocean', colors: ['#0ea5e9', '#38bdf8', '#22d3ee', '#0284c7', '#14b8a6', '#6366f1'] },
  forest: { label: 'Forest', colors: ['#12b981', '#34d399', '#84cc16', '#0d9488', '#65a30d', '#059669'] },
  sunset: { label: 'Sunset', colors: ['#f59e0b', '#ef4444', '#ec4899', '#f97316', '#e11d48', '#facc15'] },
  mono: { label: 'Mono', colors: ['#8b8b93', '#a1a1aa', '#71717a', '#c4c4cc', '#52525b', '#d4d4d8'] }
}

export function paletteFor(name: string): string[] {
  return (PALETTES[name] ?? PALETTES.violet).colors
}

export function emptyDoc(): StudioDoc {
  return { version: 1, cards: [], themes: [] }
}

export function newCard(scope: string, type: StudioChartType): StudioCard {
  const info = CHART_TYPES.find((t) => t.id === type) ?? CHART_TYPES[0]
  return {
    id: `card-${Math.random().toString(36).slice(2, 9)}`,
    title: info.label,
    subtitle: '',
    type,
    scope: { folder: scope, includeSubfolders: true },
    filters: { tags: [], search: '', dateFrom: '', dateTo: '' },
    settings: { limit: 24, bucket: 'week', palette: 'violet', showLegend: true, minCount: 2 },
    span: type === 'wordmap' || type === 'activity' || type === 'heatmap' || type === 'stats' || type === 'wordcloud' ? 2 : 1
  }
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

export interface StudioNote {
  path: string
  title: string
  body: string
  tags: string[]
  words: number
  mtime: number
  folder: string
  links: number
}

export function inScope(path: string, scope: StudioScope): boolean {
  if (!scope.folder) return true
  if (scope.folder === dirname(path)) return true
  return scope.includeSubfolders && path.startsWith(`${scope.folder}/`)
}

export function collectNotes(
  index: VaultIndex,
  fileStats: Record<string, { mtime: number; size: number }>,
  scope: StudioScope,
  filters: StudioFilters
): StudioNote[] {
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : -Infinity
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : Infinity
  const search = filters.search.trim().toLowerCase()
  const tags = filters.tags.map((t) => t.replace(/^#/, '').toLowerCase())

  const notes: StudioNote[] = []
  for (const note of Object.values(index.notes)) {
    if (!inScope(note.path, scope)) continue
    const mtime = fileStats[note.path]?.mtime ?? note.mtime ?? 0
    if (mtime < from || mtime > to) continue
    if (tags.length) {
      const noteTags = note.tags.map((t) => t.toLowerCase())
      const matches = tags.some((tag) => noteTags.some((t) => t === tag || t.startsWith(`${tag}/`)))
      if (!matches) continue
    }
    if (search && !note.body.toLowerCase().includes(search) && !note.title.toLowerCase().includes(search)) continue
    notes.push({
      path: note.path,
      title: note.title,
      body: note.body,
      tags: note.tags,
      words: note.words,
      mtime,
      folder: dirname(note.path) || 'Vault root',
      links: note.links.filter((l) => l.resolved).length
    })
  }
  return notes.sort((a, b) => b.mtime - a.mtime)
}

export function filterSummary(card: StudioCard): string {
  const parts: string[] = []
  parts.push(card.scope.folder ? `/ ${card.scope.folder}` : 'Whole vault')
  parts.push(card.scope.includeSubfolders ? 'incl. subfolders' : 'this folder only')
  if (card.filters.tags.length) parts.push(card.filters.tags.map((t) => `#${t}`).join(' '))
  if (card.filters.search) parts.push(`“${card.filters.search}”`)
  if (card.filters.dateFrom || card.filters.dateTo) {
    parts.push(`${card.filters.dateFrom || '…'} → ${card.filters.dateTo || '…'}`)
  }
  return parts.join(' · ')
}

/* ------------------------------------------------------------------ */
/* Text analysis                                                       */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set(
  `a about above after again against all also am an and another any are aren't as at be because been before being below
  between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further
  had hadn't has hasn't have haven't having he her here hers herself him himself his how however i if in into is isn't it its
  itself just let's like me more most mustn't my myself no nor not now of off on once only or other ought our ours ourselves
  out over own same shan't she should shouldn't so some such than that that's the their theirs them themselves then there
  these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why
  will with won't would wouldn't you your yours yourself yourselves
  make made make just really thing things something anything everything much many may might must shall
  one two three first second new now today yesterday tomorrow week month year day time
  note notes slate vault file files page pages chapter section part draft
  said says say get got go going went come came know known think thought want wanted need needed use used using
  also back even still well look looks looked take taken give given work works worked
  could would should maybe perhaps around across within without upon among
  `
    .split(/\s+/)
    .filter(Boolean)
)

export function tokenize(text: string): string[] {
  const clean = text
    .replace(/^---[\s\S]*?\n---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[\[([^\]]+)\]\]/g, ' ')
    .replace(/\[\[([^\]]+)\]\]/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_~=|-]/g, ' ')
  const words = clean.toLowerCase().match(/[\p{L}][\p{L}'-]*/gu) ?? []
  const out: string[] = []
  for (const raw of words) {
    const word = raw.replace(/^['-]+|['-]+$/g, '')
    if (word.length < 3 || word.length > 32) continue
    if (STOPWORDS.has(word)) continue
    if (/^\d+$/.test(word)) continue
    out.push(word)
  }
  return out
}

export function termFrequencies(notes: StudioNote[], limit = 40): { term: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    for (const word of tokenize(note.body)) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit)
}

export interface WordMapData {
  nodes: { term: string; count: number; x?: number; y?: number }[]
  edges: { source: string; target: string; weight: number }[]
}

export function cooccurrence(notes: StudioNote[], maxTerms = 36, minWeight = 2): WordMapData {
  const global = new Map<string, number>()
  const perNote: string[][] = []
  for (const note of notes) {
    const unique = [...new Set(tokenize(note.body))]
    for (const term of unique) global.set(term, (global.get(term) ?? 0) + 1)
    perNote.push(unique)
  }
  const top = [...global.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([term]) => term)
  const allowed = new Set(top)
  const pairs = new Map<string, number>()
  for (const terms of perNote) {
    const local = terms.filter((t) => allowed.has(t)).slice(0, 18)
    for (let i = 0; i < local.length; i++) {
      for (let j = i + 1; j < local.length; j++) {
        const key = local[i] < local[j] ? `${local[i]}\u0000${local[j]}` : `${local[j]}\u0000${local[i]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
  const edges = [...pairs.entries()]
    .filter(([, weight]) => weight >= minWeight)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 160)
    .map(([key, weight]) => {
      const [source, target] = key.split('\u0000')
      return { source, target, weight }
    })
  const used = new Set<string>()
  for (const edge of edges) {
    used.add(edge.source)
    used.add(edge.target)
  }
  const nodes = [...used].map((term) => ({ term, count: global.get(term) ?? 1 }))
  return { nodes, edges }
}

export interface ThemeStat {
  theme: StudioTheme
  notes: number
  mentions: number
}

function themeHit(text: string, theme: StudioTheme): number {
  let total = 0
  for (const keyword of theme.keywords) {
    const needle = keyword.trim().toLowerCase()
    if (!needle) continue
    if (needle.includes(' ')) {
      let at = text.indexOf(needle)
      while (at !== -1) {
        total++
        at = text.indexOf(needle, at + needle.length)
      }
    } else {
      const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
      total += (text.match(re) ?? []).length
    }
  }
  return total
}

export function themeStats(notes: StudioNote[], themes: StudioTheme[]): ThemeStat[] {
  return themes
    .map((theme) => {
      let noteCount = 0
      let mentions = 0
      for (const note of notes) {
        const hits = themeHit(`${note.title}\n${note.body}`, theme)
        if (hits > 0) {
          noteCount++
          mentions += hits
        }
      }
      return { theme, notes: noteCount, mentions }
    })
    .sort((a, b) => b.mentions - a.mentions)
}

/* ------------------------------------------------------------------ */
/* Time series                                                         */
/* ------------------------------------------------------------------ */

export interface Bucket {
  key: string
  label: string
  start: number
}

export function bucketOf(ms: number, bucket: 'week' | 'month'): Bucket {
  const date = new Date(ms || Date.now())
  if (bucket === 'month') {
    const start = new Date(date.getFullYear(), date.getMonth(), 1)
    const label = start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label, start: start.getTime() }
  }
  const start = new Date(date)
  const day = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - day)
  start.setHours(0, 0, 0, 0)
  const label = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const first = new Date(start.getFullYear(), 0, 1)
  const week = Math.floor((start.getTime() - first.getTime()) / 86400000 / 7) + 1
  return { key: `${start.getFullYear()}-W${String(week).padStart(2, '0')}`, label, start: start.getTime() }
}

export interface ActivityPoint {
  key: string
  label: string
  notes: number
  words: number
}

export function activitySeries(notes: StudioNote[], bucket: 'week' | 'month'): ActivityPoint[] {
  const map = new Map<string, ActivityPoint & { start: number }>()
  for (const note of notes) {
    const b = bucketOf(note.mtime, bucket)
    const point = map.get(b.key) ?? { key: b.key, label: b.label, notes: 0, words: 0, start: b.start }
    point.notes++
    point.words += note.words
    map.set(b.key, point)
  }
  return [...map.values()].sort((a, b) => a.start - b.start)
}

export function themeSeries(
  notes: StudioNote[],
  themes: StudioTheme[],
  bucket: 'week' | 'month'
): { buckets: ActivityPoint[]; values: Record<string, number[]> } {
  const buckets = activitySeries(notes, bucket)
  const index = new Map(buckets.map((b, i) => [b.key, i]))
  const values: Record<string, number[]> = {}
  for (const theme of themes) values[theme.id] = buckets.map(() => 0)
  for (const note of notes) {
    const point = index.get(bucketOf(note.mtime, bucket).key)
    if (point === undefined) continue
    for (const theme of themes) {
      if (themeHit(`${note.title}\n${note.body}`, theme) > 0) values[theme.id][point]++
    }
  }
  return { buckets, values }
}

export function tagCounts(notes: StudioNote[]): { label: string; value: number }[] {
  const counts = new Map<string, number>()
  for (const note of notes) for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()]
    .map(([label, value]) => ({ label: `#${label}`, value }))
    .sort((a, b) => b.value - a.value)
}

export function folderCounts(notes: StudioNote[]): { label: string; value: number }[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    const label = note.folder
    counts.set(label, (counts.get(label) ?? 0) + note.words)
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

export function totals(notes: StudioNote[]): {
  notes: number
  words: number
  average: number
  links: number
  tags: number
  minutes: number
} {
  const words = notes.reduce((sum, n) => sum + n.words, 0)
  const tags = new Set<string>()
  for (const note of notes) for (const tag of note.tags) tags.add(tag)
  return {
    notes: notes.length,
    words,
    average: notes.length ? Math.round(words / notes.length) : 0,
    links: notes.reduce((sum, n) => sum + n.links, 0),
    tags: tags.size,
    minutes: Math.max(1, Math.round(words / 225))
  }
}

/* ------------------------------------------------------------------ */
/* Theme suggestions                                                   */
/* ------------------------------------------------------------------ */

export function suggestThemes(index: VaultIndex, limit = 4): StudioTheme[] {
  const colors = paletteFor('violet')
  return index.tags.slice(0, limit).map((tag, i) => {
    const parts = tag.tag.split('/')
    return {
      id: `theme-${Math.random().toString(36).slice(2, 8)}`,
      name: parts[parts.length - 1].replace(/[-_]/g, ' '),
      color: colors[i % colors.length],
      keywords: [...new Set([tag.tag, tag.tag.replace(/[-_/]/g, ' ')])]
    }
  })
}

export function newTheme(name = 'New theme', color = paletteFor('violet')[0]): StudioTheme {
  return { id: `theme-${Math.random().toString(36).slice(2, 9)}`, name, color, keywords: [] }
}
