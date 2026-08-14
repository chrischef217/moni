'use client'

import { useLayoutEffect } from 'react'

const THREAD_KEY = 'moni-global-agent-thread-v11'

type NativeAlternative = { transcript: string }
type NativeResult = {
  isFinal: boolean
  length: number
  [index: number]: NativeAlternative
}
type NativeEvent = {
  resultIndex: number
  results: {
    length: number
    [index: number]: NativeResult
  }
}
type NativeRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: NativeEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  onstart?: (() => void) | null
  onspeechstart?: (() => void) | null
  onspeechend?: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type NativeRecognitionConstructor = new () => NativeRecognition

type SpeechWindow = Window & {
  SpeechRecognition?: NativeRecognitionConstructor
  webkitSpeechRecognition?: NativeRecognitionConstructor
}

function normalize(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function combineText(left: string, right: string) {
  const a = normalize(left)
  const b = normalize(right)
  if (!a) return b
  if (!b) return a
  if (a === b || a.endsWith(b)) return a
  if (b.startsWith(a)) return b
  return `${a} ${b}`.trim()
}

function syntheticFinalResult(transcript: string): NativeResult {
  return {
    0: { transcript },
    isFinal: true,
    length: 1,
  }
}

export default function MoniMobileRuntimeGuard() {
  useLayoutEffect(() => {
    // Fresh entry to /mobile starts a new visible chat. A plain reload keeps the
    // active thread so an accidental refresh does not erase the current work.
    try {
      const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      const legacyPerformance = window.performance as Performance & { navigation?: { type?: number } }
      const isReload = navigation?.type === 'reload' || legacyPerformance.navigation?.type === 1
      if (!isReload) window.localStorage.removeItem(THREAD_KEY)
    } catch {
      // Storage/navigation metadata must never block the chat UI.
    }

    const speechWindow = window as SpeechWindow
    const OriginalSpeechRecognition = speechWindow.SpeechRecognition
    const OriginalWebkitSpeechRecognition = speechWindow.webkitSpeechRecognition
    const Native = OriginalSpeechRecognition || OriginalWebkitSpeechRecognition
    if (!Native) return
    const NativeRecognitionClass: NativeRecognitionConstructor = Native

    class StickySpeechRecognition implements NativeRecognition {
      private inner: NativeRecognition
      private keepAlive = false
      private manualStop = false
      private restartTimer: number | null = null
      private persistedText = ''
      private latestSessionText = ''
      private _continuous = false
      private _interimResults = false
      private _lang = 'ko-KR'

      onresult: ((event: NativeEvent) => void) | null = null
      onerror: ((event: { error?: string }) => void) | null = null
      onend: (() => void) | null = null
      onstart: (() => void) | null = null
      onspeechstart: (() => void) | null = null
      onspeechend: (() => void) | null = null

      constructor() {
        this.inner = new NativeRecognitionClass()
        this.inner.onstart = () => this.onstart?.()
        this.inner.onspeechstart = () => this.onspeechstart?.()
        this.inner.onspeechend = () => this.onspeechend?.()
        this.inner.onresult = (event) => {
          const sessionParts: string[] = []
          for (let index = 0; index < event.results.length; index += 1) {
            const transcript = normalize(event.results[index]?.[0]?.transcript || '')
            if (transcript) sessionParts.push(transcript)
          }
          this.latestSessionText = normalize(sessionParts.join(' '))

          const prior = normalize(this.persistedText)
          if (!prior) {
            this.onresult?.(event)
            return
          }

          const results: Record<number, NativeResult> & { length: number } = { length: event.results.length + 1 }
          results[0] = syntheticFinalResult(prior)
          for (let index = 0; index < event.results.length; index += 1) {
            results[index + 1] = event.results[index]
          }
          this.onresult?.({ resultIndex: 0, results })
        }
        this.inner.onerror = (event) => {
          const code = String(event.error || '')
          if (code === 'no-speech' && this.keepAlive && !this.manualStop) {
            return
          }
          if (code !== 'aborted') this.keepAlive = false
          this.onerror?.(event)
        }
        this.inner.onend = () => {
          if (this.manualStop || !this.keepAlive || !this._continuous) {
            this.onend?.()
            return
          }

          this.persistedText = combineText(this.persistedText, this.latestSessionText)
          this.latestSessionText = ''
          this.restartTimer = window.setTimeout(() => {
            this.restartTimer = null
            if (!this.keepAlive || this.manualStop) return
            try {
              this.syncSettings()
              this.inner.start()
            } catch {
              // Android Chrome may still be closing the prior recognition
              // session for a moment. Retry once rather than finalizing early.
              this.restartTimer = window.setTimeout(() => {
                this.restartTimer = null
                if (!this.keepAlive || this.manualStop) return
                try {
                  this.syncSettings()
                  this.inner.start()
                } catch {
                  this.keepAlive = false
                  this.onerror?.({ error: 'restart-failed' })
                  this.onend?.()
                }
              }, 320)
            }
          }, 180)
        }
      }

      private syncSettings() {
        this.inner.continuous = this._continuous
        this.inner.interimResults = this._interimResults
        this.inner.lang = this._lang
      }

      get continuous() { return this._continuous }
      set continuous(value: boolean) {
        this._continuous = Boolean(value)
        this.inner.continuous = this._continuous
      }

      get interimResults() { return this._interimResults }
      set interimResults(value: boolean) {
        this._interimResults = Boolean(value)
        this.inner.interimResults = this._interimResults
      }

      get lang() { return this._lang }
      set lang(value: string) {
        this._lang = String(value || 'ko-KR')
        this.inner.lang = this._lang
      }

      start() {
        this.keepAlive = true
        this.manualStop = false
        this.persistedText = ''
        this.latestSessionText = ''
        this.syncSettings()
        this.inner.start()
      }

      stop() {
        this.keepAlive = false
        this.manualStop = true
        if (this.restartTimer !== null) {
          window.clearTimeout(this.restartTimer)
          this.restartTimer = null
        }
        this.inner.stop()
      }

      abort() {
        this.keepAlive = false
        this.manualStop = true
        if (this.restartTimer !== null) {
          window.clearTimeout(this.restartTimer)
          this.restartTimer = null
        }
        this.inner.abort()
      }
    }

    speechWindow.SpeechRecognition = StickySpeechRecognition as unknown as NativeRecognitionConstructor
    speechWindow.webkitSpeechRecognition = StickySpeechRecognition as unknown as NativeRecognitionConstructor

    return () => {
      speechWindow.SpeechRecognition = OriginalSpeechRecognition
      speechWindow.webkitSpeechRecognition = OriginalWebkitSpeechRecognition
    }
  }, [])

  return null
}
