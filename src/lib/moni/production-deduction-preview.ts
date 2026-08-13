import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { CANONICAL_MONI_BUSINESS_ID } from '@/lib/moni/v1-contracts'

type RecipeRow = {
  id: string
  product_id: string | null
  product_name: string | null
  food_type_id: string | null
  food_type_name: string | null
  ratio_percent: number | string | null
  ingredient_type: string | null
  semi_product_id?: string | null
}

type MappingRow = {
  food_type_id: string | null
  raw_material_id: string | number | null
  raw_material_ref_id?: string | null
  raw_material_name: string | null
  recipe_id?: string | null
  product_id?: string | null
  mapping_scope?: string | null
}

type MaterialRow = {
  id: string
  item_code: string | null
  item_name: string
  current_stock_g: number | string | null
  is_stock_managed?: boolean | null
}

export type ProductionDeductionRow = {
  material_id: string | null
  item_code: string | null
  material_name: string
  food_type_name: string
  source_label?: string
  required_g: number
  current_stock_g: number
  remaining_stock_g: number
  insufficient: boolean
}

export type ProductionDeductionPreview = {
  materials: ProductionDeductionRow[]
  breakdown: ProductionDeductionRow[]
  totalRequiredG: number
  hasInsufficient: boolean
  hasMissingMapping: boolean
  deductionBasisG: number
  enteredQuantityG: number
  lossQuantityG: number
  plannedQuantityG: number | null
}

const text = (value: unknown) => String(value ?? '').trim()

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizedKey(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, '')
}

function rawIngredient(value: unknown) {
  const normalized = normalizedKey(value)
  return !normalized || ['원재료', 'raw', '제품/반제품', '제품반제품', 'productsemi', 'hybridsemi'].includes(normalized)
}

function pureSemiIngredient(value: unknown) {
  return ['반제품', 'semi', 'semiproduct'].includes(normalizedKey(value))
}

function mappingScope(value: unknown): 'recipe' | 'product' | 'global' {
  const normalized = text(value).toLowerCase()
  return normalized === 'recipe' || normalized === 'product' ? normalized : 'global'
}

type ExpandedRecipe = {
  recipe: RecipeRow
  effectiveRatioPercent: number
  sourceLabel: string
}

async function expandedRecipes(record: Record<string, unknown>): Promise<ExpandedRecipe[]> {
  const supabase = createMoniServiceRoleClient()
  const cache = new Map<string, RecipeRow[]>()

  const load = async (productId: string) => {
    if (!productId) return []
    const cached = cache.get(productId)
    if (cached) return cached
    const result = await supabase
      .from('recipes')
      .select('*')
      .eq('product_id', productId)
      .eq('business_id', CANONICAL_MONI_BUSINESS_ID)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (result.error) throw new Error(`레시피 조회 실패: ${result.error.message}`)
    const rows = (result.data ?? []) as RecipeRow[]
    cache.set(productId, rows)
    return rows
  }

  const rootProductId = text(record.product_id)
  const rootProductName = text(record.product_name) || '완제품'
  const output: ExpandedRecipe[] = []

  const expand = async (
    rows: RecipeRow[],
    factorPercent: number,
    sourceLabel: string,
    depth: number,
    visited: Set<string>,
  ) => {
    for (const row of rows) {
      const ratio = numberValue(row.ratio_percent) ?? 0
      const effectiveRatioPercent = (factorPercent * ratio) / 100
      if (effectiveRatioPercent <= 0) continue

      const semiProductId = text(row.semi_product_id)
      if (pureSemiIngredient(row.ingredient_type) && semiProductId && depth < 5) {
        const visitKey = `${semiProductId}:${text(row.id)}`
        if (!visited.has(visitKey)) {
          const nested = await load(semiProductId)
          if (nested.length) {
            const nextVisited = new Set(visited)
            nextVisited.add(visitKey)
            await expand(nested, effectiveRatioPercent, text(row.product_name) || sourceLabel, depth + 1, nextVisited)
            continue
          }
        }
      }

      output.push({
        recipe: {
          ...row,
          product_id: text(row.product_id) || rootProductId || null,
          product_name: text(row.product_name) || rootProductName,
        },
        effectiveRatioPercent,
        sourceLabel,
      })
    }
  }

  await expand(await load(rootProductId), 100, rootProductName, 0, new Set())
  return output
}

