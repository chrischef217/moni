'use client'

import { useLayoutEffect } from 'react'

type ThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

type HeartbeatDetail = {
  stage: ThinkingStage
  delayMs: number
  overtime: boolean
}

const HEARTBEAT_EVENT = 'moni:heartbeat'
const HEARTBEAT_LEAD_MS = 260
const STAGE_DELAY_MS: Record<ThinkingStage, number> = {
  normal: 1320,
  grace: 1040,
  'detail-1': 820,
  'detail-2': 640,
  apology: 500,
}

function currentStage(root: HTMLElement): ThinkingStage {
  const value = String(root.dataset.moniThinkingStage || 'normal')
  if (value === 'grace' || value === 'detail-1' || value === 'detail-2' || value === 'apology') return value
  return 'normal'
}

export default function MoniMobileHeartbeatBoost() {
  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return
    const chatRoot = root

    let context: AudioContext | null = null
    let compressor: DynamicsCompressorNode | null = null
    let master: GainNode | null = null
    let timer: number | null = null
    let active = false

    async function ensureGraph() {
      try {
        const audioWindow = window as AudioWindow
        const AudioContextClass = window.AudioContext || audioWindow.webkitAudioContext
        if (!AudioContextClass) return null
        if (!context) {
          context = new AudioContextClass()
          compressor = context.createDynamicsCompressor()
          compressor.threshold.value = -14
          compressor.knee.value = 24
          compressor.ratio.value = 2.4
          compressor.attack.value = 0.006
          compressor.release.value = 0.2

          master = context.createGain()
          master.gain.value = 0.72
          compressor.connect(master)
          master.connect(context.destination)
        }
        if (context.state !== 'running') await context.resume()
        return context.state === 'running' ? context : null
      } catch {
        return null
      }
    }

    function emitHeartbeat(stage: ThinkingStage) {
      const delayMs = STAGE_DELAY_MS[stage]
      const detail: HeartbeatDetail = { stage, delayMs, overtime: stage !== 'normal' }
      chatRoot.style.setProperty('--moni-heartbeat-ms', `${delayMs}ms`)
      chatRoot.dataset.moniHeartbeatStage = stage
      chatRoot.dataset.moniHeartbeatOvertime = detail.overtime ? 'true' : 'false'
      window.dispatchEvent(new CustomEvent<HeartbeatDetail>(HEARTBEAT_EVENT, { detail }))
    }

    async function playCuteHeartbeat() {
      const stage = currentStage(chatRoot)
      emitHeartbeat(stage)

      const audio = await ensureGraph()
      if (!audio || !compressor || !active) return

      const stageIndex = stage === 'normal' ? 0 : stage === 'grace' ? 1 : stage === 'detail-1' ? 2 : stage === 'detail-2' ? 3 : 4
      const pitchScale = 1 + stageIndex * 0.012
      const baseTime = audio.currentTime + 0.008
      const pulses = [
        { at: 0, duration: 0.105, from: 188, to: 148, peak: 0.17 },
        { at: 0.17, duration: 0.09, from: 210, to: 166, peak: 0.125 },
      ]

      for (const pulse of pulses) {
        const startedAt = baseTime + pulse.at
        const endedAt = startedAt + pulse.duration

        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const filter = audio.createBiquadFilter()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(pulse.from * pitchScale, startedAt)
        oscillator.frequency.exponentialRampToValueAtTime(pulse.to * pitchScale, endedAt)
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(720, startedAt)
        filter.Q.setValueAtTime(0.5, startedAt)
        gain.gain.setValueAtTime(0.0001, startedAt)
        gain.gain.exponentialRampToValueAtTime(pulse.peak, startedAt + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, endedAt)
        oscillator.connect(filter)
        filter.connect(gain)
        gain.connect(compressor)
        oscillator.start(startedAt)
        oscillator.stop(endedAt + 0.01)

        // A tiny second harmonic keeps the sound warm and friendly without clipping.
        const harmonic = audio.createOscillator()
        const harmonicGain = audio.createGain()
        harmonic.type = 'sine'
        harmonic.frequency.setValueAtTime(pulse.from * pitchScale * 2, startedAt)
        harmonic.frequency.exponentialRampToValueAtTime(pulse.to * pitchScale * 2, endedAt)
        harmonicGain.gain.setValueAtTime(0.0001, startedAt)
        harmonicGain.gain.exponentialRampToValueAtTime(pulse.peak * 0.12, startedAt + 0.024)
        harmonicGain.gain.exponentialRampToValueAtTime(0.0001, endedAt)
        harmonic.connect(harmonicGain)
        harmonicGain.connect(compressor)
        harmonic.start(startedAt)
        harmonic.stop(endedAt + 0.01)
      }
    }

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    function schedule(delay: number) {
      clearTimer()
      timer = window.setTimeout(() => {
        timer = null
        if (!active) return
        const stage = currentStage(chatRoot)
        void playCuteHeartbeat()
        schedule(STAGE_DELAY_MS[stage])
      }, delay)
    }

    function sync() {
      const thinking = Boolean(chatRoot.querySelector('.moni-live-state-thinking'))
      if (thinking && !active) {
        active = true
        const stage = currentStage(chatRoot)
        emitHeartbeat(stage)
        schedule(HEARTBEAT_LEAD_MS)
      } else if (!thinking && active) {
        active = false
        clearTimer()
        delete chatRoot.dataset.moniHeartbeatStage
        delete chatRoot.dataset.moniHeartbeatOvertime
        chatRoot.style.removeProperty('--moni-heartbeat-ms')
      } else if (thinking && active) {
        const stage = currentStage(chatRoot)
        const previousStage = String(chatRoot.dataset.moniHeartbeatStage || '')
        if (previousStage !== stage) {
          emitHeartbeat(stage)
          schedule(Math.min(180, STAGE_DELAY_MS[stage]))
        }
      }
    }

    const primeAudio = () => { void ensureGraph() }
    chatRoot.addEventListener('pointerdown', primeAudio, true)
    chatRoot.addEventListener('keydown', primeAudio, true)

    const observer = new MutationObserver(sync)
    observer.observe(chatRoot, {
      attributes: true,
      attributeFilter: ['class', 'data-moni-thinking-stage'],
      childList: true,
      subtree: true,
    })
    sync()

    return () => {
      observer.disconnect()
      active = false
      clearTimer()
      chatRoot.removeEventListener('pointerdown', primeAudio, true)
      chatRoot.removeEventListener('keydown', primeAudio, true)
      if (context) void context.close().catch(() => undefined)
    }
  }, [])

  return null
}
