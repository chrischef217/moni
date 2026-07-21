import { NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text = (value) => String(value ?? '').trim()
const num = (value) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const addDays = (date, days) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000)

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return { start, end: new Date(next.getTime() - 86400000).toISOString().slice(0, 10) }
}
function config(level) {
  if (level === 'stable') return { minimumRuns: 6, maximumGapCv: 0.45, duplicateWindow: 14, label: '안정형' }
  if (level === 'expanded') return { minimumRuns: 3, maximumGapCv: 1.2, duplicateWindow: 7, label: '확장형' }
  return { minimumRuns: 4, maximumGapCv: 0.8, duplicateWindow: 10, label: '표준형' }
}
function buildForecasts(records, plans, month, level) {
  const { start, end } = monthRange(month)
  const rule = config(level)
  const grouped = new Map()
  records.forEach((record) => {
    const productId = text(record.product_id) || `name:${text(record.product_name)}`
    if (!productId || !text(record.work_date)) return
    grouped.set(productId, [...(grouped.get(productId) || []), record])
  })
  const forecasts = []
  Array.from(grouped.entries()).forEach(([productId, rows]) => {
    const ordered = [...rows].sort((a, b) => text(a.work_date).localeCompare(text(b.work_date)))
    if (ordered.length < rule.minimumRuns) return
    const gaps = ordered.slice(1).map((row, index) => dayDiff(text(ordered[index].work_date), text(row.work_date))).filter((gap) => gap > 0)
    if (gaps.length < rule.minimumRuns - 1) return
    const average = gaps.reduce((sum, value) => sum + value, 0) / gaps.length
    const deviation = Math.sqrt(gaps.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / gaps.length)
    const coefficient = average > 0 ? deviation / average : 99
    if (coefficient > rule.maximumGapCv) return
    const gapDays = Math.max(1, Math.round(median(gaps)))
    const quantities = ordered.map((row) => num(row.actual_quantity_g || row.planned_quantity_g)).filter((value) => value > 0)
    if (!quantities.length) return
    const quantity = Math.round(median(quantities))
    let expectedDate = addDays(text(ordered.at(-1).work_date), gapDays)
    while (expectedDate < start) expectedDate = addDays(expectedDate, gapDays)
    while (expectedDate <= end) {
      const duplicated = plans.some((plan) => (text(plan.product_id) || `name:${text(plan.product_name)}`) === productId && Math.abs(dayDiff(expectedDate, text(plan.plan_date))) <= rule.duplicateWindow)
      if (!duplicated) forecasts.push({
        id: `ai-${productId}-${expectedDate}`, source: 'ai', forecast_level: level, forecast_level_label: rule.label,
        plan_date: expectedDate, product_id: productId.startsWith('name:') ? '' : productId,
        product_name: text(ordered.at(-1).product_name), planned_quantity_g: quantity,
        history_count: ordered.length, median_gap_days: gapDays,
        confidence: coefficient <= 0.45 ? '높음' : coefficient <= 0.8 ? '보통' : '낮음',
      })
      expectedDate = addDays(expectedDate, gapDays)
    }
  })
  return forecasts.sort((a, b) => text(a.plan_date).localeCompare(text(b.plan_date)))
}
function buildRequirements(events, recipes, mappings, materials) {
  const materialById = new Map(materials.map((row) => [text(row.id), row]))
  const mappingByRecipe = new Map()
  mappings.forEach((mapping) => {
    const recipeId = text(mapping.recipe_id)
    if (recipeId && text(mapping.raw_material_ref_id) && (!mappingByRecipe.has(recipeId) || mapping.is_default)) mappingByRecipe.set(recipeId, mapping)
  })
  const recipesByProduct = new Map()
  recipes.forEach((recipe) => recipesByProduct.set(text(recipe.product_id), [...(recipesByProduct.get(text(recipe.product_id)) || []), recipe]))
  const totals = new Map()
  const datedUsage = new Map()
  const issues = []
  events.forEach((event) => {
    const productRecipes = recipesByProduct.get(text(event.product_id)) || []
    if (!productRecipes.length) return issues.push({ product_id: event.product_id, product_name: event.product_name, reason: '레시피 없음' })
    productRecipes.forEach((recipe) => {
      if (text(recipe.ingredient_type) && text(recipe.ingredient_type) !== '원재료') return
      const mapping = mappingByRecipe.get(text(recipe.id))
      const material = materialById.get(text(mapping?.raw_material_ref_id))
      if (!material) return issues.push({ product_id: event.product_id, product_name: event.product_name, recipe_item: recipe.food_type_name, reason: '원재료 연결 확인 필요' })
      if (material.is_stock_managed === false || material.is_active === false) return
      const materialId = text(material.id)
      const requiredG = Math.max(0, num(event.planned_quantity_g) * num(recipe.ratio_percent) / 100)
      const current = totals.get(materialId) || { material_id: materialId, material_name: text(material.item_name), current_stock_g: Math.round(num(material.current_stock_g)), required_g: 0 }
      current.required_g += requiredG
      totals.set(materialId, current)
      datedUsage.set(materialId, [...(datedUsage.get(materialId) || []), { date: event.plan_date, product_name: event.product_name, required_g: requiredG }])
    })
  })
  const requirements = Array.from(totals.values()).map((row) => {
    const currentStock = Math.round(num(row.current_stock_g))
    const required = Math.round(num(row.required_g))
    let balance = currentStock
    let firstShortageDate = null
    const details = (datedUsage.get(text(row.material_id)) || []).sort((a, b) => text(a.date).localeCompare(text(b.date))).map((usage) => {
      balance -= num(usage.required_g)
      if (!firstShortageDate && balance < 0) firstShortageDate = text(usage.date)
      return { ...usage, required_g: Math.round(num(usage.required_g)), projected_balance_g: Math.round(balance) }
    })
    const projected = currentStock - required
    return { ...row, required_g: required, projected_balance_g: projected, shortage_g: Math.max(0, -projected), first_shortage_date: firstShortageDate, status: projected < 0 ? '부족' : projected < currentStock * 0.15 ? '주의' : '충분', details }
  }).sort((a, b) => num(b.shortage_g) - num(a.shortage_g))
  return { requirements, issues }
}

