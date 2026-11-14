import { dirname, isMarkdown, joinPath } from './utils'

export type FindScope = 'note' | 'folder' | 'vault'

export interface FindOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regexp: boolean
}

export interface FindMatch {
  from: number
  to: number
  text: string
  groups: string[]
}

export interface MatchGroup {
  path: string
  matches: FindMatch[]
}

export interface ReplaceResult {
  text: string
  count: number
}

export function normaliseOptions(options: Partial<FindOptions>): FindOptions {
  return {
    caseSensitive: Boolean(options.caseSensitive),
    wholeWord: Boolean(options.wholeWord),
    regexp: Boolean(options.regexp)
  }
}

/** Build a global regex for a query, or null when the query is empty/invalid. */
export function buildPattern(query: string, options: FindOptions): RegExp | null {
  if (!query) return null
  const flags = `g${options.caseSensitive ? '' : 'i'}`
  if (options.regexp) {
    try {
      return new RegExp(query, flags)
    } catch {
      return null
    }
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const source = options.wholeWord ? `\\b${escaped}\\b` : escaped
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

export function findMatches(text: string, query: string, options: FindOptions, limit = 5000): FindMatch[] {
  const pattern = buildPattern(query, options)
  if (!pattern) return []
  const matches: FindMatch[] = []
  let match: RegExpExecArray | null
  let guard = 0
  while ((match = pattern.exec(text)) && matches.length < limit && guard++ < limit * 2) {
    if (match[0].length === 0) {
      pattern.lastIndex++
      continue
    }
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0],
      groups: match.slice(1).map((group) => group ?? '')
    })
  }
  return matches
}

function expandReplacement(replacement: string, match: RegExpExecArray): string {
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (_token, token: string) => {
    if (token === '$') return '$'
    if (token === '&') return match[0]
    const index = Number(token)
    return match[index] ?? ''
  })
}

export function replaceAllMatches(
  text: string,
  query: string,
  options: FindOptions,
  replacement: string
): ReplaceResult {
  const pattern = buildPattern(query, options)
  if (!pattern) return { text, count: 0 }
  let count = 0
  const result = text.replace(pattern, (...args) => {
    count++
    if (options.regexp) {
      const match = args.slice(0, -2) as unknown as RegExpExecArray
      // rebuild a match-like array for group expansion
      const values = args.slice(0, -2) as string[]
      const fake = Object.assign([...values], {
        index: args[args.length - 2] as number,
        input: args[args.length - 1] as string
      }) as unknown as RegExpExecArray
      return expandReplacement(replacement, fake)
    }
    return replacement
  })
  return { text: result, count }
}

export function scopeLabel(
  scope: FindScope,
  activePath: string | null,
  selectedFolder: string | null
): string {
  if (scope === 'note') return activePath ? activePath : 'No note open'
  if (scope === 'vault') return 'Whole vault'
  const folder = selectedFolder !== null ? selectedFolder : activePath ? dirname(activePath) : ''
  return folder ? `/${folder}` : 'Vault root'
}

/** Notes included by a scope. Folder scope includes subfolders. */
export function filesForScope(
  scope: FindScope,
  allFiles: string[],
  activePath: string | null,
  selectedFolder: string | null
): string[] {
  const notes = allFiles.filter((file) => isMarkdown(file))
  if (scope === 'vault') return notes
  if (scope === 'note') return activePath && isMarkdown(activePath) ? [activePath] : []
  const folder = selectedFolder !== null ? selectedFolder : activePath ? dirname(activePath) : ''
  if (!folder) return notes.filter((file) => !dirname(file))
  return notes.filter((file) => file === folder ? false : dirname(file) === folder || file.startsWith(`${folder}/`))
}

/** Files in a folder recursively, for a folder-scoped replace. */
export function folderForScope(activePath: string | null, selectedFolder: string | null): string {
  if (activePath) return dirname(activePath)
  if (selectedFolder !== null) return selectedFolder
  return ''
}

export function resultSnippet(text: string, match: FindMatch, radius = 70): string {
  const start = Math.max(0, match.from - radius)
  const end = Math.min(text.length, match.to + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`
}

export function fileLabel(path: string): string {
  const folder = dirname(path)
  return folder ? `${path.split('/').pop()} · ${folder}` : path.split('/').pop() ?? path
}

export function joinFolder(folder: string, name: string): string {
  return joinPath(folder, name)
}
