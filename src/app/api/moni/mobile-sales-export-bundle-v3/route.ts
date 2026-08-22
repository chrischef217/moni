import { NextRequest, NextResponse } from 'next/server'
import { GET as safeGET, POST as safePOST } from '../mobile-sales-export-bundle-v2/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const txt = (value: unknown, max = 600) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const norm = (value: unknown) => txt(value).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
const baseNorm = (value: unknown) => {
  const withoutNotes = txt(value).replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ')
  const normalized = norm(withoutNotes)
  return normalized.startsWith('두배') ? normalized.slice(2) : normalized
}

function productSnapshot(setting: any) {
  return Array.isArray(setting?.products) ? setting.products[0] : setting?.products
}

function aliases(option: any) {
  const setting = option?.meta || {}
  const product = productSnapshot(setting)
  const values = [option?.label, product?.product_name, product?.product_code, setting?.english_name]
  const out = new Set<string>()
  for (const raw of values) {
    const full = norm(raw)
    const base = baseNorm(raw)
    if (full) out.add(full)
    if (base) out.add(base)
  }
  return [...out]
}

function scoreCandidate(query: unknown, specification: unknown, option: any) {
  const full = norm(query)
  const base = baseNorm(query)
  const spec = baseNorm(specification)
  if (!full && !base) return 0
  const names = aliases(option)
  let score = 0
  for (const name of names) {
    if (base && name === base) score = Math.max(score, 140)
    else if (full && name === full) score = Math.max(score, 135)
    else if (base.length >= 3 && name.includes(base)) score = Math.max(score, 100)
    else if (base.length >= 3 && base.includes(name) && name.length >= 3) score = Math.max(score, 92)
  }
  if (!score) return 0
  if (spec) {
    const setting = option?.meta || {}
    const product = productSnapshot(setting)
    const detail = baseNorm(`${product?.product_name || ''} ${product?.product_spec || ''} ${setting?.english_name || ''}`)
    if (detail.includes(spec)) score += 30
  }
  return score
}

