import { createMoniServiceRoleClient } from '@/lib/moni/db'

const PAGE_SIZE = 500
const DEFAULT_BUSINESS_ID = '20220523011'
const MAX_DEPTH = 8
const RATIO_TOLERANCE = 0.5

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replaceAll(',', ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeKey(value: unknown): string {
  return text(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
}

function isRawIngredient(value: unknown): boolean {
  const key = normalizeKey(value)
  if (!key) return true
  return ['원재료', 'raw', '제품/반제품', '제품반제품', 'productsemi', 'hybridsemi'].includes(key)
}

function isSemiIngredient(value: unknown): boolean {
  return ['반제품', 'semi', 'semiproduct'].includes(normalizeKey(value))
}

function isPlaceholderName(value: unknown): boolean {
  const key = normalizeKey(value)
  if (!key) return true
  return (
    key === '미연결' ||
    key === '미연결제품' ||
    key === '연결필요' ||
    key === '원재료연결필요' ||
    key === '확인필요' ||
    key.startsWith('미연결:') ||
    key.includes('미연결제품')
  )
}

function parsePackingUnitG(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const raw = text(value).toLowerCase().replaceAll(',', '')
  if (!raw) return null
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(kg|g)?$/)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return match[2] === 'kg' ? parsed * 1000 : parsed
}

function businessPriority(value: unknown, businessId: string): number {
  const current = text(value)
  if (current === businessId) return 0
  if (current === DEFAULT_BUSINESS_ID) return 1
  if (current === 'default') return 2
  if (!current) return 3
  return 4
}

function businessScope(businessId: string): string {
  const ids = Array.from(new Set([businessId, DEFAULT_BUSINESS_ID, 'default'].filter(Boolean)))
  return [...ids.map((id) => `business_id.eq.${id}`), 'business_id.is.null'].join(',')
}

async function fetchAll<T>(makeQuery: () => any, label: string): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (let page = 0; page < 50; page += 1) {
    const result = await makeQuery().range(from, from + PAGE_SIZE - 1)
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
    const pageRows = (result.data ?? []) as T[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
    from += PAGE_SIZE
  }
  throw new Error(`${label}: 조회 행 수가 안전 한도를 초과했습니다.`)
}

type RecipeRow = {
  id?: string | null
  product_id?: string | null
  product_name?: string | null
  food_type_id?: string | null
  food_type_name?: string | null
  ratio_percent?: number | string | null
  ingredient_type?: string | null
  semi_product_id?: string | null
  sort_order?: number | string | null
  business_id?: string | null
}

type MappingRow = {
  recipe_id?: string | null
  product_id?: string | null
  food_type_id?: string | null
  raw_material_ref_id?: string | null
  raw_material_id?: string | number | null
  raw_material_name?: string | null
  mapping_scope?: string | null
  is_default?: boolean | null
  created_at?: string | null
  business_id?: string | null
}

type MaterialRow = {
  id?: string | null
  item_name?: string | null
  linked_product_id?: string | null
  semifinished_usage_type?: string | null
  packing_weight_g?: number | string | null
  spec?: string | null
  is_active?: boolean | null
  is_stock_managed?: boolean | null
  business_id?: string | null
}

type ProductRow = {
  id?: string | null
  product_name?: string | null
  product_type?: string | null
  weight_g?: number | string | null
}

export type SemiProductStage = {
  key: string
  product_id: string
  product_name: string
  parent_product_id: string
  parent_product_name: string
  depth: number
  ratio_from_parent: number
  required_g: number
  path: string[]
  usage_type: string
}

export type ExpandedMaterialRequirement = {
  material_id: string | null
  material_name: string
  packing_unit_g: number | null
  is_stock_managed: boolean
  direct_input_g: number
  semi_product_g: Record<string, number>
  final_input_g: number
  source_paths: string[]
}

export type RecipeExpansionResult = {
  root: {
    product_id: string
    product_name: string
    quantity_g: number
  }
  semi_products: SemiProductStage[]
  semi_product_columns: Array<{
    product_id: string
    product_name: string
    depth: number
  }>
  materials: ExpandedMaterialRequirement[]
  unresolved_items: string[]
  has_cycle: boolean
  max_depth_reached: boolean
}

type ResolvedMaterial = {
  materialId: string | null
  materialName: string
  linkedProductId: string | null
  usageType: string
  packingUnitG: number | null
  isStockManaged: boolean
  unresolved: boolean
}

export async function expandProductionRecipe(input: {
  productId: string
  productName?: string
  quantityG: number
  businessId?: string
}): Promise<RecipeExpansionResult> {
  const productId = text(input.productId)
  const requestedProductName = text(input.productName)
  const quantityG = numberValue(input.quantityG)
  const businessId = text(input.businessId) || DEFAULT_BUSINESS_ID

  if (!productId) throw new Error('제품 연결 정보가 없습니다.')
  if (!(quantityG > 0)) throw new Error('생산량은 0보다 커야 합니다.')

  const supabase = createMoniServiceRoleClient()
  const scope = businessScope(businessId)

  const [recipes, mappings, materials, products] = await Promise.all([
    fetchAll<RecipeRow>(
      () => supabase
        .from('recipes')
        .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id, sort_order, business_id')
        .eq('is_active', true)
        .order('product_id', { ascending: true })
        .order('sort_order', { ascending: true }),
      '레시피 조회 실패',
    ),
    fetchAll<MappingRow>(
      () => supabase
        .from('raw_material_mapping')
        .select('recipe_id, product_id, food_type_id, raw_material_ref_id, raw_material_id, raw_material_name, mapping_scope, is_default, created_at, business_id')
        .eq('is_default', true)
        .or(scope)
        .order('created_at', { ascending: false }),
      '원재료 매핑 조회 실패',
    ),
    fetchAll<MaterialRow>(
      () => supabase
        .from('raw_materials')
        .select('id, item_name, linked_product_id, semifinished_usage_type, packing_weight_g, spec, is_active, is_stock_managed, business_id')
        .or(scope)
        .order('item_name', { ascending: true }),
      '원재료 조회 실패',
    ),
    fetchAll<ProductRow>(
      () => supabase
        .from('products')
        .select('id, product_name, product_type, weight_g')
        .order('product_name', { ascending: true }),
      '제품 조회 실패',
    ),
  ])

  const recipesByProduct = new Map<string, RecipeRow[]>()
  for (const recipe of recipes) {
    const id = text(recipe.product_id)
    if (!id) continue
    recipesByProduct.set(id, [...(recipesByProduct.get(id) ?? []), recipe])
  }

  const productsById = new Map<string, ProductRow>()
  for (const product of products) {
    const id = text(product.id)
    if (id) productsById.set(id, product)
  }

  const activeMaterials = materials.filter(
    (material) => material.is_active !== false && !isPlaceholderName(material.item_name),
  )
  const materialById = new Map<string, MaterialRow>()
  const materialCandidatesByName = new Map<string, MaterialRow[]>()
  for (const material of activeMaterials) {
    const id = text(material.id)
    if (id) materialById.set(id, material)
    const nameKey = normalizeKey(material.item_name)
    if (!nameKey) continue
    materialCandidatesByName.set(nameKey, [...(materialCandidatesByName.get(nameKey) ?? []), material])
  }
  materialCandidatesByName.forEach((rows, key) => {
    materialCandidatesByName.set(
      key,
      [...rows].sort((a, b) => businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId)),
    )
  })

  const sortMappings = (rows: MappingRow[]) => [...rows].sort((a, b) => {
    const businessOrder = businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId)
    if (businessOrder !== 0) return businessOrder
    return new Date(text(b.created_at) || 0).getTime() - new Date(text(a.created_at) || 0).getTime()
  })

  const recipeMappings = new Map<string, MappingRow[]>()
  const productMappings = new Map<string, MappingRow[]>()
  const globalMappings = new Map<string, MappingRow[]>()
  for (const mapping of mappings) {
    const mappingScope = text(mapping.mapping_scope).toLowerCase() || 'global'
    const recipeId = text(mapping.recipe_id)
    const mappingProductId = text(mapping.product_id)
    const foodTypeId = text(mapping.food_type_id)
    if (mappingScope === 'recipe' && recipeId) {
      recipeMappings.set(recipeId, [...(recipeMappings.get(recipeId) ?? []), mapping])
    } else if (mappingScope === 'product' && mappingProductId && foodTypeId) {
      const key = `${mappingProductId}::${foodTypeId}`
      productMappings.set(key, [...(productMappings.get(key) ?? []), mapping])
    } else if (foodTypeId) {
      globalMappings.set(foodTypeId, [...(globalMappings.get(foodTypeId) ?? []), mapping])
    }
  }
  recipeMappings.forEach((rows, key) => recipeMappings.set(key, sortMappings(rows)))
  productMappings.forEach((rows, key) => productMappings.set(key, sortMappings(rows)))
  globalMappings.forEach((rows, key) => globalMappings.set(key, sortMappings(rows)))

  const resolvePreferredMapping = (recipe: RecipeRow): MappingRow | null => {
    const recipeId = text(recipe.id)
    const recipeProductId = text(recipe.product_id)
    const foodTypeId = text(recipe.food_type_id)
    return (
      (recipeId ? recipeMappings.get(recipeId)?.[0] : null) ??
      (recipeProductId && foodTypeId ? productMappings.get(`${recipeProductId}::${foodTypeId}`)?.[0] : null) ??
      (foodTypeId ? globalMappings.get(foodTypeId)?.[0] : null) ??
      null
    )
  }

  const resolveMaterial = (recipe: RecipeRow): ResolvedMaterial => {
    const mapping = resolvePreferredMapping(recipe)
    const foodTypeName = text(recipe.food_type_name)
    const mappedRefId = text(mapping?.raw_material_ref_id ?? mapping?.raw_material_id)
    const mappedName = isPlaceholderName(mapping?.raw_material_name) ? '' : text(mapping?.raw_material_name)
    const byRef = mappedRefId ? materialById.get(mappedRefId) : undefined
    const byMappedName = mappedName ? materialCandidatesByName.get(normalizeKey(mappedName))?.[0] : undefined
    const byFoodTypeName = foodTypeName ? materialCandidatesByName.get(normalizeKey(foodTypeName))?.[0] : undefined
    const material = byRef ?? byMappedName ?? byFoodTypeName
    const materialName = text(material?.item_name)
    const unresolved = !material || isPlaceholderName(materialName)
    return {
      materialId: unresolved ? null : text(material?.id) || null,
      materialName: unresolved ? foodTypeName || '원재료명 확인 필요' : materialName,
      linkedProductId: unresolved ? null : text(material?.linked_product_id) || null,
      usageType: unresolved ? '' : text(material?.semifinished_usage_type) || 'inline',
      packingUnitG: unresolved
        ? null
        : parsePackingUnitG(material?.packing_weight_g) ?? parsePackingUnitG(material?.spec),
      isStockManaged: unresolved ? true : material?.is_stock_managed !== false,
      unresolved,
    }
  }

  const rootMeta = productsById.get(productId)
  const rootName = text(rootMeta?.product_name) || requestedProductName || productId
  const unresolvedItems: string[] = []
  const stageAccumulator = new Map<string, SemiProductStage>()
  const stageOrder: string[] = []
  const materialAccumulator = new Map<string, ExpandedMaterialRequirement>()
  let hasCycle = false
  let maxDepthReached = false

  const getMaterialRow = (resolved: ResolvedMaterial): ExpandedMaterialRequirement => {
    const key = resolved.materialId ? `id:${resolved.materialId}` : `name:${normalizeKey(resolved.materialName)}`
    const existing = materialAccumulator.get(key)
    if (existing) {
      if (existing.packing_unit_g === null && resolved.packingUnitG !== null) existing.packing_unit_g = resolved.packingUnitG
      existing.is_stock_managed = existing.is_stock_managed && resolved.isStockManaged
      return existing
    }
    const created: ExpandedMaterialRequirement = {
      material_id: resolved.materialId,
      material_name: resolved.materialName,
      packing_unit_g: resolved.packingUnitG,
      is_stock_managed: resolved.isStockManaged,
      direct_input_g: 0,
      semi_product_g: {},
      final_input_g: 0,
      source_paths: [],
    }
    materialAccumulator.set(key, created)
    return created
  }

  const expandProduct = async (args: {
    currentProductId: string
    currentProductName: string
    currentQuantityG: number
    depth: number
    pathIds: string[]
    pathNames: string[]
  }): Promise<void> => {
    const currentRecipes = recipesByProduct.get(args.currentProductId) ?? []
    if (currentRecipes.length === 0) {
      unresolvedItems.push(`${args.currentProductName}: 활성 레시피 없음`)
      return
    }

    const ratioTotal = currentRecipes.reduce((sum, recipe) => sum + Math.max(0, numberValue(recipe.ratio_percent)), 0)
    if (Math.abs(ratioTotal - 100) > RATIO_TOLERANCE) {
      unresolvedItems.push(`${args.currentProductName}: 배합비 합계 ${ratioTotal.toFixed(3)}%`)
    }

    for (const recipe of currentRecipes) {
      const ratio = numberValue(recipe.ratio_percent)
      if (!(ratio > 0)) continue
      const requiredG = (args.currentQuantityG * ratio) / 100
      if (!(requiredG > 0)) continue
      const recipeItemName = text(recipe.food_type_name) || '재료명 없음'

      if (isSemiIngredient(recipe.ingredient_type)) {
        const mappedMaterial = resolveMaterial(recipe)
        const nextProductId = text(recipe.semi_product_id) || mappedMaterial.linkedProductId || ''
        if (!nextProductId) {
          unresolvedItems.push(`${args.currentProductName} · ${recipeItemName}: 연결 반제품 미설정`)
          continue
        }
        const nextMeta = productsById.get(nextProductId)
        const nextProductName = text(nextMeta?.product_name) || mappedMaterial.materialName || nextProductId
        if (args.pathIds.includes(nextProductId)) {
          hasCycle = true
          unresolvedItems.push(`${[...args.pathNames, nextProductName].join(' → ')}: 순환 연결 감지`)
          continue
        }
        if (args.depth + 1 > MAX_DEPTH) {
          maxDepthReached = true
          unresolvedItems.push(`${nextProductName}: 반제품 전개 최대 ${MAX_DEPTH}단계 초과`)
          continue
        }

        const stagePathNames = [...args.pathNames, nextProductName]
        const stageKey = `${[...args.pathIds, nextProductId].join('>')}::${text(recipe.id)}`
        const existingStage = stageAccumulator.get(stageKey)
        if (existingStage) {
          existingStage.required_g += requiredG
        } else {
          stageAccumulator.set(stageKey, {
            key: stageKey,
            product_id: nextProductId,
            product_name: nextProductName,
            parent_product_id: args.currentProductId,
            parent_product_name: args.currentProductName,
            depth: args.depth + 1,
            ratio_from_parent: ratio,
            required_g: requiredG,
            path: stagePathNames,
            usage_type: mappedMaterial.usageType || 'inline',
          })
          stageOrder.push(stageKey)
        }

        await expandProduct({
          currentProductId: nextProductId,
          currentProductName: nextProductName,
          currentQuantityG: requiredG,
          depth: args.depth + 1,
          pathIds: [...args.pathIds, nextProductId],
          pathNames: stagePathNames,
        })
        continue
      }

      if (!isRawIngredient(recipe.ingredient_type)) continue
      const resolved = resolveMaterial(recipe)
      if (resolved.unresolved || isPlaceholderName(resolved.materialName)) {
        unresolvedItems.push(`${args.currentProductName} · ${recipeItemName}: 원재료 연결 확인 필요`)
        continue
      }

      const target = getMaterialRow(resolved)
      if (args.depth === 0) {
        target.direct_input_g += requiredG
      } else {
        target.semi_product_g[args.currentProductId] =
          (target.semi_product_g[args.currentProductId] ?? 0) + requiredG
      }
      target.final_input_g += requiredG
      const sourcePath = `${args.pathNames.join(' → ')} · ${recipeItemName}`
      if (!target.source_paths.includes(sourcePath)) target.source_paths.push(sourcePath)
    }
  }

  await expandProduct({
    currentProductId: productId,
    currentProductName: rootName,
    currentQuantityG: quantityG,
    depth: 0,
    pathIds: [productId],
    pathNames: [rootName],
  })

  const semiProducts = stageOrder
    .map((key) => stageAccumulator.get(key))
    .filter((stage): stage is SemiProductStage => Boolean(stage))

  const columnMeta = new Map<string, { product_id: string; product_name: string; depth: number }>()
  for (const stage of semiProducts) {
    const existing = columnMeta.get(stage.product_id)
    if (!existing || stage.depth < existing.depth) {
      columnMeta.set(stage.product_id, {
        product_id: stage.product_id,
        product_name: stage.product_name,
        depth: stage.depth,
      })
    }
  }

  return {
    root: { product_id: productId, product_name: rootName, quantity_g: quantityG },
    semi_products: semiProducts,
    semi_product_columns: Array.from(columnMeta.values()).sort((a, b) => a.depth - b.depth || a.product_name.localeCompare(b.product_name, 'ko')),
    materials: Array.from(materialAccumulator.values())
      .filter((row) => row.final_input_g > 0 && !isPlaceholderName(row.material_name))
      .sort((a, b) => b.final_input_g - a.final_input_g),
    unresolved_items: Array.from(new Set(unresolvedItems.filter(Boolean))),
    has_cycle: hasCycle,
    max_depth_reached: maxDepthReached,
  }
}
