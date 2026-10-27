import { useMemo } from 'react'
import { Check, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useStore } from '../state/store'
import { charCount, relativeTime, wordCount } from '../lib/utils'

export function StatusBar(): React.JSX.Element {
  const path = useStore((s) => s.notePath())
  const content = useStore((s) => (path ? s.contents[path] : undefined)) ?? ''
  const mode = useStore((s) => s.activeTab()?.mode ?? 'live')
  const sync = useStore((s) => s.sync)
  const backlinks = useStore((s) => (path ? s.index.backlinks[path]?.length ?? 0 : 0))
  const vaultName = useStore((s) => s.vault?.name ?? '')
  const userName = useStore((s) => s.settings.profile.name)
  const dirty = useStore((s) => (path ? Boolean(s.dirty[path]) : false))

  const words = useMemo(() => wordCount(content), [content])
  const chars = content.length

  const status = sync.status

  return (
    <div className="statusbar">
      <button
        className="status-item clickable"
        onClick={() => void useStore.getState().syncNow()}
        title={status?.remote ? `Remote: ${status.remote}` : 'No remote configured'}
      >
        <span className={`status-dot ${sync.busy ? 'sync' : status?.hasRemote ? 'ok' : 'error'}`} />
        {sync.busy
          ? 'Syncing…'
          : status?.hasRemote
            ? status.changed.length > 0
              ? `${status.changed.length} uncommitted`
              : sync.lastSync
                ? `Synced ${relativeTime(sync.lastSync)}`
                : 'GitHub sync ready'
            : 'Sync not configured'}
        {status?.hasRemote && status.behind > 0 && <span style={{ color: 'var(--accent)' }}>↓{status.behind}</span>}
        {status?.hasRemote && status.ahead > 0 && <span style={{ color: 'var(--accent)' }}>↑{status.ahead}</span>}
        {sync.busy && <RefreshCw size={10} className="spinning" />}
      </button>

      {status?.isRepo && status?.branch && (
        <span className="status-item" title="Current git branch">
          <Cloud size={11} strokeWidth={1.8} />
          {status.branch}
        </span>
      )}

      <span className="spacer" />

      {path && (
        <>
          <span className="status-item">{words.toLocaleString()} words</span>
          <span className="status-item">{chars.toLocaleString()} characters</span>
          {dirty && (
            <span className="status-item" style={{ color: 'var(--text-faint)' }} title="Unsaved changes">
              <span className="status-dot dirty" /> editing
            </span>
          )}
          <button
            className="status-item clickable"
            onClick={() => useStore.setState({ rightTab: 'backlinks', rightOpen: true })}
            title="Backlinks"
          >
            {backlinks} backlink{backlinks === 1 ? '' : 's'}
          </button>
          <button
            className="status-item clickable"
            onClick={() => {
              const tab = useStore.getState().activeTab()
              useStore.getState().setTabMode(mode === 'reading' ? 'live' : 'reading')
              void tab
            }}
            title="Toggle reading view (⌘E)"
          >
            {mode === 'reading' ? 'Reading' : mode === 'source' ? 'Source' : 'Live preview'}
          </button>
        </>
      )}
      <span className="status-item" style={{ opacity: 0.7 }} title="Current user">
        {userName}
      </span>
      <span className="status-item" style={{ opacity: 0.7 }}>
        {vaultName}
      </span>
      <span className="status-item" style={{ opacity: 0.5 }}>
        <Check size={10} strokeWidth={2.4} /> saved locally
      </span>
    </div>
  )
}

export { CloudOff }
