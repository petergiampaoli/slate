import { create } from 'zustand'
import type {
  AppSettings,
  FileNode,
  GitStatus,
  PaneState,
  TabState,
  VaultInfo
} from '@shared/types'
import type { SlateApi } from '@shared/types'
import {
  buildVaultIndex,
  linkIndex,
  noteMetaFromText,
  splitFrontmatter,
  EMPTY_INDEX,
  type VaultIndex
} from '../lib/indexer'
import {
  basename,
  clamp,
  dirname,
  extname,
  formatDate,
  isCanvas,
  isMarkdown,
  isNote,
  joinPath,
  stripExt,
  uid
} from '../lib/utils'

declare global {
  interface Window {
    slate: SlateApi
  }
}

export const api = window.slate


export type SidebarTab = 'files' | 'search' | 'tags' | 'bookmarks' | 'graph'
export type RightTab = 'backlinks' | 'outline' | 'properties' | 'localgraph'

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

export type ModalState =
  | { type: 'command-palette' }
  | { type: 'quick-switcher' }
  | { type: 'settings'; section?: string }
  | { type: 'history'; path: string }
  | {
      type: 'prompt'
      title: string
      label?: string
      value: string
      placeholder?: string
      submitLabel?: string
      onSubmit: (value: string) => void | Promise<void>
    }
  | {
      type: 'confirm'
      title: string
      message: string
      confirmLabel?: string
      danger?: boolean
      onConfirm: () => void | Promise<void>
    }
  | { type: 'shortcuts' }
  | { type: 'template-picker' }
  | { type: 'local-graph' }

export interface CreateNoteOptions {
  folder?: string
  name?: string
  content?: string
  newTab?: boolean
  open?: boolean
}

interface SyncState {
  status: GitStatus | null
  busy: boolean
  lastSync: number | null
  message: string | null
}

interface AppState {
  ready: boolean
  bootPhase: string
  bootProgress: number
  settings: AppSettings
  vault: VaultInfo | null
  tree: FileNode[]
  files: string[]
  index: VaultIndex
  panes: PaneState[]
  activePaneId: string
  sidebarTab: SidebarTab
  rightTab: RightTab
  sidebarOpen: boolean
  rightOpen: boolean
  focusMode: boolean
  typewriter: boolean
  expandedFolders: Record<string, boolean>
  contents: Record<string, string>
  savedContents: Record<string, string>
  dirty: Record<string, boolean>
  externalRevision: Record<string, number>
  conflicts: Record<string, boolean>
  modal: ModalState | null
  toasts: Toast[]
  searchQuery: string
  searchToken: number
  sync: SyncState
  historyVersion: number
  multiSelect: string[]
  setMultiSelect: (paths: string[]) => void

  init: () => Promise<void>
  boot: () => Promise<void>
  refreshVault: (full?: boolean) => Promise<void>
  applyExternalChanges: (paths: string[]) => Promise<void>
  setSettings: (patch: Partial<AppSettings>) => Promise<void>
  persistWorkspace: () => void
  restoreWorkspace: () => void

  setSidebarTab: (tab: SidebarTab) => void
  setRightTab: (tab: RightTab) => void
  toggleSidebar: (force?: boolean) => void
  toggleRight: (force?: boolean) => void
  toggleFocus: () => void
  toggleTypewriter: () => void
  toggleFolder: (path: string) => void
  setExpanded: (path: string, open: boolean) => void

  activePane: () => PaneState | undefined
  activeTab: () => TabState | undefined
  notePath: () => string | null
  setActivePane: (paneId: string) => void
  openNote: (path: string, opts?: { newTab?: boolean; paneId?: string; history?: boolean; mode?: TabState['mode'] }) => Promise<void>
  openSpecial: (kind: 'graph' | 'canvas' | 'settings' | 'search', opts?: { path?: string }) => void
  closeTab: (paneId: string, tabId: string) => void
  closeActiveTab: () => void
  activateTab: (paneId: string, tabId: string) => void
  setTabMode: (mode: TabState['mode']) => void
  goBack: () => void
  goForward: () => void
  splitPane: () => void
  closePane: (paneId: string) => void

  loadContent: (path: string) => Promise<string>
  setContent: (path: string, content: string) => void
  saveNote: (path?: string) => Promise<void>
  saveAll: () => Promise<void>
  reloadFromDisk: (path: string) => Promise<void>

  createNote: (opts?: CreateNoteOptions) => Promise<string | null>
  createFolder: (parent?: string) => Promise<void>
  renamePath: (oldPath: string) => Promise<void>
  deletePath: (path: string) => Promise<void>
  movePath: (from: string, toDir: string) => Promise<void>
  duplicatePath: (path: string) => Promise<void>
  attachFiles: (files: File[] | { path: string; name: string }[], folder?: string) => Promise<string[]>
  importFromDisk: () => Promise<void>

