import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ProductOption = {
  id: string
  product_name: string
}

type RecordRow = {
  id: string
  lot_number: string
  work_date: string
  product_id: string | null
  product_name: string
  production_unit_id: string | null
  production_unit_name: string | null
  production_unit_weight_g: number | null
  planned_quantity_ea: number | null
  planned_remainder_g: number | null
  actual_quantity_ea: number | null
  planned_quantity_g: number | null
  actual_quantity_g: number | null
  defect_quantity_g: number | null
  sample_quantity_g: number | null
  worker_name: string | null
  start_time: string | null
  end_time: string | null
  inspection_result: string | null
  inspection_note: string | null
  sanitation_check: boolean | null
  note: string | null
  status: string | null
  business_id: string | null
  created_at: string
  updated_at: string | null
}

type RecipeRow = {
  id: string
  product_id: string | null
  product_name: string
  food_type_id: string | null
  food_type_name: string
  ratio_percent: number | string | null
  ingredient_type: string | null
}

type MappingRow = {
  food_type_id: string | null
  raw_material_id: string | number | null
  raw_material_name: string | null
  is_default: boolean | null
}

type MaterialRow = {
  id: string
  item_code: string | null
  item_name: string
  current_stock_g: number | string | null
}

type DeductionPreviewRow = {
  material_id: string | null
  item_code: string | null
  material_name: string
  food_type_name: string
  required_g: number
  current_stock_g: number
  remaining_stock_g: number
  insufficient: boolean
}

type DeductionPreview = {
  materials: DeductionPreviewRow[]
  totalRequiredG: number
  hasInsufficient: boolean
  hasMissingMapping: boolean
}

class ApiError extends Error {
  status: number
  stage: string | null

