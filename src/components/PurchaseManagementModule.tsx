'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'

type View = 'suppliers' | 'purchases' | 'payables'
type DateMode = 'ALL' | 'MONTH' | 'DATE' | 'RANGE'

type Supplier = {
  id: string
  company_name: string
  business_registration_number?: string | null
  representative_name?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  supply_type: string
  default_due_type: string
  default_due_days?: number | null
  default_due_day?: number | null
  default_payment_method: string
  default_payment_account?: string | null
  default_card_name?: string | null
  default_installment_months: number
  tax_invoice_required: boolean
  tax_type: string
  status: string
  notes?: string | null
}

type RawMaterial = {
  id: string
  item_name: string
  country_of_origin?: string | null
  packing_weight_g?: number | null
  unit_price_per_kg?: number | null
  current_stock_g?: number | null
}

type PackagingMaterial = {
  id: string
  material_code?: string | null
  material_name: string
  spec?: string | null
  unit_price?: number | null
  current_stock?: number | null
}

type Payment = {
  id: string
  payment_date: string
  amount: number
  payment_method: string
  payment_account?: string | null
  card_name?: string | null
  installment_months: number
  reference?: string | null
}

type Purchase = {
  id: string
  purchase_no: string
  supplier_id: string
  supplier_name_snapshot: string
  purchase_date: string
  receipt_date?: string | null
  purchase_category: string
  material_id?: string | null
  item_name: string
  quantity: number
  unit: string
  unit_price: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  due_date?: string | null
  planned_payment_method: string
  planned_payment_account?: string | null
  planned_card_name?: string | null
  planned_installment_months: number
  tax_invoice_status: string
  tax_invoice_amount?: number | null
  status: string
  inventory_status?: string | null
  source_transaction_id?: string | null
  notes?: string | null
  paid_amount: number
  outstanding_amount: number
  payment_state: string
  payments: Payment[]
  legacy_record?: boolean
  legacy_amount_available?: boolean
}

type Summary = {
  total_outstanding: number
  overdue_amount: number
  overdue_count: number
  due_soon_amount: number
  due_soon_count: number
  no_due_date_count: number
  paid_this_month: number
  open_purchase_count: number
  legacy_receipt_count?: number
}

type Payload = {
  ok: boolean
  error?: string
  suppliers: Supplier[]
  purchases: Purchase[]
  payments: Payment[]
  raw_materials: RawMaterial[]
  packaging_materials: PackagingMaterial[]
  summary: Summary
}

type SupplierDraft = {
  company_name: string
  business_registration_number: string
  representative_name: string
  contact_name: string
  phone: string
  email: string
  address: string
  supply_type: string
  default_due_type: string
  default_due_days: number
  default_due_day: number
  default_payment_method: string
  default_payment_account: string
  default_card_name: string
  default_installment_months: number
  tax_invoice_required: boolean
  tax_type: string
  status: string
  notes: string
}

type PurchaseDraft = {
  supplier_id: string
  purchase_date: string
  receipt_date: string
  purchase_category: 'RAW_MATERIAL' | 'PACKAGING'
  material_id: string
  quantity: number
  unit: 'KG' | 'G' | 'EA'
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
  notes: string
}

type PaymentDraft = {
  payment_date: string
  amount: number
  payment_method: string
  payment_account: string
  card_name: string
  installment_months: number
  reference: string
  notes: string
}

