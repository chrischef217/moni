import { createHash } from 'node:crypto'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

type Json = Record<string, any>
type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

export type MoniAgentPageContext = {
  pathname?: string
  search?: string
  title?: string
  headings?: string[]
}

export type MoniAgentSession = {
  loginId: string
  displayName?: string | null
  role: string
}

export type MoniAgentHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type MoniAgentToolContext = {
  supabase: SupabaseClient
  businessId: string
  threadId: string
  messageId: string
  page: MoniAgentPageContext
  session: MoniAgentSession
}

export type RunMoniAgentInput = {
  apiKey: string
  model: string
  history: MoniAgentHistoryMessage[]
  currentContent: Json[]
  context: MoniAgentToolContext
}

export type RunMoniAgentResult = {
  text: string
  agentRunId: string
  stepCount: number
  toolCallCount: number
  toolsUsed: string[]
  responseId?: string
}

const MAX_AGENT_STEPS = 8
const MAX_TOOL_ROWS = 100
const BUSINESS_IDS_WITH_LEGACY = ['20220523011', 'default']

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const bool = (value: unknown) => value === true || value === 'true'
const limit = (value: unknown, fallback = 30) => Math.max(1, Math.min(MAX_TOOL_ROWS, Math.trunc(num(value) || fallback)))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : ''

function dateInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function resolveRange(args: Json, fallbackDays = 30) {
  const today = dateInZone('Asia/Seoul')
  const endDate = validDate(args.end_date) || today
  const startDate = validDate(args.start_date) || addDays(endDate, -(fallbackDays - 1))
  if (startDate > endDate) return { startDate: endDate, endDate: startDate }
  return { startDate, endDate }
}

function jsonPreview(value: unknown, max = 8000) {
  const serialized = JSON.stringify(value)
  return serialized.length <= max ? serialized : `${serialized.slice(0, max)}…`
}

function extractOpenAIText(payload: Json) {
  if (typeof payload.output_text === 'string') return text(payload.output_text, 20000)
  const output = Array.isArray(payload.output) ? payload.output : []
  return output
    .flatMap((item: Json) => Array.isArray(item.content) ? item.content : [])
    .filter((item: Json) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item: Json) => item.text)
    .join('\n')
    .trim()
}

function normalizeEventType(value: unknown) {
  const allowed = new Set(['BUG', 'IMPROVEMENT', 'DATA_QUALITY', 'SECURITY', 'TOOL_FAILURE', 'CAPABILITY_GAP'])
  const normalized = text(value, 40).toUpperCase()
  return allowed.has(normalized) ? normalized : 'IMPROVEMENT'
}

