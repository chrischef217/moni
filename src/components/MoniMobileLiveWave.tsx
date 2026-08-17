'use client'

import { useEffect } from 'react'

const LIVE_WAVE_BAR_COUNT = 11

function installLiveWave(root: ParentNode) {
  const state = root.querySelector<HTMLElement>('.moni-live-state')
  if (!state || state.querySelector('[data-moni-live-wave]')) return

  const wave = document.createElement('span')
  wave.dataset.moniLiveWave = 'true'
  wave.className = 'moni-live-wave'
  wave.setAttribute('aria-hidden', 'true')

  for (let index = 0; index < LIVE_WAVE_BAR_COUNT; index += 1) {
    const bar = document.createElement('span')
    bar.className = 'moni-live-wave-bar'
    wave.appendChild(bar)
  }

  state.appendChild(wave)
}

export default function MoniMobileLiveWave() {
  useEffect(() => {
    const root = document.querySelector('[data-moni-mobile-chat]')
    if (!root) return

    installLiveWave(root)
    const observer = new MutationObserver(() => installLiveWave(root))
    observer.observe(root, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return (
    <style jsx global>{`
      [data-moni-mobile-chat] .moni-live-state {
        min-height: 18px;
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

      [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave-bar {
        animation-name: moniThinkingWave;
        animation-duration: .82s;
      }
      [data-moni-mobile-chat] .moni-live-state-thinking .moni-live-wave {
        opacity: 1;
        filter: drop-shadow(0 0 6px currentColor);
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
      @keyframes moniThinkingWave {
        0%, 100% { transform: scaleY(.34); opacity: .56; }
        22% { transform: scaleY(1.05); opacity: 1; }
        45% { transform: scaleY(.52); opacity: .74; }
        69% { transform: scaleY(.92); opacity: .96; }
        86% { transform: scaleY(.43); opacity: .64; }
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
        [data-moni-mobile-chat] .moni-live-wave::after {
          animation: none !important;
        }
        [data-moni-mobile-chat] .moni-live-wave-bar {
          transform: scaleY(.46);
        }
      }
    `}</style>
  )
}
