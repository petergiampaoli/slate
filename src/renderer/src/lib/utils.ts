export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------- POSIX path helpers (vault paths always use forward slashes) ---------- */

export function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i === -1 ? p : p.slice(i + 1)
}

export function extname(p: string): string {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase()
}

export function stripExt(p: string): string {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i <= 0 ? b : b.slice(0, i)
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
}

export function noteTitle(p: string): string {
  return stripExt(p)
}

export function parentName(p: string): string {
  const d = dirname(p)
  return d ? basename(d) : ''
}

/* ---------- File kinds ---------- */

export const NOTE_EXTS = ['md', 'markdown', 'mdx', 'txt', 'canvas']
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'tiff']
export const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']
export const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'm4v']
export const PDF_EXTS = ['pdf']

export const isMarkdown = (p: string): boolean => ['md', 'markdown', 'mdx', 'txt'].includes(extname(p))
export const isNote = (p: string): boolean => NOTE_EXTS.includes(extname(p))
export const isCanvas = (p: string): boolean => extname(p) === 'canvas'
export const isImage = (p: string): boolean => IMAGE_EXTS.includes(extname(p))
export const isAudio = (p: string): boolean => AUDIO_EXTS.includes(extname(p))
export const isVideo = (p: string): boolean => VIDEO_EXTS.includes(extname(p))
export const isPdf = (p: string): boolean => extname(p) === 'pdf'

/** URL for a vault-relative file, served through the custom `slate://` protocol. */
export function assetUrl(relativePath: string): string {
  return `slate://local/${encodeURI(relativePath)}`
}

/* ---------- Text ---------- */

export function wordCount(text: string): number {
  const stripped = text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .trim()
  if (!stripped) return 0
  return stripped.split(/\s+/).filter(Boolean).length
}

export function charCount(text: string): number {
  return text.length
}

export function readingTime(words: number): string {
  const minutes = Math.max(1, Math.round(words / 225))
  return `${minutes} min read`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u00C0-\uFFFF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ---------- Date ---------- */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/** Minimal moment-style date formatter supporting the tokens Obsidian daily notes use. */
export function formatDate(date: Date, format: string): string {
  const hours12 = date.getHours() % 12 === 0 ? 12 : date.getHours() % 12
  return format.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g, (token, literal) => {
    if (literal !== undefined) return literal
    switch (token) {
      case 'YYYY': return String(date.getFullYear())
      case 'YY': return String(date.getFullYear()).slice(2)
      case 'MMMM': return MONTHS[date.getMonth()]
      case 'MMM': return MONTHS_SHORT[date.getMonth()]
      case 'MM': return pad(date.getMonth() + 1)
      case 'M': return String(date.getMonth() + 1)
      case 'DDDD': return DAYS[date.getDay()]
      case 'DDD': return DAYS_SHORT[date.getDay()]
      case 'DD': return pad(date.getDate())
      case 'D': return String(date.getDate())
      case 'dddd': return DAYS[date.getDay()]
      case 'ddd': return DAYS_SHORT[date.getDay()]
      case 'HH': return pad(date.getHours())
      case 'H': return String(date.getHours())
      case 'hh': return pad(hours12)
      case 'h': return String(hours12)
      case 'mm': return pad(date.getMinutes())
      case 'm': return String(date.getMinutes())
      case 'ss': return pad(date.getSeconds())
      case 's': return String(date.getSeconds())
      case 'A': return date.getHours() < 12 ? 'AM' : 'PM'
      case 'a': return date.getHours() < 12 ? 'am' : 'pm'
      default: return token
    }
  })
}

export function relativeTime(iso: string | number): string {
  const date = typeof iso === 'number' ? new Date(iso) : new Date(iso)
  const diff = Date.now() - date.getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return formatDate(date, 'MMM D, YYYY')
}

/* ---------- Misc ---------- */

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): ((...args: A) => void) & { cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = ((...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }) as ((...args: A) => void) & { cancel(): void }
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return wrapped
}

export function selectionText(): string {
  return window.getSelection()?.toString() ?? ''
}

/* ---------- Theme / color ---------- */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
