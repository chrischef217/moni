import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const FLOW_TYPES = new Set(['inflow', 'outflow'])
const FLOW_STATUSES = new Set(['planned', 'posted'])
const FLOW_CATEGORIES = new Set(['purchase', 'operating_expense', 'payroll', 'tax', 'financing', 'investment', 'transfer', 'other'])
const ACCOUNT_TYPES = new Set(['bank', 'cash'])

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

type FinanceAccountRow = Record<string, unknown> & {
  latest_balance: number | null
  balance_date: string | null
  stale_days: number | null
}

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function dateDiffDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000)
}

function monthRange(value: unknown) {
  const month = text(value) || todayKst().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { month, start, end }
}

function validDate(value: unknown) {
  const date = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function loadData(client: ReturnType<typeof createMoniServiceRoleClient>, monthValue: unknown) {
  const range = monthRange(monthValue)
  const today = todayKst()
  const forecastEnd = addDays(today, 30)

  const [cashResult, receiptsResult, ordersResult, settlementsResult, peopleResult, accountsResult, snapshotsResult, settlementEventsResult] = await Promise.all([
    client.from('cash_flow').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }),
    client.from('sales_receipts').select('*').eq('business_id', BUSINESS_ID).order('receipt_date', { ascending: false }),
    client.from('sales_orders').select('id,statement_number,sale_date,due_date,total_amount,vat_amount,status,payment_status,client_id').eq('business_id', BUSINESS_ID).neq('status', 'cancelled').order('sale_date', { ascending: false }),
    client.from('freelancer_settlements').select('*').eq('business_id', BUSINESS_ID).order('settlement_month', { ascending: false }),
    client.from('business_people').select('id,name,person_type,status').eq('business_id', BUSINESS_ID),
    client.from('finance_accounts').select('*').eq('business_id', BUSINESS_ID).order('active', { ascending: false }).order('account_name'),
    client.from('finance_balance_snapshots').select('*').eq('business_id', BUSINESS_ID).order('balance_date', { ascending: false }),
    client.from('finance_settlement_payment_events').select('*').eq('business_id', BUSINESS_ID).order('created_at', { ascending: false }),
  ])

  const failed = [cashResult, receiptsResult, ordersResult, settlementsResult, peopleResult, accountsResult, snapshotsResult, settlementEventsResult]
    .find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const cashRows = (cashResult.data ?? []) as Array<Record<string, unknown>>
  const receipts = (receiptsResult.data ?? []) as Array<Record<string, unknown>>
  const orders = (ordersResult.data ?? []) as Array<Record<string, unknown>>
  const settlements = (settlementsResult.data ?? []) as Array<Record<string, unknown>>
  const people = (peopleResult.data ?? []) as Array<Record<string, unknown>>
  const accounts = (accountsResult.data ?? []) as Array<Record<string, unknown>>
  const snapshots = (snapshotsResult.data ?? []) as Array<Record<string, unknown>>
  const settlementEvents = (settlementEventsResult.data ?? []) as Array<Record<string, unknown>>

  const personById = new Map(people.map((row) => [text(row.id), text(row.name) || '담당자']))
  const postedReceipts = receipts.filter((row) => text(row.status) === 'posted')
  const receivedByOrder = new Map<string, number>()
  for (const receipt of postedReceipts) {
    const orderId = text(receipt.order_id)
    receivedByOrder.set(orderId, money((receivedByOrder.get(orderId) ?? 0) + num(receipt.amount)))
  }

  const receivableForecast = orders.map((order) => {
    const total = money(order.total_amount)
    const actualReceived = receivedByOrder.get(text(order.id)) ?? 0
    const legacyPaid = actualReceived <= 0 && text(order.payment_status) === 'paid'
    const outstanding = legacyPaid ? 0 : Math.max(0, money(total - actualReceived))
    return {
      order_id: text(order.id),
      statement_number: text(order.statement_number),
      due_date: text(order.due_date) || null,
      outstanding_amount: outstanding,
    }
  }).filter((row) => row.outstanding_amount > 0 && row.due_date && row.due_date >= today && row.due_date <= forecastEnd)

  const actualSalesReceipt = postedReceipts
    .filter((row) => text(row.receipt_date) >= range.start && text(row.receipt_date) <= range.end)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const manualPostedInflow = cashRows
    .filter((row) => text(row.status) === 'posted' && text(row.type) === 'inflow' && text(row.actual_date) >= range.start && text(row.actual_date) <= range.end)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const manualPostedOutflow = cashRows
    .filter((row) => text(row.status) === 'posted' && text(row.type) === 'outflow' && text(row.actual_date) >= range.start && text(row.actual_date) <= range.end)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const paidSettlementOutflow = settlements
    .filter((row) => text(row.status) === 'paid' && text(row.paid_date) >= range.start && text(row.paid_date) <= range.end)
    .reduce((sum, row) => sum + num(row.net_amount), 0)
  const paidWithoutDateCount = settlements.filter((row) => text(row.status) === 'paid' && !text(row.paid_date)).length

  const manualPlannedInflow = cashRows
    .filter((row) => text(row.status) === 'planned' && text(row.type) === 'inflow' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const manualPlannedOutflow = cashRows
    .filter((row) => text(row.status) === 'planned' && text(row.type) === 'outflow' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .reduce((sum, row) => sum + num(row.amount), 0)
  const receivablePlannedInflow = receivableForecast.reduce((sum, row) => sum + row.outstanding_amount, 0)
  const settlementPlannedOutflow = settlements
    .filter((row) => text(row.status) === 'confirmed' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .reduce((sum, row) => sum + num(row.net_amount), 0)

  const confirmedSales = orders.filter((row) => text(row.status) === 'confirmed' && text(row.sale_date) >= range.start && text(row.sale_date) <= range.end)
  const outputVat = confirmedSales.reduce((sum, row) => sum + num(row.vat_amount), 0)
  const inputVat = cashRows
    .filter((row) => text(row.status) !== 'reversed' && row.vat_deductible === true && text(row.tax_invoice_date) >= range.start && text(row.tax_invoice_date) <= range.end)
    .reduce((sum, row) => sum + num(row.vat_amount), 0)
  const monthSettlements = settlements.filter((row) => text(row.settlement_month) === range.start && ['confirmed', 'paid'].includes(text(row.status)))
  const withholdingReference = monthSettlements.reduce((sum, row) => sum + num(row.withholding_amount), 0)

  const latestSnapshotByAccount = new Map<string, Record<string, unknown>>()
  for (const snapshot of snapshots) {
    const accountId = text(snapshot.account_id)
    if (text(snapshot.balance_date) > today || latestSnapshotByAccount.has(accountId)) continue
    latestSnapshotByAccount.set(accountId, snapshot)
  }
  const accountRows: FinanceAccountRow[] = accounts.map((account) => {
    const snapshot = latestSnapshotByAccount.get(text(account.id))
    const date = text(snapshot?.balance_date)
    return {
      ...account,
      latest_balance: snapshot ? money(snapshot.balance_amount) : null,
      balance_date: date || null,
      stale_days: date ? Math.max(0, dateDiffDays(date, today)) : null,
    }
  })
  const activeAccounts = accountRows.filter((row) => row['active'] !== false)
  const registeredBalance = activeAccounts.reduce((sum, row) => sum + (row.latest_balance === null ? 0 : num(row.latest_balance)), 0)
  const accountsWithoutBalance = activeAccounts.filter((row) => row.latest_balance === null).length
  const staleBalanceAccounts = activeAccounts.filter((row) => row.stale_days !== null && num(row.stale_days) > 7).length

  const forecastRows: Array<Record<string, unknown>> = []
  receivableForecast.forEach((row) => forecastRows.push({ source: 'receivable', type: 'inflow', date: row.due_date, amount: row.outstanding_amount, label: `매출채권 ${row.statement_number}` }))
  cashRows.filter((row) => text(row.status) === 'planned' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .forEach((row) => forecastRows.push({ source: 'manual', id: row.id, type: row.type, date: row.due_date, amount: row.amount, label: text(row.counterpart) || text(row.note) || '예정 입출금' }))
  settlements.filter((row) => text(row.status) === 'confirmed' && text(row.due_date) >= today && text(row.due_date) <= forecastEnd)
    .forEach((row) => forecastRows.push({ source: 'settlement', id: row.id, type: 'outflow', date: row.due_date, amount: row.net_amount, label: `${personById.get(text(row.person_id)) || '프리랜서'} 정산` }))
  forecastRows.sort((a, b) => text(a.date).localeCompare(text(b.date)) || text(a.type).localeCompare(text(b.type)))

  const actualRows: Array<Record<string, unknown>> = []
  postedReceipts.filter((row) => text(row.receipt_date) >= range.start && text(row.receipt_date) <= range.end)
    .forEach((row) => actualRows.push({ source: 'sales_receipt', type: 'inflow', date: row.receipt_date, amount: row.amount, label: '판매대금 입금', reference_no: row.reference_no }))
  cashRows.filter((row) => text(row.status) === 'posted' && text(row.actual_date) >= range.start && text(row.actual_date) <= range.end)
    .forEach((row) => actualRows.push({ source: 'manual', id: row.id, type: row.type, date: row.actual_date, amount: row.amount, label: text(row.counterpart) || text(row.note) || '직접 입력', category: row.category, reference_no: row.reference_no }))
  settlements.filter((row) => text(row.status) === 'paid' && text(row.paid_date) >= range.start && text(row.paid_date) <= range.end)
    .forEach((row) => actualRows.push({ source: 'settlement', id: row.id, type: 'outflow', date: row.paid_date, amount: row.net_amount, label: `${personById.get(text(row.person_id)) || '프리랜서'} 정산 지급` }))
  actualRows.sort((a, b) => text(b.date).localeCompare(text(a.date)))

  return {
    range,
    today,
    forecast_end: forecastEnd,
    summary: {
      actual_inflow: money(actualSalesReceipt + manualPostedInflow),
      actual_outflow: money(manualPostedOutflow + paidSettlementOutflow),
      actual_net_movement: money(actualSalesReceipt + manualPostedInflow - manualPostedOutflow - paidSettlementOutflow),
      sales_receipt_inflow: money(actualSalesReceipt),
      manual_inflow: money(manualPostedInflow),
      manual_outflow: money(manualPostedOutflow),
      paid_settlement_outflow: money(paidSettlementOutflow),
      planned_30d_inflow: money(receivablePlannedInflow + manualPlannedInflow),
      planned_30d_outflow: money(manualPlannedOutflow + settlementPlannedOutflow),
      planned_30d_net: money(receivablePlannedInflow + manualPlannedInflow - manualPlannedOutflow - settlementPlannedOutflow),
      registered_account_balance: activeAccounts.length ? money(registeredBalance) : null,
      active_account_count: activeAccounts.length,
      accounts_without_balance: accountsWithoutBalance,
      stale_balance_accounts: staleBalanceAccounts,
      paid_settlement_without_date_count: paidWithoutDateCount,
    },
    tax: {
      output_vat: money(outputVat),
      registered_input_vat: money(inputVat),
      registered_vat_difference: money(outputVat - inputVat),
      freelancer_withholding_reference: money(withholdingReference),
      basis: '등록 자료 기준 참고값이며 실제 신고세액 확정값이 아님',
    },
    cash_entries: cashRows,
    accounts: accountRows,
    settlements: settlements.map((row) => ({ ...row, person_name: personById.get(text(row.person_id)) || '담당자' })),
    settlement_payment_events: settlementEvents,
    actual_rows: actualRows,
    forecast_rows: forecastRows,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await loadData(createMoniServiceRoleClient(), request.nextUrl.searchParams.get('month'))) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '재무 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action)
    const id = text(body.id)
    const data = (body.data ?? {}) as Record<string, unknown>
    const client = createMoniServiceRoleClient()

    if (action === 'save_cash_entry') {
      const type = FLOW_TYPES.has(text(data.type)) ? text(data.type) : 'outflow'
      const status = FLOW_STATUSES.has(text(data.status)) ? text(data.status) : 'planned'
      const category = FLOW_CATEGORIES.has(text(data.category)) ? text(data.category) : 'other'
      const amount = Math.round(num(data.amount))
      const vatAmount = Math.round(num(data.vat_amount))
      const dueDate = text(data.due_date)
      const actualDate = text(data.actual_date)
      const taxInvoiceDate = text(data.tax_invoice_date)
      if (amount <= 0) throw new Error('입출금 금액은 0원보다 커야 합니다.')
      if (vatAmount < 0 || vatAmount > amount) throw new Error('부가세 금액을 확인해 주세요.')
      if (dueDate && !validDate(dueDate)) throw new Error('예정일을 확인해 주세요.')
      if (status === 'posted' && !validDate(actualDate)) throw new Error('실제 입출금일을 입력해 주세요.')
      if (taxInvoiceDate && !validDate(taxInvoiceDate)) throw new Error('세금계산서 기준일을 확인해 주세요.')

      if (id) {
        const existing = await client.from('cash_flow').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
        if (existing.error) throw new Error(existing.error.message)
        if (text(existing.data.status) !== 'planned') throw new Error('이미 실제 반영되거나 취소된 입출금은 수정할 수 없습니다. 잘못된 경우 취소 후 새로 등록해 주세요.')
      }

      const payload = {
        business_id: BUSINESS_ID,
        type,
        status,
        category,
        counterpart: text(data.counterpart) || null,
        amount,
        due_date: dueDate || null,
        actual_date: status === 'posted' ? actualDate : null,
        reference_no: text(data.reference_no) || null,
        vat_amount: vatAmount,
        vat_deductible: type === 'outflow' && data.vat_deductible === true,
        tax_invoice_date: taxInvoiceDate || null,
        note: text(data.note) || null,
        updated_at: new Date().toISOString(),
      }
      const result = id
        ? await client.from('cash_flow').update(payload).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
        : await client.from('cash_flow').insert(payload).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, cash_entry: result.data })
    }

    if (action === 'reverse_cash_entry') {
      if (!id) throw new Error('입출금 기록 ID가 필요합니다.')
      const reason = text(data.reversal_reason)
      if (!reason) throw new Error('취소 사유를 입력해 주세요.')
      const existing = await client.from('cash_flow').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
      if (existing.error) throw new Error(existing.error.message)
      if (text(existing.data.status) !== 'posted') throw new Error('실제 반영된 입출금만 취소할 수 있습니다.')
      const result = await client.from('cash_flow').update({
        status: 'reversed',
        reversed_at: new Date().toISOString(),
        reversal_reason: reason,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, cash_entry: result.data })
    }

    if (action === 'save_account') {
      const accountName = text(data.account_name)
      const accountType = ACCOUNT_TYPES.has(text(data.account_type)) ? text(data.account_type) : 'bank'
      if (!accountName) throw new Error('계좌/현금함 이름을 입력해 주세요.')
      const payload = {
        business_id: BUSINESS_ID,
        account_name: accountName,
        account_type: accountType,
        institution_name: text(data.institution_name) || null,
        masked_account_no: text(data.masked_account_no) || null,
        active: data.active !== false,
        note: text(data.note) || null,
        updated_at: new Date().toISOString(),
      }
      const result = id
        ? await client.from('finance_accounts').update(payload).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
        : await client.from('finance_accounts').insert(payload).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, account: result.data })
    }

    if (action === 'save_balance_snapshot') {
      const accountId = text(data.account_id)
      const balanceDate = text(data.balance_date)
      const balanceAmount = money(data.balance_amount)
      if (!accountId) throw new Error('계좌/현금함을 선택해 주세요.')
      if (!validDate(balanceDate)) throw new Error('잔액 기준일을 확인해 주세요.')
      if (balanceAmount < 0) throw new Error('잔액은 0원 이상이어야 합니다.')
      const account = await client.from('finance_accounts').select('id').eq('id', accountId).eq('business_id', BUSINESS_ID).single()
      if (account.error) throw new Error('계좌/현금함을 확인해 주세요.')
      const result = await client.from('finance_balance_snapshots').upsert({
        business_id: BUSINESS_ID,
        account_id: accountId,
        balance_date: balanceDate,
        balance_amount: balanceAmount,
        note: text(data.note) || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'account_id,balance_date' }).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, snapshot: result.data })
    }

    if (action === 'set_settlement_due_date') {
      if (!id) throw new Error('정산건 ID가 필요합니다.')
      const dueDate = text(data.due_date)
      if (dueDate && !validDate(dueDate)) throw new Error('지급예정일을 확인해 주세요.')
      const result = await client.from('freelancer_settlements').update({ due_date: dueDate || null, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, settlement: result.data })
    }

    if (action === 'mark_settlement_paid') {
      if (!id) throw new Error('정산건 ID가 필요합니다.')
      const paidDate = text(data.paid_date)
      if (!validDate(paidDate)) throw new Error('지급일을 확인해 주세요.')
      const result = await client.rpc('mark_freelancer_settlement_paid_v6', { p_settlement_id: id, p_paid_date: paidDate })
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, settlement: result.data })
    }

    if (action === 'reverse_settlement_payment') {
      if (!id) throw new Error('정산건 ID가 필요합니다.')
      const reason = text(data.reason)
      if (!reason) throw new Error('지급취소 사유를 입력해 주세요.')
      const result = await client.rpc('reverse_freelancer_settlement_payment_v6', { p_settlement_id: id, p_reason: reason })
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, settlement: result.data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 재무 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '재무 데이터 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
