import { GET as getProductionDashboard } from '@/app/api/moni/production-dashboard/route'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const BUSINESS_ID = '20220523011'
const SOURCE_REF = 'moni_intelligence_v7'

type Json = Record<string, any>
type AlertCandidate = {
  id: string
  category: 'collection' | 'cash' | 'sales' | 'production' | 'tax' | 'data' | 'system'
  severity: 'critical' | 'high' | 'attention' | 'data' | 'info'
  title: string
  summary: string
  action: string
  href: string
  evidence: string[]
  impact_amount: number
  due_date: string | null
}

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(num(value)))}원`

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function monthRange(date: string) {
  const start = `${date.slice(0, 7)}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { start, end }
}

function dateDiffDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000)
}

function collectionState(dueDate: string, outstanding: number, today: string) {
  if (outstanding <= 0) return 'paid'
  if (!dueDate) return 'no_due_date'
  const dDay = dateDiffDays(today, dueDate)
  if (dDay < 0) return 'overdue'
  if (dDay === 0) return 'due_today'
  if (dDay <= 3) return 'due_soon'
  return 'scheduled'
}

async function loadProduction() {
  const response = await getProductionDashboard()
  const payload = await response.json() as Json
  if (!response.ok || payload.ok === false) throw new Error(text(payload.error) || '생산 대시보드 조회 실패')
  return payload
}

async function addHistory(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  eventId: string,
  previousStatus: string | null,
  nextStatus: string,
  note: string,
) {
  const result = await client.from('moni_alert_event_history').insert({
    business_id: BUSINESS_ID,
    event_id: eventId,
    previous_status: previousStatus,
    next_status: nextStatus,
    actor_type: 'system',
    note,
  })
  if (result.error) throw new Error(result.error.message)
}

