import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

type LedgerRow = {
  id: string
  date: string
  kind: 'purchase' | 'payment' | 'sale' | 'receipt'
  item: string
  quantity: string
  unit_price: number | null
  amount: number
  balance: number
  reference: string
  amount_verified: boolean
}

function paginate(rows: LedgerRow[], pageValue: string | null, pageSizeValue: string | null) {
  const pageSize = Math.min(50, Math.max(10, Math.round(num(pageSizeValue) || 20)))
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(pages, Math.max(1, Math.round(num(pageValue) || 1)))
  const start = (page - 1) * pageSize
  return { page, page_size: pageSize, pages, total: rows.length, rows: rows.slice(start, start + pageSize) }
}

function matches(row: LedgerRow, q: string) {
  if (!q) return true
  const haystack = `${row.date} ${row.item} ${row.reference} ${row.quantity}`.toLocaleLowerCase('ko-KR')
  return haystack.includes(q.toLocaleLowerCase('ko-KR'))
}

async function purchaseLedger(partyId: string, q: string) {
  const db = createMoniServiceRoleClient()
  const supplierResult = await db.from('purchase_suppliers').select('*').eq('id', partyId).eq('business_id', BUSINESS_ID).single()
  if (supplierResult.error) throw new Error('매입처를 찾을 수 없습니다.')

  const purchasesResult = await db.from('purchases').select('*').eq('supplier_id', partyId).eq('business_id', BUSINESS_ID).order('purchase_date', { ascending: true }).order('created_at', { ascending: true })
  if (purchasesResult.error) throw new Error(purchasesResult.error.message)
  const purchases = (purchasesResult.data ?? []).filter((row) => text(row.status).toUpperCase() !== 'CANCELLED')
  const ids = purchases.map((row) => text(row.id)).filter(Boolean)
  const paymentsResult = ids.length
    ? await db.from('purchase_payments').select('*').eq('business_id', BUSINESS_ID).in('purchase_id', ids).order('payment_date', { ascending: true }).order('created_at', { ascending: true })
    : { data: [], error: null }
  if (paymentsResult.error) throw new Error(paymentsResult.error.message)

  const events: Array<Omit<LedgerRow, 'balance'>> = []
  for (const row of purchases) {
    const verified = text(row.amount_basis) !== 'UNKNOWN' && (num(row.total_amount) > 0 || text(row.verification_status) === 'VERIFIED')
    events.push({
      id: `purchase:${text(row.id)}`,
      date: text(row.receipt_date) || text(row.purchase_date),
      kind: 'purchase',
      item: text(row.item_name) || '매입',
      quantity: `${num(row.quantity).toLocaleString('ko-KR', { maximumFractionDigits: 3 })} ${text(row.unit)}`.trim(),
      unit_price: num(row.unit_price) > 0 ? money(row.unit_price) : null,
      amount: verified ? money(row.total_amount) : 0,
      reference: text(row.purchase_no),
      amount_verified: verified,
    })
  }
  for (const row of paymentsResult.data ?? []) {
    events.push({
      id: `payment:${text(row.id)}`,
      date: text(row.payment_date),
      kind: 'payment',
      item: '지급',
      quantity: '',
      unit_price: null,
      amount: -money(row.amount),
      reference: text(row.reference) || text(row.payment_method),
      amount_verified: true,
    })
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  let balance = 0
  const full = events.map((event) => {
    balance = money(balance + event.amount)
    return { ...event, balance }
  })
  return { party: supplierResult.data, rows: full.filter((row) => matches(row, q)), current_balance: balance }
}

async function salesLedger(partyId: string, q: string) {
  const db = createMoniServiceRoleClient()
  const clientResult = await db.from('sales_clients').select('*').eq('id', partyId).eq('business_id', BUSINESS_ID).single()
  if (clientResult.error) throw new Error('매출처를 찾을 수 없습니다.')

  const ordersResult = await db.from('sales_orders').select('*').eq('client_id', partyId).eq('business_id', BUSINESS_ID).order('sale_date', { ascending: true }).order('created_at', { ascending: true })
  if (ordersResult.error) throw new Error(ordersResult.error.message)
  const orders = (ordersResult.data ?? []).filter((row) => text(row.status).toLowerCase() !== 'cancelled')
  const ids = orders.map((row) => text(row.id)).filter(Boolean)
  const [itemsResult, receiptsResult] = await Promise.all([
    ids.length ? db.from('sales_order_items').select('*').in('order_id', ids).order('sort_order').order('created_at') : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('sales_receipts').select('*').eq('business_id', BUSINESS_ID).in('order_id', ids).eq('status', 'posted').order('receipt_date', { ascending: true }).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ])
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (receiptsResult.error) throw new Error(receiptsResult.error.message)

  const itemsByOrder = new Map<string, Record<string, unknown>[]>()
  for (const item of itemsResult.data ?? []) {
    const key = text(item.order_id)
    itemsByOrder.set(key, [...(itemsByOrder.get(key) ?? []), item])
  }
  const events: Array<Omit<LedgerRow, 'balance'>> = []
  for (const row of orders) {
    const items = itemsByOrder.get(text(row.id)) ?? []
    const itemLabel = items.length === 1 ? text(items[0].product_name) : items.map((item) => text(item.product_name)).filter(Boolean).join(', ')
    const quantity = items.length === 1
      ? `${num(items[0].quantity).toLocaleString('ko-KR', { maximumFractionDigits: 3 })} ${text(items[0].unit)}`.trim()
      : items.length ? `${items.length}개 품목` : '-'
    const unitPrice = items.length === 1 && num(items[0].unit_price) > 0 ? money(items[0].unit_price) : null
    events.push({
      id: `sale:${text(row.id)}`,
      date: text(row.sale_date),
      kind: 'sale',
      item: itemLabel || '매출',
      quantity,
      unit_price: unitPrice,
      amount: money(row.total_amount),
      reference: text(row.statement_number),
      amount_verified: true,
    })
  }
  for (const row of receiptsResult.data ?? []) {
    events.push({
      id: `receipt:${text(row.id)}`,
      date: text(row.receipt_date),
      kind: 'receipt',
      item: '입금',
      quantity: '',
      unit_price: null,
      amount: -money(row.amount),
      reference: text(row.reference_no) || text(row.method),
      amount_verified: true,
    })
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  let balance = 0
  const full = events.map((event) => {
    balance = money(balance + event.amount)
    return { ...event, balance }
  })
  return { party: clientResult.data, rows: full.filter((row) => matches(row, q)), current_balance: balance }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const kind = text(request.nextUrl.searchParams.get('kind'))
    const partyId = text(request.nextUrl.searchParams.get('party_id'))
    const q = text(request.nextUrl.searchParams.get('q'))
    if (!partyId) return NextResponse.json({ ok: false, error: '업체 ID가 필요합니다.' }, { status: 400 })
    if (kind !== 'purchase' && kind !== 'sales') return NextResponse.json({ ok: false, error: '원장 종류를 확인해 주세요.' }, { status: 400 })
    const result = kind === 'purchase' ? await purchaseLedger(partyId, q) : await salesLedger(partyId, q)
    const paged = paginate(result.rows, request.nextUrl.searchParams.get('page'), request.nextUrl.searchParams.get('page_size'))
    return NextResponse.json({ ok: true, kind, party: result.party, current_balance: result.current_balance, ...paged })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '거래원장을 불러오지 못했습니다.' }, { status: 500 })
  }
}
