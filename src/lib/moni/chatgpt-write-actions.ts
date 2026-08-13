import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'
import { MONI_BUSINESS_ID } from '@/lib/moni/mcp/config'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { kgToGrams } from '@/lib/moni/v1-contracts'

export type ProductionPlanActionType = 'CREATE' | 'UPDATE' | 'DELETE'

type PrepareProductionPlanInput = {
  action?: unknown
  plan_id?: unknown
  plan_date?: unknown
  product_id?: unknown
  planned_quantity_kg?: unknown
  note?: unknown
  reason?: unknown
}

type ExecuteProductionPlanInput = {
  confirmation_id?: unknown
  user_confirmation_text?: unknown
}

const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : ''
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 60))
const formatKg = (grams: unknown) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format((Number(grams) || 0) / 1000)}kg`

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalizedAction(value: unknown): ProductionPlanActionType | null {
  const action = text(value, 20).toUpperCase()
  if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') return action
  return null
}

function publicPlan(row: any) {
  if (!row) return null
  return {
    id: text(row.id, 60),
    plan_date: text(row.plan_date, 10),
    product_id: text(row.product_id, 100),
    product_name: text(row.product_name, 300),
    planned_quantity_g: Number(row.planned_quantity_g || 0),
    planned_quantity_kg: Number(row.planned_quantity_g || 0) / 1000,
    note: row.note == null ? null : text(row.note, 1000),
    business_id: text(row.business_id, 100),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }
}

async function historicalQuantityGuard(productId: string) {
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('production_records')
    .select('actual_quantity_g,planned_quantity_g,work_date,status')
    .eq('business_id', MONI_BUSINESS_ID)
    .eq('product_id', productId)
    .in('status', ['완료', 'completed'])
    .order('work_date', { ascending: false })
    .limit(20)
  if (error) throw new Error(`생산 이력 안전검증 실패: ${error.message}`)

  const grams = (data ?? [])
    .map((row: any) => Number(row.actual_quantity_g || row.planned_quantity_g || 0))
    .filter((value: number) => Number.isFinite(value) && value > 0)
  const medianG = median(grams)
  const medianKg = medianG / 1000
  const hardLimitKg = medianKg > 0 ? Math.max(5_000, medianKg * 50) : 10_000
  const warningLimitKg = medianKg > 0 ? Math.max(2_000, medianKg * 5) : 5_000
  return { history_count: grams.length, median_quantity_kg: medianKg, hard_limit_kg: hardLimitKg, warning_limit_kg: warningLimitKg }
}

function buildPreview(action: ProductionPlanActionType, before: any, proposed: any) {
  if (action === 'CREATE') {
    return `[생산계획 등록] ${proposed.plan_date} / ${proposed.product_name} / ${formatKg(proposed.planned_quantity_g)}${proposed.note ? ` / 비고: ${proposed.note}` : ''}`
  }
  if (action === 'UPDATE') {
    return `[생산계획 수정] ${before.plan_date} ${before.product_name} ${formatKg(before.planned_quantity_g)} → ${proposed.plan_date} ${proposed.product_name} ${formatKg(proposed.planned_quantity_g)}${proposed.note ? ` / 비고: ${proposed.note}` : ''}`
  }
  return `[생산계획 삭제] ${before.plan_date} / ${before.product_name} / ${formatKg(before.planned_quantity_g)}${before.note ? ` / 비고: ${before.note}` : ''}`
}

export async function prepareProductionPlanChange(input: PrepareProductionPlanInput, identity: MoniMcpIdentity) {
  const action = normalizedAction(input.action)
  if (!action) throw new Error('action은 CREATE, UPDATE, DELETE 중 하나여야 합니다.')

  const supabase = createMoniServiceRoleClient()
  const planId = text(input.plan_id, 60)
  let before: any = null

  if (action !== 'CREATE') {
    if (!uuidLike(planId)) throw new Error('수정·삭제에는 유효한 plan_id가 필요합니다.')
    const { data, error } = await supabase
      .from('monthly_production_plans')
      .select('*')
      .eq('id', planId)
      .eq('business_id', MONI_BUSINESS_ID)
      .maybeSingle()
    if (error) throw new Error(`기존 생산계획 조회 실패: ${error.message}`)
    if (!data) throw new Error('해당 생산계획을 찾을 수 없습니다.')
    before = data
  }

  let payload: Record<string, unknown> = {}
  let proposed: any = null
  const warnings: string[] = []

  if (action === 'DELETE') {
    payload = { target_id: planId, business_id: MONI_BUSINESS_ID }
  } else {
    const planDate = validDate(input.plan_date) || text(before?.plan_date, 10)
    const productId = text(input.product_id, 100) || text(before?.product_id, 100)
    const hasQuantity = input.planned_quantity_kg !== undefined && input.planned_quantity_kg !== null && text(input.planned_quantity_kg, 100) !== ''
    const quantityKg = hasQuantity ? number(input.planned_quantity_kg) : Number(before?.planned_quantity_g || 0) / 1000
    const note = Object.prototype.hasOwnProperty.call(input, 'note')
      ? (text(input.note, 1000) || null)
      : (before?.note ?? null)

    if (!planDate) throw new Error('생산일 plan_date가 필요합니다.')
    if (!productId) throw new Error('제품 product_id가 필요합니다.')
    if (quantityKg === null || quantityKg <= 0) throw new Error('planned_quantity_kg는 0보다 커야 합니다.')

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id,product_name,business_id,is_active')
      .eq('id', productId)
      .eq('business_id', MONI_BUSINESS_ID)
      .eq('is_active', true)
      .maybeSingle()
    if (productError) throw new Error(`제품 검증 실패: ${productError.message}`)
    if (!product) throw new Error('두배의 활성 제품 목록에서 해당 product_id를 찾을 수 없습니다.')

    const guard = await historicalQuantityGuard(productId)
    if (quantityKg > guard.hard_limit_kg) {
      const basis = guard.history_count
        ? `최근 완료 생산 중앙값 ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(guard.median_quantity_kg)}kg`
        : '완료 생산 이력 없음'
      throw new Error(`생산량 ${new Intl.NumberFormat('ko-KR').format(quantityKg)}kg은 안전 한도 ${new Intl.NumberFormat('ko-KR').format(Math.round(guard.hard_limit_kg))}kg을 초과합니다. 단위 오입력 가능성이 있어 차단했습니다. (${basis})`)
    }
    if (quantityKg > guard.warning_limit_kg) {
      warnings.push(`통상 생산량보다 큰 계획입니다. 입력 ${new Intl.NumberFormat('ko-KR').format(quantityKg)}kg / 안전 참고치 ${new Intl.NumberFormat('ko-KR').format(Math.round(guard.warning_limit_kg))}kg`)
    }

    const plannedQuantityG = kgToGrams(quantityKg)
    if (!Number.isSafeInteger(plannedQuantityG) || plannedQuantityG <= 0) throw new Error('생산량 단위 변환 결과가 안전하지 않습니다.')

    let duplicateQuery = supabase
      .from('monthly_production_plans')
      .select('id,plan_date,product_id,product_name,planned_quantity_g')
      .eq('business_id', MONI_BUSINESS_ID)
      .eq('plan_date', planDate)
      .eq('product_id', productId)
    if (action === 'UPDATE' && planId) duplicateQuery = duplicateQuery.neq('id', planId)
    const { data: duplicates, error: duplicateError } = await duplicateQuery.limit(5)
    if (duplicateError) throw new Error(`중복 생산계획 확인 실패: ${duplicateError.message}`)
    if ((duplicates ?? []).length) warnings.push('같은 날짜·같은 제품의 다른 생산계획이 이미 존재합니다.')

    payload = {
      plan_date: planDate,
      product_id: product.id,
      product_name: product.product_name,
      planned_quantity_g: plannedQuantityG,
      note,
      business_id: MONI_BUSINESS_ID,
      reason: text(input.reason, 1000) || null,
    }
    proposed = {
      id: action === 'UPDATE' ? planId : null,
      plan_date: planDate,
      product_id: product.id,
      product_name: product.product_name,
      planned_quantity_g: plannedQuantityG,
      planned_quantity_kg: plannedQuantityG / 1000,
      note,
      business_id: MONI_BUSINESS_ID,
    }
  }

  const beforePublic = publicPlan(before)
  const previewText = buildPreview(action, beforePublic, proposed)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { data: confirmation, error: confirmationError } = await supabase
    .from('moni_action_confirmations')
    .insert({
      business_id: MONI_BUSINESS_ID,
      action_domain: 'production_plan',
      action_type: action,
      target_id: action === 'CREATE' ? null : planId,
      payload,
      before_snapshot: before ? before : null,
      preview_text: previewText,
      warnings,
      status: 'PENDING',
      requested_by_login_id: identity.loginId,
      requested_by_role: identity.role,
      source_client_id: identity.clientId,
      expires_at: expiresAt,
    })
    .select('id,expires_at,status')
    .single()
  if (confirmationError) throw new Error(`실행 승인 건 생성 실패: ${confirmationError.message}`)

  return {
    confirmation_id: confirmation.id,
    status: confirmation.status,
    action_domain: 'production_plan',
    action_type: action,
    requires_user_confirmation: true,
    expires_at: confirmation.expires_at,
    before: beforePublic,
    proposed,
    warnings,
    preview_text: previewText,
    unit_contract: 'planned_quantity_kg 입력을 서버에서 정확히 한 번만 ×1000 하여 planned_quantity_g로 저장합니다.',
    next_step: '이 미리보기를 사용자에게 보여준 뒤, 반드시 다음 사용자 메시지에서 명시적 승인을 받은 경우에만 execute_production_plan_change를 호출하세요.',
  }
}

export async function executeProductionPlanChange(input: ExecuteProductionPlanInput, identity: MoniMcpIdentity) {
  const confirmationId = text(input.confirmation_id, 60)
  const userConfirmationText = text(input.user_confirmation_text, 500)
  if (!uuidLike(confirmationId)) throw new Error('유효한 confirmation_id가 필요합니다.')
  if (!userConfirmationText) throw new Error('사용자의 명시적 승인 문구가 필요합니다.')

  const supabase = createMoniServiceRoleClient()
  const { data: confirmation, error: confirmationError } = await supabase
    .from('moni_action_confirmations')
    .select('id,business_id,action_domain,action_type,status,source_client_id,requested_by_login_id,expires_at,preview_text')
    .eq('id', confirmationId)
    .eq('business_id', MONI_BUSINESS_ID)
    .maybeSingle()
  if (confirmationError) throw new Error(`승인 건 조회 실패: ${confirmationError.message}`)
  if (!confirmation) throw new Error('승인 건을 찾을 수 없습니다.')
  if (confirmation.action_domain !== 'production_plan') throw new Error('생산계획 승인 건이 아닙니다.')
  if (confirmation.source_client_id !== identity.clientId || confirmation.requested_by_login_id !== identity.loginId) {
    throw new Error('승인 건의 요청 주체가 현재 실행 주체와 일치하지 않습니다.')
  }

  const { data, error } = await supabase.rpc('moni_execute_production_plan_action', {
    p_confirmation_id: confirmationId,
    p_user_confirmation_text: userConfirmationText,
  })
  if (error) throw new Error(`생산계획 실행 실패: ${error.message}`)
  const result = data as any
  if (!result?.ok) throw new Error(result?.message || result?.error || '생산계획 실행에 실패했습니다.')

  const targetId = text(result.target_id, 60)
  let verification: Record<string, unknown>
  if (result.action_type === 'DELETE') {
    const { data: row, error: verifyError } = await supabase
      .from('monthly_production_plans')
      .select('id')
      .eq('id', targetId)
      .maybeSingle()
    if (verifyError) throw new Error(`삭제 결과 검증 실패: ${verifyError.message}`)
    verification = { verified: row == null, target_exists: row != null }
  } else {
    const { data: row, error: verifyError } = await supabase
      .from('monthly_production_plans')
      .select('*')
      .eq('id', targetId)
      .eq('business_id', MONI_BUSINESS_ID)
      .maybeSingle()
    if (verifyError) throw new Error(`저장 결과 검증 실패: ${verifyError.message}`)
    verification = { verified: Boolean(row), saved_plan: publicPlan(row) }
  }

  return {
    confirmation_id: confirmationId,
    action_type: result.action_type,
    target_id: targetId,
    before: publicPlan(result.before),
    after: publicPlan(result.after),
    verification,
    audit_logged: true,
    executed_at: result.executed_at,
    user_confirmation_text: userConfirmationText,
  }
}
