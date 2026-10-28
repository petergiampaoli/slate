import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, AudioLines, Mic, Square, X } from 'lucide-react'
import { api, useStore } from '../../state/store'
import { VoiceRecorder, type RecordingResult } from '../../lib/recorder'
import { saveDictationNote, audioOnlyRecording } from '../../lib/dictation'
import { cn } from '../../lib/utils'

type Phase = 'starting' | 'recording' | 'transcribing' | 'saving' | 'error'

const BAR_COUNT = 44

export function DictationOverlay(): React.JSX.Element {
  const settings = useStore((s) => s.settings.dictation)
  const [phase, setPhase] = useState<Phase>('starting')
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0))
  const [progress, setProgress] = useState(0)
  const [engineName, setEngineName] = useState('Whisper base.en')
  const [recording, setRecording] = useState<RecordingResult | null>(null)
  const recorderRef = useRef<VoiceRecorder | null>(null)
  const finishedRef = useRef(false)

  const close = useCallback(() => useStore.getState().hideModal(), [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const engine = await api.dictation.engine()
      if (!engine.available) {
        if (!alive) return
        setError(engine.reason ?? 'The dictation engine is unavailable.')
        setPhase('error')
        return
      }
      setEngineName(engine.modelName)

      const allowed = await api.dictation.requestMic()
      if (!allowed) {
        if (!alive) return
        setError(
          'Microphone access is turned off. Enable it in System Settings → Privacy & Security → Microphone, then try again.'
        )
        setPhase('error')
        return
      }

      const recorder = new VoiceRecorder()
      recorderRef.current = recorder
      try {
        await recorder.start((level) => {
          if (!alive) return
          setLevels((current) => {
            const next = current.slice(1)
            next.push(level)
            return next
          })
        })
        if (alive) setPhase('recording')
      } catch (err) {
        if (!alive) return
        setError(`Could not start recording: ${String(err)}`)
        setPhase('error')
      }
    })()
    return () => {
      alive = false
      recorderRef.current?.cancel()
      recorderRef.current = null
    }
  }, [])

  useEffect(() => {
    if (phase !== 'recording') return
    const timer = window.setInterval(() => {
      setSeconds(recorderRef.current?.seconds ?? 0)
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (phase === 'recording' || phase === 'starting') {
        event.preventDefault()
        event.stopPropagation()
        recorderRef.current?.cancel()
        close()
      } else if (phase === 'error') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase, close])

  const stopAndTranscribe = async (): Promise<void> => {
    const recorder = recorderRef.current
    if (!recorder || finishedRef.current) return
    finishedRef.current = true
    setPhase('transcribing')
    setProgress(0)

    let result: RecordingResult
    try {
      result = await recorder.stop()
    } catch (err) {
      setError(`Could not finish the recording: ${String(err)}`)
      setPhase('error')
      return
    }
    setRecording(result)
    recorderRef.current = null

    if (result.duration < 1) {
      setError('That recording was too short. Hold on a little longer and try again.')
      setPhase('error')
      return
    }

    const unsubscribe = api.dictation.onProgress((percent) => setProgress(percent))
    let response
    try {
      response = await api.dictation.transcribe(result.wav, settings.language, result.duration)
    } catch (err) {
      response = { ok: false, error: String(err) }
    } finally {
      unsubscribe()
    }

    if (!response.ok || !response.text) {
      setError(response.error ?? 'Transcription failed.')
      setPhase('error')
      return
    }

    setPhase('saving')
    await saveDictationNote({ text: response.text, recording: result })
    useStore.getState().toast(`Note created from ${result.duration}s of audio`, 'success')
    close()
  }

  const saveAudioOnly = async (): Promise<void> => {
    if (!recording) return
    setPhase('saving')
    await saveDictationNote(audioOnlyRecording(recording))
    useStore.getState().toast('Audio saved in a new note', 'info')
    close()
  }

  const mm = Math.floor(seconds / 60)
  const ss = String(Math.floor(seconds % 60)).padStart(2, '0')
  const active = phase === 'recording'

  return (
    <div className="overlay dictation-overlay" onMouseDown={(e) => e.target === e.currentTarget && (phase === 'recording' || phase === 'error') && close()}>
      <div className={cn('dictation-card', active && 'is-recording')}>
        <header className="dictation-head">
          <div className="dictation-title">
            <AudioLines size={16} />
            <span>Dictation</span>
          </div>
          <button
            className="icon-btn"
            onClick={close}
            title="Cancel"
            disabled={phase === 'transcribing' || phase === 'saving'}
          >
            <X size={15} />
          </button>
        </header>

        <div className="dictation-body">
          {(phase === 'starting' || active) && (
            <>
              <div className="dictation-mic">
                <span className="mic-ring ring-1" />
                <span className="mic-ring ring-2" />
                <span className="mic-core">
                  <Mic size={26} strokeWidth={1.7} />
                </span>
              </div>
              <div className="dictation-timer">
                {mm}:{ss}
              </div>
              <div className="dictation-wave" aria-hidden>
                {levels.map((level, i) => (
                  <span
                    key={i}
                    style={{ height: `${Math.max(3, Math.round(level * 42))}px`, opacity: 0.35 + level * 0.65 }}
                  />
                ))}
              </div>
              <div className="dictation-status">
                {phase === 'starting' ? 'Connecting to the microphone…' : 'Listening — speak naturally'}
              </div>
            </>
          )}

          {(phase === 'transcribing' || phase === 'saving') && (
            <>
              <div className="dictation-mic transcribing">
                <span className="mic-core">
                  <AudioLines size={26} strokeWidth={1.7} />
                </span>
              </div>
              <div className="dictation-status strong">
                {phase === 'saving' ? 'Creating your note…' : 'Transcribing audio…'}
              </div>
              {phase === 'transcribing' && (
                <>
                  <div className="dictation-progress">
                    <span style={{ width: `${Math.max(6, progress)}%` }} />
                  </div>
                  <div className="dictation-hint">
                    {progress > 0 ? `${progress}% · ` : ''}
                    {engineName} · runs entirely on this Mac
                  </div>
                </>
              )}
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="dictation-error-icon">
                <AlertCircle size={26} />
              </div>
              <div className="dictation-error">{error}</div>
              <div className="dictation-hint">
                {recording ? 'Your recording is still here — you can save it as an audio note.' : 'No audio was captured.'}
              </div>
            </>
          )}
        </div>

        <footer className="dictation-foot">
          {active && (
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn primary" onClick={() => void stopAndTranscribe()}>
                <Square size={12} fill="currentColor" /> Stop & transcribe
              </button>
            </>
          )}
          {(phase === 'starting' || phase === 'transcribing' || phase === 'saving') && (
            <button className="btn" onClick={close} disabled={phase !== 'starting'}>
              Cancel
            </button>
          )}
          {phase === 'error' && (
            <>
              <button className="btn" onClick={close}>
                Close
              </button>
              {recording && (
                <button className="btn primary" onClick={() => void saveAudioOnly()}>
                  Save audio only
                </button>
              )}
            </>
          )}
        </footer>

        <div className="dictation-note">
          {settings.keepAudio
            ? 'The recording is attached to the new note. Titles follow the first words or topic of the transcript.'
            : 'The audio is discarded after transcription; only the text note is kept.'}
        </div>
      </div>
    </div>
  )
}
