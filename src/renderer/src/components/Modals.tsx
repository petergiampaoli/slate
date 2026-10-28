import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CornerDownLeft,
  FilePlus,
  FileText,
  History,
  Search,
  Command as CommandIcon,
  Sparkles,
  RotateCcw
} from 'lucide-react'
import type { GitCommit } from '@shared/types'
import { api, useStore, type ModalState } from '../state/store'
import { buildCommands, type Command } from './commands'
import { quickSwitcherItems, fuzzyFind } from '../lib/search'
import { cn, dirname, relativeTime, stripExt } from '../lib/utils'
import { HOTKEYS } from './hotkeys'
import { DictationOverlay } from './dictation/DictationOverlay'

export function ModalHost(): React.JSX.Element {
  const modal = useStore((s) => s.modal)
  if (!modal) return <></>
  switch (modal.type) {
    case 'command-palette':
      return <CommandPalette />
    case 'quick-switcher':
      return <QuickSwitcher />
    case 'settings':
      return <SettingsModalLazy section={modal.section} />
    case 'prompt':
      return <PromptDialog modal={modal} />
    case 'confirm':
      return <ConfirmDialog modal={modal} />
    case 'history':
      return <HistoryModal path={modal.path} />
    case 'shortcuts':
      return <ShortcutsModal />
    case 'dictation':
      return <DictationOverlay />
    case 'template-picker':
      return <TemplatePicker />
    default:
      return <></>
  }
}

function SettingsModalLazy({ section }: { section?: string }): React.JSX.Element {
  const [Comp, setComp] = useState<null | React.ComponentType<{ initial?: string; embedded?: boolean }>>(null)
  useEffect(() => {
    void import('./SettingsView').then((m) => setComp(() => m.SettingsView))
  }, [])
  if (!Comp) return <></>
  return <Comp initial={section} />
}

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
/* ------------------------------------------------------------------ */

