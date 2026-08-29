'use client'

import { useLayoutEffect } from 'react'

const VOICE_TARGET_SELECTOR = '[aria-label="음성 인식 상태"]'
const CHAT_FALLBACK_TIMEOUT_MS = 900
const NON_VOICE_BYPASS_TIMEOUT_MS = 901

type RecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: any) => void) | null
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
}

function releaseInteractionSurface(root: HTMLElement) {
  root.removeAttribute('inert')
  if (root.style.pointerEvents === 'none') root.style.removeProperty('pointer-events')

  const composer = root.querySelector<HTMLElement>('[data-moni-mobile-composer]')
  if (composer) {
    composer.removeAttribute('inert')
    if (composer.style.pointerEvents === 'none') composer.style.removeProperty('pointer-events')
  }

  root.querySelectorAll<HTMLElement>('button, textarea, input, a').forEach((element) => {
    if (element.style.pointerEvents === 'none') element.style.removeProperty('pointer-events')
  })

  if (document.body.style.pointerEvents === 'none') document.body.style.removeProperty('pointer-events')
  if (document.documentElement.style.pointerEvents === 'none') document.documentElement.style.removeProperty('pointer-events')

  // If an invisible full-screen layer outside the MONI root is intercepting taps,
  // release only that transparent/non-dialog layer. Legitimate dialogs remain protected.
  const releaseBlockerAt = (target: Element | null) => {
    if (!(target instanceof HTMLElement)) return
    const rect = target.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    if (!top || root.contains(top)) return

    let candidate = top instanceof HTMLElement ? top : top.parentElement
    while (candidate && candidate !== document.body) {
      if (candidate.matches('[role="dialog"], [aria-modal="true"]') || candidate.querySelector('[role="dialog"], [aria-modal="true"]')) return
      const style = window.getComputedStyle(candidate)
      const box = candidate.getBoundingClientRect()
      const coversViewport = box.width >= window.innerWidth * 0.85 && box.height >= window.innerHeight * 0.85
      if (style.position === 'fixed' && coversViewport && style.pointerEvents !== 'none') {
        candidate.dataset.moniVoiceReleasedBlocker = 'true'
        candidate.style.pointerEvents = 'none'
        return
      }
      candidate = candidate.parentElement
    }
  }

  releaseBlockerAt(root.querySelector('button[aria-label="전송"]'))
  releaseBlockerAt(root.querySelector('.moni-new-chat-button'))
  root.dataset.moniVoiceInteractionReady = 'true'
}

