import { NextResponse, type NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import type { MoniAgentPageContext } from '@/lib/moni/agent/context-types'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const DIRECT_MODEL = 'pricing-v1'
const DIRECT_PROVIDER = 'moni-direct'
const MAX_DIRECT_MESSAGE_LENGTH = 220

type DirectRequestBody = {
  message?: unknown
  page?: unknown
  thread_id?: unknown
  attachment_ids?: unknown
}

type CandidateKind = 'raw_material' | 'product'
type Candidate = {
  kind: CandidateKind
  id: string
  name: string
  code: string
  score: number
  active: boolean
}

type Resolution =
  | { type: 'single'; target: string; candidate: Candidate }
  | { type: 'ambiguous'; target: string; candidates: Candidate[] }

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
type Supabase = ReturnType<typeof createMoniServiceRoleClient>

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const numberValue = (value: unknown) => {
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

function normalizedSpaces(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function compactName(value: unknown) {
  return normalizedSpaces(value)
    .toLowerCase()
    .replace(/[\s·._\-\/()[\]{}'"`~!@#$%^&*+=:;,?<>|\\]/g, '')
}

function wordTokens(value: unknown) {
  return normalizedSpaces(value)
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+|\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
}

function safeLike(value: string) {
  return value.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

function uniqueTerms(target: string) {
  const values = [normalizedSpaces(target), compactName(target), ...wordTokens(target)]
    .map((item) => safeLike(item))
    .filter((item) => item.length >= 2)
  return [...new Set(values)].slice(0, 8)
}

function priceIntent(message: string) {
  const value = normalizedSpaces(message)
  if (!value || value.length > MAX_DIRECT_MESSAGE_LENGTH) return false
  if (!/(가격|단가|얼마)/i.test(value)) return false
  if (/(바꾸|변경|수정|설정|등록|추가|삭제|메뉴|어디|경로|방법|어떻게|분석|비교|추이|변동|평균|합계|총액|매출액|매입액)/i.test(value)) return false
  return true
}

function extractPriceTarget(message: string) {
  let value = normalizedSpaces(message)
  value = value
    .replace(/[?!.。！？]+$/g, '')
    .replace(/\b(?:price|cost)\b/gi, ' ')
    .replace(/(?:가격|단가|금액)(?:이|은|는|가|을|를)?/g, ' ')
    .replace(/(?:얼마야|얼마예요|얼마인가요|얼마인지|얼마|알려줘|알려주세요|알려|조회해줘|조회해주세요|조회|확인해줘|확인해주세요|확인)/g, ' ')
    .replace(/(?:현재|지금|오늘|최근|기준|판매|판매가|매입|구매|원재료|원료|재료|제품|품목)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return value.slice(0, 160)
}

function scoreName(target: string, candidate: string) {
  const queryCompact = compactName(target)
  const candidateCompact = compactName(candidate)
  if (!queryCompact || !candidateCompact) return 0
  if (queryCompact === candidateCompact) return 1000
  if (candidateCompact.includes(queryCompact)) {
    return 780 + Math.max(0, 80 - Math.abs(candidateCompact.length - queryCompact.length) * 4)
  }
  if (queryCompact.includes(candidateCompact) && candidateCompact.length >= 3) {
    return 700 + Math.max(0, 70 - Math.abs(candidateCompact.length - queryCompact.length) * 4)
  }

  const queryTokens = new Set(wordTokens(target))
  const candidateTokens = new Set(wordTokens(candidate))
  let overlap = 0
  for (const token of queryTokens) if (candidateTokens.has(token)) overlap += 1
  if (!overlap) {
    for (const token of queryTokens) {
      if ([...candidateTokens].some((other) => other.includes(token) || token.includes(other))) overlap += 0.6
    }
  }
  if (!overlap) return 0
  return Math.round(280 + overlap * 110 - Math.abs(candidateCompact.length - queryCompact.length) * 2)
}

function candidateScore(target: string, name: string, code: string, active: boolean, message: string, kind: CandidateKind) {
  let score = Math.max(scoreName(target, name), scoreName(target, code))
  if (active) score += 10
  if (kind === 'raw_material' && /(원재료|원료|재료|매입|구매)/.test(message)) score += 160
  if (kind === 'product' && /(제품|품목|판매)/.test(message)) score += 160
  return score
}

function buildOr(terms: string[], columns: string[]) {
  return terms.flatMap((term) => columns.map((column) => `${column}.ilike.%${term}%`)).join(',')
}

async function findCandidates(supabase: Supabase, target: string, message: string) {
  const terms = uniqueTerms(target)
  if (!terms.length) return [] as Candidate[]

  const rawMappingQuery = supabase
    .from('raw_material_mapping')
    .select('raw_material_ref_id,raw_material_name,packing_unit,packing_weight_g,product_id,product_name,business_id')
    .eq('business_id', BUSINESS_ID)
    .or(buildOr(terms, ['raw_material_name', 'raw_material_ref_id']))
    .limit(80)

  const rawMasterQuery = supabase
    .from('raw_materials')
    .select('id,item_name,item_code,supplier,unit_price_per_kg,packing_weight_g,box_quantity,current_stock_g,is_active,is_stock_managed')
    .eq('business_id', BUSINESS_ID)
    .or(buildOr(terms, ['item_name', 'item_code']))
    .limit(80)

  const rawTransactionQuery = supabase
    .from('raw_material_transactions')
    .select('item_code,item_name,raw_material_name,supplier,packing_weight_g,packing_unit,txn_date')
    .eq('business_id', BUSINESS_ID)
    .or(buildOr(terms, ['item_name', 'raw_material_name', 'item_code']))
    .order('txn_date', { ascending: false })
    .limit(80)

  const productQuery = supabase
    .from('products')
    .select('id,product_name,product_code,weight_g,is_active')
    .eq('business_id', BUSINESS_ID)
    .or(buildOr(terms, ['product_name', 'product_code', 'id']))
    .limit(80)

  const [mappingResult, masterResult, transactionResult, productResult] = await Promise.all([
    rawMappingQuery,
    rawMasterQuery,
    rawTransactionQuery,
    productQuery,
  ])

  for (const result of [mappingResult, masterResult, transactionResult, productResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const rawByKey = new Map<string, Candidate>()
  const addRaw = (idValue: unknown, nameValue: unknown, codeValue: unknown, active = true) => {
    const name = text(nameValue, 180)
    const code = text(codeValue || idValue, 100)
    const id = text(idValue || code || name, 120)
    if (!name && !code) return
    const key = compactName(code || name)
    const score = candidateScore(target, name, code, active, message, 'raw_material')
    const next: Candidate = { kind: 'raw_material', id, name: name || code, code, score, active }
    const existing = rawByKey.get(key)
    if (!existing || next.score > existing.score) rawByKey.set(key, next)
  }

  for (const row of mappingResult.data ?? []) {
    addRaw(row.raw_material_ref_id, row.raw_material_name, row.raw_material_ref_id, true)
  }
  for (const row of masterResult.data ?? []) {
    addRaw(row.id, row.item_name, row.item_code || row.id, row.is_active !== false)
  }
  for (const row of transactionResult.data ?? []) {
    addRaw(row.item_code, row.raw_material_name || row.item_name, row.item_code, true)
  }

  const productByKey = new Map<string, Candidate>()
  for (const row of productResult.data ?? []) {
    const id = text(row.id, 120)
    const name = text(row.product_name, 180)
    const code = text(row.product_code || row.id, 100)
    const active = row.is_active !== false
    const score = candidateScore(target, name, code, active, message, 'product')
    const candidate: Candidate = { kind: 'product', id, name: name || code, code, score, active }
    const existing = productByKey.get(id || compactName(name))
    if (!existing || candidate.score > existing.score) productByKey.set(id || compactName(name), candidate)
  }

  return [...rawByKey.values(), ...productByKey.values()]
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'ko'))
}

async function resolvePriceEntity(supabase: Supabase, message: string): Promise<Resolution | null> {
  if (!priceIntent(message)) return null
  const target = extractPriceTarget(message)
  if (compactName(target).length < 2) return null

  const candidates = await findCandidates(supabase, target, message)
  const top = candidates[0]
  if (!top || top.score < 500) return null

  const distinct = candidates.filter((candidate, index, all) => (
    all.findIndex((other) => other.kind === candidate.kind && compactName(other.id || other.name) === compactName(candidate.id || candidate.name)) === index
  ))
  const second = distinct.find((candidate) => candidate.kind !== top.kind || candidate.id !== top.id)

  if (top.score < 950 && second && second.score >= top.score - 70) {
    return { type: 'ambiguous', target, candidates: distinct.slice(0, 5) }
  }
  return { type: 'single', target, candidate: top }
}

function won(value: number) {
  if (!Number.isFinite(value)) return '0원'
  const rounded = Math.round(value)
  return `${rounded.toLocaleString('ko-KR')}원`
}

function kgLabel(weightG: number) {
  if (!Number.isFinite(weightG) || weightG <= 0) return ''
  const kg = weightG / 1000
  return Number.isInteger(kg) ? `${kg}kg` : `${Number(kg.toFixed(3))}kg`
}

async function answerRawMaterial(supabase: Supabase, candidate: Candidate) {
  const terms = uniqueTerms(candidate.name)
  const code = safeLike(candidate.code)
  const name = safeLike(candidate.name)

  let masterQuery = supabase
    .from('raw_materials')
    .select('id,item_name,item_code,supplier,unit_price_per_kg,packing_weight_g,box_quantity,current_stock_g,is_active,is_stock_managed')
    .eq('business_id', BUSINESS_ID)
    .limit(20)
  if (code) masterQuery = masterQuery.or(`id.eq.${code},item_code.eq.${code},item_name.ilike.%${name}%`)
  else masterQuery = masterQuery.or(buildOr(terms, ['item_name', 'item_code']))

  let purchaseQuery = supabase
    .from('purchases')
    .select('id,purchase_date,supplier_name_snapshot,item_name,material_id,quantity,unit,unit_price,total_amount,status,verification_status,inventory_status')
    .eq('business_id', BUSINESS_ID)
    .order('purchase_date', { ascending: false })
    .limit(40)
  if (code) purchaseQuery = purchaseQuery.or(`material_id.eq.${code},item_name.ilike.%${name}%`)
  else purchaseQuery = purchaseQuery.or(buildOr(terms, ['item_name', 'material_id']))

  let inboundQuery = supabase
    .from('raw_material_transactions')
    .select('item_code,item_name,raw_material_name,supplier,packing_weight_g,packing_unit,quantity_packs,total_weight_g,txn_date')
    .eq('business_id', BUSINESS_ID)
    .eq('txn_type', 'INBOUND')
    .order('txn_date', { ascending: false })
    .limit(30)
  if (code) inboundQuery = inboundQuery.or(`item_code.eq.${code},item_name.ilike.%${name}%,raw_material_name.ilike.%${name}%`)
  else inboundQuery = inboundQuery.or(buildOr(terms, ['item_name', 'raw_material_name', 'item_code']))

  const [masterResult, purchaseResult, inboundResult] = await Promise.all([masterQuery, purchaseQuery, inboundQuery])
  for (const result of [masterResult, purchaseResult, inboundResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const masterRows = masterResult.data ?? []
  const exactMaster = masterRows.find((row) => (
    compactName(row.item_name) === compactName(candidate.name)
    || compactName(row.item_code) === compactName(candidate.code)
    || compactName(row.id) === compactName(candidate.code)
  )) ?? masterRows[0]

  const pricedPurchases = (purchaseResult.data ?? []).filter((row) => numberValue(row.unit_price) > 0 && !/cancel|취소/i.test(text(row.status, 40)))
  const preferredPurchase = pricedPurchases.find((row) => !/excluded|rejected/i.test(text(row.verification_status, 40))) ?? pricedPurchases[0]
  const inbound = (inboundResult.data ?? []).find((row) => (
    compactName(row.raw_material_name || row.item_name) === compactName(candidate.name)
    || compactName(row.item_code) === compactName(candidate.code)
  )) ?? inboundResult.data?.[0]

  const masterPrice = numberValue(exactMaster?.unit_price_per_kg)
  const purchasePrice = numberValue(preferredPurchase?.unit_price)
  const price = masterPrice > 0 ? masterPrice : purchasePrice
  const packWeightG = numberValue(exactMaster?.packing_weight_g) || numberValue(inbound?.packing_weight_g)
  const supplier = text(exactMaster?.supplier || preferredPurchase?.supplier_name_snapshot || inbound?.supplier, 160)
  const itemName = text(exactMaster?.item_name || preferredPurchase?.item_name || inbound?.raw_material_name || inbound?.item_name || candidate.name, 180)
  const unit = masterPrice > 0 ? 'EA' : text(preferredPurchase?.unit, 40) || 'EA'
  const sourceDate = masterPrice > 0 ? '' : text(preferredPurchase?.purchase_date, 20)
  const kgEquivalent = price > 0 && /^EA$/i.test(unit) && packWeightG >= 1000
    ? price / (packWeightG / 1000)
    : 0

  if (price <= 0) {
    return {
      answer: `**${itemName}**은 원재료로 확인됩니다. 다만 현재 원재료 마스터와 구매 기록에서 유효한 단가를 확인하지 못했습니다.`,
      evidence: { entity_kind: 'raw_material', item_name: itemName, item_code: candidate.code, price_found: false },
    }
  }

  const lines = [`**${itemName} 가격:** ${won(price)} / ${unit}`]
  if (packWeightG > 0) lines.push(`포장 기준: **${kgLabel(packWeightG)}**`)
  if (kgEquivalent > 0) lines.push(`kg 환산: **${won(kgEquivalent)} / kg**`)
  if (supplier) lines.push(`공급처: **${supplier}**`)
  if (sourceDate) lines.push(`단가 기준일: **${sourceDate}**`)
  if (preferredPurchase && /excluded/i.test(text(preferredPurchase.verification_status, 40))) {
    lines.push('참고: 해당 구매행은 정산 검증 대상에서 제외된 레거시 기록이라 **단가 필드만 참고값으로 사용**했습니다.')
  } else if (masterPrice > 0) {
    lines.push('기준: 원재료 마스터의 기준 포장단가')
  } else {
    lines.push('기준: 최근 구매 단가 기록')
  }

  return {
    answer: lines.join('\n\n'),
    evidence: {
      entity_kind: 'raw_material',
      item_name: itemName,
      item_code: candidate.code,
      price,
      unit,
      packing_weight_g: packWeightG || null,
      supplier: supplier || null,
      source_date: sourceDate || null,
      source: masterPrice > 0 ? 'raw_materials.unit_price_per_kg(legacy base pack price)' : 'purchases.unit_price',
      verification_status: preferredPurchase?.verification_status ?? null,
    },
  }
}

async function answerProduct(supabase: Supabase, candidate: Candidate) {
  const [settingsResult, variantsResult] = await Promise.all([
    supabase
      .from('sales_product_settings')
      .select('product_id,is_sellable,default_sales_unit,unit_weight_g,carton_units,default_unit_price,moq_quantity,note')
      .eq('business_id', BUSINESS_ID)
      .eq('product_id', candidate.id)
      .maybeSingle(),
    supabase
      .from('sales_product_variants')
      .select('id,product_id,variant_name,sales_unit,unit_weight_g,box_units,default_unit_price,moq_quantity,is_default,active,sort_order')
      .eq('business_id', BUSINESS_ID)
      .eq('product_id', candidate.id)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .limit(30),
  ])
  if (settingsResult.error) throw new Error(settingsResult.error.message)
  if (variantsResult.error) throw new Error(variantsResult.error.message)

  const settings = settingsResult.data
  const variants = variantsResult.data ?? []
  const defaultPrice = numberValue(settings?.default_unit_price)
  const pricedVariants = variants.filter((row) => numberValue(row.default_unit_price) > 0)

  if (defaultPrice <= 0 && !pricedVariants.length) {
    return {
      answer: `**${candidate.name}** 제품은 확인되지만 현재 판매규격 기본단가가 등록되어 있지 않습니다.`,
      evidence: { entity_kind: 'product', product_id: candidate.id, product_name: candidate.name, price_found: false },
    }
  }

  const lines: string[] = [`**${candidate.name} 판매가격**`]
  if (defaultPrice > 0) {
    const unit = text(settings?.default_sales_unit, 40) || '단위 미지정'
    lines.push(`기본단가: **${won(defaultPrice)} / ${unit}**`)
  }
  if (pricedVariants.length) {
    lines.push('판매규격별 단가:')
    for (const row of pricedVariants.slice(0, 10)) {
      const name = text(row.variant_name, 100) || '기본 규격'
      const unit = text(row.sales_unit, 40) || '단위 미지정'
      lines.push(`- ${name}: **${won(numberValue(row.default_unit_price))} / ${unit}**${row.is_default ? ' · 기본' : ''}`)
    }
  }
  lines.push('기준: 판매규격·단가 관리의 현재 기본단가')

  return {
    answer: lines.join('\n\n'),
    evidence: {
      entity_kind: 'product',
      product_id: candidate.id,
      product_name: candidate.name,
      default_unit_price: defaultPrice || null,
      default_sales_unit: settings?.default_sales_unit ?? null,
      variants: pricedVariants.map((row) => ({
        id: row.id,
        variant_name: row.variant_name,
        sales_unit: row.sales_unit,
        default_unit_price: numberValue(row.default_unit_price),
        is_default: row.is_default,
      })),
    },
  }
}

async function ensureThread(supabase: Supabase, session: SessionUser, requestedThreadId: string, page: MoniAgentPageContext) {
  if (requestedThreadId) {
    const { data, error } = await supabase
      .from('moni_ai_threads')
      .select('id,title,status,openai_conversation_id')
      .eq('id', requestedThreadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .eq('status', 'ACTIVE')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('MONI 대화방을 확인할 수 없습니다.')
    return data
  }

  const { data, error } = await supabase
    .from('moni_ai_threads')
    .insert({
      business_id: BUSINESS_ID,
      user_login_id: session.loginId,
      user_display_name: session.displayName,
      user_role: session.role,
      current_page: page,
    })
    .select('id,title,status,openai_conversation_id')
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function activeRun(supabase: Supabase, threadId: string) {
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
  return data
}

function busyResponse() {
  return NextResponse.json({
    ok: false,
    code: 'MONI_BUSY',
    error: 'MONI가 이전 질문에 답변 중입니다. 현재 요청은 중복 등록하지 않았습니다. 답변이 끝난 뒤 다시 보내 주세요.',
  }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
}

async function persistDirectAnswer(args: {
  supabase: Supabase
  session: SessionUser
  threadId: string
  currentTitle: string | null
  page: MoniAgentPageContext
  message: string
  answer: string
  resolution: Resolution
  evidence: Record<string, unknown>
  startedAt: number
}) {
  const now = new Date().toISOString()
  const { data: userMessage, error: userError } = await args.supabase
    .from('moni_ai_messages')
    .insert({
      business_id: BUSINESS_ID,
      thread_id: args.threadId,
      role: 'user',
      content: args.message,
      page_context: args.page,
    })
    .select('id')
    .single()
  if (userError) throw new Error(userError.message)

  const { data: agentRun, error: runError } = await args.supabase
    .from('moni_ai_agent_runs')
    .insert({
      business_id: BUSINESS_ID,
      thread_id: args.threadId,
      message_id: userMessage.id,
      provider: DIRECT_PROVIDER,
      model: DIRECT_MODEL,
      status: 'COMPLETED',
      step_count: 1,
      tool_call_count: 1,
      finished_at: now,
      latency_ms: Math.max(0, Date.now() - args.startedAt),
      validation_status: 'NOT_APPLICABLE',
      prompt_version: 'MONI_DIRECT_PRICE_LOOKUP_V1',
      metadata: {
        state_mode: 'DIRECT_PRICE_LOOKUP_V1',
        entity_resolution: args.resolution,
        evidence: args.evidence,
      },
      request_count: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      usage: { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    })
    .select('id')
    .single()
  if (runError) throw new Error(runError.message)

  const serializedEvidence = JSON.stringify(args.evidence)
  const { error: toolError } = await args.supabase.from('moni_ai_tool_runs').insert({
    business_id: BUSINESS_ID,
    agent_run_id: agentRun.id,
    thread_id: args.threadId,
    message_id: userMessage.id,
    step_no: 1,
    tool_name: 'direct_price_lookup',
    tool_arguments: { message: args.message, target: args.resolution.target },
    status: 'COMPLETED',
    result_summary: {
      preview: serializedEvidence.slice(0, 10_000),
      truncated: serializedEvidence.length > 10_000,
      output_bytes: Buffer.byteLength(serializedEvidence, 'utf8'),
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
    provider: DIRECT_PROVIDER,
    model: DIRECT_MODEL,
  })
  if (assistantError) throw new Error(assistantError.message)

  const update: Record<string, unknown> = {
    current_page: args.page,
    last_message_at: now,
    updated_at: now,
  }
  if (!args.currentTitle) update.title = args.message.slice(0, 80)
  const { error: threadError } = await args.supabase
    .from('moni_ai_threads')
    .update(update)
    .eq('id', args.threadId)
    .eq('business_id', BUSINESS_ID)
  if (threadError) throw new Error(threadError.message)

  return agentRun.id
}

function ambiguousAnswer(resolution: Extract<Resolution, { type: 'ambiguous' }>) {
  const lines = [`**${resolution.target}**와 일치할 수 있는 항목이 여러 개입니다.`]
  for (const candidate of resolution.candidates) {
    lines.push(`- ${candidate.kind === 'raw_material' ? '원재료' : '제품'}: **${candidate.name}**${candidate.code ? ` (${candidate.code})` : ''}`)
  }
  lines.push('원하는 항목 이름을 위 목록처럼 한 번만 지정해 주세요. 그러면 바로 단가를 조회합니다.')
  return lines.join('\n\n')
}

export async function tryDirectPriceLookup(request: NextRequest, body: DirectRequestBody) {
  const message = text(body.message, 6000)
  const attachments = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(Boolean) : []
  if (!message || attachments.length || !priceIntent(message)) return null

  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

  const startedAt = Date.now()
  const page = cleanPage(body.page)
  const requestedThreadId = text(body.thread_id, 80)
  const supabase = createMoniServiceRoleClient()

  let resolution: Resolution | null
  try {
    resolution = await resolvePriceEntity(supabase, message)
  } catch (error) {
    console.error('[MONI_DIRECT_PRICE_RESOLUTION_ERROR]', error)
    return null
  }
  if (!resolution) return null

  try {
    const thread = await ensureThread(supabase, session, requestedThreadId, page)
    if (await activeRun(supabase, thread.id)) return busyResponse()

    let answer: string
    let evidence: Record<string, unknown>
    if (resolution.type === 'ambiguous') {
      answer = ambiguousAnswer(resolution)
      evidence = {
        entity_kind: 'ambiguous',
        target: resolution.target,
        candidates: resolution.candidates,
      }
    } else if (resolution.candidate.kind === 'raw_material') {
      const result = await answerRawMaterial(supabase, resolution.candidate)
      answer = result.answer
      evidence = result.evidence
    } else {
      const result = await answerProduct(supabase, resolution.candidate)
      answer = result.answer
      evidence = result.evidence
    }

    const agentRunId = await persistDirectAnswer({
      supabase,
      session,
      threadId: thread.id,
      currentTitle: thread.title,
      page,
      message,
      answer,
      resolution,
      evidence,
      startedAt,
    })

    return NextResponse.json({
      ok: true,
      text: answer,
      thread_id: thread.id,
      provider: DIRECT_PROVIDER,
      model: DIRECT_MODEL,
      agent_runtime: {
        mode: 'MONI_DIRECT_PRICE_LOOKUP_V1',
        agent_run_id: agentRunId,
        conversation_state: 'SERVER_MANAGED',
        direct_lookup: true,
      },
      approval_gated_writes: true,
      read_only: true,
    }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[MONI_DIRECT_PRICE_LOOKUP_ERROR]', error)
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '가격 조회 중 오류가 발생했습니다.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
