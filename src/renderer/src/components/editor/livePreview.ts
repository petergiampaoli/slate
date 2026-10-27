import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { Extension, Text } from '@codemirror/state'

export interface LivePreviewOptions {
  openLink: (target: string, opts?: { newTab?: boolean; heading?: string }) => void
  openTag: (tag: string) => void
  resolveLink: (target: string) => string | null
  noteTitle: (path: string) => string
  resolveAsset: (target: string) => string
  assetUrl: (relative: string) => string
}

/* ------------------------------------------------------------------ */
/* Widgets                                                             */
/* ------------------------------------------------------------------ */

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number, readonly to: number) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('span')
    box.className = `cm-checkbox${this.checked ? ' checked' : ''}`
    box.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    box.title = this.checked ? 'Mark as unchecked' : 'Mark as done'
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      view.dispatch({ changes: { from: this.from, to: this.to, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent(): boolean {
    return false
  }
}

class BulletWidget extends WidgetType {
  constructor(readonly marker: string) {
    super()
  }
  eq(other: BulletWidget): boolean {
    return other.marker === this.marker
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = this.marker === '*' ? '•' : this.marker === '+' ? '◦' : '•'
    return span
  }
}

class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-widget-hr'
    return span
  }
}

class LinkWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly target: string,
    readonly resolved: string | null,
    readonly heading: string | undefined,
    readonly opts: LivePreviewOptions
  ) {
    super()
  }
  eq(other: LinkWidget): boolean {
    return (
      other.label === this.label && other.target === this.target && other.resolved === this.resolved
    )
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = this.resolved ? 'cm-wikilink' : 'cm-wikilink cm-wikilink-unresolved'
    span.textContent = this.label
    span.setAttribute('data-href', this.resolved ?? this.target)
    span.addEventListener('mousedown', (event) => {
      if (!this.resolved) return
      event.preventDefault()
      event.stopPropagation()
      this.opts.openLink(this.resolved, {
        newTab: event.metaKey || event.ctrlKey,
        heading: this.heading
      })
    })
    return span
  }
}

class EmbedWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly target: string,
    readonly resolved: string | null,
    readonly opts: LivePreviewOptions
  ) {
    super()
  }
  eq(other: EmbedWidget): boolean {
    return other.label === this.label && other.resolved === this.resolved
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-widget-embed'
    const title = document.createElement('div')
    title.className = 'cm-embed-title'
    title.textContent = this.resolved ? this.opts.noteTitle(this.resolved) : `${this.label} (not found)`
    const sub = document.createElement('span')
    sub.className = 'cm-embed-excerpt'
    sub.textContent = 'Embedded note — click to open'
    wrap.append(title, sub)
    if (this.resolved) {
      wrap.addEventListener('mousedown', (event) => {
        event.preventDefault()
        this.opts.openLink(this.resolved as string, { newTab: event.metaKey || event.ctrlKey })
      })
    }
    return wrap
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super()
  }
  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM(view: EditorView): HTMLElement {
    const img = document.createElement('img')
    img.className = 'cm-widget-image'
    img.src = this.src
    img.alt = this.alt
    img.loading = 'lazy'
    img.addEventListener('load', () => view.requestMeasure())
    img.addEventListener('error', () => {
      img.style.display = 'none'
      view.requestMeasure()
    })
    return img
  }
}

class CalloutTitleWidget extends WidgetType {
  constructor(readonly type: string, readonly title: string) {
    super()
  }
  eq(other: CalloutTitleWidget): boolean {
    return other.type === this.type && other.title === this.title
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-widget-callout-title'
    const icon = document.createElement('span')
    icon.className = 'cm-widget-callout-icon'
    icon.textContent = iconFor(this.type)
    span.appendChild(icon)
    span.appendChild(document.createTextNode(this.title))
    return span
  }
}

class FenceLangWidget extends WidgetType {
  constructor(readonly lang: string) {
    super()
  }
  eq(other: FenceLangWidget): boolean {
    return other.lang === this.lang
  }
  toDOM(): HTMLElement {
    const span = document.createElement('div')
    span.className = 'cm-fence-lang'
    span.textContent = this.lang || 'code'
    return span
  }
}

