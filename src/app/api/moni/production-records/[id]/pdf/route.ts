import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 400
const DEFAULT_BUSINESS_ID = '20220523011'

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replaceAll(',', ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function numberValue(value: unknown): number {
  return parseNumber(value) ?? 0
}

function formatNumber(value: unknown): string {
  const parsed = parseNumber(value)
  if (parsed === null) return '-'
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(parsed))
}

function formatGram(value: unknown): string {
  const parsed = parseNumber(value)
  if (parsed === null) return '-'
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(parsed))}g`
}

function formatRequiredGram(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const abs = Math.abs(value)
  if (abs >= 1) {
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(value))
  }
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatPackingWeight(valueG: number | null): string {
  if (valueG === null || !Number.isFinite(valueG) || valueG <= 0) return '규격 미등록'
  if (valueG >= 1000) {
    return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(valueG / 1000)}kg`
  }
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(valueG)}g`
}

function formatEaRemainder(ea: number, remainderG: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(ea)}ea + 잔량 ${formatGram(remainderG)}`
}

function resolvePackingUnitG(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const raw = text(value).toLowerCase().replaceAll(',', '')
  if (!raw) return null
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(kg|g)?$/)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return match[2] === 'kg' ? parsed * 1000 : parsed
}

function calcEaByPackingUnit(quantityG: number, packingUnitG: number | null): number | null {
  if (!Number.isFinite(quantityG) || quantityG <= 0 || packingUnitG === null || packingUnitG <= 0) return null
  return Math.ceil(quantityG / packingUnitG)
}

function normalizeKey(value: unknown): string {
  return text(value).toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
}

function isPlaceholderMaterialName(value: unknown): boolean {
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

function isRawIngredient(value: string | null | undefined): boolean {
  const raw = normalizeKey(value)
  if (!raw) return true
  if (raw === '원재료' || raw === 'raw') return true
  if (raw === '제품/반제품' || raw === '제품반제품' || raw === 'productsemi' || raw === 'hybridsemi') return true
  return false
}

function isPureSemiIngredient(value: string | null | undefined): boolean {
  const raw = normalizeKey(value)
  return raw === '반제품' || raw === 'semi' || raw === 'semiproduct'
}

function businessPriority(value: unknown, businessId: string): number {
  const raw = text(value)
  if (raw === businessId) return 0
  if (raw === DEFAULT_BUSINESS_ID) return 1
  if (raw === 'default') return 2
  if (!raw) return 3
  return 4
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
  packing_weight_g?: number | string | null
  spec?: string | null
  is_active?: boolean | null
  is_stock_managed?: boolean | null
  business_id?: string | null
}

type ProductMetaRow = {
  id?: string | null
  product_name?: string | null
  weight_g?: number | string | null
  report_number?: string | null
}

type UnifiedWorkOrderRow = {
  material_id: string | null
  material_name: string
  packing_unit_g: number | null
  is_stock_managed: boolean
  production_product_g: number
  semi_product_g: Record<string, number>
  final_input_g: number
  unresolved?: boolean
}

type WorkOrderExpansionPayload = {
  semi_product_columns: Array<{ product_id: string; product_name: string; packing_unit_g: number | null }>
  rows: UnifiedWorkOrderRow[]
  has_nested_semi: boolean
  unresolved_items: string[]
}

function sortMappingCandidates(rows: MappingRow[], businessId: string): MappingRow[] {
  return [...rows].sort((a, b) => {
    const businessOrder = businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId)
    if (businessOrder !== 0) return businessOrder
    const dateOrder = new Date(text(b.created_at) || 0).getTime() - new Date(text(a.created_at) || 0).getTime()
    return Number.isFinite(dateOrder) ? dateOrder : 0
  })
}

