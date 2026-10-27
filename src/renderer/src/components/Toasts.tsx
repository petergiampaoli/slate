import { X } from 'lucide-react'
import { useStore } from '../state/store'
import { cn } from '../lib/utils'

export function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={cn('toast', toast.kind)}>
          <span className="toast-dot" />
          <span className="toast-msg">{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action?.run()
                useStore.getState().dismissToast(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => useStore.getState().dismissToast(toast.id)}>
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
