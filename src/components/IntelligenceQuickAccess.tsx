'use client'

import { useEffect, useState } from 'react'

type Payload = {
  ok: boolean
  counts?: { critical?: number; high?: number; attention?: number; data?: number }
  top_action?: { severity: string; title: string; action: string } | null
}

export default function IntelligenceQuickAccess() {
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
        const response = await fetch(`/api/moni/intelligence?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' })
        const payload = await response.json() as Payload
        if (active && response.ok && payload.ok) setData(payload)
      } catch {
        // 메인 대시보드 자체를 방해하지 않는다.
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const urgent = Number(data?.counts?.critical ?? 0) + Number(data?.counts?.high ?? 0)
  const top = data?.top_action

  return (
    <button
      type="button"
      onClick={() => { window.location.href = '/intelligence' }}
      className={`fixed bottom-5 right-5 z-[900] w-[min(390px,calc(100vw-32px))] rounded-2xl border p-4 text-left shadow-2xl backdrop-blur-sm transition hover:-translate-y-0.5 ${
        urgent > 0
          ? 'border-red-500/40 bg-[#17121c]/95 text-red-100'
          : 'border-violet-500/35 bg-[#0b172b]/95 text-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">MONI INTELLIGENCE</span>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${urgent > 0 ? 'bg-red-500/20 text-red-200' : 'bg-emerald-500/15 text-emerald-200'}`}>
          {urgent > 0 ? `우선조치 ${urgent}` : '판정 완료'}
        </span>
      </div>
      <div className="mt-2 font-black leading-5">{top?.title || '경영 우선순위 보드 열기'}</div>
      <div className="mt-2 text-xs text-slate-400">근거와 판정 규칙까지 확인 →</div>
    </button>
  )
}
