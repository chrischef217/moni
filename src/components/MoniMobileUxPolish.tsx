'use client'

import { useEffect } from 'react'

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
  useEffect(() => {
    const root = document.querySelector('[data-moni-mobile-chat]')
    if (!root) return

    markDocumentLinks(root)
    const observer = new MutationObserver(() => markDocumentLinks(root))
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
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
        overflow: hidden;
        padding: 0 10px;
        -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%);
        mask-image: linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%);
      }
      [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span {
        transform-origin: 50% 50%;
        animation: moniVoiceFlow 1.05s ease-in-out infinite;
        will-change: transform, opacity;
      }
      [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(2n) { animation-delay: -120ms; }
      [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(3n) { animation-delay: -240ms; }
      [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(4n) { animation-delay: -360ms; }
      [data-moni-mobile-chat] [aria-label="음성 인식 상태"] > span:nth-child(5n) { animation-delay: -480ms; }
      @keyframes moniVoiceFlow {
        0%, 100% { transform: translateX(4px) scaleY(.68); opacity: .48; }
        40% { transform: translateX(0) scaleY(1.08); opacity: 1; }
        72% { transform: translateX(-4px) scaleY(.82); opacity: .72; }
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
  )
}
