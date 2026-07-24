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

function severityClass(value: Severity) {
  if (value === 'critical') return 'border-red-500/40 bg-red-500/[0.09] text-red-100'
  if (value === 'high') return 'border-orange-500/35 bg-orange-500/[0.07] text-orange-100'
  if (value === 'attention') return 'border-amber-500/35 bg-amber-500/[0.06] text-amber-100'
  if (value === 'data') return 'border-blue-500/30 bg-blue-500/[0.05] text-blue-100'
  return 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-100'
}

function dotClass(value: Severity) {
  if (value === 'critical') return 'bg-red-400'
  if (value === 'high') return 'bg-orange-400'
  if (value === 'attention') return 'bg-amber-300'
  if (value === 'data') return 'bg-blue-400'
  return 'bg-emerald-400'
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
    return <main data-moni-intelligence className="min-h-screen bg-[#071426] px-5 py-8 text-slate-100"><div className="mx-auto max-w-[1500px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">MONI Intelligence가 현재 경영 데이터를 판정하는 중입니다.</div></main>
  }

  const top = data?.top_action
  return <main data-moni-intelligence className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1500px] space-y-5">
    <header className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0a1b30] shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-5 p-6 lg:p-8">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">MONI INTELLIGENCE V7</p><h1 className="mt-2 text-3xl font-black lg:text-4xl">오늘 해야 할 일을 숫자 근거로 정렬합니다.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">생성형 AI의 추측이 아니라 수금·영업목표·현금흐름·생산 데이터와 명시된 규칙으로 우선순위를 판정합니다.</p></div>
        <div className="flex items-end gap-2"><label className="text-xs text-slate-500"><span className="mb-1 block">판정 월</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" /></label><button type="button" disabled={refreshing} onClick={() => void load(true)} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold hover:border-slate-400 disabled:opacity-50">{refreshing ? '판정 중...' : '다시 판정'}</button></div>
      </div>
      <div className="grid gap-px bg-slate-700/70 sm:grid-cols-5">
        {(['critical','high','attention','data','good'] as Severity[]).map((severity) => <div key={severity} className="bg-[#08182b] px-5 py-4"><div className="text-xs text-slate-500">{severityLabel(severity)}</div><div className="mt-1 text-2xl font-black text-white">{data?.counts?.[severity] ?? 0}</div></div>)}
      </div>
    </header>

    {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

    {top && <section className={`rounded-3xl border p-6 lg:p-8 ${severityClass(top.severity)}`}><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-4xl"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em]"><span className={`h-2.5 w-2.5 rounded-full ${dotClass(top.severity)}`} /> TOP ACTION · {severityLabel(top.severity)}</div><h2 className="mt-3 text-2xl font-black lg:text-3xl">{top.title}</h2><p className="mt-2 text-sm leading-6 opacity-75">{top.summary}</p><div className="mt-4 flex flex-wrap gap-2">{top.evidence.map((evidence) => <span key={evidence} className="rounded-xl border border-current/20 bg-black/10 px-3 py-1.5 text-xs font-bold">{evidence}</span>)}</div></div><button type="button" onClick={() => go(top)} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-900">{top.action} →</button></div></section>}

    <section className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 lg:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-red-300">PRIORITY BOARD</p><h2 className="mt-1 text-2xl font-black">경영 행동 우선순위</h2></div><span className="text-xs text-slate-500">높은 위험부터 자동 정렬</span></div><div className="mt-5 space-y-3">{operational.map((item, index) => <div key={item.id} className={`rounded-2xl border ${severityClass(item.severity)}`}><div className="flex flex-wrap items-start gap-4 p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 text-sm font-black">{index + 1}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dotClass(item.severity)}`} /><span className="text-xs font-black">{severityLabel(item.severity)}</span><span className="text-xs opacity-50">· {item.source}</span></div><h3 className="mt-1 font-black">{item.title}</h3><p className="mt-1 text-sm leading-5 opacity-70">{item.summary}</p></div><div className="flex gap-2"><button type="button" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)} className="rounded-xl border border-current/20 px-3 py-2 text-xs font-bold">근거</button><button type="button" onClick={() => go(item)} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-900">{item.action}</button></div></div>{expanded === item.id && <div className="border-t border-current/15 px-4 py-4 text-xs leading-6 opacity-75"><div><b>판정 규칙:</b> {item.rule}</div><div className="mt-1"><b>근거:</b> {item.evidence.join(' · ')}</div></div>}</div>)}{!operational.length && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-6 text-center text-emerald-200">현재 운영 우선순위 항목이 없습니다.</div>}</div></section>

    <section className="rounded-3xl border border-slate-700 bg-slate-900/55 p-5 lg:p-6"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-blue-300">DATA QUALITY</p><h2 className="mt-1 text-2xl font-black">판단 정확도를 떨어뜨리는 데이터</h2><p className="mt-1 text-sm text-slate-500">경영 위험과 데이터 누락을 같은 것으로 취급하지 않습니다. 아래 항목은 숫자 판단을 더 정확하게 만들기 위한 보완사항입니다.</p></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{dataIssues.map((item) => <button key={item.id} type="button" onClick={() => go(item)} className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-4 text-left transition hover:border-blue-400/50"><div className="flex items-center gap-2 text-xs font-black text-blue-300"><span className="h-2 w-2 rounded-full bg-blue-400" />{item.source}</div><div className="mt-2 font-black text-white">{item.title}</div><div className="mt-1 text-sm leading-5 text-slate-500">{item.summary}</div><div className="mt-3 text-xs font-bold text-blue-300">{item.action} →</div></button>)}{!dataIssues.length && <div className="col-span-full rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-6 text-center text-emerald-200">현재 규칙상 주요 데이터 누락이 없습니다.</div>}</div></section>

    <section className="rounded-3xl border border-slate-700 bg-[#08182b] p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">ENGINE TRANSPARENCY</p><h2 className="mt-1 text-lg font-black">판정 방식</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">{data?.engine.principle}</p></div><div className="text-right text-xs text-slate-500"><div>{data?.engine.version}</div><div className="mt-1">최근 판정 {data?.generated_at ? new Date(data.generated_at).toLocaleString('ko-KR') : '-'}</div></div></div></section>
  </div></main>
}
