import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const ALLOWED_CURRENCIES = new Set(['KRW', 'USD', 'THB', 'EUR'])

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const roundKg = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 1000) / 1000

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function loadExport(client: ReturnType<typeof createMoniServiceRoleClient>, id: string) {
  const [documentResult, itemsResult] = await Promise.all([
    client.from('export_documents').select('*').eq('id', id).maybeSingle(),
    client.from('export_document_items').select('*').eq('document_id', id).order('sort_order').order('created_at'),
  ])
  if (documentResult.error) throw new Error(documentResult.error.message)
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (!documentResult.data) throw new Error('수출서류를 찾을 수 없습니다.')

  const destinationResult = await client.from('export_destinations').select('*').eq('id', documentResult.data.consignee_id).maybeSingle()
  if (destinationResult.error) throw new Error(destinationResult.error.message)
  if (!destinationResult.data) throw new Error('수출처 정보를 찾을 수 없습니다.')

  return {
    document: documentResult.data as Record<string, unknown>,
    items: (itemsResult.data ?? []) as Array<Record<string, unknown>>,
    destination: destinationResult.data as Record<string, unknown>,
  }
}

async function ensureSalesClient(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  destination: Record<string, unknown>,
) {
  const destinationId = text(destination.id)
  const marker = `[EXPORT_DESTINATION:${destinationId}]`
  let clientId = text(destination.sales_client_id)

  if (clientId) {
    const linked = await client.from('sales_clients').select('id').eq('id', clientId).eq('business_id', BUSINESS_ID).maybeSingle()
    if (linked.error) throw new Error(linked.error.message)
    if (!linked.data) clientId = ''
  }

  if (!clientId) {
    const existing = await client.from('sales_clients').select('id').eq('business_id', BUSINESS_ID).like('note', `${marker}%`).limit(1).maybeSingle()
    if (existing.error) throw new Error(existing.error.message)
    clientId = text(existing.data?.id)
  }

  const payload = {
    business_id: BUSINESS_ID,
    company_name: text(destination.company_name),
    contact_name: text(destination.contact_name) || null,
    phone: text(destination.phone) || null,
    address: text(destination.address) || null,
    status: 'active',
    payment_terms: '수출거래 · VAT 0%',
    payment_due_type: 'none',
    note: `${marker} ${text(destination.country)}${text(destination.zip_code) ? ` / ZIP ${text(destination.zip_code)}` : ''}`,
    updated_at: new Date().toISOString(),
  }

  if (clientId) {
    const updated = await client.from('sales_clients').update(payload).eq('id', clientId).eq('business_id', BUSINESS_ID).select('id').single()
    if (updated.error) throw new Error(updated.error.message)
  } else {
    const inserted = await client.from('sales_clients').insert(payload).select('id').single()
    if (inserted.error) throw new Error(inserted.error.message)
    clientId = text(inserted.data.id)
  }

  if (text(destination.sales_client_id) !== clientId) {
    const link = await client.from('export_destinations').update({ sales_client_id: clientId, updated_at: new Date().toISOString() }).eq('id', destinationId)
    if (link.error) throw new Error(link.error.message)
  }
  return clientId
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
  const current = latest.startsWith(prefix) ? Number(latest.slice(prefix.length)) : 0
  const sequence = Number.isFinite(current) ? current + 1 : 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

async function loadStatement(client: ReturnType<typeof createMoniServiceRoleClient>, exportDocumentId: string) {
  const loaded = await loadExport(client, exportDocumentId)
  const orderId = text(loaded.document.sales_order_id)
  let order: Record<string, unknown> | null = null
  let orderItems: Array<Record<string, unknown>> = []

  if (orderId) {
    const [orderResult, itemsResult] = await Promise.all([
      client.from('sales_orders').select('*').eq('id', orderId).eq('business_id', BUSINESS_ID).maybeSingle(),
      client.from('sales_order_items').select('*').eq('order_id', orderId).order('sort_order').order('created_at'),
    ])
    if (orderResult.error) throw new Error(orderResult.error.message)
    if (itemsResult.error) throw new Error(itemsResult.error.message)
    order = orderResult.data as Record<string, unknown> | null
    orderItems = (itemsResult.data ?? []) as Array<Record<string, unknown>>
  }

  return { ...loaded, sales_order: order, sales_order_items: orderItems }
}

async function createOrLoadSalesOrder(
  client: ReturnType<typeof createMoniServiceRoleClient>,
  document: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  salesClientId: string,
) {
  const existing = await client.from('sales_orders')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('source_type', 'EXPORT')
    .eq('source_reference', text(document.id))
    .limit(1)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return { order: existing.data as Record<string, unknown>, created: false }

  if (!items.length) throw new Error('수출품목이 없어 판매등록을 만들 수 없습니다.')
  const currencies = [...new Set(items.map((item) => text(item.currency).toUpperCase()).filter(Boolean))]
  if (currencies.length !== 1 || !ALLOWED_CURRENCIES.has(currencies[0])) {
    throw new Error('판매관리 자동등록을 위해 한 수출서류의 모든 품목 통화를 하나로 통일해 주세요.')
  }
  const currency = currencies[0]
  const supplyAmount = money(items.reduce((sum, item) => sum + num(item.cartons) * num(item.unit_price), 0))
  const saleDate = text(document.document_date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw new Error('수출서류 Date를 확인해 주세요.')

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const statementNumber = await nextStatementNumber(client, saleDate)
    const insert = await client.from('sales_orders').insert({
      business_id: BUSINESS_ID,
      statement_number: statementNumber,
      sale_date: saleDate,
      client_id: salesClientId,
      assigned_person_id: null,
      status: 'confirmed',
      payment_status: 'unpaid',
      vat_rate: 0,
      supply_amount: supplyAmount,
      vat_amount: 0,
      total_amount: supplyAmount,
      note: `수출 자동등록 · Invoice ${text(document.invoice_no)} · Packing List ${text(document.packing_list_no)} · VAT 0%`,
      source_type: 'EXPORT',
      source_reference: text(document.id),
      currency,
      updated_at: new Date().toISOString(),
    }).select('*').single()

    if (insert.error?.code === '23505') continue
    if (insert.error) throw new Error(insert.error.message)
    const order = insert.data as Record<string, unknown>

    const itemRows = items.map((item, index) => ({
      order_id: order.id,
      product_id: null,
      source_product_id: text(item.product_id) || null,
      product_name: text(item.product_name_en) || text(item.product_name_ko) || 'EXPORT PRODUCT',
      specification: [
        `${Math.max(1, Math.trunc(num(item.units_per_carton)))} EA/CTN`,
        text(item.hs_code) ? `HS ${text(item.hs_code)}` : '',
      ].filter(Boolean).join(' · '),
      quantity: Math.max(1, Math.trunc(num(item.cartons))),
      unit: 'CTN',
      unit_price: money(item.unit_price),
      supply_amount: money(num(item.cartons) * num(item.unit_price)),
      quantity_kg: roundKg(num(item.cartons) * num(item.net_weight_per_carton_kg)),
      currency: text(item.currency).toUpperCase() || currency,
      sort_order: index,
    }))

    const insertedItems = await client.from('sales_order_items').insert(itemRows)
    if (insertedItems.error) {
      await client.from('sales_orders').delete().eq('id', order.id)
      throw new Error(insertedItems.error.message)
    }
    return { order, created: true }
  }
  throw new Error('거래명세표 번호 생성 충돌이 발생했습니다. 다시 시도해 주세요.')
}

async function postedReceiptTotal(client: ReturnType<typeof createMoniServiceRoleClient>, orderId: string) {
  const result = await client.from('sales_receipts').select('amount').eq('order_id', orderId).eq('status', 'posted')
  if (result.error) throw new Error(result.error.message)
  return money((result.data ?? []).reduce((sum, row) => sum + num(row.amount), 0))
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '수출서류 ID가 필요합니다.' }, { status: 400 })
    return NextResponse.json({ ok: true, ...(await loadStatement(createMoniServiceRoleClient(), id)) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출 판매정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const id = text(body.id)
    const action = text(body.action).toUpperCase()
    if (!id) return NextResponse.json({ ok: false, error: '수출서류 ID가 필요합니다.' }, { status: 400 })

    const client = createMoniServiceRoleClient()
    const loaded = await loadExport(client, id)

    if (action === 'SHIP') {
      if (text(loaded.document.status) === 'CANCELLED') return NextResponse.json({ ok: false, error: '취소된 수출서류는 출고확정할 수 없습니다.' }, { status: 400 })

      const salesClientId = await ensureSalesClient(client, loaded.destination)
      const linkedOrderId = text(loaded.document.sales_order_id)
      if (text(loaded.document.status) === 'SHIPPED' && linkedOrderId) {
        return NextResponse.json({ ok: true, ...(await loadStatement(client, id)), already_shipped: true })
      }

      const created = await createOrLoadSalesOrder(client, loaded.document, loaded.items, salesClientId)
      const update = await client.from('export_documents').update({
        status: 'SHIPPED',
        shipped_at: new Date().toISOString(),
        sales_order_id: created.order.id,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      if (update.error) {
        if (created.created) {
          await client.from('sales_order_items').delete().eq('order_id', created.order.id)
          await client.from('sales_orders').delete().eq('id', created.order.id)
        }
        throw new Error(update.error.message)
      }
      return NextResponse.json({ ok: true, ...(await loadStatement(client, id)) })
    }

    if (action === 'CANCEL') {
      const orderId = text(loaded.document.sales_order_id)
      if (orderId && (await postedReceiptTotal(client, orderId)) > 0) {
        return NextResponse.json({ ok: false, error: '이 수출 판매건에 실제 입금이 등록되어 있습니다. 판매관리에서 입금을 먼저 취소한 뒤 출고취소해 주세요.' }, { status: 400 })
      }

      if (orderId) {
        const currentOrder = await client.from('sales_orders').select('note').eq('id', orderId).eq('business_id', BUSINESS_ID).maybeSingle()
        if (currentOrder.error) throw new Error(currentOrder.error.message)
        if (currentOrder.data) {
          const note = [text(currentOrder.data.note), `수출 출고취소 · ${new Date().toISOString()}`].filter(Boolean).join(' / ')
          const cancelled = await client.from('sales_orders').update({ status: 'cancelled', note, updated_at: new Date().toISOString() }).eq('id', orderId).eq('business_id', BUSINESS_ID)
          if (cancelled.error) throw new Error(cancelled.error.message)
        }
      }

      const update = await client.from('export_documents').update({ status: 'CANCELLED', shipped_at: null, updated_at: new Date().toISOString() }).eq('id', id)
      if (update.error) throw new Error(update.error.message)
      return NextResponse.json({ ok: true, ...(await loadStatement(client, id)) })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 출고 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출 출고 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
