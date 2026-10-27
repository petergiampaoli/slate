import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import type { NoteMeta, VaultIndex } from './indexer'
import { splitFrontmatter } from './indexer'
import { basename, escapeHtml, extname, isImage, slugify, dirname, joinPath } from './utils'

/* ------------------------------------------------------------------ */
/* A minimal mdast walker (avoids pulling in unist-util-visit)         */
/* ------------------------------------------------------------------ */

interface AnyNode {
  type: string
  value?: string
  url?: string
  title?: string
  children?: AnyNode[]
  data?: Record<string, unknown>
  [key: string]: unknown
}

function isCodeLike(node: AnyNode): boolean {
  return node.type === 'code' || node.type === 'inlineCode' || node.type === 'math' || node.type === 'inlineMath'
}

function walkText(parent: AnyNode, transform: (node: AnyNode) => AnyNode[] | null): void {
  if (!parent.children) return
  const next: AnyNode[] = []
  for (const child of parent.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      const replacement = transform(child)
      if (replacement) next.push(...replacement)
      else next.push(child)
    } else {
      if (!isCodeLike(child) && child.type !== 'link' && child.type !== 'image') walkText(child, transform)
      next.push(child)
    }
  }
  parent.children = next
}

/* ------------------------------------------------------------------ */
/* Wiki links, embeds and inline tags                                  */
/* ------------------------------------------------------------------ */

export interface RenderContext {
  notes: Record<string, NoteMeta>
  resolve: (target: string, source: string) => string | null
  assetUrl: (relative: string, source: string) => string
}

const WIKI_SPLIT = /(!?)\[\[([^\]\n]+?)\]\]/g
const TAG_SPLIT = /(^|[\s([{>'"“‘])#([A-Za-z0-9_\u00C0-\uFFFF][\w\u00C0-\uFFFF/-]*)/g

function wikiParts(inner: string): { target: string; heading?: string; alias?: string } {
  let alias: string | undefined
  const pipe = inner.indexOf('|')
  if (pipe !== -1) {
    alias = inner.slice(pipe + 1).trim()
    inner = inner.slice(0, pipe)
  }
  let heading: string | undefined
  const hash = inner.indexOf('#')
  if (hash !== -1) {
    heading = inner.slice(hash + 1).trim()
    inner = inner.slice(0, hash)
  }
  return { target: inner.trim(), heading, alias }
}

function makeLinkNode(
  href: string,
  text: string,
  className: string,
  extra: Record<string, string> = {}
): AnyNode {
  return {
    type: 'link',
    url: href,
    data: { hProperties: { className, ...extra } },
    children: [{ type: 'text', value: text }]
  }
}

function remarkSlateLinks(ctx: RenderContext, sourcePath: string) {
  return (tree: AnyNode): void => {
    walkText(tree, (node) => {
      const value = node.value ?? ''
      if (!value.includes('[[') && !value.includes('#')) return null
      const out: AnyNode[] = []
      let last = 0
      WIKI_SPLIT.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = WIKI_SPLIT.exec(value))) {
        if (match.index > last) out.push({ type: 'text', value: value.slice(last, match.index) })
        const embed = match[1] === '!'
        const parts = wikiParts(match[2])
        const resolved = ctx.resolve(parts.target, sourcePath)
        const targetNote = resolved ? ctx.notes[resolved] : null
        const display = parts.alias || (targetNote ? targetNote.title : parts.target) || parts.heading || ''

        if (embed) {
          if (isImage(parts.target)) {
            out.push({
              type: 'image',
              url: ctx.assetUrl(parts.target, sourcePath),
              alt: display,
              data: { hProperties: { className: 'embed-image' } }
            })
          } else if (resolved) {
            out.push({
              type: 'slateEmbed',
              data: {
                hName: 'div',
                hProperties: { className: 'note-embed', 'data-href': resolved }
              },
              children: [
                {
                  type: 'paragraph',
                  data: { hProperties: { className: 'note-embed-title' } },
                  children: [makeLinkNode(`slate://note/${encodeURI(resolved)}`, display, 'internal-link', { 'data-href': resolved })]
                },
                {
                  type: 'paragraph',
                  data: { hProperties: { className: 'note-embed-body' } },
                  children: [{ type: 'text', value: targetNote ? targetNote.excerpt.slice(0, 220) : '' }]
                }
              ]
            })
          } else {
            out.push(makeLinkNode('#', display, 'internal-link is-unresolved', { 'data-href': parts.target }))
          }
        } else {
          const suffix = parts.heading ? `#${parts.heading}` : ''
          const displayText = `${display}${parts.heading && !parts.alias ? ` › ${parts.heading}` : ''}`
          out.push(
            makeLinkNode(
              resolved ? `slate://note/${encodeURI(resolved)}${suffix ? `#${encodeURI(parts.heading!)}` : ''}` : '#',
              displayText || parts.target,
              resolved ? 'internal-link' : 'internal-link is-unresolved',
              { 'data-href': resolved ?? parts.target, ...(parts.heading ? { 'data-heading': parts.heading } : {}) }
            )
          )
        }
        last = match.index + match[0].length
      }
      if (last === 0) {
        // No wiki links, but the text may still contain tags.
        return tagTransform(value)
      }
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
      return flattenText(out, tagTransform)
    })

    function tagTransform(text: string): AnyNode[] | null {
      if (!text.includes('#')) return null
      const out: AnyNode[] = []
      let last = 0
      TAG_SPLIT.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = TAG_SPLIT.exec(text))) {
        const full = m[0]
        const prefix = m[1]
        const tag = m[2].replace(/[.,;:!?)]+$/, '')
        const start = m.index + prefix.length
        if (start > last) out.push({ type: 'text', value: text.slice(last, start) })
        out.push(
          makeLinkNode('#', `#${tag}`, 'tag', { 'data-tag': tag })
        )
        last = start + 1 + tag.length
        if (full.length > prefix.length + 1 + tag.length) {
          /* trailing punctuation is carried by the next slice */
        }
      }
      if (last === 0) return null
      if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
      return out
    }

    function flattenText(nodes: AnyNode[], tagFn: (t: string) => AnyNode[] | null): AnyNode[] {
      const out: AnyNode[] = []
      for (const node of nodes) {
        if (node.type === 'text' && typeof node.value === 'string') {
          const replaced = tagFn(node.value)
          if (replaced) out.push(...replaced)
          else out.push(node)
        } else {
          out.push(node)
        }
      }
      return out
    }
  }
}


