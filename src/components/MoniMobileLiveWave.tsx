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
      if (detail.stage) root.dataset.moniHeartbeatStage = String(detail.stage)

      const wave = root.querySelector<HTMLElement>('[data-moni-live-wave]')
      const character = root.querySelector<HTMLElement>('.moni-mobile-character-thinking')
      wave?.classList.remove('moni-heartbeat-hit')
      character?.classList.remove('moni-heartbeat-character-hit')
      if (wave) void wave.offsetWidth
      if (character) void character.offsetWidth
      wave?.classList.add('moni-heartbeat-hit')
      character?.classList.add('moni-heartbeat-character-hit')
      if (pulseTimer !== null) window.clearTimeout(pulseTimer)
      pulseTimer = window.setTimeout(() => {
        wave?.classList.remove('moni-heartbeat-hit')
        character?.classList.remove('moni-heartbeat-character-hit')
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

        /* The top-left MONI character follows the same heartbeat stage as audio and waveform. */
        [data-moni-mobile-chat] .moni-mobile-character-thinking {
          transition: background 220ms ease, box-shadow 220ms ease, filter 220ms ease;
        }
        [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-face-glow,
        [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-eye,
        [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-mouth,
        [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-antenna-dot {
          transition: background 220ms ease, border-color 220ms ease, transform 220ms ease, opacity 220ms ease, box-shadow 220ms ease;
        }
        [data-moni-mobile-chat] .moni-mobile-character-thinking::before,
        [data-moni-mobile-chat] .moni-mobile-character-thinking::after {
          content: '';
          position: absolute;
          pointer-events: none;
          opacity: 0;
        }

        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #0b2944, #123b5d) !important;
          box-shadow: 0 10px 28px rgba(59, 130, 246, .28), 0 0 0 3px rgba(99, 102, 241, .10), 0 0 20px rgba(96, 165, 250, .18) !important;
          animation: moniThinkingCharacterFloat 2.15s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking .moni-mobile-face-glow {
          background: linear-gradient(135deg, rgba(96, 165, 250, .24), rgba(129, 140, 248, .17) 52%, rgba(45, 212, 191, .13));
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking .moni-mobile-eye {
          animation: moniThinkingEyes 1.85s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking .moni-mobile-mouth {
          width: 9px;
          height: 5px;
          bottom: 12px;
          border-bottom: 2px solid rgba(219, 234, 254, .95);
          border-radius: 50%;
          transform: translateX(-50%) rotate(-7deg);
        }

        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #17324d, #5b3548) !important;
          box-shadow: 0 10px 30px rgba(244, 114, 182, .26), 0 0 0 4px rgba(251, 146, 60, .10), 0 0 22px rgba(251, 113, 133, .20) !important;
          animation: moniThinkingConcerned 1.45s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-face-glow {
          background: linear-gradient(135deg, rgba(251, 146, 60, .20), rgba(244, 114, 182, .16), rgba(96, 165, 250, .10));
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-eye-left {
          transform: translate(1px, -1px) rotate(8deg) scaleY(.78);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-eye-right {
          transform: translate(1px, -1px) rotate(-8deg) scaleY(.78);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-mouth {
          width: 11px;
          height: 3px;
          border-bottom-color: rgba(254, 215, 170, .92);
          border-radius: 30%;
          transform: translateX(-50%) rotate(-2deg);
        }

        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #4a2732, #7f2f35) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking {
          box-shadow: 0 10px 30px rgba(239, 68, 68, .30), 0 0 0 4px rgba(251, 113, 133, .13), 0 0 24px rgba(248, 113, 113, .22) !important;
          animation: moniThinkingHot 1.05s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #642833, #a33232) !important;
          box-shadow: 0 10px 32px rgba(239, 68, 68, .38), 0 0 0 5px rgba(251, 113, 133, .16), 0 0 30px rgba(248, 113, 113, .34) !important;
          animation: moniThinkingVeryHot .74s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #7f1d2d, #c33131) !important;
          box-shadow: 0 10px 34px rgba(220, 38, 38, .48), 0 0 0 5px rgba(248, 113, 113, .22), 0 0 36px rgba(239, 68, 68, .48) !important;
          filter: saturate(1.16);
          animation: moniThinkingOverheat .50s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-face-glow,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-face-glow,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-face-glow {
          background:
            radial-gradient(circle at 22% 67%, rgba(255, 153, 153, .34), transparent 16%),
            radial-gradient(circle at 78% 67%, rgba(255, 153, 153, .34), transparent 16%),
            linear-gradient(135deg, rgba(251, 113, 133, .24), rgba(248, 113, 113, .18), rgba(251, 146, 60, .13));
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-eye-left,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-eye-left,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-eye-left {
          transform: rotate(16deg) scaleY(.58);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-eye-right,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-eye-right,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-eye-right {
          transform: rotate(-16deg) scaleY(.58);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-mouth,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-mouth,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-mouth {
          width: 14px;
          height: 6px;
          bottom: 10px;
          border-bottom: 0;
          border-top: 2px solid rgba(254, 226, 226, .96);
          border-radius: 12px 12px 0 0;
          transform: translateX(-50%);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking::after,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking::after {
          top: -10px;
          left: 10px;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(251, 146, 60, .72);
          box-shadow: 15px -4px 0 rgba(248, 113, 113, .68), 31px 2px 0 rgba(251, 146, 60, .68);
          opacity: .85;
          animation: moniHeatPuffs .86s ease-out infinite;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking::before {
          inset: -9px;
          border: 2px solid rgba(248, 113, 113, .46);
          border-radius: 27px;
          opacity: 1;
          animation: moniOverheatRing .62s ease-out infinite;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-antenna-dot {
          background: #fb7185;
          box-shadow: 0 0 16px rgba(251, 113, 133, .92);
          animation: moniAntennaOverheat .50s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat] .moni-mobile-character-thinking.moni-heartbeat-character-hit {
          animation: moniCharacterHeartbeatHit 360ms cubic-bezier(.18, .82, .24, 1) both !important;
        }

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
        @keyframes moniThinkingCharacterFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.015); }
        }
        @keyframes moniThinkingEyes {
          0%, 100% { transform: translate(1px, -1px) scaleY(.78); }
          50% { transform: translate(2px, -2px) scaleY(.9); }
        }
        @keyframes moniThinkingConcerned {
          0%, 100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-1px) rotate(-1deg); }
        }
        @keyframes moniThinkingHot {
          0%, 100% { transform: translate(0, 0) rotate(0); }
          45% { transform: translate(1px, -1px) rotate(.7deg); }
          70% { transform: translate(-1px, 0) rotate(-.7deg); }
        }
        @keyframes moniThinkingVeryHot {
          0%, 100% { transform: translate(0, 0) rotate(0); }
          25% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 0) rotate(-1deg); }
          75% { transform: translate(1px, 1px) rotate(.8deg); }
        }
        @keyframes moniThinkingOverheat {
          0%, 100% { transform: translate(0, 0) rotate(0) scale(1); }
          20% { transform: translate(1.5px, -1px) rotate(1.4deg) scale(1.015); }
          40% { transform: translate(-1.5px, 0) rotate(-1.4deg) scale(1.02); }
          60% { transform: translate(1px, 1px) rotate(1.1deg) scale(1.01); }
          80% { transform: translate(-1px, -1px) rotate(-1deg) scale(1.02); }
        }
        @keyframes moniCharacterHeartbeatHit {
          0% { transform: scale(.96); }
          28% { transform: scale(1.075); }
          52% { transform: scale(.985); }
          72% { transform: scale(1.045); }
          100% { transform: scale(1); }
        }
        @keyframes moniHeatPuffs {
          0% { transform: translateY(5px) scale(.65); opacity: 0; }
          35% { opacity: .9; }
          100% { transform: translateY(-11px) scale(1.12); opacity: 0; }
        }
        @keyframes moniOverheatRing {
          0% { transform: scale(.88); opacity: .72; }
          100% { transform: scale(1.22); opacity: 0; }
        }
        @keyframes moniAntennaOverheat {
          0%, 100% { transform: translateX(-50%) scale(.84); opacity: .72; }
          50% { transform: translateX(-50%) scale(1.25); opacity: 1; }
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
          [data-moni-mobile-chat] .moni-live-wave::after,
          [data-moni-mobile-chat] .moni-mobile-character-thinking,
          [data-moni-mobile-chat] .moni-mobile-character-thinking::before,
          [data-moni-mobile-chat] .moni-mobile-character-thinking::after,
          [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-eye,
          [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-antenna-dot {
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
