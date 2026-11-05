import { useEffect, useRef } from 'react'
import { Plus, Undo2 } from 'lucide-react'
import { useStore } from '../../state/store'
import { editorCommand } from '../editorBridge'

export function SpellPopup(): React.JSX.Element | null {
  const popup = useStore((s) => s.spellPopup)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!popup) return
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) useStore.getState().hideSpellPopup()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') useStore.getState().hideSpellPopup()
    }
    const onScroll = (): void => useStore.getState().hideSpellPopup()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [popup])

  if (!popup) return null

  const width = 252
  const left = Math.max(8, Math.min(popup.x, window.innerWidth - width - 12))
  const estimated = popup.kind === 'error' ? 92 + popup.suggestions.length * 30 : 120
  const top = Math.max(8, Math.min(popup.y + 8, window.innerHeight - estimated - 12))

  const close = (): void => useStore.getState().hideSpellPopup()

  return (
    <div
      className="spell-popup"
      style={{ left, top, width }}
      ref={ref}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {popup.kind === 'corrected' ? (
        <>
          <div className="spell-popup-head">Auto-corrected</div>
          <div className="spell-corrected-row">
            <span className="spell-original">{popup.word}</span>
            <span className="spell-arrow">→</span>
            <span className="spell-corrected">{popup.corrected}</span>
          </div>
          <button
            className="spell-action"
            onClick={() => {
              editorCommand('spell-undo', { from: popup.from, to: popup.to, original: popup.word })
              close()
            }}
          >
            <Undo2 size={13} />
            Undo change
          </button>
        </>
      ) : (
        <>
          <div className="spell-popup-head">Check spelling</div>
          <div className="spell-word">{popup.word}</div>
          <div className="spell-suggestions">
            {popup.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="spell-suggestion"
                onClick={() => {
                  editorCommand('spell-replace', { from: popup.from, to: popup.to, text: suggestion })
                  close()
                }}
              >
                {suggestion}
              </button>
            ))}
            {popup.suggestions.length === 0 && <div className="spell-none">No suggestions</div>}
          </div>
          <div className="spell-popup-foot">
            <button
              className="spell-action"
              onClick={() => {
                void useStore.getState().addDictionaryWord(popup.word).then(() => {
                  editorCommand('spell-refresh')
                  close()
                })
              }}
            >
              <Plus size={12} />
              Add to dictionary
            </button>
          </div>
        </>
      )}
    </div>
  )
}
