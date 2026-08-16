'use client'

import { useEffect, useState } from 'react'

const THREAD_KEY = 'moni-global-agent-thread-v11'
const MESSAGE_CACHE_KEY = 'moni-mobile-message-cache-v1'
const RESET_CONFIRM_MESSAGE = '현재 대화를 지우고 새 대화를 시작할까요?'

const DOCUMENT_LINK_SELECTOR = [
  '.moni-markdown a[href*="/api/moni/answer-pdf"]',
  '.moni-markdown a[href*="/api/moni/sales-statement-pdf"]',
  '.moni-markdown a[href*="/sales-management/"]',
].join(',')

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

function markDocumentLinks(root: ParentNode) {
  root.querySelectorAll<HTMLAnchorElement>(DOCUMENT_LINK_SELECTOR).forEach((link) => {
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.dataset.moniDocumentLink = 'new-tab'
  })
}

export default function MoniMobileUxPolish() {
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    const root = document.querySelector('[data-moni-mobile-chat]')
    if (!root) return

    markDocumentLinks(root)
    const observer = new MutationObserver(() => markDocumentLinks(root))
    observer.observe(root, { childList: true, subtree: true })

    const originalConfirm = window.confirm
    window.confirm = ((message?: string) => {
      if (String(message || '') === RESET_CONFIRM_MESSAGE) {
        setResetOpen(true)
        return false
      }
      return originalConfirm(message)
    }) as typeof window.confirm

    let cueContext: AudioContext | null = null

    function playVoiceCue(kind: 'start' | 'stop') {
      try {
        const audioWindow = window as AudioWindow
        const AudioContextClass = window.AudioContext || audioWindow.webkitAudioContext
        if (!AudioContextClass) return
        const context = cueContext || new AudioContextClass()
        cueContext = context
        void context.resume()

        const now = context.currentTime
        const notes = kind === 'start'
          ? [
              { at: 0, from: 600, to: 690, duration: 0.062 },
              { at: 0.078, from: 760, to: 880, duration: 0.068 },
            ]
          : [
              { at: 0, from: 760, to: 680, duration: 0.066 },
              { at: 0.082, from: 560, to: 470, duration: 0.074 },
            ]

        notes.forEach((note) => {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          const startedAt = now + note.at
          const endedAt = startedAt + note.duration

          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(note.from, startedAt)
          oscillator.frequency.exponentialRampToValueAtTime(note.to, endedAt)
          gain.gain.setValueAtTime(0.0001, startedAt)
          gain.gain.exponentialRampToValueAtTime(0.028, startedAt + 0.009)
          gain.gain.exponentialRampToValueAtTime(0.0001, endedAt)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start(startedAt)
          oscillator.stop(endedAt + 0.005)
        })
      } catch {
        // Voice button sounds are feedback only and must never block recording.
      }
    }

    const handleVoiceCueClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest('button')
      if (!button || !root.contains(button) || button.hasAttribute('disabled')) return

      if (button.getAttribute('aria-label') === '음성으로 입력') {
        playVoiceCue('start')
        return
      }

      const composer = button.closest('[data-moni-mobile-composer]')
      const voiceWave = composer?.querySelector('[aria-label="음성 인식 상태"]')
      if (voiceWave && button.textContent?.trim() === '확인') playVoiceCue('stop')
    }

    root.addEventListener('click', handleVoiceCueClick, true)

    return () => {
      observer.disconnect()
      root.removeEventListener('click', handleVoiceCueClick, true)
      window.confirm = originalConfirm
      if (cueContext) void cueContext.close().catch(() => undefined)
    }
  }, [])

  function confirmNewConversation() {
    try {
      window.speechSynthesis?.cancel()
      window.localStorage.removeItem(THREAD_KEY)
      window.localStorage.removeItem(MESSAGE_CACHE_KEY)
    } catch {
      // A storage failure must not expose the native system confirmation dialog.
    }
    setResetOpen(false)
    window.location.replace('/mobile')
  }

  return (
    <>
      {resetOpen ? (
        <div
          className="fixed inset-0 z-[2200] flex items-center justify-center bg-[#102f42]/30 px-5 py-[calc(env(safe-area-inset-top)+24px)] backdrop-blur-[3px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResetOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="moni-reset-title"
            aria-describedby="moni-reset-description"
            className="w-full max-w-[360px] overflow-hidden rounded-[26px] border border-[#d5e8e4] bg-white shadow-[0_24px_70px_rgba(17,56,75,0.24)]"
          >
            <div className="px-5 pb-4 pt-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e8f7f3] text-[20px]" aria-hidden="true">✦</span>
                <div className="min-w-0">
                  <h2 id="moni-reset-title" className="text-[17px] font-black tracking-[-0.02em] text-[#173b52]">새 대화를 시작할까요?</h2>
                  <p className="mt-0.5 text-[11px] font-bold text-[#6f8994]">지금 대화를 비우고 새로 시작합니다</p>
                </div>
              </div>
              <p id="moni-reset-description" className="text-[13px] leading-6 text-[#486573]">
                지금까지 나눈 대화는 화면에서 사라지고 새로운 대화를 시작합니다. 생산·매출·재고 같은 회사 업무 데이터는 그대로 유지됩니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-[#e6efed] bg-[#f8fbfa] p-3">
              <button
                type="button"
                onClick={() => setResetOpen(false)}
                className="h-11 rounded-2xl border border-[#d7e4e1] bg-white text-[13px] font-black text-[#536d78] transition active:scale-[0.98]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmNewConversation}
                className="h-11 rounded-2xl bg-[#1c8f7b] text-[13px] font-black text-white shadow-[0_7px_18px_rgba(28,143,123,0.2)] transition active:scale-[0.98]"
              >
                새 대화 시작
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        [data-moni-mobile-chat] .ml-10.rounded-2xl {
          border: 1px solid #c7e8df !important;
          background: #def5ee !important;
          color: #173b52 !important;
          box-shadow: 0 4px 14px rgba(23, 59, 82, 0.035) !important;
        }
        [data-moni-mobile-chat] textarea[placeholder="MONI에게 메시지"],
        [data-moni-mobile-chat] textarea[placeholder="사진에 대해 물어보세요"] {
          transition: height 120ms ease;
        }
        [data-moni-mobile-chat] .moni-mobile-character {
          margin-top: 4px;
        }
        [data-moni-mobile-chat] .moni-new-chat-button {
          animation: moniNewChatBorderGlow 2.2s ease-in-out infinite;
        }
        @keyframes moniNewChatBorderGlow {
          0%, 100% {
            border-color: rgba(102, 174, 245, .55);
            box-shadow: 0 4px 14px rgba(23, 90, 154, .08), 0 0 0 0 rgba(47, 128, 237, 0);
          }
          50% {
            border-color: rgba(47, 128, 237, .95);
            box-shadow: 0 4px 14px rgba(23, 90, 154, .12), 0 0 0 3px rgba(47, 128, 237, .09);
          }
        }
        [data-moni-mobile-chat] div:has(> div > [aria-label="음성 인식 상태"]) {
          min-height: 62px !important;
          gap: 7px !important;
          padding: 6px 10px !important;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] {
          position: relative;
          display: block !important;
          width: 100%;
          height: 30px;
          overflow: hidden;
          padding: 0;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"]::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20180%2032%22%3E%3Cpath%20d%3D%22M0%2016%20C3%2016%203%2013%206%2013%20S9%2019%2012%2019%20S15%2014%2018%2014%20S21%2018%2024%2018%20S27%2015%2030%2015%20S33%2017%2036%2017%20S39%2012%2042%2012%20S45%2020%2048%2020%20S51%2014%2054%2014%20S57%2018%2060%2018%20S63%2015%2066%2015%20S69%2017%2072%2017%20S75%2013%2078%2013%20S81%2019%2084%2019%20S87%2014%2090%2014%20S93%2018%2096%2018%20S99%2015%20102%2015%20S105%2017%20108%2017%20S111%2012%20114%2012%20S117%2020%20120%2020%20S123%2014%20126%2014%20S129%2018%20132%2018%20S135%2015%20138%2015%20S141%2017%20144%2017%20S147%2013%20150%2013%20S153%2019%20156%2019%20S159%2014%20162%2014%20S165%2018%20168%2018%20S171%2015%20174%2015%20S177%2016%20180%2016%22%20fill%3D%22none%22%20stroke%3D%22%23798389%22%20stroke-width%3D%221.15%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E");
          background-repeat: repeat-x;
          background-position: 0 center;
          background-size: 180px 32px;
          opacity: .72;
          transform: scaleY(calc(.38 + var(--moni-voice-level, 0)));
          transform-origin: center;
          transition: transform 190ms cubic-bezier(.2,.65,.3,1);
          animation: moniVoiceWaveDrift 8.5s linear infinite;
          will-change: background-position, transform;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span {
          display: none !important;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] + div {
          min-height: 14px !important;
          margin-top: 0 !important;
          color: #8a9499 !important;
          font-size: 10px !important;
          line-height: 14px !important;
        }
        @keyframes moniVoiceWaveDrift {
          from { background-position-x: 0; }
          to { background-position-x: -180px; }
        }
        [data-moni-mobile-chat] .moni-markdown table {
          scrollbar-width: thin;
          scrollbar-color: #b7d9d1 transparent;
        }
        [data-moni-mobile-chat] .moni-markdown table::-webkit-scrollbar { height: 5px; }
        [data-moni-mobile-chat] .moni-markdown table::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #b7d9d1;
        }
        [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/answer-pdf"],
        [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/sales-statement-pdf"],
        [data-moni-mobile-chat] .moni-markdown a[href*="/sales-management/"] {
          display: inline-flex;
          align-items: center;
          min-height: 38px;
          margin: 5px 4px 3px 0;
          padding: 8px 12px;
          border: 1px solid #cce8e1;
          border-radius: 12px;
          background: #f2fbf8;
          color: #167e6b;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.25;
          text-decoration: none;
        }
        [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/answer-pdf"]:active,
        [data-moni-mobile-chat] .moni-markdown a[href*="/api/moni/sales-statement-pdf"]:active,
        [data-moni-mobile-chat] .moni-markdown a[href*="/sales-management/"]:active {
          transform: scale(.98);
        }
        @media (prefers-reduced-motion: reduce) {
          [data-moni-mobile-chat] .moni-new-chat-button,
          [data-moni-mobile-chat] [aria-label="음성 인식 상태"]::before {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
