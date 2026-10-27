import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, FileText, SlidersHorizontal, CaseSensitive, Regex } from 'lucide-react'
import { useStore } from '../state/store'
import { searchVault, type SearchResult } from '../lib/search'
import { basename, dirname } from '../lib/utils'
import { cn } from '../lib/utils'

export function SearchPane(): React.JSX.Element {
  const query = useStore((s) => s.searchQuery)
  const token = useStore((s) => s.searchToken)
  const index = useStore((s) => s.index)
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)

  useEffect(() => {
    if (token > 0) inputRef.current?.focus()
  }, [token])

  const effectiveQuery = useMemo(() => {
    let q = query
    if (useRegex && q && !q.startsWith('re:') && !q.startsWith('/')) q = `re:${q}`
    return q
  }, [query, useRegex])

  const results = useMemo(() => {
    if (!effectiveQuery.trim()) return []
    const found = searchVault(index, effectiveQuery)
    if (!caseSensitive) return found
    const needle = query.trim()
    return found
      .map((r) => ({ ...r, matches: r.matches.filter((m) => m.text.includes(needle)) }))
      .filter((r) => r.matches.length > 0)
  }, [effectiveQuery, index, caseSensitive])

  useEffect(() => setActive(0), [effectiveQuery])

  const open = (result: SearchResult): void => {
    void useStore.getState().openNote(result.path, { history: true })
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const result = results[active]
      if (result) open(result)
    } else if (event.key === 'Escape') {
      useStore.getState().setSearchQuery('')
    }
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Search</span>
        <div className="sidebar-actions">
          <button
            className={cn('icon-btn', caseSensitive && 'active')}
            title="Match case"
            onClick={() => setCaseSensitive((v) => !v)}
          >
            <CaseSensitive size={15} strokeWidth={1.8} />
          </button>
          <button className={cn('icon-btn', useRegex && 'active')} title="Use regular expression" onClick={() => setUseRegex((v) => !v)}>
            <Regex size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="search-box">
        <Search size={14} strokeWidth={2} style={{ color: 'var(--text-faint)' }} />
        <input
          id="vault-search-input"
          ref={inputRef}
          value={query}
          placeholder="Search notes…"
          onChange={(e) => useStore.setState({ searchQuery: e.target.value })}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        {query && (
          <button className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => useStore.getState().setSearchQuery('')}>
            <X size={12} />
          </button>
        )}
      </div>

      {!query.trim() && (
        <div className="empty-hint" style={{ textAlign: 'left', padding: '10px 14px', lineHeight: 1.9 }}>
          <div style={{ marginBottom: 4 }}>Search the whole vault.</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            Filters work inline:
            <br />
            <code>tag:project</code> · <code>path:Daily</code>
            <br />
            <code>file:meeting</code> · <code>/regex/i</code>
          </div>
        </div>
      )}

      {query.trim() && (
        <div style={{ padding: '0 12px 6px', fontSize: 10.5, color: 'var(--text-faint)' }}>
          {results.length} {results.length === 1 ? 'note' : 'notes'}
        </div>
      )}

      <div style={{ padding: '0 6px 20px' }}>
        {results.map((result, i) => (
          <div
            key={result.path}
            className={cn('search-result', active === i && 'selected')}
            style={active === i ? { background: 'var(--bg-accent-soft)' } : undefined}
            onClick={() => open(result)}
            onMouseEnter={() => setActive(i)}
          >
            <div className="search-result-title">
              <FileText size={13} strokeWidth={1.7} style={{ opacity: 0.6, flex: '0 0 auto' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</span>
              {dirname(result.path) && <span className="path">{dirname(result.path)}</span>}
            </div>
            {result.matches.slice(0, 3).map((match) => (
              <div className="search-snippet" key={match.line + match.text}>
                <Highlighted text={match.text} ranges={match.ranges} />
              </div>
            ))}
          </div>
        ))}
        {query.trim() && results.length === 0 && (
          <div className="empty-hint">No notes match “{query}”.</div>
        )}
      </div>
    </>
  )
}

function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }): React.JSX.Element {
  if (!ranges.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let cursor = 0
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  sorted.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start))
    if (end > start) parts.push(<mark key={i}>{text.slice(start, end)}</mark>)
    cursor = Math.max(cursor, end)
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

export function TagsPane(): React.JSX.Element {
  const tags = useStore((s) => s.index.tags)
  const starred = useStore((s) => s.settings.starredTags)
  const [filter, setFilter] = useState('')

  const visible = tags.filter((t) => !filter || t.tag.toLowerCase().includes(filter.toLowerCase()))

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Tags</span>
      </div>
      <div className="search-box">
        <Search size={14} strokeWidth={2} style={{ color: 'var(--text-faint)' }} />
        <input value={filter} placeholder="Filter tags…" onChange={(e) => setFilter(e.target.value)} />
      </div>

      {starred.length > 0 && (
        <div style={{ padding: '2px 8px 8px' }}>
          <div className="panel-section-title">Starred</div>
          {starred.map((tag) => (
            <div key={tag} className="tag-row" onClick={() => useStore.getState().setSearchQuery(`tag:${tag}`)}>
              <span className="tag-hash">#</span>
              {tag}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '0 8px 20px' }}>
        {visible.map((tag) => {
          const depth = tag.tag.split('/').length - 1
          return (
            <div
              key={tag.tag}
              className="tag-row"
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => useStore.getState().setSearchQuery(`tag:${tag.tag}`)}
            >
              <span className="tag-hash">#</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.tag}</span>
              <span className="count">{tag.count}</span>
            </div>
          )
        })}
        {visible.length === 0 && (
          <div className="empty-hint">
            {tags.length === 0 ? 'No tags yet. Add #tags to any note.' : 'No tags match that filter.'}
          </div>
        )}
      </div>
    </>
  )
}

export { SlidersHorizontal, basename }
