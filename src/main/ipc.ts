import { BrowserWindow, app, dialog, ipcMain, net, shell } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { AppSettings, FileNode } from '@shared/types'
import { git } from './git'
import { settingsStore } from './store'
import { vault } from './vault'
import { writeStarterVault } from './starter'
import { defaultVaultPath, provisionUser } from './users'
import { repoNameFor } from '@shared/naming'

function currentGit() {
  const root = vault().path
  if (!root) throw new Error('No vault is open')
  return git(root)
}

function broadcastSettings(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings)
  }
}

async function openVaultPath(root: string): Promise<{ path: string; name: string }> {
  const resolved = path.resolve(root)
  await fs.mkdir(resolved, { recursive: true })
  vault().setRoot(resolved)
  vault().setAttachmentsFolder(settingsStore().get().attachmentsFolder)
  const store = settingsStore()
  store.addRecentVault(resolved)
  broadcastSettings(store.get())
  return { path: resolved, name: path.basename(resolved) }
}

export function registerIpc(): void {
  ipcMain.handle('settings:get', () => settingsStore().get())

  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => {
    const next = settingsStore().set(patch)
    if (patch.attachmentsFolder !== undefined) vault().setAttachmentsFolder(next.attachmentsFolder)
    if (patch.vaultPath !== undefined && patch.vaultPath) {
      try {
        vault().setRoot(patch.vaultPath)
      } catch {
        /* ignore */
      }
    }
    broadcastSettings(next)
    return next
  })

  ipcMain.handle('vault:current', () => {
    const p = vault().path
    return p ? { path: p, name: path.basename(p) } : null
  })

  ipcMain.handle('vault:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open a vault folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open vault'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return openVaultPath(result.filePaths[0])
  })

  ipcMain.handle('vault:open', async (_e, p: string) => {
    if (!p) return null
    return openVaultPath(p)
  })

  ipcMain.handle('vault:create', async (_e, name: string) => {
    const safe = name.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Slate Vault'
    const base = path.join(app.getPath('documents'), safe)
    let target = base
    let i = 1
    while (true) {
      try {
        await fs.access(target)
        target = `${base} ${i++}`
      } catch {
        break
      }
    }
    await fs.mkdir(target, { recursive: true })
    await writeStarterVault(target)
    return openVaultPath(target)
  })

  ipcMain.handle('vault:tree', () => {
    if (!vault().path) return []
    return vault().tree()
  })

  ipcMain.handle('vault:files', () => (vault().path ? vault().flatFiles() : []))

  ipcMain.handle('vault:refresh', () => (vault().path ? vault().tree() : []))

  ipcMain.handle('vault:reveal', (_e, p: string) => {
    const abs = vault().absolute(p)
    shell.showItemInFolder(abs)
  })

  ipcMain.handle('vault:stats', () => {
    if (!vault().path) return { notes: 0, words: 0, folders: 0, attachments: 0 }
    return vault().stats()
  })

  ipcMain.handle('users:provision', (_e, name: string, preferredPath?: string) =>
    provisionUser(name, preferredPath)
  )
  ipcMain.handle('users:defaultPath', (_e, name: string) => defaultVaultPath(name))
  ipcMain.handle('users:repoName', (_e, name: string) => repoNameFor(name))

  ipcMain.handle('fs:read', (_e, p: string) => vault().read(p))
  ipcMain.handle('fs:readBinary', async (_e, p: string) => Buffer.from(await vault().readBinary(p)))
  ipcMain.handle('fs:write', (_e, p: string, content: string) => vault().write(p, content))
  ipcMain.handle('fs:create', (_e, p: string, content?: string) => vault().create(p, content ?? ''))
  ipcMain.handle('fs:mkdir', (_e, p: string) => vault().mkdir(p))
  ipcMain.handle('fs:rename', (_e, from: string, to: string) => vault().rename(from, to))
  ipcMain.handle('fs:remove', (_e, p: string) => vault().remove(p))
  ipcMain.handle('fs:exists', (_e, p: string) => vault().exists(p))
  ipcMain.handle('fs:stat', (_e, p: string) => vault().stat(p))
  ipcMain.handle('fs:list', (_e, dir: string) => vault().listDir(dir))
  ipcMain.handle('fs:copy', (_e, from: string, to: string) => vault().copy(from, to))

  ipcMain.handle('fs:saveAttachment', (_e, name: string, data: Uint8Array) =>
    vault().saveAttachment(name, data)
  )

  ipcMain.handle('fs:importFiles', async (_e, paths: string[], dir: string) => {
    const out: string[] = []
    for (const src of paths) {
      const base = path.basename(src)
      const target = dir ? `${dir}/${base}` : base
      const unique = await vault().uniquePath(target)
      const abs = vault().absolute(unique)
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.copyFile(src, abs)
      out.push(unique)
    }
    return out
  })

  ipcMain.handle('git:status', () => {
    if (!vault().path) throw new Error('No vault is open')
    return currentGit().status()
  })
  ipcMain.handle('git:sync', (_e, message?: string) => currentGit().sync(message))
  ipcMain.handle('git:init', () => currentGit().init())
  ipcMain.handle('git:log', (_e, limit?: number) => currentGit().log(limit))
  ipcMain.handle('git:fileHistory', (_e, p: string) => currentGit().fileHistory(p))
  ipcMain.handle('git:show', (_e, rev: string, p: string) => currentGit().show(rev, p))
  ipcMain.handle('git:restore', (_e, rev: string, p: string) => currentGit().restore(rev, p))
  ipcMain.handle('git:setRemote', (_e, url: string) => currentGit().setRemote(url))
  ipcMain.handle('git:createRepo', (_e, name: string) => currentGit().createRepo(name))
  ipcMain.handle('git:clone', (_e, url: string, dir: string) => currentGit().clone(url, dir))
  ipcMain.handle('git:diff', (_e, p: string) => currentGit().diff(p))

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (/^(https?:|mailto:)/i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    await shell.openPath(vault().absolute(p))
  })
  ipcMain.handle('shell:showItemInFolder', (_e, p: string) => {
    shell.showItemInFolder(vault().absolute(p))
  })
  ipcMain.handle('shell:trash', (_e, p: string) => vault().remove(p))

  ipcMain.handle('dialog:open', async (_e, options: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(options as Electron.OpenDialogOptions)
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('dialog:save', async (_e, options: Electron.SaveDialogOptions) => {
    const result = await dialog.showSaveDialog(options as Electron.SaveDialogOptions)
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle('window:setTitle', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title)
  })
  ipcMain.handle('window:setDocumentEdited', (e, edited: boolean) => {
    BrowserWindow.fromWebContents(e.sender)?.setDocumentEdited(edited)
  })
  ipcMain.handle('window:toggleFullScreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.handle('window:reload', (e) => e.sender.reload())

  ipcMain.handle('export:html', async (_e, html: string, name: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: `${name}.html`, filters: [{ name: 'HTML', extensions: ['html'] }] })
    if (result.canceled || !result.filePath) return { ok: false }
    await fs.writeFile(result.filePath, html, 'utf8')
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('export:markdown', async (_e, content: string, name: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: `${name}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (result.canceled || !result.filePath) return { ok: false }
    await fs.writeFile(result.filePath, content, 'utf8')
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('export:pdf', async (_e, html: string, name: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: `${name}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (result.canceled || !result.filePath) return { ok: false }
    const tmp = path.join(os.tmpdir(), `slate-export-${Date.now()}.html`)
    await fs.writeFile(tmp, html, 'utf8')
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, javascript: true, offscreen: false }
    })
    try {
      await win.loadFile(tmp)
      await new Promise((r) => setTimeout(r, 450))
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 }
      })
      await fs.writeFile(result.filePath, pdf)
      return { ok: true, path: result.filePath }
    } finally {
      win.destroy()
      fs.unlink(tmp).catch(() => undefined)
    }
  })
}

