import { useEffect, useMemo, useRef, useState } from 'react'
import { CaseSensitive, Regex, Replace, Search, WholeWord, X } from 'lucide-react'
import { api, useStore } from '../state/store'
import { editorCommand, setPendingSelection } from './editorBridge'
import {
  filesForScope,
  findMatches,
  normaliseOptions,
  replaceAllMatches,
  resultSnippet,
  scopeLabel,
  type FindOptions,
  type FindScope
} from '../lib/findReplace'
import { noteMetaFromText, linkIndex } from '../lib/indexer'
import { cn, dirname } from '../lib/utils'

export function FindReplaceModal(): React.JSX.Element {
  const index = useStore((s) => s.index)
  const files = useStore((s) => s.files)
  const contents = useStore((s) => s.contents)
  const activePath = useStore((s) => s.notePath())
  const selectedFolder = useStore((s) => s.selectedFolder)
  const fileStats = useStore((s) => s.fileStats)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [scope, setScope] = useState<FindScope>(activePath ? 'note' : 'vault')
  const [options, setOptions] = useState<FindOptions>({ caseSensitive: false, wholeWord: false, regexp: false })
  const [confirming, setConfirming] = useState(false)
  const [applying, setApplying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const groups = useMemo(() => {
    const scoped = filesForScope(scope, files, activePath, selectedFolder)
    if (!query) return []
    const found: { path: string; text: string; matches: ReturnType<typeof findMatches> }[] = []
    for (const path of scoped) {
      const text = contents[path] ?? index.notes[path]?.content ?? ''
      if (!text) continue
      const matches = findMatches(text, query, normaliseOptions(options), 400)
      if (matches.length) found.push({ path, text, matches })
    }
    return found
  }, [scope, files, activePath, selectedFolder, query, options, contents, index])

  const total = groups.reduce((sum, group) => sum + group.matches.length, 0)
  const validRegex = (() => {
    if (!options.regexp || !query) return true
    try {
      new RegExp(query)
      return true
    } catch {
      return false
    }
  })()

  const reveal = (path: string, match: { from: number; to: number }): void => {
    if (path === activePath) {
      editorCommand('reveal-range', { from: match.from, to: match.to })
      useStore.getState().hideModal()
      return
    }
    setPendingSelection({ from: match.from, to: match.to })
    useStore.getState().hideModal()
    void useStore.getState().openNote(path, { history: true })
  }

  const applyNoteScope = async (): Promise<boolean> => {
    const applied = editorCommand('replace-all-query', {
      query,
      replacement,
      ...normaliseOptions(options)
    })
    if (!applied) return false
    useStore.getState().hideModal()
    useStore.getState().toast(`Replaced ${total} match${total === 1 ? '' : 'es'} in this note`, 'success')
    return true
  }

  const applyAllScopes = async (): Promise<void> => {
    if (scope === 'note') {
      if (await applyNoteScope()) return
    }
    setApplying(true)
    const state = useStore.getState()
    const notes = { ...state.index.notes }
    const nextContents = { ...state.contents }
    const nextSaved = { ...state.savedContents }
    let replaced = 0
    let touched = 0
    const errors: string[] = []

    for (const group of groups) {
      try {
        const current = state.contents[group.path] ?? group.text
        const result = replaceAllMatches(current, query, normaliseOptions(options), replacement)
        if (result.count === 0 || result.text === current) continue
        replaced += result.count
        touched++
        nextContents[group.path] = result.text
        nextSaved[group.path] = result.text
        notes[group.path] = noteMetaFromText(group.path, result.text, state.fileStats[group.path])
        if (state.contents[group.path] !== undefined) {
          state.setContent(group.path, result.text)
          await state.saveNote(group.path)
        } else {
          await api.fs.write(group.path, result.text)
        }
      } catch (error) {
        errors.push(`${group.path}: ${String(error)}`)
      }
    }

    const nextIndex = { ...state.index, notes }
    linkIndex(nextIndex)
    const nextDirty = { ...useStore.getState().dirty }
    for (const group of groups) if (nextContents[group.path] !== undefined) nextDirty[group.path] = false
    useStore.setState({ index: nextIndex, contents: nextContents, savedContents: nextSaved, dirty: nextDirty })
    useStore.getState().hideModal()
    if (errors.length) {
      useStore.getState().toast(`Replaced ${replaced} matches, but ${errors.length} file(s) failed`, 'error')
    } else {
      useStore.getState().toast(`Replaced ${replaced} matches in ${touched} note${touched === 1 ? '' : 's'}`, 'success')
    }
    setApplying(false)
  }

  const requestApply = (): void => {
    if (scope === 'note') {
      void applyNoteScope()
      return
    }
    setConfirming(true)
  }

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && useStore.getState().hideModal()}>
      <div className="find-replace">
        <header className="find-replace-head">
          <div className="find-replace-title">
            <Replace size={16} />
            <h3>Find and replace</h3>
          </div>
          <div className="segmented find-scope">
            <button className={scope === 'note' ? 'active' : ''} onClick={() => setScope('note')} disabled={!activePath}>
              Note
            </button>
            <button className={scope === 'folder' ? 'active' : ''} onClick={() => setScope('folder')}>
              Folder
            </button>
            <button className={scope === 'vault' ? 'active' : ''} onClick={() => setScope('vault')}>
              Vault
            </button>
          </div>
          <button className="icon-btn" onClick={() => useStore.getState().hideModal()}>
            <X size={15} />
          </button>
        </header>

        <div className="find-replace-body">
          <div className="find-replace-fields">
            <div className="search-box find-field">
              <Search size={14} style={{ color: 'var(--text-faint)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setConfirming(false)
                }}
                placeholder="Find"
                spellCheck={false}
              />
              <div className="find-toggles">
                <button
                  className={cn('icon-btn', options.caseSensitive && 'active')}
                  title="Match case"
                  onClick={() => setOptions({ ...options, caseSensitive: !options.caseSensitive })}
                >
                  <CaseSensitive size={14} />
                </button>
                <button
                  className={cn('icon-btn', options.wholeWord && 'active')}
                  title="Whole word"
                  onClick={() => setOptions({ ...options, wholeWord: !options.wholeWord })}
                >
                  <WholeWord size={14} />
                </button>
                <button
                  className={cn('icon-btn', options.regexp && 'active')}
                  title="Regular expression"
                  onClick={() => setOptions({ ...options, regexp: !options.regexp })}
                >
                  <Regex size={14} />
                </button>
              </div>
            </div>

            <div className="search-box find-field">
              <Replace size={14} style={{ color: 'var(--text-faint)' }} />
              <input
                value={replacement}
                onChange={(event) => {
                  setReplacement(event.target.value)
                  setConfirming(false)
                }}
                placeholder="Replace with"
                spellCheck={false}
              />
              {options.regexp && <span className="find-regex-hint">$1 for groups</span>}
            </div>

            <div className="find-scope-hint">
              {scopeLabel(scope, activePath, selectedFolder)} · {groups.length} note{groups.length === 1 ? '' : 's'} ·{' '}
              {total} match{total === 1 ? '' : 'es'}
              {!validRegex && <span className="find-invalid">Invalid regular expression</span>}
            </div>
          </div>

          <div className="find-results">
            {query && groups.length === 0 && (
              <div className="empty-hint">{validRegex ? 'No matches in this scope.' : 'Fix the regular expression.'}</div>
            )}
            {!query && (
              <div className="empty-hint">
                Search the current note, the note’s folder, or the whole vault.
                <br />
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  Note replacements can be undone with ⌘Z. Folder and vault replacements are recoverable from git history.
                </span>
              </div>
            )}
            {groups.slice(0, 80).map((group) => (
              <div className="find-group" key={group.path}>
                <div className="find-group-head">
                  <span className="find-group-title">{group.path.split('/').pop()?.replace(/\.md$/i, '')}</span>
                  {dirname(group.path) && <span className="find-group-path">{dirname(group.path)}</span>}
                  <span className="find-group-count">{group.matches.length}</span>
                </div>
                {group.matches.slice(0, 3).map((match, i) => (
                  <button key={i} className="find-line" onClick={() => reveal(group.path, match)}>
                    <Highlight text={resultSnippet(group.text, match)} query={match.text} />
                  </button>
                ))}
                {group.matches.length > 3 && (
                  <div className="find-more">+{group.matches.length - 3} more in this note</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <footer className="find-replace-foot">
          <div className="find-foot-note">
            {scope === 'note'
              ? 'Applies as one undoable editor change.'
              : 'Open notes are updated in place; git keeps the previous version.'}
          </div>
          {confirming ? (
            <div className="find-confirm">
              <span>
                Replace {total} match{total === 1 ? '' : 'es'} in {groups.length} note
                {groups.length === 1 ? '' : 's'}?
              </span>
              <button className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="btn danger" onClick={() => void applyAllScopes()} disabled={applying}>
                Replace all
              </button>
            </div>
          ) : (
            <button
              className="btn primary"
              onClick={requestApply}
              disabled={!query || total === 0 || !validRegex || applying}
            >
              {applying ? 'Replacing…' : `Replace all${total ? ` (${total})` : ''}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let at = lower.indexOf(needle)
  let key = 0
  while (at !== -1) {
    if (at > cursor) parts.push(text.slice(cursor, at))
    parts.push(<mark key={key++}>{text.slice(at, at + query.length)}</mark>)
    cursor = at + query.length
    at = lower.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
