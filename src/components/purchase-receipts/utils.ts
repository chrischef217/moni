import type { PurchaseReceipt, ReceiptDraft, RawMaterial } from './types'

export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

export function emptyDraft(): ReceiptDraft {
  const date = today()
  return {
    supplier_id: '',
    supplier_name_snapshot: '',
    purchase_date: date,
    receipt_date: date,
    purchase_category: 'RAW_MATERIAL',
    material_id: '',
    quantity: 1,
    unit: 'KG',
    unit_price: 0,
    supply_amount: 0,
    vat_amount: 0,
    total_amount: 0,
    due_date: '',
    planned_payment_method: 'BANK_TRANSFER',
    planned_payment_account: '',
    planned_card_name: '',
    planned_installment_months: 1,
    tax_invoice_status: 'NOT_RECEIVED',
    notes: '',
  }
}

export function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function formatNumber(value: unknown, maximumFractionDigits = 3) {
  const parsed = Number(value ?? 0)
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(Number.isFinite(parsed) ? parsed : 0)
}

export function integerNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number.isFinite(parsed) ? Math.round(parsed) : 0)
}

export function monthDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}` : '-'
}

export function receiptDate(row: PurchaseReceipt) {
  return row.receipt_date || row.purchase_date || ''
}

export function isStockReconciliation(row: PurchaseReceipt) {
  return String(row.notes || '').includes('marker=MONI_STOCK_RECONCILIATION')
}

export function receiptQuantity(row: PurchaseReceipt) {
  const unitLabel = String(row.receipt_unit_label || row.unit || '').trim()
  if (unitLabel.includes('/EA')) {
    const quantity = Number(row.quantity)
    if (Number.isInteger(quantity)) return `${integerNumber(quantity)} × ${unitLabel}`
    const grams = totalGrams(row)
    return grams === null ? `${formatNumber(quantity)} EA` : `${integerNumber(grams)}g`
  }
  return `${formatNumber(row.quantity)} ${unitLabel}`.trim()
}

export function totalGrams(row: PurchaseReceipt) {
  if (row.purchase_category !== 'RAW_MATERIAL') return null
  const base = Number(row.inventory_quantity_base)
  if (Number.isFinite(base)) return Math.round(base)
  const quantity = Number(row.quantity || 0)
  if (row.unit === 'KG') return Math.round(quantity * 1000)
  if (row.unit === 'G') return Math.round(quantity)
  return null
}

export function rawMaterialName(material: RawMaterial) {
  const origin = String(material.country_of_origin ?? '').trim()
  return origin ? `${material.item_name} (${origin})` : material.item_name
}

export function label(value: string) {
  return ({
    BANK_TRANSFER: '계좌이체',
    CARD: '카드',
    CASH: '현금',
    OTHER: '기타',
    OVERDUE: '연체',
    DUE_TODAY: '오늘 지급',
    DUE_SOON: '7일 내 지급',
    NO_DUE_DATE: '예정일 미설정',
    SCHEDULED: '지급 예정',
    PARTIAL: '일부 지급',
    PAID: '지급 완료',
    NOT_REQUIRED: '대상 아님',
    NOT_RECEIVED: '미수취',
    RECEIVED: '수취',
    MATCHED: '일치',
    MISMATCH: '불일치',
  } as Record<string, string>)[value] || value
}

export function stateTone(value: string) {
  if (value === 'OVERDUE' || value === 'MISMATCH') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (value === 'DUE_TODAY' || value === 'DUE_SOON' || value === 'NOT_RECEIVED') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (value === 'PAID' || value === 'MATCHED') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (value === 'PARTIAL' || value === 'RECEIVED') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export function excelDate(value: unknown) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value))
    return epoch.toISOString().slice(0, 10)
  }
  const raw = String(value).trim().replace(/[./]/g, '-')
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [year, month, day] = raw.split('-')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

export function paymentCode(value: unknown) {
  const raw = normalize(value)
  if (raw === '계좌이체' || raw === 'bank_transfer' || raw === 'bank') return 'BANK_TRANSFER'
  if (raw === '카드' || raw === 'card') return 'CARD'
  if (raw === '현금' || raw === 'cash') return 'CASH'
  if (raw === '기타' || raw === 'other') return 'OTHER'
  return ''
}
