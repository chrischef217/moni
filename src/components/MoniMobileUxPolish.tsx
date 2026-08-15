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

    return () => {
      observer.disconnect()
      window.confirm = originalConfirm
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
          className="fixed inset-0 z-[2200] flex items-end justify-center bg-[#102f42]/28 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-20 backdrop-blur-[2px] sm:items-center"
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
            className="w-full max-w-[390px] overflow-hidden rounded-[26px] border border-[#d5e8e4] bg-white shadow-[0_24px_70px_rgba(17,56,75,0.22)]"
          >
            <div className="px-5 pb-4 pt-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#e8f7f3] text-[20px]" aria-hidden="true">✦</span>
                <div className="min-w-0">
                  <h2 id="moni-reset-title" className="text-[17px] font-black tracking-[-0.02em] text-[#173b52]">새 대화를 시작할까요?</h2>
                  <p className="mt-0.5 text-[11px] font-bold text-[#6f8994]">MONI 대화 컨텍스트 초기화</p>
                </div>
              </div>
              <p id="moni-reset-description" className="text-[13px] leading-6 text-[#486573]">
                현재 화면의 대화와 이어지는 컨텍스트를 정리하고 새 대화로 시작합니다. 생산·매출·재고 같은 업무 데이터와 평가·감사 기록은 삭제되지 않습니다.
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
        [data-moni-mobile-chat] textarea[placeholder="MONI에게 메시지"] {
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
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] {
          position: relative;
          display: block !important;
          width: 100%;
          height: 38px;
          overflow: hidden;
          padding: 0 5px;
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 5%, #000 95%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 5%, #000 95%, transparent 100%);
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span {
          position: absolute;
          top: 50%;
          left: calc(100% + 8px);
          width: 2.5px !important;
          min-height: 4px;
          border-radius: 999px;
          color: #8b5cf6;
          background: currentColor !important;
          transform: translateY(-50%);
          opacity: calc(.24 + (var(--moni-voice-level, 0) * .74));
          transition: height 70ms linear, opacity 80ms linear;
          animation: moniVoiceTravel 2.05s linear infinite;
          will-change: left, height, opacity;
          box-shadow: 7px 0 0 currentColor, 14px 0 0 currentColor;
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span::before,
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span::after {
          content: '';
          position: absolute;
          left: 21px;
          top: 50%;
          width: 2.5px;
          border-radius: 999px;
          background: currentColor;
          transform: translateY(-50%);
        }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span::before { height: 72%; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span::after { left: 28px; height: 48%; opacity: .82; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(1) { height: var(--moni-wave-h1, 5px) !important; animation-delay: 0s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(2) { height: var(--moni-wave-h2, 6px) !important; animation-delay: -.155s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(3) { height: var(--moni-wave-h3, 8px) !important; animation-delay: -.31s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(4) { height: var(--moni-wave-h4, 5px) !important; animation-delay: -.465s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(5) { height: var(--moni-wave-h5, 9px) !important; animation-delay: -.62s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(6) { height: var(--moni-wave-h6, 6px) !important; animation-delay: -.775s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(7) { height: var(--moni-wave-h7, 8px) !important; animation-delay: -.93s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(8) { height: var(--moni-wave-h8, 5px) !important; animation-delay: -1.085s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(9) { height: var(--moni-wave-h9, 10px) !important; animation-delay: -1.24s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(10) { height: var(--moni-wave-h10, 7px) !important; animation-delay: -1.395s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(11) { height: var(--moni-wave-h11, 6px) !important; animation-delay: -1.55s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(12) { height: var(--moni-wave-h12, 5px) !important; animation-delay: -1.705s; }
        [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(13) { height: var(--moni-wave-h13, 5px) !important; animation-delay: -1.86s; }
        @keyframes moniVoiceTravel {
          from { left: calc(100% + 8px); }
          to { left: -34px; }
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
          [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
