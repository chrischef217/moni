'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const HEARTBEAT_EVENT = 'moni:heartbeat'

type ThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'

type HeartbeatDetail = {
  stage?: ThinkingStage
}

function ThinkingCharacterFx() {
  return (
    <>
      <span className="moni-thinking-sweat moni-thinking-sweat-one" aria-hidden="true" />
      <span className="moni-thinking-sweat moni-thinking-sweat-two" aria-hidden="true" />
      <span className="moni-thinking-sweat moni-thinking-sweat-three" aria-hidden="true" />
      <span className="moni-thinking-work-mark moni-thinking-work-mark-one" aria-hidden="true" />
      <span className="moni-thinking-work-mark moni-thinking-work-mark-two" aria-hidden="true" />
      <span className="moni-thinking-work-mark moni-thinking-work-mark-three" aria-hidden="true" />
    </>
  )
}

function currentStage(root: HTMLElement): ThinkingStage {
  const stage = String(root.dataset.moniHeartbeatStage || root.dataset.moniThinkingStage || 'normal')
  if (stage === 'grace' || stage === 'detail-1' || stage === 'detail-2' || stage === 'apology') return stage
  return 'normal'
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export default function MoniMobileThinkingCharacterMotion() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-moni-mobile-chat]')
    if (!root) return

    let beatCount = 0
    let previousStage: ThinkingStage = 'normal'
    let spinTimer: number | null = null

    const syncTarget = () => {
      const next = root.querySelector<HTMLElement>('.moni-mobile-character')
      setTarget((current) => current === next ? current : next)
      if (!next) return
      const stage = currentStage(root)
      next.dataset.moniCharacterStage = stage
      if (stage !== previousStage) {
        previousStage = stage
        beatCount = 0
      }
    }

    const onHeartbeat = (event: Event) => {
      const character = root.querySelector<HTMLElement>('.moni-mobile-character-thinking')
      if (!character) return

      const detail = (event as CustomEvent<HeartbeatDetail>).detail || {}
      const stage = detail.stage || currentStage(root)
      character.dataset.moniCharacterStage = stage
      if (stage !== previousStage) {
        previousStage = stage
        beatCount = 0
      }
      beatCount += 1

      const intensity = stage === 'normal' ? 0.7 : stage === 'grace' ? 1 : stage === 'detail-1' ? 1.35 : stage === 'detail-2' ? 1.75 : 2.15
      character.style.setProperty('--moni-hop-x', `${randomBetween(-2.2, 2.2) * intensity}px`)
      character.style.setProperty('--moni-hop-y', `${randomBetween(-2.4, 0.8) * intensity}px`)
      character.style.setProperty('--moni-hop-r', `${randomBetween(-2.5, 2.5) * intensity}deg`)
      character.style.setProperty('--moni-hop-scale', String(1 + randomBetween(.018, .032) * intensity))

      const shouldSpin = (stage === 'detail-2' && beatCount % 8 === 0) || (stage === 'apology' && beatCount % 5 === 0)
      if (!shouldSpin) return

      character.classList.remove('moni-thinking-spin')
      void character.offsetWidth
      character.classList.add('moni-thinking-spin')
      if (spinTimer !== null) window.clearTimeout(spinTimer)
      spinTimer = window.setTimeout(() => {
        character.classList.remove('moni-thinking-spin')
        spinTimer = null
      }, 820)
    }

    syncTarget()
    const observer = new MutationObserver(syncTarget)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-moni-thinking-stage', 'data-moni-heartbeat-stage'],
      childList: true,
      subtree: true,
    })
    window.addEventListener(HEARTBEAT_EVENT, onHeartbeat)

    return () => {
      observer.disconnect()
      window.removeEventListener(HEARTBEAT_EVENT, onHeartbeat)
      if (spinTimer !== null) window.clearTimeout(spinTimer)
    }
  }, [])

  return (
    <>
      {target ? createPortal(<ThinkingCharacterFx />, target) : null}
      <style jsx global>{`
        [data-moni-mobile-chat] .moni-mobile-character-thinking {
          overflow: visible !important;
          transform-origin: 50% 55% !important;
          transition: background 320ms ease, box-shadow 320ms ease, filter 320ms ease !important;
          will-change: transform, background, filter;
        }

        [data-moni-mobile-chat] .moni-thinking-sweat,
        [data-moni-mobile-chat] .moni-thinking-work-mark {
          position: absolute;
          z-index: 8;
          pointer-events: none;
          opacity: 0;
        }

        [data-moni-mobile-chat] .moni-thinking-sweat {
          width: 7px;
          height: 11px;
          border: 1px solid rgba(224, 242, 254, .86);
          border-radius: 70% 38% 66% 42%;
          background: linear-gradient(160deg, #e0f2fe, #7dd3fc 70%);
          box-shadow: 0 1px 7px rgba(56, 189, 248, .42);
          transform: rotate(30deg);
        }
        [data-moni-mobile-chat] .moni-thinking-sweat-one { top: 5px; right: -8px; }
        [data-moni-mobile-chat] .moni-thinking-sweat-two { top: 17px; right: -13px; width: 5px; height: 8px; }
        [data-moni-mobile-chat] .moni-thinking-sweat-three { top: 7px; left: -8px; width: 5px; height: 8px; transform: rotate(-28deg); }

        [data-moni-mobile-chat] .moni-thinking-work-mark {
          width: 2px;
          height: 9px;
          border-radius: 999px;
          background: rgba(251, 191, 36, .9);
          box-shadow: 0 0 7px rgba(251, 146, 60, .55);
        }
        [data-moni-mobile-chat] .moni-thinking-work-mark-one { top: -7px; left: -6px; transform: rotate(-38deg); }
        [data-moni-mobile-chat] .moni-thinking-work-mark-two { top: -12px; left: 5px; transform: rotate(-12deg); }
        [data-moni-mobile-chat] .moni-thinking-work-mark-three { top: -9px; right: -5px; transform: rotate(36deg); }

        /* Stage 1: visibly different from LIVE. Focused eyes scan while the mouth becomes a tiny thinking O. */
        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #0b2d50, #17466d) !important;
          box-shadow: 0 10px 29px rgba(37, 99, 235, .30), 0 0 0 3px rgba(96, 165, 250, .10), 0 0 24px rgba(56, 189, 248, .16) !important;
          animation: moniThinkSearch 1.9s cubic-bezier(.44, .05, .28, 1) infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking .moni-mobile-eye {
          width: 8px !important;
          height: 5px !important;
          border-radius: 55% !important;
          animation: moniThinkingEyeScan 1.28s ease-in-out infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="normal"] .moni-mobile-character-thinking .moni-mobile-mouth {
          bottom: 11px !important;
          width: 7px !important;
          height: 7px !important;
          border: 2px solid rgba(224, 242, 254, .94) !important;
          border-radius: 50% !important;
          background: rgba(2, 23, 43, .3) !important;
          transform: translateX(-50%) !important;
        }

        /* Stage 2: concern. The whole body moves more and the face starts warming. */
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #26365f, #6d4069) !important;
          box-shadow: 0 10px 30px rgba(168, 85, 247, .30), 0 0 0 4px rgba(244, 114, 182, .11), 0 0 25px rgba(251, 146, 60, .18) !important;
          animation: moniThinkHustle 1.18s cubic-bezier(.42, 0, .3, 1) infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-eye-left {
          width: 8px !important;
          height: 4px !important;
          transform: translateY(-1px) rotate(11deg) scaleY(.72) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-eye-right {
          width: 8px !important;
          height: 4px !important;
          transform: translateY(-1px) rotate(-11deg) scaleY(.72) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="grace"] .moni-mobile-character-thinking .moni-mobile-mouth {
          bottom: 11px !important;
          width: 13px !important;
          height: 4px !important;
          border: 0 !important;
          border-top: 2px solid rgba(254, 226, 226, .95) !important;
          border-radius: 50% 50% 0 0 !important;
          background: transparent !important;
          transform: translateX(-50%) rotate(-3deg) !important;
        }

        /* Stage 3: busy. First sweat drop appears and expression becomes strained. */
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #66405c, #a65743) !important;
          box-shadow: 0 10px 31px rgba(234, 88, 12, .30), 0 0 0 4px rgba(251, 113, 133, .14), 0 0 27px rgba(251, 146, 60, .25) !important;
          animation: moniThinkBusy .82s linear infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-eye-left {
          width: 9px !important;
          height: 3px !important;
          transform: rotate(17deg) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-eye-right {
          width: 9px !important;
          height: 3px !important;
          transform: rotate(-17deg) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-mobile-character-thinking .moni-mobile-mouth {
          bottom: 9px !important;
          width: 13px !important;
          height: 8px !important;
          border: 2px solid rgba(255, 237, 213, .95) !important;
          border-radius: 50% !important;
          background: rgba(69, 10, 10, .34) !important;
          transform: translateX(-50%) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-1"] .moni-thinking-sweat-one {
          opacity: 1;
          animation: moniSweatDrop .82s ease-in infinite;
        }

        /* Stage 4: very busy. Orange-red body, two sweat drops, work marks and quick irregular travel. */
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #8b343f, #c65332) !important;
          box-shadow: 0 10px 33px rgba(239, 68, 68, .40), 0 0 0 5px rgba(251, 146, 60, .16), 0 0 32px rgba(248, 113, 113, .36) !important;
          animation: moniThinkSprint .56s linear infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-eye-left {
          width: 10px !important;
          height: 3px !important;
          transform: rotate(21deg) scaleY(.7) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-eye-right {
          width: 10px !important;
          height: 3px !important;
          transform: rotate(-21deg) scaleY(.7) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-mobile-character-thinking .moni-mobile-mouth {
          bottom: 8px !important;
          width: 15px !important;
          height: 9px !important;
          border: 2px solid rgba(255, 241, 242, .96) !important;
          border-radius: 46% !important;
          background: rgba(69, 10, 10, .42) !important;
          transform: translateX(-50%) rotate(2deg) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-thinking-sweat-one,
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-thinking-sweat-two {
          opacity: 1;
          animation: moniSweatDrop .64s ease-in infinite;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-thinking-sweat-two { animation-delay: -.28s; }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="detail-2"] .moni-thinking-work-mark {
          opacity: .82;
          animation: moniWorkMark .58s ease-in-out infinite;
        }

        /* Stage 5: full overdrive. Bright red, X-style eyes, heavy sweat, frantic movement and occasional 360 spin. */
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking {
          background: linear-gradient(145deg, #a91f35, #df263a) !important;
          box-shadow: 0 10px 36px rgba(220, 38, 38, .55), 0 0 0 5px rgba(251, 113, 133, .25), 0 0 40px rgba(239, 68, 68, .52) !important;
          filter: saturate(1.22) brightness(1.04) !important;
          animation: moniThinkOverdrive .42s linear infinite !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-eye {
          width: 10px !important;
          height: 2px !important;
          border-radius: 0 !important;
          background: rgba(255, 241, 242, .98) !important;
          animation: none !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-eye-left {
          transform: rotate(38deg) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-eye-right {
          transform: rotate(-38deg) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-eye::after {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 10px;
          height: 2px;
          border-radius: 0;
          background: rgba(255, 241, 242, .98);
          transform: rotate(90deg);
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-mobile-character-thinking .moni-mobile-mouth {
          bottom: 7px !important;
          width: 17px !important;
          height: 10px !important;
          border: 2px solid rgba(255, 241, 242, .98) !important;
          border-radius: 44% !important;
          background: rgba(69, 10, 10, .52) !important;
          transform: translateX(-50%) rotate(-3deg) !important;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-thinking-sweat {
          opacity: 1;
          animation: moniSweatDrop .48s ease-in infinite;
        }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-thinking-sweat-two { animation-delay: -.18s; }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-thinking-sweat-three { animation-delay: -.34s; }
        [data-moni-mobile-chat][data-moni-heartbeat-stage="apology"] .moni-thinking-work-mark {
          opacity: 1;
          animation: moniWorkMark .42s ease-in-out infinite;
        }

        /* Every real heartbeat produces a slightly different physical hop. */
        [data-moni-mobile-chat] .moni-mobile-character-thinking.moni-heartbeat-character-hit:not(.moni-thinking-spin) {
          animation: moniRandomHeartbeatBurst 370ms cubic-bezier(.18, .8, .22, 1) both !important;
        }
        [data-moni-mobile-chat] .moni-mobile-character-thinking.moni-thinking-spin {
          animation: moniThinkingSpinDash 820ms cubic-bezier(.18, .72, .2, 1) both !important;
          z-index: 12;
        }

        @keyframes moniThinkSearch {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          18% { transform: translate(1px, -1px) rotate(1deg); }
          42% { transform: translate(-1px, -2px) rotate(-1.3deg); }
          68% { transform: translate(2px, 0) rotate(.6deg); }
          84% { transform: translate(-.5px, -1px) rotate(-.5deg); }
        }
        @keyframes moniThinkHustle {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          15% { transform: translate(2px, -2px) rotate(2deg); }
          36% { transform: translate(-2px, 0) rotate(-1.7deg); }
          58% { transform: translate(1px, 1px) rotate(1.2deg); }
          77% { transform: translate(-1px, -2px) rotate(-2deg); }
          90% { transform: translate(2px, 0) rotate(.8deg); }
        }
        @keyframes moniThinkBusy {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          12% { transform: translate(2.5px, -2px) rotate(2.8deg); }
          28% { transform: translate(-2px, 1px) rotate(-2.2deg); }
          46% { transform: translate(3px, 0) rotate(1.8deg); }
          63% { transform: translate(-2.5px, -2px) rotate(-2.7deg); }
          82% { transform: translate(1px, 1px) rotate(1deg); }
        }
        @keyframes moniThinkSprint {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          10% { transform: translate(3px, -3px) rotate(4deg) scale(1.015); }
          23% { transform: translate(-3px, 1px) rotate(-3.5deg) scale(.99); }
          39% { transform: translate(3.5px, 0) rotate(3deg) scale(1.02); }
          55% { transform: translate(-2.5px, -3px) rotate(-4deg) scale(1); }
          71% { transform: translate(2px, 2px) rotate(2.8deg) scale(1.015); }
          88% { transform: translate(-1px, -1px) rotate(-2deg) scale(.995); }
        }
        @keyframes moniThinkOverdrive {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          8% { transform: translate(4px, -3px) rotate(5deg) scale(1.025); }
          19% { transform: translate(-4px, 2px) rotate(-4.5deg) scale(.985); }
          34% { transform: translate(3px, 1px) rotate(4deg) scale(1.03); }
          49% { transform: translate(-3px, -3px) rotate(-5deg) scale(1); }
          63% { transform: translate(4px, 2px) rotate(3.5deg) scale(1.02); }
          78% { transform: translate(-4px, 0) rotate(-4deg) scale(.99); }
          91% { transform: translate(2px, -2px) rotate(2deg) scale(1.02); }
        }
        @keyframes moniThinkingEyeScan {
          0%, 100% { transform: translate(0, -1px) scaleY(.72); }
          28% { transform: translate(2px, -2px) scaleY(.8); }
          58% { transform: translate(-1px, -1px) scaleY(.68); }
          78% { transform: translate(1px, -2px) scaleY(.84); }
        }
        @keyframes moniRandomHeartbeatBurst {
          0% { transform: translate(0, 0) rotate(0deg) scale(.97); }
          31% { transform: translate(var(--moni-hop-x, 2px), var(--moni-hop-y, -2px)) rotate(var(--moni-hop-r, 2deg)) scale(var(--moni-hop-scale, 1.05)); }
          58% { transform: translate(calc(var(--moni-hop-x, 2px) * -.45), 1px) rotate(calc(var(--moni-hop-r, 2deg) * -.5)) scale(.99); }
          78% { transform: translate(calc(var(--moni-hop-x, 2px) * .25), -1px) rotate(calc(var(--moni-hop-r, 2deg) * .35)) scale(1.025); }
          100% { transform: translate(0, 0) rotate(0deg) scale(1); }
        }
        @keyframes moniThinkingSpinDash {
          0% { transform: translate(0, 0) rotate(0deg) scale(1); }
          18% { transform: translate(4px, -5px) rotate(35deg) scale(1.06); }
          68% { transform: translate(-4px, -2px) rotate(360deg) scale(1.035); }
          83% { transform: translate(3px, 1px) rotate(380deg) scale(.98); }
          100% { transform: translate(0, 0) rotate(360deg) scale(1); }
        }
        @keyframes moniSweatDrop {
          0% { transform: translate(0, -3px) rotate(30deg) scale(.72); opacity: 0; }
          22% { opacity: 1; }
          72% { opacity: 1; }
          100% { transform: translate(3px, 8px) rotate(30deg) scale(1); opacity: 0; }
        }
        @keyframes moniWorkMark {
          0%, 100% { transform: scaleY(.65) rotate(var(--moni-mark-r, 0deg)); opacity: .35; }
          48% { transform: scaleY(1.2) rotate(var(--moni-mark-r, 0deg)); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          [data-moni-mobile-chat] .moni-mobile-character-thinking,
          [data-moni-mobile-chat] .moni-mobile-character-thinking .moni-mobile-eye,
          [data-moni-mobile-chat] .moni-thinking-sweat,
          [data-moni-mobile-chat] .moni-thinking-work-mark {
            animation: none !important;
          }
          [data-moni-mobile-chat] .moni-thinking-work-mark { opacity: 0 !important; }
        }
      `}</style>
    </>
  )
}
