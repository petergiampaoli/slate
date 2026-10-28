import { api, useStore } from '../state/store'
import { formatDate } from './utils'
import type { RecordingResult } from './recorder'

const FILLERS =
  /^(?:(?:um+|uh+|erm+|ah+|hmm+|okay|ok|so|yeah|yep|well|right|hey|alright|like)[,.!?\s]+)+/i

const SMALL_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'as', 'is', 'are'
])

export function cleanTranscript(text: string): string {
  return text
    .replace(/\[(?:blank_audio|silence|music|applause|inaudible)\]/gi, ' ')
    .replace(/\([^)]{0,40}(?:music|applause|silence)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tidyTitle(raw: string, titleCase = false): string {
  let text = raw
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b || a)
    .replace(/[*_`~#<>[\]{}]/g, '')
    .replace(/^[\s"'“”‘’.,;:!?-]+|[\s"'“”‘’.,;:!?-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (titleCase) {
    text = text
      .split(' ')
      .map((word, index) => {
        if (!word) return word
        if (word.length > 1 && word === word.toUpperCase()) return word
        if (index > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase()
        return word.charAt(0).toUpperCase() + word.slice(1)
      })
      .join(' ')
  }

  if (text.length > 64) {
    const cut = text.slice(0, 64)
    text = `${cut.slice(0, Math.max(1, cut.lastIndexOf(' '))).trim()}`
  }

  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Best-effort note title from the transcript. */
export function guessTitle(text: string, fallback: string): string {
  const cleaned = cleanTranscript(text)
  if (!cleaned) return fallback
  const stripped = cleaned.replace(FILLERS, '').trim()

  const patterns: { re: RegExp; titleCase: boolean }[] = [
    {
      re: /(?:today\s+)?(?:i(?:'m| am)\s+)?(?:going\s+to\s+)?(?:make|making|cook|cooking|prepare|preparing|bake|baking|mix|mixing)\s+(?:a|an|the|some)?\s*([^.,!?;]{2,70})/i,
      titleCase: true
    },
    {
      re: /(?:recipe\s+for|recipe|how\s+to\s+(?:make|cook)|ingredients\s+for)\s+(?:a|an|the)?\s*([^.,!?;]{2,70})/i,
      titleCase: true
    },
    {
      re: /(?:this\s+is|here(?:'s| is)|it(?:'s| is))\s+(?:a|an|the)?\s*([^.,!?;]{2,70})/i,
      titleCase: true
    },
    {
      re: /(?:talk(?:ing)?\s+about|discuss(?:ing)?|explor(?:e|ing)|think(?:ing)?\s+about|focus(?:ing)?\s+on)\s+(?:the\s+)?([^.,!?;]{2,70})/i,
      titleCase: false
    }
  ]

  for (const pattern of patterns) {
    const match = pattern.re.exec(stripped)
    if (match) {
      const title = tidyTitle(match[1], pattern.titleCase)
      if (title.length >= 2) return title
    }
  }

  const needsList =
    /\bingredients?\b/i.test(stripped) ||
    /^(?:i|we|you)\s+(?:need|use|add|have|will\s+need|'ll\s+need)\b/i.test(stripped)
  if (needsList) {
    const after = /\bingredients?\b/i.test(stripped)
      ? stripped.split(/\bingredients?\b(?: are| include|:)?/i)[1] ?? ''
      : stripped.replace(/^.*?\b(?:need|use|add|have)\b/i, '')
    const items = after
      .split(/,| and | plus /)
      .map((item) =>
        tidyTitle(
          item
            .split(/\s+(?:for|in|to|with)\s+/i)[0]
            .split(/\s+/)
            .slice(0, 4)
            .join(' ')
        )
      )
      .filter(Boolean)
      .slice(0, 3)
    if (items.length >= 2) {
      return tidyTitle(`Ingredients — ${items.join(', ')}`)
    }
  }

  const firstSentence = stripped.split(/(?<=[.!?])\s+/)[0] ?? stripped
  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, 9)
  const title = words.join(' ').replace(/\s+(?:and|or|but|with|for|of|the|a|an|to|in|on|at|by|from|is|are|was|were)$/i, '')
  return tidyTitle(title) || fallback
}

/** Split a long transcript into readable paragraphs. */
export function formatTranscript(text: string): string {
  const cleaned = cleanTranscript(text)
  if (!cleaned) return '_No speech was detected._'

  const existingLines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const sentences =
    existingLines.length > 1
      ? existingLines
      : (cleaned.match(/[^.!?]+[.!?]+["'”’)]?|[^.!?]+$/g) ?? [cleaned]).map((s) => s.trim())

  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += 4) {
    paragraphs.push(sentences.slice(i, i + 4).join(' '))
  }
  return paragraphs.join('\n\n')
}

export interface SaveDictationOptions {
  text: string
  recording: RecordingResult
  audioOnly?: boolean
}

export async function saveDictationNote({ text, recording, audioOnly }: SaveDictationOptions): Promise<string | null> {
  const state = useStore.getState()
  const settings = state.settings.dictation
  const now = new Date()

  let audioPath: string | null = null
  if (settings.keepAudio) {
    const filename = `dictation-${formatDate(now, 'YYYY-MM-DD-HHmmss')}.wav`
    try {
      audioPath = await api.fs.saveAttachment(filename, recording.wav)
    } catch (err) {
      state.toast(`Could not save the recording: ${String(err)}`, 'error')
    }
  }

  const fallback = `Dictation ${formatDate(now, 'MMM D, HH:mm')}`
  const title = audioOnly ? fallback : settings.autoTitle ? guessTitle(text, fallback) : fallback
  const transcript = audioOnly ? '_Transcription was not available. The audio is attached below._' : formatTranscript(text)

  const frontmatter = [
    '---',
    'source: dictation',
    `recorded: ${now.toISOString()}`,
    `duration: ${recording.duration}`,
    ...(audioPath ? [`audio: "[[${audioPath}]]"`] : []),
    '---'
  ].join('\n')

  const body = [
    `# ${title}`,
    '',
    transcript,
    ...(audioPath
      ? ['', '## Recording', '', `![[${audioPath}]]`]
      : [])
  ].join('\n')

  await useStore.getState().refreshVault()
  return useStore.getState().createNote({ name: title, content: `${frontmatter}\n\n${body}\n`, open: true })
}

/** Fallback for recordings whose transcription failed. */
export function audioOnlyRecording(recording: RecordingResult): SaveDictationOptions {
  return { text: '', recording, audioOnly: true }
}
