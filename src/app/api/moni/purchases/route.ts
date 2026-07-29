import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const PAYMENT_METHODS = new Set(['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'])
const SUPPLY_TYPES = new Set(['RAW_MATERIAL', 'PACKAGING', 'BOTH', 'OTHER'])
const DUE_TYPES = new Set(['IMMEDIATE', 'DAYS', 'NEXT_MONTH_DAY', 'MONTH_END', 'DIRECT'])
const TAX_TYPES = new Set(['TAXABLE', 'EXEMPT', 'ZERO_RATE'])
const PURCHASE_CATEGORIES = new Set(['RAW_MATERIAL', 'PACKAGING'])
const TAX_INVOICE_STATUSES = new Set(['NOT_REQUIRED', 'NOT_RECEIVED', 'RECEIVED', 'MATCHED', 'MISMATCH'])
const RAW_UNITS = new Set(['KG', 'G', 'EA'])
const MAX_BATCH_ROWS = 500
const PAGE_SIZE = 1000
const MAX_PAGES = 100

type JsonRecord = Record<string, unknown>
type MoniClient = ReturnType<typeof createMoniServiceRoleClient>

type SupplierRow = JsonRecord & {
  id: string
  company_name: string
  default_due_type: string
  default_due_days: number | null
  default_due_day: number | null
  default_payment_method: string
  default_payment_account: string | null
  default_card_name: string | null
  default_installment_months: number
  tax_invoice_required: boolean
  status: string
}

type PurchaseRow = JsonRecord & {
  id: string
  purchase_no: string
  purchase_date: string
  receipt_date?: string | null
  due_date: string | null
  total_amount: number | string
  status: string
  source_transaction_id?: string | null
  created_at?: string | null
}

type PaymentRow = JsonRecord & {
  id: string
  purchase_id: string
  payment_date: string
  amount: number | string
}

