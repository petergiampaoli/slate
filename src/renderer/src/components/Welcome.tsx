import {
  ArrowRight,
  Calendar,
  Command,
  FilePlus,
  FolderOpen,
  Network,
  Search,
  Settings,
  Sparkles
} from 'lucide-react'
import { useStore } from '../state/store'
import { relativeTime, stripExt, basename } from '../lib/utils'
import { api } from '../state/store'

export function Welcome(): React.JSX.Element {
  const vault = useStore((s) => s.vault)
  const notes = useStore((s) => s.index.notes)
  const files = useStore((s) => s.files)
  const recent = Object.values(notes)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 6)

  const actions = [
    {
      icon: FilePlus,
      title: 'New note',
      detail: 'Start writing in a fresh Markdown file',
      run: () => void useStore.getState().createNote()
    },
    {
      icon: Search,
      title: 'Quick switcher',
      detail: 'Jump to any note by name',
      run: () => useStore.getState().showModal({ type: 'quick-switcher' })
    },
    {
      icon: Command,
      title: 'Command palette',
      detail: 'Every action in Slate, one keystroke away',
      run: () => useStore.getState().showModal({ type: 'command-palette' })
    },
    {
      icon: Calendar,
      title: 'Daily note',
      detail: 'Open today’s journal entry',
      run: () => void useStore.getState().openDaily()
    },
    {
      icon: Network,
      title: 'Graph view',
      detail: 'See how your notes connect',
      run: () => useStore.getState().openSpecial('graph')
    },
    {
      icon: Settings,
      title: 'Settings',
      detail: 'Editor, appearance and GitHub sync',
      run: () => useStore.getState().showModal({ type: 'settings' })
    }
  ]

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-mark">S</div>
        <h1>{vault?.name ?? 'Slate'}</h1>
        <div className="sub">
          {Object.keys(notes).length} notes · {files.length} files · stored in{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{vault?.path}</span>
        </div>

        <div className="welcome-grid">
          {actions.map((action) => (
            <button className="welcome-card" key={action.title} onClick={action.run}>
              <span className="ico">
                <action.icon size={16} strokeWidth={1.8} />
              </span>
              <span>
                <div className="t">{action.title}</div>
                <div className="d">{action.detail}</div>
              </span>
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <>
            <div className="welcome-section-label">Recently updated</div>
            <div className="recent-list">
              {recent.map((note) => (
                <button
                  key={note.path}
                  className="recent-item"
                  onClick={() => void useStore.getState().openNote(note.path, { history: true })}
                >
                  <Sparkles size={13} strokeWidth={1.7} style={{ opacity: 0.55 }} />
                  <span className="name">{note.title}</span>
                  <span className="when">{note.mtime ? relativeTime(note.mtime) : 'in vault'}</span>
                  <ArrowRight size={12} style={{ opacity: 0.35 }} />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="welcome-section-label">Vault actions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => void useStore.getState().chooseVault()}>
            <FolderOpen size={13} /> Open another vault
          </button>
          <button className="btn" onClick={() => vault && void api.vault.reveal(vault.path)}>
            Reveal in Finder
          </button>
          <button className="btn" onClick={() => void useStore.getState().syncNow()}>
            Sync to GitHub
          </button>
        </div>

        <div style={{ marginTop: 40, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.7 }}>
          Slate keeps every note as a plain text file. Nothing is locked in a database — your vault is a folder you
          can open, back up and version with git.
          {files.length > 0 && (
            <div style={{ marginTop: 6 }}>
              Try opening{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  const welcome = files.find((f) => f === 'Welcome.md')
                  if (welcome) void useStore.getState().openNote(welcome, { history: true })
                }}
              >
                {stripExt(basename(files.find((f) => f === 'Welcome.md') ?? 'Welcome.md'))}
              </a>{' '}
              for a tour.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
