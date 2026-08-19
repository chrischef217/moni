import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'
import { resolveMasterPurchasePricing } from '@/lib/moni/purchasePricingServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(money(value))}원`

function today() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()) }
function validDate(value: unknown) { const date = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const parsed = new Date(`${date}T00:00:00Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date }
function addDays(date: string, days: number) { const parsed = new Date(`${date}T00:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + days); return parsed.toISOString().slice(0, 10) }
function nextMonthDate(date: string, day: number) { const parsed = new Date(`${date}T00:00:00Z`); const year = parsed.getUTCFullYear(); const month = parsed.getUTCMonth() + 1; const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return new Date(Date.UTC(year, month, Math.min(Math.max(day, 1), last))).toISOString().slice(0, 10) }
function monthEnd(date: string) { const parsed = new Date(`${date}T00:00:00Z`); return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 2, 0)).toISOString().slice(0, 10) }
function paymentLabel(value: unknown) { const v = text(value).toUpperCase(); return v === 'BANK_TRANSFER' ? '계좌이체' : v === 'CARD' ? '카드' : v === 'CASH' ? '현금' : '기타' }
function taxLabel(value: unknown) { const v = text(value).toUpperCase(); return v === 'EXEMPT' ? '면세' : v === 'ZERO_RATE' ? '영세율' : '과세' }

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestUser(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(18)
  if (messages.error) throw new Error(messages.error.message)
  for (const row of messages.data ?? []) if (row.role === 'user') return row
  return null
}

async function loadOptions() {
  const db = createMoniServiceRoleClient()
  const [suppliers, raw, packaging] = await Promise.all([
    db.from('purchase_suppliers').select('id,company_name,status,default_due_type,default_due_days,default_due_day,default_payment_method,default_payment_account,default_card_name,default_installment_months,tax_invoice_required,tax_type').eq('business_id', BUSINESS_ID).eq('status', 'ACTIVE').order('company_name'),
    db.from('raw_materials').select('id,item_code,item_name,is_active,is_stock_managed,packing_weight_g,unit_price_per_kg,supplier,current_stock_g,business_id,ingredient_type,semifinished_usage_type').eq('business_id', BUSINESS_ID).eq('is_active', true).order('item_name'),
    db.from('packaging_materials').select('id,material_code,material_name,is_active,supplier,current_stock,unit_price,spec,material_type,business_id').eq('business_id', BUSINESS_ID).eq('is_active', true).order('material_name'),
  ])
  const failed = [suppliers, raw, packaging].find((row) => row.error)?.error
  if (failed) throw new Error(failed.message)
  return { suppliers: suppliers.data ?? [], raw_materials: raw.data ?? [], packaging_materials: packaging.data ?? [] }
}

function cleanInput(fields: Record<string, any>) {
  return {
    supplier_id: text(fields.supplier_id, 100),
    purchase_date: text(fields.purchase_date, 10),
    receipt_date: text(fields.receipt_date, 10),
    purchase_category: text(fields.purchase_category, 30).toUpperCase(),
    material_id: text(fields.material_id, 100),
    quantity: text(fields.quantity, 80),
    unit: text(fields.unit, 10).toUpperCase(),
    due_date: text(fields.due_date, 10),
    planned_payment_method: text(fields.planned_payment_method, 30).toUpperCase(),
    planned_payment_account: text(fields.planned_payment_account, 200),
    planned_card_name: text(fields.planned_card_name, 200),
    planned_installment_months: text(fields.planned_installment_months, 20),
    tax_invoice_status: text(fields.tax_invoice_status, 40).toUpperCase(),
    tax_invoice_amount: fields.tax_invoice_amount === '' || fields.tax_invoice_amount == null ? '' : text(fields.tax_invoice_amount, 80),
    notes: text(fields.notes, 4000),
  }
}

function calculateDueDate(purchaseDate: string, supplier: Record<string, any>, direct: string) {
  if (validDate(direct)) return direct
  const dueType = text(supplier.default_due_type).toUpperCase() || 'DAYS'
  if (dueType === 'IMMEDIATE') return purchaseDate
  if (dueType === 'DAYS') return addDays(purchaseDate, Math.max(0, Math.round(num(supplier.default_due_days))))
  if (dueType === 'NEXT_MONTH_DAY') return nextMonthDate(purchaseDate, Math.round(num(supplier.default_due_day) || 1))
  if (dueType === 'MONTH_END') return monthEnd(purchaseDate)
  return ''
}

type Calc = {
  input: ReturnType<typeof cleanInput>
  authoritative: Record<string, any>
  fingerprint: string
  previewText: string
  warnings: string[]
}

