import { splitFrontmatter } from './indexer'
import { basename, dirname, joinPath, stripExt } from './utils'

const H1_RE = /^\s{0,3}#\s+(.+?)\s*#*\s*$/

/** Strip light markdown formatting from a title line. */
export function plainTitle(raw: string): string {
  return raw
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|==|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first H1 near the top of the note (after frontmatter), if any. */
export function extractTitle(content: string): string | null {
  const { body } = splitFrontmatter(content)
  const lines = body.split('\n')
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const match = H1_RE.exec(lines[i])
    if (match) {
      const title = plainTitle(match[1])
      return title || null
    }
  }
  return null
}

/** The line index (0-based, in the full document) of the title heading, or -1. */
export function titleLineIndex(content: string): number {
  const { body, bodyOffset } = splitFrontmatter(content)
  const offset = bodyOffset ? content.slice(0, bodyOffset).split('\n').length - 1 : 0
  const lines = body.split('\n')
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (H1_RE.test(lines[i])) return i + offset
  }
  return -1
}

/** Insert or replace the note's title heading without disturbing frontmatter. */
export function setNoteTitle(content: string, title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  const { body, bodyOffset } = splitFrontmatter(content)
  const lines = body.split('\n')
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (H1_RE.test(lines[i])) {
      lines[i] = `# ${clean}`
      return content.slice(0, bodyOffset) + lines.join('\n')
    }
  }
  const rest = body.replace(/^\n+/, '')
  const prefix = content.slice(0, bodyOffset)
  return `${prefix}# ${clean}\n\n${rest}`
}

/** Filesystem-safe version of a title. */
export function sanitizeTitle(title: string): string {
  return title
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 120)
}

export function titleFromPath(path: string): string {
  return stripExt(basename(path))
}

export function notePathForTitle(path: string, title: string): string {
  return joinPath(dirname(path), `${sanitizeTitle(title) || 'Untitled'}.md`)
}

/** Daily notes and templates intentionally use headings that differ from their filenames. */
export function isTitleManaged(path: string, settings: { dailyNotes: { folder: string }; templatesFolder: string }): boolean {
  if (path.startsWith('.slate/')) return false
  if (path.toLowerCase().endsWith('.canvas')) return false
  const excluded = [settings.dailyNotes?.folder, settings.templatesFolder]
    .filter(Boolean)
    .map((folder) => folder.replace(/^\/+|\/+$/g, ''))
  return !excluded.some((folder) => path === folder || path.startsWith(`${folder}/`))
}