function normalizeSeverity(value: unknown) {
  const allowed = new Set(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  const normalized = text(value, 20).toUpperCase()
  return allowed.has(normalized) ? normalized : 'MEDIUM'
}

function eventFingerprint(eventType: string, title: string, page: MoniAgentPageContext, evidence: Json) {
  const evidenceKey = text(evidence?.tool_name || evidence?.error_code || evidence?.table || evidence?.capability, 160)
  const raw = [eventType, title.toLowerCase().replace(/\s+/g, ' '), page.pathname || '', evidenceKey].join('|')
  return createHash('sha256').update(raw).digest('hex')
}

export async function reportMoniPmoEvent(
  context: MoniAgentToolContext & { agentRunId?: string },
  raw: Json,
) {
  const eventType = normalizeEventType(raw.event_type)
  const severity = normalizeSeverity(raw.severity)
  const title = text(raw.title, 180) || 'MONI Agent 검토 필요'
  const summary = text(raw.summary, 4000) || 'MONI Agent가 PMO 검토가 필요한 상황을 감지했습니다.'
  const evidence = raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {}
  const fingerprint = eventFingerprint(eventType, title, context.page, evidence)
  const now = new Date().toISOString()

  const { data: existing, error: readError } = await context.supabase
    .from('moni_ai_pmo_events')
    .select('id,status,occurrence_count')
    .eq('business_id', context.businessId)
    .eq('fingerprint', fingerprint)
    .maybeSingle()
  if (readError) throw new Error(readError.message)

  if (existing) {
    const nextStatus = existing.status === 'RESOLVED' || existing.status === 'DISMISSED' ? 'OPEN' : existing.status
    const { data, error } = await context.supabase
      .from('moni_ai_pmo_events')
      .update({
        thread_id: context.threadId || null,
        message_id: context.messageId || null,
        agent_run_id: context.agentRunId || null,
        event_type: eventType,
        severity,
        status: nextStatus,
        title,
        summary,
        page_context: context.page,
        evidence,
        occurrence_count: Number(existing.occurrence_count || 0) + 1,
        last_seen_at: now,
        updated_at: now,
        resolved_at: nextStatus === 'OPEN' ? null : undefined,
      })
      .eq('id', existing.id)
      .select('id,status,occurrence_count,last_seen_at')
      .single()
    if (error) throw new Error(error.message)
    return { ok: true, event: data, deduplicated: true }
  }

  const { data, error } = await context.supabase
    .from('moni_ai_pmo_events')
    .insert({
      business_id: context.businessId,
      thread_id: context.threadId || null,
      message_id: context.messageId || null,
      agent_run_id: context.agentRunId || null,
      event_type: eventType,
      severity,
      title,
      summary,
      fingerprint,
      page_context: context.page,
      evidence,
    })
    .select('id,status,occurrence_count,last_seen_at')
    .single()
  if (error) throw new Error(error.message)
  return { ok: true, event: data, deduplicated: false }
}

export const MONI_AGENT_TOOLS: Json[] = [
  {
    type: 'function',
    name: 'get_business_clock',
    description: '현재 기준일을 확인한다. 공장 업무 날짜는 Asia/Seoul, 사용자 참고 시간은 Asia/Bangkok을 함께 반환한다.',
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'get_company_context',
    description: 'MONI의 확정 의사결정, 운영 원칙, PMO 기준과 프로젝트 문맥을 검색한다. 업무 규칙이나 기존 결정 확인이 필요할 때 사용한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '찾을 주제 또는 핵심어. 비우면 우선순위가 높은 활성 문맥을 반환한다.' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_production_records',
    description: '기간·제품·상태 기준으로 생산 작업지시와 완료 실적을 조회하고 계획량, 완료량, 불량량, 샘플량을 집계한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD. 생략하면 종료일 포함 최근 30일.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD. 생략하면 공장 기준 오늘.' },
        product_query: { type: 'string', description: '제품명 또는 제품 ID 일부.' },
        status: { type: 'string', description: '예: 완료, planned, cancelled. 비우면 전체.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_production_plans',
    description: '기간·제품 기준 월간 생산계획을 조회한다. 생산실적과 계획을 비교할 때 사용한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        product_query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_raw_material_inventory',
    description: '원재료 마스터의 현재 재고, 포장중량, 기준 매입가격과 활성 상태를 조회한다. 임의의 부족 기준은 적용하지 않는다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        material_query: { type: 'string', description: '원재료명, 코드 또는 공급업체 일부.' },
        out_of_stock_only: { type: 'boolean', description: '0g 이하만 조회할지 여부.' },
        active_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_raw_material_transactions',
    description: '기간·원재료·입출고 유형 기준으로 원재료 입출고 원장을 조회하고 유형별 중량을 집계한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        material_query: { type: 'string' },
        transaction_type: { type: 'string', description: 'INBOUND 또는 OUTBOUND. 비우면 전체.' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_sales_and_receivables',
    description: '기간·거래처·제품 기준 판매명세, 입금, 미수금을 조회한다. 실제 판매와 수금자료를 연결해 미수잔액을 계산한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        client_query: { type: 'string' },
        product_query: { type: 'string' },
        outstanding_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_purchases_and_payables',
    description: '기간·매입처·품목 기준 실제 매입과 지급내역을 조회한다. 거래처 명세서 잔액은 실제 입고·매입과 분리해 별도 반환한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        supplier_query: { type: 'string' },
        item_query: { type: 'string' },
        outstanding_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_products_and_recipes',
    description: '제품 마스터, 레시피 비율, 원재료 매핑을 검색한다. 제품 구성과 원재료 연결을 확인할 때 사용한다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        product_query: { type: 'string' },
        active_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_agent_capabilities',
    description: '현재 MONI Agent가 사용할 수 있는 도구와 제한을 확인한다. 지원 여부를 추측하지 말고 확인할 때 사용한다.',
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    type: 'function',
    name: 'report_pmo_event',
    description: '재현 가능한 시스템 오류, 데이터 불일치, 보안위험, 기능 공백 또는 개선 필요사항을 GPT(PMO) 검토 큐에 구조화해 접수한다. 일반적인 데이터 없음은 접수하지 않는다.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        event_type: { type: 'string', enum: ['BUG', 'IMPROVEMENT', 'DATA_QUALITY', 'SECURITY', 'TOOL_FAILURE', 'CAPABILITY_GAP'] },
        severity: { type: 'string', enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        title: { type: 'string' },
        summary: { type: 'string' },
        evidence: { type: 'object', additionalProperties: true },
      },
      required: ['event_type', 'severity', 'title', 'summary'],
      additionalProperties: false,
    },
  },
]

async function toolGetCompanyContext(args: Json, context: MoniAgentToolContext) {
  const search = text(args.query, 200)
  let query = context.supabase
    .from('moni_ai_project_context')
    .select('context_key,title,content,priority,source_type,source_reference,updated_at')
    .eq('business_id', context.businessId)
    .eq('active', true)
    .order('priority', { ascending: false })
    .limit(Math.min(20, limit(args.limit, 10)))
  if (search) query = query.or(`title.ilike.%${search.replace(/[%_,()]/g, ' ')}%,content.ilike.%${search.replace(/[%_,()]/g, ' ')}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return { query: search || null, count: data?.length ?? 0, contexts: data ?? [] }
}

async function toolSearchProduction(args: Json, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args)
  const product = text(args.product_query, 160)
  const status = text(args.status, 80)
  let query = context.supabase
    .from('production_records')
    .select('id,lot_number,work_date,product_id,product_name,planned_quantity_g,actual_quantity_g,defect_quantity_g,sample_quantity_g,status,worker_name,inspection_result,note,production_unit_name,planned_quantity_ea,actual_quantity_ea')
    .in('business_id', BUSINESS_IDS_WITH_LEGACY)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: false })
    .limit(limit(args.limit, 100))
  if (product) query = query.or(`product_name.ilike.%${product.replace(/[%_,()]/g, ' ')}%,product_id.ilike.%${product.replace(/[%_,()]/g, ' ')}%`)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const byProduct = new Map<string, Json>()
  let planned = 0
  let actual = 0
  let defect = 0
  let sample = 0
  for (const row of rows) {
    planned += num(row.planned_quantity_g)
    actual += num(row.actual_quantity_g)
    defect += num(row.defect_quantity_g)
    sample += num(row.sample_quantity_g)
    const key = text(row.product_name, 200) || text(row.product_id, 100) || '미확인 제품'
    const current = byProduct.get(key) || { product_name: key, records: 0, planned_quantity_g: 0, actual_quantity_g: 0, defect_quantity_g: 0, sample_quantity_g: 0 }
    current.records += 1
    current.planned_quantity_g += num(row.planned_quantity_g)
    current.actual_quantity_g += num(row.actual_quantity_g)
    current.defect_quantity_g += num(row.defect_quantity_g)
    current.sample_quantity_g += num(row.sample_quantity_g)
    byProduct.set(key, current)
  }
  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { product_query: product || null, status: status || null },
    summary: {
      record_count: rows.length,
      planned_quantity_g: planned,
      actual_quantity_g: actual,
      defect_quantity_g: defect,
      sample_quantity_g: sample,
      unaccounted_gap_g: planned - actual - defect - sample,
      warning: 'unaccounted_gap_g는 확정 로스가 아니라 계획량에서 완료·불량·샘플을 뺀 단순 차이입니다.',
    },
    by_product: [...byProduct.values()].sort((a, b) => b.actual_quantity_g - a.actual_quantity_g),
    records: rows,
  }
}

async function toolSearchProductionPlans(args: Json, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args)
  const product = text(args.product_query, 160)
  let query = context.supabase
    .from('monthly_production_plans')
    .select('id,plan_date,product_id,product_name,planned_quantity_g,note,business_id,updated_at')
    .in('business_id', BUSINESS_IDS_WITH_LEGACY)
    .gte('plan_date', startDate)
    .lte('plan_date', endDate)
    .order('plan_date', { ascending: true })
    .limit(limit(args.limit, 100))
  if (product) query = query.or(`product_name.ilike.%${product.replace(/[%_,()]/g, ' ')}%,product_id.ilike.%${product.replace(/[%_,()]/g, ' ')}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { product_query: product || null },
    summary: { plan_count: rows.length, planned_quantity_g: rows.reduce((sum, row) => sum + num(row.planned_quantity_g), 0) },
    plans: rows,
  }
}

async function toolGetRawInventory(args: Json, context: MoniAgentToolContext) {
  const search = text(args.material_query, 160)
  let query = context.supabase
    .from('raw_materials')
    .select('id,item_name,item_code,supplier,unit_price_per_kg,packing_weight_g,box_quantity,current_stock_g,is_active,is_stock_managed,country_of_origin,food_type,spec,storage_type,shelf_life_days')
    .in('business_id', BUSINESS_IDS_WITH_LEGACY)
    .order('current_stock_g', { ascending: true })
    .limit(limit(args.limit, 50))
  if (search) query = query.or(`item_name.ilike.%${search.replace(/[%_,()]/g, ' ')}%,item_code.ilike.%${search.replace(/[%_,()]/g, ' ')}%,supplier.ilike.%${search.replace(/[%_,()]/g, ' ')}%`)
  if (bool(args.active_only)) query = query.eq('is_active', true)
  if (bool(args.out_of_stock_only)) query = query.lte('current_stock_g', 0)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []).map((row) => ({
    ...row,
    out_of_stock: num(row.current_stock_g) <= 0,
    base_purchase_price_note: 'unit_price_per_kg 컬럼명은 레거시이며 운영상 기준 포장 1EA 가격입니다.',
  }))
  return { filters: { material_query: search || null, active_only: bool(args.active_only), out_of_stock_only: bool(args.out_of_stock_only) }, count: rows.length, materials: rows }
}