export async function assertNoExistingProductionOutbound(record: Record<string, unknown>) {
  const recordId = text(record.id)
  const lotNumber = text(record.lot_number)
  const supabase = createMoniServiceRoleClient()

  const linked = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('business_id', CANONICAL_MONI_BUSINESS_ID)
    .eq('txn_type', 'OUTBOUND')
    .eq('production_record_id', recordId)
    .limit(1)
  if (linked.error) throw new Error(`생산소모 중복 확인 실패: ${linked.error.message}`)
  if ((linked.data ?? []).length) throw new Error('이미 원재료 차감이 완료된 생산기록입니다.')

  let legacy = supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('business_id', CANONICAL_MONI_BUSINESS_ID)
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%production_record_id=${recordId}%`)
    .limit(1)
  const byRecord = await legacy
  if (byRecord.error) throw new Error(`기존 생산소모 확인 실패: ${byRecord.error.message}`)
  if ((byRecord.data ?? []).length) throw new Error('이미 원재료 차감이 완료된 생산기록입니다.')

  if (lotNumber) {
    legacy = supabase
      .from('raw_material_transactions')
      .select('id')
      .eq('business_id', CANONICAL_MONI_BUSINESS_ID)
      .eq('txn_type', 'OUTBOUND')
      .ilike('note', `%lot_number=${lotNumber}%`)
      .limit(1)
    const byLot = await legacy
    if (byLot.error) throw new Error(`기존 LOT 생산소모 확인 실패: ${byLot.error.message}`)
    if ((byLot.data ?? []).length) throw new Error('이미 원재료 차감이 완료된 LOT입니다.')
  }
}

export async function buildCanonicalProductionDeductionPreview(
  record: Record<string, unknown>,
): Promise<ProductionDeductionPreview> {
  if (text(record.business_id) !== CANONICAL_MONI_BUSINESS_ID) {
    throw new Error('canonical 사업자의 생산기록만 차감 미리보기를 만들 수 있습니다.')
  }

  const actualQuantityG = numberValue(record.actual_quantity_g) ?? 0
  const defectQuantityG = numberValue(record.defect_quantity_g) ?? 0
  const sampleQuantityG = numberValue(record.sample_quantity_g) ?? 0
  const plannedQuantityG = numberValue(record.planned_quantity_g)
  if ([actualQuantityG, defectQuantityG, sampleQuantityG].some((value) => value < 0)) {
    throw new Error('완료·불량·샘플 수량은 0 이상이어야 합니다.')
  }

  const enteredQuantityG = actualQuantityG + defectQuantityG + sampleQuantityG
  if (enteredQuantityG <= 0) throw new Error('완료·불량·샘플 합계가 0보다 커야 합니다.')
  if (plannedQuantityG === null || plannedQuantityG <= 0) throw new Error('계획수량이 없어 차감 기준을 계산할 수 없습니다.')
  if (enteredQuantityG > plannedQuantityG) throw new Error('완료·불량·샘플 합계가 계획수량을 초과합니다.')

  const lossQuantityG = plannedQuantityG - enteredQuantityG
  const deductionBasisG = enteredQuantityG + lossQuantityG
  const recipes = (await expandedRecipes(record)).filter((entry) => rawIngredient(entry.recipe.ingredient_type))
  if (!recipes.length) throw new Error('활성 원재료 레시피가 없어 생산확정을 진행할 수 없습니다.')

  const foodTypeIds = [...new Set(recipes.map((entry) => text(entry.recipe.food_type_id)).filter(Boolean))]
  const supabase = createMoniServiceRoleClient()
  const [mappingResult, materialResult] = await Promise.all([
    foodTypeIds.length
      ? supabase
          .from('raw_material_mapping')
          .select('*')
          .eq('business_id', CANONICAL_MONI_BUSINESS_ID)
          .in('food_type_id', foodTypeIds)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('raw_materials')
      .select('id,item_code,item_name,current_stock_g,is_stock_managed')
      .eq('business_id', CANONICAL_MONI_BUSINESS_ID)
      .limit(5000),
  ])
  if (mappingResult.error) throw new Error(`원재료 매핑 조회 실패: ${mappingResult.error.message}`)
  if (materialResult.error) throw new Error(`원재료 재고 조회 실패: ${materialResult.error.message}`)

  const mappings = (mappingResult.data ?? []) as MappingRow[]
  const materials = (materialResult.data ?? []) as MaterialRow[]
  const materialById = new Map<string, MaterialRow>()
  const materialByName = new Map<string, MaterialRow>()
  for (const material of materials) {
    if (material.is_stock_managed !== true) continue
    materialById.set(text(material.id), material)
    materialByName.set(normalizedKey(material.item_name), material)
  }

  const recipeMappings = new Map<string, MappingRow[]>()
  const productMappings = new Map<string, MappingRow[]>()
  const globalMappings = new Map<string, MappingRow[]>()
  for (const mapping of mappings) {
    const foodTypeId = text(mapping.food_type_id)
    const scope = mappingScope(mapping.mapping_scope)
    const key = scope === 'recipe'
      ? text(mapping.recipe_id)
      : scope === 'product'
        ? `${text(mapping.product_id)}::${foodTypeId}`
        : foodTypeId
    if (!key) continue
    const target = scope === 'recipe' ? recipeMappings : scope === 'product' ? productMappings : globalMappings
    target.set(key, [...(target.get(key) ?? []), mapping])
  }

  const aggregated = new Map<string, ProductionDeductionRow>()
  const breakdown: ProductionDeductionRow[] = []
  for (const entry of recipes) {
    const recipe = entry.recipe
    const requiredG = (deductionBasisG * entry.effectiveRatioPercent) / 100
    if (requiredG <= 0) continue
    const foodTypeId = text(recipe.food_type_id)
    const foodTypeName = text(recipe.food_type_name) || '미매핑 원재료'
    const productId = text(recipe.product_id) || text(record.product_id)
    const preferred = recipeMappings.get(text(recipe.id))?.[0]
      ?? productMappings.get(`${productId}::${foodTypeId}`)?.[0]
      ?? globalMappings.get(foodTypeId)?.[0]
    const mappedName = text(preferred?.raw_material_name)
    const material = materialById.get(text(preferred?.raw_material_ref_id))
      ?? materialById.get(text(preferred?.raw_material_id))
      ?? materialByName.get(normalizedKey(mappedName))
      ?? materialByName.get(normalizedKey(foodTypeName))
    const currentStockG = numberValue(material?.current_stock_g) ?? 0
    const row: ProductionDeductionRow = {
      material_id: material ? text(material.id) : null,
      item_code: material ? text(material.item_code) || text(material.id) : null,
      material_name: material ? text(material.item_name) : mappedName || foodTypeName,
      food_type_name: foodTypeName,
      source_label: entry.sourceLabel,
      required_g: requiredG,
      current_stock_g: currentStockG,
      remaining_stock_g: currentStockG - requiredG,
      insufficient: !material || currentStockG < requiredG,
    }
    breakdown.push(row)
    const aggregateKey = material ? `material:${material.id}` : `missing:${foodTypeName}`
    const prior = aggregated.get(aggregateKey)
    if (prior) {
      prior.required_g += requiredG
      prior.remaining_stock_g = prior.current_stock_g - prior.required_g
      prior.insufficient = prior.remaining_stock_g < 0
    } else {
      aggregated.set(aggregateKey, { ...row, source_label: undefined })
    }
  }

  const previewMaterials = [...aggregated.values()].sort((a, b) => b.required_g - a.required_g)
  if (!previewMaterials.length) throw new Error('유효한 레시피 비율이 없어 원재료 사용량을 계산할 수 없습니다.')
  return {
    materials: previewMaterials,
    breakdown,
    totalRequiredG: previewMaterials.reduce((sum, row) => sum + row.required_g, 0),
    hasInsufficient: previewMaterials.some((row) => row.insufficient),
    hasMissingMapping: previewMaterials.some((row) => !row.material_id),
    deductionBasisG,
    enteredQuantityG,
    lossQuantityG,
    plannedQuantityG,
  }
}
