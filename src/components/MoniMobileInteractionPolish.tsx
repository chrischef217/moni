'use client'

import { useLayoutEffect } from 'react'

const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'
const LEGACY_DEMO_PATTERN = /핸드워시\s*레몬/i
const THINKING_SELECTOR = '.moni-live-state-thinking'
const HEARTBEAT_INTERVAL_MS = 1320
const HEARTBEAT_LEAD_MS = 260

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

type CachedMessage = {
  role?: unknown
  content?: unknown
  [key: string]: unknown
}

function stripLegacyDemoLine(value: unknown) {
  const content = String(value ?? '')
  if (!LEGACY_DEMO_PATTERN.test(content)) return content
  return content
    .split('\n')
    .filter((line) => !LEGACY_DEMO_PATTERN.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function scrubLegacyDemoCache() {
  try {
    const raw = window.localStorage.getItem(MESSAGE_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return

    let changed = false
    const cleaned = parsed.map((item: CachedMessage) => {
      if (!item || typeof item !== 'object') return item
      const nextContent = stripLegacyDemoLine(item.content)
      if (nextContent === String(item.content ?? '')) return item
      changed = true
      return { ...item, content: nextContent }
    }).filter((item: CachedMessage) => String(item?.content ?? '').trim())

    if (changed) window.localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(cleaned))
  } catch {
    // Cache cleanup is best-effort and must never block MONI rendering.
  }
}

export default function MoniMobileInteractionPolish() {
  useLayoutEffect(() => {
    scrubLegacyDemoCache()

    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let heartbeatContext: AudioContext | null = null
    let heartbeatInterval: number | null = null
    let heartbeatLeadTimer: number | null = null
    let heartbeatRunning = false

    async function ensureAudioContext() {
      try {
        const audioWindow = window as AudioWindow
        const AudioContextClass = window.AudioContext || audioWindow.webkitAudioContext
        if (!AudioContextClass) return null
        const context = heartbeatContext || new AudioContextClass()
        heartbeatContext = context
        if (context.state !== 'running') await context.resume()
        return context.state === 'running' ? context : null
      } catch {
        return null
      }
    }

    async function playHeartbeat() {
      const context = await ensureAudioContext()
      if (!context || !heartbeatRunning) return

      try {
        const baseTime = context.currentTime + 0.008
        const pulses = [
          { at: 0, from: 225, to: 176, duration: 0.145, peak: 0.19 },
          { at: 0.19, from: 205, to: 158, duration: 0.13, peak: 0.145 },
        ]

        pulses.forEach((pulse) => {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          const filter = context.createBiquadFilter()
          const startedAt = baseTime + pulse.at
          const endedAt = startedAt + pulse.duration

          oscillator.type = 'triangle'
          oscillator.frequency.setValueAtTime(pulse.from, startedAt)
          oscillator.frequency.exponentialRampToValueAtTime(pulse.to, endedAt)

          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(980, startedAt)
          filter.Q.setValueAtTime(0.7, startedAt)

          gain.gain.setValueAtTime(0.0001, startedAt)
          gain.gain.exponentialRampToValueAtTime(pulse.peak, startedAt + 0.018)
          gain.gain.exponentialRampToValueAtTime(0.0001, endedAt)

          oscillator.connect(filter)
          filter.connect(gain)
          gain.connect(context.destination)
          oscillator.start(startedAt)
          oscillator.stop(endedAt + 0.01)
        })
      } catch {
        // Thinking heartbeat is optional feedback and must never block MONI.
      }
    }

    function stopHeartbeat() {
      heartbeatRunning = false
      if (heartbeatLeadTimer !== null) {
        window.clearTimeout(heartbeatLeadTimer)
        heartbeatLeadTimer = null
      }
      if (heartbeatInterval !== null) {
        window.clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }
    }

    function startHeartbeat() {
      if (heartbeatRunning) return
      heartbeatRunning = true
      heartbeatLeadTimer = window.setTimeout(() => {
        heartbeatLeadTimer = null
        if (!heartbeatRunning) return
        void playHeartbeat()
        heartbeatInterval = window.setInterval(() => {
          if (heartbeatRunning) void playHeartbeat()
        }, HEARTBEAT_INTERVAL_MS)
      }, HEARTBEAT_LEAD_MS)
    }

    function syncThinkingState() {
      if (root.querySelector(THINKING_SELECTOR)) startHeartbeat()
      else stopHeartbeat()
    }

    const primeAudio = () => {
      void ensureAudioContext()
    }

    root.addEventListener('pointerdown', primeAudio, true)
    root.addEventListener('keydown', primeAudio, true)

    const observer = new MutationObserver(syncThinkingState)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    })
    syncThinkingState()

    return () => {
      observer.disconnect()
      stopHeartbeat()
      root.removeEventListener('pointerdown', primeAudio, true)
      root.removeEventListener('keydown', primeAudio, true)
      if (heartbeatContext) void heartbeatContext.close().catch(() => undefined)
    }
  }, [])

  return (
    <style jsx global>{`
      [data-moni-mobile-chat] {
        overscroll-behavior: none;
      }

      [data-moni-mobile-chat] header {
        position: sticky !important;
        top: 0 !important;
        z-index: 180 !important;
        flex: 0 0 auto !important;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        will-change: transform;
        background: rgba(255, 255, 255, .985) !important;
        box-shadow: 0 1px 0 rgba(120, 153, 166, .10);
      }

      [data-moni-mobile-chat] header + div {
        overscroll-behavior-y: contain;
        overscroll-behavior-x: none;
        overflow-x: hidden;
      }

      [data-moni-mobile-chat] button[aria-label="전송"] {
        border: 1px solid #cbd8dd !important;
        background: #dce6ea !important;
        color: #173b52 !important;
        box-shadow: 0 3px 10px rgba(23, 59, 82, .08) !important;
      }

      [data-moni-mobile-chat] button[aria-label="전송"]:disabled {
        border-color: #dce3e5 !important;
        background: #e8ecee !important;
        color: #a6b0b5 !important;
        box-shadow: none !important;
        opacity: 1 !important;
      }
    `}</style>
  )
}
