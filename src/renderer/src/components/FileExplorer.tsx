import { useMemo, useState } from 'react'
import {
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Music,
  Plus,
  RefreshCw,
  SortAsc,
  Trash2,
  Pencil,
  Copy,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  FilePlus,
  ChevronsDownUp,
  ChevronsUpDown
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import { api, useStore } from '../state/store'
import { useContextMenu, type MenuItem } from './ContextMenu'
import { basename, dirname, extname, isCanvas, isImage, isNote } from '../lib/utils'
import { cn } from '../lib/utils'

type SortMode = 'name' | 'modified' | 'created'

export function FileExplorer(): React.JSX.Element {
  const tree = useStore((s) => s.tree)
  const expanded = useStore((s) => s.expandedFolders)
  const currentPath = useStore((s) => s.notePath())
  const vault = useStore((s) => s.vault)
  const menu = useContextMenu()
  const [sort, setSort] = useState<SortMode>('name')
  const [dragOver, setDragOver] = useState<string | null>(null)

  const sorted = useMemo(() => sortTree(tree, sort), [tree, sort])

  const openFile = (node: FileNode, event: React.MouseEvent): void => {
    if (node.kind === 'folder') {
      useStore.getState().toggleFolder(node.path)
      return
    }
    if (isCanvas(node.path)) {
      useStore.getState().openSpecial('canvas', { path: node.path })
      return
    }
    void useStore.getState().openNote(node.path, { newTab: event.metaKey || event.ctrlKey })
  }

  const fileMenu = (node: FileNode): MenuItem[] => {
    const folder = node.kind === 'folder' ? node.path : dirname(node.path)
    const bookmarked = useStore.getState().settings.bookmarks.includes(node.path)
    return [
      ...(node.kind === 'folder'
        ? [
            {
              label: 'New note here',
              icon: FilePlus,
              onSelect: () => void useStore.getState().createNote({ folder: node.path })
            },
            {
              label: 'New folder inside',
              icon: FolderPlus,
              onSelect: () => void useStore.getState().createFolder(node.path)
            },
            { separator: true as const }
          ]
        : [
            {
              label: 'Open in new tab',
              icon: FileText,
              onSelect: () => void useStore.getState().openNote(node.path, { newTab: true })
            },
            { separator: true as const }
          ]),
      { label: 'Rename…', icon: Pencil, onSelect: () => void useStore.getState().renamePath(node.path) },
      ...(node.kind === 'file'
        ? [
            { label: 'Duplicate', icon: Copy, onSelect: () => void useStore.getState().duplicatePath(node.path) },
            {
              label: bookmarked ? 'Remove bookmark' : 'Bookmark',
              icon: bookmarked ? BookmarkCheck : Bookmark,
              onSelect: () => useStore.getState().toggleBookmark(node.path)
            }
          ]
        : []),
      { label: 'Copy vault path', icon: Copy, onSelect: () => void navigator.clipboard.writeText(node.path) },
      { label: 'Reveal in Finder', icon: ExternalLink, onSelect: () => void api.vault.reveal(node.path) },
      { separator: true },
      {
        label: 'Move to Trash',
        icon: Trash2,
        danger: true,
        onSelect: () => void useStore.getState().deletePath(node.path)
      },
      ...(folder ? [{ heading: `In ${folder}` } as MenuItem] : [])
    ]
  }

  const handleDragStart = (event: React.DragEvent, node: FileNode): void => {
    event.dataTransfer.setData('text/slate-path', node.path)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (event: React.DragEvent, target: FileNode | null): void => {
    event.preventDefault()
    setDragOver(null)
    const from = event.dataTransfer.getData('text/slate-path')
    if (!from) return
    const toDir = target ? (target.kind === 'folder' ? target.path : dirname(target.path)) : ''
    if (from === toDir || from.startsWith(`${toDir}/`)) return
    void useStore.getState().movePath(from, toDir)
    if (toDir) useStore.getState().setExpanded(toDir, true)
  }

  return (
    <>
      <div className="sidebar-header">
        <button
          className="sidebar-title"
          style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5 }}
          onClick={(e) =>
            menu.open(e, [
              {
                label: 'Change vault…',
                icon: FolderOpen,
                onSelect: () => void useStore.getState().chooseVault()
              },
              {
                label: 'Reveal vault in Finder',
                icon: ExternalLink,
                onSelect: () => vault && void api.shell.showItemInFolder(vault.path)
              },
              { separator: true },
              { label: 'Refresh vault', icon: RefreshCw, onSelect: () => void useStore.getState().refreshVault(true) }
            ])
          }
        >
          {vault?.name ?? 'Vault'}
          <ChevronRight size={11} style={{ opacity: 0.6 }} />
        </button>
        <div className="sidebar-actions">
          <button className="icon-btn" title="New note (⌘N)" onClick={() => void useStore.getState().createNote()}>
            <FilePlus size={15} strokeWidth={1.8} />
          </button>
          <button className="icon-btn" title="New folder" onClick={() => void useStore.getState().createFolder()}>
            <FolderPlus size={15} strokeWidth={1.8} />
          </button>
          <button
            className="icon-btn"
            title="Sort"
            onClick={(e) =>
              menu.open(e, [
                { heading: 'Sort by' },
                { label: 'Name', onSelect: () => setSort('name') },
                { label: 'Modified time', onSelect: () => setSort('modified') },
                { label: 'Created time', onSelect: () => setSort('created') },
                { separator: true },
                {
                  label: expandedState(tree, true) ? 'Collapse all' : 'Expand all',
                  onSelect: () => {
                    const next: Record<string, boolean> = {}
                    for (const n of tree) collectFolders(n, next, !expandedState(tree, true))
                    useStore.setState({ expandedFolders: { ...expanded, ...next } })
                  }
                }
              ])
            }
          >
            <SortAsc size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div
        className="sidebar-body"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver('root')
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => handleDrop(e, null)}
      >
        {sorted.length === 0 && (
          <div className="empty-hint">
            This vault is empty.
            <br />
            Create your first note with ⌘N.
          </div>
        )}
        <div className="tree">
          {sorted.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              currentPath={currentPath}
              dragOver={dragOver}
              onOpen={openFile}
              onMenu={(e, n) => menu.open(e, fileMenu(n))}
              onDragStart={handleDragStart}
              onDragOver={(e, n) => {
                if (n.kind !== 'folder') return
                e.preventDefault()
                e.stopPropagation()
                setDragOver(n.path)
              }}
              onDrop={handleDrop}
              setDragOver={setDragOver}
              sort={sort}
            />
          ))}
        </div>
      </div>
    </>
  )
}

