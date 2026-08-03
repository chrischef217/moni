from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    content = file.read_text(encoding='utf-8')
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}')
    file.write_text(content.replace(old, new, 1), encoding='utf-8')


def regex_once(path: str, pattern: str, replacement: str):
    file = Path(path)
    content = file.read_text(encoding='utf-8')
    next_content, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: regex expected one match, found {count}')
    file.write_text(next_content, encoding='utf-8')


# Shared UI types.
types = 'src/components/purchase-receipts/types.ts'
replace_once(types, "  tax_invoice_required: boolean\n", "  tax_invoice_required: boolean\n  tax_type?: 'TAXABLE' | 'EXEMPT' | 'ZERO_RATE' | null\n")
replace_once(types, "  country_of_origin?: string | null\n  packing_weight_g?: number | null\n", "  country_of_origin?: string | null\n  spec?: string | null\n  packing_unit?: string | null\n  packing_weight_g?: number | null\n")

# Receipt editor: show converted inventory quantity and preserve legacy editing.
modal = 'src/components/purchase-receipts/ReceiptEditorModal.tsx'
replace_once(
    modal,
    """  const masterReady = Boolean(selectedMaterial) && rawMasterReady && packagingMasterReady

  return (
""",
    """  const masterReady = Boolean(selectedMaterial) && rawMasterReady && packagingMasterReady
  const convertedInventoryQuantity = draft.purchase_category === 'PACKAGING'
    ? Number(draft.quantity || 0)
    : draft.unit === 'EA'
      ? Number(draft.quantity || 0) * Number(selectedRaw?.packing_weight_g || 0)
      : draft.unit === 'KG'
        ? Number(draft.quantity || 0) * 1000
        : Number(draft.quantity || 0)

  return (
""",
)
replace_once(
    modal,
    """          {draft.purchase_category === 'RAW_MATERIAL' ? <><span> · 매입 1EA {integerNumber(selectedRaw?.packing_weight_g)}g</span><span> · 매입단가 {integerNumber(selectedRaw?.unit_price_per_kg)}원/EA</span></> : <span> · 매입단가 {integerNumber(selectedPackaging?.unit_price)}원/EA</span>}
          {!masterReady ? <div className=\"mt-2 font-black\">매입단가 또는 매입중량이 없어 등록할 수 없습니다. 원재료 관리에서 기준정보를 먼저 입력해 주세요.</div> : null}
""",
    """          {draft.purchase_category === 'RAW_MATERIAL' ? <><span> · 매입 1EA {integerNumber(selectedRaw?.packing_weight_g)}g</span><span> · 매입단가 {integerNumber(selectedRaw?.unit_price_per_kg)}원/EA</span></> : <span> · 매입단가 {integerNumber(selectedPackaging?.unit_price)}원/EA</span>}
          {masterReady ? <div className=\"mt-2 font-black text-sky-800\">입력 환산: {integerNumber(draft.quantity)}{draft.unit} → {integerNumber(convertedInventoryQuantity)}{draft.purchase_category === 'RAW_MATERIAL' ? 'g' : 'EA'} · 자동 공급가 {integerNumber(draft.supply_amount)}원</div> : null}
          {!masterReady ? <div className=\"mt-2 font-black\">매입단가 또는 매입중량이 없어 등록할 수 없습니다. 원재료 관리에서 기준정보를 먼저 입력해 주세요.</div> : null}
""",
)
replace_once(modal, "step={draft.unit === 'EA' ? '1' : 'any'}", "step={draft.unit === 'KG' ? '0.001' : '1'}")
replace_once(
    modal,
    "disabled={busy || !masterReady || !draft.supplier_id || Number(draft.quantity) <= 0}",
    "disabled={busy || !masterReady || (legacy ? !draft.supplier_name_snapshot.trim() : !draft.supplier_id) || Number(draft.quantity) <= 0}",
)

