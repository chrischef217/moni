import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent, type MobileBusinessDomain, type MobileBusinessOperation } from '@/lib/moni/mobile-business-intents'
import { prepareProductionPlanChange, executeProductionPlanChange } from '@/lib/moni/chatgpt-write-actions'
import { prepareProductionOperation, executeProductionOperation } from '@/lib/moni/chatgpt-production-actions'
import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

function identity(session: { loginId: string; displayName: string; role: string }, threadId: string): MoniMcpIdentity {
  return { tokenId: 'moni-mobile', clientId: `moni-mobile:${threadId}`, loginId: session.loginId, displayName: session.displayName, role: session.role, scopes: ['moni:read', 'moni:write'] }
}

async function latestThreadExchange(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(18)
  if (messages.error) throw new Error(messages.error.message)
  const chronological = [...(messages.data ?? [])].reverse()
  let userIndex = -1
  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    if (chronological[index]?.role === 'user') { userIndex = index; break }
  }
  if (userIndex < 0) return { user: null, assistant: null }
  return { user: chronological[userIndex], assistant: chronological.slice(userIndex + 1).find((row) => row.role === 'assistant') || null }
}

async function findConfirmation(loginId: string, threadId: string, sourceUserId: string) {
  const db = createMoniServiceRoleClient()
  const result = await db.from('moni_action_confirmations')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('requested_by_login_id', loginId)
    .in('source_client_id', [`moni-mobile:${threadId}`, `moni-web:${threadId}`])
    .order('created_at', { ascending: false })
    .limit(30)
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 100) === sourceUserId) || null
}

async function loadCommon() {
  const db = createMoniServiceRoleClient()
  const [products, clients, variants, terms, suppliers, raw, packaging] = await Promise.all([
    db.from('products').select('id,product_name,product_code,weight_g,product_type,is_active').eq('business_id', BUSINESS_ID).eq('is_active', true).order('product_name'),
    db.from('sales_clients').select('id,company_name,status').eq('business_id', BUSINESS_ID).eq('status', 'active').order('company_name'),
    db.from('sales_product_variants').select('id,product_id,variant_name,sales_unit,unit_weight_g,box_units,default_unit_price,moq_quantity,active').eq('business_id', BUSINESS_ID).eq('active', true).order('product_id').order('variant_name'),
    db.from('sales_client_variant_terms').select('id,client_id,variant_id,unit_price,moq_quantity,active').eq('business_id', BUSINESS_ID).eq('active', true),
    db.from('purchase_suppliers').select('id,company_name,status,default_payment_method,default_due_type,default_due_days,default_due_day,tax_invoice_required,tax_type').eq('business_id', BUSINESS_ID).eq('status', 'ACTIVE').order('company_name'),
    db.from('raw_materials').select('id,item_code,item_name,is_active,is_stock_managed,packing_weight_g,unit_price_per_kg,supplier,current_stock_g').eq('business_id', BUSINESS_ID).eq('is_active', true).order('item_name'),
    db.from('packaging_materials').select('id,material_code,material_name,is_active,supplier,current_stock,unit_price,spec,material_type').eq('business_id', BUSINESS_ID).eq('is_active', true).order('material_name'),
  ])
  const failed = [products, clients, variants, terms, suppliers, raw, packaging].find((result) => result.error)?.error
  if (failed) throw new Error(failed.message)
  const productById = new Map((products.data ?? []).map((row: any) => [text(row.id), row]))
  const hydratedVariants = (variants.data ?? []).map((row: any) => ({ ...row, product_name: text(productById.get(text(row.product_id))?.product_name) || '제품' }))
  return { products: products.data ?? [], clients: clients.data ?? [], variants: hydratedVariants, terms: terms.data ?? [], suppliers: suppliers.data ?? [], raw_materials: raw.data ?? [], packaging_materials: packaging.data ?? [] }
}

