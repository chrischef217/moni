'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AllowanceSessionUser } from '@/types/allowance'

type SalesOrder = {
  id: string
  statement_number: string
  sale_date: string
  client_id: string
  status: 'draft' | 'confirmed' | 'cancelled'
  payment_status: 'unpaid' | 'partial' | 'paid'
  total_amount: number
}

type SalesClient = { id: string; company_name: string }

type SalesPayload = {
  ok: boolean
  error?: string
  clients: SalesClient[]
  orders: SalesOrder[]
  summary: {
    order_count: number
    supply_amount: number
    total_amount: number
    unpaid_amount: number
    settlement_amount: number
  }
}

type ProductionAlert = {
  id: string
  severity: 'danger' | 'warning' | 'info' | 'success'
  title: string
  detail: string
  metric?: string
}

type ProductionPayload = {
  ok: boolean
  error?: string
  generated_at?: string
  kpis: {
    production: {
      planned_due_g: number
      actual_g: number
      attainment_rate: number
      month_total_planned_g: number
      overdue_work_orders: number
    }
    loss: {
      loss_g: number
      loss_rate: number
      known_loss_cost_won: number
      incomplete_price_records: number
    }
    risk: {
      upcoming_work_orders: number
      risk_work_orders: number
      shortage_materials: number
      known_purchase_cost_won: number
      unpriced_shortage_materials: number
      recipe_issue_count: number
    }
  }
  pricing: {
    basis: string
    known_input_cost_won: number
    unpriced_used_material_count: number
  }
  alerts: ProductionAlert[]
}

type LoadState = {
  sales: SalesPayload | null
  production: ProductionPayload | null
}

const salesHref = '/business-management?tab=sales-management&view=sales'
const termsHref = '/business-management?tab=sales-management&view=terms'
const pipelineHref = '/business-management?tab=sales&view=pipeline'
const accountingHref = '/business-management?tab=accounting&view=settlements'

function kstMonth() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7)
}

function kstTodayLabel() {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date())
}

function won(value: unknown) {
  const numeric = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(Number.isFinite(numeric) ? numeric : 0))}원`
}

function percent(value: unknown, digits = 1) {
  const numeric = Number(value ?? 0)
  return `${(Number.isFinite(numeric) ? numeric : 0).toFixed(digits)}%`
}

function kgFromG(value: unknown) {
  const numeric = Number(value ?? 0) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: numeric >= 100 ? 0 : 1 }).format(Number.isFinite(numeric) ? numeric : 0)}kg`
}

function statusTone(status: SalesOrder['payment_status']) {
  if (status === 'partial') return 'text-amber-200 bg-amber-500/10 border-amber-500/30'
  return 'text-red-200 bg-red-500/10 border-red-500/30'
}

function paymentLabel(status: SalesOrder['payment_status']) {
  return status === 'partial' ? '일부입금' : status === 'paid' ? '입금완료' : '미입금'
}

function SeverityDot({ severity }: { severity: ProductionAlert['severity'] }) {
  const className = severity === 'danger'
    ? 'bg-red-400 shadow-red-400/40'
    : severity === 'warning'
      ? 'bg-amber-300 shadow-amber-300/40'
      : severity === 'success'
        ? 'bg-emerald-400 shadow-emerald-400/40'
        : 'bg-blue-400 shadow-blue-400/40'
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_12px] ${className}`} />
}

function MetricCard({
  eyebrow,
  value,
  note,
  tone = 'default',
  action,
}: {
  eyebrow: string
  value: string
  note: string
  tone?: 'default' | 'money' | 'danger' | 'pending'
  action?: () => void
}) {
  const toneClass = tone === 'money'
    ? 'border-emerald-500/30 bg-emerald-500/[0.08]'
    : tone === 'danger'
      ? 'border-red-500/30 bg-red-500/[0.08]'
      : tone === 'pending'
        ? 'border-amber-500/25 bg-amber-500/[0.05]'
        : 'border-slate-700 bg-[#0b1b30]'

  return (
    <button
      type="button"
      onClick={action}
      disabled={!action}
      className={`group min-h-[154px] rounded-2xl border p-5 text-left transition ${toneClass} ${action ? 'hover:-translate-y-0.5 hover:border-slate-500' : 'cursor-default'}`}
    >
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</div>
      <div className={`mt-3 text-3xl font-black tracking-tight ${tone === 'danger' ? 'text-red-200' : tone === 'money' ? 'text-emerald-200' : tone === 'pending' ? 'text-amber-200' : 'text-white'}`}>
        {value}
      </div>
      <div className="mt-2 text-sm leading-5 text-slate-400">{note}</div>
      {action && <div className="mt-3 text-xs font-bold text-slate-500 transition group-hover:text-slate-300">상세 보기 →</div>}
    </button>
  )
}

function FlowCard({ title, value, caption, state, onClick }: {
  title: string
  value: string
  caption: string
  state: 'live' | 'pending' | 'risk'
  onClick?: () => void
}) {
  const indicator = state === 'live' ? 'bg-emerald-400' : state === 'risk' ? 'bg-red-400' : 'bg-amber-300'
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-700 bg-slate-900/55 p-4 text-left transition hover:border-slate-500">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-300">{title}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${indicator}`} />
      </div>
      <div className="mt-3 text-xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{caption}</div>
    </button>
  )
}

