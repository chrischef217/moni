'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useRef, useState } from 'react'

const MONI_GPT_URL = 'https://chatgpt.com/g/g-6a7af9094b08819183be32a5dc97ef7b-moni'

type PreviewMessage = {
  id: number
  text: string
}

const menuItems = [
  { label: '경영 현황', href: '/' },
  { label: '월간 생산계획', href: '/monthly-production-plan' },
  { label: '생산일보', href: '/production-daily' },
  { label: '완제품 재고', href: '/finished-goods-inventory' },
  { label: '수금 · 미수금', href: '/business-management?tab=sales-management&view=receivables' },
]

const starters = [
  '오늘 내가 가장 먼저 확인할 일은?',
  '이번 달 생산 상황 분석해줘',
  '지금 미수금 현황 알려줘',
]

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 11 6-6 6 6M12 5v14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function MoniMobileMvp({ displayName }: { displayName: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [input, setInput] = useState('')
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([])
  const [transferNotice, setTransferNotice] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('moni-mobile-mvp-active')
    document.body.classList.add('moni-mobile-mvp-active')
    return () => {
      document.documentElement.classList.remove('moni-mobile-mvp-active')
      document.body.classList.remove('moni-mobile-mvp-active')
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  function showNotice(message: string) {
    setTransferNotice(message)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setTransferNotice(''), 4200)
  }

  function growTextarea() {
    const node = textareaRef.current
    if (!node) return
    node.style.height = '0px'
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`
  }

  async function handoffQuestion(question: string) {
    const popup = window.open(MONI_GPT_URL, '_blank', 'noopener,noreferrer')
    let copied = false

    try {
      await navigator.clipboard.writeText(question)
      copied = true
    } catch {
      // Clipboard permission varies by browser. The question stays visible in
      // the mobile shell so the user can copy it manually if needed.
    }

    if (!popup) {
      showNotice(copied ? '질문을 복사했습니다. 메뉴의 “실제 MONI AI 열기”를 눌러 붙여넣어 주세요.' : '팝업이 차단되었습니다. 메뉴에서 실제 MONI AI를 열어 주세요.')
      return
    }

    showNotice(copied ? '질문을 복사했습니다. 열린 MONI AI에 붙여넣어 테스트하세요.' : '실제 MONI AI를 열었습니다. 이 질문을 붙여넣어 테스트하세요.')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const question = input.trim()
    if (!question) return

    setPreviewMessages((current) => [...current, { id: Date.now(), text: question }])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = '44px'
    void handoffQuestion(question)
  }

  function useStarter(starter: string) {
    setInput(starter)
    window.setTimeout(() => {
      growTextarea()
      textareaRef.current?.focus()
    }, 0)
  }

  return (
    <main className="moni-mobile-root" data-moni-mobile-mvp>
      <div className="moni-mobile-app">
        <header className="moni-mobile-header">
          <button type="button" className="moni-mobile-icon-button" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">
            <MenuIcon />
          </button>
          <div className="moni-mobile-brand" aria-label="MONI">
            <span>MONI</span>
            <i aria-hidden="true" />
          </div>
          <span className="moni-mobile-header-spacer" aria-hidden="true" />
        </header>

        <section className="moni-mobile-conversation" aria-label="MONI 대화">
          <div className="moni-mobile-conversation-inner">
            <div className="moni-mobile-greeting">
              <div className="moni-mobile-mark" aria-hidden="true">M</div>
              <h1>무엇을 도와드릴까요?</h1>
              <p>두배의 경영과 운영에 필요한 내용을 MONI에게 물어보세요.</p>
            </div>

            {previewMessages.length === 0 ? (
              <div className="moni-mobile-starters" aria-label="추천 질문">
                {starters.map((starter) => (
                  <button type="button" key={starter} onClick={() => useStarter(starter)}>{starter}</button>
                ))}
              </div>
            ) : (
              <div className="moni-mobile-preview-thread">
                {previewMessages.map((message) => (
                  <div key={message.id} className="moni-mobile-user-message">{message.text}</div>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="moni-mobile-composer-wrap">
          {transferNotice && <div className="moni-mobile-toast" role="status">{transferNotice}</div>}
          <form className="moni-mobile-composer" onSubmit={submit}>
            <button type="button" className="moni-mobile-attach" aria-label="첨부 기능 준비 중" onClick={() => showNotice('첨부 기능은 다음 모바일 단계에서 연결합니다.')}> 
              <PlusIcon />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(event) => { setInput(event.target.value); window.setTimeout(growTextarea, 0) }}
              placeholder="MONI에게 메시지 보내기"
              aria-label="MONI에게 메시지 보내기"
            />
            <button type="submit" className="moni-mobile-send" disabled={!input.trim()} aria-label="실제 MONI AI에서 질문 테스트">
              <SendIcon />
            </button>
          </form>
          <p className="moni-mobile-handoff-note">MVP · 전송 시 실제 MONI AI를 열고 질문을 복사합니다.</p>
        </footer>
      </div>

      <div className={`moni-mobile-drawer-layer ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        <button type="button" className="moni-mobile-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />
        <aside className="moni-mobile-drawer" aria-label="MONI 메뉴">
          <div className="moni-mobile-drawer-head">
            <div>
              <strong>MONI</strong>
              <span>{displayName}</span>
            </div>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">×</button>
          </div>

          <a className="moni-mobile-live-ai" href={MONI_GPT_URL} target="_blank" rel="noreferrer">
            <span><b>실제 MONI AI 열기</b><small>ChatGPT에서 운영 AI 테스트</small></span>
            <ExternalIcon />
          </a>

          <div className="moni-mobile-menu-section">
            <span className="moni-mobile-menu-title">기본 조회</span>
            {menuItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
          </div>

          <div className="moni-mobile-menu-foot">
            <span>MONI Mobile MVP 0.1</span>
            <small>AI 모델 API를 이 화면에 추가하지 않습니다.</small>
          </div>
        </aside>
      </div>

      <style jsx global>{`
        html.moni-mobile-mvp-active,
        body.moni-mobile-mvp-active {
          margin: 0 !important;
          min-height: 100% !important;
          overflow: hidden !important;
          background: #f7f7f8 !important;
          color-scheme: light !important;
        }

        body.moni-mobile-mvp-active [data-global-moni-agent] {
          display: none !important;
        }

        .moni-mobile-root,
        .moni-mobile-root *,
        .moni-mobile-root *::before,
        .moni-mobile-root *::after { box-sizing: border-box; }

        .moni-mobile-root {
          position: fixed;
          inset: 0;
          z-index: 1000;
          width: 100%;
          min-height: 100dvh;
          background: #f7f7f8;
          color: #202123;
          font-family: Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .moni-mobile-app {
          position: relative;
          display: flex;
          width: min(100%, 760px);
          height: 100dvh;
          margin: 0 auto;
          flex-direction: column;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 0 48px rgba(15, 23, 42, 0.06);
        }

        .moni-mobile-header {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: 44px 1fr 44px;
          min-height: calc(56px + env(safe-area-inset-top));
          align-items: end;
          border-bottom: 1px solid #ececf1;
          background: rgba(255,255,255,0.96);
          padding: env(safe-area-inset-top) 12px 7px;
          backdrop-filter: blur(16px);
        }

        .moni-mobile-icon-button,
        .moni-mobile-header-spacer {
          width: 44px;
          height: 44px;
        }

        .moni-mobile-icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: #343541;
        }

        .moni-mobile-icon-button:active { background: #f2f2f4; }
        .moni-mobile-icon-button svg { width: 23px; height: 23px; }

        .moni-mobile-brand {
          display: flex;
          height: 44px;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: #202123;
        }

        .moni-mobile-brand i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #19a37a;
          box-shadow: 0 0 0 3px rgba(25,163,122,0.10);
        }

        .moni-mobile-conversation {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          background: #fff;
          scrollbar-width: none;
        }
        .moni-mobile-conversation::-webkit-scrollbar { display: none; }

        .moni-mobile-conversation-inner {
          width: min(100%, 680px);
          min-height: 100%;
          margin: 0 auto;
          padding: clamp(60px, 11vh, 104px) 20px 120px;
        }

        .moni-mobile-greeting {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .moni-mobile-mark {
          display: grid;
          width: 48px;
          height: 48px;
          place-items: center;
          margin-bottom: 20px;
          border-radius: 15px;
          background: #202123;
          color: white;
          font-size: 20px;
          font-weight: 800;
          box-shadow: 0 7px 20px rgba(32,33,35,0.12);
        }

        .moni-mobile-greeting h1 {
          margin: 0;
          color: #202123;
          font-size: clamp(23px, 6vw, 29px);
          font-weight: 700;
          line-height: 1.25;
          letter-spacing: -0.035em;
        }

        .moni-mobile-greeting p {
          max-width: 420px;
          margin: 11px 0 0;
          color: #71717a;
          font-size: 13px;
          line-height: 1.55;
          letter-spacing: -0.01em;
        }

        .moni-mobile-starters {
          display: grid;
          gap: 9px;
          max-width: 520px;
          margin: 34px auto 0;
        }

        .moni-mobile-starters button {
          width: 100%;
          min-height: 48px;
          border: 1px solid #e4e4e7;
          border-radius: 14px;
          background: #fff;
          padding: 12px 15px;
          color: #3f3f46;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .moni-mobile-starters button:active { background: #f7f7f8; border-color: #d4d4d8; }

        .moni-mobile-preview-thread {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 40px;
        }

        .moni-mobile-user-message {
          align-self: flex-end;
          max-width: 84%;
          border-radius: 20px 20px 5px 20px;
          background: #f1f1f3;
          padding: 11px 15px;
          color: #27272a;
          font-size: 14px;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .moni-mobile-composer-wrap {
          position: relative;
          z-index: 6;
          flex: 0 0 auto;
          background: linear-gradient(180deg, rgba(255,255,255,0), #fff 20px);
          padding: 18px 12px calc(8px + env(safe-area-inset-bottom));
        }

        .moni-mobile-composer {
          display: flex;
          width: min(100%, 680px);
          min-height: 56px;
          margin: 0 auto;
          align-items: flex-end;
          gap: 7px;
          border: 1px solid #d9d9df;
          border-radius: 26px;
          background: #fff;
          padding: 6px;
          box-shadow: 0 2px 13px rgba(0,0,0,0.07);
        }

        .moni-mobile-attach,
        .moni-mobile-send {
          display: inline-flex;
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 50%;
        }

        .moni-mobile-attach { background: transparent; color: #52525b; }
        .moni-mobile-attach:active { background: #f4f4f5; }
        .moni-mobile-attach svg { width: 22px; height: 22px; }

        .moni-mobile-composer textarea {
          width: 100%;
          height: 44px;
          max-height: 128px;
          min-height: 44px;
          flex: 1;
          resize: none;
          overflow-y: auto;
          border: 0;
          outline: 0;
          background: transparent;
          padding: 11px 3px 8px;
          color: #202123;
          font: inherit;
          font-size: 16px;
          line-height: 1.45;
        }
        .moni-mobile-composer textarea::placeholder { color: #8e8e93; }

        .moni-mobile-send {
          background: #202123;
          color: white;
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .moni-mobile-send:disabled { opacity: 0.18; }
        .moni-mobile-send:not(:disabled):active { transform: scale(0.94); }
        .moni-mobile-send svg { width: 21px; height: 21px; }

        .moni-mobile-handoff-note {
          margin: 7px auto 0;
          color: #9a9aa1;
          font-size: 10px;
          line-height: 1.3;
          text-align: center;
        }

        .moni-mobile-toast {
          width: max-content;
          max-width: calc(100% - 24px);
          margin: 0 auto 9px;
          border-radius: 999px;
          background: #202123;
          padding: 8px 12px;
          color: white;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.4;
          text-align: center;
          box-shadow: 0 6px 22px rgba(0,0,0,0.14);
        }

        .moni-mobile-drawer-layer {
          position: fixed;
          inset: 0;
          z-index: 1200;
          pointer-events: none;
          visibility: hidden;
        }
        .moni-mobile-drawer-layer.is-open { pointer-events: auto; visibility: visible; }

        .moni-mobile-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: rgba(0,0,0,0.28);
          opacity: 0;
          transition: opacity 180ms ease;
          backdrop-filter: blur(1px);
        }
        .moni-mobile-drawer-layer.is-open .moni-mobile-backdrop { opacity: 1; }

        .moni-mobile-drawer {
          position: absolute;
          inset: 0 auto 0 0;
          display: flex;
          width: min(82vw, 328px);
          min-height: 100dvh;
          flex-direction: column;
          overflow-y: auto;
          background: #f7f7f8;
          padding: calc(12px + env(safe-area-inset-top)) 12px calc(16px + env(safe-area-inset-bottom));
          box-shadow: 16px 0 48px rgba(0,0,0,0.16);
          transform: translateX(-102%);
          transition: transform 210ms cubic-bezier(.2,.8,.2,1);
        }
        .moni-mobile-drawer-layer.is-open .moni-mobile-drawer { transform: translateX(0); }

        .moni-mobile-drawer-head {
          display: flex;
          min-height: 54px;
          align-items: center;
          justify-content: space-between;
          padding: 3px 4px 10px;
        }
        .moni-mobile-drawer-head > div { min-width: 0; display: flex; flex-direction: column; }
        .moni-mobile-drawer-head strong { color: #202123; font-size: 18px; font-weight: 800; }
        .moni-mobile-drawer-head span { max-width: 210px; overflow: hidden; color: #8a8a91; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .moni-mobile-drawer-head button {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 11px;
          background: transparent;
          color: #52525b;
          font-size: 25px;
          font-weight: 300;
        }

        .moni-mobile-live-ai {
          display: flex;
          min-height: 68px;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 7px 2px 19px;
          border-radius: 16px;
          background: #202123;
          padding: 13px 14px;
          color: white;
          text-decoration: none;
        }
        .moni-mobile-live-ai span { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
        .moni-mobile-live-ai b { font-size: 13px; font-weight: 750; }
        .moni-mobile-live-ai small { color: #bdbdc4; font-size: 10px; }
        .moni-mobile-live-ai svg { width: 20px; height: 20px; flex: 0 0 20px; color: #d7d7dc; }

        .moni-mobile-menu-section { display: flex; flex-direction: column; gap: 3px; }
        .moni-mobile-menu-title { padding: 0 12px 6px; color: #9b9ba1; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; }
        .moni-mobile-menu-section a {
          min-height: 46px;
          border-radius: 12px;
          padding: 13px 12px;
          color: #34343a;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }
        .moni-mobile-menu-section a:active { background: #e9e9ec; }

        .moni-mobile-menu-foot {
          display: flex;
          margin-top: auto;
          flex-direction: column;
          gap: 3px;
          border-top: 1px solid #e2e2e5;
          padding: 15px 10px 2px;
          color: #8c8c92;
        }
        .moni-mobile-menu-foot span { font-size: 10px; font-weight: 700; }
        .moni-mobile-menu-foot small { font-size: 9px; line-height: 1.4; }

        @media (min-width: 761px) {
          .moni-mobile-root { background: #ededf0; }
        }

        @media (max-width: 420px) {
          .moni-mobile-conversation-inner { padding-left: 16px; padding-right: 16px; }
          .moni-mobile-greeting p { max-width: 310px; }
          .moni-mobile-composer-wrap { padding-left: 9px; padding-right: 9px; }
          .moni-mobile-handoff-note { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .moni-mobile-drawer,
          .moni-mobile-backdrop,
          .moni-mobile-send { transition: none !important; }
        }
      `}</style>
    </main>
  )
}
