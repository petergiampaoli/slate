/** Types shared between the Electron main process and the renderer. */

export type FileKind = 'file' | 'folder'

export interface FileNode {
  name: string
  /** Vault-relative POSIX path. */
  path: string
  kind: FileKind
  /** Lowercase extension without the dot, for files. */
  ext?: string
  mtime?: number
  size?: number
  children?: FileNode[]
}

export interface VaultInfo {
  path: string
  name: string
}

export interface VaultChange {
  /** Vault-relative paths that changed. */
  paths: string[]
  type: 'change' | 'rename' | 'unknown'
}

export interface GitFileStatus {
  path: string
  /** Two-letter porcelain status code, e.g. " M", "??". */
  code: string
  staged: boolean
}

export interface GitCommit {
  hash: string
  shortHash: string
  date: string
  message: string
  author: string
}

export interface GitStatus {
  isRepo: boolean
  branch: string
  remote: string | null
  hasRemote: boolean
  ahead: number
  behind: number
  changed: GitFileStatus[]
  lastCommit: GitCommit | null
  ghAvailable: boolean
}

export interface SyncResult {
  ok: boolean
  message: string
  committed: number
  pulled: boolean
  pushed: boolean
  conflicts: string[]
}

export interface CreateRepoResult {
  ok: boolean
  message: string
  remote?: string
}

export interface FileStat {
  exists: boolean
  isDirectory: boolean
  mtime: number
  size: number
}

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  lineHeight: number
  lineWidth: number
  showLineNumbers: boolean
  spellcheck: boolean
  vimMode: boolean
  autoPairBrackets: boolean
  smartIndent: boolean
}

export interface ThemeSettings {
  mode: 'system' | 'light' | 'dark'
  accent: string
  translucency: boolean
  customCss: string
}

export interface DailyNotesSettings {
  enabled: boolean
  folder: string
  format: string
  template: string
}

export interface SyncSettings {
  auto: boolean
  intervalMinutes: number
  onSave: boolean
  branch: string
  remote: string | null
}

export interface DictationSettings {
  language: string
  keepAudio: boolean
  autoTitle: boolean
}

export interface DictationEngineInfo {
  available: boolean
  modelName: string
  modelPath: string | null
  binaryPath: string | null
  modelSize: number
  reason?: string
}

export interface TranscriptionResponse {
  ok: boolean
  text?: string
  error?: string
  model?: string
  seconds?: number
}

export interface UserProfileSettings {
  /** Active user of this vault. */
  name: string
  /** userName -> local vault folder. */
  vaults: Record<string, string>
  /** userName -> open tabs and panes for that vault. */
  workspaces: Record<string, WorkspaceState>
  /** Repository naming convention, e.g. "slate-vault-user-". */
  repoPrefix: string
}

export interface UserProvisionResult {
  ok: boolean
  status: 'opened' | 'cloned' | 'created' | 'error'
  message: string
  userName: string
  repoName: string
  path?: string
}

export interface AppSettings {
  version: number
  vaultPath: string | null
  recentVaults: string[]
  profile: UserProfileSettings
  dictation: DictationSettings
  theme: ThemeSettings
  editor: EditorSettings
  dailyNotes: DailyNotesSettings
  templatesFolder: string
  attachmentsFolder: string
  newNoteLocation: 'root' | 'current' | 'folder'
  newNoteFolder: string
  sync: SyncSettings
  bookmarks: string[]
  starredTags: string[]
  ui: {
    sidebarOpen: boolean
    rightSidebarOpen: boolean
    sidebarWidth: number
    rightSidebarWidth: number
    sidebarTab: string
    focusMode: boolean
    typewriterMode: boolean
  }
  workspace: WorkspaceState | null
  stats: {
    totalNotes: number
    totalWords: number
    lastOpened: number
  }
}

export interface TabState {
  id: string
  kind: 'note' | 'graph' | 'canvas' | 'settings' | 'search' | 'sync' | 'studio'
  path?: string
  title: string
  mode?: 'live' | 'source' | 'reading'
  scrollTop?: number
  cursor?: number
  pinned?: boolean
  history?: string[]
  historyIndex?: number
}

