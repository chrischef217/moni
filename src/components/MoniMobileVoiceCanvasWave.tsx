'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const VOICE_TARGET_SELECTOR = '[aria-label="음성 인식 상태"]'
const HISTORY_SAMPLES = 144
const SAMPLE_INTERVAL_MS = 58
const SILENCE_THRESHOLD = 0.055
const ACTIVE_EPSILON = 0.012
const MAX_DEVICE_PIXEL_RATIO = 2

function readVoiceLevel(root: HTMLElement) {
  const raw = Number.parseFloat(getComputedStyle(root).getPropertyValue('--moni-voice-level'))
  if (!Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(1, raw))
}

function carrierForSample(sampleIndex: number) {
  const carrier =
    Math.sin(sampleIndex * 1.57) * 0.62
    + Math.sin(sampleIndex * 2.91 + 0.8) * 0.27
    + Math.sin(sampleIndex * 0.73 + 2.1) * 0.19
  const magnitude = Math.min(1, Math.abs(carrier) / 1.08)
  const sign = carrier < 0 ? -1 : 1
  return sign * (0.5 + magnitude * 0.5)
}

function drawSmoothSegment(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
) {
  if (points.length < 2) return
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const midX = (current.x + next.x) / 2
    const midY = (current.y + next.y) / 2
    context.quadraticCurveTo(current.x, current.y, midX, midY)
  }
  const last = points[points.length - 1]
  context.lineTo(last.x, last.y)
}

function VoiceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!canvas || !root) return

    const history = Array.from({ length: HISTORY_SAMPLES }, () => 0)
    let envelope = 0
    let sampleIndex = 0
    let lastSampleAt = performance.now()
    let frame = 0

    const sampleVoice = () => {
      const level = readVoiceLevel(root)
      const target = level <= SILENCE_THRESHOLD
        ? 0
        : Math.pow(Math.min(1, (level - SILENCE_THRESHOLD) / (1 - SILENCE_THRESHOLD)), 0.68)

      if (target > envelope) envelope = envelope * 0.18 + target * 0.82
      else if (target === 0) envelope *= 0.26
      else envelope = envelope * 0.58 + target * 0.42
      if (envelope < 0.018) envelope = 0

      const signedSample = envelope === 0 ? 0 : envelope * carrierForSample(sampleIndex)
      history.shift()
      history.push(signedSample)
      sampleIndex += 1
      lastSampleAt = performance.now()
    }

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const ratio = Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1)
      const pixelWidth = Math.max(1, Math.round(width * ratio))
      const pixelHeight = Math.max(1, Math.round(height * ratio))
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }

      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      const centerY = height / 2
      const maxAmplitude = Math.max(12, height * 0.46)
      const fractionalShift = Math.max(0, Math.min(1, (now - lastSampleAt) / SAMPLE_INTERVAL_MS))
      const stepX = width / (HISTORY_SAMPLES - 1)

      const drawable = history.map((value, index) => ({
        value,
        x: (index - fractionalShift) * stepX,
        y: centerY + value * maxAmplitude,
      }))

      const segments: Array<Array<{ x: number; y: number }>> = []
      let segment: Array<{ x: number; y: number }> = []
      for (let index = 0; index < drawable.length; index += 1) {
        const point = drawable[index]
        const active = Math.abs(point.value) > ACTIVE_EPSILON
        const previousActive = index > 0 && Math.abs(drawable[index - 1].value) > ACTIVE_EPSILON
        const nextActive = index + 1 < drawable.length && Math.abs(drawable[index + 1].value) > ACTIVE_EPSILON
        if (active || previousActive || nextActive) {
          segment.push({ x: point.x, y: active ? point.y : centerY })
        } else if (segment.length) {
          segments.push(segment)
          segment = []
        }
      }
      if (segment.length) segments.push(segment)

      context.lineCap = 'round'
      context.lineJoin = 'round'
      for (const points of segments) {
        drawSmoothSegment(context, points)
        context.strokeStyle = 'rgba(82, 104, 113, 0.16)'
        context.lineWidth = 4.6
        context.stroke()

        drawSmoothSegment(context, points)
        context.strokeStyle = 'rgba(74, 96, 105, 0.92)'
        context.lineWidth = 1.55
        context.stroke()
      }

      frame = window.requestAnimationFrame(draw)
    }

    sampleVoice()
    const sampler = window.setInterval(sampleVoice, SAMPLE_INTERVAL_MS)
    frame = window.requestAnimationFrame(draw)

    return () => {
      window.clearInterval(sampler)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return <canvas ref={canvasRef} data-moni-voice-canvas aria-hidden="true" />
}

export default function MoniMobileVoiceCanvasWave() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    const syncTarget = () => {
      const next = root.querySelector<HTMLElement>(VOICE_TARGET_SELECTOR)
      setTarget((current) => current === next ? current : next)
    }

    syncTarget()
    const observer = new MutationObserver(syncTarget)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {target ? createPortal(<VoiceCanvas />, target) : null}
      <style jsx global>{`
        [data-moni-mobile-chat] div:has(> div > [aria-label="음성 인식 상태"]) {
          min-height: 76px !important;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] {
          height: 42px !important;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"]::before {
          content: none !important;
          display: none !important;
          background-image: none !important;
          animation: none !important;
          transform: none !important;
        }
        [data-moni-mobile-chat] [data-moni-voice-canvas] {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          pointer-events: none;
        }
      `}</style>
    </>
  )
}
