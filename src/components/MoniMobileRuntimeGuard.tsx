'use client'

import { useLayoutEffect } from 'react'

const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'
const INTERNAL_CONTEXT_MARKERS = [
  'MONI_SHARED_CONTEXT_START',
  'MONI_SHARED_CONTEXT_END',
  '[PMO 승인 공용 프로젝트 문맥]',
  '[PMO 승인 공통 프로젝트 문맥]',
]
const VOICE_CONFIRM_FALLBACK_MS = 30_000
const BOUNDED_READ_CLIENT_TIMEOUT_MS = 55_000
const VOICE_WAVE_FACTORS = [0.42, 0.62, 0.86, 0.54, 1, 0.7, 0.9, 0.5, 0.96, 0.68, 0.58, 0.48, 0.4]

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

function hasInternalContextMarker(value: unknown) {
  const content = String(value ?? '')
  return INTERNAL_CONTEXT_MARKERS.some((marker) => content.includes(marker))
}

function scrubLeakedInternalContextCache() {
  try {
    const raw = window.localStorage.getItem(MESSAGE_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(MESSAGE_CACHE_KEY)
      return
    }
    const cleaned = parsed.filter((item) => !hasInternalContextMarker(item && typeof item === 'object' ? item.content : ''))
    if (cleaned.length === parsed.length) return
    if (cleaned.length) window.localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(cleaned))
    else window.localStorage.removeItem(MESSAGE_CACHE_KEY)
  } catch {
    window.localStorage.removeItem(MESSAGE_CACHE_KEY)
  }
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

function updateVoiceWaveFromRms(rms: number) {
  const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
  if (!root) return
  const normalized = Math.max(0, Math.min(1, (Number(rms) - 1.5) / 18))
  VOICE_WAVE_FACTORS.forEach((factor, index) => {
    const height = Math.round(4 + factor * 3 + normalized * (6 + factor * 20))
    root.style.setProperty(`--moni-wave-h${index + 1}`, `${Math.max(5, Math.min(33, height))}px`)
  })
  root.style.setProperty('--moni-voice-level', normalized.toFixed(3))
}

function isBoundedReadQuestion(value: unknown) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  const mutationObject = /(생산계획|작업지시|작업지시서|생산완료|생산확정|원재료\s*차감)/
  const mutationAction = /(등록|생성|만들|추가|수정|변경|취소|삭제|완료\s*(?:처리|입력|해|시켜)|확정\s*(?:처리|해|시켜)|차감\s*(?:처리|해|시켜)|실행|진행)/
  if (mutationObject.test(normalized) && mutationAction.test(normalized)) return false

  if (/\bLOT\d{8}-\d+\b/i.test(normalized)) return true

  const hasMonth = /(?:(?:20\d{2})\s*년\s*)?(?:1[0-2]|0?[1-9])\s*월|지난\s*달|전월|이번\s*달|이번\s*월|금월|현재\s*월/.test(normalized)
  const hasProduction = /(생산|작업지시|생산계획|생산실적)/.test(normalized)
  const hasAnalysisIntent = /(분석|종합|요약|평가|현황|상황|예측|보고|비교|차이|대비)/.test(normalized)
  return hasMonth && hasProduction && hasAnalysisIntent
}

function agentRuntimeQuestion(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'POST') return ''

  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  let pathname = rawUrl
  try { pathname = new URL(rawUrl, window.location.href).pathname } catch { /* compare raw path */ }
  if (pathname !== '/api/moni/agent-runtime') return ''

  if (typeof init?.body !== 'string') return ''
  try {
    const parsed = JSON.parse(init.body) as { message?: unknown }
    return String(parsed.message ?? '')
  } catch {
    return ''
  }
}

function timeoutRecoveryResponse(message?: string) {
  const error = message && /^MONI_TIMEOUT:/.test(message)
    ? message.replace(/^MONI_TIMEOUT:\s*/, '')
    : 'MONI 응답 시간이 길어 자동으로 중단했습니다. 질문은 입력창에 복구했으니 한 번만 다시 보내 주세요.'
  return new Response(JSON.stringify({ ok: false, code: 'MONI_BUSY', error }), {
    status: 409,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default function MoniMobileRuntimeGuard() {
  useLayoutEffect(() => {
    // Never let a stale local cache render internal PMO/system context as chat.
    // The server/database also classify these rows as system-only; this is the
    // last client-side defense for old Android browser caches.
    scrubLeakedInternalContextCache()

    const originalFetch = window.fetch.bind(window)
    const originalSetTimeout = window.setTimeout.bind(window)
    const originalClearTimeout = window.clearTimeout.bind(window)

    // The server already cancels bounded read-only agent runs at 45 seconds.
    // This client watchdog is deliberately slower and only covers the same
    // read-only monthly/LOT paths. It never times out prepare/execute writes.
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const question = agentRuntimeQuestion(input, init)
      if (!isBoundedReadQuestion(question)) return originalFetch(input, init)

      const controller = new AbortController()
      let watchdogFired = false
      const upstreamSignal = init?.signal
      const relayAbort = () => controller.abort()
      if (upstreamSignal) {
        if (upstreamSignal.aborted) controller.abort()
        else upstreamSignal.addEventListener('abort', relayAbort, { once: true })
      }

      const watchdog = originalSetTimeout(() => {
        watchdogFired = true
        controller.abort()
      }, BOUNDED_READ_CLIENT_TIMEOUT_MS)

      try {
        const response = await originalFetch(input, { ...init, signal: controller.signal })
        if (response.status >= 500) {
          try {
            const payload = await response.clone().json() as { error?: unknown }
            const error = String(payload.error ?? '')
            if (/^MONI_TIMEOUT:/.test(error)) return timeoutRecoveryResponse(error)
          } catch { /* keep original response */ }
        }
        return response
      } catch (error) {
        if (watchdogFired) return timeoutRecoveryResponse()
        throw error
      } finally {
        originalClearTimeout(watchdog)
        upstreamSignal?.removeEventListener('abort', relayAbort)
      }
    }) as typeof window.fetch

    // The active mobile conversation is intentionally preserved across reloads,
    // app switching and browser process recreation. Only the explicit `새 대화`
    // action clears the thread key and visible message cache.
    const speechWindow = window as SpeechWindow
    const OriginalSpeechRecognition = speechWindow.SpeechRecognition
    const OriginalWebkitSpeechRecognition = speechWindow.webkitSpeechRecognition

    // Android Chrome's native SpeechRecognition ends a recognition session
    // after silence. Restarting that session causes the audible system chime
    // and cumulative-result duplication. For MONI mobile we instead keep one
    // MediaRecorder microphone session open until the user explicitly presses
    // 확인, then transcribe the single captured recording once on the server.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return () => {
        window.fetch = originalFetch as typeof window.fetch
      }
    }

    let transcriptionPending = false

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
        updateVoiceWaveFromRms(0)
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
            updateVoiceWaveFromRms(rms)
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
        updateVoiceWaveFromRms(0)
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
      updateVoiceWaveFromRms(0)
      window.fetch = originalFetch as typeof window.fetch
      speechWindow.SpeechRecognition = OriginalSpeechRecognition
      speechWindow.webkitSpeechRecognition = OriginalWebkitSpeechRecognition
      window.setTimeout = originalSetTimeout as typeof window.setTimeout
    }
  }, [])

  return null
}
