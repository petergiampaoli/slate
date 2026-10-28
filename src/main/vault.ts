import { BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { FileNode, VaultChange } from '@shared/types'

export const NOTE_EXTENSIONS = ['md', 'markdown', 'mdx', 'txt', 'canvas']
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'tiff']
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'webm']
export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi']
export const DOC_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'epub']

const IGNORED_DIRS = new Set(['.git', '.obsidian', '.slate', 'node_modules', '.trash', '.DS_Store'])
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db', '.gitignore'])

export function isNoteFile(file: string): boolean {
  return NOTE_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase())
}

export function isMarkdownFile(file: string): boolean {
  const ext = path.extname(file).slice(1).toLowerCase()
  return ext === 'md' || ext === 'markdown' || ext === 'mdx'
}

export function isCanvasFile(file: string): boolean {
  return path.extname(file).toLowerCase() === '.canvas'
}

export function isAttachment(file: string): boolean {
  const ext = path.extname(file).slice(1).toLowerCase()
  return (
    IMAGE_EXTENSIONS.includes(ext) ||
    AUDIO_EXTENSIONS.includes(ext) ||
    VIDEO_EXTENSIONS.includes(ext) ||
    DOC_EXTENSIONS.includes(ext)
  )
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

class VaultService {
  private root: string | null = null
  private watcher: fs.FSWatcher | null = null
  private pending = new Set<string>()
  private timer: NodeJS.Timeout | null = null

  get path(): string | null {
    return this.root
  }

  get name(): string {
    return this.root ? path.basename(this.root) : ''
  }

  setRoot(root: string): void {
    const resolved = path.resolve(root)
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true })
    }
    this.stopWatching()
    this.root = resolved
    this.startWatching()
  }

  requireRoot(): string {
    if (!this.root) throw new Error('No vault is open')
    return this.root
  }

  /** Resolve a vault-relative path, refusing anything that escapes the vault. */
  absolute(relative: string): string {
    const root = this.requireRoot()
    const cleaned = relative.replace(/^[/\\]+/, '')
    const abs = path.resolve(root, cleaned)
    const withSep = root.endsWith(path.sep) ? root : root + path.sep
    if (abs !== root && !abs.startsWith(withSep)) {
      throw new Error(`Refusing to access path outside the vault: ${relative}`)
    }
    return abs
  }

  relative(abs: string): string {
    return toPosix(path.relative(this.requireRoot(), abs))
  }

  private shouldIgnore(name: string, isDir: boolean, relPath: string): boolean {
    if (isDir) return IGNORED_DIRS.has(name) || name.startsWith('.')
    if (name.startsWith('.')) return true
    if (IGNORED_FILES.has(name)) return true
    if (relPath.split('/').some((part) => part === '.git')) return true
    return false
  }

  async listDir(relativeDir = ''): Promise<FileNode[]> {
    const abs = relativeDir ? this.absolute(relativeDir) : this.requireRoot()
    const entries = await fsp.readdir(abs, { withFileTypes: true })
    const out: FileNode[] = []
    for (const entry of entries) {
      if (this.shouldIgnore(entry.name, entry.isDirectory(), relativeDir ? `${relativeDir}/${entry.name}` : entry.name)) {
        continue
      }
      const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        out.push({ name: entry.name, path: rel, kind: 'folder', children: [] })
      } else if (entry.isFile()) {
        out.push({
          name: entry.name,
          path: rel,
          kind: 'file',
          ext: path.extname(entry.name).slice(1).toLowerCase()
        })
      }
    }
    return out
  }

  async tree(): Promise<FileNode[]> {
    const root = this.requireRoot()
    const walk = async (dir: string, rel: string): Promise<FileNode[]> => {
      let entries: fs.Dirent[]
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true })
      } catch {
        return []
      }
      const nodes: FileNode[] = []
      for (const entry of entries) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name
        if (this.shouldIgnore(entry.name, entry.isDirectory(), childRel)) continue
        if (entry.isDirectory()) {
          const children = await walk(path.join(dir, entry.name), childRel)
          nodes.push({ name: entry.name, path: childRel, kind: 'folder', children })
        } else if (entry.isFile()) {
          const stat = await fsp.stat(path.join(dir, entry.name)).catch(() => null)
          nodes.push({
            name: entry.name,
            path: childRel,
            kind: 'file',
            ext: path.extname(entry.name).slice(1).toLowerCase(),
            mtime: stat?.mtimeMs ?? 0,
            size: stat?.size ?? 0
          })
        }
      }
      sortTree(nodes)
      return nodes
    }
    return walk(root, '')
  }

  async flatFiles(): Promise<string[]> {
    const tree = await this.tree()
    const out: string[] = []
    const walk = (nodes: FileNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'folder') walk(node.children ?? [])
        else out.push(node.path)
      }
    }
    walk(tree)
    return out
  }

  async read(relative: string): Promise<string> {
    return fsp.readFile(this.absolute(relative), 'utf8')
  }

  async readBinary(relative: string): Promise<Uint8Array> {
    const buf = await fsp.readFile(this.absolute(relative))
    return new Uint8Array(buf)
  }

  async write(relative: string, content: string): Promise<void> {
    const abs = this.absolute(relative)
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    this.suppress(abs)
    await fsp.writeFile(abs, content, 'utf8')
  }

  async create(relative: string, content = ''): Promise<void> {
    const abs = this.absolute(relative)
    if (fs.existsSync(abs)) throw new Error(`File already exists: ${relative}`)
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    this.suppress(abs)
    await fsp.writeFile(abs, content, 'utf8')
  }

  async mkdir(relative: string): Promise<void> {
    await fsp.mkdir(this.absolute(relative), { recursive: true })
  }

  async rename(from: string, to: string): Promise<void> {
    const fromAbs = this.absolute(from)
    const toAbs = this.absolute(to)
    if (fs.existsSync(toAbs)) throw new Error(`Target already exists: ${to}`)
    await fsp.mkdir(path.dirname(toAbs), { recursive: true })
    this.suppress(toAbs)
    await fsp.rename(fromAbs, toAbs)
  }

  async copy(from: string, to: string): Promise<void> {
    const toAbs = this.absolute(to)
    await fsp.mkdir(path.dirname(toAbs), { recursive: true })
    this.suppress(toAbs)
    await fsp.copyFile(this.absolute(from), toAbs)
  }

  async remove(relative: string): Promise<void> {
    const abs = this.absolute(relative)
    if (!fs.existsSync(abs)) return
    await shell.trashItem(abs)
  }

  async exists(relative: string): Promise<boolean> {
    try {
      await fsp.access(this.absolute(relative))
      return true
    } catch {
      return false
    }
  }

  async stat(relative: string): Promise<{ exists: boolean; isDirectory: boolean; mtime: number; size: number }> {
    try {
      const st = await fsp.stat(this.absolute(relative))
      return { exists: true, isDirectory: st.isDirectory(), mtime: st.mtimeMs, size: st.size }
    } catch {
      return { exists: false, isDirectory: false, mtime: 0, size: 0 }
    }
  }

  async uniquePath(relative: string): Promise<string> {
    const abs = this.absolute(relative)
    if (!fs.existsSync(abs)) return relative
    const dir = path.posix.dirname(relative)
    const ext = path.posix.extname(relative)
    const base = path.posix.basename(relative, ext)
    let i = 1
    while (true) {
      const candidate = `${dir === '.' ? '' : `${dir}/`}${base} ${i}${ext}`
      if (!fs.existsSync(this.absolute(candidate))) return candidate
      i++
    }
  }

  async saveAttachment(name: string, data: Uint8Array): Promise<string> {
    const folder = this.attachmentsFolder()
    let target = `${folder}/${name}`
    target = await this.uniquePath(target)
    const abs = this.absolute(target)
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    this.suppress(abs)
    await fsp.writeFile(abs, data)
    return target
  }

  private attachmentsFolderOverride: string | null = null
  setAttachmentsFolder(folder: string): void {
    this.attachmentsFolderOverride = folder
  }
  private attachmentsFolder(): string {
    const folder = this.attachmentsFolderOverride ?? 'Attachments'
    return folder.replace(/^\/+|\/+$/g, '')
  }

  async stats(): Promise<{ notes: number; words: number; folders: number; attachments: number }> {
    const files = await this.flatFiles()
    let notes = 0
    let folders = 0
    let attachments = 0
    let words = 0
    for (const file of files) {
      if (isMarkdownFile(file)) {
        notes++
        try {
          const text = await this.read(file)
          words += text.trim().split(/\s+/).filter(Boolean).length
        } catch {
          /* ignore */
        }
      } else if (isCanvasFile(file)) {
        notes++
      } else if (isAttachment(file)) {
        attachments++
      }
    }
    const tree = await this.tree()
    const countFolders = (nodes: FileNode[]): void => {
      for (const n of nodes) {
        if (n.kind === 'folder') {
          folders++
          countFolders(n.children ?? [])
        }
      }
    }
    countFolders(tree)
    return { notes, words, folders, attachments }
  }

  private suppressed = new Map<string, number>()

  private suppress(abs: string): void {
    this.suppressed.set(abs, Date.now() + 1200)
  }

  private startWatching(): void {
    if (!this.root) return
    try {
      this.watcher = fs.watch(this.root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const rel = toPosix(String(filename))
        if (rel.split('/').some((p) => IGNORED_DIRS.has(p))) return
        if (IGNORED_FILES.has(path.posix.basename(rel))) return
        const abs = path.join(this.root as string, rel)
        const until = this.suppressed.get(abs)
        if (until && until > Date.now()) return
        this.pending.add(rel)
        this.flushChanges()
      })
      this.watcher.on('error', (err) => console.error('[slate] watcher error', err))
    } catch (err) {
      console.error('[slate] failed to watch vault', err)
    }
  }

  private flushChanges(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      if (this.pending.size === 0) return
      const paths = [...this.pending]
      this.pending.clear()
      const change: VaultChange = { paths, type: 'change' }
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('vault:changed', change)
      }
    }, 180)
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

export function sortTree(nodes: FileNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
  for (const n of nodes) if (n.children) sortTree(n.children)
}

let vaultService: VaultService | null = null

export function vault(): VaultService {
  if (!vaultService) vaultService = new VaultService()
  return vaultService
}
