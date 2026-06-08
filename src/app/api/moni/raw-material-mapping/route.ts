import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MappingScope = 'recipe' | 'product' | 'global'
type MappingStatus = 'mapped' | 'unmapped' | 'name_fallback' | 'needs_review'

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeScope(value: unknown): MappingScope | null {
  const raw = toText(value).toLowerCase()
  if (raw === 'recipe' || raw === 'product' || raw === 'global') return raw
  return null
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function parseBoolean(value: string | null): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y'
}

function isMissingTableError(message: string): boolean {
  const text = message.toLowerCase()
  return text.includes('does not exist') || text.includes('relation') || text.includes('schema cache')
}

function isMissingColumnError(message: string, columnName: string): boolean {
  const text = message.toLowerCase()
  const column = columnName.toLowerCase()
  return text.includes(column) && (text.includes('does not exist') || text.includes('schema cache') || text.includes('column'))
}

function normalizeBusinessId(value: unknown): string {
  return toText(value) || '20220523011'
}

function businessScopeFilter(businessId: string): string {
  return `business_id.eq.${businessId},business_id.eq.default,business_id.is.null`
}

function businessPriority(value: unknown, businessId: string): number {
  const raw = toText(value)
  if (raw === businessId) return 0
  if (raw === 'default') return 1
  if (raw === '') return 2
  return 3
}

const BROAD_TERMS = new Set(['소스', '복합조미식품', '기타가공품', '조미식품', '추출가공식품', '수산물가공품', '육류가공품'])

function scopeForRow(row: Record<string, unknown>): MappingScope {
  return normalizeScope(row.mapping_scope) ?? 'global'
}

function orderMappingsByCreatedAtDesc<T extends Record<string, unknown>>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(toText(a.created_at) || 0).getTime()
    const bTime = new Date(toText(b.created_at) || 0).getTime()
    return bTime - aTime
  })
}