async function calculate(inputSource: Record<string, any>): Promise<Calc> {
  const input = cleanInput(inputSource)
  const db = createMoniServiceRoleClient()
  const options = await loadOptions()
  const supplier = options.suppliers.find((row: any) => text(row.id) === input.supplier_id)
  if (!supplier) throw new Error('매입처를 선택해 주세요.')
  const category = input.purchase_category === 'PACKAGING' ? 'PACKAGING' : 'RAW_MATERIAL'
  const materials = category === 'PACKAGING' ? options.packaging_materials : options.raw_materials
  const material = materials.find((row: any) => text(row.id) === input.material_id || text(row.material_code || row.item_code) === input.material_id)
  if (!material) throw new Error('매입 품목을 선택해 주세요.')
  const purchaseDate = input.purchase_date || today()
  const receiptDate = input.receipt_date || purchaseDate
  if (!validDate(purchaseDate) || !validDate(receiptDate)) throw new Error('매입일과 입고일을 확인해 주세요.')
  const quantity = num(input.quantity)
  if (quantity <= 0) throw new Error('매입수량은 0보다 커야 합니다.')
  const unit = category === 'PACKAGING' ? 'EA' : (['KG', 'G', 'EA'].includes(input.unit) ? input.unit : 'KG')
  const pricing = await resolveMasterPurchasePricing(db, { businessId: BUSINESS_ID, category, materialId: text(material.id), quantity, unit: unit as 'KG' | 'G' | 'EA' })
  const supplierTaxType = text(supplier.tax_type).toUpperCase() || 'TAXABLE'
  const vatAmount = supplierTaxType === 'EXEMPT' || supplierTaxType === 'ZERO_RATE' ? 0 : Math.round(pricing.supplyAmount * 0.1)
  const totalAmount = money(pricing.supplyAmount + vatAmount)
  const dueDate = calculateDueDate(purchaseDate, supplier, input.due_date)
  const paymentMethod = input.planned_payment_method || text(supplier.default_payment_method).toUpperCase() || 'BANK_TRANSFER'
  const taxInvoiceStatus = input.tax_invoice_status || (supplier.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED')
  const installmentMonths = paymentMethod === 'CARD' ? Math.max(1, Math.min(36, Math.round(num(input.planned_installment_months) || num(supplier.default_installment_months) || 1))) : 1
  const warnings: string[] = []
  if (!dueDate) warnings.push('지급예정일이 설정되지 않았습니다. 매입처 지급조건 또는 직접 입력값을 확인해 주세요.')
  const authoritative = {
    supplier_id: text(supplier.id), supplier_name: text(supplier.company_name), supplier_tax_type: supplierTaxType,
    purchase_date: purchaseDate, receipt_date: receiptDate, purchase_category: category,
    material_id: text(material.id), material_name: text(material.item_name || material.material_name), quantity, unit,
    unit_price: pricing.unitPrice, master_price: pricing.masterPrice, packing_weight_g: pricing.packingWeightG,
    supply_amount: pricing.supplyAmount, vat_amount: vatAmount, total_amount: totalAmount, due_date: dueDate,
    planned_payment_method: paymentMethod,
    planned_payment_account: input.planned_payment_account || text(supplier.default_payment_account),
    planned_card_name: input.planned_card_name || text(supplier.default_card_name),
    planned_installment_months: installmentMonths,
    tax_invoice_status: taxInvoiceStatus,
    tax_invoice_amount: input.tax_invoice_amount === '' ? null : num(input.tax_invoice_amount),
    notes: input.notes,
  }
  const fingerprint = JSON.stringify({
    supplier_id: authoritative.supplier_id,
    material_id: authoritative.material_id,
    quantity: authoritative.quantity,
    unit: authoritative.unit,
    unit_price: authoritative.unit_price,
    supply_amount: authoritative.supply_amount,
    vat_amount: authoritative.vat_amount,
    total_amount: authoritative.total_amount,
    due_date: authoritative.due_date,
    planned_payment_method: authoritative.planned_payment_method,
    planned_payment_account: authoritative.planned_payment_account,
    planned_card_name: authoritative.planned_card_name,
    planned_installment_months: authoritative.planned_installment_months,
    tax_invoice_status: authoritative.tax_invoice_status,
    supplier_tax_type: authoritative.supplier_tax_type,
  })
  const previewText = [
    '[매입 등록]',
    '매입번호: 저장 시 자동 발급',
    `매입일 / 입고일: ${purchaseDate} / ${receiptDate}`,
    `매입처: ${authoritative.supplier_name} · ${taxLabel(authoritative.supplier_tax_type)}`,
    `품목: ${authoritative.material_name}`,
    `수량: ${quantity} ${unit}`,
    `마스터 적용 단가: ${won(authoritative.unit_price)}`,
    `공급가액: ${won(authoritative.supply_amount)}`,
    `부가세: ${won(authoritative.vat_amount)}`,
    `최종 합계(VAT 포함): ${won(authoritative.total_amount)}`,
    '지급: 0원',
    `미지급: ${won(authoritative.total_amount)}`,
    `지급예정일: ${authoritative.due_date || '미설정'}`,
    `예정 결제수단: ${paymentLabel(authoritative.planned_payment_method)}`,
    `세금계산서: ${authoritative.tax_invoice_status}`,
  ].join('\n')
  return { input, authoritative, fingerprint, previewText, warnings }
}

async function internalJson(request: NextRequest, path: string, body: Record<string, any>) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(new URL(path, request.url), { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) throw new Error(payload.error || `업무 실행 실패 (${response.status})`)
  return payload
}

async function existingConfirmation(loginId: string, threadId: string, sourceUserId: string) {
  const db = createMoniServiceRoleClient()
  const result = await db.from('moni_action_confirmations').select('*').eq('business_id', BUSINESS_ID).eq('action_domain', 'mobile_purchase_authoritative_v3').eq('requested_by_login_id', loginId).eq('source_client_id', `moni-mobile:${threadId}`).order('created_at', { ascending: false }).limit(20)
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 100) === sourceUserId) || null
}

