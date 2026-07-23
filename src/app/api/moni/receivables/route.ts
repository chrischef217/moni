import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const DUE_TYPES = new Set(['none', 'days_after_sale', 'next_month_day'])
const RECEIPT_METHODS = new Set(['bank', 'cash', 'card', 'other'])

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function validDate(value: unknown) {
  const date = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function dateDiffDays(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000)
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function collectionState(dueDate: string, outstanding: number) {
  if (outstanding <= 0) return { code: 'paid', d_day: null, label: '수금완료' }
  if (!dueDate) return { code: 'no_due_date', d_day: null, label: '입금예정일 미설정' }
  const dDay = dateDiffDays(todayKst(), dueDate)
  if (dDay < 0) return { code: 'overdue', d_day: dDay, label: `${Math.abs(dDay)}일 연체` }
  if (dDay === 0) return { code: 'due_today', d_day: 0, label: 'D-Day' }
  if (dDay <= 3) return { code: 'due_soon', d_day: dDay, label: `D-${dDay}` }
  return { code: 'scheduled', d_day: dDay, label: `D-${dDay}` }
}

async function syncOrderPaymentStatus(client: ReturnType<typeof createMoniServiceRoleClient>, orderId: string) {
  const [orderResult, receiptsResult] = await Promise.all([
    client.from('sales_orders').select('id,total_amount,status').eq('id', orderId).eq('business_id', BUSINESS_ID).single(),
    client.from('sales_receipts').select('amount').eq('order_id', orderId).eq('status', 'posted'),
  ])
  if (orderResult.error) throw new Error(orderResult.error.message)
  if (receiptsResult.error) throw new Error(receiptsResult.error.message)
  if (text(orderResult.data.status) === 'cancelled') return
  const received = (receiptsResult.data ?? []).reduce((sum, row) => sum + num(row.amount), 0)
  const total = num(orderResult.data.total_amount)
  const next = received <= 0 ? 'unpaid' : received + 0.009 >= total ? 'paid' : 'partial'
  const update = await client.from('sales_orders').update({ payment_status: next, updated_at: new Date().toISOString() }).eq('id', orderId)
  if (update.error) throw new Error(update.error.message)
}

async function loadReceivables(client: ReturnType<typeof createMoniServiceRoleClient>) {
  const [clientsResult, ordersResult] = await Promise.all([
    client.from('sales_clients').select('*').eq('business_id', BUSINESS_ID).order('status').order('company_name'),
    client.from('sales_orders').select('*').eq('business_id', BUSINESS_ID).neq('status', 'cancelled').order('due_date', { ascending: true, nullsFirst: false }).order('sale_date', { ascending: false }),
  ])
  if (clientsResult.error) throw new Error(clientsResult.error.message)
  if (ordersResult.error) throw new Error(ordersResult.error.message)

  const orders = ordersResult.data ?? []
  const orderIds = orders.map((row) => row.id)
  const receiptsResult = orderIds.length
    ? await client.from('sales_receipts').select('*').in('order_id', orderIds).order('receipt_date', { ascending: false }).order('created_at', { ascending: false })
    : { data: [], error: null }
  if (receiptsResult.error) throw new Error(receiptsResult.error.message)

  const receiptsByOrder = new Map<string, Record<string, unknown>[]>()
  for (const row of receiptsResult.data ?? []) {
    const key = text(row.order_id)
    receiptsByOrder.set(key, [...(receiptsByOrder.get(key) ?? []), row])
  }
  const clientById = new Map((clientsResult.data ?? []).map((row) => [text(row.id), row]))

  const hydratedOrders = orders.map((row) => {
    const receipts = receiptsByOrder.get(text(row.id)) ?? []
    const posted = receipts.filter((receipt) => text(receipt.status) === 'posted')
    const postedReceived = money(posted.reduce((sum, receipt) => sum + num(receipt.amount), 0))
    const total = money(row.total_amount)
    let receivedAmount = postedReceived
    let outstandingAmount = Math.max(0, money(total - postedReceived))
    let source = posted.length ? 'receipts' : 'status'
    let unverifiedPartial = false

    if (!posted.length && text(row.payment_status) === 'paid') {
      receivedAmount = total
      outstandingAmount = 0
      source = 'legacy_paid_status'
    } else if (!posted.length && text(row.payment_status) === 'partial') {
      receivedAmount = 0
      outstandingAmount = total
      source = 'legacy_partial_unverified'
      unverifiedPartial = true
    }

    const dueDate = text(row.due_date)
    const collection = collectionState(dueDate, outstandingAmount)
    const clientRow = clientById.get(text(row.client_id))
    return {
      ...row,
      client_name: text(clientRow?.company_name) || '거래처 확인 필요',
      receipts,
      verified_received_amount: postedReceived,
      received_amount: receivedAmount,
      outstanding_amount: outstandingAmount,
      collection_source: source,
      unverified_partial: unverifiedPartial,
      collection_state: collection.code,
      collection_label: collection.label,
      d_day: collection.d_day,
    }
  })

  const confirmed = hydratedOrders.filter((row) => text(row.status) === 'confirmed')
  const open = confirmed.filter((row) => num(row.outstanding_amount) > 0)
  const today = todayKst()
  const month = today.slice(0, 7)
  const postedReceipts = (receiptsResult.data ?? []).filter((row) => text(row.status) === 'posted')
  const receivedThisMonth = postedReceipts
    .filter((row) => text(row.receipt_date).startsWith(month))
    .reduce((sum, row) => sum + num(row.amount), 0)

  const summary = {
    confirmed_sales_amount: money(confirmed.reduce((sum, row) => sum + num(row.total_amount), 0)),
    outstanding_amount: money(open.reduce((sum, row) => sum + num(row.outstanding_amount), 0)),
    overdue_amount: money(open.filter((row) => row.collection_state === 'overdue').reduce((sum, row) => sum + num(row.outstanding_amount), 0)),
    overdue_count: open.filter((row) => row.collection_state === 'overdue').length,
    due_soon_amount: money(open.filter((row) => row.collection_state === 'due_today' || row.collection_state === 'due_soon').reduce((sum, row) => sum + num(row.outstanding_amount), 0)),
    due_soon_count: open.filter((row) => row.collection_state === 'due_today' || row.collection_state === 'due_soon').length,
    no_due_date_count: open.filter((row) => row.collection_state === 'no_due_date').length,
    received_this_month: money(receivedThisMonth),
    verified_receipt_total: money(postedReceipts.reduce((sum, row) => sum + num(row.amount), 0)),
    open_order_count: open.length,
  }

  return {
    today,
    clients: clientsResult.data ?? [],
    orders: hydratedOrders,
    receipts: receiptsResult.data ?? [],
    summary,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await loadReceivables(createMoniServiceRoleClient())) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수금·미수금 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action)
    const data = (body.data ?? {}) as Record<string, unknown>
    const id = text(body.id)
    const client = createMoniServiceRoleClient()

    if (action === 'save_client_due_rule') {
      if (!id) throw new Error('거래처 ID가 필요합니다.')
      const dueType = DUE_TYPES.has(text(data.payment_due_type)) ? text(data.payment_due_type) : 'none'
      const dueDays = dueType === 'days_after_sale' ? Math.max(0, Math.min(365, Math.round(num(data.payment_due_days)))) : null
      const dueDay = dueType === 'next_month_day' ? Math.max(1, Math.min(31, Math.round(num(data.payment_due_day) || 1))) : null
      const result = await client.from('sales_clients').update({
        payment_due_type: dueType,
        payment_due_days: dueDays,
        payment_due_day: dueDay,
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, client: result.data })
    }

    if (action === 'set_order_due_date') {
      if (!id) throw new Error('판매건 ID가 필요합니다.')
      const dueDate = text(data.due_date)
      if (dueDate && !validDate(dueDate)) throw new Error('입금예정일을 확인해 주세요.')
      const result = await client.from('sales_orders').update({ due_date: dueDate || null, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, order: result.data })
    }

    if (action === 'save_receipt') {
      const orderId = text(data.order_id) || id
      const receiptDate = text(data.receipt_date) || todayKst()
      const amount = money(data.amount)
      const method = RECEIPT_METHODS.has(text(data.method)) ? text(data.method) : 'bank'
      if (!orderId) throw new Error('판매건 ID가 필요합니다.')
      if (!validDate(receiptDate)) throw new Error('입금일자를 확인해 주세요.')
      if (amount <= 0) throw new Error('입금액은 0원보다 커야 합니다.')

      const [orderResult, postedResult] = await Promise.all([
        client.from('sales_orders').select('id,total_amount,status').eq('id', orderId).eq('business_id', BUSINESS_ID).single(),
        client.from('sales_receipts').select('amount').eq('order_id', orderId).eq('status', 'posted'),
      ])
      if (orderResult.error) throw new Error(orderResult.error.message)
      if (postedResult.error) throw new Error(postedResult.error.message)
      if (text(orderResult.data.status) === 'cancelled') throw new Error('취소된 판매건에는 입금을 등록할 수 없습니다.')
      const alreadyReceived = money((postedResult.data ?? []).reduce((sum, row) => sum + num(row.amount), 0))
      const outstanding = Math.max(0, money(num(orderResult.data.total_amount) - alreadyReceived))
      if (amount > outstanding + 0.009) throw new Error(`남은 미수금 ${Math.round(outstanding).toLocaleString('ko-KR')}원을 초과해 입금할 수 없습니다.`)

      const inserted = await client.from('sales_receipts').insert({
        business_id: BUSINESS_ID,
        order_id: orderId,
        receipt_date: receiptDate,
        amount,
        method,
        reference_no: text(data.reference_no) || null,
        note: text(data.note) || null,
      }).select('*').single()
      if (inserted.error) throw new Error(inserted.error.message)
      await syncOrderPaymentStatus(client, orderId)
      return NextResponse.json({ ok: true, receipt: inserted.data })
    }

    if (action === 'reverse_receipt') {
      if (!id) throw new Error('입금기록 ID가 필요합니다.')
      const current = await client.from('sales_receipts').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
      if (current.error) throw new Error(current.error.message)
      if (text(current.data.status) === 'reversed') throw new Error('이미 취소된 입금기록입니다.')
      const reason = text(data.reversal_reason)
      if (!reason) throw new Error('입금 취소 사유를 입력해 주세요.')
      const result = await client.from('sales_receipts').update({
        status: 'reversed',
        reversed_at: new Date().toISOString(),
        reversal_reason: reason,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select('*').single()
      if (result.error) throw new Error(result.error.message)
      await syncOrderPaymentStatus(client, text(current.data.order_id))
      return NextResponse.json({ ok: true, receipt: result.data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 수금관리 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수금관리 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