# Excel import: price, supply, VAT and total are master-derived on the server.
module = 'src/components/PurchaseReceiptManagementModule.tsx'
replace_once(
    module,
    """      { 매입처: '등록된 매입처명', 구분: '원재료', 품목: '등록된 원재료명', 수량: 10, 단위: 'kg', 매입일: initialToday, 입고일: initialToday, 단가: 1000, 공급가액: 10000, 부가세: 1000, 지급예정일: '', 결제수단: '계좌이체', '계좌/카드': '', 할부개월: 1, 비고: '' },
      { 매입처: '등록된 매입처명', 구분: '부재료', 품목: '등록된 부재료명', 수량: 100, 단위: 'EA', 매입일: initialToday, 입고일: initialToday, 단가: 100, 공급가액: 10000, 부가세: 1000, 지급예정일: '', 결제수단: '카드', '계좌/카드': '법인카드 별칭', 할부개월: 3, 비고: '' },
""",
    """      { 매입처: '등록된 매입처명', 구분: '원재료', 품목: '등록된 원재료명', 수량: 10, 단위: 'kg', 매입일: initialToday, 입고일: initialToday, 단가: '자동', 공급가액: '자동', 부가세: '자동', 지급예정일: '', 결제수단: '계좌이체', '계좌/카드': '', 할부개월: 1, 비고: '' },
      { 매입처: '등록된 매입처명', 구분: '부재료', 품목: '등록된 부재료명', 수량: 100, 단위: 'EA', 매입일: initialToday, 입고일: initialToday, 단가: '자동', 공급가액: '자동', 부가세: '자동', 지급예정일: '', 결제수단: '카드', '계좌/카드': '법인카드 별칭', 할부개월: 3, 비고: '' },
""",
)
replace_once(
    module,
    """        const unit = category === 'PACKAGING' ? 'EA' : String(row['단위'] || 'KG').trim().toUpperCase()
        if (unit === 'EA' && !Number.isInteger(quantity)) throw new Error(`${line}행: 입고수량은 패킹단위 기준 정수 EA여야 합니다.`)
        const unitPrice = Number(row['단가'] || 0)
        const supplyAmount = row['공급가액'] === '' ? quantity * unitPrice : Number(row['공급가액'])
        const vatAmount = Number(row['부가세'] || 0)
        if (![unitPrice, supplyAmount, vatAmount].every(Number.isFinite)) throw new Error(`${line}행: 금액을 확인해 주세요.`)
""",
    """        const unit = category === 'PACKAGING' ? 'EA' : String(row['단위'] || 'KG').trim().toUpperCase()
        if (!['KG', 'G', 'EA'].includes(unit)) throw new Error(`${line}행: 원재료 단위는 kg, g, EA만 사용할 수 있습니다.`)
        if (unit === 'EA' && !Number.isInteger(quantity)) throw new Error(`${line}행: 입고수량은 패킹단위 기준 정수 EA여야 합니다.`)
""",
)
replace_once(
    module,
    """          unit_price: unitPrice,
          supply_amount: supplyAmount,
          vat_amount: vatAmount,
          total_amount: supplyAmount + vatAmount,
""",
    """          unit_price: 0,
          supply_amount: 0,
          vat_amount: 0,
          total_amount: 0,
""",
)

