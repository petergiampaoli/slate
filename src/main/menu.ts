import { BrowserWindow, Menu, app, dialog, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { settingsStore } from './store'
import { menuOpenVault } from './ipc'

function send(action: string, payload?: unknown): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:action', action, payload)
}

export function buildMenu(): void {
  const recent = settingsStore().get().recentVaults
  const appName = app.name

  const recentSubmenu: MenuItemConstructorOptions[] = recent.length
    ? recent.map((p) => ({
        label: p.replace(app.getPath('home'), '~'),
        click: () => send('open-vault-path', p)
      }))
    : [{ label: 'No recent vaults', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: 'about', label: `About ${appName}` },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${appName}` }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'Cmd+N', click: () => send('new-note') },
        { label: 'New Window', accelerator: 'Cmd+Shift+N', click: () => send('new-window') },
        { type: 'separator' },
        {
          label: 'Open Vault…',
          accelerator: 'Cmd+Shift+O',
          click: async () => {
            const info = await menuOpenVault()
            if (info) send('vault-opened', info)
            buildMenu()
          }
        },
        { label: 'Open Recent Vault', submenu: recentSubmenu },
        {
          label: 'Reveal Vault in Finder',
          click: () => {
            const p = settingsStore().get().vaultPath
            if (p) shell.showItemInFolder(p)
          }
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'Cmd+S', click: () => send('save') },
        { label: 'Sync Now', accelerator: 'Cmd+Shift+S', click: () => send('sync') },
        { label: 'Version History…', click: () => send('version-history') },
        { type: 'separator' },
        { label: 'Export as PDF…', click: () => send('export-pdf') },
        { label: 'Export as HTML…', click: () => send('export-html') },
        { label: 'Export as Markdown…', click: () => send('export-markdown') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'Cmd+W', click: () => send('close-tab') }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find in Note', accelerator: 'Cmd+F', click: () => send('find-in-note') },
        { label: 'Search Vault', accelerator: 'Cmd+Shift+F', click: () => send('search-vault') },
        { type: 'separator' },
        { label: 'Bold', accelerator: 'Cmd+B', click: () => send('format-bold') },
        { label: 'Italic', accelerator: 'Cmd+I', click: () => send('format-italic') },
        { label: 'Strikethrough', accelerator: 'Cmd+Shift+X', click: () => send('format-strike') },
        { label: 'Highlight', accelerator: 'Cmd+Shift+H', click: () => send('format-highlight') },
        { label: 'Inline Code', accelerator: 'Cmd+Shift+C', click: () => send('format-code') },
        { label: 'Insert Link', accelerator: 'Cmd+K', click: () => send('insert-link') },
        { type: 'separator' },
        { label: 'Insert Table', click: () => send('insert-table') },
        { label: 'Insert Callout', click: () => send('insert-callout') },
        { label: 'Insert Code Block', accelerator: 'Cmd+Alt+C', click: () => send('insert-code') },
        { label: 'Insert Math Block', click: () => send('insert-math') },
        { label: 'Insert Task', click: () => send('insert-task') },
        { type: 'separator' },
        { label: 'Template: Insert', click: () => send('insert-template') }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Left Sidebar',
          accelerator: 'Cmd+Alt+B',
          click: () => send('toggle-sidebar')
        },
        {
          label: 'Toggle Right Sidebar',
          accelerator: 'Cmd+Alt+R',
          click: () => send('toggle-right-sidebar')
        },
        { label: 'Toggle Reading View', accelerator: 'Cmd+E', click: () => send('toggle-reading') },
        { label: 'Toggle Source Mode', accelerator: 'Cmd+Alt+E', click: () => send('toggle-source') },
        { type: 'separator' },
        { label: 'Backlinks', click: () => send('show-backlinks') },
        { label: 'Outline', click: () => send('show-outline') },
        { label: 'Local Graph', click: () => send('show-local-graph') },
        { type: 'separator' },
        { label: 'Graph View', accelerator: 'Cmd+G', click: () => send('graph') },
        { label: 'Quick Switcher', accelerator: 'Cmd+O', click: () => send('quick-switcher') },
        { label: 'Command Palette', accelerator: 'Cmd+P', click: () => send('command-palette') },
        { label: 'Daily Note', accelerator: 'Cmd+Shift+D', click: () => send('daily-note') },
        { label: 'Random Note', click: () => send('random-note') },
        { type: 'separator' },
        { label: 'Back', accelerator: 'Cmd+[', click: () => send('go-back') },
        { label: 'Forward', accelerator: 'Cmd+]', click: () => send('go-forward') },
        { type: 'separator' },
        { label: 'Focus Mode', click: () => send('focus-mode') },
        { label: 'Typewriter Mode', click: () => send('typewriter-mode') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('keyboard-shortcuts') },
        { label: 'Open Vault in Terminal', click: () => send('open-terminal') },
        { type: 'separator' },
        {
          label: 'Show Data Folder',
          click: () => shell.showItemInFolder(app.getPath('userData'))
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function showAbout(): void {
  dialog.showMessageBox({
    type: 'info',
    title: 'About Slate',
    message: `Slate ${app.getVersion()}`,
    detail:
      'A local-first Markdown knowledge base.\nNotes are plain files on disk, synced to your private GitHub repository.'
  })
}
