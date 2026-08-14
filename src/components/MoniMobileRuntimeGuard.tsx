'use client'

import { useLayoutEffect } from 'react'

const THREAD_KEY = 'moni-global-agent-thread-v11'
const VOICE_CONFIRM_FALLBACK_MS = 30_000

type RecognitionAlternative = { transcript: string }
type RecognitionResult = {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}
type RecognitionEvent = {
  resultIndex: number
  results: {
    length: number
    [index: number]: RecognitionResult
  }
}
type RecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  onstart?: (() => void) | null
  onspeechstart?: (() => void) | null
  onspeechend?: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => RecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
  webkitAudioContext?: typeof AudioContext
}

function syntheticFinalEvent(transcript: string): RecognitionEvent {
  const result: RecognitionResult = {
    0: { transcript },
    isFinal: true,
    length: 1,
  }
  return {
    resultIndex: 0,
    results: {
      0: result,
      length: 1,
    },
  }
}

function audioMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

export default function MoniMobileRuntimeGuard() {
  useLayoutEffect(() => {
    // A fresh navigation opens a clean visible mobile chat. A normal reload
    // preserves the active thread so accidental refreshes do not lose work.
    try {
      const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const legacyPerformance = window.performance as Performance & { navigation?: { type?: number } }
      const isReload = navigation?.type === 'reload' || legacyPerformance.navigation?.type === 1
      if (!isReload) window.localStorage.removeItem(THREAD_KEY)
    } catch {
      // Navigation metadata must never block the chat UI.
    }

    const speechWindow = window as SpeechWindow
    const OriginalSpeechRecognition = speechWindow.SpeechRecognition
    const OriginalWebkitSpeechRecognition = speechWindow.webkitSpeechRecognition

    // Android Chrome's native SpeechRecognition ends a recognition session
    // after silence. Restarting that session causes the audible system chime
    // and cumulative-result duplication. For MONI mobile we instead keep one
    // MediaRecorder microphone session open until the user explicitly presses
    // 확인, then transcribe the single captured recording once on the server.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return

    let transcriptionPending = false
    const originalSetTimeout = window.setTimeout.bind(window)
    const originalClearTimeout = window.clearTimeout.bind(window)

    // MoniMobileChat has a defensive 900ms recognition-finalization timer for
    // the old browser SpeechRecognition path. Server transcription can take
    // longer, so only while a confirmed recording is being transcribed we
    // stretch that one fallback. The normal onend handler clears it as soon as
    // transcription completes.
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const delay = transcriptionPending && Number(timeout) === 900 ? VOICE_CONFIRM_FALLBACK_MS : timeout
      return originalSetTimeout(handler, delay, ...args)
    }) as typeof window.setTimeout

    class RecorderBackedRecognition implements RecognitionLike {
      continuous = true
      interimResults = true
      lang = 'ko-KR'

      onresult: ((event: RecognitionEvent) => void) | null = null
      onerror: ((event: { error?: string }) => void) | null = null
      onend: (() => void) | null = null
      onstart: (() => void) | null = null
      onspeechstart: (() => void) | null = null
      onspeechend: (() => void) | null = null

      private recorder: MediaRecorder | null = null
      private stream: MediaStream | null = null
      private chunks: Blob[] = []
      private aborted = false
      private stoppedByUser = false
      private audioContext: AudioContext | null = null
      private source: MediaStreamAudioSourceNode | null = null
      private analyser: AnalyserNode | null = null
      private analyserTimer: number | null = null
      private speechActive = false

      start() {
        if (this.recorder && this.recorder.state !== 'inactive') return
        this.aborted = false
        this.stoppedByUser = false
        this.chunks = []
        void this.beginRecording()
      }

      stop() {
        if (this.stoppedByUser || this.aborted) return
        this.stoppedByUser = true
        transcriptionPending = true
        if (this.recorder && this.recorder.state !== 'inactive') {
          try {
            this.recorder.requestData()
          } catch {
            // requestData is optional for finalization; stop still flushes data.
          }
          this.recorder.stop()
          return
        }
        transcriptionPending = false
        this.onerror?.({ error: 'recording-not-active' })
      }

      abort() {
        this.aborted = true
        transcriptionPending = false
        if (this.recorder && this.recorder.state !== 'inactive') {
          this.recorder.onstop = null
          try { this.recorder.stop() } catch { /* no-op */ }
        }
        this.cleanupCapture()
      }

      private async beginRecording() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
          })
          if (this.aborted) {
            stream.getTracks().forEach((track) => track.stop())
            return
          }
          this.stream = stream
          this.startLevelMonitor(stream)

          const mimeType = audioMimeType()
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
          this.recorder = recorder
          recorder.ondataavailable = (event) => {
            if (event.data?.size) this.chunks.push(event.data)
          }
          recorder.onerror = () => {
            transcriptionPending = false
            this.cleanupCapture()
            this.onerror?.({ error: 'recorder-error' })
          }
          recorder.onstop = () => {
            if (this.aborted) {
              transcriptionPending = false
              this.cleanupCapture()
              return
            }
            void this.transcribeRecording(recorder.mimeType || mimeType || 'audio/webm')
          }
          recorder.start(1000)
          this.onstart?.()
        } catch (error) {
          transcriptionPending = false
          this.cleanupCapture()
          const name = error instanceof DOMException ? error.name : ''
          this.onerror?.({ error: name === 'NotAllowedError' ? 'not-allowed' : 'recorder-start-failed' })
        }
      }

      private startLevelMonitor(stream: MediaStream) {
        try {
          const AudioContextClass = window.AudioContext || speechWindow.webkitAudioContext
          if (!AudioContextClass) return
          const context = new AudioContextClass()
          const analyser = context.createAnalyser()
          analyser.fftSize = 256
          const source = context.createMediaStreamSource(stream)
          source.connect(analyser)
          this.audioContext = context
          this.source = source
          this.analyser = analyser
          void context.resume()

          const samples = new Uint8Array(analyser.fftSize)
          this.analyserTimer = originalSetTimeout(function tick(this: RecorderBackedRecognition) {
            if (!this.analyser || this.aborted || (this.stoppedByUser && !transcriptionPending)) return
            this.analyser.getByteTimeDomainData(samples)
            let energy = 0
            for (const sample of samples) {
              const delta = sample - 128
              energy += delta * delta
            }
            const rms = Math.sqrt(energy / samples.length)
            const nowActive = rms >= 4.5
            if (nowActive !== this.speechActive) {
              this.speechActive = nowActive
              if (nowActive) this.onspeechstart?.()
              else this.onspeechend?.()
            }
            this.analyserTimer = originalSetTimeout(tick.bind(this), 100)
          }.bind(this), 100)
        } catch {
          // Waveform activity is cosmetic. Recording must continue regardless.
        }
      }

      private async transcribeRecording(mimeType: string) {
        const blob = new Blob(this.chunks, { type: mimeType })
        this.cleanupCapture()
        if (blob.size < 256) {
          transcriptionPending = false
          this.onerror?.({ error: 'no-speech' })
          return
        }

        try {
          const form = new FormData()
          const extension = mimeType.includes('ogg') ? 'ogg' : 'webm'
          form.append('file', blob, `moni-voice.${extension}`)
          const response = await fetch('/api/moni/transcribe', {
            method: 'POST',
            body: form,
          })
          const payload = await response.json() as { ok?: boolean; text?: string; error?: string }
          const transcript = String(payload.text || '').trim()
          if (!response.ok || !payload.ok || !transcript) {
            throw new Error(payload.error || 'transcription_failed')
          }
          this.onresult?.(syntheticFinalEvent(transcript))
          transcriptionPending = false
          this.onend?.()
        } catch {
          transcriptionPending = false
          this.onerror?.({ error: 'transcription-failed' })
        }
      }

      private cleanupCapture() {
        if (this.analyserTimer !== null) {
          originalClearTimeout(this.analyserTimer)
          this.analyserTimer = null
        }
        try { this.source?.disconnect() } catch { /* no-op */ }
        this.source = null
        this.analyser = null
        this.stream?.getTracks().forEach((track) => track.stop())
        this.stream = null
        if (this.audioContext) {
          void this.audioContext.close().catch(() => undefined)
          this.audioContext = null
        }
        if (this.speechActive) {
          this.speechActive = false
          this.onspeechend?.()
        }
      }
    }

    speechWindow.SpeechRecognition = RecorderBackedRecognition as unknown as RecognitionConstructor
    speechWindow.webkitSpeechRecognition = RecorderBackedRecognition as unknown as RecognitionConstructor

    return () => {
      speechWindow.SpeechRecognition = OriginalSpeechRecognition
      speechWindow.webkitSpeechRecognition = OriginalWebkitSpeechRecognition
      window.setTimeout = originalSetTimeout as typeof window.setTimeout
    }
  }, [])

  return null
}
