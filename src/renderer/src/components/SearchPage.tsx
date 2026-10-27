import { useMemo, useState } from 'react'
import { Search, FileText } from 'lucide-react'
import { useStore } from '../state/store'
import { searchVault } from '../lib/search'
import { dirname } from '../lib/utils'

export function SearchPage(): React.JSX.Element {
  const index = useStore((s) => s.index)
  const [query, setQuery] = useState('')
  const results = useMemo(() => (query.trim() ? searchVault(index, query.trim(), 200) : []), [index, query])

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 40px 60px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontSize: 22, margin: '0 0 14px', letterSpacing: '-0.02em' }}>Search</h2>
        <div className="search-box" style={{ margin: 0, height: 40, marginBottom: 22 }}>
          <Search size={16} style={{ color: 'var(--text-faint)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every note in this vault…"
            style={{ fontSize: 14 }}
            spellCheck={false}
          />
        </div>
        {query.trim() && (
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 12 }}>
            {results.length} result{results.length === 1 ? '' : 's'}
          </div>
        )}
        {results.map((result) => (
          <div
            key={result.path}
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              marginBottom: 8,
              cursor: 'default'
            }}
            onClick={() => void useStore.getState().openNote(result.path, { history: true })}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="search-result-title" style={{ fontSize: 13 }}>
              <FileText size={14} style={{ opacity: 0.6 }} />
              {result.title}
              {dirname(result.path) && <span className="path">{dirname(result.path)}</span>}
            </div>
            {result.matches.map((match) => (
              <div className="search-snippet" key={match.line + match.text} style={{ marginTop: 4 }}>
                {match.text}
              </div>
            ))}
            {result.matches.length === 0 && (
              <div className="search-snippet" style={{ marginTop: 4 }}>
                Title match
              </div>
            )}
          </div>
        ))}
        {!query.trim() && (
          <div className="empty-hint" style={{ textAlign: 'left', padding: 0, lineHeight: 2 }}>
            Search supports inline filters:
            <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              tag:project/slate
              <br />
              path:"Daily"
              <br />
              file:meeting
              <br />
              /regex pattern/i
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
