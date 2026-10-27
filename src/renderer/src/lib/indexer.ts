import { parse as parseYaml } from 'yaml'
import { basename, dirname, stripExt, wordCount, slugify, isMarkdown, isCanvas, isNote } from './utils'

export interface ParsedLink {
  kind: 'wiki' | 'markdown'
  /** Link destination as written, without alias or heading. */
  target: string
  heading?: string
  block?: string
  alias?: string
  embed: boolean
  line: number
  /** Vault-relative path of the note this link points at, or null when unresolved. */
  resolved: string | null
}

export interface Heading {
  level: number
  text: string
  line: number
  id: string
}

export interface NoteMeta {
  path: string
  title: string
  content: string
  body: string
  frontmatter: Record<string, unknown> | null
  tags: string[]
  aliases: string[]
  links: ParsedLink[]
  headings: Heading[]
  words: number
  excerpt: string
  mtime: number
  size: number
}

export interface Backlink {
  source: string
  line: number
  context: string
  embed: boolean
}

export interface TagInfo {
  tag: string
  count: number
  paths: string[]
}

export interface VaultIndex {
  notes: Record<string, NoteMeta>
  backlinks: Record<string, Backlink[]>
  tags: TagInfo[]
  unresolved: { source: string; target: string; line: number }[]
  folders: string[]
  builtAt: number
}

export const EMPTY_INDEX: VaultIndex = {
  notes: {},
  backlinks: {},
  tags: [],
  unresolved: [],
  folders: [],
  builtAt: 0
}

export interface FrontmatterSplit {
  frontmatter: Record<string, unknown> | null
  frontmatterRaw: string
  body: string
  bodyOffset: number
}

export function splitFrontmatter(text: string): FrontmatterSplit {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return { frontmatter: null, frontmatterRaw: '', body: text, bodyOffset: 0 }
  let parsed: Record<string, unknown> | null = null
  try {
    const value = parseYaml(match[1])
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch {
    parsed = null
  }
  return {
    frontmatter: parsed,
    frontmatterRaw: match[1],
    body: text.slice(match[0].length),
    bodyOffset: match[0].length
  }
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').trim()
}

const TAG_RE = /(^|[\s([{>'"“‘])#([A-Za-z0-9_\u00C0-\uFFFF][\w\u00C0-\uFFFF/-]*)/g

export function extractInlineTags(body: string): string[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/`[^`\n]*`/g, '')
  const tags = new Set<string>()
  const lines = withoutCode.split('\n')
  for (const line of lines) {
    if (/^\s{0,3}#{1,6}\s/.test(line)) continue
    TAG_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TAG_RE.exec(line))) {
      const tag = m[2].replace(/[.,;:!?)]+$/, '')
      if (tag && !/^\d+$/.test(tag)) tags.add(tag)
    }
  }
  return [...tags]
}

export function extractHeadings(body: string): Heading[] {
  const headings: Heading[] = []
  const seen = new Map<string, number>()
  const lines = body.split('\n')
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (!m) return
    const text = m[2].replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_s, a, b) => b || a)
    const base = slugify(text) || `heading-${i}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    headings.push({ level: m[1].length, text, line: i, id: count ? `${base}-${count}` : base })
  })
  return headings
}

const WIKI_RE = /(!?)\[\[([^\]\n]+?)\]\]/g
const MD_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

function splitWiki(inner: string): { target: string; heading?: string; block?: string; alias?: string } {
  let alias: string | undefined
  const pipe = inner.indexOf('|')
  if (pipe !== -1) {
    alias = inner.slice(pipe + 1).trim()
    inner = inner.slice(0, pipe)
  }
  let block: string | undefined
  const caret = inner.indexOf('^')
  if (caret !== -1) {
    block = inner.slice(caret + 1).trim()
    inner = inner.slice(0, caret)
  }
  let heading: string | undefined
  const hash = inner.indexOf('#')
  if (hash !== -1) {
    heading = inner.slice(hash + 1).trim()
    inner = inner.slice(0, hash)
  }
  return { target: inner.trim(), heading: heading || undefined, block, alias }
}

export function parseLinks(body: string, lineOffset = 0): Omit<ParsedLink, 'resolved'>[] {
  const links: Omit<ParsedLink, 'resolved'>[] = []
  const lines = body.split('\n')
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const withoutInlineCode = line.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))

    WIKI_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKI_RE.exec(withoutInlineCode))) {
      const parsed = splitWiki(m[2])
      if (!parsed.target && !parsed.heading) continue
      links.push({
        kind: 'wiki',
        target: parsed.target,
        heading: parsed.heading,
        block: parsed.block,
        alias: parsed.alias,
        embed: m[1] === '!',
        line: i + lineOffset
      })
    }

    MD_LINK_RE.lastIndex = 0
    while ((m = MD_LINK_RE.exec(withoutInlineCode))) {
      const href = m[3]
      if (/^(https?:|mailto:|tel:|data:|slate:)/i.test(href)) continue
      if (href.startsWith('#')) continue
      const [pathPart, heading] = href.split('#')
      if (!pathPart) continue
      links.push({
        kind: 'markdown',
        target: decodeURI(pathPart),
        heading: heading ? decodeURI(heading) : undefined,
        embed: m[1] === '!',
        line: i + lineOffset
      })
    }
  })
  return links
}

