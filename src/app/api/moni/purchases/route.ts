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
const PURCHASE_CATEGORIES = new Set(['RAW_MATERIAL', 'PACKAGING', 'OTHER'])
const TAX_INVOICE_STATUSES = new Set(['NOT_REQUIRED', 'NOT_RECEIVED', 'RECEIVED', 'MATCHED', 'MISMATCH'])

type JsonRecord = Record<string, unknown>

type SupplierRow = {
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
  tax_type: string
  [key: string]: unknown
}

type PurchaseRow = {
  id: string
  supplier_id: string
  purchase_no: string
  purchase_date: string
  due_date: string | null
  total_amount: number | string
  status: string
  [key: string]: unknown
}

type PaymentRow = {
  id: string
  purchase_id: string
  payment_date: string
  amount: number | string
  [key: string]: unknown
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
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
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
  return null
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function nextPurchaseNo() {
  const year = kstToday().slice(0, 4)
  const prefix = `DB-PO-${year}-`
  const supabase = createMoniServiceRoleClient()
  const { data, error } = await supabase
    .from('purchases')
    .select('purchase_no')
    .like('purchase_no', `${prefix}%`)
    .order('purchase_no', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const previous = text(data?.[0]?.purchase_no)
  const sequence = previous.startsWith(prefix) ? integerValue(previous.slice(prefix.length), 0) + 1 : 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

async function loadState() {
  const supabase = createMoniServiceRoleClient()
  const [supplierResult, purchaseResult, paymentResult] = await Promise.all([
    supabase.from('purchase_suppliers').select('*').eq('business_id', BUSINESS_ID).order('company_name'),
    supabase.from('purchases').select('*').eq('business_id', BUSINESS_ID).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('purchase_payments').select('*').eq('business_id', BUSINESS_ID).order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  if (supplierResult.error) throw new Error(supplierResult.error.message)
  if (purchaseResult.error) throw new Error(purchaseResult.error.message)
  if (paymentResult.error) throw new Error(paymentResult.error.message)

  const suppliers = (supplierResult.data ?? []) as SupplierRow[]
  const purchases = (purchaseResult.data ?? []) as PurchaseRow[]
  const payments = (paymentResult.data ?? []) as PaymentRow[]
  const paidByPurchase = new Map<string, number>()
  for (const payment of payments) {
    paidByPurchase.set(payment.purchase_id, (paidByPurchase.get(payment.purchase_id) ?? 0) + numberValue(payment.amount))
  }

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

  for (const payment of payments) {
    if (text(payment.payment_date).startsWith(monthPrefix)) paidThisMonth += numberValue(payment.amount)
  }

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

    return {
      ...purchase,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      outstanding_amount: outstandingAmount,
      payment_state: paymentState,
      payments: payments.filter((payment) => payment.purchase_id === purchase.id),
    }
  })

  return {
    suppliers,
    purchases: normalizedPurchases,
    payments,
    summary: {
      total_outstanding: Math.round(totalOutstanding),
      overdue_amount: Math.round(overdueAmount),
      overdue_count: overdueCount,
      due_soon_amount: Math.round(dueSoonAmount),
      due_soon_count: dueSoonCount,
      no_due_date_count: noDueDateCount,
      paid_this_month: Math.round(paidThisMonth),
      open_purchase_count: normalizedPurchases.filter((row) => row.outstanding_amount > 0 && row.status !== 'CANCELLED').length,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    const state = await loadState()
    const scope = text(request.nextUrl.searchParams.get('scope'))
    if (scope === 'dashboard') {
      return NextResponse.json({ ok: true, summary: state.summary, purchases: state.purchases.slice(0, 10) })
    }
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
      if (!SUPPLY_TYPES.has(supplyType) || !DUE_TYPES.has(dueType) || !PAYMENT_METHODS.has(paymentMethod) || !TAX_TYPES.has(taxType)) {
        return NextResponse.json({ ok: false, error: '매입처 거래조건을 확인해 주세요.' }, { status: 400 })
      }
      const payload = {
        business_id: BUSINESS_ID,
        company_name: companyName,
        business_registration_number: text(body.business_registration_number) || null,
        representative_name: text(body.representative_name) || null,
        contact_name: text(body.contact_name) || null,
        phone: text(body.phone) || null,
        email: text(body.email) || null,
        address: text(body.address) || null,
        supply_type: supplyType,
        default_due_type: dueType,
        default_due_days: dueType === 'DAYS' ? Math.max(0, integerValue(body.default_due_days, 0)) : null,
        default_due_day: dueType === 'NEXT_MONTH_DAY' ? Math.min(31, Math.max(1, integerValue(body.default_due_day, 1))) : null,
        default_payment_method: paymentMethod,
        default_payment_account: text(body.default_payment_account) || null,
        default_card_name: text(body.default_card_name) || null,
        default_installment_months: paymentMethod === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.default_installment_months, 1))) : 1,
        tax_invoice_required: boolValue(body.tax_invoice_required, true),
        tax_type: taxType,
        currency: text(body.currency) || 'KRW',
        status: text(body.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        notes: text(body.notes) || null,
        updated_at: new Date().toISOString(),
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
      const purchaseDate = text(body.purchase_date) || kstToday()
      const category = text(body.purchase_category).toUpperCase() || 'RAW_MATERIAL'
      const itemName = text(body.item_name)
      const quantity = numberValue(body.quantity, 0)
      const unitPrice = numberValue(body.unit_price, 0)
      const supplyAmount = numberValue(body.supply_amount, quantity * unitPrice)
      const vatAmount = numberValue(body.vat_amount, 0)
      const totalAmount = numberValue(body.total_amount, supplyAmount + vatAmount)
      if (!supplierId || !isDate(purchaseDate) || !PURCHASE_CATEGORIES.has(category) || !itemName || quantity <= 0 || totalAmount < 0) {
        return NextResponse.json({ ok: false, error: '매입 기본정보와 금액을 확인해 주세요.' }, { status: 400 })
      }
      const { data: supplier, error: supplierError } = await supabase.from('purchase_suppliers').select('*').eq('id', supplierId).eq('business_id', BUSINESS_ID).maybeSingle()
      if (supplierError) throw new Error(supplierError.message)
      if (!supplier) return NextResponse.json({ ok: false, error: '선택한 매입처를 찾을 수 없습니다.' }, { status: 404 })
      const supplierRow = supplier as SupplierRow
      const paymentMethod = text(body.planned_payment_method).toUpperCase() || text(supplierRow.default_payment_method) || 'BANK_TRANSFER'
      if (!PAYMENT_METHODS.has(paymentMethod)) return NextResponse.json({ ok: false, error: '결제수단을 확인해 주세요.' }, { status: 400 })
      const taxInvoiceStatus = text(body.tax_invoice_status).toUpperCase() || (supplierRow.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED')
      if (!TAX_INVOICE_STATUSES.has(taxInvoiceStatus)) return NextResponse.json({ ok: false, error: '세금계산서 상태를 확인해 주세요.' }, { status: 400 })
      const purchaseNo = await nextPurchaseNo()
      const payload = {
        business_id: BUSINESS_ID,
        purchase_no: purchaseNo,
        supplier_id: supplierId,
        supplier_name_snapshot: supplierRow.company_name,
        purchase_date: purchaseDate,
        receipt_date: isDate(text(body.receipt_date)) ? text(body.receipt_date) : null,
        purchase_category: category,
        item_name: itemName,
        quantity,
        unit: text(body.unit) || 'EA',
        unit_price: unitPrice,
        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        due_date: calculateDueDate(purchaseDate, supplierRow, text(body.due_date)),
        planned_payment_method: paymentMethod,
        planned_payment_account: text(body.planned_payment_account) || text(supplierRow.default_payment_account) || null,
        planned_card_name: text(body.planned_card_name) || text(supplierRow.default_card_name) || null,
        planned_installment_months: paymentMethod === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.planned_installment_months, supplierRow.default_installment_months || 1))) : 1,
        tax_invoice_status: taxInvoiceStatus,
        tax_invoice_amount: body.tax_invoice_amount === null || body.tax_invoice_amount === undefined ? null : numberValue(body.tax_invoice_amount),
        status: 'OPEN',
        source_transaction_type: PURCHASE_CATEGORIES.has(text(body.source_transaction_type).toUpperCase()) ? text(body.source_transaction_type).toUpperCase() : null,
        source_transaction_id: text(body.source_transaction_id) || null,
        notes: text(body.notes) || null,
      }
      const { data, error } = await supabase.from('purchases').insert(payload).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, purchase: data })
    }

    if (action === 'add_payment') {
      const purchaseId = text(body.purchase_id)
      const paymentDate = text(body.payment_date) || kstToday()
      const amount = numberValue(body.amount, 0)
      const method = text(body.payment_method).toUpperCase() || 'BANK_TRANSFER'
      if (!purchaseId || !isDate(paymentDate) || amount <= 0 || !PAYMENT_METHODS.has(method)) {
        return NextResponse.json({ ok: false, error: '지급일·금액·결제수단을 확인해 주세요.' }, { status: 400 })
      }
      const { data: purchase, error: purchaseError } = await supabase.from('purchases').select('id,total_amount,status').eq('id', purchaseId).eq('business_id', BUSINESS_ID).maybeSingle()
      if (purchaseError) throw new Error(purchaseError.message)
      if (!purchase || purchase.status === 'CANCELLED') return NextResponse.json({ ok: false, error: '지급할 수 없는 매입 건입니다.' }, { status: 409 })
      const { data: existingPayments, error: existingError } = await supabase.from('purchase_payments').select('amount').eq('purchase_id', purchaseId)
      if (existingError) throw new Error(existingError.message)
      const alreadyPaid = (existingPayments ?? []).reduce((sum, row) => sum + numberValue(row.amount), 0)
      const remaining = Math.max(0, numberValue(purchase.total_amount) - alreadyPaid)
      if (amount > remaining + 0.0001) return NextResponse.json({ ok: false, error: `남은 미지급금 ${Math.round(remaining).toLocaleString('ko-KR')}원을 초과할 수 없습니다.` }, { status: 409 })
      const paymentPayload = {
        business_id: BUSINESS_ID,
        purchase_id: purchaseId,
        payment_date: paymentDate,
        amount,
        payment_method: method,
        payment_account: text(body.payment_account) || null,
        card_name: text(body.card_name) || null,
        installment_months: method === 'CARD' ? Math.min(36, Math.max(1, integerValue(body.installment_months, 1))) : 1,
        reference: text(body.reference) || null,
        notes: text(body.notes) || null,
      }
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
      const { data, error } = await supabase.from('purchases').update({
        tax_invoice_status: status,
        tax_invoice_amount: body.tax_invoice_amount === null || body.tax_invoice_amount === undefined ? null : numberValue(body.tax_invoice_amount),
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, purchase: data })
    }

    if (action === 'cancel_purchase') {
      const id = text(body.id)
      if (!id) return NextResponse.json({ ok: false, error: '매입 ID가 필요합니다.' }, { status: 400 })
      const { count, error: paymentError } = await supabase.from('purchase_payments').select('id', { count: 'exact', head: true }).eq('purchase_id', id)
      if (paymentError) throw new Error(paymentError.message)
      if ((count ?? 0) > 0) return NextResponse.json({ ok: false, error: '지급 이력이 있는 매입 건은 취소할 수 없습니다.' }, { status: 409 })
      const { data, error } = await supabase.from('purchases').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', BUSINESS_ID).select('*').single()
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