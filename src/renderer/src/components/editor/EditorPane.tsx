import { useEffect, useRef } from 'react'
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Code,
  Eye,
  FileDown,
  FileText,
  FolderOpen,
  History,
  MoreHorizontal,
  Pencil,
  PenLine,
  Trash2,
  Copy,
  ExternalLink
} from 'lucide-react'
import type { TabState } from '@shared/types'
import { api, resolveAttachment, useStore } from '../../state/store'
import { renderMarkdown, exportDocument } from '../../lib/markdown'
import { basename, dirname, isMarkdown, relativeTime } from '../../lib/utils'
import { MarkdownEditor } from './MarkdownEditor'
import { ReadingView } from './ReadingView'
import { registerExporter } from '../editorBridge'
import { useContextMenu } from '../ContextMenu'

interface Props {
  tab: TabState
  paneId: string
  active: boolean
}

export function EditorPane({ tab, paneId, active }: Props): React.JSX.Element {
  const path = tab.path ?? ''
  const content = useStore((s) => s.contents[path])
  const dirty = useStore((s) => Boolean(s.dirty[path]))
  const conflict = useStore((s) => Boolean(s.conflicts[path]))
  const bookmarked = useStore((s) => s.settings.bookmarks.includes(path))
  const mode = tab.mode ?? 'live'
  const typewriter = useStore((s) => s.typewriter)
  const editorSettings = useStore((s) => s.settings.editor)
  const readingRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef(content ?? '')
  contentRef.current = content ?? ''
  const menu = useContextMenu()

  useEffect(() => {
    if (content === undefined) void useStore.getState().loadContent(path)
  }, [path, content])

  useEffect(() => {
    const unregister = registerExporter(async (format) => {
      const state = useStore.getState()
      const current = state.contents[path] ?? ''
      const title = basename(path).replace(/\.[^.]+$/, '')
      if (format === 'markdown') {
        await api.export.markdown(current, title)
        state.toast('Exported Markdown', 'success')
        return
      }
      let body = readingRef.current?.querySelector('.reading-inner')?.innerHTML
      if (!body) {
        body = await renderMarkdown(current, {
          index: state.index,
          sourcePath: path,
          resolveAsset: (target, source) =>
            resolveAttachment(target, source, state.files, state.settings.attachmentsFolder)
        })
      }
      const css = collectCss()
      const dark = document.documentElement.dataset.theme === 'dark'
      const doc = exportDocument(title, body, css, dark)
      const result = format === 'pdf' ? await api.export.pdf(doc, title) : await api.export.html(doc, title)
      if (result.ok) state.toast(`Exported ${format.toUpperCase()}`, 'success')
    })
    return unregister
  }, [path])

  if (content === undefined) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 12 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!isMarkdown(path)) {
    return <NonMarkdownFile path={path} content={content} />
  }

  const meta = useStore.getState().index.notes[path]
  const folder = dirname(path)
  const backlinkCount = useStore.getState().index.backlinks[path]?.length ?? 0

  const openMenu = (event: React.MouseEvent): void => {
    menu.open(event, [
      { label: dirty ? 'Save now' : 'Saved', shortcut: '⌘S', icon: FileText, onSelect: () => void useStore.getState().saveNote(path) },
      { separator: true },
      {
        label: bookmarked ? 'Remove bookmark' : 'Bookmark note',
        icon: Bookmark,
        onSelect: () => useStore.getState().toggleBookmark(path)
      },
      { label: 'Rename…', icon: Pencil, onSelect: () => void useStore.getState().renamePath(path) },
      { label: 'Duplicate', icon: Copy, onSelect: () => void useStore.getState().duplicatePath(path) },
      { label: 'Copy vault path', icon: Copy, onSelect: () => void navigator.clipboard.writeText(path) },
      { label: 'Reveal in Finder', icon: ExternalLink, onSelect: () => void api.vault.reveal(path) },
      { separator: true },
      {
        label: 'Version history',
        icon: History,
        onSelect: () => useStore.getState().showModal({ type: 'history', path })
      },
      {
        label: 'Export as PDF',
        icon: FileDown,
        onSelect: () => void import('../editorBridge').then((m) => m.runExport('pdf'))
      },
      { separator: true },
      {
        label: 'Move to Trash',
        icon: Trash2,
        danger: true,
        onSelect: () => void useStore.getState().deletePath(path)
      }
    ])
  }

  const changeMode = (next: 'live' | 'source' | 'reading'): void => {
    useStore.setState((s) => ({
      panes: s.panes.map((p) =>
        p.id !== paneId
          ? p
          : {
              ...p,
              tabs: p.tabs.map((t) => (t.id === tab.id ? { ...t, mode: next } : t))
            }
      )
    }))
    useStore.getState().persistWorkspace()
  }

  return (
    <div className="note-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="pane-header">
        <div className="breadcrumb">
          {folder ? (
            <>
              {folder.split('/').map((part) => (
                <span key={part} style={{ display: 'contents' }}>
                  <span className="crumb">{part}</span>
                  <ChevronRight size={11} className="sep" />
                </span>
              ))}
            </>
          ) : null}
          <span className="crumb current">{basename(path).replace(/\.[^.]+$/, '')}</span>
        </div>

        <div className="sidebar-actions" style={{ opacity: 1 }}>
          {backlinkCount > 0 && (
            <button
              className="icon-btn"
              title={`${backlinkCount} backlink${backlinkCount === 1 ? '' : 's'}`}
              onClick={() => useStore.setState({ rightTab: 'backlinks', rightOpen: true })}
            >
              <span style={{ fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>{backlinkCount}</span>
            </button>
          )}
          <button
            className={`icon-btn${bookmarked ? ' active' : ''}`}
            title="Bookmark"
            onClick={() => useStore.getState().toggleBookmark(path)}
          >
            {bookmarked ? <BookmarkCheck size={15} strokeWidth={1.8} /> : <Bookmark size={15} strokeWidth={1.8} />}
          </button>
          <div className="segmented" style={{ marginLeft: 4 }}>
            <button className={mode === 'live' ? 'active' : ''} onClick={() => changeMode('live')} title="Live preview">
              <PenLine size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Live
            </button>
            <button className={mode === 'source' ? 'active' : ''} onClick={() => changeMode('source')} title="Source">
              <Code size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Source
            </button>
            <button className={mode === 'reading' ? 'active' : ''} onClick={() => changeMode('reading')} title="Reading view">
              <Eye size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
              Read
            </button>
          </div>
          <button className="icon-btn" onClick={openMenu} title="More actions">
            <MoreHorizontal size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {conflict && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 14px',
            background: 'color-mix(in srgb, #d29922 14%, transparent)',
            borderBottom: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--text-secondary)'
          }}
        >
          <span style={{ flex: 1 }}>This file has also changed on disk. Your local edits are still here.</span>
          <button className="btn sm" onClick={() => void useStore.getState().reloadFromDisk(path)}>
            Load disk version
          </button>
          <button
            className="btn sm"
            onClick={() => useStore.setState((s) => ({ conflicts: { ...s.conflicts, [path]: false } }))}
          >
            Keep mine
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {mode === 'reading' ? (
          <ReadingView
            path={path}
            content={content}
            containerRef={readingRef}
            onChange={(value) => useStore.getState().setContent(path, value)}
          />
        ) : (
          <MarkdownEditor
            key={path}
            path={path}
            initialContent={content}
            content={content}
            onChange={(value) => useStore.getState().setContent(path, value)}
            typewriter={typewriter}
            showLineNumbers={editorSettings.showLineNumbers && mode === 'source'}
            spellcheck={editorSettings.spellcheck}
          />
        )}

        <div className="floating-meta">
          <span style={{ fontSize: 10.5, color: 'var(--text-faint)', padding: '3px 6px' }}>
            {meta ? `${meta.words} words` : ''}
            {meta && meta.words > 0 ? ` · ${relativeTime(meta.mtime || Date.now())}` : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

function NonMarkdownFile({ path, content }: { path: string; content: string }): React.JSX.Element {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24, overflow: 'auto' }}>
        <img src={apiAsset(path)} alt={basename(path)} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
      </div>
    )
  }
  if (ext === 'pdf') {
    return <iframe title={basename(path)} src={apiAsset(path)} style={{ border: 'none', width: '100%', height: '100%' }} />
  }
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
        <video src={apiAsset(path)} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
      </div>
    )
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext)) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <audio src={apiAsset(path)} controls />
      </div>
    )
  }
  return (
    <div className="empty-hint" style={{ marginTop: 80 }}>
      <FileText size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
      <div>{basename(path)}</div>
      <div style={{ marginTop: 6, fontSize: 11 }}>This file type can’t be previewed inside Slate.</div>
      <button className="btn sm" style={{ marginTop: 14 }} onClick={() => void api.shell.openPath(path)}>
        <FolderOpen size={13} /> Open with default app
      </button>
      <div style={{ marginTop: 10, fontSize: 10.5, opacity: 0.6 }}>{content.length} bytes</div>
    </div>
  )
}

function apiAsset(path: string): string {
  return `slate://local/${encodeURI(path)}`
}

function collectCss(): string {
  const chunks: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText)
    } catch {
      /* cross-origin stylesheet */
    }
  }
  return chunks.join('\n')
}