type PreparedPurchase = {
  business_id: string
  supplier_id: string
  purchase_date: string
  receipt_date: string
  purchase_category: 'RAW_MATERIAL' | 'PACKAGING'
  material_id: string
  quantity: number
  unit: string
  unit_price: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  due_date: string
  planned_payment_method: string
  planned_payment_account: string
  planned_card_name: string
  planned_installment_months: number
  tax_invoice_status: string
  tax_invoice_amount: number | null
  notes: string
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function integerValue(value: unknown, fallback = 0) {
  return Math.trunc(numberValue(value, fallback))
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = text(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

function nextMonthDate(dateText: string, day: number) {
  const date = new Date(`${dateText}T00:00:00Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return isoDate(new Date(Date.UTC(year, month, Math.min(Math.max(day, 1), lastDay))))
}

function monthEnd(dateText: string) {
  const date = new Date(`${dateText}T00:00:00Z`)
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)))
}

function calculateDueDate(purchaseDate: string, supplier: SupplierRow, directDate: string) {
  if (directDate && isDate(directDate)) return directDate
  const dueType = text(supplier.default_due_type) || 'DAYS'
  if (dueType === 'IMMEDIATE') return purchaseDate
  if (dueType === 'DAYS') return addDays(purchaseDate, Math.max(0, integerValue(supplier.default_due_days, 0)))
  if (dueType === 'NEXT_MONTH_DAY') return nextMonthDate(purchaseDate, integerValue(supplier.default_due_day, 1))
  if (dueType === 'MONTH_END') return monthEnd(purchaseDate)
  return ''
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function scopedBusiness(value: unknown) {
  const businessId = text(value)
  return businessId === BUSINESS_ID || businessId === 'default' || businessId === ''
}

function inboundType(value: unknown) {
  const normalized = text(value).toUpperCase()
  return normalized === 'INBOUND' || normalized.includes('입고')
}

function rowDate(row: JsonRecord) {
  const direct = text(row.receipt_date) || text(row.transaction_date) || text(row.txn_date)
  if (isDate(direct)) return direct
  const created = text(row.created_at)
  return /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : ''
}

async function fetchAllRows(supabase: MoniClient, table: 'raw_material_transactions' | 'packaging_transactions') {
  const rows: JsonRecord[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const pageRows = (data ?? []) as JsonRecord[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
  }
  throw new Error(`${table} 입고내역이 ${PAGE_SIZE * MAX_PAGES}건을 초과해 전체 조회하지 못했습니다.`)
}

function legacyRawRows(transactions: JsonRecord[], linkedIds: Set<string>, rawMeta: Map<string, JsonRecord>) {
  return transactions.flatMap((row) => {
    if (!scopedBusiness(row.business_id) || !inboundType(row.txn_type ?? row.transaction_type)) return []
    const id = text(row.id)
    if (!id || linkedIds.has(id)) return []
    const materialRef = text(row.item_code ?? row.raw_material_id)
    const meta = rawMeta.get(materialRef)
    const quantityG = Math.max(0, numberValue(row.total_weight_g ?? row.quantity_g ?? row.quantity))
    const date = rowDate(row)
    if (!date || quantityG <= 0) return []
    const itemName = text(row.raw_material_name ?? row.item_name) || text(meta?.item_name) || materialRef || '원재료명 확인 필요'
    const unitPrice = Math.max(0, numberValue(row.unit_price ?? row.unit_price_won ?? meta?.unit_price_per_kg))
    const recordedTotal = Math.max(0, numberValue(row.total_price))
    return [{
      id: `legacy-raw-${id}`,
      purchase_no: `기존입고-${id}`,
      supplier_id: '',
      supplier_name_snapshot: text(row.supplier) || text(meta?.supplier) || '매입처 미등록',
      purchase_date: date,
      receipt_date: date,
      purchase_category: 'RAW_MATERIAL',
      material_id: materialRef,
      item_name: itemName,
      quantity: quantityG,
      unit: 'G',
      unit_price: unitPrice,
      supply_amount: recordedTotal,
      vat_amount: 0,
      total_amount: recordedTotal,
      due_date: null,
      planned_payment_method: 'OTHER',
      planned_payment_account: null,
      planned_card_name: null,
      planned_installment_months: 1,
      tax_invoice_status: 'NOT_REQUIRED',
      tax_invoice_amount: null,
      status: 'LEGACY',
      inventory_status: 'POSTED',
      source_transaction_type: 'RAW_MATERIAL',
      source_transaction_id: id,
      notes: text(row.note),
      paid_amount: 0,
      outstanding_amount: 0,
      payment_state: 'LEGACY',
      payments: [],
      legacy_record: true,
      legacy_amount_available: recordedTotal > 0,
      created_at: text(row.created_at),
    }]
  })
}

function legacyPackagingRows(transactions: JsonRecord[], linkedIds: Set<string>, packagingMeta: Map<string, JsonRecord>) {
  return transactions.flatMap((row) => {
    if (!scopedBusiness(row.business_id) || !inboundType(row.txn_type)) return []
    const id = text(row.id)
    if (!id || linkedIds.has(id)) return []
    const materialRef = text(row.material_code)
    const meta = packagingMeta.get(materialRef)
    const quantity = Math.max(0, numberValue(row.quantity))
    const date = rowDate(row)
    if (!date || quantity <= 0) return []
    const itemName = text(meta?.material_name) || materialRef || '부재료명 확인 필요'
    const unitPrice = Math.max(0, numberValue(meta?.unit_price))
    return [{
      id: `legacy-packaging-${id}`,
      purchase_no: `기존입고-${id}`,
      supplier_id: '',
      supplier_name_snapshot: text(row.counterparty ?? row.supplier) || text(meta?.supplier) || '매입처 미등록',
      purchase_date: date,
      receipt_date: date,
      purchase_category: 'PACKAGING',
      material_id: materialRef,
      item_name: itemName,
      quantity,
      unit: 'EA',
      unit_price: unitPrice,
      supply_amount: 0,
      vat_amount: 0,
      total_amount: 0,
      due_date: null,
      planned_payment_method: 'OTHER',
      planned_payment_account: null,
      planned_card_name: null,
      planned_installment_months: 1,
      tax_invoice_status: 'NOT_REQUIRED',
      tax_invoice_amount: null,
      status: 'LEGACY',
      inventory_status: 'POSTED',
      source_transaction_type: 'PACKAGING',
      source_transaction_id: id,
      notes: text(row.note),
      paid_amount: 0,
      outstanding_amount: 0,
      payment_state: 'LEGACY',
      payments: [],
      legacy_record: true,
      legacy_amount_available: false,
      created_at: text(row.created_at),
    }]
  })
}

async function loadState() {
  const supabase = createMoniServiceRoleClient()
  const [supplierResult, purchaseResult, paymentResult, rawResult, packagingResult, rawTransactions, packagingTransactions] = await Promise.all([
    supabase.from('purchase_suppliers').select('*').eq('business_id', BUSINESS_ID).order('company_name'),
    supabase.from('purchases').select('*').eq('business_id', BUSINESS_ID).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('purchase_payments').select('*').eq('business_id', BUSINESS_ID).order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('raw_materials').select('*').order('item_name'),
    supabase.from('packaging_materials').select('*').order('material_name'),
    fetchAllRows(supabase, 'raw_material_transactions'),
    fetchAllRows(supabase, 'packaging_transactions'),
  ])
  if (supplierResult.error) throw new Error(supplierResult.error.message)
  if (purchaseResult.error) throw new Error(purchaseResult.error.message)
  if (paymentResult.error) throw new Error(paymentResult.error.message)
  if (rawResult.error) throw new Error(rawResult.error.message)
  if (packagingResult.error) throw new Error(packagingResult.error.message)

  const suppliers = (supplierResult.data ?? []) as SupplierRow[]
  const purchases = (purchaseResult.data ?? []) as PurchaseRow[]
  const payments = (paymentResult.data ?? []) as PaymentRow[]
  const rawMaterials = ((rawResult.data ?? []) as JsonRecord[]).filter((row) => row.is_active !== false && scopedBusiness(row.business_id))
  const packagingMaterials = ((packagingResult.data ?? []) as JsonRecord[]).filter((row) => row.is_active !== false && scopedBusiness(row.business_id))

  const paidByPurchase = new Map<string, number>()
  for (const payment of payments) paidByPurchase.set(payment.purchase_id, (paidByPurchase.get(payment.purchase_id) ?? 0) + numberValue(payment.amount))

  const today = kstToday()
  const dueSoonLimit = addDays(today, 7)
  const monthPrefix = today.slice(0, 7)
  let totalOutstanding = 0
  let overdueAmount = 0
  let overdueCount = 0
  let dueSoonAmount = 0
  let dueSoonCount = 0
  let noDueDateCount = 0
  let paidThisMonth = 0

  for (const payment of payments) if (text(payment.payment_date).startsWith(monthPrefix)) paidThisMonth += numberValue(payment.amount)

  const normalizedPurchases = purchases.map((purchase) => {
    const totalAmount = numberValue(purchase.total_amount)
    const paidAmount = Math.min(totalAmount, paidByPurchase.get(purchase.id) ?? 0)
    const outstandingAmount = Math.max(0, totalAmount - paidAmount)
    const dueDate = text(purchase.due_date) || null
    const cancelled = purchase.status === 'CANCELLED'
    let paymentState = 'PAID'
    if (cancelled) paymentState = 'CANCELLED'
    else if (outstandingAmount > 0 && !dueDate) paymentState = 'NO_DUE_DATE'
    else if (outstandingAmount > 0 && dueDate! < today) paymentState = 'OVERDUE'
    else if (outstandingAmount > 0 && dueDate! === today) paymentState = 'DUE_TODAY'
    else if (outstandingAmount > 0 && dueDate! <= dueSoonLimit) paymentState = 'DUE_SOON'
    else if (outstandingAmount > 0) paymentState = paidAmount > 0 ? 'PARTIAL' : 'SCHEDULED'

    if (!cancelled && outstandingAmount > 0) {
      totalOutstanding += outstandingAmount
      if (!dueDate) noDueDateCount += 1
      else if (dueDate < today) { overdueAmount += outstandingAmount; overdueCount += 1 }
      else if (dueDate <= dueSoonLimit) { dueSoonAmount += outstandingAmount; dueSoonCount += 1 }
    }

    return { ...purchase, total_amount: totalAmount, paid_amount: paidAmount, outstanding_amount: outstandingAmount, payment_state: paymentState, payments: payments.filter((payment) => payment.purchase_id === purchase.id), legacy_record: false, legacy_amount_available: true }
  })

  const linkedIds = new Set(normalizedPurchases.map((row) => text(row.source_transaction_id)).filter(Boolean))
  const rawMeta = new Map<string, JsonRecord>()
  for (const row of rawMaterials) { const id = text(row.id); const code = text(row.item_code); if (id) rawMeta.set(id, row); if (code) rawMeta.set(code, row) }
  const packagingMeta = new Map<string, JsonRecord>()
  for (const row of packagingMaterials) { const id = text(row.id); const code = text(row.material_code); if (id) packagingMeta.set(id, row); if (code) packagingMeta.set(code, row) }

  const legacyRows = [...legacyRawRows(rawTransactions, linkedIds, rawMeta), ...legacyPackagingRows(packagingTransactions, linkedIds, packagingMeta)]
  const allPurchases = [...normalizedPurchases, ...legacyRows].sort((a, b) => {
    const dateCompare = text(b.receipt_date ?? b.purchase_date).localeCompare(text(a.receipt_date ?? a.purchase_date))
    if (dateCompare !== 0) return dateCompare
    return text(b.created_at).localeCompare(text(a.created_at))
  })

  return {
    suppliers,
    purchases: allPurchases,
    payments,
    raw_materials: rawMaterials,
    packaging_materials: packagingMaterials,
    summary: {
      total_outstanding: Math.round(totalOutstanding), overdue_amount: Math.round(overdueAmount), overdue_count: overdueCount,
      due_soon_amount: Math.round(dueSoonAmount), due_soon_count: dueSoonCount, no_due_date_count: noDueDateCount,
      paid_this_month: Math.round(paidThisMonth),
      open_purchase_count: normalizedPurchases.filter((row) => row.outstanding_amount > 0 && row.status !== 'CANCELLED').length,
      legacy_receipt_count: legacyRows.length,
    },
  }
}

function preparePurchase(body: JsonRecord, supplier: SupplierRow): PreparedPurchase {
  const purchaseDate = text(body.purchase_date) || kstToday()
  const receiptDate = text(body.receipt_date) || purchaseDate
  const category = text(body.purchase_category).toUpperCase()
  const materialId = text(body.material_id)
  const quantity = numberValue(body.quantity, 0)
  const unitPrice = numberValue(body.unit_price, 0)
  const suppliedSupplyAmount = text(body.supply_amount)
  const supplyAmount = suppliedSupplyAmount === '' ? quantity * unitPrice : numberValue(body.supply_amount, quantity * unitPrice)
  const vatAmount = numberValue(body.vat_amount, 0)
  const suppliedTotalAmount = text(body.total_amount)
  const totalAmount = suppliedTotalAmount === '' ? supplyAmount + vatAmount : numberValue(body.total_amount, supplyAmount + vatAmount)
  const unit = category === 'PACKAGING' ? 'EA' : text(body.unit).toUpperCase() || 'KG'
  const paymentMethod = text(body.planned_payment_method).toUpperCase() || text(supplier.default_payment_method) || 'BANK_TRANSFER'
  const taxInvoiceStatus = text(body.tax_invoice_status).toUpperCase() || (supplier.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED')

  if (!isDate(purchaseDate) || !isDate(receiptDate)) throw new Error('매입일과 입고일을 확인해 주세요.')
  if (!PURCHASE_CATEGORIES.has(category)) throw new Error('원재료 또는 부재료를 선택해 주세요.')
  if (!materialId) throw new Error('입고할 품목을 선택해 주세요.')
  if (quantity <= 0) throw new Error('입고수량은 0보다 커야 합니다.')
  if (category === 'RAW_MATERIAL' && !RAW_UNITS.has(unit)) throw new Error('원재료 단위는 kg, g, EA만 사용할 수 있습니다.')
  if (category === 'PACKAGING' && (!Number.isInteger(quantity) || unit !== 'EA')) throw new Error('부재료 수량은 정수 EA로 입력해 주세요.')
  if (unitPrice < 0 || supplyAmount < 0 || vatAmount < 0 || totalAmount < 0) throw new Error('매입금액을 확인해 주세요.')
  if (!PAYMENT_METHODS.has(paymentMethod)) throw new Error('결제수단을 확인해 주세요.')
  if (!TAX_INVOICE_STATUSES.has(taxInvoiceStatus)) throw new Error('세금계산서 상태를 확인해 주세요.')

  const dueDate = calculateDueDate(purchaseDate, supplier, text(body.due_date))
  return {
    business_id: BUSINESS_ID, supplier_id: supplier.id, purchase_date: purchaseDate, receipt_date: receiptDate,
    purchase_category: category as 'RAW_MATERIAL' | 'PACKAGING', material_id: materialId, quantity, unit, unit_price: unitPrice,
    supply_amount: supplyAmount, vat_amount: vatAmount, total_amount: totalAmount, due_date: dueDate,
    planned_payment_method: paymentMethod,
    planned_payment_account: text(body.planned_payment_account) || text(supplier.default_payment_account),
    planned_card_name: text(body.planned_card_name) || text(supplier.default_card_name),
    planned_installment_months: paymentMethod === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.planned_installment_months, supplier.default_installment_months || 1))) : 1,
    tax_invoice_status: taxInvoiceStatus,
    tax_invoice_amount: body.tax_invoice_amount === null || body.tax_invoice_amount === undefined || text(body.tax_invoice_amount) === '' ? null : numberValue(body.tax_invoice_amount),
    notes: text(body.notes),
  }
}

function rpcArgs(row: PreparedPurchase) {
  return {
    p_business_id: row.business_id, p_supplier_id: row.supplier_id, p_purchase_date: row.purchase_date, p_receipt_date: row.receipt_date,
    p_purchase_category: row.purchase_category, p_material_id: row.material_id, p_quantity: row.quantity, p_unit: row.unit,
    p_unit_price: row.unit_price, p_supply_amount: row.supply_amount, p_vat_amount: row.vat_amount, p_total_amount: row.total_amount,
    p_due_date: row.due_date || null, p_planned_payment_method: row.planned_payment_method,
    p_planned_payment_account: row.planned_payment_account || null, p_planned_card_name: row.planned_card_name || null,
    p_planned_installment_months: row.planned_installment_months, p_tax_invoice_status: row.tax_invoice_status,
    p_tax_invoice_amount: row.tax_invoice_amount, p_notes: row.notes || null,
  }
}

async function loadSupplier(supabase: MoniClient, supplierId: string) {
  const { data, error } = await supabase.from('purchase_suppliers').select('*').eq('id', supplierId).eq('business_id', BUSINESS_ID).eq('status', 'ACTIVE').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('선택한 매입처를 찾을 수 없습니다.')
  return data as SupplierRow
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    const state = await loadState()
    const scope = text(request.nextUrl.searchParams.get('scope'))
    if (scope === 'dashboard') return NextResponse.json({ ok: true, summary: state.summary, purchases: state.purchases.filter((row) => !row.legacy_record).slice(0, 10) })
    return NextResponse.json({ ok: true, ...state })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '매입 데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    const body = await request.json().catch(() => null) as JsonRecord | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const action = text(body.action)
    const supabase = createMoniServiceRoleClient()

    if (action === 'create_supplier' || action === 'update_supplier') {
      const companyName = text(body.company_name)
      if (!companyName) return NextResponse.json({ ok: false, error: '매입처명을 입력해 주세요.' }, { status: 400 })
      const supplyType = text(body.supply_type).toUpperCase() || 'BOTH'
      const dueType = text(body.default_due_type).toUpperCase() || 'DAYS'
      const paymentMethod = text(body.default_payment_method).toUpperCase() || 'BANK_TRANSFER'
      const taxType = text(body.tax_type).toUpperCase() || 'TAXABLE'
      if (!SUPPLY_TYPES.has(supplyType) || !DUE_TYPES.has(dueType) || !PAYMENT_METHODS.has(paymentMethod) || !TAX_TYPES.has(taxType)) return NextResponse.json({ ok: false, error: '매입처 거래조건을 확인해 주세요.' }, { status: 400 })
      const payload = {
        business_id: BUSINESS_ID, company_name: companyName,
        business_registration_number: text(body.business_registration_number) || null,
        representative_name: text(body.representative_name) || null, contact_name: text(body.contact_name) || null,
        phone: text(body.phone) || null, email: text(body.email) || null, address: text(body.address) || null,
        supply_type: supplyType, default_due_type: dueType,
        default_due_days: dueType === 'DAYS' ? Math.max(0, integerValue(body.default_due_days, 0)) : null,
        default_due_day: dueType === 'NEXT_MONTH_DAY' ? Math.min(31, Math.max(1, integerValue(body.default_due_day, 1))) : null,
        default_payment_method: paymentMethod, default_payment_account: text(body.default_payment_account) || null,
        default_card_name: text(body.default_card_name) || null,
        default_installment_months: paymentMethod === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.default_installment_months, 1))) : 1,
        tax_invoice_required: boolValue(body.tax_invoice_required, true), tax_type: taxType,
        currency: text(body.currency) || 'KRW', status: text(body.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        notes: text(body.notes) || null, updated_at: new Date().toISOString(),
      }
      if (action === 'create_supplier') {
        const { data, error } = await supabase.from('purchase_suppliers').insert(payload).select('*').single()
        if (error) throw new Error(error.message)
        return NextResponse.json({ ok: true, supplier: data })
      }
      const id = text(body.id)
      if (!id) return NextResponse.json({ ok: false, error: '매입처 ID가 필요합니다.' }, { status: 400 })
      const { data, error } = await supabase.from('purchase_suppliers').update(payload).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, supplier: data })
    }

    if (action === 'create_purchase') {
      const supplierId = text(body.supplier_id)
      if (!supplierId) return NextResponse.json({ ok: false, error: '매입처를 선택해 주세요.' }, { status: 400 })
      const supplier = await loadSupplier(supabase, supplierId)
      const prepared = preparePurchase(body, supplier)
      const { data, error } = await supabase.rpc('moni_create_purchase_receipt', rpcArgs(prepared))
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, purchase: data })
    }

    if (action === 'create_purchase_batch') {
      const rows = Array.isArray(body.rows) ? body.rows as JsonRecord[] : []
      if (!rows.length) return NextResponse.json({ ok: false, error: '등록할 엑셀 내역이 없습니다.' }, { status: 400 })
      if (rows.length > MAX_BATCH_ROWS) return NextResponse.json({ ok: false, error: `한 번에 최대 ${MAX_BATCH_ROWS}건까지 등록할 수 있습니다.` }, { status: 400 })
      const supplierIds = Array.from(new Set(rows.map((row) => text(row.supplier_id)).filter(Boolean)))
      const supplierResult = await supabase.from('purchase_suppliers').select('*').eq('business_id', BUSINESS_ID).eq('status', 'ACTIVE').in('id', supplierIds)
      if (supplierResult.error) throw new Error(supplierResult.error.message)
      const supplierById = new Map((supplierResult.data ?? []).map((row) => [text(row.id), row as SupplierRow]))
      const preparedRows = rows.map((row, index) => {
        const supplier = supplierById.get(text(row.supplier_id))
        if (!supplier) throw new Error(`${index + 2}행의 매입처를 찾을 수 없습니다.`)
        try { return preparePurchase(row, supplier) } catch (error) { throw new Error(`${index + 2}행: ${error instanceof Error ? error.message : '입력값을 확인해 주세요.'}`) }
      })
      const { data, error } = await supabase.rpc('moni_create_purchase_receipts_batch', { p_rows: preparedRows })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, purchases: data, created_count: preparedRows.length })
    }

    if (action === 'add_payment') {
      const purchaseId = text(body.purchase_id)
      const paymentDate = text(body.payment_date) || kstToday()
      const amount = numberValue(body.amount, 0)
      const method = text(body.payment_method).toUpperCase() || 'BANK_TRANSFER'
      if (!purchaseId || !isDate(paymentDate) || amount <= 0 || !PAYMENT_METHODS.has(method)) return NextResponse.json({ ok: false, error: '지급일·금액·결제수단을 확인해 주세요.' }, { status: 400 })
      const { data: purchase, error: purchaseError } = await supabase.from('purchases').select('id,total_amount,status').eq('id', purchaseId).eq('business_id', BUSINESS_ID).maybeSingle()
      if (purchaseError) throw new Error(purchaseError.message)
      if (!purchase || purchase.status === 'CANCELLED') return NextResponse.json({ ok: false, error: '지급할 수 없는 매입 건입니다.' }, { status: 409 })
      const { data: existingPayments, error: existingError } = await supabase.from('purchase_payments').select('amount').eq('purchase_id', purchaseId)
      if (existingError) throw new Error(existingError.message)
      const alreadyPaid = (existingPayments ?? []).reduce((sum, row) => sum + numberValue(row.amount), 0)
      const remaining = Math.max(0, numberValue(purchase.total_amount) - alreadyPaid)
      if (amount > remaining + 0.0001) return NextResponse.json({ ok: false, error: `남은 미지급금 ${Math.round(remaining).toLocaleString('ko-KR')}원을 초과할 수 없습니다.` }, { status: 409 })
      const paymentPayload = { business_id: BUSINESS_ID, purchase_id: purchaseId, payment_date: paymentDate, amount, payment_method: method, payment_account: text(body.payment_account) || null, card_name: text(body.card_name) || null, installment_months: method === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.installment_months, 1))) : 1, reference: text(body.reference) || null, notes: text(body.notes) || null }
      const { data, error } = await supabase.from('purchase_payments').insert(paymentPayload).select('*').single()
      if (error) throw new Error(error.message)
      const nextRemaining = Math.max(0, remaining - amount)
      const nextStatus = nextRemaining <= 0.0001 ? 'PAID' : 'PARTIAL'
      const updateResult = await supabase.from('purchases').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', purchaseId)
      if (updateResult.error) throw new Error(updateResult.error.message)
      return NextResponse.json({ ok: true, payment: data, remaining_amount: nextRemaining })
    }

    if (action === 'update_tax_invoice') {
      const id = text(body.id)
      const status = text(body.tax_invoice_status).toUpperCase()
      if (!id || !TAX_INVOICE_STATUSES.has(status)) return NextResponse.json({ ok: false, error: '세금계산서 상태를 확인해 주세요.' }, { status: 400 })
      const { data, error } = await supabase.from('purchases').update({ tax_invoice_status: status, tax_invoice_amount: body.tax_invoice_amount === null || body.tax_invoice_amount === undefined ? null : numberValue(body.tax_invoice_amount), updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, purchase: data })
    }

    if (action === 'cancel_purchase') {
      const id = text(body.id)
      if (!id) return NextResponse.json({ ok: false, error: '매입 ID가 필요합니다.' }, { status: 400 })
      const { data, error } = await supabase.rpc('moni_cancel_purchase_receipt', { p_purchase_id: id, p_business_id: BUSINESS_ID })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, purchase: data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '매입 처리 중 오류가 발생했습니다.'
    const duplicate = message.includes('purchase_suppliers_business_id_company_name_key')
    return NextResponse.json({ ok: false, error: duplicate ? '같은 이름의 매입처가 이미 등록되어 있습니다.' : message }, { status: 500 })
  }
}
