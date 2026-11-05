import type { NSpell } from 'nspell'

/**
 * Spelling engine used by the editor. Loads Hunspell's English dictionary
 * lazily so the main bundle stays small.
 */

export interface SpellChecker {
  correct(word: string): boolean
  suggest(word: string, max?: number): string[]
}

let checkerPromise: Promise<SpellChecker> | null = null

export function loadSpellChecker(): Promise<SpellChecker> {
  if (!checkerPromise) {
    checkerPromise = (async () => {
      const [aff, dic, nspellModule] = await Promise.all([
        import('../assets/dictionary/en.aff?raw'),
        import('../assets/dictionary/en.dic?raw'),
        import('nspell')
      ])
      const nspell = nspellModule.default as unknown as (
        aff: string | Uint8Array,
        dic: string | Uint8Array
      ) => NSpell
      const spell = nspell(aff.default, dic.default)
      return {
        correct: (word: string) => spell.correct(word),
        suggest: (word: string, max = 6) => {
          try {
            return spell.suggest(word).slice(0, max)
          } catch {
            return []
          }
        }
      }
    })()
  }
  return checkerPromise
}

/* ------------------------------------------------------------------ */
/* Word normalisation                                                  */
/* ------------------------------------------------------------------ */

export function normaliseWord(word: string): string {
  return word.replace(/[’‘]/g, "'")
}