/* ------------------------------------------------------------------ */
/* Highlight (==text==) and comments (%%hidden%%)                      */
/* ------------------------------------------------------------------ */

function remarkHighlights() {
  return (tree: AnyNode): void => {
    walkText(tree, (node) => {
      const value = node.value ?? ''
      if (!value.includes('==') && !value.includes('%%')) return null
      const out: AnyNode[] = []
      let last = 0
      const re = /==([^=\n]+?)==|%%[^%]*?%%/g
      let m: RegExpExecArray | null
      while ((m = re.exec(value))) {
        if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
        if (m[1] !== undefined) {
          out.push({ type: 'mark', data: { hName: 'mark' }, children: [{ type: 'text', value: m[1] }] })
        }
        last = m.index + m[0].length
      }
      if (last === 0) return null
      if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
      return out
    })
  }
}

/* ------------------------------------------------------------------ */
/* Standard markdown links → internal links / asset images             */
/* ------------------------------------------------------------------ */

function remarkInternalLinks(ctx: RenderContext, sourcePath: string) {
  return (tree: AnyNode): void => {
    const visit = (node: AnyNode): void => {
      if (!node.children) return
      for (const child of node.children) {
        if (child.type === 'link' && typeof child.url === 'string') {
          const url = child.url
          if (!/^(https?:|mailto:|tel:|data:|slate:|#)/i.test(url)) {
            const [rawPath, heading] = url.split('#')
            const decoded = decodeURI(rawPath)
            if (isImage(decoded)) {
              child.type = 'image'
              child.url = ctx.assetUrl(decoded, sourcePath)
            } else {
              const resolved = ctx.resolve(decoded, sourcePath)
              child.data = {
                ...(child.data ?? {}),
                hProperties: {
                  ...((child.data as { hProperties?: Record<string, string> } | undefined)?.hProperties ?? {}),
                  className: resolved ? 'internal-link' : 'internal-link is-unresolved',
                  'data-href': resolved ?? decoded,
                  ...(heading ? { 'data-heading': heading } : {})
                }
              }
              child.url = resolved ? `slate://note/${encodeURI(resolved)}` : '#'
            }
          }
        } else if (child.type === 'image' && typeof child.url === 'string') {
          if (!/^(https?:|data:|slate:)/i.test(child.url)) {
            child.url = ctx.assetUrl(decodeURI(child.url), sourcePath)
          }
        }
        visit(child)
      }
    }
    visit(tree)
  }
}

/* ------------------------------------------------------------------ */
/* Callouts                                                            */
/* ------------------------------------------------------------------ */

const CALLOUT_RE = /^\[!([^\]]+)\]([+-])?[ \t]*(.*)$/