  constructor(status: number, message: string, stage?: string) {
    super(message)
    this.status = status
    this.stage = stage ?? null
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toInteger(value: unknown): number | null {
  const parsed = parseNumber(value)
  if (parsed === null) return null
  return Math.trunc(parsed)
}

function normalizeStatus(value: unknown, fallback: string) {
  const raw = toText(value).toLowerCase()
  if (!raw) return fallback

  if (raw === 'planned' || raw === 'plan' || raw === 'scheduled' || raw === '예정') return 'planned'
  if (raw === 'completed' || raw === 'complete' || raw === 'done' || raw === '완료') return 'completed'
  if (raw === 'confirmed' || raw === 'confirm' || raw === '확정') return 'confirmed'
  if (raw === 'in_progress' || raw === 'inprogress' || raw === '진행중') return 'in_progress'
  return raw
}

function isConfirmed(status: string | null | undefined) {
  return normalizeStatus(status, '') === 'confirmed'
}

function todayKst() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function compactDate(dateString: string) {
  return dateString.replaceAll('-', '')
}

function makeProductId() {
  return `PROD-${Date.now()}`
}

function makeTransactionId(index: number) {
  return `RMT-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`
}

function buildOutboundNote(recordId: string, lotNumber: string) {
  return `production_record_id=${recordId};lot_number=${lotNumber};action=confirm`
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function isRawIngredient(value: string | null | undefined) {
  const raw = normalizeKey(String(value ?? ''))
  if (!raw) return true
  if (raw === '원재료') return true
  if (raw === 'raw') return true
  return false
}

function toRecordRow(row: Record<string, unknown>): RecordRow {
  return {
    id: toText(row.id),
    lot_number: toText(row.lot_number),
    work_date: toText(row.work_date),
    product_id: toText(row.product_id) || null,
    product_name: toText(row.product_name),
    production_unit_id: toText(row.production_unit_id) || null,
    production_unit_name: toText(row.production_unit_name) || null,
    production_unit_weight_g: parseNumber(row.production_unit_weight_g),
    planned_quantity_ea: toInteger(row.planned_quantity_ea),
    planned_remainder_g: parseNumber(row.planned_remainder_g),
    actual_quantity_ea: toInteger(row.actual_quantity_ea),
    planned_quantity_g: parseNumber(row.planned_quantity_g),
    actual_quantity_g: parseNumber(row.actual_quantity_g),
    defect_quantity_g: parseNumber(row.defect_quantity_g),
    sample_quantity_g: parseNumber(row.sample_quantity_g),
    worker_name: toText(row.worker_name) || null,
    start_time: toText(row.start_time) || null,
    end_time: toText(row.end_time) || null,
    inspection_result: toText(row.inspection_result) || null,
    inspection_note: toText(row.inspection_note) || null,
    sanitation_check: typeof row.sanitation_check === 'boolean' ? row.sanitation_check : null,
    note: toText(row.note) || null,
    status: toText(row.status) || null,
    business_id: toText(row.business_id) || null,
    created_at: toText(row.created_at),
    updated_at: toText(row.updated_at) || null,
  }
}

function isMissingColumnError(message: string, columnName: string) {
  const lower = message.toLowerCase()
  const target = columnName.toLowerCase()
  return lower.includes(target) && (lower.includes('column') || lower.includes('schema cache'))
}

function toApiError(error: unknown, fallbackMessage: string, fallbackStage: string) {
  if (error instanceof ApiError) return error
  if (error instanceof Error) return new ApiError(500, error.message || fallbackMessage, fallbackStage)
  return new ApiError(500, fallbackMessage, fallbackStage)
}

async function fetchProducts() {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, product_name')
    .order('product_name', { ascending: true })
    .limit(500)

  if (error) throw new ApiError(500, error.message || '제품 목록 조회에 실패했습니다.', 'query.products')
  return ((data ?? []) as ProductOption[]).map((item) => ({
    id: String(item.id),
    product_name: String(item.product_name ?? ''),
  }))
}

async function generateLotNumber(workDate: string) {
  const supabase = createMoniServiceRoleClient()
  const prefix = compactDate(workDate)
  const { data, error } = await supabase
    .from('production_records')
    .select('lot_number')
    .eq('work_date', workDate)
    .like('lot_number', `${prefix}-%`)
    .order('lot_number', { ascending: false })
    .limit(500)

  if (error) throw new ApiError(500, error.message || 'LOT 생성에 실패했습니다.', 'query.lot')

  let maxSeq = 0
  for (const row of (data ?? []) as Array<{ lot_number?: string | null }>) {
    const lotNumber = String(row.lot_number ?? '')
    const seq = Number(lotNumber.split('-')[1])
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  return `${prefix}-${maxSeq + 1}`
}

async function fetchRecordById(id: string) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase.from('production_records').select('*').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, error.message || '생산기록 조회에 실패했습니다.', 'query.record')
  if (!data) throw new ApiError(404, '대상 생산기록을 찾을 수 없습니다.', 'query.record')
  return data as Record<string, unknown>
}

async function ensureNoExistingOutboundConfirm(recordId: string, lotNumber: string) {
  const supabase = createMoniServiceRoleClient()

  const byRecord = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%production_record_id=${recordId}%`)
    .limit(1)
  if (byRecord.error) {
    throw new ApiError(500, byRecord.error.message || '중복 확정 검증 조회에 실패했습니다.', 'validation.duplicate.record')
  }
  if ((byRecord.data ?? []).length > 0) {
    throw new ApiError(409, '이미 확정 처리된 생산기록입니다. (production_record_id 중복)', 'validation.duplicate.record')
  }

  const byLot = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%lot_number=${lotNumber}%`)
    .limit(1)
  if (byLot.error) {
    throw new ApiError(500, byLot.error.message || 'LOT 중복 확정 검증 조회에 실패했습니다.', 'validation.duplicate.lot')
  }
  if ((byLot.data ?? []).length > 0) {
    throw new ApiError(409, '이미 확정 처리된 LOT 번호입니다. (lot_number 중복)', 'validation.duplicate.lot')
  }
}

async function hasExistingOutboundConfirm(recordId: string, lotNumber: string) {
  const supabase = createMoniServiceRoleClient()

  const byRecord = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%production_record_id=${recordId}%`)
    .limit(1)
  if (byRecord.error) {
    throw new ApiError(500, byRecord.error.message || '취소 검증 조회에 실패했습니다.', 'validation.cancel.record')
  }
  if ((byRecord.data ?? []).length > 0) return true

  const byLot = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%lot_number=${lotNumber}%`)
    .limit(1)
  if (byLot.error) {
    throw new ApiError(500, byLot.error.message || '취소 검증 조회에 실패했습니다.', 'validation.cancel.lot')
  }
  return (byLot.data ?? []).length > 0
}

async function updateRecordWithOptionalQuantityOk(
  id: string,
  patch: Record<string, unknown>,
  quantityOkG?: number | null,
) {
  const supabase = createMoniServiceRoleClient()
  const basePatch = {
    ...patch,
    updated_at: new Date().toISOString(),
  }

  if (quantityOkG === undefined || quantityOkG === null) {
    const { data, error } = await supabase
      .from('production_records')
      .update(basePatch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      throw new ApiError(500, error.message || '생산기록 업데이트에 실패했습니다.', 'mutate.record.update')
    }
    return data as Record<string, unknown>
  }

  const firstTry = await supabase
    .from('production_records')
    .update({ ...basePatch, quantity_ok_g: quantityOkG })
    .eq('id', id)
    .select('*')
    .single()

  if (!firstTry.error) return firstTry.data as Record<string, unknown>

  const firstMessage = firstTry.error.message || ''
  if (!firstMessage.toLowerCase().includes('quantity_ok_g') && !firstMessage.toLowerCase().includes('column')) {
    throw new ApiError(500, firstMessage || '생산기록 업데이트에 실패했습니다.', 'mutate.record.update')
  }

  const fallback = await supabase.from('production_records').update(basePatch).eq('id', id).select('*').single()
  if (fallback.error) {
    throw new ApiError(500, fallback.error.message || '생산기록 업데이트에 실패했습니다.', 'mutate.record.update')
  }
  return fallback.data as Record<string, unknown>
}

