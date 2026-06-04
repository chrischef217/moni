'use client'

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import AllowanceModule, {
  EMPTY_COMPANY_INFO,
  type AllowanceTabKey,
  type CompanyInfo,
} from '@/components/AllowanceModule'
import ComplianceMonitor from '@/components/ComplianceMonitor'
import type { AllowanceSessionUser } from '@/types/allowance'

type MainMenuKey = 'ai-chat' | 'production' | 'accounting' | 'sales' | 'admin' | 'audit'
type ProductionSubTabKey =
  | 'prod-overview'
  | 'prod-work'
  | 'prod-recipes'
  | 'prod-recipe-mapping'
  | 'prod-materials'
  | 'prod-packaging'
  | 'prod-sanitation'
  | 'prod-quality'
  | 'prod-compliance'
type ChatRole = 'user' | 'assistant'
type ValidationLevel = 'idle' | 'success' | 'warning' | 'error'

type MenuItem = {
  key: MainMenuKey
  label: string
}

type SubMenuItem = {
  key: ProductionSubTabKey
  label: string
}

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  timestamp: string
  pending?: boolean
}

type Conversation = {
  id: string
  title: string
  createdAt: string
  messages: ChatMessage[]
}

type ProductionOverviewPayload = {
  ok?: boolean
  error?: string
  sourceTable?: string
  today?: {
    products?: string[]
    totalQuantity?: number
    statusCounts?: {
      completed?: number
      inProgress?: number
      scheduled?: number
    }
  }
}

type ProductOption = {
  id: string
  product_name: string
  product_type?: string | null
  report_number?: string | null
  product_spec?: string | null
  weight_g?: number | null
  storage_type?: string | null
  shelf_life_days?: number | null
  shelf_life_standard?: string | null
  packaging_material?: string | null
  lot_rule?: string | null
  allergens?: string | null
}

type ProductionRecord = {
  id: string
  lot_number: string
  work_date: string
  product_id: string | null
  product_name: string
  production_unit_id?: string | null
  production_unit_name?: string | null
  production_unit_weight_g?: number | null
  planned_quantity_ea?: number | null
  planned_remainder_g?: number | null
  actual_quantity_ea?: number | null
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

type ProductionRecordsPayload = {
  ok?: boolean
  error?: string
  records?: ProductionRecord[]
  products?: ProductOption[]
}

type ProductionUnit = {
  id: string
  product_id: string
  unit_name: string
  unit_weight_g: number | null
  is_default?: boolean
  sort_order?: number
}

type ProductionUnitsPayload = {
  ok?: boolean
  error?: string
  warning?: string
  units?: ProductionUnit[]
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

type ProductionActionPayload = {
  ok?: boolean
  error?: string
  record?: ProductionRecord
  preview?: {
    materials?: DeductionPreviewRow[]
    total_required_g?: number
    has_insufficient?: boolean
    has_missing_mapping?: boolean
    deduction_basis_g?: number
    entered_quantity_g?: number
    loss_quantity_g?: number
    planned_quantity_g?: number | null
  }
  deduction?: {
    materials?: DeductionPreviewRow[]
    total_required_g?: number
    deduction_basis_g?: number
    entered_quantity_g?: number
    loss_quantity_g?: number
    planned_quantity_g?: number | null
  }
}

type DeductionPreviewSummary = {
  deduction_basis_g: number
  entered_quantity_g: number
  loss_quantity_g: number
  planned_quantity_g: number | null
}

type FoodType = {
  id: string
  type_name: string
}

type RawMaterialMapping = {
  id: string
  food_type_id: string
  recipe_id?: string | null
  product_id?: string | null
  product_name?: string | null
  mapping_scope?: 'recipe' | 'product' | 'global' | null
  is_default?: boolean | null
  raw_material_id?: string | number | null
  raw_material_name: string
  packing_unit?: string | null
  packing_weight_g?: number | null
}

type RecipeMaterialMappingRow = {
  recipe_id: string
  product_id: string
  product_name: string
  recipe_item_name: string
  food_type_id: string
  food_type_name: string
  ratio_percent: number
  current_raw_material_name: string | null
  mapping_status: 'mapped' | 'unmapped' | 'name_fallback' | 'needs_review'
  applied_scope: 'recipe' | 'product' | 'global' | 'fallback' | null
  mapping_id: string | null
  is_broad: boolean
}

type RecipeMaterialMappingsPayload = {
  ok?: boolean
  error?: string
  rows?: RecipeMaterialMappingRow[]
  rawMaterials?: Array<{ id: string; item_name: string }>
}

type RecipeMappingHistoryItem = {
  id: string
  action_type: 'set_default'
  mapping_scope: 'recipe' | 'product' | 'global'
  recipe_id?: string | null
  product_id?: string | null
  product_name?: string | null
  food_type_id?: string | null
  new_mapping_id?: string | null
  previous_default_mapping_ids?: string[]
  raw_material_name: string
  recipe_item_name?: string | null
  food_type_name?: string | null
  actor_id?: string | null
  actor_name?: string | null
  created_at: string
}

type RecipeMappingHistoryPayload = {
  ok?: boolean
  error?: string
  warning?: string
  history?: RecipeMappingHistoryItem | null
  nextHistory?: RecipeMappingHistoryItem | null
}

type RecipeRow = {
  id: string
  product_id: string
  product_name: string
  food_type_id: string
  food_type_name: string
  ratio_percent: number
  sort_order: number
  ingredient_type?: string | null
  semi_product_id?: string | null
}

type RecipesPayload = {
  ok?: boolean
  error?: string
  recipes?: RecipeRow[]
  mappings?: RawMaterialMapping[]
  products?: ProductOption[]
  rawMaterials?: RawMaterialRow[]
}

type FoodTypesPayload = {
  ok?: boolean
  error?: string
  foodTypes?: FoodType[]
}

type RawMaterialRow = {
  id: string
  item_name: string
  food_type_name?: string | null
  food_type?: string | null
  country_of_origin?: string | null
  spec?: string | null
  storage_type?: string | null
  shelf_life_days?: number | null
  current_stock_g?: number | null
  packing_unit?: string | null
  packing_weight_g?: number | null
  supplier?: string | null
  supplier_contact?: string | null
  supplier_address?: string | null
  supplier_biz_number?: string | null
  is_active?: boolean | null
}

type MaterialSummary = {
  total: number
  active: number
  inactive: number
}

type RawMaterialsPayload = {
  ok?: boolean
  error?: string
  materials?: RawMaterialRow[]
  summary?: Partial<MaterialSummary>
}

type SububuRow = {
  food_type_name: string
  total_usage_g: number
  usage_count: number
  products_used: string[]
}

type PackagingMaterialRow = {
  id: string
  material_name: string
  material_code?: string | null
  spec?: string | null
  material_type?: string | null
  supplier?: string | null
  current_stock?: number | null
  unit_price?: number | null
  is_active?: boolean | null
}

type PackagingMaterialsPayload = {
  ok?: boolean
  error?: string
  materials?: PackagingMaterialRow[]
  material?: PackagingMaterialRow
  summary?: Partial<MaterialSummary>
}

type PackagingFormState = {
  id?: string
  material_name: string
  material_code: string
  spec: string
  material_type: string
  supplier: string
  current_stock: string
  unit_price: string
  is_active: boolean
}

type RawMaterialTransactionRow = {
  id: string
  tx_date: string
  tx_type: string
  counterparty: string
  inbound_g: number
  outbound_g: number
  balance_g: number
  note: string
}

type RawMaterialTransactionsPayload = {
  ok?: boolean
  error?: string
  material_name?: string
  balance_mode?: string
  rows?: RawMaterialTransactionRow[]
}

type SububuPayload = {
  ok?: boolean
  error?: string
  period?: {
    from?: string
    to?: string
  }
  materials?: SububuRow[]
  total_production_g?: number
}

type SanitationLog = {
  id: string
  check_date: string
  checker_name: string
  workplace_clean?: boolean | null
  workplace_note?: string | null
  worker_hygiene?: boolean | null
  worker_note?: string | null
  material_storage?: boolean | null
  material_note?: string | null
  equipment_clean?: boolean | null
  equipment_note?: string | null
  pest_control?: boolean | null
  pest_note?: string | null
  water_hygiene?: boolean | null
  water_note?: string | null
  overall_result?: string | null
  action_taken?: string | null
}

type SanitationPayload = {
  ok?: boolean
  error?: string
  logs?: SanitationLog[]
}

type FieldValidation = {
  level: ValidationLevel
  valid: boolean
  message: string
  suggestion: string | null
  loading: boolean
}

type ValidationPayload = {
  ok?: boolean
  error?: string
  valid?: boolean
  level?: ValidationLevel
  message?: string
  suggestion?: string | null
}

type UploadResult = {
  success: number
  skipped: number
  errors: string[]
}

type ProductionFormState = {
  work_date: string
  product_id: string
  product_name: string
  planned_quantity_g: string
  actual_quantity_g: string
  worker_name: string
  start_time: string
  end_time: string
  status: string
  inspection_result: string
  sanitation_check: boolean
  note: string
}

type WorkOrderFormState = {
  product_id: string
  production_unit_id: string
  planned_quantity_kg: string
}

type ProductionUnitFormState = {
  unit_name: string
  unit_weight_g: string
  is_default: boolean
}

type CompletionFormState = {
  record_id: string
  actual_input_unit: 'ea' | 'kg' | 'g'
  actual_input_value: string
  defect_input_unit: 'kg' | 'g'
  defect_input_value: string
  sample_input_unit: 'kg' | 'g'
  sample_input_value: string
  input_unit: 'ea' | 'kg' | 'g'
  actual_quantity_ea: string
  defect_quantity_ea: string
  sample_quantity_ea: string
  actual_quantity_kg: string
  defect_quantity_kg: string
  sample_quantity_kg: string
  actual_quantity_g: string
  defect_quantity_g: string
  sample_quantity_g: string
}

type SampleInputRow = {
  id: string
  label: string
  value: string
  unit: 'kg' | 'g'
}

type RecipeFormState = {
  food_type_id: string
  custom_food_type_name: string
  ratio_percent: string
  raw_material_id: string
  custom_raw_material_name: string
  packing_unit: string
  packing_weight_g: string
  ingredient_type: string
  semi_product_id: string
}

type MaterialFormState = {
  item_name: string
  food_type: string
  country_of_origin: string
  spec: string
  storage_type: string
  shelf_life_days: string
  supplier: string
  supplier_contact: string
  supplier_address: string
  supplier_biz_number: string
}

type SanitationFormState = {
  check_date: string
  checker_name: string
  workplace_clean: boolean
  workplace_note: string
  worker_hygiene: boolean
  worker_note: string
  material_storage: boolean
  material_note: string
  equipment_clean: boolean
  equipment_note: string
  pest_control: boolean
  pest_note: string
  water_hygiene: boolean
  water_note: string
  overall_result: string
  action_taken: string
}

const MAIN_TABS: MenuItem[] = [
  { key: 'ai-chat', label: 'AI 채팅' },
  { key: 'production', label: '생산관리' },
  { key: 'accounting', label: '회계관리' },
  { key: 'sales', label: '영업관리' },
  { key: 'admin', label: '관리자' },
  { key: 'audit', label: '재무감사' },
]

const PRODUCTION_TABS: SubMenuItem[] = [
  { key: 'prod-overview', label: '생산 개요' },
  { key: 'prod-work', label: '작업 지시' },
  { key: 'prod-recipes', label: '레시피 관리' },
  { key: 'prod-materials', label: '원재료 관리' },
  { key: 'prod-packaging', label: '부재료 관리' },
  { key: 'prod-sanitation', label: '위생점검' },
  { key: 'prod-quality', label: '품질 관리' },
  { key: 'prod-compliance', label: '규정준수 모니터' },
]

PRODUCTION_TABS.splice(5, 0, { key: 'prod-recipe-mapping', label: '레시피 원재료 연결' })

const CHAT_EXAMPLES = [
  '오늘 생산 실적 요약해줘',
  '최근 제조기록서에서 이상 수치가 있는지 봐줘',
  '원재료 수불부에서 사용량이 큰 원료를 알려줘',
  '위생점검 준비 체크리스트를 만들어줘',
]

const EMPTY_VALIDATION: FieldValidation = {
  level: 'idle',
  valid: true,
  message: '',
  suggestion: null,
  loading: false,
}

const EMPTY_MATERIAL_SUMMARY: MaterialSummary = { total: 0, active: 0, inactive: 0 }

function uid() {
  return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function todayValue() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function daysAgoValue(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date)
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('ko-KR').format(Number(value ?? 0))
}

function formatKg(value: number | null | undefined) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value ?? 0) / 1000)
}