interface RowProps {
  node: FileNode
  depth: number
  expanded: Record<string, boolean>
  currentPath: string | null
  dragOver: string | null
  onOpen: (node: FileNode, event: React.MouseEvent) => void
  onMenu: (event: React.MouseEvent, node: FileNode) => void
  onDragStart: (event: React.DragEvent, node: FileNode) => void
  onDragOver: (event: React.DragEvent, node: FileNode) => void
  onDrop: (event: React.DragEvent, node: FileNode) => void
  setDragOver: (path: string | null) => void
  sort: SortMode
}

function TreeRow(props: RowProps): React.JSX.Element {
  const { node, depth, expanded, currentPath, dragOver } = props
  const open = expanded[node.path] ?? false
  const selected = currentPath === node.path
  const isFolder = node.kind === 'folder'

  const children = useMemo(() => (node.children ? sortTree(node.children, props.sort) : []), [node.children, props.sort])

  return (
    <>
      <div
        className={cn(
          'tree-row',
          selected && 'active',
          dragOver === node.path && isFolder && 'drop-target'
        )}
        style={{ paddingLeft: 6 + depth * 13 }}
        onClick={(e) => props.onOpen(node, e)}
        onContextMenu={(e) => props.onMenu(e, node)}
        draggable
        onDragStart={(e) => props.onDragStart(e, node)}
        onDragOver={(e) => props.onDragOver(e, node)}
        onDragLeave={() => props.setDragOver(null)}
        onDrop={(e) => props.onDrop(e, node)}
        title={node.path}
      >
        {isFolder ? (
          <span className={cn('tree-caret', open && 'open')}>
            <ChevronRight size={12} />
          </span>
        ) : (
          <span style={{ width: 14, flex: '0 0 14px' }} />
        )}
        <span className="tree-icon">{iconFor(node)}</span>
        <span className="tree-label">{isFolder ? node.name : displayName(node.name)}</span>
        {isFolder && children.length > 0 && <span className="row-meta">{children.length}</span>}
      </div>
      {isFolder && open && (
        <div className="tree-children">
          {children.map((child) => (
            <TreeRow key={child.path} {...props} node={child} depth={depth + 1} />
          ))}
          {children.length === 0 && (
            <div style={{ paddingLeft: 6 + (depth + 1) * 13 + 20, fontSize: 11, color: 'var(--text-faint)', height: 22 }}>
              empty
            </div>
          )}
        </div>
      )}
    </>
  )
}

