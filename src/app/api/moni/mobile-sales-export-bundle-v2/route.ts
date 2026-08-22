import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '../mobile-sales-export-bundle/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const txt = (value: unknown, max = 600) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const norm = (value: unknown) => txt(value).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '')

function productSnapshot(setting: any) {
  return Array.isArray(setting?.products) ? setting.products[0] : setting?.products
}

function aliasesForProduct(option: any) {
  const setting = option?.meta || {}
  const product = productSnapshot(setting)
  const aliases = new Set<string>()
  for (const raw of [option?.label, product?.product_name, product?.product_code, setting?.english_name]) {
    const value = norm(raw)
    if (!value) continue
    aliases.add(value)
    if (value.startsWith('두배') && value.length > 2) aliases.add(value.slice(2))
  }
  return [...aliases]
}

function uniqueProductMatch(query: unknown, specification: unknown, options: any[]) {
  const needle = norm(query)
  const spec = norm(specification)
  if (!needle) return null

  const ranked = options.map((option) => {
    const aliases = aliasesForProduct(option)
    const exact = aliases.some((alias) => alias === needle)
    const contained = !exact && needle.length >= 3 && aliases.some((alias) => alias.includes(needle) || needle.includes(alias))
    if (!exact && !contained) return null
    const setting = option?.meta || {}
    const product = productSnapshot(setting)
    const detail = norm(`${product?.product_name || ''}${product?.product_spec || ''}${setting?.english_name || ''}`)
    return { option, score: (exact ? 100 : 60) + (spec && detail.includes(spec) ? 20 : 0) }
  }).filter(Boolean) as Array<{ option: any; score: number }>

  if (!ranked.length) return null
  const bestScore = Math.max(...ranked.map((row) => row.score))
  const best = ranked.filter((row) => row.score === bestScore)
  return best.length === 1 ? best[0].option : null
}

const COUNTRY_RULES = [
  { query: ['라오스', 'laos', 'laopdr'], country: ['lao', 'laopdr'] },
  { query: ['태국', 'thailand'], country: ['thailand'] },
  { query: ['베트남', 'vietnam'], country: ['vietnam'] },
  { query: ['캄보디아', 'cambodia'], country: ['cambodia'] },
  { query: ['미얀마', 'myanmar'], country: ['myanmar'] },
  { query: ['말레이시아', 'malaysia'], country: ['malaysia'] },
  { query: ['싱가포르', 'singapore'], country: ['singapore'] },
  { query: ['인도네시아', 'indonesia'], country: ['indonesia'] },
  { query: ['필리핀', 'philippines'], country: ['philippines'] },
  { query: ['일본', 'japan'], country: ['japan'] },
  { query: ['중국', 'china'], country: ['china'] },
]

function uniqueDestinationMatch(query: unknown, options: any[]) {
  const needle = norm(query)
  if (!needle) return null

  const direct = options.filter((option) => {
    const label = norm(option?.label)
    return needle === label || (label.length >= 3 && needle.includes(label))
  })
  if (direct.length === 1) return direct[0]

  const countryNeedles = COUNTRY_RULES
    .filter((rule) => rule.query.some((alias) => needle.includes(norm(alias))))
    .flatMap((rule) => rule.country.map(norm))
  if (!countryNeedles.length) return null

  const byCountry = options.filter((option) => {
    const location = norm(option?.sub)
    return countryNeedles.some((alias) => location.includes(alias))
  })
  return byCountry.length === 1 ? byCountry[0] : null
}

