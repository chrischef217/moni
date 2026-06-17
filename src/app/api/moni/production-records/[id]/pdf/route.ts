import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '-'
}

function formatGram(value: unknown) {
  const parsed = parseNumber(value)
  if (parsed === null) return '-'
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(parsed)}g`
}

// ?먯옱猷??꾩슂???됱? ?⑥쐞 ?묐????놁씠 ?レ옄留??쒖떆?쒕떎.
function formatRequiredGram(value: number) {
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

function formatEaRemainder(ea: number, remainderG: number) {
  return `${new Intl.NumberFormat('ko-KR').format(ea)}ea + ?붾웾 ${formatGram(remainderG)}`
}

function resolvePackingUnitG(value: unknown): number | null {
  const parsed = parseNumber(value)
  if (parsed === null || parsed <= 0) return null
  return parsed
}

function calcEaByPackingUnit(quantityG: number, packingUnitG: number | null) {
  if (!Number.isFinite(quantityG) || quantityG <= 0 || packingUnitG === null || packingUnitG <= 0) return null
  return Math.ceil(quantityG / packingUnitG)
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
}

type MaterialRow = {
  id?: string | null
  item_name?: string | null
  linked_product_id?: string | null
}

type ProductMetaRow = {
  id?: string | null
  product_name?: string | null
  weight_g?: number | string | null
}

type SemiInstructionMaterialRow = {
  material_name: string
  required_g: number
  ratio_percent: number
  unresolved?: boolean
}

type SemiInstructionRow = {
  recipe_item_name: string
  linked_product_id: string | null
  linked_product_name: string
  required_production_g: number
  packing_unit_g: number | null
  planned_quantity_ea: number | null
  materials: SemiInstructionMaterialRow[]
  unresolved_reason?: string
  has_nested_semi?: boolean
}

type FinalRequirementRow = {
  material_name: string
  required_g: number
  ratio_percent: number
  unresolved?: boolean
}

type WorkOrderExpansionPayload = {
  semi_instructions: SemiInstructionRow[]
  final_requirements: FinalRequirementRow[]
  has_nested_semi: boolean
  unresolved_items: string[]
}

function normalizeKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

function isRawIngredient(value: string | null | undefined) {
  const raw = normalizeKey(String(value ?? ''))
  if (!raw) return true
  if (raw === '원재료' || raw === 'raw') return true
  if (raw === '제품/반제품' || raw === '제품반제품' || raw === 'productsemi' || raw === 'hybridsemi') return true
  return false
}

function isPureSemiIngredient(value: string | null | undefined) {
  const raw = normalizeKey(String(value ?? ''))
  if (!raw) return false
  if (raw === '반제품' || raw === 'semi' || raw === 'semiproduct') return true
  return false
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createMoniServiceRoleClient()
    const { data, error } = await supabase.from('production_records').select('*').eq('id', params.id).maybeSingle()
    if (error) throw new Error(error.message || '?쒖“湲곕줉??議고쉶???ㅽ뙣?덉뒿?덈떎.')
    if (!data) return NextResponse.json({ ok: false, error: '?쒖“湲곕줉?쒕? 李얠쓣 ???놁뒿?덈떎.' }, { status: 404 })

    const productId = String(data.product_id ?? '').trim()
    const productName = String(data.product_name ?? '').trim()
    const plannedQuantityG = parseNumber(data.planned_quantity_g) ?? 0
    const productionUnitName = String(data.production_unit_name ?? '').trim()
    const productionUnitWeightG = parseNumber(data.production_unit_weight_g)
    const storedPlannedEa = parseNumber(data.planned_quantity_ea)
    const storedPlannedRemainderG = parseNumber(data.planned_remainder_g)
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
      productionUnitName || (productionUnitWeightG !== null && productionUnitWeightG > 0 ? `${formatGram(productionUnitWeightG)} ?⑥쐞` : '')

    let productReportNumber = ''
    let productPackingUnitG: number | null = null
    if (productId) {
      const byId = await supabase.from('products').select('report_number, weight_g').eq('id', productId).limit(1)
      if (byId.error) throw new Error(byId.error.message || '?쒗뭹 ?뺣낫 議고쉶???ㅽ뙣?덉뒿?덈떎.')
      productReportNumber = String(byId.data?.[0]?.report_number ?? '').trim()
      productPackingUnitG = resolvePackingUnitG(byId.data?.[0]?.weight_g)
    }
    if (!productReportNumber && productName) {
      const byName = await supabase.from('products').select('report_number, weight_g').eq('product_name', productName).limit(1)
      if (byName.error) throw new Error(byName.error.message || '?쒗뭹 ?뺣낫 議고쉶???ㅽ뙣?덉뒿?덈떎.')
      productReportNumber = String(byName.data?.[0]?.report_number ?? '').trim()
      if (productPackingUnitG === null) {
        productPackingUnitG = resolvePackingUnitG(byName.data?.[0]?.weight_g)
      }
    }
    if (!productReportNumber) productReportNumber = '미등록'

    const recordPackingUnitG = resolvePackingUnitG(data.production_unit_weight_g)
    const packingUnitG = recordPackingUnitG ?? productPackingUnitG
    const plannedEaByPacking = calcEaByPackingUnit(plannedQuantityG, packingUnitG)

    let recipeRows: RecipeRow[] = []

    if (productId) {
      const byProductId = await supabase
        .from('recipes')
        .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id')
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (byProductId.error) throw new Error(byProductId.error.message || '?덉떆??議고쉶???ㅽ뙣?덉뒿?덈떎.')
      recipeRows = (byProductId.data ?? []) as RecipeRow[]
    }

    if (recipeRows.length === 0 && productName) {
      const byProductName = await supabase
        .from('recipes')
        .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id')
        .eq('product_name', productName)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (byProductName.error) throw new Error(byProductName.error.message || '?덉떆??議고쉶???ㅽ뙣?덉뒿?덈떎.')
      recipeRows = (byProductName.data ?? []) as RecipeRow[]
    }

    const businessId = String(data.business_id ?? '').trim() || '20220523011'
    const materialBusinessScope = `business_id.eq.${businessId},business_id.eq.default,business_id.is.null`
    const mappingQuery = await supabase
      .from('raw_material_mapping')
      .select(
        'recipe_id, product_id, food_type_id, raw_material_ref_id, raw_material_id, raw_material_name, mapping_scope, is_default, created_at, business_id',
      )
      .eq('is_default', true)
      .or(materialBusinessScope)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (mappingQuery.error) throw new Error(mappingQuery.error.message || '?먯옱猷?留ㅽ븨 議고쉶???ㅽ뙣?덉뒿?덈떎.')
    const allMappings = (mappingQuery.data ?? []) as MappingRow[]
    const rawMaterialsQuery = await supabase
      .from('raw_materials')
      .select('id, item_name, linked_product_id')
      .or(materialBusinessScope)
      .limit(5000)
    if (rawMaterialsQuery.error) throw new Error(rawMaterialsQuery.error.message || '원재료 조회에 실패했습니다.')
    const rawMaterials = (rawMaterialsQuery.data ?? []) as MaterialRow[]
    const rawMaterialById = new Map(
      rawMaterials
        .map((material) => [String(material.id ?? '').trim(), material] as const)
        .filter(([id]) => id.length > 0),
    )
    const rawMaterialByName = new Map(
      rawMaterials
        .map((material) => [normalizeKey(material.item_name), material] as const)
        .filter(([key]) => key.length > 0),
    )

    const recipeScopeMappings = new Map<string, MappingRow[]>()
    const productScopeMappings = new Map<string, MappingRow[]>()
    const globalScopeMappings = new Map<string, MappingRow[]>()
    const mappingByRawNameFallback = new Map<string, MappingRow>()
    for (const mapping of allMappings) {
      const scope = String(mapping.mapping_scope ?? '').trim().toLowerCase()
      const recipeId = String(mapping.recipe_id ?? '').trim()
      const productIdKey = String(mapping.product_id ?? '').trim()
      const foodTypeIdKey = String(mapping.food_type_id ?? '').trim()
      if (scope === 'recipe' && recipeId) {
        const list = recipeScopeMappings.get(recipeId) ?? []
        list.push(mapping)
        recipeScopeMappings.set(recipeId, list)
      } else if (scope === 'product' && productIdKey && foodTypeIdKey) {
        const key = `${productIdKey}::${foodTypeIdKey}`
        const list = productScopeMappings.get(key) ?? []
        list.push(mapping)
        productScopeMappings.set(key, list)
      } else if (scope === 'global' && foodTypeIdKey) {
        const list = globalScopeMappings.get(foodTypeIdKey) ?? []
        list.push(mapping)
        globalScopeMappings.set(foodTypeIdKey, list)
      }
      const rawNameKey = normalizeKey(mapping.raw_material_name)
      if (rawNameKey && !mappingByRawNameFallback.has(rawNameKey)) {
        mappingByRawNameFallback.set(rawNameKey, mapping)
      }
    }

    const recipeCache = new Map<string, RecipeRow[]>()
    const loadRecipesByProduct = async (targetProductId: string, targetProductName: string) => {
      const key = `${targetProductId}::${targetProductName}`
      const cached = recipeCache.get(key)
      if (cached) return cached

      let rows: RecipeRow[] = []
      if (targetProductId) {
        const byId = await supabase
          .from('recipes')
          .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id')
          .eq('product_id', targetProductId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (byId.error) throw new Error(byId.error.message || '레시피 조회에 실패했습니다.')
        rows = (byId.data ?? []) as RecipeRow[]
      }
      if (rows.length === 0 && targetProductName) {
        const byName = await supabase
          .from('recipes')
          .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, ingredient_type, semi_product_id')
          .eq('product_name', targetProductName)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (byName.error) throw new Error(byName.error.message || '레시피 조회에 실패했습니다.')
        rows = (byName.data ?? []) as RecipeRow[]
      }
      recipeCache.set(key, rows)
      return rows
    }

    const resolvePreferredMapping = (row: RecipeRow) => {
      const recipeId = String(row.id ?? '').trim()
      const recipeProductId = String(row.product_id ?? '').trim() || productId
      const foodTypeId = String(row.food_type_id ?? '').trim()
      const recipeCandidate = recipeId ? (recipeScopeMappings.get(recipeId) ?? [])[0] : null
      const productCandidate =
        recipeProductId && foodTypeId ? (productScopeMappings.get(`${recipeProductId}::${foodTypeId}`) ?? [])[0] : null
      const globalCandidate = foodTypeId ? (globalScopeMappings.get(foodTypeId) ?? [])[0] : null
      return recipeCandidate ?? productCandidate ?? globalCandidate ?? null
    }

    const resolveMappedMaterial = (row: RecipeRow) => {
      const preferred = resolvePreferredMapping(row)
      const foodTypeName = String(row.food_type_name ?? '').trim()
      const mappedRefId = String(preferred?.raw_material_ref_id ?? preferred?.raw_material_id ?? '').trim()
      const mappedRawName = String(preferred?.raw_material_name ?? '').trim()
      const byRef = mappedRefId ? rawMaterialById.get(mappedRefId) : undefined
      const byMappedName = mappedRawName ? rawMaterialByName.get(normalizeKey(mappedRawName)) : undefined
      const fallbackMapping = foodTypeName ? mappingByRawNameFallback.get(normalizeKey(foodTypeName)) : undefined
      const fallbackMappingName = String(fallbackMapping?.raw_material_name ?? '').trim()
      const byFallbackMappingName = fallbackMappingName ? rawMaterialByName.get(normalizeKey(fallbackMappingName)) : undefined
      const byFoodTypeName = foodTypeName ? rawMaterialByName.get(normalizeKey(foodTypeName)) : undefined
      const materialRow = byRef ?? byMappedName ?? byFallbackMappingName ?? byFoodTypeName
      const materialName =
        String(materialRow?.item_name ?? '').trim() || mappedRawName || fallbackMappingName || (foodTypeName ? `미연결: ${foodTypeName}` : '미연결')
      const materialId = String(materialRow?.id ?? '').trim() || null
      const linkedProductId = String(materialRow?.linked_product_id ?? '').trim() || null
      return { materialId, materialName, linkedProductId, unresolved: !materialRow && !mappedRawName && !fallbackMappingName }
    }

    const finalAggregate = new Map<string, FinalRequirementRow>()
    const addFinalRequirement = (materialName: string, materialId: string | null, requiredG: number, ratioPercent: number, unresolved?: boolean) => {
      if (!Number.isFinite(requiredG) || requiredG <= 0) return
      const key = materialId ? `id:${materialId}` : `name:${normalizeKey(materialName)}`
      const prev = finalAggregate.get(key)
      if (prev) {
        prev.required_g += requiredG
        prev.ratio_percent += ratioPercent
        prev.unresolved = prev.unresolved || !!unresolved
        finalAggregate.set(key, prev)
        return
      }
      finalAggregate.set(key, { material_name: materialName, required_g: requiredG, ratio_percent: ratioPercent, unresolved })
    }

    const semiInstructionRows: SemiInstructionRow[] = []
    const unresolvedItems: string[] = []
    let hasNestedSemi = false

    const candidateSemiProductIds = new Set<string>()
    for (const row of recipeRows) {
      if (!isPureSemiIngredient(row.ingredient_type)) continue
      const resolved = resolveMappedMaterial(row)
      if (resolved.linkedProductId) candidateSemiProductIds.add(resolved.linkedProductId)
    }
    const productsMetaById = new Map<string, ProductMetaRow>()
    if (candidateSemiProductIds.size > 0) {
      const productMetaQuery = await supabase
        .from('products')
        .select('id, product_name, weight_g')
        .in('id', Array.from(candidateSemiProductIds))
      if (!productMetaQuery.error) {
        for (const item of (productMetaQuery.data ?? []) as ProductMetaRow[]) {
          const id = String(item.id ?? '').trim()
          if (id) productsMetaById.set(id, item)
        }
      }
    }

    for (const row of recipeRows) {
      const ratioPercent = parseNumber(row.ratio_percent) ?? 0
      if (ratioPercent <= 0) continue
      const requiredG = plannedQuantityG > 0 ? (plannedQuantityG * ratioPercent) / 100 : 0
      if (requiredG <= 0) continue

      if (isRawIngredient(row.ingredient_type)) {
        const resolved = resolveMappedMaterial(row)
        addFinalRequirement(resolved.materialName, resolved.materialId, requiredG, ratioPercent, resolved.unresolved)
        continue
      }

      if (!isPureSemiIngredient(row.ingredient_type)) {
        continue
      }

      const resolvedSemi = resolveMappedMaterial(row)
      const linkedProductId = resolvedSemi.linkedProductId
      const recipeItemName = String(row.food_type_name ?? '').trim() || '반제품'

      if (!linkedProductId) {
        semiInstructionRows.push({
          recipe_item_name: recipeItemName,
          linked_product_id: null,
          linked_product_name: '미연결',
          required_production_g: requiredG,
          packing_unit_g: null,
          planned_quantity_ea: null,
          materials: [],
          unresolved_reason: 'linked_product_id 미연결',
        })
        unresolvedItems.push(`${recipeItemName}: 연결 반제품 미설정`)
        continue
      }

      const linkedProductMeta = productsMetaById.get(linkedProductId)
      const linkedProductName = String(linkedProductMeta?.product_name ?? '').trim() || linkedProductId
      const linkedPackingUnitG = resolvePackingUnitG(linkedProductMeta?.weight_g)
      const linkedPlannedEa = calcEaByPackingUnit(requiredG, linkedPackingUnitG)
      const semiRecipes = await loadRecipesByProduct(linkedProductId, linkedProductName)

      if (semiRecipes.length === 0) {
        semiInstructionRows.push({
          recipe_item_name: recipeItemName,
          linked_product_id: linkedProductId,
          linked_product_name: linkedProductName,
          required_production_g: requiredG,
          packing_unit_g: linkedPackingUnitG,
          planned_quantity_ea: linkedPlannedEa,
          materials: [],
          unresolved_reason: '연결된 반제품 레시피 없음',
        })
        unresolvedItems.push(`${recipeItemName}: 연결 반제품 레시피 없음`)
        continue
      }

      const semiMaterials: SemiInstructionMaterialRow[] = []
      let semiHasNested = false
      for (const semiRecipe of semiRecipes) {
        const childRatio = parseNumber(semiRecipe.ratio_percent) ?? 0
        if (childRatio <= 0) continue
        const childRequiredG = (requiredG * childRatio) / 100
        if (childRequiredG <= 0) continue

        if (isPureSemiIngredient(semiRecipe.ingredient_type)) {
          semiHasNested = true
          hasNestedSemi = true
          const nestedName = String(semiRecipe.food_type_name ?? '').trim() || '반제품'
          semiMaterials.push({
            material_name: `미전개 반제품: ${nestedName}`,
            required_g: childRequiredG,
            ratio_percent: childRatio,
            unresolved: true,
          })
          unresolvedItems.push(`${recipeItemName}: 하위 반제품(${nestedName})은 다음 단계 전개 필요`)
          continue
        }

        if (!isRawIngredient(semiRecipe.ingredient_type)) {
          continue
        }

        const resolvedChild = resolveMappedMaterial(semiRecipe)
        semiMaterials.push({
          material_name: resolvedChild.materialName,
          required_g: childRequiredG,
          ratio_percent: childRatio,
          unresolved: resolvedChild.unresolved,
        })
        addFinalRequirement(resolvedChild.materialName, resolvedChild.materialId, childRequiredG, (ratioPercent * childRatio) / 100, resolvedChild.unresolved)
      }

      semiInstructionRows.push({
        recipe_item_name: recipeItemName,
        linked_product_id: linkedProductId,
        linked_product_name: linkedProductName,
        required_production_g: requiredG,
        packing_unit_g: linkedPackingUnitG,
        planned_quantity_ea: linkedPlannedEa,
        materials: semiMaterials,
        has_nested_semi: semiHasNested,
      })
    }

    const requirementRows = Array.from(finalAggregate.values())
      .filter((row) => row.ratio_percent > 0)
      .sort((a, b) => b.required_g - a.required_g)

    const expansionPayload: WorkOrderExpansionPayload = {
      semi_instructions: semiInstructionRows,
      final_requirements: requirementRows,
      has_nested_semi: hasNestedSemi,
      unresolved_items: Array.from(new Set(unresolvedItems)),
    }

    const formatMode = _request.nextUrl.searchParams.get('format')?.trim().toLowerCase() ?? ''
    if (formatMode === 'json') {
      return NextResponse.json(
        {
          ok: true,
          record: {
            id: data.id,
            lot_number: data.lot_number,
            product_name: data.product_name,
            planned_quantity_g: plannedQuantityG,
          },
          expansion: expansionPayload,
        },
        { status: 200 },
      )
    }
    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>?묒뾽吏?쒖꽌 ${escapeHtml(data.lot_number)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; background: #f3f4f6; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 14mm; }
    h1 { margin: 0 0 10px; text-align: center; font-size: 24px; letter-spacing: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 8px; }
    th, td { border: 1px solid #111827; padding: 7px 8px; vertical-align: middle; }
    th { background: #e5e7eb; text-align: left; white-space: nowrap; }
    .section-title { margin-top: 14px; font-size: 16px; font-weight: 700; }
    .compact { table-layout: fixed; }
    .compact col.label { width: 18%; }
    .compact col.value { width: 32%; }
    .compact td.value { word-break: break-word; }
    .number { text-align: right; white-space: nowrap; }
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
  <div class="no-print"><button onclick="window.print()">?몄뇙 / PDF ???/button></div>
  <main class="page">
    <h1>?묒뾽吏?쒖꽌 / ?쒖“湲곕줉??/h1>

    <table class="compact">
      <colgroup>
        <col class="label" />
        <col class="value" />
        <col class="label" />
        <col class="value" />
      </colgroup>
      <tbody>
        <tr>
          <th>LOT</th>
          <td class="value">${escapeHtml(data.lot_number)}</td>
          <th>?앹궛?쇱옄</th>
          <td class="value">${escapeHtml(data.work_date)}</td>
        </tr>
        <tr>
          <th>?쒗뭹紐?/th>
          <td class="value">${escapeHtml(data.product_name)}</td>
          <th>?덈ぉ蹂닿퀬踰덊샇</th>
          <td class="value">${escapeHtml(productReportNumber)}</td>
        </tr>
        <tr>
          <th>?⑦궧?⑥쐞</th>
          <td class="value number">${packingUnitG !== null ? escapeHtml(formatGram(packingUnitG)) : '패킹단위 미등록'}</td>
          <th></th>
          <td class="value">-</td>
        </tr>
        <tr>
          <th>?덉젙?섎웾</th>
          <td class="value number">${formatGram(data.planned_quantity_g)}</td>
          <th>?덉젙?섎웾(ea)</th>
          <td class="value number">${plannedEaByPacking !== null ? `${escapeHtml(formatNumber(plannedEaByPacking))}ea` : '怨꾩궛遺덇?'}</td>
        </tr>
        ${
          productionUnitLabel
            ? `<tr>
          <th>?앹궛?⑥쐞</th>
          <td class="value">${escapeHtml(productionUnitLabel)}</td>
          <th></th>
          <td class="value">-</td>
        </tr>`
            : ''
        }
      </tbody>
    </table>

    <div class="section-title">반제품 생산 지시</div>
    <table>
      <thead>
        <tr>
          <th>레시피 항목(반제품)</th>
          <th>연결 제품</th>
          <th class="number">필요 생산량(g)</th>
          <th>패킹단위</th>
          <th class="number">예정수량(ea)</th>
          <th>반제품 생산 원재료</th>
        </tr>
      </thead>
      <tbody>
        ${
          expansionPayload.semi_instructions.length > 0
            ? expansionPayload.semi_instructions
                .map((item) => {
                  const materialsText =
                    item.materials.length > 0
                      ? item.materials
                          .map((material) => `${material.material_name} (${formatRequiredGram(material.required_g)}g)`)
                          .join(', ')
                      : item.unresolved_reason || '-'
                  return `<tr>
                    <td>${escapeHtml(item.recipe_item_name)}</td>
                    <td>${escapeHtml(item.linked_product_name)}</td>
                    <td class="number">${formatRequiredGram(item.required_production_g)}</td>
                    <td>${item.packing_unit_g !== null ? escapeHtml(formatGram(item.packing_unit_g)) : '패킹단위 미등록'}</td>
                    <td class="number">${item.planned_quantity_ea !== null ? `${escapeHtml(formatNumber(item.planned_quantity_ea))}ea` : '계산불가'}</td>
                    <td>${escapeHtml(materialsText)}</td>
                  </tr>`
                })
                .join('')
            : '<tr><td colspan="6">반제품 원재료 전개 대상이 없습니다.</td></tr>'
        }
      </tbody>
    </table>

    <div class="section-title">최종 합산 원재료 필요량</div>
    <table>
      <thead>
        <tr>
          <th>원재료명</th>
          <th class="number">諛고빀鍮꾩쑉(%)</th>
          <th class="number">?꾩슂??g)</th>
        </tr>
      </thead>
      <tbody>
        ${
          requirementRows.length > 0
            ? requirementRows
                .map(
                  (row) => `<tr>
                    <td>${escapeHtml(row.material_name)}</td>
                    <td class="number">${formatNumber(row.ratio_percent)}</td>
                    <td class="number">${formatRequiredGram(row.required_g)}</td>
                  </tr>`,
                )
                .join('')
            : '<tr><td colspan="3">?깅줉???덉떆?쇨? ?놁뼱 ?먯옱猷??꾩슂?됱쓣 怨꾩궛?????놁뒿?덈떎.</td></tr>'
        }
      </tbody>
    </table>
    ${
      expansionPayload.unresolved_items.length > 0
        ? `<p style="margin-top:8px;font-size:12px;color:#b45309;">미연결/미전개 항목: ${escapeHtml(expansionPayload.unresolved_items.join(' / '))}</p>`
        : ''
    }

    <div class="section-title">?앹궛 ?꾨즺 ??湲곗엯?</div>
    <div class="fill-grid">
      <table class="fill-table">
        <colgroup>
          <col class="label-col" />
          <col class="input-col" />
        </colgroup>
        <tbody>
          <tr>
            <th>?꾨즺?섎웾</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">??ea&nbsp;&nbsp;??kg&nbsp;&nbsp;??g</div>
              </div>
            </td>
          </tr>
          <tr>
            <th>遺덈웾?섎웾</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">??kg&nbsp;&nbsp;??g</div>
              </div>
            </td>
          </tr>
          <tr>
            <th>?섑뵆?섎웾</th>
            <td class="input-cell">
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div class="entry-wrap">
                  <div class="entry-space">?섑뵆 1: ______</div>
                  <div class="unit-hints">??kg&nbsp;&nbsp;??g</div>
                </div>
                <div class="entry-wrap">
                  <div class="entry-space">?섑뵆 2: ______</div>
                  <div class="unit-hints">??kg&nbsp;&nbsp;??g</div>
                </div>
                <div class="entry-wrap">
                  <div class="entry-space">?섑뵆 3: ______</div>
                  <div class="unit-hints">??kg&nbsp;&nbsp;??g</div>
                </div>
                <div class="entry-wrap">
                  <div class="entry-space">?섑뵆 ?⑷퀎: ______ g</div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table class="sign-table">
        <tbody>
          <tr><th>?묒꽦???쒕챸</th><td></td></tr>
          <tr><th>?뺤씤???쒕챸</th><td></td></tr>
        </tbody>
      </table>
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
    const message = error instanceof Error ? error.message : '?쒖“湲곕줉??PDF ?앹꽦 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
