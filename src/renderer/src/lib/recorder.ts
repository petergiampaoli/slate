export interface RecordingResult {
  wav: Uint8Array
  duration: number
  sampleRate: number
}

/**
 * Records microphone audio and returns 16 kHz mono 16-bit WAV, which is what
 * whisper.cpp expects. Uses a ScriptProcessor so no worklet file is needed.
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private sourceRate = 48000
  private startedAt = 0
  private levelSink: ((level: number) => void) | null = null
  private lastLevelAt = 0

  get seconds(): number {
    return this.startedAt ? Math.max(0, (performance.now() - this.startedAt) / 1000) : 0
  }

  async start(onLevel?: (level: number) => void): Promise<void> {
    this.levelSink = onLevel ?? null
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    const context = new AudioContext()
    this.context = context
    this.sourceRate = context.sampleRate
    this.source = context.createMediaStreamSource(this.stream)
    const processor = context.createScriptProcessor(4096, 1, 1)
    this.processor = processor
    this.sink = context.createGain()
    this.sink.gain.value = 0

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(input))
      if (this.levelSink) {
        let sum = 0
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
        const rms = Math.sqrt(sum / input.length)
        const now = performance.now()
        if (now - this.lastLevelAt > 55) {
          this.lastLevelAt = now
          this.levelSink(Math.min(1, Math.pow(rms * 6.5, 0.62)))
        }
      }
    }

    this.source.connect(processor)
    processor.connect(this.sink)
    this.sink.connect(context.destination)
    await context.resume()
    this.startedAt = performance.now()
  }

  async stop(): Promise<RecordingResult> {
    const duration = this.seconds
    const rate = this.sourceRate
    const chunks = this.chunks
    this.chunks = []
    this.teardown()

    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Float32Array(length)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const resampled = await resampleTo16k(merged, rate)
    return {
      wav: encodeWav(resampled, 16000),
      duration: Math.max(1, Math.round(duration)),
      sampleRate: 16000
    }
  }

  cancel(): void {
    this.chunks = []
    this.teardown()
  }

  private teardown(): void {
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
      this.sink?.disconnect()
    } catch {
      /* already disconnected */
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.context?.close().catch(() => undefined)
    this.stream = null
    this.context = null
    this.source = null
    this.processor = null
    this.sink = null
    this.levelSink = null
    this.startedAt = 0
  }
}

async function resampleTo16k(data: Float32Array, sourceRate: number): Promise<Float32Array> {
  const target = 16000
  if (!data.length) return data
  if (sourceRate === target) return data
  const length = Math.max(1, Math.round((data.length * target) / sourceRate))
  const context = new OfflineAudioContext(1, length, target)
  const buffer = context.createBuffer(1, data.length, sourceRate)
  buffer.copyToChannel(new Float32Array(data), 0)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  const rendered = await context.startRendering()
  return rendered.getChannelData(0)
}

/** 44-byte RIFF header + little-endian PCM16 samples. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Uint8Array(buffer)
}
