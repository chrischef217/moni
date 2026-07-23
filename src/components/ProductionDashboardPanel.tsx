'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type DashboardAlert = {
  id: string
  severity: 'danger' | 'warning' | 'info' | 'success'
  title: string
  detail: string
  metric?: string
}

type ProductionTrendPoint = {
  date: string
  planned_cumulative_g: number
  actual_cumulative_g: number
  is_future: boolean
}

type CostTrendPoint = {
  date: string
  known_input_cost_won: number
  known_loss_cost_won: number
  is_future: boolean
}

type ProductLossRow = {
  product_id: string
  product_name: string
  planned_g: number
  actual_g: number
  loss_g: number
  loss_rate: number
  known_loss_cost_won: number
  incomplete_price: boolean
}

type ShortageRow = {
  material_id: string
  material_name: string
  current_stock_g: number
  required_g: number
  shortage_g: number
  first_shortage_date: string | null
  purchase_cost_won: number | null
}

type DashboardPayload = {
  ok: boolean
  error?: string
  generated_at: string
  period: {
    today: string
    month: string
    month_start: string
    month_end: string
    future_end: string
  }
  kpis: {
    production: {
      planned_due_g: number
      actual_g: number
      attainment_rate: number
      month_total_planned_g: number
      overdue_work_orders: number
    }
    loss: {
      completed_planned_g: number
      loss_g: number
      loss_rate: number
      previous_loss_rate: number
      change_pp: number
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
    used_material_count: number
    unpriced_used_material_count: number
    known_input_cost_won: number
  }
  trends: {
    production: ProductionTrendPoint[]
    cost: CostTrendPoint[]
  }
  product_loss: ProductLossRow[]
  shortages: ShortageRow[]
  alerts: DashboardAlert[]
}

const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })
const decimalFormat = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function formatKg(valueG: number, decimals = 1) {
  const kg = Math.max(0, Number(valueG || 0)) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: decimals }).format(kg)}kg`
}

function formatWon(value: number) {
  return `${numberFormat.format(Math.round(Number(value || 0)))}원`
}

function compactWon(value: number) {
  const numeric = Math.max(0, Number(value || 0))
  if (numeric >= 100_000_000) return `${decimalFormat.format(numeric / 100_000_000)}억원`
  if (numeric >= 10_000) return `${decimalFormat.format(numeric / 10_000)}만원`
  return formatWon(numeric)
}

function formatDateLabel(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!match) return value
  return `${Number(match[1])}/${Number(match[2])}`
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Number(value || 0)))
}

function panelClass(extra = '') {
  return `rounded-2xl border border-gray-800 bg-gray-800/80 shadow-[0_18px_40px_rgba(2,6,23,0.24)] ${extra}`
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5" data-production-dashboard-panel="true">
      <div className="h-16 animate-pulse rounded-2xl bg-gray-800/70" />
      <div className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 animate-pulse rounded-2xl border border-gray-800 bg-gray-800/70" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-2xl border border-gray-800 bg-gray-800/70" />
        <div className="h-80 animate-pulse rounded-2xl border border-gray-800 bg-gray-800/70" />
      </div>
    </div>
  )
}

function SectionHeading({ title, description, right }: { title: string; description?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-800 px-5 py-4">
      <div>
        <h3 className="text-base font-bold text-white">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p> : null}
      </div>
      {right}
    </div>
  )
}

function ProductionTrendChart({ data, today }: { data: ProductionTrendPoint[]; today: string }) {
  const width = 760
  const height = 270
  const padding = { left: 58, right: 20, top: 22, bottom: 42 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom
  const maxValue = Math.max(1, ...data.flatMap((row) => [row.planned_cumulative_g, row.actual_cumulative_g]))
  const x = (index: number) => padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * plotW)
  const y = (value: number) => padding.top + plotH - (Math.max(0, value) / maxValue) * plotH
  const completedData = data.filter((row) => !row.is_future)
  const plannedPoints = data.map((row, index) => `${x(index)},${y(row.planned_cumulative_g)}`).join(' ')
  const actualPoints = completedData
    .map((row) => {
      const index = data.indexOf(row)
      return `${x(index)},${y(row.actual_cumulative_g)}`
    })
    .join(' ')
  const futureIndex = data.findIndex((row) => row.is_future)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const labelIndexes = Array.from(new Set([0, Math.floor((data.length - 1) / 4), Math.floor((data.length - 1) / 2), Math.floor(((data.length - 1) * 3) / 4), data.length - 1]))

  return (
    <div className="px-3 pb-3 pt-2">
      <div className="mb-2 flex flex-wrap items-center gap-4 px-2 text-xs text-gray-400">
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-gray-400" />계획 누적</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-green-400" />실제 누적</span>
        <span className="ml-auto text-gray-500">기준일 {today}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="계획 대비 실제 생산 누적 추이">
        {futureIndex >= 0 ? (
          <rect
            x={Math.max(padding.left, x(futureIndex) - 7)}
            y={padding.top}
            width={Math.max(0, width - padding.right - Math.max(padding.left, x(futureIndex) - 7))}
            height={plotH}
            fill="rgba(51,65,85,0.22)"
          />
        ) : null}
        {ticks.map((ratio) => {
          const yy = padding.top + plotH - ratio * plotH
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={yy} y2={yy} stroke="rgba(100,116,139,0.25)" strokeWidth="1" />
              <text x={padding.left - 10} y={yy + 4} fill="#64748b" fontSize="11" textAnchor="end">
                {formatKg(maxValue * ratio, 0)}
              </text>
            </g>
          )
        })}
        {plannedPoints ? <polyline points={plannedPoints} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeDasharray="7 6" /> : null}
        {actualPoints ? <polyline points={actualPoints} fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {completedData.map((row) => {
          const index = data.indexOf(row)
          return <circle key={row.date} cx={x(index)} cy={y(row.actual_cumulative_g)} r="2.5" fill="#4ade80" />
        })}
        {labelIndexes.map((index) => {
          const row = data[index]
          if (!row) return null
          return <text key={row.date} x={x(index)} y={height - 14} fill="#64748b" fontSize="11" textAnchor="middle">{formatDateLabel(row.date)}</text>
        })}
      </svg>
    </div>
  )
}

function CostTrendChart({ data, pricing }: { data: CostTrendPoint[]; pricing: DashboardPayload['pricing'] }) {
  const visible = data.filter((row) => !row.is_future)
  const width = 760
  const height = 270
  const padding = { left: 62, right: 20, top: 22, bottom: 42 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom
  const maxValue = Math.max(1, ...visible.map((row) => row.known_input_cost_won))
  const step = visible.length > 0 ? plotW / visible.length : plotW
  const barWidth = Math.max(4, Math.min(18, step * 0.58))
  const y = (value: number) => padding.top + plotH - (Math.max(0, value) / maxValue) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const labelIndexes = visible.length > 0
    ? Array.from(new Set([0, Math.floor((visible.length - 1) / 3), Math.floor(((visible.length - 1) * 2) / 3), visible.length - 1]))
    : []

  return (
    <div className="px-3 pb-3 pt-2">
      <div className="mb-2 flex flex-wrap items-center gap-3 px-2 text-xs text-gray-400">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-green-500/80" />확인 단가 기준 소모액</span>
        <span className="ml-auto text-gray-500">누적 {compactWon(pricing.known_input_cost_won)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="원재료 소모액 일별 추이">
        {ticks.map((ratio) => {
          const yy = padding.top + plotH - ratio * plotH
          return (
            <g key={ratio}>
              <line x1={padding.left} x2={width - padding.right} y1={yy} y2={yy} stroke="rgba(100,116,139,0.25)" strokeWidth="1" />
              <text x={padding.left - 10} y={yy + 4} fill="#64748b" fontSize="11" textAnchor="end">{compactWon(maxValue * ratio)}</text>
            </g>
          )
        })}
        {visible.map((row, index) => {
          const xx = padding.left + index * step + step / 2
          const yy = y(row.known_input_cost_won)
          const barHeight = padding.top + plotH - yy
          return (
            <g key={row.date}>
              <rect x={xx - barWidth / 2} y={yy} width={barWidth} height={barHeight} rx="3" fill="rgba(34,197,94,0.72)" />
              {row.known_loss_cost_won > 0 ? (
                <circle cx={xx} cy={Math.max(padding.top + 5, yy - 6)} r="3" fill="#f59e0b" />
              ) : null}
            </g>
          )
        })}
        {labelIndexes.map((index) => {
          const row = visible[index]
          const xx = padding.left + index * step + step / 2
          return <text key={row.date} x={xx} y={height - 14} fill="#64748b" fontSize="11" textAnchor="middle">{formatDateLabel(row.date)}</text>
        })}
      </svg>
      <div className="flex items-center justify-between gap-3 px-2 text-[11px] text-gray-500">
        <span>주황 점: 해당일 생산 로스 발생</span>
        {pricing.unpriced_used_material_count > 0 ? <span className="text-amber-300">단가 미등록 {pricing.unpriced_used_material_count}종 제외</span> : <span className="text-green-400">단가 누락 없음</span>}
      </div>
    </div>
  )
}

function AlertIcon({ severity }: { severity: DashboardAlert['severity'] }) {
  const classes = severity === 'danger'
    ? 'border-red-800/70 bg-red-950/50 text-red-300'
    : severity === 'warning'
      ? 'border-amber-700/70 bg-amber-950/40 text-amber-300'
      : severity === 'success'
        ? 'border-green-800/70 bg-green-950/40 text-green-300'
        : 'border-sky-800/70 bg-sky-950/40 text-sky-300'
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base font-black ${classes}`}>{severity === 'danger' ? '!' : severity === 'warning' ? '△' : severity === 'success' ? '✓' : 'i'}</span>
}

