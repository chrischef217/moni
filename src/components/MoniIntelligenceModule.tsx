'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Severity = 'critical' | 'high' | 'attention' | 'data' | 'good'
type Item = {
  id: string
  severity: Severity
  priority: number
  title: string
  summary: string
  evidence: string[]
  action: string
  href: string
  source: string
  rule: string
}
type Payload = {
  ok: boolean
  error?: string
  generated_at: string
  engine: { version: string; principle: string }
  counts: Record<Severity, number>
  top_action: Item | null
  items: Item[]
  source_status: Record<string, boolean>
}

function monthNow() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
}

function severityLabel(value: Severity) {
  if (value === 'critical') return '즉시 조치'
  if (value === 'high') return '높은 우선순위'
  if (value === 'attention') return '주의'
  if (value === 'data') return '데이터 보완'
  return '정상'
}

function severityCardClass(value: Severity) {
  if (value === 'critical') return 'border-[#f2b6bc] bg-[#fff6f7] text-[#8f3340]'
  if (value === 'high') return 'border-[#efc998] bg-[#fff9f1] text-[#93601a]'
  if (value === 'attention') return 'border-[#ead79b] bg-[#fffcef] text-[#8b6a16]'
  if (value === 'data') return 'border-[#bdd9ea] bg-[#f4faff] text-[#356b8c]'
  return 'border-[#b9dfcf] bg-[#f3fbf7] text-[#277356]'
}

function dotClass(value: Severity) {
  if (value === 'critical') return 'bg-[#ef6b75]'
  if (value === 'high') return 'bg-[#f09a37]'
  if (value === 'attention') return 'bg-[#d9ad34]'
  if (value === 'data') return 'bg-[#59a7d6]'
  return 'bg-[#49b98a]'
}

function countTileClass(value: Severity) {
  if (value === 'critical') return 'border-[#f1c7cb] bg-[#fff8f8] text-[#b34a54]'
  if (value === 'high') return 'border-[#efd3ad] bg-[#fffbf4] text-[#a46f24]'
  if (value === 'attention') return 'border-[#eadcaf] bg-[#fffdf6] text-[#8d731f]'
  if (value === 'data') return 'border-[#c9dfec] bg-[#f7fbfe] text-[#3b7698]'
  return 'border-[#c8e5d8] bg-[#f7fcf9] text-[#2f7b5c]'
}

