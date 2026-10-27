import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '@shared/types'

const SETTINGS_VERSION = 1

export function defaultSettings(): AppSettings {
  return {
    version: SETTINGS_VERSION,
    vaultPath: null,
    recentVaults: [],
    theme: {
      mode: 'system',
      accent: '#7c6cf0',
      translucency: true,
      customCss: ''
    },
    editor: {
      fontSize: 15.5,
      fontFamily: 'editor-sans',
      lineHeight: 1.7,
      lineWidth: 720,
      showLineNumbers: false,
      spellcheck: true,
      vimMode: false,
      autoPairBrackets: true,
      smartIndent: true
    },
    dailyNotes: {
      enabled: true,
      folder: 'Daily',
      format: 'YYYY-MM-DD',
      template: ''
    },
    templatesFolder: 'Templates',
    attachmentsFolder: 'Attachments',
    newNoteLocation: 'root',
    newNoteFolder: '',
    sync: {
      auto: true,
      intervalMinutes: 5,
      onSave: false,
      branch: 'main',
      remote: null
    },
    bookmarks: [],
    starredTags: [],
    ui: {
      sidebarOpen: true,
      rightSidebarOpen: true,
      sidebarWidth: 272,
      rightSidebarWidth: 300,
      sidebarTab: 'files',
      focusMode: false,
      typewriterMode: false
    },
    workspace: null,
    stats: {
      totalNotes: 0,
      totalWords: 0,
      lastOpened: 0
    }
  }
}

/** Deep merge plain objects so newly added settings keys get defaults. */
function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base
  if (Array.isArray(base) || typeof base !== 'object') return patch as T
  if (typeof patch !== 'object') return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = (base as Record<string, unknown>)[key]
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      out[key] = merge(current, value)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out as T
}

class SettingsStore {
  private file: string
  private data: AppSettings
  private timer: NodeJS.Timeout | null = null

  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json')
    let loaded: AppSettings
    try {
      const raw = fs.readFileSync(this.file, 'utf8')
      loaded = merge(defaultSettings(), JSON.parse(raw))
    } catch {
      loaded = defaultSettings()
    }
    this.data = loaded
  }

  get(): AppSettings {
    return this.data
  }

  set(patch: Partial<AppSettings>): AppSettings {
    this.data = merge(this.data, patch)
    this.schedule()
    return this.data
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
    } catch (err) {
      console.error('[slate] failed to persist settings', err)
    }
  }

  addRecentVault(vaultPath: string): void {
    const recents = [vaultPath, ...this.data.recentVaults.filter((p) => p !== vaultPath)].slice(0, 12)
    this.set({ recentVaults: recents, vaultPath })
  }
}

let store: SettingsStore | null = null

export function settingsStore(): SettingsStore {
  if (!store) store = new SettingsStore()
  return store
}