async function updateRecordWithResilientColumns(
  id: string,
  patch: Record<string, unknown>,
  quantityOkG?: number | null,
) {
  const supabase = createMoniServiceRoleClient()
  const workingPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  const optionalColumns = [
    'sample_quantity_g',
    'production_unit_id',
    'production_unit_name',
    'production_unit_weight_g',
    'planned_quantity_ea',
    'planned_remainder_g',
    'actual_quantity_ea',
  ]
  let includeQuantityOk = quantityOkG !== undefined && quantityOkG !== null

  while (true) {
    const payload = {
      ...workingPatch,
      ...(includeQuantityOk && quantityOkG !== undefined && quantityOkG !== null ? { quantity_ok_g: quantityOkG } : {}),
    }

    const { data, error } = await supabase.from('production_records').update(payload).eq('id', id).select('*').single()
    if (!error) return data as Record<string, unknown>

    const message = error.message || '생산기록 업데이트에 실패했습니다.'
    const missingColumn = optionalColumns.find(
      (columnName) =>
        Object.prototype.hasOwnProperty.call(workingPatch, columnName) &&
        isMissingColumnError(message, columnName),
    )
    if (missingColumn) {
      delete workingPatch[missingColumn]
      continue
    }
    if (includeQuantityOk && isMissingColumnError(message, 'quantity_ok_g')) {
      includeQuantityOk = false
      continue
    }

    throw new ApiError(500, message, 'mutate.record.update')
  }
}

async function insertRecordWithResilientColumns(payload: Record<string, unknown>) {
  const supabase = createMoniServiceRoleClient()
  const workingPayload: Record<string, unknown> = { ...payload }
  const optionalColumns = [
    'sample_quantity_g',
    'production_unit_id',
    'production_unit_name',
    'production_unit_weight_g',
    'planned_quantity_ea',
    'planned_remainder_g',
    'actual_quantity_ea',
  ]

  while (true) {
    const insertResult = await supabase.from('production_records').insert(workingPayload).select('*').single()
    if (!insertResult.error) {
      return insertResult.data as Record<string, unknown>
    }

    const message = insertResult.error.message || '제조기록 저장에 실패했습니다.'
    const missingColumn = optionalColumns.find(
      (columnName) =>
        Object.prototype.hasOwnProperty.call(workingPayload, columnName) &&
        isMissingColumnError(message, columnName),
    )

    if (missingColumn) {
      delete workingPayload[missingColumn]
      continue
    }

    throw new ApiError(500, message, 'mutate.record.insert')
  }
}

async function resolveRecipes(record: Record<string, unknown>) {
  const supabase = createMoniServiceRoleClient()
  const productId = toText(record.product_id)
  const productName = toText(record.product_name)

  let recipes: RecipeRow[] = []
  if (productId) {
    const byId = await supabase
      .from('recipes')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (byId.error) {
      throw new ApiError(500, byId.error.message || '레시피 조회에 실패했습니다.', 'validation.recipes.query')
    }
    recipes = (byId.data ?? []) as RecipeRow[]
  }

  if (recipes.length === 0 && productName) {
    const byName = await supabase
      .from('recipes')
      .select('*')
      .eq('product_name', productName)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (byName.error) {
      throw new ApiError(500, byName.error.message || '레시피 조회에 실패했습니다.', 'validation.recipes.query')
    }
    recipes = (byName.data ?? []) as RecipeRow[]
  }
  return recipes
}