const emptySupplier: SupplierDraft = {
  company_name: '',
  business_registration_number: '',
  representative_name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  supply_type: 'BOTH',
  default_due_type: 'DAYS',
  default_due_days: 30,
  default_due_day: 15,
  default_payment_method: 'BANK_TRANSFER',
  default_payment_account: '',
  default_card_name: '',
  default_installment_months: 1,
  tax_invoice_required: true,
  tax_type: 'TAXABLE',
  status: 'ACTIVE',
  notes: '',
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

function newPurchaseDraft(): PurchaseDraft {
  return {
    supplier_id: '',
    purchase_date: today(),
    receipt_date: today(),
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

function won(value: unknown) {
  const number = Number(value ?? 0)
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Number.isFinite(number) ? Math.round(number) : 0)}원`
}

function formatNumber(value: unknown) {
  const number = Number(value ?? 0)
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 }).format(Number.isFinite(number) ? number : 0)
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function label(value: string) {
  return ({
    RAW_MATERIAL: '원재료', PACKAGING: '부재료', BOTH: '원재료·부재료', OTHER: '기타',
    BANK_TRANSFER: '계좌이체', CARD: '카드', CASH: '현금',
    IMMEDIATE: '즉시 지급', DAYS: '매입일 기준', NEXT_MONTH_DAY: '익월 지정일', MONTH_END: '익월 말일', DIRECT: '직접 지정',
    TAXABLE: '과세', EXEMPT: '면세', ZERO_RATE: '영세',
    NOT_REQUIRED: '대상 아님', NOT_RECEIVED: '미수취', RECEIVED: '수취', MATCHED: '금액 일치', MISMATCH: '금액 불일치',
    OVERDUE: '연체', DUE_TODAY: '오늘 지급', DUE_SOON: '7일 내 지급', NO_DUE_DATE: '예정일 미설정', SCHEDULED: '지급 예정', PARTIAL: '일부 지급', PAID: '지급 완료', CANCELLED: '취소',
  } as Record<string, string>)[value] || value
}

function stateTone(state: string) {
  if (state === 'OVERDUE' || state === 'MISMATCH') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (state === 'DUE_TODAY' || state === 'DUE_SOON' || state === 'NOT_RECEIVED') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (state === 'PAID' || state === 'MATCHED') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (state === 'PARTIAL' || state === 'RECEIVED') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function rawMaterialName(material: RawMaterial) {
  const origin = String(material.country_of_origin ?? '').trim()
  return origin ? `${material.item_name} (${origin})` : material.item_name
}

function receiptDate(row: Purchase) {
  return row.receipt_date || row.purchase_date || ''
}

function excelDate(value: unknown) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(value))
    return excelEpoch.toISOString().slice(0, 10)
  }
  const raw = String(value).trim()
  const normalized = raw.replace(/[./]/g, '-')
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function paymentCode(value: unknown) {
  const raw = normalize(value)
  if (raw === '계좌이체' || raw === 'bank_transfer' || raw === 'bank') return 'BANK_TRANSFER'
  if (raw === '카드' || raw === 'card') return 'CARD'
  if (raw === '현금' || raw === 'cash') return 'CASH'
  if (raw === '기타' || raw === 'other') return 'OTHER'
  return ''
}

export default function PurchaseManagementModule({ initialView }: { initialView: string }) {
  const initialToday = today()
  const [view, setView] = useState<View>(initialView === 'purchases' || initialView === 'payables' ? initialView : 'suppliers')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [supplierModal, setSupplierModal] = useState(false)
  const [editingSupplierId, setEditingSupplierId] = useState('')
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>(emptySupplier)
  const [purchaseModal, setPurchaseModal] = useState(false)
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft>(newPurchaseDraft())
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null)
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({ payment_date: initialToday, amount: 0, payment_method: 'BANK_TRANSFER', payment_account: '', card_name: '', installment_months: 1, reference: '', notes: '' })
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelMessage, setExcelMessage] = useState('')
  const [dateMode, setDateMode] = useState<DateMode>('ALL')
  const [selectedMonth, setSelectedMonth] = useState(initialToday.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(initialToday)
  const [dateFrom, setDateFrom] = useState(monthStart(initialToday))
  const [dateTo, setDateTo] = useState(initialToday)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/moni/purchases', { cache: 'no-store' })
      const result = await response.json() as Payload
      if (!response.ok || !result.ok) throw new Error(result.error || '매입 데이터를 불러오지 못했습니다.')
      setData(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '매입 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const navigate = (next: View) => {
    setView(next)
    const url = `/business-management?tab=purchase&view=${next}`
    window.history.pushState(window.history.state, '', url)
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }

  const post = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/moni/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '처리에 실패했습니다.')
      await load()
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '처리에 실패했습니다.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const suppliers = data?.suppliers ?? []
  const purchases = data?.purchases ?? []
  const rawMaterials = data?.raw_materials ?? []
  const packagingMaterials = data?.packaging_materials ?? []
  const summary = data?.summary
  const query = normalize(search)

  const filteredSuppliers = useMemo(
    () => suppliers.filter((row) => normalize([row.company_name, row.contact_name, row.phone].join(' ')).includes(query)),
    [suppliers, query],
  )

  const searchedPurchases = useMemo(
    () => purchases.filter((row) => normalize([row.purchase_no, row.supplier_name_snapshot, row.item_name, label(row.purchase_category)].join(' ')).includes(query)),
    [purchases, query],
  )

  const datedPurchases = useMemo(() => searchedPurchases.filter((row) => {
    const date = receiptDate(row)
    if (dateMode === 'MONTH') return Boolean(selectedMonth) && date.startsWith(selectedMonth)
    if (dateMode === 'DATE') return Boolean(selectedDate) && date === selectedDate
    if (dateMode === 'RANGE') {
      if (dateFrom && date < dateFrom) return false
      if (dateTo && date > dateTo) return false
    }
    return true
  }), [searchedPurchases, dateMode, selectedMonth, selectedDate, dateFrom, dateTo])

  const selectedMaterial = useMemo(() => {
    if (purchaseDraft.purchase_category === 'RAW_MATERIAL') return rawMaterials.find((row) => row.id === purchaseDraft.material_id) ?? null
    return packagingMaterials.find((row) => row.id === purchaseDraft.material_id || row.material_code === purchaseDraft.material_id) ?? null
  }, [purchaseDraft.purchase_category, purchaseDraft.material_id, rawMaterials, packagingMaterials])

  const availableSuppliers = suppliers.filter((row) => row.status === 'ACTIVE' && (row.supply_type === 'BOTH' || row.supply_type === 'OTHER' || row.supply_type === purchaseDraft.purchase_category))

  const openSupplier = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplierId(supplier.id)
      setSupplierDraft({ ...emptySupplier, ...supplier, business_registration_number: supplier.business_registration_number ?? '', representative_name: supplier.representative_name ?? '', contact_name: supplier.contact_name ?? '', phone: supplier.phone ?? '', email: supplier.email ?? '', address: supplier.address ?? '', default_due_days: supplier.default_due_days ?? 30, default_due_day: supplier.default_due_day ?? 15, default_payment_account: supplier.default_payment_account ?? '', default_card_name: supplier.default_card_name ?? '', notes: supplier.notes ?? '' })
    } else {
      setEditingSupplierId('')
      setSupplierDraft({ ...emptySupplier })
    }
    setSupplierModal(true)
  }

  const saveSupplier = async () => {
    const result = await post({ action: editingSupplierId ? 'update_supplier' : 'create_supplier', id: editingSupplierId || undefined, ...supplierDraft })
    if (result) setSupplierModal(false)
  }

  const openPurchase = () => { setPurchaseDraft(newPurchaseDraft()); setPurchaseModal(true) }

  const selectSupplier = (id: string) => {
    const supplier = suppliers.find((row) => row.id === id)
    setPurchaseDraft((current) => ({ ...current, supplier_id: id, planned_payment_method: supplier?.default_payment_method || 'BANK_TRANSFER', planned_payment_account: supplier?.default_payment_account || '', planned_card_name: supplier?.default_card_name || '', planned_installment_months: supplier?.default_installment_months || 1, tax_invoice_status: supplier?.tax_invoice_required === false ? 'NOT_REQUIRED' : 'NOT_RECEIVED' }))
  }

  const changeCategory = (category: 'RAW_MATERIAL' | 'PACKAGING') => {
    setPurchaseDraft((current) => ({ ...current, purchase_category: category, material_id: '', supplier_id: '', quantity: 1, unit: category === 'RAW_MATERIAL' ? 'KG' : 'EA', unit_price: 0, supply_amount: 0, vat_amount: 0, total_amount: 0 }))
  }

  const selectMaterial = (materialId: string) => {
    const raw = rawMaterials.find((row) => row.id === materialId)
    const packaging = packagingMaterials.find((row) => row.id === materialId || row.material_code === materialId)
    const defaultPrice = purchaseDraft.purchase_category === 'RAW_MATERIAL' ? Number(raw?.unit_price_per_kg ?? 0) : Number(packaging?.unit_price ?? 0)
    setPurchaseDraft((current) => {
      const supplyAmount = Number(current.quantity || 0) * defaultPrice
      return { ...current, material_id: materialId, unit_price: defaultPrice, supply_amount: supplyAmount, total_amount: supplyAmount + Number(current.vat_amount || 0) }
    })
  }

  const amountChange = (field: 'quantity' | 'unit_price' | 'supply_amount' | 'vat_amount', value: number) => {
    setPurchaseDraft((current) => {
      const next = { ...current, [field]: value }
      if (field === 'quantity' || field === 'unit_price') next.supply_amount = Number(next.quantity || 0) * Number(next.unit_price || 0)
      next.total_amount = Number(next.supply_amount || 0) + Number(next.vat_amount || 0)
      return next
    })
  }

  const savePurchase = async () => {
    const result = await post({ action: 'create_purchase', ...purchaseDraft })
    if (result) { setPurchaseModal(false); setView('purchases') }
  }

  const openPayment = (purchase: Purchase) => {
    setPaymentPurchase(purchase)
    setPaymentDraft({ payment_date: today(), amount: purchase.outstanding_amount, payment_method: purchase.planned_payment_method, payment_account: purchase.planned_payment_account || '', card_name: purchase.planned_card_name || '', installment_months: purchase.planned_installment_months || 1, reference: '', notes: '' })
  }

  const savePayment = async () => {
    if (!paymentPurchase) return
    const result = await post({ action: 'add_payment', purchase_id: paymentPurchase.id, ...paymentDraft })
    if (result) setPaymentPurchase(null)
  }

  const updateTax = async (purchase: Purchase, status: string) => {
    await post({ action: 'update_tax_invoice', id: purchase.id, tax_invoice_status: status, tax_invoice_amount: status === 'MATCHED' ? purchase.total_amount : null })
  }

  const cancelPurchase = async (purchase: Purchase) => {
    if (!window.confirm(`${purchase.purchase_no} 입고를 취소하시겠습니까?\n연결된 재고와 수불내역도 함께 원복됩니다.`)) return
    await post({ action: 'cancel_purchase', id: purchase.id })
  }

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const sample = [
      { 매입처: '등록된 매입처명과 정확히 일치', 구분: '원재료', 품목: '등록된 원재료명과 정확히 일치', 수량: 10, 단위: 'kg', 매입일: today(), 입고일: today(), 단가: 1000, 공급가액: 10000, 부가세: 1000, 지급예정일: '', 결제수단: '계좌이체', '계좌/카드': '', 할부개월: 1, 비고: '' },
      { 매입처: '등록된 매입처명과 정확히 일치', 구분: '부재료', 품목: '등록된 부재료명과 정확히 일치', 수량: 100, 단위: 'EA', 매입일: today(), 입고일: today(), 단가: 100, 공급가액: 10000, 부가세: 1000, 지급예정일: '', 결제수단: '카드', '계좌/카드': '법인카드 별칭', 할부개월: 3, 비고: '' },
    ]
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(sample)
    sheet['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(workbook, sheet, '매입입고')
    XLSX.writeFile(workbook, 'MONI_매입입고_일괄등록_템플릿.xlsx')
  }

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setExcelBusy(true)
    setExcelMessage('')
    setError('')
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) throw new Error('엑셀 시트를 찾을 수 없습니다.')
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], { defval: '', raw: true })
      if (!rows.length) throw new Error('엑셀에 등록할 내역이 없습니다.')
      if (rows.length > 500) throw new Error('한 번에 최대 500건까지 등록할 수 있습니다.')
      const supplierByName = new Map(suppliers.filter((row) => row.status === 'ACTIVE').map((row) => [normalize(row.company_name), row]))
      const rawByName = new Map<string, RawMaterial>()
      for (const material of rawMaterials) { rawByName.set(normalize(material.item_name), material); rawByName.set(normalize(rawMaterialName(material)), material) }
      const packagingByName = new Map(packagingMaterials.map((row) => [normalize(row.material_name), row]))
      const payloadRows = rows.map((row, index) => {
        const rowNumber = index + 2
        const supplier = supplierByName.get(normalize(row['매입처']))
        if (!supplier) throw new Error(`${rowNumber}행: 등록된 매입처를 찾을 수 없습니다.`)
        const categoryText = normalize(row['구분'])
        const category = categoryText === '원재료' || categoryText === 'raw_material' ? 'RAW_MATERIAL' : categoryText === '부재료' || categoryText === 'packaging' ? 'PACKAGING' : ''
        if (!category) throw new Error(`${rowNumber}행: 구분은 원재료 또는 부재료로 입력해 주세요.`)
        const material = category === 'RAW_MATERIAL' ? rawByName.get(normalize(row['품목'])) : packagingByName.get(normalize(row['품목']))
        if (!material) throw new Error(`${rowNumber}행: 등록된 ${category === 'RAW_MATERIAL' ? '원재료' : '부재료'} 품목을 찾을 수 없습니다.`)
        const quantity = Number(row['수량'])
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`${rowNumber}행: 수량을 확인해 주세요.`)
        const unit = category === 'PACKAGING' ? 'EA' : String(row['단위'] || 'KG').trim().toUpperCase()
        const purchaseDate = excelDate(row['매입일']) || today()
        const receipt = excelDate(row['입고일']) || purchaseDate
        const unitPrice = Number(row['단가'] || 0)
        const supplyAmount = row['공급가액'] === '' ? quantity * unitPrice : Number(row['공급가액'])
        const vatAmount = Number(row['부가세'] || 0)
        if (![unitPrice, supplyAmount, vatAmount].every(Number.isFinite)) throw new Error(`${rowNumber}행: 금액을 확인해 주세요.`)
        const method = paymentCode(row['결제수단']) || supplier.default_payment_method
        const accountOrCard = String(row['계좌/카드'] || '').trim()
        return { supplier_id: supplier.id, purchase_category: category, material_id: material.id, quantity, unit, purchase_date: purchaseDate, receipt_date: receipt, unit_price: unitPrice, supply_amount: supplyAmount, vat_amount: vatAmount, total_amount: supplyAmount + vatAmount, due_date: excelDate(row['지급예정일']), planned_payment_method: method, planned_payment_account: method === 'CARD' ? '' : accountOrCard, planned_card_name: method === 'CARD' ? accountOrCard : '', planned_installment_months: Math.max(1, Number(row['할부개월'] || supplier.default_installment_months || 1)), tax_invoice_status: supplier.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED', notes: String(row['비고'] || '').trim() }
      })
      const response = await fetch('/api/moni/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_purchase_batch', rows: payloadRows }) })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || '엑셀 일괄 등록에 실패했습니다.')
      setExcelMessage(`${result.created_count ?? payloadRows.length}건의 매입·입고를 등록했습니다. 재고와 미지급금에 함께 반영되었습니다.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '엑셀 일괄 등록에 실패했습니다.')
    } finally {
      setExcelBusy(false)
    }
  }

  return (
    <main data-purchase-management className="min-h-screen bg-[linear-gradient(145deg,#f6fbff,#e7f2fc)] p-5 text-[#173b52] lg:p-9">
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[28px] border border-sky-100 bg-white/95 p-7 shadow-xl lg:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="text-xs font-black tracking-[0.18em] text-sky-700">PURCHASE · RECEIPT · PAYABLES</div><h1 className="mt-2 text-3xl font-black">매입관리</h1><p className="mt-3 text-sm leading-7 text-[#627f91]">한 번의 등록으로 원재료·부재료 재고, 수불내역, 매입비용과 미지급금을 함께 관리합니다.</p></div>
            <button type="button" onClick={() => void load()} className="rounded-xl border border-sky-200 bg-white px-5 py-3 text-sm font-black text-[#234f68]">새로고침</button>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="총 미지급금" value={won(summary?.total_outstanding)} note={`미지급 ${summary?.open_purchase_count ?? 0}건`} tone="amber" />
            <SummaryCard label="연체 미지급금" value={won(summary?.overdue_amount)} note={`${summary?.overdue_count ?? 0}건`} tone={(summary?.overdue_count ?? 0) > 0 ? 'rose' : 'green'} />
            <SummaryCard label="7일 내 지급예정" value={won(summary?.due_soon_amount)} note={`${summary?.due_soon_count ?? 0}건`} tone="blue" />
            <SummaryCard label="이번 달 실제 지급" value={won(summary?.paid_this_month)} note={`예정일 미설정 ${summary?.no_due_date_count ?? 0}건`} tone="green" />
          </div>
        </header>

        <div className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-sky-100 bg-white/90 p-2 shadow-lg">
          {([['suppliers', '매입처 관리'], ['purchases', '매입·입고 관리'], ['payables', '지급·미지급금']] as [View, string][]).map(([key, title]) => <button key={key} type="button" onClick={() => navigate(key)} className={`rounded-xl px-5 py-3 text-sm font-black ${view === key ? 'bg-sky-700 text-white' : 'bg-white text-[#36586d]'}`}>{title}</button>)}
        </div>

        {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700">{error}</div> : null}
        {excelMessage ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800">{excelMessage}</div> : null}
        {loading ? <div className="mt-6 rounded-[28px] bg-white p-16 text-center font-black">불러오는 중입니다.</div> : null}

        {!loading && view === 'suppliers' ? (
          <section className="mt-6 overflow-hidden rounded-[28px] border border-sky-100 bg-white/95 shadow-xl">
            <Toolbar title="매입처 목록" search={search} setSearch={setSearch} actions={<button type="button" onClick={() => openSupplier()} className="pm-primary">+ 매입처 등록</button>} />
            <div className="overflow-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#eef5f9] text-xs font-black text-[#5c788a]"><tr><th className="px-6 py-4">매입처</th><th className="px-4 py-4">공급 구분</th><th className="px-4 py-4">담당자</th><th className="px-4 py-4">지급조건</th><th className="px-4 py-4">기본 결제</th><th className="px-4 py-4">세금계산서</th><th className="px-6 py-4 text-center">관리</th></tr></thead><tbody className="divide-y divide-[#e3edf3]">{filteredSuppliers.map((row) => <tr key={row.id}><td className="px-6 py-4"><b>{row.company_name}</b><div className="text-xs text-[#78909f]">{row.business_registration_number || '사업자번호 미등록'}</div></td><td className="px-4 py-4">{label(row.supply_type)}</td><td className="px-4 py-4">{row.contact_name || '-'}<div className="text-xs text-[#78909f]">{row.phone || ''}</div></td><td className="px-4 py-4">{label(row.default_due_type)}{row.default_due_type === 'DAYS' ? ` +${row.default_due_days ?? 0}일` : row.default_due_type === 'NEXT_MONTH_DAY' ? ` ${row.default_due_day ?? 1}일` : ''}</td><td className="px-4 py-4">{label(row.default_payment_method)}{row.default_payment_method === 'CARD' ? ` · ${row.default_installment_months}개월` : ''}</td><td className="px-4 py-4">{row.tax_invoice_required ? '수취 대상' : '대상 아님'}</td><td className="px-6 py-4 text-center"><button type="button" onClick={() => openSupplier(row)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-800">수정</button></td></tr>)}{!filteredSuppliers.length ? <tr><td colSpan={7} className="px-6 py-16 text-center font-black">등록된 매입처가 없습니다.</td></tr> : null}</tbody></table></div>
          </section>
        ) : null}

        {!loading && view === 'purchases' ? (
          <section className="mt-6 overflow-hidden rounded-[28px] border border-sky-100 bg-white/95 shadow-xl">
            <Toolbar title="매입·입고 내역" search={search} setSearch={setSearch} actions={<><button type="button" onClick={openPurchase} className="pm-primary">+ 매입·입고 등록</button><button type="button" onClick={() => void downloadTemplate()} className="pm-secondary">엑셀 템플릿</button><label className={`pm-secondary cursor-pointer ${excelBusy ? 'pointer-events-none opacity-60' : ''}`}>{excelBusy ? '등록 중...' : '엑셀 일괄 등록'}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void importExcel(event)} /></label></>} />
            <div className="border-b border-sky-100 bg-sky-50 px-7 py-3 text-xs font-bold text-sky-900">입고일 기준으로 조회합니다. 기존 수불부의 입고 이력도 포함되며, 지급정보가 없는 과거 기록에는 미지급금을 임의 생성하지 않습니다.</div>
            <DateFilter mode={dateMode} setMode={setDateMode} month={selectedMonth} setMonth={setSelectedMonth} date={selectedDate} setDate={setSelectedDate} from={dateFrom} setFrom={setDateFrom} to={dateTo} setTo={setDateTo} total={searchedPurchases.length} shown={datedPurchases.length} legacy={datedPurchases.filter((row) => row.legacy_record).length} />
            <PurchaseTable rows={datedPurchases} onPayment={openPayment} onTax={updateTax} onCancel={cancelPurchase} />
          </section>
        ) : null}

        {!loading && view === 'payables' ? (
          <section className="mt-6 overflow-hidden rounded-[28px] border border-sky-100 bg-white/95 shadow-xl">
            <Toolbar title="지급·미지급금" search={search} setSearch={setSearch} />
            <PurchaseTable rows={searchedPurchases.filter((row) => !row.legacy_record && row.outstanding_amount > 0 && row.status !== 'CANCELLED')} onPayment={openPayment} onTax={updateTax} onCancel={cancelPurchase} />
          </section>
        ) : null}
      </div>

      {supplierModal ? <Modal title={editingSupplierId ? '매입처 수정' : '매입처 등록'} onClose={() => setSupplierModal(false)}><div className="grid gap-4 md:grid-cols-2"><Field label="매입처명 *"><input className="pm-input" value={supplierDraft.company_name} onChange={(event) => setSupplierDraft({ ...supplierDraft, company_name: event.target.value })} /></Field><Field label="사업자등록번호"><input className="pm-input" value={supplierDraft.business_registration_number} onChange={(event) => setSupplierDraft({ ...supplierDraft, business_registration_number: event.target.value })} /></Field><Field label="대표자"><input className="pm-input" value={supplierDraft.representative_name} onChange={(event) => setSupplierDraft({ ...supplierDraft, representative_name: event.target.value })} /></Field><Field label="담당자"><input className="pm-input" value={supplierDraft.contact_name} onChange={(event) => setSupplierDraft({ ...supplierDraft, contact_name: event.target.value })} /></Field><Field label="전화번호"><input className="pm-input" value={supplierDraft.phone} onChange={(event) => setSupplierDraft({ ...supplierDraft, phone: event.target.value })} /></Field><Field label="이메일"><input className="pm-input" value={supplierDraft.email} onChange={(event) => setSupplierDraft({ ...supplierDraft, email: event.target.value })} /></Field></div><Field label="주소"><input className="pm-input" value={supplierDraft.address} onChange={(event) => setSupplierDraft({ ...supplierDraft, address: event.target.value })} /></Field><div className="grid gap-4 md:grid-cols-3"><Field label="공급 구분"><select className="pm-input" value={supplierDraft.supply_type} onChange={(event) => setSupplierDraft({ ...supplierDraft, supply_type: event.target.value })}><option value="RAW_MATERIAL">원재료</option><option value="PACKAGING">부재료</option><option value="BOTH">원재료·부재료</option><option value="OTHER">기타</option></select></Field><Field label="지급기한 기준"><select className="pm-input" value={supplierDraft.default_due_type} onChange={(event) => setSupplierDraft({ ...supplierDraft, default_due_type: event.target.value })}><option value="IMMEDIATE">즉시 지급</option><option value="DAYS">매입일 + N일</option><option value="NEXT_MONTH_DAY">익월 지정일</option><option value="MONTH_END">익월 말일</option><option value="DIRECT">건별 직접 지정</option></select></Field><Field label={supplierDraft.default_due_type === 'NEXT_MONTH_DAY' ? '익월 지급일' : '지급 유예일'}><input type="number" className="pm-input" value={supplierDraft.default_due_type === 'NEXT_MONTH_DAY' ? supplierDraft.default_due_day : supplierDraft.default_due_days} onChange={(event) => setSupplierDraft({ ...supplierDraft, [supplierDraft.default_due_type === 'NEXT_MONTH_DAY' ? 'default_due_day' : 'default_due_days']: Number(event.target.value) })} /></Field></div><div className="grid gap-4 md:grid-cols-3"><Field label="기본 결제수단"><select className="pm-input" value={supplierDraft.default_payment_method} onChange={(event) => setSupplierDraft({ ...supplierDraft, default_payment_method: event.target.value })}><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field><Field label="계좌·카드 별칭"><input className="pm-input" value={supplierDraft.default_payment_method === 'CARD' ? supplierDraft.default_card_name : supplierDraft.default_payment_account} onChange={(event) => setSupplierDraft({ ...supplierDraft, [supplierDraft.default_payment_method === 'CARD' ? 'default_card_name' : 'default_payment_account']: event.target.value })} /></Field><Field label="카드 할부 개월"><input type="number" min="1" max="36" disabled={supplierDraft.default_payment_method !== 'CARD'} className="pm-input" value={supplierDraft.default_installment_months} onChange={(event) => setSupplierDraft({ ...supplierDraft, default_installment_months: Number(event.target.value) })} /></Field></div><label className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3"><input type="checkbox" checked={supplierDraft.tax_invoice_required} onChange={(event) => setSupplierDraft({ ...supplierDraft, tax_invoice_required: event.target.checked })} /><b>매입 세금계산서 수취 대상</b></label><div className="mt-6 text-right"><button type="button" disabled={busy} onClick={() => void saveSupplier()} className="pm-primary">저장</button></div></Modal> : null}

      {purchaseModal ? <Modal title="매입·입고 등록" onClose={() => setPurchaseModal(false)}><div className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900">저장하면 재고 입고, 수불내역, 매입비용과 미지급금이 동시에 생성됩니다.</div><div className="grid gap-4 md:grid-cols-2"><Field label="품목 구분 *"><select className="pm-input" value={purchaseDraft.purchase_category} onChange={(event) => changeCategory(event.target.value as 'RAW_MATERIAL' | 'PACKAGING')}><option value="RAW_MATERIAL">원재료</option><option value="PACKAGING">부재료</option></select></Field><Field label="매입처 *"><select className="pm-input" value={purchaseDraft.supplier_id} onChange={(event) => selectSupplier(event.target.value)}><option value="">선택</option>{availableSuppliers.map((row) => <option key={row.id} value={row.id}>{row.company_name}</option>)}</select></Field><Field label="매입일 *"><input type="date" className="pm-input" value={purchaseDraft.purchase_date} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, purchase_date: event.target.value })} /></Field><Field label="실제 입고일 *"><input type="date" className="pm-input" value={purchaseDraft.receipt_date} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, receipt_date: event.target.value })} /></Field></div><Field label={`${purchaseDraft.purchase_category === 'RAW_MATERIAL' ? '원재료' : '부재료'} 품목 *`}><select className="pm-input" value={purchaseDraft.material_id} onChange={(event) => selectMaterial(event.target.value)}><option value="">등록된 품목 선택</option>{purchaseDraft.purchase_category === 'RAW_MATERIAL' ? rawMaterials.map((row) => <option key={row.id} value={row.id}>{rawMaterialName(row)}</option>) : packagingMaterials.map((row) => <option key={row.id} value={row.id}>{row.material_name}{row.spec ? ` · ${row.spec}` : ''}</option>)}</select></Field>{selectedMaterial ? <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">현재고: <b>{purchaseDraft.purchase_category === 'RAW_MATERIAL' ? `${formatNumber((selectedMaterial as RawMaterial).current_stock_g)}g` : `${formatNumber((selectedMaterial as PackagingMaterial).current_stock)}EA`}</b>{purchaseDraft.purchase_category === 'RAW_MATERIAL' && (selectedMaterial as RawMaterial).packing_weight_g ? <span> · 규격중량 {formatNumber((selectedMaterial as RawMaterial).packing_weight_g)}g</span> : null}</div> : null}<div className="grid gap-4 md:grid-cols-4"><Field label="입고수량 *"><input type="number" min="0" step="any" className="pm-input" value={purchaseDraft.quantity} onChange={(event) => amountChange('quantity', Number(event.target.value))} /></Field><Field label="입고단위 *"><select disabled={purchaseDraft.purchase_category === 'PACKAGING'} className="pm-input" value={purchaseDraft.unit} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, unit: event.target.value as 'KG' | 'G' | 'EA' })}>{purchaseDraft.purchase_category === 'RAW_MATERIAL' ? <><option value="KG">kg</option><option value="G">g</option><option value="EA">EA</option></> : <option value="EA">EA</option>}</select></Field><Field label={`단가 / ${purchaseDraft.unit}`}><input type="number" min="0" className="pm-input" value={purchaseDraft.unit_price} onChange={(event) => amountChange('unit_price', Number(event.target.value))} /></Field><Field label="공급가액"><input type="number" min="0" className="pm-input" value={purchaseDraft.supply_amount} onChange={(event) => amountChange('supply_amount', Number(event.target.value))} /></Field></div><div className="grid gap-4 md:grid-cols-3"><Field label="부가세"><input type="number" min="0" className="pm-input" value={purchaseDraft.vat_amount} onChange={(event) => amountChange('vat_amount', Number(event.target.value))} /></Field><Field label="총 매입금액"><input readOnly className="pm-input bg-slate-50 font-black" value={purchaseDraft.total_amount} /></Field><Field label="지급 예정일"><input type="date" className="pm-input" value={purchaseDraft.due_date} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, due_date: event.target.value })} /></Field></div><div className="grid gap-4 md:grid-cols-3"><Field label="예정 결제수단"><select className="pm-input" value={purchaseDraft.planned_payment_method} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, planned_payment_method: event.target.value })}><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field><Field label="출금계좌·카드"><input className="pm-input" value={purchaseDraft.planned_payment_method === 'CARD' ? purchaseDraft.planned_card_name : purchaseDraft.planned_payment_account} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, [purchaseDraft.planned_payment_method === 'CARD' ? 'planned_card_name' : 'planned_payment_account']: event.target.value })} /></Field><Field label="할부 개월"><input type="number" min="1" max="36" disabled={purchaseDraft.planned_payment_method !== 'CARD'} className="pm-input" value={purchaseDraft.planned_installment_months} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, planned_installment_months: Number(event.target.value) })} /></Field></div><Field label="비고"><input className="pm-input" value={purchaseDraft.notes} onChange={(event) => setPurchaseDraft({ ...purchaseDraft, notes: event.target.value })} /></Field><div className="mt-6 text-right"><button type="button" disabled={busy} onClick={() => void savePurchase()} className="pm-primary">{busy ? '등록 중...' : '매입·입고 등록'}</button></div></Modal> : null}

      {paymentPurchase ? <Modal title={`${paymentPurchase.supplier_name_snapshot} 지급 등록`} onClose={() => setPaymentPurchase(null)}><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="text-sm font-bold text-amber-800">남은 미지급금</div><div className="mt-1 text-3xl font-black text-amber-900">{won(paymentPurchase.outstanding_amount)}</div><div className="mt-2 text-sm">{paymentPurchase.purchase_no} · {paymentPurchase.item_name}</div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="실제 지급일"><input type="date" className="pm-input" value={paymentDraft.payment_date} onChange={(event) => setPaymentDraft({ ...paymentDraft, payment_date: event.target.value })} /></Field><Field label="실제 지급금액"><input type="number" className="pm-input" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: Number(event.target.value) })} /></Field><Field label="결제수단"><select className="pm-input" value={paymentDraft.payment_method} onChange={(event) => setPaymentDraft({ ...paymentDraft, payment_method: event.target.value })}><option value="BANK_TRANSFER">계좌이체</option><option value="CARD">카드</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field><Field label="계좌·카드"><input className="pm-input" value={paymentDraft.payment_method === 'CARD' ? paymentDraft.card_name : paymentDraft.payment_account} onChange={(event) => setPaymentDraft({ ...paymentDraft, [paymentDraft.payment_method === 'CARD' ? 'card_name' : 'payment_account']: event.target.value })} /></Field><Field label="카드 할부 개월"><input type="number" min="1" max="36" disabled={paymentDraft.payment_method !== 'CARD'} className="pm-input" value={paymentDraft.installment_months} onChange={(event) => setPaymentDraft({ ...paymentDraft, installment_months: Number(event.target.value) })} /></Field><Field label="이체메모·승인번호"><input className="pm-input" value={paymentDraft.reference} onChange={(event) => setPaymentDraft({ ...paymentDraft, reference: event.target.value })} /></Field></div><div className="mt-6 text-right"><button type="button" disabled={busy} onClick={() => void savePayment()} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white">지급 등록</button></div></Modal> : null}

      <style jsx global>{`[data-purchase-management] .pm-input{height:44px;width:100%;border-radius:12px;border:1px solid #cfdee7;background:white;padding:0 14px;font-size:14px;outline:none;color:#173b52}[data-purchase-management] .pm-input:focus{border-color:#0284c7;box-shadow:0 0 0 3px rgba(2,132,199,.08)}[data-purchase-management] .pm-input:disabled{background:#eef3f6;color:#6f8795}[data-purchase-management] .pm-primary{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:#0369a1;padding:11px 20px;font-size:14px;font-weight:900;color:white}[data-purchase-management] .pm-primary:disabled{opacity:.55}[data-purchase-management] .pm-secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid #bae6fd;background:white;padding:10px 16px;font-size:13px;font-weight:900;color:#075985}`}</style>
    </main>
  )
}

