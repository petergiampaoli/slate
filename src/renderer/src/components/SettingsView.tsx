import { useEffect, useState } from 'react'
import {
  Check,
  Cloud,
  ExternalLink,
  FolderOpen,
  GitBranch,
  HardDrive,
  Keyboard,
  Moon,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Monitor,
  Type,
  UploadCloud,
  AlertCircle,
  FileText
} from 'lucide-react'
import type { GitStatus } from '@shared/types'
import { api, useStore } from '../state/store'
import { cn, relativeTime } from '../lib/utils'
import { HOTKEYS } from './hotkeys'
import { useContextMenu } from './ContextMenu'

type Section = 'general' | 'editor' | 'appearance' | 'files' | 'daily' | 'sync' | 'hotkeys' | 'about'

const SECTIONS: { id: Section; label: string; icon: typeof SettingsIcon }[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'editor', label: 'Editor', icon: Type },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'files', label: 'Files & links', icon: FolderOpen },
  { id: 'daily', label: 'Daily notes', icon: Sparkles },
  { id: 'sync', label: 'Sync & backup', icon: Cloud },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'about', label: 'About', icon: SettingsIcon }
]

export function SettingsView({ embedded = false, initial }: { embedded?: boolean; initial?: string }): React.JSX.Element {
  const [section, setSection] = useState<Section>((initial as Section) || 'general')

  const body = (
    <>
      <nav className="settings-nav">
        <div className="settings-nav-title">Settings</div>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            className={cn('settings-nav-item', section === item.id && 'active')}
            onClick={() => setSection(item.id)}
          >
            <item.icon size={14} strokeWidth={1.8} />
            {item.label}
          </button>
        ))}
        {!embedded && (
          <button
            className="btn"
            style={{ marginTop: 18, width: '100%', justifyContent: 'center' }}
            onClick={() => useStore.getState().hideModal()}
          >
            Done
          </button>
        )}
      </nav>
      <div className="settings-content">
        {section === 'general' && <GeneralSection />}
        {section === 'editor' && <EditorSection />}
        {section === 'appearance' && <AppearanceSection />}
        {section === 'files' && <FilesSection />}
        {section === 'daily' && <DailySection />}
        {section === 'sync' && <SyncSection />}
        {section === 'hotkeys' && <HotkeysSection />}
        {section === 'about' && <AboutSection />}
      </div>
    </>
  )

  if (embedded) {
    return <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>{body}</div>
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().hideModal()}>
      <div className="settings-modal">{body}</div>
    </div>
  )
}

/* ---------- primitives ---------- */

