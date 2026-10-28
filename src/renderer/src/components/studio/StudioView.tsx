import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Download,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import type { VaultIndex } from '../../lib/indexer'
import { api, useStore } from '../../state/store'
import {
  CHART_TYPES,
  PALETTES,
  STUDIO_FILE,
  activitySeries,
  collectNotes,
  cooccurrence,
  emptyDoc,
  filterSummary,
  folderCounts,
  newCard,
  newTheme,
  paletteFor,
  suggestThemes,
  tagCounts,
  themeSeries,
  themeStats,
  termFrequencies,
  totals,
  type StudioCard,
  type StudioChartType,
  type StudioDoc,
  type StudioNote,
  type StudioTheme
} from '../../lib/studio'
import { cn, uid } from '../../lib/utils'
import { useContextMenu } from '../ContextMenu'
import {
  ActivityChart,
  BarListChart,
  ChartSvg,
  EmptyChart,
  StatsChart,
  ThemeBarsChart,
  ThemeHeatmapChart,
  WordCloudChart,
  WordMapChart
} from './charts'

type FileStats = Record<string, { mtime: number; size: number }>

export function StudioView(): React.JSX.Element {
  const index = useStore((s) => s.index)
  const fileStats = useStore((s) => s.fileStats)
  const folders = useStore((s) => s.index.folders)
  const scope = useStore((s) => s.studioScope)
  const setScope = useStore((s) => s.setStudioScope)
  const [doc, setDoc] = useState<StudioDoc | null>(null)
  const [editing, setEditing] = useState<StudioCard | null>(null)
  const [themesOpen, setThemesOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    void api.fs
      .read(STUDIO_FILE)
      .then((raw) => {
        if (!alive) return
        try {
          const parsed = JSON.parse(raw) as StudioDoc
          setDoc({ ...emptyDoc(), ...parsed, themes: parsed.themes ?? [], cards: parsed.cards ?? [] })
        } catch {
          setDoc(emptyDoc())
        }
      })
      .catch(() => {
        if (!alive) return
        const initial = emptyDoc()
        if (index.tags.length) initial.themes = suggestThemes(index)
        setDoc(initial)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!doc) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void api.fs.write(STUDIO_FILE, JSON.stringify(doc, null, 2)).catch(() => {
        useStore.getState().toast('Could not save the Studio configuration', 'error')
      })
    }, 350)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [doc])

  const visible = useMemo(() => {
    if (!doc) return []
    if (showAll || !scope) return doc.cards
    return doc.cards.filter((card) => card.scope.folder === scope || card.scope.folder === '')
  }, [doc, showAll, scope])

  if (!doc) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  const updateCard = (card: StudioCard): void => {
    setDoc((current) =>
      current ? { ...current, cards: current.cards.map((c) => (c.id === card.id ? card : c)) } : current
    )
    setEditing(null)
  }

  const removeCard = (id: string): void => {
    setDoc((current) => (current ? { ...current, cards: current.cards.filter((c) => c.id !== id) } : current))
  }

  const duplicateCard = (card: StudioCard): void => {
    setDoc((current) =>
      current ? { ...current, cards: [...current.cards, { ...card, id: uid('card'), title: `${card.title} copy` }] } : current
    )
  }

  const addCard = (type: StudioChartType): void => {
    setEditing(newCard(showAll ? '' : scope, type))
  }

  const applyTemplate = (cards: StudioCard[]): void => {
    setDoc((current) => (current ? { ...current, cards: [...current.cards, ...cards] } : current))
  }

  const refresh = (): void => {
    setRefreshing(true)
    const state = useStore.getState()
    void state.refreshVault(false).finally(() => {
      setRefreshing(false)
      state.toast('Studio refreshed', 'success')
    })
  }

  return (
    <div className="studio">
      <div className="studio-header">
        <div className="studio-heading">
          <div className="studio-title-row">
            <BarChart3 size={17} strokeWidth={1.8} />
            <h2>Studio</h2>
          </div>
          <p>Visualise the shape of your writing — words, themes and momentum.</p>
        </div>
        <div className="studio-toolbar">
          <div className="studio-scope">
            <Layers size={13} />
            <select
              value={showAll ? '*' : scope}
              onChange={(e) => {
                const value = e.target.value
                if (value === '*') {
                  setShowAll(true)
                } else {
                  setShowAll(false)
                  setScope(value)
                }
              }}
            >
              <option value="*">All visualizations</option>
              <option value="">Whole vault</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>
          <button className="icon-btn" title="Refresh data" onClick={refresh}>
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
          </button>
          <button className="btn" onClick={() => setThemesOpen(true)}>
            <Palette size={13} /> Themes
          </button>
          <button className="btn primary" onClick={() => addCard('stats')}>
            <Plus size={13} /> Add visualization
          </button>
        </div>
      </div>

      {doc.cards.length === 0 ? (
        <div className="studio-start">
          <div className="studio-start-head">
            <LayoutGrid size={22} />
            <h3>Build your first project view</h3>
            <p>
              Visualizations are saved with this vault and can be scoped to a project folder, filtered by tag or date,
              and tuned chart by chart.
            </p>
          </div>
          <div className="studio-templates">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                className="studio-template"
                onClick={() => applyTemplate(template.build(showAll ? '' : scope))}
              >
                <span className="ico">
                  <template.icon size={16} />
                </span>
                <span>
                  <div className="t">{template.name}</div>
                  <div className="d">{template.description}</div>
                </span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CHART_TYPES.map((type) => (
              <button key={type.id} className="btn sm" onClick={() => addCard(type.id)}>
                <Plus size={11} /> {type.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="studio-strip">
            <span>{visible.length} visualization{visible.length === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{showAll ? 'every folder' : scope ? `project “${scope}”` : 'whole vault'}</span>
            <span style={{ marginLeft: 'auto' }}>{doc.themes.length} themes defined</span>
          </div>

          <div className="studio-grid">
            {visible.map((card) => (
              <StudioCardView
                key={card.id}
                card={card}
                index={index}
                fileStats={fileStats}
                themes={doc.themes}
                onEdit={() => setEditing(card)}
                onDuplicate={() => duplicateCard(card)}
                onDelete={() => removeCard(card.id)}
              />
            ))}
            {visible.length === 0 && (
              <div className="studio-empty">
                <p>No visualizations are assigned to this folder yet.</p>
                <button className="btn" onClick={() => addCard('stats')}>
                  <Plus size={13} /> Add one here
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {editing && (
        <CardEditor
          card={editing}
          themes={doc.themes}
          folders={folders}
          index={index}
          fileStats={fileStats}
          onClose={() => setEditing(null)}
          onSave={updateCard}
        />
      )}

      {themesOpen && (
        <ThemesEditor
          doc={doc}
          index={index}
          onChange={setDoc}
          onClose={() => setThemesOpen(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function StudioCardView({
  card,
  index,
  fileStats,
  themes,
  onEdit,
  onDuplicate,
  onDelete
}: {
  card: StudioCard
  index: VaultIndex
  fileStats: FileStats
  themes: StudioTheme[]
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}): React.JSX.Element {
  const menu = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  const notes = useMemo(
    () => collectNotes(index, fileStats, card.scope, card.filters),
    [index, fileStats, card]
  )
  const palette = paletteFor(card.settings.palette)

  const exportSvg = (): void => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', '800')
    const height = svg.getAttribute('viewBox')?.split(' ')[3] ?? '400'
    clone.setAttribute('height', height)
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`
    void api.export.svg(text, card.title).then((result) => {
      if (result.ok) useStore.getState().toast('Exported visualization', 'success')
    })
  }

  return (
    <article
      ref={ref}
      className={cn('studio-card', card.span === 2 && 'span-2')}
      onContextMenu={(event) =>
        menu.open(event, [
          { label: 'Edit visualization', icon: Pencil, onSelect: onEdit },
          { label: 'Duplicate', icon: Layers, onSelect: onDuplicate },
          { label: 'Download SVG', icon: Download, onSelect: exportSvg },
          { separator: true },
          { label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete }
        ])
      }
    >
      <header className="studio-card-head">
        <div className="studio-card-titles">
          <h3>{card.title}</h3>
          {card.subtitle && <p>{card.subtitle}</p>}
        </div>
        <div className="studio-card-actions">
          <button className="icon-btn" title="Download SVG" onClick={exportSvg}>
            <Download size={13} />
          </button>
          <button className="icon-btn" title="Edit" onClick={onEdit}>
            <Pencil size={13} />
          </button>
          <button
            className="icon-btn"
            title="More"
            onClick={(event) =>
              menu.open(event, [
                { label: 'Edit visualization', icon: Pencil, onSelect: onEdit },
                { label: 'Duplicate', icon: Layers, onSelect: onDuplicate },
                { label: 'Download SVG', icon: Download, onSelect: exportSvg },
                { separator: true },
                { label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete }
              ])
            }
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </header>

      <div className="studio-card-body">
        <CardChart card={card} notes={notes} themes={themes} palette={palette} />
      </div>

      <footer className="studio-card-foot">
        <span>{filterSummary(card)}</span>
        <span style={{ marginLeft: 'auto' }}>{notes.length} notes</span>
      </footer>
    </article>
  )
}

function CardChart({
  card,
  notes,
  themes,
  palette
}: {
  card: StudioCard
  notes: StudioNote[]
  themes: StudioTheme[]
  palette: string[]
}): React.JSX.Element {
  const { type, settings } = card
  const empty = notes.length === 0

  switch (type) {
    case 'stats':
      return empty ? <EmptyChart message="No notes in this selection yet." /> : <StatsChart stats={totals(notes)} />
    case 'activity': {
      const points = activitySeries(notes, settings.bucket)
      return points.length ? <ActivityChart points={points} palette={palette} /> : <EmptyChart message="No dated notes to chart." />
    }
    case 'wordcloud': {
      const terms = termFrequencies(notes, settings.limit)
      return terms.length ? <WordCloudChart terms={terms} palette={palette} limit={settings.limit} /> : <EmptyChart message="Not enough text to build a word cloud." />
    }
    case 'wordmap': {
      const data = cooccurrence(notes, Math.min(60, settings.limit), settings.minCount)
      return data.nodes.length ? <WordMapChart data={data} palette={palette} /> : <EmptyChart message="Words need to appear together in at least a few notes." />
    }
    case 'themes': {
      const stats = themeStats(notes, themes)
      return stats.length ? <ThemeBarsChart stats={stats} palette={palette} /> : <EmptyChart message="No themes defined yet — open “Themes” to add some." />
    }
    case 'heatmap': {
      const { buckets, values } = themeSeries(notes, themes, settings.bucket)
      return themes.length ? <ThemeHeatmapChart themes={themes} buckets={buckets} values={values} /> : <EmptyChart message="No themes defined yet." />
    }
    case 'tags': {
      const items = tagCounts(notes)
      return items.length ? <BarListChart items={items} palette={palette} /> : <EmptyChart message="No tags in this selection." />
    }
    case 'folders': {
      const items = folderCounts(notes)
      return items.length ? <BarListChart items={items} palette={palette} labelWidth={200} /> : <EmptyChart message="No folders in this selection." />
    }
    default:
      return <EmptyChart message="Pick a chart type." />
  }
}

/* ------------------------------------------------------------------ */
/* Card editor                                                         */
/* ------------------------------------------------------------------ */

function CardEditor({
  card,
  themes,
  folders,
  index,
  fileStats,
  onSave,
  onClose
}: {
  card: StudioCard
  themes: StudioTheme[]
  folders: string[]
  index: VaultIndex
  fileStats: FileStats
  onSave: (card: StudioCard) => void
  onClose: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<StudioCard>(card)
  const notes = useMemo(
    () => collectNotes(index, fileStats, draft.scope, draft.filters),
    [index, fileStats, draft.scope, draft.filters]
  )
  const palette = paletteFor(draft.settings.palette)
  const typeInfo = CHART_TYPES.find((t) => t.id === draft.type)

  const patch = (values: Partial<StudioCard>): void => setDraft((current) => ({ ...current, ...values }))
  const patchSettings = (values: Partial<StudioCard['settings']>): void =>
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...values } }))
  const patchFilters = (values: Partial<StudioCard['filters']>): void =>
    setDraft((current) => ({ ...current, filters: { ...current.filters, ...values } }))
  const patchScope = (values: Partial<StudioCard['scope']>): void =>
    setDraft((current) => ({ ...current, scope: { ...current.scope, ...values } }))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="studio-editor">
        <header className="studio-editor-head">
          <div>
            <h3>Visualization</h3>
            <p>Assign a scope, filters and appearance. The preview updates live.</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <div className="studio-editor-body">
          <div className="studio-editor-form">
            <label className="field">
              <span>Title</span>
              <input
                className="text-input"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Subtitle</span>
              <input
                className="text-input"
                value={draft.subtitle}
                placeholder="Optional context"
                onChange={(e) => patch({ subtitle: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Chart</span>
              <select
                className="select-input"
                value={draft.type}
                onChange={(e) => {
                  const type = e.target.value as StudioChartType
                  const info = CHART_TYPES.find((t) => t.id === type)
                  const oldDefault = CHART_TYPES.find((t) => t.id === draft.type)?.label
                  patch({
                    type,
                    title: !draft.title || draft.title === oldDefault ? info?.label ?? draft.title : draft.title
                  })
                }}
              >
                {CHART_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            {typeInfo && <div className="field-help">{typeInfo.description}</div>}

            <div className="field-row">
              <label className="field">
                <span>Project / folder</span>
                <select
                  className="select-input"
                  value={draft.scope.folder}
                  onChange={(e) => patchScope({ folder: e.target.value })}
                >
                  <option value="">Whole vault</option>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={draft.scope.includeSubfolders}
                  onChange={(e) => patchScope({ includeSubfolders: e.target.checked })}
                />
                <span>Include subfolders</span>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Tags (any of)</span>
                <input
                  className="text-input"
                  value={draft.filters.tags.join(', ')}
                  placeholder="projects, draft"
                  onChange={(e) =>
                    patchFilters({
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim().replace(/^#/, ''))
                        .filter(Boolean)
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Search text</span>
                <input
                  className="text-input"
                  value={draft.filters.search}
                  placeholder="e.g. chapter"
                  onChange={(e) => patchFilters({ search: e.target.value })}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>From</span>
                <input
                  className="text-input"
                  type="date"
                  value={draft.filters.dateFrom}
                  onChange={(e) => patchFilters({ dateFrom: e.target.value })}
                />
              </label>
              <label className="field">
                <span>To</span>
                <input
                  className="text-input"
                  type="date"
                  value={draft.filters.dateTo}
                  onChange={(e) => patchFilters({ dateTo: e.target.value })}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Palette</span>
                <select
                  className="select-input"
                  value={draft.settings.palette}
                  onChange={(e) => patchSettings({ palette: e.target.value })}
                >
                  {Object.entries(PALETTES).map(([id, palette]) => (
                    <option key={id} value={id}>
                      {palette.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Top words / terms</span>
                <input
                  className="text-input"
                  type="number"
                  min={5}
                  max={80}
                  value={draft.settings.limit}
                  onChange={(e) => patchSettings({ limit: Number(e.target.value) || 24 })}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Time bucket</span>
                <select
                  className="select-input"
                  value={draft.settings.bucket}
                  onChange={(e) => patchSettings({ bucket: e.target.value as 'week' | 'month' })}
                >
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                </select>
              </label>
              <label className="field">
                <span>Minimum pair count</span>
                <input
                  className="text-input"
                  type="number"
                  min={1}
                  max={10}
                  value={draft.settings.minCount}
                  onChange={(e) => patchSettings({ minCount: Number(e.target.value) || 1 })}
                />
              </label>
            </div>

            <label className="field">
              <span>Width</span>
              <div className="segmented">
                <button className={draft.span === 1 ? 'active' : ''} onClick={() => patch({ span: 1 })}>
                  Half
                </button>
                <button className={draft.span === 2 ? 'active' : ''} onClick={() => patch({ span: 2 })}>
                  Full
                </button>
              </div>
            </label>
          </div>

          <div className="studio-editor-preview">
            <div className="studio-preview-label">
              <span>Preview</span>
              <span>{notes.length} notes</span>
            </div>
            <div className="studio-preview-frame">
              <CardChart card={draft} notes={notes} themes={themes} palette={palette} />
            </div>
            <div className="studio-preview-meta">{filterSummary(draft)}</div>
          </div>
        </div>

        <footer className="studio-editor-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave(draft)} disabled={!draft.title.trim()}>
            Save visualization
          </button>
        </footer>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Themes editor                                                       */
/* ------------------------------------------------------------------ */

function ThemesEditor({
  doc,
  index,
  onChange,
  onClose
}: {
  doc: StudioDoc
  index: VaultIndex
  onChange: (doc: StudioDoc) => void
  onClose: () => void
}): React.JSX.Element {
  const setThemes = (themes: StudioTheme[]): void => onChange({ ...doc, themes })

  const update = (id: string, patch: Partial<StudioTheme>): void =>
    setThemes(doc.themes.map((theme) => (theme.id === id ? { ...theme, ...patch } : theme)))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog studio-themes">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Palette size={16} />
          <h3 style={{ margin: 0 }}>Themes</h3>
        </div>
        <div className="dialog-message">
          Themes are made of keywords Slate looks for across your notes. Use them to track recurring subjects over time.
        </div>

        <div className="theme-list">
          {doc.themes.map((theme) => (
            <div className="theme-row" key={theme.id}>
              <input
                type="color"
                value={theme.color}
                onChange={(e) => update(theme.id, { color: e.target.value })}
                className="theme-color"
              />
              <input
                className="text-input theme-name"
                value={theme.name}
                onChange={(e) => update(theme.id, { name: e.target.value })}
              />
              <input
                className="text-input theme-keywords"
                value={theme.keywords.join(', ')}
                placeholder="keywords, comma separated"
                onChange={(e) =>
                  update(theme.id, {
                    keywords: e.target.value
                      .split(',')
                      .map((k) => k.trim())
                      .filter(Boolean)
                  })
                }
              />
              <button
                className="icon-btn"
                title="Delete theme"
                onClick={() => setThemes(doc.themes.filter((t) => t.id !== theme.id))}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {doc.themes.length === 0 && (
            <div className="empty-hint" style={{ padding: '12px 4px' }}>
              No themes yet. Add one manually or suggest from your tags.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setThemes([...doc.themes, newTheme()])}>
            <Plus size={13} /> Add theme
          </button>
          <button
            className="btn"
            onClick={() => {
              const suggestions = suggestThemes(index, 4).filter(
                (candidate) => !doc.themes.some((theme) => theme.name.toLowerCase() === candidate.name.toLowerCase())
              )
              setThemes([...doc.themes, ...suggestions])
            }}
          >
            <Sparkles size={13} /> Suggest from tags
          </button>
        </div>

        <div className="dialog-actions" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const TEMPLATES: {
  id: string
  name: string
  description: string
  icon: typeof BarChart3
  build: (scope: string) => StudioCard[]
}[] = [
  {
    id: 'writer',
    name: 'Writer’s dashboard',
    description: 'Summary, writing momentum and the words you use most.',
    icon: BarChart3,
    build: (scope) => [newCard(scope, 'stats'), newCard(scope, 'activity'), newCard(scope, 'wordcloud')]
  },
  {
    id: 'themes',
    name: 'Theme tracker',
    description: 'Theme frequency, a timeline across drafts and a word map.',
    icon: Palette,
    build: (scope) => [newCard(scope, 'themes'), newCard(scope, 'heatmap'), newCard(scope, 'wordmap')]
  },
  {
    id: 'project',
    name: 'Project overview',
    description: 'Metrics, tags, folder balance and activity.',
    icon: LayoutGrid,
    build: (scope) => [newCard(scope, 'stats'), newCard(scope, 'tags'), newCard(scope, 'folders'), newCard(scope, 'activity')]
  }
]