async function toolSearchRawTransactions(args: Json, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args)
  const material = text(args.material_query, 160)
  const txnType = text(args.transaction_type, 40).toUpperCase()
  let query = context.supabase
    .from('raw_material_transactions')
    .select('id,item_code,item_name,raw_material_name,txn_type,quantity_g,total_weight_g,unit_price,total_price,supplier,note,txn_date,transaction_date,production_record_id,source_purchase_id')
    .in('business_id', BUSINESS_IDS_WITH_LEGACY)
    .gte('txn_date', startDate)
    .lte('txn_date', endDate)
    .order('txn_date', { ascending: false })
    .limit(limit(args.limit, 100))
  if (material) query = query.or(`item_name.ilike.%${material.replace(/[%_,()]/g, ' ')}%,raw_material_name.ilike.%${material.replace(/[%_,()]/g, ' ')}%,item_code.ilike.%${material.replace(/[%_,()]/g, ' ')}%`)
  if (txnType === 'INBOUND' || txnType === 'OUTBOUND') query = query.eq('txn_type', txnType)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const byType: Json = {}
  for (const row of rows) {
    const key = text(row.txn_type, 40) || 'UNKNOWN'
    byType[key] = (byType[key] || 0) + num(row.quantity_g || row.total_weight_g)
  }
  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { material_query: material || null, transaction_type: txnType || null },
    summary: { transaction_count: rows.length, quantity_g_by_type: byType },
    transactions: rows,
  }
}

