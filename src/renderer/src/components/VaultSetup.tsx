import { useState } from 'react'
import { CloudDownload, FolderOpen, Plus, Sparkles, ChevronRight } from 'lucide-react'
import { api, useStore } from '../state/store'
import { cn } from '../lib/utils'

export function VaultSetup(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const [mode, setMode] = useState<'home' | 'create' | 'clone'>('home')
  const [name, setName] = useState('My Vault')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await useStore.getState().createVault(name.trim() || 'My Vault')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const clone = async (): Promise<void> => {
    if (!url.trim()) return
    setBusy(true)
    setError(null)
    try {
      const parents = await api.dialog.open({
        title: 'Choose where to clone the vault',
        properties: ['openDirectory', 'createDirectory']
      })
      if (!parents.length) {
        setBusy(false)
        return
      }
      const repoName = url.trim().replace(/\/$/, '').split('/').pop()?.replace(/\.git$/, '') ?? 'vault'
      const target = `${parents[0]}/${repoName}`
      const result = await api.git.clone(url.trim(), target)
      if (!result.ok) {
        setError(result.message)
        setBusy(false)
        return
      }
      await useStore.getState().openVault(target)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="welcome-mark" style={{ marginBottom: 0 }}>
          S
        </div>
        <h1>Slate</h1>
        <p>
          A local-first knowledge base. Your notes stay as plain Markdown files on disk, versioned with git and backed
          up to a private GitHub repository you control.
        </p>

        {mode === 'home' && (
          <>
            <div className="setup-actions">
              <button className="setup-action" onClick={() => setMode('create')}>
                <span className="ico">
                  <Plus size={16} />
                </span>
                <span>
                  <div className="t">Create a new vault</div>
                  <div className="d">Start fresh with a guided tour and templates</div>
                </span>
              </button>
              <button className="setup-action" onClick={() => void useStore.getState().chooseVault()}>
                <span className="ico">
                  <FolderOpen size={16} />
                </span>
                <span>
                  <div className="t">Open a folder</div>
                  <div className="d">Point Slate at an existing Markdown folder</div>
                </span>
              </button>
              <button className="setup-action" onClick={() => setMode('clone')}>
                <span className="ico">
                  <CloudDownload size={16} />
                </span>
                <span>
                  <div className="t">Clone from GitHub</div>
                  <div className="d">Restore a vault from a private repository</div>
                </span>
              </button>
            </div>

            {settings.recentVaults.length > 0 && (
              <>
                <div className="welcome-section-label">Recent vaults</div>
                <div className="recent-vaults">
                  {settings.recentVaults.map((path) => (
                    <button key={path} className="recent-vault" onClick={() => void useStore.getState().openVault(path)}>
                      <FolderOpen size={13} style={{ opacity: 0.6 }} />
                      {path.split('/').pop()}
                      <span className="p">{path}</span>
                      <ChevronRight size={12} style={{ opacity: 0.4 }} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {mode === 'create' && (
          <div>
            <div className="welcome-section-label" style={{ marginTop: 0 }}>
              Vault name
            </div>
            <input
              className="text-input"
              style={{ width: '100%', height: 36, fontSize: 14, marginBottom: 16 }}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
            <div className="help" style={{ color: 'var(--text-faint)', fontSize: 11.5, marginBottom: 18, lineHeight: 1.6 }}>
              Created in ~/Documents. Slate will add a welcome note, a Markdown cheat sheet, daily notes and templates.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={busy} onClick={() => void create()}>
                {busy ? <span className="spinner" /> : <Sparkles size={13} />} Create vault
              </button>
              <button className="btn" onClick={() => setMode('home')}>
                Back
              </button>
            </div>
          </div>
        )}

        {mode === 'clone' && (
          <div>
            <div className="welcome-section-label" style={{ marginTop: 0 }}>
              Repository URL
            </div>
            <input
              className="text-input"
              style={{ width: '100%', height: 36, fontSize: 13, marginBottom: 14 }}
              value={url}
              autoFocus
              placeholder="git@github.com:you/slate-vault.git"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void clone()}
            />
            <div className="help" style={{ color: 'var(--text-faint)', fontSize: 11.5, marginBottom: 18, lineHeight: 1.6 }}>
              Uses the GitHub CLI’s credentials when available. Choose a parent folder after pressing clone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={busy || !url.trim()} onClick={() => void clone()}>
                {busy ? <span className="spinner" /> : <CloudDownload size={13} />} Clone vault
              </button>
              <button className="btn" onClick={() => setMode('home')}>
                Back
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className={cn('dialog-message')} style={{ color: '#f85149', marginTop: 16 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