export function displayTarget(target: string): string {
  return stripExt(target.split('/').pop() ?? target)
}

/** Resolve a raw link target to a vault path, Obsidian style (shortest path wins). */
export class LinkResolver {
  private byPath = new Map<string, string>()
  private byName = new Map<string, string[]>()
  private byAlias = new Map<string, string>()
  private allPaths: string[]

  constructor(notes: Record<string, NoteMeta>) {
    this.allPaths = Object.keys(notes)
    for (const note of Object.values(notes)) {
      const full = note.path.toLowerCase()
      this.byPath.set(full, note.path)
      this.byPath.set(full.replace(/\.md$/, ''), note.path)
      const name = basename(note.path).toLowerCase().replace(/\.(md|markdown|mdx)$/, '')
      const list = this.byName.get(name) ?? []
      list.push(note.path)
      this.byName.set(name, list)
      for (const alias of note.aliases) {
        this.byAlias.set(alias.toLowerCase(), note.path)
      }
    }
    for (const list of this.byName.values()) list.sort()
  }

  resolve(target: string, source?: string): string | null {
    if (!target) return source ?? null
    let clean = target.trim().replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\/g, '/')
    clean = clean.replace(/\.(md|markdown|mdx)$/i, '')
    const lower = clean.toLowerCase()

    const exact = this.byPath.get(lower) ?? this.byPath.get(`${lower}.md`)
    if (exact) return exact

    const name = basename(lower)
    const candidates = this.byName.get(name)
    if (candidates && candidates.length) {
      if (candidates.length === 1) return candidates[0]
      if (source) {
        const dir = dirname(source)
        const siblings = candidates.filter((c) => dirname(c) === dir)
        if (siblings.length === 1) return siblings[0]
        const nested = candidates.filter((c) => c.toLowerCase().startsWith(`${lower}/`) || c.toLowerCase().endsWith(`/${lower}.md`))
        if (nested.length) return nested[0]
      }
      return candidates[0]
    }

    const alias = this.byAlias.get(lower)
    if (alias) return alias

    const suffixMatch = this.allPaths.find((p) => p.toLowerCase().endsWith(`/${lower}.md`))
    if (suffixMatch) return suffixMatch

    return null
  }
}

/** Resolve all links in an index in place and build backlinks. */
export function linkIndex(index: VaultIndex): void {
  const resolver = new LinkResolver(index.notes)
  const backlinks: Record<string, Backlink[]> = {}
  const unresolved: { source: string; target: string; line: number }[] = []

  for (const note of Object.values(index.notes)) {
    for (const link of note.links) {
      const resolved = resolver.resolve(link.target, note.path)
      link.resolved = resolved
      if (!resolved) {
        if (link.target) unresolved.push({ source: note.path, target: link.target, line: link.line })
        continue
      }
      const target = index.notes[resolved]
      const targetTitle = target ? target.title : stripExt(basename(resolved))
      if (!backlinks[resolved]) backlinks[resolved] = []
      backlinks[resolved].push({
        source: note.path,
        line: link.line,
        context: contextLine(note.body, link.line, targetTitle),
        embed: link.embed
      })
    }
  }

  for (const list of Object.values(backlinks)) {
    list.sort((a, b) => a.source.localeCompare(b.source))
  }
  index.backlinks = backlinks
  index.unresolved = unresolved
  index.tags = collectTags(index.notes)
}

