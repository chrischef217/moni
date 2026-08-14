'use client'

import MoniInternalChat from '@/components/MoniInternalChat'

export default function MoniMobileChatShell() {
  return (
    <main
      data-moni-mobile-ai
      className="moni-mobile-chat-shell fixed inset-0 z-[1000] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f4faf8] text-[#173b52]"
    >
      <header className="shrink-0 border-b border-[#d7e9e5] bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <div aria-hidden="true" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-emerald-300/40 bg-gradient-to-br from-emerald-100 via-cyan-50 to-blue-100 shadow-inner">
            <span className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" />
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#0f8f78]" />
            <span className="mt-3 h-1 w-3 rounded-full bg-[#0f8f78]/70" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black tracking-[-0.02em] text-[#173b52]">MONI</h1>
            <p className="truncate text-[11px] font-semibold text-[#607d8d]">두배 경영·생산 AI</p>
          </div>
          <span className="rounded-full bg-[#e9f8f4] px-2.5 py-1 text-[10px] font-black text-[#0f8f78]">공식 데이터</span>
        </div>
      </header>

      <section aria-label="MONI AI 대화" className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <MoniInternalChat />
      </section>

      <style jsx global>{`
        .moni-mobile-chat-shell {
          overscroll-behavior: none;
          -webkit-text-size-adjust: 100%;
        }
        .moni-mobile-chat-shell .moni-chat-scroll {
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }
        .moni-mobile-chat-shell .moni-chat-composer {
          padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
      `}</style>
    </main>
  )
}
