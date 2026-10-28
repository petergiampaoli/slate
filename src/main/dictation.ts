import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface DictationEngine {
  available: boolean
  modelName: string
  modelPath: string | null
  binaryPath: string | null
  modelSize: number
  reason?: string
}

export interface TranscriptionResult {
  ok: boolean
  text?: string
  error?: string
  model?: string
  seconds?: number
}

function whisperDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'whisper')
    : path.join(app.getAppPath(), 'resources', 'whisper')
}

export function dictationEngine(): DictationEngine {
  const dir = whisperDir()
  const binary = path.join(dir, 'whisper-cli')
  const model = path.join(dir, 'ggml-base.en.bin')
  const hasBinary = fs.existsSync(binary)
  const hasModel = fs.existsSync(model)
  let size = 0
  try {
    size = hasModel ? fs.statSync(model).size : 0
  } catch {
    size = 0
  }
  return {
    available: hasBinary && hasModel,
    modelName: 'Whisper base.en',
    modelPath: hasModel ? model : null,
    binaryPath: hasBinary ? binary : null,
    modelSize: size,
    reason: hasBinary
      ? hasModel
        ? undefined
        : 'The speech model is missing. Run “npm run setup:whisper” or reinstall Slate.'
      : 'The whisper engine is missing. Run “npm run setup:whisper” or reinstall Slate.'
  }
}

export async function transcribeWav(
  wav: Uint8Array,
  options: { language?: string; duration?: number; onProgress?: (percent: number) => void } = {}
): Promise<TranscriptionResult> {
  const engine = dictationEngine()
  if (!engine.available || !engine.modelPath || !engine.binaryPath) {
    return { ok: false, error: engine.reason ?? 'Dictation is not available.' }
  }

  const started = Date.now()
  const base = path.join(os.tmpdir(), `slate-dictation-${started}`)
  const wavPath = `${base}.wav`
  const txtPath = `${base}.txt`
  await fsp.writeFile(wavPath, Buffer.from(wav))

  const language = (options.language ?? 'en').trim() || 'en'
  const threads = Math.max(2, Math.min(8, os.cpus().length))
  const args = [
    '-m',
    engine.modelPath,
    '-f',
    wavPath,
    '-otxt',
    '-of',
    base,
    '-nt',
    '-np',
    '-pp',
    '-l',
    language,
    '-t',
    String(threads)
  ]

  const duration = Math.max(1, options.duration ?? 0)
  const timeoutMs = Math.min(15 * 60_000, Math.max(120_000, duration * 5000))

  return new Promise<TranscriptionResult>((resolve) => {
    const child = spawn(engine.binaryPath as string, args, {
      cwd: path.dirname(engine.binaryPath as string),
      env: { ...process.env, OMP_NUM_THREADS: String(threads) }
    })
    let stderr = ''
    let settled = false
    let lastProgress = 0
    let lastEmit = 0

    const finish = async (result: TranscriptionResult): Promise<void> => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      await fsp.unlink(wavPath).catch(() => undefined)
      await fsp.unlink(txtPath).catch(() => undefined)
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      void finish({ ok: false, error: 'Transcription timed out.' })
    }, timeoutMs)

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      const match = /progress\s*=\s*(\d+)%/i.exec(text)
      if (match && options.onProgress) {
        const percent = Math.min(100, Number(match[1]))
        const now = Date.now()
        if (percent !== lastProgress && now - lastEmit > 120) {
          lastProgress = percent
          lastEmit = now
          options.onProgress(percent)
        }
      }
    })

    child.on('error', (error) => {
      void finish({ ok: false, error: error.message })
    })

    child.on('close', async (code) => {
      if (settled) return
      if (code !== 0) {
        const detail = stderr.split('\n').filter(Boolean).slice(-2).join(' ').trim()
        void finish({ ok: false, error: `Speech engine failed (${code}). ${detail}` })
        return
      }
      try {
        const text = (await fsp.readFile(txtPath, 'utf8')).trim()
        if (!text) {
          void finish({ ok: false, error: 'No speech was detected in the recording.' })
          return
        }
        void finish({ ok: true, text, model: engine.modelName, seconds: Math.round((Date.now() - started) / 1000) })
      } catch {
        void finish({ ok: false, error: 'The speech engine produced no transcript.' })
      }
    })
  })
}