export async function syncMoniBackgroundAlerts() {
  const client = createMoniServiceRoleClient()
  const today = todayKst()
  const range = monthRange(today)
  const forecastEnd = addDays(today, 30)

  const [
    ordersResult,
    receiptsResult,
    targetsResult,
    opportunitiesResult,
    cashResult,
    settlementsResult,
    accountsResult,
    snapshotsResult,
    production,
  ] = await Promise.all([
    client.from('sales_orders').select('id,statement_number,sale_date,due_date,total_amount,status,payment_status,assigned_person_id').eq('business_id', BUSINESS_ID).neq('status', 'cancelled'),
    client.from('sales_receipts').select('order_id,receipt_date,amount,status').eq('business_id', BUSINESS_ID),
    client.from('sales_monthly_targets').select('*').eq('business_id', BUSINESS_ID).eq('target_month', range.start),
    client.from('sales_opportunities').select('id,stage,expected_amount,close_date').eq('business_id', BUSINESS_ID),
    client.from('cash_flow').select('*').eq('business_id', BUSINESS_ID),
    client.from('freelancer_settlements').select('id,status,net_amount,due_date,paid_date,settlement_month,withholding_amount').eq('business_id', BUSINESS_ID),
    client.from('finance_accounts').select('id,active').eq('business_id', BUSINESS_ID),
    client.from('finance_balance_snapshots').select('account_id,balance_date,balance_amount').eq('business_id', BUSINESS_ID).order('balance_date', { ascending: false }),
    loadProduction(),
  ])

  const failed = [ordersResult, receiptsResult, targetsResult, opportunitiesResult, cashResult, settlementsResult, accountsResult, snapshotsResult]
    .find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const orders = (ordersResult.data ?? []) as Json[]
  const receipts = (receiptsResult.data ?? []) as Json[]
  const targets = (targetsResult.data ?? []) as Json[]
  const opportunities = (opportunitiesResult.data ?? []) as Json[]
  const cashRows = (cashResult.data ?? []) as Json[]
  const settlements = (settlementsResult.data ?? []) as Json[]
  const accounts = (accountsResult.data ?? []) as Json[]
  const snapshots = (snapshotsResult.data ?? []) as Json[]

  const postedReceipts = receipts.filter((row) => text(row.status) === 'posted')
  const receivedByOrder = new Map<string, number>()
  for (const receipt of postedReceipts) {
    const orderId = text(receipt.order_id)
    receivedByOrder.set(orderId, money((receivedByOrder.get(orderId) ?? 0) + num(receipt.amount)))
  }

  const confirmedOrders = orders.filter((row) => text(row.status) === 'confirmed')
  const hydrated = confirmedOrders.map((order) => {
    const total = money(order.total_amount)
    const actualReceived = receivedByOrder.get(text(order.id)) ?? 0
    let outstanding = Math.max(0, money(total - actualReceived))
    if (actualReceived <= 0 && text(order.payment_status) === 'paid') outstanding = 0
    const dueDate = text(order.due_date)
    return {
      ...order,
      outstanding_amount: outstanding,
      collection_state: collectionState(dueDate, outstanding, today),
      due_date: dueDate || null,
    }
  })
  const openOrders = hydrated.filter((row) => num(row.outstanding_amount) > 0)
  const overdue = openOrders.filter((row) => row.collection_state === 'overdue')
  const dueSoon = openOrders.filter((row) => row.collection_state === 'due_today' || row.collection_state === 'due_soon')
  const noDueDate = openOrders.filter((row) => row.collection_state === 'no_due_date')
  const overdueAmount = money(overdue.reduce((sum, row) => sum + num(row.outstanding_amount), 0))
  const dueSoonAmount = money(dueSoon.reduce((sum, row) => sum + num(row.outstanding_amount), 0))
  const earliestOverdue = overdue.map((row) => text(row.due_date)).filter(Boolean).sort()[0] || null
  const earliestDueSoon = dueSoon.map((row) => text(row.due_date)).filter(Boolean).sort()[0] || null

  const companyTarget = targets.find((row) => text(row.scope_type) === 'company') ?? null
  const monthSales = confirmedOrders.filter((row) => text(row.sale_date) >= range.start && text(row.sale_date) <= range.end)
  const actualSales = money(monthSales.reduce((sum, row) => sum + num(row.total_amount), 0))
  const targetAmount = companyTarget ? money(companyTarget.target_amount) : null
  const targetGap = targetAmount === null ? null : Math.max(0, money(targetAmount - actualSales))
  const openStages = new Set(['lead', 'contacted', 'proposal', 'negotiation'])
  const openMonthPipeline = opportunities.filter((row) => openStages.has(text(row.stage)) && text(row.close_date) >= range.start && text(row.close_date) <= range.end)
  const openPipelineAmount = money(openMonthPipeline.reduce((sum, row) => sum + num(row.expected_amount), 0))
  const noClosePipelineCount = opportunities.filter((row) => openStages.has(text(row.stage)) && !text(row.close_date)).length

  const plannedReceivableInflow = openOrders
    .filter((row) => row.due_date && row.due_date >= today && row.due_date <= forecastEnd)
    .reduce((sum, row) => sum + num(row.outstanding_amount), 0)
  const plannedManualInflow = cashRows
    .filter((row) => text(row.status) === 'planned' && text(row.type) === 'inflow' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const plannedManualOutflow = cashRows
    .filter((row) => text(row.status) === 'planned' && text(row.type) === 'outflow' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const plannedSettlementOutflow = settlements
    .filter((row) => text(row.status) === 'confirmed' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .reduce((sum, row) => sum + num(row.net_amount), 0)
  const planned30dInflow = money(plannedReceivableInflow + plannedManualInflow)
  const planned30dOutflow = money(plannedManualOutflow + plannedSettlementOutflow)
  const planned30dNet = money(planned30dInflow - planned30dOutflow)

  const activeAccounts = accounts.filter((row) => row.active !== false)
  const latestSnapshotByAccount = new Map<string, Json>()
  for (const snapshot of snapshots) {
    const accountId = text(snapshot.account_id)
    if (!accountId || text(snapshot.balance_date) > today || latestSnapshotByAccount.has(accountId)) continue
    latestSnapshotByAccount.set(accountId, snapshot)
  }
  const accountsWithoutBalance = activeAccounts.filter((account) => !latestSnapshotByAccount.has(text(account.id))).length
  const staleBalanceAccounts = activeAccounts.filter((account) => {
    const snapshot = latestSnapshotByAccount.get(text(account.id))
    const date = text(snapshot?.balance_date)
    return Boolean(date && dateDiffDays(date, today) > 7)
  }).length
  const paidSettlementWithoutDateCount = settlements.filter((row) => text(row.status) === 'paid' && !text(row.paid_date)).length

  const productionKpi = production.kpis ?? {}
  const candidates: AlertCandidate[] = []

  if (overdue.length > 0) {
    candidates.push({
      id: 'overdue-receivables', category: 'collection', severity: 'critical',
      title: `연체 미수금 ${overdue.length}건을 먼저 회수해야 합니다.`,
      summary: `입금예정일이 지난 미수금이 ${won(overdueAmount)} 있습니다.`,
      action: '연체 건 확인 및 수금 조치', href: '/business-management?tab=sales-management&view=receivables',
      evidence: [`연체 ${overdue.length}건`, `연체금액 ${won(overdueAmount)}`], impact_amount: overdueAmount, due_date: earliestOverdue,
    })
  }

  if (planned30dNet < 0) {
    candidates.push({
      id: 'negative-30d-cash', category: 'cash', severity: 'critical',
      title: '향후 30일 예정자금이 순유출입니다.',
      summary: `현재 등록된 예정 유입보다 유출이 ${won(Math.abs(planned30dNet))} 큽니다.`,
      action: '30일 예정 입출금과 지급일 재점검', href: '/business-management?tab=accounting&view=financial-control',
      evidence: [`예정유입 ${won(planned30dInflow)}`, `예정유출 ${won(planned30dOutflow)}`, `예정순증감 ${won(planned30dNet)}`], impact_amount: Math.abs(planned30dNet), due_date: null,
    })
  }

  if (num(productionKpi.risk?.risk_work_orders) > 0 || num(productionKpi.risk?.shortage_materials) > 0) {
    candidates.push({
      id: 'production-material-risk', category: 'production', severity: 'critical',
      title: '향후 생산에 원재료 부족 위험이 있습니다.',
      summary: `위험 작업지시 ${num(productionKpi.risk?.risk_work_orders)}건, 부족 예상 원재료 ${num(productionKpi.risk?.shortage_materials)}종입니다.`,
      action: '생산계획과 원재료 조달 확인', href: '/?legacy=1&moni_target=production-overview',
      evidence: [`위험 작업지시 ${num(productionKpi.risk?.risk_work_orders)}건`, `부족재료 ${num(productionKpi.risk?.shortage_materials)}종`, `확인단가 구매참고 ${won(productionKpi.risk?.known_purchase_cost_won)}`], impact_amount: Math.max(0, num(productionKpi.risk?.known_purchase_cost_won)), due_date: null,
    })
  }

  if (dueSoon.length > 0) {
    candidates.push({
      id: 'due-soon-receivables', category: 'collection', severity: 'high',
      title: `3일 내 수금예정 ${dueSoon.length}건이 있습니다.`, summary: `D-3~D-Day 예정금액은 ${won(dueSoonAmount)}입니다.`,
      action: '입금예정 거래처 사전 확인', href: '/business-management?tab=sales-management&view=receivables',
      evidence: [`3일 내 ${dueSoon.length}건`, `예정금액 ${won(dueSoonAmount)}`], impact_amount: dueSoonAmount, due_date: earliestDueSoon,
    })
  }

  if (targetAmount !== null && targetGap !== null && targetGap > 0) {
    const uncovered = Math.max(0, targetGap - openPipelineAmount)
    candidates.push({
      id: 'sales-target-gap', category: 'sales', severity: uncovered > 0 ? 'high' : 'attention',
      title: uncovered > 0 ? '목표 부족액이 현재 파이프라인 원금액보다 큽니다.' : '월 목표매출이 아직 미달입니다.',
      summary: uncovered > 0 ? `목표 부족 ${won(targetGap)} 중 현재 이번 달 종료예정 파이프라인 원금액으로도 ${won(uncovered)}가 남습니다.` : `목표 부족 ${won(targetGap)}이며 이번 달 종료예정 파이프라인 원금액은 ${won(openPipelineAmount)}입니다.`,
      action: '영업 목표와 파이프라인 점검', href: '/business-management?tab=sales&view=targets',
      evidence: [`목표 ${won(targetAmount)}`, `실제매출 ${won(actualSales)}`, `목표부족 ${won(targetGap)}`, `파이프라인 원금액 ${won(openPipelineAmount)}`], impact_amount: targetGap, due_date: null,
    })
  }

  if (num(productionKpi.loss?.loss_rate) >= 2) {
    candidates.push({
      id: 'production-loss', category: 'production', severity: 'high',
      title: `생산 로스율이 ${num(productionKpi.loss?.loss_rate).toFixed(2)}%입니다.`, summary: '현재 생산 대시보드 경고 기준인 2% 이상입니다.',
      action: '제품별 로스 TOP5 확인', href: '/?legacy=1&moni_target=production-overview',
      evidence: [`로스 ${(num(productionKpi.loss?.loss_g) / 1000).toFixed(1)}kg`, `확인단가 기준 로스영향 ${won(productionKpi.loss?.known_loss_cost_won)}`], impact_amount: Math.max(0, num(productionKpi.loss?.known_loss_cost_won)), due_date: null,
    })
  }

  if (!companyTarget) {
    candidates.push({ id: 'missing-sales-target', category: 'data', severity: 'data', title: '이번 달 회사 목표매출이 설정되지 않았습니다.', summary: '목표가 없으면 목표 부족액과 달성률 판단을 할 수 없습니다.', action: '월 목표매출 설정', href: '/business-management?tab=sales&view=targets', evidence: ['회사 월 목표매출 미설정'], impact_amount: 0, due_date: null })
  }
  if (noDueDate.length > 0) {
    candidates.push({ id: 'missing-receivable-dates', category: 'data', severity: 'data', title: `입금예정일이 없는 미수 판매가 ${noDueDate.length}건 있습니다.`, summary: '입금예정일이 없으면 연체와 D-Day를 판단할 수 없습니다.', action: '입금예정일 설정', href: '/business-management?tab=sales-management&view=receivables', evidence: [`입금예정일 미설정 ${noDueDate.length}건`], impact_amount: 0, due_date: null })
  }
  if (activeAccounts.length === 0 || accountsWithoutBalance > 0 || staleBalanceAccounts > 0) {
    candidates.push({ id: 'account-balance-data', category: 'data', severity: 'data', title: activeAccounts.length === 0 ? '계좌·현금함 잔액이 아직 등록되지 않았습니다.' : '계좌잔액 최신성 확인이 필요합니다.', summary: activeAccounts.length === 0 ? '은행 자동연동이 없으므로 잔액 Snapshot을 등록해야 현재 보유현금을 볼 수 있습니다.' : `잔액 미등록 ${accountsWithoutBalance}개, 7일 초과 Snapshot ${staleBalanceAccounts}개입니다.`, action: '계좌잔액 Snapshot 갱신', href: '/business-management?tab=accounting&view=financial-control', evidence: [`활성 계좌 ${activeAccounts.length}개`, `잔액 미등록 ${accountsWithoutBalance}개`, `7일 초과 ${staleBalanceAccounts}개`], impact_amount: 0, due_date: null })
  }
  if (num(production.pricing?.unpriced_used_material_count) > 0) {
    candidates.push({ id: 'missing-material-prices', category: 'data', severity: 'data', title: `생산 사용 원재료 단가가 ${num(production.pricing?.unpriced_used_material_count)}종 미등록입니다.`, summary: '원가·로스 금액은 단가가 확인된 원재료만 계산됩니다.', action: '원재료 포장단가 보완', href: '/?legacy=1&moni_target=raw-materials', evidence: [`단가 미등록 사용원재료 ${num(production.pricing?.unpriced_used_material_count)}종`], impact_amount: 0, due_date: null })
  }
  if (noClosePipelineCount > 0) {
    candidates.push({ id: 'pipeline-no-close-date', category: 'data', severity: 'data', title: `예상종료일이 없는 영업기회가 ${noClosePipelineCount}건 있습니다.`, summary: '종료일이 없으면 월 목표 대비 이번 달 파이프라인에 포함할 수 없습니다.', action: '영업기회 예상종료일 보완', href: '/business-management?tab=sales&view=pipeline', evidence: [`close_date 미설정 ${noClosePipelineCount}건`], impact_amount: 0, due_date: null })
  }
  if (paidSettlementWithoutDateCount > 0) {
    candidates.push({ id: 'paid-settlement-no-date', category: 'data', severity: 'data', title: `지급일이 없는 지급완료 정산이 ${paidSettlementWithoutDateCount}건 있습니다.`, summary: '실제 현금지출 월을 정확히 판단할 수 없습니다.', action: '정산 지급일 보완', href: '/business-management?tab=accounting&view=financial-control', evidence: [`paid 상태지만 paid_date 없음 ${paidSettlementWithoutDateCount}건`], impact_amount: 0, due_date: null })
  }

  const existingResult = await client.from('moni_alert_events').select('*').eq('business_id', BUSINESS_ID).eq('source_type', 'internal_rule').eq('source_ref', SOURCE_REF)
  if (existingResult.error) throw new Error(existingResult.error.message)
  const existing = (existingResult.data ?? []) as Json[]
  const existingByKey = new Map(existing.map((row) => [text(row.dedupe_key), row]))
  const activeKeys = new Set<string>()
  const nowIso = new Date().toISOString()
  let created = 0
  let updated = 0
  let reopened = 0
  let resolved = 0

  for (const candidate of candidates) {
    const dedupeKey = `intelligence:${candidate.id}`
    activeKeys.add(dedupeKey)
    const old = existingByKey.get(dedupeKey) as Json | undefined
    const base = {
      business_id: BUSINESS_ID,
      dedupe_key: dedupeKey,
      source_type: 'internal_rule',
      source_ref: SOURCE_REF,
      category: candidate.category,
      severity: candidate.severity,
      title: candidate.title,
      summary: candidate.summary,
      recommended_action: candidate.action,
      impact_amount: candidate.impact_amount,
      due_date: candidate.due_date,
      deep_link: candidate.href,
      evidence_json: candidate.evidence,
      last_detected_at: nowIso,
    }

    if (!old) {
      const inserted = await client.from('moni_alert_events').insert({ ...base, status: 'new' }).select('id').single()
      if (inserted.error) throw new Error(inserted.error.message)
      await addHistory(client, text(inserted.data.id), null, 'new', '백그라운드 규칙 최초 감지')
      created += 1
      continue
    }

    const oldStatus = text(old.status)
    let nextStatus = oldStatus
    const deferredUntil = text(old.deferred_until)
    if (oldStatus === 'resolved') nextStatus = 'new'
    else if (oldStatus === 'deferred' && deferredUntil && new Date(deferredUntil).getTime() <= Date.now()) nextStatus = 'new'

    const update: Json = { ...base }
    if (nextStatus !== oldStatus) {
      update.status = nextStatus
      update.read_at = null
      update.acknowledged_at = null
      update.deferred_until = null
      update.resolved_at = null
      update.reopened_at = nowIso
      update.reopen_count = num(old.reopen_count) + 1
    }
    const result = await client.from('moni_alert_events').update(update).eq('id', old.id).eq('business_id', BUSINESS_ID)
    if (result.error) throw new Error(result.error.message)
    updated += 1
    if (nextStatus !== oldStatus) {
      await addHistory(client, text(old.id), oldStatus, nextStatus, '해결/보류된 조건이 다시 감지됨')
      reopened += 1
    }
  }

  for (const old of existing) {
    const key = text(old.dedupe_key)
    if (activeKeys.has(key) || ['resolved', 'ignored'].includes(text(old.status))) continue
    const result = await client.from('moni_alert_events').update({ status: 'resolved', resolved_at: nowIso, deferred_until: null }).eq('id', old.id).eq('business_id', BUSINESS_ID)
    if (result.error) throw new Error(result.error.message)
    await addHistory(client, text(old.id), text(old.status), 'resolved', '백그라운드 규칙 조건 해소')
    resolved += 1
  }

  return {
    ok: true,
    evaluated_at: nowIso,
    candidate_count: candidates.length,
    created,
    updated,
    reopened,
    resolved,
    sources: {
      receivables: true,
      sales_targets: true,
      financial_control: true,
      production: true,
    },
  }
}
