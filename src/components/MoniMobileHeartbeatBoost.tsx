'use client'

import { useLayoutEffect } from 'react'

type ThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext }

const BOOST_MULTIPLIER = 10
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
          compressor.threshold.value = -28
          compressor.knee.value = 18
          compressor.ratio.value = 7
          compressor.attack.value = 0.002
          compressor.release.value = 0.16

          master = context.createGain()
          master.gain.value = 0.96
          compressor.connect(master)
          master.connect(context.destination)
        }
        if (context.state !== 'running') await context.resume()
        return context.state === 'running' ? context : null
      } catch {
        return null
      }
    }

    async function playBoostedHeartbeat() {
      const audio = await ensureGraph()
      if (!audio || !compressor || !active) return

      const stage = currentStage(chatRoot)
      const stageIndex = stage === 'normal' ? 0 : stage === 'grace' ? 1 : stage === 'detail-1' ? 2 : stage === 'detail-2' ? 3 : 4
      const pitchScale = 1 + stageIndex * 0.028
      const baseTime = audio.currentTime + 0.006
      const pulses = [
        { at: 0, duration: 0.15, from: 265, to: 205, peak: 0.24 },
        { at: 0.185, duration: 0.135, from: 235, to: 182, peak: 0.19 },
      ]

      for (const pulse of pulses) {
        const boost = audio.createGain()
        boost.gain.setValueAtTime(BOOST_MULTIPLIER, baseTime + pulse.at)
        boost.connect(compressor)

        const layers = [
          { ratio: 1, type: 'triangle' as OscillatorType, level: 1 },
          { ratio: 1.82, type: 'sine' as OscillatorType, level: 0.42 },
          { ratio: 2.65, type: 'sine' as OscillatorType, level: 0.2 },
        ]

        for (const layer of layers) {
          const oscillator = audio.createOscillator()
          const gain = audio.createGain()
          const filter = audio.createBiquadFilter()
          const startedAt = baseTime + pulse.at
          const endedAt = startedAt + pulse.duration

          oscillator.type = layer.type
          oscillator.frequency.setValueAtTime(pulse.from * pitchScale * layer.ratio, startedAt)
          oscillator.frequency.exponentialRampToValueAtTime(pulse.to * pitchScale * layer.ratio, endedAt)

          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(1700 + stageIndex * 80, startedAt)
          filter.Q.setValueAtTime(0.72, startedAt)

          gain.gain.setValueAtTime(0.0001, startedAt)
          gain.gain.exponentialRampToValueAtTime(Math.max(0.001, pulse.peak * layer.level), startedAt + 0.014)
          gain.gain.exponentialRampToValueAtTime(0.0001, endedAt)

          oscillator.connect(filter)
          filter.connect(gain)
          gain.connect(boost)
          oscillator.start(startedAt)
          oscillator.stop(endedAt + 0.01)
        }
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
        void playBoostedHeartbeat()
        schedule(STAGE_DELAY_MS[currentStage(chatRoot)])
      }, delay)
    }

    function sync() {
      const thinking = Boolean(chatRoot.querySelector('.moni-live-state-thinking'))
      if (thinking && !active) {
        active = true
        schedule(120)
      } else if (!thinking && active) {
        active = false
        clearTimer()
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