function toNumber(value: string) {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function kgToG(value: string) {
  const kg = toNumber(value)
  if (kg === null) return null
  return kg * 1000
}

function parseInteger(value: string) {
  const parsed = toNumber(value)
  if (parsed === null) return null
  if (!Number.isInteger(parsed)) return null
  return parsed
}

function quantityToGrams(valueText: string, unit: 'ea' | 'kg' | 'g', unitWeightG: number | null) {
  const value = toNumber(valueText)
  if (value === null) {
    return { value: null as number | null, grams: null as number | null, ea: null as number | null, invalidEa: false }
  }
  if (value < 0) {
    return { value, grams: null as number | null, ea: null as number | null, invalidEa: false }
  }

  if (unit === 'ea') {
    if (!Number.isInteger(value)) {
      return { value, grams: null as number | null, ea: null as number | null, invalidEa: true }
    }
    if (unitWeightG === null || unitWeightG <= 0) {
      return { value, grams: null as number | null, ea: value, invalidEa: false }
    }
    return { value, grams: value * unitWeightG, ea: value, invalidEa: false }
  }

  if (unit === 'kg') {
    const grams = value * 1000
    return {
      value,
      grams,
      ea: unitWeightG !== null && unitWeightG > 0 ? Math.floor(grams / unitWeightG) : null,
      invalidEa: false,
    }
  }

  return {
    value,
    grams: value,
    ea: unitWeightG !== null && unitWeightG > 0 ? Math.floor(value / unitWeightG) : null,
    invalidEa: false,
  }
}

function makeSampleRow(index: number, value = '', unit: 'kg' | 'g' = 'g'): SampleInputRow {
  return {
    id: `sample-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    label: `샘플 ${index + 1}`,
    value,
    unit,
  }
}

function normalizeSampleRows(rows: SampleInputRow[]): SampleInputRow[] {
  if (!rows.length) return [makeSampleRow(0)]
  return rows.map((row, index) => ({
    ...row,
    label: `샘플 ${index + 1}`,
  }))
}

function formatEaRemainder(ea: number | null | undefined, remainderG: number | null | undefined) {
  if (ea === null || ea === undefined) return '-'
  const remainder = Number(remainderG ?? 0)
  return `${formatNumber(ea)}ea + 잔량 ${formatNumber(remainder)}g`
}

function formatPlannedUnitForRecord(record: ProductionRecord) {
  const storedEa = Number(record.planned_quantity_ea ?? NaN)
  if (Number.isFinite(storedEa)) {
    return formatEaRemainder(storedEa, Number(record.planned_remainder_g ?? 0))
  }

  const plannedG = Number(record.planned_quantity_g ?? NaN)
  const unitWeightG = Number(record.production_unit_weight_g ?? NaN)
  if (!Number.isFinite(plannedG) || plannedG < 0 || !Number.isFinite(unitWeightG) || unitWeightG <= 0) {
    return null
  }

  const ea = Math.floor(plannedG / unitWeightG)
  const remainderG = plannedG - ea * unitWeightG
  return formatEaRemainder(ea, remainderG)
}

function normalizeStatusCode(status: string | null | undefined) {
  const raw = String(status ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw === 'planned' || raw === 'plan' || raw === 'scheduled' || raw === '예정') return 'planned'
  if (raw === 'completed' || raw === 'done' || raw === '완료') return 'completed'
  if (raw === 'confirmed' || raw === '확정') return 'confirmed'
  if (raw === 'cancelled' || raw === 'canceled' || raw === '취소') return 'cancelled'
  if (raw === 'in_progress' || raw === 'inprogress' || raw === '진행중') return 'in_progress'
  return raw
}

function titleFromMessage(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return '새 대화'
  return trimmed.length > 26 ? `${trimmed.slice(0, 26)}...` : trimmed
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return `${new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)} ${new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)}`
}

function normalizeStatus(status: string | null | undefined) {
  const raw = String(status ?? '').trim().toLowerCase()
  if (!raw) return '-'
  if (raw === 'completed' || raw === 'done' || raw === 'confirmed' || raw === '완료') return '완료'
  if (raw === 'cancelled' || raw === 'canceled' || raw === '취소') return '취소'
  if (raw === 'in_progress' || raw === 'inprogress' || raw === 'progress' || raw === '진행중') return '진행중'
  if (raw === 'scheduled' || raw === 'plan' || raw === '예정') return '예정'
  return String(status)
}

function normalizeInspection(result: string | null | undefined) {
  const raw = String(result ?? '').trim().toLowerCase()
  if (!raw) return '-'
  if (raw === 'pass' || raw === '적합') return '적합'
  if (raw === 'fail' || raw === '부적합') return '부적합'
  return String(result)
}

function validationTone(level: ValidationLevel) {
  if (level === 'success') return 'border-green-700/70 bg-green-950/60 text-green-200'
  if (level === 'warning') return 'border-amber-700/70 bg-amber-950/50 text-amber-200'
  if (level === 'error') return 'border-red-800/70 bg-red-950/50 text-red-200'
  return 'border-gray-700 bg-gray-900 text-gray-300'
}

function validationPrefix(level: ValidationLevel) {
  if (level === 'success') return '정상'
  if (level === 'warning') return '주의'
  if (level === 'error') return '오류'
  return ''
}

function messageToneClasses(tone: 'success' | 'error' | 'warning') {
  if (tone === 'success') return 'border-green-700/60 bg-green-950/40 text-green-200'
  if (tone === 'warning') return 'border-amber-700/60 bg-amber-950/40 text-amber-200'
  return 'border-red-800/60 bg-red-950/40 text-red-200'
}

function emptyProductionForm(): ProductionFormState {
  return {
    work_date: todayValue(),
    product_id: '',
    product_name: '',
    planned_quantity_g: '',
    actual_quantity_g: '',
    worker_name: '',
    start_time: '',
    end_time: '',
    status: '완료',
    inspection_result: '적합',
    sanitation_check: true,
    note: '',
  }
}

function emptyCompletionForm(hasProductionUnit = false): CompletionFormState {
  const inputUnit = hasProductionUnit ? 'ea' : 'kg'
  return {
    record_id: '',
    actual_input_unit: hasProductionUnit ? 'ea' : 'kg',
    actual_input_value: '',
    defect_input_unit: hasProductionUnit ? 'g' : 'kg',
    defect_input_value: '',
    sample_input_unit: hasProductionUnit ? 'g' : 'kg',
    sample_input_value: '',
    input_unit: inputUnit,
    actual_quantity_ea: '',
    defect_quantity_ea: '',
    sample_quantity_ea: '',
    actual_quantity_kg: '',
    defect_quantity_kg: '',
    sample_quantity_kg: '',
    actual_quantity_g: '',
    defect_quantity_g: '',
    sample_quantity_g: '',
  }
}

function emptyRecipeForm(): RecipeFormState {
  return {
    food_type_id: '',
    custom_food_type_name: '',
    ratio_percent: '',
    raw_material_id: '',
    custom_raw_material_name: '',
    packing_unit: '',
    packing_weight_g: '',
    ingredient_type: '원재료',
    semi_product_id: '',
  }
}

function emptyMaterialForm(material: RawMaterialRow | null): MaterialFormState {
  return {
    item_name: material?.item_name ?? '',
    food_type: material?.food_type ?? material?.food_type_name ?? '',
    country_of_origin: material?.country_of_origin ?? '',
    spec: material?.spec ?? '',
    storage_type: material?.storage_type ?? '',
    shelf_life_days: material?.shelf_life_days ? String(material.shelf_life_days) : '',
    supplier: material?.supplier ?? '',
    supplier_contact: material?.supplier_contact ?? '',
    supplier_address: material?.supplier_address ?? '',
    supplier_biz_number: material?.supplier_biz_number ?? '',
  }
}

function emptyPackagingForm(material?: PackagingMaterialRow | null): PackagingFormState {
  return {
    id: material?.id,
    material_name: material?.material_name ?? '',
    material_code: material?.material_code ?? '',
    spec: material?.spec ?? '',
    material_type: material?.material_type ?? '',
    supplier: material?.supplier ?? '',
    current_stock:
      material?.current_stock === null || material?.current_stock === undefined ? '' : String(material.current_stock),
    unit_price: material?.unit_price === null || material?.unit_price === undefined ? '' : String(material.unit_price),
    is_active: material?.is_active ?? true,
  }
}

function emptySanitationForm(): SanitationFormState {
  return {
    check_date: todayValue(),
    checker_name: '',
    workplace_clean: true,
    workplace_note: '',
    worker_hygiene: true,
    worker_note: '',
    material_storage: true,
    material_note: '',
    equipment_clean: true,
    equipment_note: '',
    pest_control: true,
    pest_note: '',
    water_hygiene: true,
    water_note: '',
    overall_result: '적합',
    action_taken: '',
  }
}

function emptyProductionUnitForm(): ProductionUnitFormState {
  return {
    unit_name: '',
    unit_weight_g: '',
    is_default: false,
  }
}

async function readJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok) {
    throw new Error(payload?.error || '요청을 처리하지 못했습니다.')
  }
  return payload as T
}

function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
      <div className="animate-pulse space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={`rounded-lg bg-gray-700/70 ${index === 0 ? 'h-5 w-40' : 'h-4 w-full'}`}
          />
        ))}
      </div>
    </div>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-800/50 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-2xl border border-gray-800 bg-gray-800/80 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.28)] ${
        className ?? ''
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block text-sm text-gray-300 ${className}`}>
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-white">{title}</h3>
            {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
          >
            닫기
          </button>
        </div>
        <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ValidationMessage({
  validation,
  onApply,
}: {
  validation: FieldValidation
  onApply?: (() => void) | null
}) {
  if (validation.level === 'idle' && !validation.loading) return null
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${validationTone(validation.level)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {validation.loading
            ? '검증 중...'
            : `${validationPrefix(validation.level)} ${validation.message}`.trim()}
        </span>
        {!validation.loading && validation.suggestion && onApply ? (
          <button
            type="button"
            onClick={onApply}
            className="rounded-md border border-current px-2 py-0.5 font-semibold"
          >
            제안값 적용
          </button>
        ) : null}
      </div>
    </div>
  )
}

type DashboardTableProps = {
  records: ProductionRecord[]
  onOpenDetail: (record: ProductionRecord) => void
  onOpenPdf: (url: string) => void
}

function ProductionRecordTable({ records, onOpenDetail, onOpenPdf }: DashboardTableProps) {
  if (records.length === 0) {
    return (
      <EmptyState
        title="표시할 생산 기록이 없습니다"
        description="조회 기간을 조정하거나 빠른 실적 입력으로 새 제조기록서를 등록해 주세요."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-gray-400">
          <tr className="border-b border-gray-700">
            <th className="px-3 py-2 font-medium">제조번호</th>
            <th className="px-3 py-2 font-medium">날짜</th>
            <th className="px-3 py-2 font-medium">제품명</th>
            <th className="px-3 py-2 font-medium">생산수량(g)</th>
            <th className="px-3 py-2 font-medium">검사결과</th>
            <th className="px-3 py-2 font-medium">상태</th>
            <th className="px-3 py-2 font-medium">상세보기</th>
            <th className="px-3 py-2 font-medium">PDF출력</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              className="border-b border-gray-800/80 transition hover:bg-gray-700/20"
            >
              <td className="px-3 py-3 font-mono text-gray-300">{record.lot_number || '-'}</td>
              <td className="px-3 py-3 text-gray-200">{record.work_date || '-'}</td>
              <td className="px-3 py-3 text-white">{record.product_name || '-'}</td>
              <td className="px-3 py-3 text-green-400">{formatNumber(record.actual_quantity_g)}g</td>
              <td className="px-3 py-3 text-gray-200">{normalizeInspection(record.inspection_result)}</td>
              <td className="px-3 py-3 text-gray-200">{normalizeStatus(record.status)}</td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => onOpenDetail(record)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                >
                  상세보기
                </button>
              </td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => onOpenPdf(`/api/moni/production-records/${record.id}/pdf`)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                >
                  PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type AdminDashboardProps = {
  session: AllowanceSessionUser
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  const router = useRouter()
  const [mainMenu, setMainMenu] = useState<MainMenuKey>('ai-chat')
  const [productionTab, setProductionTab] = useState<ProductionSubTabKey>('prod-overview')
  const [allowanceTab, setAllowanceTab] = useState<AllowanceTabKey>('client-product')
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(EMPTY_COMPANY_INFO)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [composer, setComposer] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [isChatExpanded, setIsChatExpanded] = useState(false)

  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')
  const [overviewSourceTable, setOverviewSourceTable] = useState('')
  const [todayProducts, setTodayProducts] = useState<string[]>([])
  const [todayTotalQuantity, setTodayTotalQuantity] = useState(0)
  const [todayStatusCounts, setTodayStatusCounts] = useState({
    completed: 0,
    inProgress: 0,
    scheduled: 0,
  })

  const [productionDateFrom, setProductionDateFrom] = useState(daysAgoValue(29))
  const [productionDateTo, setProductionDateTo] = useState(todayValue())
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState('')
  const [records, setRecords] = useState<ProductionRecord[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])

  const [selectedRecord, setSelectedRecord] = useState<ProductionRecord | null>(null)
  const [showProductionModal, setShowProductionModal] = useState(false)
  const [productionForm, setProductionForm] = useState<ProductionFormState>(emptyProductionForm())
  const [productionSaving, setProductionSaving] = useState(false)
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderFormState>({
    product_id: '',
    production_unit_id: '',
    planned_quantity_kg: '',
  })
  const [productionUnitsLoading, setProductionUnitsLoading] = useState(false)
  const [productionUnits, setProductionUnits] = useState<ProductionUnit[]>([])
  const [showProductionUnitManager, setShowProductionUnitManager] = useState(false)
  const [productionUnitForm, setProductionUnitForm] = useState<ProductionUnitFormState>(emptyProductionUnitForm())
  const [editingProductionUnitId, setEditingProductionUnitId] = useState<string | null>(null)
  const [productionUnitSaving, setProductionUnitSaving] = useState(false)
  const [productionUnitMessage, setProductionUnitMessage] = useState<{
    tone: 'success' | 'error' | 'warning'
    text: string
  } | null>(null)
  const [completionForm, setCompletionForm] = useState<CompletionFormState>(emptyCompletionForm())
  const [sampleInputRows, setSampleInputRows] = useState<SampleInputRow[]>([makeSampleRow(0)])
  const [showCompletionModal, setShowCompletionModal] = useState(false)
  const [completionTargetRecord, setCompletionTargetRecord] = useState<ProductionRecord | null>(null)
  const [showPlannedEditModal, setShowPlannedEditModal] = useState(false)
  const [plannedEditRecord, setPlannedEditRecord] = useState<ProductionRecord | null>(null)
  const [plannedEditKg, setPlannedEditKg] = useState('')
  const [productionActionBusy, setProductionActionBusy] = useState(false)
  const [productionActionMessage, setProductionActionMessage] = useState<{
    tone: 'success' | 'error' | 'warning'
    text: string
  } | null>(null)
  const [deductionPreviewRows, setDeductionPreviewRows] = useState<DeductionPreviewRow[]>([])
  const [deductionPreviewSummary, setDeductionPreviewSummary] = useState<DeductionPreviewSummary | null>(null)
  const [deductionPreviewRecordId, setDeductionPreviewRecordId] = useState<string | null>(null)
  const [showDeductionModal, setShowDeductionModal] = useState(false)
  const [deductionModalRecord, setDeductionModalRecord] = useState<ProductionRecord | null>(null)
  const [deductionModalLoading, setDeductionModalLoading] = useState(false)
  const [deductionModalError, setDeductionModalError] = useState('')
  const [productionProductValidation, setProductionProductValidation] = useState<FieldValidation>(EMPTY_VALIDATION)
  const [productionQuantityValidation, setProductionQuantityValidation] = useState<FieldValidation>(EMPTY_VALIDATION)
  const [productionDateValidation, setProductionDateValidation] = useState<FieldValidation>(EMPTY_VALIDATION)

  const [selectedRecipeProductId, setSelectedRecipeProductId] = useState('')
  const [recipesLoading, setRecipesLoading] = useState(true)
  const [recipesError, setRecipesError] = useState('')
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [recipeMappings, setRecipeMappings] = useState<RawMaterialMapping[]>([])
  const [recipeProducts, setRecipeProducts] = useState<ProductOption[]>([])
  const [recipeRawMaterials, setRecipeRawMaterials] = useState<RawMaterialRow[]>([])
  const [foodTypes, setFoodTypes] = useState<FoodType[]>([])
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(emptyRecipeForm())
  const [recipeSaving, setRecipeSaving] = useState(false)
  const [recipeRawMaterialValidation, setRecipeRawMaterialValidation] = useState<FieldValidation>(EMPTY_VALIDATION)
  const [recipeMappingRows, setRecipeMappingRows] = useState<RecipeMaterialMappingRow[]>([])
  const [recipeMappingLoading, setRecipeMappingLoading] = useState(false)
  const [recipeMappingError, setRecipeMappingError] = useState('')
  const [recipeMappingRawMaterials, setRecipeMappingRawMaterials] = useState<Array<{ id: string; item_name: string }>>([])
  const [recipeMappingProductQuery, setRecipeMappingProductQuery] = useState('')
  const [recipeMappingItemQuery, setRecipeMappingItemQuery] = useState('')
  const [recipeMappingStatusFilter, setRecipeMappingStatusFilter] = useState<
    'all' | 'pending' | 'mapped' | 'unmapped' | 'name_fallback' | 'needs_review'
  >('pending')
  const [recipeMappingScopeFilter, setRecipeMappingScopeFilter] = useState<'all' | 'recipe' | 'product' | 'global' | 'fallback'>('all')
  const [recipeMappingBroadOnly, setRecipeMappingBroadOnly] = useState(false)
  const [recipeMappingLatestHistory, setRecipeMappingLatestHistory] = useState<RecipeMappingHistoryItem | null>(null)
  const [recipeMappingHistoryLoading, setRecipeMappingHistoryLoading] = useState(false)
  const [recipeMappingHistoryWarning, setRecipeMappingHistoryWarning] = useState('')
  const [recipeMappingUndoing, setRecipeMappingUndoing] = useState(false)
  const [showRecipeMappingModal, setShowRecipeMappingModal] = useState(false)
  const [selectedRecipeMappingRow, setSelectedRecipeMappingRow] = useState<RecipeMaterialMappingRow | null>(null)
  const [recipeMappingSelectedMaterial, setRecipeMappingSelectedMaterial] = useState('')
  const [recipeMappingMaterialQuery, setRecipeMappingMaterialQuery] = useState('')
  const [recipeMappingCandidateOpen, setRecipeMappingCandidateOpen] = useState(false)
  const [recipeMappingHighlightIndex, setRecipeMappingHighlightIndex] = useState(-1)
  const [recipeMappingSelectedScope, setRecipeMappingSelectedScope] = useState<'recipe' | 'product' | 'global'>('recipe')
  const [recipeMappingSaving, setRecipeMappingSaving] = useState(false)
  const [recipeMappingMessage, setRecipeMappingMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)

  const [materialsLoading, setMaterialsLoading] = useState(true)
  const [materialsError, setMaterialsError] = useState('')
  const [materials, setMaterials] = useState<RawMaterialRow[]>([])
  const [materialsView, setMaterialsView] = useState<'active' | 'inactive'>('active')
  const [materialsSummary, setMaterialsSummary] = useState<MaterialSummary>(EMPTY_MATERIAL_SUMMARY)
  const [selectedMaterial, setSelectedMaterial] = useState<RawMaterialRow | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(emptyMaterialForm(null))
  const [materialSaving, setMaterialSaving] = useState(false)
  const [showMaterialUpload, setShowMaterialUpload] = useState(false)
  const [materialUploadBusy, setMaterialUploadBusy] = useState(false)
  const [materialUploadResult, setMaterialUploadResult] = useState<UploadResult | null>(null)

  const [sububuDateFrom, setSububuDateFrom] = useState(daysAgoValue(29))
  const [sububuDateTo, setSububuDateTo] = useState(todayValue())
  const [sububuLoading, setSububuLoading] = useState(true)
  const [sububuError, setSububuError] = useState('')
  const [sububuMaterials, setSububuMaterials] = useState<SububuRow[]>([])
  const [sububuTotalProductionG, setSububuTotalProductionG] = useState(0)
  const [sububuMaterialQuery, setSububuMaterialQuery] = useState('')
  const [showSububuDetailModal, setShowSububuDetailModal] = useState(false)
  const [sububuDetailTarget, setSububuDetailTarget] = useState('')
  const [sububuDetailFrom, setSububuDetailFrom] = useState(daysAgoValue(29))
  const [sububuDetailTo, setSububuDetailTo] = useState(todayValue())
  const [sububuDetailRows, setSububuDetailRows] = useState<RawMaterialTransactionRow[]>([])
  const [sububuDetailLoading, setSububuDetailLoading] = useState(false)
  const [sububuDetailError, setSububuDetailError] = useState('')
  const [sububuDetailBalanceMode, setSububuDetailBalanceMode] = useState('')

  const [packagingLoading, setPackagingLoading] = useState(true)
  const [packagingError, setPackagingError] = useState('')
  const [packagingMaterials, setPackagingMaterials] = useState<PackagingMaterialRow[]>([])
  const [packagingView, setPackagingView] = useState<'active' | 'inactive'>('active')
  const [packagingSummary, setPackagingSummary] = useState<MaterialSummary>(EMPTY_MATERIAL_SUMMARY)
  const [showPackagingModal, setShowPackagingModal] = useState(false)
  const [packagingForm, setPackagingForm] = useState<PackagingFormState>(emptyPackagingForm())
  const [packagingSaving, setPackagingSaving] = useState(false)

  const [sanitationDateFrom, setSanitationDateFrom] = useState(daysAgoValue(29))
  const [sanitationDateTo, setSanitationDateTo] = useState(todayValue())
  const [sanitationLoading, setSanitationLoading] = useState(true)
  const [sanitationError, setSanitationError] = useState('')
  const [sanitationLogs, setSanitationLogs] = useState<SanitationLog[]>([])
  const [selectedSanitationLog, setSelectedSanitationLog] = useState<SanitationLog | null>(null)
  const [showSanitationModal, setShowSanitationModal] = useState(false)
  const [sanitationForm, setSanitationForm] = useState<SanitationFormState>(emptySanitationForm())
  const [sanitationSaving, setSanitationSaving] = useState(false)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  )

  const selectedRecipeProduct = useMemo(
    () => recipeProducts.find((product) => String(product.id) === selectedRecipeProductId) ?? null,
    [recipeProducts, selectedRecipeProductId],
  )

  const selectedWorkOrderUnit = useMemo(
    () => productionUnits.find((unit) => String(unit.id) === workOrderForm.production_unit_id) ?? null,
    [productionUnits, workOrderForm.production_unit_id],
  )

  const workOrderUnitPreview = useMemo(() => {
    const plannedG = kgToG(workOrderForm.planned_quantity_kg)
    const unitWeightG = selectedWorkOrderUnit?.unit_weight_g ?? null
    if (plannedG === null || plannedG < 0 || unitWeightG === null || unitWeightG <= 0) {
      return null
    }

    const ea = Math.floor(plannedG / unitWeightG)
    const remainderG = plannedG - ea * unitWeightG
    return { plannedG, ea, remainderG }
  }, [selectedWorkOrderUnit?.unit_weight_g, workOrderForm.planned_quantity_kg])

  const canCreateWorkOrder = useMemo(() => {
    const plannedG = kgToG(workOrderForm.planned_quantity_kg)
    return (
      !!workOrderForm.product_id &&
      !!workOrderForm.production_unit_id &&
      productionUnits.length > 0 &&
      plannedG !== null &&
      plannedG > 0 &&
      !productionUnitsLoading &&
      !productionActionBusy
    )
  }, [
    productionActionBusy,
    productionUnits.length,
    productionUnitsLoading,
    workOrderForm.planned_quantity_kg,
    workOrderForm.product_id,
    workOrderForm.production_unit_id,
  ])

  const completionUnitWeightG = useMemo(() => {
    const parsed = toNumber(String(completionTargetRecord?.production_unit_weight_g ?? ''))
    if (parsed === null || parsed <= 0) return null
    return parsed
  }, [completionTargetRecord?.production_unit_weight_g])

  const sampleRowPreviews = useMemo(() => {
    return normalizeSampleRows(sampleInputRows).map((row) => {
      const converted = quantityToGrams(row.value, row.unit, completionUnitWeightG)
      return { ...row, ...converted }
    })
  }, [completionUnitWeightG, sampleInputRows])

  const sampleTotalG = useMemo(() => {
    return sampleRowPreviews.reduce((sum, row) => sum + (row.grams ?? 0), 0)
  }, [sampleRowPreviews])

  const completionPreview = useMemo(() => {
    const actual = quantityToGrams(
      completionForm.actual_input_value,
      completionForm.actual_input_unit,
      completionUnitWeightG,
    )
    const defect = quantityToGrams(
      completionForm.defect_input_value,
      completionForm.defect_input_unit,
      completionUnitWeightG,
    )
    const sample = {
      value: sampleTotalG,
      grams: sampleTotalG,
      ea: completionUnitWeightG !== null && completionUnitWeightG > 0 ? Math.floor(sampleTotalG / completionUnitWeightG) : null,
      invalidEa: false,
    }

    const actualG = actual.grams
    const defectG = defect.grams
    const sampleG = sampleTotalG
    const allReady = actualG !== null && defectG !== null && sampleG !== null
    const enteredTotalG = allReady ? actualG + defectG + sampleG : null
    const plannedG = completionTargetRecord?.planned_quantity_g ?? null
    const lossG = enteredTotalG !== null && plannedG !== null ? plannedG - enteredTotalG : null

    return {
      actual,
      defect,
      sample,
      unit: completionForm.input_unit,
      actualEa: actual.ea,
      defectEa: defect.ea,
      sampleEa: sample.ea,
      actualG,
      defectG,
      sampleG,
      enteredTotalG,
      plannedG,
      lossG,
      totalInput:
        completionForm.input_unit === 'ea'
          ? (actual.ea ?? 0) + (defect.ea ?? 0) + (sample.ea ?? 0)
          : completionForm.input_unit === 'kg'
            ? ((actualG ?? 0) + (defectG ?? 0) + (sampleG ?? 0)) / 1000
            : (actualG ?? 0) + (defectG ?? 0) + (sampleG ?? 0),
      exceedsPlanned: lossG !== null ? lossG < 0 : false,
      hasInvalidEa: actual.invalidEa,
      hasMissingUnitWeightForEa:
        completionUnitWeightG === null && completionForm.actual_input_unit === 'ea',
    }
  }, [
    completionForm.input_unit,
    completionForm.actual_input_unit,
    completionForm.actual_input_value,
    completionForm.defect_input_unit,
    completionForm.defect_input_value,
    completionTargetRecord?.planned_quantity_g,
    completionUnitWeightG,
    sampleTotalG,
  ])

  const recipeMappingsByFoodType = useMemo(() => {
    return recipeMappings.reduce((map, item) => {
      const list = map.get(String(item.food_type_id)) ?? []
      list.push(item)
      map.set(String(item.food_type_id), list)
      return map
    }, new Map<string, RawMaterialMapping[]>())
  }, [recipeMappings])

  const recipeMappingMaterialMatches = useMemo(() => {
    const query = recipeMappingMaterialQuery.trim().toLowerCase()
    if (!query) return recipeMappingRawMaterials
    return recipeMappingRawMaterials.filter((item) => item.item_name.toLowerCase().includes(query))
  }, [recipeMappingMaterialQuery, recipeMappingRawMaterials])

  const recipeMappingMaterialCandidates = useMemo(() => {
    return recipeMappingMaterialMatches.slice(0, 20)
  }, [recipeMappingMaterialMatches])

  const recipeRatioTotal = useMemo(() => {
    return recipes.reduce((sum, recipe) => sum + Number(recipe.ratio_percent ?? 0), 0)
  }, [recipes])

  const recipeRatioRoundedTotal = useMemo(() => {
    return Math.round(recipeRatioTotal * 100) / 100
  }, [recipeRatioTotal])

  const recipeRatioDiff = useMemo(() => {
    return Math.round((recipeRatioRoundedTotal - 100) * 100) / 100
  }, [recipeRatioRoundedTotal])

  const productionDefectQuantity = useMemo(() => {
    const planned = toNumber(productionForm.planned_quantity_g)
    const actual = toNumber(productionForm.actual_quantity_g)
    if (planned === null || actual === null) return 0
    return Math.max(planned - actual, 0)
  }, [productionForm.actual_quantity_g, productionForm.planned_quantity_g])

  const todayWorkOrders = useMemo(() => {
    const today = todayValue()
    return records.filter((record) => {
      if ((record.work_date || '').slice(0, 10) !== today) return false
      return normalizeStatusCode(record.status) !== 'cancelled'
    })
  }, [records])

  const chatPreviewMessages = useMemo(() => {
    return activeConversation?.messages.slice(-8) ?? []
  }, [activeConversation])

  const productionSaveBlocked =
    productionSaving ||
    productionProductValidation.level === 'error' ||
    productionQuantityValidation.level === 'error' ||
    productionDateValidation.level === 'error'

  useEffect(() => {
    if (mainMenu === 'accounting') setAllowanceTab('pay')
    if (mainMenu === 'sales') setAllowanceTab('client-product')
    if (mainMenu === 'admin') setAllowanceTab('settings')
  }, [mainMenu])

  useEffect(() => {
    void loadCompanyInfo()
    void loadOverview()
    void loadProductionRecords(daysAgoValue(29), todayValue())
    void loadRecipes()
    void loadFoodTypes()
    void loadMaterials('active')
    void loadPackagingMaterials('active')
    void loadSububu(daysAgoValue(29), todayValue())
    void loadSanitation(daysAgoValue(29), todayValue())
  }, [])

  useEffect(() => {
    if (!selectedRecipeProductId && recipeProducts.length > 0) {
      setSelectedRecipeProductId(String(recipeProducts[0].id))
    }
  }, [recipeProducts, selectedRecipeProductId])

  useEffect(() => {
    if (mainMenu !== 'production') return
    if (productionTab === 'prod-recipe-mapping') {
      void loadRecipeMaterialMappings()
      void loadLatestRecipeMappingHistory()
      return
    }
    if (productionTab === 'prod-materials') {
      void loadMaterials(materialsView)
      return
    }
    if (productionTab === 'prod-packaging') {
      void loadPackagingMaterials(packagingView)
    }
  }, [mainMenu, productionTab, materialsView, packagingView])

  useEffect(() => {
    if (!selectedRecipeProductId) return
    void loadRecipes(selectedRecipeProductId)
  }, [selectedRecipeProductId])

  useEffect(() => {
    const productId = workOrderForm.product_id
    if (!productId) {
      setProductionUnits([])
      setWorkOrderForm((prev) => ({ ...prev, production_unit_id: '' }))
      setShowProductionUnitManager(false)
      setEditingProductionUnitId(null)
      setProductionUnitForm(emptyProductionUnitForm())
      setProductionUnitMessage(null)
      return
    }
    void loadProductionUnits(productId)
  }, [workOrderForm.product_id])

  useEffect(() => {
    if (productionForm.product_id !== '__new__') {
      setProductionProductValidation(EMPTY_VALIDATION)
      return
    }

    const productName = productionForm.product_name.trim()
    if (!productName) {
      setProductionProductValidation(EMPTY_VALIDATION)
      return
    }

    const timer = window.setTimeout(async () => {
      setProductionProductValidation((prev) => ({ ...prev, loading: true }))
      try {
        const payload = await readJson<ValidationPayload>('/api/moni/validate', {
          method: 'POST',
          body: JSON.stringify({ field: 'product_name', value: productName }),
        })
        setProductionProductValidation({
          level: payload.level ?? 'idle',
          valid: payload.valid ?? true,
          message: payload.message ?? '',
          suggestion: payload.suggestion ?? null,
          loading: false,
        })
      } catch (error) {
        setProductionProductValidation({
          level: 'error',
          valid: false,
          message: error instanceof Error ? error.message : '제품명 검증에 실패했습니다.',
          suggestion: null,
          loading: false,
        })
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [productionForm.product_id, productionForm.product_name])

  useEffect(() => {
    const value = productionForm.actual_quantity_g.trim()
    if (!value) {
      setProductionQuantityValidation(EMPTY_VALIDATION)
      return
    }

    const timer = window.setTimeout(async () => {
      setProductionQuantityValidation((prev) => ({ ...prev, loading: true }))
      try {
        const payload = await readJson<ValidationPayload>('/api/moni/validate', {
          method: 'POST',
          body: JSON.stringify({ field: 'quantity_g', value }),
        })
        setProductionQuantityValidation({
          level: payload.level ?? 'idle',
          valid: payload.valid ?? true,
          message: payload.message ?? '',
          suggestion: payload.suggestion ?? null,
          loading: false,
        })
      } catch (error) {
        setProductionQuantityValidation({
          level: 'error',
          valid: false,
          message: error instanceof Error ? error.message : '수량 검증에 실패했습니다.',
          suggestion: null,
          loading: false,
        })
      }
    }, 200)

    return () => window.clearTimeout(timer)
  }, [productionForm.actual_quantity_g])

  useEffect(() => {
    const value = productionForm.work_date.trim()
    if (!value) {
      setProductionDateValidation(EMPTY_VALIDATION)
      return
    }

    const timer = window.setTimeout(async () => {
      setProductionDateValidation((prev) => ({ ...prev, loading: true }))
      try {
        const payload = await readJson<ValidationPayload>('/api/moni/validate', {
          method: 'POST',
          body: JSON.stringify({ field: 'work_date', value }),
        })
        setProductionDateValidation({
          level: payload.level ?? 'idle',
          valid: payload.valid ?? true,
          message: payload.message ?? '',
          suggestion: payload.suggestion ?? null,
          loading: false,
        })
      } catch (error) {
        setProductionDateValidation({
          level: 'error',
          valid: false,
          message: error instanceof Error ? error.message : '날짜 검증에 실패했습니다.',
          suggestion: null,
          loading: false,
        })
      }
    }, 200)

    return () => window.clearTimeout(timer)
  }, [productionForm.work_date])

  useEffect(() => {
    if (recipeForm.raw_material_id !== '__new__') {
      setRecipeRawMaterialValidation(EMPTY_VALIDATION)
      return
    }

    const value = recipeForm.custom_raw_material_name.trim()
    if (!value) {
      setRecipeRawMaterialValidation(EMPTY_VALIDATION)
      return
    }

    const timer = window.setTimeout(async () => {
      setRecipeRawMaterialValidation((prev) => ({ ...prev, loading: true }))
      try {
        const payload = await readJson<ValidationPayload>('/api/moni/validate', {
          method: 'POST',
          body: JSON.stringify({ field: 'raw_material_name', value }),
        })
        setRecipeRawMaterialValidation({
          level: payload.level ?? 'idle',
          valid: payload.valid ?? true,
          message: payload.message ?? '',
          suggestion: payload.suggestion ?? null,
          loading: false,
        })
      } catch (error) {
        setRecipeRawMaterialValidation({
          level: 'error',
          valid: false,
          message: error instanceof Error ? error.message : '원재료 검증에 실패했습니다.',
          suggestion: null,
          loading: false,
        })
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [recipeForm.custom_raw_material_name, recipeForm.raw_material_id])

  async function loadCompanyInfo() {
    try {
      const payload = await readJson<{ ok?: boolean; state?: { company?: CompanyInfo } }>('/api/allowance/admin/state')
      setCompanyInfo(payload.state?.company ?? EMPTY_COMPANY_INFO)
    } catch {
      setCompanyInfo(EMPTY_COMPANY_INFO)
    }
  }

  async function loadOverview() {
    setOverviewLoading(true)
    setOverviewError('')
    try {
      const payload = await readJson<ProductionOverviewPayload>('/api/moni/production-overview')
      setOverviewSourceTable(payload.sourceTable ?? '')
      setTodayProducts(payload.today?.products ?? [])
      setTodayTotalQuantity(Number(payload.today?.totalQuantity ?? 0))
      setTodayStatusCounts({
        completed: Number(payload.today?.statusCounts?.completed ?? 0),
        inProgress: Number(payload.today?.statusCounts?.inProgress ?? 0),
        scheduled: Number(payload.today?.statusCounts?.scheduled ?? 0),
      })
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : '생산 개요를 불러오지 못했습니다.')
    } finally {
      setOverviewLoading(false)
    }
  }

  async function loadProductionRecords(from: string, to: string) {
    setRecordsLoading(true)
    setRecordsError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('limit', '300')
      const payload = await readJson<ProductionRecordsPayload>(`/api/moni/production-records?${params.toString()}`)
      setRecords(payload.records ?? [])
      setProducts(payload.products ?? [])
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : '제조기록서를 불러오지 못했습니다.')
    } finally {
      setRecordsLoading(false)
    }
  }

  async function loadProductionUnits(productId: string, options?: { forceDefaultSelection?: boolean }) {
    if (!productId) {
      setProductionUnits([])
      return
    }

    setProductionUnitsLoading(true)
    try {
      const payload = await readJson<ProductionUnitsPayload>(
        `/api/moni/products/${encodeURIComponent(productId)}/production-units`,
      )
      const units = (payload.units ?? []).filter(
        (unit) => Number(unit.unit_weight_g ?? 0) > 0 && String(unit.id ?? '').trim().length > 0,
      )
      setProductionUnits(units)

      setWorkOrderForm((prev) => {
        if (prev.product_id !== productId) return prev
        if (options?.forceDefaultSelection) {
          const defaultUnit = units.find((unit) => unit.is_default) ?? units[0]
          return {
            ...prev,
            production_unit_id: defaultUnit ? String(defaultUnit.id) : '',
          }
        }
        const stillExists = units.some((unit) => String(unit.id) === prev.production_unit_id)
        if (stillExists) return prev
        const defaultUnit = units.find((unit) => unit.is_default) ?? units[0]
        return {
          ...prev,
          production_unit_id: defaultUnit ? String(defaultUnit.id) : '',
        }
      })
    } catch {
      setProductionUnits([])
      setWorkOrderForm((prev) => ({ ...prev, production_unit_id: '' }))
    } finally {
      setProductionUnitsLoading(false)
    }
  }

  function resetProductionUnitEditor() {
    setEditingProductionUnitId(null)
    setProductionUnitForm(emptyProductionUnitForm())
  }

  function startEditProductionUnit(unit: ProductionUnit) {
    setEditingProductionUnitId(String(unit.id))
    setProductionUnitForm({
      unit_name: unit.unit_name ?? '',
      unit_weight_g: unit.unit_weight_g !== null && unit.unit_weight_g !== undefined ? String(unit.unit_weight_g) : '',
      is_default: Boolean(unit.is_default),
    })
    setShowProductionUnitManager(true)
    setProductionUnitMessage(null)
  }

  async function saveProductionUnit() {
    const productId = workOrderForm.product_id
    if (!productId) {
      setProductionUnitMessage({ tone: 'error', text: '먼저 제품을 선택해 주세요.' })
      return
    }

    const unitName = productionUnitForm.unit_name.trim()
    if (!unitName) {
      setProductionUnitMessage({ tone: 'error', text: '단위명을 입력해 주세요.' })
      return
    }

    const unitWeightG = toNumber(productionUnitForm.unit_weight_g)
    if (unitWeightG === null || unitWeightG <= 0) {
      setProductionUnitMessage({ tone: 'error', text: '단위중량(g)은 0보다 큰 숫자여야 합니다.' })
      return
    }

    setProductionUnitSaving(true)
    try {
      if (editingProductionUnitId) {
        await readJson<{ ok?: boolean; error?: string }>(
          `/api/moni/products/${encodeURIComponent(productId)}/production-units/${encodeURIComponent(editingProductionUnitId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              unit_name: unitName,
              unit_weight_g: unitWeightG,
              is_default: productionUnitForm.is_default,
            }),
          },
        )
        setProductionUnitMessage({ tone: 'success', text: '생산단위를 수정했습니다.' })
      } else {
        await readJson<{ ok?: boolean; error?: string }>(
          `/api/moni/products/${encodeURIComponent(productId)}/production-units`,
          {
            method: 'POST',
            body: JSON.stringify({
              unit_name: unitName,
              unit_weight_g: unitWeightG,
              is_default: productionUnitForm.is_default,
              sort_order: productionUnits.length,
              business_id: '20220523011',
            }),
          },
        )
        setProductionUnitMessage({ tone: 'success', text: '생산단위를 추가했습니다.' })
      }

      resetProductionUnitEditor()
      await loadProductionUnits(productId, { forceDefaultSelection: true })
    } catch (error) {
      setProductionUnitMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '생산단위 저장에 실패했습니다.',
      })
    } finally {
      setProductionUnitSaving(false)
    }
  }

  async function deleteProductionUnit(unit: ProductionUnit) {
    const productId = workOrderForm.product_id
    if (!productId) {
      setProductionUnitMessage({ tone: 'error', text: '먼저 제품을 선택해 주세요.' })
      return
    }

    const confirmed = window.confirm(`생산단위 "${unit.unit_name}"를 삭제하시겠습니까?`)
    if (!confirmed) return

    setProductionUnitSaving(true)
    try {
      await readJson<{ ok?: boolean; error?: string }>(
        `/api/moni/products/${encodeURIComponent(productId)}/production-units/${encodeURIComponent(String(unit.id))}`,
        { method: 'DELETE' },
      )

      if (editingProductionUnitId === String(unit.id)) {
        resetProductionUnitEditor()
      }

      setProductionUnitMessage({ tone: 'success', text: '생산단위를 삭제했습니다.' })
      await loadProductionUnits(productId, { forceDefaultSelection: true })
    } catch (error) {
      setProductionUnitMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '생산단위 삭제에 실패했습니다.',
      })
    } finally {
      setProductionUnitSaving(false)
    }
  }

  async function saveProductionUnitLegacy() {
    const productId = workOrderForm.product_id
    if (!productId) {
      setProductionUnitMessage({ tone: 'error', text: '제품을 먼저 선택해 주세요.' })
      return
    }

    const unitName = productionUnitForm.unit_name.trim()
    if (!unitName) {
      setProductionUnitMessage({ tone: 'error', text: '단위명을 입력해 주세요.' })
      return
    }

    const unitWeightG = toNumber(productionUnitForm.unit_weight_g)
    if (unitWeightG === null || unitWeightG <= 0) {
      setProductionUnitMessage({ tone: 'error', text: '단위중량(g)은 0보다 큰 숫자여야 합니다.' })
      return
    }

    setProductionUnitSaving(true)
    try {
      if (editingProductionUnitId) {
        await readJson<{ ok?: boolean; error?: string }>(
          `/api/moni/products/${encodeURIComponent(productId)}/production-units/${encodeURIComponent(editingProductionUnitId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              unit_name: unitName,
              unit_weight_g: unitWeightG,
              is_default: productionUnitForm.is_default,
            }),
          },
        )
        setProductionUnitMessage({ tone: 'success', text: '생산단위를 수정했습니다.' })
      } else {
        await readJson<{ ok?: boolean; error?: string }>(
          `/api/moni/products/${encodeURIComponent(productId)}/production-units`,
          {
            method: 'POST',
            body: JSON.stringify({
              unit_name: unitName,
              unit_weight_g: unitWeightG,
              is_default: productionUnitForm.is_default,
              sort_order: productionUnits.length,
              business_id: '20220523011',
            }),
          },
        )
        setProductionUnitMessage({ tone: 'success', text: '생산단위를 추가했습니다.' })
      }

      resetProductionUnitEditor()
      await loadProductionUnits(productId, { forceDefaultSelection: true })
    } catch (error) {
      setProductionUnitMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '생산단위 저장에 실패했습니다.',
      })
    } finally {
      setProductionUnitSaving(false)
    }
  }

  async function deleteProductionUnitLegacy(unit: ProductionUnit) {
    const productId = workOrderForm.product_id
    if (!productId) {
      setProductionUnitMessage({ tone: 'error', text: '제품을 먼저 선택해 주세요.' })
      return
    }

    const confirmed = window.confirm(`생산단위 "${unit.unit_name}"를 삭제하시겠습니까?`)
    if (!confirmed) return

    setProductionUnitSaving(true)
    try {
      await readJson<{ ok?: boolean; error?: string }>(
        `/api/moni/products/${encodeURIComponent(productId)}/production-units/${encodeURIComponent(String(unit.id))}`,
        { method: 'DELETE' },
      )

      if (editingProductionUnitId === String(unit.id)) {
        resetProductionUnitEditor()
      }

      setProductionUnitMessage({ tone: 'success', text: '생산단위를 삭제했습니다.' })
      await loadProductionUnits(productId, { forceDefaultSelection: true })
    } catch (error) {
      setProductionUnitMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '생산단위 삭제에 실패했습니다.',
      })
    } finally {
      setProductionUnitSaving(false)
    }
  }

  async function loadRecipes(productId?: string) {
    setRecipesLoading(true)
    setRecipesError('')
    try {
      const query = productId ? `?product_id=${encodeURIComponent(productId)}` : ''
      const payload = await readJson<RecipesPayload>(`/api/moni/recipes${query}`)
      setRecipes(payload.recipes ?? [])
      setRecipeMappings(payload.mappings ?? [])
      setRecipeProducts(payload.products ?? [])
      setRecipeRawMaterials(payload.rawMaterials ?? [])
    } catch (error) {
      setRecipesError(error instanceof Error ? error.message : '레시피 데이터를 불러오지 못했습니다.')
    } finally {
      setRecipesLoading(false)
    }
  }

  async function loadRecipeMaterialMappings() {
    setRecipeMappingLoading(true)
    setRecipeMappingError('')
    try {
      const params = new URLSearchParams()
      params.set('view', 'recipes')
      if (recipeMappingProductQuery.trim()) params.set('product_name', recipeMappingProductQuery.trim())
      if (recipeMappingItemQuery.trim()) params.set('recipe_item_name', recipeMappingItemQuery.trim())
      if (recipeMappingStatusFilter !== 'all') params.set('status', recipeMappingStatusFilter)
      if (recipeMappingScopeFilter !== 'all') params.set('scope', recipeMappingScopeFilter)
      if (recipeMappingBroadOnly) params.set('broad_only', 'true')

      const payload = await readJson<RecipeMaterialMappingsPayload>(`/api/moni/raw-material-mapping?${params.toString()}`)
      setRecipeMappingRows(payload.rows ?? [])
      setRecipeMappingRawMaterials(payload.rawMaterials ?? [])
    } catch (error) {
      setRecipeMappingError(error instanceof Error ? error.message : '레시피 원재료 연결 목록을 불러오지 못했습니다.')
    } finally {
      setRecipeMappingLoading(false)
    }
  }

  async function loadLatestRecipeMappingHistory() {
    setRecipeMappingHistoryLoading(true)
    setRecipeMappingHistoryWarning('')
    try {
      const payload = await readJson<RecipeMappingHistoryPayload>('/api/moni/raw-material-mapping?action=latest_history')
      setRecipeMappingLatestHistory(payload.history ?? null)
      if (payload.warning) setRecipeMappingHistoryWarning(payload.warning)
    } catch (error) {
      setRecipeMappingLatestHistory(null)
      setRecipeMappingHistoryWarning(error instanceof Error ? error.message : '최근 처리 내역을 불러오지 못했습니다.')
    } finally {
      setRecipeMappingHistoryLoading(false)
    }
  }

  function openRecipeMappingModal(row: RecipeMaterialMappingRow) {
    setSelectedRecipeMappingRow(row)
    setRecipeMappingSelectedScope(
      row.applied_scope === 'recipe' || row.applied_scope === 'product' || row.applied_scope === 'global'
        ? row.applied_scope
        : 'recipe',
    )
    const initialMaterial = row.current_raw_material_name ?? ''
    setRecipeMappingSelectedMaterial(initialMaterial)
    setRecipeMappingMaterialQuery(initialMaterial)
    setRecipeMappingCandidateOpen(false)
    setRecipeMappingHighlightIndex(-1)
    setRecipeMappingMessage(null)
    setShowRecipeMappingModal(true)
  }

  function selectRecipeMappingMaterial(name: string) {
    setRecipeMappingSelectedMaterial(name)
    setRecipeMappingMaterialQuery(name)
    setRecipeMappingCandidateOpen(false)
    setRecipeMappingHighlightIndex(-1)
  }

  function handleRecipeMappingMaterialQueryChange(nextValue: string) {
    setRecipeMappingMaterialQuery(nextValue)
    setRecipeMappingCandidateOpen(true)
    setRecipeMappingHighlightIndex(0)
    if (nextValue.trim() !== recipeMappingSelectedMaterial.trim()) {
      setRecipeMappingSelectedMaterial('')
    }
  }

  function handleRecipeMappingMaterialKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!recipeMappingCandidateOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      if (recipeMappingMaterialCandidates.length > 0) {
        setRecipeMappingCandidateOpen(true)
        setRecipeMappingHighlightIndex(0)
      }
      return
    }

    if (event.key === 'Escape') {
      setRecipeMappingCandidateOpen(false)
      setRecipeMappingHighlightIndex(-1)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (recipeMappingMaterialCandidates.length === 0) return
      setRecipeMappingHighlightIndex((prev) =>
        prev < 0 ? 0 : Math.min(prev + 1, recipeMappingMaterialCandidates.length - 1),
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (recipeMappingMaterialCandidates.length === 0) return
      setRecipeMappingHighlightIndex((prev) => (prev <= 0 ? 0 : prev - 1))
      return
    }

    if (event.key === 'Enter') {
      if (!recipeMappingCandidateOpen) return
      event.preventDefault()
      if (recipeMappingMaterialCandidates.length === 1) {
        selectRecipeMappingMaterial(recipeMappingMaterialCandidates[0].item_name)
        return
      }
      if (recipeMappingHighlightIndex >= 0 && recipeMappingHighlightIndex < recipeMappingMaterialCandidates.length) {
        selectRecipeMappingMaterial(recipeMappingMaterialCandidates[recipeMappingHighlightIndex].item_name)
      }
    }
  }

  async function saveRecipeManualMapping() {
    if (!selectedRecipeMappingRow) return
    if (!recipeMappingSelectedMaterial.trim()) {
      setRecipeMappingMessage({ tone: 'error', text: '원재료를 선택해 주세요.' })
      return
    }

    setRecipeMappingSaving(true)
    setRecipeMappingMessage(null)
    try {
      const payload = await readJson<RecipeMappingHistoryPayload>('/api/moni/raw-material-mapping', {
        method: 'POST',
        body: JSON.stringify({
          recipe_id: selectedRecipeMappingRow.recipe_id,
          product_id: selectedRecipeMappingRow.product_id,
          product_name: selectedRecipeMappingRow.product_name,
          food_type_id: selectedRecipeMappingRow.food_type_id,
          food_type_name: selectedRecipeMappingRow.food_type_name,
          raw_material_name: recipeMappingSelectedMaterial,
          mapping_scope: recipeMappingSelectedScope,
          is_default: true,
        }),
      })
      setRecipeMappingLatestHistory(payload.history ?? null)
      if (payload.warning) {
        setRecipeMappingMessage({ tone: 'warning', text: payload.warning })
      } else {
        setRecipeMappingMessage({ tone: 'success', text: '원재료 연결이 저장되었습니다. 처리 필요 목록에서 항목이 사라질 수 있습니다.' })
      }
      await Promise.all([loadRecipeMaterialMappings(), loadRecipes(selectedRecipeProductId), loadLatestRecipeMappingHistory()])
      setShowRecipeMappingModal(false)
      setSelectedRecipeMappingRow(null)
      setRecipeMappingMaterialQuery('')
      setRecipeMappingCandidateOpen(false)
      setRecipeMappingHighlightIndex(-1)
    } catch (error) {
      setRecipeMappingMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '원재료 연결 저장 중 오류가 발생했습니다.',
      })
    } finally {
      setRecipeMappingSaving(false)
    }
  }

  async function undoLatestRecipeMapping() {
    if (!recipeMappingLatestHistory) return
    setRecipeMappingUndoing(true)
    setRecipeMappingHistoryWarning('')
    try {
      const payload = await readJson<RecipeMappingHistoryPayload>('/api/moni/raw-material-mapping', {
        method: 'POST',
        body: JSON.stringify({ action: 'undo_last_mapping' }),
      })
      setRecipeMappingLatestHistory(payload.nextHistory ?? null)
      if (payload.warning) setRecipeMappingHistoryWarning(payload.warning)
      setRecipeMappingMessage({ tone: 'success', text: '가장 최근 처리 건을 되돌렸습니다.' })
      await Promise.all([loadRecipeMaterialMappings(), loadRecipes(selectedRecipeProductId)])
    } catch (error) {
      setRecipeMappingHistoryWarning(error instanceof Error ? error.message : '되돌리기 처리에 실패했습니다.')
    } finally {
      setRecipeMappingUndoing(false)
    }
  }

  async function loadFoodTypes() {
    try {
      const payload = await readJson<FoodTypesPayload>('/api/moni/food-types')
      setFoodTypes(payload.foodTypes ?? [])
    } catch {
      setFoodTypes([])
    }
  }

  async function loadMaterials(view: 'active' | 'inactive' = materialsView) {
    setMaterialsLoading(true)
    setMaterialsError('')
    try {
      const query = view === 'inactive' ? '?status=inactive' : ''
      const payload = await readJson<RawMaterialsPayload>(`/api/moni/raw-materials${query}`)
      setMaterials(payload.materials ?? [])
      setMaterialsSummary({
        total: Number(payload.summary?.total ?? 0),
        active: Number(payload.summary?.active ?? 0),
        inactive: Number(payload.summary?.inactive ?? 0),
      })
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : '원재료 목록을 불러오지 못했습니다.')
    } finally {
      setMaterialsLoading(false)
    }
  }

  async function loadPackagingMaterials(view: 'active' | 'inactive' = packagingView) {
    setPackagingLoading(true)
    setPackagingError('')
    try {
      const query = view === 'inactive' ? '?status=inactive' : ''
      const payload = await readJson<PackagingMaterialsPayload>(`/api/moni/packaging-materials${query}`)
      setPackagingMaterials(payload.materials ?? [])
      setPackagingSummary({
        total: Number(payload.summary?.total ?? 0),
        active: Number(payload.summary?.active ?? 0),
        inactive: Number(payload.summary?.inactive ?? 0),
      })
    } catch (error) {
      setPackagingError(error instanceof Error ? error.message : '부재료 목록을 불러오지 못했습니다.')
    } finally {
      setPackagingLoading(false)
    }
  }

  async function toggleRawMaterialActive(material: RawMaterialRow, nextActive: boolean) {
    const actionLabel = nextActive ? '다시 활성화' : '비활성화'
    const confirmed = window.confirm(`"${material.item_name}" 항목을 ${actionLabel}할까요?`)
    if (!confirmed) return
    setMaterialSaving(true)
    setMaterialsError('')
    try {
      await readJson<RawMaterialsPayload>(`/api/moni/raw-materials/${encodeURIComponent(material.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          item_name: material.item_name,
          food_type: material.food_type ?? material.food_type_name ?? '',
          country_of_origin: material.country_of_origin ?? '',
          spec: material.spec ?? '',
          storage_type: material.storage_type ?? '',
          shelf_life_days: material.shelf_life_days ?? null,
          supplier: material.supplier ?? '',
          supplier_contact: material.supplier_contact ?? '',
          supplier_address: material.supplier_address ?? '',
          supplier_biz_number: material.supplier_biz_number ?? '',
          is_active: nextActive,
        }),
      })
      await loadMaterials(materialsView)
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : `${actionLabel} 처리 중 오류가 발생했습니다.`)
    } finally {
      setMaterialSaving(false)
    }
  }

  async function togglePackagingMaterialActive(material: PackagingMaterialRow, nextActive: boolean) {
    const actionLabel = nextActive ? '다시 활성화' : '비활성화'
    const confirmed = window.confirm(`"${material.material_name}" 항목을 ${actionLabel}할까요?`)
    if (!confirmed) return
    setPackagingSaving(true)
    setPackagingError('')
    try {
      await readJson<PackagingMaterialsPayload>(`/api/moni/packaging-materials/${encodeURIComponent(material.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          material_name: material.material_name,
          spec: material.spec ?? '',
          material_type: material.material_type ?? '',
          supplier: material.supplier ?? '',
          current_stock: Number(material.current_stock ?? 0),
          unit_price: Number(material.unit_price ?? 0),
          is_active: nextActive,
        }),
      })
      await loadPackagingMaterials(packagingView)
    } catch (error) {
      setPackagingError(error instanceof Error ? error.message : `${actionLabel} 처리 중 오류가 발생했습니다.`)
    } finally {
      setPackagingSaving(false)
    }
  }

  async function loadSububu(from: string, to: string, materialName?: string) {
    setSububuLoading(true)
    setSububuError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const normalized = (materialName ?? '').trim()
      if (normalized) params.set('material_name', normalized)
      const payload = await readJson<SububuPayload>(`/api/moni/sububu?${params.toString()}`)
      setSububuMaterials(payload.materials ?? [])
      setSububuTotalProductionG(Number(payload.total_production_g ?? 0))
    } catch (error) {
      setSububuError(error instanceof Error ? error.message : '수불부 데이터를 불러오지 못했습니다.')
    } finally {
      setSububuLoading(false)
    }
  }

  async function loadSububuDetail(materialName: string, from: string, to: string) {
    const target = materialName.trim()
    if (!target) return
    setSububuDetailLoading(true)
    setSububuDetailError('')
    try {
      const params = new URLSearchParams()
      params.set('material_name', target)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const payload = await readJson<RawMaterialTransactionsPayload>(`/api/moni/raw-material-transactions?${params.toString()}`)
      setSububuDetailRows(payload.rows ?? [])
      setSububuDetailBalanceMode(payload.balance_mode ?? '')
    } catch (error) {
      setSububuDetailRows([])
      setSububuDetailBalanceMode('')
      setSububuDetailError(error instanceof Error ? error.message : '원료 수불 상세를 불러오지 못했습니다.')
    } finally {
      setSububuDetailLoading(false)
    }
  }

  async function openSububuDetail(materialName: string) {
    const target = materialName.trim()
    if (!target) return
    setSububuDetailTarget(target)
    setSububuDetailFrom(sububuDateFrom)
    setSububuDetailTo(sububuDateTo)
    setShowSububuDetailModal(true)
    await loadSububuDetail(target, sububuDateFrom, sububuDateTo)
  }

  async function savePackagingMaterial() {
    const materialName = packagingForm.material_name.trim()
    if (!materialName) {
      setPackagingError('부재료명을 입력해 주세요.')
      return
    }

    const currentStock = toNumber(packagingForm.current_stock)
    if (currentStock === null || currentStock < 0) {
      setPackagingError('현재재고는 0 이상 숫자로 입력해 주세요.')
      return
    }

    const unitPrice = toNumber(packagingForm.unit_price)
    if (unitPrice === null || unitPrice < 0) {
      setPackagingError('단가는 0 이상 숫자로 입력해 주세요.')
      return
    }

    setPackagingSaving(true)
    setPackagingError('')
    try {
      const payload = {
        material_name: materialName,
        material_code: packagingForm.material_code.trim(),
        spec: packagingForm.spec.trim(),
        material_type: packagingForm.material_type.trim(),
        supplier: packagingForm.supplier.trim(),
        current_stock: currentStock,
        unit_price: unitPrice,
        is_active: packagingForm.is_active,
        business_id: '20220523011',
      }

      if (packagingForm.id) {
        await readJson<PackagingMaterialsPayload>(`/api/moni/packaging-materials/${encodeURIComponent(packagingForm.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await readJson<PackagingMaterialsPayload>('/api/moni/packaging-materials', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      setShowPackagingModal(false)
      setPackagingForm(emptyPackagingForm())
      await loadPackagingMaterials()
    } catch (error) {
      setPackagingError(error instanceof Error ? error.message : '부재료 저장 중 오류가 발생했습니다.')
    } finally {
      setPackagingSaving(false)
    }
  }

  function editPackagingMaterial(material: PackagingMaterialRow) {
    setPackagingError('')
    setPackagingForm(emptyPackagingForm(material))
    setShowPackagingModal(true)
  }

  async function deactivatePackagingMaterial(material: PackagingMaterialRow) {
    const confirmed = window.confirm(`"${material.material_name}" 항목을 비활성화할까요?`)
    if (!confirmed) return
    setPackagingSaving(true)
    setPackagingError('')
    try {
      await readJson<PackagingMaterialsPayload>(`/api/moni/packaging-materials/${encodeURIComponent(material.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          material_name: material.material_name,
          spec: material.spec ?? '',
          material_type: material.material_type ?? '',
          supplier: material.supplier ?? '',
          current_stock: Number(material.current_stock ?? 0),
          unit_price: Number(material.unit_price ?? 0),
          is_active: false,
        }),
      })
      await loadPackagingMaterials()
    } catch (error) {
      setPackagingError(error instanceof Error ? error.message : '비활성화 처리 중 오류가 발생했습니다.')
    } finally {
      setPackagingSaving(false)
    }
  }

  async function loadSanitation(from: string, to: string) {
    setSanitationLoading(true)
    setSanitationError('')
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const payload = await readJson<SanitationPayload>(`/api/moni/sanitation-logs?${params.toString()}`)
      setSanitationLogs(payload.logs ?? [])
    } catch (error) {
      setSanitationError(error instanceof Error ? error.message : '위생점검 일지를 불러오지 못했습니다.')
    } finally {
      setSanitationLoading(false)
    }
  }

  async function requestChatReply(message: string) {
    const body = JSON.stringify({
      message,
      context: {
        mainMenu,
        productionTab,
      },
    })

    for (const url of ['/api/moni/chat', '/api/chat']) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        if (!response.ok) continue
        const payload = (await response.json().catch(() => null)) as
          | { reply?: string; content?: string; message?: string; answer?: string }
          | null
        const reply = payload?.reply || payload?.content || payload?.message || payload?.answer
        if (reply) return reply
      } catch {
        continue
      }
    }

    if (mainMenu === 'production') {
      if (productionTab === 'prod-overview') {
        return '생산 개요 탭 기준으로 오늘 생산량, 상태별 건수, 최근 제조기록서를 함께 보면서 판단하는 흐름으로 정리해드릴게요.'
      }
      if (productionTab === 'prod-materials') {
        return '원재료 관리 탭에서는 재고 현황과 수불부를 같이 보는 게 가장 빠릅니다. 사용량이 큰 원료부터 먼저 점검해보겠습니다.'
      }
      if (productionTab === 'prod-sanitation') {
        return '위생점검 탭에서는 최근 점검 결과와 조치사항을 기준으로 필요한 대응 순서를 정리하는 쪽이 효율적입니다.'
      }
      return '생산관리 탭 기준으로 현재 화면 데이터에 맞춰 바로 정리해드릴게요.'
    }

    if (mainMenu === 'sales') {
      return '영업관리 흐름에 맞춰 거래처, 제품, 수당 정보를 같이 보면서 정리해드릴게요.'
    }

    if (mainMenu === 'accounting') {
      return '회계관리 흐름에 맞춰 지급 데이터와 정산 항목을 중심으로 확인해드릴게요.'
    }

    if (mainMenu === 'admin') {
      return '관리자 화면 기준으로 설정과 운영 이슈를 함께 정리해드릴게요.'
    }

    return `${message} 요청을 기준으로 바로 이어서 도와드릴게요.`
  }

  async function submitChat() {
    const text = composer.trim()
    if (!text || chatBusy) return

    const conversationId = activeConversationId ?? uid()
    const assistantId = uid()
    const userMessage: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '답변을 정리하고 있습니다...',
      timestamp: new Date().toISOString(),
      pending: true,
    }

    setComposer('')
    setChatBusy(true)
    setActiveConversationId(conversationId)
    setConversations((prev) => {
      const next = [...prev]
      const existingIndex = next.findIndex((conversation) => conversation.id === conversationId)
      if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          messages: [...next[existingIndex].messages, userMessage, assistantMessage],
        }
        return next
      }
      return [
        {
          id: conversationId,
          title: titleFromMessage(text),
          createdAt: new Date().toISOString(),
          messages: [userMessage, assistantMessage],
        },
        ...next,
      ]
    })

    try {
      const reply = await requestChatReply(text)
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id !== conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: reply,
                        pending: false,
                        timestamp: new Date().toISOString(),
                      }
                    : message,
                ),
              },
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '응답 생성 중 오류가 발생했습니다.'
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id !== conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map((chatMessage) =>
                  chatMessage.id === assistantId
                    ? { ...chatMessage, content: message, pending: false }
                    : chatMessage,
                ),
              },
        ),
      )
    } finally {
      setChatBusy(false)
    }
  }

  function resetConversation() {
    setActiveConversationId(null)
    setComposer('')
  }

  function openWindow(path: string) {
    if (typeof window !== 'undefined') {
      window.open(path, '_blank', 'noopener,noreferrer')
    }
  }

  async function handleLogout() {
    await fetch('/api/allowance/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  async function saveProductionRecord() {
    const selectedProduct =
      productionForm.product_id && productionForm.product_id !== '__new__'
        ? products.find((item) => String(item.id) === productionForm.product_id) ?? null
        : null

    const payload = {
      work_date: productionForm.work_date,
      product_id: productionForm.product_id === '__new__' ? '' : productionForm.product_id,
      product_name:
        productionForm.product_id === '__new__'
          ? productionForm.product_name.trim()
          : selectedProduct?.product_name ?? '',
      planned_quantity_g: toNumber(productionForm.planned_quantity_g),
      actual_quantity_g: toNumber(productionForm.actual_quantity_g),
      defect_quantity_g: productionDefectQuantity,
      worker_name: productionForm.worker_name.trim(),
      start_time: productionForm.start_time,
      end_time: productionForm.end_time,
      status: productionForm.status,
      inspection_result: productionForm.inspection_result,
      sanitation_check: productionForm.sanitation_check,
      note: productionForm.note.trim(),
      business_id: '20220523011',
    }

    setProductionSaving(true)
    try {
      await readJson('/api/moni/production-records', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setShowProductionModal(false)
      setProductionForm(emptyProductionForm())
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
        loadSububu(sububuDateFrom, sububuDateTo),
      ])
    } finally {
      setProductionSaving(false)
    }
  }

  async function callProductionAction(body: Record<string, unknown>) {
    const response = await fetch('/api/moni/production-records', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = ((await response.json().catch(() => null)) ?? {}) as ProductionActionPayload
    if (!response.ok) {
      throw new Error(payload.error || '생산 처리 요청에 실패했습니다.')
    }
    return payload
  }

  async function createWorkOrder() {
    const productId = workOrderForm.product_id
    const plannedG = kgToG(workOrderForm.planned_quantity_kg)
    const selectedUnit =
      productionUnits.find((unit) => String(unit.id) === workOrderForm.production_unit_id) ?? null
    if (!productId) {
      setProductionActionMessage({ tone: 'error', text: '제품을 선택해 주세요.' })
      return
    }
    if (plannedG === null || plannedG <= 0) {
      setProductionActionMessage({ tone: 'error', text: '생산 예정량(kg)은 0보다 커야 합니다.' })
      return
    }

    const selectedProduct = products.find((item) => String(item.id) === productId)
    if (!selectedProduct) {
      setProductionActionMessage({ tone: 'error', text: '선택한 제품 정보를 찾을 수 없습니다.' })
      return
    }
    if (productionUnits.length === 0) {
      setProductionActionMessage({ tone: 'error', text: '등록된 생산단위가 없습니다. 먼저 생산단위를 추가하세요.' })
      return
    }
    if (!selectedUnit) {
      setProductionActionMessage({ tone: 'error', text: '생산 단위를 선택해 주세요.' })
      return
    }

    setProductionActionBusy(true)
    try {
      await readJson('/api/moni/production-records', {
        method: 'POST',
        body: JSON.stringify({
          work_date: todayValue(),
          product_id: productId,
          product_name: selectedProduct.product_name,
          planned_quantity_g: plannedG,
          production_unit_id: selectedUnit?.id ?? null,
          production_unit_name: selectedUnit?.unit_name ?? null,
          production_unit_weight_g: selectedUnit?.unit_weight_g ?? null,
          status: 'planned',
          business_id: '20220523011',
        }),
      })

      setWorkOrderForm({ product_id: '', production_unit_id: '', planned_quantity_kg: '' })
      setProductionActionMessage({ tone: 'success', text: '작업지시서가 생성되었습니다.' })
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
      ])
    } catch (error) {
      setProductionActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '작업지시서 생성에 실패했습니다.',
      })
    } finally {
      setProductionActionBusy(false)
    }
  }

  async function completeWorkOrder() {
    const recordId = completionForm.record_id
    const inputUnit = completionForm.input_unit
    const unitWeightG = toNumber(String(completionTargetRecord?.production_unit_weight_g ?? ''))
    let actualG: number | null = null
    let defectG: number | null = null
    let sampleG: number | null = null
    let actualEa: number | null = null
    let defectEa: number | null = null
    let sampleEa: number | null = null

    if (inputUnit === 'ea') {
      if (unitWeightG === null || unitWeightG <= 0) {
        setProductionActionMessage({ tone: 'error', text: '생산단위 중량 정보가 없어 ea 입력을 사용할 수 없습니다.' })
        return
      }

      actualEa = parseInteger(completionForm.actual_quantity_ea)
      defectEa = parseInteger(completionForm.defect_quantity_ea)
      sampleEa = parseInteger(completionForm.sample_quantity_ea)

      if (actualEa === null || defectEa === null || sampleEa === null) {
        setProductionActionMessage({ tone: 'error', text: 'ea 입력은 정수만 가능합니다.' })
        return
      }
      if (actualEa < 0 || defectEa < 0 || sampleEa < 0) {
        setProductionActionMessage({ tone: 'error', text: '완료량/불량수량/샘플수량은 0 이상이어야 합니다.' })
        return
      }

      actualG = actualEa * unitWeightG
      defectG = defectEa * unitWeightG
      sampleG = sampleEa * unitWeightG
    } else if (inputUnit === 'g') {
      actualG = toNumber(completionForm.actual_quantity_g)
      defectG = toNumber(completionForm.defect_quantity_g)
      sampleG = toNumber(completionForm.sample_quantity_g)
    } else {
      actualG = kgToG(completionForm.actual_quantity_kg)
      defectG = kgToG(completionForm.defect_quantity_kg)
      sampleG = kgToG(completionForm.sample_quantity_kg)
    }

    const plannedG = completionTargetRecord?.planned_quantity_g ?? 0
    if (!recordId) {
      setProductionActionMessage({ tone: 'error', text: '완료 처리할 작업지시서를 선택해 주세요.' })
      return
    }
    if (actualG === null) {
      setProductionActionMessage({
        tone: 'error',
        text:
          inputUnit === 'ea'
            ? '실제 완료량(ea)을 입력해 주세요.'
            : inputUnit === 'g'
              ? '실제 완료량(g)을 입력해 주세요.'
              : '실제 완료량(kg)을 입력해 주세요.',
      })
      return
    }
    if (defectG === null || sampleG === null) {
      setProductionActionMessage({ tone: 'error', text: '완료량/불량수량/샘플수량을 입력해 주세요.' })
      return
    }
    if (actualG < 0 || defectG < 0 || sampleG < 0) {
      setProductionActionMessage({ tone: 'error', text: '완료량/불량수량/샘플수량은 0 이상이어야 합니다.' })
      return
    }
    if (plannedG <= 0) {
      setProductionActionMessage({ tone: 'error', text: '예정수량이 없어 완료 입력을 진행할 수 없습니다.' })
      return
    }
    if (actualG + defectG + sampleG > plannedG) {
      setProductionActionMessage({
        tone: 'error',
        text: '실제 완료량 + 불량수량 + 샘플수량 합계가 예정수량을 초과할 수 없습니다.',
      })
      return
    }

    setProductionActionBusy(true)
    try {
      await callProductionAction({
        action: 'complete',
        record_id: recordId,
        input_unit: inputUnit,
        actual_quantity_ea: actualEa,
        defect_quantity_ea: defectEa,
        sample_quantity_ea: sampleEa,
        actual_quantity_g: actualG,
        defect_quantity_g: defectG,
        sample_quantity_g: sampleG,
      })

      setShowCompletionModal(false)
      setCompletionTargetRecord(null)
      setCompletionForm(emptyCompletionForm())
      setSampleInputRows([makeSampleRow(0)])
      setProductionActionMessage({ tone: 'success', text: '생산 완료가 저장되었습니다.' })
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
      ])
    } catch (error) {
      setProductionActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '생산 완료 저장에 실패했습니다.',
      })
    } finally {
      setProductionActionBusy(false)
    }
  }

  function openCompletionModal(record: ProductionRecord) {
    const statusCode = normalizeStatusCode(record.status)
    if (statusCode === 'confirmed') {
      setProductionActionMessage({ tone: 'error', text: '확정된 작업지시서는 완료량을 수정할 수 없습니다.' })
      return
    }
    if (statusCode === 'cancelled') {
      setProductionActionMessage({ tone: 'error', text: '취소된 작업지시서는 완료 입력/수정이 불가합니다.' })
      return
    }

    setCompletionTargetRecord(record)
    const unitWeightG = toNumber(String(record.production_unit_weight_g ?? ''))
    const defaultInputUnit: 'ea' | 'kg' | 'g' = unitWeightG !== null && unitWeightG > 0 ? 'ea' : 'kg'
    const actualG = toNumber(String(record.actual_quantity_g ?? '')) ?? 0
    const defectG = toNumber(String(record.defect_quantity_g ?? '')) ?? 0
    const sampleG = toNumber(String(record.sample_quantity_g ?? '')) ?? 0
    const storedActualEa = parseInteger(String(record.actual_quantity_ea ?? ''))
    setCompletionForm({
      ...emptyCompletionForm(unitWeightG !== null && unitWeightG > 0),
      record_id: record.id,
      input_unit: defaultInputUnit,
      actual_quantity_ea:
        unitWeightG !== null && unitWeightG > 0
          ? String(storedActualEa ?? Math.floor(actualG / unitWeightG))
          : '',
      defect_quantity_ea: unitWeightG !== null && unitWeightG > 0 ? String(Math.floor(defectG / unitWeightG)) : '',
      sample_quantity_ea: unitWeightG !== null && unitWeightG > 0 ? String(Math.floor(sampleG / unitWeightG)) : '',
      actual_quantity_kg: record.actual_quantity_g && record.actual_quantity_g > 0 ? String(record.actual_quantity_g / 1000) : '',
      defect_quantity_kg: record.defect_quantity_g && record.defect_quantity_g > 0 ? String(record.defect_quantity_g / 1000) : '',
      sample_quantity_kg: record.sample_quantity_g && record.sample_quantity_g > 0 ? String(record.sample_quantity_g / 1000) : '',
      actual_quantity_g: record.actual_quantity_g && record.actual_quantity_g > 0 ? String(record.actual_quantity_g) : '',
      defect_quantity_g: record.defect_quantity_g && record.defect_quantity_g > 0 ? String(record.defect_quantity_g) : '',
      sample_quantity_g: record.sample_quantity_g && record.sample_quantity_g > 0 ? String(record.sample_quantity_g) : '',
    })
    setShowCompletionModal(true)
  }

  function openCompletionModalV2(record: ProductionRecord) {
    const statusCode = normalizeStatusCode(record.status)
    if (statusCode === 'confirmed') {
      setProductionActionMessage({ tone: 'error', text: '?뺤젙???묒뾽吏?쒖꽌???꾨즺?됱쓣 ?섏젙?????놁뒿?덈떎.' })
      return
    }
    if (statusCode === 'cancelled') {
      setProductionActionMessage({ tone: 'error', text: '痍⑥냼???묒뾽吏?쒖꽌???꾨즺 ?낅젰/?섏젙??遺덇??⑸땲??' })
      return
    }

    setCompletionTargetRecord(record)
    const unitWeightG = toNumber(String(record.production_unit_weight_g ?? ''))
    const hasUnit = unitWeightG !== null && unitWeightG > 0
    const actualG = toNumber(String(record.actual_quantity_g ?? '')) ?? 0
    const defectG = toNumber(String(record.defect_quantity_g ?? '')) ?? 0
    const sampleG = toNumber(String(record.sample_quantity_g ?? '')) ?? 0
    const storedActualEa = parseInteger(String(record.actual_quantity_ea ?? ''))
    const actualEaDefault = hasUnit ? storedActualEa ?? Math.floor(actualG / (unitWeightG ?? 1)) : null

    setCompletionForm({
      ...emptyCompletionForm(hasUnit),
      record_id: record.id,
      actual_input_unit: hasUnit ? 'ea' : 'kg',
      actual_input_value: hasUnit ? String(actualEaDefault ?? 0) : actualG > 0 ? String(actualG / 1000) : '',
      defect_input_unit: hasUnit ? 'g' : 'kg',
      defect_input_value: hasUnit ? (defectG > 0 ? String(defectG) : '0') : defectG > 0 ? String(defectG / 1000) : '0',
      sample_input_unit: hasUnit ? 'g' : 'kg',
      sample_input_value: hasUnit ? String(sampleG) : String(sampleG / 1000),
      input_unit: hasUnit ? 'ea' : 'kg',
      actual_quantity_ea: hasUnit ? String(actualEaDefault ?? 0) : '',
      defect_quantity_ea: hasUnit ? String(Math.floor(defectG / (unitWeightG ?? 1))) : '',
      sample_quantity_ea: hasUnit ? String(Math.floor(sampleG / (unitWeightG ?? 1))) : '',
      actual_quantity_kg: actualG > 0 ? String(actualG / 1000) : '',
      defect_quantity_kg: defectG > 0 ? String(defectG / 1000) : '',
      sample_quantity_kg: sampleG > 0 ? String(sampleG / 1000) : '',
      actual_quantity_g: actualG > 0 ? String(actualG) : '',
      defect_quantity_g: defectG > 0 ? String(defectG) : '',
      sample_quantity_g: sampleG > 0 ? String(sampleG) : '',
    })
    setSampleInputRows([
      makeSampleRow(0, hasUnit ? (sampleG > 0 ? String(sampleG) : '') : sampleG > 0 ? String(sampleG / 1000) : '', hasUnit ? 'g' : 'kg'),
    ])
    setShowCompletionModal(true)
  }

  function addSampleInputRow() {
    setSampleInputRows((prev) => normalizeSampleRows([...prev, makeSampleRow(prev.length)]))
  }

  function removeSampleInputRow(rowId: string) {
    setSampleInputRows((prev) => {
      const next = prev.filter((row) => row.id !== rowId)
      return normalizeSampleRows(next)
    })
  }

  function updateSampleInputRow(rowId: string, patch: Partial<Pick<SampleInputRow, 'value' | 'unit'>>) {
    setSampleInputRows((prev) =>
      normalizeSampleRows(prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))),
    )
  }

  async function completeWorkOrderV2() {
    const recordId = completionForm.record_id
    const plannedG = completionTargetRecord?.planned_quantity_g ?? 0
    if (!recordId) {
      setProductionActionMessage({ tone: 'error', text: '?꾨즺 泥섎━???묒뾽吏?쒖꽌瑜??좏깮??二쇱꽭??' })
      return
    }
    if (plannedG <= 0) {
      setProductionActionMessage({ tone: 'error', text: '?덉젙?섎웾???놁뼱 ?꾨즺 ?낅젰??吏꾪뻾?????놁뒿?덈떎.' })
      return
    }

    const actual = quantityToGrams(
      completionForm.actual_input_value,
      completionForm.actual_input_unit,
      completionUnitWeightG,
    )
    const defect = quantityToGrams(
      completionForm.defect_input_value,
      completionForm.defect_input_unit,
      completionUnitWeightG,
    )
    const hasInvalidSampleRow = sampleRowPreviews.some(
      (row) => (row.value !== null && row.value < 0) || row.grams === null,
    )
    const sampleGTotal = sampleTotalG

    if (actual.value === null) {
      setProductionActionMessage({ tone: 'error', text: '?꾨즺?섎웾???낅젰??二쇱꽭??' })
      return
    }
    if (actual.grams === null || defect.grams === null || hasInvalidSampleRow) {
      setProductionActionMessage({ tone: 'error', text: '?낅젰?⑥쐞??媛믪쓣 ?뺤씤??二쇱꽭??' })
      return
    }
    if (actual.invalidEa) {
      setProductionActionMessage({ tone: 'error', text: 'ea ?낅젰? ?뺤닔濡??낅젰??二쇱꽭??' })
      return
    }
    if (completionForm.actual_input_unit === 'ea' && (completionUnitWeightG === null || completionUnitWeightG <= 0)) {
      setProductionActionMessage({ tone: 'error', text: '?앹궛?⑥쐞 以묐웾 ?뺣낫媛 ?놁뼱 ea ?낅젰???ъ슜?????놁뒿?덈떎.' })
      return
    }
    if (actual.value < 0 || (defect.value ?? 0) < 0 || sampleGTotal < 0) {
      setProductionActionMessage({ tone: 'error', text: '?꾨즺??遺덈웾?섎웾/?섑뵆?섎웾? 0 ?댁긽?댁뼱???⑸땲??' })
      return
    }

    const actualG = actual.grams
    const defectG = defect.grams
    const sampleG = sampleGTotal
    const enteredTotal = actualG + defectG + sampleG
    const lossG = plannedG - enteredTotal
    if (lossG < 0) {
      setProductionActionMessage({
        tone: 'error',
        text: '?ㅼ젣 ?꾨즺??+ 遺덈웾?섎웾 + ?섑뵆?섎웾 ?⑷퀎媛 ?덉젙?섎웾??珥덇낵?????놁뒿?덈떎.',
      })
      return
    }

    const actualEa =
      completionForm.actual_input_unit === 'ea'
        ? actual.ea
        : completionUnitWeightG !== null && completionUnitWeightG > 0
          ? Math.floor(actualG / completionUnitWeightG)
          : null

    setProductionActionBusy(true)
    try {
      await callProductionAction({
        action: 'complete',
        record_id: recordId,
        actual_input_unit: completionForm.actual_input_unit,
        actual_input_value: actual.value,
        defect_input_unit: completionForm.defect_input_unit,
        defect_input_value: defect.value ?? 0,
        sample_input_unit: 'g',
        sample_input_value: sampleGTotal,
        input_unit: completionForm.actual_input_unit,
        actual_quantity_ea: actualEa,
        actual_quantity_g: actualG,
        defect_quantity_g: defectG,
        sample_quantity_g: sampleG,
      })

      setShowCompletionModal(false)
      setCompletionTargetRecord(null)
      setCompletionForm(emptyCompletionForm())
      setProductionActionMessage({ tone: 'success', text: '?앹궛 ?꾨즺媛 ??λ릺?덉뒿?덈떎.' })
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
      ])
    } catch (error) {
      setProductionActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '?앹궛 ?꾨즺 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎.',
      })
    } finally {
      setProductionActionBusy(false)
    }
  }

  function openPlannedEditModal(record: ProductionRecord) {
    const statusCode = normalizeStatusCode(record.status)
    if (statusCode !== 'planned') {
      setProductionActionMessage({ tone: 'warning', text: 'planned 상태에서만 예정수량을 수정할 수 있습니다.' })
      return
    }
    setPlannedEditRecord(record)
    setPlannedEditKg(record.planned_quantity_g && record.planned_quantity_g > 0 ? String(record.planned_quantity_g / 1000) : '')
    setShowPlannedEditModal(true)
  }

  async function savePlannedQuantity() {
    if (!plannedEditRecord) return
    const plannedG = kgToG(plannedEditKg)
    if (plannedG === null || plannedG <= 0) {
      setProductionActionMessage({ tone: 'error', text: '예정 생산량은 0보다 커야 합니다.' })
      return
    }

    setProductionActionBusy(true)
    try {
      await callProductionAction({
        action: 'update_planned',
        record_id: plannedEditRecord.id,
        planned_quantity_g: plannedG,
      })
      setShowPlannedEditModal(false)
      setPlannedEditRecord(null)
      setPlannedEditKg('')
      setProductionActionMessage({ tone: 'success', text: '예정수량이 수정되었습니다.' })
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
      ])
    } catch (error) {
      setProductionActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '예정수량 수정에 실패했습니다.',
      })
    } finally {
      setProductionActionBusy(false)
    }
  }

  function printWorkOrder(record: ProductionRecord) {
    openWindow(`/api/moni/production-records/${record.id}/pdf`)
  }

  async function cancelWorkOrder(record: ProductionRecord) {
    const statusCode = normalizeStatusCode(record.status)
    if (statusCode === 'confirmed') {
      setProductionActionMessage({ tone: 'error', text: '확정된 작업지시서는 취소할 수 없습니다.' })
      return
    }
    if (!(statusCode === 'planned' || statusCode === 'completed')) {
      setProductionActionMessage({ tone: 'error', text: 'planned 또는 completed 상태만 취소할 수 있습니다.' })
      return
    }

    const target = record.lot_number || record.id
    const confirmed = window.confirm(`작업지시서 ${target}를 삭제하시겠습니까?`)
    if (!confirmed) return

    setProductionActionBusy(true)
    try {
      await callProductionAction({
        action: 'cancel',
        record_id: record.id,
      })

      if (completionForm.record_id === record.id) {
        setCompletionForm(emptyCompletionForm())
        setSampleInputRows([makeSampleRow(0)])
      }
      if (plannedEditRecord?.id === record.id) {
        setShowPlannedEditModal(false)
        setPlannedEditRecord(null)
        setPlannedEditKg('')
      }
      if (deductionPreviewRecordId === record.id) {
        setDeductionPreviewRecordId(null)
        setDeductionPreviewRows([])
        setDeductionPreviewSummary(null)
      }

      setProductionActionMessage({ tone: 'success', text: '작업지시서가 삭제되었습니다.' })
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
      ])
    } catch (error) {
      setProductionActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '작업지시서 취소에 실패했습니다.',
      })
    } finally {
      setProductionActionBusy(false)
    }
  }

  async function openDeductionModal(record: ProductionRecord) {
    const statusCode = normalizeStatusCode(record.status)
    if (statusCode !== 'completed') {
      setProductionActionMessage({ tone: 'warning', text: '완료 상태 작업지시서에서만 차감 미리보기를 확인할 수 있습니다.' })
      return
    }

    setShowDeductionModal(true)
    setDeductionModalRecord(record)
    setDeductionModalError('')
    setDeductionModalLoading(true)
    setDeductionPreviewRows([])
    setDeductionPreviewSummary(null)
    setDeductionPreviewRecordId(record.id)

    try {
      const payload = await callProductionAction({
        action: 'preview_confirm',
        record_id: record.id,
      })

      const rows = payload.preview?.materials ?? []
      setDeductionPreviewRows(rows)
      setDeductionPreviewSummary({
        deduction_basis_g: Number(payload.preview?.deduction_basis_g ?? 0),
        entered_quantity_g: Number(payload.preview?.entered_quantity_g ?? 0),
        loss_quantity_g: Number(payload.preview?.loss_quantity_g ?? 0),
        planned_quantity_g:
          payload.preview?.planned_quantity_g === null || payload.preview?.planned_quantity_g === undefined
            ? null
            : Number(payload.preview.planned_quantity_g),
      })
      if (rows.length === 0) setDeductionModalError('차감 대상 원재료가 없습니다.')
    } catch (error) {
      setDeductionModalError(error instanceof Error ? error.message : '원재료 차감 미리보기 조회에 실패했습니다.')
    } finally {
      setDeductionModalLoading(false)
    }
  }

  async function confirmProduction(recordId: string) {
    setProductionActionBusy(true)
    try {
      const payload = await callProductionAction({
        action: 'confirm',
        record_id: recordId,
      })
      setDeductionPreviewRows(payload.deduction?.materials ?? [])
      setDeductionPreviewSummary({
        deduction_basis_g: Number(payload.deduction?.deduction_basis_g ?? 0),
        entered_quantity_g: Number(payload.deduction?.entered_quantity_g ?? 0),
        loss_quantity_g: Number(payload.deduction?.loss_quantity_g ?? 0),
        planned_quantity_g:
          payload.deduction?.planned_quantity_g === null || payload.deduction?.planned_quantity_g === undefined
            ? null
            : Number(payload.deduction.planned_quantity_g),
      })
      setDeductionPreviewRecordId(recordId)
      setShowDeductionModal(false)
      setDeductionModalRecord(null)
      setDeductionModalError('')
      setDeductionPreviewSummary(null)
      setProductionActionMessage({ tone: 'success', text: '생산이 확정되고 원재료가 자동 차감되었습니다.' })
      await Promise.all([
        loadOverview(),
        loadProductionRecords(productionDateFrom, productionDateTo),
        loadMaterials(),
        loadSububu(sububuDateFrom, sububuDateTo),
      ])
    } catch (error) {
      setProductionActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '생산 확정 처리에 실패했습니다.',
      })
    } finally {
      setProductionActionBusy(false)
    }
  }

  async function saveRecipe() {
    if (!selectedRecipeProduct) {
      throw new Error('레시피를 저장할 제품을 먼저 선택해 주세요.')
    }

    const ratioPercent = toNumber(recipeForm.ratio_percent)
    if (ratioPercent === null) {
      throw new Error('배합비율을 입력해 주세요.')
    }

    setRecipeSaving(true)
    try {
      let foodTypeId = recipeForm.food_type_id
      let foodTypeName =
        foodTypes.find((item) => String(item.id) === recipeForm.food_type_id)?.type_name ??
        recipeForm.custom_food_type_name.trim()

      if (!foodTypeName) {
        throw new Error('식품유형을 선택하거나 직접 입력해 주세요.')
      }

      if (!foodTypeId) {
        const foodTypePayload = await readJson<{ foodType?: FoodType }>('/api/moni/food-types', {
          method: 'POST',
          body: JSON.stringify({ type_name: foodTypeName, business_id: '20220523011' }),
        })
        foodTypeId = String(foodTypePayload.foodType?.id ?? '')
        foodTypeName = String(foodTypePayload.foodType?.type_name ?? foodTypeName)
      }

      let mappingName = ''
      let mappingWeight: number | null = null
      let mappingUnit = ''
      let semiProductId = ''

      if (recipeForm.ingredient_type === '반제품') {
        semiProductId = recipeForm.semi_product_id
        mappingName =
          recipeProducts.find((item) => String(item.id) === semiProductId)?.product_name ?? ''
      } else if (recipeForm.raw_material_id === '__new__') {
        const createdMaterial = await readJson<{ material?: RawMaterialRow }>('/api/moni/raw-materials', {
          method: 'POST',
          body: JSON.stringify({
            item_name: recipeForm.custom_raw_material_name.trim(),
            packing_weight_g: toNumber(recipeForm.packing_weight_g),
            business_id: '20220523011',
          }),
        })
        mappingName = createdMaterial.material?.item_name ?? recipeForm.custom_raw_material_name.trim()
        mappingWeight = toNumber(recipeForm.packing_weight_g)
        mappingUnit = recipeForm.packing_unit.trim()
      } else if (recipeForm.raw_material_id) {
        const selectedMaterial = recipeRawMaterials.find(
          (item) => String(item.id) === recipeForm.raw_material_id,
        )
        mappingName = selectedMaterial?.item_name ?? ''
        mappingWeight = selectedMaterial?.packing_weight_g ?? null
        mappingUnit = selectedMaterial?.packing_unit ?? ''
      }

      await readJson('/api/moni/recipes', {
        method: 'POST',
        body: JSON.stringify({
          product_id: String(selectedRecipeProduct.id),
          product_name: selectedRecipeProduct.product_name,
          food_type_id: foodTypeId,
          food_type_name: foodTypeName,
          ratio_percent: ratioPercent,
          ingredient_type: recipeForm.ingredient_type,
          semi_product_id: semiProductId || null,
          sort_order: recipes.length + 1,
          is_active: true,
          business_id: '20220523011',
        }),
      })

      if (mappingName && recipeForm.ingredient_type !== '부재료') {
        await readJson('/api/moni/raw-material-mapping', {
          method: 'POST',
          body: JSON.stringify({
            food_type_id: foodTypeId,
            raw_material_name: mappingName,
            packing_unit: mappingUnit || null,
            packing_weight_g: mappingWeight,
            is_default: true,
            business_id: '20220523011',
          }),
        })
      }

      setRecipeForm(emptyRecipeForm())
      await Promise.all([loadRecipes(selectedRecipeProductId), loadMaterials(), loadFoodTypes()])
    } finally {
      setRecipeSaving(false)
    }
  }

  async function deleteRecipe(id: string) {
    await readJson(`/api/moni/recipes?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    await loadRecipes(selectedRecipeProductId)
  }

  async function saveMaterialDetail() {
    if (!selectedMaterial) return
    setMaterialSaving(true)
    try {
      await readJson(`/api/moni/raw-materials/${selectedMaterial.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          item_name: materialForm.item_name.trim(),
          food_type: materialForm.food_type.trim(),
          country_of_origin: materialForm.country_of_origin.trim(),
          spec: materialForm.spec.trim(),
          storage_type: materialForm.storage_type.trim(),
          shelf_life_days: toNumber(materialForm.shelf_life_days),
          supplier: materialForm.supplier.trim(),
          supplier_contact: materialForm.supplier_contact.trim(),
          supplier_address: materialForm.supplier_address.trim(),
          supplier_biz_number: materialForm.supplier_biz_number.trim(),
        }),
      })
      setShowMaterialModal(false)
      setSelectedMaterial(null)
      await loadMaterials()
    } finally {
      setMaterialSaving(false)
    }
  }

  async function uploadMaterialReceipt(file: File) {
    setMaterialUploadBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/moni/raw-materials/upload', {
        method: 'POST',
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as UploadResult | { error?: string } | null
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || '원재료 입고 업로드에 실패했습니다.')
      }
      setMaterialUploadResult({
        success: Number((payload as UploadResult | null)?.success ?? 0),
        skipped: Number((payload as UploadResult | null)?.skipped ?? 0),
        errors: Array.isArray((payload as UploadResult | null)?.errors)
          ? (payload as UploadResult).errors
          : [],
      })
      await Promise.all([loadMaterials(), loadSububu(sububuDateFrom, sububuDateTo)])
    } finally {
      setMaterialUploadBusy(false)
    }
  }

  async function saveSanitationLog() {
    setSanitationSaving(true)
    try {
      await readJson('/api/moni/sanitation-logs', {
        method: 'POST',
        body: JSON.stringify({
          ...sanitationForm,
          business_id: '20220523011',
        }),
      })
      setShowSanitationModal(false)
      setSanitationForm(emptySanitationForm())
      await loadSanitation(sanitationDateFrom, sanitationDateTo)
    } finally {
      setSanitationSaving(false)
    }
  }

  function openProductionModal() {
    setProductionForm(emptyProductionForm())
    setProductionProductValidation(EMPTY_VALIDATION)
    setProductionQuantityValidation(EMPTY_VALIDATION)
    setProductionDateValidation(EMPTY_VALIDATION)
    setShowProductionModal(true)
  }

  function renderSidebar() {
    return (
      <aside className="hidden w-72 shrink-0 border-r border-gray-800 bg-gray-900/95 md:flex md:flex-col">
        <div className="border-b border-gray-800 px-5 py-5">
          <p className="text-3xl font-bold text-white">Moni</p>
          <p className="mt-1 text-sm text-gray-400">모든 메뉴에서 바로 질문할 수 있는 작업 사이드바입니다.</p>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={() => {
              resetConversation()
              setMainMenu('ai-chat')
            }}
            className="w-full rounded-2xl bg-green-500 px-4 py-3 text-left text-base font-semibold text-white transition hover:bg-green-400"
          >
            + 새 대화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-800/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">History</p>
            <div className="mt-3 space-y-2">
              {conversations.length === 0 ? (
                <p className="rounded-xl bg-gray-900/70 px-3 py-3 text-sm text-gray-500">
                  아직 대화 기록이 없습니다.
                </p>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      conversation.id === activeConversationId
                        ? 'border-green-500 bg-green-500/10 text-white'
                        : 'border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    <p className="truncate font-medium">{conversation.title}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {conversation.messages[conversation.messages.length - 1]?.content ?? '새 대화'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-800/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Active Chat</p>
            <div className="mt-3 space-y-2">
              {chatPreviewMessages.length === 0 ? (
                <p className="rounded-xl bg-gray-900/70 px-3 py-3 text-sm text-gray-500">
                  채팅을 시작하면 최근 대화가 여기에 표시됩니다.
                </p>
              ) : (
                chatPreviewMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-green-500/15 text-green-100'
                        : 'bg-gray-900/80 text-gray-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p className="mt-1 text-[11px] text-gray-500">{formatClock(message.timestamp)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 p-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-800/80 p-3">
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submitChat()
                }
              }}
              rows={3}
              placeholder="모니에게 바로 질문..."
              className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">{companyInfo.company_name || '운영 사업장'}</p>
              <button
                type="button"
                onClick={() => void submitChat()}
                disabled={chatBusy}
                className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-green-400 disabled:opacity-60"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  function renderMobileChatBar() {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800 bg-gray-900/95 md:hidden">
        <button
          type="button"
          onClick={() => setIsChatExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-white">모니에게 바로 질문</p>
            <p className="text-xs text-gray-400">
              {activeConversation?.title || '새 대화'}
            </p>
          </div>
          <span className="text-sm text-gray-300">{isChatExpanded ? '접기' : '펼치기'}</span>
        </button>
        {isChatExpanded ? (
          <div className="border-t border-gray-800 px-4 pb-4 pt-3">
            <div className="max-h-48 space-y-2 overflow-y-auto pb-3">
              {chatPreviewMessages.length === 0 ? (
                <p className="rounded-xl bg-gray-800/80 px-3 py-3 text-sm text-gray-500">
                  최근 대화가 없습니다.
                </p>
              ) : (
                chatPreviewMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-xl px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-green-500/15 text-green-100'
                        : 'bg-gray-800 text-gray-200'
                    }`}
                  >
                    {message.content}
                  </div>
                ))
              )}
            </div>
            <div className="rounded-2xl border border-gray-700 bg-gray-800/80 p-3">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void submitChat()
                  }
                }}
                rows={3}
                placeholder="모니에게 바로 질문..."
                className="w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void submitChat()}
                  disabled={chatBusy}
                  className="rounded-lg bg-green-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  전송
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function renderMainTabs() {
    return (
      <div className="flex flex-wrap gap-2">
        {MAIN_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (item.key === 'audit') {
                router.push('/audit')
                return
              }

              setMainMenu(item.key)
            }}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              mainMenu === item.key
                ? 'border-green-500 bg-green-500 text-white'
                : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  function renderProductionSubTabs() {
    if (mainMenu !== 'production') return null
    return (
      <div className="overflow-x-auto border-b border-gray-800 bg-gray-800/70">
        <div className="flex min-w-max gap-1 px-4 md:px-6">
          {PRODUCTION_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setProductionTab(item.key)}
              className={`h-10 border-b-2 px-4 text-sm font-medium transition ${
                productionTab === item.key
                  ? 'border-green-500 text-green-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  function renderOverviewContent() {
    const filteredRecords = records

    if (overviewLoading && recordsLoading) {
      return <LoadingBlock lines={6} />
    }

    if (overviewError || recordsError) {
      return (
        <EmptyState
          title="생산 데이터를 불러오지 못했습니다"
          description={overviewError || recordsError}
        />
      )
    }

    return (
      <div className="space-y-5">
        <div className="grid gap-4 xl:grid-cols-3">
          <SectionCard
            title="오늘 생산 제품"
            description={overviewSourceTable ? `데이터 소스: ${overviewSourceTable}` : '오늘 생산된 제품 목록입니다.'}
          >
            {todayProducts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {todayProducts.map((product) => (
                  <span
                    key={product}
                    className="rounded-full bg-green-500/15 px-3 py-1 text-sm text-green-300"
                  >
                    {product}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">오늘 생산된 제품이 없습니다.</p>
            )}
          </SectionCard>

          <SectionCard title="총 생산 수량" description="오늘 누적 생산 수량">
            <p className="text-4xl font-bold text-green-400">{formatNumber(todayTotalQuantity)}g</p>
          </SectionCard>

          <SectionCard title="상태별 건수" description="완료 / 진행중 / 예정">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-gray-900/70 px-3 py-2">
                <span className="text-gray-300">완료</span>
                <span className="font-semibold text-green-400">{todayStatusCounts.completed}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-900/70 px-3 py-2">
                <span className="text-gray-300">진행중</span>
                <span className="font-semibold text-amber-300">{todayStatusCounts.inProgress}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-900/70 px-3 py-2">
                <span className="text-gray-300">예정</span>
                <span className="font-semibold text-sky-300">{todayStatusCounts.scheduled}</span>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="생산 실적 / 제조기록서"
          description="최근 제조기록서를 날짜 기준으로 확인합니다."
          actions={
            <>
              <Field label="시작일" className="min-w-[140px]">
                <input
                  type="date"
                  value={productionDateFrom}
                  onChange={(event) => setProductionDateFrom(event.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
              <Field label="종료일" className="min-w-[140px]">
                <input
                  type="date"
                  value={productionDateTo}
                  onChange={(event) => setProductionDateTo(event.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
              <button
                type="button"
                onClick={() => void loadProductionRecords(productionDateFrom, productionDateTo)}
                className="h-[42px] rounded-xl border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
              >
                조회
              </button>
              <button
                type="button"
                onClick={openProductionModal}
                className="h-[42px] rounded-xl bg-green-500 px-4 text-sm font-semibold text-white hover:bg-green-400"
              >
                빠른 실적 입력
              </button>
            </>
          }
        >
          {recordsLoading ? (
            <LoadingBlock lines={5} />
          ) : (
            <ProductionRecordTable
              records={filteredRecords}
              onOpenDetail={setSelectedRecord}
              onOpenPdf={openWindow}
            />
          )}
        </SectionCard>
      </div>
    )
  }

  function renderWorkOrders() {
    return (
      <SectionCard title="작업 지시 / 제조기록서" description="생산 기록 목록과 상세 문서를 확인합니다.">
        {recordsLoading ? (
          <LoadingBlock lines={5} />
        ) : recordsError ? (
          <EmptyState title="생산 기록을 불러오지 못했습니다" description={recordsError} />
        ) : (
          <ProductionRecordTable records={records} onOpenDetail={setSelectedRecord} onOpenPdf={openWindow} />
        )}
      </SectionCard>
    )
  }

  function renderWorkOrdersV2() {
    const hasUnitsForSelectedProduct = productionUnits.length > 0

    return (
      <div className="space-y-5">
        {productionActionMessage ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${messageToneClasses(productionActionMessage.tone)}`}>
            {productionActionMessage.text}
          </div>
        ) : null}

        <SectionCard
          title="작업지시서 생성"
          description="제품을 선택하고 생산단위를 등록/선택한 뒤 예정 생산량(kg)을 입력하면 작업지시서를 생성할 수 있습니다."
        >
          {productionUnitMessage ? (
            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${messageToneClasses(productionUnitMessage.tone)}`}>
              {productionUnitMessage.text}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="제품 선택">
              <select
                value={workOrderForm.product_id}
                onChange={(event) =>
                  setWorkOrderForm((prev) => ({ ...prev, product_id: event.target.value, production_unit_id: '' }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="">제품 선택</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.product_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="생산단위 선택">
              <select
                value={workOrderForm.production_unit_id}
                onChange={(event) =>
                  setWorkOrderForm((prev) => ({ ...prev, production_unit_id: event.target.value }))
                }
                disabled={!workOrderForm.product_id || productionUnitsLoading || !hasUnitsForSelectedProduct}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {productionUnitsLoading
                    ? '생산단위 로딩 중...'
                    : hasUnitsForSelectedProduct
                      ? '생산단위 선택'
                      : '등록된 생산단위 없음'}
                </option>
                {productionUnits.map((unit) => (
                  <option key={unit.id} value={String(unit.id)}>
                    {unit.unit_name} ({formatNumber(unit.unit_weight_g)}g)
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setShowProductionUnitManager((prev) => !prev)
                  setProductionUnitMessage(null)
                }}
                disabled={!workOrderForm.product_id}
                className="h-[42px] w-full rounded-xl border border-gray-700 bg-gray-900 px-4 text-sm font-semibold text-gray-100 hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {showProductionUnitManager ? '생산단위 관리 닫기' : '생산단위 관리'}
              </button>
            </div>

            <Field label="예정 생산량 (kg)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={workOrderForm.planned_quantity_kg}
                onChange={(event) =>
                  setWorkOrderForm((prev) => ({ ...prev, planned_quantity_kg: event.target.value }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
          </div>

          {workOrderForm.product_id && !hasUnitsForSelectedProduct && !productionUnitsLoading ? (
            <p className="mt-3 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              등록된 생산단위가 없습니다. 먼저 생산단위를 추가하세요.
            </p>
          ) : null}

          {workOrderUnitPreview && selectedWorkOrderUnit ? (
            <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs text-gray-300">
              {formatNumber(workOrderUnitPreview.plannedG)}g / {selectedWorkOrderUnit.unit_name}(
              {formatNumber(selectedWorkOrderUnit.unit_weight_g)}g) ={' '}
              <span className="font-semibold text-green-400">
                {formatEaRemainder(workOrderUnitPreview.ea, workOrderUnitPreview.remainderG)}
              </span>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void createWorkOrder()}
              disabled={!canCreateWorkOrder || !hasUnitsForSelectedProduct}
              className="h-[42px] rounded-xl bg-green-500 px-5 text-sm font-semibold text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              작업지시서 생성
            </button>
          </div>

          {showProductionUnitManager ? (
            <div className="mt-4 space-y-4 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">생산단위 관리</h3>
                <button
                  type="button"
                  onClick={resetProductionUnitEditor}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
                >
                  입력 초기화
                </button>
              </div>

              {!workOrderForm.product_id ? (
                <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                  생산단위를 관리하려면 먼저 제품을 선택하세요.
                </p>
              ) : productionUnits.length === 0 ? (
                <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                  등록된 생산단위가 없습니다. 아래에서 새 생산단위를 추가하세요.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-gray-400">
                      <tr className="border-b border-gray-700">
                        <th className="px-3 py-2 font-medium">단위명</th>
                        <th className="px-3 py-2 font-medium">단위중량(g)</th>
                        <th className="px-3 py-2 font-medium">기본단위</th>
                        <th className="px-3 py-2 font-medium">처리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionUnits.map((unit) => (
                        <tr key={unit.id} className="border-b border-gray-800/70">
                          <td className="px-3 py-2 text-white">{unit.unit_name}</td>
                          <td className="px-3 py-2 text-gray-200">{formatNumber(unit.unit_weight_g)}g</td>
                          <td className="px-3 py-2 text-gray-200">
                            {unit.is_default ? (
                              <span className="rounded-md border border-green-700/60 bg-green-950/40 px-2 py-1 text-xs text-green-300">
                                기본
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEditProductionUnit(unit)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteProductionUnit(unit)}
                                disabled={productionUnitSaving}
                                className="rounded-lg border border-red-800/70 px-3 py-1.5 text-xs text-red-200 hover:border-red-600 hover:text-red-100 disabled:opacity-60"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="단위명">
                  <input
                    value={productionUnitForm.unit_name}
                    onChange={(event) =>
                      setProductionUnitForm((prev) => ({ ...prev, unit_name: event.target.value }))
                    }
                    placeholder="예: 1kg 파우치"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </Field>

                <Field label="단위중량(g)">
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={productionUnitForm.unit_weight_g}
                    onChange={(event) =>
                      setProductionUnitForm((prev) => ({ ...prev, unit_weight_g: event.target.value }))
                    }
                    placeholder="예: 1000"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </Field>

                <Field label="기본단위 설정">
                  <label className="flex h-[42px] items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={productionUnitForm.is_default}
                      onChange={(event) =>
                        setProductionUnitForm((prev) => ({ ...prev, is_default: event.target.checked }))
                      }
                      className="size-4 rounded border-gray-600 bg-gray-800 text-green-500"
                    />
                    <span>기본단위로 사용</span>
                  </label>
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {editingProductionUnitId ? (
                  <button
                    type="button"
                    onClick={resetProductionUnitEditor}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
                  >
                    수정 취소
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveProductionUnit()}
                  disabled={productionUnitSaving || !workOrderForm.product_id}
                  className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {productionUnitSaving
                    ? editingProductionUnitId
                      ? '생산단위 수정 저장 중...'
                      : '생산단위 추가 중...'
                    : editingProductionUnitId
                      ? '수정 저장'
                      : '생산단위 추가'}
                </button>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="오늘의 작업지시서 목록"
          description="작업지시서 생성 후 완료 입력, 차감 확인, 확정 순서로 진행합니다."
        >
          {recordsLoading ? (
            <LoadingBlock lines={4} />
          ) : todayWorkOrders.length === 0 ? (
            <EmptyState title="오늘 작업지시서가 없습니다" description="상단에서 먼저 작업지시서를 생성하세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">LOT</th>
                    <th className="px-3 py-2 font-medium">제품명</th>
                    <th className="px-3 py-2 font-medium">예정량</th>
                    <th className="px-3 py-2 font-medium">완료량(g)</th>
                    <th className="px-3 py-2 font-medium">불량량(g)</th>
                    <th className="px-3 py-2 font-medium">샘플량(g)</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {todayWorkOrders.map((record) => {
                    const statusCode = normalizeStatusCode(record.status)
                    const plannedUnitText = formatPlannedUnitForRecord(record)

                    return (
                      <tr key={record.id} className="border-b border-gray-800/80">
                        <td className="px-3 py-3 font-mono text-gray-300">{record.lot_number || '-'}</td>
                        <td className="px-3 py-3 text-white">{record.product_name || '-'}</td>
                        <td className="px-3 py-3 text-gray-200">
                          <div>{formatNumber(record.planned_quantity_g)}g</div>
                          {plannedUnitText ? (
                            <div className="mt-1 text-xs text-gray-400">{plannedUnitText}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-green-400">{formatNumber(record.actual_quantity_g)}g</td>
                        <td className="px-3 py-3 text-amber-300">{formatNumber(record.defect_quantity_g)}g</td>
                        <td className="px-3 py-3 text-blue-300">{formatNumber(record.sample_quantity_g)}g</td>
                        <td className="px-3 py-3 text-gray-200">
                          {statusCode === 'planned'
                            ? '예정'
                            : statusCode === 'in_progress'
                              ? '진행중'
                              : statusCode === 'completed'
                                ? '완료'
                                : statusCode === 'confirmed'
                                  ? '확정'
                                  : statusCode === 'cancelled'
                                    ? '취소'
                                    : normalizeStatus(record.status)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {(statusCode === 'planned' ||
                              statusCode === 'in_progress' ||
                              statusCode === 'completed' ||
                              statusCode === 'confirmed') && (
                              <button
                                type="button"
                                onClick={() => printWorkOrder(record)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                작업지시서 출력
                              </button>
                            )}

                            {(statusCode === 'planned' || statusCode === 'in_progress') && (
                              <button
                                type="button"
                                onClick={() => openPlannedEditModal(record)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                예정수량 수정
                              </button>
                            )}

                            {(statusCode === 'planned' || statusCode === 'in_progress') && (
                              <button
                                type="button"
                                onClick={() => openCompletionModalV2(record)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                완료 입력
                              </button>
                            )}

                            {statusCode === 'completed' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openCompletionModalV2(record)}
                                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                                >
                                  완료량 수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void openDeductionModal(record)}
                                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                                >
                                  차감 확인
                                </button>
                              </>
                            )}

                            {(statusCode === 'planned' || statusCode === 'completed') && (
                              <button
                                type="button"
                                onClick={() => void cancelWorkOrder(record)}
                                disabled={productionActionBusy}
                                className="rounded-lg border border-red-800/70 px-3 py-1.5 text-xs text-red-200 hover:border-red-600 hover:text-red-100 disabled:opacity-60"
                              >
                                취소
                              </button>
                            )}

                            {statusCode === 'confirmed' && (
                              <span className="rounded-lg border border-green-700/60 bg-green-950/40 px-3 py-1.5 text-xs text-green-300">
                                확정 완료
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    )
  }

  function renderWorkOrdersV2Legacy() {
    return (
      <div className="space-y-5">
        {productionActionMessage ? (
          <div className={`rounded-xl border px-4 py-3 text-sm ${messageToneClasses(productionActionMessage.tone)}`}>
            {productionActionMessage.text}
          </div>
        ) : null}

        <SectionCard title="작업지시서 생성" description="제품 선택 후 계획 생산량(kg)을 입력하면 planned 상태로 저장됩니다.">
          {productionUnitMessage ? (
            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${messageToneClasses(productionUnitMessage.tone)}`}>
              {productionUnitMessage.text}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="제품 선택">
              <select
                value={workOrderForm.product_id}
                onChange={(event) =>
                  setWorkOrderForm((prev) => ({ ...prev, product_id: event.target.value, production_unit_id: '' }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="">제품 선택</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.product_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="생산 예정량(kg)">
              <input
                type="number"
                min="0"
                step="0.001"
                value={workOrderForm.planned_quantity_kg}
                onChange={(event) =>
                  setWorkOrderForm((prev) => ({ ...prev, planned_quantity_kg: event.target.value }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>

            <Field label="생산 단위">
              <select
                value={workOrderForm.production_unit_id}
                onChange={(event) =>
                  setWorkOrderForm((prev) => ({ ...prev, production_unit_id: event.target.value }))
                }
                disabled={!workOrderForm.product_id || productionUnitsLoading || productionUnits.length === 0}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {productionUnitsLoading
                    ? '단위 로딩 중...'
                    : productionUnits.length > 0
                      ? '생산 단위 선택'
                      : '등록된 단위 없음'}
                </option>
                {productionUnits.map((unit) => (
                  <option key={unit.id} value={String(unit.id)}>
                    {unit.unit_name} ({formatNumber(unit.unit_weight_g)}g)
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setShowProductionUnitManager((prev) => !prev)
                  setProductionUnitMessage(null)
                }}
                disabled={!workOrderForm.product_id}
                className="relative h-[42px] w-full rounded-xl border border-gray-700 bg-gray-900 px-4 text-sm font-semibold text-transparent hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-100">
                  {showProductionUnitManager ? '생산단위 관리 닫기' : '생산단위 관리'}
                </span>
                작업지시 생성
              </button>
            </div>
          </div>
          {workOrderUnitPreview && selectedWorkOrderUnit ? (
            <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs text-gray-300">
              {formatNumber(workOrderUnitPreview.plannedG)}g / {selectedWorkOrderUnit.unit_name}(
              {formatNumber(selectedWorkOrderUnit.unit_weight_g)}g) ={' '}
              <span className="font-semibold text-green-400">
                {formatEaRemainder(workOrderUnitPreview.ea, workOrderUnitPreview.remainderG)}
              </span>
            </div>
          ) : null}

          {workOrderForm.product_id && productionUnits.length === 0 && !productionUnitsLoading ? (
            <p className="mt-3 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              등록된 생산단위가 없습니다. 먼저 생산단위를 추가하세요.
            </p>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void createWorkOrder()}
              disabled={!canCreateWorkOrder}
              className="h-[42px] rounded-xl bg-green-500 px-5 text-sm font-semibold text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              작업지시서 생성
            </button>
          </div>

          {showProductionUnitManager ? (
            <div className="mt-4 space-y-4 rounded-xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">생산단위 관리</h3>
                <button
                  type="button"
                  onClick={resetProductionUnitEditor}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-white"
                >
                  입력 초기화
                </button>
              </div>

              {productionUnits.length === 0 ? (
                <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
                  등록된 생산단위가 없습니다. 먼저 생산단위를 추가하세요.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-gray-400">
                      <tr className="border-b border-gray-700">
                        <th className="px-3 py-2 font-medium">단위명</th>
                        <th className="px-3 py-2 font-medium">단위중량(g)</th>
                        <th className="px-3 py-2 font-medium">기본단위</th>
                        <th className="px-3 py-2 font-medium">처리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionUnits.map((unit) => (
                        <tr key={unit.id} className="border-b border-gray-800/70">
                          <td className="px-3 py-2 text-white">{unit.unit_name}</td>
                          <td className="px-3 py-2 text-gray-200">{formatNumber(unit.unit_weight_g)}g</td>
                          <td className="px-3 py-2 text-gray-200">
                            {unit.is_default ? (
                              <span className="rounded-md border border-green-700/60 bg-green-950/40 px-2 py-1 text-xs text-green-300">
                                기본
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => startEditProductionUnit(unit)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteProductionUnit(unit)}
                                disabled={productionUnitSaving}
                                className="rounded-lg border border-red-800/70 px-3 py-1.5 text-xs text-red-200 hover:border-red-600 hover:text-red-100 disabled:opacity-60"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="단위명">
                  <input
                    value={productionUnitForm.unit_name}
                    onChange={(event) =>
                      setProductionUnitForm((prev) => ({ ...prev, unit_name: event.target.value }))
                    }
                    placeholder="예: 1kg 파우치"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </Field>

                <Field label="단위중량(g)">
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={productionUnitForm.unit_weight_g}
                    onChange={(event) =>
                      setProductionUnitForm((prev) => ({ ...prev, unit_weight_g: event.target.value }))
                    }
                    placeholder="예: 1000"
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </Field>

                <Field label="기본단위 설정">
                  <label className="flex h-[42px] items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={productionUnitForm.is_default}
                      onChange={(event) =>
                        setProductionUnitForm((prev) => ({ ...prev, is_default: event.target.checked }))
                      }
                      className="size-4 rounded border-gray-600 bg-gray-800 text-green-500"
                    />
                    <span>기본단위로 사용</span>
                  </label>
                </Field>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {editingProductionUnitId ? (
                  <button
                    type="button"
                    onClick={resetProductionUnitEditor}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"
                  >
                    수정 취소
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveProductionUnit()}
                  disabled={productionUnitSaving || !workOrderForm.product_id}
                  className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {productionUnitSaving
                    ? editingProductionUnitId
                      ? '생산단위 수정 저장 중...'
                      : '생산단위 저장 중...'
                    : editingProductionUnitId
                      ? '수정 저장'
                      : '생산단위 추가'}
                </button>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="오늘의 작업지시서 목록"
          description="작업지시서 생성 → 생산 완료 입력 → 확정 순서로 처리합니다."
        >
          {recordsLoading ? (
            <LoadingBlock lines={4} />
          ) : todayWorkOrders.length === 0 ? (
            <EmptyState title="오늘 작업지시서가 없습니다" description="상단에서 새 작업지시서를 먼저 생성해 주세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">제조번호</th>
                    <th className="px-3 py-2 font-medium">제품명</th>
                    <th className="px-3 py-2 font-medium">계획(g)</th>
                    <th className="px-3 py-2 font-medium">완료(g)</th>
                    <th className="px-3 py-2 font-medium">불량(g)</th>
                    <th className="px-3 py-2 font-medium">샘플(g)</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {todayWorkOrders.map((record) => {
                    const statusCode = normalizeStatusCode(record.status)
                    const plannedUnitText = formatPlannedUnitForRecord(record)

                    return (
                      <tr key={record.id} className="border-b border-gray-800/80">
                        <td className="px-3 py-3 font-mono text-gray-300">{record.lot_number || '-'}</td>
                        <td className="px-3 py-3 text-white">{record.product_name || '-'}</td>
                        <td className="px-3 py-3 text-gray-200">
                          <div>{formatNumber(record.planned_quantity_g)}g</div>
                          {plannedUnitText ? (
                            <div className="mt-1 text-xs text-gray-400">{plannedUnitText}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-green-400">{formatNumber(record.actual_quantity_g)}g</td>
                        <td className="px-3 py-3 text-amber-300">{formatNumber(record.defect_quantity_g)}g</td>
                        <td className="px-3 py-3 text-blue-300">{formatNumber(record.sample_quantity_g)}g</td>
                        <td className="px-3 py-3 text-gray-200">
                          {statusCode === 'planned'
                            ? '예정'
                            : statusCode === 'in_progress'
                              ? '진행중'
                              : statusCode === 'completed'
                                ? '완료'
                                : statusCode === 'confirmed'
                                  ? '확정'
                                  : statusCode === 'cancelled'
                                    ? '취소'
                                    : normalizeStatus(record.status)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {(statusCode === 'planned' ||
                              statusCode === 'in_progress' ||
                              statusCode === 'completed' ||
                              statusCode === 'confirmed') && (
                              <button
                                type="button"
                                onClick={() => printWorkOrder(record)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                작업지시서 출력
                              </button>
                            )}

                            {(statusCode === 'planned' || statusCode === 'in_progress') && (
                              <button
                                type="button"
                                onClick={() => openPlannedEditModal(record)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                예정수량 수정
                              </button>
                            )}

                            {(statusCode === 'planned' || statusCode === 'in_progress') && (
                              <button
                                type="button"
                                onClick={() => openCompletionModalV2(record)}
                                className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                              >
                                완료 입력
                              </button>
                            )}

                            {statusCode === 'completed' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openCompletionModalV2(record)}
                                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                                >
                                  완료량 수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void openDeductionModal(record)}
                                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                                >
                                  차감 확인
                                </button>
                              </>
                            )}

                            {(statusCode === 'planned' || statusCode === 'completed') && (
                              <button
                                type="button"
                                onClick={() => void cancelWorkOrder(record)}
                                disabled={productionActionBusy}
                                className="rounded-lg border border-red-800/70 px-3 py-1.5 text-xs text-red-200 hover:border-red-600 hover:text-red-100 disabled:opacity-60"
                              >
                                취소
                              </button>
                            )}

                            {statusCode === 'confirmed' && (
                              <span className="rounded-lg border border-green-700/60 bg-green-950/40 px-3 py-1.5 text-xs text-green-300">
                                확정 완료
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </div>
    )
  }

  function renderRecipeManagement() {
    return (
      <div className="space-y-5">
        <SectionCard
          title="레시피 관리"
          description="제품별 배합비율과 실제원료 매핑을 관리합니다."
          actions={
            <Field label="제품 선택" className="min-w-[240px]">
              <select
                value={selectedRecipeProductId}
                onChange={(event) => setSelectedRecipeProductId(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="">제품 선택</option>
                {recipeProducts.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.product_name}
                  </option>
                ))}
              </select>
            </Field>
          }
        >
          {recipesLoading && !selectedRecipeProductId ? (
            <LoadingBlock lines={5} />
          ) : recipesError ? (
            <EmptyState title="레시피 데이터를 불러오지 못했습니다" description={recipesError} />
          ) : recipes.length === 0 ? (
            <EmptyState
              title="선택한 제품에 레시피가 없습니다"
              description="아래 입력 폼에서 첫 레시피 항목을 추가해 주세요."
            />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-gray-400">
                    <tr className="border-b border-gray-700">
                      <th className="px-3 py-2 font-medium">순서</th>
                      <th className="px-3 py-2 font-medium">식품유형명</th>
                      <th className="px-3 py-2 font-medium">배합비율(%)</th>
                      <th className="px-3 py-2 font-medium">실제원료</th>
                      <th className="px-3 py-2 font-medium">재료유형</th>
                      <th className="px-3 py-2 font-medium">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map((recipe) => {
                      const mappingList = recipeMappingsByFoodType.get(String(recipe.food_type_id)) ?? []
                      const semiProductName =
                        recipe.ingredient_type === '반제품' && recipe.semi_product_id
                          ? recipeProducts.find((item) => String(item.id) === String(recipe.semi_product_id))
                              ?.product_name ?? '-'
                          : null
                      const actualMaterial =
                        semiProductName ||
                        (mappingList.length > 0
                          ? mappingList.map((item) => item.raw_material_name).join(', ')
                          : '-')
                      return (
                        <tr key={recipe.id} className="border-b border-gray-800/80">
                          <td className="px-3 py-3 text-gray-300">{recipe.sort_order}</td>
                          <td className="px-3 py-3 text-white">{recipe.food_type_name}</td>
                          <td className="px-3 py-3 text-green-400">{recipe.ratio_percent}%</td>
                          <td className="px-3 py-3 text-gray-200">{actualMaterial}</td>
                          <td className="px-3 py-3 text-gray-200">{recipe.ingredient_type || '원재료'}</td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => void deleteRecipe(recipe.id)}
                              className="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/50"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  recipeRatioDiff === 0
                    ? 'border-green-700/60 bg-green-950/40 text-green-200'
                    : recipeRatioDiff > 0
                      ? 'border-red-800/60 bg-red-950/40 text-red-200'
                      : 'border-amber-700/60 bg-amber-950/30 text-amber-200'
                }`}
              >
                {recipeRatioDiff === 0
                  ? `총 ${recipeRatioRoundedTotal.toFixed(2)}% / 정상`
                  : recipeRatioDiff > 0
                    ? `총 ${recipeRatioRoundedTotal.toFixed(2)}% - ${Math.abs(recipeRatioDiff).toFixed(2)}% 초과`
                    : `총 ${recipeRatioRoundedTotal.toFixed(2)}% - ${Math.abs(recipeRatioDiff).toFixed(2)}% 부족`}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="레시피 항목 추가" description="식품유형과 실제원료를 연결해서 새 배합 항목을 만듭니다.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="재료유형">
              <select
                value={recipeForm.ingredient_type}
                onChange={(event) =>
                  setRecipeForm((prev) => ({
                    ...prev,
                    ingredient_type: event.target.value,
                    semi_product_id: '',
                    raw_material_id: '',
                    custom_raw_material_name: '',
                  }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="원재료">원재료</option>
                <option value="반제품">반제품</option>
                <option value="부재료">부재료</option>
              </select>
            </Field>

            <Field label="식품유형 선택">
              <select
                value={recipeForm.food_type_id}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, food_type_id: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="">선택 또는 직접입력</option>
                {foodTypes.map((foodType) => (
                  <option key={foodType.id} value={foodType.id}>
                    {foodType.type_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="새 식품유형명">
              <input
                value={recipeForm.custom_food_type_name}
                onChange={(event) =>
                  setRecipeForm((prev) => ({ ...prev, custom_food_type_name: event.target.value }))
                }
                placeholder="예: 양조간장"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>

            <Field label="배합비율(%)">
              <input
                type="number"
                step="0.1"
                value={recipeForm.ratio_percent}
                onChange={(event) => setRecipeForm((prev) => ({ ...prev, ratio_percent: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>

            {recipeForm.ingredient_type === '반제품' ? (
              <Field label="반제품 선택" className="md:col-span-2">
                <select
                  value={recipeForm.semi_product_id}
                  onChange={(event) => setRecipeForm((prev) => ({ ...prev, semi_product_id: event.target.value }))}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                >
                  <option value="">반제품 선택</option>
                  {recipeProducts.map((product) => (
                    <option key={product.id} value={String(product.id)}>
                      {product.product_name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="실제원료" className="md:col-span-2">
                <select
                  value={recipeForm.raw_material_id}
                  onChange={(event) => setRecipeForm((prev) => ({ ...prev, raw_material_id: event.target.value }))}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                >
                  <option value="">선택 안 함</option>
                  {recipeRawMaterials.map((material) => (
                    <option key={material.id} value={String(material.id)}>
                      {material.item_name}
                    </option>
                  ))}
                  <option value="__new__">+ 새 원재료 추가</option>
                </select>
              </Field>
            )}

            {recipeForm.raw_material_id === '__new__' ? (
              <>
                <Field label="새 원재료명">
                  <input
                    value={recipeForm.custom_raw_material_name}
                    onChange={(event) =>
                      setRecipeForm((prev) => ({ ...prev, custom_raw_material_name: event.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                  <ValidationMessage
                    validation={recipeRawMaterialValidation}
                    onApply={
                      recipeRawMaterialValidation.suggestion
                        ? () =>
                            setRecipeForm((prev) => ({
                              ...prev,
                              custom_raw_material_name: recipeRawMaterialValidation.suggestion ?? prev.custom_raw_material_name,
                            }))
                        : null
                    }
                  />
                </Field>
                <Field label="패킹단위">
                  <input
                    value={recipeForm.packing_unit}
                    onChange={(event) => setRecipeForm((prev) => ({ ...prev, packing_unit: event.target.value }))}
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </Field>
                <Field label="패킹중량(g)">
                  <input
                    type="number"
                    value={recipeForm.packing_weight_g}
                    onChange={(event) =>
                      setRecipeForm((prev) => ({ ...prev, packing_weight_g: event.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                </Field>
              </>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void saveRecipe()}
              disabled={recipeSaving || !selectedRecipeProductId}
              className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
            >
              {recipeSaving ? '저장 중...' : '레시피 추가'}
            </button>
          </div>
        </SectionCard>
      </div>
    )
  }

  function renderMaterialsManagement() {
    const sububuPdfParams = new URLSearchParams({
      from: sububuDateFrom,
      to: sububuDateTo,
    })
    if (sububuMaterialQuery.trim()) sububuPdfParams.set('material_name', sububuMaterialQuery.trim())
    const sububuPdfUrl = `/api/moni/sububu/pdf?${sububuPdfParams.toString()}`

    return (
      <div className="space-y-5">
        <SectionCard
          title="원재료 관리"
          description="원재료 재고와 규격 정보를 확인하고 수정합니다."
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowMaterialUpload((prev) => !prev)}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
              >
                원재료 입고 등록
              </button>
              <button
                type="button"
                onClick={() => window.alert('수동 입고 등록은 다음 단계에서 연결 예정입니다.')}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
              >
                수동 입고 등록
              </button>
            </>
          }
        >
          {showMaterialUpload ? (
            <div className="mb-5 rounded-2xl border border-gray-700 bg-gray-900/70 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openWindow('/api/moni/raw-materials/template')}
                  className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400"
                >
                  템플릿 다운로드
                </button>
                <label className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white">
                  파일 업로드
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void uploadMaterialReceipt(file)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                {materialUploadBusy ? <span className="text-sm text-gray-400">업로드 중...</span> : null}
              </div>
              {materialUploadResult ? (
                <div className="mt-4 rounded-xl border border-gray-700 bg-gray-800/70 p-3 text-sm text-gray-200">
                  <p>성공 {materialUploadResult.success}건 / 스킵 {materialUploadResult.skipped}건</p>
                  {materialUploadResult.errors.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-red-200">
                      {materialUploadResult.errors.map((error, index) => (
                        <p key={`${error}-${index}`}>{error}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm">
            <p className="text-gray-300">
              원재료 총 <span className="font-semibold text-white">{formatNumber(materialsSummary.total)}</span>개 / 활성{' '}
              <span className="font-semibold text-green-300">{formatNumber(materialsSummary.active)}</span>개 / 비활성{' '}
              <span className="font-semibold text-amber-300">{formatNumber(materialsSummary.inactive)}</span>개
            </p>
            <div className="inline-flex rounded-xl border border-gray-700 bg-gray-950 p-1">
              <button
                type="button"
                onClick={() => setMaterialsView('active')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  materialsView === 'active' ? 'bg-green-500 text-white' : 'text-gray-300 hover:text-white'
                }`}
              >
                활성 원재료
              </button>
              <button
                type="button"
                onClick={() => setMaterialsView('inactive')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  materialsView === 'inactive' ? 'bg-green-500 text-white' : 'text-gray-300 hover:text-white'
                }`}
              >
                비활성 원재료
              </button>
            </div>
          </div>

          {materialsLoading ? (
            <LoadingBlock lines={6} />
          ) : materialsError ? (
            <EmptyState title="원재료 목록을 불러오지 못했습니다" description={materialsError} />
          ) : materials.length === 0 ? (
            <EmptyState title="등록된 원재료가 없습니다" description="원재료 입고 등록으로 첫 데이터를 넣어 주세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">원재료명</th>
                    <th className="px-3 py-2 font-medium">식품유형</th>
                    <th className="px-3 py-2 font-medium">원산지</th>
                    <th className="px-3 py-2 font-medium">규격</th>
                    <th className="px-3 py-2 font-medium">보관</th>
                    <th className="px-3 py-2 font-medium">소비기한</th>
                    <th className="px-3 py-2 font-medium">현재재고</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((material) => (
                    <tr
                      key={material.id}
                      className="cursor-pointer border-b border-gray-800/80 transition hover:bg-gray-700/20"
                      onClick={() => {
                        setSelectedMaterial(material)
                        setMaterialForm(emptyMaterialForm(material))
                        setShowMaterialModal(true)
                      }}
                    >
                      <td className="px-3 py-3 text-white">{material.item_name}</td>
                      <td className="px-3 py-3 text-gray-200">{material.food_type || material.food_type_name || '-'}</td>
                      <td className="px-3 py-3 text-gray-200">{material.country_of_origin || '-'}</td>
                      <td className="px-3 py-3 text-gray-200">{material.spec || material.packing_unit || '-'}</td>
                      <td className="px-3 py-3 text-gray-200">{material.storage_type || '-'}</td>
                      <td className="px-3 py-3 text-gray-200">
                        {material.shelf_life_days ? `${material.shelf_life_days}일` : '-'}
                      </td>
                      <td className="px-3 py-3 text-green-400">{formatNumber(material.current_stock_g)}g</td>
                      <td className="px-3 py-3">
                        {material.is_active === false ? (
                          <span className="rounded-md border border-amber-700/60 bg-amber-950/40 px-2 py-1 text-xs text-amber-200">비활성</span>
                        ) : (
                          <span className="rounded-md border border-green-700/60 bg-green-950/40 px-2 py-1 text-xs text-green-200">활성</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedMaterial(material)
                              setMaterialForm(emptyMaterialForm(material))
                              setShowMaterialModal(true)
                            }}
                            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                          >
                            수정
                          </button>
                          {material.is_active === false ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                void toggleRawMaterialActive(material, true)
                              }}
                              disabled={materialSaving}
                              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-green-200 disabled:opacity-60"
                            >
                              다시 활성화
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                void toggleRawMaterialActive(material, false)
                              }}
                              disabled={materialSaving}
                              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-red-500 hover:text-red-200 disabled:opacity-60"
                            >
                              비활성화
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="수불부 조회"
          description="생산 기록과 레시피를 기준으로 원재료 사용량을 계산합니다."
          actions={
            <>
              <Field label="시작일" className="min-w-[140px]">
                <input
                  type="date"
                  value={sububuDateFrom}
                  onChange={(event) => setSububuDateFrom(event.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
              <Field label="종료일" className="min-w-[140px]">
                <input
                  type="date"
                  value={sububuDateTo}
                  onChange={(event) => setSububuDateTo(event.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
              <Field label="원료명 검색" className="min-w-[180px]">
                <input
                  type="text"
                  value={sububuMaterialQuery}
                  onChange={(event) => setSububuMaterialQuery(event.target.value)}
                  placeholder="예: 설탕, 간장"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
              <button
                type="button"
                onClick={() => void loadSububu(sububuDateFrom, sububuDateTo, sububuMaterialQuery)}
                className="h-[42px] rounded-xl border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
              >
                조회
              </button>
              <button
                type="button"
                onClick={() => openWindow(sububuPdfUrl)}
                className="h-[42px] rounded-xl bg-green-500 px-4 text-sm font-semibold text-white hover:bg-green-400"
              >
                PDF 출력
              </button>
            </>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-3 text-sm text-gray-300">
            <span>
              조회 기간: <strong className="text-white">{sububuDateFrom}</strong> ~ <strong className="text-white">{sububuDateTo}</strong>
            </span>
            <span>
              총 생산량: <strong className="text-green-400">{formatNumber(sububuTotalProductionG)}g</strong>
            </span>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            원료명을 클릭하면 기간별 입고/소모 상세 내역(가계부 형태)을 확인할 수 있습니다.
          </p>
          {sububuLoading ? (
            <LoadingBlock lines={4} />
          ) : sububuError ? (
            <EmptyState title="수불부를 불러오지 못했습니다" description={sububuError} />
          ) : sububuMaterials.length === 0 ? (
            <EmptyState title="해당 기간의 수불부 데이터가 없습니다" description="생산기록과 레시피가 있어야 계산됩니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">원재료명</th>
                    <th className="px-3 py-2 font-medium">사용량(g)</th>
                    <th className="px-3 py-2 font-medium">사용량(kg)</th>
                    <th className="px-3 py-2 font-medium">투입 제품 수</th>
                    <th className="px-3 py-2 font-medium">투입 횟수</th>
                  </tr>
                </thead>
                <tbody>
                  {sububuMaterials.map((material) => (
                    <tr key={material.food_type_name} className="border-b border-gray-800/80">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => void openSububuDetail(material.food_type_name)}
                          className="text-left font-medium text-green-300 underline underline-offset-4 hover:text-green-200"
                        >
                          {material.food_type_name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-green-400">{formatNumber(material.total_usage_g)}g</td>
                      <td className="px-3 py-3 text-gray-200">{formatKg(material.total_usage_g)}kg</td>
                      <td className="px-3 py-3 text-gray-200">{material.products_used.length}</td>
                      <td className="px-3 py-3 text-gray-200">{material.usage_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    )
  }

  function recipeMappingStatusText(status: RecipeMaterialMappingRow['mapping_status']) {
    if (status === 'mapped') return '연결 완료'
    if (status === 'name_fallback') return '이름으로 임시 연결'
    if (status === 'needs_review') return '확인 필요'
    return '미처리'
  }

  function recipeMappingScopeText(scope: RecipeMaterialMappingRow['applied_scope'] | RecipeMappingHistoryItem['mapping_scope']) {
    if (scope === 'recipe') return '이 레시피에만'
    if (scope === 'product') return '이 제품에 적용'
    if (scope === 'global') return '같은 식품유형 전체'
    if (scope === 'fallback') return '이름으로 임시 연결'
    return '-'
  }

  function renderRecipeMaterialMapping() {
    const broadLabels = ['소스', '복합조미식품', '기타가공품', '조미식품', '추출가공식품', '수산물가공품', '육류가공품']

    return (
      <div className="space-y-5">
        <SectionCard
          title="레시피 원재료 연결"
          description="레시피 항목을 실제 원재료 상품명으로 직접 연결합니다."
          actions={
            <button
              type="button"
              onClick={() => {
                void Promise.all([loadRecipeMaterialMappings(), loadLatestRecipeMappingHistory()])
              }}
              className="h-[42px] rounded-xl border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
            >
              새로고침
            </button>
          }
        >
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field label="제품명 검색">
              <input
                value={recipeMappingProductQuery}
                onChange={(event) => setRecipeMappingProductQuery(event.target.value)}
                placeholder="예: 매콤다대기"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <Field label="레시피 항목명 검색">
              <input
                value={recipeMappingItemQuery}
                onChange={(event) => setRecipeMappingItemQuery(event.target.value)}
                placeholder="예: 소스, 대파"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <Field label="처리 상태">
              <select
                value={recipeMappingStatusFilter}
                onChange={(event) => setRecipeMappingStatusFilter(event.target.value as typeof recipeMappingStatusFilter)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="all">전체</option>
                <option value="pending">처리 필요</option>
                <option value="mapped">연결 완료</option>
                <option value="unmapped">미처리</option>
                <option value="name_fallback">이름으로 임시 연결</option>
                <option value="needs_review">확인 필요</option>
              </select>
            </Field>
            <Field label="적용 범위">
              <select
                value={recipeMappingScopeFilter}
                onChange={(event) => setRecipeMappingScopeFilter(event.target.value as typeof recipeMappingScopeFilter)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="all">전체</option>
                <option value="recipe">레시피별</option>
                <option value="product">제품별</option>
                <option value="global">글로벌</option>
                <option value="fallback">임시 연결</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={recipeMappingBroadOnly}
                onChange={(event) => setRecipeMappingBroadOnly(event.target.checked)}
                className="size-4 rounded border-gray-600 bg-gray-800 text-green-500"
              />
              포괄 항목만 보기
            </label>
          </div>

          <div className="mb-4 rounded-xl border border-cyan-700/40 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-100">
            <p className="mb-2 font-semibold">최근 처리 이력</p>
            {recipeMappingHistoryLoading ? (
              <div className="animate-pulse text-cyan-200">최근 처리 내역을 불러오는 중...</div>
            ) : recipeMappingLatestHistory ? (
              <div className="space-y-1 text-xs md:text-sm">
                <p>
                  제품명: <span className="text-white">{recipeMappingLatestHistory.product_name || '-'}</span>
                </p>
                <p>
                  레시피 항목명:{' '}
                  <span className="text-white">{recipeMappingLatestHistory.recipe_item_name || recipeMappingLatestHistory.food_type_name || '-'}</span>
                </p>
                <p>
                  선택 원재료: <span className="text-white">{recipeMappingLatestHistory.raw_material_name}</span>
                </p>
                <p>
                  적용 범위: <span className="text-white">{recipeMappingScopeText(recipeMappingLatestHistory.mapping_scope)}</span>
                </p>
                <p>
                  처리 시간: <span className="text-white">{formatDateTime(recipeMappingLatestHistory.created_at)}</span>
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => void undoLatestRecipeMapping()}
                    disabled={recipeMappingUndoing}
                    className="rounded-lg border border-cyan-600 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:border-cyan-400 hover:text-white disabled:opacity-60"
                  >
                    {recipeMappingUndoing ? '되돌리는 중...' : '되돌리기'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-cyan-200">아직 처리 이력이 없습니다.</p>
            )}
            {recipeMappingHistoryWarning ? <p className="mt-2 text-xs text-amber-200">{recipeMappingHistoryWarning}</p> : null}
          </div>

          <p className="mb-4 text-xs text-gray-400">포괄 항목 기준: {broadLabels.join(', ')}</p>

          {recipeMappingLoading ? (
            <LoadingBlock lines={6} />
          ) : recipeMappingError ? (
            <EmptyState title="연결 목록을 불러오지 못했습니다" description={recipeMappingError} />
          ) : recipeMappingRows.length === 0 ? (
            <EmptyState title="표시할 매핑 대상이 없습니다" description="필터를 조정하거나 조회 버튼을 눌러 다시 불러오세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">제품명</th>
                    <th className="px-3 py-2 font-medium">현재 레시피 항목명</th>
                    <th className="px-3 py-2 font-medium">식품유형명</th>
                    <th className="px-3 py-2 font-medium">배합비율</th>
                    <th className="px-3 py-2 font-medium">현재 매핑 원재료</th>
                    <th className="px-3 py-2 font-medium">매핑 상태</th>
                    <th className="px-3 py-2 font-medium">적용 범위</th>
                    <th className="px-3 py-2 font-medium">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {recipeMappingRows.map((row) => (
                    <tr key={`${row.recipe_id}-${row.food_type_id}`} className="border-b border-gray-800/80">
                      <td className="px-3 py-3 text-white">{row.product_name}</td>
                      <td className="px-3 py-3 text-gray-200">{row.recipe_item_name}</td>
                      <td className="px-3 py-3 text-gray-200">{row.food_type_name}</td>
                      <td className="px-3 py-3 text-green-400">{Number(row.ratio_percent).toFixed(2)}%</td>
                      <td className="px-3 py-3 text-gray-200">{row.current_raw_material_name || '-'}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200">
                          {recipeMappingStatusText(row.mapping_status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-300">{recipeMappingScopeText(row.applied_scope)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => openRecipeMappingModal(row)}
                          className="rounded-lg border border-green-700/70 px-3 py-1.5 text-xs text-green-200 hover:border-green-500 hover:text-white"
                        >
                          연결 처리
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    )
  }

  function renderSanitation() {
    return (
      <SectionCard
        title="위생점검"
        description="위생점검 일지를 조회하고 오늘 기록을 바로 남길 수 있습니다."
        actions={
          <>
            <Field label="시작일" className="min-w-[140px]">
              <input
                type="date"
                value={sanitationDateFrom}
                onChange={(event) => setSanitationDateFrom(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <Field label="종료일" className="min-w-[140px]">
              <input
                type="date"
                value={sanitationDateTo}
                onChange={(event) => setSanitationDateTo(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <button
              type="button"
              onClick={() => void loadSanitation(sanitationDateFrom, sanitationDateTo)}
              className="h-[42px] rounded-xl border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
            >
              조회
            </button>
            <button
              type="button"
              onClick={() => {
                setSanitationForm(emptySanitationForm())
                setShowSanitationModal(true)
              }}
              className="h-[42px] rounded-xl bg-green-500 px-4 text-sm font-semibold text-white hover:bg-green-400"
            >
              오늘 위생점검 기록
            </button>
          </>
        }
      >
        {sanitationLoading ? (
          <LoadingBlock lines={5} />
        ) : sanitationError ? (
          <EmptyState title="위생점검 일지를 불러오지 못했습니다" description={sanitationError} />
        ) : sanitationLogs.length === 0 ? (
          <EmptyState title="위생점검 기록이 없습니다" description="오늘 위생점검 기록 버튼으로 첫 기록을 남겨 주세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-gray-400">
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 font-medium">날짜</th>
                  <th className="px-3 py-2 font-medium">점검자</th>
                  <th className="px-3 py-2 font-medium">종합결과</th>
                  <th className="px-3 py-2 font-medium">상세보기</th>
                  <th className="px-3 py-2 font-medium">PDF출력</th>
                </tr>
              </thead>
              <tbody>
                {sanitationLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800/80">
                    <td className="px-3 py-3 text-white">{log.check_date}</td>
                    <td className="px-3 py-3 text-gray-200">{log.checker_name}</td>
                    <td className="px-3 py-3 text-gray-200">{log.overall_result || '-'}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSanitationLog(log)}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                      >
                        상세보기
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => openWindow(`/api/moni/sanitation-logs/${log.id}/pdf`)}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    )
  }

  function renderPackagingManagement() {
    return (
      <SectionCard
        title="부재료 관리"
        description="포장재/부재료는 packaging_materials 기준으로 관리합니다."
        actions={
          <button
            type="button"
            onClick={() => {
              setPackagingError('')
              setPackagingForm(emptyPackagingForm())
              setShowPackagingModal(true)
            }}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400"
          >
            부재료 추가
          </button>
        }
      >
        {packagingError ? (
          <div className="mb-4 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {packagingError}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3 text-sm">
          <p className="text-gray-300">
            부재료 총 <span className="font-semibold text-white">{formatNumber(packagingSummary.total)}</span>개 / 활성{' '}
            <span className="font-semibold text-green-300">{formatNumber(packagingSummary.active)}</span>개 / 비활성{' '}
            <span className="font-semibold text-amber-300">{formatNumber(packagingSummary.inactive)}</span>개
          </p>
          <div className="inline-flex rounded-xl border border-gray-700 bg-gray-950 p-1">
            <button
              type="button"
              onClick={() => setPackagingView('active')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                packagingView === 'active' ? 'bg-green-500 text-white' : 'text-gray-300 hover:text-white'
              }`}
            >
              활성 부재료
            </button>
            <button
              type="button"
              onClick={() => setPackagingView('inactive')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                packagingView === 'inactive' ? 'bg-green-500 text-white' : 'text-gray-300 hover:text-white'
              }`}
            >
              비활성 부재료
            </button>
          </div>
        </div>

        {packagingLoading ? (
          <LoadingBlock lines={6} />
        ) : packagingMaterials.length === 0 ? (
          <EmptyState title="등록된 부재료가 없습니다" description="부재료 추가 버튼으로 첫 항목을 등록해 주세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-gray-400">
                <tr className="border-b border-gray-700">
                  <th className="px-3 py-2 font-medium">부재료명</th>
                  <th className="px-3 py-2 font-medium">코드</th>
                  <th className="px-3 py-2 font-medium">규격</th>
                  <th className="px-3 py-2 font-medium">유형</th>
                  <th className="px-3 py-2 font-medium">매입처</th>
                  <th className="px-3 py-2 font-medium">현재재고(ea)</th>
                  <th className="px-3 py-2 font-medium">단가</th>
                  <th className="px-3 py-2 font-medium">활성상태</th>
                  <th className="px-3 py-2 font-medium text-right">처리</th>
                </tr>
              </thead>
              <tbody>
                {packagingMaterials.map((material) => (
                  <tr key={material.id} className="border-b border-gray-800/80">
                    <td className="px-3 py-3 text-white">{material.material_name}</td>
                    <td className="px-3 py-3 text-gray-200">{material.material_code || '-'}</td>
                    <td className="px-3 py-3 text-gray-200">{material.spec || '-'}</td>
                    <td className="px-3 py-3 text-gray-200">{material.material_type || '-'}</td>
                    <td className="px-3 py-3 text-gray-200">{material.supplier || '-'}</td>
                    <td className="px-3 py-3 text-green-400">{formatNumber(material.current_stock)} ea</td>
                    <td className="px-3 py-3 text-gray-200">{formatNumber(material.unit_price)}</td>
                    <td className="px-3 py-3">
                      {material.is_active === false ? (
                        <span className="rounded-md border border-red-800/60 bg-red-950/40 px-2 py-1 text-xs text-red-200">비활성</span>
                      ) : (
                        <span className="rounded-md border border-green-700/60 bg-green-950/40 px-2 py-1 text-xs text-green-200">활성</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => editPackagingMaterial(material)}
                          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-white"
                        >
                          수정
                        </button>
                        {material.is_active === false ? (
                          <button
                            type="button"
                            onClick={() => void togglePackagingMaterialActive(material, true)}
                            disabled={packagingSaving}
                            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-green-500 hover:text-green-200 disabled:opacity-60"
                          >
                            다시 활성화
                          </button>
                        ) : null}
                        {material.is_active === false ? null : (
                          <button
                            type="button"
                            onClick={() => void togglePackagingMaterialActive(material, false)}
                            disabled={packagingSaving}
                            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-red-500 hover:text-red-200 disabled:opacity-60"
                          >
                            비활성화
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    )
  }

  function renderQuality() {
    const completed = records.filter((record) => normalizeInspection(record.inspection_result) === '적합').length
    const failed = records.filter((record) => normalizeInspection(record.inspection_result) === '부적합').length

    return (
      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title="검사 결과 요약" description="최근 제조기록서 기준 상태 집계입니다.">
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-900/70 px-4 py-3">
              <p className="text-sm text-gray-400">적합</p>
              <p className="mt-1 text-3xl font-bold text-green-400">{completed}</p>
            </div>
            <div className="rounded-xl bg-gray-900/70 px-4 py-3">
              <p className="text-sm text-gray-400">부적합</p>
              <p className="mt-1 text-3xl font-bold text-red-300">{failed}</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="문서 바로가기" description="품질 관련 PDF를 바로 열 수 있습니다.">
          <div className="space-y-2">
            {records.slice(0, 5).map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => openWindow(`/api/moni/production-records/${record.id}/pdf`)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-700 bg-gray-900/60 px-4 py-3 text-left text-sm text-gray-200 hover:border-green-500 hover:text-white"
              >
                <span>{record.product_name}</span>
                <span className="text-gray-500">{record.lot_number}</span>
              </button>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="운영 메모" description="품질 관리 다음 단계 연결 전 임시 안내입니다.">
          <div className="rounded-xl bg-gray-900/70 p-4 text-sm leading-6 text-gray-300">
            검사결과가 부적합인 제조기록서는 생산 개요와 작업 지시 탭에서 바로 PDF를 열어 확인할 수 있습니다.
            다음 단계에서는 품질 이슈 메모와 개선조치 추적을 이 영역에 연결하면 됩니다.
          </div>
        </SectionCard>
      </div>
    )
  }

  function renderCompliance() {
    return (
      <SectionCard title="규정준수 모니터" description="식약처 동기화와 규정 준수 현황을 확인합니다.">
        <ComplianceMonitor />
      </SectionCard>
    )
  }

  function renderProductionSurface() {
    if (productionTab === 'prod-overview') return renderOverviewContent()
    if (productionTab === 'prod-work') return renderWorkOrdersV2()
    if (productionTab === 'prod-recipes') return renderRecipeManagement()
    if (productionTab === 'prod-recipe-mapping') return renderRecipeMaterialMapping()
    if (productionTab === 'prod-materials') return renderMaterialsManagement()
    if (productionTab === 'prod-packaging') return renderPackagingManagement()
    if (productionTab === 'prod-sanitation') return renderSanitation()
    if (productionTab === 'prod-quality') return renderQuality()
    return renderCompliance()
  }

  function renderAiChatSurface() {
    const messages = activeConversation?.messages ?? []

    return (
      <div className="flex h-full min-h-[calc(100vh-154px)] flex-col rounded-[28px] border border-gray-800 bg-gray-800/70">
        <div className="border-b border-gray-800 px-6 py-5">
          <h1 className="text-2xl font-semibold text-white">AI 채팅</h1>
          <p className="mt-1 text-sm text-gray-400">
            생산, 원재료, 위생점검 데이터를 보면서 바로 질문할 수 있습니다.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-full border border-green-500/40 bg-green-500/10 px-5 py-2 text-sm font-semibold text-green-300">
                Moni
              </div>
              <h2 className="mt-5 text-4xl font-bold text-white">지금 바로 같이 정리해봅시다.</h2>
              <p className="mt-3 max-w-2xl text-base text-gray-400">
                생산관리, 수불부, 위생점검 대응까지 현재 화면 문맥을 기준으로 바로 답을 이어갑니다.
              </p>
              <div className="mt-8 grid w-full max-w-4xl gap-3 md:grid-cols-2">
                {CHAT_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setComposer(example)
                      void submitChat()
                    }}
                    className="rounded-2xl border border-gray-700 bg-gray-900/60 px-4 py-4 text-left text-sm text-gray-200 transition hover:border-green-500 hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-3xl px-5 py-4 ${
                      message.role === 'user'
                        ? 'bg-green-500 text-white'
                        : 'border border-gray-700 bg-gray-900 text-gray-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                    <p className="mt-2 text-right text-[11px] opacity-70">{formatClock(message.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderAllowanceSurface() {
    return (
      <AllowanceModule
        activeTab={allowanceTab}
        onChangeTab={setAllowanceTab}
        onMoveToChat={() => setMainMenu('ai-chat')}
        companyInfo={companyInfo}
      />
    )
  }

  function renderContent() {
    if (mainMenu === 'ai-chat') return renderAiChatSurface()
    if (mainMenu === 'production') return renderProductionSurface()
    return renderAllowanceSurface()
  }

  return (
    <>
      <div className="flex min-h-screen bg-gray-900 text-white">
        {renderSidebar()}

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
              {renderMainTabs()}
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-gray-400 md:inline">{session.displayName}</span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="rounded-xl border border-red-900/70 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-950/40"
                >
                  로그아웃
                </button>
              </div>
            </div>
            {renderProductionSubTabs()}
          </div>

          <main className="px-4 py-5 pb-28 md:px-6 md:pb-6">{renderContent()}</main>
        </div>
      </div>

      {renderMobileChatBar()}

      <Modal
        open={showRecipeMappingModal}
        title="레시피 원재료 연결 처리"
        description={selectedRecipeMappingRow ? `${selectedRecipeMappingRow.product_name} / ${selectedRecipeMappingRow.recipe_item_name}` : ''}
        onClose={() => {
          setShowRecipeMappingModal(false)
          setSelectedRecipeMappingRow(null)
          setRecipeMappingMessage(null)
          setRecipeMappingMaterialQuery('')
          setRecipeMappingCandidateOpen(false)
          setRecipeMappingHighlightIndex(-1)
        }}
      >
        {selectedRecipeMappingRow ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-gray-700 bg-gray-900/70 p-4 text-sm text-gray-200 md:grid-cols-2">
              <p>제품명: <span className="text-white">{selectedRecipeMappingRow.product_name}</span></p>
              <p>레시피 항목명: <span className="text-white">{selectedRecipeMappingRow.recipe_item_name}</span></p>
              <p>식품유형명: <span className="text-white">{selectedRecipeMappingRow.food_type_name}</span></p>
              <p>배합비율: <span className="text-green-300">{selectedRecipeMappingRow.ratio_percent}%</span></p>
              <p className="md:col-span-2">
                현재 연결 상태: <span className="text-amber-300">{recipeMappingStatusText(selectedRecipeMappingRow.mapping_status)}</span> /{' '}
                적용 범위: <span className="text-gray-100">{recipeMappingScopeText(selectedRecipeMappingRow.applied_scope)}</span>
              </p>
            </div>

            <Field label="사용 중인 원재료 검색">
              <div className="space-y-2">
                <input
                  type="text"
                  value={recipeMappingMaterialQuery}
                  placeholder="원재료명을 입력하세요"
                  onFocus={() => {
                    setRecipeMappingCandidateOpen(true)
                    if (recipeMappingHighlightIndex < 0) setRecipeMappingHighlightIndex(0)
                  }}
                  onChange={(event) => handleRecipeMappingMaterialQueryChange(event.target.value)}
                  onKeyDown={handleRecipeMappingMaterialKeyDown}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                />

                {recipeMappingCandidateOpen ? (
                  <div className="rounded-xl border border-gray-700 bg-gray-900/90">
                    {recipeMappingMaterialCandidates.length > 0 ? (
                      <ul className="max-h-56 overflow-y-auto py-1">
                        {recipeMappingMaterialCandidates.map((item, index) => {
                          const isSelected = recipeMappingSelectedMaterial === item.item_name
                          const isHighlighted = index === recipeMappingHighlightIndex
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => selectRecipeMappingMaterial(item.item_name)}
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                                  isHighlighted
                                    ? 'bg-green-500/20 text-white'
                                    : isSelected
                                      ? 'bg-green-900/40 text-green-100'
                                      : 'text-gray-200 hover:bg-gray-800'
                                }`}
                              >
                                <span className="truncate">{item.item_name}</span>
                                {isSelected ? <span className="ml-3 text-xs text-green-300">선택됨</span> : null}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="px-3 py-3 text-sm text-gray-400">검색 결과가 없습니다.</p>
                    )}
                  </div>
                ) : null}

                {recipeMappingMaterialMatches.length > 20 ? (
                  <p className="text-xs text-amber-300">검색 결과가 많습니다. 더 구체적으로 입력하세요.</p>
                ) : null}

                {recipeMappingSelectedMaterial ? (
                  <p className="text-xs text-green-300">선택된 원재료: {recipeMappingSelectedMaterial}</p>
                ) : (
                  <p className="text-xs text-gray-400">아직 원재료가 선택되지 않았습니다.</p>
                )}
              </div>
            </Field>

            <Field label="적용 범위">
              <select
                value={recipeMappingSelectedScope}
                onChange={(event) => setRecipeMappingSelectedScope(event.target.value as 'recipe' | 'product' | 'global')}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="recipe">이 레시피에만 적용</option>
                <option value="product">이 제품에 적용</option>
                <option value="global">같은 식품유형 전체에 적용</option>
              </select>
            </Field>

            {recipeMappingSelectedScope === 'global' ? (
              <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
                글로벌 적용은 여러 제품에 영향을 줄 수 있습니다. 적용 범위를 다시 확인해 주세요.
              </div>
            ) : null}

            {recipeMappingMessage ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  recipeMappingMessage.tone === 'success'
                    ? 'border-green-700/60 bg-green-950/30 text-green-200'
                    : recipeMappingMessage.tone === 'warning'
                      ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
                      : 'border-red-700/60 bg-red-950/30 text-red-200'
                }`}
              >
                {recipeMappingMessage.text}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRecipeMappingModal(false)
                  setSelectedRecipeMappingRow(null)
                  setRecipeMappingMessage(null)
                  setRecipeMappingCandidateOpen(false)
                  setRecipeMappingHighlightIndex(-1)
                }}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => void saveRecipeManualMapping()}
                disabled={recipeMappingSaving || !recipeMappingSelectedMaterial.trim()}
                className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
              >
                {recipeMappingSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showCompletionModal}
        title="생산 완료 입력"
        description={completionTargetRecord?.lot_number || ''}
        onClose={() => {
          setShowCompletionModal(false)
          setCompletionTargetRecord(null)
          setCompletionForm(emptyCompletionForm())
          setSampleInputRows([makeSampleRow(0)])
        }}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(190px,0.28fr)_minmax(0,0.72fr)]">
          <SectionCard title="대상 작업지시서" className="space-y-1 p-3">
            {completionTargetRecord ? (
              <div className="space-y-1.5 text-xs text-gray-300">
                <p>
                  <span className="text-gray-500">LOT</span>{' '}
                  <span className="text-gray-100">{completionTargetRecord.lot_number || '-'}</span>
                </p>
                <p>
                  <span className="text-gray-500">제품명</span>{' '}
                  <span className="text-gray-100">{completionTargetRecord.product_name || '-'}</span>
                </p>
                <p>
                  <span className="text-gray-500">예정량</span>{' '}
                  <span className="text-gray-100">{formatNumber(completionTargetRecord.planned_quantity_g)}g</span>
                </p>
                <p>
                  <span className="text-gray-500">생산단위</span>{' '}
                  <span className="text-gray-100">
                    {completionTargetRecord.production_unit_name
                      ? `${completionTargetRecord.production_unit_name} (${formatNumber(completionTargetRecord.production_unit_weight_g)}g)`
                      : completionUnitWeightG !== null
                        ? `${formatNumber(completionUnitWeightG)}g`
                        : '-'}
                  </span>
                </p>
                <p>
                  <span className="text-gray-500">현재 완료량</span>{' '}
                  <span className="text-gray-100">{formatNumber(completionTargetRecord.actual_quantity_g)}g</span>
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">선택된 작업지시서가 없습니다.</p>
            )}
          </SectionCard>
          <SectionCard title="완료량 입력">
            {completionUnitWeightG !== null ? (
              <p className="mb-3 text-xs text-gray-400">생산단위 중량: {formatNumber(completionUnitWeightG)}g</p>
            ) : (
              <p className="mb-3 text-xs text-amber-300">생산단위 중량이 없어 ea 입력은 사용할 수 없습니다.</p>
            )}

            <div className="space-y-3">
              <Field label="완료수량">
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <input
                    type="number"
                    min="0"
                    step={completionForm.actual_input_unit === 'ea' ? '1' : '0.001'}
                    value={completionForm.actual_input_value}
                    onChange={(event) =>
                      setCompletionForm((prev) => ({
                        ...prev,
                        actual_input_value: event.target.value,
                        input_unit: prev.actual_input_unit,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                  <select
                    value={completionForm.actual_input_unit}
                    onChange={(event) =>
                      setCompletionForm((prev) => ({
                        ...prev,
                        actual_input_unit: event.target.value as 'ea' | 'kg' | 'g',
                        input_unit: event.target.value as 'ea' | 'kg' | 'g',
                      }))
                    }
                    className="rounded-xl border border-gray-700 bg-gray-900 px-2 py-2 text-white outline-none focus:border-green-500"
                  >
                    <option value="ea">ea</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-green-300">
                  g 환산: {completionPreview.actualG !== null ? `${formatNumber(completionPreview.actualG)}g` : '-'}
                </p>
              </Field>

              <Field label="불량수량">
                <div className="grid grid-cols-[1fr_110px] gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={completionForm.defect_input_value}
                    onChange={(event) =>
                      setCompletionForm((prev) => ({ ...prev, defect_input_value: event.target.value }))
                    }
                    className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                  />
                  <select
                    value={completionForm.defect_input_unit}
                    onChange={(event) =>
                      setCompletionForm((prev) => ({
                        ...prev,
                        defect_input_unit: event.target.value as 'kg' | 'g',
                      }))
                    }
                    className="rounded-xl border border-gray-700 bg-gray-900 px-2 py-2 text-white outline-none focus:border-green-500"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-amber-300">
                  g 환산: {completionPreview.defectG !== null ? `${formatNumber(completionPreview.defectG)}g` : '-'}
                </p>
              </Field>

              <Field label="샘플수량">
                <div className="mt-2 space-y-2 rounded-xl border border-gray-700/60 bg-gray-900/40 p-2">
                  {sampleRowPreviews.map((row) => (
                    <div key={row.id} className="rounded-lg border border-gray-700 bg-gray-900/70 p-2">
                      <div className="grid grid-cols-[86px_1fr_96px_70px] gap-2">
                        <div className="flex items-center text-xs text-gray-300">{row.label}</div>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.value ?? ''}
                          onChange={(event) => updateSampleInputRow(row.id, { value: event.target.value })}
                          className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
                        />
                        <select
                          value={row.unit}
                          onChange={(event) => updateSampleInputRow(row.id, { unit: event.target.value as 'kg' | 'g' })}
                          className="rounded-xl border border-gray-700 bg-gray-900 px-2 py-2 text-white outline-none focus:border-green-500"
                        >
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeSampleInputRow(row.id)}
                          disabled={sampleRowPreviews.length <= 1}
                          className="rounded-xl border border-gray-700 px-2 py-2 text-xs text-gray-300 hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          삭제
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-blue-300">g 환산: {row.grams !== null ? `${formatNumber(row.grams)}g` : '-'}</p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={addSampleInputRow}
                      className="rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 hover:border-gray-500 hover:text-white"
                    >
                      샘플 추가
                    </button>
                    <p className="text-xs text-blue-300">샘플 합계: {formatNumber(sampleTotalG)}g</p>
                  </div>
                </div>
              </Field>

              <div className="rounded-xl border border-gray-700 bg-gray-900/70 px-3 py-3 text-xs text-gray-200">
                <p>입력 합계(g): {completionPreview.enteredTotalG !== null ? `${formatNumber(completionPreview.enteredTotalG)}g` : '-'}</p>
                <p className={completionPreview.exceedsPlanned ? 'mt-1 text-red-300' : 'mt-1 text-gray-300'}>
                  로스량(g): {completionPreview.lossG !== null ? `${formatNumber(completionPreview.lossG)}g` : '-'}
                </p>
                <p className="mt-1 text-gray-300">
                  완료 + 불량 + 샘플 + 로스 = 예정수량(
                  {completionPreview.plannedG !== null ? `${formatNumber(completionPreview.plannedG)}g` : '-'})
                </p>
                {completionPreview.hasInvalidEa ? (
                  <p className="mt-2 text-red-300">ea 입력값은 정수만 가능합니다.</p>
                ) : null}
                {completionPreview.hasMissingUnitWeightForEa ? (
                  <p className="mt-2 text-amber-300">생산단위 중량 정보가 없어 ea 입력을 사용할 수 없습니다.</p>
                ) : null}
                {completionPreview.exceedsPlanned ? (
                  <p className="mt-2 text-red-300">합계가 예정수량을 초과했습니다.</p>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCompletionModal(false)
              setCompletionTargetRecord(null)
              setCompletionForm(emptyCompletionForm())
              setSampleInputRows([makeSampleRow(0)])
            }}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void completeWorkOrderV2()}
            disabled={productionActionBusy}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            생산 완료 저장
          </button>
        </div>
      </Modal>

      <Modal
        open={showPlannedEditModal}
        title="예정수량 수정"
        description={plannedEditRecord?.lot_number || ''}
        onClose={() => {
          setShowPlannedEditModal(false)
          setPlannedEditRecord(null)
          setPlannedEditKg('')
        }}
      >
        <div className="space-y-4">
          <SectionCard title="작업지시서 정보">
            {plannedEditRecord ? (
              <div className="space-y-2 text-sm text-gray-200">
                <p>LOT: {plannedEditRecord.lot_number || '-'}</p>
                <p>제품명: {plannedEditRecord.product_name || '-'}</p>
                <p>현재 예정량: {formatKg(plannedEditRecord.planned_quantity_g)}kg</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">선택된 작업지시서가 없습니다.</p>
            )}
          </SectionCard>
          <Field label="수정 예정량(kg)">
            <input
              type="number"
              min="0"
              step="0.001"
              value={plannedEditKg}
              onChange={(event) => setPlannedEditKg(event.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPlannedEditModal(false)
              setPlannedEditRecord(null)
              setPlannedEditKg('')
            }}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void savePlannedQuantity()}
            disabled={productionActionBusy}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            예정수량 저장
          </button>
        </div>
      </Modal>

      <Modal
        open={showDeductionModal}
        title="원재료 차감 미리보기"
        description={deductionModalRecord?.lot_number || ''}
        onClose={() => {
          setShowDeductionModal(false)
          setDeductionModalRecord(null)
          setDeductionModalError('')
          setDeductionPreviewSummary(null)
        }}
      >
        {deductionModalLoading ? (
          <LoadingBlock lines={4} />
        ) : deductionModalError ? (
          <div className="rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {deductionModalError}
          </div>
        ) : deductionPreviewRows.length === 0 ? (
          <EmptyState title="차감 미리보기 데이터가 없습니다" description="레시피/매핑/완료량을 확인해 주세요." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900/70 px-4 py-3 text-sm text-gray-200">
              <p>
                제품명: <span className="text-white">{deductionModalRecord?.product_name || '-'}</span>
              </p>
              <p>
                LOT: <span className="font-mono text-white">{deductionModalRecord?.lot_number || '-'}</span>
              </p>
              <p>
                입력 합계(g):{' '}
                <span className="text-green-400">
                  {formatNumber(deductionPreviewSummary?.entered_quantity_g ?? deductionModalRecord?.actual_quantity_g)}g
                </span>
              </p>
              <p>
                로스량(g): <span className="text-amber-300">{formatNumber(deductionPreviewSummary?.loss_quantity_g ?? 0)}g</span>
              </p>
              <p>
                차감 기준량(g):{' '}
                <span className="text-emerald-300">{formatNumber(deductionPreviewSummary?.deduction_basis_g ?? 0)}g</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">원재료</th>
                    <th className="px-3 py-2 font-medium">식품유형</th>
                    <th className="px-3 py-2 font-medium">차감예정(g)</th>
                    <th className="px-3 py-2 font-medium">현재재고(g)</th>
                    <th className="px-3 py-2 font-medium">차감후재고(g)</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {deductionPreviewRows.map((item, index) => {
                    const hasMappingIssue = !item.material_id
                    const blocked = item.insufficient || hasMappingIssue
                    return (
                      <tr key={`${item.material_name}-${index}`} className="border-b border-gray-800/80">
                        <td className="px-3 py-3 text-white">{item.material_name}</td>
                        <td className="px-3 py-3 text-gray-200">{item.food_type_name || '-'}</td>
                        <td className="px-3 py-3 text-green-400">{formatNumber(item.required_g)}g</td>
                        <td className="px-3 py-3 text-gray-200">{formatNumber(item.current_stock_g)}g</td>
                        <td className="px-3 py-3 text-gray-200">{formatNumber(item.remaining_stock_g)}g</td>
                        <td className="px-3 py-3">
                          {blocked ? (
                            <span className="rounded-md border border-red-800/60 bg-red-950/40 px-2 py-1 text-xs text-red-200">
                              {hasMappingIssue ? '미매핑' : '재고 부족'}
                            </span>
                          ) : (
                            <span className="rounded-md border border-green-700/60 bg-green-950/40 px-2 py-1 text-xs text-green-200">
                              차감 가능
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {deductionPreviewRows.some((item) => item.insufficient || !item.material_id) ? (
              <p className="text-sm text-amber-300">재고 부족/미매핑 항목이 있어 확정할 수 없습니다.</p>
            ) : null}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowDeductionModal(false)
              setDeductionModalRecord(null)
              setDeductionModalError('')
              setDeductionPreviewSummary(null)
            }}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => {
              if (!deductionModalRecord) return
              void confirmProduction(deductionModalRecord.id)
            }}
            disabled={
              productionActionBusy ||
              deductionModalLoading ||
              !!deductionModalError ||
              deductionPreviewRows.length === 0 ||
              deductionPreviewRows.some((item) => item.insufficient || !item.material_id)
            }
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            원재료 차감 후 생산 확정
          </button>
        </div>
      </Modal>

      <Modal
        open={showSububuDetailModal}
        title={`${sububuDetailTarget || '원재료'} 수불 상세`}
        description="기간별 입고/소모 내역"
        onClose={() => {
          setShowSububuDetailModal(false)
          setSububuDetailRows([])
          setSububuDetailError('')
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="시작일" className="min-w-[140px]">
              <input
                type="date"
                value={sububuDetailFrom}
                onChange={(event) => setSububuDetailFrom(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <Field label="종료일" className="min-w-[140px]">
              <input
                type="date"
                value={sububuDetailTo}
                onChange={(event) => setSububuDetailTo(event.target.value)}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <button
              type="button"
              onClick={() => void loadSububuDetail(sububuDetailTarget, sububuDetailFrom, sububuDetailTo)}
              className="h-[42px] rounded-xl border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
            >
              검색
            </button>
          </div>

          {sububuDetailBalanceMode ? (
            <p className="text-xs text-gray-500">잔량 표시는 {sububuDetailBalanceMode} 기준입니다.</p>
          ) : null}

          {sububuDetailLoading ? (
            <LoadingBlock lines={4} />
          ) : sububuDetailError ? (
            <EmptyState title="수불 상세를 불러오지 못했습니다" description={sububuDetailError} />
          ) : sububuDetailRows.length === 0 ? (
            <EmptyState title="거래 내역이 없습니다" description="선택한 기간의 입고/소모 데이터가 없습니다." />
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-xl border border-gray-700">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-900 text-gray-400">
                  <tr className="border-b border-gray-700">
                    <th className="px-3 py-2 font-medium">날짜</th>
                    <th className="px-3 py-2 font-medium">구분</th>
                    <th className="px-3 py-2 font-medium">거래처/사용처</th>
                    <th className="px-3 py-2 font-medium">입고(g)</th>
                    <th className="px-3 py-2 font-medium">소모(g)</th>
                    <th className="px-3 py-2 font-medium">잔량(g)</th>
                    <th className="px-3 py-2 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {sububuDetailRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-800/80">
                      <td className="px-3 py-2 text-gray-200">{row.tx_date || '-'}</td>
                      <td className="px-3 py-2 text-white">{row.tx_type || '-'}</td>
                      <td className="px-3 py-2 text-gray-200">{row.counterparty || '-'}</td>
                      <td className="px-3 py-2 text-green-400">{row.inbound_g ? formatNumber(row.inbound_g) : '-'}</td>
                      <td className="px-3 py-2 text-amber-300">{row.outbound_g ? formatNumber(row.outbound_g) : '-'}</td>
                      <td className="px-3 py-2 text-gray-200">{formatNumber(row.balance_g)}</td>
                      <td className="max-w-[320px] truncate px-3 py-2 text-gray-400" title={row.note || ''}>
                        {row.note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={showPackagingModal}
        title={packagingForm.id ? '부재료 수정' : '부재료 추가'}
        description="packaging_materials 기준"
        onClose={() => {
          setShowPackagingModal(false)
          setPackagingError('')
          setPackagingForm(emptyPackagingForm())
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="부재료명">
            <input
              value={packagingForm.material_name}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, material_name: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="코드">
            <input
              value={packagingForm.material_code}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, material_code: event.target.value }))}
              readOnly={!!packagingForm.id}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500 read-only:opacity-60"
            />
          </Field>
          <Field label="규격">
            <input
              value={packagingForm.spec}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, spec: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="유형">
            <input
              value={packagingForm.material_type}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, material_type: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="매입처">
            <input
              value={packagingForm.supplier}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, supplier: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="현재재고(ea)">
            <input
              type="number"
              min="0"
              step="1"
              value={packagingForm.current_stock}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, current_stock: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="단가">
            <input
              type="number"
              min="0"
              step="1"
              value={packagingForm.unit_price}
              onChange={(event) => setPackagingForm((prev) => ({ ...prev, unit_price: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="활성상태">
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={packagingForm.is_active}
                onChange={(event) => setPackagingForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-green-500 focus:ring-green-500"
              />
              활성
            </label>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowPackagingModal(false)
              setPackagingError('')
              setPackagingForm(emptyPackagingForm())
            }}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void savePackagingMaterial()}
            disabled={packagingSaving}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            저장
          </button>
        </div>
      </Modal>

      <Modal
        open={showProductionModal}
        title="빠른 실적 입력"
        description="제조기록서 초안을 바로 저장합니다."
        onClose={() => setShowProductionModal(false)}
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-1">
            <h4 className="text-base font-semibold text-white">기본정보</h4>
            <Field label="제조일자">
              <input
                type="date"
                value={productionForm.work_date}
                onChange={(event) => setProductionForm((prev) => ({ ...prev, work_date: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              />
              <ValidationMessage validation={productionDateValidation} />
            </Field>
            <Field label="제품명">
              <select
                value={productionForm.product_id}
                onChange={(event) => {
                  const nextValue = event.target.value
                  const nextProduct =
                    products.find((item) => String(item.id) === nextValue)?.product_name ?? ''
                  setProductionForm((prev) => ({
                    ...prev,
                    product_id: nextValue,
                    product_name: nextValue === '__new__' ? prev.product_name : nextProduct,
                  }))
                }}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="">제품 선택</option>
                {products.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.product_name}
                  </option>
                ))}
                <option value="__new__">+ 새 제품 추가</option>
              </select>
            </Field>
            {productionForm.product_id === '__new__' ? (
              <Field label="새 제품명">
                <input
                  value={productionForm.product_name}
                  onChange={(event) =>
                    setProductionForm((prev) => ({ ...prev, product_name: event.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
                />
                <ValidationMessage
                  validation={productionProductValidation}
                  onApply={
                    productionProductValidation.suggestion
                      ? () =>
                          setProductionForm((prev) => ({
                            ...prev,
                            product_name: productionProductValidation.suggestion ?? prev.product_name,
                          }))
                      : null
                  }
                />
              </Field>
            ) : null}
            <Field label="계획수량(g)">
              <input
                type="number"
                value={productionForm.planned_quantity_g}
                onChange={(event) =>
                  setProductionForm((prev) => ({ ...prev, planned_quantity_g: event.target.value }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
          </div>

          <div className="space-y-4 xl:col-span-1">
            <h4 className="text-base font-semibold text-white">실적</h4>
            <Field label="실제생산량(g)">
              <input
                type="number"
                value={productionForm.actual_quantity_g}
                onChange={(event) =>
                  setProductionForm((prev) => ({ ...prev, actual_quantity_g: event.target.value }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              />
              <ValidationMessage validation={productionQuantityValidation} />
            </Field>
            <Field label="불량수량(g)">
              <input
                value={String(productionDefectQuantity)}
                readOnly
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-gray-300"
              />
            </Field>
            <Field label="작업자">
              <input
                value={productionForm.worker_name}
                onChange={(event) => setProductionForm((prev) => ({ ...prev, worker_name: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="시작시간">
                <input
                  type="time"
                  value={productionForm.start_time}
                  onChange={(event) => setProductionForm((prev) => ({ ...prev, start_time: event.target.value }))}
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
              <Field label="종료시간">
                <input
                  type="time"
                  value={productionForm.end_time}
                  onChange={(event) => setProductionForm((prev) => ({ ...prev, end_time: event.target.value }))}
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
                />
              </Field>
            </div>
            <Field label="상태">
              <select
                value={productionForm.status}
                onChange={(event) => setProductionForm((prev) => ({ ...prev, status: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="완료">완료</option>
                <option value="진행중">진행중</option>
                <option value="예정">예정</option>
              </select>
            </Field>
          </div>

          <div className="space-y-4 xl:col-span-1">
            <h4 className="text-base font-semibold text-white">품질 / 위생</h4>
            <Field label="검사결과">
              <select
                value={productionForm.inspection_result}
                onChange={(event) =>
                  setProductionForm((prev) => ({ ...prev, inspection_result: event.target.value }))
                }
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              >
                <option value="적합">적합</option>
                <option value="부적합">부적합</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={productionForm.sanitation_check}
                onChange={(event) =>
                  setProductionForm((prev) => ({ ...prev, sanitation_check: event.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-green-500"
              />
              위생점검 여부 확인
            </label>
            <Field label="비고">
              <textarea
                rows={7}
                value={productionForm.note}
                onChange={(event) => setProductionForm((prev) => ({ ...prev, note: event.target.value }))}
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
              />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowProductionModal(false)}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void saveProductionRecord()}
            disabled={productionSaveBlocked}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            {productionSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!selectedRecord}
        title="제조기록서 상세"
        description={selectedRecord?.lot_number || ''}
        onClose={() => setSelectedRecord(null)}
      >
        {selectedRecord ? (
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="기본정보">
              <div className="space-y-2 text-sm text-gray-200">
                <p>제조번호: {selectedRecord.lot_number || '-'}</p>
                <p>제조일자: {selectedRecord.work_date || '-'}</p>
                <p>제품명: {selectedRecord.product_name || '-'}</p>
                <p>상태: {normalizeStatus(selectedRecord.status)}</p>
              </div>
            </SectionCard>
            <SectionCard title="생산수량">
              <div className="space-y-2 text-sm text-gray-200">
                <p>계획수량: {formatNumber(selectedRecord.planned_quantity_g)}g</p>
                <p>실제생산량: {formatNumber(selectedRecord.actual_quantity_g)}g</p>
                <p>불량수량: {formatNumber(selectedRecord.defect_quantity_g)}g</p>
              </div>
            </SectionCard>
            <SectionCard title="작업정보">
              <div className="space-y-2 text-sm text-gray-200">
                <p>작업자: {selectedRecord.worker_name || '-'}</p>
                <p>시작시간: {selectedRecord.start_time || '-'}</p>
                <p>종료시간: {selectedRecord.end_time || '-'}</p>
              </div>
            </SectionCard>
            <SectionCard title="품질 / 위생">
              <div className="space-y-2 text-sm text-gray-200">
                <p>검사결과: {normalizeInspection(selectedRecord.inspection_result)}</p>
                <p>위생점검 여부: {selectedRecord.sanitation_check ? '확인' : '미확인'}</p>
                <p>비고: {selectedRecord.note || '-'}</p>
              </div>
            </SectionCard>
            <div className="md:col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => openWindow(`/api/moni/production-records/${selectedRecord.id}/pdf`)}
                className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400"
              >
                PDF 출력
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showMaterialModal}
        title="원재료 상세편집"
        description={selectedMaterial?.item_name || ''}
        onClose={() => setShowMaterialModal(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="원재료명">
            <input
              value={materialForm.item_name}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, item_name: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="식품유형">
            <input
              value={materialForm.food_type}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, food_type: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="원산지">
            <input
              value={materialForm.country_of_origin}
              onChange={(event) =>
                setMaterialForm((prev) => ({ ...prev, country_of_origin: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="규격">
            <input
              value={materialForm.spec}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, spec: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="보관구분">
            <select
              value={materialForm.storage_type}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, storage_type: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            >
              <option value="">선택</option>
              <option value="실온">실온</option>
              <option value="상온">상온</option>
              <option value="냉장">냉장</option>
              <option value="냉동">냉동</option>
            </select>
          </Field>
          <Field label="소비기한(일)">
            <input
              type="number"
              value={materialForm.shelf_life_days}
              onChange={(event) =>
                setMaterialForm((prev) => ({ ...prev, shelf_life_days: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="공급업체명">
            <input
              value={materialForm.supplier}
              onChange={(event) => setMaterialForm((prev) => ({ ...prev, supplier: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="연락처">
            <input
              value={materialForm.supplier_contact}
              onChange={(event) =>
                setMaterialForm((prev) => ({ ...prev, supplier_contact: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="주소" className="md:col-span-2">
            <input
              value={materialForm.supplier_address}
              onChange={(event) =>
                setMaterialForm((prev) => ({ ...prev, supplier_address: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="사업자번호" className="md:col-span-2">
            <input
              value={materialForm.supplier_biz_number}
              onChange={(event) =>
                setMaterialForm((prev) => ({ ...prev, supplier_biz_number: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowMaterialModal(false)}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void saveMaterialDetail()}
            disabled={materialSaving}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            {materialSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </Modal>

      <Modal
        open={showSanitationModal}
        title="오늘 위생점검 기록"
        description="작업장, 작업자, 원재료, 설비, 방충방서, 급수 위생 상태를 기록합니다."
        onClose={() => setShowSanitationModal(false)}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="점검일자">
            <input
              type="date"
              value={sanitationForm.check_date}
              onChange={(event) => setSanitationForm((prev) => ({ ...prev, check_date: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          <Field label="점검자">
            <input
              value={sanitationForm.checker_name}
              onChange={(event) => setSanitationForm((prev) => ({ ...prev, checker_name: event.target.value }))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
          {[
            ['workplace_clean', 'workplace_note', '작업장 청결'],
            ['worker_hygiene', 'worker_note', '작업자 위생'],
            ['material_storage', 'material_note', '원재료 보관'],
            ['equipment_clean', 'equipment_note', '설비·기구'],
            ['pest_control', 'pest_note', '방충·방서'],
            ['water_hygiene', 'water_note', '급수 위생'],
          ].map(([flagKey, noteKey, label]) => (
            <div key={flagKey} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
              <label className="flex items-center gap-3 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={Boolean(sanitationForm[flagKey as keyof SanitationFormState])}
                  onChange={(event) =>
                    setSanitationForm((prev) => ({
                      ...prev,
                      [flagKey]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-green-500"
                />
                {label}
              </label>
              <textarea
                rows={2}
                value={String(sanitationForm[noteKey as keyof SanitationFormState] ?? '')}
                onChange={(event) =>
                  setSanitationForm((prev) => ({
                    ...prev,
                    [noteKey]: event.target.value,
                  }))
                }
                placeholder="특이사항 입력"
                className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-green-500"
              />
            </div>
          ))}
          <Field label="종합결과">
            <select
              value={sanitationForm.overall_result}
              onChange={(event) =>
                setSanitationForm((prev) => ({ ...prev, overall_result: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            >
              <option value="적합">적합</option>
              <option value="부적합">부적합</option>
              <option value="개선필요">개선필요</option>
            </select>
          </Field>
          <Field label="조치사항">
            <textarea
              rows={4}
              value={sanitationForm.action_taken}
              onChange={(event) =>
                setSanitationForm((prev) => ({ ...prev, action_taken: event.target.value }))
              }
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-green-500"
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowSanitationModal(false)}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-gray-500 hover:text-white"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void saveSanitationLog()}
            disabled={sanitationSaving}
            className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
          >
            {sanitationSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!selectedSanitationLog}
        title="위생점검 상세"
        description={selectedSanitationLog?.check_date || ''}
        onClose={() => setSelectedSanitationLog(null)}
      >
        {selectedSanitationLog ? (
          <div className="space-y-5">
            <SectionCard title="기본정보">
              <div className="space-y-2 text-sm text-gray-200">
                <p>점검일자: {selectedSanitationLog.check_date}</p>
                <p>점검자: {selectedSanitationLog.checker_name}</p>
                <p>종합결과: {selectedSanitationLog.overall_result || '-'}</p>
                <p>조치사항: {selectedSanitationLog.action_taken || '-'}</p>
              </div>
            </SectionCard>
            <SectionCard title="항목별 결과">
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ['작업장 청결', selectedSanitationLog.workplace_clean, selectedSanitationLog.workplace_note],
                  ['작업자 위생', selectedSanitationLog.worker_hygiene, selectedSanitationLog.worker_note],
                  ['원재료 보관', selectedSanitationLog.material_storage, selectedSanitationLog.material_note],
                  ['설비·기구', selectedSanitationLog.equipment_clean, selectedSanitationLog.equipment_note],
                  ['방충·방서', selectedSanitationLog.pest_control, selectedSanitationLog.pest_note],
                  ['급수 위생', selectedSanitationLog.water_hygiene, selectedSanitationLog.water_note],
                ] as Array<[string, boolean | null | undefined, string | null | undefined]>).map(([label, flag, note]) => (
                  <div key={label} className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 text-sm">
                    <p className="font-semibold text-white">{label}</p>
                    <p className="mt-2 text-gray-200">{flag ? '적합' : '부적합'}</p>
                    <p className="mt-1 text-gray-400">{String(note || '-')}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => openWindow(`/api/moni/sanitation-logs/${selectedSanitationLog.id}/pdf`)}
                className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-400"
              >
                PDF 출력
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