function sameSavedPurchase(purchase: Record<string, any>, authoritative: Record<string, any>) {
  return Math.abs(num(purchase.unit_price) - num(authoritative.unit_price)) < 0.0001
    && Math.abs(num(purchase.supply_amount) - num(authoritative.supply_amount)) < 0.0001
    && Math.abs(num(purchase.vat_amount) - num(authoritative.vat_amount)) < 0.0001
    && Math.abs(num(purchase.total_amount) - num(authoritative.total_amount)) < 0.0001
    && text(purchase.due_date, 10) === text(authoritative.due_date, 10)
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
  try {
    const user = await latestUser(threadId, auth.session.loginId)
    if (!user) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const intent = classifyMobileBusinessIntent(user.content)
    if (!intent || intent.domain !== 'purchase' || intent.operation !== 'CREATE') return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const existing = await existingConfirmation(auth.session.loginId, threadId, text(user.id, 100))
    if (existing) {
      const status = text(existing.status, 30)
      const stage = status === 'PENDING' || status === 'EXECUTING' ? 'confirmation' : status === 'EXECUTED' ? 'completed' : status === 'FAILED' ? 'failed' : null
      if (stage) return NextResponse.json({ ok: true, card: { stage, domain: 'purchase', operation: 'CREATE', source_user_message_id: user.id, confirmation_id: existing.id, preview_text: existing.preview_text, warnings: existing.warnings || [], result: existing.result_snapshot, error: existing.error_message, busy: status === 'EXECUTING' } }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ ok: true, card: { stage: 'draft', domain: 'purchase', operation: 'CREATE', source_user_message_id: user.id, fields: { supplier_id: '', purchase_date: today(), receipt_date: today(), purchase_category: 'RAW_MATERIAL', material_id: '', quantity: '', unit: 'KG', due_date: '', planned_payment_method: '', planned_payment_account: '', planned_card_name: '', planned_installment_months: '', tax_invoice_status: '', tax_invoice_amount: '', notes: '' }, options: await loadOptions() } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '매입 입력 카드를 준비하지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const body = await request.json().catch(() => null) as Record<string, any> | null
  if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
  const threadId = text(body.thread_id, 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
  try {
    const command = text(body.command, 20)
    if (command === 'prepare') {
      const sourceUserId = text(body.source_user_message_id, 100)
      if (!uuidLike(sourceUserId)) throw new Error('원본 사용자 요청을 확인할 수 없습니다.')
      const user = await latestUser(threadId, auth.session.loginId)
      const intent = user ? classifyMobileBusinessIntent(user.content) : null
      if (!user || text(user.id) !== sourceUserId || !intent || intent.domain !== 'purchase' || intent.operation !== 'CREATE') throw new Error('현재 대화의 최신 매입 요청과 입력 카드가 일치하지 않습니다.')
      const calc = await calculate((body.fields || {}) as Record<string, any>)
      const db = createMoniServiceRoleClient()
      const result = await db.from('moni_action_confirmations').insert({
        business_id: BUSINESS_ID, action_domain: 'mobile_purchase_authoritative_v3', action_type: 'CREATE', target_id: null,
        payload: { input_snapshot: calc.input, authoritative: calc.authoritative, pricing_fingerprint: calc.fingerprint, source_user_message_id: sourceUserId },
        before_snapshot: null, preview_text: calc.previewText, warnings: calc.warnings, status: 'PENDING', requested_by_login_id: auth.session.loginId,
        requested_by_role: auth.session.role, source_client_id: `moni-mobile:${threadId}`, expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).select('id,status,preview_text,warnings,expires_at').single()
      if (result.error) throw new Error(result.error.message)
      return NextResponse.json({ ok: true, confirmation: result.data })
    }

    if (command === 'execute') {
      const confirmationId = text(body.confirmation_id, 80)
      if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
      const db = createMoniServiceRoleClient()
      const current = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('action_domain', 'mobile_purchase_authoritative_v3').eq('requested_by_login_id', auth.session.loginId).eq('source_client_id', `moni-mobile:${threadId}`).maybeSingle()
      if (current.error || !current.data) throw new Error('승인 요청을 찾을 수 없습니다.')
      if (current.data.status === 'EXECUTED') return NextResponse.json({ ok: true, result: current.data.result_snapshot || { verified: true, duplicate_safe: true } })
      if (current.data.status !== 'PENDING') throw new Error(`현재 승인 상태(${current.data.status})에서는 실행할 수 없습니다.`)
      if (new Date(current.data.expires_at).getTime() < Date.now()) throw new Error('승인 시간이 만료되었습니다. 매입 입력을 다시 확인해 주세요.')

      const live = await calculate(current.data.payload?.input_snapshot || {})
      if (text(current.data.payload?.pricing_fingerprint, 4000) !== live.fingerprint) throw new Error('확인 후 마스터 단가·세금·지급조건이 변경되었습니다. 실제 저장 전에 매입 미리보기를 다시 확인해 주세요.')

      const claim = await db.from('moni_action_confirmations').update({ status: 'EXECUTING', user_confirmation_text: '모바일 매입 카드 최종 확정' }).eq('id', confirmationId).eq('status', 'PENDING').select('*').maybeSingle()
      if (claim.error || !claim.data) throw new Error('다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.')
      try {
        const a = live.authoritative
        const result = await internalJson(request, '/api/moni/purchases', {
          action: 'create_purchase', supplier_id: a.supplier_id, purchase_date: a.purchase_date, receipt_date: a.receipt_date,
          purchase_category: a.purchase_category, material_id: a.material_id, quantity: a.quantity, unit: a.unit, due_date: a.due_date,
          planned_payment_method: a.planned_payment_method, planned_payment_account: a.planned_payment_account,
          planned_card_name: a.planned_card_name, planned_installment_months: a.planned_installment_months,
          tax_invoice_status: a.tax_invoice_status, tax_invoice_amount: a.tax_invoice_amount, notes: a.notes,
        })
        const purchase = result.purchase || {}
        const exactMatch = sameSavedPurchase(purchase, a)
        const snapshot = {
          verified: exactMatch,
          verification_basis: exactMatch ? 'PC_API_SUCCESS_AND_PREEXECUTION_MASTER_RECHECK_AND_POSTSAVE_MATCH' : 'PC_API_SAVED_BUT_POSTSAVE_MISMATCH',
          verification_warning: exactMatch ? null : '매입은 저장되었지만 저장 직후 금액·지급예정일이 최종 확인값과 달라졌습니다. PC 매입내역을 즉시 확인해 주세요.',
          domain: 'purchase', operation: 'CREATE', expected: a, result,
        }
        const done = await db.from('moni_action_confirmations').update({ status: 'EXECUTED', result_snapshot: snapshot, executed_at: new Date().toISOString(), error_message: null }).eq('id', confirmationId).eq('status', 'EXECUTING')
        if (done.error) throw new Error(done.error.message)
        await db.from('moni_action_audit_log').insert({
          confirmation_id: confirmationId, business_id: BUSINESS_ID, action_domain: 'mobile_purchase_authoritative_v3', action_type: 'CREATE', target_table: 'purchases',
          target_id: uuidLike(purchase.id) ? purchase.id : null, before_snapshot: null, after_snapshot: snapshot,
          actor_login_id: auth.session.loginId, actor_role: auth.session.role, source_client_id: `moni-mobile:${threadId}`, user_confirmation_text: '모바일 매입 카드 최종 확정',
        })
        return NextResponse.json({ ok: true, result: snapshot })
      } catch (error) {
        await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: error instanceof Error ? error.message : '매입 실행 실패' }).eq('id', confirmationId).eq('status', 'EXECUTING')
        throw error
      }
    }
    return NextResponse.json({ ok: false, error: '지원하지 않는 명령입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 매입 업무를 처리하지 못했습니다.' }, { status: 400 })
  }
}
