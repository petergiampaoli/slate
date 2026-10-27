import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppSettings, SlateApi, VaultChange } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: SlateApi = {
  platform: process.platform,
  appVersion: process.env['npm_package_version'] ?? '1.0.0',
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    onChanged: (cb) => subscribe<AppSettings>('settings:changed', cb)
  },
  vault: {
    choose: () => ipcRenderer.invoke('vault:choose'),
    open: (path) => ipcRenderer.invoke('vault:open', path),
    current: () => ipcRenderer.invoke('vault:current'),
    tree: () => ipcRenderer.invoke('vault:tree'),
    files: () => ipcRenderer.invoke('vault:files'),
    reveal: (path) => ipcRenderer.invoke('vault:reveal', path),
    refresh: () => ipcRenderer.invoke('vault:refresh'),
    onChanged: (cb) => subscribe<VaultChange>('vault:changed', cb),
    createVault: (name) => ipcRenderer.invoke('vault:create', name),
    stats: () => ipcRenderer.invoke('vault:stats')
  },
  fs: {
    read: (path) => ipcRenderer.invoke('fs:read', path),
    readBinary: (path) => ipcRenderer.invoke('fs:readBinary', path),
    write: (path, content) => ipcRenderer.invoke('fs:write', path, content),
    create: (path, content) => ipcRenderer.invoke('fs:create', path, content),
    mkdir: (path) => ipcRenderer.invoke('fs:mkdir', path),
    rename: (from, to) => ipcRenderer.invoke('fs:rename', from, to),
    remove: (path) => ipcRenderer.invoke('fs:remove', path),
    exists: (path) => ipcRenderer.invoke('fs:exists', path),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
    list: (dir) => ipcRenderer.invoke('fs:list', dir),
    saveAttachment: (name, data) => ipcRenderer.invoke('fs:saveAttachment', name, data),
    importFiles: (paths, dir) => ipcRenderer.invoke('fs:importFiles', paths, dir),
    copy: (from, to) => ipcRenderer.invoke('fs:copy', from, to)
  },
  git: {
    status: () => ipcRenderer.invoke('git:status'),
    sync: (message) => ipcRenderer.invoke('git:sync', message),
    init: () => ipcRenderer.invoke('git:init'),
    log: (limit) => ipcRenderer.invoke('git:log', limit),
    fileHistory: (path) => ipcRenderer.invoke('git:fileHistory', path),
    show: (rev, path) => ipcRenderer.invoke('git:show', rev, path),
    restore: (rev, path) => ipcRenderer.invoke('git:restore', rev, path),
    setRemote: (url) => ipcRenderer.invoke('git:setRemote', url),
    createRepo: (name) => ipcRenderer.invoke('git:createRepo', name),
    clone: (url, dir) => ipcRenderer.invoke('git:clone', url, dir),
    diff: (path) => ipcRenderer.invoke('git:diff', path)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
    trash: (path) => ipcRenderer.invoke('shell:trash', path)
  },
  files: {
    pathFor: (file) => webUtils.getPathForFile(file as File)
  },
  dialog: {
    open: (options) => ipcRenderer.invoke('dialog:open', options),
    save: (options) => ipcRenderer.invoke('dialog:save', options)
  },
  window: {
    setTitle: (title) => ipcRenderer.invoke('window:setTitle', title),
    setDocumentEdited: (edited) => ipcRenderer.invoke('window:setDocumentEdited', edited),
    toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
    reload: () => ipcRenderer.invoke('window:reload'),
    newWindow: () => ipcRenderer.invoke('window:new')
  },
  export: {
    pdf: (html, name) => ipcRenderer.invoke('export:pdf', html, name),
    html: (html, name) => ipcRenderer.invoke('export:html', html, name),
    markdown: (content, name) => ipcRenderer.invoke('export:markdown', content, name)
  },
  menu: {
    onAction: (cb) => {
      const handler = (_e: Electron.IpcRendererEvent, action: string, payload?: unknown): void =>
        cb(action, payload)
      ipcRenderer.on('menu:action', handler)
      return () => ipcRenderer.removeListener('menu:action', handler)
    },
    setContext: (context) => ipcRenderer.send('menu:set-context', context)
  }
}

contextBridge.exposeInMainWorld('slate', api)