async function draftFor(domain: MobileBusinessDomain, operation: MobileBusinessOperation, sourceUserId: string) {
  const db = createMoniServiceRoleClient()
  const common = await loadCommon()
  const base = { stage: 'draft', domain, operation, source_user_message_id: sourceUserId, fields: {}, candidates: [], options: common }

  if (domain === 'packaging_inbound') {
    const result = await db.from('packaging_transactions').select('id,material_code,txn_type,quantity,txn_date,note,created_at').eq('business_id', BUSINESS_ID).order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(80)
    if (result.error) throw new Error(result.error.message)
    const meta = new Map((common.packaging_materials as any[]).flatMap((row) => [[text(row.id), row], [text(row.material_code), row]]))
    const candidates = (result.data ?? [])
      .filter((row: any) => text(row.txn_type).toUpperCase().includes('INBOUND'))
      .map((row: any) => ({ ...row, material_name: text(meta.get(text(row.material_code))?.material_name) || text(row.material_code) }))
    return { ...base, fields: { tx_date: today(), quantity: '', counterparty: '', note: '' }, candidates }
  }

  if (domain === 'production_plan') {
    const result = await db.from('monthly_production_plans').select('*').eq('business_id', BUSINESS_ID).order('plan_date', { ascending: false }).order('created_at', { ascending: false }).limit(100)
    if (result.error) throw new Error(result.error.message)
    return { ...base, fields: { plan_date: today(), product_id: '', planned_quantity_kg: '', note: '' }, candidates: result.data ?? [] }
  }

  if (domain === 'production_work') {
    let statuses = ['planned']
    if (operation === 'CONFIRM') statuses = ['completed', '완료']
    const result = await db.from('production_records').select('id,work_date,lot_number,product_id,product_name,planned_quantity_g,actual_quantity_g,defect_quantity_g,sample_quantity_g,status,worker_name,inspection_result,inspection_note,sanitation_check,note').eq('business_id', BUSINESS_ID).in('status', statuses).order('work_date', { ascending: false }).order('created_at', { ascending: false }).limit(100)
    if (result.error) throw new Error(result.error.message)
    const fields = operation === 'CREATE'
      ? { work_date: today(), product_id: '', planned_quantity_kg: '', lot_number: '', worker_name: '', note: '' }
      : operation === 'COMPLETE'
        ? { record_id: '', actual_quantity_kg: '', defect_quantity_kg: '0', sample_quantity_kg: '0', worker_name: '', inspection_result: '적합', inspection_note: '', sanitation_check: true }
        : { record_id: '', work_date: '', planned_quantity_kg: '', lot_number: '', worker_name: '', note: '', reason: '' }
    return { ...base, fields, candidates: result.data ?? [] }
  }

  if (domain === 'sales_order') {
    const [orders, items] = await Promise.all([
      db.from('sales_orders').select('*').eq('business_id', BUSINESS_ID).order('sale_date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      db.from('sales_order_items').select('id,order_id,product_id,product_name,specification,quantity,unit,unit_price,supply_amount,sales_variant_id,sales_variant_name,sort_order').order('order_id').order('sort_order'),
    ])
    if (orders.error || items.error) throw new Error(orders.error?.message || items.error?.message || '판매건 조회 실패')
    const itemsByOrder = new Map<string, any[]>()
    for (const row of items.data ?? []) {
      const key = text(row.order_id)
      const list = itemsByOrder.get(key) || []
      list.push(row)
      itemsByOrder.set(key, list)
    }
    const candidates = (orders.data ?? []).map((row: any) => ({ ...row, items: itemsByOrder.get(text(row.id)) || [] }))
    return { ...base, fields: { sale_date: today(), client_id: '', status: 'confirmed', vat_rate: '10', note: '', items: [{ sales_variant_id: '', quantity: '', unit_price: '' }] }, candidates }
  }

  if (domain === 'purchase') {
    const purchases = await db.from('purchases').select('*').eq('business_id', BUSINESS_ID).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).limit(100)
    if (purchases.error) throw new Error(purchases.error.message)
    return { ...base, fields: { supplier_id: '', purchase_date: today(), receipt_date: today(), purchase_category: 'RAW_MATERIAL', material_id: '', quantity: '', unit: 'KG', unit_price: '', tax_invoice_status: 'NOT_REQUIRED', notes: '' }, candidates: purchases.data ?? [] }
  }

  if (domain === 'payment') {
    const [purchases, payments] = await Promise.all([
      db.from('purchases').select('id,purchase_no,purchase_date,supplier_name_snapshot,total_amount,status').eq('business_id', BUSINESS_ID).neq('status', 'CANCELLED').order('purchase_date', { ascending: false }).limit(150),
      db.from('purchase_payments').select('purchase_id,amount').eq('business_id', BUSINESS_ID),
    ])
    if (purchases.error || payments.error) throw new Error(purchases.error?.message || payments.error?.message || '지급 대상 조회 실패')
    const paid = new Map<string, number>()
    for (const row of payments.data ?? []) paid.set(text(row.purchase_id), (paid.get(text(row.purchase_id)) || 0) + num(row.amount))
    const candidates = (purchases.data ?? []).map((row: any) => ({ ...row, outstanding_amount: Math.max(0, num(row.total_amount) - (paid.get(text(row.id)) || 0)) })).filter((row: any) => row.outstanding_amount > 0)
    return { ...base, fields: { purchase_id: '', payment_date: today(), amount: '', payment_method: 'BANK_TRANSFER', payment_account: '', card_name: '', installment_months: '1', reference: '', notes: '' }, candidates }
  }

  return base
}