# Create API: never trust client price/amount fields.
purchases = 'src/app/api/moni/purchases/route.ts'
replace_once(purchases, "import { getSessionFromRequest } from '@/lib/allowance/session'\n", "import { getSessionFromRequest } from '@/lib/allowance/session'\nimport { resolveMasterPurchasePricing } from '@/lib/moni/purchasePricingServer'\n")
replace_once(purchases, "  tax_invoice_required: boolean\n  status: string\n", "  tax_invoice_required: boolean\n  tax_type?: string | null\n  status: string\n")
new_prepare = '''async function preparePurchase(supabase: MoniClient, body: JsonRecord, supplier: SupplierRow): Promise<PreparedPurchase> {
  const purchaseDate = text(body.purchase_date) || kstToday()
  const receiptDate = text(body.receipt_date) || purchaseDate
  const category = text(body.purchase_category).toUpperCase()
  const materialId = text(body.material_id)
  const quantity = numberValue(body.quantity, 0)
  const unit = category === 'PACKAGING' ? 'EA' : text(body.unit).toUpperCase() || 'KG'
  const paymentMethod = text(body.planned_payment_method).toUpperCase() || text(supplier.default_payment_method) || 'BANK_TRANSFER'
  const taxInvoiceStatus = text(body.tax_invoice_status).toUpperCase() || (supplier.tax_invoice_required ? 'NOT_RECEIVED' : 'NOT_REQUIRED')

  if (!isDate(purchaseDate) || !isDate(receiptDate)) throw new Error('매입일과 입고일을 확인해 주세요.')
  if (!PURCHASE_CATEGORIES.has(category)) throw new Error('원재료 또는 부재료를 선택해 주세요.')
  if (!materialId) throw new Error('입고할 품목을 선택해 주세요.')
  if (quantity <= 0) throw new Error('입고수량은 0보다 커야 합니다.')
  if (category === 'RAW_MATERIAL' && !RAW_UNITS.has(unit)) throw new Error('원재료 단위는 kg, g, EA만 사용할 수 있습니다.')
  if (category === 'PACKAGING' && (!Number.isInteger(quantity) || unit !== 'EA')) throw new Error('부재료 수량은 정수 EA로 입력해 주세요.')
  if (!PAYMENT_METHODS.has(paymentMethod)) throw new Error('결제수단을 확인해 주세요.')
  if (!TAX_INVOICE_STATUSES.has(taxInvoiceStatus)) throw new Error('세금계산서 상태를 확인해 주세요.')

  const pricing = await resolveMasterPurchasePricing(supabase, {
    businessId: BUSINESS_ID,
    category: category as 'RAW_MATERIAL' | 'PACKAGING',
    materialId,
    quantity,
    unit: unit as 'KG' | 'G' | 'EA',
  })
  const unitPrice = pricing.unitPrice
  const supplyAmount = pricing.supplyAmount
  const supplierTaxType = text(supplier.tax_type).toUpperCase() || 'TAXABLE'
  const vatAmount = supplierTaxType === 'EXEMPT' || supplierTaxType === 'ZERO_RATE' ? 0 : Math.round(supplyAmount * 0.1)
  const totalAmount = supplyAmount + vatAmount
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

function rpcArgs'''
regex_once(purchases, r"function preparePurchase\(body: JsonRecord, supplier: SupplierRow\): PreparedPurchase \{.*?\n\}\n\nfunction rpcArgs", new_prepare)
replace_once(purchases, "const prepared = preparePurchase(body, supplier)", "const prepared = await preparePurchase(supabase, body, supplier)")
replace_once(
    purchases,
    """      const preparedRows = rows.map((row, index) => {
        const supplier = supplierById.get(text(row.supplier_id))
        if (!supplier) throw new Error(`${index + 2}행의 매입처를 찾을 수 없습니다.`)
        try { return preparePurchase(row, supplier) } catch (error) { throw new Error(`${index + 2}행: ${error instanceof Error ? error.message : '입력값을 확인해 주세요.'}`) }
      })
""",
    """      const preparedRows = await Promise.all(rows.map(async (row, index) => {
        const supplier = supplierById.get(text(row.supplier_id))
        if (!supplier) throw new Error(`${index + 2}행의 매입처를 찾을 수 없습니다.`)
        try { return await preparePurchase(supabase, row, supplier) } catch (error) { throw new Error(`${index + 2}행: ${error instanceof Error ? error.message : '입력값을 확인해 주세요.'}`) }
      }))
""",
)

