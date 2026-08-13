'use client'

export default function MoniAgentQualityPanel() {
  return (
    <section className="rounded-2xl border border-[#d8e8e4] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-[#173b52]">MONI AI 실행 방식</h2>
          <p className="mt-2 text-sm leading-6 text-[#526f7e]">
            AI 판단과 대화는 ChatGPT의 MONI GPT에서 실행됩니다. MONI 서버에서는 별도 AI 모델을 실행하지 않습니다.
          </p>
        </div>
        <span className="rounded-full bg-[#edf9f5] px-3 py-1 text-xs font-black text-[#087d69]">ChatGPT Only</span>
      </div>
    </section>
  )
}
