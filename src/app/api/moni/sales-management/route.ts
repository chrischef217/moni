import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'

type OrderItemInput = {
  product_id?: string | null
  product_name?: string | null
  specification?: string | null
  quantity?: number | string | null
  unit?: string | null
  unit_price?: number | string | null
}

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function currentMonth() {
  return todayKst().slice(0, 7)
}

function monthRange(monthValue: unknown) {
  const month = text(monthValue) || currentMonth()
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

function cleanClient(raw: Record<string, unknown> | null | undefined) {
  const source = raw ?? {}
  const status = text(source.status) === 'inactive' ? 'inactive' : 'active'
  return {
    company_name: text(source.company_name),
    business_registration_number: text(source.business_registration_number) || null,
    representative_name: text(source.representative_name) || null,
    address: text(source.address) || null,
    contact_name: text(source.contact_name) || null,
    phone: text(source.phone) || null,
    email: text(source.email) || null,
    payment_terms: text(source.payment_terms) || null,
    assigned_person_id: text(source.assigned_person_id) || null,
    status,
    note: text(source.note) || null,
  }
}

function normalizeItems(rawItems: unknown) {
  if (!Array.isArray(rawItems)) throw new Error('판매 품목을 한 개 이상 입력해 주세요.')
  const items = rawItems.map((raw, index) => {
    const source = (raw ?? {}) as OrderItemInput
    const productName = text(source.product_name)
    const quantity = num(source.quantity)
    const unitPrice = money(source.unit_price)
    if (!productName) throw new Error(`${index + 1}번째 품목의 제품을 선택해 주세요.`)
    if (quantity <= 0) throw new Error(`${index + 1}번째 품목의 수량을 확인해 주세요.`)
    if (unitPrice < 0) throw new Error(`${index + 1}번째 품목의 단가를 확인해 주세요.`)
    return {
      product_id: text(source.product_id) || null,
      product_name: productName,
      specification: text(source.specification) || null,
      quantity,
      unit: text(source.unit) || 'kg',
      unit_price: unitPrice,
      supply_amount: money(quantity * unitPrice),
      sort_order: index,
    }
  })
  if (!items.length) throw new Error('판매 품목을 한 개 이상 입력해 주세요.')
  return items
}

function calculateTotals(items: ReturnType<typeof normalizeItems>, vatRateValue: unknown) {
  const vatRate = Math.max(0, Math.min(100, num(vatRateValue)))
  const supplyAmount = money(items.reduce((sum, item) => sum + item.supply_amount, 0))
  const vatAmount = money(supplyAmount * (vatRate / 100))
  return { vatRate, supplyAmount, vatAmount, totalAmount: money(supplyAmount + vatAmount) }
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

async function loadData(client: ReturnType<typeof createMoniServiceRoleClient>, monthValue: unknown) {
  const range = monthRange(monthValue)
  const [clientsResult, peopleResult, productsResult, ordersResult] = await Promise.all([
    client.from('sales_clients').select('*').eq('business_id', BUSINESS_ID).order('status').order('company_name'),
    client.from('business_people').select('id,name,person_type,status,commission_rate').eq('business_id', BUSINESS_ID).order('status').order('name'),
    client.from('products').select('id,product_name,product_code,product_spec,weight_g,is_active,business_id').eq('is_active', true).order('product_name'),
    client.from('sales_orders').select('*').eq('business_id', BUSINESS_ID).gte('sale_date', range.start).lte('sale_date', range.end).order('sale_date', { ascending: false }).order('created_at', { ascending: false }),
  ])

  const failed = [clientsResult, peopleResult, productsResult, ordersResult].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)

  const orders = ordersResult.data ?? []
  const orderIds = orders.map((row) => row.id)
  const itemsResult = orderIds.length
    ? await client.from('sales_order_items').select('*').in('order_id', orderIds).order('sort_order').order('created_at')
    : { data: [], error: null }
  if (itemsResult.error) throw new Error(itemsResult.error.message)

  const itemsByOrder = new Map<string, Record<string, unknown>[]>()
  for (const row of itemsResult.data ?? []) {
    const key = text(row.order_id)
    itemsByOrder.set(key, [...(itemsByOrder.get(key) ?? []), row])
  }
  const hydratedOrders = orders.map((row) => ({ ...row, items: itemsByOrder.get(text(row.id)) ?? [] }))
  const confirmedOrders = hydratedOrders.filter((row) => row.status === 'confirmed')

  const clientById = new Map((clientsResult.data ?? []).map((row) => [text(row.id), row]))
  const personById = new Map((peopleResult.data ?? []).map((row) => [text(row.id), row]))
  const summary = confirmedOrders.reduce((acc, row) => {
    acc.order_count += 1
    acc.supply_amount += num(row.supply_amount)
    acc.vat_amount += num(row.vat_amount)
    acc.total_amount += num(row.total_amount)
    if (row.payment_status !== 'paid') acc.unpaid_amount += num(row.total_amount)
    return acc
  }, { order_count: 0, supply_amount: 0, vat_amount: 0, total_amount: 0, unpaid_amount: 0 })

  const byClient = new Map<string, { client_id: string; client_name: string; order_count: number; total_amount: number }>()
  const byPerson = new Map<string, { person_id: string; person_name: string; order_count: number; total_amount: number }>()
  const byProduct = new Map<string, { product_id: string; product_name: string; quantity: number; total_amount: number }>()

  for (const order of confirmedOrders) {
    const clientId = text(order.client_id)
    const clientRow = clientById.get(clientId)
    const clientStats = byClient.get(clientId) ?? { client_id: clientId, client_name: text(clientRow?.company_name) || '미지정 거래처', order_count: 0, total_amount: 0 }
    clientStats.order_count += 1
    clientStats.total_amount += num(order.total_amount)
    byClient.set(clientId, clientStats)

    const personId = text(order.assigned_person_id) || 'unassigned'
    const personRow = personById.get(personId)
    const personStats = byPerson.get(personId) ?? { person_id: personId === 'unassigned' ? '' : personId, person_name: text(personRow?.name) || '미지정', order_count: 0, total_amount: 0 }
    personStats.order_count += 1
    personStats.total_amount += num(order.total_amount)
    byPerson.set(personId, personStats)

    for (const item of order.items as Array<Record<string, unknown>>) {
      const productId = text(item.product_id) || `name:${text(item.product_name)}`
      const productStats = byProduct.get(productId) ?? { product_id: text(item.product_id), product_name: text(item.product_name), quantity: 0, total_amount: 0 }
      productStats.quantity += num(item.quantity)
      productStats.total_amount += num(item.supply_amount)
      byProduct.set(productId, productStats)
    }
  }

  return {
    range,
    clients: clientsResult.data ?? [],
    people: peopleResult.data ?? [],
    products: productsResult.data ?? [],
    orders: hydratedOrders,
    statistics: {
      summary: {
        order_count: summary.order_count,
        supply_amount: money(summary.supply_amount),
        vat_amount: money(summary.vat_amount),
        total_amount: money(summary.total_amount),
        unpaid_amount: money(summary.unpaid_amount),
      },
      by_client: Array.from(byClient.values()).sort((a, b) => b.total_amount - a.total_amount),
      by_person: Array.from(byPerson.values()).sort((a, b) => b.total_amount - a.total_amount),
      by_product: Array.from(byProduct.values()).sort((a, b) => b.total_amount - a.total_amount),
    },
  }
}

async function snapshotOrder(client: ReturnType<typeof createMoniServiceRoleClient>, orderId: string, action: string) {
  const [orderResult, itemsResult] = await Promise.all([
    client.from('sales_orders').select('*').eq('id', orderId).eq('business_id', BUSINESS_ID).single(),
    client.from('sales_order_items').select('*').eq('order_id', orderId).order('sort_order'),
  ])
  if (orderResult.error) throw new Error(orderResult.error.message)
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  const historyResult = await client.from('sales_order_history').insert({
    order_id: orderId,
    action,
    snapshot: { order: orderResult.data, items: itemsResult.data ?? [] },
  })
  if (historyResult.error) throw new Error(historyResult.error.message)
  return { order: orderResult.data, items: itemsResult.data ?? [] }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const data = await loadData(createMoniServiceRoleClient(), request.nextUrl.searchParams.get('month'))
    return NextResponse.json({ ok: true, ...data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매관리 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    const entity = text(body.entity)
    const client = createMoniServiceRoleClient()

    if (entity === 'client') {
      const payload = cleanClient(body.data as Record<string, unknown>)
      if (!payload.company_name) return NextResponse.json({ ok: false, error: '거래처명을 입력해 주세요.' }, { status: 400 })
      const result = await client.from('sales_clients').insert({ ...payload, business_id: BUSINESS_ID, updated_at: new Date().toISOString() }).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, row: result.data })
    }

    if (entity !== 'order') return NextResponse.json({ ok: false, error: '저장 항목이 올바르지 않습니다.' }, { status: 400 })
    const data = (body.data ?? {}) as Record<string, unknown>
    const saleDate = text(data.sale_date) || todayKst()
    const clientId = text(data.client_id)
    if (!validDate(saleDate)) return NextResponse.json({ ok: false, error: '판매일자를 확인해 주세요.' }, { status: 400 })
    if (!clientId) return NextResponse.json({ ok: false, error: '거래처를 선택해 주세요.' }, { status: 400 })
    const items = normalizeItems(data.items)
    const totals = calculateTotals(items, data.vat_rate)
    const statementNumber = await nextStatementNumber(client, saleDate)
    const paymentStatus = ['unpaid', 'partial', 'paid'].includes(text(data.payment_status)) ? text(data.payment_status) : 'unpaid'
    const status = text(data.status) === 'draft' ? 'draft' : 'confirmed'
    const orderResult = await client.from('sales_orders').insert({
      business_id: BUSINESS_ID,
      statement_number: statementNumber,
      sale_date: saleDate,
      client_id: clientId,
      assigned_person_id: text(data.assigned_person_id) || null,
      status,
      payment_status: paymentStatus,
      vat_rate: totals.vatRate,
      supply_amount: totals.supplyAmount,
      vat_amount: totals.vatAmount,
      total_amount: totals.totalAmount,
      note: text(data.note) || null,
      updated_at: new Date().toISOString(),
    }).select('*').single()
    if (orderResult.error) throw new Error(orderResult.error.message)

    const itemResult = await client.from('sales_order_items').insert(items.map((item) => ({ ...item, order_id: orderResult.data.id }))).select('*')
    if (itemResult.error) {
      await client.from('sales_orders').delete().eq('id', orderResult.data.id)
      throw new Error(itemResult.error.message)
    }
    return NextResponse.json({ ok: true, order: { ...orderResult.data, items: itemResult.data ?? [] } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매정보 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '수정할 데이터가 없습니다.' }, { status: 400 })
    const entity = text(body.entity)
    const id = text(body.id)
    const data = (body.data ?? {}) as Record<string, unknown>
    if (!id) return NextResponse.json({ ok: false, error: '수정 대상 ID가 필요합니다.' }, { status: 400 })
    const client = createMoniServiceRoleClient()

    if (entity === 'client') {
      const payload = cleanClient(data)
      if (!payload.company_name) return NextResponse.json({ ok: false, error: '거래처명을 입력해 주세요.' }, { status: 400 })
      const result = await client.from('sales_clients').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, row: result.data })
    }

    if (entity !== 'order') return NextResponse.json({ ok: false, error: '수정 항목이 올바르지 않습니다.' }, { status: 400 })
    const action = text(body.action)
    const snapshot = await snapshotOrder(client, id, action === 'cancel' ? 'cancel' : 'update')

    if (action === 'cancel') {
      const result = await client.from('sales_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, order: result.data })
    }

    const saleDate = text(data.sale_date)
    const clientId = text(data.client_id)
    if (!validDate(saleDate)) return NextResponse.json({ ok: false, error: '판매일자를 확인해 주세요.' }, { status: 400 })
    if (!clientId) return NextResponse.json({ ok: false, error: '거래처를 선택해 주세요.' }, { status: 400 })
    const items = normalizeItems(data.items)
    const totals = calculateTotals(items, data.vat_rate)
    const newItemsResult = await client.from('sales_order_items').insert(items.map((item) => ({ ...item, order_id: id }))).select('*')
    if (newItemsResult.error) throw new Error(newItemsResult.error.message)

    const paymentStatus = ['unpaid', 'partial', 'paid'].includes(text(data.payment_status)) ? text(data.payment_status) : 'unpaid'
    const status = text(data.status) === 'draft' ? 'draft' : 'confirmed'
    const orderResult = await client.from('sales_orders').update({
      sale_date: saleDate,
      client_id: clientId,
      assigned_person_id: text(data.assigned_person_id) || null,
      status,
      payment_status: paymentStatus,
      vat_rate: totals.vatRate,
      supply_amount: totals.supplyAmount,
      vat_amount: totals.vatAmount,
      total_amount: totals.totalAmount,
      note: text(data.note) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()

    if (orderResult.error) {
      const newIds = (newItemsResult.data ?? []).map((row) => row.id)
      if (newIds.length) await client.from('sales_order_items').delete().in('id', newIds)
      throw new Error(orderResult.error.message)
    }

    const oldIds = snapshot.items.map((row) => row.id)
    if (oldIds.length) {
      const deleteResult = await client.from('sales_order_items').delete().in('id', oldIds)
      if (deleteResult.error) throw new Error(deleteResult.error.message)
    }
    return NextResponse.json({ ok: true, order: { ...orderResult.data, items: newItemsResult.data ?? [] } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '판매정보 수정 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
