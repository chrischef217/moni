'use client'

const MONI_GPT_URL = 'https://chatgpt.com/g/g-6a7af9094b08819183be32a5dc97ef7b-moni'

export default function GlobalMoniAgent() {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">
      <div className="rounded-xl border border-[#cfe5df] bg-white/95 px-3 py-2 text-xs font-semibold text-[#526f7e] shadow-lg backdrop-blur">
        MONI 대화는 ChatGPT에서 실행됩니다.
      </div>
      <a
        href={MONI_GPT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-14 items-center gap-3 rounded-2xl bg-[#0a8f78] px-5 font-black text-white shadow-[0_12px_30px_rgba(10,143,120,0.28)] transition hover:-translate-y-0.5 hover:bg-[#087d69]"
        aria-label="ChatGPT에서 MONI 열기"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 text-lg">M</span>
        <span className="text-sm">MONI와 대화하기</span>
      </a>
    </div>
  )
}