export default function MoniIntelligenceModule() {
  const [month, setMonth] = useState(monthNow())
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string>('')

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/intelligence?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json() as Payload
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'MONI Intelligence를 불러오지 못했습니다.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'MONI Intelligence를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [month])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const operational = useMemo(() => (data?.items ?? []).filter((item) => item.severity !== 'data'), [data])
  const dataIssues = useMemo(() => (data?.items ?? []).filter((item) => item.severity === 'data'), [data])

  function go(item: Item) {
    if (item.href.includes('moni_target=production-overview')) {
      window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({ category: 'production', target: '생산 개요', label: '생산 대시보드', parentTarget: '생산관리' }))
      window.location.href = '/?legacy=1'
      return
    }
    if (item.href.includes('moni_target=raw-materials')) {
      window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({ category: 'production', target: '원재료 관리', label: '원재료 관리', parentTarget: '생산관리' }))
      window.location.href = '/?legacy=1'
      return
    }
    window.location.href = item.href
  }

  if (loading) {
    return <main data-moni-intelligence className="min-h-screen bg-transparent px-4 py-6 md:px-6"><div className="mx-auto max-w-[1500px] rounded-[24px] border border-[#d2e3ec] bg-white/95 p-16 text-center text-[#6f8796] shadow-[0_12px_34px_rgba(44,84,108,0.07)]">MONI Intelligence가 현재 경영 데이터를 판정하는 중입니다.</div></main>
  }

  const top = data?.top_action
  return <main data-moni-intelligence className="min-h-screen bg-transparent px-4 py-5 text-[#17384d] md:px-6"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="overflow-hidden rounded-[26px] border border-[#cfe1eb] bg-white/95 shadow-[0_14px_36px_rgba(43,84,109,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-6 p-6 lg:p-8">
        <div className="max-w-[900px]"><p className="text-xs font-black uppercase tracking-[0.18em] text-[#8c72d7]">MONI INTELLIGENCE V7</p><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[#17384d] lg:text-4xl">오늘 해야 할 일을 숫자 근거로 정렬합니다.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#678293]">생성형 AI의 추측이 아니라 수금·영업목표·현금흐름·생산 데이터와 명시된 규칙으로 우선순위를 판정합니다.</p></div>
        <div className="flex items-end gap-2"><label className="text-xs font-bold text-[#6e8796]"><span className="mb-1.5 block">판정 월</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-11 rounded-xl border border-[#cfe0ea] bg-white px-3 text-sm font-semibold text-[#24485f] outline-none focus:border-[#91bfd4]" /></label><button type="button" disabled={refreshing} onClick={() => void load(true)} className="h-11 rounded-xl border border-[#9fb8c7] bg-white px-4 text-sm font-black text-[#294b60] shadow-sm disabled:opacity-50">{refreshing ? '판정 중...' : '다시 판정'}</button></div>
      </div>
      <div className="grid gap-3 border-t border-[#dfebf1] bg-[#f8fbfd] p-4 sm:grid-cols-5">
        {(['critical','high','attention','data','good'] as Severity[]).map((severity) => <div key={severity} className={`rounded-2xl border px-5 py-4 ${countTileClass(severity)}`}><div className="text-xs font-bold opacity-75">{severityLabel(severity)}</div><div className="mt-1 text-2xl font-black text-[#17384d]">{data?.counts?.[severity] ?? 0}</div></div>)}
      </div>
    </header>

    {error && <div className="rounded-2xl border border-[#efb7bd] bg-[#fff6f7] p-4 text-sm font-semibold text-[#a94752]">{error}</div>}

    {top && <section className={`rounded-[26px] border p-6 shadow-[0_10px_28px_rgba(52,85,106,0.05)] lg:p-7 ${severityCardClass(top.severity)}`}><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-4xl"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em]"><span className={`h-2.5 w-2.5 rounded-full ${dotClass(top.severity)}`} /> TOP ACTION · {severityLabel(top.severity)}</div><h2 className="mt-3 text-2xl font-black tracking-[-0.025em] text-[#17384d] lg:text-3xl">{top.title}</h2><p className="mt-2 text-sm font-medium leading-6 text-[#5f7786]">{top.summary}</p><div className="mt-4 flex flex-wrap gap-2">{top.evidence.map((evidence) => <span key={evidence} className="rounded-xl border border-current/20 bg-white/80 px-3 py-1.5 text-xs font-bold">{evidence}</span>)}</div></div><button type="button" onClick={() => go(top)} className="rounded-xl border border-[#d4e1e8] bg-white px-5 py-3 text-sm font-black text-[#17384d] shadow-sm">{top.action} →</button></div></section>}

    <section className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-5 shadow-[0_12px_32px_rgba(43,84,109,0.06)] lg:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#db6b72]">PRIORITY BOARD</p><h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-[#17384d]">경영 행동 우선순위</h2></div><span className="text-xs font-semibold text-[#8297a5]">높은 위험부터 자동 정렬</span></div><div className="mt-5 space-y-3">{operational.map((item, index) => <div key={item.id} className={`overflow-hidden rounded-2xl border ${severityCardClass(item.severity)}`}><div className="flex flex-wrap items-start gap-4 p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d8e3e9] bg-white/90 text-sm font-black text-[#415f72] shadow-sm">{index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dotClass(item.severity)}`} /><span className="text-xs font-black">{severityLabel(item.severity)}</span><span className="text-xs font-semibold text-[#8a9da8]">· {item.source}</span></div><h3 className="mt-1.5 font-black text-[#17384d]">{item.title}</h3><p className="mt-1 text-sm font-medium leading-5 text-[#647c8b]">{item.summary}</p></div><div className="flex gap-2"><button type="button" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)} className="rounded-xl border border-current/20 bg-white/65 px-3 py-2 text-xs font-bold">근거</button><button type="button" onClick={() => go(item)} className="rounded-xl border border-[#d6e3ea] bg-white px-4 py-2 text-xs font-black text-[#17384d] shadow-sm">{item.action}</button></div></div>{expanded === item.id && <div className="border-t border-current/15 bg-white/45 px-4 py-4 text-xs font-medium leading-6 text-[#5e7685]"><div><b className="text-[#344f61]">판정 규칙:</b> {item.rule}</div><div className="mt-1"><b className="text-[#344f61]">근거:</b> {item.evidence.join(' · ')}</div></div>}</div>)}{!operational.length && <div className="rounded-2xl border border-[#bee1d1] bg-[#f4fbf7] p-6 text-center font-semibold text-[#34755a]">현재 운영 우선순위 항목이 없습니다.</div>}</div></section>

    <section className="rounded-[26px] border border-[#cfe1eb] bg-white/95 p-5 shadow-[0_12px_32px_rgba(43,84,109,0.06)] lg:p-6"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#4d91ba]">DATA QUALITY</p><h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-[#17384d]">판단 정확도를 떨어뜨리는 데이터</h2><p className="mt-1 text-sm text-[#718896]">경영 위험과 데이터 누락을 같은 것으로 취급하지 않습니다. 아래 항목은 숫자 판단을 더 정확하게 만들기 위한 보완사항입니다.</p></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{dataIssues.map((item) => <button key={item.id} type="button" onClick={() => go(item)} className="rounded-2xl border border-[#c6ddea] bg-[#f7fbfe] p-4 text-left"><div className="flex items-center gap-2 text-xs font-black text-[#3d7b9f]"><span className="h-2 w-2 rounded-full bg-[#5ba6d2]" />{item.source}</div><div className="mt-2 font-black text-[#17384d]">{item.title}</div><div className="mt-1 text-sm leading-5 text-[#718896]">{item.summary}</div><div className="mt-3 text-xs font-bold text-[#3d7b9f]">{item.action} →</div></button>)}{!dataIssues.length && <div className="col-span-full rounded-2xl border border-[#bee1d1] bg-[#f4fbf7] p-6 text-center font-semibold text-[#34755a]">현재 규칙상 주요 데이터 누락이 없습니다.</div>}</div></section>

    <section className="rounded-[24px] border border-[#d4e3eb] bg-[#f8fbfd] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#7f93a0]">ENGINE TRANSPARENCY</p><h2 className="mt-1 text-lg font-black text-[#17384d]">판정 방식</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-[#708795]">{data?.engine.principle}</p></div><div className="text-right text-xs font-semibold text-[#8297a5]"><div>{data?.engine.version}</div><div className="mt-1">최근 판정 {data?.generated_at ? new Date(data.generated_at).toLocaleString('ko-KR') : '-'}</div></div></div></section>
  </div></main>
}
