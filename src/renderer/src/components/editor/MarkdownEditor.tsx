import { useEffect, useRef } from 'react'
import { EditorState, Prec, Transaction } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  lineNumbers,
  placeholder,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import { livePreview } from './livePreview'
import { api, useStore } from '../../state/store'
import { basename, dirname, isImage, stripExt } from '../../lib/utils'
import { registerEditorCommands, setPendingHeading } from '../editorBridge'
import { attemptAutocorrect, refreshSpell, spellcheckExtension } from './spellcheckExtension'
import { baseWord, ignoreAutoCorrect, loadSpellChecker } from '../../lib/spellcheck'

let spellTimer: ReturnType<typeof setTimeout> | null = null

interface Props {
  path: string
  initialContent: string
  content: string
  onChange: (value: string) => void
  onSaveShortcut?: () => void
  typewriter: boolean
  showLineNumbers: boolean
  spellcheck: boolean
}

export function MarkdownEditor({
  path,
  initialContent,
  content,
  onChange,
  typewriter,
  showLineNumbers,
  spellcheck
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const applyingExternal = useRef(false)

  useEffect(() => {
    if (!hostRef.current) return
    const store = useStore.getState()

    const resolveLink = (target: string): string | null => {
      const index = useStore.getState().index
      const clean = target.replace(/\.(md|markdown|mdx)$/i, '').trim()
      if (!clean) return path
      const lower = clean.toLowerCase()
      const byPath = Object.values(index.notes).find(
        (n) => n.path.toLowerCase() === `${lower}.md` || n.path.toLowerCase() === lower
      )
      if (byPath) return byPath.path
      const name = lower.split('/').pop() ?? lower
      const matches = Object.values(index.notes).filter((n) => n.title.toLowerCase() === name)
      if (matches.length === 1) return matches[0].path
      if (matches.length > 1) {
        const sibling = matches.find((n) => dirname(n.path) === dirname(path))
        return (sibling ?? matches[0]).path
      }
      const alias = Object.values(index.notes).find((n) => n.aliases.some((a) => a.toLowerCase() === lower))
      return alias ? alias.path : null
    }

    const resolveAsset = (target: string): string => {
      const index = useStore.getState().index
      const files = useStore.getState().files
      const attachments = useStore.getState().settings.attachmentsFolder
      const clean = decodeURI(target.replace(/^\.\//, '').replace(/^\/+/, ''))
      const candidates = [
        `${dirname(path) ? `${dirname(path)}/` : ''}${clean}`,
        clean,
        `${attachments}/${clean}`,
        `${attachments}/${basename(clean)}`
      ]
      for (const c of candidates) if (files.includes(c)) return c
      const byName = files.find((f) => basename(f).toLowerCase() === basename(clean).toLowerCase())
      return byName ?? candidates[0]
    }

    const noteTitle = (p: string): string => useStore.getState().index.notes[p]?.title ?? stripExt(basename(p))

    const openLink = (target: string, opts?: { newTab?: boolean; heading?: string }): void => {
      if (opts?.heading) setPendingHeading(opts.heading)
      void store.openNote(target, { newTab: opts?.newTab, history: true })
    }

    const wikiCompletion = (context: CompletionContext): CompletionResult | null => {
      const match = context.matchBefore(/\[\[([^\]\n]*)$/)
      if (!match) return null
      const query = match.text.slice(2).toLowerCase()
      const notes = Object.values(useStore.getState().index.notes)
      const options = notes
        .filter((n) => !query || n.title.toLowerCase().includes(query) || n.aliases.some((a) => a.toLowerCase().includes(query)))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 60)
        .map((n) => ({
          label: n.title,
          detail: dirname(n.path) || 'vault root',
          type: 'text',
          apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
            const insert = `${n.title}]]`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length }
            })
          }
        }))
      return { from: match.from + 2, options, filter: false, validFor: /^[^\]\n]*$/ }
    }

    const tagCompletion = (context: CompletionContext): CompletionResult | null => {
      const match = context.matchBefore(/(?:^|\s)#([\w\u00C0-\uFFFF/-]*)$/)
      if (!match) return null
      const hash = match.text.lastIndexOf('#')
      const query = match.text.slice(hash + 1).toLowerCase()
      const tags = useStore.getState().index.tags
      const options = tags
        .filter((t) => !query || t.tag.toLowerCase().includes(query))
        .slice(0, 50)
        .map((t) => ({
          label: t.tag,
          detail: `${t.count} note${t.count === 1 ? '' : 's'}`,
          type: 'keyword'
        }))
      return { from: match.from + hash + 1, options, filter: false, validFor: /^[\w\u00C0-\uFFFF/-]*$/ }
    }

    const spellOptions = {
      enabled: () => useStore.getState().settings.editor.spellcheck,
      autocorrect: () => useStore.getState().settings.spellcheck?.autocorrect ?? true,
      customWords: () =>
        new Set((useStore.getState().settings.spellcheck?.customWords ?? []).map((word) => word.toLowerCase()))
    }

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged && !applyingExternal.current) {
        changeRef.current(update.state.doc.toString())
        if (useStore.getState().spellPopup) useStore.getState().hideSpellPopup()
        const typed = update.transactions.some((transaction) => {
          const event = transaction.annotation(Transaction.userEvent)
          return typeof event === 'string' && event.startsWith('input')
        })
        if (typed && spellOptions.enabled() && spellOptions.autocorrect()) {
          const pos = update.state.selection.main.head
          const previous = pos > 0 ? update.state.sliceDoc(pos - 1, pos) : ''
          const beforePrevious = pos > 1 ? update.state.sliceDoc(pos - 2, pos - 1) : ''
          const justFinishedWord =
            /[\s.,;:!?)\]}'"”’—–-]/.test(previous) && /[\p{L}'’]/u.test(beforePrevious)
          if (justFinishedWord) {
            const line = update.state.doc.lineAt(pos)
            const before = line.text.slice(0, pos - line.from)
            const match = /([\p{L}][\p{L}'’]*)([^\p{L}'’]{0,3})$/u.exec(before)
            if (match) {
              const target = {
                from: line.from + match.index,
                to: line.from + match.index + match[1].length,
                word: match[1]
              }
              queueMicrotask(() => {
                void attemptAutocorrect(update.view, spellOptions, target)
              })
            }
          } else {
            if (spellTimer) clearTimeout(spellTimer)
            spellTimer = setTimeout(() => {
              spellTimer = null
              void attemptAutocorrect(update.view, spellOptions)
            }, 550)
          }
        }
      }
      if (typewriter && update.selectionSet) {
        const head = update.state.selection.main.head
        requestAnimationFrame(() => {
          try {
            update.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) })
          } catch {
            /* view disposed */
          }
        })
      }
    })

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        showLineNumbers ? lineNumbers() : [],
        history(),
        drawSelection(),
        dropCursor(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
        syntaxHighlighting(classHighlighter),
        spellcheckExtension(spellOptions),
        livePreview({
          openLink,
          openTag: (tag) => useStore.getState().setSearchQuery(`tag:${tag}`),
          resolveLink,
          noteTitle,
          resolveAsset,
          assetUrl: (relative) => `slate://local/${encodeURI(relative)}`
        }),
        autocompletion({
          override: [wikiCompletion, tagCompletion],
          activateOnTyping: true,
          icons: false,
          maxRenderedOptions: 60
        }),
        closeBrackets(),
        search({ top: true }),
        highlightSelectionMatches(),
        EditorView.contentAttributes.of({
          spellcheck: 'false',
          autocorrect: 'on',
          autocapitalize: 'sentences'
        }),
        EditorView.inputHandler.of((view, from, to, text) => {
          if (text === '[' && view.state.sliceDoc(Math.max(0, from - 1), from) === '[') {
            view.dispatch({
              changes: { from, to, insert: '[[]]' },
              selection: { anchor: from + 2 }
            })
            return true
          }
          return false
        }),
        Prec.high(
          keymap.of([
            { key: 'Mod-s', run: () => { void useStore.getState().saveNote(path); return true } },
            { key: 'Mod-b', run: (v) => wrap(v, '**', '**', 'bold') },
            { key: 'Mod-i', run: (v) => wrap(v, '*', '*', 'italic') },
            { key: 'Mod-Shift-x', run: (v) => wrap(v, '~~', '~~', 'strikethrough') },
            { key: 'Mod-Shift-h', run: (v) => wrap(v, '==', '==', 'highlight') },
            { key: 'Mod-Shift-c', run: (v) => wrap(v, '`', '`', 'code') },
            { key: 'Mod-k', run: (v) => wrap(v, '[[', ']]', '') },
            { key: 'Mod-Enter', run: (v) => toggleTask(v) }
          ])
        ),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
        EditorView.domEventHandlers({
          mousedown: (event) => {
            const target = event.target as HTMLElement
            const tagEl = target.closest('.cm-tag') as HTMLElement | null
            if (tagEl?.dataset.tag) {
              event.preventDefault()
              useStore.getState().setSearchQuery(`tag:${tagEl.dataset.tag}`)
              return true
            }
            const linkEl = target.closest('.cm-wikilink') as HTMLElement | null
            if (linkEl?.dataset.href && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void useStore.getState().openNote(linkEl.dataset.href, { newTab: event.shiftKey })
              return true
            }
            return false
          },
          click: (event, view) => {
            const target = (event.target as HTMLElement).closest('[data-spell]') as HTMLElement | null
            if (!target) return false
            const from = Number(target.dataset.from)
            const to = Number(target.dataset.to)
            if (!Number.isFinite(from) || !Number.isFinite(to)) return false
            const coords = view.coordsAtPos(from)
            const x = coords?.left ?? event.clientX
            const y = coords?.bottom ?? event.clientY
            const store = useStore.getState()
            if (target.dataset.spell === 'corrected') {
              store.showSpellPopup({
                kind: 'corrected',
                word: target.dataset.original ?? '',
                corrected: target.dataset.corrected ?? '',
                from,
                to,
                x,
                y
              })
            } else {
              const word = target.dataset.word ?? view.state.sliceDoc(from, to)
              void loadSpellChecker().then((checker) => {
                const capitalised = /^\p{Lu}/u.test(word)
                const suggestions = checker.suggest(baseWord(word), 6).map((entry) =>
                  capitalised ? entry.charAt(0).toUpperCase() + entry.slice(1) : entry
                )
                useStore.getState().showSpellPopup({ kind: 'error', word, suggestions, from, to, x, y })
              })
            }
            return false
          },
          paste: (event, view) => {
            const items = event.clipboardData?.files
            if (!items || items.length === 0) return false
            const images = Array.from(items).filter((f) => f.type.startsWith('image/'))
            if (!images.length) return false
            event.preventDefault()
            void (async () => {
              const saved = await useStore.getState().attachFiles(images)
              const text = saved.map((p) => `![[${basename(p)}]]`).join('\n')
              const { from, to } = view.state.selection.main
              view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
            })()
            return true
          },
          drop: (event, view) => {
            const files = event.dataTransfer?.files
            if (!files || files.length === 0) return false
            const paths = Array.from(files)
              .map((f) => api.files.pathFor(f))
              .filter((p): p is string => Boolean(p))
            if (!paths.length) return false
            event.preventDefault()
            void (async () => {
              const saved = await api.fs.importFiles(paths, useStore.getState().settings.attachmentsFolder)
              await useStore.getState().refreshVault()
              const text = saved
                .map((p) => (isImage(p) ? `![[${basename(p)}]]` : `[[${basename(p)}]]`))
                .join('\n')
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
              view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
            })()
            return true
          }
        }),
        updateListener,
        placeholder('Start writing, or type / for ideas…')
      ]
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    const unsubscribeSettings = useStore.subscribe((current, previous) => {
      if (
        current.settings.editor.spellcheck !== previous.settings.editor.spellcheck ||
        current.settings.spellcheck !== previous.settings.spellcheck
      ) {
        try {
          view.dispatch({ effects: refreshSpell.of(null) })
        } catch {
          /* view disposed */
        }
      }
    })
    if (import.meta.env.DEV) {
      ;(window as unknown as { __cmView?: EditorView }).__cmView = view
    }
    view.focus()
    view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, initialContent.length) } })

    const unregister = registerEditorCommands((command, payload) => {
      const v = viewRef.current
      if (!v) return false
      switch (command) {
        case 'bold': return wrap(v, '**', '**', 'bold')
        case 'italic': return wrap(v, '*', '*', 'italic')
        case 'strike': return wrap(v, '~~', '~~', 'strikethrough')
        case 'highlight': return wrap(v, '==', '==', 'highlight')
        case 'code': return wrap(v, '`', '`', 'code')
        case 'link': return wrap(v, '[[', ']]', '')
        case 'math': return wrap(v, '$$', '$$', 'x^2')
        case 'find': openSearchPanel(v); return true
        case 'table': return insertBlock(v, '| Column | Column |\n| --- | --- |\n|  |  |\n')
        case 'callout': return toggleLines(v, '> [!note] ')
        case 'fenced-code': return insertBlock(v, '```\n\n```\n', 4)
        case 'task': return toggleLines(v, '- [ ] ')
        case 'toggle-task': return toggleTask(v)
        case 'insert-text': return insertText(v, String(payload ?? ''))
        case 'spell-replace': {
          const data = payload as { from: number; to: number; text: string }
          v.dispatch({
            changes: { from: data.from, to: data.to, insert: data.text },
            selection: { anchor: data.from + data.text.length }
          })
          useStore.getState().hideSpellPopup()
          return true
        }
        case 'spell-undo': {
          const data = payload as { from: number; to: number; original: string }
          ignoreAutoCorrect(data.original)
          v.dispatch({
            changes: { from: data.from, to: data.to, insert: data.original },
            selection: { anchor: data.from + data.original.length }
          })
          useStore.getState().hideSpellPopup()
          return true
        }
        case 'spell-refresh':
          v.dispatch({ effects: refreshSpell.of(null) })
          return true
        default: return false
      }
    })

    return () => {
      if (spellTimer) {
        clearTimeout(spellTimer)
        spellTimer = null
      }
      unsubscribeSettings()
      unregister()
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  /* Keep the editor in sync with content that changed outside of typing. */
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === content) return
    applyingExternal.current = true
    const anchor = view.state.selection.main.head
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: { anchor: Math.min(anchor, content.length) }
    })
    applyingExternal.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  return <div className="editor-host" ref={hostRef} />
}

