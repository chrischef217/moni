import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const roundKg = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 1000) / 1000

function todayKst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function currentMonth() { return todayKst().slice(0, 7) }
function validDate(value: unknown) {
  const date = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}
function monthRange(value: unknown) {
  const month = text(value) || currentMonth()
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { month, start, end }
}
async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function quantityKg(quantity: number, variant: Record<string, unknown>) {
  const unit = text(variant.sales_unit)
  if (unit === 'kg') return roundKg(quantity)
  const unitWeightG = num(variant.unit_weight_g)
  if (unitWeightG <= 0) throw new Error(`${text(variant.variant_name)} 규격의 개별 중량(g)을 확인해 주세요.`)
  if (unit === 'ea') return roundKg(quantity * unitWeightG / 1000)
  if (unit === 'box') {
    const boxUnits = num(variant.box_units)
    if (boxUnits <= 0) throw new Error(`${text(variant.variant_name)} 규격의 BOX 입수량을 확인해 주세요.`)
    return roundKg(quantity * boxUnits * unitWeightG / 1000)
  }
  throw new Error('지원하지 않는 판매단위입니다.')
}

async function nextStatementNumber(client: ReturnType<typeof createMoniServiceRoleClient>, saleDate: string) {
  const prefix = `DB-${saleDate.replaceAll('-', '')}-`
  const result = await client.from('sales_orders').select('statement_number').eq('business_id', BUSINESS_ID).like('statement_number', `${prefix}%`).order('statement_number', { ascending: false }).limit(1)
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

async function loadData(client: ReturnType<typeof createMoniServiceRoleClient>, monthValue: unknown) {
  const range = monthRange(monthValue)
  const [clientsResult, variantsResult, productsResult, termsResult, agentsResult, ordersResult] = await Promise.all([
    client.from('sales_clients').select('id,company_name,status,payment_due_type,payment_due_days,payment_due_day').eq('business_id', BUSINESS_ID).order('status').order('company_name'),
    client.from('sales_product_variants').select('*').eq('business_id', BUSINESS_ID).eq('active', true).order('product_id').order('sort_order').order('variant_name'),
    client.from('products').select('id,product_name,product_code,product_spec,product_type,is_active').eq('is_active', true).neq('product_type', '반제품').order('product_name'),
    client.from('sales_client_variant_terms').select('*').eq('business_id', BUSINESS_ID).eq('active', true),
    client.from('sales_client_variant_agents').select('*'),
    client.from('sales_orders').select('*').eq('business_id', BUSINESS_ID).gte('sale_date', range.start).lte('sale_date', range.end).order('sale_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const failed = [clientsResult, variantsResult, productsResult, termsResult, agentsResult, ordersResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const orders = ordersResult.data ?? []
  const orderIds = orders.map((row) => row.id)
  const [itemsResult, receiptsResult] = await Promise.all([
    orderIds.length ? client.from('sales_order_items').select('*').in('order_id', orderIds).order('sort_order').order('created_at') : Promise.resolve({ data: [], error: null }),
    orderIds.length ? client.from('sales_receipts').select('order_id,amount,status,receipt_date').in('order_id', orderIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (receiptsResult.error) throw new Error(receiptsResult.error.message)

  const productById = new Map((productsResult.data ?? []).map((row) => [text(row.id), row]))
  const variants = (variantsResult.data ?? []).map((row) => ({
    ...row,
    product_name: text(productById.get(text(row.product_id))?.product_name) || '제품',
    product_code: text(productById.get(text(row.product_id))?.product_code) || null,
    product_spec: text(productById.get(text(row.product_id))?.product_spec) || null,
  }))
  const agentsByTerm = new Map<string, Record<string, unknown>[]>()
  for (const row of agentsResult.data ?? []) {
    const key = text(row.term_id)
    agentsByTerm.set(key, [...(agentsByTerm.get(key) ?? []), row])
  }
  const terms = (termsResult.data ?? []).map((row) => ({ ...row, agent_rates: agentsByTerm.get(text(row.id)) ?? [] }))

  const itemsByOrder = new Map<string, Record<string, unknown>[]>()
  for (const row of itemsResult.data ?? []) {
    const key = text(row.order_id)
    itemsByOrder.set(key, [...(itemsByOrder.get(key) ?? []), row])
  }
  const receivedByOrder = new Map<string, number>()
  for (const row of receiptsResult.data ?? []) {
    if (text(row.status) !== 'posted') continue
    const key = text(row.order_id)
    receivedByOrder.set(key, money((receivedByOrder.get(key) ?? 0) + num(row.amount)))
  }
  const hydratedOrders = orders.map((row) => ({
    ...row,
    items: itemsByOrder.get(text(row.id)) ?? [],
    posted_receipt_amount: receivedByOrder.get(text(row.id)) ?? 0,
    financial_locked: (receivedByOrder.get(text(row.id)) ?? 0) > 0,
  }))
  const confirmed = hydratedOrders.filter((row) => text(row.status) === 'confirmed')
  return {
    range,
    clients: clientsResult.data ?? [],
    variants,
    client_variant_terms: terms,
    orders: hydratedOrders,
    summary: {
      order_count: confirmed.length,
      supply_amount: money(confirmed.reduce((sum, row) => sum + num(row.supply_amount), 0)),
      vat_amount: money(confirmed.reduce((sum, row) => sum + num(row.vat_amount), 0)),
      total_amount: money(confirmed.reduce((sum, row) => sum + num(row.total_amount), 0)),
      locked_order_count: hydratedOrders.filter((row) => row.financial_locked).length,
    },
  }
}

async function prepareItems(client: ReturnType<typeof createMoniServiceRoleClient>, clientId: string, rawItems: unknown) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('판매 품목을 한 개 이상 입력해 주세요.')
  const variantIds = Array.from(new Set(rawItems.map((row) => text((row as Record<string, unknown>)?.sales_variant_id)).filter(Boolean)))
  if (!variantIds.length) throw new Error('판매규격을 선택해 주세요.')
  const [variantsResult, termsResult] = await Promise.all([
    client.from('sales_product_variants').select('*').eq('business_id', BUSINESS_ID).eq('active', true).in('id', variantIds),
    client.from('sales_client_variant_terms').select('*').eq('client_id', clientId).eq('active', true).in('variant_id', variantIds),
  ])
  if (variantsResult.error) throw new Error(variantsResult.error.message)
  if (termsResult.error) throw new Error(termsResult.error.message)
  const variants = variantsResult.data ?? []
  const productIds = Array.from(new Set(variants.map((row) => text(row.product_id)).filter(Boolean)))
  const productsResult = productIds.length
    ? await client.from('products').select('id,product_name,product_code,product_spec,product_type,is_active').in('id', productIds)
    : { data: [], error: null }
  if (productsResult.error) throw new Error(productsResult.error.message)
  const variantById = new Map(variants.map((row) => [text(row.id), row]))
  const productById = new Map((productsResult.data ?? []).map((row) => [text(row.id), row]))
  const termByVariant = new Map((termsResult.data ?? []).map((row) => [text(row.variant_id), row]))

  return rawItems.map((raw, index) => {
    const source = (raw ?? {}) as Record<string, unknown>
    const variantId = text(source.sales_variant_id)
    const variant = variantById.get(variantId)
    if (!variant) throw new Error(`${index + 1}번째 판매규격이 없거나 판매 중지 상태입니다.`)
    const product = productById.get(text(variant.product_id))
    if (!product || text(product.product_type) === '반제품' || product.is_active === false) throw new Error(`${text(product?.product_name) || '제품'}은(는) 판매할 수 없습니다.`)
    const term = termByVariant.get(variantId)
    const quantity = num(source.quantity)
    if (quantity <= 0) throw new Error(`${index + 1}번째 품목의 수량을 확인해 주세요.`)
    const moq = term ? num(term.moq_quantity) : num(variant.moq_quantity)
    if (moq > 0 && quantity < moq) throw new Error(`${text(product.product_name)} · ${text(variant.variant_name)} 최소주문수량은 ${moq} ${text(variant.sales_unit).toUpperCase()}입니다.`)
    const defaultPrice = term ? money(term.unit_price) : money(variant.default_unit_price)
    const unitPrice = source.unit_price === undefined || source.unit_price === null || source.unit_price === '' ? defaultPrice : money(source.unit_price)
    if (unitPrice <= 0) throw new Error(`${text(product.product_name)} · ${text(variant.variant_name)} 판매단가를 설정해 주세요.`)
    const convertedKg = quantityKg(quantity, variant)
    return {
      product_id: text(product.id),
      product_name: text(product.product_name),
      specification: text(variant.variant_name),
      sales_variant_id: variantId,
      sales_variant_name: text(variant.variant_name),
      quantity: roundKg(quantity),
      unit: text(variant.sales_unit),
      unit_price: unitPrice,
      supply_amount: money(quantity * unitPrice),
      quantity_kg: convertedKg,
      sort_order: index,
      variant_term_id: text(term?.id) || null,
    }
  })
}

async function createSettlements(client: ReturnType<typeof createMoniServiceRoleClient>, order: Record<string, unknown>, insertedItems: Array<Record<string, unknown>>, prepared: Array<Record<string, unknown>>) {
  const termIds = Array.from(new Set(prepared.map((row) => text(row.variant_term_id)).filter(Boolean)))
  if (!termIds.length) return
  const agentsResult = await client.from('sales_client_variant_agents').select('*').in('term_id', termIds)
  if (agentsResult.error) throw new Error(agentsResult.error.message)
  const personIds = Array.from(new Set((agentsResult.data ?? []).map((row) => text(row.person_id)).filter(Boolean)))
  const peopleResult = personIds.length ? await client.from('business_people').select('id,name').in('id', personIds) : { data: [], error: null }
  if (peopleResult.error) throw new Error(peopleResult.error.message)
  const personById = new Map((peopleResult.data ?? []).map((row) => [text(row.id), text(row.name)]))
  const agentsByTerm = new Map<string, Record<string, unknown>[]>()
  for (const row of agentsResult.data ?? []) {
    const key = text(row.term_id)
    agentsByTerm.set(key, [...(agentsByTerm.get(key) ?? []), row])
  }
  const rows: Record<string, unknown>[] = []
  prepared.forEach((item, index) => {
    for (const agent of agentsByTerm.get(text(item.variant_term_id)) ?? []) {
      const rate = money(agent.settlement_rate_per_kg)
      const itemKg = roundKg(item.quantity_kg)
      if (rate <= 0 || itemKg <= 0) continue
      rows.push({
        business_id: BUSINESS_ID,
        order_id: order.id,
        order_item_id: insertedItems[index].id,
        client_id: order.client_id,
        product_id: item.product_id,
        person_id: agent.person_id,
        person_name: personById.get(text(agent.person_id)) || '영업 프리랜서',
        sale_date: order.sale_date,
        quantity_kg: itemKg,
        settlement_rate_per_kg: rate,
        settlement_amount: money(itemKg * rate),
      })
    }
  })
  if (rows.length) {
    const result = await client.from('sales_order_item_settlements').insert(rows)
    if (result.error) throw new Error(result.error.message)
  }
}

async function saveOrder(client: ReturnType<typeof createMoniServiceRoleClient>, id: string, data: Record<string, unknown>) {
  const saleDate = text(data.sale_date) || todayKst()
  const clientId = text(data.client_id)
  if (!validDate(saleDate)) throw new Error('판매일자를 확인해 주세요.')
  if (!clientId) throw new Error('거래처를 선택해 주세요.')
  const clientResult = await client.from('sales_clients').select('id,status').eq('id', clientId).eq('business_id', BUSINESS_ID).single()
  if (clientResult.error) throw new Error('거래처를 확인해 주세요.')
  if (text(clientResult.data.status) !== 'active') throw new Error('현재 거래 중지된 거래처입니다.')

  if (id && (await postedReceiptTotal(client, id)) > 0) throw new Error('이미 실제 입금이 등록된 판매건은 금액·품목을 수정할 수 없습니다. 잘못 등록된 입금을 먼저 수금·미수금 화면에서 취소한 뒤 수정해 주세요.')

  const prepared = await prepareItems(client, clientId, data.items)
  const supplyAmount = money(prepared.reduce((sum, row) => sum + num(row.supply_amount), 0))
  const vatRate = Math.max(0, Math.min(100, num(data.vat_rate === undefined ? 10 : data.vat_rate)))
  const vatAmount = money(supplyAmount * vatRate / 100)
  const totalAmount = money(supplyAmount + vatAmount)
  const status = text(data.status) === 'draft' ? 'draft' : 'confirmed'

  const peopleResult = await client.from('sales_client_people').select('person_id,is_primary').eq('client_id', clientId).eq('active', true).order('is_primary', { ascending: false }).limit(1)
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
    if (text(snapshotOrder.data.status) === 'cancelled') throw new Error('취소된 판매건은 수정할 수 없습니다.')
    const history = await client.from('sales_order_history').insert({ order_id: id, action: 'update-v4', snapshot: { order: snapshotOrder.data, items: snapshotItems.data ?? [] } })
    if (history.error) throw new Error(history.error.message)
    const update = await client.from('sales_orders').update({
      sale_date: saleDate,
      client_id: clientId,
      assigned_person_id: primaryPersonId,
      status,
      payment_status: 'unpaid',
      vat_rate: vatRate,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      note: text(data.note) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
    if (update.error) throw new Error(update.error.message)
    order = update.data
    const removedSettlements = await client.from('sales_order_item_settlements').delete().eq('order_id', id)
    if (removedSettlements.error) throw new Error(removedSettlements.error.message)
    const removedItems = await client.from('sales_order_items').delete().eq('order_id', id)
    if (removedItems.error) throw new Error(removedItems.error.message)
  } else {
    const statementNumber = await nextStatementNumber(client, saleDate)
    const insert = await client.from('sales_orders').insert({
      business_id: BUSINESS_ID,
      statement_number: statementNumber,
      sale_date: saleDate,
      client_id: clientId,
      assigned_person_id: primaryPersonId,
      status,
      payment_status: 'unpaid',
      vat_rate: vatRate,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      note: text(data.note) || null,
    }).select('*').single()
    if (insert.error) throw new Error(insert.error.message)
    order = insert.data
  }

  const insertedItems = await client.from('sales_order_items').insert(prepared.map((row) => ({
    order_id: order.id,
    product_id: row.product_id,
    product_name: row.product_name,
    specification: row.specification,
    sales_variant_id: row.sales_variant_id,
    sales_variant_name: row.sales_variant_name,
    quantity: row.quantity,
    unit: row.unit,
    unit_price: row.unit_price,
    supply_amount: row.supply_amount,
    quantity_kg: row.quantity_kg,
    sort_order: row.sort_order,
  }))).select('*').order('sort_order')
  if (insertedItems.error) throw new Error(insertedItems.error.message)
  await createSettlements(client, order, insertedItems.data ?? [], prepared)
  return { ...order, items: insertedItems.data ?? [] }
}

async function cancelOrder(client: ReturnType<typeof createMoniServiceRoleClient>, id: string, reason: string) {
  if (!id) throw new Error('판매건 ID가 필요합니다.')
  if ((await postedReceiptTotal(client, id)) > 0) throw new Error('실제 입금이 등록된 판매건은 바로 취소할 수 없습니다. 수금·미수금 화면에서 입금을 먼저 취소한 뒤 판매건을 취소해 주세요.')
  const [orderResult, itemsResult] = await Promise.all([
    client.from('sales_orders').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single(),
    client.from('sales_order_items').select('*').eq('order_id', id).order('sort_order'),
  ])
  if (orderResult.error) throw new Error(orderResult.error.message)
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (text(orderResult.data.status) === 'cancelled') throw new Error('이미 취소된 판매건입니다.')
  const history = await client.from('sales_order_history').insert({ order_id: id, action: 'cancel-v4', snapshot: { order: orderResult.data, items: itemsResult.data ?? [], reason: reason || null } })
  if (history.error) throw new Error(history.error.message)
  const update = await client.from('sales_orders').update({ status: 'cancelled', note: [text(orderResult.data.note), reason ? `취소사유: ${reason}` : ''].filter(Boolean).join(' / ') || null, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (update.error) throw new Error(update.error.message)
  return update.data
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    return NextResponse.json({ ok: true, ...(await loadData(createMoniServiceRoleClient(), request.nextUrl.searchParams.get('month'))) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매 데이터를 불러오지 못했습니다.' }, { status: 500 })
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
    if (action === 'save_order') return NextResponse.json({ ok: true, order: await saveOrder(client, id, data) })
    if (action === 'cancel_order') return NextResponse.json({ ok: true, order: await cancelOrder(client, id, text(data.reason)) })
    return NextResponse.json({ ok: false, error: '지원하지 않는 판매 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
