import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent, type MobileBusinessDomain, type MobileBusinessOperation } from '@/lib/moni/mobile-business-intents'
import { GET as legacyGET, POST as legacyPOST } from '@/app/api/moni/mobile-business-actions/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(money(value))}원`

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function validDate(value: unknown) {
  const date = text(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function normalizeCompany(value: unknown) {
  return text(value).normalize('NFKC').toLowerCase().replace(/주식회사|\(주\)|[^0-9a-z가-힣]/g, '')
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function suggestedDueDate(saleDate: string, client: Record<string, any>) {
  if (!validDate(saleDate)) return ''
  const type = text(client.payment_due_type, 40)
  if (type === 'days_after_sale') return addDays(saleDate, Math.max(0, Math.min(365, Math.round(num(client.payment_due_days)))))
  if (type === 'next_month_day') {
    const source = new Date(`${saleDate}T00:00:00Z`)
    const year = source.getUTCFullYear()
    const month = source.getUTCMonth() + 1
    const targetYear = year + Math.floor(month / 12)
    const targetMonth = month % 12
    const requestedDay = Math.max(1, Math.min(31, Math.round(num(client.payment_due_day) || 1)))
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(requestedDay, lastDay))).toISOString().slice(0, 10)
  }
  return ''
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestExchange(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(20)
  if (messages.error) throw new Error(messages.error.message)
  const chronological = [...(messages.data ?? [])].reverse()
  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    if (chronological[index]?.role === 'user') return { user: chronological[index] }
  }
  return { user: null }
}

async function internalJson(request: NextRequest, path: string, init: RequestInit) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(new URL(path, request.url), { ...init, headers, cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) throw new Error(payload.error || `업무 실행 실패 (${response.status})`)
  return payload
}

async function salesOptions() {
  const db = createMoniServiceRoleClient()
  const [products, clients, variants, terms, suppliers, orders] = await Promise.all([
    db.from('products').select('id,product_name,product_code,product_type,is_active').eq('business_id', BUSINESS_ID).eq('is_active', true).neq('product_type', '반제품').order('product_name'),
    db.from('sales_clients').select('id,company_name,status,tax_type,payment_terms,payment_due_type,payment_due_days,payment_due_day,address,phone').eq('business_id', BUSINESS_ID).eq('status', 'active').order('company_name'),
    db.from('sales_product_variants').select('id,product_id,variant_name,sales_unit,unit_weight_g,box_units,default_unit_price,moq_quantity,active').eq('business_id', BUSINESS_ID).eq('active', true).order('product_id').order('variant_name'),
    db.from('sales_client_variant_terms').select('id,client_id,variant_id,unit_price,moq_quantity,active').eq('business_id', BUSINESS_ID).eq('active', true),
    db.from('purchase_suppliers').select('id,company_name,status').eq('business_id', BUSINESS_ID).eq('status', 'ACTIVE'),
    db.from('sales_orders').select('id,client_id').eq('business_id', BUSINESS_ID),
  ])
  const failed = [products, clients, variants, terms, suppliers, orders].find((row) => row.error)?.error
  if (failed) throw new Error(failed.message)

  const productById = new Map((products.data ?? []).map((row: any) => [text(row.id), row]))
  const salesCount = new Map<string, number>()
  for (const row of orders.data ?? []) salesCount.set(text(row.client_id), (salesCount.get(text(row.client_id)) || 0) + 1)
  const termCount = new Map<string, number>()
  for (const row of terms.data ?? []) termCount.set(text(row.client_id), (termCount.get(text(row.client_id)) || 0) + 1)
  const supplierNames = new Set((suppliers.data ?? []).map((row: any) => normalizeCompany(row.company_name)).filter(Boolean))

  const hydratedClients = (clients.data ?? []).map((row: any) => ({
    ...row,
    sales_order_count: salesCount.get(text(row.id)) || 0,
    sales_term_count: termCount.get(text(row.id)) || 0,
    also_supplier: supplierNames.has(normalizeCompany(row.company_name)),
  })).sort((a: any, b: any) => {
    const aEstablished = Number(a.sales_order_count > 0) * 2 + Number(a.sales_term_count > 0)
    const bEstablished = Number(b.sales_order_count > 0) * 2 + Number(b.sales_term_count > 0)
    return bEstablished - aEstablished || text(a.company_name).localeCompare(text(b.company_name), 'ko')
  })

  const hydratedVariants = (variants.data ?? []).map((row: any) => ({
    ...row,
    product_name: text(productById.get(text(row.product_id))?.product_name) || '제품',
    product_code: text(productById.get(text(row.product_id))?.product_code),
  }))

  return {
    products: products.data ?? [],
    clients: hydratedClients,
    variants: hydratedVariants,
    terms: terms.data ?? [],
  }
}

async function salesDraft(domain: 'sales_order' | 'sales_statement', sourceUserId: string) {
  const options = await salesOptions()
  return {
    stage: 'draft',
    domain,
    operation: 'CREATE',
    source_user_message_id: sourceUserId,
    fields: { sale_date: today(), client_id: '', status: 'confirmed', vat_rate: '10', due_date: '', note: '', items: [{ sales_variant_id: '', quantity: '', unit_price: '' }] },
    candidates: [],
    options,
  }
}

async function latestStatementCard(threadId: string, loginId: string, sourceUserId: string) {
  const db = createMoniServiceRoleClient()
  const rows = await db.from('moni_action_confirmations').select('id,action_domain,status,result_snapshot,executed_at,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('requested_by_login_id', loginId)
    .in('action_domain', ['mobile_sales_order', 'mobile_sales_statement'])
    .in('source_client_id', [`moni-mobile:${threadId}`, `moni-web:${threadId}`])
    .eq('status', 'EXECUTED')
    .order('executed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(20)
  if (rows.error) throw new Error(rows.error.message)
  const confirmation = (rows.data ?? []).find((row: any) => uuidLike(row?.result_snapshot?.result?.order?.id))
  const orderId = text(confirmation?.result_snapshot?.result?.order?.id, 80)
  if (!orderId) {
    return { stage: 'failed', domain: 'sales_statement', operation: 'SHOW', source_user_message_id: sourceUserId, error: '이 대화에서 방금 생성한 판매건을 찾지 못했습니다. 거래명세번호를 입력해 주세요.' }
  }

  const [order, items, receipts] = await Promise.all([
    db.from('sales_orders').select('*').eq('id', orderId).eq('business_id', BUSINESS_ID).maybeSingle(),
    db.from('sales_order_items').select('*').eq('order_id', orderId).order('sort_order').order('created_at'),
    db.from('sales_receipts').select('amount,status').eq('order_id', orderId),
  ])
  if (order.error || !order.data) throw new Error(order.error?.message || '최근 판매건을 찾지 못했습니다.')
  if (items.error || receipts.error) throw new Error(items.error?.message || receipts.error?.message || '거래명세표 데이터를 읽지 못했습니다.')
  const client = await db.from('sales_clients').select('id,company_name,address,phone,tax_type').eq('id', order.data.client_id).eq('business_id', BUSINESS_ID).maybeSingle()
  if (client.error) throw new Error(client.error.message)
  const receivedAmount = money((receipts.data ?? []).filter((row: any) => text(row.status) === 'posted').reduce((sum: number, row: any) => sum + num(row.amount), 0))
  const outstandingAmount = Math.max(0, money(num(order.data.total_amount) - receivedAmount))
  return {
    stage: 'completed', domain: 'sales_statement', operation: 'SHOW', source_user_message_id: sourceUserId,
    result: {
      verified: true,
      verification_basis: 'CANONICAL_SALES_ORDER_READ',
      result: {
        order: order.data,
        items: items.data ?? [],
        client: client.data || null,
        received_amount: receivedAmount,
        outstanding_amount: outstandingAmount,
        statement_url: `/api/moni/sales-statement-pdf?order_id=${encodeURIComponent(orderId)}&mode=inline`,
      },
    },
  }
}

function enrichSalesInput(fields: Record<string, any>, options: Awaited<ReturnType<typeof salesOptions>>) {
  const client = options.clients.find((row: any) => text(row.id) === text(fields.client_id))
  if (!client) throw new Error('매출 거래처를 선택해 주세요.')
  if (!validDate(fields.sale_date)) throw new Error('거래일을 확인해 주세요.')
  const rawItems = Array.isArray(fields.items) ? fields.items : []
  if (!rawItems.length) throw new Error('판매 품목을 한 개 이상 입력해 주세요.')

  const items = rawItems.map((row: any, index: number) => {
    const variant = options.variants.find((item: any) => text(item.id) === text(row.sales_variant_id))
    if (!variant) throw new Error(`${index + 1}번째 판매품목을 선택해 주세요.`)
    const quantity = num(row.quantity)
    if (quantity <= 0) throw new Error(`${index + 1}번째 품목 수량은 0보다 커야 합니다.`)
    const term = options.terms.find((item: any) => text(item.variant_id) === text(variant.id) && text(item.client_id) === text(client.id) && item.active !== false)
    const moq = num(term?.moq_quantity ?? variant.moq_quantity)
    if (moq > 0 && quantity < moq) throw new Error(`${text(variant.product_name)} · ${text(variant.variant_name)} 최소주문수량은 ${moq} ${text(variant.sales_unit).toUpperCase()}입니다.`)
    const defaultPrice = money(term?.unit_price ?? variant.default_unit_price)
    const unitPrice = row.unit_price === '' || row.unit_price === null || row.unit_price === undefined ? defaultPrice : money(row.unit_price)
    if (unitPrice <= 0) throw new Error(`${text(variant.product_name)} · ${text(variant.variant_name)} 판매단가를 확인해 주세요.`)
    return {
      sales_variant_id: text(variant.id),
      product_name: text(variant.product_name),
      variant_name: text(variant.variant_name),
      sales_unit: text(variant.sales_unit),
      quantity,
      unit_price: unitPrice,
      supply_amount: money(quantity * unitPrice),
      pricing_source: term ? '거래처 예외단가' : '기본단가',
      moq,
    }
  })

  const supplyAmount = money(items.reduce((sum: number, row: any) => sum + num(row.supply_amount), 0))
  const requestedVat = Math.max(0, Math.min(100, num(fields.vat_rate)))
  const warnings: string[] = []
  const vatRate = text(client.tax_type).toUpperCase() === 'EXEMPT' ? 0 : requestedVat
  if (text(client.tax_type).toUpperCase() === 'EXEMPT' && requestedVat !== 0) warnings.push('면세 거래처 기준으로 부가세율을 0%로 자동 적용했습니다.')
  if (text(client.tax_type).toUpperCase() === 'TAXABLE' && vatRate === 0) warnings.push('과세 거래처인데 부가세율이 0%입니다. 영세율 등 예외 거래인지 최종 확인해 주세요.')
  const vatAmount = money(supplyAmount * vatRate / 100)
  const totalAmount = money(supplyAmount + vatAmount)
  const dueDate = validDate(fields.due_date) ? text(fields.due_date, 10) : suggestedDueDate(text(fields.sale_date, 10), client)

  return {
    client,
    warnings,
    payload: {
      ...fields,
      client_id: text(client.id),
      client_name: text(client.company_name),
      client_tax_type: text(client.tax_type),
      vat_rate: vatRate,
      due_date: dueDate,
      items,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
    },
  }
}

function salesPreview(domain: 'sales_order' | 'sales_statement', payload: Record<string, any>) {
  const lines = (payload.items || []).map((item: any, index: number) => `  ${index + 1}. ${item.product_name} · ${item.variant_name} | ${item.quantity} ${text(item.sales_unit).toUpperCase()} × ${won(item.unit_price)} = ${won(item.supply_amount)}`)
  const title = domain === 'sales_statement' ? '[거래명세표 작성]' : '[매출 등록]'
  const status = text(payload.status) === 'draft' ? '임시' : '확정'
  return [
    title,
    `거래명세번호: 저장 시 자동 발급`,
    `거래일: ${payload.sale_date}`,
    `매출 거래처: ${payload.client_name}`,
    `거래 상태: ${status}`,
    `판매 품목:` ,
    ...lines,
    `공급가액: ${won(payload.supply_amount)}`,
    `부가세(${num(payload.vat_rate)}%): ${won(payload.vat_amount)}`,
    `최종 합계(VAT 포함): ${won(payload.total_amount)}`,
    `입금: 0원`,
    `미수: ${won(payload.total_amount)}`,
    `입금예정일: ${payload.due_date || '미설정'}`,
    domain === 'sales_statement' ? '거래명세표: 최종 확정 후 즉시 보기 가능' : '거래명세표: 요청 시 별도 보기 가능',
  ].join('\n')
}

async function createSalesConfirmation(input: { session: any; threadId: string; sourceUserId: string; domain: 'sales_order' | 'sales_statement'; payload: Record<string, any>; warnings: string[] }) {
  const db = createMoniServiceRoleClient()
  const result = await db.from('moni_action_confirmations').insert({
    business_id: BUSINESS_ID,
    action_domain: `mobile_${input.domain}`,
    action_type: 'CREATE',
    target_id: null,
    payload: { ...input.payload, semantic_operation: 'CREATE', source_user_message_id: input.sourceUserId },
    before_snapshot: null,
    preview_text: salesPreview(input.domain, input.payload),
    warnings: input.warnings,
    status: 'PENDING',
    requested_by_login_id: input.session.loginId,
    requested_by_role: input.session.role,
    source_client_id: `moni-mobile:${input.threadId}`,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }).select('id,status,expires_at,preview_text,warnings').single()
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function executeSalesCreate(request: NextRequest, session: any, threadId: string, confirmation: any) {
  const db = createMoniServiceRoleClient()
  const lock = await db.from('moni_action_confirmations').update({ status: 'EXECUTING', user_confirmation_text: '모바일 판매 업무 카드 최종 확정' }).eq('id', confirmation.id).eq('status', 'PENDING').select('*').maybeSingle()
  if (lock.error) throw new Error(lock.error.message)
  if (!lock.data) throw new Error('다른 실행이 이미 이 승인 건을 처리 중입니다. 중복 실행하지 않습니다.')
  const payload = lock.data.payload || {}
  const domain = text(lock.data.action_domain).replace(/^mobile_/, '') as 'sales_order' | 'sales_statement'
  try {
    const orderResult = await internalJson(request, '/api/moni/sales-orders-v4', { method: 'POST', body: JSON.stringify({ action: 'save_order', id: '', data: payload }) })
    let order = orderResult.order
    if (payload.due_date && order?.id) {
      const due = await internalJson(request, '/api/moni/receivables', { method: 'POST', body: JSON.stringify({ action: 'set_order_due_date', id: order.id, data: { due_date: payload.due_date } }) })
      if (due.order) order = due.order
    }
    const result = { ...orderResult, order, statement_url: order?.id ? `/api/moni/sales-statement-pdf?order_id=${encodeURIComponent(order.id)}&mode=inline` : null }
    const snapshot = { verified: true, verification_basis: 'PC_API_SUCCESS', domain, operation: 'CREATE', statement_requested: domain === 'sales_statement', result }
    const complete = await db.from('moni_action_confirmations').update({ status: 'EXECUTED', result_snapshot: snapshot, executed_at: new Date().toISOString(), error_message: null }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    if (complete.error) throw new Error(complete.error.message)
    await db.from('moni_action_audit_log').insert({
      confirmation_id: confirmation.id, business_id: BUSINESS_ID, action_domain: `mobile_${domain}`, action_type: 'CREATE', target_table: 'sales_orders', target_id: uuidLike(order?.id) ? order.id : null,
      before_snapshot: null, after_snapshot: snapshot, actor_login_id: session.loginId, actor_role: session.role, source_client_id: `moni-mobile:${threadId}`, user_confirmation_text: '모바일 판매 업무 카드 최종 확정',
    })
    return snapshot
  } catch (error) {
    await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: error instanceof Error ? error.message : '판매 저장 실패' }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    throw error
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
  try {
    const exchange = await latestExchange(threadId, auth.session.loginId)
    if (!exchange.user) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const intent = classifyMobileBusinessIntent(exchange.user.content)
    if (!intent) return legacyGET(request)
    if (intent.domain === 'sales_statement' && intent.operation === 'SHOW') {
      return NextResponse.json({ ok: true, card: await latestStatementCard(threadId, auth.session.loginId, text(exchange.user.id, 100)) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if ((intent.domain === 'sales_statement' && intent.operation === 'CREATE') || (intent.domain === 'sales_order' && intent.operation === 'CREATE')) {
      const existing = await createMoniServiceRoleClient().from('moni_action_confirmations').select('*').eq('business_id', BUSINESS_ID).eq('requested_by_login_id', auth.session.loginId).eq('source_client_id', `moni-mobile:${threadId}`).eq('action_domain', `mobile_${intent.domain}`).order('created_at', { ascending: false }).limit(20)
      if (existing.error) throw new Error(existing.error.message)
      const confirmation = (existing.data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 100) === text(exchange.user.id, 100))
      if (confirmation) {
        const status = text(confirmation.status, 30)
        const stage = status === 'PENDING' || status === 'EXECUTING' ? 'confirmation' : status === 'EXECUTED' ? 'completed' : status === 'FAILED' ? 'failed' : null
        if (stage) return NextResponse.json({ ok: true, card: { stage, domain: intent.domain, operation: intent.operation, source_user_message_id: exchange.user.id, confirmation_id: confirmation.id, preview_text: confirmation.preview_text, warnings: confirmation.warnings || [], result: confirmation.result_snapshot, error: confirmation.error_message, busy: status === 'EXECUTING' } }, { headers: { 'Cache-Control': 'no-store' } })
      }
      return NextResponse.json({ ok: true, card: await salesDraft(intent.domain, text(exchange.user.id, 100)) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return legacyGET(request)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 판매 업무 카드를 준비하지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const copy = request.clone()
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  try {
    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const command = text(body.command, 20)
    const threadId = text(body.thread_id, 80)
    if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })

    if (command === 'prepare') {
      const domain = text(body.domain, 60) as MobileBusinessDomain
      const operation = text(body.operation, 30) as MobileBusinessOperation
      if (!((domain === 'sales_statement' || domain === 'sales_order') && operation === 'CREATE')) return legacyPOST(copy)
      const sourceUserId = text(body.source_user_message_id, 100)
      if (!uuidLike(sourceUserId)) throw new Error('원본 사용자 요청을 확인할 수 없습니다.')
      const exchange = await latestExchange(threadId, auth.session.loginId)
      const currentIntent = exchange.user ? classifyMobileBusinessIntent(exchange.user.content) : null
      if (!exchange.user || text(exchange.user.id) !== sourceUserId || !currentIntent || currentIntent.domain !== domain || currentIntent.operation !== operation) throw new Error('현재 대화의 최신 업무 요청과 입력 카드가 일치하지 않습니다.')
      const options = await salesOptions()
      const enriched = enrichSalesInput((body.fields || {}) as Record<string, any>, options)
      const confirmation = await createSalesConfirmation({ session: auth.session, threadId, sourceUserId, domain, payload: enriched.payload, warnings: enriched.warnings })
      return NextResponse.json({ ok: true, confirmation })
    }

    if (command === 'execute') {
      const confirmationId = text(body.confirmation_id, 80)
      if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
      const db = createMoniServiceRoleClient()
      const confirmation = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('requested_by_login_id', auth.session.loginId).eq('source_client_id', `moni-mobile:${threadId}`).maybeSingle()
      if (confirmation.error || !confirmation.data) throw new Error('승인 요청을 찾을 수 없습니다.')
      if (confirmation.data.status === 'EXECUTED') return NextResponse.json({ ok: true, result: confirmation.data.result_snapshot || { verified: true, duplicate_safe: true } })
      const domain = text(confirmation.data.action_domain).replace(/^mobile_/, '')
      if ((domain === 'sales_statement' || domain === 'sales_order') && text(confirmation.data.payload?.semantic_operation) === 'CREATE') {
        if (confirmation.data.status !== 'PENDING') throw new Error(`현재 승인 상태(${confirmation.data.status})에서는 실행할 수 없습니다.`)
        if (new Date(confirmation.data.expires_at).getTime() < Date.now()) throw new Error('승인 시간이 만료되었습니다. 입력 카드를 다시 열어 주세요.')
        return NextResponse.json({ ok: true, result: await executeSalesCreate(request, auth.session, threadId, confirmation.data) })
      }
      return legacyPOST(copy)
    }

    return legacyPOST(copy)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 판매 업무를 처리하지 못했습니다.' }, { status: 400 })
  }
}
