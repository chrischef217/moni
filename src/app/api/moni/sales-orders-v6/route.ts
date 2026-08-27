import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '../sales-orders-v4/route'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

function isAccessoryCharge(item: Record<string, unknown>) {
  return !text(item.product_id) && !text(item.sales_variant_id) && text(item.specification) === '기타비용'
}

function prepareAccessoryCharges(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw.map((value, index) => {
    const row = (value ?? {}) as Record<string, unknown>
    const productName = text(row.product_name)
    const quantity = num(row.quantity)
    const unit = text(row.unit) || '건'
    const unitPrice = money(row.unit_price)
    if (!productName) throw new Error(`${index + 1}번째 기타비용 항목명을 입력해 주세요.`)
    if (quantity <= 0) throw new Error(`${productName} 수량은 0보다 커야 합니다.`)
    if (unitPrice < 0) throw new Error(`${productName} 단가는 0 이상이어야 합니다.`)
    return {
      product_id: null,
      product_name: productName,
      specification: '기타비용',
      sales_variant_id: null,
      sales_variant_name: null,
      quantity,
      unit,
      unit_price: unitPrice,
      supply_amount: money(quantity * unitPrice),
      quantity_kg: null,
      currency: 'KRW',
      source_product_id: null,
    }
  })
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  const payload = await response.json() as any
  if (!response.ok || !payload?.ok || !Array.isArray(payload.orders)) {
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  }

  const accessoryChargesByOrder: Record<string, any[]> = {}
  payload.orders = payload.orders
    .filter((order: any) => !['RETURN', 'CREDIT'].includes(text(order?.source_type).toUpperCase()))
    .map((order: any) => {
      const items = Array.isArray(order.items) ? order.items : []
      const charges = items.filter((item: any) => isAccessoryCharge(item))
      if (charges.length) accessoryChargesByOrder[text(order.id)] = charges
      return {
        ...order,
        items: items.filter((item: any) => !isAccessoryCharge(item)),
        accessory_charges: charges,
      }
    })

  return NextResponse.json(
    { ...payload, accessory_charges_by_order: accessoryChargesByOrder },
    { status: response.status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, any> | null
  if (!body) return NextResponse.json({ ok: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })

  if (text(body.action) !== 'save_order') {
    const forwarded = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    })
    return legacyPOST(forwarded)
  }

  try {
    const data = (body.data ?? {}) as Record<string, unknown>
    const charges = prepareAccessoryCharges(data.extra_items)
    const forwardedBody = {
      ...body,
      data: { ...data, extra_items: undefined },
    }
    const forwarded = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(forwardedBody),
    })
    const legacyResponse = await legacyPOST(forwarded)
    const legacyPayload = await legacyResponse.json() as any
    if (!legacyResponse.ok || !legacyPayload?.ok || !legacyPayload?.order?.id) {
      return NextResponse.json(legacyPayload, { status: legacyResponse.status })
    }

    if (!charges.length) return NextResponse.json(legacyPayload)

    const client = createMoniServiceRoleClient()
    const orderId = text(legacyPayload.order.id)
    const productItems = Array.isArray(legacyPayload.order.items) ? legacyPayload.order.items : []
    const chargeRows = charges.map((row, index) => ({
      ...row,
      order_id: orderId,
      sort_order: productItems.length + index,
    }))
    const inserted = await client.from('sales_order_items').insert(chargeRows).select('*').order('sort_order')
    if (inserted.error) throw new Error(inserted.error.message)

    const baseSupply = money(legacyPayload.order.supply_amount)
    const chargeSupply = money(charges.reduce((sum, row) => sum + num(row.supply_amount), 0))
    const supplyAmount = money(baseSupply + chargeSupply)
    const vatRate = num(legacyPayload.order.vat_rate)
    const vatAmount = money(supplyAmount * vatRate / 100)
    const totalAmount = money(supplyAmount + vatAmount)
    const updated = await client
      .from('sales_orders')
      .update({ supply_amount: supplyAmount, vat_amount: vatAmount, total_amount: totalAmount, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('*')
      .single()
    if (updated.error) throw new Error(updated.error.message)

    return NextResponse.json({
      ok: true,
      order: {
        ...updated.data,
        items: [...productItems, ...(inserted.data ?? [])],
        accessory_charges: inserted.data ?? [],
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '기타비용 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
