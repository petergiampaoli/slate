import Fuse from 'fuse.js'
import type { VaultIndex } from './indexer'
import { escapeRegExp, stripExt, basename, dirname } from './utils'

export interface SearchFilter {
  tags: string[]
  path: string
  file: string
}

export interface SearchMatch {
  line: number
  text: string
  /** Character ranges within `text` to highlight. */
  ranges: [number, number][]
}

export interface SearchResult {
  path: string
  title: string
  score: number
  matches: SearchMatch[]
}

export function parseQuery(query: string): { terms: string[]; filter: SearchFilter; regex: RegExp | null } {
  const filter: SearchFilter = { tags: [], path: '', file: '' }
  const terms: string[] = []
  let regex: RegExp | null = null

  const tokenRe = /(\w+):("[^"]*"|\S+)|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(query))) {
    if (m[1]) {
      const key = m[1].toLowerCase()
      const value = (m[2] ?? '').replace(/^"|"$/g, '')
      if (key === 'tag' || key === 'tags') filter.tags.push(value.replace(/^#/, ''))
      else if (key === 'path') filter.path = value.toLowerCase()
      else if (key === 'file') filter.file = value.toLowerCase()
      else terms.push(m[0])
    } else if (m[3] !== undefined) {
      terms.push(m[3])
    } else if (m[4]) {
      terms.push(m[4])
    }
  }

  const joined = terms.join(' ').trim()
  if (joined.startsWith('re:') || (joined.startsWith('/') && joined.lastIndexOf('/') > 0)) {
    const pattern = joined.startsWith('re:')
      ? joined.slice(3)
      : joined.slice(1, joined.lastIndexOf('/'))
    const flags = joined.startsWith('/') ? joined.slice(joined.lastIndexOf('/') + 1) || 'i' : 'i'
    try {
      regex = new RegExp(pattern, flags)
    } catch {
      regex = null
    }
  }

  return { terms: regex ? [] : terms, filter, regex }
}

export function searchVault(index: VaultIndex, query: string, limit = 80): SearchResult[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { terms, filter, regex } = parseQuery(trimmed)
  const results: SearchResult[] = []

  for (const note of Object.values(index.notes)) {
    if (filter.path && !note.path.toLowerCase().includes(filter.path)) continue
    if (filter.file && !basename(note.path).toLowerCase().includes(filter.file)) continue
    if (filter.tags.length) {
      const noteTags = note.tags.map((t) => t.toLowerCase())
      const allMatch = filter.tags.every((tag) =>
        noteTags.some((t) => t === tag || t.startsWith(`${tag}/`))
      )
      if (!allMatch) continue
    }

    const matches: SearchMatch[] = []
    let score = 0
    const lines = note.body.split('\n')

    const matchesLine = (text: string): [number, number][] => {
      const ranges: [number, number][] = []
      if (regex) {
        const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
        let m: RegExpExecArray | null
        while ((m = re.exec(text))) {
          ranges.push([m.index, m.index + m[0].length])
          if (m[0].length === 0) break
        }
        return ranges
      }
      const lower = text.toLowerCase()
      for (const term of terms) {
        const needle = term.toLowerCase()
        if (!needle) continue
        let at = lower.indexOf(needle)
        while (at !== -1) {
          ranges.push([at, at + needle.length])
          at = lower.indexOf(needle, at + needle.length)
        }
      }
      return ranges
    }

    const titleLower = note.title.toLowerCase()
    if (!regex) {
      for (const term of terms) {
        const t = term.toLowerCase()
        if (titleLower === t) score += 120
        else if (titleLower.startsWith(t)) score += 60
        else if (titleLower.includes(t)) score += 30
      }
    }

    lines.forEach((line, i) => {
      if (matches.length >= 4) return
      const ranges = matchesLine(line)
      if (ranges.length) {
        score += 10 + (i === 0 ? 4 : 0)
        if (/^#{1,6}\s/.test(line)) score += 6
        matches.push({ line: i, text: line.trim().slice(0, 260), ranges: clampRanges(ranges, line.trimStart().length, line.trim().slice(0, 260).length) })
      }
    })

    if (matches.length === 0) {
      if (regex) continue
      if (!terms.every((t) => `${note.title} ${note.aliases.join(' ')}`.toLowerCase().includes(t.toLowerCase()))) continue
    }

    if (filter.tags.length) score += 15
    results.push({ path: note.path, title: note.title, score, matches })
  }

  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit)
}

function clampRanges(ranges: [number, number][], offset: number, max: number): [number, number][] {
  return ranges
    .map(([s, e]) => [Math.max(0, s - offset), Math.min(max, e - offset)] as [number, number])
    .filter(([s, e]) => e > 0 && s < max)
}

/* ---------- Quick switcher ---------- */

export interface QuickItem {
  path: string
  title: string
  subtitle: string
}

export function quickSwitcherItems(index: VaultIndex): QuickItem[] {
  return Object.values(index.notes).map((note) => {
    const dir = dirname(note.path)
    return {
      path: note.path,
      title: note.title,
      subtitle: note.aliases.length ? note.aliases.join(', ') : dir
    }
  })
}

export function fuzzyFind(items: QuickItem[], query: string, limit = 40): QuickItem[] {
  if (!query.trim()) {
    return [...items].sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit)
  }
  const fuse = new Fuse(items, {
    keys: [
      { name: 'title', weight: 0.7 },
      { name: 'subtitle', weight: 0.2 },
      { name: 'path', weight: 0.1 }
    ],
    threshold: 0.42,
    ignoreLocation: true,
    includeScore: true
  })
  return fuse.search(query, { limit }).map((r) => r.item)
}

export function highlightRanges(text: string, query: string): [number, number][] {
  if (!query.trim()) return []
  const ranges: [number, number][] = []
  for (const term of query.split(/\s+/).filter(Boolean)) {
    const lower = text.toLowerCase()
    const needle = term.toLowerCase()
    let at = lower.indexOf(needle)
    while (at !== -1) {
      ranges.push([at, at + needle.length])
      at = lower.indexOf(needle, at + needle.length)
    }
  }
  return ranges
}

export function simpleMatch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

export function escapeQuery(query: string): string {
  return escapeRegExp(query)
}

export const __internal = { stripExt }
