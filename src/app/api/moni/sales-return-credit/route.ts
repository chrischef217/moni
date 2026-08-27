import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const ADJUSTMENT_TYPES = new Set(['RETURN', 'CREDIT'])

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const roundQty = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 1000) / 1000

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
  const result = await client.from('sales_orders')
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

async function loadLedger(client: ReturnType<typeof createMoniServiceRoleClient>, month = '') {
  let originalQuery = client.from('sales_orders')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'confirmed')
    .not('source_type', 'in', '(RETURN,CREDIT)')
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(120)

  let adjustmentQuery = client.from('sales_orders')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .in('source_type', ['RETURN', 'CREDIT'])
    .order('sale_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(120)

  if (/^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`
    const next = new Date(`${start}T00:00:00Z`)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
    adjustmentQuery = adjustmentQuery.gte('sale_date', start).lte('sale_date', end)
  }

  const [originalsResult, adjustmentsResult, clientsResult] = await Promise.all([
    originalQuery,
    adjustmentQuery,
    client.from('sales_clients').select('id,company_name').eq('business_id', BUSINESS_ID).limit(1000),
  ])
  if (originalsResult.error) throw new Error(originalsResult.error.message)
  if (adjustmentsResult.error) throw new Error(adjustmentsResult.error.message)
  if (clientsResult.error) throw new Error(clientsResult.error.message)

  const originals = originalsResult.data ?? []
  const adjustments = adjustmentsResult.data ?? []
  const allOrderIds = [...originals, ...adjustments].map((row) => text(row.id)).filter(Boolean)
  const itemsResult = allOrderIds.length
    ? await client.from('sales_order_items').select('*').in('order_id', allOrderIds).order('sort_order').order('created_at')
    : { data: [], error: null }
  if (itemsResult.error) throw new Error(itemsResult.error.message)

  const itemsByOrder = new Map<string, Record<string, unknown>[]>()
  for (const item of itemsResult.data ?? []) {
    const key = text(item.order_id)
    itemsByOrder.set(key, [...(itemsByOrder.get(key) ?? []), item])
  }
  const clientById = new Map((clientsResult.data ?? []).map((row) => [text(row.id), text(row.company_name)]))

  const returnedByOriginalItem = new Map<string, number>()
  for (const adjustment of adjustments) {
    if (text(adjustment.status) !== 'confirmed' || text(adjustment.source_type) !== 'RETURN') continue
    for (const item of itemsByOrder.get(text(adjustment.id)) ?? []) {
      const originalItemId = text(item.original_order_item_id)
      if (!originalItemId) continue
      returnedByOriginalItem.set(originalItemId, roundQty((returnedByOriginalItem.get(originalItemId) ?? 0) + Math.abs(num(item.quantity))))
    }
  }

  const hydrate = (row: Record<string, unknown>) => ({
    ...row,
    client_name: clientById.get(text(row.client_id)) || text(row.manual_client_name) || '거래처 확인 필요',
    items: (itemsByOrder.get(text(row.id)) ?? []).map((item) => ({
      ...item,
      returned_quantity: returnedByOriginalItem.get(text(item.id)) ?? 0,
      returnable_quantity: Math.max(0, roundQty(Math.abs(num(item.quantity)) - (returnedByOriginalItem.get(text(item.id)) ?? 0))),
    })),
  })

  return {
    originals: originals.map(hydrate),
    adjustments: adjustments.map(hydrate),
  }
}

async function createAdjustment(client: ReturnType<typeof createMoniServiceRoleClient>, data: Record<string, unknown>) {
  const type = text(data.adjustment_type).toUpperCase()
  if (!ADJUSTMENT_TYPES.has(type)) throw new Error('처리 유형은 제품 반품 또는 매출 차감이어야 합니다.')
  const originalOrderId = text(data.original_order_id)
  const saleDate = text(data.sale_date) || todayKst()
  const reason = text(data.reason)
  if (!originalOrderId) throw new Error('원거래를 선택해 주세요.')
  if (!validDate(saleDate)) throw new Error('처리일자를 확인해 주세요.')
  if (!reason) throw new Error('반품/차감 사유를 입력해 주세요.')

  const originalResult = await client.from('sales_orders')
    .select('*')
    .eq('id', originalOrderId)
    .eq('business_id', BUSINESS_ID)
    .single()
  if (originalResult.error) throw new Error('원거래를 확인할 수 없습니다.')
  const original = originalResult.data
  if (text(original.status) !== 'confirmed') throw new Error('확정된 판매건만 반품/매출차감할 수 있습니다.')
  if (ADJUSTMENT_TYPES.has(text(original.source_type).toUpperCase())) throw new Error('반품/차감 전표를 다시 반품 처리할 수 없습니다.')

  const [originalItemsResult, priorAdjustmentsResult] = await Promise.all([
    client.from('sales_order_items').select('*').eq('order_id', originalOrderId).order('sort_order').order('created_at'),
    client.from('sales_orders').select('id,total_amount,status,source_type').eq('business_id', BUSINESS_ID).eq('source_reference', originalOrderId).in('source_type', ['RETURN', 'CREDIT']).neq('status', 'cancelled'),
  ])
  if (originalItemsResult.error) throw new Error(originalItemsResult.error.message)
  if (priorAdjustmentsResult.error) throw new Error(priorAdjustmentsResult.error.message)

  const originalItems = originalItemsResult.data ?? []
  const originalItemById = new Map(originalItems.map((item) => [text(item.id), item]))
  const priorAdjustmentIds = (priorAdjustmentsResult.data ?? []).map((row) => text(row.id)).filter(Boolean)
  const priorAdjustmentItemsResult = priorAdjustmentIds.length
    ? await client.from('sales_order_items').select('original_order_item_id,quantity').in('order_id', priorAdjustmentIds)
    : { data: [], error: null }
  if (priorAdjustmentItemsResult.error) throw new Error(priorAdjustmentItemsResult.error.message)

  const returnedByItem = new Map<string, number>()
  for (const item of priorAdjustmentItemsResult.data ?? []) {
    const key = text(item.original_order_item_id)
    if (!key) continue
    returnedByItem.set(key, roundQty((returnedByItem.get(key) ?? 0) + Math.abs(num(item.quantity))))
  }

  const priorAdjustmentTotal = money((priorAdjustmentsResult.data ?? [])
    .filter((row) => text(row.status) === 'confirmed')
    .reduce((sum, row) => sum + Math.abs(num(row.total_amount)), 0))
  const remainingOrderValue = Math.max(0, money(Math.abs(num(original.total_amount)) - priorAdjustmentTotal))
  if (remainingOrderValue <= 0.009) throw new Error('이 원거래는 이미 전액 반품/차감 처리되었습니다.')

  let preparedItems: Array<Record<string, unknown>> = []
  if (type === 'RETURN') {
    const rawItems = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : []
    if (!rawItems.length) throw new Error('반품할 품목을 한 개 이상 입력해 주세요.')
    preparedItems = rawItems.map((raw, index) => {
      const originalItemId = text(raw.original_order_item_id)
      const originalItem = originalItemById.get(originalItemId)
      if (!originalItem) throw new Error(`${index + 1}번째 반품 품목이 원거래에 없습니다.`)
      const requested = roundQty(raw.quantity)
      if (!(requested > 0)) throw new Error(`${index + 1}번째 반품 수량을 확인해 주세요.`)
      const alreadyReturned = returnedByItem.get(originalItemId) ?? 0
      const returnable = Math.max(0, roundQty(Math.abs(num(originalItem.quantity)) - alreadyReturned))
      if (requested > returnable + 0.0009) throw new Error(`${text(originalItem.product_name)} 반품 가능 수량은 ${returnable.toLocaleString('ko-KR')} ${text(originalItem.unit)}입니다.`)
      const originalQty = Math.abs(num(originalItem.quantity))
      const originalKg = Math.abs(num(originalItem.quantity_kg))
      const quantityKg = originalQty > 0 && originalKg > 0 ? roundQty(requested * originalKg / originalQty) : 0
      const unitPrice = money(originalItem.unit_price)
      return {
        product_id: originalItem.product_id,
        product_name: originalItem.product_name,
        specification: originalItem.specification,
        sales_variant_id: originalItem.sales_variant_id,
        sales_variant_name: originalItem.sales_variant_name,
        original_order_item_id: originalItemId,
        quantity: -requested,
        unit: originalItem.unit,
        unit_price: unitPrice,
        supply_amount: -money(requested * unitPrice),
        quantity_kg: quantityKg > 0 ? -quantityKg : null,
        currency: text(originalItem.currency) || text(original.currency) || 'KRW',
        sort_order: index,
      }
    })
  } else {
    const creditAmount = money(data.credit_amount)
    if (!(creditAmount > 0)) throw new Error('차감 금액을 입력해 주세요.')
    if (creditAmount > remainingOrderValue + 0.009) throw new Error(`남은 차감 가능 금액은 ${Math.round(remainingOrderValue).toLocaleString('ko-KR')}원입니다.`)
    preparedItems = [{
      product_id: null,
      product_name: '매출 차감',
      specification: `원거래 ${text(original.statement_number)}`,
      sales_variant_id: null,
      sales_variant_name: null,
      original_order_item_id: null,
      quantity: -1,
      unit: '건',
      unit_price: creditAmount,
      supply_amount: -creditAmount,
      quantity_kg: 0,
      currency: text(original.currency) || 'KRW',
      sort_order: 0,
    }]
  }

  const supplyAmount = money(preparedItems.reduce((sum, item) => sum + num(item.supply_amount), 0))
  if (Math.abs(supplyAmount) > remainingOrderValue + 0.009) {
    throw new Error(`반품/차감 금액이 남은 처리 가능 금액 ${Math.round(remainingOrderValue).toLocaleString('ko-KR')}원을 초과합니다.`)
  }

  const statementNumber = await nextStatementNumber(client, saleDate)
  const label = type === 'RETURN' ? '제품 반품' : '매출 차감'
  const insertOrder = await client.from('sales_orders').insert({
    business_id: BUSINESS_ID,
    statement_number: statementNumber,
    sale_date: saleDate,
    client_id: original.client_id,
    assigned_person_id: original.assigned_person_id,
    status: 'confirmed',
    payment_status: 'paid',
    vat_rate: num(original.vat_rate),
    supply_amount: supplyAmount,
    vat_amount: 0,
    total_amount: supplyAmount,
    note: `${label} · 원거래 ${text(original.statement_number)} · 사유: ${reason}`,
    source_type: type,
    source_reference: originalOrderId,
    currency: text(original.currency) || 'KRW',
  }).select('*').single()
  if (insertOrder.error) throw new Error(insertOrder.error.message)

  const insertedItems = await client.from('sales_order_items').insert(preparedItems.map((item) => ({ ...item, order_id: insertOrder.data.id }))).select('*').order('sort_order')
  if (insertedItems.error) {
    await client.from('sales_orders').delete().eq('id', insertOrder.data.id)
    throw new Error(insertedItems.error.message)
  }

  if (type === 'RETURN') {
    const originalItemIds = preparedItems.map((item) => text(item.original_order_item_id)).filter(Boolean)
    const settlementsResult = originalItemIds.length
      ? await client.from('sales_order_item_settlements').select('*').in('order_item_id', originalItemIds)
      : { data: [], error: null }
    if (settlementsResult.error) throw new Error(settlementsResult.error.message)
    const insertedByOriginal = new Map((insertedItems.data ?? []).map((item) => [text(item.original_order_item_id), item]))
    const clawbacks: Record<string, unknown>[] = []
    for (const settlement of settlementsResult.data ?? []) {
      const originalItem = originalItemById.get(text(settlement.order_item_id))
      const returnItem = insertedByOriginal.get(text(settlement.order_item_id))
      if (!originalItem || !returnItem) continue
      const originalKg = Math.abs(num(originalItem.quantity_kg))
      const returnKg = Math.abs(num(returnItem.quantity_kg))
      if (!(originalKg > 0) || !(returnKg > 0)) continue
      const ratio = Math.min(1, returnKg / originalKg)
      clawbacks.push({
        business_id: BUSINESS_ID,
        order_id: insertOrder.data.id,
        order_item_id: returnItem.id,
        client_id: original.client_id,
        product_id: returnItem.product_id,
        person_id: settlement.person_id,
        person_name: settlement.person_name,
        sale_date: saleDate,
        quantity_kg: -returnKg,
        settlement_rate_per_kg: num(settlement.settlement_rate_per_kg),
        settlement_amount: -money(Math.abs(num(settlement.settlement_amount)) * ratio),
      })
    }
    if (clawbacks.length) {
      const clawbackResult = await client.from('sales_order_item_settlements').insert(clawbacks)
      if (clawbackResult.error) throw new Error(clawbackResult.error.message)
    }
  }

  const history = await client.from('sales_order_history').insert({
    order_id: insertOrder.data.id,
    action: type === 'RETURN' ? 'create-return' : 'create-credit',
    snapshot: {
      original_order_id: originalOrderId,
      original_statement_number: original.statement_number,
      adjustment_order: insertOrder.data,
      adjustment_items: insertedItems.data ?? [],
      reason,
    },
  })
  if (history.error) throw new Error(history.error.message)

  return { ...insertOrder.data, items: insertedItems.data ?? [], original_statement_number: original.statement_number }
}

async function cancelAdjustment(client: ReturnType<typeof createMoniServiceRoleClient>, id: string, reason: string) {
  if (!id) throw new Error('반품/차감 전표 ID가 필요합니다.')
  if (!reason) throw new Error('취소 사유를 입력해 주세요.')
  const result = await client.from('sales_orders').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
  if (result.error) throw new Error('반품/차감 전표를 찾을 수 없습니다.')
  if (!ADJUSTMENT_TYPES.has(text(result.data.source_type).toUpperCase())) throw new Error('반품/차감 전표만 취소할 수 있습니다.')
  if (text(result.data.status) === 'cancelled') throw new Error('이미 취소된 전표입니다.')
  const update = await client.from('sales_orders').update({
    status: 'cancelled',
    note: [text(result.data.note), `취소사유: ${reason}`].filter(Boolean).join(' / '),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
  if (update.error) throw new Error(update.error.message)
  await client.from('sales_order_history').insert({ order_id: id, action: 'cancel-adjustment', snapshot: { before: result.data, reason } })
  return update.data
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const month = text(request.nextUrl.searchParams.get('month'))
    return NextResponse.json({ ok: true, ...(await loadLedger(createMoniServiceRoleClient(), month)) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '반품/매출차감 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const action = text(body.action)
    const data = (body.data ?? {}) as Record<string, unknown>
    const client = createMoniServiceRoleClient()
    if (action === 'create_adjustment') return NextResponse.json({ ok: true, adjustment: await createAdjustment(client, data) })
    if (action === 'cancel_adjustment') return NextResponse.json({ ok: true, adjustment: await cancelAdjustment(client, text(body.id), text(data.reason)) })
    return NextResponse.json({ ok: false, error: '지원하지 않는 반품/매출차감 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '반품/매출차감 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
