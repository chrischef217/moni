import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
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

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function nextStatementNumber(client: ReturnType<typeof createMoniServiceRoleClient>, saleDate: string) {
  const prefix = `DB-${saleDate.replaceAll('-', '')}-`
  const result = await client
    .from('sales_orders')
    .select('statement_number')
    .eq('business_id', BUSINESS_ID)
    .like('statement_number', `${prefix}%`)
    .order('statement_number', { ascending: false })
    .limit(1)
  if (result.error) throw new Error(result.error.message)
  const latest = text(result.data?.[0]?.statement_number)
  const sequence = latest.startsWith(prefix) ? Number(latest.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(3, '0')}`
}

async function postedReceiptTotal(client: ReturnType<typeof createMoniServiceRoleClient>, orderId: string) {
  const result = await client.from('sales_receipts').select('amount').eq('order_id', orderId).eq('status', 'posted')
  if (result.error) throw new Error(result.error.message)
  return money((result.data ?? []).reduce((sum, row) => sum + num(row.amount), 0))
}

function prepareOtherItems(rawItems: unknown) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('상품을 한 개 이상 입력해 주세요.')

  return rawItems.map((raw, index) => {
    const source = (raw ?? {}) as Record<string, unknown>
    const productName = text(source.product_name)
    const quantity = num(source.quantity)
    const unit = text(source.unit)
    const unitPrice = money(source.unit_price)

    if (!productName) throw new Error(`${index + 1}번째 상품명을 입력해 주세요.`)
    if (quantity <= 0) throw new Error(`${index + 1}번째 상품 수량을 확인해 주세요.`)
    if (!unit) throw new Error(`${index + 1}번째 상품 단위를 입력해 주세요.`)
    if (unitPrice < 0) throw new Error(`${index + 1}번째 상품 단가를 확인해 주세요.`)

    return {
      product_id: null,
      product_name: productName,
      specification: null,
      sales_variant_id: null,
      sales_variant_name: null,
      quantity,
      unit,
      unit_price: unitPrice,
      supply_amount: money(quantity * unitPrice),
      quantity_kg: null,
      currency: 'KRW',
      source_product_id: null,
      sort_order: index,
    }
  })
}

async function saveOtherOrder(client: ReturnType<typeof createMoniServiceRoleClient>, id: string, data: Record<string, unknown>) {
  const saleDate = text(data.sale_date) || todayKst()
  const clientId = text(data.client_id)
  if (!validDate(saleDate)) throw new Error('판매일자를 확인해 주세요.')
  if (!clientId) throw new Error('거래처를 선택해 주세요.')

  const clientResult = await client
    .from('sales_clients')
    .select('id,status')
    .eq('id', clientId)
    .eq('business_id', BUSINESS_ID)
    .single()
  if (clientResult.error) throw new Error('거래처를 확인해 주세요.')
  if (text(clientResult.data.status) !== 'active') throw new Error('현재 거래 중지된 거래처입니다.')

  if (id && (await postedReceiptTotal(client, id)) > 0) {
    throw new Error('이미 실제 입금이 등록된 상품 판매건은 수정할 수 없습니다. 입금을 먼저 확인해 주세요.')
  }

  const prepared = prepareOtherItems(data.items)
  const supplyAmount = money(prepared.reduce((sum, row) => sum + num(row.supply_amount), 0))
  const vatApplied = Boolean(data.vat_applied)
  const vatRate = vatApplied ? 10 : 0
  const vatAmount = money(supplyAmount * vatRate / 100)
  const totalAmount = money(supplyAmount + vatAmount)

  const peopleResult = await client
    .from('sales_client_people')
    .select('person_id,is_primary')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('is_primary', { ascending: false })
    .limit(1)
  if (peopleResult.error) throw new Error(peopleResult.error.message)
  const primaryPersonId = text(peopleResult.data?.[0]?.person_id) || null

  let order: Record<string, unknown>
  if (id) {
    const [snapshotOrder, snapshotItems] = await Promise.all([
      client.from('sales_orders').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single(),
      client.from('sales_order_items').select('*').eq('order_id', id).order('sort_order'),
    ])
    if (snapshotOrder.error) throw new Error(snapshotOrder.error.message)
    if (snapshotItems.error) throw new Error(snapshotItems.error.message)
    if (text(snapshotOrder.data.source_type).toUpperCase() !== 'OTHER') throw new Error('기타 상품 판매건만 이 화면에서 수정할 수 있습니다.')
    if (text(snapshotOrder.data.status) === 'cancelled') throw new Error('삭제된 판매건은 수정할 수 없습니다.')

    const history = await client.from('sales_order_history').insert({
      order_id: id,
      action: 'update-other',
      snapshot: { order: snapshotOrder.data, items: snapshotItems.data ?? [] },
    })
    if (history.error) throw new Error(history.error.message)

    const update = await client
      .from('sales_orders')
      .update({
        sale_date: saleDate,
        client_id: clientId,
        assigned_person_id: primaryPersonId,
        status: 'confirmed',
        payment_status: 'unpaid',
        vat_rate: vatRate,
        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        note: text(data.note) || null,
        source_type: 'OTHER',
        source_reference: null,
        currency: 'KRW',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('business_id', BUSINESS_ID)
      .select('*')
      .single()
    if (update.error) throw new Error(update.error.message)
    order = update.data

    const removedSettlements = await client.from('sales_order_item_settlements').delete().eq('order_id', id)
    if (removedSettlements.error) throw new Error(removedSettlements.error.message)
    const removedItems = await client.from('sales_order_items').delete().eq('order_id', id)
    if (removedItems.error) throw new Error(removedItems.error.message)
  } else {
    const statementNumber = await nextStatementNumber(client, saleDate)
    const insert = await client
      .from('sales_orders')
      .insert({
        business_id: BUSINESS_ID,
        statement_number: statementNumber,
        sale_date: saleDate,
        client_id: clientId,
        assigned_person_id: primaryPersonId,
        status: 'confirmed',
        payment_status: 'unpaid',
        vat_rate: vatRate,
        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        note: text(data.note) || null,
        source_type: 'OTHER',
        source_reference: null,
        currency: 'KRW',
      })
      .select('*')
      .single()
    if (insert.error) throw new Error(insert.error.message)
    order = insert.data
  }

  const insertedItems = await client
    .from('sales_order_items')
    .insert(prepared.map((row) => ({ ...row, order_id: order.id })))
    .select('*')
    .order('sort_order')
  if (insertedItems.error) throw new Error(insertedItems.error.message)

  return { ...order, items: insertedItems.data ?? [] }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })

    const action = text(body.action)
    const id = text(body.id)
    const data = (body.data ?? {}) as Record<string, unknown>
    const client = createMoniServiceRoleClient()

    if (action === 'save_other_order') {
      return NextResponse.json({ ok: true, order: await saveOtherOrder(client, id, data) })
    }
    return NextResponse.json({ ok: false, error: '지원하지 않는 상품 판매 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '상품 판매 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
