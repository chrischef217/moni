import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '../receivables/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

function dateDiffDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000)
}

function collectionState(today: string, dueDate: string, outstanding: number) {
  if (outstanding <= 0) return { code: 'paid', d_day: null, label: '수금완료' }
  if (!dueDate) return { code: 'no_due_date', d_day: null, label: '입금예정일 미설정' }
  const dDay = dateDiffDays(today, dueDate)
  if (dDay < 0) return { code: 'overdue', d_day: dDay, label: `${Math.abs(dDay)}일 연체` }
  if (dDay === 0) return { code: 'due_today', d_day: 0, label: 'D-Day' }
  if (dDay <= 3) return { code: 'due_soon', d_day: dDay, label: `D-${dDay}` }
  return { code: 'scheduled', d_day: dDay, label: `D-${dDay}` }
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  if (!response.ok) return response
  const payload = await response.json() as any
  if (!payload?.ok || !Array.isArray(payload.orders)) return NextResponse.json(payload, { status: response.status })

  const orders = payload.orders as any[]
  const creditsByOriginal = new Map<string, number>()
  let adjustmentTotal = 0

  for (const row of orders) {
    const source = text(row.source_type).toUpperCase()
    if (!['RETURN', 'CREDIT'].includes(source) || text(row.status) !== 'confirmed') continue
    const originalOrderId = text(row.source_reference)
    const credit = Math.abs(money(row.total_amount))
    adjustmentTotal = money(adjustmentTotal + credit)
    if (originalOrderId) creditsByOriginal.set(originalOrderId, money((creditsByOriginal.get(originalOrderId) ?? 0) + credit))
    row.adjustment_type = source
    row.adjustment_credit_amount = credit
    row.outstanding_amount = 0
    row.received_amount = 0
    row.collection_source = 'sales_adjustment'
    row.collection_state = 'paid'
    row.collection_label = source === 'RETURN' ? '반품 전표' : '매출차감 전표'
    row.d_day = null
  }

  for (const row of orders) {
    const source = text(row.source_type).toUpperCase()
    if (['RETURN', 'CREDIT'].includes(source)) continue
    const credit = creditsByOriginal.get(text(row.id)) ?? 0
    if (!(credit > 0)) continue
    const before = Math.max(0, money(row.outstanding_amount))
    const applied = Math.min(before, credit)
    row.adjustment_credit_amount = applied
    row.outstanding_before_adjustment = before
    row.outstanding_amount = Math.max(0, money(before - applied))
    const state = collectionState(text(payload.today), text(row.due_date), row.outstanding_amount)
    row.collection_state = state.code
    row.collection_label = state.label
    row.d_day = state.d_day
  }

  const confirmed = orders.filter((row) => text(row.status) === 'confirmed' && !['RETURN', 'CREDIT'].includes(text(row.source_type).toUpperCase()))
  const open = confirmed.filter((row) => num(row.outstanding_amount) > 0)
  payload.summary = {
    ...payload.summary,
    outstanding_amount: money(open.reduce((sum, row) => sum + num(row.outstanding_amount), 0)),
    overdue_amount: money(open.filter((row) => row.collection_state === 'overdue').reduce((sum, row) => sum + num(row.outstanding_amount), 0)),
    overdue_count: open.filter((row) => row.collection_state === 'overdue').length,
    due_soon_amount: money(open.filter((row) => row.collection_state === 'due_today' || row.collection_state === 'due_soon').reduce((sum, row) => sum + num(row.outstanding_amount), 0)),
    due_soon_count: open.filter((row) => row.collection_state === 'due_today' || row.collection_state === 'due_soon').length,
    no_due_date_count: open.filter((row) => row.collection_state === 'no_due_date').length,
    open_order_count: open.length,
    sales_adjustment_total: adjustmentTotal,
  }

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}

export const POST = legacyPOST