function iconFor(type: string): string {
  switch (type) {
    case 'tip':
    case 'hint':
      return '✦'
    case 'warning':
    case 'caution':
    case 'attention':
      return '⚠'
    case 'danger':
    case 'error':
    case 'failure':
    case 'fail':
    case 'bug':
      return '✕'
    case 'success':
    case 'check':
    case 'done':
      return '✓'
    case 'question':
    case 'help':
    case 'faq':
      return '?'
    case 'quote':
    case 'cite':
      return '❝'
    case 'example':
      return '❖'
    case 'abstract':
    case 'summary':
      return '▤'
    case 'todo':
      return '☑'
    case 'important':
      return '❗'
    default:
      return 'ℹ'
  }
}

/* ------------------------------------------------------------------ */
/* Fenced code detection                                               */
/* ------------------------------------------------------------------ */

interface FenceInfo {
  startLine: number
  endLine: number
  lang: string
}

function findFences(doc: Text): FenceInfo[] {
  const fences: FenceInfo[] = []
  let open: { line: number; lang: string } | null = null
  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text
    const m = /^\s{0,3}(```+|~~~+)\s*([\w+#.-]*)\s*$/.exec(text)
    if (!m) continue
    if (!open) {
      open = { line: i, lang: m[2] }
    } else {
      fences.push({ startLine: open.line, endLine: i, lang: open.lang })
      open = null
    }
  }
  if (open) fences.push({ startLine: open.line, endLine: doc.lines, lang: open.lang })
  return fences
}

function fenceAt(fences: FenceInfo[], line: number): FenceInfo | null {
  for (const f of fences) {
    if (line >= f.startLine && line <= f.endLine) return f
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

const HEADING_RE = /^(#{1,6})(\s+)/
const QUOTE_RE = /^(\s*>\s?)/
const CALLOUT_RE = /^(\s*>\s*)\[!([^\]]+)\][+-]?\s*/
const LIST_RE = /^(\s*)([-*+])(\s+)/
const TASK_RE = /^(\s*[-*+]\s+)\[([ xX])\]\s+/
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const TABLE_RE = /^\s*\|.*\|\s*$/

const INLINE_RULES: Array<{
  re: RegExp
  kind: 'marker' | 'replace'
  className?: string
  innerGroup?: number
}> = [
  { re: /\*\*(?!\s)([^*]+?)(?<!\s)\*\*/g, kind: 'marker', className: 'cm-strong' },
  { re: /(?<!\w)__(?!\s)([^_]+?)(?<!\s)__(?!\w)/g, kind: 'marker', className: 'cm-strong' },
  { re: /~~(?!\s)([^~]+?)(?<!\s)~~/g, kind: 'marker', className: 'cm-strike' },
  { re: /==(?!\s)([^=]+?)(?<!\s)==/g, kind: 'marker', className: 'cm-highlight' },
  { re: /(?<!`)`([^`\n]+?)`(?!`)/g, kind: 'marker', className: 'cm-inline-code' },
  { re: /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, kind: 'marker', className: 'cm-em' },
  { re: /(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, kind: 'marker', className: 'cm-em' }
]