function preview(domain: MobileBusinessDomain, operation: MobileBusinessOperation, fields: Record<string, any>, before?: any) {
  if (domain === 'packaging_inbound') return operation === 'CREATE' ? `[부재료 입고] ${fields.tx_date} / ${fields.material_name || fields.material_code} / ${fields.quantity}EA / ${fields.counterparty || '거래처 미입력'}` : operation === 'UPDATE' ? `[부재료 입고 수정] ${before?.txn_date || ''} ${before?.material_name || ''} ${before?.quantity || 0}EA → ${fields.tx_date} ${fields.quantity}EA` : `[부재료 입고 삭제] ${before?.txn_date || ''} / ${before?.material_name || ''} / ${before?.quantity || 0}EA`
  if (domain === 'sales_order') return operation === 'CANCEL' ? `[판매 취소] ${before?.sale_date || ''} / ${before?.statement_number || before?.id || ''}` : `[판매 ${operation === 'UPDATE' ? '수정' : '등록'}] ${fields.sale_date} / 거래처 ${fields.client_name || fields.client_id} / 품목 ${(fields.items || []).length}건 / VAT ${fields.vat_rate || 0}%`
  if (domain === 'purchase') return operation === 'CANCEL' ? `[매입 취소] ${before?.purchase_date || ''} / ${before?.purchase_no || before?.id || ''}` : `[매입 등록] ${fields.purchase_date} / ${fields.supplier_name || fields.supplier_id} / ${fields.material_name || fields.material_id} / ${fields.quantity}${fields.unit || ''}`
  if (domain === 'payment') return `[매입대금 지급] ${fields.payment_date} / ${fields.purchase_no || fields.purchase_id} / ${new Intl.NumberFormat('ko-KR').format(num(fields.amount))}원 / ${fields.payment_method}`
  return '업무 실행 미리보기'
}

function storedActionType(operation: MobileBusinessOperation) {
  if (operation === 'CANCEL') return 'DELETE'
  return operation
}

