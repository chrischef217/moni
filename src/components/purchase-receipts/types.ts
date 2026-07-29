export type ReceiptView = 'suppliers' | 'purchases' | 'payables'
export type DateMode = 'MONTH' | 'DATE' | 'RANGE' | 'ALL'
export type PurchaseCategory = 'RAW_MATERIAL' | 'PACKAGING'
export type PurchaseUnit = 'KG' | 'G' | 'EA'

export type Supplier = {
  id: string
  company_name: string
  supply_type: string
  status: string
  default_due_type: string
  default_due_days?: number | null
  default_due_day?: number | null
  default_payment_method: string
  default_payment_account?: string | null
  default_card_name?: string | null
  default_installment_months: number
  tax_invoice_required: boolean
}

export type RawMaterial = {
  id: string
  item_code?: string | null
  item_name: string
  country_of_origin?: string | null
  packing_weight_g?: number | null
  unit_price_per_kg?: number | null
  current_stock_g?: number | null
  ingredient_type?: string | null
  linked_product_id?: string | null
  semifinished_usage_type?: string | null
}

export type PackagingMaterial = {
  id: string
  material_code?: string | null
  material_name: string
  spec?: string | null
  unit_price?: number | null
  current_stock?: number | null
}

export type PurchaseReceipt = {
  id: string
  purchase_no?: string | null
  supplier_id: string
  supplier_name_snapshot: string
  purchase_date: string
  receipt_date?: string | null
  purchase_category: string
  material_id?: string | null
  item_name: string
  quantity: number
  unit: string
  receipt_unit_label?: string | null
  unit_price: number
  supply_amount: number
  vat_amount: number
  total_amount: number
  estimated_total_amount?: number | null
  verification_status?: string | null
  amount_basis?: string | null
  inventory_quantity_base?: number | null
  inventory_unit?: string | null
  due_date?: string | null
  planned_payment_method: string
  planned_payment_account?: string | null
  planned_card_name?: string | null
  planned_installment_months: number
  tax_invoice_status: string
  tax_invoice_amount?: number | null
  status: string
  inventory_status?: string | null
  source_transaction_type?: string | null
  source_transaction_id?: string | null
  notes?: string | null
  paid_amount: number
  outstanding_amount: number
  payment_state: string
  legacy_record?: boolean
}

export type ReceiptPayload = {
  ok: boolean
  error?: string
  suppliers: Supplier[]
  raw_materials: RawMaterial[]
  packaging_materials: PackagingMaterial[]
  rows: PurchaseReceipt[]
}

export type ReceiptDraft = {
  supplier_id: string
  supplier_name_snapshot: string
  purchase_date: string
  receipt_date: string
  purchase_category: PurchaseCategory
  material_id: string
  quantity: number
  unit: PurchaseUnit
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
