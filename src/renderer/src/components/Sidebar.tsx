import { useStore } from '../state/store'
import { FileExplorer, BookmarkList } from './FileExplorer'
import { SearchPane, TagsPane } from './SearchPane'
import { cn } from '../lib/utils'

export function Sidebar({ width }: { width: number }): React.JSX.Element {
  const tab = useStore((s) => s.sidebarTab)
  return (
    <div className="sidebar" style={{ width, flex: `0 0 ${width}px` }}>
      {tab === 'files' && <FileExplorer />}
      {tab === 'search' && <SearchPane />}
      {tab === 'tags' && <TagsPane />}
      {tab === 'bookmarks' && (
        <>
          <div className="sidebar-header">
            <span className="sidebar-title">Bookmarks</span>
          </div>
          <div className="sidebar-body">
            <BookmarkList />
          </div>
        </>
      )}
    </div>
  )
}

export function Resizer({
  width,
  side,
  onResize,
  onCommit
}: {
  width: number
  side: 'left' | 'right'
  onResize: (width: number) => void
  onCommit: (width: number) => void
}): React.JSX.Element {
  const onPointerDown = (event: React.PointerEvent): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const target = event.currentTarget as HTMLElement
    target.classList.add('dragging')
    target.setPointerCapture(event.pointerId)

    const onMove = (e: PointerEvent): void => {
      const delta = side === 'left' ? e.clientX - startX : startX - e.clientX
      const next = Math.min(460, Math.max(200, startWidth + delta))
      onResize(next)
    }
    const onUp = (e: PointerEvent): void => {
      target.classList.remove('dragging')
      target.releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const delta = side === 'left' ? e.clientX - startX : startX - e.clientX
      onCommit(Math.min(460, Math.max(200, startWidth + delta)))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return <div className={cn('resizer', side === 'right' && 'right')} onPointerDown={onPointerDown} />
}