async function buildDeductionPreview(record: Record<string, unknown>): Promise<DeductionPreview> {
  const supabase = createMoniServiceRoleClient()
  const actualQuantityG = parseNumber(record.actual_quantity_g) ?? 0
  if (actualQuantityG <= 0) {
    throw new ApiError(400, 'actual_quantity_g가 없거나 0 이하입니다.', 'validation.actual_quantity')
  }

  const allRecipes = await resolveRecipes(record)
  const recipes = allRecipes.filter((recipe) => isRawIngredient(recipe.ingredient_type))
  if (recipes.length === 0) {
    throw new ApiError(422, '원재료 레시피가 없어 생산 확정을 진행할 수 없습니다.', 'validation.recipes.empty')
  }

  const foodTypeIds = Array.from(
    new Set(recipes.map((recipe) => toText(recipe.food_type_id)).filter((foodTypeId) => !!foodTypeId)),
  )

  let mappings: MappingRow[] = []
  if (foodTypeIds.length > 0) {
    const mappingResult = await supabase
      .from('raw_material_mapping')
      .select('food_type_id, raw_material_id, raw_material_name, is_default')
      .in('food_type_id', foodTypeIds)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
    if (mappingResult.error) {
      throw new ApiError(500, mappingResult.error.message || '원재료 매핑 조회에 실패했습니다.', 'validation.mappings.query')
    }
    mappings = (mappingResult.data ?? []) as MappingRow[]
  }

  const materialsResult = await supabase
    .from('raw_materials')
    .select('id, item_code, item_name, current_stock_g')
    .limit(5000)
  if (materialsResult.error) {
    throw new ApiError(500, materialsResult.error.message || '원재료 재고 조회에 실패했습니다.', 'validation.materials.query')
  }

  const materials = (materialsResult.data ?? []) as MaterialRow[]
  const materialById = new Map<string, MaterialRow>()
  const materialByName = new Map<string, MaterialRow>()
  for (const material of materials) {
    const id = toText(material.id)
    if (id) materialById.set(id, material)
    const nameKey = normalizeKey(toText(material.item_name))
    if (nameKey) materialByName.set(nameKey, material)
  }

  const mappingByFoodType = new Map<string, MappingRow[]>()
  for (const mapping of mappings) {
    const key = toText(mapping.food_type_id)
    if (!key) continue
    const list = mappingByFoodType.get(key) ?? []
    list.push(mapping)
    mappingByFoodType.set(key, list)
  }

  const aggregated = new Map<string, DeductionPreviewRow>()
  for (const recipe of recipes) {
    const ratio = parseNumber(recipe.ratio_percent) ?? 0
    if (ratio <= 0) continue

    const requiredG = (actualQuantityG * ratio) / 100
    if (requiredG <= 0) continue

    const foodTypeId = toText(recipe.food_type_id)
    const foodTypeName = toText(recipe.food_type_name) || '미매핑 원재료'
    const candidates = mappingByFoodType.get(foodTypeId) ?? []
    const preferred = candidates[0]

    const mappedMaterialId = toText(preferred?.raw_material_id)
    const mappedMaterialName = toText(preferred?.raw_material_name)
    const byId = mappedMaterialId ? materialById.get(mappedMaterialId) : undefined
    const byMappedName = mappedMaterialName ? materialByName.get(normalizeKey(mappedMaterialName)) : undefined
    const byFoodTypeName = materialByName.get(normalizeKey(foodTypeName))
    const targetMaterial = byId ?? byMappedName ?? byFoodTypeName

    const key = targetMaterial ? `material:${targetMaterial.id}` : `missing:${foodTypeName}`
    const currentStockG = parseNumber(targetMaterial?.current_stock_g) ?? 0
    const previous = aggregated.get(key)

    if (previous) {
      const nextRequired = previous.required_g + requiredG
      previous.required_g = nextRequired
      previous.remaining_stock_g = previous.current_stock_g - nextRequired
      previous.insufficient = previous.remaining_stock_g < 0
      aggregated.set(key, previous)
      continue
    }

    aggregated.set(key, {
      material_id: targetMaterial ? toText(targetMaterial.id) : null,
      item_code: targetMaterial ? toText(targetMaterial.item_code) || toText(targetMaterial.id) : null,
      material_name: targetMaterial ? toText(targetMaterial.item_name) : mappedMaterialName || foodTypeName,
      food_type_name: foodTypeName,
      required_g: requiredG,
      current_stock_g: currentStockG,
      remaining_stock_g: currentStockG - requiredG,
      insufficient: !targetMaterial || currentStockG - requiredG < 0,
    })
  }

  const materialsPreview = Array.from(aggregated.values()).sort((a, b) => b.required_g - a.required_g)
  if (materialsPreview.length === 0) {
    throw new ApiError(422, '유효한 레시피 비율이 없어 사용량을 계산할 수 없습니다.', 'validation.recipes.usable')
  }

  return {
    materials: materialsPreview,
    totalRequiredG: materialsPreview.reduce((sum, item) => sum + item.required_g, 0),
    hasInsufficient: materialsPreview.some((item) => item.insufficient),
    hasMissingMapping: materialsPreview.some((item) => !item.material_id),
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createMoniServiceRoleClient()
    const products = await fetchProducts()

    const from = request.nextUrl.searchParams.get('from')?.trim() ?? ''
    const to = request.nextUrl.searchParams.get('to')?.trim() ?? ''
    const product = request.nextUrl.searchParams.get('product')?.trim() ?? ''
    const statusFilter = request.nextUrl.searchParams.get('status')?.trim() ?? ''
    const includeCancelledRaw = request.nextUrl.searchParams.get('include_cancelled')?.trim().toLowerCase() ?? ''
    const includeCancelled = includeCancelledRaw === '1' || includeCancelledRaw === 'true' || includeCancelledRaw === 'yes'
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? 200)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200

    let query = supabase
      .from('production_records')
      .select('*')
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (from) query = query.gte('work_date', from)
    if (to) query = query.lte('work_date', to)
    if (product) query = query.eq('product_id', product)
    const normalizedStatusFilter = statusFilter ? normalizeStatus(statusFilter, statusFilter) : ''
    if (normalizedStatusFilter) {
      query = query.eq('status', normalizedStatusFilter)
    } else if (!includeCancelled) {
      query = query.or('status.is.null,status.not.in.(cancelled,canceled,취소)')
    }

    const { data, error } = await query
    if (error) throw new ApiError(500, error.message || '제조기록 조회에 실패했습니다.', 'query.records')

    return NextResponse.json(
      {
        ok: true,
        records: ((data ?? []) as Record<string, unknown>[]).map(toRecordRow),
        products,
      },
      { status: 200 },
    )
  } catch (error) {
    const apiError = toApiError(error, '제조기록 조회 중 오류가 발생했습니다.', 'query.records')
    return NextResponse.json({ ok: false, error: apiError.message, stage: apiError.stage }, { status: apiError.status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const workDate = toText(body.work_date) || todayKst()
    let productId = toText(body.product_id) || null
    const planned = parseNumber(body.planned_quantity_g)
    const actual = parseNumber(body.actual_quantity_g)
    const sample = parseNumber(body.sample_quantity_g) ?? 0
    const productionUnitId = toText(body.production_unit_id) || null
    const productionUnitName = toText(body.production_unit_name) || null
    const productionUnitWeightG = parseNumber(body.production_unit_weight_g)

    if (planned !== null && planned < 0) {
      return NextResponse.json({ ok: false, error: '계획 수량은 0 이상이어야 합니다.' }, { status: 400 })
    }
    if (actual !== null && actual < 0) {
      return NextResponse.json({ ok: false, error: '실제 수량은 0 이상이어야 합니다.' }, { status: 400 })
    }

    if (sample < 0) {
      return NextResponse.json({ ok: false, error: '샘플수량은 0 이상이어야 합니다.' }, { status: 400 })
    }

    const defectAuto = planned !== null && actual !== null ? Math.max(planned - actual, 0) : 0
    const defect = parseNumber(body.defect_quantity_g) ?? defectAuto
    if (defect < 0) {
      return NextResponse.json({ ok: false, error: '불량수량은 0 이상이어야 합니다.' }, { status: 400 })
    }
    if (planned !== null && actual !== null && actual + defect + sample > planned) {
      return NextResponse.json(
        { ok: false, error: '실제 완료량 + 불량수량 + 샘플수량 합계가 예정수량을 초과할 수 없습니다.' },
        { status: 400 },
      )
    }

    let productName = toText(body.product_name)
    if (!productName && productId) {
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('product_name')
        .eq('id', productId)
        .maybeSingle()
      if (productError) throw new ApiError(500, productError.message || '제품 조회에 실패했습니다.', 'query.product')
      productName = toText((productData as { product_name?: unknown } | null)?.product_name)
    }

    if (!productName) {
      return NextResponse.json({ ok: false, error: '제품명을 입력해 주세요.' }, { status: 400 })
    }

    if (!productId && productName) {
      const { data: existingProducts, error: findProductError } = await supabase
        .from('products')
        .select('id, product_name')
        .eq('product_name', productName)
        .limit(1)
      if (findProductError) throw new ApiError(500, findProductError.message || '제품 조회에 실패했습니다.', 'query.product')

      const existingProduct = existingProducts?.[0] as { id?: string | number; product_name?: string } | undefined
      if (existingProduct?.id) {
        productId = String(existingProduct.id)
        productName = toText(existingProduct.product_name) || productName
      } else {
        const newProductId = makeProductId()
        const { data: insertedProduct, error: insertProductError } = await supabase
          .from('products')
          .insert({
            id: newProductId,
            product_name: productName,
            product_code: newProductId,
            product_type: toText(body.product_type) || '완제품',
            is_active: true,
            business_id: toText(body.business_id) || 'default',
          })
          .select('id, product_name')
          .single()
        if (insertProductError) {
          throw new ApiError(500, insertProductError.message || '제품 생성에 실패했습니다.', 'mutate.product')
        }
        productId = String((insertedProduct as { id?: string | number }).id ?? newProductId)
      }
    }

    const lotNumber = await generateLotNumber(workDate)
    const status = normalizeStatus(body.status, actual && actual > 0 ? 'completed' : 'planned')
    const plannedQuantityEa =
      planned !== null && productionUnitWeightG !== null && productionUnitWeightG > 0
        ? Math.floor(planned / productionUnitWeightG)
        : null
    const plannedRemainderG =
      planned !== null && productionUnitWeightG !== null && productionUnitWeightG > 0
        ? planned - Math.floor(planned / productionUnitWeightG) * productionUnitWeightG
        : 0
    const actualQuantityEa =
      actual !== null && productionUnitWeightG !== null && productionUnitWeightG > 0
        ? Math.floor(actual / productionUnitWeightG)
        : null

    const payload = {
      lot_number: lotNumber,
      work_date: workDate,
      product_id: productId,
      product_name: productName,
      production_unit_id: productionUnitId,
      production_unit_name: productionUnitName,
      production_unit_weight_g: productionUnitWeightG,
      planned_quantity_ea: plannedQuantityEa,
      planned_remainder_g: plannedRemainderG,
      actual_quantity_ea: actualQuantityEa,
      planned_quantity_g: planned,
      actual_quantity_g: actual,
      defect_quantity_g: defect,
      sample_quantity_g: sample,
      worker_name: toText(body.worker_name) || null,
      start_time: toText(body.start_time) || null,
      end_time: toText(body.end_time) || null,
      inspection_result: toText(body.inspection_result) || '적합',
      inspection_note: toText(body.inspection_note) || null,
      sanitation_check: typeof body.sanitation_check === 'boolean' ? body.sanitation_check : true,
      note: toText(body.note) || null,
      status,
      business_id: toText(body.business_id) || 'default',
      updated_at: new Date().toISOString(),
    }

    const inserted = await insertRecordWithResilientColumns(payload)

    return NextResponse.json(
      {
        ok: true,
        record: toRecordRow(inserted),
      },
      { status: 201 },
    )
  } catch (error) {
    const apiError = toApiError(error, '제조기록 저장 중 오류가 발생했습니다.', 'mutate.record.insert')
    return NextResponse.json({ ok: false, error: apiError.message, stage: apiError.stage }, { status: apiError.status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    }

    const action = toText(body.action).toLowerCase()
    const recordId = toText(body.id) || toText(body.record_id)
    if (!recordId) {
      return NextResponse.json({ ok: false, error: 'record_id가 필요합니다.' }, { status: 400 })
    }

    const record = await fetchRecordById(recordId)
    const recordStatus = normalizeStatus(record.status, '')

    if (action === 'update_planned') {
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '확정된 작업지시서는 예정수량을 수정할 수 없습니다.' }, { status: 409 })
      }
      if (recordStatus !== 'planned') {
        return NextResponse.json({ ok: false, error: 'planned 상태에서만 예정수량을 수정할 수 있습니다.' }, { status: 409 })
      }

      const plannedQuantityG = parseNumber(body.planned_quantity_g)
      if (plannedQuantityG === null || plannedQuantityG <= 0) {
        return NextResponse.json({ ok: false, error: 'planned_quantity_g는 0보다 커야 합니다.' }, { status: 400 })
      }

      const productionUnitWeightG =
        parseNumber(body.production_unit_weight_g) ?? parseNumber(record.production_unit_weight_g)
      const plannedQuantityEa =
        productionUnitWeightG !== null && productionUnitWeightG > 0
          ? Math.floor(plannedQuantityG / productionUnitWeightG)
          : null
      const plannedRemainderG =
        productionUnitWeightG !== null && productionUnitWeightG > 0
          ? plannedQuantityG - Math.floor(plannedQuantityG / productionUnitWeightG) * productionUnitWeightG
          : 0

      const updated = await updateRecordWithResilientColumns(recordId, {
        planned_quantity_g: plannedQuantityG,
        planned_quantity_ea: plannedQuantityEa,
        planned_remainder_g: plannedRemainderG,
      })
      return NextResponse.json(
        { ok: true, record: toRecordRow(updated), message: '예정수량이 수정되었습니다.' },
        { status: 200 },
      )
    }

    if (action === 'complete') {
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '이미 확정된 생산기록입니다.' }, { status: 409 })
      }

      if (recordStatus === 'cancelled') {
        return NextResponse.json({ ok: false, error: '취소된 작업지시서는 완료 처리할 수 없습니다.' }, { status: 409 })
      }

      if (!(recordStatus === 'planned' || recordStatus === 'completed')) {
        return NextResponse.json({ ok: false, error: 'planned 또는 completed 상태에서만 완료 입력이 가능합니다.' }, { status: 409 })
      }

      const actualQuantityG = parseNumber(body.actual_quantity_g)
      const defectQuantityG = parseNumber(body.defect_quantity_g) ?? 0
      const sampleQuantityG = parseNumber(body.sample_quantity_g) ?? 0
      if (actualQuantityG === null || actualQuantityG < 0) {
        return NextResponse.json({ ok: false, error: 'actual_quantity_g는 0 이상이어야 합니다.' }, { status: 400 })
      }

      if (defectQuantityG < 0 || sampleQuantityG < 0) {
        return NextResponse.json({ ok: false, error: '불량수량/샘플수량은 0 이상이어야 합니다.' }, { status: 400 })
      }

      const plannedCandidate = parseNumber(body.planned_quantity_g)
      const plannedQuantityG = plannedCandidate ?? parseNumber(record.planned_quantity_g)
      if (plannedQuantityG === null || plannedQuantityG <= 0) {
        return NextResponse.json({ ok: false, error: '예정수량이 없어 완료 입력을 진행할 수 없습니다.' }, { status: 422 })
      }
      if (actualQuantityG + defectQuantityG + sampleQuantityG > plannedQuantityG) {
        return NextResponse.json(
          { ok: false, error: '실제 완료량 + 불량수량 + 샘플수량 합계가 예정수량을 초과할 수 없습니다.' },
          { status: 400 },
        )
      }

      const productionUnitWeightG = parseNumber(record.production_unit_weight_g)
      const actualQuantityEa =
        productionUnitWeightG !== null && productionUnitWeightG > 0
          ? Math.floor(actualQuantityG / productionUnitWeightG)
          : null
      const plannedQuantityEa =
        productionUnitWeightG !== null && productionUnitWeightG > 0
          ? Math.floor(plannedQuantityG / productionUnitWeightG)
          : null
      const plannedRemainderG =
        productionUnitWeightG !== null && productionUnitWeightG > 0
          ? plannedQuantityG - Math.floor(plannedQuantityG / productionUnitWeightG) * productionUnitWeightG
          : 0

      const updated = await updateRecordWithResilientColumns(
        recordId,
        {
          actual_quantity_g: actualQuantityG,
          planned_quantity_g: plannedQuantityG,
          actual_quantity_ea: actualQuantityEa,
          planned_quantity_ea: plannedQuantityEa,
          planned_remainder_g: plannedRemainderG,
          defect_quantity_g: defectQuantityG,
          sample_quantity_g: sampleQuantityG,
          status: 'completed',
        },
        actualQuantityG,
      )

      return NextResponse.json(
        { ok: true, record: toRecordRow(updated), message: '생산 완료로 처리했습니다.' },
        { status: 200 },
      )
    }

    if (action === 'cancel') {
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '확정된 작업지시서는 취소할 수 없습니다.' }, { status: 409 })
      }

      if (recordStatus === 'cancelled') {
        return NextResponse.json(
          { ok: true, record: toRecordRow(record), message: '이미 취소된 작업지시서입니다.' },
          { status: 200 },
        )
      }

      if (!(recordStatus === 'planned' || recordStatus === 'completed')) {
        return NextResponse.json({ ok: false, error: 'planned 또는 completed 상태만 취소할 수 있습니다.' }, { status: 409 })
      }

      const lotNumber = toText(record.lot_number) || recordId
      const hasOutbound = await hasExistingOutboundConfirm(recordId, lotNumber)
      if (hasOutbound) {
        return NextResponse.json(
          { ok: false, error: '원재료 차감 이력이 있어 취소할 수 없습니다. (확정된 기록일 수 있습니다.)' },
          { status: 409 },
        )
      }

      const cancelled = await (async () => {
        const supabase = createMoniServiceRoleClient()
        const { error: deleteError } = await supabase.from('production_records').delete().eq('id', recordId)
        if (deleteError) {
          throw new ApiError(500, deleteError.message || '작업지시서 삭제에 실패했습니다.', 'mutate.record.delete')
        }
        return record
      })()
      return NextResponse.json(
        { ok: true, record: toRecordRow(cancelled), message: '작업지시서가 삭제되었습니다.' },
        { status: 200 },
      )
    }

    if (action === 'preview_confirm') {
      const preview = await buildDeductionPreview(record)
      return NextResponse.json(
        {
          ok: true,
          preview: {
            materials: preview.materials,
            total_required_g: preview.totalRequiredG,
            has_insufficient: preview.hasInsufficient,
            has_missing_mapping: preview.hasMissingMapping,
          },
        },
        { status: 200 },
      )
    }

    if (action === 'confirm') {
      if (recordStatus === 'cancelled') {
        return NextResponse.json({ ok: false, error: '취소된 작업지시서는 확정할 수 없습니다.' }, { status: 409 })
      }
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '이미 확정된 생산기록입니다.' }, { status: 409 })
      }

      const lotNumber = toText(record.lot_number) || recordId
      await ensureNoExistingOutboundConfirm(recordId, lotNumber)

      const preview = await buildDeductionPreview(record)
      if (preview.hasMissingMapping) {
        return NextResponse.json(
          { ok: false, error: '원재료 미매핑 항목이 있어 확정할 수 없습니다.', preview },
          { status: 422 },
        )
      }
      if (preview.hasInsufficient) {
        return NextResponse.json(
          { ok: false, error: '원재료 재고가 부족하여 확정할 수 없습니다.', preview },
          { status: 409 },
        )
      }

      const txDate = toText(record.work_date) || todayKst()
      const businessId = toText(record.business_id) || '20220523011'
      const confirmNote = buildOutboundNote(recordId, lotNumber)
      const supabase = createMoniServiceRoleClient()

      const stockPlan = preview.materials.map((item) => {
        if (!item.material_id) {
          throw new ApiError(422, `원재료 매핑이 없어 확정할 수 없습니다: ${item.food_type_name}`, 'validation.mappings')
        }
        return {
          materialId: item.material_id,
          materialName: item.material_name,
          originalStockG: item.current_stock_g,
          nextStockG: item.current_stock_g - item.required_g,
          requiredG: item.required_g,
          itemCode: item.item_code || item.material_id,
          foodTypeName: item.food_type_name,
        }
      })

      const transactionRows = stockPlan.map((plan, index) => ({
        id: makeTransactionId(index),
        item_code: plan.itemCode,
        item_name: plan.materialName,
        txn_type: 'OUTBOUND',
        quantity_g: plan.requiredG,
        unit_price: null,
        supplier: null,
        note: confirmNote,
        txn_date: txDate,
        raw_material_id: plan.materialId,
        raw_material_name: plan.materialName,
        food_type_name: plan.foodTypeName || null,
        total_quantity_g: plan.requiredG,
        business_id: businessId,
      }))

      const updatedMaterialIds: string[] = []
      const insertedTransactionIds = transactionRows.map((row) => row.id)

      const rollbackStocks = async () => {
        const rollbackFailures: string[] = []
        for (const plan of stockPlan) {
          if (!updatedMaterialIds.includes(plan.materialId)) continue
          const rollbackResult = await supabase
            .from('raw_materials')
            .update({ current_stock_g: plan.originalStockG })
            .eq('id', plan.materialId)
          if (rollbackResult.error) rollbackFailures.push(plan.materialName)
        }
        return rollbackFailures
      }

      const rollbackTransactions = async () => {
        if (insertedTransactionIds.length === 0) return false
        const rollbackResult = await supabase.from('raw_material_transactions').delete().in('id', insertedTransactionIds)
        return !!rollbackResult.error
      }

      for (const plan of stockPlan) {
        const stockResult = await supabase
          .from('raw_materials')
          .update({ current_stock_g: plan.nextStockG })
          .eq('id', plan.materialId)
        if (stockResult.error) {
          const rollbackFailures = await rollbackStocks()
          const rollbackHint = rollbackFailures.length > 0 ? ` (rollback 실패: ${rollbackFailures.join(', ')})` : ''
          throw new ApiError(
            500,
            `확정 처리 실패(재고 차감 단계): ${plan.materialName}${rollbackHint}`,
            'mutate.stock',
          )
        }
        updatedMaterialIds.push(plan.materialId)
      }

      const txResult = await supabase.from('raw_material_transactions').insert(transactionRows)
      if (txResult.error) {
        const rollbackFailures = await rollbackStocks()
        const rollbackHint = rollbackFailures.length > 0 ? ` (rollback 실패: ${rollbackFailures.join(', ')})` : ''
        throw new ApiError(
          500,
          `확정 처리 실패(수불 기록 단계): ${txResult.error.message}${rollbackHint}`,
          'mutate.transactions',
        )
      }

      let updatedRecord: Record<string, unknown>
      try {
        const actualQuantityG = parseNumber(record.actual_quantity_g)
        updatedRecord = await updateRecordWithResilientColumns(
          recordId,
          { status: 'confirmed' },
          actualQuantityG !== null ? actualQuantityG : undefined,
        )
      } catch (error) {
        const txRollbackFailed = await rollbackTransactions()
        const stockRollbackFailures = await rollbackStocks()
        const txRollbackHint = txRollbackFailed ? ' / transaction rollback 실패' : ''
        const stockRollbackHint =
          stockRollbackFailures.length > 0 ? ` / stock rollback 실패: ${stockRollbackFailures.join(', ')}` : ''
        const message =
          error instanceof Error ? error.message : '생산기록 상태 변경 중 알 수 없는 오류가 발생했습니다.'
        throw new ApiError(
          500,
          `확정 처리 실패(상태 변경 단계): ${message}${txRollbackHint}${stockRollbackHint}`,
          'mutate.record',
        )
      }

      return NextResponse.json(
        {
          ok: true,
          record: toRecordRow(updatedRecord),
          deduction: {
            materials: preview.materials,
            total_required_g: preview.totalRequiredG,
          },
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 action입니다.' }, { status: 400 })
  } catch (error) {
    const apiError = toApiError(error, '생산 처리 중 오류가 발생했습니다.', 'patch.unknown')
    return NextResponse.json({ ok: false, error: apiError.message, stage: apiError.stage }, { status: apiError.status })
  }
}