  openDaily: () => Promise<void>
  openRandom: () => Promise<void>
  insertTemplate: () => Promise<void>
  applyTemplate: (templatePath: string) => Promise<void>

  showModal: (modal: ModalState) => void
  hideModal: () => void
  toast: (message: string, kind?: Toast['kind'], action?: Toast['action']) => void
  dismissToast: (id: string) => void
  prompt: (opts: {
    title: string
    label?: string
    value: string
    placeholder?: string
    submitLabel?: string
    onSubmit: (value: string) => void | Promise<void>
  }) => void
  confirm: (opts: {
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
    onConfirm: () => void | Promise<void>
  }) => void

  toggleBookmark: (path: string) => void
  setSearchQuery: (q: string) => void
  refreshGit: () => Promise<void>
  syncNow: (message?: string) => Promise<void>
  openVault: (path: string) => Promise<void>
  chooseVault: () => Promise<void>
  createVault: (name: string) => Promise<void>
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
let reindexTimer: ReturnType<typeof setTimeout> | null = null
let workspaceTimer: ReturnType<typeof setTimeout> | null = null

export function flattenTree(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = []
  const walk = (list: FileNode[]): void => {
    for (const n of list) {
      out.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export function noteFiles(tree: FileNode[]): string[] {
  return flattenTree(tree)
    .filter((n) => n.kind === 'file' && isNote(n.path))
    .map((n) => n.path)
}

function newPane(id?: string): PaneState {
  return { id: id ?? uid('pane'), tabs: [], activeTabId: '' }
}

function emptyTab(kind: TabState['kind'], title: string, path?: string): TabState {
  return {
    id: uid('tab'),
    kind,
    path,
    title,
    mode: kind === 'note' ? 'live' : undefined,
    history: path ? [path] : [],
    historyIndex: path ? 0 : -1
  }
}

function updateActiveTab(panes: PaneState[], paneId: string, fn: (tab: TabState) => TabState): PaneState[] {
  return panes.map((pane) => {
    if (pane.id !== paneId) return pane
    return {
      ...pane,
      tabs: pane.tabs.map((tab) => (tab.id === pane.activeTabId ? fn(tab) : tab))
    }
  })
}

function findTabWithNote(panes: PaneState[], path: string): { paneId: string; tabId: string } | null {
  for (const pane of panes) {
    const tab = pane.tabs.find((t) => t.kind === 'note' && t.path === path)
    if (tab) return { paneId: pane.id, tabId: tab.id }
  }
  return null
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  bootPhase: 'Starting',
  bootProgress: 0,
  settings: {} as AppSettings,
  vault: null,
  tree: [],
  files: [],
  index: EMPTY_INDEX,
  panes: [newPane()],
  activePaneId: '',
  sidebarTab: 'files',
  rightTab: 'backlinks',
  sidebarOpen: true,
  rightOpen: true,
  focusMode: false,
  typewriter: false,
  expandedFolders: {},
  contents: {},
  savedContents: {},
  dirty: {},
  externalRevision: {},
  conflicts: {},
  modal: null,
  toasts: [],
  searchQuery: '',
  searchToken: 0,
  sync: { status: null, busy: false, lastSync: null, message: null },
  historyVersion: 0,
  multiSelect: [],
  setMultiSelect: (paths) => set({ multiSelect: paths }),

  async init() {
    const settings = await api.settings.get()
    const vault = await api.vault.current()
    const firstPane = newPane()
    set({
      settings,
      vault,
      sidebarOpen: settings.ui.sidebarOpen,
      rightOpen: settings.ui.rightSidebarOpen,
      sidebarTab: (settings.ui.sidebarTab as SidebarTab) || 'files',
      focusMode: settings.ui.focusMode,
      typewriter: settings.ui.typewriterMode,
      panes: [firstPane],
      activePaneId: firstPane.id
    })
    if (vault) {
      try {
        await get().boot()
      } catch (err) {
        set({ ready: true, bootPhase: 'Vault unavailable' })
        get().toast(`Could not read the vault: ${String(err)}`, 'error')
      }
    } else {
      set({ ready: true })
    }

    api.vault.onChanged(async (change) => {
      await get().applyExternalChanges(change.paths)
    })
    api.settings.onChanged((s) => set({ settings: s }))
  },

  async boot() {
    set({ bootPhase: 'Reading vault', bootProgress: 5 })
    const tree = await api.vault.tree()
    const files = flattenTree(tree).filter((n) => n.kind === 'file').map((n) => n.path)
    set({ tree, files })
    const index = await buildVaultIndex(files, (p) => api.fs.read(p), (done, total) => {
      set({ bootProgress: Math.round((done / Math.max(1, total)) * 100), bootPhase: `Indexing ${done}/${total}` })
    })
    set({ index, ready: true, bootPhase: 'Ready', bootProgress: 100 })

    const expanded: Record<string, boolean> = {}
    for (const node of flattenTree(tree)) if (node.kind === 'folder') expanded[node.path] = true
    set({ expandedFolders: expanded })

    get().restoreWorkspace()
    get().refreshGit().catch(() => undefined)
  },

  async refreshVault(full = false) {
    if (!get().vault) return
    const tree = await api.vault.tree()
    const files = flattenTree(tree).filter((n) => n.kind === 'file').map((n) => n.path)
    if (full) {
      const index = await buildVaultIndex(files, (p) => api.fs.read(p))
      set({ tree, files, index })
    } else {
      set({ tree, files })
    }
  },

  async applyExternalChanges(paths) {
    const state = get()
    if (!state.vault) return
    const tree = await api.vault.tree()
    const files = flattenTree(tree).filter((n) => n.kind === 'file').map((n) => n.path)
    const notes = { ...state.index.notes }
    const contents = { ...state.contents }
    const saved = { ...state.savedContents }
    const dirty = { ...state.dirty }
    const conflicts = { ...state.conflicts }
    const externalRevision = { ...state.externalRevision }
    let changed = false

    for (const raw of paths) {
      const path = raw.replace(/\\/g, '/')
      if (!isNote(path)) continue
      const exists = files.includes(path)
      if (!exists) {
        if (notes[path]) {
          delete notes[path]
          changed = true
        }
        continue
      }
      if (!isMarkdown(path)) continue
      try {
        const text = await api.fs.read(path)
        if (contents[path] !== undefined && contents[path] === text) continue
        if (dirty[path]) {
          conflicts[path] = true
          changed = true
          continue
        }
        notes[path] = noteMetaFromText(path, text)
        contents[path] = text
        saved[path] = text
        externalRevision[path] = (externalRevision[path] ?? 0) + 1
        changed = true
      } catch {
        /* file vanished mid-read */
      }
    }

    if (changed) {
      const index: VaultIndex = { ...state.index, notes }
      linkIndex(index)
      set({ tree, files, index, contents, savedContents: saved, dirty, conflicts, externalRevision })
    } else {
      set({ tree, files })
    }
  },

  async setSettings(patch) {
    const next = await api.settings.set(patch)
    set({ settings: next })
  },

  persistWorkspace() {
    if (workspaceTimer) clearTimeout(workspaceTimer)
    workspaceTimer = setTimeout(() => {
      const { panes, activePaneId } = get()
      api.settings
        .set({ workspace: { panes, activePaneId } })
        .catch(() => undefined)
    }, 400)
  },

  restoreWorkspace() {
    const { settings, index, files } = get()
    const exists = (p: string | undefined): boolean => Boolean(p && files.includes(p))
    const saved = settings.workspace
    if (saved && saved.panes?.length) {
      const panes = saved.panes
        .map((pane) => ({
          ...pane,
          tabs: pane.tabs.filter((t) => t.kind !== 'note' || exists(t.path))
        }))
        .filter((pane) => pane.tabs.length > 0)
        .map((pane) => ({
          ...pane,
          activeTabId: pane.tabs.some((t) => t.id === pane.activeTabId) ? pane.activeTabId : pane.tabs[0].id
        }))
      if (panes.length) {
        set({ panes, activePaneId: panes.some((p) => p.id === saved.activePaneId) ? saved.activePaneId : panes[0].id })
        return
      }
    }
    const welcome = files.find((f) => f === 'Welcome.md') ?? files.find((f) => isMarkdown(f))
    const pane = newPane()
    if (welcome) {
      pane.tabs = [emptyTab('note', stripExt(basename(welcome)), welcome)]
      pane.activeTabId = pane.tabs[0].id
    }
    set({ panes: [pane], activePaneId: pane.id })
  },

  setSidebarTab: (tab) => {
    set({ sidebarTab: tab, sidebarOpen: true })
    get().setSettings({ ui: { ...get().settings.ui, sidebarTab: tab, sidebarOpen: true } })
  },
  setRightTab: (tab) => set({ rightTab: tab, rightOpen: true }),
  toggleSidebar: (force) => {
    const next = force ?? !get().sidebarOpen
    set({ sidebarOpen: next })
    get().setSettings({ ui: { ...get().settings.ui, sidebarOpen: next } })
  },
  toggleRight: (force) => {
    const next = force ?? !get().rightOpen
    set({ rightOpen: next })
    get().setSettings({ ui: { ...get().settings.ui, rightSidebarOpen: next } })
  },
  toggleFocus: () => {
    const next = !get().focusMode
    set({ focusMode: next })
    get().setSettings({ ui: { ...get().settings.ui, focusMode: next } })
  },
  toggleTypewriter: () => {
    const next = !get().typewriter
    set({ typewriter: next })
    get().setSettings({ ui: { ...get().settings.ui, typewriterMode: next } })
  },
  toggleFolder: (path) =>
    set((s) => ({ expandedFolders: { ...s.expandedFolders, [path]: !s.expandedFolders[path] } })),
  setExpanded: (path, open) => set((s) => ({ expandedFolders: { ...s.expandedFolders, [path]: open } })),

  activePane: () => get().panes.find((p) => p.id === get().activePaneId) ?? get().panes[0],
  activeTab: () => {
    const pane = get().activePane()
    return pane?.tabs.find((t) => t.id === pane.activeTabId)
  },
  notePath: () => {
    const tab = get().activeTab()
    return tab?.kind === 'note' ? (tab.path ?? null) : null
  },
  setActivePane: (paneId) => set({ activePaneId: paneId }),

  async openNote(path, opts = {}) {
    if (!path) return
    const state = get()
    if (!opts.newTab) {
      const found = findTabWithNote(state.panes, path)
      if (found && !opts.paneId) {
        const panes = state.panes.map((p) =>
          p.id === found.paneId ? { ...p, activeTabId: found.tabId } : p
        )
        set({ panes, activePaneId: found.paneId })
        if (opts.history) {
          set((s) => ({
            panes: updateActiveTab(s.panes, found.paneId, (tab) => {
              if (tab.path === path) return tab
              const history = (tab.history ?? []).slice(0, (tab.historyIndex ?? 0) + 1)
              history.push(path)
              return { ...tab, history, historyIndex: history.length - 1 }
            })
          }))
        }
        return
      }
    }

    const paneId = opts.paneId ?? state.activePaneId
    let pane = state.panes.find((p) => p.id === paneId)
    if (!pane) {
      pane = newPane()
      set((s) => ({ panes: [...s.panes, pane as PaneState], activePaneId: paneId }))
    }
    const existing = pane.tabs.find((t) => t.kind === 'note' && t.path === path)
    if (existing && !opts.newTab) {
      set((s) => ({
        panes: s.panes.map((p) => (p.id === paneId ? { ...p, activeTabId: existing.id } : p)),
        activePaneId: paneId
      }))
      return
    }

    if (!get().contents[path]) {
      await get().loadContent(path)
    }

    const tab = emptyTab('note', stripExt(basename(path)), path)
    if (opts.mode) tab.mode = opts.mode
    set((s) => ({
      panes: s.panes.map((p) =>
        p.id === paneId
          ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id }
          : p
      ),
      activePaneId: paneId
    }))
    get().persistWorkspace()
  },

  openSpecial(kind, opts = {}) {
    const state = get()
    const paneId = state.activePaneId
    const pane = state.panes.find((p) => p.id === paneId) ?? state.panes[0]
    const titles: Record<string, string> = {
      graph: 'Graph view',
      canvas: stripExt(basename(opts.path ?? 'Canvas')),
      settings: 'Settings',
      search: 'Search'
    }
    const existing = pane.tabs.find(
      (t) => t.kind === kind && (kind !== 'canvas' || t.path === opts.path)
    )
    if (existing) {
      set({
        panes: state.panes.map((p) => (p.id === pane.id ? { ...p, activeTabId: existing.id } : p)),
        activePaneId: pane.id
      })
      return
    }
    const tab = emptyTab(kind, titles[kind] ?? kind, opts.path)
    set({
      panes: state.panes.map((p) =>
        p.id === pane.id ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id } : p
      ),
      activePaneId: pane.id
    })
    get().persistWorkspace()
  },

  closeTab(paneId, tabId) {
    set((s) => {
      let panes = s.panes.map((p) => {
        if (p.id !== paneId) return p
        const idx = p.tabs.findIndex((t) => t.id === tabId)
        if (idx === -1) return p
        const tabs = p.tabs.filter((t) => t.id !== tabId)
        const activeTabId =
          p.activeTabId === tabId ? (tabs[Math.max(0, idx - 1)]?.id ?? '') : p.activeTabId
        return { ...p, tabs, activeTabId }
      })
      panes = panes.filter((p) => p.id === paneId ? true : p.tabs.length > 0)
      if (panes.length === 0) panes = [newPane()]
      const activePaneId = panes.some((p) => p.id === s.activePaneId) ? s.activePaneId : panes[0].id
      return { panes, activePaneId }
    })
    get().persistWorkspace()
  },

  closeActiveTab() {
    const pane = get().activePane()
    if (!pane || !pane.activeTabId) return
    get().closeTab(pane.id, pane.activeTabId)
  },

  activateTab(paneId, tabId) {
    set((s) => ({
      panes: s.panes.map((p) => (p.id === paneId ? { ...p, activeTabId: tabId } : p)),
      activePaneId: paneId
    }))
    get().persistWorkspace()
  },

  setTabMode(mode) {
    const pane = get().activePane()
    if (!pane) return
    set((s) => ({ panes: updateActiveTab(s.panes, pane.id, (tab) => ({ ...tab, mode })) }))
    get().persistWorkspace()
  },

  goBack() {
    const pane = get().activePane()
    if (!pane) return
    const tab = pane.tabs.find((t) => t.id === pane.activeTabId)
    if (!tab || tab.kind !== 'note' || !tab.history) return
    const idx = (tab.historyIndex ?? 0) - 1
    if (idx < 0) return
    const path = tab.history[idx]
    set((s) => ({
      panes: updateActiveTab(s.panes, pane.id, (t) => ({ ...t, historyIndex: idx, path, title: stripExt(basename(path)) }))
    }))
    get().loadContent(path)
  },

  goForward() {
    const pane = get().activePane()
    if (!pane) return
    const tab = pane.tabs.find((t) => t.id === pane.activeTabId)
    if (!tab || tab.kind !== 'note' || !tab.history) return
    const idx = (tab.historyIndex ?? 0) + 1
    if (idx >= tab.history.length) return
    const path = tab.history[idx]
    set((s) => ({
      panes: updateActiveTab(s.panes, pane.id, (t) => ({ ...t, historyIndex: idx, path, title: stripExt(basename(path)) }))
    }))
    get().loadContent(path)
  },

  splitPane() {
    const state = get()
    const pane = state.activePane()
    if (!pane) return
    const tab = pane.tabs.find((t) => t.id === pane.activeTabId)
    const newP = newPane()
    if (tab) {
      newP.tabs = [{ ...tab, id: uid('tab'), history: tab.history ? [...tab.history] : [] }]
      newP.activeTabId = newP.tabs[0].id
    }
    set({ panes: [...state.panes, newP], activePaneId: newP.id })
    get().persistWorkspace()
  },

  closePane(paneId) {
    set((s) => {
      if (s.panes.length === 1) return s
      const panes = s.panes.filter((p) => p.id !== paneId)
      return { panes, activePaneId: s.activePaneId === paneId ? panes[0].id : s.activePaneId }
    })
    get().persistWorkspace()
  },

  async loadContent(path) {
    const cached = get().contents[path]
    if (cached !== undefined) return cached
    if (!isMarkdown(path) && !isCanvas(path)) {
      set((s) => ({ contents: { ...s.contents, [path]: '' }, savedContents: { ...s.savedContents, [path]: '' } }))
      return ''
    }
    try {
      const text = await api.fs.read(path)
      set((s) => ({
        contents: { ...s.contents, [path]: text },
        savedContents: { ...s.savedContents, [path]: text }
      }))
      return text
    } catch {
      set((s) => ({
        contents: { ...s.contents, [path]: '' },
        savedContents: { ...s.savedContents, [path]: '' }
      }))
      return ''
    }
  },

  setContent(path, content) {
    const state = get()
    const isDirty = state.savedContents[path] !== content
    set((s) => ({
      contents: { ...s.contents, [path]: content },
      dirty: { ...s.dirty, [path]: isDirty }
    }))
    const meta = noteMetaFromText(path, content)
    const index = { ...state.index, notes: { ...state.index.notes, [path]: meta } }
    set({ index })
    if (reindexTimer) clearTimeout(reindexTimer)
    reindexTimer = setTimeout(() => {
      const current = get().index
      linkIndex(current)
      set({ index: { ...current } })
    }, 320)

    const existing = saveTimers.get(path)
    if (existing) clearTimeout(existing)
    saveTimers.set(
      path,
      setTimeout(() => {
        saveTimers.delete(path)
        get().saveNote(path)
      }, 700)
    )
  },

  async saveNote(path) {
    const target = path ?? get().notePath()
    if (!target) return
    const content = get().contents[target]
    if (content === undefined) return
    if (get().savedContents[target] === content) return
    try {
      await api.fs.write(target, content)
      set((s) => ({
        savedContents: { ...s.savedContents, [target]: content },
        dirty: { ...s.dirty, [target]: false },
        conflicts: { ...s.conflicts, [target]: false }
      }))
      const meta = noteMetaFromText(target, content)
      const index = { ...get().index, notes: { ...get().index.notes, [target]: meta } }
      linkIndex(index)
      set({ index })
      if (get().settings.sync.onSave) get().syncNow().catch(() => undefined)
    } catch (err) {
      get().toast(`Could not save ${basename(target)}: ${String(err)}`, 'error')
    }
  },

  async saveAll() {
    await Promise.all(Object.keys(get().dirty).filter((p) => get().dirty[p]).map((p) => get().saveNote(p)))
  },

  async reloadFromDisk(path) {
    const text = await api.fs.read(path)
    set((s) => ({
      contents: { ...s.contents, [path]: text },
      savedContents: { ...s.savedContents, [path]: text },
      dirty: { ...s.dirty, [path]: false },
      conflicts: { ...s.conflicts, [path]: false },
      externalRevision: { ...s.externalRevision, [path]: (s.externalRevision[path] ?? 0) + 1 }
    }))
    const index = { ...get().index, notes: { ...get().index.notes, [path]: noteMetaFromText(path, text) } }
    linkIndex(index)
    set({ index })
  },

  async createNote(opts = {}) {
    const state = get()
    if (!state.vault) return null
    let folder = opts.folder ?? ''
    if (!opts.folder) {
      if (state.settings.newNoteLocation === 'current') {
        const current = state.notePath()
        folder = current ? dirname(current) : ''
      } else if (state.settings.newNoteLocation === 'folder') {
        folder = joinPath(state.settings.newNoteFolder)
      }
    }
    const baseName = (opts.name ?? 'Untitled').replace(/[/\\]/g, '-')
    let path = joinPath(folder, `${baseName}.md`)
    let i = 1
    while (state.files.includes(path)) {
      path = joinPath(folder, `${baseName} ${i++}.md`)
    }
    await api.fs.create(path, opts.content ?? '')
    await get().refreshVault()
    set((s) => ({
      contents: { ...s.contents, [path]: opts.content ?? '' },
      savedContents: { ...s.savedContents, [path]: opts.content ?? '' }
    }))
    if (opts.open !== false) {
      await get().openNote(path, { newTab: opts.newTab })
      const tab = get().activeTab()
      if (tab) set((s) => ({ panes: updateActiveTab(s.panes, s.activePaneId, (t) => ({ ...t, title: stripExt(basename(path)) })) }))
      set({ modal: null })
    }
    return path
  },

  async createFolder(parent = '') {
    const state = get()
    const run = async (name: string): Promise<void> => {
      const clean = name.trim().replace(/[/\\]/g, '-')
      if (!clean) return
      let target = joinPath(parent, clean)
      let i = 1
      while (state.files.includes(target) || state.tree.some((n) => n.path === target)) {
        target = joinPath(parent, `${clean} ${i++}`)
      }
      await api.fs.mkdir(target)
      set((s) => ({ expandedFolders: { ...s.expandedFolders, [target]: true, [parent]: true } }))
      await get().refreshVault()
      get().hideModal()
    }
    get().showModal({
      type: 'prompt',
      title: 'New folder',
      label: parent ? `Inside ${parent}` : 'Vault root',
      value: '',
      placeholder: 'Folder name',
      submitLabel: 'Create folder',
      onSubmit: run
    })
  },

  async renamePath(oldPath) {
    const state = get()
    const isFolder = !isNote(oldPath)
    const currentName = basename(oldPath)
    const run = async (value: string): Promise<void> => {
      const clean = value.trim()
      if (!clean) {
        get().hideModal()
        return
      }
      let newName = clean
      if (!isFolder) {
        const ext = extname(oldPath)
        if (ext && !clean.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) newName = `${clean}.${ext}`
      }
      const target = joinPath(dirname(oldPath), newName)
      if (target === oldPath) {
        get().hideModal()
        return
      }
      try {
        await api.fs.rename(oldPath, target)
        const s = get()
        const contents = { ...s.contents }
        const moved: Record<string, string> = {}
        for (const key of Object.keys(contents)) {
          if (key === oldPath) moved[target] = contents[key]
          else if (isFolder && key.startsWith(`${oldPath}/`)) moved[`${target}/${key.slice(oldPath.length + 1)}`] = contents[key]
        }
        const panes = s.panes.map((p) => ({
          ...p,
          tabs: p.tabs.map((t) => {
            if (t.kind !== 'note' || !t.path) return t
            if (t.path === oldPath) return { ...t, path: target, title: stripExt(basename(target)) }
            if (isFolder && t.path.startsWith(`${oldPath}/`)) {
              const np = `${target}/${t.path.slice(oldPath.length + 1)}`
              return { ...t, path: np, title: stripExt(basename(np)) }
            }
            return t
          })
        }))
        set({ panes, contents: { ...contents, ...moved }, externalRevision: { ...s.externalRevision } })
        await get().refreshVault(true)
        get().hideModal()
        get().toast(`Renamed to ${basename(target)}`, 'success')
      } catch (err) {
        get().toast(String(err), 'error')
      }
    }
    get().showModal({
      type: 'prompt',
      title: isFolder ? 'Rename folder' : 'Rename note',
      label: oldPath,
      value: currentName,
      submitLabel: 'Rename',
      onSubmit: run
    })
  },

  async deletePath(path) {
    const state = get()
    const label = basename(path)
    get().showModal({
      type: 'confirm',
      title: `Delete “${label}”?`,
      message: 'The item is moved to the macOS Trash. You can restore it from Finder.',
      confirmLabel: 'Move to Trash',
      danger: true,
      onConfirm: async () => {
        await api.fs.remove(path)
        set((s) => {
          const panes = s.panes.map((p) => ({
            ...p,
            tabs: p.tabs.filter((t) => !(t.kind === 'note' && t.path && (t.path === path || t.path.startsWith(`${path}/`))))
          }))
          return { panes: panes.length ? panes : [newPane()] }
        })
        await get().refreshVault(true)
        get().hideModal()
        get().toast(`Moved ${label} to Trash`, 'success')
      }
    })
  },

  async movePath(from, toDir) {
    const target = joinPath(toDir, basename(from))
    if (target === from) return
    try {
      await api.fs.rename(from, target)
      const s = get()
      const panes = s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.path === from ? { ...t, path: target, title: stripExt(basename(target)) } : t
        )
      }))
      set({ panes })
      await get().refreshVault(true)
      get().toast(`Moved to ${toDir || 'vault root'}`, 'success')
    } catch (err) {
      get().toast(String(err), 'error')
    }
  },

  async duplicatePath(path) {
    const dot = path.lastIndexOf('.')
    const base = dot === -1 ? path : path.slice(0, dot)
    const ext = dot === -1 ? '' : path.slice(dot)
    await api.fs.copy(path, `${base} copy${ext}`)
    await get().refreshVault()
    get().toast('Created a copy', 'success')
  },

  async attachFiles(files, folder) {
    const saved: string[] = []
    for (const file of files) {
      const name = file.name
      if ('path' in file) {
        const imported = await api.fs.importFiles([file.path], folder ?? get().settings.attachmentsFolder)
        saved.push(...imported)
        continue
      }
      const buffer = new Uint8Array(await file.arrayBuffer())
      const target = await api.fs.saveAttachment(name, buffer)
      saved.push(target)
    }
    await get().refreshVault()
    return saved
  },

  async importFromDisk() {
    const paths = await api.dialog.open({ title: 'Import files', properties: ['openFile', 'multiSelections'] })
    if (!paths.length) return
    const imported = await api.fs.importFiles(paths, get().settings.attachmentsFolder)
    await get().refreshVault()
    get().toast(`Imported ${imported.length} file${imported.length === 1 ? '' : 's'}`, 'success')
  },

  async openDaily() {
    const s = get()
    const date = new Date()
    const name = formatDate(date, s.settings.dailyNotes.format || 'YYYY-MM-DD')
    const path = joinPath(s.settings.dailyNotes.folder, `${name}.md`)
    const exists = await api.fs.exists(path)
    if (!exists) {
      let content = `# ${formatDate(date, 'dddd, MMMM D, YYYY')}\n\n`
      const template = s.settings.dailyNotes.template
      if (template) {
        try {
          content = await api.fs.read(template)
        } catch {
          /* template missing */
        }
      }
      content = content
        .replace(/\{\{date(?::([^}]+))?\}\}/g, (_m, fmt) => formatDate(date, fmt || 'YYYY-MM-DD'))
        .replace(/\{\{title\}\}/g, name)
        .replace(/\{\{time(?::([^}]+))?\}\}/g, (_m, fmt) => formatDate(date, fmt || 'HH:mm'))
      await api.fs.create(path, content)
      await get().refreshVault()
    }
    await get().openNote(path)
    get().toast(`Daily note: ${name}`, 'info')
  },

  async openRandom() {
    const notes = Object.keys(get().index.notes)
    if (!notes.length) return
    const path = notes[Math.floor(Math.random() * notes.length)]
    await get().openNote(path)
  },

  async insertTemplate() {
    const s = get()
    const folder = s.settings.templatesFolder
    const templates = s.files.filter((f) => f.startsWith(`${folder}/`) && isMarkdown(f))
    if (!templates.length) {
      get().toast(`No templates found in /${folder}`, 'error')
      return
    }
    if (templates.length === 1) {
      await get().applyTemplate(templates[0])
      return
    }
    get().showModal({ type: 'template-picker' })
  },

  async applyTemplate(templatePath) {
    get().hideModal()
    const path = get().notePath()
    if (!path) return
    const date = new Date()
    const raw = await api.fs.read(templatePath)
    const title = stripExt(basename(path))
    const content = raw
      .replace(/\{\{date(?::([^}]+))?\}\}/g, (_m, fmt) => formatDate(date, fmt || 'YYYY-MM-DD'))
      .replace(/\{\{time(?::([^}]+))?\}/g, (_m, fmt) => formatDate(date, fmt || 'HH:mm'))
      .replace(/\{\{title\}\}/g, title)
    const current = get().contents[path] ?? ''
    const next = current.trim().length ? `${current}\n${content}` : content
    get().setContent(path, next)
    await get().saveNote(path)
    get().toast(`Inserted ${stripExt(basename(templatePath))}`, 'success')
  },

  showModal: (modal) => set({ modal }),
  hideModal: () => set({ modal: null }),
  toast(message, kind = 'info', action) {
    const id = uid('toast')
    set((s) => ({ toasts: [...s.toasts, { id, message, kind, action }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  prompt: (opts) => get().showModal({ type: 'prompt', ...opts }),
  confirm: (opts) => get().showModal({ type: 'confirm', ...opts }),

  toggleBookmark(path) {
    const bookmarks = get().settings.bookmarks
    const next = bookmarks.includes(path) ? bookmarks.filter((b) => b !== path) : [...bookmarks, path]
    get().setSettings({ bookmarks: next })
  },

  setSearchQuery(query) {
    set((s) => ({ searchQuery: query, searchToken: s.searchToken + 1, sidebarTab: 'search', sidebarOpen: true }))
  },

  async refreshGit() {
    try {
      const status = await api.git.status()
      set((s) => ({ sync: { ...s.sync, status } }))
    } catch {
      set((s) => ({ sync: { ...s.sync, status: null } }))
    }
  },

  async syncNow(message) {
    if (get().sync.busy) return
    set((s) => ({ sync: { ...s.sync, busy: true, message: 'Syncing…' } }))
    try {
      await get().saveAll()
      const result = await api.git.sync(message)
      set((s) => ({ sync: { ...s.sync, busy: false, lastSync: Date.now(), message: result.message } }))
      await get().refreshVault(true)
      await get().refreshGit()
      const state = get()
      if (!result.ok) {
        state.toast(result.message, 'error')
      } else if (result.pulled || result.committed || result.pushed) {
        state.toast(result.message, 'success')
      }
    } catch (err) {
      set((s) => ({ sync: { ...s.sync, busy: false, message: String(err) } }))
      get().toast(`Sync failed: ${String(err)}`, 'error')
    }
  },

  async openVault(path) {
    const info = await api.vault.open(path)
    if (!info) return
    await get().saveAll()
    set({ vault: info, panes: [newPane()], contents: {}, savedContents: {}, dirty: {}, index: EMPTY_INDEX, tree: [], files: [] })
    await get().boot()
    await get().refreshGit()
  },

  async chooseVault() {
    const info = await api.vault.choose()
    if (!info) return
    await get().saveAll()
    set({ vault: info, panes: [newPane()], contents: {}, savedContents: {}, dirty: {}, index: EMPTY_INDEX, tree: [], files: [] })
    await get().boot()
    await get().refreshGit()
  },

  async createVault(name) {
    const info = await api.vault.createVault(name)
    if (!info) return
    set({ vault: info, panes: [newPane()], contents: {}, savedContents: {}, dirty: {}, index: EMPTY_INDEX, tree: [], files: [] })
    await get().boot()
    await get().refreshGit()
  }
}))

// Debug handle used by the development harness; harmless in production.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __slate: typeof useStore }).__slate = useStore
}

/* ---------- Selectors ---------- */

export function useActiveTab(): TabState | undefined {
  return useStore((s) => {
    const pane = s.panes.find((p) => p.id === s.activePaneId) ?? s.panes[0]
    return pane?.tabs.find((t) => t.id === pane.activeTabId)
  })
}

export function useCurrentNote(): string | null {
  return useStore((s) => {
    const pane = s.panes.find((p) => p.id === s.activePaneId) ?? s.panes[0]
    const tab = pane?.tabs.find((t) => t.id === pane.activeTabId)
    return tab?.kind === 'note' ? (tab.path ?? null) : null
  })
}

export function useNoteMeta(path: string | null) {
  return useStore((s) => (path ? s.index.notes[path] : undefined))
}

export function useSettings(): AppSettings {
  return useStore((s) => s.settings)
}

export function resolveAttachment(relative: string, source: string, files: string[], attachmentsFolder: string): string {
  const clean = decodeURI(relative).replace(/^\/+/, '')
  const candidates = [
    joinPath(dirname(source), clean),
    clean,
    joinPath(attachmentsFolder, clean),
    joinPath(attachmentsFolder, basename(clean))
  ]
  for (const candidate of candidates) {
    if (files.includes(candidate)) return candidate
  }
  const byName = files.find((f) => basename(f).toLowerCase() === basename(clean).toLowerCase())
  return byName ?? candidates[0]
}

export function frontmatterOf(content: string): Record<string, unknown> | null {
  return splitFrontmatter(content).frontmatter
}

export { clamp, dirname, basename, joinPath }
