import { useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2, Magnet } from 'lucide-react'
import type { BoardDoc, BoardEdge, BoardNode, BoardShape, BoardStyle, BoardStylePreset, BorderStyle, ShapeKind } from '../../lib/board'
import { cn } from '../../lib/utils'

export interface InspectorProps {
  board: BoardDoc
  nodes: BoardNode[]
  shapes: BoardShape[]
  edge: BoardEdge | null
  onNodes: (patch: Partial<BoardNode>) => void
  onStyle: (patch: Partial<BoardStyle>) => void
  onShapes: (patch: Partial<BoardShape>) => void
  onEdge: (patch: Partial<BoardEdge>) => void
  onDeleteEdge: () => void
  onAlign: (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void
  onDistribute: (axis: 'h' | 'v') => void
  onSameWidth: () => void
  onSameHeight: () => void
  onLayer: (direction: 'front' | 'back') => void
  onStack: () => void
  onUnstack: () => void
  onMoveStack: (direction: -1 | 1) => void
  onAddStacked: () => void
  onSavePreset: (name: string) => void
  onApplyPreset: (preset: BoardStylePreset) => void
  onDeletePreset: (id: string) => void
}

const SWATCHES = [
  'var(--text)',
  '#ffffff',
  '#1c1c1e',
  '#7c6cf0',
  '#12b981',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#8b8b93',
  'transparent'
]

export function BoardInspector(props: InspectorProps): React.JSX.Element {
  const { nodes, shapes, edge, board } = props
  const note = nodes.find((n) => n.type === 'note')
  const shape = shapes[0]
  const stackId = nodes.find((n) => n.stackId)?.stackId
  const stackCount = stackId ? board.nodes.filter((n) => n.stackId === stackId).length : 0
  const [presetName, setPresetName] = useState('')
  const [edgeLabel, setEdgeLabel] = useState(edge?.label ?? '')

  if (!nodes.length && !shapes.length && !edge) {
    return (
      <aside className="board-inspector">
        <div className="board-inspector-empty">
          Select a note, shape or connection to edit its appearance.
          <div style={{ marginTop: 10, fontSize: 10.5 }}>
            Double-click empty space for a note.
            <br />
            Drag a note onto another to connect them.
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="board-inspector">
      <div className="board-inspector-scroll">
        {note && (
          <Section title={nodes.length > 1 ? `${nodes.length} notes` : 'Note'}>
            <div className="bi-row">
              <span>Font</span>
              <select
                value={note.style.fontFamily}
                onChange={(e) => props.onStyle({ fontFamily: e.target.value as BoardStyle['fontFamily'] })}
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
              <input
                className="bi-number"
                type="number"
                min={8}
                max={48}
                value={note.style.fontSize}
                onChange={(e) => props.onStyle({ fontSize: Number(e.target.value) || 13 })}
              />
            </div>
            <div className="bi-buttons">
              <button className={cn(note.style.bold && 'active')} onClick={() => props.onStyle({ bold: !note.style.bold })}>
                <strong>B</strong>
              </button>
              <button className={cn(note.style.italic && 'active')} onClick={() => props.onStyle({ italic: !note.style.italic })}>
                <em>I</em>
              </button>
              <button className={cn(note.style.underline && 'active')} onClick={() => props.onStyle({ underline: !note.style.underline })}>
                <span style={{ textDecoration: 'underline' }}>U</span>
              </button>
              <button className={cn(note.style.strike && 'active')} onClick={() => props.onStyle({ strike: !note.style.strike })}>
                <span style={{ textDecoration: 'line-through' }}>S</span>
              </button>
              <span style={{ flex: 1 }} />
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  className={cn(note.style.align === align && 'active')}
                  onClick={() => props.onStyle({ align })}
                >
                  {align === 'left' ? <AlignLeft size={13} /> : align === 'center' ? <AlignCenter size={13} /> : <AlignRight size={13} />}
                </button>
              ))}
            </div>
            <ColorRow label="Text" value={note.style.textColor} onChange={(textColor) => props.onStyle({ textColor })} />
            <ColorRow label="Fill" value={note.style.fill} onChange={(fill) => props.onStyle({ fill })} />
            <div className="bi-row">
              <span>Border</span>
              <select
                value={note.style.borderStyle}
                onChange={(e) => props.onStyle({ borderStyle: e.target.value as BorderStyle })}
              >
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
              <input
                className="bi-number"
                type="number"
                min={0}
                max={8}
                step={0.5}
                value={note.style.borderWidth}
                onChange={(e) => props.onStyle({ borderWidth: Number(e.target.value) })}
              />
            </div>
            <ColorRow label="Border colour" value={note.style.borderColor} onChange={(borderColor) => props.onStyle({ borderColor })} />
            <div className="bi-row">
              <span>Corner radius</span>
              <input
                className="bi-number wide"
                type="number"
                min={0}
                max={40}
                value={note.style.radius}
                onChange={(e) => props.onStyle({ radius: Number(e.target.value) })}
              />
              <span>Padding</span>
              <input
                className="bi-number"
                type="number"
                min={2}
                max={40}
                value={note.style.padding}
                onChange={(e) => props.onStyle({ padding: Number(e.target.value) })}
              />
            </div>
            <div className="bi-buttons">
              <Toggle label="Shadow" value={note.style.shadow} onChange={(shadow) => props.onStyle({ shadow })} />
              <Toggle label="Fade" value={note.style.fade} onChange={(fade) => props.onStyle({ fade })} />
            </div>
          </Section>
        )}