function remarkCallouts() {
  const visit = (node: AnyNode): void => {
    if (!node.children) return
    for (const child of node.children) {
      if (child.type === 'blockquote' && child.children?.length) {
        const first = child.children[0]
        const textNode = first.type === 'paragraph' ? first.children?.[0] : undefined
        if (textNode && textNode.type === 'text' && typeof textNode.value === 'string') {
          const m = CALLOUT_RE.exec(textNode.value.split('\n')[0])
          if (m) {
            const type = m[1].trim().toLowerCase()
            const collapsed = m[2] === '-'
            const title = m[3].trim()
            const restLines = textNode.value.split('\n').slice(1).join('\n')
            textNode.value = restLines
            if (first.children && first.children.length > 0) {
              if (!textNode.value) first.children.shift()
            }
            const titleText = title || type.charAt(0).toUpperCase() + type.slice(1)
            const titleNode: AnyNode = {
              type: 'paragraph',
              data: {
                hName: 'div',
                hProperties: { className: 'callout-title' }
              },
              children: [
                { type: 'text', value: titleText }
              ]
            }
            child.children.unshift(titleNode)
            child.data = {
              hName: 'div',
              hProperties: {
                className: `callout callout-${type}${collapsed ? ' is-collapsed' : ''}`,
                'data-callout': type
              }
            }
            // Drop any now-empty leading paragraph left over from the marker line.
            const idx = child.children.indexOf(first)
            if (idx !== -1 && first.children && first.children.length === 0) child.children.splice(idx, 1)
          }
        }
      }
      visit(child)
    }
  }
  return (tree: AnyNode): void => visit(tree)
}

/* ------------------------------------------------------------------ */
/* Heading ids + safety                                                */
/* ------------------------------------------------------------------ */

function rehypeHeadingIds() {
  return (tree: AnyNode): void => {
    const seen = new Map<string, number>()
    const visit = (node: AnyNode): void => {
      if (node.type === 'element' && /^h[1-6]$/.test(String((node as unknown as { tagName: string }).tagName))) {
        const el = node as unknown as { tagName: string; properties: Record<string, unknown>; children?: AnyNode[] }
        const text = textContent(el as unknown as AnyNode)
        const base = slugify(text) || 'section'
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        el.properties = el.properties ?? {}
        el.properties.id = count ? `${base}-${count}` : base
      }
      if (node.children) for (const child of node.children) visit(child)
    }
    visit(tree)
  }
}

function textContent(node: AnyNode): string {
  if (node.type === 'text') return node.value ?? ''
  if (!node.children) return ''
  return node.children.map(textContent).join('')
}

const BLOCKED_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'])