async function fetchRecipeScopedRows(request: NextRequest) {
  const supabase = createMoniServiceRoleClient()
  const productIdQuery = request.nextUrl.searchParams.get('product_id')?.trim() ?? ''
  const productNameQuery = request.nextUrl.searchParams.get('product_name')?.trim() ?? ''
  const recipeItemQuery = request.nextUrl.searchParams.get('recipe_item_name')?.trim() ?? ''
  const statusFilter = request.nextUrl.searchParams.get('status')?.trim().toLowerCase() ?? 'pending'
  const scopeFilter = request.nextUrl.searchParams.get('scope')?.trim().toLowerCase() ?? 'all'
  const broadOnly = parseBoolean(request.nextUrl.searchParams.get('broad_only'))
  const businessId = normalizeBusinessId(request.nextUrl.searchParams.get('business_id'))
  const scopedMappingsQuery = supabase
    .from('raw_material_mapping')
    .select('*')
    .or(businessScopeFilter(businessId))
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  const scopedMaterialsQuery = supabase
    .from('raw_materials')
    .select('id, item_name, is_active, business_id')
    .or(businessScopeFilter(businessId))
    .order('item_name', { ascending: true })

  const [recipesResult, mappingsResult, rawMaterialsResult] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, product_id, product_name, food_type_id, food_type_name, ratio_percent, is_active, sort_order')
      .eq('is_active', true)
      .order('product_name', { ascending: true })
      .order('sort_order', { ascending: true }),
    scopedMappingsQuery,
    scopedMaterialsQuery,
  ])

  if (recipesResult.error) throw new Error(recipesResult.error.message || '레시피 목록 조회에 실패했습니다.')
  if (mappingsResult.error) throw new Error(mappingsResult.error.message || '원재료 매핑 목록 조회에 실패했습니다.')
  if (rawMaterialsResult.error) throw new Error(rawMaterialsResult.error.message || '활성 원재료 목록 조회에 실패했습니다.')

  const recipes = (recipesResult.data ?? []) as Array<Record<string, unknown>>
  const mappings = (mappingsResult.data ?? []) as Array<Record<string, unknown>>
  const rawMaterials = (rawMaterialsResult.data ?? []) as Array<{ id: string; item_name: string; is_active?: boolean; business_id?: string | null }>

  const materialsByName = new Map<string, { id: string; item_name: string }>()
  const materialsById = new Map<string, { id: string; item_name: string; is_active?: boolean }>()
  const activeMaterialsByName = new Map<string, { id: string; item_name: string; business_id?: string | null }>()
  for (const item of rawMaterials) {
    const id = String(item.id)
    if (id) materialsById.set(id, { id, item_name: String(item.item_name), is_active: item.is_active })
    if (item.is_active === false) continue
    const key = normalizeKey(String(item.item_name ?? ''))
    if (!key) continue
    const current = activeMaterialsByName.get(key)
    if (!current || businessPriority(item.business_id, businessId) < businessPriority(current.business_id, businessId)) {
      activeMaterialsByName.set(key, { id, item_name: String(item.item_name), business_id: item.business_id ?? null })
      materialsByName.set(key, { id, item_name: String(item.item_name) })
    }
  }

  const recipeScoped = new Map<string, Record<string, unknown>[]>()
  const productScoped = new Map<string, Record<string, unknown>[]>()
  const globalScoped = new Map<string, Record<string, unknown>[]>()

  for (const mapping of mappings) {
    if (mapping.is_default !== true) continue
    const scope = scopeForRow(mapping)
    const recipeId = toText(mapping.recipe_id)
    const productId = toText(mapping.product_id)
    const foodTypeId = toText(mapping.food_type_id)

    if (scope === 'recipe' && recipeId) {
      const list = recipeScoped.get(recipeId) ?? []
      list.push(mapping)
      recipeScoped.set(recipeId, list)
      continue
    }

    if (scope === 'product' && productId && foodTypeId) {
      const key = `${productId}::${foodTypeId}`
      const list = productScoped.get(key) ?? []
      list.push(mapping)
      productScoped.set(key, list)
      continue
    }

    if (foodTypeId) {
      const list = globalScoped.get(foodTypeId) ?? []
      list.push(mapping)
      globalScoped.set(foodTypeId, list)
    }
  }

  recipeScoped.forEach((value, key) => {
    recipeScoped.set(key, orderMappingsByCreatedAtDesc(value))
  })
  productScoped.forEach((value, key) => {
    productScoped.set(key, orderMappingsByCreatedAtDesc(value))
  })
  globalScoped.forEach((value, key) => {
    globalScoped.set(key, orderMappingsByCreatedAtDesc(value))
  })

  const rows = recipes
    .map((recipe) => {
      const recipeId = toText(recipe.id)
      const productId = toText(recipe.product_id)
      const productName = toText(recipe.product_name)
      const foodTypeId = toText(recipe.food_type_id)
      const foodTypeName = toText(recipe.food_type_name)
      const ratioPercent = toNumber(recipe.ratio_percent) ?? 0

      let selectedMapping: Record<string, unknown> | null = null
      let appliedScope: 'recipe' | 'product' | 'global' | 'fallback' | null = null

      const recipeCandidates = recipeScoped.get(recipeId) ?? []
      if (recipeCandidates.length > 0) {
        selectedMapping = recipeCandidates[0]
        appliedScope = 'recipe'
      }

      if (!selectedMapping) {
        const productCandidates = productScoped.get(`${productId}::${foodTypeId}`) ?? []
        if (productCandidates.length > 0) {
          selectedMapping = productCandidates[0]
          appliedScope = 'product'
        }
      }

      if (!selectedMapping) {
        const globalCandidates = globalScoped.get(foodTypeId) ?? []
        if (globalCandidates.length > 0) {
          selectedMapping = globalCandidates[0]
          appliedScope = 'global'
        }
      }

      const fallbackMaterial = materialsByName.get(normalizeKey(foodTypeName))
      const selectedRefId = toText(selectedMapping?.raw_material_ref_id)
      const selectedRefMaterial = selectedRefId ? materialsById.get(selectedRefId) : undefined
      const selectedName = selectedRefMaterial?.item_name || toText(selectedMapping?.raw_material_name)
      const currentMappedName = selectedName || fallbackMaterial?.item_name || null
      const currentMappedRefId = selectedRefMaterial?.id || selectedRefId || fallbackMaterial?.id || null
      const isBroad = BROAD_TERMS.has(foodTypeName)

      let mappingStatus: MappingStatus = 'unmapped'
      if (selectedMapping) {
        mappingStatus = 'mapped'
      } else if (fallbackMaterial) {
        mappingStatus = 'name_fallback'
        appliedScope = 'fallback'
      } else if (isBroad) {
        mappingStatus = 'needs_review'
      }

      return {
        recipe_id: recipeId,
        product_id: productId,
        product_name: productName,
        recipe_item_name: foodTypeName,
        food_type_id: foodTypeId,
        food_type_name: foodTypeName,
        ratio_percent: ratioPercent,
        current_raw_material_ref_id: currentMappedRefId,
        current_raw_material_name: currentMappedName,
        mapping_status: mappingStatus,
        applied_scope: appliedScope,
        mapping_id: toText(selectedMapping?.id) || null,
        is_broad: isBroad,
      }
    })
    .filter((row) => {
      if (productIdQuery && row.product_id !== productIdQuery) return false
      if (productNameQuery && !row.product_name.toLowerCase().includes(productNameQuery.toLowerCase())) return false
      if (recipeItemQuery && !row.recipe_item_name.toLowerCase().includes(recipeItemQuery.toLowerCase())) return false
      if (broadOnly && !row.is_broad) return false

      if (statusFilter === 'pending') {
        if (!['unmapped', 'name_fallback', 'needs_review'].includes(row.mapping_status)) return false
      } else if (statusFilter !== 'all' && row.mapping_status !== statusFilter) {
        return false
      }

      if (scopeFilter !== 'all' && (row.applied_scope ?? '') !== scopeFilter) return false
      return true
    })
    .sort((a, b) => {
      const byProduct = a.product_name.localeCompare(b.product_name, 'ko')
      if (byProduct !== 0) return byProduct
      return b.ratio_percent - a.ratio_percent
    })

  return {
    ok: true,
    rows,
    rawMaterials: Array.from(activeMaterialsByName.values()).map((item) => ({ id: item.id, item_name: item.item_name })),
  }
}

