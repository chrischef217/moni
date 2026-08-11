import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'
import { MONI_BUSINESS_ID } from '@/lib/moni/mcp/config'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export type ProductionOperationAction =
  | 'CREATE_WORK_ORDER'
  | 'UPDATE_WORK_ORDER'
  | 'CANCEL_WORK_ORDER'
  | 'COMPLETE_PRODUCTION'
  | 'CONFIRM_PRODUCTION'

type PrepareInput = {
  action?: unknown
  record_id?: unknown
  work_date?: unknown
  product_id?: unknown
  planned_quantity_kg?: unknown
  lot_number?: unknown
  note?: unknown
  worker_name?: unknown
  actual_quantity_kg?: unknown
  defect_quantity_kg?: unknown
  sample_quantity_kg?: unknown
  inspection_result?: unknown
  inspection_note?: unknown
  sanitation_check?: unknown
  reason?: unknown
}

type ExecuteInput = {
  confirmation_id?: unknown
  user_confirmation_text?: unknown
}

const PRODUCTION_API_ORIGIN = 'https://moni-sigma.vercel.app'
const WRITER_NAME = '윤대열'
const REVIEWER_NAME = '배순애'

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const numeric = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 60))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : ''
const kgText = (grams: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format((Number(grams) || 0) / 1000)}kg`

function normalizeAction(value: unknown): ProductionOperationAction | null {
  const action = text(value, 40).toUpperCase()
  if (
    action === 'CREATE_WORK_ORDER' ||
    action === 'UPDATE_WORK_ORDER' ||
    action === 'CANCEL_WORK_ORDER' ||
    action === 'COMPLETE_PRODUCTION' ||
    action === 'CONFIRM_PRODUCTION'
  ) return action
  return null
}

function statusKey(value: unknown) {
  const raw = text(value, 80).toLowerCase()
  if (['planned', 'plan', 'scheduled'].includes(raw)) return 'planned'
  if (['completed', 'complete', 'done', '완료'].includes(raw)) return 'completed'
  if (['confirmed', 'confirm', '확정'].includes(raw)) return 'confirmed'
  if (['cancelled', 'canceled', '취소'].includes(raw)) return 'cancelled'
  if (raw === 'confirming') return 'confirming'
  return raw
}

function publicRecord(row: any) {
  if (!row) return null
  return {
    id: text(row.id, 60),
    lot_number: text(row.lot_number, 100),
    work_date: text(row.work_date, 10),
    product_id: text(row.product_id, 100) || null,
    product_name: text(row.product_name, 300),
    production_unit_id: text(row.production_unit_id, 60) || null,
    production_unit_name: text(row.production_unit_name, 200) || null,
    production_unit_weight_g: Number(row.production_unit_weight_g || 0) || null,
    planned_quantity_g: Number(row.planned_quantity_g || 0),
    planned_quantity_kg: Number(row.planned_quantity_g || 0) / 1000,
    actual_quantity_g: row.actual_quantity_g == null ? null : Number(row.actual_quantity_g),
    actual_quantity_kg: row.actual_quantity_g == null ? null : Number(row.actual_quantity_g) / 1000,
    defect_quantity_g: Number(row.defect_quantity_g || 0),
    sample_quantity_g: Number(row.sample_quantity_g || 0),
    worker_name: row.worker_name == null ? null : text(row.worker_name, 200),
    inspection_result: row.inspection_result == null ? null : text(row.inspection_result, 100),
    inspection_note: row.inspection_note == null ? null : text(row.inspection_note, 1000),
    sanitation_check: typeof row.sanitation_check === 'boolean' ? row.sanitation_check : null,
    note: row.note == null ? null : text(row.note, 1000),
    status: text(row.status, 80),
    business_id: text(row.business_id, 100),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function fetchRecord(recordId: string) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('production_records')
    .select('*')
    .eq('id', recordId)
    .eq('business_id', MONI_BUSINESS_ID)
    .maybeSingle()
  if (error) throw new Error(`생산 작업지시 조회 실패: ${error.message}`)
  if (!data) throw new Error('해당 생산 작업지시를 찾을 수 없습니다.')
  return data
}

async function fetchProduct(productId: string) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('products')
    .select('id,product_name,weight_g,business_id,is_active')
    .eq('id', productId)
    .eq('business_id', MONI_BUSINESS_ID)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`제품 검증 실패: ${error.message}`)
  if (!data) throw new Error('두배 활성 제품 목록에서 해당 product_id를 찾을 수 없습니다.')
  return data
}

async function fetchDefaultProductionUnit(productId: string, productWeightG: unknown) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('product_production_units')
    .select('id,unit_name,unit_weight_g,is_default,sort_order')
    .eq('product_id', productId)
    .eq('business_id', MONI_BUSINESS_ID)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`생산단위 조회 실패: ${error.message}`)
  if (data) {
    return {
      id: data.id,
      name: data.unit_name,
      weight_g: Number(data.unit_weight_g || 0) || null,
    }
  }
  const fallbackWeight = Number(productWeightG || 0)
  return {
    id: null,
    name: fallbackWeight > 0 ? `${new Intl.NumberFormat('ko-KR').format(fallbackWeight)}g` : null,
    weight_g: fallbackWeight > 0 ? fallbackWeight : null,
  }
}

function lotPrefix(workDate: string) {
  return `LOT${workDate.replaceAll('-', '')}`
}

function validLotForDate(lot: string, workDate: string) {
  return new RegExp(`^${lotPrefix(workDate)}-[1-9][0-9]*$`).test(lot)
}

async function generateLotNumber(workDate: string) {
  const supabase = createMoniServiceRoleClient()
  const prefix = lotPrefix(workDate)
  const { data, error } = await supabase
    .from('production_records')
    .select('lot_number')
    .eq('business_id', MONI_BUSINESS_ID)
    .eq('work_date', workDate)
    .like('lot_number', `${prefix}-%`)
    .limit(500)
  if (error) throw new Error(`LOT 생성 실패: ${error.message}`)
  let max = 0
  for (const row of data ?? []) {
    const seq = Number(String(row.lot_number || '').split('-').pop())
    if (Number.isFinite(seq)) max = Math.max(max, seq)
  }
  return `${prefix}-${max + 1}`
}

async function ensureLotAvailable(lotNumber: string, exceptId?: string) {
  const supabase = createMoniServiceRoleClient()
  let query = supabase
    .from('production_records')
    .select('id')
    .eq('business_id', MONI_BUSINESS_ID)
    .eq('lot_number', lotNumber)
    .limit(1)
  if (exceptId) query = query.neq('id', exceptId)
  const { data, error } = await query
  if (error) throw new Error(`LOT 중복 확인 실패: ${error.message}`)
  if ((data ?? []).length) throw new Error('같은 LOT 번호의 생산 작업지시가 이미 존재합니다.')
}

async function quantityGuard(productId: string, quantityKg: number) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('production_records')
    .select('actual_quantity_g,planned_quantity_g,status')
    .eq('business_id', MONI_BUSINESS_ID)
    .eq('product_id', productId)
    .order('work_date', { ascending: false })
    .limit(30)
  if (error) throw new Error(`생산량 안전검증 실패: ${error.message}`)
  const quantities = (data ?? [])
    .map((row: any) => Number(row.actual_quantity_g || row.planned_quantity_g || 0))
    .filter((value: number) => Number.isFinite(value) && value > 0 && value < 10_000_000)
  const medianKg = median(quantities) / 1000
  const hardLimitKg = medianKg > 0 ? Math.max(5_000, medianKg * 50) : 10_000
  const warningLimitKg = medianKg > 0 ? Math.max(2_000, medianKg * 5) : 5_000
  if (quantityKg > hardLimitKg) {
    throw new Error(`생산량 ${new Intl.NumberFormat('ko-KR').format(quantityKg)}kg은 안전 한도 ${new Intl.NumberFormat('ko-KR').format(Math.round(hardLimitKg))}kg을 초과합니다. kg/g 단위 오입력 가능성이 있어 차단했습니다.`)
  }
  return quantityKg > warningLimitKg
    ? `통상 생산량보다 큰 작업지시입니다. ${new Intl.NumberFormat('ko-KR').format(quantityKg)}kg`
    : null
}

async function callProductionApi(body: Record<string, unknown>) {
  const response = await fetch(`${PRODUCTION_API_ORIGIN}/api/moni/production-records`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const value = await response.json().catch(() => ({})) as any
  if (!response.ok || !value?.ok) throw new Error(text(value?.error, 2000) || `생산 처리 API 실패 (${response.status})`)
  return value
}

async function createConfirmation(input: {
  action: ProductionOperationAction
  targetId: string | null
  payload: Record<string, unknown>
  before: any
  previewText: string
  warnings: string[]
  identity: MoniMcpIdentity
}) {
  const supabase = createMoniServiceRoleClient()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('moni_action_confirmations')
    .insert({
      business_id: MONI_BUSINESS_ID,
      action_domain: 'production_record',
      action_type: input.action,
      target_id: input.targetId,
      payload: input.payload,
      before_snapshot: input.before,
      preview_text: input.previewText,
      warnings: input.warnings,
      status: 'PENDING',
      requested_by_login_id: input.identity.loginId,
      requested_by_role: input.identity.role,
      source_client_id: input.identity.clientId,
      expires_at: expiresAt,
    })
    .select('id,status,expires_at')
    .single()
  if (error) throw new Error(`승인 건 생성 실패: ${error.message}`)
  return data
}

export async function prepareProductionOperation(input: PrepareInput, identity: MoniMcpIdentity) {
  const action = normalizeAction(input.action)
  if (!action) throw new Error('지원 action: CREATE_WORK_ORDER, UPDATE_WORK_ORDER, CANCEL_WORK_ORDER, COMPLETE_PRODUCTION, CONFIRM_PRODUCTION')

  const warnings: string[] = []
  const recordId = text(input.record_id, 60)
  let before: any = null
  if (action !== 'CREATE_WORK_ORDER') {
    if (!uuidLike(recordId)) throw new Error('유효한 record_id가 필요합니다.')
    before = await fetchRecord(recordId)
  }

  let payload: Record<string, unknown> = { reason: text(input.reason, 1000) || null }
  let proposed: Record<string, unknown> | null = null
  let previewText = ''

  if (action === 'CREATE_WORK_ORDER') {
    const workDate = validDate(input.work_date)
    const productId = text(input.product_id, 100)
    const quantityKg = numeric(input.planned_quantity_kg)
    if (!workDate) throw new Error('work_date가 YYYY-MM-DD 형식으로 필요합니다.')
    if (!productId) throw new Error('product_id가 필요합니다.')
    if (quantityKg === null || quantityKg <= 0) throw new Error('planned_quantity_kg는 0보다 커야 합니다.')
    const product = await fetchProduct(productId)
    const largeWarning = await quantityGuard(productId, quantityKg)
    if (largeWarning) warnings.push(largeWarning)
    const unit = await fetchDefaultProductionUnit(productId, product.weight_g)
    const plannedG = Math.round(quantityKg * 1000)
    if (!Number.isSafeInteger(plannedG) || plannedG <= 0) throw new Error('생산량 단위 변환 결과가 안전하지 않습니다.')
    const requestedLot = text(input.lot_number, 100).toUpperCase()
    const lotNumber = requestedLot || await generateLotNumber(workDate)
    if (!validLotForDate(lotNumber, workDate)) throw new Error(`LOT는 ${lotPrefix(workDate)}-1 형식이어야 합니다.`)
    await ensureLotAvailable(lotNumber)
    const unitWeight = Number(unit.weight_g || 0)
    const plannedEa = unitWeight > 0 ? Math.floor(plannedG / unitWeight) : null
    const remainderG = unitWeight > 0 ? plannedG - (plannedEa || 0) * unitWeight : 0
    proposed = {
      work_date: workDate,
      lot_number: lotNumber,
      product_id: product.id,
      product_name: product.product_name,
      production_unit_id: unit.id,
      production_unit_name: unit.name,
      production_unit_weight_g: unit.weight_g,
      planned_quantity_g: plannedG,
      planned_quantity_kg: plannedG / 1000,
      planned_quantity_ea: plannedEa,
      planned_remainder_g: remainderG,
      note: text(input.note, 1000) || null,
      worker_name: text(input.worker_name, 200) || null,
      status: 'planned',
      business_id: MONI_BUSINESS_ID,
    }
    payload = { ...proposed, reason: text(input.reason, 1000) || null }
    previewText = `[작업지시 등록] ${workDate} / ${product.product_name} / ${kgText(plannedG)} / ${lotNumber}`
  }

  if (action === 'UPDATE_WORK_ORDER') {
    if (statusKey(before.status) !== 'planned') throw new Error('예정(planned) 상태의 작업지시만 수정할 수 있습니다.')
    const workDate = validDate(input.work_date) || text(before.work_date, 10)
    const quantityKg = input.planned_quantity_kg === undefined ? Number(before.planned_quantity_g || 0) / 1000 : numeric(input.planned_quantity_kg)
    if (quantityKg === null || quantityKg <= 0) throw new Error('planned_quantity_kg는 0보다 커야 합니다.')
    const productId = text(before.product_id, 100)
    const largeWarning = await quantityGuard(productId, quantityKg)
    if (largeWarning) warnings.push(largeWarning)
    const plannedG = Math.round(quantityKg * 1000)
    const requestedLot = text(input.lot_number, 100).toUpperCase()
    let lotNumber = requestedLot || text(before.lot_number, 100)
    if (workDate !== text(before.work_date, 10) && !requestedLot) lotNumber = await generateLotNumber(workDate)
    if (!validLotForDate(lotNumber, workDate)) throw new Error(`LOT는 ${lotPrefix(workDate)}-1 형식이어야 합니다.`)
    await ensureLotAvailable(lotNumber, recordId)
    const unitWeight = Number(before.production_unit_weight_g || 0)
    const plannedEa = unitWeight > 0 ? Math.floor(plannedG / unitWeight) : null
    const remainderG = unitWeight > 0 ? plannedG - (plannedEa || 0) * unitWeight : 0
    proposed = {
      ...publicRecord(before),
      work_date: workDate,
      lot_number: lotNumber,
      planned_quantity_g: plannedG,
      planned_quantity_kg: plannedG / 1000,
      planned_quantity_ea: plannedEa,
      planned_remainder_g: remainderG,
      note: Object.prototype.hasOwnProperty.call(input, 'note') ? (text(input.note, 1000) || null) : before.note,
      worker_name: Object.prototype.hasOwnProperty.call(input, 'worker_name') ? (text(input.worker_name, 200) || null) : before.worker_name,
    }
    payload = {
      work_date: proposed.work_date,
      lot_number: proposed.lot_number,
      planned_quantity_g: proposed.planned_quantity_g,
      planned_quantity_ea: proposed.planned_quantity_ea,
      planned_remainder_g: proposed.planned_remainder_g,
      note: proposed.note,
      worker_name: proposed.worker_name,
      reason: text(input.reason, 1000) || null,
    }
    previewText = `[작업지시 수정] ${before.work_date} ${before.product_name} ${kgText(before.planned_quantity_g)} → ${workDate} ${before.product_name} ${kgText(plannedG)} / ${lotNumber}`
  }

  if (action === 'CANCEL_WORK_ORDER') {
    if (statusKey(before.status) !== 'planned') throw new Error('예정(planned) 상태의 작업지시만 취소할 수 있습니다. 완료·확정 기록은 이력 보호를 위해 직접 취소하지 않습니다.')
    proposed = { ...publicRecord(before), status: 'cancelled' }
    payload = { status: 'cancelled', reason: text(input.reason, 1000) || null }
    previewText = `[작업지시 취소] ${before.work_date} / ${before.product_name} / ${kgText(before.planned_quantity_g)} / ${before.lot_number} — 행은 삭제하지 않고 cancelled 상태로 보존`
  }

  if (action === 'COMPLETE_PRODUCTION') {
    if (statusKey(before.status) !== 'planned') throw new Error('예정(planned) 상태의 작업지시만 생산완료 입력할 수 있습니다.')
    const actualKg = numeric(input.actual_quantity_kg)
    const defectKg = numeric(input.defect_quantity_kg) ?? 0
    const sampleKg = numeric(input.sample_quantity_kg) ?? 0
    if (actualKg === null || actualKg < 0 || defectKg < 0 || sampleKg < 0) throw new Error('완료·불량·샘플 수량은 0 이상이어야 합니다.')
    const actualG = Math.round(actualKg * 1000)
    const defectG = Math.round(defectKg * 1000)
    const sampleG = Math.round(sampleKg * 1000)
    const plannedG = Number(before.planned_quantity_g || 0)
    if (actualG + defectG + sampleG <= 0) throw new Error('완료·불량·샘플 합계가 0보다 커야 합니다.')
    if (plannedG <= 0) throw new Error('작업지시의 계획량이 없어 완료 처리할 수 없습니다.')
    if (actualG + defectG + sampleG > plannedG) throw new Error('완료+불량+샘플 합계가 계획량을 초과할 수 없습니다.')
    const unitWeight = Number(before.production_unit_weight_g || 0)
    const actualEa = unitWeight > 0 ? Math.floor(actualG / unitWeight) : null
    proposed = {
      ...publicRecord(before),
      actual_quantity_g: actualG,
      actual_quantity_kg: actualG / 1000,
      actual_quantity_ea: actualEa,
      defect_quantity_g: defectG,
      sample_quantity_g: sampleG,
      worker_name: Object.prototype.hasOwnProperty.call(input, 'worker_name') ? (text(input.worker_name, 200) || null) : before.worker_name,
      inspection_result: text(input.inspection_result, 100) || before.inspection_result || '적합',
      inspection_note: Object.prototype.hasOwnProperty.call(input, 'inspection_note') ? (text(input.inspection_note, 1000) || null) : before.inspection_note,
      sanitation_check: typeof input.sanitation_check === 'boolean' ? input.sanitation_check : (typeof before.sanitation_check === 'boolean' ? before.sanitation_check : true),
      status: 'completed',
    }
    payload = {
      actual_quantity_g: actualG,
      actual_quantity_ea: actualEa,
      defect_quantity_g: defectG,
      sample_quantity_g: sampleG,
      worker_name: proposed.worker_name,
      inspection_result: proposed.inspection_result,
      inspection_note: proposed.inspection_note,
      sanitation_check: proposed.sanitation_check,
      actual_input_kg: actualG / 1000,
      defect_input_kg: defectG / 1000,
      sample_input_kg: sampleG / 1000,
      reason: text(input.reason, 1000) || null,
    }
    const gapG = plannedG - actualG - defectG - sampleG
    previewText = `[생산완료 입력] ${before.work_date} / ${before.product_name} / 계획 ${kgText(plannedG)} / 완료 ${kgText(actualG)} / 불량 ${kgText(defectG)} / 샘플 ${kgText(sampleG)} / 미계상 차이 ${kgText(gapG)}`
  }

  if (action === 'CONFIRM_PRODUCTION') {
    if (statusKey(before.status) !== 'completed') throw new Error('생산완료(completed/완료) 상태만 원재료 차감 확정을 할 수 있습니다.')
    const apiPreview = await callProductionApi({ action: 'preview_confirm', record_id: recordId })
    const deduction = apiPreview.preview || {}
    const materials = Array.isArray(deduction.materials) ? deduction.materials : []
    const missing = Boolean(deduction.has_missing_mapping)
    const insufficient = Boolean(deduction.has_insufficient)
    if (missing) {
      const names = materials.filter((row: any) => !row?.material_id).map((row: any) => text(row?.food_type_name || row?.material_name, 100)).filter(Boolean)
      throw new Error(`원재료 매핑 누락으로 생산확정을 차단했습니다.${names.length ? ` 누락: ${names.slice(0, 8).join(', ')}` : ''}`)
    }
    if (insufficient) {
      const names = materials.filter((row: any) => row?.insufficient).map((row: any) => text(row?.material_name, 100)).filter(Boolean)
      throw new Error(`원재료 재고 부족으로 생산확정을 차단했습니다.${names.length ? ` 부족: ${names.slice(0, 8).join(', ')}` : ''}`)
    }
    payload = {
      deduction_preview: deduction,
      reason: text(input.reason, 1000) || null,
    }
    proposed = {
      ...publicRecord(before),
      status: 'confirmed',
      raw_material_deduction: deduction,
    }
    previewText = `[생산확정 및 원재료 차감] ${before.work_date} / ${before.product_name} / LOT ${before.lot_number} / 차감기준 ${kgText(deduction.deduction_basis_g)} / 원재료 ${materials.length}개 항목 / 총 차감 ${kgText(deduction.total_required_g)}`
  }

  const confirmation = await createConfirmation({
    action,
    targetId: action === 'CREATE_WORK_ORDER' ? null : recordId,
    payload,
    before: before ? before : null,
    previewText,
    warnings,
    identity,
  })

  return {
    confirmation_id: confirmation.id,
    status: confirmation.status,
    action_domain: 'production_record',
    action_type: action,
    requires_user_confirmation: true,
    expires_at: confirmation.expires_at,
    before: publicRecord(before),
    proposed,
    warnings,
    preview_text: previewText,
    next_step: '이 미리보기를 사용자에게 보여준 뒤, 새로운 사용자 메시지에서 명시적 승인을 받은 경우에만 execute_production_operation을 호출하세요.',
  }
}

async function claimConfirmation(confirmationId: string, userConfirmationText: string, identity: MoniMcpIdentity) {
  const supabase = createMoniServiceRoleClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('moni_action_confirmations')
    .update({ status: 'EXECUTING', user_confirmation_text: userConfirmationText, error_message: null })
    .eq('id', confirmationId)
    .eq('business_id', MONI_BUSINESS_ID)
    .eq('action_domain', 'production_record')
    .eq('status', 'PENDING')
    .eq('source_client_id', identity.clientId)
    .eq('requested_by_login_id', identity.loginId)
    .gt('expires_at', now)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`승인 건 잠금 실패: ${error.message}`)
  if (data) return data

  const lookup = await supabase.from('moni_action_confirmations').select('status,expires_at').eq('id', confirmationId).maybeSingle()
  if (lookup.error) throw new Error(`승인 건 상태 확인 실패: ${lookup.error.message}`)
  if (!lookup.data) throw new Error('승인 건을 찾을 수 없습니다.')
  if (new Date(String(lookup.data.expires_at)).getTime() <= Date.now()) throw new Error('승인 건이 만료되었습니다. 다시 미리보기를 생성해 주세요.')
  throw new Error(`이미 처리되었거나 실행할 수 없는 승인 건입니다. 현재 상태: ${lookup.data.status}`)
}

async function markFailed(confirmationId: string, message: string) {
  const supabase = createMoniServiceRoleClient()
  await supabase
    .from('moni_action_confirmations')
    .update({ status: 'FAILED', error_message: message.slice(0, 2000) })
    .eq('id', confirmationId)
    .eq('status', 'EXECUTING')
}

async function finishExecution(input: {
  confirmation: any
  before: any
  after: any
  result: Record<string, unknown>
  identity: MoniMcpIdentity
  userConfirmationText: string
}) {
  const supabase = createMoniServiceRoleClient()
  const targetId = text(input.after?.id || input.confirmation.target_id, 60) || null
  const { error: auditError } = await supabase.from('moni_action_audit_log').insert({
    confirmation_id: input.confirmation.id,
    business_id: MONI_BUSINESS_ID,
    action_domain: 'production_record',
    action_type: input.confirmation.action_type,
    target_table: 'production_records',
    target_id: targetId,
    before_snapshot: input.before || null,
    after_snapshot: input.after || null,
    actor_login_id: input.identity.loginId,
    actor_role: input.identity.role,
    source_client_id: input.identity.clientId,
    user_confirmation_text: input.userConfirmationText,
  })
  if (auditError) throw new Error(`감사로그 저장 실패: ${auditError.message}`)

  const executedAt = new Date().toISOString()
  const { error: finishError } = await supabase
    .from('moni_action_confirmations')
    .update({
      status: 'EXECUTED',
      result_snapshot: input.result,
      executed_at: executedAt,
      error_message: null,
    })
    .eq('id', input.confirmation.id)
    .eq('status', 'EXECUTING')
  if (finishError) throw new Error(`실행 결과 저장 실패: ${finishError.message}`)
  return executedAt
}

export async function executeProductionOperation(input: ExecuteInput, identity: MoniMcpIdentity) {
  const confirmationId = text(input.confirmation_id, 60)
  const userConfirmationText = text(input.user_confirmation_text, 500)
  if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
  if (!userConfirmationText) throw new Error('사용자의 명시적 승인 문구가 필요합니다.')

  const confirmation = await claimConfirmation(confirmationId, userConfirmationText, identity)
  const action = normalizeAction(confirmation.action_type)
  if (!action) {
    await markFailed(confirmationId, '지원하지 않는 생산 action')
    throw new Error('지원하지 않는 생산 action입니다.')
  }

  const payload = (confirmation.payload && typeof confirmation.payload === 'object') ? confirmation.payload as Record<string, any> : {}
  const before = confirmation.before_snapshot || null
  const supabase = createMoniServiceRoleClient()
  let after: any = null
  let verification: Record<string, unknown> = {}
  let result: Record<string, unknown> = {}

  try {
    if (action === 'CREATE_WORK_ORDER') {
      const lotNumber = text(payload.lot_number, 100)
      await ensureLotAvailable(lotNumber)
      const row = {
        lot_number: lotNumber,
        work_date: payload.work_date,
        product_id: payload.product_id,
        product_name: payload.product_name,
        production_unit_id: payload.production_unit_id || null,
        production_unit_name: payload.production_unit_name || null,
        production_unit_weight_g: payload.production_unit_weight_g || null,
        planned_quantity_ea: payload.planned_quantity_ea ?? null,
        planned_remainder_g: payload.planned_remainder_g ?? 0,
        actual_quantity_ea: null,
        planned_quantity_g: payload.planned_quantity_g,
        actual_quantity_g: null,
        defect_quantity_g: 0,
        sample_quantity_g: 0,
        worker_name: payload.worker_name || null,
        inspection_result: '적합',
        sanitation_check: true,
        note: payload.note || null,
        status: 'planned',
        business_id: MONI_BUSINESS_ID,
        updated_at: new Date().toISOString(),
      }
      const inserted = await supabase.from('production_records').insert(row).select('*').single()
      if (inserted.error) throw new Error(`작업지시 등록 실패: ${inserted.error.message}`)
      after = inserted.data
    }

    if (action === 'UPDATE_WORK_ORDER') {
      const recordId = text(confirmation.target_id, 60)
      const current = await fetchRecord(recordId)
      if (statusKey(current.status) !== 'planned') throw new Error('작업지시 상태가 변경되어 수정할 수 없습니다.')
      await ensureLotAvailable(text(payload.lot_number, 100), recordId)
      const updated = await supabase
        .from('production_records')
        .update({
          work_date: payload.work_date,
          lot_number: payload.lot_number,
          planned_quantity_g: payload.planned_quantity_g,
          planned_quantity_ea: payload.planned_quantity_ea ?? null,
          planned_remainder_g: payload.planned_remainder_g ?? 0,
          note: payload.note ?? null,
          worker_name: payload.worker_name ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId)
        .eq('business_id', MONI_BUSINESS_ID)
        .eq('status', current.status)
        .select('*')
        .single()
      if (updated.error) throw new Error(`작업지시 수정 실패: ${updated.error.message}`)
      after = updated.data
    }

    if (action === 'CANCEL_WORK_ORDER') {
      const recordId = text(confirmation.target_id, 60)
      const current = await fetchRecord(recordId)
      if (statusKey(current.status) !== 'planned') throw new Error('작업지시 상태가 변경되어 취소할 수 없습니다.')
      const updated = await supabase
        .from('production_records')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', recordId)
        .eq('business_id', MONI_BUSINESS_ID)
        .eq('status', current.status)
        .select('*')
        .single()
      if (updated.error) throw new Error(`작업지시 취소 실패: ${updated.error.message}`)
      after = updated.data
    }

    if (action === 'COMPLETE_PRODUCTION') {
      const recordId = text(confirmation.target_id, 60)
      const current = await fetchRecord(recordId)
      if (statusKey(current.status) !== 'planned') throw new Error('작업지시 상태가 변경되어 완료 처리할 수 없습니다.')
      const updated = await supabase
        .from('production_records')
        .update({
          actual_quantity_g: payload.actual_quantity_g,
          actual_quantity_ea: payload.actual_quantity_ea ?? null,
          defect_quantity_g: payload.defect_quantity_g,
          sample_quantity_g: payload.sample_quantity_g,
          worker_name: payload.worker_name ?? null,
          inspection_result: payload.inspection_result || '적합',
          inspection_note: payload.inspection_note ?? null,
          sanitation_check: typeof payload.sanitation_check === 'boolean' ? payload.sanitation_check : true,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId)
        .eq('business_id', MONI_BUSINESS_ID)
        .eq('status', current.status)
        .select('*')
        .single()
      if (updated.error) throw new Error(`생산완료 저장 실패: ${updated.error.message}`)
      after = updated.data

      const metadata = await supabase
        .from('production_completion_metadata')
        .upsert({
          production_record_id: recordId,
          writer_name: WRITER_NAME,
          reviewer_name: REVIEWER_NAME,
          actual_input_unit: 'kg',
          actual_input_value: payload.actual_input_kg,
          defect_input_unit: 'kg',
          defect_input_value: payload.defect_input_kg,
          sample_entries: Number(payload.sample_input_kg || 0) > 0
            ? [{ label: '샘플 1', value: payload.sample_input_kg, unit: 'kg', grams: payload.sample_quantity_g }]
            : [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'production_record_id' })
      if (metadata.error) {
        result.metadata_warning = `생산완료 메타데이터 저장 실패: ${metadata.error.message}`
      }
    }

    if (action === 'CONFIRM_PRODUCTION') {
      const recordId = text(confirmation.target_id, 60)
      const current = await fetchRecord(recordId)
      if (statusKey(current.status) !== 'completed') throw new Error('작업지시 상태가 변경되어 원재료 차감 확정을 할 수 없습니다.')

      const lock = await supabase
        .from('production_records')
        .update({ status: 'confirming', updated_at: new Date().toISOString() })
        .eq('id', recordId)
        .eq('business_id', MONI_BUSINESS_ID)
        .eq('status', current.status)
        .select('id,status')
        .maybeSingle()
      if (lock.error) throw new Error(`생산확정 잠금 실패: ${lock.error.message}`)
      if (!lock.data) throw new Error('다른 실행이 먼저 진행되어 생산확정을 시작할 수 없습니다.')

      try {
        await callProductionApi({ action: 'confirm', record_id: recordId })
      } catch (error) {
        const check = await fetchRecord(recordId)
        if (statusKey(check.status) !== 'confirmed') {
          await supabase
            .from('production_records')
            .update({ status: current.status, updated_at: new Date().toISOString() })
            .eq('id', recordId)
            .eq('business_id', MONI_BUSINESS_ID)
            .eq('status', 'confirming')
          throw error
        }
      }
      after = await fetchRecord(recordId)
      if (statusKey(after.status) !== 'confirmed') throw new Error('생산확정 API 호출 후 상태가 confirmed로 확인되지 않았습니다.')
    }

    if (!after) throw new Error('실행 후 생산기록을 확인할 수 없습니다.')

    verification = {
      verified: true,
      saved_record: publicRecord(after),
    }

    if (action === 'CONFIRM_PRODUCTION') {
      const recordId = text(after.id, 60)
      const tx = await supabase
        .from('raw_material_transactions')
        .select('id,quantity_g,raw_material_id,item_name')
        .eq('business_id', MONI_BUSINESS_ID)
        .eq('txn_type', 'OUTBOUND')
        .or(`production_record_id.eq.${recordId},note.ilike.%production_record_id=${recordId}%`)
      if (tx.error) throw new Error(`원재료 차감 결과 검증 실패: ${tx.error.message}`)
      const rows = tx.data ?? []
      verification = {
        ...verification,
        raw_material_transaction_count: rows.length,
        raw_material_total_deducted_g: rows.reduce((sum: number, row: any) => sum + Number(row.quantity_g || 0), 0),
        raw_material_transactions_verified: rows.length > 0,
      }
      if (!rows.length) throw new Error('생산확정 후 원재료 OUTBOUND 원장을 확인할 수 없습니다.')
    }

    result = {
      ...result,
      action_type: action,
      target_id: text(after.id, 60),
      before: publicRecord(before),
      after: publicRecord(after),
      verification,
      audit_logged: true,
    }

    const executedAt = await finishExecution({
      confirmation,
      before,
      after,
      result,
      identity,
      userConfirmationText,
    })
    return {
      confirmation_id: confirmationId,
      ...result,
      executed_at: executedAt,
      user_confirmation_text: userConfirmationText,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '생산 업무 실행에 실패했습니다.'
    await markFailed(confirmationId, message)
    throw error
  }
}