function contextLine(body: string, line: number, needle: string): string {
  const lines = body.split('\n')
  const raw = (lines[line] ?? '').trim()
  if (raw.length > 0 && raw.length < 220) return raw
  const idx = body.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return raw.slice(0, 200)
  const start = Math.max(0, body.lastIndexOf('\n', idx) + 1)
  const end = body.indexOf('\n', idx)
  return body.slice(start, end === -1 ? undefined : end).trim().slice(0, 200)
}

function collectTags(notes: Record<string, NoteMeta>): TagInfo[] {
  const map = new Map<string, Set<string>>()
  for (const note of Object.values(notes)) {
    for (const tag of note.tags) {
      const set = map.get(tag) ?? new Set<string>()
      set.add(note.path)
      map.set(tag, set)
    }
  }
  return [...map.entries()]
    .map(([tag, paths]) => ({ tag, count: paths.size, paths: [...paths].sort() }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function noteMetaFromText(
  path: string,
  text: string,
  stat: { mtime: number; size: number } = { mtime: 0, size: 0 }
): NoteMeta {
  const { frontmatter, body } = splitFrontmatter(text)
  const inline = extractInlineTags(body)
  const fmTags = frontmatter ? normalizeStringList(frontmatter.tags ?? frontmatter.tag) : []
  const aliases = frontmatter
    ? normalizeStringList(frontmatter.aliases ?? frontmatter.alias)
    : []
  const excerpt = body
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_s, a, b) => b || a)
    .replace(/[`*>_~=-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
  return {
    path,
    title: stripExt(basename(path)),
    content: text,
    body,
    frontmatter,
    tags: [...new Set([...fmTags.map(normalizeTag), ...inline])].sort(),
    aliases,
    links: parseLinks(body).map((l) => ({ ...l, resolved: null })),
    headings: extractHeadings(body),
    words: wordCount(text),
    excerpt,
    mtime: stat.mtime,
    size: stat.size
  }
}

export function normalizeStringList(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') {
    return value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  return []
}

/* ---------- Building the index ---------- */

export async function buildVaultIndex(
  files: string[],
  read: (path: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void
): Promise<VaultIndex> {
  const noteFiles = files.filter((f) => isNote(f))
  const notes: Record<string, NoteMeta> = {}
  const folders = new Set<string>()
  let done = 0

  const concurrency = 8
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < noteFiles.length) {
      const idx = cursor++
      const file = noteFiles[idx]
      try {
        if (isCanvas(file)) {
          const text = await read(file)
          notes[file] = {
            path: file,
            title: stripExt(basename(file)),
            content: text,
            body: '',
            frontmatter: null,
            tags: [],
            aliases: [],
            links: [],
            headings: [],
            words: 0,
            excerpt: 'Canvas',
            mtime: 0,
            size: text.length
          }
        } else if (isMarkdown(file)) {
          const text = await read(file)
          notes[file] = noteMetaFromText(file, text)
        }
      } catch (err) {
        console.warn('[slate] could not index', file, err)
      }
      done++
      if (onProgress && done % 10 === 0) onProgress(done, noteFiles.length)
      const dir = dirname(file)
      if (dir) {
        const parts = dir.split('/')
        for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'))
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const index: VaultIndex = {
    notes,
    backlinks: {},
    tags: [],
    unresolved: [],
    folders: [...folders].sort(),
    builtAt: Date.now()
  }
  linkIndex(index)
  onProgress?.(noteFiles.length, noteFiles.length)
  return index
}

export function findUnlinkedMentions(
  index: VaultIndex,
  path: string
): { source: string; context: string }[] {
  const note = index.notes[path]
  if (!note) return []
  const needle = note.title.toLowerCase()
  if (needle.length < 3) return []
  const linked = new Set((index.backlinks[path] ?? []).map((b) => b.source))
  const results: { source: string; context: string }[] = []
  for (const other of Object.values(index.notes)) {
    if (other.path === path || linked.has(other.path)) continue
    const lower = other.body.toLowerCase()
    if (!lower.includes(needle)) continue
    const at = lower.indexOf(needle)
    const start = Math.max(0, other.body.lastIndexOf('\n', at) + 1)
    const end = other.body.indexOf('\n', at)
    results.push({ source: other.path, context: other.body.slice(start, end === -1 ? undefined : end).trim().slice(0, 200) })
  }
  return results
}

export function outgoingLinks(index: VaultIndex, path: string): ParsedLink[] {
  return index.notes[path]?.links.filter((l) => l.resolved) ?? []
}
