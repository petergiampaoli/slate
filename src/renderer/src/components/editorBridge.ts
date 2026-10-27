type CommandHandler = (command: string, payload?: unknown) => boolean

let handler: CommandHandler | null = null
const waiters: Array<{ command: string; resolve: () => void }> = []

export function registerEditorCommands(fn: CommandHandler): () => void {
  handler = fn
  for (const waiter of [...waiters]) {
    if (fn(waiter.command)) {
      waiter.resolve()
      waiters.splice(waiters.indexOf(waiter), 1)
    }
  }
  return () => {
    if (handler === fn) handler = null
  }
}

export function editorCommand(command: string, payload?: unknown): boolean {
  if (handler && handler(command, payload)) return true
  return false
}

/** Queue a command until an editor mounts (used right after opening a note). */
export function afterEditorMounted(command: string): Promise<void> {
  if (handler && handler(command)) return Promise.resolve()
  return new Promise((resolve) => {
    waiters.push({ command, resolve })
    window.setTimeout(() => {
      const i = waiters.findIndex((w) => w.resolve === resolve)
      if (i !== -1) {
        waiters.splice(i, 1)
        resolve()
      }
    }, 1500)
  })
}

type ExportHandler = (format: 'pdf' | 'html' | 'markdown') => Promise<void>

let exporter: ExportHandler | null = null

export function registerExporter(fn: ExportHandler): () => void {
  exporter = fn
  return () => {
    if (exporter === fn) exporter = null
  }
}

export async function runExport(format: 'pdf' | 'html' | 'markdown'): Promise<void> {
  await exporter?.(format)
}

let pendingHeading: string | null = null

export function setPendingHeading(heading: string | null): void {
  pendingHeading = heading
}

export function takePendingHeading(): string | null {
  const value = pendingHeading
  pendingHeading = null
  return value
}