export async function pickVaultOnFirstRun(): Promise<void> {
  const store = settingsStore()
  const settings = store.get()
  if (settings.vaultPath) {
    try {
      await fs.access(settings.vaultPath)
      vault().setRoot(settings.vaultPath)
      vault().setAttachmentsFolder(settings.attachmentsFolder)
      return
    } catch {
      /* fall through */
    }
  }
  const fallback = path.join(app.getPath('documents'), 'Slate Vault')
  await fs.mkdir(fallback, { recursive: true })
  const contents = await fs.readdir(fallback).catch(() => [] as string[])
  if (contents.length === 0) await writeStarterVault(fallback)
  vault().setRoot(fallback)
  store.addRecentVault(fallback)
}

export function menuOpenVault(): Promise<{ path: string; name: string } | null> {
  return dialog
    .showOpenDialog({
      title: 'Open a vault folder',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open vault'
    })
    .then((r) => (r.canceled || !r.filePaths.length ? null : openVaultPath(r.filePaths[0])))
}

export function registerAssetProtocol(protocol: Electron.Protocol): void {
  protocol.handle('slate', async (request) => {
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (!vault().path) return new Response('No vault', { status: 404 })
      const abs = vault().absolute(rel)
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

export function broadcastVaultTree(nodes: FileNode[]): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('vault:tree', nodes)
}
