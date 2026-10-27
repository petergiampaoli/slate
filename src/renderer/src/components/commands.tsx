import type { LucideIcon } from 'lucide-react'
import {
  Bold,
  Bookmark,
  Calendar,
  CheckSquare,
  Code,
  Columns2,
  Command,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FilePlus,
  FolderPlus,
  Highlighter,
  History,
  Image,
  Italic,
  Keyboard,
  LayoutGrid,
  Link,
  ListTree,
  Maximize2,
  Moon,
  Network,
  Palette,
  PanelLeft,
  PanelRight,
  PenLine,
  RefreshCw,
  Search,
  Settings,
  Sigma,
  Sparkles,
  Strikethrough,
  Table,
  Tags,
  Trash2,
  Type,
  Quote,
  X
} from 'lucide-react'
import { api, useStore } from '../state/store'
import { editorCommand } from './editorBridge'
import { basename, dirname, isMarkdown } from '../lib/utils'

export type CommandGroup = 'File' | 'Navigate' | 'Edit' | 'View' | 'Insert' | 'Sync' | 'Workspace'

export interface Command {
  id: string
  label: string
  detail?: string
  hotkey?: string
  icon?: LucideIcon
  group: CommandGroup
  run: () => unknown
}

export function buildCommands(): Command[] {
  const s = useStore.getState()
  const current = s.notePath()
  const hasNote = Boolean(current)

  const commands: Command[] = [
    {
      id: 'new-note',
      label: 'New note',
      icon: FilePlus,
      hotkey: '⌘N',
      group: 'File',
      run: () => s.createNote()
    },
    {
      id: 'new-folder',
      label: 'New folder',
      icon: FolderPlus,
      group: 'File',
      run: () => s.createFolder()
    },
    {
      id: 'new-canvas',
      label: 'New canvas',
      icon: LayoutGrid,
      group: 'File',
      run: async () => {
        const path = await s.createNote({ name: 'Untitled canvas', content: '' , open: false })
        if (!path) return
        const canvasPath = path.replace(/\.md$/, '.canvas')
        await api.fs.rename(path, canvasPath)
        await api.fs.write(canvasPath, JSON.stringify({ nodes: [], edges: [] }, null, 2))
        await s.refreshVault()
        s.openSpecial('canvas', { path: canvasPath })
      }
    },
    {
      id: 'open-daily',
      label: 'Open today’s daily note',
      icon: Calendar,
      hotkey: '⌘⇧D',
      group: 'File',
      run: () => s.openDaily()
    },
    {
      id: 'open-random',
      label: 'Open a random note',
      icon: Sparkles,
      group: 'File',
      run: () => s.openRandom()
    },
    { id: 'sep-1', label: '', group: 'File', run: () => undefined },
    {
      id: 'save',
      label: 'Save current note',
      icon: Download,
      hotkey: '⌘S',
      group: 'File',
      run: () => s.saveNote()
    },
    {
      id: 'save-all',
      label: 'Save all notes',
      group: 'File',
      run: () => s.saveAll()
    },
    {
      id: 'reveal',
      label: 'Reveal in Finder',
      icon: ExternalLink,
      group: 'File',
      run: () => current && api.vault.reveal(current)
    },
    {
      id: 'copy-path',
      label: 'Copy vault path',
      icon: Copy,
      group: 'File',
      run: () => current && navigator.clipboard.writeText(current)
    },
    {
      id: 'export-pdf',
      label: 'Export as PDF',
      icon: FileDown,
      group: 'File',
      run: () => editorCommand('export', 'pdf')
    },
    {
      id: 'export-html',
      label: 'Export as HTML',
      group: 'File',
      run: () => editorCommand('export', 'html')
    },
    {
      id: 'version-history',
      label: 'Version history',
      icon: History,
      group: 'File',
      run: () => current && s.showModal({ type: 'history', path: current })
    },

    {
      id: 'quick-switcher',
      label: 'Quick switcher',
      icon: Search,
      hotkey: '⌘O',
      group: 'Navigate',
      run: () => s.showModal({ type: 'quick-switcher' })
    },
    {
      id: 'search-vault',
      label: 'Search vault',
      icon: Search,
      hotkey: '⌘⇧F',
      group: 'Navigate',
      run: () => {
        s.setSidebarTab('search')
        window.setTimeout(() => document.getElementById('vault-search-input')?.focus(), 40)
      }
    },
    {
      id: 'graph',
      label: 'Open graph view',
      icon: Network,
      hotkey: '⌘G',
      group: 'Navigate',
      run: () => s.openSpecial('graph')
    },
    {
      id: 'local-graph',
      label: 'Open local graph',
      icon: ListTree,
      group: 'Navigate',
      run: () => useStore.setState({ rightTab: 'localgraph', rightOpen: true })
    },
    {
      id: 'back',
      label: 'Go back',
      hotkey: '⌘[',
      group: 'Navigate',
      run: () => s.goBack()
    },
    {
      id: 'forward',
      label: 'Go forward',
      hotkey: '⌘]',
      group: 'Navigate',
      run: () => s.goForward()
    },
    {
      id: 'settings',
      label: 'Open settings',
      icon: Settings,
      hotkey: '⌘,',
      group: 'Navigate',
      run: () => s.showModal({ type: 'settings' })
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      group: 'Navigate',
      run: () => s.showModal({ type: 'shortcuts' })
    },

    {
      id: 'bold',
      label: 'Bold',
      icon: Bold,
      hotkey: '⌘B',
      group: 'Edit',
      run: () => editorCommand('bold')
    },
    {
      id: 'italic',
      label: 'Italic',
      icon: Italic,
      hotkey: '⌘I',
      group: 'Edit',
      run: () => editorCommand('italic')
    },
    {
      id: 'strike',
      label: 'Strikethrough',
      icon: Strikethrough,
      hotkey: '⌘⇧X',
      group: 'Edit',
      run: () => editorCommand('strike')
    },
    {
      id: 'highlight',
      label: 'Highlight',
      icon: Highlighter,
      hotkey: '⌘⇧H',
      group: 'Edit',
      run: () => editorCommand('highlight')
    },
    {
      id: 'inline-code',
      label: 'Inline code',
      icon: Code,
      hotkey: '⌘⇧C',
      group: 'Edit',
      run: () => editorCommand('code')
    },
    {
      id: 'link',
      label: 'Insert wikilink',
      icon: Link,
      hotkey: '⌘K',
      group: 'Edit',
      run: () => editorCommand('link')
    },
    {
      id: 'find',
      label: 'Find in note',
      icon: Search,
      hotkey: '⌘F',
      group: 'Edit',
      run: () => editorCommand('find')
    },
    {
      id: 'toggle-task',
      label: 'Toggle task checkbox',
      icon: CheckSquare,
      group: 'Edit',
      run: () => editorCommand('toggle-task')
    },
    {
      id: 'bookmark',
      label: 'Bookmark current note',
      icon: Bookmark,
      group: 'Edit',
      run: () => current && s.toggleBookmark(current)
    },

    {
      id: 'insert-table',
      label: 'Insert table',
      icon: Table,
      group: 'Insert',
      run: () => editorCommand('table')
    },
    {
      id: 'insert-callout',
      label: 'Insert callout',
      icon: Quote,
      group: 'Insert',
      run: () => editorCommand('callout')
    },
    {
      id: 'insert-code',
      label: 'Insert code block',
      icon: Code,
      hotkey: '⌘⌥C',
      group: 'Insert',
      run: () => editorCommand('fenced-code')
    },
    {
      id: 'insert-math',
      label: 'Insert math block',
      icon: Sigma,
      group: 'Insert',
      run: () => editorCommand('math')
    },
    {
      id: 'insert-task',
      label: 'Insert task',
      icon: CheckSquare,
      group: 'Insert',
      run: () => editorCommand('task')
    },
    {
      id: 'insert-image',
      label: 'Attach image…',
      icon: Image,
      group: 'Insert',
      run: async () => {
        const paths = await api.dialog.open({
          title: 'Attach image',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'] }]
        })
        if (!paths.length) return
        const [saved] = await api.fs.importFiles(paths, useStore.getState().settings.attachmentsFolder)
        if (saved) {
          await s.refreshVault()
          editorCommand('insert-text', `![[${basename(saved)}]]`)
        }
      }
    },
    {
      id: 'insert-template',
      label: 'Insert template',
      icon: FilePlus,
      group: 'Insert',
      run: () => s.insertTemplate()
    },

    {
      id: 'toggle-reading',
      label: 'Toggle reading view',
      icon: PenLine,
      hotkey: '⌘E',
      group: 'View',
      run: () => {
        const tab = s.activeTab()
        if (!tab) return
        s.setTabMode(tab.mode === 'reading' ? 'live' : 'reading')
      }
    },
    {
      id: 'toggle-source',
      label: 'Toggle source mode',
      icon: Code,
      hotkey: '⌘⌥E',
      group: 'View',
      run: () => {
        const tab = s.activeTab()
        if (!tab) return
        s.setTabMode(tab.mode === 'source' ? 'live' : 'source')
      }
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle left sidebar',
      icon: PanelLeft,
      hotkey: '⌘⌥B',
      group: 'View',
      run: () => s.toggleSidebar()
    },
    {
      id: 'toggle-right',
      label: 'Toggle right sidebar',
      icon: PanelRight,
      hotkey: '⌘⌥R',
      group: 'View',
      run: () => s.toggleRight()
    },
    {
      id: 'backlinks',
      label: 'Show backlinks',
      icon: Link,
      group: 'View',
      run: () => useStore.setState({ rightTab: 'backlinks', rightOpen: true })
    },
    {
      id: 'outline',
      label: 'Show outline',
      icon: ListTree,
      group: 'View',
      run: () => useStore.setState({ rightTab: 'outline', rightOpen: true })
    },
    {
      id: 'properties',
      label: 'Show note properties',
      icon: Tags,
      group: 'View',
      run: () => useStore.setState({ rightTab: 'properties', rightOpen: true })
    },
    {
      id: 'focus-mode',
      label: 'Toggle focus mode',
      icon: Maximize2,
      group: 'View',
      run: () => s.toggleFocus()
    },
    {
      id: 'typewriter',
      label: 'Toggle typewriter mode',
      icon: Type,
      group: 'View',
      run: () => s.toggleTypewriter()
    },
    {
      id: 'cycle-theme',
      label: 'Cycle light / dark theme',
      icon: Moon,
      group: 'View',
      run: () => {
        const mode = useStore.getState().settings.theme.mode
        const next = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'
        s.setSettings({ theme: { ...useStore.getState().settings.theme, mode: next } })
        s.toast(`Theme: ${next}`, 'info')
      }
    },
    {
      id: 'theme-accent',
      label: 'Change accent colour',
      icon: Palette,
      group: 'View',
      run: () => s.showModal({ type: 'settings', section: 'appearance' })
    },

    {
      id: 'split-right',
      label: 'Split pane right',
      icon: Columns2,
      group: 'Workspace',
      run: () => s.splitPane()
    },
    {
      id: 'close-pane',
      label: 'Close pane',
      icon: X,
      group: 'Workspace',
      run: () => {
        const pane = s.activePane()
        if (pane && s.panes.length > 1) s.closePane(pane.id)
      }
    },
    {
      id: 'close-tab',
      label: 'Close tab',
      hotkey: '⌘W',
      group: 'Workspace',
      run: () => s.closeActiveTab()
    },
    {
      id: 'trash',
      label: 'Delete current note',
      icon: Trash2,
      group: 'Workspace',
      run: () => current && s.deletePath(current)
    },

    {
      id: 'sync',
      label: 'Sync vault with GitHub',
      icon: RefreshCw,
      hotkey: '⌘⇧S',
      group: 'Sync',
      run: () => s.syncNow()
    },
    {
      id: 'sync-settings',
      label: 'Configure sync',
      icon: Command,
      group: 'Sync',
      run: () => s.showModal({ type: 'settings', section: 'sync' })
    }
  ]

  return commands.filter((c) => c.id !== 'sep-1' && (c.id !== 'reveal' || hasNote) && (c.id !== 'copy-path' || hasNote))
}

export function commandMatches(command: Command, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    command.label.toLowerCase().includes(q) ||
    command.group.toLowerCase().includes(q) ||
    (command.detail ?? '').toLowerCase().includes(q)
  )
}

export function isMarkdownPath(path: string | undefined): boolean {
  return Boolean(path && isMarkdown(path))
}

export function folderLabel(path: string): string {
  return dirname(path) || 'Vault root'
}