async function createGenericConfirmation(input: { session: any; threadId: string; sourceUserId: string; domain: MobileBusinessDomain; operation: MobileBusinessOperation; payload: Record<string, any>; before?: any; previewText: string }) {
  const db = createMoniServiceRoleClient()
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  const result = await db.from('moni_action_confirmations').insert({
    business_id: BUSINESS_ID,
    action_domain: `mobile_${input.domain}`,
    action_type: storedActionType(input.operation),
    target_id: uuidLike(input.payload.target_id) ? input.payload.target_id : null,
    payload: { ...input.payload, semantic_operation: input.operation, source_user_message_id: input.sourceUserId },
    before_snapshot: input.before || null,
    preview_text: input.previewText,
    warnings: [],
    status: 'PENDING',
    requested_by_login_id: input.session.loginId,
    requested_by_role: input.session.role,
    source_client_id: `moni-mobile:${input.threadId}`,
    expires_at: expiresAt,
  }).select('id,status,expires_at,preview_text,warnings').single()
  if (result.error) throw new Error(result.error.message)
  return result.data
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

async function executeGeneric(request: NextRequest, session: any, threadId: string, confirmation: any) {
  const db = createMoniServiceRoleClient()
  const domain = text(confirmation.action_domain).replace(/^mobile_/, '') as MobileBusinessDomain
  const operation = text(confirmation.payload?.semantic_operation || confirmation.action_type) as MobileBusinessOperation
  const payload = confirmation.payload || {}

  const lock = await db.from('moni_action_confirmations').update({ status: 'EXECUTING', user_confirmation_text: '모바일 업무 카드 최종 확정' }).eq('id', confirmation.id).eq('status', 'PENDING').select('id').maybeSingle()
  if (lock.error) throw new Error(lock.error.message)
  if (!lock.data) throw new Error('다른 실행이 이미 이 승인 건을 처리 중입니다. 중복 실행하지 않습니다.')

  try {
    let result: any
    if (domain === 'packaging_inbound') {
      if (operation === 'CREATE') result = await internalJson(request, '/api/moni/packaging-transactions', { method: 'POST', body: JSON.stringify({ material_code: payload.material_code, quantity: payload.quantity, tx_date: payload.tx_date, counterparty: payload.counterparty, note: payload.note }) })
      else if (operation === 'UPDATE') result = await internalJson(request, '/api/moni/packaging-transactions', { method: 'PATCH', body: JSON.stringify({ id: payload.target_id, quantity: payload.quantity, tx_date: payload.tx_date, counterparty: payload.counterparty, note: payload.note }) })
      else result = await internalJson(request, `/api/moni/packaging-transactions?id=${encodeURIComponent(payload.target_id)}`, { method: 'DELETE' })
    } else if (domain === 'sales_order') {
      result = operation === 'CANCEL'
        ? await internalJson(request, '/api/moni/sales-orders-v4', { method: 'POST', body: JSON.stringify({ action: 'cancel_order', id: payload.target_id, data: { reason: payload.reason || '모바일 MONI에서 취소' } }) })
        : await internalJson(request, '/api/moni/sales-orders-v4', { method: 'POST', body: JSON.stringify({ action: 'save_order', id: operation === 'UPDATE' ? payload.target_id : '', data: payload }) })
    } else if (domain === 'purchase') {
      result = operation === 'CANCEL'
        ? await internalJson(request, '/api/moni/purchases', { method: 'POST', body: JSON.stringify({ action: 'cancel_purchase', id: payload.target_id }) })
        : await internalJson(request, '/api/moni/purchases', { method: 'POST', body: JSON.stringify({ action: 'create_purchase', ...payload }) })
    } else if (domain === 'payment') {
      result = await internalJson(request, '/api/moni/purchases', { method: 'POST', body: JSON.stringify({ action: 'add_payment', ...payload }) })
    } else {
      throw new Error('허용되지 않은 모바일 실행 영역입니다.')
    }

    const snapshot = { verified: true, verification_basis: 'PC_API_SUCCESS', domain, operation, result }
    const complete = await db.from('moni_action_confirmations').update({ status: 'EXECUTED', result_snapshot: snapshot, executed_at: new Date().toISOString(), error_message: null }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    if (complete.error) throw new Error(complete.error.message)
    await db.from('moni_action_audit_log').insert({
      confirmation_id: confirmation.id,
      business_id: BUSINESS_ID,
      action_domain: `mobile_${domain}`,
      action_type: storedActionType(operation),
      target_table: domain,
      target_id: uuidLike(payload.target_id) ? payload.target_id : null,
      before_snapshot: confirmation.before_snapshot || null,
      after_snapshot: snapshot,
      actor_login_id: session.loginId,
      actor_role: session.role,
      source_client_id: `moni-mobile:${threadId}`,
      user_confirmation_text: '모바일 업무 카드 최종 확정',
    })
    return snapshot
  } catch (error) {
    await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: error instanceof Error ? error.message : '실행 실패' }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    throw error
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
  try {
    const exchange = await latestThreadExchange(threadId, auth.session.loginId)
    if (!exchange.user) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const intent = classifyMobileBusinessIntent(exchange.user.content)
    if (!intent || intent.domain === 'raw_material_inbound') return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const existing = await findConfirmation(auth.session.loginId, threadId, text(exchange.user.id, 100))
    if (existing) {
      const status = text(existing.status, 30)
      const stage = status === 'PENDING' || status === 'EXECUTING' ? 'confirmation' : status === 'EXECUTED' ? 'completed' : status === 'FAILED' ? 'failed' : null
      if (stage) return NextResponse.json({ ok: true, card: { stage, domain: intent.domain, operation: intent.operation, source_user_message_id: exchange.user.id, confirmation_id: existing.id, preview_text: existing.preview_text, warnings: existing.warnings || [], result: existing.result_snapshot, error: existing.error_message, busy: status === 'EXECUTING' } }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ ok: true, card: await draftFor(intent.domain, intent.operation, text(exchange.user.id, 100)) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 업무 카드를 준비하지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  try {
    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const command = text(body.command, 20)
    const threadId = text(body.thread_id, 80)
    if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
    const who = identity(auth.session, threadId)

    if (command === 'prepare') {
      const domain = text(body.domain, 60) as MobileBusinessDomain
      const operation = text(body.operation, 30) as MobileBusinessOperation
      const sourceUserId = text(body.source_user_message_id, 100)
      const fields = (body.fields || {}) as Record<string, any>
      const targetId = text(body.target_id, 100)
      if (!sourceUserId || !uuidLike(sourceUserId)) throw new Error('원본 사용자 요청을 확인할 수 없습니다.')

      const exchange = await latestThreadExchange(threadId, auth.session.loginId)
      const currentIntent = exchange.user ? classifyMobileBusinessIntent(exchange.user.content) : null
      if (!exchange.user || text(exchange.user.id) !== sourceUserId || !currentIntent || currentIntent.domain !== domain || currentIntent.operation !== operation) {
        throw new Error('현재 대화의 최신 업무 요청과 입력 카드가 일치하지 않습니다.')
      }

      if (domain === 'production_plan') {
        const result = await prepareProductionPlanChange({ action: operation, plan_id: targetId, plan_date: fields.plan_date, product_id: fields.product_id, planned_quantity_kg: fields.planned_quantity_kg, note: fields.note, reason: fields.reason }, who)
        const db = createMoniServiceRoleClient()
        const row = await db.from('moni_action_confirmations').select('payload').eq('id', result.confirmation_id).single()
        await db.from('moni_action_confirmations').update({ payload: { ...(row.data?.payload || {}), source_user_message_id: sourceUserId } }).eq('id', result.confirmation_id)
        return NextResponse.json({ ok: true, confirmation: result })
      }

      if (domain === 'production_work') {
        const action = operation === 'CREATE' ? 'CREATE_WORK_ORDER' : operation === 'UPDATE' ? 'UPDATE_WORK_ORDER' : operation === 'CANCEL' ? 'CANCEL_WORK_ORDER' : operation === 'COMPLETE' ? 'COMPLETE_PRODUCTION' : 'CONFIRM_PRODUCTION'
        const result = await prepareProductionOperation({ action, record_id: targetId || fields.record_id, work_date: fields.work_date, product_id: fields.product_id, planned_quantity_kg: fields.planned_quantity_kg, lot_number: fields.lot_number, note: fields.note, worker_name: fields.worker_name, actual_quantity_kg: fields.actual_quantity_kg, defect_quantity_kg: fields.defect_quantity_kg, sample_quantity_kg: fields.sample_quantity_kg, inspection_result: fields.inspection_result, inspection_note: fields.inspection_note, sanitation_check: fields.sanitation_check, reason: fields.reason }, who)
        const db = createMoniServiceRoleClient()
        const row = await db.from('moni_action_confirmations').select('payload').eq('id', result.confirmation_id).single()
        await db.from('moni_action_confirmations').update({ payload: { ...(row.data?.payload || {}), source_user_message_id: sourceUserId } }).eq('id', result.confirmation_id)
        return NextResponse.json({ ok: true, confirmation: result })
      }

      const common = await loadCommon()
      let before: any = null
      const payload: Record<string, any> = { ...fields, target_id: targetId || undefined }

      if (domain === 'packaging_inbound') {
        const material = (common.packaging_materials as any[]).find((row) => text(row.id) === text(fields.material_code) || text(row.material_code) === text(fields.material_code))
        if (operation !== 'DELETE' && !material) throw new Error('부재료를 전체 목록에서 선택해 주세요.')
        if (operation !== 'DELETE' && num(fields.quantity) <= 0) throw new Error('입고수량은 0보다 커야 합니다.')
        if (operation !== 'CREATE') {
          const result = await createMoniServiceRoleClient().from('packaging_transactions').select('*').eq('id', targetId).eq('business_id', BUSINESS_ID).maybeSingle()
          if (result.error || !result.data) throw new Error('수정·삭제할 부재료 입고 기록을 찾을 수 없습니다.')
          if (!text(result.data.txn_type).toUpperCase().includes('INBOUND')) throw new Error('자동 출고 내역은 수정·삭제할 수 없습니다.')
          before = { ...result.data, material_name: text((common.packaging_materials as any[]).find((row) => text(row.material_code) === text(result.data.material_code))?.material_name) }
        }
        payload.material_name = text(material?.material_name) || text(before?.material_name)
      }

      if (domain === 'sales_order') {
        if (operation !== 'CANCEL') {
          const client = (common.clients as any[]).find((row) => text(row.id) === text(fields.client_id))
          if (!client) throw new Error('거래처를 선택해 주세요.')
          const items = Array.isArray(fields.items) ? fields.items : []
          if (!items.length || items.some((row: any) => !text(row.sales_variant_id) || num(row.quantity) <= 0)) throw new Error('판매 품목과 수량을 확인해 주세요.')
          payload.client_name = client.company_name
        }
        if (operation === 'UPDATE' || operation === 'CANCEL') {
          const db = createMoniServiceRoleClient()
          const [order, items] = await Promise.all([
            db.from('sales_orders').select('*').eq('id', targetId).eq('business_id', BUSINESS_ID).maybeSingle(),
            db.from('sales_order_items').select('*').eq('order_id', targetId).order('sort_order'),
          ])
          if (order.error || !order.data) throw new Error(order.error?.message || '대상 판매건을 찾을 수 없습니다.')
          if (items.error) throw new Error(items.error.message)
          before = { ...order.data, items: items.data ?? [] }
        }
      }

      if (domain === 'purchase') {
        if (operation === 'CREATE') {
          const supplier = (common.suppliers as any[]).find((row) => text(row.id) === text(fields.supplier_id))
          if (!supplier) throw new Error('매입처를 선택해 주세요.')
          const materials = fields.purchase_category === 'PACKAGING' ? common.packaging_materials : common.raw_materials
          const material = (materials as any[]).find((row) => text(row.id) === text(fields.material_id) || text(row.material_code) === text(fields.material_id))
          if (!material) throw new Error('매입 품목을 선택해 주세요.')
          if (num(fields.quantity) <= 0) throw new Error('매입수량은 0보다 커야 합니다.')
          payload.supplier_name = supplier.company_name
          payload.material_name = text(material.item_name || material.material_name)
        } else {
          const result = await createMoniServiceRoleClient().from('purchases').select('*').eq('id', targetId).eq('business_id', BUSINESS_ID).maybeSingle()
          if (result.error || !result.data) throw new Error('취소할 매입건을 찾을 수 없습니다.')
          before = result.data
        }
      }

      if (domain === 'payment') {
        const result = await createMoniServiceRoleClient().from('purchases').select('id,purchase_no,total_amount,status').eq('id', text(fields.purchase_id)).eq('business_id', BUSINESS_ID).maybeSingle()
        if (result.error || !result.data || result.data.status === 'CANCELLED') throw new Error('지급할 매입건을 찾을 수 없습니다.')
        if (num(fields.amount) <= 0) throw new Error('지급금액은 0보다 커야 합니다.')
        payload.purchase_no = result.data.purchase_no
        before = result.data
      }

      const confirmation = await createGenericConfirmation({ session: auth.session, threadId, sourceUserId, domain, operation, payload, before, previewText: preview(domain, operation, payload, before) })
      return NextResponse.json({ ok: true, confirmation })
    }

    if (command === 'execute') {
      const confirmationId = text(body.confirmation_id, 80)
      if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
      const db = createMoniServiceRoleClient()
      const result = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('requested_by_login_id', auth.session.loginId).in('source_client_id', [`moni-mobile:${threadId}`, `moni-web:${threadId}`]).maybeSingle()
      if (result.error || !result.data) throw new Error('승인 건을 찾을 수 없습니다.')
      const confirmation = result.data as any
      if (confirmation.status === 'EXECUTED') return NextResponse.json({ ok: true, result: confirmation.result_snapshot || { verified: true, duplicate_safe: true } })
      if (confirmation.status !== 'PENDING') throw new Error('이미 처리 중이거나 실행할 수 없는 승인 건입니다. 중복 실행하지 않습니다.')
      if (new Date(confirmation.expires_at).getTime() <= Date.now()) {
        await db.from('moni_action_confirmations').update({ status: 'EXPIRED' }).eq('id', confirmationId).eq('status', 'PENDING')
        throw new Error('승인 시간이 만료되었습니다. 입력 내용을 다시 확인해 주세요.')
      }

      if (confirmation.action_domain === 'production_plan') {
        return NextResponse.json({ ok: true, result: await executeProductionPlanChange({ confirmation_id: confirmationId, user_confirmation_text: '모바일 업무 카드 최종 확정' }, who) })
      }
      if (confirmation.action_domain === 'production_record') {
        return NextResponse.json({ ok: true, result: await executeProductionOperation({ confirmation_id: confirmationId, user_confirmation_text: '모바일 업무 카드 최종 확정' }, who) })
      }
      return NextResponse.json({ ok: true, result: await executeGeneric(request, auth.session, threadId, confirmation) })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 명령입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 업무 처리를 완료하지 못했습니다.' }, { status: 500 })
  }
}