export async function GET(request) {
  try {
    const month = text(request.nextUrl.searchParams.get('month')) || new Date().toISOString().slice(0, 7)
    const level = text(request.nextUrl.searchParams.get('level')) || 'standard'
    const { start, end } = monthRange(month)
    const supabase = createMoniServiceRoleClient()
    const [plansR, recordsR, recipesR, mappingsR, materialsR] = await Promise.all([
      supabase.from('monthly_production_plans').select('*').gte('plan_date', start).lte('plan_date', end).order('plan_date'),
      supabase.from('production_records').select('id, work_date, product_id, product_name, planned_quantity_g, actual_quantity_g, status').lt('work_date', start).eq('status', '완료').order('work_date'),
      supabase.from('recipes').select('id, product_id, product_name, food_type_name, ratio_percent, ingredient_type, is_active').eq('is_active', true),
      supabase.from('raw_material_mapping').select('recipe_id, raw_material_ref_id, is_default'),
      supabase.from('raw_materials').select('id, item_name, current_stock_g, is_active, is_stock_managed').eq('is_active', true),
    ])
    ;[plansR, recordsR, recipesR, mappingsR, materialsR].forEach((result) => { if (result.error) throw new Error(result.error.message) })
    const plans = (plansR.data || []).map((row) => ({ ...row, source: 'user' }))
    const forecasts = buildForecasts(recordsR.data || [], plans, month, level)
    const confirmed = buildRequirements(plans, recipesR.data || [], mappingsR.data || [], materialsR.data || [])
    const aiOnly = buildRequirements(forecasts, recipesR.data || [], mappingsR.data || [], materialsR.data || [])
    const products = Array.from(new Map((recipesR.data || []).map((row) => [text(row.product_id), { id: text(row.product_id), name: text(row.product_name) }])).values()).filter((product) => product.id && product.name).sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ ok: true, month, level, plans, forecasts, products, confirmed, ai_only: aiOnly, with_ai: aiOnly })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '월간 생산계획 조회에 실패했습니다.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const quantity = Math.round(num(body.planned_quantity_g))
    if (!text(body.plan_date) || !text(body.product_id) || !text(body.product_name) || quantity <= 0) return NextResponse.json({ ok: false, error: '생산일, 제품, 생산예정량을 확인해 주세요.' }, { status: 400 })
    const result = await createMoniServiceRoleClient().from('monthly_production_plans').insert({ plan_date: text(body.plan_date), product_id: text(body.product_id), product_name: text(body.product_name), planned_quantity_g: quantity, note: text(body.note) || null, business_id: text(body.business_id) || 'default' }).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, plan: result.data })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '생산계획 저장에 실패했습니다.' }, { status: 500 }) }
}
export async function PATCH(request) {
  try {
    const body = await request.json()
    if (!text(body.id)) return NextResponse.json({ ok: false, error: '계획 ID가 필요합니다.' }, { status: 400 })
    const result = await createMoniServiceRoleClient().from('monthly_production_plans').update({ plan_date: text(body.plan_date), product_id: text(body.product_id), product_name: text(body.product_name), planned_quantity_g: Math.round(num(body.planned_quantity_g)), note: text(body.note) || null, updated_at: new Date().toISOString() }).eq('id', text(body.id)).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, plan: result.data })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '생산계획 수정에 실패했습니다.' }, { status: 500 }) }
}
export async function DELETE(request) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '계획 ID가 필요합니다.' }, { status: 400 })
    const result = await createMoniServiceRoleClient().from('monthly_production_plans').delete().eq('id', id)
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '생산계획 삭제에 실패했습니다.' }, { status: 500 }) }
}
