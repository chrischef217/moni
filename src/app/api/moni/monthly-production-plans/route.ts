import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>
type ForecastLevel = 'stable' | 'standard' | 'expanded'

const text = (value: unknown) => String(value ?? '').trim()
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000)

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('조회 월 형식이 올바르지 않습니다.')
  const start = `${month}-01`
  const next = new Date(`${start}T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const nextStart = next.toISOString().slice(0, 10)
  const endDate = new Date(next.getTime() - 86400000).toISOString().slice(0, 10)
  return { start, end: endDate, nextStart }
}

function forecastConfig(level: ForecastLevel) {
  if (level === 'stable') return { minimumRuns: 6, maximumGapCv: 0.45, duplicateWindow: 14, label: '안정형' }
  if (level === 'expanded') return { minimumRuns: 3, maximumGapCv: 1.2, duplicateWindow: 7, label: '확장형' }
  return { minimumRuns: 4, maximumGapCv: 0.8, duplicateWindow: 10, label: '표준형' }
}

function buildForecasts(records: Row[], plans: Row[], month: string, level: ForecastLevel) {
  const { start, end } = monthRange(month)
  const config = forecastConfig(level)
  const grouped = new Map<string, Row[]>()
  for (const record of records) {
    const productId = text(record.product_id) || `name:${text(record.product_name)}`
    if (!productId || !text(record.work_date)) continue
    const group = grouped.get(productId) ?? []
    group.push(record)
    grouped.set(productId, group)
  }

  const forecasts: Row[] = []
  for (const [productId, rows] of grouped) {
    const byDate = [...rows].sort((a, b) => text(a.work_date).localeCompare(text(b.work_date)))
    if (byDate.length < config.minimumRuns) continue
    const gaps = byDate.slice(1).map((row, index) => dayDiff(text(byDate[index].work_date), text(row.work_date))).filter((gap) => gap > 0)
    if (gaps.length < config.minimumRuns - 1) continue
    const averageGap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length
    const deviation = Math.sqrt(gaps.reduce((sum, value) => sum + Math.pow(value - averageGap, 2), 0) / gaps.length)
    const coefficient = averageGap > 0 ? deviation / averageGap : 99
    if (coefficient > config.maximumGapCv) continue
    const gapDays = Math.max(1, Math.round(median(gaps)))
    const quantities = byDate.map((row) => numberValue(row.actual_quantity_g || row.planned_quantity_g)).filter((value) => value > 0)
    if (!quantities.length) continue
    const forecastQuantity = Math.round(median(quantities))
    let expectedDate = addDays(text(byDate[byDate.length - 1].work_date), gapDays)
    while (expectedDate < start) expectedDate = addDays(expectedDate, gapDays)
    while (expectedDate <= end) {
      const duplicated = plans.some((plan) => {
        const planProduct = text(plan.product_id) || `name:${text(plan.product_name)}`
        return planProduct === productId && Math.abs(dayDiff(expectedDate, text(plan.plan_date))) <= config.duplicateWindow
      })
      if (!duplicated) {
        forecasts.push({
          id: `ai-${productId}-${expectedDate}`,
          source: 'ai',
          forecast_level: level,
          forecast_level_label: config.label,
          plan_date: expectedDate,
          product_id: productId.startsWith('name:') ? '' : productId,
          product_name: text(byDate[byDate.length - 1].product_name),
          planned_quantity_g: forecastQuantity,
          history_count: byDate.length,
          median_gap_days: gapDays,
          confidence: coefficient <= 0.45 ? '높음' : coefficient <= 0.8 ? '보통' : '낮음',
        })
      }
      expectedDate = addDays(expectedDate, gapDays)
    }
  }
  return forecasts.sort((a, b) => text(a.plan_date).localeCompare(text(b.plan_date)))
}

function buildRequirements(events: Row[], recipes: Row[], mappings: Row[], materials: Row[]) {
  const materialById = new Map(materials.map((row) => [text(row.id), row]))
  const mappingByRecipe = new Map<string, Row>()
  for (const mapping of mappings) {
    const recipeId = text(mapping.recipe_id)
    if (!recipeId || !text(mapping.raw_material_ref_id)) continue
    if (!mappingByRecipe.has(recipeId) || Boolean(mapping.is_default)) mappingByRecipe.set(recipeId, mapping)
  }
  const recipesByProduct = new Map<string, Row[]>()
  for (const recipe of recipes) {
    const productId = text(recipe.product_id)
    const group = recipesByProduct.get(productId) ?? []
    group.push(recipe)
    recipesByProduct.set(productId, group)
  }

  const totals = new Map<string, Row>()
  const issues: Row[] = []
  const datedUsage = new Map<string, Row[]>()

  for (const event of events) {
    const productId = text(event.product_id)
    const productRecipes = recipesByProduct.get(productId) ?? []
    if (!productRecipes.length) {
      issues.push({ product_id: productId, product_name: event.product_name, reason: '레시피 없음' })
      continue
    }
    for (const recipe of productRecipes) {
      if (text(recipe.ingredient_type) && text(recipe.ingredient_type) !== '원재료') continue
      const mapping = mappingByRecipe.get(text(recipe.id))
      const materialId = text(mapping?.raw_material_ref_id)
      const material = materialById.get(materialId)
      if (!material) {
        issues.push({ product_id: productId, product_name: event.product_name, recipe_item: recipe.food_type_name, reason: '원재료 연결 확인 필요' })
        continue
      }
      if (material.is_stock_managed === false || material.is_active === false) continue
      const requiredG = Math.max(0, numberValue(event.planned_quantity_g) * numberValue(recipe.ratio_percent) / 100)
      const current = totals.get(materialId) ?? {
        material_id: materialId,
        material_name: text(material.item_name),
        current_stock_g: Math.round(numberValue(material.current_stock_g)),
        required_g: 0,
      }
      current.required_g = numberValue(current.required_g) + requiredG
      totals.set(materialId, current)
      const usages = datedUsage.get(materialId) ?? []
      usages.push({ date: event.plan_date, product_name: event.product_name, required_g: requiredG })
      datedUsage.set(materialId, usages)
    }
  }

  const requirements = [...totals.values()].map((row) => {
    const currentStock = Math.round(numberValue(row.current_stock_g))
    const required = Math.round(numberValue(row.required_g))
    let balance = currentStock
    let firstShortageDate: string | null = null
    const details = (datedUsage.get(text(row.material_id)) ?? []).sort((a, b) => text(a.date).localeCompare(text(b.date))).map((usage) => {
      balance -= numberValue(usage.required_g)
      if (!firstShortageDate && balance < 0) firstShortageDate = text(usage.date)
      return { ...usage, required_g: Math.round(numberValue(usage.required_g)), projected_balance_g: Math.round(balance) }
    })
    const projected = currentStock - required
    return {
      ...row,
      required_g: required,
      projected_balance_g: projected,
      shortage_g: Math.max(0, -projected),
      first_shortage_date: firstShortageDate,
      status: projected < 0 ? '부족' : projected < currentStock * 0.15 ? '주의' : '충분',
      details,
    }
  }).sort((a, b) => numberValue(b.shortage_g) - numberValue(a.shortage_g) || text(a.material_name).localeCompare(text(b.material_name)))

  return { requirements, issues }
}

export async function GET(request: NextRequest) {
  try {
    const month = text(request.nextUrl.searchParams.get('month')) || new Date().toISOString().slice(0, 7)
    const level = (text(request.nextUrl.searchParams.get('level')) || 'standard') as ForecastLevel
    const { start, end } = monthRange(month)
    const supabase = createMoniServiceRoleClient()
    const [planResult, productionResult, recipeResult, mappingResult, materialResult] = await Promise.all([
      supabase.from('monthly_production_plans').select('*').gte('plan_date', start).lte('plan_date', end).order('plan_date'),
      supabase.from('production_records').select('id, work_date, product_id, product_name, planned_quantity_g, actual_quantity_g, status').lt('work_date', start).eq('status', '완료').order('work_date'),
      supabase.from('recipes').select('id, product_id, product_name, food_type_name, ratio_percent, ingredient_type, is_active').eq('is_active', true),
      supabase.from('raw_material_mapping').select('recipe_id, raw_material_ref_id, is_default'),
      supabase.from('raw_materials').select('id, item_name, current_stock_g, is_active, is_stock_managed').eq('is_active', true),
    ])
    for (const result of [planResult, productionResult, recipeResult, mappingResult, materialResult]) {
      if (result.error) throw new Error(result.error.message)
    }
    const plans = (planResult.data ?? []).map((row) => ({ ...row, source: 'user' })) as Row[]
    const forecasts = buildForecasts((productionResult.data ?? []) as Row[], plans, month, level)
    const confirmed = buildRequirements(plans, (recipeResult.data ?? []) as Row[], (mappingResult.data ?? []) as Row[], (materialResult.data ?? []) as Row[])
    const withAi = buildRequirements([...plans, ...forecasts], (recipeResult.data ?? []) as Row[], (mappingResult.data ?? []) as Row[], (materialResult.data ?? []) as Row[])
    const products = [...new Map((recipeResult.data ?? []).map((row) => [text(row.product_id), { id: text(row.product_id), name: text(row.product_name) }])).values()]
      .filter((product) => product.id && product.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ ok: true, month, level, plans, forecasts, products, confirmed, with_ai: withAi })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '월간 생산계획 조회에 실패했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Row
    const planDate = text(body.plan_date)
    const productId = text(body.product_id)
    const productName = text(body.product_name)
    const quantityG = Math.round(numberValue(body.planned_quantity_g))
    if (!planDate || !productId || !productName || quantityG <= 0) {
      return NextResponse.json({ ok: false, error: '생산일, 제품, 생산예정량을 확인해 주세요.' }, { status: 400 })
    }
    const supabase = createMoniServiceRoleClient()
    const result = await supabase.from('monthly_production_plans').insert({
      plan_date: planDate,
      product_id: productId,
      product_name: productName,
      planned_quantity_g: quantityG,
      note: text(body.note) || null,
      business_id: text(body.business_id) || 'default',
    }).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, plan: result.data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '생산계획 저장에 실패했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Row
    const id = text(body.id)
    if (!id) return NextResponse.json({ ok: false, error: '계획 ID가 필요합니다.' }, { status: 400 })
    const supabase = createMoniServiceRoleClient()
    const result = await supabase.from('monthly_production_plans').update({
      plan_date: text(body.plan_date),
      product_id: text(body.product_id),
      product_name: text(body.product_name),
      planned_quantity_g: Math.round(numberValue(body.planned_quantity_g)),
      note: text(body.note) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, plan: result.data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '생산계획 수정에 실패했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '계획 ID가 필요합니다.' }, { status: 400 })
    const supabase = createMoniServiceRoleClient()
    const result = await supabase.from('monthly_production_plans').delete().eq('id', id)
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '생산계획 삭제에 실패했습니다.' }, { status: 500 })
  }
}