function uniqueDestinationFromContext(extracted: any, options: any[]) {
  const consigneeQuery = txt(extracted?.consignee_query, 300)
  const finalDestination = txt(extracted?.final_destination, 240)

  const direct = uniqueDestinationMatch(consigneeQuery, options)
  if (direct) return direct

  const combined = [consigneeQuery, finalDestination].filter(Boolean).join(' ')
  const byCombinedContext = uniqueDestinationMatch(combined, options)
  if (byCombinedContext) return byCombinedContext

  const byDestinationOnly = uniqueDestinationMatch(finalDestination, options)
  if (byDestinationOnly) return byDestinationOnly

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

function dedupeItems(rows: any[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = [row?.source_query, row?.source_specification, row?.source_quantity, row?.source_unit]
      .map((value) => norm(value))
      .join('|')
    if (!key.replaceAll('|', '') || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function suggestionRows(query: unknown, options: any[]) {
  const needle = norm(query)
  if (!needle) return []
  return options.filter((option) => aliasesForProduct(option).some((alias) => alias.includes(needle) || needle.includes(alias))).slice(0, 6)
    .map((option) => ({ id: txt(option.id, 120), label: txt(option.label, 220), sub: txt(option.sub, 300) }))
}

function normalizeDraft(card: any) {
  const fields = { ...(card?.fields || {}) }
  const destinations = Array.isArray(card?.options?.destinations) ? card.options.destinations : []
  const exportProducts = Array.isArray(card?.options?.export_products) ? card.options.export_products : []
  const extracted = card?.extracted_context || {}

  if (!txt(fields.consignee_id)) {
    const matchedDestination = uniqueDestinationFromContext(extracted, destinations)
    if (matchedDestination) {
      fields.consignee_id = txt(matchedDestination.id, 120)
      if (!txt(fields.final_destination)) fields.final_destination = txt(matchedDestination.sub, 180).split(' · ')[0]
    }
  }

  const sourceItems = dedupeItems(Array.isArray(fields.items) ? fields.items : [])
  const items = sourceItems.map((row) => {
    let selected = exportProducts.find((option: any) => txt(option.id, 120) === txt(row?.export_product_setting_id, 120)) || null
    if (!selected) selected = uniqueProductMatch(row?.source_query, row?.source_specification, exportProducts)
    if (!selected) return { ...row, export_product_setting_id: '', cartons: row?.cartons || '' }

    const setting = selected?.meta || {}
    const cartons = inferredCartons(row, setting)
    return {
      ...row,
      export_product_setting_id: txt(selected.id, 120),
      cartons: cartons || row?.cartons || '',
      unit_price: row?.unit_price === '' || row?.unit_price === null || row?.unit_price === undefined ? setting?.default_unit_price ?? '' : row.unit_price,
      price_overridden: false,
      price_override_reason: '',
    }
  })
  fields.items = items

  const missing: string[] = []
  const selectedDestination = destinations.find((row: any) => txt(row.id, 120) === txt(fields.consignee_id, 120))
  if (!selectedDestination) missing.push(extracted?.consignee_query ? `수출처 “${txt(extracted.consignee_query, 220)}” 확인` : '수출처(Consignee)')
  else if (!txt(selectedDestination.sales_client_id, 120)) missing.push(`수출처 “${txt(selectedDestination.label, 220)}”의 판매관리 매출처 연결`)

  const unresolved: any[] = []
  items.forEach((row, index) => {
    if (!txt(row?.export_product_setting_id, 120)) {
      missing.push(`${index + 1}번째 품목 “${txt(row?.source_query, 220)}”의 공식 수출품목 매칭`)
      unresolved.push({
        index,
        query: txt(row?.source_query, 220),
        specification: txt(row?.source_specification, 220),
        quantity: row?.source_quantity ?? null,
        unit: txt(row?.source_unit, 30),
        suggestions: suggestionRows(row?.source_query, exportProducts),
      })
    } else if (num(row?.cartons) < 1) {
      missing.push(`${index + 1}번째 ${txt(row?.source_query, 220)}의 CTN 수량 또는 포장단위 확인`)
    }
  })
  if (!items.length) missing.push('수출 품목과 수량')

  const extractedItems = dedupeItems((Array.isArray(extracted?.items) ? extracted.items : []).map((row: any) => ({
    source_query: row?.name,
    source_specification: row?.specification,
    source_quantity: row?.quantity,
    source_unit: row?.unit,
  }))).map((row) => ({
    name: row.source_query,
    specification: row.source_specification || undefined,
    quantity: row.source_quantity ?? null,
    unit: row.source_unit || undefined,
  }))

  return {
    ...card,
    fields,
    missing_fields: [...new Set(missing)],
    unresolved_items: unresolved,
    extracted_context: { ...extracted, items: extractedItems },
  }
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  if (!response.ok) return response
  const payload = await response.json().catch(() => null) as Record<string, any> | null
  if (!payload) return NextResponse.json({ ok: false, error: '수출 문서 카드 응답을 읽지 못했습니다.' }, { status: 500 })
  if (payload?.card?.domain === 'sales_export_bundle' && payload?.card?.stage === 'draft') {
    payload.card = normalizeDraft(payload.card)
  }
  return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  return legacyPOST(request)
}
