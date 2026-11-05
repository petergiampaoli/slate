import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { StateEffect, StateField, type Extension, type Text } from '@codemirror/state'
import {
  autoCorrectionFor,
  baseWord,
  isProseRange,
  loadSpellChecker,
  shouldIgnoreToken,
  wordsInLine,
  type SpellChecker
} from '../../lib/spellcheck'

export interface Correction {
  from: number
  to: number
  original: string
  corrected: string
}

export const addCorrection = StateEffect.define<Correction>()
export const refreshSpell = StateEffect.define<null>()

export const correctionField = StateField.define<Correction[]>({
  create: () => [],
  update(value, transaction) {
    let next = value.map((correction) => ({
      ...correction,
      from: transaction.changes.mapPos(correction.from, -1),
      to: transaction.changes.mapPos(correction.to, 1)
    }))
    for (const effect of transaction.effects) {
      if (effect.is(addCorrection)) next.push(effect.value)
    }
    next = next.filter(
      (correction) =>
        correction.from >= 0 &&
        correction.to <= transaction.state.doc.length &&
        transaction.state.sliceDoc(correction.from, correction.to) === correction.corrected
    )
    return next
  }
})

export interface SpellOptions {
  enabled: () => boolean
  autocorrect: () => boolean
  customWords: () => Set<string>
}

/* ------------------------------------------------------------------ */
/* Fences & frontmatter                                                */
/* ------------------------------------------------------------------ */

interface FenceInfo {
  startLine: number
  endLine: number
}

