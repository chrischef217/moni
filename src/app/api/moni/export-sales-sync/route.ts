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

async function postedReceiptTotal(client: ReturnType<typeof createMoniServiceRoleClient>, orderId: string) {
  const result = await client.from('sales_receipts').select('amount').eq('order_id', orderId).eq('status', 'posted')
  if (result.error) throw new Error(result.error.message)
  return money((result.data ?? []).reduce((sum, row) => sum + num(row.amount), 0))
}

function salesItemRows(orderId: string, items: Array<Record<string, unknown>>, currency: string) {
  return items.map((item, index) => ({
    order_id: orderId,
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
}

async function syncSalesOrder(client: ReturnType<typeof createMoniServiceRoleClient>, exportDocumentId: string) {
  const loaded = await loadExport(client, exportDocumentId)
  const { document, items, destination } = loaded
  if (!items.length) throw new Error('수출품목이 없어 거래명세표를 만들 수 없습니다.')

  const currencies = [...new Set(items.map((item) => text(item.currency).toUpperCase()).filter(Boolean))]
  if (currencies.length !== 1 || !ALLOWED_CURRENCIES.has(currencies[0])) {
    throw new Error('판매관리 자동등록을 위해 한 수출서류의 모든 품목 통화를 하나로 통일해 주세요.')
  }

  const currency = currencies[0]
  const saleDate = text(document.document_date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) throw new Error('수출서류 Date를 확인해 주세요.')
  const salesClientId = await ensureSalesClient(client, destination)
  const supplyAmount = money(items.reduce((sum, item) => sum + num(item.cartons) * num(item.unit_price), 0))

  let orderResult = await client.from('sales_orders')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('source_type', 'EXPORT')
    .eq('source_reference', exportDocumentId)
    .limit(1)
    .maybeSingle()
  if (orderResult.error) throw new Error(orderResult.error.message)

  if (!orderResult.data && text(document.sales_order_id)) {
    orderResult = await client.from('sales_orders')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .eq('id', text(document.sales_order_id))
      .maybeSingle()
    if (orderResult.error) throw new Error(orderResult.error.message)
  }

  const existing = orderResult.data as Record<string, unknown> | null
  if (existing && (await postedReceiptTotal(client, text(existing.id))) > 0) {
    throw new Error('이 수출 판매건에 실제 입금이 등록되어 있어 수출서류의 금액·품목을 동기화할 수 없습니다. 입금을 먼저 취소해 주세요.')
  }

  let statementNumber = text(existing?.statement_number)
  const expectedPrefix = `DB-${saleDate.replaceAll('-', '')}-`
  if (!statementNumber.startsWith(expectedPrefix)) statementNumber = await nextStatementNumber(client, saleDate)

  const orderPayload = {
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
    note: `수출 자동동기화 · Invoice ${text(document.invoice_no)} · Packing List ${text(document.packing_list_no)} · VAT 0%`,
    source_type: 'EXPORT',
    source_reference: exportDocumentId,
    currency,
    updated_at: new Date().toISOString(),
  }

  let orderId = text(existing?.id)
  if (orderId) {
    const updated = await client.from('sales_orders').update(orderPayload).eq('id', orderId).eq('business_id', BUSINESS_ID).select('id').single()
    if (updated.error) throw new Error(updated.error.message)
    const removedSettlements = await client.from('sales_order_item_settlements').delete().eq('order_id', orderId)
    if (removedSettlements.error) throw new Error(removedSettlements.error.message)
    const removedItems = await client.from('sales_order_items').delete().eq('order_id', orderId)
    if (removedItems.error) throw new Error(removedItems.error.message)
  } else {
    const inserted = await client.from('sales_orders').insert(orderPayload).select('id').single()
    if (inserted.error) throw new Error(inserted.error.message)
    orderId = text(inserted.data.id)
  }

  const insertedItems = await client.from('sales_order_items').insert(salesItemRows(orderId, items, currency))
  if (insertedItems.error) throw new Error(insertedItems.error.message)

  if (text(document.sales_order_id) !== orderId) {
    const linked = await client.from('export_documents').update({ sales_order_id: orderId, updated_at: new Date().toISOString() }).eq('id', exportDocumentId)
    if (linked.error) throw new Error(linked.error.message)
  }

  return { sales_order_id: orderId, statement_number: statementNumber }
}

async function deleteSalesOrder(client: ReturnType<typeof createMoniServiceRoleClient>, exportDocumentId: string) {
  const orderResult = await client.from('sales_orders')
    .select('id')
    .eq('business_id', BUSINESS_ID)
    .eq('source_type', 'EXPORT')
    .eq('source_reference', exportDocumentId)
    .limit(1)
    .maybeSingle()
  if (orderResult.error) throw new Error(orderResult.error.message)
  const orderId = text(orderResult.data?.id)
  if (!orderId) return { deleted: false }

  if ((await postedReceiptTotal(client, orderId)) > 0) {
    throw new Error('이 수출 판매건에 실제 입금이 등록되어 있어 수출서류를 삭제할 수 없습니다. 입금을 먼저 취소해 주세요.')
  }

  const receipts = await client.from('sales_receipts').delete().eq('order_id', orderId)
  if (receipts.error) throw new Error(receipts.error.message)
  const settlements = await client.from('sales_order_item_settlements').delete().eq('order_id', orderId)
  if (settlements.error) throw new Error(settlements.error.message)
  const items = await client.from('sales_order_items').delete().eq('order_id', orderId)
  if (items.error) throw new Error(items.error.message)
  const history = await client.from('sales_order_history').delete().eq('order_id', orderId)
  if (history.error) throw new Error(history.error.message)
  const order = await client.from('sales_orders').delete().eq('id', orderId).eq('business_id', BUSINESS_ID)
  if (order.error) throw new Error(order.error.message)

  return { deleted: true, sales_order_id: orderId }
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
    if (action === 'SYNC') return NextResponse.json({ ok: true, ...(await syncSalesOrder(client, id)) })
    if (action === 'DELETE') return NextResponse.json({ ok: true, ...(await deleteSalesOrder(client, id)) })
    return NextResponse.json({ ok: false, error: '지원하지 않는 수출-판매 동기화 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출 판매 동기화 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
