import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const PAGE_SIZE = 1000
const MAX_PAGES = 100
const PAYMENT_METHODS = new Set(['BANK_TRANSFER', 'CARD', 'CASH', 'OTHER'])
const TAX_STATUSES = new Set(['NOT_REQUIRED', 'NOT_RECEIVED', 'RECEIVED', 'MATCHED', 'MISMATCH'])
const RAW_UNITS = new Set(['KG', 'G', 'EA'])

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

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function todaySeoul() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDate(date)
}

function nextMonthDay(value: string, day: number) {
  const date = new Date(`${value}T00:00:00Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return isoDate(new Date(Date.UTC(year, month, Math.min(Math.max(day, 1), lastDay))))
}

function nextMonthEnd(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 0)))
}

function dueDate(purchaseDate: string, supplier: SupplierRow, direct: string) {
  if (direct && isDate(direct)) return direct
  const type = text(supplier.default_due_type) || 'DAYS'
  if (type === 'IMMEDIATE') return purchaseDate
  if (type === 'DAYS') return addDays(purchaseDate, Math.max(0, integerValue(supplier.default_due_days)))
  if (type === 'NEXT_MONTH_DAY') return nextMonthDay(purchaseDate, integerValue(supplier.default_due_day, 1))
  if (type === 'MONTH_END') return nextMonthEnd(purchaseDate)
  return ''
}

function scopedBusiness(value: unknown) {
  const businessId = text(value)
  return businessId === BUSINESS_ID || businessId === 'default' || businessId === ''
}

function inbound(value: unknown) {
  const normalized = text(value).toUpperCase()
  return normalized === 'INBOUND' || normalized.includes('입고')
}

function transactionDate(row: JsonRecord) {
  const value = text(row.receipt_date) || text(row.transaction_date) || text(row.txn_date)
  if (isDate(value)) return value
  const created = text(row.created_at)
  return /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : ''
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function fetchAll(supabase: MoniClient, table: 'raw_material_transactions' | 'packaging_transactions') {
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
  throw new Error(`${table} 데이터가 ${PAGE_SIZE * MAX_PAGES}건을 초과했습니다.`)
}

function rawDisplay(row: JsonRecord, totalGrams: number) {
  const packs = numberValue(row.quantity_packs)
  const packingWeight = numberValue(row.packing_weight_g)
  const unit = text(row.packing_unit).toUpperCase()
  if (packs > 0 && packingWeight > 0) {
    return {
      quantity: packs,
      unit: 'EA',
      receipt_unit_label: `${Math.round(packingWeight).toLocaleString('ko-KR')}g/EA`,
    }
  }
  if (unit === 'KG') return { quantity: totalGrams / 1000, unit: 'KG', receipt_unit_label: 'kg' }
  if (unit === 'G') return { quantity: totalGrams, unit: 'G', receipt_unit_label: 'g' }
  return { quantity: totalGrams, unit: 'G', receipt_unit_label: 'g' }
}

function legacyRawRows(rows: JsonRecord[], rawByRef: Map<string, JsonRecord>) {
  return rows.flatMap((row) => {
    if (!scopedBusiness(row.business_id) || !inbound(row.txn_type ?? row.transaction_type) || text(row.source_purchase_id)) return []
    const transactionId = text(row.id)
    const materialRef = text(row.item_code ?? row.raw_material_id)
    const material = rawByRef.get(materialRef)
    const grams = Math.max(0, numberValue(row.total_weight_g ?? row.quantity_g ?? row.quantity))
    const date = transactionDate(row)
    if (!transactionId || !date || grams <= 0) return []
    const display = rawDisplay(row, grams)
    const totalAmount = Math.max(0, numberValue(row.total_price))
    return [{
      id: `legacy-raw-${transactionId}`,
      purchase_no: '',
      supplier_id: '',
      supplier_name_snapshot: text(row.supplier) || text(material?.supplier) || '매입처 미등록',
      purchase_date: date,
      receipt_date: date,
      purchase_category: 'RAW_MATERIAL',
      material_id: text(material?.id) || materialRef,
      item_name: text(row.raw_material_name ?? row.item_name) || text(material?.item_name) || '원재료명 확인 필요',
      quantity: display.quantity,
      unit: display.unit,
      receipt_unit_label: display.receipt_unit_label,
      unit_price: Math.max(0, numberValue(row.unit_price ?? material?.unit_price_per_kg)),
      supply_amount: totalAmount,
      vat_amount: 0,
      total_amount: totalAmount,
      inventory_quantity_base: grams,
      inventory_unit: 'G',
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
      source_transaction_id: transactionId,
      notes: text(row.note),
      paid_amount: 0,
      outstanding_amount: 0,
      payment_state: 'LEGACY',
      legacy_record: true,
      created_at: text(row.created_at),
    }]
  })
}

function legacyPackagingRows(rows: JsonRecord[], packagingByRef: Map<string, JsonRecord>) {
  return rows.flatMap((row) => {
    if (!scopedBusiness(row.business_id) || !inbound(row.txn_type) || text(row.source_purchase_id)) return []
    const transactionId = text(row.id)
    const materialRef = text(row.material_code)
    const material = packagingByRef.get(materialRef)
    const quantity = Math.max(0, numberValue(row.quantity))
    const date = transactionDate(row)
    if (!transactionId || !date || quantity <= 0) return []
    return [{
      id: `legacy-packaging-${transactionId}`,
      purchase_no: '',
      supplier_id: '',
      supplier_name_snapshot: text(row.counterparty ?? row.supplier) || text(material?.supplier) || '매입처 미등록',
      purchase_date: date,
      receipt_date: date,
      purchase_category: 'PACKAGING',
      material_id: text(material?.id) || materialRef,
      item_name: text(material?.material_name) || materialRef || '부재료명 확인 필요',
      quantity,
      unit: 'EA',
      receipt_unit_label: 'EA',
      unit_price: Math.max(0, numberValue(material?.unit_price)),
      supply_amount: 0,
      vat_amount: 0,
      total_amount: 0,
      inventory_quantity_base: quantity,
      inventory_unit: 'EA',
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
      source_transaction_id: transactionId,
      notes: text(row.note),
      paid_amount: 0,
      outstanding_amount: 0,
      payment_state: 'LEGACY',
      legacy_record: true,
      created_at: text(row.created_at),
    }]
  })
}

async function loadState() {
  const supabase = createMoniServiceRoleClient()
  const [supplierResult, purchaseResult, paymentResult, rawResult, packagingResult, rawTransactions, packagingTransactions] = await Promise.all([
    supabase.from('purchase_suppliers').select('*').eq('business_id', BUSINESS_ID).order('company_name'),
    supabase.from('purchases').select('*').eq('business_id', BUSINESS_ID).neq('status', 'CANCELLED').order('receipt_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('purchase_payments').select('*').eq('business_id', BUSINESS_ID),
    supabase.from('raw_materials').select('*').order('item_name'),
    supabase.from('packaging_materials').select('*').order('material_name'),
    fetchAll(supabase, 'raw_material_transactions'),
    fetchAll(supabase, 'packaging_transactions'),
  ])
  if (supplierResult.error) throw new Error(supplierResult.error.message)
  if (purchaseResult.error) throw new Error(purchaseResult.error.message)
  if (paymentResult.error) throw new Error(paymentResult.error.message)
  if (rawResult.error) throw new Error(rawResult.error.message)
  if (packagingResult.error) throw new Error(packagingResult.error.message)

  const suppliers = (supplierResult.data ?? []) as SupplierRow[]
  const purchases = (purchaseResult.data ?? []) as JsonRecord[]
  const payments = (paymentResult.data ?? []) as JsonRecord[]
  const rawMaterials = ((rawResult.data ?? []) as JsonRecord[]).filter((row) => row.is_active !== false && scopedBusiness(row.business_id))
  const packagingMaterials = ((packagingResult.data ?? []) as JsonRecord[]).filter((row) => row.is_active !== false && scopedBusiness(row.business_id))

  const paidByPurchase = new Map<string, number>()
  for (const payment of payments) {
    const purchaseId = text(payment.purchase_id)
    paidByPurchase.set(purchaseId, (paidByPurchase.get(purchaseId) ?? 0) + numberValue(payment.amount))
  }

  const today = todaySeoul()
  const dueSoon = addDays(today, 7)
  const currentRows = purchases.map((purchase) => {
    const totalAmount = numberValue(purchase.total_amount)
    const paidAmount = Math.min(totalAmount, paidByPurchase.get(text(purchase.id)) ?? 0)
    const outstandingAmount = Math.max(0, totalAmount - paidAmount)
    const due = text(purchase.due_date)
    let paymentState = 'PAID'
    if (outstandingAmount > 0 && !due) paymentState = 'NO_DUE_DATE'
    else if (outstandingAmount > 0 && due < today) paymentState = 'OVERDUE'
    else if (outstandingAmount > 0 && due === today) paymentState = 'DUE_TODAY'
    else if (outstandingAmount > 0 && due <= dueSoon) paymentState = 'DUE_SOON'
    else if (outstandingAmount > 0) paymentState = paidAmount > 0 ? 'PARTIAL' : 'SCHEDULED'
    return {
      ...purchase,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
      payment_state: paymentState,
      legacy_record: false,
      receipt_unit_label: text(purchase.unit),
    }
  })

  const rawByRef = new Map<string, JsonRecord>()
  for (const row of rawMaterials) {
    if (text(row.id)) rawByRef.set(text(row.id), row)
    if (text(row.item_code)) rawByRef.set(text(row.item_code), row)
  }
  const packagingByRef = new Map<string, JsonRecord>()
  for (const row of packagingMaterials) {
    if (text(row.id)) packagingByRef.set(text(row.id), row)
    if (text(row.material_code)) packagingByRef.set(text(row.material_code), row)
  }

  const rows = [
    ...currentRows,
    ...legacyRawRows(rawTransactions, rawByRef),
    ...legacyPackagingRows(packagingTransactions, packagingByRef),
  ].sort((a, b) => {
    const date = text(b.receipt_date ?? b.purchase_date).localeCompare(text(a.receipt_date ?? a.purchase_date))
    return date || text(b.created_at).localeCompare(text(a.created_at))
  })

  return { suppliers, raw_materials: rawMaterials, packaging_materials: packagingMaterials, rows }
}

async function activeSupplier(supabase: MoniClient, supplierId: string) {
  const { data, error } = await supabase
    .from('purchase_suppliers')
    .select('*')
    .eq('id', supplierId)
    .eq('business_id', BUSINESS_ID)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('선택한 매입처를 찾을 수 없습니다.')
  return data as SupplierRow
}

function prepare(body: JsonRecord, supplier: SupplierRow): PreparedPurchase {
  const purchaseDate = text(body.purchase_date) || todaySeoul()
  const receiptDate = text(body.receipt_date) || purchaseDate
  const category = text(body.purchase_category).toUpperCase()
  const materialId = text(body.material_id)
  const quantity = numberValue(body.quantity)
  const unit = category === 'PACKAGING' ? 'EA' : text(body.unit).toUpperCase() || 'KG'
  const unitPrice = Math.max(0, numberValue(body.unit_price))
  const supplyAmount = Math.max(0, numberValue(body.supply_amount, quantity * unitPrice))
  const vatAmount = Math.max(0, numberValue(body.vat_amount))
  const totalAmount = Math.max(0, numberValue(body.total_amount, supplyAmount + vatAmount))
  const method = text(body.planned_payment_method).toUpperCase() || text(supplier.default_payment_method) || 'BANK_TRANSFER'
  const taxStatus = text(body.tax_invoice_status).toUpperCase() || (supplier.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED')

  if (!isDate(purchaseDate) || !isDate(receiptDate)) throw new Error('매입일과 입고일을 확인해 주세요.')
  if (category !== 'RAW_MATERIAL' && category !== 'PACKAGING') throw new Error('원재료 또는 부재료를 선택해 주세요.')
  if (!materialId) throw new Error('입고 품목을 선택해 주세요.')
  if (quantity <= 0) throw new Error('입고수량은 0보다 커야 합니다.')
  if (category === 'RAW_MATERIAL' && !RAW_UNITS.has(unit)) throw new Error('원재료 단위는 kg, g, EA만 사용할 수 있습니다.')
  if (category === 'PACKAGING' && (!Number.isInteger(quantity) || unit !== 'EA')) throw new Error('부재료 수량은 정수 EA여야 합니다.')
  if (!PAYMENT_METHODS.has(method)) throw new Error('결제수단을 확인해 주세요.')
  if (!TAX_STATUSES.has(taxStatus)) throw new Error('세금계산서 상태를 확인해 주세요.')

  return {
    business_id: BUSINESS_ID,
    supplier_id: supplier.id,
    purchase_date: purchaseDate,
    receipt_date: receiptDate,
    purchase_category: category as PreparedPurchase['purchase_category'],
    material_id: materialId,
    quantity,
    unit,
    unit_price: unitPrice,
    supply_amount: supplyAmount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    due_date: dueDate(purchaseDate, supplier, text(body.due_date)),
    planned_payment_method: method,
    planned_payment_account: text(body.planned_payment_account) || text(supplier.default_payment_account),
    planned_card_name: text(body.planned_card_name) || text(supplier.default_card_name),
    planned_installment_months: method === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.planned_installment_months, supplier.default_installment_months || 1))) : 1,
    tax_invoice_status: taxStatus,
    tax_invoice_amount: text(body.tax_invoice_amount) ? numberValue(body.tax_invoice_amount) : null,
    notes: text(body.notes),
  }
}

function rpcArgs(row: PreparedPurchase) {
  return {
    p_business_id: row.business_id,
    p_supplier_id: row.supplier_id,
    p_purchase_date: row.purchase_date,
    p_receipt_date: row.receipt_date,
    p_purchase_category: row.purchase_category,
    p_material_id: row.material_id,
    p_quantity: row.quantity,
    p_unit: row.unit,
    p_unit_price: row.unit_price,
    p_supply_amount: row.supply_amount,
    p_vat_amount: row.vat_amount,
    p_total_amount: row.total_amount,
    p_due_date: row.due_date || null,
    p_planned_payment_method: row.planned_payment_method,
    p_planned_payment_account: row.planned_payment_account || null,
    p_planned_card_name: row.planned_card_name || null,
    p_planned_installment_months: row.planned_installment_months,
    p_tax_invoice_status: row.tax_invoice_status,
    p_tax_invoice_amount: row.tax_invoice_amount,
    p_notes: row.notes || null,
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    return NextResponse.json({ ok: true, ...(await loadState()) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '입고내역을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    const body = await request.json().catch(() => null) as JsonRecord | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const action = text(body.action)
    const supabase = createMoniServiceRoleClient()

    if (action === 'update_purchase') {
      const id = text(body.id)
      const supplierId = text(body.supplier_id)
      if (!id || !supplierId) return NextResponse.json({ ok: false, error: '수정할 내역과 매입처를 확인해 주세요.' }, { status: 400 })
      const prepared = prepare(body, await activeSupplier(supabase, supplierId))
      const { data, error } = await supabase.rpc('moni_update_purchase_receipt', { p_purchase_id: id, ...rpcArgs(prepared) })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, row: data })
    }

    if (action === 'update_legacy') {
      const sourceType = text(body.source_transaction_type).toUpperCase()
      const transactionId = text(body.source_transaction_id)
      if (!transactionId || !['RAW_MATERIAL', 'PACKAGING'].includes(sourceType)) {
        return NextResponse.json({ ok: false, error: '수정할 기존 입고내역을 확인해 주세요.' }, { status: 400 })
      }
      const { data, error } = await supabase.rpc('moni_update_legacy_receipt', {
        p_source_type: sourceType,
        p_transaction_id: transactionId,
        p_material_id: text(body.material_id),
        p_receipt_date: text(body.receipt_date),
        p_quantity: numberValue(body.quantity),
        p_unit: text(body.unit).toUpperCase(),
        p_supplier: text(body.supplier_name_snapshot),
        p_unit_price: numberValue(body.unit_price),
        p_total_amount: numberValue(body.total_amount),
        p_notes: text(body.notes) || null,
        p_business_id: BUSINESS_ID,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, row: data })
    }

    if (action === 'delete_purchase') {
      const id = text(body.id)
      if (!id) return NextResponse.json({ ok: false, error: '삭제할 내역을 확인해 주세요.' }, { status: 400 })
      const { data, error } = await supabase.rpc('moni_delete_purchase_receipt', { p_purchase_id: id, p_business_id: BUSINESS_ID })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, result: data })
    }

    if (action === 'delete_legacy') {
      const sourceType = text(body.source_transaction_type).toUpperCase()
      const transactionId = text(body.source_transaction_id)
      if (!transactionId || !['RAW_MATERIAL', 'PACKAGING'].includes(sourceType)) {
        return NextResponse.json({ ok: false, error: '삭제할 기존 입고내역을 확인해 주세요.' }, { status: 400 })
      }
      const { data, error } = await supabase.rpc('moni_delete_legacy_receipt', {
        p_source_type: sourceType,
        p_transaction_id: transactionId,
        p_business_id: BUSINESS_ID,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, result: data })
    }

    if (action === 'update_tax') {
      const id = text(body.id)
      const status = text(body.tax_invoice_status).toUpperCase()
      if (!id || !TAX_STATUSES.has(status)) return NextResponse.json({ ok: false, error: '세금계산서 상태를 확인해 주세요.' }, { status: 400 })
      const { data, error } = await supabase.from('purchases').update({
        tax_invoice_status: status,
        tax_invoice_amount: status === 'MATCHED' ? numberValue(body.total_amount) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, row: data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '입고내역 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
