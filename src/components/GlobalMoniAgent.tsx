'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import MoniInternalChat from '@/components/MoniInternalChat'

export default function GlobalMoniAgent() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // The floating MONI launcher and speech bubble belong to the PC product only.
  // Mobile already renders MONI chat as the entire product surface.
  if (pathname === '/mobile' || pathname.startsWith('/mobile/')) return null

  return (
    <div data-global-moni-agent className="pointer-events-none fixed bottom-4 right-4 z-[130] md:bottom-6 md:right-6">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto absolute bottom-[78px] right-0 w-[min(300px,calc(100vw-32px))] rounded-2xl border border-[#b8ddd5] bg-[#f8fffc]/95 px-4 py-3 text-left text-sm font-bold leading-5 text-[#173b52] shadow-[0_18px_55px_rgba(23,59,82,0.18)] backdrop-blur-lg"
        >
          <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-[#0f8f78]">MONI</span>
          MONI에게 무엇이든 물어보세요.
          <span className="absolute -bottom-2 right-7 h-4 w-4 rotate-45 border-b border-r border-[#b8ddd5] bg-[#f8fffc]" />
        </button>
      )}

      {open && (
        <section className="pointer-events-auto absolute bottom-[82px] right-0 flex h-[min(620px,calc(100vh-110px))] w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-[#bfded8] bg-[#f7fcfb]/98 text-[#173b52] shadow-[0_28px_90px_rgba(23,59,82,0.24)] backdrop-blur-xl">
          <header className="flex items-center justify-between gap-3 border-b border-[#d7e9e5] bg-white/85 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-emerald-300/40 bg-gradient-to-br from-emerald-100 via-cyan-50 to-blue-100 shadow-inner">
                <span className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" />
                <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" />
                <span className="mt-3 h-1 w-3 rounded-full bg-[#0f8f78]/70" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-[#173b52]">MONI</h2>
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-[#087d69]">MONI CHAT</span>
                </div>
                <p className="truncate text-xs text-[#607d8d]">MONI 자체 채팅 화면</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-[#607d8d] hover:bg-[#edf7f4] hover:text-[#173b52]" aria-label="MONI 닫기">×</button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div className="mr-4 rounded-2xl border border-[#d8e8e4] bg-white px-4 py-3 text-sm leading-6 text-[#263f4d] shadow-[0_5px_18px_rgba(23,59,82,0.04)]">
                기존 MONI 캐릭터와 자체 채팅 화면을 복구했습니다. 이 창에서 외부 GPT 페이지로 자동 이동하지 않습니다.
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                현재 ChatGPT 구독형 Custom GPT는 외부 웹사이트 안에 직접 삽입할 수 없기 때문에, 서버 모델 API를 다시 켜지 않은 상태에서는 실제 AI 답변 연결은 활성화하지 않았습니다.
              </div>
            </div>
          </div>

          <footer className="border-t border-[#d7e9e5] bg-white/90 p-3">
            <div className="rounded-2xl border border-[#c9dfda] bg-[#f7fbfa] p-2">
              <div className="flex items-end gap-2">
                <button type="button" disabled className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-[#607d8d] opacity-35" aria-label="파일 첨부 비활성">＋</button>
                <textarea disabled rows={1} placeholder="MONI 내부 ChatGPT 연결 방식 확정 후 활성화" className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[#173b52] outline-none placeholder:text-[#8aa0aa] disabled:cursor-not-allowed" />
                <button type="button" disabled className="rounded-xl bg-[#21b99a] px-4 py-2.5 text-sm font-black text-white opacity-35">전송</button>
              </div>
            </div>
            <div className="mt-2 px-1 text-[10px] text-[#78909d]">외부 GPT 자동 이동 없음 · 서버 모델 API 비활성</div>
          </footer>

          <div className="absolute inset-x-0 bottom-0 top-[73px] z-20 flex flex-col bg-[#f7fcfb]">
            <MoniInternalChat />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="MONI Agent 열기"
        className={`moni-agent-character pointer-events-auto relative h-[68px] w-[68px] rounded-[24px] border shadow-[0_16px_48px_rgba(2,6,23,0.35)] transition hover:-translate-y-1 ${open ? 'border-emerald-300/55 bg-[#102b38]' : 'border-white/25 bg-[#0c2337]'}`}
      >
        <span className="absolute -top-2 left-1/2 h-3 w-1 -translate-x-1/2 rounded-full bg-emerald-300/80" />
        <span className="absolute -top-3.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-emerald-100/40 bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.65)]" />
        <span className="absolute inset-1 rounded-[20px] bg-gradient-to-br from-emerald-300/20 via-cyan-300/10 to-blue-500/20" />
        <span className="moni-agent-eye absolute left-[18px] top-[23px] h-2.5 w-2.5 rounded-full bg-emerald-50" />
        <span className="moni-agent-eye absolute right-[18px] top-[23px] h-2.5 w-2.5 rounded-full bg-emerald-50 [animation-delay:2.7s]" />
        <span className="absolute bottom-[17px] left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-emerald-100/80" />
        <span className="absolute -left-1 top-8 h-4 w-1.5 rounded-full bg-cyan-300/50" />
        <span className="absolute -right-1 top-8 h-4 w-1.5 rounded-full bg-cyan-300/50" />
        {!open && <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#071426] bg-emerald-400" />}
      </button>

      <style jsx global>{`
        .moni-agent-character { animation: moniAgentBreathe 4.6s ease-in-out infinite; }
        .moni-agent-eye { animation: moniAgentBlink 5.2s ease-in-out infinite; transform-origin: center; }
        @keyframes moniAgentBreathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
        @keyframes moniAgentBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(0.12); } }
        @media (prefers-reduced-motion: reduce) { .moni-agent-character, .moni-agent-eye { animation: none !important; } }
      `}</style>
    </div>
  )
}
