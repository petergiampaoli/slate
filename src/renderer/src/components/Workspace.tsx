import { useStore } from '../state/store'
import { cn } from '../lib/utils'
import { EditorPane } from './editor/EditorPane'
import { GraphView } from './graph/GraphView'
import { CanvasView } from './canvas/CanvasView'
import { SettingsView } from './SettingsView'
import { SearchPage } from './SearchPage'
import { StudioView } from './studio/StudioView'
import { Welcome } from './Welcome'
import type { TabState } from '@shared/types'

export function Workspace(): React.JSX.Element {
  const panes = useStore((s) => s.panes)
  return (
    <div className="panes">
      {panes.map((pane) => (
        <PaneView key={pane.id} paneId={pane.id} />
      ))}
    </div>
  )
}

function PaneView({ paneId }: { paneId: string }): React.JSX.Element {
  const pane = useStore((s) => s.panes.find((p) => p.id === paneId))
  const active = useStore((s) => s.activePaneId === paneId)
  const tab = pane?.tabs.find((t) => t.id === pane?.activeTabId)

  if (!pane) return <div className="pane" />

  return (
    <div
      className={cn('pane', active && 'active-pane')}
      onMouseDown={() => {
        if (!active) useStore.getState().setActivePane(paneId)
      }}
    >
      {tab ? <TabContent tab={tab} paneId={paneId} active={active} /> : <Welcome />}
    </div>
  )
}

function TabContent({ tab, paneId, active }: { tab: TabState; paneId: string; active: boolean }): React.JSX.Element {
  switch (tab.kind) {
    case 'note':
      return <EditorPane tab={tab} paneId={paneId} active={active} />
    case 'graph':
      return <GraphView mode="global" />
    case 'canvas':
      return <CanvasView path={tab.path ?? ''} />
    case 'settings':
      return <SettingsView embedded />
    case 'search':
      return <SearchPage />
    case 'studio':
      return <StudioView />
    default:
      return <Welcome />
  }
}
