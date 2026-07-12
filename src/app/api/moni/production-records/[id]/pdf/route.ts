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
  return `${new Intl.NumberFormat('ko-KR').format(ea)}ea + 잔량 ${formatGram(remainderG)}`
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

type UnifiedWorkOrderRow = {
  material_name: string
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
    if (error) throw new Error(error.message || '제조기록서 조회에 실패했습니다.')
    if (!data) return NextResponse.json({ ok: false, error: '제조기록서를 찾을 수 없습니다.' }, { status: 404 })

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
      productionUnitName || (productionUnitWeightG !== null && productionUnitWeightG > 0 ? `${formatGram(productionUnitWeightG)} 단위` : '')

    let productReportNumber = ''
    let productPackingUnitG: number | null = null
    if (productId) {
      const byId = await supabase.from('products').select('report_number, weight_g').eq('id', productId).limit(1)
      if (byId.error) throw new Error(byId.error.message || '제품 정보 조회에 실패했습니다.')
      productReportNumber = String(byId.data?.[0]?.report_number ?? '').trim()
      productPackingUnitG = resolvePackingUnitG(byId.data?.[0]?.weight_g)
    }
    if (!productId) {
      return NextResponse.json(
        { ok: false, error: 'Production record has no valid product_id. Please link the product first.' },
        { status: 422 },
      )
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
      if (byProductId.error) throw new Error(byProductId.error.message || '레시피 조회에 실패했습니다.')
      recipeRows = (byProductId.data ?? []) as RecipeRow[]
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
    if (mappingQuery.error) throw new Error(mappingQuery.error.message || '원재료 매핑 조회에 실패했습니다.')
    const allMappings = (mappingQuery.data ?? []) as MappingRow[]

    const rawMaterialsQuery = await supabase.from('raw_materials').select('id, item_name, linked_product_id').or(materialBusinessScope).limit(5000)
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

      const byMappedRef = mappedRefId ? rawMaterialById.get(mappedRefId) : undefined
      const byMappedName = mappedRawName ? rawMaterialByName.get(normalizeKey(mappedRawName)) : undefined
      const fallbackMapping = foodTypeName ? mappingByRawNameFallback.get(normalizeKey(foodTypeName)) : undefined
      const fallbackMappingName = String(fallbackMapping?.raw_material_name ?? '').trim()
      const byFallbackMappingName = fallbackMappingName ? rawMaterialByName.get(normalizeKey(fallbackMappingName)) : undefined
      const byFoodTypeName = foodTypeName ? rawMaterialByName.get(normalizeKey(foodTypeName)) : undefined

      const materialRow = byMappedRef ?? byMappedName ?? byFallbackMappingName ?? byFoodTypeName
      const materialName =
        String(materialRow?.item_name ?? '').trim() ||
        mappedRawName ||
        fallbackMappingName ||
        (foodTypeName ? `미연결: ${foodTypeName}` : '미연결')
      const materialId = String(materialRow?.id ?? '').trim() || null
      const linkedProductId = String(materialRow?.linked_product_id ?? '').trim() || null
      return {
        materialId,
        materialName,
        linkedProductId,
        unresolved: !materialRow && !mappedRawName && !fallbackMappingName,
      }
    }

    const unresolvedItems: string[] = []
    let hasNestedSemi = false
    const semiColumnsOrdered: string[] = []
    const semiColumnMeta = new Map<string, { product_id: string; product_name: string; packing_unit_g: number | null }>()
    const rowAccumulator = new Map<string, UnifiedWorkOrderRow>()

    const getOrCreateRow = (materialName: string, materialId: string | null, unresolved?: boolean) => {
      const key = materialId ? `id:${materialId}` : `name:${normalizeKey(materialName) || materialName}`
      const found = rowAccumulator.get(key)
      if (found) return found
      const created: UnifiedWorkOrderRow = {
        material_name: materialName,
        production_product_g: 0,
        semi_product_g: {},
        final_input_g: 0,
        unresolved: !!unresolved,
      }
      rowAccumulator.set(key, created)
      return created
    }

    const candidateSemiProductIds = new Set<string>()
    for (const row of recipeRows) {
      if (!isPureSemiIngredient(row.ingredient_type)) continue
      const resolved = resolveMappedMaterial(row)
      if (resolved.linkedProductId) candidateSemiProductIds.add(resolved.linkedProductId)
    }
    const productsMetaById = new Map<string, ProductMetaRow>()
    if (candidateSemiProductIds.size > 0) {
      const productMetaQuery = await supabase.from('products').select('id, product_name, weight_g').in('id', Array.from(candidateSemiProductIds))
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
        const target = getOrCreateRow(resolved.materialName, resolved.materialId, resolved.unresolved)
        target.production_product_g += requiredG
        target.final_input_g += requiredG
        target.unresolved = target.unresolved || resolved.unresolved
        continue
      }

      if (!isPureSemiIngredient(row.ingredient_type)) continue

      const resolvedSemi = resolveMappedMaterial(row)
      const linkedProductId = resolvedSemi.linkedProductId
      const recipeItemName = String(row.food_type_name ?? '').trim() || '반제품'

      if (!linkedProductId) {
        unresolvedItems.push(`${recipeItemName}: 연결 반제품 미설정`)
        continue
      }

      const linkedProductMeta = productsMetaById.get(linkedProductId)
      const linkedProductName = String(linkedProductMeta?.product_name ?? '').trim() || linkedProductId
      if (!semiColumnMeta.has(linkedProductName)) {
        semiColumnMeta.set(linkedProductName, {
          product_id: linkedProductId,
          product_name: linkedProductName,
          packing_unit_g: resolvePackingUnitG(linkedProductMeta?.weight_g),
        })
        semiColumnsOrdered.push(linkedProductName)
      }

      const semiRecipes = await loadRecipesByProduct(linkedProductId, linkedProductName)
      if (semiRecipes.length === 0) {
        unresolvedItems.push(`${recipeItemName}: 연결 반제품 레시피 없음`)
        continue
      }

      for (const semiRecipe of semiRecipes) {
        const childRatio = parseNumber(semiRecipe.ratio_percent) ?? 0
        if (childRatio <= 0) continue
        const childRequiredG = (requiredG * childRatio) / 100
        if (childRequiredG <= 0) continue

        if (isPureSemiIngredient(semiRecipe.ingredient_type)) {
          hasNestedSemi = true
          const nestedName = String(semiRecipe.food_type_name ?? '').trim() || '반제품'
          unresolvedItems.push(`${recipeItemName}: 하위 반제품(${nestedName})은 미전개`)
          continue
        }
        if (!isRawIngredient(semiRecipe.ingredient_type)) continue

        const resolvedChild = resolveMappedMaterial(semiRecipe)
        const target = getOrCreateRow(resolvedChild.materialName, resolvedChild.materialId, resolvedChild.unresolved)
        target.semi_product_g[linkedProductId] = (target.semi_product_g[linkedProductId] ?? 0) + childRequiredG
        target.final_input_g += childRequiredG
        target.unresolved = target.unresolved || resolvedChild.unresolved
      }
    }

    for (const row of Array.from(rowAccumulator.values())) {
      if (!Number.isFinite(row.final_input_g) || row.final_input_g <= 0) {
        row.final_input_g = row.production_product_g + Object.values(row.semi_product_g).reduce((sum, value) => sum + value, 0)
      }
    }

    const expansionPayload: WorkOrderExpansionPayload = {
      semi_product_columns: semiColumnsOrdered
        .map((name) => semiColumnMeta.get(name))
        .filter((item): item is { product_id: string; product_name: string; packing_unit_g: number | null } => !!item),
      rows: Array.from(rowAccumulator.values()).sort((a, b) => b.final_input_g - a.final_input_g),
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

    const unifiedHeaders = [
      '원재료명',
      '생산제품(g)',
      ...expansionPayload.semi_product_columns.map((column) => `${column.product_name}(g)`),
      '최종 투입량(g)',
    ]

    const unifiedRowsHtml =
      expansionPayload.rows.length > 0
        ? expansionPayload.rows
            .map((row) => {
              const semiCells = expansionPayload.semi_product_columns
                .map((column) => `<td class="number">${formatRequiredGram(row.semi_product_g[column.product_id] ?? 0)}</td>`)
                .join('')
              return `<tr>
                <td>${escapeHtml(row.material_name)}</td>
                <td class="number">${formatRequiredGram(row.production_product_g)}</td>
                ${semiCells}
                <td class="number">${formatRequiredGram(row.final_input_g)}</td>
              </tr>`
            })
            .join('')
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
  <div class="no-print"><button onclick="window.print()">인쇄 / PDF 저장</button></div>
  <main class="page">
    <h1>작업지시서 / 제조기록서</h1>

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
          <td>${escapeHtml(data.lot_number)}</td>
          <th>생산일자</th>
          <td>${escapeHtml(data.work_date)}</td>
        </tr>
        <tr>
          <th>제품명</th>
          <td>${escapeHtml(data.product_name)}</td>
          <th>품목보고번호</th>
          <td>${escapeHtml(productReportNumber)}</td>
        </tr>
        <tr>
          <th>패킹단위</th>
          <td class="number">${packingUnitG !== null ? escapeHtml(formatGram(packingUnitG)) : '패킹단위 미등록'}</td>
          <th>예정량</th>
          <td class="number">${formatGram(data.planned_quantity_g)}</td>
        </tr>
        <tr>
          <th>예정수량(ea)</th>
          <td class="number">${plannedEaByPacking !== null ? `${escapeHtml(formatNumber(plannedEaByPacking))}ea` : '계산불가'}</td>
          <th>생산단위</th>
          <td>${productionUnitLabel ? escapeHtml(productionUnitLabel) : '-'}</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">원재료 필요량</div>
    <table>
      <thead>
        <tr>
          ${unifiedHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${unifiedRowsHtml}
      </tbody>
    </table>
    ${
      expansionPayload.unresolved_items.length > 0
        ? `<p style="margin-top:8px;font-size:12px;color:#b45309;">미연결/미전개: ${escapeHtml(expansionPayload.unresolved_items.join(' / '))}</p>`
        : ''
    }

    <div class="section-title">생산 완료 후 기입란</div>
    <div class="fill-grid">
      <table class="fill-table">
        <colgroup>
          <col class="label-col" />
          <col class="input-col" />
        </colgroup>
        <tbody>
          <tr>
            <th>완료수량</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">□ ea&nbsp;&nbsp;□ kg&nbsp;&nbsp;□ g</div>
              </div>
            </td>
          </tr>
          <tr>
            <th>불량수량</th>
            <td class="input-cell">
              <div class="entry-wrap">
                <div class="entry-space"></div>
                <div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div>
              </div>
            </td>
          </tr>
          <tr>
            <th>샘플수량</th>
            <td class="input-cell">
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div class="entry-wrap">
                  <div class="entry-space">샘플 1: ______</div>
                  <div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div>
                </div>
                <div class="entry-wrap">
                  <div class="entry-space">샘플 2: ______</div>
                  <div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div>
                </div>
                <div class="entry-wrap">
                  <div class="entry-space">샘플 3: ______</div>
                  <div class="unit-hints">□ kg&nbsp;&nbsp;□ g</div>
                </div>
                <div class="entry-wrap">
                  <div class="entry-space">샘플 합계: ______ g</div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table class="sign-table">
        <tbody>
          <tr><th>작성자 서명</th><td></td></tr>
          <tr><th>확인자 서명</th><td></td></tr>
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
    const message = error instanceof Error ? error.message : '작업지시서 PDF 생성 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
