import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET } from '../finished-goods-inventory/route'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  if (!response.ok) return response
  const payload = await response.json() as any
  if (!payload?.ok || !Array.isArray(payload.inventory)) return NextResponse.json(payload, { status: response.status })

  const client = createMoniServiceRoleClient()
  const ordersResult = await client.from('sales_orders')
    .select('id,statement_number,sale_date,client_id,status,source_type')
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'confirmed')
    .eq('source_type', 'RETURN')
    .order('sale_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (ordersResult.error) throw new Error(ordersResult.error.message)

  const orders = ordersResult.data ?? []
  const orderIds = orders.map((row) => text(row.id)).filter(Boolean)
  const [itemsResult, clientsResult] = await Promise.all([
    orderIds.length
      ? client.from('sales_order_items').select('id,order_id,product_id,product_name,quantity,quantity_kg,unit,created_at').in('order_id', orderIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    client.from('sales_clients').select('id,company_name').eq('business_id', BUSINESS_ID).limit(1000),
  ])
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (clientsResult.error) throw new Error(clientsResult.error.message)

  const orderById = new Map(orders.map((row) => [text(row.id), row]))
  const clientById = new Map((clientsResult.data ?? []).map((row) => [text(row.id), text(row.company_name)]))
  const inventoryById = new Map((payload.inventory as any[]).map((row) => [text(row.product_id), row]))
  let returnedTotalG = 0
  const returnMovements: any[] = []

  for (const item of itemsResult.data ?? []) {
    const order = orderById.get(text(item.order_id))
    const inventory = inventoryById.get(text(item.product_id))
    if (!order || !inventory) continue
    const grams = Math.abs(num(item.quantity_kg)) * 1000
    if (!(grams > 0)) continue

    returnedTotalG += grams
    inventory.inbound_g = num(inventory.inbound_g) + grams
    inventory.stock_g = num(inventory.stock_g) + grams
    inventory.negative_stock = num(inventory.stock_g) < 0
    if (!inventory.last_inbound_date || text(order.sale_date) > text(inventory.last_inbound_date)) inventory.last_inbound_date = text(order.sale_date)
    inventory.return_count = num(inventory.return_count) + 1

    returnMovements.push({
      id: `return:${text(item.id)}`,
      product_id: text(item.product_id),
      product_name: text(item.product_name),
      date: text(order.sale_date),
      type: 'INBOUND',
      quantity_g: grams,
      reference: `반품 ${text(order.statement_number)}`,
      counterparty: clientById.get(text(order.client_id)) || '거래처',
      lot_number: '',
      source_id: text(order.id),
      balance_after_g: num(inventory.stock_g),
      movement_source: 'RETURN',
    })
  }

  payload.inventory = [...inventoryById.values()].sort((a: any, b: any) => {
    if (Boolean(a.negative_stock) !== Boolean(b.negative_stock)) return a.negative_stock ? -1 : 1
    if ((num(a.stock_g) > 0) !== (num(b.stock_g) > 0)) return num(a.stock_g) > 0 ? -1 : 1
    return text(a.product_name).localeCompare(text(b.product_name), 'ko-KR')
  })
  payload.movements = [...returnMovements.reverse(), ...(Array.isArray(payload.movements) ? payload.movements : [])]
  payload.summary = {
    ...payload.summary,
    total_inbound_g: num(payload.summary?.total_inbound_g) + returnedTotalG,
    total_stock_g: num(payload.summary?.total_stock_g) + returnedTotalG,
    stocked_product_count: payload.inventory.filter((row: any) => num(row.stock_g) > 0).length,
    negative_product_count: payload.inventory.filter((row: any) => num(row.stock_g) < 0).length,
    returned_inbound_g: returnedTotalG,
  }
  payload.policy = {
    ...payload.policy,
    returns: '제품 반품 전표(RETURN)는 반품 수량만큼 완제품 재고를 자동 복구하고, 금액 차감(CREDIT)은 재고에 영향을 주지 않음',
  }

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}
