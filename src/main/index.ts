import { BrowserWindow, app, ipcMain, nativeTheme, protocol, session, shell } from 'electron'
import path from 'node:path'
import { buildMenu } from './menu'
import { pickVaultOnFirstRun, registerAssetProtocol, registerIpc } from './ipc'
import { settingsStore } from './store'

const isDev = !app.isPackaged

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'slate',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
  }
])

app.setName('Slate')

app.setAboutPanelOptions({
  applicationName: 'Slate',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: 'A local-first Markdown knowledge base. Notes are plain files, synced with git.'
})

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const settings = settingsStore().get()
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Slate',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 19 },
    vibrancy: settings.theme.translucency ? 'under-window' : undefined,
    visualEffectState: 'active',
    backgroundColor: settings.theme.translucency ? '#00000000' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
      webviewTag: false,
      navigateOnDragDrop: false
    }
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('console-message', (event: any) => {
    const level = event?.level ?? 'info'
    if (level === 'error' || level === 'warning') {
      console.log(`[renderer:${level}] ${event?.message ?? ''} (${event?.sourceId ?? ''}:${event?.lineNumber ?? 0})`)
    }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone', details.reason)
  })

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'system'
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media'
  })
  registerIpc()
  ipcMain.on('app:version', (event) => {
    event.returnValue = app.getVersion()
  })
  ipcMain.handle('window:new', () => {
    createWindow()
  })
  ipcMain.on('menu:set-context', (event, _context) => {
    event.returnValue = true
  })
  registerAssetProtocol(protocol)
  await pickVaultOnFirstRun()
  buildMenu()
  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else {
      BrowserWindow.getAllWindows()[0].show()
    }
  })
})

app.on('window-all-closed', () => {
  settingsStore().flush()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  settingsStore().flush()
})

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
