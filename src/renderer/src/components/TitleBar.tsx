import { useMemo } from 'react'
import {
  ChevronDown,
  X,
  Plus,
  Network,
  BarChart3,
  Mic,
  FileText,
  LayoutGrid,
  Settings,
  Search,
  PanelLeft,
  PanelRight,
  RefreshCw
} from 'lucide-react'
import { useStore } from '../state/store'
import { cn, stripExt, basename } from '../lib/utils'
import { useContextMenu } from './ContextMenu'

export function TitleBar(): React.JSX.Element {
  const panes = useStore((s) => s.panes)
  const activePaneId = useStore((s) => s.activePaneId)
  const dirty = useStore((s) => s.dirty)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  const vault = useStore((s) => s.vault)
  const syncBusy = useStore((s) => s.sync.busy)
  const menu = useContextMenu()

  const pane = panes.find((p) => p.id === activePaneId) ?? panes[0]
  const tabs = pane?.tabs ?? []

  const closeTab = (tabId: string): void => {
    if (pane) useStore.getState().closeTab(pane.id, tabId)
  }

  const tabMenu = (event: React.MouseEvent, tabId: string): void => {
    event.preventDefault()
    if (!pane) return
    const index = pane.tabs.findIndex((t) => t.id === tabId)
    menu.open(event, [
      { label: 'Close', shortcut: '⌘W', onSelect: () => closeTab(tabId) },
      {
        label: 'Close other tabs',
        onSelect: () => pane.tabs.filter((t) => t.id !== tabId).forEach((t) => closeTab(t.id))
      },
      {
        label: 'Close tabs to the right',
        onSelect: () => pane.tabs.slice(index + 1).forEach((t) => closeTab(t.id))
      },
      { separator: true },
      {
        label: 'Close split pane',
        disabled: panes.length === 1,
        onSelect: () => pane && useStore.getState().closePane(pane.id)
      }
    ])
  }

  return (
    <div className="titlebar">
      <div className="tabstrip">
        {tabs.map((tab) => {
          const isDirty = tab.path ? Boolean(dirty[tab.path]) : false
          return (
            <div
              key={tab.id}
              className={cn('tab', tab.id === pane?.activeTabId && 'active', isDirty && 'tab-dirty')}
              onClick={() => pane && useStore.getState().activateTab(pane.id, tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.id)
              }}
              onContextMenu={(e) => tabMenu(e, tab.id)}
              title={tab.path ?? tab.title}
            >
              <span className="tab-icon">{tabIcon(tab.kind, tab.path)}</span>
              <span className="tab-title">{tab.title}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X size={11} strokeWidth={2.2} />
              </button>
            </div>
          )
        })}
        <button
          className="icon-btn"
          style={{ marginLeft: 4, alignSelf: 'center' }}
          title="New note (⌘N)"
          onClick={() => void useStore.getState().createNote()}
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="titlebar-actions">
        {vault && (
          <button
            className="icon-btn"
            title="Vault menu"
            onClick={(e) =>
              menu.open(e, [
                {
                  label: vault.name,
                  onSelect: () => void navigator.clipboard.writeText(vault.path)
                },
                { separator: true },
                { label: 'Open another vault…', onSelect: () => void useStore.getState().chooseVault() },
                { label: 'Sync now', icon: RefreshCw, shortcut: '⌘⇧S', onSelect: () => void useStore.getState().syncNow() },
                { label: 'Settings…', shortcut: '⌘,', onSelect: () => useStore.getState().showModal({ type: 'settings' }) }
              ])
            }
          >
            <ChevronDown size={15} />
          </button>
        )}
        <button
          className={cn('icon-btn', sidebarOpen && 'active')}
          title="Toggle left sidebar (⌘⌥B)"
          onClick={() => useStore.getState().toggleSidebar()}
        >
          <PanelLeft size={15} strokeWidth={1.8} />
        </button>
        <button
          className={cn('icon-btn', rightOpen && 'active')}
          title="Toggle right sidebar (⌘⌥R)"
          onClick={() => useStore.getState().toggleRight()}
        >
          <PanelRight size={15} strokeWidth={1.8} />
        </button>
        {syncBusy && <span className="spinner" style={{ marginLeft: 4 }} />}
      </div>
    </div>
  )
}