function buildDecorations(view: EditorView, opts: LivePreviewOptions): DecorationSet {
  const state = view.state
  const doc = state.doc
  const decorations: Array<ReturnType<Decoration['range']>> = []
  const replaced: Array<[number, number]> = []
  const fences = findFences(doc)
  const frontmatterEnd = detectFrontmatterEnd(doc)

  const lineHasCursor = (from: number, to: number): boolean => {
    for (const range of state.selection.ranges) {
      if (range.from <= to && range.to >= from) return true
    }
    return false
  }

  const overlaps = (from: number, to: number): boolean =>
    replaced.some(([a, b]) => from < b && to > a)

  const replace = (from: number, to: number, spec: Parameters<typeof Decoration.replace>[0]): void => {
    if (to <= from || overlaps(from, to)) return
    replaced.push([from, to])
    decorations.push(Decoration.replace(spec).range(from, to))
  }

  const mark = (from: number, to: number, className: string, attrs?: Record<string, string>): void => {
    if (to <= from) return
    decorations.push(Decoration.mark({ class: className, attributes: attrs }).range(from, to))
  }

  const hide = (from: number, to: number): void => {
    if (to <= from) return
    replace(from, to, {})
  }

  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = doc.lineAt(pos)
      const text = line.text
      const lineStart = line.from
      const inFrontmatter = frontmatterEnd > 0 && line.number <= frontmatterEnd
      const fence = fenceAt(fences, line.number)
      const cursorOnLine = lineHasCursor(line.from, line.to)

      if (inFrontmatter) {
        decorations.push(Decoration.line({ class: 'cm-frontmatter' }).range(line.from))
        pos = line.to + 1
        continue
      }

      if (fence) {
        const isFirst = fence.startLine === line.number
        const isLast = fence.endLine === line.number
        const single = isFirst && isLast
        const classes = ['cm-codeblock']
        if (isFirst) classes.push('cm-codeblock-first')
        if (isLast) classes.push('cm-codeblock-last')
        if (single) classes.push('cm-codeblock-single')
        decorations.push(Decoration.line({ class: classes.join(' ') }).range(line.from))

        if (isFirst) {
          const m = /^(\s*)(```+|~~~+)\s*([\w+#.-]*)\s*$/.exec(text)
          if (m && !cursorOnLine) {
            const start = lineStart + m[1].length
            replace(start, line.to, { widget: new FenceLangWidget(m[3]) })
          }
        } else if (isLast && !single && !cursorOnLine && /^\s*(```+|~~~+)\s*$/.test(text)) {
          hide(line.from, line.to)
        }
        pos = line.to + 1
        continue
      }

      /* ---- headings ---- */
      const h = HEADING_RE.exec(text)
      if (h) {
        decorations.push(Decoration.line({ class: `cm-heading cm-h${h[1].length}` }).range(line.from))
        if (!cursorOnLine) hide(lineStart, lineStart + h[0].length)
      }

      /* ---- callouts ---- */
      const callout = CALLOUT_RE.exec(text)
      if (callout) {
        decorations.push(Decoration.line({ class: 'cm-callout' }).range(line.from))
        const type = callout[2].toLowerCase()
        const titleStart = lineStart + callout[0].length
        const rest = text.slice(callout[0].length)
        if (!cursorOnLine) {
          const title = rest.trim() || type.charAt(0).toUpperCase() + type.slice(1)
          replace(lineStart, line.to, { widget: new CalloutTitleWidget(type, title) })
        } else {
          hide(lineStart, titleStart)
        }
        pos = line.to + 1
        continue
      }

      /* ---- blockquotes ---- */
      const q = QUOTE_RE.exec(text)
      if (q) {
        decorations.push(Decoration.line({ class: 'cm-quote' }).range(line.from))
        if (!cursorOnLine) hide(lineStart, lineStart + q[1].length)
      }

      /* ---- horizontal rule ---- */
      if (HR_RE.test(text)) {
        replace(lineStart, line.to, { widget: new HrWidget() })
        pos = line.to + 1
        continue
      }

      /* ---- task checkboxes ---- */
      const task = TASK_RE.exec(text)
      if (task) {
        decorations.push(Decoration.line({ class: 'cm-list' }).range(line.from))
        const bulletStart = lineStart + task[1].length - 2
        const bracketStart = lineStart + task[0].indexOf('[')
        const checked = task[2].toLowerCase() === 'x'
        hide(bulletStart, bracketStart)
        replace(bracketStart, bracketStart + 3, {
          widget: new CheckboxWidget(checked, bracketStart + 1, bracketStart + 2)
        })
        if (checked) decorations.push(Decoration.line({ class: 'cm-task-done' }).range(line.from))
      } else {
        const list = LIST_RE.exec(text)
        if (list) {
          decorations.push(Decoration.line({ class: 'cm-list' }).range(line.from))
          const start = lineStart + list[1].length
          if (!cursorOnLine) {
            replace(start, start + list[2].length, { widget: new BulletWidget(list[2]) })
          }
        }
      }

      if (TABLE_RE.test(text)) {
        decorations.push(Decoration.line({ class: 'cm-table-line' }).range(line.from))
      }

      /* ---- embeds and images (before links) ---- */
      const embedRe = /!\[\[([^\]\n]+?)\]\]/g
      let m: RegExpExecArray | null
      while ((m = embedRe.exec(text))) {
        const inner = m[1]
        const pipe = inner.indexOf('|')
        const target = (pipe === -1 ? inner : inner.slice(0, pipe)).split('#')[0].trim()
        const label = pipe === -1 ? target : inner.slice(pipe + 1).trim()
        const from = lineStart + m.index
        const to = from + m[0].length
        if (isImageName(target)) {
          const resolved = opts.resolveAsset(target)
          replace(from, to, { widget: new ImageWidget(opts.assetUrl(resolved), label) })
        } else {
          const resolved = opts.resolveLink(target)
          replace(from, to, { widget: new EmbedWidget(label, target, resolved, opts) })
        }
      }

      const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
      while ((m = imgRe.exec(text))) {
        const from = lineStart + m.index
        const to = from + m[0].length
        const resolved = opts.resolveAsset(decodeURI(m[2]))
        replace(from, to, { widget: new ImageWidget(opts.assetUrl(resolved), m[1]) })
      }

      /* ---- wiki links ---- */
      const wikiRe = /\[\[([^\]\n]+?)\]\]/g
      while ((m = wikiRe.exec(text))) {
        const from = lineStart + m.index
        const to = from + m[0].length
        let inner = m[1]
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
        const resolved = opts.resolveLink(inner)
        const label = alias || (resolved ? opts.noteTitle(resolved) : inner) || heading || ''
        if (!cursorOnLine) {
          replace(from, to, { widget: new LinkWidget(label, inner, resolved, heading, opts) })
        } else {
          mark(from, to, resolved ? 'cm-wikilink' : 'cm-wikilink cm-wikilink-unresolved', {
            'data-href': resolved ?? inner
          })
        }
      }

      /* ---- markdown links ---- */
      const linkRe = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
      while ((m = linkRe.exec(text))) {
        const from = lineStart + m.index
        const to = from + m[0].length
        if (overlaps(from, to)) continue
        const href = m[2]
        if (/^(https?:|mailto:)/i.test(href)) {
          mark(from, to, 'cm-wikilink')
        } else {
          mark(from, to, 'cm-wikilink')
        }
      }

      /* ---- inline formatting ---- */
      for (const rule of INLINE_RULES) {
        rule.re.lastIndex = 0
        let mm: RegExpExecArray | null
        while ((mm = rule.re.exec(text))) {
          const from = lineStart + mm.index
          const to = from + mm[0].length
          if (overlaps(from, to)) continue
          if (rule.kind === 'replace') {
            const innerFrom = from + 1
            const innerTo = to - 1
            if (innerTo > innerFrom) {
              hide(from, innerFrom)
              hide(innerTo, to)
              mark(innerFrom, innerTo, rule.className ?? '')
            }
          } else {
            const inner = mm[1] ?? ''
            const innerFrom = from + (mm[0].length - inner.length) / 2
            const innerTo = innerFrom + inner.length
            if (innerTo > innerFrom) {
              hide(from, innerFrom)
              hide(innerTo, to)
              mark(innerFrom, innerTo, rule.className ?? '')
            }
          }
        }
      }

      /* ---- inline math ---- */
      const mathRe = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g
      while ((m = mathRe.exec(text))) {
        const from = lineStart + m.index
        if (overlaps(from, from + m[0].length)) continue
        hide(from, from + 1)
        hide(from + m[0].length - 1, from + m[0].length)
        mark(from + 1, from + m[0].length - 1, 'cm-inline-code')
      }

      /* ---- tags ---- */
      if (!cursorOnLine) {
        const tagRe = /(^|[\s([{>'"“‘])#([A-Za-z0-9_\u00C0-\uFFFF][\w\u00C0-\uFFFF/-]*)/g
        while ((m = tagRe.exec(text))) {
          const prefix = m[1] ?? ''
          const from = lineStart + m.index + prefix.length
          const to = from + 1 + m[2].length
          if (from === lineStart) continue
          if (overlaps(from, to)) continue
          mark(from, to, 'cm-tag', { 'data-tag': m[2] })
        }
      }

      pos = line.to + 1
    }
  }

  return Decoration.set(decorations, true)
}

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff)$/i.test(name.trim())
}

function detectFrontmatterEnd(doc: Text): number {
  if (doc.lines < 2) return 0
  if (doc.line(1).text.trim() !== '---') return 0
  for (let i = 2; i <= Math.min(doc.lines, 400); i++) {
    if (doc.line(i).text.trim() === '---') return i
  }
  return 0
}

export function livePreview(opts: LivePreviewOptions): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, opts)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged) {
          this.decorations = buildDecorations(update.view, opts)
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  )
}

export function cursorLine(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number
}