function rehypeSafety() {
  return (tree: AnyNode): void => {
    const visit = (node: AnyNode): void => {
      if (!node.children) return
      node.children = node.children.filter((child) => {
        const el = child as unknown as { tagName?: string; properties?: Record<string, unknown> }
        if (el.tagName && BLOCKED_TAGS.has(el.tagName)) return false
        if (el.properties) {
          for (const key of Object.keys(el.properties)) {
            if (/^on/i.test(key) || (key === 'src' && /^javascript:/i.test(String(el.properties[key])))) {
              delete el.properties[key]
            }
          }
        }
        visit(child)
        return true
      })
    }
    visit(tree)
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface RenderOptions {
  index: VaultIndex
  sourcePath: string
  resolveAsset: (target: string, source: string) => string
}

export async function renderMarkdown(markdown: string, options: RenderOptions): Promise<string> {
  const { body } = splitFrontmatter(markdown)
  const { index, sourcePath } = options
  const ctx: RenderContext = {
    notes: index.notes,
    resolve: (target, source) => {
      if (!target) return source
      const clean = target.replace(/\.(md|markdown|mdx)$/i, '')
      const lower = clean.toLowerCase()
      const direct = index.notes[lower]
      if (direct) return direct.path
      const byName = Object.values(index.notes).filter(
        (n) => n.title.toLowerCase() === basename(lower).toLowerCase()
      )
      if (byName.length === 1) return byName[0].path
      if (byName.length > 1) {
        const sameDir = byName.find((n) => dirname(n.path) === dirname(source))
        return (sameDir ?? byName[0]).path
      }
      const alias = Object.values(index.notes).find((n) => n.aliases.some((a) => a.toLowerCase() === lower))
      if (alias) return alias.path
      return null
    },
    assetUrl: (relative, source) => `slate://local/${encodeURI(options.resolveAsset(relative, source))}`
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkHighlights)
    .use(remarkSlateLinks, ctx, sourcePath)
    .use(remarkInternalLinks, ctx, sourcePath)
    .use(remarkCallouts)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSafety)
    .use(rehypeHeadingIds)
    .use(rehypeKatex, { throwOnError: false, strict: false })
    .use(rehypeHighlight, { detect: false, ignoreMissing: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown.length ? body : '')

  return String(file)
}

/** All task-list source lines, in document order, so reading view checkboxes can be toggled. */
export function taskLines(markdown: string): number[] {
  const { body, bodyOffset } = splitFrontmatter(markdown)
  const lines = body.split('\n')
  const offsetLines = bodyOffset ? markdown.slice(0, bodyOffset).split('\n').length - 1 : 0
  const out: number[] = []
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) out.push(i + offsetLines)
  })
  return out
}

export function frontmatterTable(meta: NoteMeta): { key: string; value: string; type: string }[] {
  if (!meta.frontmatter) return []
  return Object.entries(meta.frontmatter).map(([key, value]) => {
    let display: string
    let type = 'text'
    if (Array.isArray(value)) {
      display = value.join(', ')
      type = 'list'
    } else if (value instanceof Date) {
      display = value.toISOString().slice(0, 10)
      type = 'date'
    } else if (typeof value === 'boolean') {
      display = String(value)
      type = 'checkbox'
    } else if (value && typeof value === 'object') {
      display = JSON.stringify(value)
      type = 'json'
    } else {
      display = value == null ? '' : String(value)
      if (/^\d{4}-\d{2}-\d{2}/.test(display)) type = 'date'
      else if (/^-?\d+(\.\d+)?$/.test(display)) type = 'number'
    }
    return { key, value: display, type }
  })
}

/** Standalone HTML document used for PDF / HTML export. */
export function exportDocument(title: string, bodyHtml: string, css: string, dark: boolean): string {
  return `<!doctype html>
<html data-theme="${dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
${css}
html, body { background: ${dark ? '#1a1a1d' : '#fdfdfc'}; }
body { margin: 0; padding: 48px 24px; }
.slate-export { max-width: 760px; margin: 0 auto; }
h1.title { font-size: 2.1em; margin: 0 0 0.3em; }
.meta { color: #8a8a93; font-size: 12px; margin-bottom: 2.4em; }
@page { margin: 0; }
</style>
</head>
<body>
<div class="slate-export">
<h1 class="title">${escapeHtml(title)}</h1>
<div class="meta">Exported from Slate · ${new Date().toLocaleDateString()}</div>
<div class="markdown-rendered">${bodyHtml}</div>
</div>
</body>
</html>`
}

export function isInternalHref(href: string): boolean {
  return href.startsWith('slate://note/')
}

export function notePathFromHref(href: string): string {
  return decodeURI(href.replace('slate://note/', '').split('#')[0])
}

export function isAssetHref(href: string): boolean {
  return href.startsWith('slate://local/')
}

export function looksLikeUrl(text: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(text.trim())
}

export function normalizeAssetTarget(target: string): string {
  return target.replace(/^\.\//, '').split('#')[0].split('|')[0].trim()
}

export function fileExt(p: string): string {
  return extname(p)
}

export function folderOf(p: string): string {
  return joinPath(dirname(p))
}
