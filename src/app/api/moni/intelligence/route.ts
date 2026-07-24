import { NextRequest, NextResponse } from 'next/server'
import { GET as getProductionDashboard } from '@/app/api/moni/production-dashboard/route'
import { GET as getReceivables } from '@/app/api/moni/receivables/route'
import { GET as getSalesTargets } from '@/app/api/moni/sales-targets/route'
import { GET as getFinancialControl } from '@/app/api/moni/financial-control/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Json = Record<string, any>
type Severity = 'critical' | 'high' | 'attention' | 'data' | 'good'

type IntelligenceItem = {
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

const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(num(value)))}원`
const percent = (value: unknown, digits = 1) => `${num(value).toFixed(digits)}%`

async function parseResponse(response: Response, label: string): Promise<Json> {
  const payload = await response.json() as Json
  if (!response.ok || payload.ok === false) throw new Error(`${label}: ${String(payload.error || '데이터를 불러오지 못했습니다.')}`)
  return payload
}

function push(items: IntelligenceItem[], item: IntelligenceItem) {
  items.push(item)
}

function severityOrder(value: Severity) {
  if (value === 'critical') return 0
  if (value === 'high') return 1
  if (value === 'attention') return 2
  if (value === 'data') return 3
  return 4
}

export async function GET(request: NextRequest) {
  try {
    const [production, receivables, targets, finance] = await Promise.all([
      getProductionDashboard().then((response) => parseResponse(response, '생산')),
      getReceivables(request).then((response) => parseResponse(response, '수금')),
      getSalesTargets(request).then((response) => parseResponse(response, '영업목표')),
      getFinancialControl(request).then((response) => parseResponse(response, '재무')),
    ])

    const items: IntelligenceItem[] = []
    const ar = receivables.summary ?? {}
    const target = targets.company ?? {}
    const cash = finance.summary ?? {}
    const productionKpi = production.kpis ?? {}

    if (num(ar.overdue_count) > 0) {
      push(items, {
        id: 'overdue-receivables',
        severity: 'critical',
        priority: 100,
        title: `연체 미수금 ${num(ar.overdue_count)}건을 먼저 회수해야 합니다.`,
        summary: `입금예정일이 지난 미수금이 ${won(ar.overdue_amount)} 있습니다.`,
        evidence: [`연체 ${num(ar.overdue_count)}건`, `연체금액 ${won(ar.overdue_amount)}`],
        action: '연체 건 확인 및 수금 조치',
        href: '/business-management?tab=sales-management&view=receivables',
        source: '수금·미수금',
        rule: '입금예정일이 지난 미수금이 1건 이상이면 최우선',
      })
    }

    if (num(cash.planned_30d_net) < 0) {
      push(items, {
        id: 'negative-30d-cash',
        severity: 'critical',
        priority: 98,
        title: '향후 30일 예정자금이 순유출입니다.',
        summary: `현재 등록된 예정 유입보다 유출이 ${won(Math.abs(num(cash.planned_30d_net)))} 큽니다.`,
        evidence: [`예정유입 ${won(cash.planned_30d_inflow)}`, `예정유출 ${won(cash.planned_30d_outflow)}`, `예정순증감 ${won(cash.planned_30d_net)}`],
        action: '30일 예정 입출금과 지급일 재점검',
        href: '/business-management?tab=accounting&view=financial-control',
        source: '현금흐름·세무',
        rule: '30일 예정 순증감이 0원 미만이면 최우선',
      })
    }

    if (num(productionKpi.risk?.risk_work_orders) > 0 || num(productionKpi.risk?.shortage_materials) > 0) {
      push(items, {
        id: 'production-material-risk',
        severity: 'critical',
        priority: 96,
        title: '향후 생산에 원재료 부족 위험이 있습니다.',
        summary: `위험 작업지시 ${num(productionKpi.risk?.risk_work_orders)}건, 부족 예상 원재료 ${num(productionKpi.risk?.shortage_materials)}종입니다.`,
        evidence: [`위험 작업지시 ${num(productionKpi.risk?.risk_work_orders)}건`, `부족재료 ${num(productionKpi.risk?.shortage_materials)}종`, `확인단가 구매참고 ${won(productionKpi.risk?.known_purchase_cost_won)}`],
        action: '생산계획과 원재료 조달 확인',
        href: '/?legacy=1&moni_target=production-overview',
        source: '생산 대시보드',
        rule: '향후 작업지시 중 재고부족 위험 또는 부족재료가 있으면 최우선',
      })
    }

    if (num(ar.due_soon_count) > 0) {
      push(items, {
        id: 'due-soon-receivables',
        severity: 'high',
        priority: 88,
        title: `3일 내 수금예정 ${num(ar.due_soon_count)}건이 있습니다.`,
        summary: `D-3~D-Day 예정금액은 ${won(ar.due_soon_amount)}입니다.`,
        evidence: [`3일 내 ${num(ar.due_soon_count)}건`, `예정금액 ${won(ar.due_soon_amount)}`],
        action: '입금예정 거래처 사전 확인',
        href: '/business-management?tab=sales-management&view=receivables',
        source: '수금·미수금',
        rule: 'D-3부터 D-Day까지의 미수금이 있으면 높은 우선순위',
      })
    }

    const targetAmount = target.target ? num(target.target.target_amount) : null
    const targetGap = target.gap_amount === null || target.gap_amount === undefined ? null : num(target.gap_amount)
    const openPipeline = num(target.open_pipeline_amount)
    if (targetAmount !== null && targetGap !== null && targetGap > 0) {
      const uncovered = Math.max(0, targetGap - openPipeline)
      push(items, {
        id: 'sales-target-gap',
        severity: uncovered > 0 ? 'high' : 'attention',
        priority: uncovered > 0 ? 84 : 74,
        title: uncovered > 0 ? '목표 부족액이 현재 파이프라인 원금액보다 큽니다.' : '월 목표매출이 아직 미달입니다.',
        summary: uncovered > 0
          ? `목표 부족 ${won(targetGap)} 중 현재 이번 달 종료예정 파이프라인 원금액으로도 ${won(uncovered)}가 남습니다.`
          : `목표 부족 ${won(targetGap)}이며 이번 달 종료예정 파이프라인 원금액은 ${won(openPipeline)}입니다.`,
        evidence: [`목표 ${won(targetAmount)}`, `실제매출 ${won(target.actual_sales_amount)}`, `달성률 ${percent(target.attainment_rate)}`, `목표부족 ${won(targetGap)}`, `파이프라인 원금액 ${won(openPipeline)}`],
        action: '영업 목표와 파이프라인 점검',
        href: '/business-management?tab=sales&view=targets',
        source: '영업 목표매출',
        rule: '확률가중 없이 목표부족액과 이번 달 종료예정 expected_amount 원금액만 비교',
      })
    }

    if (num(productionKpi.loss?.loss_rate) >= 2) {
      push(items, {
        id: 'production-loss',
        severity: 'high',
        priority: 82,
        title: `생산 로스율이 ${percent(productionKpi.loss?.loss_rate, 2)}입니다.`,
        summary: `현재 생산 대시보드 경고 기준인 2% 이상입니다.`,
        evidence: [`로스 ${num(productionKpi.loss?.loss_g) / 1000}kg`, `확인단가 기준 로스영향 ${won(productionKpi.loss?.known_loss_cost_won)}`],
        action: '제품별 로스 TOP5 확인',
        href: '/?legacy=1&moni_target=production-overview',
        source: '생산 대시보드',
        rule: '기존 생산 대시보드와 동일하게 로스율 2% 이상이면 높은 우선순위',
      })
    }

    if (!target.target) {
      push(items, {
        id: 'missing-sales-target',
        severity: 'data',
        priority: 68,
        title: '이번 달 회사 목표매출이 설정되지 않았습니다.',
        summary: '목표가 없으면 목표 부족액과 달성률 판단을 할 수 없습니다.',
        evidence: ['회사 월 목표매출 미설정'],
        action: '월 목표매출 설정',
        href: '/business-management?tab=sales&view=targets',
        source: '영업 목표매출',
        rule: '목표 미설정은 경영판단 데이터 누락으로 표시',
      })
    }

    if (num(ar.no_due_date_count) > 0) {
      push(items, {
        id: 'missing-receivable-dates',
        severity: 'data',
        priority: 67,
        title: `입금예정일이 없는 미수 판매가 ${num(ar.no_due_date_count)}건 있습니다.`,
        summary: '입금예정일이 없으면 연체와 D-Day를 판단할 수 없습니다.',
        evidence: [`입금예정일 미설정 ${num(ar.no_due_date_count)}건`],
        action: '입금예정일 설정',
        href: '/business-management?tab=sales-management&view=receivables',
        source: '수금·미수금',
        rule: '미수금인데 due_date가 없으면 데이터 누락',
      })
    }

    if (num(cash.accounts_without_balance) > 0 || num(cash.stale_balance_accounts) > 0 || num(cash.active_account_count) === 0) {
      push(items, {
        id: 'account-balance-data',
        severity: 'data',
        priority: 66,
        title: num(cash.active_account_count) === 0 ? '계좌·현금함 잔액이 아직 등록되지 않았습니다.' : '계좌잔액 최신성 확인이 필요합니다.',
        summary: num(cash.active_account_count) === 0
          ? '은행 자동연동이 없으므로 잔액 Snapshot을 등록해야 현재 보유현금을 볼 수 있습니다.'
          : `잔액 미등록 ${num(cash.accounts_without_balance)}개, 7일 초과 Snapshot ${num(cash.stale_balance_accounts)}개입니다.`,
        evidence: [`활성 계좌 ${num(cash.active_account_count)}개`, `잔액 미등록 ${num(cash.accounts_without_balance)}개`, `7일 초과 ${num(cash.stale_balance_accounts)}개`],
        action: '계좌잔액 Snapshot 갱신',
        href: '/business-management?tab=accounting&view=financial-control',
        source: '현금흐름·세무',
        rule: '은행 API가 없으므로 잔액 미등록/7일 초과만 데이터 누락으로 경고',
      })
    }

    if (num(production.pricing?.unpriced_used_material_count) > 0) {
      push(items, {
        id: 'missing-material-prices',
        severity: 'data',
        priority: 65,
        title: `생산 사용 원재료 단가가 ${num(production.pricing?.unpriced_used_material_count)}종 미등록입니다.`,
        summary: '원가·로스 금액은 단가가 확인된 원재료만 계산됩니다.',
        evidence: [`단가 미등록 사용원재료 ${num(production.pricing?.unpriced_used_material_count)}종`],
        action: '원재료 포장단가 보완',
        href: '/?legacy=1&moni_target=raw-materials',
        source: '생산 대시보드',
        rule: '실제 사용 원재료 중 단가 미등록 항목이 있으면 데이터 누락',
      })
    }

    if (num(target.no_close_date_pipeline_count) > 0) {
      push(items, {
        id: 'pipeline-no-close-date',
        severity: 'data',
        priority: 64,
        title: `예상종료일이 없는 영업기회가 ${num(target.no_close_date_pipeline_count)}건 있습니다.`,
        summary: '종료일이 없으면 월 목표 대비 이번 달 파이프라인에 포함할 수 없습니다.',
        evidence: [`close_date 미설정 ${num(target.no_close_date_pipeline_count)}건`],
        action: '영업기회 예상종료일 보완',
        href: '/business-management?tab=sales&view=pipeline',
        source: '영업 파이프라인',
        rule: '열린 영업기회에 close_date가 없으면 데이터 누락',
      })
    }

    if (num(cash.paid_settlement_without_date_count) > 0) {
      push(items, {
        id: 'paid-settlement-no-date',
        severity: 'data',
        priority: 63,
        title: `지급일이 없는 지급완료 정산이 ${num(cash.paid_settlement_without_date_count)}건 있습니다.`,
        summary: '실제 현금지출 월을 정확히 판단할 수 없습니다.',
        evidence: [`paid 상태지만 paid_date 없음 ${num(cash.paid_settlement_without_date_count)}건`],
        action: '정산 지급일 보완',
        href: '/business-management?tab=accounting&view=financial-control',
        source: '현금흐름·세무',
        rule: '지급완료 상태인데 실제 지급일이 없으면 데이터 누락',
      })
    }

    if (!items.some((item) => item.severity === 'critical' || item.severity === 'high' || item.severity === 'attention')) {
      push(items, {
        id: 'no-operational-risk',
        severity: 'good',
        priority: 10,
        title: '현재 연결된 데이터에서는 즉시 조치할 경영 위험이 없습니다.',
        summary: '수금, 30일 자금계획, 영업목표, 생산위험 기준으로 확인했습니다.',
        evidence: ['구조화된 위험 규칙에서 critical/high/attention 항목 없음'],
        action: '데이터 누락 항목 점검',
        href: '/intelligence',
        source: 'MONI Intelligence',
        rule: '운영 위험이 없을 때만 정상 상태 표시',
      })
    }

    items.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.priority - a.priority || a.id.localeCompare(b.id))

    const counts = {
      critical: items.filter((item) => item.severity === 'critical').length,
      high: items.filter((item) => item.severity === 'high').length,
      attention: items.filter((item) => item.severity === 'attention').length,
      data: items.filter((item) => item.severity === 'data').length,
      good: items.filter((item) => item.severity === 'good').length,
    }

    const top = items.find((item) => item.severity !== 'data' && item.severity !== 'good') ?? items[0] ?? null
    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      engine: {
        version: 'MONI Intelligence V7 deterministic rules',
        principle: '구조화된 실제 데이터와 명시 규칙만 사용하며 확률·현금·세무 결과를 추측하지 않음',
      },
      counts,
      top_action: top,
      items,
      source_status: {
        production: true,
        receivables: true,
        sales_targets: true,
        financial_control: true,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'MONI Intelligence 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