function Row({ name, help, children }: { name: string; help?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <div className="name">{name}</div>
        {help && <div className="help">{help}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return <button className={cn('switch', value && 'on')} onClick={() => onChange(!value)} aria-pressed={value} />
}

function Heading({ title, desc }: { title: string; desc?: string }): React.JSX.Element {
  return (
    <>
      <h2>{title}</h2>
      {desc && <div className="desc">{desc}</div>}
    </>
  )
}

/* ---------- sections ---------- */

function GeneralSection(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const vault = useStore((s) => s.vault)
  const notes = useStore((s) => s.index.notes)
  const files = useStore((s) => s.files)

  return (
    <>
      <Heading title="General" desc="How Slate stores your vault and opens new notes." />
      <Row name="Vault folder" help={vault?.path}>
        <button className="btn" onClick={() => void useStore.getState().chooseVault()}>
          <FolderOpen size={13} /> Change…
        </button>
        <button className="btn" onClick={() => vault && void api.vault.reveal(vault.path)}>
          Reveal
        </button>
      </Row>
      <Row name="New notes go to" help="Where ⌘N creates files.">
        <select
          className="select-input"
          value={settings.newNoteLocation}
          onChange={(e) =>
            void useStore.getState().setSettings({ newNoteLocation: e.target.value as 'root' | 'current' | 'folder' })
          }
        >
          <option value="root">Vault root</option>
          <option value="current">Same folder as current note</option>
          <option value="folder">A fixed folder</option>
        </select>
      </Row>
      {settings.newNoteLocation === 'folder' && (
        <Row name="Fixed folder">
          <input
            className="text-input"
            value={settings.newNoteFolder}
            placeholder="Inbox"
            onChange={(e) => void useStore.getState().setSettings({ newNoteFolder: e.target.value })}
          />
        </Row>
      )}
      <Row name="Vault statistics" help={`${Object.keys(notes).length} notes · ${files.length} files`}>
        <button className="btn" onClick={() => void useStore.getState().refreshVault(true)}>
          <RefreshCw size={13} /> Re-index
        </button>
      </Row>
      <Row name="Recent vaults">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          {settings.recentVaults.slice(0, 4).map((path) => (
            <button
              key={path}
              className="btn sm"
              style={{ maxWidth: 320, overflow: 'hidden' }}
              onClick={() => void useStore.getState().openVault(path)}
              title={path}
            >
              {path.split('/').pop()}
            </button>
          ))}
          {settings.recentVaults.length === 0 && <span className="help">None yet</span>}
        </div>
      </Row>
    </>
  )
}

function EditorSection(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const update = (patch: Partial<typeof settings.editor>): void =>
    void useStore.getState().setSettings({ editor: { ...settings.editor, ...patch } })

  return (
    <>
      <Heading title="Editor" desc="Typography and behaviour of the Markdown editor." />
      <Row name="Font size" help={`${settings.editor.fontSize}px`}>
        <input
          className="slider"
          type="range"
          min={12}
          max={22}
          step={0.5}
          value={settings.editor.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
        />
      </Row>
      <Row name="Font family">
        <div className="segmented">
          <button className={settings.editor.fontFamily === 'editor-sans' ? 'active' : ''} onClick={() => update({ fontFamily: 'editor-sans' })}>
            Sans
          </button>
          <button className={settings.editor.fontFamily === 'editor-serif' ? 'active' : ''} onClick={() => update({ fontFamily: 'editor-serif' })}>
            Serif
          </button>
          <button className={settings.editor.fontFamily === 'editor-mono' ? 'active' : ''} onClick={() => update({ fontFamily: 'editor-mono' })}>
            Mono
          </button>
        </div>
      </Row>
      <Row name="Line height" help={settings.editor.lineHeight.toFixed(2)}>
        <input
          className="slider"
          type="range"
          min={1.3}
          max={2.2}
          step={0.05}
          value={settings.editor.lineHeight}
          onChange={(e) => update({ lineHeight: Number(e.target.value) })}
        />
      </Row>
      <Row name="Readable line width" help={`${settings.editor.lineWidth}px`}>
        <input
          className="slider"
          type="range"
          min={520}
          max={1100}
          step={20}
          value={settings.editor.lineWidth}
          onChange={(e) => update({ lineWidth: Number(e.target.value) })}
        />
      </Row>
      <Row name="Spell check">
        <Toggle value={settings.editor.spellcheck} onChange={(v) => update({ spellcheck: v })} />
      </Row>
      <Row name="Show line numbers in source mode">
        <Toggle value={settings.editor.showLineNumbers} onChange={(v) => update({ showLineNumbers: v })} />
      </Row>
      <Row name="Smart indent on list continuation">
        <Toggle value={settings.editor.smartIndent} onChange={(v) => update({ smartIndent: v })} />
      </Row>
      <Row name="Typewriter mode" help="Keeps the cursor line vertically centred.">
        <Toggle value={useStore((s) => s.typewriter)} onChange={() => useStore.getState().toggleTypewriter()} />
      </Row>
    </>
  )
}

function AppearanceSection(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const theme = settings.theme
  const update = (patch: Partial<typeof theme>): void =>
    void useStore.getState().setSettings({ theme: { ...theme, ...patch } })

  const accents = ['#7c6cf0', '#4c8dff', '#12b981', '#e5484d', '#f59e0b', '#d946ef', '#0ea5e9', '#8b8b93']

  return (
    <>
      <Heading title="Appearance" desc="Theme, accent colour and custom styling." />
      <Row name="Theme">
        <div className="segmented">
          <button className={theme.mode === 'system' ? 'active' : ''} onClick={() => update({ mode: 'system' })}>
            <Monitor size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> System
          </button>
          <button className={theme.mode === 'light' ? 'active' : ''} onClick={() => update({ mode: 'light' })}>
            <Sun size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Light
          </button>
          <button className={theme.mode === 'dark' ? 'active' : ''} onClick={() => update({ mode: 'dark' })}>
            <Moon size={12} style={{ marginRight: 4, verticalAlign: -2 }} /> Dark
          </button>
        </div>
      </Row>
      <Row name="Accent colour">
        <div className="swatches">
          {accents.map((color) => (
            <button
              key={color}
              className={cn('swatch', theme.accent.toLowerCase() === color && 'active')}
              style={{ background: color }}
              onClick={() => update({ accent: color })}
              title={color}
            />
          ))}
        </div>
      </Row>
      <Row name="Sidebar translucency" help="Blur the window behind the sidebars.">
        <Toggle value={theme.translucency} onChange={(v) => update({ translucency: v })} />
      </Row>
      <div style={{ marginTop: 22 }}>
        <div className="setting-label" style={{ marginBottom: 8 }}>
          <div className="name">Custom CSS</div>
          <div className="help">Appended to the app stylesheet. Reload to fully reset.</div>
        </div>
        <textarea
          className="textarea-input"
          spellCheck={false}
          value={theme.customCss}
          placeholder={'.markdown-rendered h1 { letter-spacing: -0.01em; }'}
          onChange={(e) => update({ customCss: e.target.value })}
        />
      </div>
    </>
  )
}

function FilesSection(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const files = useStore((s) => s.files)
  const templates = files.filter((f) => f.startsWith(`${settings.templatesFolder}/`))

  return (
    <>
      <Heading title="Files & links" desc="Where Slate puts attachments, templates and new files." />
      <Row name="Default location for new attachments" help="Images and files dropped into a note are copied here.">
        <input
          className="text-input"
          value={settings.attachmentsFolder}
          onChange={(e) => void useStore.getState().setSettings({ attachmentsFolder: e.target.value })}
        />
      </Row>
      <Row name="Template folder" help={`${templates.length} template${templates.length === 1 ? '' : 's'} found`}>
        <input
          className="text-input"
          value={settings.templatesFolder}
          onChange={(e) => void useStore.getState().setSettings({ templatesFolder: e.target.value })}
        />
      </Row>
      <Row name="Link format" help="Slate always writes wikilinks, which survive file moves best.">
        <span className="kbd">[[note]]</span>
      </Row>
      <Row name="Import files">
        <button className="btn" onClick={() => void useStore.getState().importFromDisk()}>
          <UploadCloud size={13} /> Import…
        </button>
      </Row>
      <div style={{ marginTop: 18, fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.7 }}>
        Attachments are referenced with <code>![[file.png]]</code>. Slate resolves them by name, so moving a note
        between folders won’t break its images.
      </div>
    </>
  )
}

function DailySection(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const files = useStore((s) => s.files)
  const daily = settings.dailyNotes
  const update = (patch: Partial<typeof daily>): void =>
    void useStore.getState().setSettings({ dailyNotes: { ...daily, ...patch } })

  return (
    <>
      <Heading title="Daily notes" desc="A journal entry for each day, created on demand." />
      <Row name="Enable daily notes">
        <Toggle value={daily.enabled} onChange={(v) => update({ enabled: v })} />
      </Row>
      <Row name="Folder" help="Created automatically if it doesn’t exist.">
        <input className="text-input" value={daily.folder} onChange={(e) => update({ folder: e.target.value })} />
      </Row>
      <Row name="Date format" help="Moment-style tokens: YYYY, MM, DD, dddd.">
        <input className="text-input" value={daily.format} onChange={(e) => update({ format: e.target.value })} />
      </Row>
      <Row name="Template">
        <select className="select-input" value={daily.template} onChange={(e) => update({ template: e.target.value })}>
          <option value="">Blank note</option>
          {files
            .filter((f) => f.startsWith(`${settings.templatesFolder}/`) && f.endsWith('.md'))
            .map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
        </select>
      </Row>
      <Row name="Try it">
        <button className="btn" onClick={() => void useStore.getState().openDaily()}>
          Open today’s note
        </button>
      </Row>
    </>
  )
}

function SyncSection(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [repoName, setRepoName] = useState('slate-vault')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const vault = useStore((s) => s.vault)

  const refresh = async (): Promise<void> => {
    try {
      const next = await api.git.status()
      setStatus(next)
      if (next.remote) setRemoteUrl(next.remote)
    } catch {
      setStatus(null)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const run = async (fn: () => Promise<{ ok: boolean; message: string } | void>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await fn()
      if (result && 'message' in result) setMessage(result.message)
      await refresh()
      if (vault) await useStore.getState().refreshGit()
    } catch (err) {
      setMessage(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Heading
        title="Sync & backup"
        desc="Your vault is a git repository. Pushing it to a private GitHub repository gives you version history, backups and multi-device sync — no account with us required."
      />

      {vault && (
        <Row name="Vault" help={vault.path}>
          <span className={cn('status-dot', status?.isRepo ? 'ok' : 'error')} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{status?.isRepo ? 'git repository' : 'not a repo'}</span>
        </Row>
      )}

      {status && !status.isRepo && (
        <div style={{ margin: '16px 0', padding: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 550, marginBottom: 6 }}>Set up sync</div>
          <div className="help" style={{ marginBottom: 12, color: 'var(--text-muted)' }}>
            Slate can create a private repository for you with the GitHub CLI, or connect to one you already have.
          </div>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void run(async () => { const r = await api.git.createRepo(repoName); return r })}
          >
            <Cloud size={13} /> Create private repo “{repoName}”
          </button>
        </div>
      )}

      {status?.isRepo && (
        <>
          <Row name="Remote repository" help={status.remote ?? 'No remote configured yet'}>
            <input
              className="text-input"
              placeholder="https://github.com/you/vault.git"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              style={{ minWidth: 250 }}
            />
            <button
              className="btn"
              disabled={busy || !remoteUrl.trim() || remoteUrl === status.remote}
              onClick={() => void run(async () => { const r = await api.git.setRemote(remoteUrl.trim()); return r })}
            >
              Save
            </button>
          </Row>
          <Row name="Branch">
            <span className="kbd">
              <GitBranch size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
              {status.branch}
            </span>
            {status.ahead > 0 && <span className="help">{status.ahead} ahead</span>}
            {status.behind > 0 && <span className="help">{status.behind} behind</span>}
            {status.lastCommit && <span className="help">last {relativeTime(status.lastCommit.date)}</span>}
          </Row>

          {!status.hasRemote && (
            <div style={{ margin: '14px 0', padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 550, marginBottom: 8 }}>Create a private GitHub repository</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="text-input" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void run(async () => { const r = await api.git.createRepo(repoName); return r })}
                >
                  Create
                </button>
              </div>
              {!status.ghAvailable && (
                <div className="help" style={{ marginTop: 8, color: '#d29922' }}>
                  <AlertCircle size={11} style={{ verticalAlign: -2 }} /> GitHub CLI not found. Install with{' '}
                  <code>brew install gh</code> and run <code>gh auth login</code>.
                </div>
              )}
            </div>
          )}

          {status.changed.length > 0 && (
            <div style={{ margin: '12px 0' }}>
              <div className="panel-section-title" style={{ padding: '6px 0' }}>
                Uncommitted changes <span className="count">{status.changed.length}</span>
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
                {status.changed.slice(0, 40).map((file) => (
                  <div key={file.path} style={{ display: 'flex', gap: 8, padding: '2px 0', color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--accent)', width: 22 }}>{file.code.trim() || 'M'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, margin: '18px 0' }}>
            <button className="btn primary" disabled={busy} onClick={() => void useStore.getState().syncNow()}>
              {busy ? <span className="spinner" /> : <RefreshCw size={13} />} Sync now
            </button>
            <button className="btn" disabled={busy} onClick={() => void run(async () => { await api.git.init() })}>
              Re-initialise git
            </button>
            {status.remote && (
              <button
                className="btn"
                onClick={() => void api.shell.openExternal(status.remote!.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/'))}
              >
                <ExternalLink size={13} /> Open on GitHub
              </button>
            )}
          </div>
        </>
      )}

      <Row name="Automatic sync" help="Push local changes and pull remote changes in the background.">
        <Toggle
          value={settings.sync.auto}
          onChange={(v) => void useStore.getState().setSettings({ sync: { ...settings.sync, auto: v } })}
        />
      </Row>
      <Row name="Sync interval" help="Minutes between automatic syncs.">
        <input
          className="text-input"
          style={{ width: 80, minWidth: 0 }}
          type="number"
          min={1}
          max={120}
          value={settings.sync.intervalMinutes}
          onChange={(e) =>
            void useStore.getState().setSettings({
              sync: { ...settings.sync, intervalMinutes: Number(e.target.value) || 5 }
            })
          }
        />
      </Row>
      <Row name="Sync after each save" help="Commits and pushes a few seconds after you stop typing.">
        <Toggle
          value={settings.sync.onSave}
          onChange={(v) => void useStore.getState().setSettings({ sync: { ...settings.sync, onSave: v } })}
        />
      </Row>

      {message && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', background: 'var(--bg-inset)', borderRadius: 8 }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 22, padding: 14, border: '1px solid var(--border)', borderRadius: 10, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.65 }}>
        <HardDrive size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
        <strong style={{ color: 'var(--text-secondary)' }}>How sync works.</strong> Slate runs plain <code>git</code> in your
        vault folder: fetch → rebase → commit → push. Conflicts are reported instead of overwriting your notes, and every
        past version is available in <em>Version history</em>.
      </div>
    </>
  )
}

function HotkeysSection(): React.JSX.Element {
  return (
    <>
      <Heading title="Hotkeys" desc="Slate follows macOS conventions. These are active everywhere unless you’re typing in a field." />
      <div style={{ marginTop: 8 }}>
        {HOTKEYS.map(([label, keys]) => (
          <div key={label} className="setting-row" style={{ padding: '9px 0' }}>
            <div className="setting-label">
              <div className="name">{label}</div>
            </div>
            <span className="kbd">{keys}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function AboutSection(): React.JSX.Element {
  const vault = useStore((s) => s.vault)
  const settings = useStore((s) => s.settings)
  const notes = useStore((s) => s.index.notes)
  const words = Object.values(notes).reduce((sum, n) => sum + n.words, 0)

  return (
    <>
      <Heading title="About Slate" desc="A local-first knowledge base for macOS." />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '6px 0 24px' }}>
        <div className="welcome-mark" style={{ width: 44, height: 44, fontSize: 20, margin: 0, borderRadius: 12 }}>
          S
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Slate 1.0.0</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Electron · React · CodeMirror 6</div>
        </div>
      </div>
      <Row name="Notes indexed" help={`${words.toLocaleString()} words across your vault`}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Object.keys(notes).length}</span>
      </Row>
      <Row name="Vault" help={vault?.path}>
        <button className="btn" onClick={() => vault && void api.shell.showItemInFolder(vault.path)}>
          <FolderOpen size={13} /> Show in Finder
        </button>
      </Row>
      <Row name="Settings & caches" help="~/Library/Application Support/Slate">
        <span className="kbd">settings.json</span>
      </Row>
      <Row name="Settings file">
        <span className="kbd">~/Library/Application Support/Slate/settings.json</span>
      </Row>
      <div style={{ marginTop: 22, fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.7 }}>
        Slate stores notes as plain Markdown. There is no proprietary database and no lock-in: your vault works with any
        editor, and git gives you complete history. Version {settings.version}.
      </div>
    </>
  )
}

export function SettingsModal(): React.JSX.Element {
  const modal = useStore((s) => s.modal)
  if (!modal || modal.type !== 'settings') return <></>
  return <SettingsView initial={modal.section} />
}

export { Check, Sparkles, useStore, useContextMenu }