/* ------------------------------------------------------------------ */
/* Editing helpers                                                     */
/* ------------------------------------------------------------------ */

function wrap(view: EditorView, before: string, after: string, placeholder: string): boolean {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const already =
    view.state.sliceDoc(from - before.length, from) === before &&
    view.state.sliceDoc(to, to + after.length) === after
  if (already) {
    view.dispatch({
      changes: [
        { from: from - before.length, to: from, insert: '' },
        { from: to, to: to + after.length, insert: '' }
      ],
      selection: { anchor: from - before.length, head: to - before.length }
    })
    return true
  }
  const text = selected || placeholder
  view.dispatch({
    changes: { from, to, insert: `${before}${text}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + text.length }
  })
  return true
}

function insertText(view: EditorView, text: string): boolean {
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length }
  })
  return true
}

function insertBlock(view: EditorView, text: string, cursorOffset?: number): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const prefix = line.text.length ? '\n' : ''
  const insert = prefix + text
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + (cursorOffset ?? insert.length) }
  })
  return true
}

function toggleLines(view: EditorView, prefix: string): boolean {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: { from: number; to: number; insert: string }[] = []
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n)
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefix })
    }
  }
  view.dispatch({ changes })
  return true
}

function toggleTask(view: EditorView): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const re = /^(\s*[-*+]\s+)\[([ xX])\]/
  const m = re.exec(line.text)
  if (m) {
    const at = line.from + m[1].length + 1
    const checked = m[2].toLowerCase() === 'x'
    view.dispatch({ changes: { from: at, to: at + 1, insert: checked ? ' ' : 'x' } })
    return true
  }
  const prefix = '- [ ] '
  view.dispatch({ changes: { from: line.from, insert: prefix } })
  return true
}