function buildErrorHtml(data: Record<string, unknown>, unresolvedItems: string[]): string {
  const items = Array.from(new Set(unresolvedItems.filter(Boolean)))
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>원재료 연결 확인 필요</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; }
    main { width: min(900px, calc(100% - 32px)); margin: 36px auto; background: #fff; border: 1px solid #d1d5db; padding: 28px; }
    h1 { margin: 0 0 12px; font-size: 24px; }
    .meta { display: grid; grid-template-columns: 120px 1fr; border: 1px solid #d1d5db; margin: 18px 0; }
    .meta div { padding: 9px 12px; border-bottom: 1px solid #e5e7eb; }
    .meta div:nth-child(odd) { background: #f9fafb; font-weight: 700; }
    .warning { border: 2px solid #dc2626; background: #fef2f2; padding: 18px; }
    .warning strong { color: #b91c1c; }
    li { margin: 7px 0; }
    button { margin-top: 18px; padding: 10px 16px; border: 0; background: #111827; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>원재료 연결 확인 필요</h1>
    <p>불완전한 원재료 목록으로 작업지시서를 출력하면 현장 투입 누락이 발생할 수 있어 인쇄를 차단했습니다.</p>
    <div class="meta">
      <div>LOT</div><div>${escapeHtml(data.lot_number)}</div>
      <div>제품명</div><div>${escapeHtml(data.product_name)}</div>
      <div>생산일자</div><div>${escapeHtml(data.work_date)}</div>
    </div>
    <div class="warning">
      <strong>관리자 → 레시피 원재료 연결에서 다음 항목을 먼저 수정해 주세요.</strong>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <button type="button" onclick="window.close()">닫기</button>
  </main>
</body>
</html>`
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('production_records').select('*').eq('id', params.id).maybeSingle()
    if (error) throw new Error(error.message || '제조기록서 조회에 실패했습니다.')
    if (!data) return NextResponse.json({ ok: false, error: '제조기록서를 찾을 수 없습니다.' }, { status: 404 })

    const productId = text(data.product_id)
    const productName = text(data.product_name)
    const plannedQuantityG = numberValue(data.planned_quantity_g)
    const productionUnitName = text(data.production_unit_name)
    const productionUnitWeightG = parseNumber(data.production_unit_weight_g)
    const storedPlannedEa = parseNumber(data.planned_quantity_ea)
    const storedPlannedRemainderG = parseNumber(data.planned_remainder_g)

    if (!productId) {
      return NextResponse.json(
        { ok: false, error: '작업지시서에 제품 연결 정보가 없습니다. 제품을 먼저 연결해 주세요.' },
        { status: 422 },
      )
    }

    const plannedEa =
      storedPlannedEa !== null
        ? Math.floor(storedPlannedEa)
        : plannedQuantityG > 0 && productionUnitWeightG !== null && productionUnitWeightG > 0
          ? Math.floor(plannedQuantityG / productionUnitWeightG)
          : null
    const plannedRemainderG =
      storedPlannedRemainderG !== null
        ? storedPlannedRemainderG
        : plannedEa !== null && productionUnitWeightG !== null && productionUnitWeightG > 0
          ? plannedQuantityG - plannedEa * productionUnitWeightG
          : null
    const plannedEaRemainderText =
      plannedEa !== null && plannedRemainderG !== null ? formatEaRemainder(plannedEa, plannedRemainderG) : ''
    const productionUnitLabel =
      productionUnitName || (productionUnitWeightG !== null && productionUnitWeightG > 0 ? `${formatGram(productionUnitWeightG)} 단위` : '')

    const productResult = await supabase
      .from('products')
      .select('id, product_name, report_number, weight_g')
      .eq('id', productId)
      .maybeSingle()
    if (productResult.error) throw new Error(productResult.error.message || '제품 정보 조회에 실패했습니다.')
    const productMeta = (productResult.data ?? {}) as ProductMetaRow
    const productReportNumber = text(productMeta.report_number) || '미등록'
    const productPackingUnitG = resolvePackingUnitG(productMeta.weight_g)
    const recordPackingUnitG = resolvePackingUnitG(data.production_unit_weight_g)
    const packingUnitG = recordPackingUnitG ?? productPackingUnitG
    const plannedEaByPacking = calcEaByPackingUnit(plannedQuantityG, packingUnitG)

    const businessId = text(data.business_id) || DEFAULT_BUSINESS_ID
    const businessScope = `business_id.eq.${businessId},business_id.eq.default,business_id.is.null`

    const [allMappings, rawMaterials] = await Promise.all([
      fetchAll<MappingRow>(
        () => supabase
          .from('raw_material_mapping')
          .select('recipe_id, product_id, food_type_id, raw_material_ref_id, raw_material_id, raw_material_name, mapping_scope, is_default, created_at, business_id')
          .eq('is_default', true)
          .or(businessScope)
          .order('created_at', { ascending: false }),
        '원재료 매핑 조회 실패',
      ),
      fetchAll<MaterialRow>(
        () => supabase
          .from('raw_materials')
          .select('id, item_name, linked_product_id, packing_weight_g, spec, is_active, is_stock_managed, business_id')
          .or(businessScope)
          .order('item_name', { ascending: true }),
        '원재료 조회 실패',
      ),
    ])

    const activeMaterials = rawMaterials.filter(
      (material) => material.is_active !== false && !isPlaceholderMaterialName(material.item_name),
    )
    const rawMaterialById = new Map(
      activeMaterials
        .map((material) => [text(material.id), material] as const)
        .filter(([id]) => id.length > 0),
    )
    const rawMaterialCandidatesByName = new Map<string, MaterialRow[]>()
    for (const material of activeMaterials) {
      const key = normalizeKey(material.item_name)
      if (!key) continue
      rawMaterialCandidatesByName.set(key, [...(rawMaterialCandidatesByName.get(key) ?? []), material])
    }
    rawMaterialCandidatesByName.forEach((rows, key) => {
      rawMaterialCandidatesByName.set(
        key,
        [...rows].sort((a, b) => businessPriority(a.business_id, businessId) - businessPriority(b.business_id, businessId)),
      )
    })

    const recipeScopeMappings = new Map<string, MappingRow[]>()
    const productScopeMappings = new Map<string, MappingRow[]>()
    const globalScopeMappings = new Map<string, MappingRow[]>()
    for (const mapping of allMappings) {
      const scope = text(mapping.mapping_scope).toLowerCase() || 'global'
      const recipeId = text(mapping.recipe_id)
      const mappingProductId = text(mapping.product_id)
      const foodTypeId = text(mapping.food_type_id)
      if (scope === 'recipe' && recipeId) {
        recipeScopeMappings.set(recipeId, [...(recipeScopeMappings.get(recipeId) ?? []), mapping])
      } else if (scope === 'product' && mappingProductId && foodTypeId) {
        const key = `${mappingProductId}::${foodTypeId}`
        productScopeMappings.set(key, [...(productScopeMappings.get(key) ?? []), mapping])
      } else if (foodTypeId) {
        globalScopeMappings.set(foodTypeId, [...(globalScopeMappings.get(foodTypeId) ?? []), mapping])
      }
    }
    recipeScopeMappings.forEach((rows, key) => recipeScopeMappings.set(key, sortMappingCandidates(rows, businessId)))
    productScopeMappings.forEach((rows, key) => productScopeMappings.set(key, sortMappingCandidates(rows, businessId)))
    globalScopeMappings.forEach((rows, key) => globalScopeMappings.set(key, sortMappingCandidates(rows, businessId)))

    const recipeCache = new Map<string, RecipeRow[]>()
    const loadRecipesByProduct = async (targetProductId: string): Promise<RecipeRow[]> => {
      const cached = recipeCache.get(targetProductId)
      if (cached) return cached
      const rows = await fetchAll<RecipeRow>(
        () => supabase
          .from('recipes')
          .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id, sort_order')
          .eq('product_id', targetProductId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        '레시피 조회 실패',
      )
      recipeCache.set(targetProductId, rows)
      return rows
    }

    const recipeRows = await loadRecipesByProduct(productId)

    const resolvePreferredMapping = (row: RecipeRow): MappingRow | null => {
      const recipeId = text(row.id)
      const recipeProductId = text(row.product_id) || productId
      const foodTypeId = text(row.food_type_id)
      const recipeCandidate = recipeId ? recipeScopeMappings.get(recipeId)?.[0] : null
      const productCandidate = recipeProductId && foodTypeId
        ? productScopeMappings.get(`${recipeProductId}::${foodTypeId}`)?.[0]
        : null
      const globalCandidate = foodTypeId ? globalScopeMappings.get(foodTypeId)?.[0] : null
      return recipeCandidate ?? productCandidate ?? globalCandidate ?? null
    }

    const resolveMappedMaterial = (row: RecipeRow) => {
      const preferred = resolvePreferredMapping(row)
      const foodTypeName = text(row.food_type_name)
      const mappedRefId = text(preferred?.raw_material_ref_id ?? preferred?.raw_material_id)
      const mappedRawName = isPlaceholderMaterialName(preferred?.raw_material_name) ? '' : text(preferred?.raw_material_name)

      const byMappedRef = mappedRefId ? rawMaterialById.get(mappedRefId) : undefined
      const mappedNameCandidates = mappedRawName ? rawMaterialCandidatesByName.get(normalizeKey(mappedRawName)) ?? [] : []
      const foodTypeCandidates = foodTypeName ? rawMaterialCandidatesByName.get(normalizeKey(foodTypeName)) ?? [] : []
      const materialRow = byMappedRef ?? mappedNameCandidates[0] ?? foodTypeCandidates[0]
      const materialName = text(materialRow?.item_name)
      const unresolved = !materialRow || isPlaceholderMaterialName(materialName)

      return {
        materialId: unresolved ? null : text(materialRow?.id) || null,
        materialName: unresolved ? foodTypeName || '원재료명 확인 필요' : materialName,
        linkedProductId: unresolved ? null : text(materialRow?.linked_product_id) || null,
        packingUnitG: unresolved
          ? null
          : resolvePackingUnitG(materialRow?.packing_weight_g) ?? resolvePackingUnitG(materialRow?.spec),
        isStockManaged: unresolved ? true : materialRow?.is_stock_managed !== false,
        unresolved,
      }
    }

    const unresolvedItems: string[] = []
    let hasNestedSemi = false
    const semiColumnsOrdered: string[] = []
    const semiColumnMeta = new Map<string, { product_id: string; product_name: string; packing_unit_g: number | null }>()
    const rowAccumulator = new Map<string, UnifiedWorkOrderRow>()

    const getOrCreateRow = (
      materialName: string,
      materialId: string | null,
      packingUnitG: number | null,
      isStockManaged: boolean,
    ): UnifiedWorkOrderRow => {
      const key = materialId ? `id:${materialId}` : `name:${normalizeKey(materialName) || materialName}`
      const found = rowAccumulator.get(key)
      if (found) {
        if (found.packing_unit_g === null && packingUnitG !== null) found.packing_unit_g = packingUnitG
        found.is_stock_managed = found.is_stock_managed && isStockManaged
        return found
      }
      const created: UnifiedWorkOrderRow = {
        material_id: materialId,
        material_name: materialName,
        packing_unit_g: packingUnitG,
        is_stock_managed: isStockManaged,
        production_product_g: 0,
        semi_product_g: {},
        final_input_g: 0,
        unresolved: false,
      }
      rowAccumulator.set(key, created)
      return created
    }

    const ratioTotal = recipeRows.reduce((sum, row) => sum + Math.max(0, numberValue(row.ratio_percent)), 0)
    if (recipeRows.length === 0) unresolvedItems.push(`${productName}: 활성 레시피 없음`)
    if (recipeRows.length > 0 && Math.abs(ratioTotal - 100) > 0.5) {
      unresolvedItems.push(`${productName}: 전체 배합비 합계 ${ratioTotal.toFixed(3)}%`)
    }

    const candidateSemiProductIds = new Set<string>()
    for (const row of recipeRows) {
      if (!isPureSemiIngredient(row.ingredient_type)) continue
      const resolved = resolveMappedMaterial(row)
      if (resolved.linkedProductId) candidateSemiProductIds.add(resolved.linkedProductId)
    }

    const productsMetaById = new Map<string, ProductMetaRow>()
    if (candidateSemiProductIds.size > 0) {
      const productMetaRows = await fetchAll<ProductMetaRow>(
        () => supabase
          .from('products')
          .select('id, product_name, weight_g')
          .in('id', Array.from(candidateSemiProductIds))
          .order('product_name', { ascending: true }),
        '반제품 정보 조회 실패',
      )
      for (const item of productMetaRows) {
        const id = text(item.id)
        if (id) productsMetaById.set(id, item)
      }
    }

    for (const row of recipeRows) {
      const ratioPercent = numberValue(row.ratio_percent)
      if (ratioPercent <= 0) continue
      const requiredG = plannedQuantityG > 0 ? (plannedQuantityG * ratioPercent) / 100 : 0
      if (requiredG <= 0) continue
      const recipeItemName = text(row.food_type_name) || '원료명 없음'

      if (isRawIngredient(row.ingredient_type)) {
        const resolved = resolveMappedMaterial(row)
        if (resolved.unresolved || isPlaceholderMaterialName(resolved.materialName)) {
          unresolvedItems.push(`${recipeItemName}: 원재료 연결 확인 필요`)
          continue
        }
        const target = getOrCreateRow(
          resolved.materialName,
          resolved.materialId,
          resolved.packingUnitG,
          resolved.isStockManaged,
        )
        target.production_product_g += requiredG
        target.final_input_g += requiredG
        continue
      }

      if (!isPureSemiIngredient(row.ingredient_type)) continue

      const resolvedSemi = resolveMappedMaterial(row)
      const linkedProductId = resolvedSemi.linkedProductId
      if (!linkedProductId) {
        unresolvedItems.push(`${recipeItemName}: 연결 반제품 미설정`)
        continue
      }

      const linkedProductMeta = productsMetaById.get(linkedProductId)
      const linkedProductName = text(linkedProductMeta?.product_name) || linkedProductId
      if (!semiColumnMeta.has(linkedProductId)) {
        semiColumnMeta.set(linkedProductId, {
          product_id: linkedProductId,
          product_name: linkedProductName,
          packing_unit_g: resolvePackingUnitG(linkedProductMeta?.weight_g),
        })
        semiColumnsOrdered.push(linkedProductId)
      }

      const semiRecipes = await loadRecipesByProduct(linkedProductId)
      if (semiRecipes.length === 0) {
        unresolvedItems.push(`${recipeItemName}: 연결 반제품 레시피 없음`)
        continue
      }

      const semiRatioTotal = semiRecipes.reduce((sum, semiRecipe) => sum + Math.max(0, numberValue(semiRecipe.ratio_percent)), 0)
      if (Math.abs(semiRatioTotal - 100) > 0.5) {
        unresolvedItems.push(`${linkedProductName}: 반제품 배합비 합계 ${semiRatioTotal.toFixed(3)}%`)
      }

      for (const semiRecipe of semiRecipes) {
        const childRatio = numberValue(semiRecipe.ratio_percent)
        if (childRatio <= 0) continue
        const childRequiredG = (requiredG * childRatio) / 100
        if (childRequiredG <= 0) continue

        if (isPureSemiIngredient(semiRecipe.ingredient_type)) {
          hasNestedSemi = true
          unresolvedItems.push(`${recipeItemName}: 하위 반제품(${text(semiRecipe.food_type_name) || '이름 없음'}) 미전개`)
          continue
        }
        if (!isRawIngredient(semiRecipe.ingredient_type)) continue

        const resolvedChild = resolveMappedMaterial(semiRecipe)
        const childName = text(semiRecipe.food_type_name) || '원료명 없음'
        if (resolvedChild.unresolved || isPlaceholderMaterialName(resolvedChild.materialName)) {
          unresolvedItems.push(`${linkedProductName} · ${childName}: 원재료 연결 확인 필요`)
          continue
        }
        const target = getOrCreateRow(
          resolvedChild.materialName,
          resolvedChild.materialId,
          resolvedChild.packingUnitG,
          resolvedChild.isStockManaged,
        )
        target.semi_product_g[linkedProductId] = (target.semi_product_g[linkedProductId] ?? 0) + childRequiredG
        target.final_input_g += childRequiredG
      }
    }

    const expansionPayload: WorkOrderExpansionPayload = {
      semi_product_columns: semiColumnsOrdered
        .map((id) => semiColumnMeta.get(id))
        .filter((item): item is { product_id: string; product_name: string; packing_unit_g: number | null } => Boolean(item)),
      rows: Array.from(rowAccumulator.values())
        .filter((row) => !row.unresolved && !isPlaceholderMaterialName(row.material_name) && row.final_input_g > 0)
        .sort((a, b) => b.final_input_g - a.final_input_g),
      has_nested_semi: hasNestedSemi,
      unresolved_items: Array.from(new Set(unresolvedItems.filter(Boolean))),
    }

    const formatMode = text(request.nextUrl.searchParams.get('format')).toLowerCase()
    if (formatMode === 'json') {
      return NextResponse.json(
        {
          ok: expansionPayload.unresolved_items.length === 0,
          record: {
            id: data.id,
            lot_number: data.lot_number,
            product_name: data.product_name,
            planned_quantity_g: plannedQuantityG,
          },
          expansion: expansionPayload,
        },
        { status: expansionPayload.unresolved_items.length === 0 ? 200 : 422 },
      )
    }

    if (expansionPayload.unresolved_items.length > 0 || expansionPayload.has_nested_semi) {
      return new NextResponse(buildErrorHtml(data as Record<string, unknown>, expansionPayload.unresolved_items), {
        status: 422,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const unifiedHeaders = [
      '원재료명',
      '준비 포장수량',
      ...expansionPayload.semi_product_columns.map((column) => `${column.product_name}(g)`),
      '최종 투입량(g)',
    ]

    const unifiedRowsHtml = expansionPayload.rows.length > 0
      ? expansionPayload.rows.map((row) => {
          const semiCells = expansionPayload.semi_product_columns
            .map((column) => `<td class="number">${formatRequiredGram(row.semi_product_g[column.product_id] ?? 0)}</td>`)
            .join('')
          const packageCount = calcEaByPackingUnit(row.final_input_g, row.packing_unit_g)
          const exactCount = row.packing_unit_g !== null && row.packing_unit_g > 0 ? row.final_input_g / row.packing_unit_g : null
          const roundedUp = exactCount !== null && Math.abs(exactCount - Math.round(exactCount)) > 0.000001
          const packageText = !row.is_stock_managed
            ? '포장수량 해당 없음'
            : packageCount === null
              ? '규격 미등록'
              : `${formatNumber(packageCount)}개 (${formatPackingWeight(row.packing_unit_g)}/개${roundedUp ? ' · 올림' : ''})`
          return `<tr>
            <td>${escapeHtml(row.material_name)}</td>
            <td class="package-count">${escapeHtml(packageText)}</td>
            ${semiCells}
            <td class="number final-input">${formatRequiredGram(row.final_input_g)}</td>
          </tr>`
        }).join('')
      : `<tr><td colspan="${unifiedHeaders.length}">원재료 필요량을 계산할 수 없습니다.</td></tr>`

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>작업지시서 ${escapeHtml(data.lot_number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 14mm; }
    h1 { margin: 0 0 10px; text-align: center; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
    th, td { border: 1px solid #111827; padding: 7px 8px; vertical-align: middle; }
    th { background: #e5e7eb; text-align: left; white-space: nowrap; }
    .section-title { margin-top: 14px; font-size: 16px; font-weight: 700; }
    .compact { table-layout: fixed; }
    .compact col.label { width: 18%; }
    .compact col.value { width: 32%; }
    .number { text-align: right; white-space: nowrap; }
    .final-input { font-weight: 700; }
    .package-count { text-align: center; font-weight: 700; white-space: nowrap; }
    .fill-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 8px; align-items: stretch; }
    .fill-table { table-layout: fixed; margin-top: 0; height: 100%; }
    .fill-table col.label-col { width: 26%; }
    .fill-table col.input-col { width: 74%; }
    .fill-table td.input-cell { height: 48px; background: #fff; }
    .entry-wrap { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 34px; }
    .entry-space { flex: 1 1 auto; min-height: 26px; }
    .unit-hints { flex: 0 0 auto; color: #374151; font-size: 12px; white-space: nowrap; }
    .sign-table { margin-top: 0; height: 100%; table-layout: fixed; }
    .sign-table th { width: 46%; }
    .sign-table td { height: 62px; vertical-align: bottom; text-align: right; padding-bottom: 10px; }
    .note { margin-top: 7px; color: #374151; font-size: 11px; }
    .no-print { margin: 16px auto; width: 210mm; text-align: right; }
    .no-print button { padding: 10px 14px; border: 1px solid #111827; background: #111827; color: #fff; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  <main class="page">
    <h1>작업지시서 / 제조기록서</h1>

    <table class="compact">
      <colgroup>
        <col class="label" /><col class="value" /><col class="label" /><col class="value" />
      </colgroup>
      <tbody>
        <tr><th>LOT</th><td>${escapeHtml(data.lot_number)}</td><th>생산일자</th><td>${escapeHtml(data.work_date)}</td></tr>
        <tr><th>제품명</th><td>${escapeHtml(data.product_name)}</td><th>품목보고번호</th><td>${escapeHtml(productReportNumber)}</td></tr>
        <tr><th>패킹단위</th><td class="number">${packingUnitG !== null ? escapeHtml(formatGram(packingUnitG)) : '패킹단위 미등록'}</td><th>예정량</th><td class="number">${formatGram(data.planned_quantity_g)}</td></tr>
        <tr><th>예정수량(ea)</th><td class="number">${plannedEaByPacking !== null ? `${escapeHtml(formatNumber(plannedEaByPacking))}ea` : '계산불가'}</td><th>생산단위</th><td>${productionUnitLabel ? escapeHtml(productionUnitLabel) : '-'}</td></tr>
        ${plannedEaRemainderText ? `<tr><th>예정수량 상세</th><td colspan="3">${escapeHtml(plannedEaRemainderText)}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="section-title">원재료 준비 체크리스트</div>
    <table>
      <thead><tr>${unifiedHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
      <tbody>${unifiedRowsHtml}</tbody>
    </table>
    <div class="note">※ 준비 포장수량은 최종 투입량 ÷ 원재료 규격(g)으로 계산하며, 나누어떨어지지 않으면 실제 준비량이 부족하지 않도록 1개 단위로 올림합니다.</div>

    <div class="section-title">생산 완료 후 기입란</div>
    <div class="fill-grid">
      <table class="fill-table">
        <colgroup><col class="label-col" /><col class="input-col" /></colgroup>
        <tbody>
          <tr><th>완료수량</th><td class="input-cell"><div class="entry-wrap"><div class="entry-space"></div><div class="unit-hints">□ ea&nbsp;&nbsp;□ kg&nbsp;&nbsp;□ g</div></div></td></tr>
          <tr><th>불량수량</th><td class="input-cell"><div class="entry-wrap"><div class="entry-space"></div><div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div></div></td></tr>
          <tr><th>샘플수량</th><td class="input-cell"><div style="display:flex;flex-direction:column;gap:6px;">
            <div class="entry-wrap"><div class="entry-space">샘플 1: ______</div><div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div></div>
            <div class="entry-wrap"><div class="entry-space">샘플 2: ______</div><div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div></div>
            <div class="entry-wrap"><div class="entry-space">샘플 3: ______</div><div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div></div>
            <div class="entry-wrap"><div class="entry-space">샘플 합계: ______ g</div></div>
          </div></td></tr>
        </tbody>
      </table>
      <table class="sign-table"><tbody><tr><th>작성자 서명</th><td></td></tr><tr><th>확인자 서명</th><td></td></tr></tbody></table>
    </div>
  </main>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '작업지시서 PDF 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