function rankedCandidates(query: unknown, specification: unknown, options: any[]) {
  return options
    .map((option) => ({ option, score: scoreCandidate(query, specification, option) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || txt(a.option?.label).localeCompare(txt(b.option?.label), 'ko'))
}

function uniqueStrongMatch(query: unknown, specification: unknown, options: any[]) {
  const ranked = rankedCandidates(query, specification, options)
  if (!ranked.length) return null
  const first = ranked[0]
  const second = ranked[1]
  if (first.score >= 130) return first.option
  if (first.score >= 100 && (!second || first.score - second.score >= 25)) return first.option
  if (first.score >= 92 && ranked.length === 1) return first.option
  return null
}

function inferredCartons(row: any, setting: any) {
  const explicit = Math.trunc(num(row?.cartons))
  if (explicit > 0) return explicit
  const quantity = num(row?.source_quantity)
  const unit = txt(row?.source_unit, 30).toUpperCase()
  if (quantity <= 0) return 0
  if ((unit === 'CTN' || unit === 'BOX') && Number.isInteger(quantity)) return quantity
  if (unit === 'EA' && num(setting?.units_per_carton) > 0) {
    const ratio = quantity / num(setting.units_per_carton)
    if (ratio >= 1 && Math.abs(ratio - Math.round(ratio)) < 0.000001) return Math.round(ratio)
  }
  if (unit === 'KG' && num(setting?.net_weight_kg) > 0) {
    const ratio = quantity / num(setting.net_weight_kg)
    if (ratio >= 1 && Math.abs(ratio - Math.round(ratio)) < 0.000001) return Math.round(ratio)
  }
  return 0
}

function semanticKey(row: any) {
  const target = txt(row?.export_product_setting_id, 120)
  const productKey = target ? `id:${target}` : `q:${baseNorm(row?.source_query)}`
  return [productKey, baseNorm(row?.source_specification), String(num(row?.source_quantity)), txt(row?.source_unit, 30).toUpperCase()].join('|')
}

function dedupeSemantic(rows: any[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = semanticKey(row)
    if (!key.replaceAll('|', '') || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function suggestionRows(query: unknown, specification: unknown, options: any[]) {
  return rankedCandidates(query, specification, options).slice(0, 4).map(({ option, score }) => ({
    id: txt(option?.id, 120),
    label: txt(option?.label, 220),
    sub: txt(option?.sub, 320),
    score,
  }))
}

function blankItemRow() {
  return {
    source_query: '',
    source_specification: '',
    source_quantity: '',
    source_unit: '',
    export_product_setting_id: '',
    cartons: '',
    unit_price: '',
    match_mode: 'manual_required',
  }
}

function normalizeDraft(card: any) {
  const fields = { ...(card?.fields || {}) }
  const options = Array.isArray(card?.options?.export_products) ? card.options.export_products : []
  const rawSourceRows = Array.isArray(fields.items) ? fields.items : []
  const sourceRows = rawSourceRows.length ? rawSourceRows : [blankItemRow()]

  const matchedRows = sourceRows.map((row: any) => {
    const existing = options.find((option: any) => txt(option?.id, 120) === txt(row?.export_product_setting_id, 120)) || null
    const selected = existing || uniqueStrongMatch(row?.source_query, row?.source_specification, options)
    if (!selected) return { ...row, export_product_setting_id: '', match_mode: row?.match_mode || 'unresolved' }
    const setting = selected?.meta || {}
    const cartons = inferredCartons(row, setting)
    return {
      ...row,
      export_product_setting_id: txt(selected.id, 120),
      cartons: cartons || row?.cartons || '',
      unit_price: row?.unit_price === '' || row?.unit_price === null || row?.unit_price === undefined ? setting?.default_unit_price ?? '' : row.unit_price,
      price_overridden: false,
      price_override_reason: '',
      match_mode: existing ? (row?.match_mode || 'canonical') : 'auto_similar',
      matched_label: txt(selected.label, 220),
    }
  })

  const items = dedupeSemantic(matchedRows)
  fields.items = items

  const destinations = Array.isArray(card?.options?.destinations) ? card.options.destinations : []
  const selectedDestination = destinations.find((row: any) => txt(row?.id, 120) === txt(fields.consignee_id, 120))
  const missing: string[] = []
  if (!selectedDestination) missing.push('수출처(Consignee)')
  else if (!txt(selectedDestination?.sales_client_id, 120)) missing.push(`수출처 “${txt(selectedDestination?.label, 220)}”의 판매관리 매출처 연결`)

  const unresolved: any[] = []
  items.forEach((row: any, index: number) => {
    if (!txt(row?.export_product_setting_id, 120)) {
      const suggestions = suggestionRows(row?.source_query, row?.source_specification, options)
      missing.push(row?.source_query
        ? `${index + 1}번째 품목 “${txt(row?.source_query, 220)}”의 공식 수출품목 확인`
        : `${index + 1}번째 수출품목 선택`)
      unresolved.push({
        index,
        query: txt(row?.source_query, 220),
        specification: txt(row?.source_specification, 220),
        quantity: row?.source_quantity ?? null,
        unit: txt(row?.source_unit, 30),
        suggestions,
      })
    } else if (num(row?.cartons) < 1) {
      missing.push(`${index + 1}번째 ${txt(row?.source_query, 220) || '수출품목'}의 CTN 수량 또는 포장단위 확인`)
    }
  })

  const extracted = { ...(card?.extracted_context || {}) }
  if (Array.isArray(extracted.items)) {
    const raw = extracted.items.map((row: any) => ({
      source_query: row?.name,
      source_specification: row?.specification,
      source_quantity: row?.quantity,
      source_unit: row?.unit,
    }))
    extracted.items = dedupeSemantic(raw).map((row: any) => ({
      name: row.source_query,
      specification: row.source_specification || undefined,
      quantity: row.source_quantity ?? null,
      unit: row.source_unit || undefined,
    }))
  }

  return {
    ...card,
    fields,
    missing_fields: [...new Set(missing)],
    unresolved_items: unresolved,
    extracted_context: extracted,
  }
}

export async function GET(request: NextRequest) {
  const response = await safeGET(request)
  if (!response.ok) return response
  const payload = await response.json().catch(() => null) as Record<string, any> | null
  if (!payload) return NextResponse.json({ ok: false, error: '수출 문서 카드 응답을 읽지 못했습니다.' }, { status: 500 })
  if (payload?.card?.domain === 'sales_export_bundle' && payload?.card?.stage === 'draft') {
    payload.card = normalizeDraft(payload.card)
  }
  return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  return safePOST(request)
}