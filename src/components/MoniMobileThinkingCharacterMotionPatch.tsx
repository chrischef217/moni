'use client'

export default function MoniMobileThinkingCharacterMotionPatch() {
  return (
    <style jsx global>{`
      /* Keep every heartbeat transform valid on current Android Chrome/WebView engines. */
      @keyframes moniRandomHeartbeatBurst {
        0% { transform: translate(0, 0) rotate(0deg) scale(.97); }
        31% { transform: translate(var(--moni-hop-x, 2px), var(--moni-hop-y, -2px)) rotate(var(--moni-hop-r, 2deg)) scale(var(--moni-hop-scale, 1.05)); }
        58% { transform: translate(-1.4px, 1px) rotate(-1.6deg) scale(.99); }
        78% { transform: translate(.8px, -1px) rotate(1.1deg) scale(1.025); }
        100% { transform: translate(0, 0) rotate(0deg) scale(1); }
      }

      [data-moni-mobile-chat] .moni-thinking-work-mark-one { --moni-mark-r: -38deg; }
      [data-moni-mobile-chat] .moni-thinking-work-mark-two { --moni-mark-r: -12deg; }
      [data-moni-mobile-chat] .moni-thinking-work-mark-three { --moni-mark-r: 36deg; }
    `}</style>
  )
}