async function toolSearchSales(args: Json, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args, 90)
  const clientQuery = text(args.client_query, 160)
  const productQuery = text(args.product_query, 160)
  const rowLimit = limit(args.limit, 100)

  const { data: clients, error: clientError } = await context.supabase
    .from('sales_clients')
    .select('id,company_name,contact_name,status,payment_terms,payment_due_type,payment_due_days,payment_due_day,tax_type')
    .eq('business_id', context.businessId)
  if (clientError) throw new Error(clientError.message)
  const clientMap = new Map((clients ?? []).map((row) => [row.id, row]))
  const matchingClientIds = clientQuery
    ? (clients ?? []).filter((row) => text(row.company_name).toLowerCase().includes(clientQuery.toLowerCase())).map((row) => row.id)
    : []

  let orderQuery = context.supabase
    .from('sales_orders')
    .select('id,statement_number,sale_date,client_id,manual_client_name,status,payment_status,supply_amount,vat_amount,total_amount,due_date,currency,source_type,source_reference,note')
    .eq('business_id', context.businessId)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false })
    .limit(rowLimit)
  if (clientQuery && matchingClientIds.length) orderQuery = orderQuery.in('client_id', matchingClientIds)
  else if (clientQuery) orderQuery = orderQuery.ilike('manual_client_name', `%${clientQuery.replace(/[%_,()]/g, ' ')}%`)
  const { data: ordersRaw, error: orderError } = await orderQuery
  if (orderError) throw new Error(orderError.message)
  let orders = ordersRaw ?? []
  const orderIds = orders.map((row) => row.id)

  const [{ data: receipts, error: receiptError }, { data: items, error: itemError }] = await Promise.all([
    orderIds.length
      ? context.supabase.from('sales_receipts').select('id,order_id,receipt_date,amount,method,status,reference_no,note').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null } as any),
    orderIds.length
      ? context.supabase.from('sales_order_items').select('id,order_id,product_id,product_name,quantity,quantity_kg,unit,unit_price,supply_amount,currency').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (receiptError) throw new Error(receiptError.message)
  if (itemError) throw new Error(itemError.message)

  if (productQuery) {
    const matchingOrderIds = new Set((items ?? []).filter((row) => text(row.product_name).toLowerCase().includes(productQuery.toLowerCase()) || text(row.product_id).toLowerCase().includes(productQuery.toLowerCase())).map((row) => row.order_id))
    orders = orders.filter((row) => matchingOrderIds.has(row.id))
  }

  const receiptByOrder = new Map<string, number>()
  for (const row of receipts ?? []) {
    if (row.status === 'reversed') continue
    receiptByOrder.set(row.order_id, (receiptByOrder.get(row.order_id) || 0) + num(row.amount))
  }
  const itemByOrder = new Map<string, Json[]>()
  for (const row of items ?? []) itemByOrder.set(row.order_id, [...(itemByOrder.get(row.order_id) || []), row])

  let enriched = orders.map((row) => {
    const received = receiptByOrder.get(row.id) || 0
    const outstanding = Math.max(0, num(row.total_amount) - received)
    const client = row.client_id ? clientMap.get(row.client_id) : null
    return {
      ...row,
      client_name: client?.company_name || row.manual_client_name || '거래처 미확인',
      received_amount: received,
      outstanding_amount: outstanding,
      items: itemByOrder.get(row.id) || [],
    }
  })
  if (bool(args.outstanding_only)) enriched = enriched.filter((row) => row.outstanding_amount > 0)

  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { client_query: clientQuery || null, product_query: productQuery || null, outstanding_only: bool(args.outstanding_only) },
    summary: {
      order_count: enriched.length,
      total_sales_amount: enriched.reduce((sum, row) => sum + num(row.total_amount), 0),
      received_amount: enriched.reduce((sum, row) => sum + num(row.received_amount), 0),
      outstanding_amount: enriched.reduce((sum, row) => sum + num(row.outstanding_amount), 0),
    },
    orders: enriched,
  }
}