        {shape && (
          <Section title="Background shape">
            <div className="bi-row">
              <span>Shape</span>
              <select value={shape.shape} onChange={(e) => props.onShapes({ shape: e.target.value as ShapeKind })}>
                <option value="rect">Rectangle</option>
                <option value="rounded">Rounded</option>
                <option value="ellipse">Ellipse</option>
              </select>
            </div>
            <ColorRow label="Fill" value={shape.fill} onChange={(fill) => props.onShapes({ fill })} />
            <div className="bi-row">
              <span>Opacity</span>
              <input
                className="bi-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={shape.fillOpacity}
                onChange={(e) => props.onShapes({ fillOpacity: Number(e.target.value) })}
              />
            </div>
            <div className="bi-row">
              <span>Border</span>
              <select
                value={shape.borderStyle}
                onChange={(e) => props.onShapes({ borderStyle: e.target.value as BorderStyle })}
              >
                <option value="none">None</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
              <input
                className="bi-number"
                type="number"
                min={0}
                max={8}
                step={0.5}
                value={shape.borderWidth}
                onChange={(e) => props.onShapes({ borderWidth: Number(e.target.value) })}
              />
            </div>
            <ColorRow label="Border colour" value={shape.borderColor} onChange={(borderColor) => props.onShapes({ borderColor })} />
            <div className="bi-buttons">
              <button className={cn(shape.magnetic && 'active')} onClick={() => props.onShapes({ magnetic: !shape.magnetic })} title="Notes overlapping this shape move with it">
                <Magnet size={13} /> Magnetic
              </button>
              <Toggle label="Shadow" value={shape.shadow} onChange={(shadow) => props.onShapes({ shadow })} />
            </div>
            <div className="bi-buttons">
              <button onClick={() => props.onLayer('front')}>Bring forward</button>
              <button onClick={() => props.onLayer('back')}>Send back</button>
            </div>
          </Section>
        )}

        {edge && (
          <Section title="Connection">
            <div className="bi-row">
              <span>Label</span>
              <input
                className="bi-text"
                value={edgeLabel}
                placeholder="Optional"
                onChange={(e) => setEdgeLabel(e.target.value)}
                onBlur={() => props.onEdge({ label: edgeLabel })}
                onKeyDown={(e) => e.key === 'Enter' && props.onEdge({ label: edgeLabel })}
              />
            </div>
            <div className="bi-buttons">
              <button className={cn(edge.arrowStart && 'active')} onClick={() => props.onEdge({ arrowStart: !edge.arrowStart })}>
                ← Arrow start
              </button>
              <button className={cn(edge.arrowEnd && 'active')} onClick={() => props.onEdge({ arrowEnd: !edge.arrowEnd })}>
                Arrow end →
              </button>
            </div>
            <div className="bi-row">
              <span>Line</span>
              <select value={edge.style} onChange={(e) => props.onEdge({ style: e.target.value as BoardEdge['style'] })}>
                <option value="auto">Auto (dotted / solid)</option>
                <option value="dotted">Dotted</option>
                <option value="solid">Solid</option>
              </select>
            </div>
            <div className="bi-row">
              <span>Width</span>
              <input
                className="bi-number wide"
                type="number"
                min={0.5}
                max={8}
                step={0.5}
                value={edge.width}
                onChange={(e) => props.onEdge({ width: Number(e.target.value) })}
              />
            </div>
            <ColorRow label="Colour" value={edge.color} onChange={(color) => props.onEdge({ color })} />
            <button className="bi-danger" onClick={props.onDeleteEdge}>
              <Trash2 size={12} /> Delete connection
            </button>
          </Section>
        )}