function tabIcon(kind: string, path?: string): React.JSX.Element {
  if (kind === 'graph') return <Network size={13} strokeWidth={1.8} />
  if (kind === 'canvas') return <LayoutGrid size={13} strokeWidth={1.8} />
  if (kind === 'settings') return <Settings size={13} strokeWidth={1.8} />
  if (kind === 'search') return <Search size={13} strokeWidth={1.8} />
  if (path && path.endsWith('.canvas')) return <LayoutGrid size={13} strokeWidth={1.8} />
  return <FileText size={13} strokeWidth={1.8} />
}

export function Ribbon(): React.JSX.Element {
  const sidebarTab = useStore((s) => s.sidebarTab)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const rightTab = useStore((s) => s.rightTab)
  const rightOpen = useStore((s) => s.rightOpen)

  const items = [
    { id: 'files', icon: FileText, label: 'Files' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'tags', icon: null, label: 'Tags' },
    { id: 'bookmarks', icon: null, label: 'Bookmarks' }
  ] as const

  return (
    <div className="ribbon">
      <button
        className={cn('ribbon-btn', sidebarOpen && sidebarTab === 'files' && 'active')}
        title="Files"
        onClick={() => (sidebarOpen && sidebarTab === 'files' ? useStore.getState().toggleSidebar(false) : useStore.getState().setSidebarTab('files'))}
      >
        <FileText size={19} strokeWidth={1.6} />
      </button>
      <button
        className={cn('ribbon-btn', sidebarOpen && sidebarTab === 'search' && 'active')}
        title="Search (⌘⇧F)"
        onClick={() => (sidebarOpen && sidebarTab === 'search' ? useStore.getState().toggleSidebar(false) : useStore.getState().setSidebarTab('search'))}
      >
        <Search size={19} strokeWidth={1.6} />
      </button>
      <button
        className={cn('ribbon-btn', sidebarOpen && sidebarTab === 'tags' && 'active')}
        title="Tags"
        onClick={() => (sidebarOpen && sidebarTab === 'tags' ? useStore.getState().toggleSidebar(false) : useStore.getState().setSidebarTab('tags'))}
      >
        <HashIcon />
      </button>
      <button
        className={cn('ribbon-btn', sidebarOpen && sidebarTab === 'bookmarks' && 'active')}
        title="Bookmarks"
        onClick={() => (sidebarOpen && sidebarTab === 'bookmarks' ? useStore.getState().toggleSidebar(false) : useStore.getState().setSidebarTab('bookmarks'))}
      >
        <BookmarkIcon />
      </button>
      <div className="ribbon-divider" />
      <button className="ribbon-btn" title="Today’s daily note (⌘⇧D)" onClick={() => void useStore.getState().openDaily()}>
        <CalendarIcon />
      </button>
      <button className="ribbon-btn" title="Graph view (⌘G)" onClick={() => useStore.getState().openSpecial('graph')}>
        <Network size={19} strokeWidth={1.6} />
      </button>
      <button className="ribbon-btn" title="Studio — project visualizations" onClick={() => useStore.getState().openSpecial('studio')}>
        <BarChart3 size={19} strokeWidth={1.6} />
      </button>
      <button className="ribbon-btn" title="Random note" onClick={() => void useStore.getState().openRandom()}>
        <DiceIcon />
      </button>
      <button
        className="ribbon-btn"
        title="Dictate a note (⌘⇧M)"
        onClick={() => useStore.getState().showModal({ type: 'dictation' })}
      >
        <Mic size={19} strokeWidth={1.6} />
      </button>
      <div className="ribbon-spacer" />
      <button
        className={cn('ribbon-btn', rightOpen && rightTab === 'backlinks' && 'active')}
        title="Right sidebar"
        onClick={() => useStore.getState().toggleRight()}
      >
        <PanelRight size={18} strokeWidth={1.6} />
      </button>
      <button className="ribbon-btn" title="Keyboard shortcuts" onClick={() => useStore.getState().showModal({ type: 'shortcuts' })}>
        <KeyboardIcon />
      </button>
      <button className="ribbon-btn" title="Settings (⌘,)" onClick={() => useStore.getState().showModal({ type: 'settings' })}>
        <Settings size={19} strokeWidth={1.6} />
      </button>
    </div>
  )
}

/* Inline glyph icons keep the ribbon visually consistent without extra deps. */
function HashIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  )
}

function BookmarkIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function CalendarIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function DiceIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}

function KeyboardIcon(): React.JSX.Element {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="10" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="14" y2="10" />
      <line x1="18" y1="10" x2="18" y2="10" />
      <line x1="7" y1="14" x2="17" y2="14" />
    </svg>
  )
}

export { stripExt, basename }
