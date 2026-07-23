'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AllowanceSessionUser } from '@/types/allowance'

type SalesPayload = {
  ok: boolean
  error?: string
  summary: { order_count: number; total_amount: number }
}

type ProductionAlert = { id: string; severity: 'danger' | 'warning' | 'info' | 'success'; title: string; detail: string; metric?: string }
type ProductionPayload = {
  ok: boolean
  error?: string
  kpis: {
    production: { planned_due_g: number; actual_g: number; attainment_rate: number; month_total_planned_g: number; overdue_work_orders: number }
    loss: { loss_g: number; loss_rate: number; known_loss_cost_won: number; incomplete_price_records: number }
    risk: { upcoming_work_orders: number; risk_work_orders: number; shortage_materials: number; known_purchase_cost_won: number; unpriced_shortage_materials: number; recipe_issue_count: number }
  }
  pricing: { known_input_cost_won: number; unpriced_used_material_count: number }
  alerts: ProductionAlert[]
}

type ReceivableOrder = {
  id: string
  statement_number: string
  sale_date: string
  due_date?: string | null
  client_name: string
  total_amount: number
  received_amount: number
  outstanding_amount: number
  collection_state: 'paid' | 'no_due_date' | 'overdue' | 'due_today' | 'due_soon' | 'scheduled'
  collection_label: string
  d_day: number | null
  unverified_partial: boolean
}

type ReceivablesPayload = {
  ok: boolean
  error?: string
  orders: ReceivableOrder[]
  summary: {
    outstanding_amount: number
    overdue_amount: number
    overdue_count: number
    due_soon_amount: number
    due_soon_count: number
    no_due_date_count: number
    received_this_month: number
    open_order_count: number
  }
}

type State = { sales: SalesPayload | null; production: ProductionPayload | null; receivables: ReceivablesPayload | null }

const salesHref = '/business-management?tab=sales-management&view=sales'
const receivablesHref = '/business-management?tab=sales-management&view=receivables'
const pipelineHref = '/business-management?tab=sales&view=pipeline'
const accountingHref = '/business-management?tab=accounting&view=settlements'

function kstMonth() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
}

function kstTodayLabel() {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())
}

function won(value: unknown) {
  const numeric = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number.isFinite(numeric) ? numeric : 0))}원`
}

function percent(value: unknown, digits = 1) {
  const numeric = Number(value ?? 0)
  return `${(Number.isFinite(numeric) ? numeric : 0).toFixed(digits)}%`
}

function kg(valueG: unknown) {
  const numeric = Number(valueG ?? 0) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: numeric >= 100 ? 0 : 1 }).format(Number.isFinite(numeric) ? numeric : 0)}kg`
}

function Dot({ tone }: { tone: 'danger' | 'warning' | 'success' | 'info' }) {
  const cls = tone === 'danger' ? 'bg-red-400' : tone === 'warning' ? 'bg-amber-300' : tone === 'success' ? 'bg-emerald-400' : 'bg-blue-400'
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} />
}

function Card({ label, value, note, tone = 'default', onClick }: { label: string; value: string; note: string; tone?: 'default' | 'money' | 'danger' | 'warning' | 'pending'; onClick?: () => void }) {
  const cls = tone === 'money' ? 'border-emerald-500/30 bg-emerald-500/[0.08]' : tone === 'danger' ? 'border-red-500/30 bg-red-500/[0.08]' : tone === 'warning' ? 'border-amber-500/30 bg-amber-500/[0.06]' : tone === 'pending' ? 'border-violet-500/25 bg-violet-500/[0.05]' : 'border-slate-700 bg-[#0b1b30]'
  return <button type="button" onClick={onClick} disabled={!onClick} className={`min-h-[148px] rounded-2xl border p-5 text-left transition ${cls} ${onClick ? 'hover:-translate-y-0.5 hover:border-slate-500' : 'cursor-default'}`}><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</div><div className={`mt-3 text-3xl font-black ${tone === 'danger' ? 'text-red-200' : tone === 'money' ? 'text-emerald-200' : tone === 'warning' ? 'text-amber-200' : tone === 'pending' ? 'text-violet-200' : 'text-white'}`}>{value}</div><div className="mt-2 text-sm leading-5 text-slate-400">{note}</div></button>
}