export function baseWord(word: string): string {
  return normaliseWord(word).replace(/(?:'|’|‘)s$/i, '')
}

export function isAcronym(word: string): boolean {
  return /^\p{Lu}{2,}$/u.test(word)
}

/** Skip camelCase, digits, very short tokens and all-caps acronyms. */
export function shouldIgnoreToken(word: string): boolean {
  const clean = baseWord(word)
  if (clean.length < 2) return true
  if (/\d/.test(clean)) return true
  if (isAcronym(clean)) return true
  if (/^[a-z]/.test(clean) && /[A-Z]/.test(clean.slice(1))) return true
  return false
}

/* ------------------------------------------------------------------ */
/* Auto-correction                                                     */
/* ------------------------------------------------------------------ */

/** Misspellings that are not adjacent transpositions or doubled letters. */
export const COMMON_CORRECTIONS: Record<string, string> = {
  definately: 'definitely',
  definatly: 'definitely',
  seperate: 'separate',
  seperated: 'separated',
  seperately: 'separately',
  occured: 'occurred',
  occuring: 'occurring',
  untill: 'until',
  goverment: 'government',
  enviroment: 'environment',
  enviromental: 'environmental',
  tommorow: 'tomorrow',
  tommorrow: 'tomorrow',
  necesary: 'necessary',
  neccessary: 'necessary',
  accomodate: 'accommodate',
  accomodation: 'accommodation',
  arguement: 'argument',
  publically: 'publicly',
  wich: 'which',
  becuase: 'because',
  becasue: 'because',
  diffrent: 'different',
  intresting: 'interesting',
  probaly: 'probably',
  realy: 'really',
  finaly: 'finally',
  actualy: 'actually',
  usualy: 'usually',
  basicly: 'basically',
  especialy: 'especially',
  carefull: 'careful',
  succesful: 'successful',
  succesfully: 'successfully',
  wonderfull: 'wonderful',
  gratefull: 'grateful',
  similiar: 'similar',
  existance: 'existence',
  maintainance: 'maintenance',
  ocurrence: 'occurrence',
  posess: 'possess',
  recomend: 'recommend',
  recomendation: 'recommendation',
  refered: 'referred',
  refering: 'referring',
  begining: 'beginning',
  comming: 'coming',
  writting: 'writing',
  runing: 'running',
  stoped: 'stopped',
  planing: 'planning',
  adress: 'address',
  adressing: 'addressing',
  apear: 'appear',
  apperance: 'appearance',
  buisness: 'business',
  buisnesses: 'businesses',
  campain: 'campaign',
  carrer: 'career',
  cheif: 'chief',
  collegue: 'colleague',
  collegues: 'colleagues',
  commitee: 'committee',
  completly: 'completely',
  concious: 'conscious',
  curiousity: 'curiosity',
  decison: 'decision',
  desicion: 'decision',
  developement: 'development',
  embarass: 'embarrass',
  emmbarassed: 'embarrassed',
  familar: 'familiar',
  feild: 'field',
  freind: 'friend',
  freinds: 'friends',
  garantee: 'guarantee',
  grammer: 'grammar',
  happend: 'happened',
  harrass: 'harass',
  heirarchy: 'hierarchy',
  humourous: 'humorous',
  independant: 'independent',
  knowlege: 'knowledge',
  liason: 'liaison',
  libary: 'library',
  lisence: 'license',
  maintainence: 'maintenance',
  millenium: 'millennium',
  mischievious: 'mischievous',
  neice: 'niece',
  noticable: 'noticeable',
  occassion: 'occasion',
  occassional: 'occasional',
  oppurtunity: 'opportunity',
  paralell: 'parallel',
  passtime: 'pastime',
  percieve: 'perceive',
  permanant: 'permanent',
  perseverence: 'perseverance',
  personel: 'personnel',
  posession: 'possession',
  preceed: 'precede',
  presance: 'presence',
  priviledge: 'privilege',
  proffesional: 'professional',
  promiss: 'promise',
  pronounciation: 'pronunciation',
  questionaire: 'questionnaire',
  reciept: 'receipt',
  reccomend: 'recommend',
  rythm: 'rhythm',
  seige: 'siege',
  sieze: 'seize',
  strenght: 'strength',
  suprise: 'surprise',
  suprising: 'surprising',
  threshhold: 'threshold',
  tounge: 'tongue',
  truely: 'truly',
  twelth: 'twelfth',
  tyrany: 'tyranny',
  undertand: 'understand',
  vaccuum: 'vacuum',
  vehical: 'vehicle',
  visable: 'visible',
  wether: 'whether',
  wierd: 'weird',
  withdrawl: 'withdrawal',
  woild: 'would',
  yeild: 'yield',
  dont: "don't",
  cant: "can't",
  wont: "won't",
  isnt: "isn't",
  arent: "aren't",
  didnt: "didn't",
  doesnt: "doesn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  im: "I'm",
  ive: "I've",
  youre: "you're",
  theyre: "they're",
  thats: "that's",
  whats: "what's",
  hes: "he's",
  shes: "she's",
}

const ignoredThisSession = new Set<string>()

export function ignoreAutoCorrect(word: string): void {
  ignoredThisSession.add(normaliseWord(word).toLowerCase())
}

export function isAutoCorrectIgnored(word: string): boolean {
  return ignoredThisSession.has(normaliseWord(word).toLowerCase())
}

function matchCase(original: string, correction: string): string {
  if (!correction) return correction
  if (original.length > 1 && original === original.toUpperCase()) return correction.toUpperCase()
  if (/^\p{Lu}/u.test(original)) {
    return correction.charAt(0).toUpperCase() + correction.slice(1)
  }
  return correction
}

function validCandidate(candidate: string, checker: SpellChecker): boolean {
  return candidate.length > 1 && checker.correct(candidate)
}

/** Returns a high-confidence correction for a flagged word, or null. */
export function autoCorrectionFor(
  word: string,
  checker: SpellChecker,
  customWords: Set<string>
): string | null {
  const normalised = normaliseWord(word)
  if (normalised.length < 3) return null
  if (!/^\p{L}+$/u.test(normalised)) return null
  if (isAcronym(normalised)) return null
  if (customWords.has(normalised.toLowerCase())) return null
  if (isAutoCorrectIgnored(normalised)) return null

  const lower = normalised.toLowerCase()
  const onlyFirstCapital = /^\p{Lu}[\p{Ll}]*$/u.test(normalised)
  if (lower !== normalised && !onlyFirstCapital) return null

  if (COMMON_CORRECTIONS[lower]) {
    return matchCase(normalised, COMMON_CORRECTIONS[lower])
  }

  const letters = [...lower]

  // Adjacent transposition: "teh" → "the", "recieve" → "receive".
  for (let i = 0; i < letters.length - 1; i++) {
    if (letters[i] === letters[i + 1]) continue
    const swapped = [...letters]
    ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
    const candidate = swapped.join('')
    if (validCandidate(candidate, checker)) {
      return matchCase(normalised, candidate)
    }
  }

  // A single doubled letter: "helllo" → "hello".
  for (let i = 0; i < letters.length - 1; i++) {
    if (letters[i] !== letters[i + 1]) continue
    const candidate = `${letters.slice(0, i).join('')}${letters.slice(i + 1).join('')}`
    if (candidate.length >= 3 && validCandidate(candidate, checker)) {
      return matchCase(normalised, candidate)
    }
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Prose masking                                                       */
/* ------------------------------------------------------------------ */

/**
 * Replace everything that should not be spell checked (code, links, tags,
 * URLs, markup) with spaces while preserving offsets.
 */
export function proseMask(line: string): string {
  let text = line
  const blank = (pattern: RegExp): void => {
    text = text.replace(pattern, (match) => ' '.repeat(match.length))
  }

  blank(/`[^`\n]*`/g)
  blank(/\[\[[^\]]*\]\]/g)
  blank(/!?\[[^\]]*\]\([^)]*\)/g)
  blank(/\b(?:https?:\/\/|www\.)\S+/gi)
  blank(/\b[\w.+-]+@[\w.-]+\.\w+\b/g)
  blank(/<[^>\n]+>/g)
  blank(/#[\p{L}\d/_-]+/gu)
  blank(/\$[^$\n]+\$/g)
  blank(/^\s{0,3}#{1,6}\s+/u)
  blank(/^\s*>\s*/)
  blank(/^\s*\[![^\]]+\][+-]?\s*/)
  blank(/^\s*[-*+]\s+\[[ xX]\]\s+/)
  blank(/^\s*[-*+]\s+/)
  blank(/^\s*\d+[.)]\s+/)
  blank(/[*_~]{1,3}/g)

  return text
}

export const WORD_RE = /[\p{L}][\p{L}'’]*/gu

export interface WordRange {
  from: number
  to: number
  word: string
}

/** Words on a line that are in prose and safe to check. */
export function wordsInLine(lineStart: number, lineText: string): WordRange[] {
  const masked = proseMask(lineText)
  const words: WordRange[] = []
  WORD_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD_RE.exec(masked))) {
    const word = lineText.slice(match.index, match.index + match[0].length)
    words.push({ from: lineStart + match.index, to: lineStart + match.index + match[0].length, word })
  }
  return words
}

/** Whether a range is plain prose (not code, a tag or a link). */
export function isProseRange(lineText: string, from: number, to: number, lineStart: number): boolean {
  const masked = proseMask(lineText)
  const segment = masked.slice(from - lineStart, to - lineStart)
  return segment.trim().length > 0
}