export interface PaneState {
  id: string
  tabs: TabState[]
  activeTabId: string
}

export interface WorkspaceState {
  panes: PaneState[]
  activePaneId: string
}

export interface SlateApi {
  platform: string
  appVersion: string
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    onChanged(cb: (settings: AppSettings) => void): () => void
  }
  vault: {
    choose(): Promise<VaultInfo | null>
    open(path: string): Promise<VaultInfo | null>
    current(): Promise<VaultInfo | null>
    tree(): Promise<FileNode[]>
    files(): Promise<string[]>
    reveal(path: string): Promise<void>
    refresh(): Promise<FileNode[]>
    onChanged(cb: (change: VaultChange) => void): () => void
    createVault(name: string): Promise<VaultInfo | null>
    stats(): Promise<{ notes: number; words: number; folders: number; attachments: number }>
  }
  fs: {
    read(path: string): Promise<string>
    readBinary(path: string): Promise<Uint8Array>
    write(path: string, content: string): Promise<void>
    create(path: string, content?: string): Promise<void>
    mkdir(path: string): Promise<void>
    rename(from: string, to: string): Promise<void>
    remove(path: string): Promise<void>
    exists(path: string): Promise<boolean>
    stat(path: string): Promise<FileStat>
    list(dir: string): Promise<FileNode[]>
    saveAttachment(name: string, data: Uint8Array): Promise<string>
    importFiles(paths: string[], dir: string): Promise<string[]>
    copy(from: string, to: string): Promise<void>
  }
  git: {
    status(): Promise<GitStatus>
    sync(message?: string): Promise<SyncResult>
    init(): Promise<{ ok: boolean; message: string }>
    log(limit?: number): Promise<GitCommit[]>
    fileHistory(path: string): Promise<GitCommit[]>
    show(rev: string, path: string): Promise<string>
    restore(rev: string, path: string): Promise<void>
    setRemote(url: string): Promise<{ ok: boolean; message: string }>
    createRepo(name: string): Promise<CreateRepoResult>
    clone(url: string, dir: string): Promise<{ ok: boolean; message: string }>
    diff(path: string): Promise<string>
  }
  shell: {
    openExternal(url: string): Promise<void>
    openPath(path: string): Promise<void>
    showItemInFolder(path: string): Promise<void>
    trash(path: string): Promise<void>
  }
  dictation: {
    engine(): Promise<DictationEngineInfo>
    requestMic(): Promise<boolean>
    transcribe(wav: Uint8Array, language?: string, duration?: number): Promise<TranscriptionResponse>
    onProgress(cb: (percent: number) => void): () => void
  }
  users: {
    provision(name: string, preferredPath?: string): Promise<UserProvisionResult>
    defaultPath(name: string): Promise<string>
    repoName(name: string): string
  }
  files: {
    /** Resolve the absolute path of a dropped File (Electron webUtils). */
    pathFor(file: unknown): string
  }
  dialog: {
    open(options: { title?: string; properties?: string[]; filters?: { name: string; extensions: string[] }[] }): Promise<string[]>
    save(options: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
  }
  window: {
    setTitle(title: string): Promise<void>
    setDocumentEdited(edited: boolean): Promise<void>
    toggleFullScreen(): Promise<void>
    reload(): Promise<void>
    newWindow(): Promise<void>
  }
  export: {
    pdf(html: string, name: string): Promise<{ ok: boolean; path?: string }>
    html(html: string, name: string): Promise<{ ok: boolean; path?: string }>
    markdown(content: string, name: string): Promise<{ ok: boolean; path?: string }>
    svg(svg: string, name: string): Promise<{ ok: boolean; path?: string }>
  }
  menu: {
    onAction(cb: (action: string, payload?: unknown) => void): () => void
    setContext(context: { hasNote: boolean; canGoBack: boolean; canGoForward: boolean; isReading: boolean }): void
  }
}