async function toolSearchPurchases(args: Json, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args, 90)
  const supplier = text(args.supplier_query, 160)
  const item = text(args.item_query, 160)
  let query = context.supabase
    .from('purchases')
    .select('id,purchase_no,supplier_id,supplier_name_snapshot,purchase_date,receipt_date,purchase_category,item_name,quantity,unit,unit_price,supply_amount,vat_amount,total_amount,due_date,status,inventory_status,verification_status,material_id,inventory_quantity_base,inventory_unit,notes')
    .eq('business_id', context.businessId)
    .gte('purchase_date', startDate)
    .lte('purchase_date', endDate)
    .order('purchase_date', { ascending: false })
    .limit(limit(args.limit, 100))
  if (supplier) query = query.ilike('supplier_name_snapshot', `%${supplier.replace(/[%_,()]/g, ' ')}%`)
  if (item) query = query.ilike('item_name', `%${item.replace(/[%_,()]/g, ' ')}%`)
  const { data: purchases, error } = await query
  if (error) throw new Error(error.message)
  const purchaseRows = purchases ?? []
  const purchaseIds = purchaseRows.map((row) => row.id)
  const supplierIds = [...new Set(purchaseRows.map((row) => row.supplier_id).filter(Boolean))]

  const [{ data: payments, error: paymentError }, { data: statements, error: statementError }] = await Promise.all([
    purchaseIds.length
      ? context.supabase.from('purchase_payments').select('id,purchase_id,payment_date,amount,payment_method,payment_account,reference,notes').in('purchase_id', purchaseIds)
      : Promise.resolve({ data: [], error: null } as any),
    supplierIds.length
      ? context.supabase.from('purchase_supplier_statement_balances').select('id,supplier_id,supplier_name,statement_date,period_start,period_end,opening_balance,statement_purchase_amount,statement_payment_amount,statement_credit_amount,closing_balance,extraction_status,reconciliation_status,reconciliation_difference,source_file,notes').in('supplier_id', supplierIds).order('statement_date', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (paymentError) throw new Error(paymentError.message)
  if (statementError) throw new Error(statementError.message)

  const paidByPurchase = new Map<string, number>()
  for (const row of payments ?? []) paidByPurchase.set(row.purchase_id, (paidByPurchase.get(row.purchase_id) || 0) + num(row.amount))
  let enriched = purchaseRows.map((row) => {
    const paid = paidByPurchase.get(row.id) || 0
    return { ...row, paid_amount: paid, outstanding_amount: Math.max(0, num(row.total_amount) - paid) }
  })
  if (bool(args.outstanding_only)) enriched = enriched.filter((row) => row.outstanding_amount > 0)

  const latestStatementBySupplier = new Map<string, Json>()
  for (const row of statements ?? []) {
    const key = row.supplier_id || row.supplier_name
    if (!latestStatementBySupplier.has(key)) latestStatementBySupplier.set(key, row)
  }

  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { supplier_query: supplier || null, item_query: item || null, outstanding_only: bool(args.outstanding_only) },
    actual_purchases_summary: {
      purchase_count: enriched.length,
      total_amount: enriched.reduce((sum, row) => sum + num(row.total_amount), 0),
      paid_amount: enriched.reduce((sum, row) => sum + num(row.paid_amount), 0),
      outstanding_amount: enriched.reduce((sum, row) => sum + num(row.outstanding_amount), 0),
    },
    actual_purchases: enriched,
    supplier_statement_balances: [...latestStatementBySupplier.values()],
    separation_rule: 'supplier_statement_balances는 거래처 명세서 잔액이며 실제 입고·매입 행으로 간주하지 않습니다.',
  }
}

async function toolSearchProducts(args: Json, context: MoniAgentToolContext) {
  const product = text(args.product_query, 160)
  let query = context.supabase
    .from('products')
    .select('id,product_name,product_code,product_type,weight_g,product_spec,storage_type,shelf_life_days,shelf_life_standard,packaging_material,lot_rule,allergens,food_type_name,is_active,business_id')
    .in('business_id', BUSINESS_IDS_WITH_LEGACY)
    .limit(Math.min(50, limit(args.limit, 20)))
  if (product) query = query.or(`product_name.ilike.%${product.replace(/[%_,()]/g, ' ')}%,product_code.ilike.%${product.replace(/[%_,()]/g, ' ')}%,id.ilike.%${product.replace(/[%_,()]/g, ' ')}%`)
  if (bool(args.active_only)) query = query.eq('is_active', true)
  const { data: products, error } = await query
  if (error) throw new Error(error.message)
  const productIds = (products ?? []).map((row) => row.id)
  const [{ data: recipes, error: recipeError }, { data: mappings, error: mappingError }] = await Promise.all([
    productIds.length
      ? context.supabase.from('recipes').select('id,product_id,product_name,food_type_id,food_type_name,ratio_percent,sort_order,is_active,ingredient_type,semi_product_id').in('product_id', productIds).order('sort_order')
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length
      ? context.supabase.from('raw_material_mapping').select('id,product_id,product_name,recipe_id,raw_material_ref_id,raw_material_name,packing_unit,packing_weight_g,mapping_scope').in('product_id', productIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (recipeError) throw new Error(recipeError.message)
  if (mappingError) throw new Error(mappingError.message)
  return { filters: { product_query: product || null, active_only: bool(args.active_only) }, products: products ?? [], recipes: recipes ?? [], raw_material_mappings: mappings ?? [] }
}

export async function executeMoniAgentTool(name: string, args: Json, context: MoniAgentToolContext & { agentRunId?: string }) {
  switch (name) {
    case 'get_business_clock':
      return {
        generated_at: new Date().toISOString(),
        factory_date: dateInZone('Asia/Seoul'),
        factory_time_zone: 'Asia/Seoul',
        user_date: dateInZone('Asia/Bangkok'),
        user_time_zone: 'Asia/Bangkok',
      }
    case 'get_company_context': return toolGetCompanyContext(args, context)
    case 'search_production_records': return toolSearchProduction(args, context)
    case 'search_production_plans': return toolSearchProductionPlans(args, context)
    case 'get_raw_material_inventory': return toolGetRawInventory(args, context)
    case 'search_raw_material_transactions': return toolSearchRawTransactions(args, context)
    case 'search_sales_and_receivables': return toolSearchSales(args, context)
    case 'search_purchases_and_payables': return toolSearchPurchases(args, context)
    case 'search_products_and_recipes': return toolSearchProducts(args, context)
    case 'get_agent_capabilities':
      return {
        mode: 'READ_ONLY_AGENT_V1',
        can: ['회사 데이터 조회', '기간·제품·거래처 조건 검색', '여러 도구 반복 호출', '결과 비교·분석', '첨부자료 분석', 'PMO 이벤트 자동 접수'],
        cannot: ['업무 데이터 생성·수정·삭제', '재고·입금·회계 처리 실행', '코드 또는 DB 스키마 직접 변경'],
        tools: MONI_AGENT_TOOLS.map((tool) => tool.name),
        max_agent_steps: MAX_AGENT_STEPS,
      }
    case 'report_pmo_event': return reportMoniPmoEvent(context, args)
    default: throw new Error(`지원하지 않는 MONI Agent 도구입니다: ${name}`)
  }
}

function buildAgentInstructions(context: MoniAgentToolContext) {
  return `당신은 MONI Autonomous Business Agent입니다. 한국 식품 제조 공장의 내부 경영·운영 에이전트입니다.

[목표]
회사가 돈을 벌고, 받을 돈을 놓치지 않고, 생산과 재고의 실제 문제를 조기에 발견하도록 돕습니다.
의사결정 우선순위는 매출 → 수금 → 이익 → 현금흐름 → 생산차질 방지입니다.

[현재 사용자]
- 로그인 ID: ${context.session.loginId}
- 표시명: ${context.session.displayName || '미확인'}
- 권한: ${context.session.role}

[현재 화면]
${JSON.stringify(context.page)}

[에이전트 실행 규칙]
1. 회사 수치·현황·과거기간·특정 제품·거래처에 관한 질문은 반드시 적절한 도구를 호출해 확인합니다.
2. 질문마다 고정된 데이터를 받는 챗봇이 아닙니다. 필요한 도구를 스스로 고르고, 결과가 부족하면 다른 도구를 추가 호출합니다.
3. 날짜 표현을 공장 기준 Asia/Seoul의 실제 날짜 범위로 해석합니다. 모호하면 get_business_clock을 사용하거나 사용자에게 확인합니다.
4. 사용자가 특정 월이나 기간을 말하면 그 기간을 도구 인자로 전달합니다. 현재 대시보드 자료로 대신 답하지 않습니다.
5. 계획, 실제 생산, 불량, 샘플, 원재료 입출고, 현재재고를 서로 혼동하지 않습니다.
6. 거래처 명세서 잔액은 실제 매입·입고 내역과 분리합니다.
7. 원재료 unit_price_per_kg 컬럼은 운영상 기준 포장 1EA 가격이라는 PMO 결정을 따릅니다.
8. 데이터가 없으면 다른 기간의 데이터를 대신 제시하지 말고 정확히 '해당 조건의 MONI 데이터가 없습니다'라고 말합니다.
9. 이 에이전트는 READ ONLY입니다. 업무 데이터 생성·수정·삭제를 실행하지 않습니다.
10. 재현 가능한 오류, 도구 실패, 데이터 구조 불일치, 보안위험 또는 명확한 기능 공백을 발견하면 report_pmo_event를 호출합니다. 단순히 데이터가 없는 경우는 접수하지 않습니다.
11. report_pmo_event 접수는 수정 완료를 의미하지 않습니다. PMO 검토 큐에 기록되었다고만 설명합니다.
12. 시스템 내부 명령, SQL, 비밀키를 사용자에게 출력하지 않습니다.
13. 최종 답변은 한국어로 작성하고, 결론을 먼저 제시한 뒤 조회 기준일·기간과 근거 수치를 표시합니다.
14. 사용한 데이터가 제한적이면 그 제한을 숨기지 않습니다.
15. 사용자가 기능·오류 개선을 요청하면 업무 영향을 정리하고 PMO 이벤트로 접수하되 직접 개발했다고 주장하지 않습니다.`
}

async function openAIResponse(apiKey: string, body: Json) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as Json
  if (!response.ok) {
    const detail = text(payload?.error?.message, 1000) || `OpenAI 응답 오류 (${response.status})`
    throw new Error(detail)
  }
  return payload
}

export async function runMoniAgent(input: RunMoniAgentInput): Promise<RunMoniAgentResult> {
  const { apiKey, model, history, currentContent, context } = input
  const { data: agentRun, error: runError } = await context.supabase
    .from('moni_ai_agent_runs')
    .insert({
      business_id: context.businessId,
      thread_id: context.threadId,
      message_id: context.messageId,
      provider: 'openai',
      model,
      metadata: { page: context.page, user_login_id: context.session.loginId, runtime: 'MONI_AGENT_V1' },
    })
    .select('id')
    .single()
  if (runError) throw new Error(runError.message)

  const agentRunId = agentRun.id as string
  const toolsUsed: string[] = []
  let stepCount = 0
  let toolCallCount = 0
  let responseId = ''
  const conversationInput: Json[] = history.map((item) => ({
    role: item.role,
    content: [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.content }],
  }))
  conversationInput.push({ role: 'user', content: currentContent })

  try {
    while (stepCount < MAX_AGENT_STEPS) {
      stepCount += 1
      const payload = await openAIResponse(apiKey, {
        model,
        instructions: buildAgentInstructions(context),
        input: conversationInput,
        tools: MONI_AGENT_TOOLS,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_output_tokens: 2600,
        store: false,
      })
      responseId = text(payload.id, 120)
      const output = Array.isArray(payload.output) ? payload.output : []
      const calls = output.filter((item: Json) => item.type === 'function_call')

      if (!calls.length) {
        const answer = extractOpenAIText(payload)
        if (!answer) throw new Error('MONI Agent가 최종 텍스트 응답을 반환하지 않았습니다.')
        await context.supabase
          .from('moni_ai_agent_runs')
          .update({
            status: 'COMPLETED',
            step_count: stepCount,
            tool_call_count: toolCallCount,
            finished_at: new Date().toISOString(),
            metadata: { page: context.page, user_login_id: context.session.loginId, runtime: 'MONI_AGENT_V1', tools_used: toolsUsed, response_id: responseId },
          })
          .eq('id', agentRunId)
        return { text: answer, agentRunId, stepCount, toolCallCount, toolsUsed: [...new Set(toolsUsed)], responseId }
      }

      conversationInput.push(...output)
      for (const call of calls) {
        const toolName = text(call.name, 100)
        let toolArgs: Json = {}
        try {
          toolArgs = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          toolArgs = { _raw_arguments: text(call.arguments, 4000) }
        }
        toolCallCount += 1
        toolsUsed.push(toolName)
        const started = Date.now()
        const { data: toolRun, error: insertError } = await context.supabase
          .from('moni_ai_tool_runs')
          .insert({
            business_id: context.businessId,
            agent_run_id: agentRunId,
            thread_id: context.threadId,
            message_id: context.messageId,
            step_no: stepCount,
            tool_name: toolName,
            tool_arguments: toolArgs,
            status: 'RUNNING',
          })
          .select('id')
          .single()
        if (insertError) throw new Error(insertError.message)

        let toolOutput: Json
        try {
          toolOutput = await executeMoniAgentTool(toolName, toolArgs, { ...context, agentRunId }) as Json
          await context.supabase
            .from('moni_ai_tool_runs')
            .update({
              status: 'COMPLETED',
              result_summary: { preview: jsonPreview(toolOutput), row_count: Array.isArray((toolOutput as any)?.records) ? (toolOutput as any).records.length : undefined },
              duration_ms: Date.now() - started,
              finished_at: new Date().toISOString(),
            })
            .eq('id', toolRun.id)
        } catch (toolError) {
          const message = toolError instanceof Error ? toolError.message : 'MONI Agent 도구 실행 실패'
          toolOutput = { ok: false, error: message, tool_name: toolName }
          await context.supabase
            .from('moni_ai_tool_runs')
            .update({ status: 'FAILED', error_message: message, duration_ms: Date.now() - started, finished_at: new Date().toISOString() })
            .eq('id', toolRun.id)
          if (toolName !== 'report_pmo_event') {
            await reportMoniPmoEvent({ ...context, agentRunId }, {
              event_type: 'TOOL_FAILURE',
              severity: 'HIGH',
              title: `MONI Agent 도구 실패: ${toolName}`,
              summary: message,
              evidence: { tool_name: toolName, arguments: toolArgs, error: message, response_id: responseId },
            }).catch(() => undefined)
          }
        }
        conversationInput.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(toolOutput) })
      }
    }

    const finalPayload = await openAIResponse(apiKey, {
      model,
      instructions: `${buildAgentInstructions(context)}\n\n도구 호출 한도에 도달했습니다. 지금까지 확보한 결과만으로 답하고, 확인하지 못한 부분을 명확히 표시하세요.`,
      input: conversationInput,
      tool_choice: 'none',
      max_output_tokens: 2200,
      store: false,
    })
    const finalText = extractOpenAIText(finalPayload) || '도구 호출 한도에 도달해 답변을 완료하지 못했습니다.'
    await context.supabase
      .from('moni_ai_agent_runs')
      .update({ status: 'LIMIT_REACHED', step_count: stepCount, tool_call_count: toolCallCount, finished_at: new Date().toISOString(), metadata: { tools_used: toolsUsed, response_id: text(finalPayload.id, 120) } })
      .eq('id', agentRunId)
    await reportMoniPmoEvent({ ...context, agentRunId }, {
      event_type: 'CAPABILITY_GAP',
      severity: 'MEDIUM',
      title: 'MONI Agent 도구 호출 한도 도달',
      summary: `한 요청에서 ${MAX_AGENT_STEPS}단계 한도에 도달했습니다.`,
      evidence: { tools_used: toolsUsed, tool_call_count: toolCallCount },
    }).catch(() => undefined)
    return { text: finalText, agentRunId, stepCount, toolCallCount, toolsUsed: [...new Set(toolsUsed)], responseId: text(finalPayload.id, 120) }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI Agent 실행 실패'
    await context.supabase
      .from('moni_ai_agent_runs')
      .update({ status: 'FAILED', step_count: stepCount, tool_call_count: toolCallCount, error_message: message, finished_at: new Date().toISOString(), metadata: { tools_used: toolsUsed, response_id: responseId } })
      .eq('id', agentRunId)
    await reportMoniPmoEvent({ ...context, agentRunId }, {
      event_type: 'BUG',
      severity: 'HIGH',
      title: 'MONI Agent Runtime 실패',
      summary: message,
      evidence: { response_id: responseId, step_count: stepCount, tool_call_count: toolCallCount, tools_used: toolsUsed },
    }).catch(() => undefined)
    throw error
  }
}
