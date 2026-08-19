import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { GET as safeGET, POST as safePOST } from '@/app/api/moni/mobile-extended-actions-v2/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const won = (value: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(money(value))}원`
const kg = (grams: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(num(grams) / 1000)}kg`

function replay(request: NextRequest, raw: string) {
  return new NextRequest(request.url, { method: 'POST', headers: new Headers(request.headers), body: raw })
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function pcJson(request: NextRequest, path: string) {
  const headers = new Headers()
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(new URL(path, request.url), { headers, cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) throw new Error(payload.error || `업무 데이터를 불러오지 못했습니다. (${response.status})`)
  return payload
}

type LedgerMovement = {
  id: string
  product_id: string
  product_name?: string
  date: string
  type: 'INBOUND' | 'OUTBOUND'
  quantity_g: number
  source_kind?: string
}

async function finishedGoodsLedger(request: NextRequest) {
  const [base, adjustments, exports] = await Promise.all([
    pcJson(request, '/api/moni/finished-goods-inventory'),
    pcJson(request, `/api/moni/finished-goods-inventory-adjustments?_=${Date.now()}`),
    pcJson(request, '/api/moni/export-documents'),
  ])
  const inventory = Array.isArray(base.inventory) ? base.inventory : []
  const inventoryById = new Map(inventory.map((row: any) => [text(row.product_id), row]))
  const movements: LedgerMovement[] = (Array.isArray(base.movements) ? base.movements : []).map((row: any) => ({
    id: text(row.id), product_id: text(row.product_id), product_name: text(row.product_name), date: text(row.date, 10),
    type: text(row.type).toUpperCase() === 'INBOUND' ? 'INBOUND' : 'OUTBOUND', quantity_g: Math.abs(num(row.quantity_g)), source_kind: text(row.source_kind),
  }))
  const ids = new Set(movements.map((row) => row.id))

  for (const row of Array.isArray(adjustments.adjustments) ? adjustments.adjustments : []) {
    const delta = num(row.adjustment_g)
    const id = `zz-adjustment:${text(row.id)}`
    if (!delta || ids.has(id) || !inventoryById.has(text(row.product_id))) continue
    movements.push({ id, product_id: text(row.product_id), product_name: text(inventoryById.get(text(row.product_id))?.product_name), date: text(row.adjustment_date, 10), type: delta >= 0 ? 'INBOUND' : 'OUTBOUND', quantity_g: Math.abs(delta), source_kind: 'ADJUSTMENT' })
    ids.add(id)
  }

  for (const document of Array.isArray(exports.documents) ? exports.documents : []) {
    if (text(document.status).toUpperCase() !== 'SHIPPED') continue
    for (const item of Array.isArray(document.export_document_items) ? document.export_document_items : []) {
      const id = `export:${text(document.id)}:${text(item.id)}`
      if (ids.has(id)) continue
      const product = inventoryById.get(text(item.product_id))
      if (!product) continue
      const cartons = num(item.cartons)
      const unitsPerCarton = num(item.units_per_carton)
      const productWeightG = num(product.weight_g)
      const netPerCartonG = num(item.net_weight_per_carton_kg) * 1000
      const quantityG = productWeightG > 0 && unitsPerCarton > 0 ? cartons * unitsPerCarton * productWeightG : cartons * netPerCartonG
      if (!(quantityG > 0)) continue
      movements.push({ id, product_id: text(item.product_id), product_name: text(product.product_name), date: text(document.document_date, 10), type: 'OUTBOUND', quantity_g: quantityG, source_kind: 'EXPORT' })
      ids.add(id)
    }
  }

  movements.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return { inventory, movements }
}

function balanceAtDate(ledger: Awaited<ReturnType<typeof finishedGoodsLedger>>, productId: string, date: string) {
  return ledger.movements
    .filter((row) => row.product_id === productId && row.date <= date)
    .reduce((sum, row) => sum + (row.type === 'INBOUND' ? row.quantity_g : -row.quantity_g), 0)
}

function dueRuleLabel(row: Record<string, any>) {
  const type = text(row.payment_due_type)
  if (type === 'days_after_sale') return `판매일 + ${Math.round(num(row.payment_due_days))}일`
  if (type === 'next_month_day') return `익월 ${Math.round(num(row.payment_due_day) || 1)}일`
  return '자동 계산 안 함'
}

function receiptMethodLabel(value: unknown) {
  const method = text(value).toLowerCase()
  return method === 'bank' ? '계좌입금' : method === 'cash' ? '현금' : method === 'card' ? '카드' : '기타'
}

type FinancialEffect = Record<string, any>

async function buildFinancialEffect(request: NextRequest, domain: string, operation: string, fields: Record<string, any>): Promise<{ effect: FinancialEffect; preview: string; warnings: string[]; fieldPatch?: Record<string, any> }> {
  if (domain === 'finished_goods_adjustment') {
    const ledger = await finishedGoodsLedger(request)
    const productId = text(fields.product_id, 200)
    const date = text(fields.adjustment_date, 10)
    const product = ledger.inventory.find((row: any) => text(row.product_id) === productId)
    if (!product || !productId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('완제품과 조정일을 다시 확인해 주세요.')
    const beforeG = balanceAtDate(ledger, productId, date)
    const targetG = text(fields.input_unit).toLowerCase() === 'kg' ? num(fields.input_quantity) * 1000 : num(fields.input_quantity)
    const deltaG = targetG - beforeG
    if (targetG < 0) throw new Error('조정 후 재고는 0 이상이어야 합니다.')
    if (Math.abs(deltaG) < 0.0001) throw new Error('현재 재고와 동일하여 조정할 수량이 없습니다.')
    const effect = { kind: 'FINISHED_GOODS_ADJUST', product_id: productId, product_name: text(product.product_name), adjustment_date: date, balance_before_g: beforeG, target_stock_g: targetG, adjustment_g: deltaG }
    return {
      effect,
      fieldPatch: { balance_before_g: beforeG },
      warnings: [],
      preview: [
        '[완제품 재고조정]',
        `제품: ${effect.product_name}`,
        `조정일: ${date}`,
        `현재 재고: ${kg(beforeG)}`,
        `조정 후 재고: ${kg(targetG)}`,
        `증감량: ${deltaG >= 0 ? '+' : ''}${kg(deltaG)}`,
        `사유: ${text(fields.reason) || '미입력'}`,
        '※ 현재 재고에는 기존 재고조정 이력과 SHIPPED 수출 출고가 함께 반영됩니다.',
      ].join('\n'),
    }
  }

  const receivables = await pcJson(request, '/api/moni/receivables')
  const orders = Array.isArray(receivables.orders) ? receivables.orders : []
  const receipts = Array.isArray(receivables.receipts) ? receivables.receipts : []
  const clients = Array.isArray(receivables.clients) ? receivables.clients : []

  if (operation === 'RECEIVE') {
    const order = orders.find((row: any) => text(row.id) === text(fields.order_id))
    if (!order) throw new Error('입금 대상 판매건을 찾을 수 없습니다.')
    const amount = money(fields.amount)
    const outstandingBefore = money(order.outstanding_amount)
    if (amount <= 0) throw new Error('입금액은 0원보다 커야 합니다.')
    if (amount > outstandingBefore + 0.009) throw new Error(`남은 미수금 ${Math.round(outstandingBefore).toLocaleString('ko-KR')}원을 초과해 입금할 수 없습니다.`)
    const effect = { kind: 'RECEIVE', order_id: text(order.id), statement_number: text(order.statement_number), client_name: text(order.client_name), total_amount: money(order.total_amount), received_before: money(order.received_amount), outstanding_before: outstandingBefore, amount, outstanding_after: money(outstandingBefore - amount), receipt_date: text(fields.receipt_date), method: text(fields.method) }
    return { effect, warnings: order.unverified_partial ? ['기존 판매건이 legacy partial 상태입니다. 실제 입금기록 기준 수금액을 반드시 확인해 주세요.'] : [], preview: [
      '[수금 등록]',
      `거래명세번호: ${effect.statement_number || effect.order_id}`,
      `거래처: ${effect.client_name}`,
      `판매 합계: ${won(effect.total_amount)}`,
      `현재 입금: ${won(effect.received_before)}`,
      `현재 미수: ${won(effect.outstanding_before)}`,
      `이번 입금: ${won(effect.amount)}`,
      `입금 후 미수: ${won(effect.outstanding_after)}`,
      `입금일: ${effect.receipt_date}`,
      `입금방법: ${receiptMethodLabel(effect.method)}`,
    ].join('\n') }
  }

  if (operation === 'REVERSE') {
    const receipt = receipts.find((row: any) => text(row.id) === text(fields.receipt_id))
    if (!receipt) throw new Error('취소할 입금기록을 찾을 수 없습니다.')
    if (text(receipt.status) !== 'posted') throw new Error('이미 취소되었거나 유효하지 않은 입금기록입니다.')
    const order = orders.find((row: any) => text(row.id) === text(receipt.order_id))
    if (!order) throw new Error('입금기록의 판매건을 찾을 수 없습니다.')
    const amount = money(receipt.amount)
    const outstandingBefore = money(order.outstanding_amount)
    const effect = { kind: 'REVERSE', receipt_id: text(receipt.id), receipt_status: text(receipt.status), order_id: text(order.id), statement_number: text(order.statement_number), client_name: text(order.client_name), receipt_date: text(receipt.receipt_date), amount, outstanding_before: outstandingBefore, outstanding_after: Math.min(money(order.total_amount), money(outstandingBefore + amount)), reference_no: text(receipt.reference_no) }
    return { effect, warnings: [], preview: [
      '[입금기록 취소]',
      `거래명세번호: ${effect.statement_number || effect.order_id}`,
      `거래처: ${effect.client_name}`,
      `취소할 입금: ${won(effect.amount)} · ${effect.receipt_date}`,
      `현재 미수: ${won(effect.outstanding_before)}`,
      `취소 후 미수: ${won(effect.outstanding_after)}`,
      `취소 사유: ${text(fields.reversal_reason)}`,
    ].join('\n') }
  }

  if (operation === 'SET_DUE') {
    const order = orders.find((row: any) => text(row.id) === text(fields.order_id))
    if (!order) throw new Error('입금예정일을 변경할 판매건을 찾을 수 없습니다.')
    const effect = { kind: 'SET_DUE', order_id: text(order.id), statement_number: text(order.statement_number), client_name: text(order.client_name), due_date_before: text(order.due_date), due_date_after: text(fields.due_date), outstanding_amount: money(order.outstanding_amount) }
    return { effect, warnings: [], preview: [
      '[입금예정일 변경]',
      `거래명세번호: ${effect.statement_number || effect.order_id}`,
      `거래처: ${effect.client_name}`,
      `현재 미수: ${won(effect.outstanding_amount)}`,
      `기존 예정일: ${effect.due_date_before || '미설정'}`,
      `변경 예정일: ${effect.due_date_after || '미설정'}`,
    ].join('\n') }
  }

  if (operation === 'SET_RULE') {
    const client = clients.find((row: any) => text(row.id) === text(fields.client_id))
    if (!client) throw new Error('수금조건을 변경할 거래처를 찾을 수 없습니다.')
    const effect = { kind: 'SET_RULE', client_id: text(client.id), client_name: text(client.company_name), before: { payment_due_type: text(client.payment_due_type), payment_due_days: client.payment_due_days ?? null, payment_due_day: client.payment_due_day ?? null }, after: { payment_due_type: text(fields.payment_due_type), payment_due_days: num(fields.payment_due_days), payment_due_day: num(fields.payment_due_day) } }
    const nextLabel = effect.after.payment_due_type === 'days_after_sale' ? `판매일 + ${effect.after.payment_due_days}일` : effect.after.payment_due_type === 'next_month_day' ? `익월 ${effect.after.payment_due_day}일` : '자동 계산 안 함'
    return { effect, warnings: [], preview: [
      '[거래처 수금조건 변경]',
      `거래처: ${effect.client_name}`,
      `기존 조건: ${dueRuleLabel(client)}`,
      `변경 조건: ${nextLabel}`,
    ].join('\n') }
  }

  throw new Error('지원하지 않는 수금·재고조정 확인 작업입니다.')
}

function sameNumber(a: unknown, b: unknown) { return Math.abs(num(a) - num(b)) < 0.0001 }
function stableJson(value: unknown) { return JSON.stringify(value ?? null) }

async function recheckFinancialEffect(request: NextRequest, effect: FinancialEffect) {
  if (effect.kind === 'FINISHED_GOODS_ADJUST') {
    const ledger = await finishedGoodsLedger(request)
    const current = balanceAtDate(ledger, text(effect.product_id), text(effect.adjustment_date, 10))
    if (!sameNumber(current, effect.balance_before_g)) throw new Error(`확인 후 완제품 재고가 ${kg(effect.balance_before_g)}에서 ${kg(current)}로 변경되었습니다. 재고조정 미리보기를 다시 확인해 주세요.`)
    return
  }

  const receivables = await pcJson(request, '/api/moni/receivables')
  const orders = Array.isArray(receivables.orders) ? receivables.orders : []
  const receipts = Array.isArray(receivables.receipts) ? receivables.receipts : []
  const clients = Array.isArray(receivables.clients) ? receivables.clients : []

  if (effect.kind === 'RECEIVE') {
    const order = orders.find((row: any) => text(row.id) === text(effect.order_id))
    if (!order || !sameNumber(order.outstanding_amount, effect.outstanding_before) || !sameNumber(order.received_amount, effect.received_before)) throw new Error('확인 후 해당 판매건의 입금·미수 상태가 변경되었습니다. 수금 미리보기를 다시 확인해 주세요.')
    return
  }
  if (effect.kind === 'REVERSE') {
    const receipt = receipts.find((row: any) => text(row.id) === text(effect.receipt_id))
    const order = orders.find((row: any) => text(row.id) === text(effect.order_id))
    if (!receipt || text(receipt.status) !== effect.receipt_status || !sameNumber(receipt.amount, effect.amount) || !order || !sameNumber(order.outstanding_amount, effect.outstanding_before)) throw new Error('확인 후 입금기록 또는 미수 상태가 변경되었습니다. 취소 미리보기를 다시 확인해 주세요.')
    return
  }
  if (effect.kind === 'SET_DUE') {
    const order = orders.find((row: any) => text(row.id) === text(effect.order_id))
    if (!order || text(order.due_date) !== text(effect.due_date_before)) throw new Error('확인 후 입금예정일이 변경되었습니다. 미리보기를 다시 확인해 주세요.')
    return
  }
  if (effect.kind === 'SET_RULE') {
    const client = clients.find((row: any) => text(row.id) === text(effect.client_id))
    const before = client ? { payment_due_type: text(client.payment_due_type), payment_due_days: client.payment_due_days ?? null, payment_due_day: client.payment_due_day ?? null } : null
    if (!client || stableJson(before) !== stableJson(effect.before)) throw new Error('확인 후 거래처 수금조건이 변경되었습니다. 미리보기를 다시 확인해 주세요.')
  }
}

async function enhanceConfirmation(request: NextRequest, session: any, confirmationId: string) {
  const db = createMoniServiceRoleClient()
  const current = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('requested_by_login_id', session.loginId).maybeSingle()
  if (current.error || !current.data) throw new Error('승인 요청을 다시 찾지 못했습니다.')
  const domain = text(current.data.payload?.domain, 80)
  const operation = text(current.data.payload?.semantic_operation, 40)
  if (domain !== 'finished_goods_adjustment' && domain !== 'receivable') return { id: current.data.id, status: current.data.status, preview_text: current.data.preview_text, warnings: current.data.warnings || [], expires_at: current.data.expires_at }
  try {
    const fields = current.data.payload?.fields && typeof current.data.payload.fields === 'object' ? { ...current.data.payload.fields } : {}
    const built = await buildFinancialEffect(request, domain, operation, fields)
    const nextFields = { ...fields, ...(built.fieldPatch || {}) }
    const nextPayload = { ...current.data.payload, fields: nextFields, financial_effect: built.effect }
    const warnings = [...(Array.isArray(current.data.warnings) ? current.data.warnings : []), ...built.warnings]
    const updated = await db.from('moni_action_confirmations').update({ payload: nextPayload, preview_text: built.preview, warnings }).eq('id', confirmationId).eq('status', 'PENDING').select('id,status,preview_text,warnings,expires_at').single()
    if (updated.error) throw new Error(updated.error.message)
    return updated.data
  } catch (error) {
    await db.from('moni_action_confirmations').update({ status: 'CANCELLED', error_message: error instanceof Error ? error.message : '업무효과 미리보기 생성 실패' }).eq('id', confirmationId).eq('status', 'PENDING')
    throw error
  }
}

export async function GET(request: NextRequest) {
  return safeGET(request)
}

export async function POST(request: NextRequest) {
  const raw = await request.text()
  let body: Record<string, any>
  try { body = JSON.parse(raw) } catch { return safePOST(replay(request, raw)) }
  const command = text(body.command, 20).toLowerCase()

  if (command === 'prepare' && (body.domain === 'receivable' || body.domain === 'finished_goods_adjustment')) {
    const auth = await requireAdmin(request)
    if (auth.response || !auth.session) return auth.response!
    const baseResponse = await safePOST(replay(request, raw))
    const basePayload = await baseResponse.clone().json().catch(() => ({}))
    if (!baseResponse.ok || !basePayload.ok) return baseResponse
    try {
      const confirmationId = text(basePayload.confirmation?.id || basePayload.confirmation?.confirmation_id, 80)
      if (!uuidLike(confirmationId)) throw new Error('생성된 승인번호를 확인하지 못했습니다.')
      const confirmation = await enhanceConfirmation(request, auth.session, confirmationId)
      return NextResponse.json({ ok: true, confirmation }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '업무효과 미리보기를 만들지 못했습니다.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
  }

  if (command === 'execute') {
    const auth = await requireAdmin(request)
    if (auth.response || !auth.session) return auth.response!
    const confirmationId = text(body.confirmation_id, 80)
    if (uuidLike(confirmationId)) {
      const db = createMoniServiceRoleClient()
      const current = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('requested_by_login_id', auth.session.loginId).maybeSingle()
      if (current.error) return NextResponse.json({ ok: false, error: current.error.message }, { status: 400 })
      const effect = current.data?.payload?.financial_effect
      if (effect && (current.data?.status === 'PENDING')) {
        try { await recheckFinancialEffect(request, effect) }
        catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '확인 후 업무값이 변경되었습니다.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } }) }
      }
    }
  }

  return safePOST(replay(request, raw))
}
