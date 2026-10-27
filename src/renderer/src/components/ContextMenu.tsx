import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'

export interface MenuItem {
  label?: string
  icon?: LucideIcon
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  heading?: string
  onSelect?: () => void
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

interface ContextMenuApi {
  open: (event: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => void
  close: () => void
}

const Context = createContext<ContextMenuApi>({ open: () => undefined, close: () => undefined })

export function useContextMenu(): ContextMenuApi {
  return useContext(Context)
}

export function ContextMenuProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<MenuState | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const open = useCallback((event: { clientX: number; clientY: number; preventDefault?: () => void }, items: MenuItem[]) => {
    event.preventDefault?.()
    if (!items.length) return
    setState({ x: event.clientX, y: event.clientY, items })
  }, [])

  const close = useCallback(() => setState(null), [])

  useEffect(() => {
    if (!state) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [state, close])

  useEffect(() => {
    if (!state || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const pad = 8
    let { x, y } = state
    if (x + rect.width > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - rect.width - pad)
    if (y + rect.height > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - rect.height - pad)
    if (x !== state.x || y !== state.y) setState({ ...state, x, y })
  }, [state])

  return (
    <Context.Provider value={{ open, close }}>
      {children}
      {state &&
        createPortal(
          <div className="context-menu" style={{ left: state.x, top: state.y }} ref={ref}>
            {state.items.map((item, i) =>
              item.separator ? (
                <div className="context-sep" key={i} />
              ) : item.heading ? (
                <div className="context-label" key={i}>
                  {item.heading}
                </div>
              ) : (
                <button
                  key={i}
                  className={`context-item${item.danger ? ' danger' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return
                    close()
                    item.onSelect?.()
                  }}
                >
                  {item.icon ? <item.icon size={14} strokeWidth={1.8} /> : <span style={{ width: 14 }} />}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.shortcut && <span className="kbd">{item.shortcut}</span>}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </Context.Provider>
  )
}
