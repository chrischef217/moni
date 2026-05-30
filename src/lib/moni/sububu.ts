import { createMoniServiceRoleClient } from '@/lib/moni/db'

export type SububuMaterialSummary = {
  food_type_name: string
  total_usage_g: number
  usage_count: number
  products_used: string[]
}

export type SububuReport = {
  period: {
    from: string
    to: string
  }
  materials: SububuMaterialSummary[]
  total_production_g: number
}

type ProductionRecordRow = {
  product_name?: string | null
  actual_quantity_g?: number | string | null
}

type RecipeRow = {
  product_name?: string | null
  food_type_name?: string | null
  ratio_percent?: number | string | null
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function koreaDateString(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date)
}

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return koreaDateString(date)
}

export function resolveSububuPeriod(from?: string | null, to?: string | null) {
  const resolvedTo = text(to) || koreaDateString(new Date())
  const resolvedFrom = text(from) || daysAgo(30)
  return { from: resolvedFrom, to: resolvedTo }
}

export async function buildSububuReport(options?: {
  from?: string | null
  to?: string | null
  materialName?: string | null
}): Promise<SububuReport> {
  const supabase = createMoniServiceRoleClient()
  const period = resolveSububuPeriod(options?.from, options?.to)
  const materialFilter = text(options?.materialName)

  const productionResult = await supabase
    .from('production_records')
    .select('product_name, actual_quantity_g')
    .gte('work_date', period.from)
    .lte('work_date', period.to)
    .order('work_date', { ascending: true })

  if (productionResult.error) {
    throw new Error(productionResult.error.message || '수불부 계산을 위한 생산기록 조회에 실패했습니다.')
  }

  const productionRows = (productionResult.data ?? []) as ProductionRecordRow[]
  const productionNames = Array.from(
    new Set(
      productionRows
        .map((row) => text(row.product_name))
        .filter(Boolean),
    ),
  )

  const totalProductionG = productionRows.reduce((sum, row) => sum + numberValue(row.actual_quantity_g), 0)

  if (productionNames.length === 0) {
    return {
      period,
      materials: [],
      total_production_g: totalProductionG,
    }
  }

  const recipeResult = await supabase
    .from('recipes')
    .select('product_name, food_type_name, ratio_percent')
    .in('product_name', productionNames)
    .eq('is_active', true)

  if (recipeResult.error) {
    throw new Error(recipeResult.error.message || '수불부 계산을 위한 레시피 조회에 실패했습니다.')
  }

  const recipeRows = (recipeResult.data ?? []) as RecipeRow[]
  const recipeMap = new Map<string, Map<string, number>>()

  for (const row of recipeRows) {
    const productName = text(row.product_name)
    const foodTypeName = text(row.food_type_name)
    if (!productName || !foodTypeName) continue

    const ratioPercent = numberValue(row.ratio_percent)
    const productRecipes = recipeMap.get(productName) ?? new Map<string, number>()
    productRecipes.set(foodTypeName, (productRecipes.get(foodTypeName) ?? 0) + ratioPercent)
    recipeMap.set(productName, productRecipes)
  }

  const materialsMap = new Map<
    string,
    {
      food_type_name: string
      total_usage_g: number
      usage_count: number
      products_used: Set<string>
    }
  >()

  for (const row of productionRows) {
    const productName = text(row.product_name)
    const actualQuantityG = numberValue(row.actual_quantity_g)
    if (!productName || actualQuantityG <= 0) continue

    const recipeEntries = recipeMap.get(productName)
    if (!recipeEntries) continue

    for (const [foodTypeName, ratioPercent] of Array.from(recipeEntries.entries())) {
      if (materialFilter && !foodTypeName.includes(materialFilter)) continue

      const usageG = actualQuantityG * (ratioPercent / 100)
      const current = materialsMap.get(foodTypeName) ?? {
        food_type_name: foodTypeName,
        total_usage_g: 0,
        usage_count: 0,
        products_used: new Set<string>(),
      }

      current.total_usage_g += usageG
      current.usage_count += 1
      current.products_used.add(productName)
      materialsMap.set(foodTypeName, current)
    }
  }

  const materials = Array.from(materialsMap.values())
    .map((item) => ({
      food_type_name: item.food_type_name,
      total_usage_g: Math.round(item.total_usage_g),
      usage_count: item.usage_count,
      products_used: Array.from(item.products_used).sort((a, b) => a.localeCompare(b, 'ko')),
    }))
    .sort((a, b) => b.total_usage_g - a.total_usage_g || a.food_type_name.localeCompare(b.food_type_name, 'ko'))

  return {
    period,
    materials,
    total_production_g: Math.round(totalProductionG),
  }
}