function CommandPalette(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo(() => buildCommands(), [])
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands
      .map((command) => {
        const label = command.label.toLowerCase()
        const idx = label.indexOf(q)
        let score = 0
        if (idx === 0) score = 100
        else if (idx > 0) score = 60 - idx
        else if (command.group.toLowerCase().includes(q)) score = 20
        else if (label.split(/\s+/).some((word) => word.startsWith(q))) score = 40
        return { command, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command)
  }, [commands, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelected(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.palette-item.selected')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = (command: Command): void => {
    useStore.getState().hideModal()
    window.setTimeout(() => void command.run(), 30)
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((i) => Math.min(filtered.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = filtered[selected]
      if (command) run(command)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="palette">
        <div className="palette-input-row">
          <CommandIcon size={17} style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command…"
            spellCheck={false}
          />
          <span className="palette-hint">esc</span>
        </div>
        <div className="palette-results" ref={listRef}>
          {filtered.length === 0 && <div className="palette-empty">No matching commands</div>}
          {filtered.map((command, i) => {
            const showGroup = i === 0 || filtered[i - 1].group !== command.group
            return (
              <div key={command.id}>
                {showGroup && <div className="palette-group">{command.group}</div>}
                <button
                  className={cn('palette-item', i === selected && 'selected')}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => run(command)}
                >
                  <span className="ico">{command.icon ? <command.icon size={15} strokeWidth={1.8} /> : <ArrowRight size={15} />}</span>
                  <span className="label">{command.label}</span>
                  {command.detail && <span className="sub">{command.detail}</span>}
                  {command.hotkey && <span className="hotkey">{command.hotkey}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Quick switcher                                                      */
/* ------------------------------------------------------------------ */

function QuickSwitcher(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const index = useStore((s) => s.index)
  const notes = useStore((s) => s.index.notes)

  const items = useMemo(() => quickSwitcherItems(index), [index])
  const results = useMemo(() => fuzzyFind(items, query, 50), [items, query])
  const canCreate = query.trim().length > 0 && !results.some((r) => r.title.toLowerCase() === query.trim().toLowerCase())

  useEffect(() => {
    inputRef.current?.focus()
    setSelected(0)
  }, [query])

  const open = (path: string, newTab: boolean): void => {
    useStore.getState().hideModal()
    void useStore.getState().openNote(path, { newTab, history: true })
  }

  const create = (): void => {
    const name = query.trim()
    if (!name) return
    useStore.getState().hideModal()
    void useStore.getState().createNote({ name, open: true })
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((i) => Math.min(results.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (canCreate && results.length === 0) {
        create()
        return
      }
      const item = results[selected]
      if (item) open(item.path, event.metaKey)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="palette">
        <div className="palette-input-row">
          <Search size={17} style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a note…"
            spellCheck={false}
          />
          <span className="palette-hint">⇧↵ new tab</span>
        </div>
        <div className="palette-results">
          {canCreate && (
            <button
              className={cn('palette-item', selected === 0 && results.length === 0 && 'selected')}
              onClick={create}
            >
              <span className="ico">
                <FilePlus size={15} strokeWidth={1.8} />
              </span>
              <span className="label">Create “{query.trim()}”</span>
              <span className="sub">new note</span>
            </button>
          )}
          {results.map((item, i) => (
            <button
              key={item.path}
              className={cn('palette-item', i === selected && 'selected')}
              onMouseEnter={() => setSelected(i)}
              onClick={(e) => open(item.path, e.metaKey)}
            >
              <span className="ico">
                <FileText size={15} strokeWidth={1.8} />
              </span>
              <span className="label">{item.title}</span>
              <span className="sub">{item.subtitle || 'vault root'}</span>
            </button>
          ))}
          {results.length === 0 && !canCreate && <div className="palette-empty">No notes found</div>}
          {results.length === 0 && canCreate && <div className="palette-empty">Press ↵ to create a note</div>}
        </div>
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '7px 14px',
            fontSize: 10.5,
            color: 'var(--text-faint)',
            display: 'flex',
            gap: 12
          }}
        >
          <span>
            <CornerDownLeft size={10} style={{ verticalAlign: -1 }} /> open
          </span>
          <span>⇧↵ new tab</span>
          <span style={{ marginLeft: 'auto' }}>{Object.keys(notes).length} notes</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dialogs                                                             */
/* ------------------------------------------------------------------ */

function PromptDialog({ modal }: { modal: Extract<ModalState, { type: 'prompt' }> }): React.JSX.Element {
  const [value, setValue] = useState(modal.value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = (): void => {
    void modal.onSubmit(value)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="dialog">
        <h3>{modal.title}</h3>
        {modal.label && <div className="dialog-message">{modal.label}</div>}
        <div className="dialog-body">
          <input
            ref={inputRef}
            value={value}
            placeholder={modal.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') useStore.getState().hideModal()
            }}
          />
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={() => useStore.getState().hideModal()}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {modal.submitLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ modal }: { modal: Extract<ModalState, { type: 'confirm' }> }): React.JSX.Element {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="dialog">
        <h3>{modal.title}</h3>
        <div className="dialog-message">{modal.message}</div>
        <div className="dialog-actions">
          <button className="btn" onClick={() => useStore.getState().hideModal()}>
            Cancel
          </button>
          <button
            className={cn('btn', modal.danger ? 'danger' : 'primary')}
            onClick={() => void modal.onConfirm()}
          >
            {modal.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Version history                                                     */
/* ------------------------------------------------------------------ */

function HistoryModal({ path }: { path: string }): React.JSX.Element {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [selected, setSelected] = useState<GitCommit | null>(null)
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void api.git
      .fileHistory(path)
      .then((list) => {
        setCommits(list)
        if (list[0]) {
          setSelected(list[0])
          void api.git.show(list[0].hash, path).then(setPreview)
        }
      })
      .finally(() => setLoading(false))
  }, [path])

  const choose = async (commit: GitCommit): Promise<void> => {
    setSelected(commit)
    setPreview(await api.git.show(commit.hash, path))
  }

  const restore = (): void => {
    if (!selected) return
    useStore.setState({
      modal: {
        type: 'confirm',
        title: 'Restore this version?',
        message: `“${stripExt(path.split('/').pop() ?? path)}” will be replaced with the version from ${new Date(selected.date).toLocaleString()}. The current version stays in git history.`,
        confirmLabel: 'Restore',
        onConfirm: async () => {
          await api.git.restore(selected.hash, path)
          await useStore.getState().reloadFromDisk(path)
          useStore.getState().hideModal()
          useStore.getState().toast('Version restored', 'success')
        }
      }
    })
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="dialog" style={{ width: 'min(760px, calc(100vw - 80px))', marginTop: '10vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <History size={16} />
          <h3 style={{ margin: 0 }}>Version history</h3>
        </div>
        <div className="dialog-message">{path}</div>

        {loading && <div className="help">Reading git history…</div>}
        {!loading && commits.length === 0 && (
          <div className="dialog-message">
            No commits touch this file yet. Sync once to start keeping history.
          </div>
        )}

        {commits.length > 0 && (
          <div style={{ display: 'flex', gap: 14, minHeight: 260 }}>
            <div className="history-list" style={{ width: 260, flex: '0 0 260px' }}>
              {commits.map((commit) => (
                <button
                  key={commit.hash}
                  className={cn('history-item', selected?.hash === commit.hash && 'active')}
                  onClick={() => void choose(commit)}
                >
                  <span className="msg">{commit.message}</span>
                  <span className="when">{relativeTime(commit.date)}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="history-preview" style={{ maxHeight: 300, height: 300 }}>
                {preview || 'This file did not exist in that commit.'}
              </div>
            </div>
          </div>
        )}

        <div className="dialog-actions" style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => useStore.getState().hideModal()}>
            Close
          </button>
          <button className="btn primary" disabled={!selected} onClick={restore}>
            <RotateCcw size={13} /> Restore selected
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shortcuts & templates                                               */
/* ------------------------------------------------------------------ */

function ShortcutsModal(): React.JSX.Element {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="dialog" style={{ width: 'min(520px, calc(100vw - 60px))' }}>
        <h3>Keyboard shortcuts</h3>
        <div className="dialog-message">Everything in Slate is also a command — press ⌘P to search.</div>
        <div style={{ maxHeight: 420, overflowY: 'auto', marginBottom: 12 }}>
          {HOTKEYS.map(([label, keys]) => (
            <div
              key={label}
              style={{ display: 'flex', alignItems: 'center', padding: '6px 2px', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}
            >
              <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{label}</span>
              <span className="kbd">{keys}</span>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={() => useStore.getState().hideModal()}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplatePicker(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const files = useStore((s) => s.files)
  const templates = files.filter((f) => f.startsWith(`${settings.templatesFolder}/`) && f.endsWith('.md'))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="palette">
        <div className="palette-input-row">
          <Sparkles size={16} style={{ color: 'var(--text-faint)' }} />
          <span style={{ fontSize: 14, flex: 1 }}>Insert a template</span>
        </div>
        <div className="palette-results">
          {templates.map((template) => (
            <button
              key={template}
              className="palette-item"
              onClick={() => void useStore.getState().applyTemplate(template)}
            >
              <span className="ico">
                <FileText size={15} />
              </span>
              <span className="label">{stripExt(template.split('/').pop() ?? template)}</span>
              <span className="sub">{dirname(template)}</span>
            </button>
          ))}
          {templates.length === 0 && (
            <div className="palette-empty">No templates in /{settings.templatesFolder}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export { Check, FilePlus, Search }