function SummaryCard({ label: labelText, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  const tones: Record<string, string> = { amber: 'border-amber-200 bg-amber-50', rose: 'border-rose-200 bg-rose-50', green: 'border-emerald-200 bg-emerald-50', blue: 'border-sky-200 bg-sky-50' }
  return <div className={`rounded-2xl border px-5 py-4 ${tones[tone] || tones.blue}`}><div className="text-xs font-black text-[#78909f]">{labelText}</div><div className="mt-1 text-2xl font-black">{value}</div><div className="mt-2 text-xs text-[#627f91]">{note}</div></div>
}

function Toolbar({ title, search, setSearch, actions }: { title: string; search: string; setSearch: (value: string) => void; actions?: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-sky-100 px-7 py-5 xl:flex-row xl:items-center xl:justify-between"><h2 className="text-xl font-black">{title}</h2><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="문서번호·매입처·품목 검색" className="h-11 min-w-[260px] rounded-xl border border-sky-100 bg-white px-4 text-sm outline-none" />{actions}</div></div>
}

function DateFilter({ mode, setMode, month, setMonth, date, setDate, from, setFrom, to, setTo, total, shown, legacy }: { mode: DateMode; setMode: (value: DateMode) => void; month: string; setMonth: (value: string) => void; date: string; setDate: (value: string) => void; from: string; setFrom: (value: string) => void; to: string; setTo: (value: string) => void; total: number; shown: number; legacy: number }) {
  const buttons: Array<[DateMode, string]> = [['ALL', '전체'], ['MONTH', '월별'], ['DATE', '특정일'], ['RANGE', '기간']]
  return <div className="border-b border-sky-100 bg-white px-7 py-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="mb-2 text-xs font-black text-[#607d8d]">입고일 조회</div><div className="flex flex-wrap gap-2">{buttons.map(([key, title]) => <button key={key} type="button" onClick={() => setMode(key)} className={`rounded-xl border px-4 py-2 text-sm font-black ${mode === key ? 'border-sky-700 bg-sky-700 text-white' : 'border-sky-100 bg-white text-[#36586d]'}`}>{title}</button>)}</div></div><div className="flex flex-wrap items-end gap-3">{mode === 'MONTH' ? <Field label="조회 월"><input type="month" className="pm-input min-w-[170px]" value={month} onChange={(event) => setMonth(event.target.value)} /></Field> : null}{mode === 'DATE' ? <Field label="조회 일자"><input type="date" className="pm-input min-w-[170px]" value={date} onChange={(event) => setDate(event.target.value)} /></Field> : null}{mode === 'RANGE' ? <><Field label="시작일"><input type="date" className="pm-input min-w-[170px]" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="종료일"><input type="date" className="pm-input min-w-[170px]" value={to} onChange={(event) => setTo(event.target.value)} /></Field></> : null}<div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-black text-sky-900">전체 {total.toLocaleString('ko-KR')}건 · 표시 {shown.toLocaleString('ko-KR')}건 · 기존 이력 {legacy.toLocaleString('ko-KR')}건</div></div></div></div>
}

function CategoryBadge({ category }: { category: string }) {
  const meta = category === 'RAW_MATERIAL' ? { symbol: '원', title: '원재료', style: 'border-blue-200 bg-blue-100 text-blue-800' } : category === 'PACKAGING' ? { symbol: '부', title: '부재료', style: 'border-emerald-200 bg-emerald-100 text-emerald-800' } : { symbol: '기', title: '기타', style: 'border-violet-200 bg-violet-100 text-violet-800' }
  return <span title={meta.title} aria-label={meta.title} className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-base font-black shadow-sm ${meta.style}`}>{meta.symbol}</span>
}

function PurchaseTable({ rows, onPayment, onTax, onCancel }: { rows: Purchase[]; onPayment: (purchase: Purchase) => void; onTax: (purchase: Purchase, status: string) => void; onCancel: (purchase: Purchase) => void }) {
  return <div className="overflow-auto"><table className="w-full min-w-[1260px] text-left text-sm"><thead className="bg-[#eef5f9] text-xs font-black text-[#5c788a]"><tr><th className="px-5 py-4 text-center">종류</th><th className="px-4 py-4">매입·입고일</th><th className="px-4 py-4">매입처 / 품목</th><th className="px-4 py-4">입고수량</th><th className="px-4 py-4 text-right">총 매입</th><th className="px-4 py-4 text-right">지급</th><th className="px-4 py-4 text-right">미지급</th><th className="px-4 py-4">지급예정</th><th className="px-4 py-4">세금계산서</th><th className="px-5 py-4 text-center">관리</th></tr></thead><tbody className="divide-y divide-[#e3edf3]">{rows.map((row) => <tr key={row.id} className={row.status === 'CANCELLED' ? 'opacity-55' : ''}><td className="px-5 py-4 text-center"><CategoryBadge category={row.purchase_category} /></td><td className="px-4 py-4"><b>{row.purchase_date}</b><div className="text-xs text-[#78909f]">입고 {row.receipt_date || '-'}</div><div className="max-w-[210px] truncate text-xs text-[#78909f]">{row.purchase_no}</div></td><td className="px-4 py-4"><b>{row.supplier_name_snapshot}</b><div>{row.item_name}</div>{row.legacy_record ? <div className="text-xs font-bold text-slate-500">기존 수불부 입고 이력</div> : null}</td><td className="px-4 py-4 font-bold">{formatNumber(row.quantity)} {row.unit}</td><td className="px-4 py-4 text-right font-black">{row.legacy_record && !row.legacy_amount_available ? <span className="text-slate-400">미등록</span> : won(row.total_amount)}</td><td className="px-4 py-4 text-right text-emerald-700">{row.legacy_record ? '-' : won(row.paid_amount)}</td><td className="px-4 py-4 text-right font-black text-amber-700">{row.legacy_record ? '-' : won(row.outstanding_amount)}</td><td className="px-4 py-4">{row.legacy_record ? <span className="text-xs font-bold text-slate-500">지급정보 없음</span> : <>{row.due_date || '미설정'}<div className="text-xs text-[#78909f]">{label(row.planned_payment_method)}{row.planned_payment_method === 'CARD' ? ` · ${row.planned_installment_months}개월` : ''}</div><span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${stateTone(row.payment_state)}`}>{label(row.payment_state)}</span></>}</td><td className="px-4 py-4">{row.legacy_record ? <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-black text-slate-600">기존 이력</span> : <select disabled={row.status === 'CANCELLED'} value={row.tax_invoice_status} onChange={(event) => void onTax(row, event.target.value)} className={`rounded-lg border px-2 py-2 text-xs font-black ${stateTone(row.tax_invoice_status)}`}><option value="NOT_REQUIRED">대상 아님</option><option value="NOT_RECEIVED">미수취</option><option value="RECEIVED">수취</option><option value="MATCHED">금액 일치</option><option value="MISMATCH">금액 불일치</option></select>}</td><td className="px-5 py-4"><div className="flex justify-center gap-2">{row.legacy_record ? <span className="text-xs font-bold text-slate-400">조회전용</span> : <>{row.outstanding_amount > 0 && row.status !== 'CANCELLED' ? <button type="button" onClick={() => onPayment(row)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white">지급</button> : null}{row.paid_amount <= 0 && row.status !== 'CANCELLED' ? <button type="button" onClick={() => onCancel(row)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">입고취소</button> : null}</>}</div></td></tr>)}{!rows.length ? <tr><td colSpan={10} className="px-6 py-16 text-center font-black">조회 조건에 해당하는 매입·입고 내역이 없습니다.</td></tr> : null}</tbody></table></div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[28px] bg-white p-7 text-[#173b52] shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-black">{title}</h2><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 font-black">닫기</button></div><div className="space-y-4">{children}</div></div></div>
}

function Field({ label: fieldLabel, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-[#607d8d]">{fieldLabel}</span>{children}</label>
}