function Section({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section><div className="mb-3"><div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">{eyebrow}</div><h2 className="mt-1 text-2xl font-black text-white">{title}</h2></div>{children}</section>
}

function collectionTone(row: ReceivableOrder) {
  if (row.collection_state === 'overdue') return 'border-red-500/30 bg-red-500/10 text-red-200'
  if (row.collection_state === 'due_today' || row.collection_state === 'due_soon') return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  if (row.collection_state === 'no_due_date') return 'border-slate-600 bg-slate-800 text-slate-300'
  return 'border-blue-500/30 bg-blue-500/10 text-blue-200'
}

export default function MainControlTowerDashboard({ session }: { session: AllowanceSessionUser }) {
  const [state, setState] = useState<State>({ sales: null, production: null, receivables: null })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    setError('')
    try {
      const month = kstMonth()
      const [salesResponse, productionResponse, receivableResponse] = await Promise.all([
        fetch(`/api/moni/sales-operations?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/moni/production-dashboard?_=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/moni/receivables?_=${Date.now()}`, { cache: 'no-store' }),
      ])
      const [sales, production, receivables] = await Promise.all([
        salesResponse.json() as Promise<SalesPayload>, productionResponse.json() as Promise<ProductionPayload>, receivableResponse.json() as Promise<ReceivablesPayload>,
      ])
      const messages: string[] = []
      if (!salesResponse.ok || !sales.ok) messages.push(sales.error || '판매 데이터 오류')
      if (!productionResponse.ok || !production.ok) messages.push(production.error || '생산 데이터 오류')
      if (!receivableResponse.ok || !receivables.ok) messages.push(receivables.error || '수금 데이터 오류')
      setState({ sales: salesResponse.ok && sales.ok ? sales : null, production: productionResponse.ok && production.ok ? production : null, receivables: receivableResponse.ok && receivables.ok ? receivables : null })
      setError(messages.join(' / '))
      setUpdatedAt(new Date())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '통합 대시보드 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer) }, [load])

  const sales = state.sales?.summary
  const production = state.production
  const ar = state.receivables?.summary
  const collectionRows = useMemo(() => (state.receivables?.orders ?? []).filter((row) => row.outstanding_amount > 0).sort((a, b) => {
    const priority = (row: ReceivableOrder) => row.collection_state === 'overdue' ? 0 : row.collection_state === 'due_today' ? 1 : row.collection_state === 'due_soon' ? 2 : row.collection_state === 'no_due_date' ? 3 : 4
    return priority(a) - priority(b) || String(a.due_date ?? '9999-12-31').localeCompare(String(b.due_date ?? '9999-12-31'))
  }), [state.receivables])
  const productionAlerts = production?.alerts ?? []
  const urgentProductionAlerts = productionAlerts.filter((row) => row.severity === 'danger' || row.severity === 'warning').slice(0, 3)

  const goto = (href: string) => { window.location.href = href }
  const openLegacy = (target: string, label: string) => { window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({ category: 'production', target, label, parentTarget: '생산관리' })); window.location.href = '/?legacy=1' }
  const logout = async () => { await fetch('/api/allowance/auth/logout', { method: 'POST' }).catch(() => null); window.location.href = '/' }

  if (loading) return <main className="min-h-screen bg-[#071426] px-5 py-8 text-slate-100"><div className="mx-auto max-w-[1700px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">MONI 경영 데이터를 불러오는 중입니다.</div></main>

  return <main data-moni-control-tower className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8"><div className="mx-auto max-w-[1700px] space-y-6">
    <header className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0a1b30] shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-5 p-6 lg:p-8"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">MONI CONTROL TOWER <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] tracking-normal">60초 자동 갱신</span></div><h1 className="mt-2 text-3xl font-black lg:text-4xl">돈이 어디에 있고, 오늘 뭘 해야 하는지.</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">판매 → 실제 수금 → 생산 위험을 연결했습니다. 아직 데이터 구조가 없는 목표매출·현금잔고·세금은 숫자를 만들지 않습니다.</p></div><div className="flex items-center gap-2"><div className="mr-2 text-right text-xs text-slate-500"><div>{kstTodayLabel()}</div><div>{session.displayName} · {updatedAt ? updatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</div></div><button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold">{refreshing ? '갱신 중...' : '새로고침'}</button><button type="button" onClick={() => void logout()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400">로그아웃</button></div></div>
      <div className="grid gap-px bg-slate-700/70 md:grid-cols-4"><div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">LIVE DATA</div><div className="mt-1 font-black text-emerald-300">판매 + 수금 + 생산</div></div><div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">수금 기준</div><div className="mt-1 font-black text-white">실제 입금기록</div></div><div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">다음 연결</div><div className="mt-1 font-black text-violet-200">목표매출</div></div><div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">원칙</div><div className="mt-1 font-black text-white">없는 돈은 만들지 않음</div></div></div>
    </header>

    {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">일부 데이터 연결 오류: {error}</div>}

    <Section eyebrow="MONEY FIRST" title="돈 현황"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card label="이번 달 매출" value={won(sales?.total_amount)} note={`확정 판매 ${sales?.order_count ?? 0}건`} tone="money" onClick={() => goto(salesHref)} /><Card label="현재 받을 돈" value={won(ar?.outstanding_amount)} note={`미수 판매 ${ar?.open_order_count ?? 0}건`} tone={(ar?.outstanding_amount ?? 0) > 0 ? 'warning' : 'default'} onClick={() => goto(receivablesHref)} /><Card label="연체" value={won(ar?.overdue_amount)} note={`${ar?.overdue_count ?? 0}건 · 입금예정일 경과`} tone={(ar?.overdue_count ?? 0) > 0 ? 'danger' : 'default'} onClick={() => goto(receivablesHref)} /><Card label="이번 달 실제 입금" value={won(ar?.received_this_month)} note="입금 이력에 실제 기록된 금액" tone="money" onClick={() => goto(receivablesHref)} /></div></Section>

    <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 lg:p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-red-300">ACTION QUEUE</div><h2 className="mt-1 text-2xl font-black">오늘 먼저 볼 것</h2><div className="mt-5 space-y-3">
        {(ar?.overdue_count ?? 0) > 0 && <button type="button" onClick={() => goto(receivablesHref)} className="flex w-full gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-4 text-left"><Dot tone="danger"/><div className="flex-1"><div className="font-black text-red-100">연체 미수금 {ar?.overdue_count}건</div><div className="mt-1 text-sm text-slate-400">입금예정일이 지난 금액부터 확인해야 합니다.</div></div><b className="text-red-200">{won(ar?.overdue_amount)}</b></button>}
        {(ar?.due_soon_count ?? 0) > 0 && <button type="button" onClick={() => goto(receivablesHref)} className="flex w-full gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-left"><Dot tone="warning"/><div className="flex-1"><div className="font-black text-amber-100">3일 내 수금예정 {ar?.due_soon_count}건</div><div className="mt-1 text-sm text-slate-400">D-3부터 D-Day까지의 예정 수금입니다.</div></div><b className="text-amber-200">{won(ar?.due_soon_amount)}</b></button>}
        {(ar?.no_due_date_count ?? 0) > 0 && <button type="button" onClick={() => goto(receivablesHref)} className="flex w-full gap-3 rounded-2xl border border-slate-700 p-4 text-left"><Dot tone="info"/><div><div className="font-black">입금예정일 미설정 {ar?.no_due_date_count}건</div><div className="mt-1 text-sm text-slate-500">D-Day 판단을 위해 예정일을 설정해야 합니다.</div></div></button>}
        {urgentProductionAlerts.map((alert) => <button key={alert.id} type="button" onClick={() => openLegacy('생산 개요','생산 대시보드')} className="flex w-full gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4 text-left"><Dot tone={alert.severity === 'danger' ? 'danger' : 'warning'}/><div className="flex-1"><div className="font-black">{alert.title}</div><div className="mt-1 text-sm text-slate-500">{alert.detail}</div></div>{alert.metric && <b>{alert.metric}</b>}</button>)}
        {(ar?.overdue_count ?? 0) === 0 && (ar?.due_soon_count ?? 0) === 0 && (ar?.no_due_date_count ?? 0) === 0 && !urgentProductionAlerts.length && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5 text-sm text-emerald-200">현재 연결된 데이터에서 즉시 처리할 경고가 없습니다.</div>}
      </div></div>
      <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 lg:p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">BUSINESS FLOW</div><h2 className="mt-1 text-2xl font-black">매출 → 현금 → 생산</h2><div className="mt-5 space-y-3"><Card label="영업 목표" value="다음 개발" note="목표매출/달성률을 CRM과 연결합니다." tone="pending" onClick={() => goto(pipelineHref)} /><div className="grid gap-3 sm:grid-cols-2"><Card label="판매" value={won(sales?.total_amount)} note="이번 달 확정 매출" onClick={() => goto(salesHref)} /><Card label="실제 회수" value={won(ar?.received_this_month)} note="이번 달 실제 입금" tone="money" onClick={() => goto(receivablesHref)} /></div><Card label="생산 달성" value={percent(production?.kpis.production.attainment_rate)} note={`계획 ${kg(production?.kpis.production.planned_due_g)} / 실적 ${kg(production?.kpis.production.actual_g)}`} onClick={() => openLegacy('생산 개요','생산 대시보드')} /></div></div>
    </section>

    <Section eyebrow="PRODUCTION & COST" title="돈에 영향을 주는 생산"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card label="생산 달성률" value={percent(production?.kpis.production.attainment_rate)} note={`오늘까지 실적 ${kg(production?.kpis.production.actual_g)}`} onClick={() => openLegacy('생산 개요','생산 대시보드')} /><Card label="생산 로스율" value={percent(production?.kpis.loss.loss_rate, 2)} note={`로스 ${kg(production?.kpis.loss.loss_g)} · 확인단가 영향 ${won(production?.kpis.loss.known_loss_cost_won)}`} tone={(production?.kpis.loss.loss_rate ?? 0) >= 2 ? 'danger' : 'default'} onClick={() => openLegacy('생산 개요','생산 대시보드')} /><Card label="14일 원재료 부족" value={`${production?.kpis.risk.shortage_materials ?? 0}종`} note={`위험 작업지시 ${production?.kpis.risk.risk_work_orders ?? 0}건`} tone={(production?.kpis.risk.shortage_materials ?? 0) > 0 ? 'danger' : 'default'} onClick={() => openLegacy('생산 개요','생산 대시보드')} /><Card label="부족분 예상 구매액" value={won(production?.kpis.risk.known_purchase_cost_won)} note={`확인단가 원재료 투입 ${won(production?.pricing.known_input_cost_won)}`} tone={(production?.kpis.risk.known_purchase_cost_won ?? 0) > 0 ? 'warning' : 'default'} onClick={() => openLegacy('원재료 관리','원재료 관리')} /></div></Section>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1b30]"><div className="flex items-center justify-between border-b border-slate-700 p-5"><div><div className="text-xs font-black uppercase tracking-[0.16em] text-red-300">COLLECTION FOCUS</div><h2 className="mt-1 text-xl font-black">받아야 할 돈</h2></div><button type="button" onClick={() => goto(receivablesHref)} className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold">수금관리 열기</button></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="bg-slate-900/70 text-slate-500"><tr><th className="px-4 py-3 text-left">상태</th><th className="px-4 py-3 text-left">예정일</th><th className="px-4 py-3 text-left">거래처</th><th className="px-4 py-3 text-left">명세표</th><th className="px-4 py-3 text-right">매출</th><th className="px-4 py-3 text-right">입금</th><th className="px-4 py-3 text-right">미수금</th></tr></thead><tbody>{collectionRows.slice(0,7).map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-4 py-4"><span className={`rounded-lg border px-2 py-1 text-xs font-black ${collectionTone(row)}`}>{row.collection_label}</span></td><td className="px-4 py-4 text-slate-400">{row.due_date || '미설정'}</td><td className="px-4 py-4 font-bold">{row.client_name}</td><td className="px-4 py-4 text-blue-300">{row.statement_number}</td><td className="px-4 py-4 text-right">{won(row.total_amount)}</td><td className="px-4 py-4 text-right text-emerald-300">{won(row.received_amount)}</td><td className="px-4 py-4 text-right font-black text-amber-200">{won(row.outstanding_amount)}</td></tr>)}{!collectionRows.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">현재 받을 돈으로 등록된 판매가 없습니다.</td></tr>}</tbody></table></div></div>
      <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5"><div className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">NEXT BUILD</div><h2 className="mt-1 text-xl font-black">다음 자동 연결</h2><div className="mt-4 space-y-3"><button type="button" onClick={() => goto(pipelineHref)} className="w-full rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4 text-left"><b className="text-violet-100">1. 영업 목표매출</b><p className="mt-1 text-sm text-slate-500">월 목표 → 예상매출 → 실제매출 → 부족분</p></button><button type="button" onClick={() => goto(accountingHref)} className="w-full rounded-2xl border border-slate-700 p-4 text-left"><b>2. 현금흐름 / 세금</b><p className="mt-1 text-sm text-slate-500">실제 수금이 확정되었으므로 다음 단계에서 지급·세금을 연결합니다.</p></button><div className="rounded-2xl border border-slate-700 p-4"><b>3. MONI Intelligence</b><p className="mt-1 text-sm text-slate-500">모든 원천 데이터가 연결된 뒤 AI가 우선순위와 행동을 제안하도록 확장합니다.</p></div></div></div>
    </section>
  </div></main>
}