export default function MoniMobileVoiceTouchGuard() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let disposed = false
    let cleanupInstalled: (() => void) | null = null

    // Defer one microtask so MoniMobileRuntimeGuard has already installed its
    // MediaRecorder-backed SpeechRecognition and legacy 900ms compatibility shim.
    queueMicrotask(() => {
      if (disposed) return

      const speechWindow = window as SpeechWindow
      const BaseRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
      const priorSpeechRecognition = speechWindow.SpeechRecognition
      const priorWebkitSpeechRecognition = speechWindow.webkitSpeechRecognition
      const priorSetTimeout = window.setTimeout.bind(window)
      const priorClearTimeout = window.clearTimeout.bind(window)

      let expectVoiceFallback = false
      let expectationResetTimer: number | null = null
      let voiceWasActive = Boolean(root.querySelector(VOICE_TARGET_SELECTOR))
      let releaseTimer: number | null = null

      // RuntimeGuard historically stretches every 900ms timeout to 30 seconds
      // while transcription is pending. That can accidentally stall unrelated
      // mobile UI release timers. Only the synchronous 900ms timer immediately
      // following recognition.stop() is the voice fallback; all other 900ms
      // timers bypass the legacy matcher with an imperceptible 1ms offset.
      const guardedSetTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        const requested = Number(timeout)
        if (requested === CHAT_FALLBACK_TIMEOUT_MS) {
          if (expectVoiceFallback) {
            expectVoiceFallback = false
            if (expectationResetTimer !== null) {
              priorClearTimeout(expectationResetTimer)
              expectationResetTimer = null
            }
            return priorSetTimeout(handler, CHAT_FALLBACK_TIMEOUT_MS, ...args)
          }
          return priorSetTimeout(handler, NON_VOICE_BYPASS_TIMEOUT_MS, ...args)
        }
        return priorSetTimeout(handler, timeout, ...args)
      }) as typeof window.setTimeout

      window.setTimeout = guardedSetTimeout

      let GuardedRecognition: RecognitionConstructor | null = null
      if (BaseRecognition) {
        const RecognitionClass: RecognitionConstructor = BaseRecognition

        class VoiceRecognitionGuard implements RecognitionLike {
          private inner: RecognitionLike

          constructor() {
            this.inner = new RecognitionClass()
          }

          get continuous() { return this.inner.continuous }
          set continuous(value: boolean) { this.inner.continuous = value }
          get interimResults() { return this.inner.interimResults }
          set interimResults(value: boolean) { this.inner.interimResults = value }
          get lang() { return this.inner.lang }
          set lang(value: string) { this.inner.lang = value }

          get onresult() { return this.inner.onresult }
          set onresult(value: ((event: any) => void) | null) { this.inner.onresult = value }
          get onerror() { return this.inner.onerror }
          set onerror(value: ((event: { error?: string }) => void) | null) { this.inner.onerror = value }
          get onend() { return this.inner.onend }
          set onend(value: (() => void) | null) { this.inner.onend = value }
          get onstart() { return this.inner.onstart }
          set onstart(value: (() => void) | null | undefined) { this.inner.onstart = value }
          get onspeechstart() { return this.inner.onspeechstart }
          set onspeechstart(value: (() => void) | null | undefined) { this.inner.onspeechstart = value }
          get onspeechend() { return this.inner.onspeechend }
          set onspeechend(value: (() => void) | null | undefined) { this.inner.onspeechend = value }

          start() {
            root.dataset.moniVoiceInteractionReady = 'false'
            this.inner.start()
          }

          stop() {
            expectVoiceFallback = true
            if (expectationResetTimer !== null) priorClearTimeout(expectationResetTimer)
            // If the caller does not schedule the expected fallback synchronously,
            // clear the flag on the next task so later timers cannot inherit it.
            expectationResetTimer = priorSetTimeout(() => {
              expectVoiceFallback = false
              expectationResetTimer = null
            }, 0)
            try {
              this.inner.stop()
            } catch (error) {
              expectVoiceFallback = false
              if (expectationResetTimer !== null) {
                priorClearTimeout(expectationResetTimer)
                expectationResetTimer = null
              }
              throw error
            }
          }

          abort() {
            expectVoiceFallback = false
            if (expectationResetTimer !== null) {
              priorClearTimeout(expectationResetTimer)
              expectationResetTimer = null
            }
            this.inner.abort()
          }
        }

        GuardedRecognition = VoiceRecognitionGuard
        speechWindow.SpeechRecognition = GuardedRecognition
        speechWindow.webkitSpeechRecognition = GuardedRecognition
      }

      const scheduleRelease = () => {
        window.requestAnimationFrame(() => releaseInteractionSurface(root))
        if (releaseTimer !== null) priorClearTimeout(releaseTimer)
        releaseTimer = priorSetTimeout(() => {
          releaseTimer = null
          releaseInteractionSurface(root)
        }, 180)
      }

      const syncVoiceState = () => {
        const voiceActive = Boolean(root.querySelector(VOICE_TARGET_SELECTOR))
        if (voiceWasActive && !voiceActive) scheduleRelease()
        voiceWasActive = voiceActive
      }

      const observer = new MutationObserver(syncVoiceState)
      observer.observe(root, { childList: true, subtree: true })
      syncVoiceState()

      cleanupInstalled = () => {
        observer.disconnect()
        if (releaseTimer !== null) priorClearTimeout(releaseTimer)
        if (expectationResetTimer !== null) priorClearTimeout(expectationResetTimer)
        if (window.setTimeout === guardedSetTimeout) window.setTimeout = priorSetTimeout as typeof window.setTimeout
        if (GuardedRecognition && speechWindow.SpeechRecognition === GuardedRecognition) speechWindow.SpeechRecognition = priorSpeechRecognition
        if (GuardedRecognition && speechWindow.webkitSpeechRecognition === GuardedRecognition) speechWindow.webkitSpeechRecognition = priorWebkitSpeechRecognition
      }
    })

    return () => {
      disposed = true
      cleanupInstalled?.()
    }
  }, [])

  return null
}
