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

type JsonRecord = Record<string, unknown>

type SupplierSummary = JsonRecord & {
  id: string
  company_name: string
  this_month_purchase_amount: number
  this_month_remaining: number
  previous_month_paid: number
  review_required_amount: number
  review_required_count: number
  unpriced_review_count: number
  total_outstanding: number
  latest_purchase_date: string
  next_due_date: string
  purchase_count: number
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

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function previousMonthPrefix(prefix: string) {
  const date = new Date(`${prefix}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - 1)
  return date.toISOString().slice(0, 7)
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function loadState() {
  const supabase = createMoniServiceRoleClient()
  const [supplierResult, purchaseResult, paymentResult, statementResult] = await Promise.all([
    supabase.from('purchase_suppliers').select('*').eq('business_id', BUSINESS_ID).order('company_name'),
    supabase.from('purchases').select('*').eq('business_id', BUSINESS_ID).order('receipt_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('purchase_payments').select('*').eq('business_id', BUSINESS_ID).order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('purchase_supplier_statement_balances')
      .select('*')
      .eq('business_id', BUSINESS_ID)
      .eq('reconciliation_status', 'APPROVED')
      .order('statement_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  if (supplierResult.error) throw new Error(supplierResult.error.message)
  if (purchaseResult.error) throw new Error(purchaseResult.error.message)
  if (paymentResult.error) throw new Error(paymentResult.error.message)
  if (statementResult.error) throw new Error(statementResult.error.message)

  const suppliers = (supplierResult.data ?? []) as JsonRecord[]
  const purchases = (purchaseResult.data ?? []) as JsonRecord[]
  const payments = (paymentResult.data ?? []) as JsonRecord[]
  const statements = (statementResult.data ?? []) as JsonRecord[]

  const paidByPurchase = new Map<string, number>()
  for (const payment of payments) {
    const purchaseId = text(payment.purchase_id)
    paidByPurchase.set(purchaseId, (paidByPurchase.get(purchaseId) ?? 0) + numberValue(payment.amount))
  }

  const today = kstToday()
  const currentMonth = today.slice(0, 7)
  const previousMonth = previousMonthPrefix(currentMonth)
  const dueSoon = addDays(today, 7)

  const supplierMap = new Map<string, SupplierSummary>()
  for (const supplier of suppliers) {
    const id = text(supplier.id)
    supplierMap.set(id, {
      ...supplier,
      id,
      company_name: text(supplier.company_name),
      this_month_purchase_amount: 0,
      this_month_remaining: 0,
      previous_month_paid: 0,
      review_required_amount: 0,
      review_required_count: 0,
      unpriced_review_count: 0,
      total_outstanding: 0,
      latest_purchase_date: '',
      next_due_date: '',
      purchase_count: 0,
    })
  }

  const purchaseById = new Map<string, JsonRecord>()
  const payableRows: JsonRecord[] = []
  let reviewRequiredAmount = 0
  let reviewRequiredCount = 0
  let unpricedReviewCount = 0

  for (const purchase of purchases) {
    const id = text(purchase.id)
    purchaseById.set(id, purchase)
    const supplierId = text(purchase.supplier_id)
    const supplier = supplierMap.get(supplierId)
    if (!supplier) continue

    const date = text(purchase.receipt_date) || text(purchase.purchase_date)
    const dueDate = text(purchase.due_date)
    const status = text(purchase.status)
    const verificationStatus = text(purchase.verification_status) || 'CONFIRMED'
    const totalAmount = numberValue(purchase.total_amount)
    const estimatedAmount = numberValue(purchase.estimated_total_amount)
    const paidAmount = Math.min(totalAmount, paidByPurchase.get(id) ?? 0)
    const outstandingAmount = Math.max(totalAmount - paidAmount, 0)
    const reviewAmount = verificationStatus === 'REVIEW_REQUIRED' ? estimatedAmount : 0

    supplier.purchase_count += 1
    if (date > supplier.latest_purchase_date) supplier.latest_purchase_date = date
    if (date.startsWith(currentMonth)) supplier.this_month_purchase_amount += verificationStatus === 'REVIEW_REQUIRED' ? estimatedAmount : totalAmount

    if (verificationStatus === 'REVIEW_REQUIRED') {
      supplier.review_required_amount += reviewAmount
      supplier.review_required_count += 1
      reviewRequiredAmount += reviewAmount
      reviewRequiredCount += 1
      if (estimatedAmount <= 0) {
        supplier.unpriced_review_count += 1
        unpricedReviewCount += 1
      }
    }

    if (verificationStatus === 'CONFIRMED' && status !== 'CANCELLED' && outstandingAmount > 0) {
      supplier.total_outstanding += outstandingAmount
      if (dueDate.startsWith(currentMonth)) supplier.this_month_remaining += outstandingAmount
      if (dueDate && (!supplier.next_due_date || dueDate < supplier.next_due_date)) supplier.next_due_date = dueDate
    }

    if (verificationStatus === 'REVIEW_REQUIRED' || (verificationStatus === 'CONFIRMED' && status !== 'CANCELLED' && outstandingAmount > 0)) {
      let paymentState = 'REVIEW_REQUIRED'
      if (verificationStatus === 'CONFIRMED') {
        if (!dueDate) paymentState = paidAmount > 0 ? 'PARTIAL' : 'NO_DUE_DATE'
        else if (dueDate < today) paymentState = 'OVERDUE'
        else if (dueDate === today) paymentState = 'DUE_TODAY'
        else if (dueDate <= dueSoon) paymentState = 'DUE_SOON'
        else paymentState = paidAmount > 0 ? 'PARTIAL' : 'SCHEDULED'
      }
      payableRows.push({
        ...purchase,
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
        payment_state: paymentState,
        verification_status: verificationStatus,
        estimated_total_amount: estimatedAmount,
      })
    }
  }

  for (const payment of payments) {
    const paymentDate = text(payment.payment_date)
    if (!paymentDate.startsWith(previousMonth)) continue
    const purchase = purchaseById.get(text(payment.purchase_id))
    if (!purchase) continue
    const supplier = supplierMap.get(text(purchase.supplier_id))
    if (!supplier) continue
    supplier.previous_month_paid += numberValue(payment.amount)
  }

  const statementsBySupplier = new Map<string, JsonRecord[]>()
  for (const statement of statements) {
    const supplierId = text(statement.supplier_id)
    if (!supplierId) continue
    statementsBySupplier.set(supplierId, [...(statementsBySupplier.get(supplierId) ?? []), statement])
  }

  for (const [supplierId, supplierStatements] of statementsBySupplier) {
    const supplier = supplierMap.get(supplierId)
    if (!supplier || !supplierStatements.length) continue

    const latest = supplierStatements[0]
    const latestDate = text(latest.period_end) || text(latest.statement_date)
    const currentStatement = supplierStatements.find((row) => text(row.statement_date).startsWith(currentMonth))
    const previousStatement = supplierStatements.find((row) => text(row.statement_date).startsWith(previousMonth))

    supplier.total_outstanding = Math.max(0, numberValue(latest.closing_balance))
    supplier.this_month_purchase_amount = currentStatement ? numberValue(currentStatement.statement_purchase_amount) : 0
    supplier.this_month_remaining = currentStatement ? Math.max(0, numberValue(currentStatement.closing_balance)) : 0
    supplier.previous_month_paid = previousStatement ? numberValue(previousStatement.statement_payment_amount) : 0
    supplier.latest_purchase_date = latestDate > supplier.latest_purchase_date ? latestDate : supplier.latest_purchase_date
    supplier.next_due_date = ''
    supplier.statement_balance_source = true
    supplier.statement_date = text(latest.statement_date)
    supplier.statement_closing_balance = numberValue(latest.closing_balance)
  }

  const supplierSummaries = Array.from(supplierMap.values())
    .map((row) => ({
      ...row,
      this_month_purchase_amount: Math.round(row.this_month_purchase_amount),
      this_month_remaining: Math.round(row.this_month_remaining),
      previous_month_paid: Math.round(row.previous_month_paid),
      review_required_amount: Math.round(row.review_required_amount),
      total_outstanding: Math.round(row.total_outstanding),
    }))
    .sort((a, b) => b.review_required_amount - a.review_required_amount || b.total_outstanding - a.total_outstanding || a.company_name.localeCompare(b.company_name, 'ko'))

  payableRows.sort((a, b) => {
    const reviewCompare = Number(text(b.verification_status) === 'REVIEW_REQUIRED') - Number(text(a.verification_status) === 'REVIEW_REQUIRED')
    if (reviewCompare) return reviewCompare
    const dueCompare = text(a.due_date || '9999-12-31').localeCompare(text(b.due_date || '9999-12-31'))
    if (dueCompare) return dueCompare
    return text(b.receipt_date || b.purchase_date).localeCompare(text(a.receipt_date || a.purchase_date))
  })

  return {
    period: { today, current_month: currentMonth, previous_month: previousMonth },
    suppliers: supplierSummaries,
    payables: payableRows,
    summary: {
      supplier_count: supplierSummaries.length,
      total_outstanding: Math.round(supplierSummaries.reduce((sum, row) => sum + numberValue(row.total_outstanding), 0)),
      this_month_due: Math.round(supplierSummaries.reduce((sum, row) => sum + numberValue(row.this_month_remaining), 0)),
      previous_month_paid: Math.round(supplierSummaries.reduce((sum, row) => sum + numberValue(row.previous_month_paid), 0)),
      review_required_amount: Math.round(reviewRequiredAmount),
      review_required_count: reviewRequiredCount,
      unpriced_review_count: unpricedReviewCount,
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    return NextResponse.json({ ok: true, ...(await loadState()) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '매입 재무정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 401 })
    const body = await request.json().catch(() => null) as JsonRecord | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const action = text(body.action)
    const supabase = createMoniServiceRoleClient()

    if (action === 'save_supplier') {
      const id = text(body.id)
      const companyName = text(body.company_name)
      if (!companyName) return NextResponse.json({ ok: false, error: '매입처명을 입력해 주세요.' }, { status: 400 })

      const supplyType = text(body.supply_type).toUpperCase() || 'BOTH'
      const dueType = text(body.default_due_type).toUpperCase() || 'DIRECT'
      const paymentMethod = text(body.default_payment_method).toUpperCase() || 'OTHER'
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
        tax_invoice_required: boolValue(body.tax_invoice_required, false),
        tax_type: taxType,
        currency: 'KRW',
        status: text(body.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        notes: text(body.notes) || null,
        updated_at: new Date().toISOString(),
      }

      const query = id
        ? supabase.from('purchase_suppliers').update(payload).eq('id', id).eq('business_id', BUSINESS_ID)
        : supabase.from('purchase_suppliers').insert(payload)
      const { data, error } = await query.select('*').single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, supplier: data })
    }

    if (action === 'update_payable') {
      const purchaseId = text(body.id)
      const mode = text(body.mode).toUpperCase()
      const amount = numberValue(body.amount)
      if (!purchaseId) return NextResponse.json({ ok: false, error: '수정할 지급내역을 확인해 주세요.' }, { status: 400 })
      if (body.due_date && !isDate(text(body.due_date))) return NextResponse.json({ ok: false, error: '지급예정일을 확인해 주세요.' }, { status: 400 })
      if (body.payment_date && !isDate(text(body.payment_date))) return NextResponse.json({ ok: false, error: '실제 지급일을 확인해 주세요.' }, { status: 400 })

      const { data, error } = await supabase.rpc('moni_update_financial_payable', {
        p_business_id: BUSINESS_ID,
        p_purchase_id: purchaseId,
        p_mode: mode,
        p_amount: amount,
        p_due_date: text(body.due_date) || null,
        p_payment_method: text(body.payment_method).toUpperCase() || 'OTHER',
        p_payment_account: text(body.payment_account) || null,
        p_card_name: text(body.card_name) || null,
        p_installment_months: Math.min(36, Math.max(1, integerValue(body.installment_months, 1))),
        p_payment_date: text(body.payment_date) || null,
        p_reference: text(body.reference) || null,
        p_notes: text(body.notes) || null,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, result: data })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '매입 재무정보 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