export default function ProductionDashboardPanel() {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/moni/production-dashboard?_=${Date.now()}`, { cache: 'no-store' })
      const payload = (await response.json().catch(() => null)) as DashboardPayload | null
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || '생산 대시보드 데이터를 불러오지 못했습니다.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '생산 대시보드 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const maxLossRate = useMemo(() => Math.max(0.01, ...(data?.product_loss ?? []).map((row) => row.loss_rate)), [data])

  if (loading && !data) return <LoadingSkeleton />

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-6 text-red-100" data-production-dashboard-panel="true">
        <h2 className="text-lg font-bold">생산 대시보드를 불러오지 못했습니다.</h2>
        <p className="mt-2 text-sm text-red-200/80">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-xl border border-red-700 px-4 py-2 text-sm font-semibold hover:border-red-500">다시 조회</button>
      </div>
    )
  }

  if (!data) return null

  const production = data.kpis.production
  const loss = data.kpis.loss
  const risk = data.kpis.risk
  const attainment = clampPercent(production.attainment_rate)
  const lossImproved = loss.change_pp <= 0

  return (
    <div className="space-y-5" data-production-dashboard-panel="true">
      <section className={panelClass('px-5 py-4')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_14px_rgba(74,222,128,0.6)]" />
              <h2 className="text-xl font-bold text-white">생산 대시보드</h2>
            </div>
            <p className="mt-1 text-sm text-gray-400">현재 생산 흐름, 로스, 향후 원재료 위험을 한 화면에서 확인합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs text-gray-400">
              {data.period.month.replace('-', '년 ')}월 · {data.period.today} 기준
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:border-green-600 hover:text-white disabled:opacity-50">
              {loading ? '갱신 중...' : '새로고침'}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className={panelClass('p-5')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-300">현재까지 생산 달성률</p>
              <p className="mt-1 text-xs text-gray-500">오늘까지 예정된 작업지시 기준</p>
            </div>
            <span className="rounded-lg border border-green-800/70 bg-green-950/30 px-2 py-1 text-xs font-semibold text-green-300">진행</span>
          </div>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-4xl font-black tracking-tight text-green-400">{production.attainment_rate.toFixed(1)}%</span>
            <span className="mb-1 text-xs text-gray-500">달성</span>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-900">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${attainment}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-900/60 px-3 py-2.5"><p className="text-xs text-gray-500">오늘까지 계획</p><p className="mt-1 font-semibold text-gray-100">{formatKg(production.planned_due_g)}</p></div>
            <div className="rounded-xl bg-gray-900/60 px-3 py-2.5"><p className="text-xs text-gray-500">실제 생산</p><p className="mt-1 font-semibold text-green-300">{formatKg(production.actual_g)}</p></div>
          </div>
          <p className="mt-3 text-xs text-gray-500">월 전체 작업지시 계획 {formatKg(production.month_total_planned_g)}</p>
        </section>

        <section className={panelClass('p-5')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-300">생산 로스</p>
              <p className="mt-1 text-xs text-gray-500">계획량 - 완료·불량·샘플 입력량</p>
            </div>
            <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${lossImproved ? 'border-green-800/70 bg-green-950/30 text-green-300' : 'border-amber-700/70 bg-amber-950/30 text-amber-300'}`}>
              전월 대비 {loss.change_pp > 0 ? '+' : ''}{loss.change_pp.toFixed(2)}%p
            </span>
          </div>
          <div className="mt-5 flex items-end gap-2">
            <span className={`text-4xl font-black tracking-tight ${loss.loss_rate <= 2 ? 'text-green-400' : loss.loss_rate <= 4 ? 'text-amber-300' : 'text-red-300'}`}>{loss.loss_rate.toFixed(2)}%</span>
            <span className="mb-1 text-xs text-gray-500">로스율</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-900/60 px-3 py-2.5"><p className="text-xs text-gray-500">로스량</p><p className="mt-1 font-semibold text-gray-100">{formatKg(loss.loss_g)}</p></div>
            <div className="rounded-xl bg-gray-900/60 px-3 py-2.5"><p className="text-xs text-gray-500">확인단가 원가 영향</p><p className="mt-1 font-semibold text-amber-300">{formatWon(loss.known_loss_cost_won)}</p></div>
          </div>
          <p className="mt-3 text-xs text-gray-500">전월 로스율 {loss.previous_loss_rate.toFixed(2)}%{loss.incomplete_price_records > 0 ? ` · 단가 미등록 포함 생산 ${loss.incomplete_price_records}건` : ''}</p>
        </section>

        <section className={panelClass('p-5')}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-300">향후 14일 생산 위험</p>
              <p className="mt-1 text-xs text-gray-500">작업지시 순서대로 현재 재고를 차감해 예측</p>
            </div>
            <span className={`rounded-lg border px-2 py-1 text-xs font-semibold ${risk.risk_work_orders > 0 ? 'border-red-800/70 bg-red-950/40 text-red-300' : 'border-green-800/70 bg-green-950/30 text-green-300'}`}>
              {risk.risk_work_orders > 0 ? '확인 필요' : '정상'}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-gray-900/60 px-2 py-3"><p className="text-[11px] text-gray-500">작업지시</p><p className="mt-1 text-xl font-bold text-gray-100">{risk.upcoming_work_orders}</p></div>
            <div className="rounded-xl bg-gray-900/60 px-2 py-3"><p className="text-[11px] text-gray-500">위험 작업</p><p className={`mt-1 text-xl font-bold ${risk.risk_work_orders > 0 ? 'text-red-300' : 'text-green-400'}`}>{risk.risk_work_orders}</p></div>
            <div className="rounded-xl bg-gray-900/60 px-2 py-3"><p className="text-[11px] text-gray-500">부족 원재료</p><p className={`mt-1 text-xl font-bold ${risk.shortage_materials > 0 ? 'text-amber-300' : 'text-green-400'}`}>{risk.shortage_materials}종</p></div>
          </div>
          <div className="mt-3 rounded-xl border border-gray-700 bg-gray-900/60 px-3 py-3">
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-gray-500">확인 단가 기준 구매 필요액</span><span className="font-bold text-amber-300">{formatWon(risk.known_purchase_cost_won)}</span></div>
          </div>
          {risk.unpriced_shortage_materials > 0 || risk.recipe_issue_count > 0 ? <p className="mt-3 text-xs text-amber-300">단가 미등록 부족 {risk.unpriced_shortage_materials}종 · 레시피 확인 {risk.recipe_issue_count}건</p> : null}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={panelClass('overflow-hidden')}>
          <SectionHeading title="계획 vs 실제 생산 누적 추이" description="생산 건별 목록 대신 이번 달 흐름만 보여줍니다." />
          <ProductionTrendChart data={data.trends.production} today={data.period.today} />
        </section>
        <section className={panelClass('overflow-hidden')}>
          <SectionHeading
            title="원재료 소모액 추이"
            description="회계 손익이 아닌 생산 소모량 × 현재 등록 포장단가 기준입니다."
            right={<span className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-400">{data.pricing.basis}</span>}
          />
          <CostTrendChart data={data.trends.cost} pricing={data.pricing} />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <section className={panelClass('overflow-hidden')}>
          <SectionHeading title="제품별 생산 로스 TOP 5" description="이번 달 완료 생산 중 계획량 대비 로스율이 높은 순서입니다." />
          <div className="space-y-3 p-5">
            {data.product_loss.length === 0 ? (
              <div className="rounded-xl border border-gray-700 bg-gray-900/50 px-4 py-8 text-center text-sm text-gray-500">이번 달 기록된 생산 로스가 없습니다.</div>
            ) : data.product_loss.map((row, index) => (
              <div key={`${row.product_id}-${row.product_name}`}>
                <div className="mb-1.5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-200"><span className="mr-2 text-xs text-gray-600">{String(index + 1).padStart(2, '0')}</span>{row.product_name}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">로스 {formatKg(row.loss_g)} · 확인단가 영향 {formatWon(row.known_loss_cost_won)}{row.incomplete_price ? ' 이하(단가 누락)' : ''}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${row.loss_rate >= 4 ? 'text-red-300' : row.loss_rate >= 2 ? 'text-amber-300' : 'text-green-300'}`}>{row.loss_rate.toFixed(2)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-900"><div className={`h-full rounded-full ${row.loss_rate >= 4 ? 'bg-red-500/80' : row.loss_rate >= 2 ? 'bg-amber-500/80' : 'bg-green-500/80'}`} style={{ width: `${Math.max(3, (row.loss_rate / maxLossRate) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className={panelClass('overflow-hidden')}>
          <SectionHeading title="예측 및 주의" description="유저가 놓치기 쉬운 항목만 우선순위대로 표시합니다." />
          <div className="space-y-2 p-4">
            {data.alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 rounded-xl border border-gray-700/80 bg-gray-900/55 px-3 py-3">
                <AlertIcon severity={alert.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-100">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{alert.detail}</p>
                </div>
                {alert.metric ? <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${alert.severity === 'danger' ? 'bg-red-950/50 text-red-300' : alert.severity === 'warning' ? 'bg-amber-950/50 text-amber-300' : alert.severity === 'success' ? 'bg-green-950/50 text-green-300' : 'bg-sky-950/50 text-sky-300'}`}>{alert.metric}</span> : null}
              </div>
            ))}
          </div>
          {data.shortages.length > 0 ? (
            <div className="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">
              가장 가까운 부족: <span className="text-gray-300">{data.shortages[0].first_shortage_date || '-'} · {data.shortages[0].material_name} {formatKg(data.shortages[0].shortage_g)}</span>
            </div>
          ) : null}
        </section>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 text-[11px] leading-5 text-gray-500">
        금액은 회계상 이익·손실이 아니라 <span className="text-gray-300">현재 등록된 원재료 포장단가를 생산 소모량에 적용한 운영 참고 지표</span>입니다. 단가 미등록 원재료 {data.pricing.unpriced_used_material_count}종은 금액 집계에서 제외됩니다.
      </div>
    </div>
  )
}
