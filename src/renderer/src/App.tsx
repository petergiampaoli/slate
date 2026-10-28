import { useEffect, useRef, useState } from 'react'
import { useStore } from './state/store'
import { TitleBar, Ribbon } from './components/TitleBar'
import { Sidebar, Resizer } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { StatusBar } from './components/StatusBar'
import { RightSidebar } from './components/RightSidebar'
import { ContextMenuProvider } from './components/ContextMenu'
import { ModalHost } from './components/Modals'
import { Toasts } from './components/Toasts'
import { VaultSetup } from './components/VaultSetup'
import { editorCommand, runExport } from './components/editorBridge'
import { api as slateApi } from './state/store'
import { basename, clamp } from './lib/utils'

export default function App(): React.JSX.Element {
  const ready = useStore((s) => s.ready)
  const vault = useStore((s) => s.vault)
  const settings = useStore((s) => s.settings)
  const bootPhase = useStore((s) => s.bootPhase)
  const bootProgress = useStore((s) => s.bootProgress)
  const focusMode = useStore((s) => s.focusMode)
  const modal = useStore((s) => s.modal)
  const [dragging, setDragging] = useState(false)
  const [leftWidth, setLeftWidth] = useState(272)
  const [rightWidth, setRightWidth] = useState(300)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void useStore.getState().init()
  }, [])

  /* ---------- theme ---------- */
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const mode = settings.theme?.mode ?? 'system'
    const dark = mode === 'dark' || (mode === 'system' && systemDark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.dataset.translucent = String(settings.theme?.translucency ?? true)
  }, [settings.theme?.mode, settings.theme?.translucency, systemDark])

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--accent', settings.theme?.accent ?? '#7c6cf0')
    const editor = settings.editor
    if (!editor) return
    root.setProperty('--editor-size', `${editor.fontSize}px`)
    const family = editor.fontFamily === 'editor-serif' ? 'var(--font-serif)' : editor.fontFamily === 'editor-mono' ? 'var(--font-mono)' : 'var(--font-ui)'
    root.setProperty('--editor-font', family)
    root.setProperty('--editor-leading', String(editor.lineHeight))
    root.setProperty('--editor-width', `${editor.lineWidth}px`)
  }, [settings.theme?.accent, settings.editor])

  useEffect(() => {
    let el = document.getElementById('slate-custom-css') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'slate-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = settings.theme?.customCss ?? ''
  }, [settings.theme?.customCss])

  useEffect(() => {
    if (ready) {
      setLeftWidth(settings.ui?.sidebarWidth ?? 272)
      setRightWidth(settings.ui?.rightSidebarWidth ?? 300)
    }
  }, [ready])

  /* ---------- document title ---------- */
  const activeTitle = useStore((s) => {
    const pane = s.panes.find((p) => p.id === s.activePaneId) ?? s.panes[0]
    const tab = pane?.tabs.find((t) => t.id === pane.activeTabId)
    return tab?.title ?? s.vault?.name ?? 'Slate'
  })
  const anyDirty = useStore((s) => Object.values(s.dirty).some(Boolean))

  useEffect(() => {
    void slateApi.window.setTitle(`${activeTitle} — Slate`)
    void slateApi.window.setDocumentEdited(anyDirty)
  }, [activeTitle, anyDirty])

  /* ---------- menu actions ---------- */
  useEffect(() => {
    return slateApi.menu.onAction((action, payload) => {
      const s = useStore.getState()
      switch (action) {
        case 'new-note':
          void s.createNote()
          break
        case 'dictate':
          s.showModal({ type: 'dictation' })
          break
        case 'new-window':
          void slateApi.window.newWindow()
          break
        case 'save':
          void s.saveAll()
          break
        case 'sync':
          void s.syncNow()
          break
        case 'version-history': {
          const path = s.notePath()
          if (path) s.showModal({ type: 'history', path })
          break
        }
        case 'export-pdf':
          void runExport('pdf')
          break
        case 'export-html':
          void runExport('html')
          break
        case 'export-markdown':
          void runExport('markdown')
          break
        case 'find-in-note':
          editorCommand('find')
          break
        case 'search-vault':
          s.setSidebarTab('search')
          window.setTimeout(() => document.getElementById('vault-search-input')?.focus(), 50)
          break
        case 'format-bold':
          editorCommand('bold')
          break
        case 'format-italic':
          editorCommand('italic')
          break
        case 'format-strike':
          editorCommand('strike')
          break
        case 'format-highlight':
          editorCommand('highlight')
          break
        case 'format-code':
          editorCommand('code')
          break
        case 'insert-link':
          editorCommand('link')
          break
        case 'insert-table':
          editorCommand('table')
          break
        case 'insert-callout':
          editorCommand('callout')
          break
        case 'insert-code':
          editorCommand('fenced-code')
          break
        case 'insert-math':
          editorCommand('math')
          break
        case 'insert-task':
          editorCommand('task')
          break
        case 'insert-template':
          void s.insertTemplate()
          break
        case 'toggle-sidebar':
          s.toggleSidebar()
          break
        case 'toggle-right-sidebar':
          s.toggleRight()
          break
        case 'toggle-reading': {
          const tab = s.activeTab()
          if (tab && tab.kind === 'note') s.setTabMode(tab.mode === 'reading' ? 'live' : 'reading')
          break
        }
        case 'toggle-source': {
          const tab = s.activeTab()
          if (tab && tab.kind === 'note') s.setTabMode(tab.mode === 'source' ? 'live' : 'source')
          break
        }
        case 'show-backlinks':
          useStore.setState({ rightTab: 'backlinks', rightOpen: true })
          break
        case 'show-outline':
          useStore.setState({ rightTab: 'outline', rightOpen: true })
          break
        case 'show-local-graph':
          useStore.setState({ rightTab: 'localgraph', rightOpen: true })
          break
        case 'graph':
          s.openSpecial('graph')
          break
        case 'quick-switcher':
          s.showModal({ type: 'quick-switcher' })
          break
        case 'command-palette':
          s.showModal({ type: 'command-palette' })
          break
        case 'daily-note':
          void s.openDaily()
          break
        case 'random-note':
          void s.openRandom()
          break
        case 'go-back':
          s.goBack()
          break
        case 'go-forward':
          s.goForward()
          break
        case 'focus-mode':
          s.toggleFocus()
          break
        case 'typewriter-mode':
          s.toggleTypewriter()
          break
        case 'settings':
          s.showModal({ type: 'settings' })
          break
        case 'keyboard-shortcuts':
          s.showModal({ type: 'shortcuts' })
          break
        case 'open-terminal': {
          const path = s.vault?.path
          if (path) void slateApi.shell.openPath(path)
          break
        }
        case 'close-tab':
          s.closeActiveTab()
          break
        case 'open-vault-path':
          if (typeof payload === 'string') void s.openVault(payload)
          break
        case 'vault-opened':
          if (payload && typeof payload === 'object' && 'path' in payload) {
            void s.openVault(String((payload as { path: string }).path))
          }
          break
        default:
          break
      }
    })
  }, [])

  /* ---------- auto sync ---------- */
  useEffect(() => {
    if (!vault || !settings.sync?.auto) return
    const minutes = Math.max(1, settings.sync.intervalMinutes ?? 5)
    const timer = window.setInterval(() => {
      if (document.hasFocus() && !useStore.getState().sync.busy) void useStore.getState().syncNow()
    }, minutes * 60_000)
    return () => window.clearInterval(timer)
  }, [vault, settings.sync?.auto, settings.sync?.intervalMinutes])

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useStore.getState()
      if (event.key === 'Escape') {
        if (state.modal && state.modal.type !== 'dictation') {
          state.hideModal()
          event.preventDefault()
        }
        return
      }
      if (event.metaKey && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        const pane = state.activePane()
        const tab = pane?.tabs[Number(event.key) - 1]
        if (pane && tab) {
          event.preventDefault()
          state.activateTab(pane.id, tab.id)
        }
      }
      if (event.metaKey && event.shiftKey && (event.key === ']' || event.key === '[')) {
        const pane = state.activePane()
        if (!pane || pane.tabs.length < 2) return
        event.preventDefault()
        const index = pane.tabs.findIndex((t) => t.id === pane.activeTabId)
        const next = event.key === ']' ? (index + 1) % pane.tabs.length : (index - 1 + pane.tabs.length) % pane.tabs.length
        state.activateTab(pane.id, pane.tabs[next].id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /* ---------- flush saves when the window loses focus ---------- */
  useEffect(() => {
    const onBlur = (): void => void useStore.getState().saveAll()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  /* ---------- file drag & drop ---------- */
  useEffect(() => {
    if (!vault) return
    const onDragOver = (event: DragEvent): void => {
      if (!event.dataTransfer) return
      if (Array.from(event.dataTransfer.types).includes('Files')) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }
    }
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null) setDragging(false)
    }
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (!files.length) return
      void (async () => {
        const state = useStore.getState()
        const imported: string[] = []
        for (const file of files) {
          const path = slateApi.files.pathFor(file)
          if (path) {
            const saved = await slateApi.fs.importFiles([path], state.settings.attachmentsFolder)
            imported.push(...saved)
          }
        }
        await state.refreshVault()
        if (imported.length) {
          state.toast(`Imported ${imported.length} file${imported.length === 1 ? '' : 's'}`, 'success')
          const current = state.notePath()
          if (current) {
            const text = imported.map((p) => `![[${basename(p)}]]`).join('\n')
            editorCommand('insert-text', text)
          }
        }
      })()
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [vault])

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-inner">
          <div className="boot-mark">S</div>
          <div className="boot-phase">{bootPhase}</div>
          <div className="boot-bar">
            <span style={{ width: `${clamp(bootProgress, 4, 100)}%` }} />
          </div>
        </div>
      </div>
    )
  }


  return (
    <ContextMenuProvider>
      {!vault ? (
        <>
          <VaultSetup />
          <Toasts />
        </>
      ) : (
        <div className={`app-shell${focusMode ? ' focus-mode' : ''}`}>
          <TitleBar />
          <div className="body-row">
            <Ribbon />
            <SidebarMount width={leftWidth} setWidth={setLeftWidth} />
            <div className="main-area">
              <Workspace />
            </div>
            <RightSidebarMount width={rightWidth} setWidth={setRightWidth} />
          </div>
          <StatusBar />
          <ModalHost />
          <Toasts />
          {dragging && <div className="drag-overlay">Drop files to add them to your vault</div>}
        </div>
      )}
    </ContextMenuProvider>
  )
}

function SidebarMount({ width, setWidth }: { width: number; setWidth: (n: number) => void }): React.JSX.Element {
  const open = useStore((s) => s.sidebarOpen)
  if (!open) return <></>
  return (
    <>
      <Sidebar width={width} />
      <Resizer
        width={width}
        side="left"
        onResize={setWidth}
        onCommit={(value) => {
          const settings = useStore.getState().settings
          void useStore.getState().setSettings({ ui: { ...settings.ui, sidebarWidth: value } })
        }}
      />
    </>
  )
}

function RightSidebarMount({ width, setWidth }: { width: number; setWidth: (n: number) => void }): React.JSX.Element {
  const open = useStore((s) => s.rightOpen)
  if (!open) return <></>
  return (
    <>
      <Resizer
        width={width}
        side="right"
        onResize={setWidth}
        onCommit={(value) => {
          const settings = useStore.getState().settings
          void useStore.getState().setSettings({ ui: { ...settings.ui, rightSidebarWidth: value } })
        }}
      />
      <div style={{ width, flex: `0 0 ${width}px`, display: 'flex', minWidth: 0 }}>
        <RightSidebar />
      </div>
    </>
  )
}
