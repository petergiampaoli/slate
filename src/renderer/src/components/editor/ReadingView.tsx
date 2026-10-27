import { useEffect, useRef, useState } from 'react'
import { api, useStore } from '../../state/store'
import { renderMarkdown, notePathFromHref, taskLines, frontmatterTable } from '../../lib/markdown'
import { splitFrontmatter } from '../../lib/indexer'
import { resolveAttachment } from '../../state/store'
import { takePendingHeading, setPendingHeading } from '../editorBridge'
import { basename } from '../../lib/utils'

interface Props {
  path: string
  content: string
  containerRef?: React.RefObject<HTMLDivElement | null>
  onChange: (value: string) => void
}

export function ReadingView({ path, content, containerRef, onChange }: Props): React.JSX.Element {
  const [html, setHtml] = useState('')
  const hostRef = useRef<HTMLDivElement | null>(null)
  const themeMode = useStore((s) => s.settings.theme.mode)
  const index = useStore((s) => s.index)
  const files = useStore((s) => s.files)
  const attachments = useStore((s) => s.settings.attachmentsFolder)

  const setRefs = (node: HTMLDivElement | null): void => {
    hostRef.current = node
    if (containerRef) containerRef.current = node
  }

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      const state = useStore.getState()
      void renderMarkdown(content, {
        index: state.index,
        sourcePath: path,
        resolveAsset: (target, source) =>
          resolveAttachment(target, source, state.files, state.settings.attachmentsFolder)
      }).then((result) => {
        if (alive) setHtml(result)
      })
    }, 50)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [content, path, index, files, attachments])

  /* Mermaid diagrams */
  useEffect(() => {
    const host = hostRef.current
    if (!host || !html) return
    let cancelled = false
    const blocks = Array.from(host.querySelectorAll<HTMLElement>('pre > code.language-mermaid'))
    if (!blocks.length) return

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        const dark = document.documentElement.dataset.theme === 'dark'
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'var(--font-ui)',
          themeVariables: {
            darkMode: dark,
            background: dark ? '#1a1a1d' : '#fdfdfc',
            mainBkg: dark ? '#2a2a31' : '#f2f1fb',
            primaryColor: dark ? '#2a2a31' : '#f2f1fb',
            primaryTextColor: dark ? '#e4e4e7' : '#1c1c1e',
            nodeBorder: '#7c6cf0',
            primaryBorderColor: '#7c6cf0',
            lineColor: dark ? '#6b6b76' : '#a9a9b2',
            secondaryColor: dark ? '#232327' : '#f7f7f5',
            tertiaryColor: dark ? '#1c1c1f' : '#ffffff',
            clusterBkg: dark ? '#202024' : '#f7f7f5',
            titleColor: dark ? '#e4e4e7' : '#1c1c1e'
          }
        })
        let i = 0
        for (const code of blocks) {
          if (cancelled) return
          const pre = code.parentElement
          if (!pre) continue
          const source = code.textContent ?? ''
          try {
            const { svg } = await mermaid.render(`slate-mermaid-${Date.now()}-${i++}`, source)
            const wrap = document.createElement('div')
            wrap.className = 'mermaid-block'
            wrap.innerHTML = svg
            pre.replaceWith(wrap)
          } catch {
            pre.classList.add('mermaid-error')
          }
        }
      } catch (err) {
        console.warn('[slate] mermaid failed', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [html, themeMode])

  /* Interactive task checkboxes */
  useEffect(() => {
    const host = hostRef.current
    if (!host || !html) return
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('.task-list-item > input[type="checkbox"]'))
    if (!boxes.length) return
    const sourceLines = taskLines(content)
    const lines = content.split('\n')
    boxes.forEach((box, i) => {
      box.disabled = false
      box.removeAttribute('disabled')
      const lineNumber = sourceLines[i]
      if (lineNumber === undefined) return
      if (/\[[xX]\]/.test(lines[lineNumber] ?? '')) box.closest('.task-list-item')?.classList.add('is-done')
      box.addEventListener('change', () => {
        const current = useStore.getState().contents[path] ?? content
        const currentLines = current.split('\n')
        const line = currentLines[lineNumber]
        if (line === undefined) return
        currentLines[lineNumber] = box.checked
          ? line.replace(/\[ \]/, '[x]')
          : line.replace(/\[[xX]\]/, '[ ]')
        onChange(currentLines.join('\n'))
      })
    })
  }, [html, content, path, onChange])

  /* Jump to a heading requested by a link */
  useEffect(() => {
    if (!html) return
    const heading = takePendingHeading()
    if (!heading) return
    const host = hostRef.current
    if (!host) return
    const id = CSS.escape(heading)
    requestAnimationFrame(() => {
      const target =
        host.querySelector<HTMLElement>(`[id="${id}"]`) ??
        host.querySelector<HTMLElement>(`[id="${id.toLowerCase().replace(/\s+/g, '-')}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [html])

  const meta = index.notes[path]
  const props = meta ? frontmatterTable(meta) : []
  const { frontmatter } = splitFrontmatter(content)

  const handleClick = (event: React.MouseEvent): void => {
    const target = event.target as HTMLElement
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    const heading = anchor.dataset.heading

    if (anchor.classList.contains('tag')) {
      event.preventDefault()
      const tag = anchor.dataset.tag ?? anchor.textContent?.replace(/^#/, '') ?? ''
      useStore.getState().setSearchQuery(`tag:${tag}`)
      return
    }

    if (href.startsWith('slate://note/')) {
      event.preventDefault()
      const targetPath = notePathFromHref(href)
      setPendingHeading(heading ?? null)
      void useStore.getState().openNote(targetPath, {
        newTab: event.metaKey || event.ctrlKey,
        history: true
      })
      return
    }

    if (anchor.classList.contains('internal-link')) {
      event.preventDefault()
      useStore.getState().toast(`“${anchor.dataset.href}” doesn’t exist yet — create it with ⌘N`, 'info')
      return
    }

    if (/^https?:/i.test(href)) {
      event.preventDefault()
      void api.shell.openExternal(href)
    }
  }

  const visibleProps = props.filter((p) => !['position', 'cssclasses'].includes(p.key))
  const tags = Array.isArray(frontmatter?.tags)
    ? (frontmatter?.tags as unknown[]).map(String)
    : typeof frontmatter?.tags === 'string'
      ? String(frontmatter.tags).split(/[,;]/).map((t) => t.trim()).filter(Boolean)
      : []

  return (
    <div className="reading-host" ref={setRefs} onClick={handleClick}>
      <div className="reading-inner markdown-rendered">
        {visibleProps.length > 0 && (
          <div className="properties-card">
            {visibleProps.map((prop) => (
              <div className="pr" key={prop.key}>
                <span className="pk">{prop.key}</span>
                <span className="pv">
                  {tags.length > 0 && prop.key === 'tags'
                    ? tags.map((t) => (
                        <a key={t} className="tag-chip" href="#" data-tag={t.replace(/^#/, '')}>
                          {t.replace(/^#/, '')}
                        </a>
                      ))
                    : prop.value}
                </span>
              </div>
            ))}
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {meta && meta.words > 0 && (
          <div style={{ marginTop: 46, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
            {meta.words} words · {Math.max(1, Math.round(meta.words / 225))} min read · {basename(path)}
          </div>
        )}
      </div>
    </div>
  )
}