export default function MainControlTowerDashboard({ session }: { session: AllowanceSessionUser }) {
  const [state, setState] = useState<LoadState>({ sales: null, production: null })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    setError('')
    try {
      const month = kstMonth()
      const [salesResponse, productionResponse] = await Promise.all([
        fetch(`/api/moni/sales-operations?month=${encodeURIComponent(month)}&_=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/moni/production-dashboard?_=${Date.now()}`, { cache: 'no-store' }),
      ])
      const [sales, production] = await Promise.all([
        salesResponse.json() as Promise<SalesPayload>,
        productionResponse.json() as Promise<ProductionPayload>,
      ])
      const messages: string[] = []
      if (!salesResponse.ok || !sales.ok) messages.push(sales.error || '판매 데이터를 불러오지 못했습니다.')
      if (!productionResponse.ok || !production.ok) messages.push(production.error || '생산 데이터를 불러오지 못했습니다.')
      setState({
        sales: salesResponse.ok && sales.ok ? sales : null,
        production: productionResponse.ok && production.ok ? production : null,
      })
      setError(messages.join(' / '))
      setLastUpdated(new Date())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '통합 대시보드 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
    const timer = window.setInterval(() => void load(false), 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  const clientsById = useMemo(() => new Map((state.sales?.clients ?? []).map((row) => [row.id, row.company_name])), [state.sales])
  const openOrders = useMemo(() => (state.sales?.orders ?? [])
    .filter((row) => row.status === 'confirmed' && row.payment_status !== 'paid')
    .sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0)), [state.sales])

  const sales = state.sales?.summary
  const production = state.production
  const productionAlerts = production?.alerts ?? []
  const urgentProductionAlerts = productionAlerts.filter((row) => row.severity === 'danger' || row.severity === 'warning').slice(0, 4)
  const productionRisk = Number(production?.kpis.risk.risk_work_orders ?? 0) > 0 || Number(production?.kpis.risk.shortage_materials ?? 0) > 0

  function goto(href: string) {
    window.location.href = href
  }

  function openLegacy(category: 'production' | 'ai' | 'admin' | 'audit', target: string, label: string, parentTarget?: string) {
    window.sessionStorage.setItem('moni-pending-nav', JSON.stringify({ category, target, label, parentTarget }))
    window.location.href = '/?legacy=1'
  }

  async function logout() {
    await fetch('/api/allowance/auth/logout', { method: 'POST' }).catch(() => null)
    window.location.href = '/'
  }

  if (loading) {
    return (
      <main data-moni-control-tower className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
        <div className="mx-auto max-w-[1700px] rounded-3xl border border-slate-700 bg-[#0b1b30] p-16 text-center text-slate-400">
          MONI 경영 데이터를 불러오는 중입니다.
        </div>
      </main>
    )
  }

  return (
    <main data-moni-control-tower className="min-h-screen bg-[#071426] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <header className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0a1b30] shadow-2xl">
          <div className="border-b border-slate-700/70 px-6 py-5 lg:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                  <span>MONI CONTROL TOWER</span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] tracking-normal">60초 자동 갱신</span>
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white lg:text-4xl">돈부터 보고, 바로 행동합니다.</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">매출·미입금·생산·원재료 위험을 한 화면에서 연결합니다. 아직 시스템에 없는 목표매출·정확한 수금 D-Day·현금흐름 값은 추측하지 않습니다.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="mr-2 text-right text-xs text-slate-500">
                  <div>{kstTodayLabel()}</div>
                  <div className="mt-1">{session.displayName} · {lastUpdated ? `최근 갱신 ${lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '갱신 대기'}</div>
                </div>
                <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-bold text-slate-200 hover:border-slate-400 disabled:opacity-50">{refreshing ? '갱신 중...' : '새로고침'}</button>
                <button type="button" onClick={() => void logout()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:text-white">로그아웃</button>
              </div>
            </div>
          </div>
          <div className="grid gap-px bg-slate-700/70 md:grid-cols-4">
            <div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">현재 연결</div><div className="mt-1 font-black text-emerald-300">판매 + 생산 LIVE</div></div>
            <div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">다음 핵심 연결</div><div className="mt-1 font-black text-amber-200">수금 D-Day / 목표매출</div></div>
            <div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">경영 기준</div><div className="mt-1 font-black text-white">매출 → 수금 → 이익 → 생산</div></div>
            <div className="bg-[#08182b] px-6 py-4"><div className="text-xs text-slate-500">데이터 원칙</div><div className="mt-1 font-black text-white">없는 값은 표시하지 않음</div></div>
          </div>
        </header>

        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-200">일부 데이터 연결 오류: {error}</div>}

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">MONEY FIRST</div><h2 className="mt-1 text-2xl font-black">돈 현황</h2></div>
            <div className="text-xs text-slate-500">현재 MONI에 실제 기록된 값만 표시</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard eyebrow="이번 달 매출" value={won(sales?.total_amount)} note={`확정 판매 ${sales?.order_count ?? 0}건 기준 · 부가세 포함 합계`} tone="money" action={() => goto(salesHref)} />
            <MetricCard eyebrow="미입금 관리 대상" value={won(sales?.unpaid_amount)} note={`미입금/일부입금 상태 ${openOrders.length}건 · 현재는 부분입금액 별도 기록 전`} tone={Number(sales?.unpaid_amount ?? 0) > 0 ? 'danger' : 'default'} action={() => goto(salesHref)} />
            <MetricCard eyebrow="목표매출" value="설정 필요" note="영업관리 목표매출 기능이 아직 연결되지 않았습니다. 가짜 달성률은 표시하지 않습니다." tone="pending" action={() => goto(pipelineHref)} />
            <MetricCard eyebrow="현금 · 세금" value="연결 대기" note="회계·세무관리의 현금흐름·지급예정·세금 KPI 완성 후 자동 연결합니다." tone="pending" action={() => goto(accountingHref)} />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-xs font-black uppercase tracking-[0.16em] text-red-300">ACTION QUEUE</div><h2 className="mt-1 text-2xl font-black">지금 먼저 확인할 것</h2></div>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400">돈·생산 위험 우선</span>
            </div>
            <div className="mt-5 space-y-3">
              {Number(sales?.unpaid_amount ?? 0) > 0 ? (
                <button type="button" onClick={() => goto(salesHref)} className="flex w-full items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-4 text-left transition hover:border-red-400/60">
                  <SeverityDot severity="danger" />
                  <div className="min-w-0 flex-1"><div className="font-black text-red-100">미입금 관리 대상 {openOrders.length}건</div><div className="mt-1 text-sm leading-5 text-slate-400">현재 상태 기준 관리 대상 금액 {won(sales?.unpaid_amount)}입니다. 정확한 연체/D-Day 판정은 입금예정일·입금내역 구조 추가 후 활성화합니다.</div></div>
                  <div className="shrink-0 text-sm font-black text-red-200">{won(sales?.unpaid_amount)}</div>
                </button>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"><SeverityDot severity="success" /><div><div className="font-black text-emerald-100">현재 미입금 상태로 등록된 판매가 없습니다.</div><div className="mt-1 text-sm text-slate-500">판매관리의 현재 입금상태 기준입니다.</div></div></div>
              )}
              {urgentProductionAlerts.map((alert) => (
                <button key={alert.id} type="button" onClick={() => openLegacy('production', '생산 개요', '생산 대시보드', '생산관리')} className="flex w-full items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900/55 p-4 text-left transition hover:border-slate-500">
                  <SeverityDot severity={alert.severity} />
                  <div className="min-w-0 flex-1"><div className="font-black text-white">{alert.title}</div><div className="mt-1 text-sm leading-5 text-slate-500">{alert.detail}</div></div>
                  {alert.metric && <div className="shrink-0 text-sm font-black text-slate-200">{alert.metric}</div>}
                </button>
              ))}
              {!urgentProductionAlerts.length && Number(sales?.unpaid_amount ?? 0) <= 0 && <div className="rounded-2xl border border-slate-700 p-6 text-center text-slate-500">현재 연결된 데이터에서 긴급 조치 항목이 없습니다.</div>}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 lg:p-6">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">BUSINESS FLOW</div>
            <h2 className="mt-1 text-2xl font-black">경영 흐름</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FlowCard title="영업 목표" value="설정 전" caption="목표매출 → 파이프라인 예상매출 연결 예정" state="pending" onClick={() => goto(pipelineHref)} />
              <FlowCard title="판매 실적" value={won(sales?.total_amount)} caption={`이번 달 확정 판매 ${sales?.order_count ?? 0}건`} state="live" onClick={() => goto(salesHref)} />
              <FlowCard title="회수 관리" value={won(sales?.unpaid_amount)} caption="현재 입금상태 기준 · 수금 D-Day 구조가 다음 우선순위" state={Number(sales?.unpaid_amount ?? 0) > 0 ? 'risk' : 'live'} onClick={() => goto(salesHref)} />
              <FlowCard title="생산 달성" value={percent(production?.kpis.production.attainment_rate)} caption={`당월 오늘까지 계획 ${kgFromG(production?.kpis.production.planned_due_g)} 대비 실적`} state={Number(production?.kpis.production.attainment_rate ?? 0) >= 95 ? 'live' : 'risk'} onClick={() => openLegacy('production', '생산 개요', '생산 대시보드', '생산관리')} />
            </div>
            <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 p-4 text-sm leading-6 text-slate-400">
              최종 구조는 <b className="text-white">목표매출 → 실제판매 → 수금 → 이익/현금 → 필요한 생산</b>이 자동으로 이어지도록 합니다. 현재는 판매·생산 실제값부터 연결했습니다.
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3"><div className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">PRODUCTION & COST</div><h2 className="mt-1 text-2xl font-black">돈에 영향을 주는 생산 지표</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard eyebrow="생산 달성률" value={percent(production?.kpis.production.attainment_rate)} note={`오늘까지 계획 ${kgFromG(production?.kpis.production.planned_due_g)} / 실적 ${kgFromG(production?.kpis.production.actual_g)}`} action={() => openLegacy('production', '생산 개요', '생산 대시보드', '생산관리')} />
            <MetricCard eyebrow="생산 로스율" value={percent(production?.kpis.loss.loss_rate, 2)} note={`이번 달 로스 ${kgFromG(production?.kpis.loss.loss_g)} · 확인단가 기준 영향 ${won(production?.kpis.loss.known_loss_cost_won)}`} tone={Number(production?.kpis.loss.loss_rate ?? 0) >= 2 ? 'danger' : 'default'} action={() => openLegacy('production', '생산 개요', '생산 대시보드', '생산관리')} />
            <MetricCard eyebrow="14일 원재료 부족" value={`${production?.kpis.risk.shortage_materials ?? 0}종`} note={`위험 작업지시 ${production?.kpis.risk.risk_work_orders ?? 0}건 · 단가 없는 부족재료 ${production?.kpis.risk.unpriced_shortage_materials ?? 0}종`} tone={productionRisk ? 'danger' : 'default'} action={() => openLegacy('production', '생산 개요', '생산 대시보드', '생산관리')} />
            <MetricCard eyebrow="부족분 예상 구매액" value={won(production?.kpis.risk.known_purchase_cost_won)} note={`현재 등록 포장단가 기준 · 이번 달 확인 원재료 투입액 ${won(production?.pricing.known_input_cost_won)}`} tone={Number(production?.kpis.risk.known_purchase_cost_won ?? 0) > 0 ? 'pending' : 'default'} action={() => openLegacy('production', '원재료 관리', '원재료 관리', '생산관리')} />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-3xl border border-slate-700 bg-[#0b1b30]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-5 lg:px-6">
              <div><div className="text-xs font-black uppercase tracking-[0.16em] text-red-300">COLLECTION FOCUS</div><h2 className="mt-1 text-xl font-black">미입금 관리 대상 판매</h2></div>
              <button type="button" onClick={() => goto(salesHref)} className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-400">판매관리 열기</button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-slate-900/70 text-slate-500"><tr><th className="px-5 py-3 text-left">판매일</th><th className="px-5 py-3 text-left">거래처</th><th className="px-5 py-3 text-left">명세표</th><th className="px-5 py-3 text-right">판매금액</th><th className="px-5 py-3 text-left">상태</th></tr></thead>
                <tbody>
                  {openOrders.slice(0, 6).map((row) => <tr key={row.id} className="border-t border-slate-800"><td className="px-5 py-4 text-slate-400">{row.sale_date}</td><td className="px-5 py-4 font-bold text-white">{clientsById.get(row.client_id) || '거래처 확인 필요'}</td><td className="px-5 py-4 text-blue-300">{row.statement_number}</td><td className="px-5 py-4 text-right font-black text-white">{won(row.total_amount)}</td><td className="px-5 py-4"><span className={`rounded-lg border px-2 py-1 text-xs font-bold ${statusTone(row.payment_status)}`}>{paymentLabel(row.payment_status)}</span></td></tr>)}
                  {!openOrders.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">현재 미입금/일부입금 상태 판매가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-5 py-3 text-xs leading-5 text-slate-500">주의: 현재 MONI에는 실제 입금내역과 입금예정일이 별도 기록되지 않아 일부입금 건도 판매 총액으로 표시됩니다. 수금·매출채권 기능에서 정확한 잔액과 D-Day 구조를 추가합니다.</div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-[#0b1b30] p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">MONI BRIEFING</div><h2 className="mt-1 text-xl font-black">현재 시스템 브리핑</h2></div><span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-500">Intelligence Board 전 단계</span></div>
            <div className="mt-5 space-y-3">
              {productionAlerts.slice(0, 5).map((alert) => <div key={alert.id} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3"><SeverityDot severity={alert.severity} /><div className="min-w-0"><div className="text-sm font-bold text-slate-200">{alert.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{alert.detail}</div></div></div>)}
              <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3"><SeverityDot severity="warning" /><div><div className="text-sm font-bold text-amber-100">수금 D-Day 데이터 연결이 필요합니다.</div><div className="mt-1 text-xs leading-5 text-slate-500">입금예정일과 실제 입금내역이 완성되면 MONI가 D-3/D-1/D-Day/연체를 자동 판단할 수 있습니다.</div></div></div>
              <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3"><SeverityDot severity="warning" /><div><div className="text-sm font-bold text-amber-100">목표매출 데이터가 아직 없습니다.</div><div className="mt-1 text-xs leading-5 text-slate-500">영업관리 목표매출 기능이 완성되면 목표 달성률·예상 부족매출·필요 생산량까지 이 화면에 연결합니다.</div></div></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-[#08182b] p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">NEXT DATA CONNECTION</div><h2 className="mt-1 text-xl font-black">대시보드가 더 강해지기 위해 필요한 데이터</h2></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => goto(salesHref)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-500">1. 수금·미수금 구조</button>
              <button type="button" onClick={() => goto(termsHref)} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-slate-400">2. 판매규격·단가</button>
              <button type="button" onClick={() => goto(pipelineHref)} className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-slate-400">3. 영업 목표매출</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