# Update API: recalculate only when price basis changes, preserving historical rows on non-price edits.
receipts = 'src/app/api/moni/purchase-receipts/route.ts'
replace_once(receipts, "import { getSessionFromRequest } from '@/lib/allowance/session'\n", "import { getSessionFromRequest } from '@/lib/allowance/session'\nimport { resolveMasterPurchasePricing } from '@/lib/moni/purchasePricingServer'\n")
replace_once(receipts, "  tax_invoice_required: boolean\n  status: string\n", "  tax_invoice_required: boolean\n  tax_type?: string | null\n  status: string\n")
new_update_prepare = '''async function prepare(supabase: MoniClient, body: JsonRecord, supplier: SupplierRow, existing?: JsonRecord | null): Promise<PreparedPurchase> {
  const purchaseDate = text(body.purchase_date) || todaySeoul()
  const receiptDate = text(body.receipt_date) || purchaseDate
  const category = text(body.purchase_category).toUpperCase()
  const materialId = text(body.material_id)
  const quantity = numberValue(body.quantity)
  const unit = category === 'PACKAGING' ? 'EA' : text(body.unit).toUpperCase() || 'KG'
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

  const pricingBasisChanged = !existing
    || text(existing.supplier_id) !== supplier.id
    || text(existing.material_id) !== materialId
    || text(existing.unit).toUpperCase() !== unit
    || Math.abs(numberValue(existing.quantity) - quantity) > 0.000001

  let unitPrice: number
  let supplyAmount: number
  let vatAmount: number
  let totalAmount: number
  if (pricingBasisChanged) {
    const pricing = await resolveMasterPurchasePricing(supabase, {
      businessId: BUSINESS_ID,
      category: category as 'RAW_MATERIAL' | 'PACKAGING',
      materialId,
      quantity,
      unit: unit as 'KG' | 'G' | 'EA',
    })
    unitPrice = pricing.unitPrice
    supplyAmount = pricing.supplyAmount
    const supplierTaxType = text(supplier.tax_type).toUpperCase() || 'TAXABLE'
    vatAmount = supplierTaxType === 'EXEMPT' || supplierTaxType === 'ZERO_RATE' ? 0 : Math.round(supplyAmount * 0.1)
    totalAmount = supplyAmount + vatAmount
  } else {
    unitPrice = Math.max(0, numberValue(existing?.unit_price))
    supplyAmount = Math.max(0, numberValue(existing?.supply_amount))
    vatAmount = Math.max(0, numberValue(existing?.vat_amount))
    totalAmount = Math.max(0, numberValue(existing?.total_amount, supplyAmount + vatAmount))
  }

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

function rpcArgs'''
regex_once(receipts, r"function prepare\(body: JsonRecord, supplier: SupplierRow\): PreparedPurchase \{.*?\n\}\n\nfunction rpcArgs", new_update_prepare)
replace_once(
    receipts,
    """      const prepared = prepare(body, await activeSupplier(supabase, supplierId))
      const { data, error } = await supabase.rpc('moni_update_purchase_receipt', { p_purchase_id: id, ...rpcArgs(prepared) })
""",
    """      const existingResult = await supabase
        .from('purchases')
        .select('supplier_id,material_id,quantity,unit,unit_price,supply_amount,vat_amount,total_amount')
        .eq('id', id)
        .eq('business_id', BUSINESS_ID)
        .maybeSingle()
      if (existingResult.error) throw new Error(existingResult.error.message)
      if (!existingResult.data) return NextResponse.json({ ok: false, error: '수정할 매입·입고 내역을 찾을 수 없습니다.' }, { status: 404 })
      const prepared = await prepare(supabase, body, await activeSupplier(supabase, supplierId), existingResult.data)
      const { data, error } = await supabase.rpc('moni_update_purchase_receipt', { p_purchase_id: id, ...rpcArgs(prepared) })
""",
)
