import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'
import { extractMobileSalesExportContext, type MobileSalesExportContext } from '@/lib/moni/mobile-sales-export-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const ACTION_DOMAIN = 'mobile_sales_export_bundle'
const text = (value: unknown, max = 1200) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function normalize(value: unknown) {
  return text(value, 500).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

function validDate(value: unknown) {
  const raw = text(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const parsed = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 수출 문서 업무를 실행할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function loadThreadContext(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).in('role', ['user', 'assistant']).order('created_at', { ascending: false }).limit(24)
  if (messages.error) throw new Error(messages.error.message)
  const history = [...(messages.data ?? [])].reverse()
  const currentUser = [...history].reverse().find((row: any) => row.role === 'user') || null
  return { history, currentUser }
}

async function metadata() {
  const db = createMoniServiceRoleClient()
  const [destinations, settings] = await Promise.all([
    db.from('export_destinations').select('id,company_name,address,contact_name,phone,zip_code,country,sales_client_id').order('company_name'),
    db.from('export_product_settings').select('id,product_id,english_name,hs_code,default_unit_price,currency,units_per_carton,net_weight_kg,gross_weight_kg,cbm,is_active,products!inner(id,product_name,product_code,product_spec,weight_g,is_active)').eq('is_active', true).order('english_name'),
  ])
  if (destinations.error) throw new Error(destinations.error.message)
  if (settings.error) throw new Error(settings.error.message)
  return { destinations: destinations.data ?? [], export_products: settings.data ?? [] }
}

function productSnapshot(setting: any) {
  return Array.isArray(setting?.products) ? setting.products[0] : setting?.products
}

function destinationMatch(query: string, destinations: any[]) {
  const needle = normalize(query)
  if (!needle) return null
  const matches = destinations.filter((row: any) => {
    const company = normalize(row.company_name)
    const country = normalize(row.country)
    const combined = `${company}${country}`
    return needle === company || needle === combined || (company && needle.includes(company) && (!country || needle.includes(country)))
  })
  return matches.length === 1 ? matches[0] : null
}

function exactExportProduct(query: string, specification: string | undefined, settings: any[]) {
  const needle = normalize(query)
  const spec = normalize(specification)
  if (!needle) return null
  const matches = settings.filter((setting: any) => {
    const product = productSnapshot(setting)
    const names = [product?.product_name, product?.product_code, setting?.english_name].map(normalize).filter(Boolean)
    if (!names.includes(needle)) return false
    if (!spec) return true
    const canonicalSpec = normalize(product?.product_spec)
    return Boolean(canonicalSpec) && (canonicalSpec === spec || canonicalSpec.includes(spec) || spec.includes(canonicalSpec))
  })
  return matches.length === 1 ? matches[0] : null
}

function productSuggestions(query: string, settings: any[]) {
  const needle = normalize(query)
  if (!needle) return []
  return settings.filter((setting: any) => {
    const product = productSnapshot(setting)
    const haystack = normalize(`${product?.product_name || ''}${product?.product_code || ''}${product?.product_spec || ''}${setting?.english_name || ''}`)
    return haystack.includes(needle) || needle.includes(normalize(product?.product_name))
  }).slice(0, 6).map((setting: any) => ({
    id: text(setting.id, 120),
    label: text(productSnapshot(setting)?.product_name || setting.english_name, 220),
    sub: [text(productSnapshot(setting)?.product_spec, 160), text(setting.english_name, 180), `${text(setting.currency, 10)} ${money(setting.default_unit_price)}`].filter(Boolean).join(' · '),
  }))
}

function inferredCartons(item: any, setting: any) {
  const explicit = Math.trunc(num(item.cartons))
  if (explicit > 0) return explicit
  const quantity = num(item.quantity)
  if (quantity <= 0) return 0
  const unit = text(item.unit, 30).toUpperCase()
  if (unit === 'CTN' || unit === 'BOX') return Number.isInteger(quantity) ? quantity : 0
  if (unit === 'EA') {
    const unitsPerCarton = num(setting?.units_per_carton)
    if (unitsPerCarton <= 0) return 0
    const ratio = quantity / unitsPerCarton
    return Math.abs(ratio - Math.round(ratio)) < 0.000001 && ratio >= 1 ? Math.round(ratio) : 0
  }
  if (unit === 'KG') {
    const kgPerCarton = num(setting?.net_weight_kg)
    if (kgPerCarton <= 0) return 0
    const ratio = quantity / kgPerCarton
    return Math.abs(ratio - Math.round(ratio)) < 0.000001 && ratio >= 1 ? Math.round(ratio) : 0
  }
  return 0
}

function hydrateContext(extracted: MobileSalesExportContext, meta: Awaited<ReturnType<typeof metadata>>) {
  const consignee = destinationMatch(text(extracted.consignee_query, 240), meta.destinations)
  const missing: string[] = []
  const unresolved: any[] = []
  if (!consignee) missing.push(extracted.consignee_query ? `수출처 “${extracted.consignee_query}”를 등록된 수출처와 정확히 매칭` : '수출처(Consignee)')
  else if (!text(consignee.sales_client_id, 120)) missing.push(`수출처 “${text(consignee.company_name, 220)}”의 판매관리 매출처 연결`)

  const items = extracted.items.map((row, index) => {
    const setting = exactExportProduct(row.name, row.specification, meta.export_products)
    if (!setting) {
      unresolved.push({ index, query: row.name, specification: row.specification || '', quantity: row.quantity ?? null, unit: row.unit || '', suggestions: productSuggestions(row.name, meta.export_products) })
      missing.push(`${index + 1}번째 품목 “${row.name}”의 공식 수출품목 매칭`)
      return { source_query: row.name, source_specification: row.specification || '', source_quantity: row.quantity ?? '', source_unit: row.unit || '', export_product_setting_id: '', cartons: row.cartons || '', unit_price: row.unit_price ?? '' }
    }
    const cartons = inferredCartons(row, setting)
    if (cartons <= 0) missing.push(`${index + 1}번째 ${row.name}의 CTN 수량 또는 포장단위 확인`)
    const defaultPrice = money(setting.default_unit_price)
    const requestedPrice = row.unit_price === null || row.unit_price === undefined ? defaultPrice : money(row.unit_price)
    return {
      source_query: row.name,
      source_specification: row.specification || '',
      source_quantity: row.quantity ?? '',
      source_unit: row.unit || '',
      export_product_setting_id: text(setting.id, 120),
      cartons: cartons || '',
      unit_price: requestedPrice,
      price_overridden: row.unit_price !== null && row.unit_price !== undefined && requestedPrice !== defaultPrice,
      price_override_reason: row.unit_price !== null && row.unit_price !== undefined && requestedPrice !== defaultPrice ? '사용자 대화에서 명시한 단가' : '',
    }
  })

  if (!items.length) missing.push('수출 품목과 수량')

  return {
    fields: {
      document_date: validDate(extracted.document_date) ? extracted.document_date : today(),
      consignee_id: text(consignee?.id, 120),
      bill_to: extracted.bill_to || 'SAME AS CONSIGNEE',
      port_of_loading: extracted.port_of_loading || '',
      final_destination: extracted.final_destination || text(consignee?.country, 160),
      vessel_flight: extracted.vessel_flight || '',
      sailing_date: validDate(extracted.sailing_date) ? extracted.sailing_date : '',
      notify_party: extracted.notify_party || '',
      terms_delivery_payment: extracted.terms_delivery_payment || '',
      incoterm: extracted.incoterm || '',
      country_of_origin: extracted.country_of_origin || 'Republic of Korea',
      reason_for_export: extracted.reason_for_export || 'We ship the product for sale',
      status: 'GENERATED',
      items,
    },
    missing: [...new Set(missing)],
    unresolved,
  }
}

async function draftCard(threadId: string, sourceUserId: string, currentMessage: string, history: any[]) {
  const meta = await metadata()
  const extracted = await extractMobileSalesExportContext({ currentMessage, history: history.map((row: any) => ({ role: row.role, content: row.content })) })
  const hydrated = hydrateContext(extracted, meta)
  return {
    stage: 'draft',
    domain: 'sales_export_bundle',
    operation: 'CREATE',
    source_user_message_id: sourceUserId,
    fields: hydrated.fields,
    missing_fields: hydrated.missing,
    unresolved_items: hydrated.unresolved,
    extracted_context: extracted,
    options: {
      destinations: meta.destinations.map((row: any) => ({ id: text(row.id, 120), label: text(row.company_name, 220), sub: [text(row.country, 100), text(row.address, 200)].filter(Boolean).join(' · '), sales_client_id: text(row.sales_client_id, 120) })),
      export_products: meta.export_products.map((row: any) => ({ id: text(row.id, 120), label: text(productSnapshot(row)?.product_name || row.english_name, 220), sub: [text(productSnapshot(row)?.product_spec, 160), text(row.english_name, 180), `${text(row.currency, 10)} ${money(row.default_unit_price)}`, `${Math.trunc(num(row.units_per_carton))} EA/CTN`, `${num(row.net_weight_kg)}kg/CTN`].filter(Boolean).join(' · '), meta: row })),
    },
  }
}

function canonicalPayload(fields: Record<string, any>, meta: Awaited<ReturnType<typeof metadata>>) {
  const destination = meta.destinations.find((row: any) => text(row.id) === text(fields.consignee_id))
  if (!destination) throw new Error('수출처(Consignee)를 선택해 주세요.')
  if (!text(destination.sales_client_id, 120)) throw new Error('선택한 수출처가 판매관리 매출처와 연결되지 않았습니다. PC 수출처 관리에서 매출처 연결을 먼저 설정해 주세요.')
  if (!validDate(fields.document_date)) throw new Error('문서 날짜를 확인해 주세요.')
  const rawItems = Array.isArray(fields.items) ? fields.items : []
  if (!rawItems.length) throw new Error('수출 품목을 한 개 이상 입력해 주세요.')

  const items = rawItems.map((row: any, index: number) => {
    const setting = meta.export_products.find((item: any) => text(item.id) === text(row.export_product_setting_id))
    if (!setting) throw new Error(`${index + 1}번째 품목의 공식 수출품목을 선택해 주세요.`)
    const cartons = Math.trunc(num(row.cartons))
    if (cartons < 1) throw new Error(`${index + 1}번째 품목의 CTN 수량을 1 이상 입력해 주세요.`)
    const defaultPrice = money(setting.default_unit_price)
    const requestedPrice = row.unit_price === '' || row.unit_price === null || row.unit_price === undefined ? defaultPrice : money(row.unit_price)
    if (requestedPrice < 0) throw new Error(`${index + 1}번째 품목 단가를 확인해 주세요.`)
    const overridden = requestedPrice !== defaultPrice
    return {
      export_product_setting_id: text(setting.id, 120),
      cartons,
      unit_price: requestedPrice,
      price_overridden: overridden,
      price_override_reason: overridden ? text(row.price_override_reason, 240) || '사용자 확인 단가' : '',
      product_name_ko: text(productSnapshot(setting)?.product_name, 220),
      product_name_en: text(setting.english_name, 220),
      currency: text(setting.currency, 10).toUpperCase(),
      units_per_carton: Math.trunc(num(setting.units_per_carton)),
      net_weight_kg: num(setting.net_weight_kg),
      gross_weight_kg: num(setting.gross_weight_kg),
    }
  })

  const currencies = [...new Set(items.map((row: any) => row.currency).filter(Boolean))]
  if (currencies.length !== 1) throw new Error('거래명세표 자동연결을 위해 모든 수출품목 통화를 하나로 통일해 주세요.')

  const exportPayload = {
    document_date: text(fields.document_date, 10),
    consignee_id: text(destination.id, 120),
    bill_to: text(fields.bill_to, 300) || 'SAME AS CONSIGNEE',
    port_of_loading: text(fields.port_of_loading, 160),
    final_destination: text(fields.final_destination, 160),
    vessel_flight: text(fields.vessel_flight, 160),
    sailing_date: validDate(fields.sailing_date) ? text(fields.sailing_date, 10) : '',
    notify_party: text(fields.notify_party, 300),
    terms_delivery_payment: text(fields.terms_delivery_payment, 300),
    incoterm: text(fields.incoterm, 40).toUpperCase(),
    country_of_origin: text(fields.country_of_origin, 120) || 'Republic of Korea',
    reason_for_export: text(fields.reason_for_export, 240) || 'We ship the product for sale',
    status: 'GENERATED',
    items: items.map((row: any) => ({ export_product_setting_id: row.export_product_setting_id, cartons: row.cartons, unit_price: row.unit_price, price_overridden: row.price_overridden, price_override_reason: row.price_override_reason })),
  }

  return { exportPayload, destination, items, currency: currencies[0] }
}

function previewText(payload: ReturnType<typeof canonicalPayload>) {
  const total = payload.items.reduce((sum: number, row: any) => sum + row.cartons * row.unit_price, 0)
  const rows = payload.items.map((row: any, index: number) => `${index + 1}. ${row.product_name_ko} / ${row.product_name_en} · ${row.cartons} CTN · ${row.currency} ${money(row.unit_price)} / CTN`).join('\n')
  return `[수출 문서 번들 최종 확인]\n문서일: ${payload.exportPayload.document_date}\n수출처: ${text(payload.destination.company_name)} (${text(payload.destination.country) || '국가 미등록'})\n${rows}\n총 공급가액: ${payload.currency} ${money(total)}\n부가세: 0% (수출 판매 동기화)\n\n승인 후 한 번의 실행으로 Commercial Invoice + Packing List를 생성하고 같은 수출건을 판매관리와 동기화하여 거래명세번호까지 생성합니다.`
}

async function createConfirmation(input: { session: any; threadId: string; sourceUserId: string; canonical: ReturnType<typeof canonicalPayload> }) {
  const db = createMoniServiceRoleClient()
  const existing = await db.from('moni_action_confirmations').select('*').eq('business_id', BUSINESS_ID).eq('requested_by_login_id', input.session.loginId).eq('source_client_id', `moni-mobile:${input.threadId}`).eq('action_domain', ACTION_DOMAIN).order('created_at', { ascending: false }).limit(20)
  if (existing.error) throw new Error(existing.error.message)
  const duplicate = (existing.data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 100) === input.sourceUserId && ['PENDING', 'EXECUTING', 'EXECUTED'].includes(text(row.status, 30)))
  if (duplicate) return duplicate

  const result = await db.from('moni_action_confirmations').insert({
    business_id: BUSINESS_ID,
    action_domain: ACTION_DOMAIN,
    action_type: 'CREATE',
    target_id: null,
    payload: { semantic_operation: 'CREATE', source_user_message_id: input.sourceUserId, export_payload: input.canonical.exportPayload, canonical_items: input.canonical.items, destination_snapshot: input.canonical.destination },
    before_snapshot: null,
    preview_text: previewText(input.canonical),
    warnings: ['수출 document가 Source of Truth이며, 승인 후 같은 document를 판매관리로 동기화합니다. 별도 중복 매출을 생성하지 않습니다.'],
    status: 'PENDING',
    requested_by_login_id: input.session.loginId,
    requested_by_role: input.session.role,
    source_client_id: `moni-mobile:${input.threadId}`,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }).select('*').single()
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

async function rollbackBundle(request: NextRequest, documentId: string) {
  try { await internalJson(request, '/api/moni/export-sales-sync', { method: 'POST', body: JSON.stringify({ id: documentId, action: 'DELETE' }) }) } catch { /* best effort */ }
  try {
    const headers = new Headers()
    const cookie = request.headers.get('cookie')
    if (cookie) headers.set('cookie', cookie)
    await fetch(new URL(`/api/moni/export-documents?id=${encodeURIComponent(documentId)}`, request.url), { method: 'DELETE', headers, cache: 'no-store' })
  } catch { /* best effort */ }
}

async function executeBundle(request: NextRequest, session: any, threadId: string, confirmation: any) {
  const db = createMoniServiceRoleClient()
  const lock = await db.from('moni_action_confirmations').update({ status: 'EXECUTING', user_confirmation_text: '모바일 수출 문서 번들 최종 확정' }).eq('id', confirmation.id).eq('status', 'PENDING').select('*').maybeSingle()
  if (lock.error) throw new Error(lock.error.message)
  if (!lock.data) throw new Error('다른 실행이 이미 이 승인 건을 처리 중입니다. 중복 실행하지 않습니다.')

  let documentId = ''
  try {
    const created = await internalJson(request, '/api/moni/export-documents', { method: 'POST', body: JSON.stringify(lock.data.payload?.export_payload || {}) })
    documentId = text(created.document?.id, 160)
    if (!documentId) throw new Error('생성된 수출 document ID를 확인하지 못했습니다.')
    const sync = await internalJson(request, '/api/moni/export-sales-sync', { method: 'POST', body: JSON.stringify({ id: documentId, action: 'SYNC' }) })
    const orderId = text(sync.sales_order_id, 120)
    const snapshot = {
      verified: true,
      verification_basis: 'EXPORT_DOCUMENT_CREATE_AND_SALES_SYNC_SUCCESS',
      domain: 'sales_export_bundle',
      operation: 'CREATE',
      result: {
        document: created.document,
        sales_order_id: orderId,
        statement_number: text(sync.statement_number, 100),
        statement_url: `/sales-management/export/documents/${encodeURIComponent(documentId)}/statement`,
        invoice_url: `/sales-management/export/documents/${encodeURIComponent(documentId)}/print?type=invoice`,
        packing_list_url: `/sales-management/export/documents/${encodeURIComponent(documentId)}/print?type=packing`,
        export_bundle_url: `/sales-management/export/documents/${encodeURIComponent(documentId)}/print`,
      },
    }
    const complete = await db.from('moni_action_confirmations').update({ status: 'EXECUTED', target_id: documentId, result_snapshot: snapshot, executed_at: new Date().toISOString(), error_message: null }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    if (complete.error) throw new Error(complete.error.message)
    await db.from('moni_action_audit_log').insert({ confirmation_id: confirmation.id, business_id: BUSINESS_ID, action_domain: ACTION_DOMAIN, action_type: 'CREATE', target_table: 'export_documents', target_id: documentId, before_snapshot: null, after_snapshot: snapshot, actor_login_id: session.loginId, actor_role: session.role, source_client_id: `moni-mobile:${threadId}`, user_confirmation_text: '모바일 수출 문서 번들 최종 확정' })
    return snapshot
  } catch (error) {
    if (documentId) await rollbackBundle(request, documentId)
    await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: error instanceof Error ? error.message : '수출 문서 번들 실행 실패' }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    throw error
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (auth.response) return auth.response
    const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
    if (!threadId) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const context = await loadThreadContext(threadId, auth.session!.loginId)
    const currentUser = context.currentUser
    if (!currentUser) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const currentUserId = text(currentUser.id, 100)
    const intent = classifyMobileBusinessIntent(currentUser.content)
    if (!intent || intent.domain !== 'sales_export_bundle' || intent.operation !== 'CREATE') return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })

    const db = createMoniServiceRoleClient()
    const confirmations = await db.from('moni_action_confirmations').select('*').eq('business_id', BUSINESS_ID).eq('requested_by_login_id', auth.session!.loginId).eq('source_client_id', `moni-mobile:${threadId}`).eq('action_domain', ACTION_DOMAIN).order('created_at', { ascending: false }).limit(20)
    if (confirmations.error) throw new Error(confirmations.error.message)
    const confirmation = (confirmations.data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 100) === currentUserId)
    if (confirmation) {
      const status = text(confirmation.status, 30)
      const stage = status === 'PENDING' || status === 'EXECUTING' ? 'confirmation' : status === 'EXECUTED' ? 'completed' : status === 'FAILED' ? 'failed' : 'confirmation'
      return NextResponse.json({ ok: true, card: { stage, domain: 'sales_export_bundle', operation: 'CREATE', source_user_message_id: currentUserId, confirmation_id: confirmation.id, preview_text: confirmation.preview_text, warnings: confirmation.warnings || [], result: confirmation.result_snapshot, error: confirmation.error_message, busy: status === 'EXECUTING' } }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const card = await draftCard(threadId, currentUserId, text(currentUser.content, 6000), context.history)
    return NextResponse.json({ ok: true, card }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '대화 기반 수출 문서 준비에 실패했습니다.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (auth.response) return auth.response
    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const threadId = text(body.thread_id, 80)
    if (!threadId) throw new Error('현재 대화방을 확인할 수 없습니다.')
    const context = await loadThreadContext(threadId, auth.session!.loginId)
    if (!context.currentUser) throw new Error('현재 사용자 요청을 확인할 수 없습니다.')
    const sourceUserId = text(body.source_user_message_id, 100)
    if (!sourceUserId || sourceUserId !== text(context.currentUser.id, 100)) throw new Error('더 새로운 사용자 요청이 있습니다. 현재 요청 기준으로 다시 확인해 주세요.')
    const command = text(body.command, 30).toLowerCase()

    if (command === 'prepare') {
      const meta = await metadata()
      const canonical = canonicalPayload((body.fields || {}) as Record<string, any>, meta)
      const confirmation = await createConfirmation({ session: auth.session!, threadId, sourceUserId, canonical })
      return NextResponse.json({ ok: true, confirmation: { id: confirmation.id, confirmation_id: confirmation.id, status: confirmation.status, preview_text: confirmation.preview_text, warnings: confirmation.warnings || [], expires_at: confirmation.expires_at } }, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (command === 'execute') {
      const confirmationId = text(body.confirmation_id, 80)
      if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
      const db = createMoniServiceRoleClient()
      const confirmation = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('requested_by_login_id', auth.session!.loginId).eq('source_client_id', `moni-mobile:${threadId}`).eq('action_domain', ACTION_DOMAIN).maybeSingle()
      if (confirmation.error || !confirmation.data) throw new Error('승인 요청을 찾을 수 없습니다.')
      if (confirmation.data.status === 'EXECUTED') return NextResponse.json({ ok: true, result: confirmation.data.result_snapshot || { verified: true, duplicate_safe: true } })
      if (confirmation.data.status !== 'PENDING') throw new Error(`현재 승인 상태(${confirmation.data.status})에서는 실행할 수 없습니다.`)
      return NextResponse.json({ ok: true, result: await executeBundle(request, auth.session!, threadId, confirmation.data) }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 수출 문서 번들 명령입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '수출 문서 번들 업무를 처리하지 못했습니다.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
