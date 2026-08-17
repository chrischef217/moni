'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const LIVE_WAVE_BAR_COUNT = 11
const HEARTBEAT_EVENT = 'moni:heartbeat'

type HeartbeatDetail = {
  stage?: string
  delayMs?: number
  overtime?: boolean
}

function LivingWaveMarkup() {
  return (
    <span data-moni-live-wave className="moni-live-wave" aria-hidden="true">
      {Array.from({ length: LIVE_WAVE_BAR_COUNT }, (_, index) => (
        <span key={index} className="moni-live-wave-bar" />
      ))}
    </span>
  )
}

export default function MoniMobileLiveWave() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let pulseTimer: number | null = null

    const syncTarget = () => {
      const next = root.querySelector<HTMLElement>('.moni-live-state')
      setTarget((current) => current === next ? current : next)
    }

    const pulseWave = (event: Event) => {
      const detail = (event as CustomEvent<HeartbeatDetail>).detail || {}
      const delayMs = Number(detail.delayMs)
      if (Number.isFinite(delayMs) && delayMs > 0) root.style.setProperty('--moni-heartbeat-ms', `${Math.round(delayMs)}ms`)
      root.dataset.moniHeartbeatOvertime = detail.overtime ? 'true' : 'false'

      const wave = root.querySelector<HTMLElement>('[data-moni-live-wave]')
      if (!wave) return
      wave.classList.remove('moni-heartbeat-hit')
      void wave.offsetWidth
      wave.classList.add('moni-heartbeat-hit')
      if (pulseTimer !== null) window.clearTimeout(pulseTimer)
      pulseTimer = window.setTimeout(() => {
        wave.classList.remove('moni-heartbeat-hit')
        pulseTimer = null
      }, 390)
    }

    syncTarget()
    const observer = new MutationObserver(syncTarget)
    observer.observe(root, { childList: true, subtree: true })
    window.addEventListener(HEARTBEAT_EVENT, pulseWave)

    return () => {
      observer.disconnect()
      window.removeEventListener(HEARTBEAT_EVENT, pulseWave)
      if (pulseTimer !== null) window.clearTimeout(pulseTimer)
    }
  }, [])

  return (
    <>
      {target ? createPortal(<LivingWaveMarkup />, target) : null}
      <style jsx global>{`
        [data-moni-mobile-chat] .moni-live-state {
          min-height: 18px;
          transition: color 180ms ease;
        }
        [data-moni-mobile-chat] .moni-live-wave {
          position: relative;
          display: inline-flex;
          width: 48px;
          height: 16px;
          margin-left: 4px;
          align-items: center;
          justify-content: center;
          gap: 1.6px;
          overflow: hidden;
          opacity: .92;
          filter: drop-shadow(0 0 4px currentColor);
        }
        [data-moni-mobile-chat] .moni-live-wave::after {
          content: '';
          position: absolute;
          inset: 3px -12px;
          background: radial-gradient(ellipse at center, currentColor 0%, transparent 66%);
          opacity: .12;
          animation: moniLivingGlow 2.8s ease-in-out infinite;
          pointer-events: none;
        }
        [data-moni-mobile-chat] .moni-live-wave-bar {
          position: relative;
          z-index: 1;
          width: 2px;
          height: 11px;
          flex: 0 0 2px;
          border-radius: 999px;
          background: currentColor;
          transform: scaleY(.32);
          transform-origin: center;
          animation: moniLivingWave 1.72s cubic-bezier(.42, 0, .24, 1) infinite;
          will-change: transform, opacity;
        }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(1) { animation-delay: -1.31s; opacity: .45; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(2) { animation-delay: -.96s; opacity: .62; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(3) { animation-delay: -1.47s; opacity: .76; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(4) { animation-delay: -.58s; opacity: .9; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(5) { animation-delay: -1.12s; opacity: 1; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(6) { animation-delay: -.31s; opacity: .92; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(7) { animation-delay: -1.55s; opacity: 1; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(8) { animation-delay: -.74s; opacity: .84; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(9) { animation-delay: -1.22s; opacity: .72; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(10) { animation-delay: -.43s; opacity: .58; }
        [data-moni-mobile-chat] .moni-live-wave-bar:nth-child(11) { animation-delay: -1.02s; opacity: .42; }

        /* THINKING no longer runs an unrelated decorative loop. Every pulse is restarted by the real heartbeat scheduler. */
        [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave-bar {
          animation: none;
          transform: scaleY(.3);
          opacity: .5;
        }
        [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave {
          opacity: 1;
          filter: drop-shadow(0 0 6px currentColor);
        }
        [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave.moni-heartbeat-hit {
          animation: moniHeartbeatWaveHit 360ms cubic-bezier(.2, .72, .25, 1) both;
        }
        [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave.moni-heartbeat-hit .moni-live-wave-bar {
          animation: moniHeartbeatBarHit 360ms cubic-bezier(.2, .72, .25, 1) both;
        }
        [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave.moni-heartbeat-hit .moni-live-wave-bar:nth-child(2n) { animation-delay: 22ms; }
        [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave.moni-heartbeat-hit .moni-live-wave-bar:nth-child(3n) { animation-delay: 42ms; }

        [data-moni-mobile-chat][data-moni-heartbeat-overtime="true"] .moni-live-state-thinking {
          color: #dc2626 !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-overtime="true"] .moni-live-state-thinking .moni-live-dot {
          background: #ef4444 !important;
          box-shadow: 0 0 0 4px rgba(239, 68, 68, .10);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-overtime="true"] .moni-live-state-thinking .moni-live-wave {
          filter: drop-shadow(0 0 7px rgba(239, 68, 68, .8));
        }
        [data-moni-mobile-chat][data-moni-heartbeat-overtime="true"] div[role="status"] .moni-thinking-dot {
          background: #ef4444 !important;
        }

        [data-moni-mobile-chat] .moni-live-state-listening .moni-live-wave-bar {
          animation-name: moniListeningWave;
          animation-duration: .68s;
        }
        [data-moni-mobile-chat] .moni-live-state-listening .moni-live-wave {
          opacity: 1;
          filter: drop-shadow(0 0 7px currentColor);
        }
        [data-moni-mobile-chat] .moni-live-state-issue .moni-live-wave-bar {
          animation-name: moniIssueWave;
          animation-duration: 2.35s;
        }
        [data-moni-mobile-chat] .moni-live-state-issue .moni-live-wave {
          opacity: .7;
          filter: drop-shadow(0 0 3px currentColor);
        }

        @keyframes moniLivingWave {
          0%, 100% { transform: scaleY(.24); opacity: .45; }
          16% { transform: scaleY(.58); opacity: .7; }
          37% { transform: scaleY(1); opacity: 1; }
          55% { transform: scaleY(.42); opacity: .62; }
          73% { transform: scaleY(.78); opacity: .88; }
          88% { transform: scaleY(.34); opacity: .52; }
        }
        @keyframes moniHeartbeatWaveHit {
          0% { transform: scaleX(.9); opacity: .78; }
          28% { transform: scaleX(1.08); opacity: 1; }
          62% { transform: scaleX(.98); opacity: .9; }
          100% { transform: scaleX(1); opacity: .92; }
        }
        @keyframes moniHeartbeatBarHit {
          0% { transform: scaleY(.3); opacity: .5; }
          24% { transform: scaleY(1.08); opacity: 1; }
          52% { transform: scaleY(.48); opacity: .72; }
          72% { transform: scaleY(.84); opacity: .96; }
          100% { transform: scaleY(.3); opacity: .5; }
        }
        @keyframes moniListeningWave {
          0%, 100% { transform: scaleY(calc(.32 + var(--moni-voice-level, 0) * .72)); opacity: .58; }
          28% { transform: scaleY(calc(.72 + var(--moni-voice-level, 0) * 1.1)); opacity: 1; }
          54% { transform: scaleY(calc(.42 + var(--moni-voice-level, 0) * .86)); opacity: .72; }
          78% { transform: scaleY(calc(.9 + var(--moni-voice-level, 0) * 1.2)); opacity: .96; }
        }
        @keyframes moniIssueWave {
          0%, 100% { transform: scaleY(.2); opacity: .38; }
          27% { transform: scaleY(.48); opacity: .6; }
          61% { transform: scaleY(.27); opacity: .42; }
          84% { transform: scaleY(.62); opacity: .68; }
        }
        @keyframes moniLivingGlow {
          0%, 100% { transform: scaleX(.68); opacity: .08; }
          50% { transform: scaleX(1.08); opacity: .18; }
        }

        @media (prefers-reduced-motion: reduce) {
          [data-moni-mobile-chat] .moni-live-wave-bar,
          [data-moni-mobile-chat] .moni-live-wave,
          [data-moni-mobile-chat] .moni-live-wave::after {
            animation: none !important;
          }
          [data-moni-mobile-chat] .moni-live-wave-bar {
            transform: scaleY(.46);
          }
        }
      `}</style>
    </>
  )
}
