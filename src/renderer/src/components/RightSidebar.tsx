import { useMemo, useState } from 'react'
import { stringify } from 'yaml'
import {
  ExternalLink,
  FileText,
  Link2,
  ListTree,
  Plus,
  Tags,
  Trash2,
  Unlink,
  X
} from 'lucide-react'
import { useStore, useCurrentNote } from '../state/store'
import { splitFrontmatter, findUnlinkedMentions, normalizeStringList } from '../lib/indexer'
import { api } from '../state/store'
import { basename, dirname, truncate } from '../lib/utils'
import { cn } from '../lib/utils'
import { GraphView } from './graph/GraphView'
import { editorCommand } from './editorBridge'
import { useContextMenu } from './ContextMenu'

export function RightSidebar(): React.JSX.Element {
  const tab = useStore((s) => s.rightTab)
  const path = useCurrentNote()

  return (
    <div className="sidebar right" style={{ width: '100%' }}>
      <div className="panel-tabs">
        {(
          [
            ['backlinks', 'Backlinks', Link2],
            ['outline', 'Outline', ListTree],
            ['properties', 'Properties', Tags],
            ['localgraph', 'Graph', ExternalLink]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            className={cn('panel-tab', tab === id && 'active')}
            onClick={() => useStore.setState({ rightTab: id })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sidebar-body" style={{ padding: '4px 6px 20px' }}>
        {!path && <div className="empty-hint">Open a note to see its links, outline and properties.</div>}
        {path && tab === 'backlinks' && <BacklinksPanel path={path} />}
        {path && tab === 'outline' && <OutlinePanel path={path} />}
        {path && tab === 'properties' && <PropertiesPanel path={path} />}
        {path && tab === 'localgraph' && (
          <div style={{ height: 'calc(100vh - 190px)', margin: '0 -6px', borderTop: '1px solid var(--border)' }}>
            <GraphView mode="local" seed={path} />
          </div>
        )}
      </div>
    </div>
  )
}

function BacklinksPanel({ path }: { path: string }): React.JSX.Element {
  const index = useStore((s) => s.index)
  const [showUnlinked, setShowUnlinked] = useState(false)
  const backlinks = index.backlinks[path] ?? []
  const outgoing = useMemo(
    () => (index.notes[path]?.links ?? []).filter((l) => l.resolved),
    [index, path]
  )
  const unlinked = useMemo(
    () => (showUnlinked ? findUnlinkedMentions(index, path) : []),
    [index, path, showUnlinked]
  )

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">
          Linked mentions <span className="count">{backlinks.length}</span>
        </div>
        {backlinks.length === 0 && <div className="empty-hint" style={{ padding: '6px 8px 14px' }}>No backlinks yet.</div>}
        {backlinks.map((link, i) => (
          <div
            key={`${link.source}-${link.line}-${i}`}
            className="backlink"
            onClick={(e) => void useStore.getState().openNote(link.source, { newTab: e.metaKey || e.ctrlKey })}
            title={link.source}
          >
            <div className="backlink-title">
              <FileText size={12} strokeWidth={1.7} style={{ opacity: 0.6 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {index.notes[link.source]?.title ?? basename(link.source)}
              </span>
              {dirname(link.source) && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>{dirname(link.source)}</span>
              )}
            </div>
            <div className="backlink-context">{cleanContext(link.context)}</div>
          </div>
        ))}
      </div>

      <div className="panel-section">
        <div className="panel-section-title">
          Unlinked mentions
          <button
            className={cn('icon-btn', showUnlinked && 'active')}
            style={{ marginLeft: 'auto', width: 20, height: 20 }}
            onClick={() => setShowUnlinked((v) => !v)}
            title={showUnlinked ? 'Hide' : 'Scan for unlinked mentions'}
          >
            <Unlink size={12} />
          </button>
        </div>
        {showUnlinked && unlinked.length === 0 && (
          <div className="empty-hint" style={{ padding: '6px 8px 14px' }}>No unlinked mentions.</div>
        )}
        {unlinked.slice(0, 20).map((mention, i) => (
          <div
            key={`${mention.source}-${i}`}
            className="backlink"
            onClick={(e) => void useStore.getState().openNote(mention.source, { newTab: e.metaKey || e.ctrlKey })}
          >
            <div className="backlink-title">
              <FileText size={12} strokeWidth={1.7} style={{ opacity: 0.6 }} />
              {index.notes[mention.source]?.title ?? basename(mention.source)}
            </div>
            <div className="backlink-context">{cleanContext(mention.context)}</div>
          </div>
        ))}
      </div>

      <div className="panel-section">
        <div className="panel-section-title">
          Outgoing links <span className="count">{outgoing.length}</span>
        </div>
        {outgoing.length === 0 && <div className="empty-hint" style={{ padding: '6px 8px 14px' }}>This note links nowhere yet.</div>}
        {outgoing.map((link, i) => (
          <div
            key={`${link.resolved}-${i}`}
            className="tree-row"
            style={{ height: 25 }}
            onClick={() => void useStore.getState().openNote(link.resolved as string, { history: true })}
          >
            <span style={{ width: 12 }} />
            <span className="tree-icon">
              <FileText size={12} strokeWidth={1.7} />
            </span>
            <span className="tree-label">
              {index.notes[link.resolved as string]?.title ?? link.target}
              {link.heading ? ` › ${link.heading}` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function OutlinePanel({ path }: { path: string }): React.JSX.Element {
  const meta = useStore((s) => s.index.notes[path])
  const headings = meta?.headings ?? []
  const [active, setActive] = useState<string | null>(null)

  if (!headings.length) {
    return <div className="empty-hint">No headings in this note.</div>
  }

  return (
    <div style={{ paddingTop: 2 }}>
      {headings.map((heading) => (
        <div
          key={`${heading.line}-${heading.id}`}
          className={cn('outline-row', active === heading.id && 'active')}
          style={{ paddingLeft: 6 + (heading.level - 1) * 12 }}
          title={heading.text}
          onClick={() => {
            setActive(heading.id)
            const mode = useStore.getState().activeTab()?.mode
            if (mode === 'reading') {
              const el = document.querySelector(`.reading-host [id="${CSS.escape(heading.id)}"]`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } else {
              editorCommand('scroll-to-heading', heading)
            }
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            {heading.level > 1 && <span className="outline-dot" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{heading.text}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function PropertiesPanel({ path }: { path: string }): React.JSX.Element {
  const content = useStore((s) => s.contents[path] ?? '')
  const menu = useContextMenu()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const parsed = splitFrontmatter(content)
  const entries = Object.entries(parsed.frontmatter ?? {})

  const write = (next: Record<string, unknown>): void => {
    const body = parsed.body
    const fm = Object.keys(next).length
      ? `---\n${stringify(next, { lineWidth: 0 }).trimEnd()}\n---\n`
      : ''
    useStore.getState().setContent(path, fm + body)
  }

  const commit = (key: string, value: string): void => {
    const next = { ...(parsed.frontmatter ?? {}) }
    if (!value.trim()) {
      delete next[key]
      write(next)
      setEditing(null)
      return
    }
    const previous = next[key]
    if (key === 'tags' || key === 'aliases' || key === 'alias' || Array.isArray(previous)) {
      next[key] = value.split(',').map((v) => v.trim()).filter(Boolean)
    } else if (typeof previous === 'boolean') {
      next[key] = value === 'true'
    } else if (typeof previous === 'number' && !Number.isNaN(Number(value))) {
      next[key] = Number(value)
    } else {
      next[key] = value
    }
    write(next)
    setEditing(null)
  }

  const addProperty = (): void => {
    useStore.getState().showModal({
      type: 'prompt',
      title: 'Add property',
      label: 'Format: key: value',
      value: '',
      placeholder: 'status: active',
      submitLabel: 'Add',
      onSubmit: (value) => {
        const idx = value.indexOf(':')
        const key = (idx === -1 ? value : value.slice(0, idx)).trim()
        const raw = idx === -1 ? '' : value.slice(idx + 1).trim()
        if (!key) return
        const next = { ...(parsed.frontmatter ?? {}) }
        next[key] = key === 'tags' || key === 'aliases' ? raw.split(',').map((v) => v.trim()).filter(Boolean) : raw
        write(next)
        useStore.getState().hideModal()
      }
    })
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">
          Properties
          <button className="icon-btn" style={{ marginLeft: 'auto', width: 22, height: 22 }} onClick={addProperty} title="Add property">
            <Plus size={13} />
          </button>
        </div>
        {entries.length === 0 && (
          <div className="empty-hint" style={{ padding: '6px 8px 16px' }}>
            No properties. Add YAML frontmatter to this note.
          </div>
        )}
        {entries.map(([key, value]) => (
          <div
            className="prop-row"
            key={key}
            onContextMenu={(e) =>
              menu.open(e, [
                { label: 'Edit value', onSelect: () => { setEditing(key); setDraft(stringifyValue(value)) } },
                { label: 'Copy value', onSelect: () => void navigator.clipboard.writeText(stringifyValue(value)) },
                {
                  label: 'Remove property',
                  danger: true,
                  icon: Trash2,
                  onSelect: () => {
                    const next = { ...(parsed.frontmatter ?? {}) }
                    delete next[key]
                    write(next)
                  }
                }
              ])
            }
          >
            <div className="prop-key" title={key}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{key}</span>
            </div>
            <div className="prop-value">
              {editing === key ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(key, draft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(key, draft)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : Array.isArray(value) ? (
                <span onClick={() => { setEditing(key); setDraft(stringifyValue(value)) }}>
                  {value.map((v) => (
                    <span className="prop-chip" key={String(v)}>
                      {String(v)}
                    </span>
                  ))}
                </span>
              ) : (
                <span
                  style={{ cursor: 'text' }}
                  onClick={() => {
                    setEditing(key)
                    setDraft(stringifyValue(value))
                  }}
                >
                  {String(value)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value == null) return ''
  return String(value)
}

function cleanContext(text: string): string {
  return truncate(
    text
      .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_s, a, b) => b || a)
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`>#]/g, '')
      .trim(),
    180
  )
}

export { api, normalizeStringList, X }