function displayName(name: string): string {
  return name.replace(/\.(md|markdown|mdx)$/i, '')
}

function iconFor(node: FileNode): React.JSX.Element {
  if (node.kind === 'folder') return <Folder size={14} strokeWidth={1.7} />
  const ext = extname(node.path)
  if (isCanvas(node.path)) return <LayoutGrid size={14} strokeWidth={1.7} />
  if (isImage(node.path)) return <FileImage size={14} strokeWidth={1.7} />
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext)) return <Music size={14} strokeWidth={1.7} />
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html'].includes(ext)) return <FileCode2 size={14} strokeWidth={1.7} />
  if (isNote(node.path)) return <FileText size={14} strokeWidth={1.7} />
  return <File size={14} strokeWidth={1.7} />
}

function sortTree(nodes: FileNode[], mode: SortMode): FileNode[] {
  const copy = [...nodes]
  copy.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    if (mode === 'modified') return (b.mtime ?? 0) - (a.mtime ?? 0)
    if (mode === 'created') return (b.mtime ?? 0) - (a.mtime ?? 0)
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
  return copy
}

function collectFolders(node: FileNode, out: Record<string, boolean>, value: boolean): void {
  if (node.kind !== 'folder') return
  out[node.path] = value
  for (const child of node.children ?? []) collectFolders(child, out, value)
}

function expandedState(tree: FileNode[], _value: boolean): boolean {
  // True when every folder is already expanded.
  const all: string[] = []
  const walk = (nodes: FileNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'folder') {
        all.push(n.path)
        walk(n.children ?? [])
      }
    }
  }
  walk(tree)
  const expanded = useStore.getState().expandedFolders
  return all.every((p) => expanded[p])
}

export function BookmarkList(): React.JSX.Element {
  const bookmarks = useStore((s) => s.settings.bookmarks)
  const notes = useStore((s) => s.index.notes)
  const menu = useContextMenu()

  if (!bookmarks.length) {
    return (
      <div className="empty-hint">
        No bookmarks yet.
        <br />
        Bookmark a note from its ··· menu.
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 4 }}>
      {bookmarks.map((path) => (
        <div
          key={path}
          className="tree-row"
          onClick={(e) => void useStore.getState().openNote(path, { newTab: e.metaKey || e.ctrlKey })}
          onContextMenu={(e) =>
            menu.open(e, [
              { label: 'Open', icon: FileText, onSelect: () => void useStore.getState().openNote(path) },
              {
                label: 'Remove bookmark',
                icon: Trash2,
                danger: true,
                onSelect: () => useStore.getState().toggleBookmark(path)
              }
            ])
          }
        >
          <span style={{ width: 14 }} />
          <span className="tree-icon">
            <FileText size={14} strokeWidth={1.7} />
          </span>
          <span className="tree-label">{notes[path]?.title ?? basename(path)}</span>
          <span className="row-meta">{dirname(path) || 'root'}</span>
        </div>
      ))}
    </div>
  )
}

export { Plus, ChevronsDownUp, ChevronsUpDown }