        <Section title="Arrange">
          <div className="bi-align-grid">
            {(
              [
                ['left', 'Left'],
                ['hcenter', 'Centre H'],
                ['right', 'Right'],
                ['top', 'Top'],
                ['vcenter', 'Centre V'],
                ['bottom', 'Bottom']
              ] as const
            ).map(([mode, label]) => (
              <button key={mode} onClick={() => props.onAlign(mode)}>
                {label}
              </button>
            ))}
          </div>
          <div className="bi-buttons">
            <button onClick={() => props.onDistribute('h')}>Distribute H</button>
            <button onClick={() => props.onDistribute('v')}>Distribute V</button>
          </div>
          <div className="bi-buttons">
            <button onClick={props.onSameWidth}>Same width</button>
            <button onClick={props.onSameHeight}>Same height</button>
          </div>
          <div className="bi-buttons">
            <button onClick={() => props.onLayer('front')}>Bring to front</button>
            <button onClick={() => props.onLayer('back')}>Send to back</button>
          </div>
        </Section>

        {nodes.length >= 1 && (
          <Section title="Stack">
            {stackId ? (
              <>
                <div className="bi-help">This note is in a stack of {stackCount}.</div>
                <div className="bi-buttons">
                  <button onClick={() => props.onMoveStack(-1)}>Move up</button>
                  <button onClick={() => props.onMoveStack(1)}>Move down</button>
                </div>
                <div className="bi-buttons">
                  <button onClick={props.onAddStacked}>
                    <Plus size={12} /> Add note below
                  </button>
                  <button onClick={props.onUnstack}>Remove from stack</button>
                </div>
              </>
            ) : (
              <div className="bi-buttons">
                <button onClick={props.onStack} disabled={nodes.length < 2}>
                  Stack selected notes
                </button>
              </div>
            )}
          </Section>
        )}

        {note && (
          <Section title="Styles">
            <div className="bi-presets">
              {board.presets.map((preset) => (
                <div className="bi-preset" key={preset.id}>
                  <button className="bi-preset-apply" onClick={() => props.onApplyPreset(preset)}>
                    <span
                      className="bi-preset-swatch"
                      style={{ background: preset.style.fill, borderColor: preset.style.borderColor }}
                    />
                    {preset.name}
                  </button>
                  <button className="bi-icon" onClick={() => props.onDeletePreset(preset.id)}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {board.presets.length === 0 && <div className="bi-help">Save a note’s look to reuse it.</div>}
            </div>
            <div className="bi-row">
              <input
                className="bi-text"
                value={presetName}
                placeholder="Style name"
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && presetName.trim()) {
                    props.onSavePreset(presetName.trim())
                    setPresetName('')
                  }
                }}
              />
              <button
                className="bi-save"
                disabled={!presetName.trim()}
                onClick={() => {
                  props.onSavePreset(presetName.trim())
                  setPresetName('')
                }}
              >
                Save
              </button>
            </div>
          </Section>
        )}
      </div>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="bi-section">
      <h4>{title}</h4>
      {children}
    </section>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }): React.JSX.Element {
  return (
    <button className={cn(value && 'active')} onClick={() => onChange(!value)}>
      {label}
    </button>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element {
  const hex = value.startsWith('#') ? value : '#7c6cf0'
  return (
    <div className="bi-color-row">
      <span>{label}</span>
      <div className="bi-swatches">
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            className={cn('bi-swatch', value === swatch && 'active')}
            style={{
              background: swatch === 'transparent' ? 'repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 50% / 6px 6px' : swatch,
              borderColor: swatch === 'transparent' ? 'var(--border-strong)' : swatch
            }}
            title={swatch}
            onClick={() => onChange(swatch)}
          />
        ))}
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} title="Custom colour" />
      </div>
    </div>
  )
}
