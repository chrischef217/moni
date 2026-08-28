import { Buffer } from 'node:buffer'
import { NextResponse, type NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import type { MoniAgentPageContext } from '@/lib/moni/agent/context-types'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const LEGACY_BUSINESS_ID = 'default'
const PROVIDER = 'moni-direct'
const MODEL = 'pricing-v2'

type DirectRequestBody = {
  message?: unknown
  page?: unknown
  thread_id?: unknown
  attachment_ids?: unknown
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
type Supabase = ReturnType<typeof createMoniServiceRoleClient>

type RawIdentity = {
  id: string
  code: string
  name: string
  supplier: string
  packingWeightG: number
}

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanPage(raw: unknown): MoniAgentPageContext {
  const page = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    pathname: text(page.pathname, 300),
    search: text(page.search, 500),
    title: text(page.title, 160),
    headings: Array.isArray(page.headings)
      ? page.headings.map((item) => text(item, 120)).filter(Boolean).slice(0, 6)
      : [],
  }
}

function normalized(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function compact(value: unknown) {
  return normalized(value).toLowerCase().replace(/[^0-9a-zA-Z가-힣]/g, '')
}

function safeLike(value: string) {
  return value.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

function priceIntent(message: string) {
  const value = normalized(message)
  if (!value || value.length > 220 || !/(가격|단가|얼마)/.test(value)) return false
  if (/(바꾸|변경|수정|설정|등록|추가|삭제|메뉴|어디|경로|방법|어떻게|분석|비교|추이|변동|평균|합계|총액|매출액|매입액)/.test(value)) return false
  if (/(제품|판매)/.test(value) && !/(원재료|원료|재료|매입|구매)/.test(value)) return false
  return true
}

function extractTarget(message: string) {
  return normalized(message)
    .replace(/[?!.。！？]+$/g, '')
    .replace(/(?:가격|단가|금액)(?:이|은|는|가|을|를)?/g, ' ')
    .replace(/(?:얼마야|얼마예요|얼마인가요|얼마인지|얼마|알려줘|알려주세요|알려|조회해줘|조회해주세요|조회|확인해줘|확인해주세요|확인)/g, ' ')
    .replace(/(?:현재|지금|오늘|최근|기준|원재료|원료|재료|매입|구매)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function searchTerms(target: string) {
  const spaced = safeLike(normalized(target))
  const joined = safeLike(compact(target))
  return [...new Set([spaced, joined].filter((value) => value.length >= 2))]
}

function orSearch(terms: string[], columns: string[]) {
  return terms.flatMap((term) => columns.map((column) => `${column}.ilike.%${term}%`)).join(',')
}

function won(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function packLabel(weightG: number) {
  if (weightG <= 0) return ''
  const kg = weightG / 1000
  return Number.isInteger(kg) ? `${kg}kg` : `${Number(kg.toFixed(3))}kg`
}

async function resolveCanonicalRawIdentity(supabase: Supabase, target: string): Promise<RawIdentity | null> {
  const targetCompact = compact(target)
  if (targetCompact.length < 2) return null
  const terms = searchTerms(target)

  const [mappingResult, transactionResult] = await Promise.all([
    supabase
      .from('raw_material_mapping')
      .select('raw_material_ref_id,raw_material_name,packing_weight_g')
      .eq('business_id', BUSINESS_ID)
      .or(orSearch(terms, ['raw_material_name', 'raw_material_ref_id']))
      .limit(80),
    supabase
      .from('raw_material_transactions')
      .select('item_code,item_name,raw_material_name,supplier,packing_weight_g,txn_date')
      .eq('business_id', BUSINESS_ID)
      .or(orSearch(terms, ['item_name', 'raw_material_name', 'item_code']))
      .order('txn_date', { ascending: false })
      .limit(80),
  ])
  if (mappingResult.error) throw new Error(mappingResult.error.message)
  if (transactionResult.error) throw new Error(transactionResult.error.message)

  const identities: RawIdentity[] = []
  for (const row of mappingResult.data ?? []) {
    const name = text(row.raw_material_name, 180)
    const code = text(row.raw_material_ref_id, 120)
    identities.push({ id: code || name, code, name, supplier: '', packingWeightG: num(row.packing_weight_g) })
  }
  for (const row of transactionResult.data ?? []) {
    const name = text(row.raw_material_name || row.item_name, 180)
    const code = text(row.item_code, 120)
    identities.push({
      id: code || name,
      code,
      name,
      supplier: text(row.supplier, 160),
      packingWeightG: num(row.packing_weight_g),
    })
  }

  const exact = identities.filter((item) => compact(item.name) === targetCompact || compact(item.code) === targetCompact)
  if (!exact.length) return null

  const byKey = new Map<string, RawIdentity>()
  for (const item of exact) {
    const key = compact(item.code || item.name)
    const current = byKey.get(key)
    if (!current) byKey.set(key, item)
    else byKey.set(key, {
      ...current,
      name: current.name || item.name,
      code: current.code || item.code,
      supplier: current.supplier || item.supplier,
      packingWeightG: current.packingWeightG || item.packingWeightG,
    })
  }
  if (byKey.size !== 1) return null
  return [...byKey.values()][0]
}

async function loadRawPrice(supabase: Supabase, identity: RawIdentity) {
  const code = safeLike(identity.code)
  const name = safeLike(identity.name)
  const exactClause = [
    code ? `id.eq.${code}` : '',
    code ? `item_code.eq.${code}` : '',
    name ? `item_name.ilike.%${name}%` : '',
  ].filter(Boolean).join(',')

  const canonicalMaster = await supabase
    .from('raw_materials')
    .select('id,item_name,item_code,supplier,unit_price_per_kg,packing_weight_g,is_active')
    .eq('business_id', BUSINESS_ID)
    .or(exactClause)
    .limit(20)
  if (canonicalMaster.error) throw new Error(canonicalMaster.error.message)

  const currentExact = (canonicalMaster.data ?? []).find((row) => (
    (identity.code && (compact(row.id) === compact(identity.code) || compact(row.item_code) === compact(identity.code)))
    || compact(row.item_name) === compact(identity.name)
  ))
  if (currentExact && num(currentExact.unit_price_per_kg) > 0) {
    return {
      itemName: text(currentExact.item_name || identity.name, 180),
      code: text(currentExact.item_code || currentExact.id || identity.code, 120),
      supplier: text(currentExact.supplier || identity.supplier, 160),
      packWeightG: num(currentExact.packing_weight_g) || identity.packingWeightG,
      packPrice: num(currentExact.unit_price_per_kg),
      source: 'canonical_raw_material_master',
      warning: '',
    }
  }

  const legacyMaster = await supabase
    .from('raw_materials')
    .select('id,item_name,item_code,supplier,unit_price_per_kg,packing_weight_g,is_active')
    .eq('business_id', LEGACY_BUSINESS_ID)
    .or(exactClause)
    .limit(20)
  if (legacyMaster.error) throw new Error(legacyMaster.error.message)

  const legacyExact = (legacyMaster.data ?? []).find((row) => (
    (identity.code && (compact(row.id) === compact(identity.code) || compact(row.item_code) === compact(identity.code)))
    || compact(row.item_name) === compact(identity.name)
  ))
  if (legacyExact && num(legacyExact.unit_price_per_kg) > 0) {
    return {
      itemName: text(legacyExact.item_name || identity.name, 180),
      code: text(legacyExact.item_code || legacyExact.id || identity.code, 120),
      supplier: text(legacyExact.supplier || identity.supplier, 160),
      packWeightG: num(legacyExact.packing_weight_g) || identity.packingWeightG,
      packPrice: num(legacyExact.unit_price_per_kg),
      source: 'legacy_exact_id_master_fallback',
      warning: '현재 canonical 원재료 마스터에 기준단가 행이 누락되어, canonical 사용 이력과 동일 코드인 레거시 기준단가 마스터를 사용했습니다.',
    }
  }

  let purchaseQuery = supabase
    .from('purchases')
    .select('purchase_date,supplier_name_snapshot,item_name,material_id,unit,unit_price,status,verification_status')
    .eq('business_id', BUSINESS_ID)
    .order('purchase_date', { ascending: false })
    .limit(40)
  if (identity.code) purchaseQuery = purchaseQuery.eq('material_id', identity.code)
  else purchaseQuery = purchaseQuery.ilike('item_name', `%${name}%`)
  const purchaseResult = await purchaseQuery
  if (purchaseResult.error) throw new Error(purchaseResult.error.message)
  const validPurchase = (purchaseResult.data ?? []).find((row) => (
    num(row.unit_price) > 0
    && !/cancel|취소/i.test(text(row.status, 40))
    && !/excluded|rejected/i.test(text(row.verification_status, 40))
  ))
  if (validPurchase) {
    return {
      itemName: text(validPurchase.item_name || identity.name, 180),
      code: text(validPurchase.material_id || identity.code, 120),
      supplier: text(validPurchase.supplier_name_snapshot || identity.supplier, 160),
      packWeightG: identity.packingWeightG,
      packPrice: num(validPurchase.unit_price),
      source: 'verified_purchase_fallback',
      warning: `기준단가 마스터가 없어 ${text(validPurchase.purchase_date, 20)}의 검증 가능한 구매단가를 사용했습니다.`,
    }
  }

  return {
    itemName: identity.name,
    code: identity.code,
    supplier: identity.supplier,
    packWeightG: identity.packingWeightG,
    packPrice: 0,
    source: 'no_trusted_price',
    warning: '검증 제외(EXCLUDED/REJECTED) 구매단가는 가격 답변에 사용하지 않았습니다.',
  }
}

function buildAnswer(price: Awaited<ReturnType<typeof loadRawPrice>>) {
  if (price.packPrice <= 0) {
    return `**${price.itemName}**은 원재료로 확인됐지만, 현재 신뢰 가능한 기준단가를 확인하지 못했습니다.\n\n${price.warning}`
  }
  const lines = [`**${price.itemName} 가격:** ${won(price.packPrice)} / EA`]
  if (price.packWeightG > 0) {
    lines.push(`포장 기준: **${packLabel(price.packWeightG)}**`)
    lines.push(`kg 환산: **${won(price.packPrice / (price.packWeightG / 1000))} / kg**`)
  }
  if (price.supplier) lines.push(`공급처: **${price.supplier}**`)
  if (price.warning) lines.push(`데이터 참고: ${price.warning}`)
  else lines.push('기준: 현재 원재료 마스터 기준 포장단가')
  return lines.join('\n\n')
}

async function ensureThread(supabase: Supabase, session: SessionUser, requestedId: string, page: MoniAgentPageContext) {
  if (requestedId) {
    const { data, error } = await supabase
      .from('moni_ai_threads')
      .select('id,title,status')
      .eq('id', requestedId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .eq('status', 'ACTIVE')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('MONI 대화방을 확인할 수 없습니다.')
    return data
  }
  const { data, error } = await supabase.from('moni_ai_threads').insert({
    business_id: BUSINESS_ID,
    user_login_id: session.loginId,
    user_display_name: session.displayName,
    user_role: session.role,
    current_page: page,
  }).select('id,title,status').single()
  if (error) throw new Error(error.message)
  return data
}

async function hasActiveRun(supabase: Supabase, threadId: string) {
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data, error } = await supabase
    .from('moni_ai_agent_runs')
    .select('id')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('status', 'RUNNING')
    .gte('started_at', staleBefore)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

async function persist(args: {
  supabase: Supabase
  threadId: string
  currentTitle: string | null
  page: MoniAgentPageContext
  message: string
  answer: string
  identity: RawIdentity
  evidence: Record<string, unknown>
  startedAt: number
}) {
  const now = new Date().toISOString()
  const { data: userMessage, error: userError } = await args.supabase.from('moni_ai_messages').insert({
    business_id: BUSINESS_ID,
    thread_id: args.threadId,
    role: 'user',
    content: args.message,
    page_context: args.page,
  }).select('id').single()
  if (userError) throw new Error(userError.message)

  const { data: run, error: runError } = await args.supabase.from('moni_ai_agent_runs').insert({
    business_id: BUSINESS_ID,
    thread_id: args.threadId,
    message_id: userMessage.id,
    provider: PROVIDER,
    model: MODEL,
    status: 'COMPLETED',
    step_count: 1,
    tool_call_count: 1,
    finished_at: now,
    latency_ms: Math.max(0, Date.now() - args.startedAt),
    validation_status: 'NOT_APPLICABLE',
    prompt_version: 'MONI_DIRECT_RAW_PRICE_LOOKUP_V2',
    metadata: { state_mode: 'DIRECT_RAW_PRICE_LOOKUP_V2', identity: args.identity, evidence: args.evidence },
    request_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    usage: { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  }).select('id').single()
  if (runError) throw new Error(runError.message)

  const serialized = JSON.stringify(args.evidence)
  const { error: toolError } = await args.supabase.from('moni_ai_tool_runs').insert({
    business_id: BUSINESS_ID,
    agent_run_id: run.id,
    thread_id: args.threadId,
    message_id: userMessage.id,
    step_no: 1,
    tool_name: 'direct_raw_material_price_lookup_v2',
    tool_arguments: { target: args.identity.name, code: args.identity.code },
    status: 'COMPLETED',
    result_summary: {
      preview: serialized.slice(0, 10000),
      truncated: serialized.length > 10000,
      output_bytes: Buffer.byteLength(serialized, 'utf8'),
    },
    duration_ms: Math.max(0, Date.now() - args.startedAt),
    finished_at: now,
  })
  if (toolError) throw new Error(toolError.message)

  const { error: assistantError } = await args.supabase.from('moni_ai_messages').insert({
    business_id: BUSINESS_ID,
    thread_id: args.threadId,
    role: 'assistant',
    content: args.answer,
    page_context: args.page,
    provider: PROVIDER,
    model: MODEL,
  })
  if (assistantError) throw new Error(assistantError.message)

  const update: Record<string, unknown> = { current_page: args.page, last_message_at: now, updated_at: now }
  if (!args.currentTitle) update.title = args.message.slice(0, 80)
  const { error: threadError } = await args.supabase
    .from('moni_ai_threads')
    .update(update)
    .eq('id', args.threadId)
    .eq('business_id', BUSINESS_ID)
  if (threadError) throw new Error(threadError.message)
  return run.id
}

export async function tryDirectRawMaterialPriceLookupV2(request: NextRequest, body: DirectRequestBody) {
  const message = text(body.message, 6000)
  const attachments = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(Boolean) : []
  if (!message || attachments.length || !priceIntent(message)) return null

  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

  const startedAt = Date.now()
  const supabase = createMoniServiceRoleClient()
  let identity: RawIdentity | null
  try {
    identity = await resolveCanonicalRawIdentity(supabase, extractTarget(message))
  } catch (error) {
    console.error('[MONI_DIRECT_RAW_PRICE_V2_RESOLUTION_ERROR]', error)
    return null
  }
  if (!identity) return null

  try {
    const page = cleanPage(body.page)
    const thread = await ensureThread(supabase, session, text(body.thread_id, 80), page)
    if (await hasActiveRun(supabase, thread.id)) {
      return NextResponse.json({
        ok: false,
        code: 'MONI_BUSY',
        error: 'MONI가 이전 질문에 답변 중입니다. 현재 요청은 중복 등록하지 않았습니다. 답변이 끝난 뒤 다시 보내 주세요.',
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }

    const price = await loadRawPrice(supabase, identity)
    const answer = buildAnswer(price)
    const evidence = {
      entity_kind: 'raw_material',
      item_name: price.itemName,
      item_code: price.code,
      supplier: price.supplier || null,
      packing_weight_g: price.packWeightG || null,
      base_pack_price: price.packPrice || null,
      source: price.source,
      warning: price.warning || null,
      canonical_identity_business_id: BUSINESS_ID,
    }
    const runId = await persist({
      supabase,
      threadId: thread.id,
      currentTitle: thread.title,
      page,
      message,
      answer,
      identity,
      evidence,
      startedAt,
    })

    return NextResponse.json({
      ok: true,
      text: answer,
      thread_id: thread.id,
      provider: PROVIDER,
      model: MODEL,
      agent_runtime: {
        mode: 'MONI_DIRECT_RAW_PRICE_LOOKUP_V2',
        agent_run_id: runId,
        conversation_state: 'SERVER_MANAGED',
        direct_lookup: true,
      },
      approval_gated_writes: true,
      read_only: true,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[MONI_DIRECT_RAW_PRICE_V2_ERROR]', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '원재료 가격 조회 중 오류가 발생했습니다.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