function findFences(doc: Text): FenceInfo[] {
  const fences: FenceInfo[] = []
  let open: number | null = null
  for (let i = 1; i <= doc.lines; i++) {
    const text = doc.line(i).text
    if (!/^\s{0,3}(```+|~~~+)/.test(text)) continue
    if (open === null) open = i
    else {
      fences.push({ startLine: open, endLine: i })
      open = null
    }
  }
  if (open !== null) fences.push({ startLine: open, endLine: doc.lines })
  return fences
}

function frontmatterEnd(doc: Text): number {
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return 0
  for (let i = 2; i <= Math.min(doc.lines, 400); i++) {
    if (doc.line(i).text.trim() === '---') return i
  }
  return 0
}

/* ------------------------------------------------------------------ */
/* Decorations                                                         */
/* ------------------------------------------------------------------ */

class SpellPlugin {
  decorations: DecorationSet = Decoration.none
  private checker: SpellChecker | null = null
  private destroyed = false

  constructor(private view: EditorView, private options: SpellOptions) {
    void loadSpellChecker()
      .then((checker) => {
        this.checker = checker
        if (!this.destroyed) this.view.dispatch({ effects: refreshSpell.of(null) })
      })
      .catch((error) => console.warn('[slate] spellcheck unavailable', error))
    this.decorations = this.build()
  }

  update(update: ViewUpdate): void {
    const refresh = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(refreshSpell))
    )
    if (update.docChanged || update.viewportChanged || refresh) {
      this.decorations = this.build()
    }
  }

  destroy(): void {
    this.destroyed = true
  }

  private build(): DecorationSet {
    if (!this.options.enabled() || !this.checker) return Decoration.none
    const checker = this.checker
    const custom = this.options.customWords()
    const state = this.view.state
    const doc = state.doc
    const corrections = state.field(correctionField, false) ?? []
    const fences = findFences(doc)
    const fmEnd = frontmatterEnd(doc)
    const decorations: ReturnType<Decoration['range']>[] = []

    const overlapsCorrection = (from: number, to: number): boolean =>
      corrections.some((correction) => from < correction.to && to > correction.from)

    for (const { from, to } of this.view.visibleRanges) {
      let pos = from
      while (pos <= to) {
        const line = doc.lineAt(pos)
        pos = line.to + 1
        if (line.number <= fmEnd) continue
        if (fences.some((fence) => line.number >= fence.startLine && line.number <= fence.endLine)) continue

        for (const word of wordsInLine(line.from, line.text)) {
          if (overlapsCorrection(word.from, word.to)) continue
          if (shouldIgnoreToken(word.word)) continue
          const base = baseWord(word.word)
          if (custom.has(base.toLowerCase())) continue
          if (checker.correct(base)) continue
          decorations.push(
            Decoration.mark({
              class: 'cm-spell-error',
              attributes: {
                'data-spell': 'error',
                'data-from': String(word.from),
                'data-to': String(word.to),
                'data-word': word.word
              }
            }).range(word.from, word.to)
          )
        }
      }

      for (const correction of corrections) {
        if (correction.from < from || correction.to > to) continue
        if (state.sliceDoc(correction.from, correction.to) !== correction.corrected) continue
        decorations.push(
          Decoration.mark({
            class: 'cm-spell-corrected',
            attributes: {
              'data-spell': 'corrected',
              'data-from': String(correction.from),
              'data-to': String(correction.to),
              'data-word': correction.original,
              'data-original': correction.original,
              'data-corrected': correction.corrected
            }
          }).range(correction.from, correction.to)
        )
      }
    }

    return Decoration.set(decorations, true)
  }
}

export function spellcheckExtension(options: SpellOptions): Extension {
  return [
    correctionField,
    ViewPlugin.fromClass(
      class extends SpellPlugin {
        constructor(view: EditorView) {
          super(view, options)
        }
      },
      { decorations: (plugin) => plugin.decorations }
    )
  ]
}

/* ------------------------------------------------------------------ */
/* Auto-correction                                                     */
/* ------------------------------------------------------------------ */

export interface AutocorrectTarget {
  from: number
  to: number
  word: string
}

export async function attemptAutocorrect(
  view: EditorView,
  options: SpellOptions,
  target?: AutocorrectTarget
): Promise<boolean> {
  if (!options.enabled() || !options.autocorrect()) return false
  if (view.composing) return false
  if (!view.hasFocus) return false

  let word: string
  let from: number
  let to: number

  if (target) {
    word = target.word
    from = target.from
    to = target.to
    if (to > view.state.doc.length || view.state.sliceDoc(from, to) !== word) return false
  } else {
    const selection = view.state.selection.main
    if (!selection.empty) return false
    const pos = selection.head
    const after = pos < view.state.doc.length ? view.state.sliceDoc(pos, pos + 1) : ''
    if (after && /[\p{L}'’]/u.test(after)) return false
    const line = view.state.doc.lineAt(pos)
    const before = line.text.slice(0, pos - line.from)
    const match = /([\p{L}][\p{L}'’]*)([^\p{L}'’]{0,3})$/u.exec(before)
    if (!match) return false
    word = match[1]
    from = line.from + match.index
    to = from + word.length
  }

  const line = view.state.doc.lineAt(from)
  if (!/^\p{L}+$/u.test(word)) return false
  if (line.number <= frontmatterEnd(view.state.doc)) return false
  if (findFences(view.state.doc).some((fence) => line.number >= fence.startLine && line.number <= fence.endLine)) {
    return false
  }
  if (!isProseRange(line.text, from, to, line.from)) return false

  const custom = options.customWords()
  if (custom.has(word.toLowerCase())) return false
  if (shouldIgnoreToken(word)) return false

  const checker = await loadSpellChecker()
  const base = baseWord(word)
  if (checker.correct(base)) return false

  const correction = autoCorrectionFor(word, checker, custom)
  if (!correction || correction === word) return false

  const head = view.state.selection.main.head
  const anchor = head >= from ? head + correction.length - word.length : head
  view.dispatch({
    changes: { from, to, insert: correction },
    selection: { anchor },
    effects: addCorrection.of({
      from,
      to: from + correction.length,
      original: word,
      corrected: correction
    })
  })
  return true
}
