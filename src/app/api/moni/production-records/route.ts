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
  semi_product_id?: string | null
}

type MappingRow = {
  id?: string | null
  food_type_id: string | null
  raw_material_id: string | number | null
  raw_material_ref_id?: string | null
  raw_material_name: string | null
  is_default: boolean | null
  recipe_id?: string | null
  product_id?: string | null
  mapping_scope?: string | null
  created_at?: string | null
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
  source_label?: string
  required_g: number
  current_stock_g: number
  remaining_stock_g: number
  insufficient: boolean
}

type DeductionPreview = {
  materials: DeductionPreviewRow[]
  breakdown: DeductionPreviewRow[]
  totalRequiredG: number
  hasInsufficient: boolean
  hasMissingMapping: boolean
  deductionBasisG: number
  enteredQuantityG: number
  lossQuantityG: number
  plannedQuantityG: number | null
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

type InputUnit = 'ea' | 'kg' | 'g'
type MassInputUnit = 'kg' | 'g'

function normalizeInputUnit(value: unknown): InputUnit | null {
  const raw = toText(value).toLowerCase()
  if (raw === 'ea' || raw === 'kg' || raw === 'g') return raw
  return null
}

function normalizeMassInputUnit(value: unknown): MassInputUnit | null {
  const raw = toText(value).toLowerCase()
  if (raw === 'kg' || raw === 'g') return raw
  return null
}

function normalizeStatus(value: unknown, fallback: string) {
  const raw = toText(value).toLowerCase()
  if (!raw) return fallback

  if (raw === 'planned' || raw === 'plan' || raw === 'scheduled') return 'planned'
  if (raw === 'completed' || raw === 'complete' || raw === 'done') return 'completed'
  if (raw === 'confirmed' || raw === 'confirm') return 'confirmed'
  if (raw === 'in_progress' || raw === 'inprogress' || raw === 'progress') return 'in_progress'
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

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
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

function normalizeMappingScope(value: unknown): 'recipe' | 'product' | 'global' {
  const raw = toText(value).toLowerCase()
  if (raw === 'recipe' || raw === 'product' || raw === 'global') return raw
  return 'global'
}

function isRawIngredient(value: string | null | undefined) {
  const raw = normalizeKey(String(value ?? ''))
  if (!raw) return true
  if (raw === '원재료') return true
  if (raw === 'raw') return true
  if (raw === '제품/반제품' || raw === '제품반제품' || raw === 'productsemi' || raw === 'hybridsemi') return true
  return false
}

function isPureSemiIngredient(value: string | null | undefined) {
  const raw = normalizeKey(String(value ?? ''))
  if (!raw) return false
  if (raw === '반제품' || raw === 'semi' || raw === 'semiproduct') return true
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

  if (error) throw new ApiError(500, error.message || '?쒗뭹 紐⑸줉 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'query.products')
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

  if (error) throw new ApiError(500, error.message || 'LOT ?앹꽦???ㅽ뙣?덉뒿?덈떎.', 'query.lot')

  let maxSeq = 0
  for (const row of (data ?? []) as Array<{ lot_number?: string | null }>) {
    const lotNumber = String(row.lot_number ?? '')
    const seq = Number(lotNumber.split('-')[1])
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
  }
  return `${prefix}-${maxSeq + 1}`
}

async function ensureLotNumberAvailable(lotNumber: string, exceptRecordId?: string) {
  const supabase = createMoniServiceRoleClient()
  let query = supabase.from('production_records').select('id').eq('lot_number', lotNumber).limit(1)
  if (exceptRecordId) query = query.neq('id', exceptRecordId)
  const { data, error } = await query
  if (error) throw new ApiError(500, error.message || 'LOT 중복 확인에 실패했습니다.', 'validation.lot.lookup')
  if ((data ?? []).length > 0) {
    throw new ApiError(409, '이미 등록된 LOT입니다. 다른 LOT를 입력해 주세요.', 'validation.lot.duplicate')
  }
}

async function fetchRecordById(id: string) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase.from('production_records').select('*').eq('id', id).maybeSingle()
  if (error) throw new ApiError(500, error.message || '?앹궛湲곕줉 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'query.record')
  if (!data) throw new ApiError(404, '????앹궛湲곕줉??李얠쓣 ???놁뒿?덈떎.', 'query.record')
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
    throw new ApiError(500, byRecord.error.message || '以묐났 ?뺤젙 寃利?議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.duplicate.record')
  }
  if ((byRecord.data ?? []).length > 0) {
    throw new ApiError(409, '?대? ?뺤젙 泥섎━???앹궛湲곕줉?낅땲?? (production_record_id 以묐났)', 'validation.duplicate.record')
  }

  const byLot = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%lot_number=${lotNumber}%`)
    .limit(1)
  if (byLot.error) {
    throw new ApiError(500, byLot.error.message || 'LOT 以묐났 ?뺤젙 寃利?議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.duplicate.lot')
  }
  if ((byLot.data ?? []).length > 0) {
    throw new ApiError(409, '?대? ?뺤젙 泥섎━??LOT 踰덊샇?낅땲?? (lot_number 以묐났)', 'validation.duplicate.lot')
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
    throw new ApiError(500, byRecord.error.message || '痍⑥냼 寃利?議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.cancel.record')
  }
  if ((byRecord.data ?? []).length > 0) return true

  const byLot = await supabase
    .from('raw_material_transactions')
    .select('id')
    .eq('txn_type', 'OUTBOUND')
    .ilike('note', `%lot_number=${lotNumber}%`)
    .limit(1)
  if (byLot.error) {
    throw new ApiError(500, byLot.error.message || '痍⑥냼 寃利?議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.cancel.lot')
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
      throw new ApiError(500, error.message || '?앹궛湲곕줉 ?낅뜲?댄듃???ㅽ뙣?덉뒿?덈떎.', 'mutate.record.update')
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
    throw new ApiError(500, firstMessage || '?앹궛湲곕줉 ?낅뜲?댄듃???ㅽ뙣?덉뒿?덈떎.', 'mutate.record.update')
  }

  const fallback = await supabase.from('production_records').update(basePatch).eq('id', id).select('*').single()
  if (fallback.error) {
    throw new ApiError(500, fallback.error.message || '?앹궛湲곕줉 ?낅뜲?댄듃???ㅽ뙣?덉뒿?덈떎.', 'mutate.record.update')
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

    const message = error.message || '?앹궛湲곕줉 ?낅뜲?댄듃???ㅽ뙣?덉뒿?덈떎.'
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

    const message = insertResult.error.message || '?쒖“湲곕줉 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.'
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
      throw new ApiError(500, byId.error.message || '?덉떆??議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.recipes.query')
    }
    recipes = (byId.data ?? []) as RecipeRow[]
  }

  return recipes
}

type ExpandedRecipeRow = {
  recipe: RecipeRow
  effective_ratio_percent: number
  source_label: string
}

async function resolveExpandedRecipes(record: Record<string, unknown>) {
  const supabase = createMoniServiceRoleClient()
  const cache = new Map<string, RecipeRow[]>()

  const loadRecipesByProduct = async (productId: string, productName: string) => {
    const key = `${productId}::${productName}`
    const cached = cache.get(key)
    if (cached) return cached

    let rows: RecipeRow[] = []
    if (productId) {
      const byId = await supabase
        .from('recipes')
        .select('*')
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (byId.error) throw new ApiError(500, byId.error.message || '레시피 조회에 실패했습니다.', 'validation.recipes.query')
      rows = (byId.data ?? []) as RecipeRow[]
    }

    cache.set(key, rows)
    return rows
  }

  const expanded: ExpandedRecipeRow[] = []
  const productId = toText(record.product_id)
  const productName = toText(record.product_name)
  const rootRecipes = await loadRecipesByProduct(productId, productName)

  const expand = async (
    rows: RecipeRow[],
    ratioFactorPercent: number,
    sourceLabel: string,
    depth: number,
    visited: Set<string>,
  ) => {
    for (const row of rows) {
      const ratio = parseNumber(row.ratio_percent) ?? 0
      if (ratio <= 0) continue
      const effectiveRatio = (ratioFactorPercent * ratio) / 100
      if (effectiveRatio <= 0) continue

      const ingredientType = toText(row.ingredient_type)
      const semiProductId = toText(row.semi_product_id)
      const rowProductId = toText(row.product_id)
      const rowProductName = toText(row.product_name)

      if (isPureSemiIngredient(ingredientType) && semiProductId && depth < 5) {
        const visitKey = `${semiProductId}::${toText(row.id)}`
        if (visited.has(visitKey)) continue
        const nextVisited = new Set(visited)
        nextVisited.add(visitKey)
        const semiRecipes = await loadRecipesByProduct(semiProductId, '')
        if (semiRecipes.length > 0) {
          const semiSource = rowProductName || sourceLabel || productName || '반제품'
          await expand(semiRecipes, effectiveRatio, semiSource, depth + 1, nextVisited)
          continue
        }
      }

      expanded.push({
        recipe: {
          ...row,
          product_id: rowProductId || productId || null,
          product_name: rowProductName || productName || '',
        },
        effective_ratio_percent: effectiveRatio,
        source_label: sourceLabel || rowProductName || productName || '완제품',
      })
    }
  }

  await expand(rootRecipes, 100, productName || '완제품', 0, new Set<string>())
  return expanded
}

async function buildDeductionPreview(record: Record<string, unknown>): Promise<DeductionPreview> {
  const supabase = createMoniServiceRoleClient()
  const actualQuantityG = parseNumber(record.actual_quantity_g) ?? 0
  const defectQuantityG = parseNumber(record.defect_quantity_g) ?? 0
  const sampleQuantityG = parseNumber(record.sample_quantity_g) ?? 0
  const plannedQuantityG = parseNumber(record.planned_quantity_g)

  if (actualQuantityG < 0 || defectQuantityG < 0 || sampleQuantityG < 0) {
    throw new ApiError(400, '?꾨즺/遺덈웾/?섑뵆 ?섎웾? 0 ?댁긽?댁뼱???⑸땲??', 'validation.actual_quantity')
  }

  const enteredQuantityG = actualQuantityG + defectQuantityG + sampleQuantityG
  if (enteredQuantityG <= 0) {
    throw new ApiError(400, '?꾨즺/遺덈웾/?섑뵆 ?⑷퀎媛 0 ?댄븯?낅땲??', 'validation.actual_quantity')
  }

  let lossQuantityG = 0
  let deductionBasisG = enteredQuantityG

  if (plannedQuantityG !== null) {
    if (plannedQuantityG <= 0) {
      throw new ApiError(422, '?덉젙?섎웾???놁뼱 李④컧 湲곗??됱쓣 怨꾩궛?????놁뒿?덈떎.', 'validation.planned_quantity')
    }
    if (enteredQuantityG > plannedQuantityG) {
      throw new ApiError(
        409,
        '?꾨즺/遺덈웾/?섑뵆 ?⑷퀎媛 ?덉젙?섎웾??珥덇낵?섏뿬 李④컧 誘몃━蹂닿린瑜?怨꾩궛?????놁뒿?덈떎.',
        'validation.deduction_basis',
      )
    }
    lossQuantityG = plannedQuantityG - enteredQuantityG
    deductionBasisG = enteredQuantityG + lossQuantityG
  }

  if (deductionBasisG <= 0) {
    throw new ApiError(400, '李④컧 湲곗??됱씠 0 ?댄븯?낅땲??', 'validation.deduction_basis')
  }

  const expandedRecipes = await resolveExpandedRecipes(record)
  const recipes = expandedRecipes.filter((entry) => isRawIngredient(entry.recipe.ingredient_type))
  const businessId = toText(record.business_id) || '20220523011'
  const materialBusinessScope = `business_id.eq.${businessId},business_id.eq.default,business_id.is.null`
  if (recipes.length === 0) {
    throw new ApiError(422, '?먯옱猷??덉떆?쇨? ?놁뼱 ?앹궛 ?뺤젙??吏꾪뻾?????놁뒿?덈떎.', 'validation.recipes.empty')
  }

  const foodTypeIds = Array.from(
    new Set(recipes.map((entry) => toText(entry.recipe.food_type_id)).filter((foodTypeId) => !!foodTypeId)),
  )

  let mappings: MappingRow[] = []
  if (foodTypeIds.length > 0) {
    const mappingResult = await supabase
      .from('raw_material_mapping')
      .select('*')
      .in('food_type_id', foodTypeIds)
      .or(materialBusinessScope)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
    if (mappingResult.error) {
      throw new ApiError(500, mappingResult.error.message || '?먯옱猷?留ㅽ븨 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.mappings.query')
    }
    mappings = (mappingResult.data ?? []) as MappingRow[]
  }

  const materialsResult = await supabase
    .from('raw_materials')
    .select('id, item_code, item_name, current_stock_g, business_id')
    .or(materialBusinessScope)
    .limit(5000)
  if (materialsResult.error) {
    throw new ApiError(500, materialsResult.error.message || '?먯옱猷??ш퀬 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'validation.materials.query')
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

  const recipeScopeMappings = new Map<string, MappingRow[]>()
  const productScopeMappings = new Map<string, MappingRow[]>()
  const globalScopeMappings = new Map<string, MappingRow[]>()
  for (const mapping of mappings) {
    const foodTypeId = toText(mapping.food_type_id)
    const scope = normalizeMappingScope(mapping.mapping_scope)
    const recipeId = toText(mapping.recipe_id)
    const productId = toText(mapping.product_id)
    if (scope === 'recipe' && recipeId) {
      const list = recipeScopeMappings.get(recipeId) ?? []
      list.push(mapping)
      recipeScopeMappings.set(recipeId, list)
      continue
    }
    if (scope === 'product' && productId && foodTypeId) {
      const key = `${productId}::${foodTypeId}`
      const list = productScopeMappings.get(key) ?? []
      list.push(mapping)
      productScopeMappings.set(key, list)
      continue
    }
    if (foodTypeId) {
      const list = globalScopeMappings.get(foodTypeId) ?? []
      list.push(mapping)
      globalScopeMappings.set(foodTypeId, list)
    }
  }

  const aggregated = new Map<string, DeductionPreviewRow>()
  const breakdownRows: DeductionPreviewRow[] = []
  for (const entry of recipes) {
    const recipe = entry.recipe
    const ratio = entry.effective_ratio_percent
    if (ratio <= 0) continue

    const requiredG = (deductionBasisG * ratio) / 100
    if (requiredG <= 0) continue

    const foodTypeId = toText(recipe.food_type_id)
    const foodTypeName = toText(recipe.food_type_name) || '미매핑 원재료'
    const recipeCandidates = recipeScopeMappings.get(toText(recipe.id)) ?? []
    const productCandidates =
      (toText(recipe.product_id) || toText(record.product_id)) && foodTypeId
        ? productScopeMappings.get(`${toText(recipe.product_id) || toText(record.product_id)}::${foodTypeId}`) ?? []
        : []
    const globalCandidates = foodTypeId ? globalScopeMappings.get(foodTypeId) ?? [] : []
    const preferred = recipeCandidates[0] ?? productCandidates[0] ?? globalCandidates[0]

    const mappedMaterialRefId = toText(preferred?.raw_material_ref_id)
    const mappedMaterialId = toText(preferred?.raw_material_id)
    const mappedMaterialName = toText(preferred?.raw_material_name)
    const byRefId = mappedMaterialRefId ? materialById.get(mappedMaterialRefId) : undefined
    const byId = mappedMaterialId ? materialById.get(mappedMaterialId) : undefined
    const byMappedName = mappedMaterialName ? materialByName.get(normalizeKey(mappedMaterialName)) : undefined
    const byFoodTypeName = materialByName.get(normalizeKey(foodTypeName))
    const targetMaterial = byRefId ?? byId ?? byMappedName ?? byFoodTypeName

    const key = targetMaterial ? `material:${targetMaterial.id}` : `missing:${foodTypeName}`
    const currentStockG = parseNumber(targetMaterial?.current_stock_g) ?? 0
    const previous = aggregated.get(key)

    breakdownRows.push({
      material_id: targetMaterial ? toText(targetMaterial.id) : null,
      item_code: targetMaterial ? toText(targetMaterial.item_code) || toText(targetMaterial.id) : null,
      material_name: targetMaterial ? toText(targetMaterial.item_name) : mappedMaterialName || foodTypeName,
      food_type_name: foodTypeName,
      source_label: entry.source_label,
      required_g: requiredG,
      current_stock_g: currentStockG,
      remaining_stock_g: currentStockG - requiredG,
      insufficient: !targetMaterial || currentStockG - requiredG < 0,
    })

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
    throw new ApiError(422, '?좏슚???덉떆??鍮꾩쑉???놁뼱 ?ъ슜?됱쓣 怨꾩궛?????놁뒿?덈떎.', 'validation.recipes.usable')
  }

  return {
    materials: materialsPreview,
    breakdown: breakdownRows,
    totalRequiredG: materialsPreview.reduce((sum, item) => sum + item.required_g, 0),
    hasInsufficient: materialsPreview.some((item) => item.insufficient),
    hasMissingMapping: materialsPreview.some((item) => !item.material_id),
    deductionBasisG,
    enteredQuantityG,
    lossQuantityG,
    plannedQuantityG,
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
      query = query.or('status.is.null,status.not.in.(cancelled,canceled,痍⑥냼)')
    }

    const { data, error } = await query
    if (error) throw new ApiError(500, error.message || '?쒖“湲곕줉 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'query.records')

    return NextResponse.json(
      {
        ok: true,
        records: ((data ?? []) as Record<string, unknown>[]).map(toRecordRow),
        products,
      },
      { status: 200 },
    )
  } catch (error) {
    const apiError = toApiError(error, '?쒖“湲곕줉 議고쉶 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'query.records')
    return NextResponse.json({ ok: false, error: apiError.message, stage: apiError.stage }, { status: apiError.status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '?붿껌 蹂몃Ц???꾩슂?⑸땲??' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const workDate = toText(body.work_date) || todayKst()
    const requestedLotNumber = toText(body.lot_number)
    let productId = toText(body.product_id) || null
    const planned = parseNumber(body.planned_quantity_g)
    const actual = parseNumber(body.actual_quantity_g)
    const sample = parseNumber(body.sample_quantity_g) ?? 0
    const productionUnitId = toText(body.production_unit_id) || null
    const productionUnitName = toText(body.production_unit_name) || null
    const productionUnitWeightG = parseNumber(body.production_unit_weight_g)

    if (!isValidIsoDate(workDate)) {
      return NextResponse.json({ ok: false, error: '생산예정일은 YYYY-MM-DD 형식의 올바른 날짜여야 합니다.' }, { status: 400 })
    }

    if (planned !== null && planned < 0) {
      return NextResponse.json({ ok: false, error: '怨꾪쉷 ?섎웾? 0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
    }
    if (actual !== null && actual < 0) {
      return NextResponse.json({ ok: false, error: '?ㅼ젣 ?섎웾? 0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
    }

    if (sample < 0) {
      return NextResponse.json({ ok: false, error: '?섑뵆?섎웾? 0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
    }

    const defectAuto = planned !== null && actual !== null ? Math.max(planned - actual, 0) : 0
    const defect = parseNumber(body.defect_quantity_g) ?? defectAuto
    if (defect < 0) {
      return NextResponse.json({ ok: false, error: '遺덈웾?섎웾? 0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
    }
    if (planned !== null && actual !== null && actual + defect + sample > planned) {
      return NextResponse.json(
        { ok: false, error: '?ㅼ젣 ?꾨즺??+ 遺덈웾?섎웾 + ?섑뵆?섎웾 ?⑷퀎媛 ?덉젙?섎웾??珥덇낵?????놁뒿?덈떎.' },
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
      if (productError) throw new ApiError(500, productError.message || '?쒗뭹 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'query.product')
      productName = toText((productData as { product_name?: unknown } | null)?.product_name)
    }

    if (!productId) {
      return NextResponse.json({ ok: false, error: 'product_id is required. Register or select a product first.' }, { status: 400 })
    }

    if (!productName) {
      return NextResponse.json({ ok: false, error: '?쒗뭹紐낆쓣 ?낅젰??二쇱꽭??' }, { status: 400 })
    }

    const lotNumber = requestedLotNumber || (await generateLotNumber(workDate))
    await ensureLotNumberAvailable(lotNumber)
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
      inspection_result: toText(body.inspection_result) || '?곹빀',
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
    const apiError = toApiError(error, '?쒖“湲곕줉 ???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'mutate.record.insert')
    return NextResponse.json({ ok: false, error: apiError.message, stage: apiError.stage }, { status: apiError.status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ ok: false, error: '?붿껌 蹂몃Ц???꾩슂?⑸땲??' }, { status: 400 })
    }

    const action = toText(body.action).toLowerCase()
    const recordId = toText(body.id) || toText(body.record_id)
    if (!recordId) {
      return NextResponse.json({ ok: false, error: 'record_id媛 ?꾩슂?⑸땲??' }, { status: 400 })
    }

    const record = await fetchRecordById(recordId)
    const recordStatus = normalizeStatus(record.status, '')

    if (action === 'update_planned') {
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '?뺤젙???묒뾽吏?쒖꽌???덉젙?섎웾???섏젙?????놁뒿?덈떎.' }, { status: 409 })
      }
      if (recordStatus !== 'planned') {
        return NextResponse.json({ ok: false, error: 'planned ?곹깭?먯꽌留??덉젙?섎웾???섏젙?????덉뒿?덈떎.' }, { status: 409 })
      }

      const plannedQuantityG = parseNumber(body.planned_quantity_g)
      if (plannedQuantityG === null || plannedQuantityG <= 0) {
        return NextResponse.json({ ok: false, error: 'planned_quantity_g??0蹂대떎 而ㅼ빞 ?⑸땲??' }, { status: 400 })
      }

      const workDate = toText(body.work_date) || toText(record.work_date)
      const lotNumber = toText(body.lot_number) || toText(record.lot_number)
      if (!isValidIsoDate(workDate)) {
        return NextResponse.json({ ok: false, error: '생산예정일은 YYYY-MM-DD 형식의 올바른 날짜여야 합니다.' }, { status: 400 })
      }
      if (!lotNumber) {
        return NextResponse.json({ ok: false, error: 'LOT를 입력해 주세요.' }, { status: 400 })
      }
      await ensureLotNumberAvailable(lotNumber, recordId)

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
        work_date: workDate,
        lot_number: lotNumber,
        planned_quantity_g: plannedQuantityG,
        planned_quantity_ea: plannedQuantityEa,
        planned_remainder_g: plannedRemainderG,
      })
      return NextResponse.json(
        { ok: true, record: toRecordRow(updated), message: '작업지시서가 수정되었습니다.' },
        { status: 200 },
      )
    }

    if (action === 'complete') {
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '?대? ?뺤젙???앹궛湲곕줉?낅땲??' }, { status: 409 })
      }

      if (recordStatus === 'cancelled') {
        return NextResponse.json({ ok: false, error: '痍⑥냼???묒뾽吏?쒖꽌???꾨즺 泥섎━?????놁뒿?덈떎.' }, { status: 409 })
      }

      if (!(recordStatus === 'planned' || recordStatus === 'completed')) {
        return NextResponse.json({ ok: false, error: 'planned ?먮뒗 completed ?곹깭?먯꽌留??꾨즺 ?낅젰??媛?ν빀?덈떎.' }, { status: 409 })
      }

      const hasPerFieldInput =
        body.actual_input_unit !== undefined ||
        body.defect_input_unit !== undefined ||
        body.sample_input_unit !== undefined ||
        body.actual_input_value !== undefined ||
        body.defect_input_value !== undefined ||
        body.sample_input_value !== undefined

      if (hasPerFieldInput) {
        const productionUnitWeightG = parseNumber(record.production_unit_weight_g)
        const defectUnitRaw = toText(body.defect_input_unit).toLowerCase()
        const sampleUnitRaw = toText(body.sample_input_unit).toLowerCase()
        if (defectUnitRaw === 'ea' || sampleUnitRaw === 'ea') {
          return NextResponse.json(
            { ok: false, error: '遺덈웾?섎웾怨??섑뵆?섎웾? g ?먮뒗 kg ?⑥쐞濡??낅젰?댁빞 ?⑸땲??' },
            { status: 400 },
          )
        }
        const actualInputUnit = normalizeInputUnit(body.actual_input_unit)
        const defectInputUnit = normalizeMassInputUnit(body.defect_input_unit)
        const sampleInputUnit = normalizeMassInputUnit(body.sample_input_unit)

        if (!actualInputUnit || !defectInputUnit || !sampleInputUnit) {
          return NextResponse.json(
            { ok: false, error: 'actual_input_unit, defect_input_unit, sample_input_unit??ea|kg|g揶쎛 ?袁⑹뒄??몃빍??' },
            { status: 400 },
          )
        }

        const actualInputValue = parseNumber(body.actual_input_value)
        if (actualInputValue === null) {
          return NextResponse.json({ ok: false, error: 'actual_input_value揶쎛 ?袁⑹뒄??몃빍??' }, { status: 400 })
        }

        const defectInputValueRaw = body.defect_input_value
        const sampleInputValueRaw = body.sample_input_value
        const defectInputValue = parseNumber(defectInputValueRaw)
        const sampleInputValue = parseNumber(sampleInputValueRaw)

        if (defectInputValueRaw !== undefined && defectInputValue === null) {
          return NextResponse.json({ ok: false, error: 'defect_input_value???類ㅺ맒?怨몄몵嚥???낆젾??雅뚯눘苑??' }, { status: 400 })
        }
        if (sampleInputValueRaw !== undefined && sampleInputValue === null) {
          return NextResponse.json({ ok: false, error: 'sample_input_value???類ㅺ맒?怨몄몵嚥???낆젾??雅뚯눘苑??' }, { status: 400 })
        }

        const toQuantityByUnit = (
          value: number,
          unit: InputUnit,
          fieldName: string,
        ): { grams: number; ea: number | null } | NextResponse => {
          if (value < 0) {
            return NextResponse.json({ ok: false, error: `${fieldName}?? 0 ??곴맒??곷선????몃빍??` }, { status: 400 })
          }

          if (unit === 'ea') {
            if (productionUnitWeightG === null || productionUnitWeightG <= 0) {
              return NextResponse.json(
                { ok: false, error: `${fieldName}??ea嚥???낆젾??롢늺 production_unit_weight_g揶쎛 ?袁⑹뒄??몃빍??` },
                { status: 400 },
              )
            }
            if (!Number.isInteger(value)) {
              return NextResponse.json({ ok: false, error: `${fieldName}??ea ??낆젾 ???類ㅻ땾??鍮???몃빍??` }, { status: 400 })
            }
            return { grams: value * productionUnitWeightG, ea: value }
          }

          if (unit === 'kg') {
            return {
              grams: value * 1000,
              ea:
                productionUnitWeightG !== null && productionUnitWeightG > 0
                  ? Math.floor((value * 1000) / productionUnitWeightG)
                  : null,
            }
          }

          return {
            grams: value,
            ea:
              productionUnitWeightG !== null && productionUnitWeightG > 0
                ? Math.floor(value / productionUnitWeightG)
                : null,
          }
        }

        const actualConverted = toQuantityByUnit(actualInputValue, actualInputUnit, '?袁⑥┷??롮쎗')
        if (actualConverted instanceof NextResponse) return actualConverted
        const defectConverted = toQuantityByUnit(defectInputValue ?? 0, defectInputUnit, '?븍뜄???롮쎗')
        if (defectConverted instanceof NextResponse) return defectConverted
        const sampleConverted = toQuantityByUnit(sampleInputValue ?? 0, sampleInputUnit, '??묐탣??롮쎗')
        if (sampleConverted instanceof NextResponse) return sampleConverted

        const actualQuantityG = actualConverted.grams
        const defectQuantityG = defectConverted.grams
        const sampleQuantityG = sampleConverted.grams
        const actualQuantityEa =
          actualInputUnit === 'ea'
            ? actualConverted.ea
            : productionUnitWeightG !== null && productionUnitWeightG > 0
              ? Math.floor(actualQuantityG / productionUnitWeightG)
              : null

        const plannedCandidate = parseNumber(body.planned_quantity_g)
        const plannedQuantityG = plannedCandidate ?? parseNumber(record.planned_quantity_g)
        if (plannedQuantityG === null || plannedQuantityG <= 0) {
          return NextResponse.json({ ok: false, error: '??됱젟??롮쎗????곷선 ?袁⑥┷ ??낆젾??筌욊쑵六??????곷뮸??덈뼄.' }, { status: 422 })
        }
        if (actualQuantityG + defectQuantityG + sampleQuantityG > plannedQuantityG) {
          return NextResponse.json(
            { ok: false, error: '??쇱젫 ?袁⑥┷??+ ?븍뜄???롮쎗 + ??묐탣??롮쎗 ??룻롥첎? ??됱젟??롮쎗???λ뜃???????곷뮸??덈뼄.' },
            { status: 400 },
          )
        }

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
          { ok: true, record: toRecordRow(updated), message: '??밴텦 ?袁⑥┷嚥?筌ｌ꼶???됰뮸??덈뼄.' },
          { status: 200 },
        )
      }

      const inputUnitRaw = toText(body.input_unit).toLowerCase()
      if (inputUnitRaw && !['ea', 'kg', 'g'].includes(inputUnitRaw)) {
        return NextResponse.json({ ok: false, error: 'input_unit? ea, kg, g 以??섎굹?ъ빞 ?⑸땲??' }, { status: 400 })
      }
      const inputUnit = inputUnitRaw || 'g'
      if (inputUnit === 'ea') {
        return NextResponse.json(
          { ok: false, error: '遺덈웾?섎웾怨??섑뵆?섎웾? g ?먮뒗 kg ?⑥쐞濡??낅젰?댁빞 ?⑸땲??' },
          { status: 400 },
        )
      }
      const productionUnitWeightG = parseNumber(record.production_unit_weight_g)

      let actualQuantityG: number | null = null
      let defectQuantityG = 0
      let sampleQuantityG = 0
      let actualQuantityEa: number | null = null

      if (inputUnit === 'ea') {
        if (productionUnitWeightG === null || productionUnitWeightG <= 0) {
          return NextResponse.json(
            { ok: false, error: 'production_unit_weight_g媛 ?놁뼱 ea ?낅젰??泥섎━?????놁뒿?덈떎.' },
            { status: 400 },
          )
        }

        const actualQuantityEaRaw = parseNumber(body.actual_quantity_ea)
        const defectQuantityEaRaw = parseNumber(body.defect_quantity_ea)
        const sampleQuantityEaRaw = parseNumber(body.sample_quantity_ea)

        if (actualQuantityEaRaw === null || !Number.isInteger(actualQuantityEaRaw)) {
          return NextResponse.json({ ok: false, error: 'actual_quantity_ea???뺤닔?ъ빞 ?⑸땲??' }, { status: 400 })
        }
        if (actualQuantityEaRaw < 0) {
          return NextResponse.json({ ok: false, error: 'actual_quantity_ea??0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
        }
        if (defectQuantityEaRaw !== null && !Number.isInteger(defectQuantityEaRaw)) {
          return NextResponse.json({ ok: false, error: 'defect_quantity_ea???뺤닔?ъ빞 ?⑸땲??' }, { status: 400 })
        }
        if (sampleQuantityEaRaw !== null && !Number.isInteger(sampleQuantityEaRaw)) {
          return NextResponse.json({ ok: false, error: 'sample_quantity_ea???뺤닔?ъ빞 ?⑸땲??' }, { status: 400 })
        }

        const defectQuantityEa = defectQuantityEaRaw ?? 0
        const sampleQuantityEa = sampleQuantityEaRaw ?? 0
        if (defectQuantityEa < 0 || sampleQuantityEa < 0) {
          return NextResponse.json({ ok: false, error: '遺덈웾?섎웾/?섑뵆?섎웾? 0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
        }

        actualQuantityEa = actualQuantityEaRaw
        actualQuantityG = actualQuantityEaRaw * productionUnitWeightG
        defectQuantityG = defectQuantityEa * productionUnitWeightG
        sampleQuantityG = sampleQuantityEa * productionUnitWeightG
      } else {
        actualQuantityG = parseNumber(body.actual_quantity_g)
        defectQuantityG = parseNumber(body.defect_quantity_g) ?? 0
        sampleQuantityG = parseNumber(body.sample_quantity_g) ?? 0
        if (actualQuantityG === null || actualQuantityG < 0) {
          return NextResponse.json({ ok: false, error: 'actual_quantity_g??0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
        }

        if (defectQuantityG < 0 || sampleQuantityG < 0) {
          return NextResponse.json({ ok: false, error: '遺덈웾?섎웾/?섑뵆?섎웾? 0 ?댁긽?댁뼱???⑸땲??' }, { status: 400 })
        }

        actualQuantityEa =
          productionUnitWeightG !== null && productionUnitWeightG > 0
            ? Math.floor(actualQuantityG / productionUnitWeightG)
            : null
      }

      if (actualQuantityG === null) {
        return NextResponse.json({ ok: false, error: 'actual_quantity_g媛 ?놁뼱 ?꾨즺 ?낅젰??泥섎━?????놁뒿?덈떎.' }, { status: 400 })
      }

      const plannedCandidate = parseNumber(body.planned_quantity_g)
      const plannedQuantityG = plannedCandidate ?? parseNumber(record.planned_quantity_g)
      if (plannedQuantityG === null || plannedQuantityG <= 0) {
        return NextResponse.json({ ok: false, error: '?덉젙?섎웾???놁뼱 ?꾨즺 ?낅젰??吏꾪뻾?????놁뒿?덈떎.' }, { status: 422 })
      }
      if (actualQuantityG + defectQuantityG + sampleQuantityG > plannedQuantityG) {
        return NextResponse.json(
          { ok: false, error: '?ㅼ젣 ?꾨즺??+ 遺덈웾?섎웾 + ?섑뵆?섎웾 ?⑷퀎媛 ?덉젙?섎웾??珥덇낵?????놁뒿?덈떎.' },
          { status: 400 },
        )
      }

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
        { ok: true, record: toRecordRow(updated), message: '?앹궛 ?꾨즺濡?泥섎━?덉뒿?덈떎.' },
        { status: 200 },
      )
    }

    if (action === 'cancel' || action === 'delete') {
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '확정된 작업지시서는 원재료 차감 이력이 있어 삭제할 수 없습니다.' }, { status: 409 })
      }

      if (recordStatus === 'cancelled') {
        return NextResponse.json(
          { ok: true, record: toRecordRow(record), message: '이미 삭제 처리된 작업지시서입니다.' },
          { status: 200 },
        )
      }

      if (!(recordStatus === 'planned' || recordStatus === 'completed')) {
        return NextResponse.json({ ok: false, error: '예정 또는 완료 상태의 작업지시서만 삭제할 수 있습니다.' }, { status: 409 })
      }

      const lotNumber = toText(record.lot_number) || recordId
      const hasOutbound = await hasExistingOutboundConfirm(recordId, lotNumber)
      if (hasOutbound) {
        return NextResponse.json(
          { ok: false, error: '원재료 차감 이력이 있어 삭제할 수 없습니다. 생산 확정 이력을 먼저 확인해 주세요.' },
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

    if (action === 'revert_completion') {
      if (recordStatus === 'cancelled') {
        return NextResponse.json({ ok: false, error: '痍⑥냼???묒뾽吏?쒖꽌?낅땲??' }, { status: 409 })
      }

      if (!(recordStatus === 'completed' || recordStatus === 'confirmed')) {
        return NextResponse.json(
          { ok: false, error: '?앹궛?꾨즺 ?먮뒗 ?뺤젙??湲곕줉留??섎룎由????덉뒿?덈떎.' },
          { status: 409 },
        )
      }

      const lotNumber = toText(record.lot_number) || recordId
      const supabase = createMoniServiceRoleClient()

      if (recordStatus === 'confirmed') {
        const txQuery = await supabase
          .from('raw_material_transactions')
          .select('id, raw_material_id, quantity_g, note')
          .eq('txn_type', 'OUTBOUND')
          .or(`note.ilike.%production_record_id=${recordId}%,note.ilike.%lot_number=${lotNumber}%`)

        if (txQuery.error) {
          throw new ApiError(500, txQuery.error.message || '?뚮え ?대젰 議고쉶???ㅽ뙣?덉뒿?덈떎.', 'query.outbound')
        }

        const txRows = (txQuery.data ?? []) as Array<{
          id?: string | null
          raw_material_id?: string | null
          quantity_g?: number | string | null
        }>

        const rollbackStocks: Array<{ id: string; previous: number }> = []
        try {
          for (const tx of txRows) {
            const materialId = toText(tx.raw_material_id)
            if (!materialId) continue
            const qtyG = parseNumber(tx.quantity_g) ?? 0
            if (qtyG <= 0) continue

            const materialResult = await supabase
              .from('raw_materials')
              .select('id, current_stock_g')
              .eq('id', materialId)
              .maybeSingle()
            if (materialResult.error) {
              throw new ApiError(500, materialResult.error.message || '?먯옱猷?議고쉶???ㅽ뙣?덉뒿?덈떎.', 'query.material')
            }
            if (!materialResult.data) continue

            const currentStock = parseNumber((materialResult.data as { current_stock_g?: unknown }).current_stock_g) ?? 0
            const nextStock = currentStock + qtyG

            const updateResult = await supabase
              .from('raw_materials')
              .update({ current_stock_g: nextStock })
              .eq('id', materialId)
            if (updateResult.error) {
              throw new ApiError(500, updateResult.error.message || '?먯옱猷??ш퀬 蹂듭썝???ㅽ뙣?덉뒿?덈떎.', 'mutate.stock.rollback')
            }

            rollbackStocks.push({ id: materialId, previous: currentStock })
          }

          const txIds = txRows.map((row) => toText(row.id)).filter(Boolean)
          if (txIds.length > 0) {
            const deleteResult = await supabase.from('raw_material_transactions').delete().in('id', txIds)
            if (deleteResult.error) {
              throw new ApiError(500, deleteResult.error.message || '?뚮え ?대젰 蹂듭썝???ㅽ뙣?덉뒿?덈떎.', 'mutate.tx.rollback')
            }
          }
        } catch (error) {
          for (const rollback of rollbackStocks) {
            await supabase.from('raw_materials').update({ current_stock_g: rollback.previous }).eq('id', rollback.id)
          }
          throw error
        }
      }

      const reverted = await updateRecordWithResilientColumns(recordId, {
        status: 'planned',
        actual_quantity_g: 0,
        defect_quantity_g: 0,
        sample_quantity_g: 0,
        actual_quantity_ea: null,
      })

      return NextResponse.json(
        { ok: true, record: toRecordRow(reverted), message: '?앹궛?쇰낫 ??ぉ???묒뾽吏???④퀎濡??섎룎?몄뒿?덈떎.' },
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
            deduction_basis_g: preview.deductionBasisG,
            entered_quantity_g: preview.enteredQuantityG,
            loss_quantity_g: preview.lossQuantityG,
            planned_quantity_g: preview.plannedQuantityG,
          },
        },
        { status: 200 },
      )
    }

    if (action === 'confirm') {
      if (recordStatus === 'cancelled') {
        return NextResponse.json({ ok: false, error: '痍⑥냼???묒뾽吏?쒖꽌???뺤젙?????놁뒿?덈떎.' }, { status: 409 })
      }
      if (isConfirmed(recordStatus)) {
        return NextResponse.json({ ok: false, error: '?대? ?뺤젙???앹궛湲곕줉?낅땲??' }, { status: 409 })
      }

      const lotNumber = toText(record.lot_number) || recordId
      await ensureNoExistingOutboundConfirm(recordId, lotNumber)

      const preview = await buildDeductionPreview(record)
      if (preview.hasMissingMapping) {
        return NextResponse.json(
          { ok: false, error: '?먯옱猷?誘몃ℓ????ぉ???덉뼱 ?뺤젙?????놁뒿?덈떎.', preview },
          { status: 422 },
        )
      }
      if (preview.hasInsufficient) {
        return NextResponse.json(
          { ok: false, error: '?먯옱猷??ш퀬媛 遺議깊븯???뺤젙?????놁뒿?덈떎.', preview },
          { status: 409 },
        )
      }

      const txDate = toText(record.work_date) || todayKst()
      const businessId = toText(record.business_id) || '20220523011'
      const confirmNote = buildOutboundNote(recordId, lotNumber)
      const supabase = createMoniServiceRoleClient()

      const stockPlan = preview.materials.map((item) => {
        if (!item.material_id) {
          throw new ApiError(422, `?먯옱猷?留ㅽ븨???놁뼱 ?뺤젙?????놁뒿?덈떎: ${item.food_type_name}`, 'validation.mappings')
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

      const transactionSourceRows = preview.breakdown.length > 0 ? preview.breakdown : preview.materials
      const transactionRows = transactionSourceRows
        .filter((item) => !!item.material_id)
        .map((item, index) => {
          const sourceNote = item.source_label ? `${confirmNote};source_product=${item.source_label}` : confirmNote
          const materialId = toText(item.material_id)
          const materialName = item.material_name
          return {
            id: makeTransactionId(index),
            item_code: item.item_code || materialId,
            item_name: materialName,
            txn_type: 'OUTBOUND',
            quantity_g: item.required_g,
            unit_price: null,
            supplier: null,
            note: sourceNote,
            txn_date: txDate,
            raw_material_id: materialId,
            raw_material_name: materialName,
            food_type_name: item.food_type_name || null,
            total_quantity_g: item.required_g,
            business_id: businessId,
          }
        })

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
          const rollbackHint = rollbackFailures.length > 0 ? ` (rollback ?ㅽ뙣: ${rollbackFailures.join(', ')})` : ''
          throw new ApiError(
            500,
            `?뺤젙 泥섎━ ?ㅽ뙣(?ш퀬 李④컧 ?④퀎): ${plan.materialName}${rollbackHint}`,
            'mutate.stock',
          )
        }
        updatedMaterialIds.push(plan.materialId)
      }

      const txResult = await supabase.from('raw_material_transactions').insert(transactionRows)
      if (txResult.error) {
        const rollbackFailures = await rollbackStocks()
        const rollbackHint = rollbackFailures.length > 0 ? ` (rollback ?ㅽ뙣: ${rollbackFailures.join(', ')})` : ''
        throw new ApiError(
          500,
          `?뺤젙 泥섎━ ?ㅽ뙣(?섎텋 湲곕줉 ?④퀎): ${txResult.error.message}${rollbackHint}`,
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
        const txRollbackHint = txRollbackFailed ? ' / transaction rollback ?ㅽ뙣' : ''
        const stockRollbackHint =
          stockRollbackFailures.length > 0 ? ` / stock rollback ?ㅽ뙣: ${stockRollbackFailures.join(', ')}` : ''
        const message =
          error instanceof Error ? error.message : '?앹궛湲곕줉 ?곹깭 蹂寃?以??????녿뒗 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.'
        throw new ApiError(
          500,
          `?뺤젙 泥섎━ ?ㅽ뙣(?곹깭 蹂寃??④퀎): ${message}${txRollbackHint}${stockRollbackHint}`,
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
            deduction_basis_g: preview.deductionBasisG,
            entered_quantity_g: preview.enteredQuantityG,
            loss_quantity_g: preview.lossQuantityG,
            planned_quantity_g: preview.plannedQuantityG,
          },
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ ok: false, error: '吏?먰븯吏 ?딅뒗 action?낅땲??' }, { status: 400 })
  } catch (error) {
    const apiError = toApiError(error, '?앹궛 泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.', 'patch.unknown')
    return NextResponse.json({ ok: false, error: apiError.message, stage: apiError.stage }, { status: apiError.status })
  }
}