async function buildScopeDefaultQuery(
  supabase: ReturnType<typeof createMoniServiceRoleClient>,
  scope: MappingScope,
  params: {
    recipeId: string | null
    productId: string | null
    foodTypeId: string
    businessId: string
  },
) {
  const selected = '*'
  let query = supabase
    .from('raw_material_mapping')
    .select(selected)
    .eq('is_default', true)
    .or(businessScopeFilter(params.businessId))

  if (scope === 'recipe') {
    query = query.eq('mapping_scope', 'recipe').eq('recipe_id', params.recipeId)
  } else if (scope === 'product') {
    query = query.eq('mapping_scope', 'product').eq('product_id', params.productId).eq('food_type_id', params.foodTypeId)
  } else {
    query = query.eq('food_type_id', params.foodTypeId).or('mapping_scope.eq.global,mapping_scope.is.null')
  }

  return query
}

async function getLatestHistoryRow(businessId?: string) {
  const supabase = createMoniServiceRoleClient()
  let query = supabase
    .from('recipe_material_mapping_history')
    .select('*')
    .eq('is_undone', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (businessId) query = query.eq('business_id', businessId)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null
}

async function safeInsertHistory(input: Record<string, unknown>): Promise<{ history: Record<string, unknown> | null; warning?: string }> {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase.from('recipe_material_mapping_history').insert(input).select('*').maybeSingle()
  if (!error) return { history: (data as Record<string, unknown> | null) ?? null }
  if (isMissingTableError(error.message || '')) {
    return { history: null, warning: '되돌리기 이력 테이블이 아직 준비되지 않았습니다. 마이그레이션 적용 후 다시 시도해 주세요.' }
  }
  throw new Error(error.message || '매핑 이력 저장에 실패했습니다.')
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action')?.trim() ?? ''
    if (action === 'latest_history') {
      const businessId = request.nextUrl.searchParams.get('business_id')?.trim() ?? ''
      try {
        const history = await getLatestHistoryRow(businessId || undefined)
        return NextResponse.json({ ok: true, history }, { status: 200 })
      } catch (error) {
        const message = error instanceof Error ? error.message : '최근 이력 조회 중 오류가 발생했습니다.'
        if (isMissingTableError(message)) {
          return NextResponse.json(
            {
              ok: true,
              history: null,
              warning: '되돌리기 이력 테이블이 아직 준비되지 않았습니다. 마이그레이션 적용 후 사용해 주세요.',
            },
            { status: 200 },
          )
        }
        throw error
      }
    }

    const view = request.nextUrl.searchParams.get('view')?.trim() ?? ''
    if (view === 'recipes') {
      const payload = await fetchRecipeScopedRows(request)
      return NextResponse.json(payload, { status: 200 })
    }

    const foodTypeId = request.nextUrl.searchParams.get('food_type_id')?.trim() ?? ''
    const recipeId = request.nextUrl.searchParams.get('recipe_id')?.trim() ?? ''
    const productId = request.nextUrl.searchParams.get('product_id')?.trim() ?? ''
    const mappingScope = request.nextUrl.searchParams.get('mapping_scope')?.trim() ?? ''
    const supabase = createMoniServiceRoleClient()

    let query = supabase.from('raw_material_mapping').select('*').order('created_at', { ascending: false })
    if (foodTypeId) query = query.eq('food_type_id', foodTypeId)
    if (recipeId) query = query.eq('recipe_id', recipeId)
    if (productId) query = query.eq('product_id', productId)
    if (mappingScope) query = query.eq('mapping_scope', mappingScope)

    const { data, error } = await query
    if (error) throw new Error(error.message || '원재료 매핑 조회에 실패했습니다.')
    return NextResponse.json({ ok: true, mappings: data ?? [] }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 매핑 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const action = toText(body?.action).toLowerCase()
    const supabase = createMoniServiceRoleClient()

    if (action === 'undo_last_mapping') {
      let latestHistory: Record<string, unknown> | null = null
      try {
        latestHistory = await getLatestHistoryRow(toText(body?.business_id) || undefined)
      } catch (error) {
        const message = error instanceof Error ? error.message : '최근 이력을 불러오지 못했습니다.'
        if (isMissingTableError(message)) {
          return NextResponse.json(
            {
              ok: false,
              error: '되돌리기 이력 테이블이 아직 준비되지 않았습니다. 마이그레이션을 먼저 적용해 주세요.',
            },
            { status: 409 },
          )
        }
        throw error
      }

      if (!latestHistory) {
        return NextResponse.json({ ok: true, nextHistory: null, warning: '되돌릴 최근 처리 이력이 없습니다.' }, { status: 200 })
      }

      const newMappingId = toText(latestHistory.new_mapping_id)
      const previousIds = Array.isArray(latestHistory.previous_default_mapping_ids)
        ? latestHistory.previous_default_mapping_ids.map((item) => toText(item)).filter(Boolean)
        : []

      if (newMappingId) {
        const { error: demoteError } = await supabase.from('raw_material_mapping').update({ is_default: false }).eq('id', newMappingId)
        if (demoteError) throw new Error(demoteError.message || '최근 연결 기본값 해제에 실패했습니다.')
      }

      if (previousIds.length > 0) {
        const { error: restoreError } = await supabase.from('raw_material_mapping').update({ is_default: true }).in('id', previousIds)
        if (restoreError) throw new Error(restoreError.message || '이전 기본값 복원에 실패했습니다.')
      }

      const { error: markUndoneError } = await supabase
        .from('recipe_material_mapping_history')
        .update({
          is_undone: true,
          undone_at: new Date().toISOString(),
          undone_by: toText(body?.actor_id) || null,
        })
        .eq('id', toText(latestHistory.id))

      if (markUndoneError) throw new Error(markUndoneError.message || '되돌리기 이력 상태 업데이트에 실패했습니다.')

      const nextHistory = await getLatestHistoryRow(toText(body?.business_id) || undefined)
      return NextResponse.json({ ok: true, nextHistory }, { status: 200 })
    }

    const foodTypeId = toText(body?.food_type_id)
    const rawMaterialName = toText(body?.raw_material_name)
    const rawMaterialRefId = toText(body?.raw_material_ref_id) || null
    const mappingScope = normalizeScope(body?.mapping_scope) ?? 'global'
    const recipeId = toText(body?.recipe_id) || null
    let productId = toText(body?.product_id) || null
    let productName = toText(body?.product_name) || null
    const businessId = toText(body?.business_id) || 'default'

    if (!foodTypeId || (!rawMaterialRefId && !rawMaterialName)) {
      return NextResponse.json({ ok: false, error: '식품유형과 원재료명을 입력해 주세요.' }, { status: 400 })
    }
    if (mappingScope === 'recipe' && !recipeId) {
      return NextResponse.json({ ok: false, error: '레시피 범위 매핑에는 recipe_id가 필요합니다.' }, { status: 400 })
    }
    if (mappingScope === 'product' && !productId) {
      return NextResponse.json({ ok: false, error: '제품 범위 매핑에는 product_id가 필요합니다.' }, { status: 400 })
    }

    let activeMaterialQuery = supabase
      .from('raw_materials')
      .select('id, item_name, is_active')
      .eq('is_active', true)
      .or(businessScopeFilter(businessId))
    activeMaterialQuery = rawMaterialRefId ? activeMaterialQuery.eq('id', rawMaterialRefId) : activeMaterialQuery.eq('item_name', rawMaterialName)
    const { data: activeMaterial, error: activeMaterialError } = await activeMaterialQuery.maybeSingle()
    if (activeMaterialError) throw new Error(activeMaterialError.message || '원재료 검증에 실패했습니다.')
    if (!activeMaterial) {
      return NextResponse.json(
        { ok: false, error: '선택한 원재료가 활성 원재료 목록에 없습니다. 원재료 관리에서 먼저 등록/활성화해 주세요.' },
        { status: 400 },
      )
    }
    const canonicalRawMaterialRefId = toText(activeMaterial.id)
    const canonicalRawMaterialName = toText(activeMaterial.item_name) || rawMaterialName

    if ((mappingScope === 'recipe' || mappingScope === 'product') && (!productId || !productName) && recipeId) {
      const { data: recipeRow, error: recipeError } = await supabase
        .from('recipes')
        .select('product_id, product_name')
        .eq('id', recipeId)
        .maybeSingle()
      if (recipeError) throw new Error(recipeError.message || '레시피 정보 조회에 실패했습니다.')
      productId = productId || toText(recipeRow?.product_id) || null
      productName = productName || toText(recipeRow?.product_name) || null
    }

    const existingDefaultQuery = await buildScopeDefaultQuery(supabase, mappingScope, {
      recipeId,
      productId,
      foodTypeId,
      businessId,
    })
    const { data: existingDefaults, error: existingDefaultError } = await existingDefaultQuery
    if (existingDefaultError) throw new Error(existingDefaultError.message || '기존 기본 매핑 조회에 실패했습니다.')

    const sameDefault = (existingDefaults ?? []).find((item) => {
      const existingRefId = toText(item.raw_material_ref_id)
      if (canonicalRawMaterialRefId && existingRefId) return existingRefId === canonicalRawMaterialRefId
      return toText(item.raw_material_name) === canonicalRawMaterialName
    })
    if (sameDefault) {
      return NextResponse.json(
        {
          ok: true,
          mapping: sameDefault,
          history: null,
          warning: '동일 범위에 같은 기본 매핑이 이미 있습니다.',
        },
        { status: 200 },
      )
    }

    const previousDefaultIds = (existingDefaults ?? []).map((row) => toText(row.id)).filter(Boolean)
    if (previousDefaultIds.length > 0) {
      const { error: demoteError } = await supabase.from('raw_material_mapping').update({ is_default: false }).in('id', previousDefaultIds)
      if (demoteError) throw new Error(demoteError.message || '기존 기본 매핑 비활성화에 실패했습니다.')
    }

    const payload = {
      food_type_id: foodTypeId,
      raw_material_id: toNumber(body?.raw_material_id),
      raw_material_ref_id: canonicalRawMaterialRefId || null,
      raw_material_name: canonicalRawMaterialName,
      recipe_id: mappingScope === 'recipe' ? recipeId : null,
      product_id: mappingScope === 'global' ? null : productId,
      product_name: mappingScope === 'global' ? null : productName,
      mapping_scope: mappingScope,
      packing_unit: toText(body?.packing_unit) || null,
      packing_weight_g: toNumber(body?.packing_weight_g),
      is_default: true,
      business_id: businessId,
    }

    let insertResult = await supabase.from('raw_material_mapping').insert(payload).select('*').single()
    if (insertResult.error && isMissingColumnError(insertResult.error.message, 'raw_material_ref_id')) {
      const legacyPayload: Record<string, unknown> = { ...payload }
      delete legacyPayload.raw_material_ref_id
      insertResult = await supabase.from('raw_material_mapping').insert(legacyPayload).select('*').single()
    }
    const { data, error } = insertResult
    if (error) throw new Error(error.message || '원재료 매핑 저장에 실패했습니다.')

    const historyInsert = await safeInsertHistory({
      business_id: businessId,
      action_type: 'set_default',
      mapping_scope: mappingScope,
      recipe_id: mappingScope === 'recipe' ? recipeId : null,
      product_id: mappingScope === 'global' ? null : productId,
      product_name: mappingScope === 'global' ? null : productName,
      food_type_id: foodTypeId || null,
      new_mapping_id: toText(data?.id) || null,
      previous_default_mapping_ids: previousDefaultIds,
      raw_material_name: canonicalRawMaterialName,
      recipe_item_name: toText(body?.recipe_item_name) || toText(body?.food_type_name) || null,
      food_type_name: toText(body?.food_type_name) || null,
      actor_id: toText(body?.actor_id) || null,
      actor_name: toText(body?.actor_name) || null,
      is_undone: false,
    })

    return NextResponse.json({ ok: true, mapping: data, history: historyInsert.history, warning: historyInsert.warning }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 매핑 저장 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const id = toText(body?.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 매핑 id가 필요합니다.' }, { status: 400 })

    const mappingScope = normalizeScope(body?.mapping_scope)
    if (mappingScope === null) {
      return NextResponse.json({ ok: false, error: 'mapping_scope는 recipe/product/global만 허용됩니다.' }, { status: 400 })
    }

    const rawMaterialName = toText(body?.raw_material_name)
    const rawMaterialRefId = toText(body?.raw_material_ref_id) || null
    if (!rawMaterialRefId && !rawMaterialName) {
      return NextResponse.json({ ok: false, error: 'raw_material_name은 필수입니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    let activeMaterialQuery = supabase
      .from('raw_materials')
      .select('id, item_name')
      .eq('is_active', true)
      .or(businessScopeFilter(normalizeBusinessId(body?.business_id)))
    activeMaterialQuery = rawMaterialRefId ? activeMaterialQuery.eq('id', rawMaterialRefId) : activeMaterialQuery.eq('item_name', rawMaterialName)
    const { data: activeMaterial, error: activeMaterialError } = await activeMaterialQuery.maybeSingle()
    if (activeMaterialError) throw new Error(activeMaterialError.message || '원재료 검증에 실패했습니다.')
    if (!activeMaterial) {
      return NextResponse.json(
        { ok: false, error: '선택한 원재료가 활성 원재료 목록에 없습니다. 원재료 관리에서 먼저 등록/활성화해 주세요.' },
        { status: 400 },
      )
    }
    const canonicalRawMaterialRefId = toText(activeMaterial.id)
    const canonicalRawMaterialName = toText(activeMaterial.item_name) || rawMaterialName

    const updatePayload = {
      food_type_id: toText(body?.food_type_id) || null,
      raw_material_ref_id: canonicalRawMaterialRefId || null,
      raw_material_name: canonicalRawMaterialName,
      mapping_scope: mappingScope,
      recipe_id: mappingScope === 'recipe' ? toText(body?.recipe_id) || null : null,
      product_id: mappingScope === 'global' ? null : toText(body?.product_id) || null,
      product_name: mappingScope === 'global' ? null : toText(body?.product_name) || null,
      packing_unit: toText(body?.packing_unit) || null,
      packing_weight_g: toNumber(body?.packing_weight_g),
      is_default: body?.is_default === false ? false : true,
    }

    let updateResult = await supabase.from('raw_material_mapping').update(updatePayload).eq('id', id).select('*').single()
    if (updateResult.error && isMissingColumnError(updateResult.error.message, 'raw_material_ref_id')) {
      const legacyPayload: Record<string, unknown> = { ...updatePayload }
      delete legacyPayload.raw_material_ref_id
      updateResult = await supabase.from('raw_material_mapping').update(legacyPayload).eq('id', id).select('*').single()
    }
    const { data, error } = updateResult
    if (error) throw new Error(error.message || '원재료 매핑 수정에 실패했습니다.')

    return NextResponse.json({ ok: true, mapping: data }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 매핑 수정 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
    if (!id) {
      return NextResponse.json({ ok: false, error: '삭제할 매핑 id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('raw_material_mapping').delete().eq('id', id)
    if (error) throw new Error(error.message || '원재료 매핑 삭제에 실패했습니다.')

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '원재료 매핑 삭제 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
