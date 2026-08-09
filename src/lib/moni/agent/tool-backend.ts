import type { MoniAgentToolContext } from '@/lib/moni/agent/context-types'

export type MoniToolJson = Record<string, any>

const MAX_TOOL_ROWS = 100

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const bool = (value: unknown) => value === true || value === 'true'
const limit = (value: unknown, fallback = 30) => Math.max(1, Math.min(MAX_TOOL_ROWS, Math.trunc(num(value) || fallback)))
const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : ''
const safeSearch = (value: string) => value.replace(/[%_,()]/g, ' ')

function businessIdsWithLegacy(context: MoniAgentToolContext) {
  return Array.from(new Set([context.businessId, 'default'].filter(Boolean)))
}

function dateInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function resolveRange(args: MoniToolJson, fallbackDays = 30) {
  const today = dateInZone('Asia/Seoul')
  const endDate = validDate(args.end_date) || today
  const startDate = validDate(args.start_date) || addDays(endDate, -(fallbackDays - 1))
  if (startDate > endDate) return { startDate: endDate, endDate: startDate }
  return { startDate, endDate }
}

export function getBusinessClock() {
  return {
    generated_at: new Date().toISOString(),
    factory_date: dateInZone('Asia/Seoul'),
    factory_time_zone: 'Asia/Seoul',
    user_date: dateInZone('Asia/Bangkok'),
    user_time_zone: 'Asia/Bangkok',
  }
}

async function getCompanyContext(args: MoniToolJson, context: MoniAgentToolContext) {
  const search = text(args.query, 200)
  let query = context.supabase
    .from('moni_ai_project_context')
    .select('context_key,title,content,priority,source_type,source_reference,updated_at')
    .eq('business_id', context.businessId)
    .eq('active', true)
    .order('priority', { ascending: false })
    .limit(Math.min(20, limit(args.limit, 10)))
  if (search) query = query.or(`title.ilike.%${safeSearch(search)}%,content.ilike.%${safeSearch(search)}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return { query: search || null, count: data?.length ?? 0, contexts: data ?? [] }
}

async function searchProductionRecords(args: MoniToolJson, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args)
  const product = text(args.product_query, 160)
  const status = text(args.status, 80)
  let query = context.supabase
    .from('production_records')
    .select('id,lot_number,work_date,product_id,product_name,planned_quantity_g,actual_quantity_g,defect_quantity_g,sample_quantity_g,status,worker_name,inspection_result,note,production_unit_name,planned_quantity_ea,actual_quantity_ea')
    .in('business_id', businessIdsWithLegacy(context))
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: false })
    .limit(limit(args.limit, 100))
  if (product) query = query.or(`product_name.ilike.%${safeSearch(product)}%,product_id.ilike.%${safeSearch(product)}%`)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const byProduct = new Map<string, MoniToolJson>()
  let planned = 0
  let actual = 0
  let defect = 0
  let sample = 0
  for (const row of rows) {
    planned += num(row.planned_quantity_g)
    actual += num(row.actual_quantity_g)
    defect += num(row.defect_quantity_g)
    sample += num(row.sample_quantity_g)
    const key = text(row.product_name, 200) || text(row.product_id, 100) || '미확인 제품'
    const current = byProduct.get(key) || {
      product_name: key,
      records: 0,
      planned_quantity_g: 0,
      actual_quantity_g: 0,
      defect_quantity_g: 0,
      sample_quantity_g: 0,
    }
    current.records += 1
    current.planned_quantity_g += num(row.planned_quantity_g)
    current.actual_quantity_g += num(row.actual_quantity_g)
    current.defect_quantity_g += num(row.defect_quantity_g)
    current.sample_quantity_g += num(row.sample_quantity_g)
    byProduct.set(key, current)
  }
  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { product_query: product || null, status: status || null },
    summary: {
      record_count: rows.length,
      planned_quantity_g: planned,
      actual_quantity_g: actual,
      defect_quantity_g: defect,
      sample_quantity_g: sample,
      unaccounted_gap_g: planned - actual - defect - sample,
      warning: 'unaccounted_gap_g는 확정 로스가 아니라 계획량에서 완료·불량·샘플을 뺀 단순 차이입니다.',
    },
    by_product: [...byProduct.values()].sort((a, b) => b.actual_quantity_g - a.actual_quantity_g),
    records: rows,
  }
}

async function searchProductionPlans(args: MoniToolJson, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args)
  const product = text(args.product_query, 160)
  let query = context.supabase
    .from('monthly_production_plans')
    .select('id,plan_date,product_id,product_name,planned_quantity_g,note,business_id,updated_at')
    .in('business_id', businessIdsWithLegacy(context))
    .gte('plan_date', startDate)
    .lte('plan_date', endDate)
    .order('plan_date', { ascending: true })
    .limit(limit(args.limit, 100))
  if (product) query = query.or(`product_name.ilike.%${safeSearch(product)}%,product_id.ilike.%${safeSearch(product)}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { product_query: product || null },
    summary: {
      plan_count: rows.length,
      planned_quantity_g: rows.reduce((sum: number, row: any) => sum + num(row.planned_quantity_g), 0),
    },
    plans: rows,
  }
}

async function getRawMaterialInventory(args: MoniToolJson, context: MoniAgentToolContext) {
  const search = text(args.material_query, 160)
  let query = context.supabase
    .from('raw_materials')
    .select('id,item_name,item_code,supplier,unit_price_per_kg,packing_weight_g,box_quantity,current_stock_g,is_active,is_stock_managed,country_of_origin,food_type,spec,storage_type,shelf_life_days')
    .in('business_id', businessIdsWithLegacy(context))
    .order('current_stock_g', { ascending: true })
    .limit(limit(args.limit, 50))
  if (search) query = query.or(`item_name.ilike.%${safeSearch(search)}%,item_code.ilike.%${safeSearch(search)}%,supplier.ilike.%${safeSearch(search)}%`)
  if (bool(args.active_only)) query = query.eq('is_active', true)
  if (bool(args.out_of_stock_only)) query = query.lte('current_stock_g', 0)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []).map((row: any) => ({
    ...row,
    out_of_stock: num(row.current_stock_g) <= 0,
    base_purchase_price_note: 'unit_price_per_kg 컬럼명은 레거시이며 운영상 기준 포장 1EA 가격입니다.',
  }))
  return {
    filters: {
      material_query: search || null,
      active_only: bool(args.active_only),
      out_of_stock_only: bool(args.out_of_stock_only),
    },
    count: rows.length,
    materials: rows,
  }
}

async function searchRawMaterialTransactions(args: MoniToolJson, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args)
  const material = text(args.material_query, 160)
  const txnType = text(args.transaction_type, 40).toUpperCase()
  let query = context.supabase
    .from('raw_material_transactions')
    .select('id,item_code,item_name,raw_material_name,txn_type,quantity_g,total_weight_g,unit_price,total_price,supplier,note,txn_date,transaction_date,production_record_id,source_purchase_id')
    .in('business_id', businessIdsWithLegacy(context))
    .gte('txn_date', startDate)
    .lte('txn_date', endDate)
    .order('txn_date', { ascending: false })
    .limit(limit(args.limit, 100))
  if (material) query = query.or(`item_name.ilike.%${safeSearch(material)}%,raw_material_name.ilike.%${safeSearch(material)}%,item_code.ilike.%${safeSearch(material)}%`)
  if (txnType === 'INBOUND' || txnType === 'OUTBOUND') query = query.eq('txn_type', txnType)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const byType: MoniToolJson = {}
  for (const row of rows) {
    const key = text(row.txn_type, 40) || 'UNKNOWN'
    byType[key] = (byType[key] || 0) + num(row.quantity_g || row.total_weight_g)
  }
  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: { material_query: material || null, transaction_type: txnType || null },
    summary: { transaction_count: rows.length, quantity_g_by_type: byType },
    transactions: rows,
  }
}

async function searchSalesAndReceivables(args: MoniToolJson, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args, 90)
  const clientQuery = text(args.client_query, 160)
  const productQuery = text(args.product_query, 160)
  const rowLimit = limit(args.limit, 100)

  const { data: clients, error: clientError } = await context.supabase
    .from('sales_clients')
    .select('id,company_name,contact_name,status,payment_terms,payment_due_type,payment_due_days,payment_due_day,tax_type')
    .eq('business_id', context.businessId)
  if (clientError) throw new Error(clientError.message)
  const clientMap = new Map((clients ?? []).map((row: any) => [row.id, row]))
  const matchingClientIds = clientQuery
    ? (clients ?? [])
        .filter((row: any) => text(row.company_name).toLowerCase().includes(clientQuery.toLowerCase()))
        .map((row: any) => row.id)
    : []

  let orderQuery = context.supabase
    .from('sales_orders')
    .select('id,statement_number,sale_date,client_id,manual_client_name,status,payment_status,supply_amount,vat_amount,total_amount,due_date,currency,source_type,source_reference,note')
    .eq('business_id', context.businessId)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: false })
    .limit(rowLimit)
  if (clientQuery && matchingClientIds.length) orderQuery = orderQuery.in('client_id', matchingClientIds)
  else if (clientQuery) orderQuery = orderQuery.ilike('manual_client_name', `%${safeSearch(clientQuery)}%`)
  const { data: ordersRaw, error: orderError } = await orderQuery
  if (orderError) throw new Error(orderError.message)
  let orders = ordersRaw ?? []
  const orderIds = orders.map((row: any) => row.id)

  const [{ data: receipts, error: receiptError }, { data: items, error: itemError }] = await Promise.all([
    orderIds.length
      ? context.supabase.from('sales_receipts').select('id,order_id,receipt_date,amount,method,status,reference_no,note').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null } as any),
    orderIds.length
      ? context.supabase.from('sales_order_items').select('id,order_id,product_id,product_name,quantity,quantity_kg,unit,unit_price,supply_amount,currency').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (receiptError) throw new Error(receiptError.message)
  if (itemError) throw new Error(itemError.message)

  if (productQuery) {
    const matchingOrderIds = new Set(
      (items ?? [])
        .filter((row: any) =>
          text(row.product_name).toLowerCase().includes(productQuery.toLowerCase())
          || text(row.product_id).toLowerCase().includes(productQuery.toLowerCase()),
        )
        .map((row: any) => row.order_id),
    )
    orders = orders.filter((row: any) => matchingOrderIds.has(row.id))
  }

  const receiptByOrder = new Map<string, number>()
  for (const row of receipts ?? []) {
    if (row.status === 'reversed') continue
    receiptByOrder.set(row.order_id, (receiptByOrder.get(row.order_id) || 0) + num(row.amount))
  }
  const itemByOrder = new Map<string, MoniToolJson[]>()
  for (const row of items ?? []) itemByOrder.set(row.order_id, [...(itemByOrder.get(row.order_id) || []), row])

  let enriched = orders.map((row: any) => {
    const received = receiptByOrder.get(row.id) || 0
    const outstanding = Math.max(0, num(row.total_amount) - received)
    const client = row.client_id ? clientMap.get(row.client_id) : null
    return {
      ...row,
      client_name: client?.company_name || row.manual_client_name || '거래처 미확인',
      received_amount: received,
      outstanding_amount: outstanding,
      items: itemByOrder.get(row.id) || [],
    }
  })
  if (bool(args.outstanding_only)) enriched = enriched.filter((row: any) => row.outstanding_amount > 0)

  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: {
      client_query: clientQuery || null,
      product_query: productQuery || null,
      outstanding_only: bool(args.outstanding_only),
    },
    summary: {
      order_count: enriched.length,
      total_sales_amount: enriched.reduce((sum: number, row: any) => sum + num(row.total_amount), 0),
      received_amount: enriched.reduce((sum: number, row: any) => sum + num(row.received_amount), 0),
      outstanding_amount: enriched.reduce((sum: number, row: any) => sum + num(row.outstanding_amount), 0),
    },
    orders: enriched,
  }
}

async function searchPurchasesAndPayables(args: MoniToolJson, context: MoniAgentToolContext) {
  const { startDate, endDate } = resolveRange(args, 90)
  const supplier = text(args.supplier_query, 160)
  const item = text(args.item_query, 160)
  let query = context.supabase
    .from('purchases')
    .select('id,purchase_no,supplier_id,supplier_name_snapshot,purchase_date,receipt_date,purchase_category,item_name,quantity,unit,unit_price,supply_amount,vat_amount,total_amount,due_date,status,inventory_status,verification_status,material_id,inventory_quantity_base,inventory_unit,notes')
    .eq('business_id', context.businessId)
    .gte('purchase_date', startDate)
    .lte('purchase_date', endDate)
    .order('purchase_date', { ascending: false })
    .limit(limit(args.limit, 100))
  if (supplier) query = query.ilike('supplier_name_snapshot', `%${safeSearch(supplier)}%`)
  if (item) query = query.ilike('item_name', `%${safeSearch(item)}%`)
  const { data: purchases, error } = await query
  if (error) throw new Error(error.message)
  const purchaseRows = purchases ?? []
  const purchaseIds = purchaseRows.map((row: any) => row.id)
  const supplierIds = [...new Set(purchaseRows.map((row: any) => row.supplier_id).filter(Boolean))]

  const [{ data: payments, error: paymentError }, { data: statements, error: statementError }] = await Promise.all([
    purchaseIds.length
      ? context.supabase.from('purchase_payments').select('id,purchase_id,payment_date,amount,payment_method,payment_account,reference,notes').in('purchase_id', purchaseIds)
      : Promise.resolve({ data: [], error: null } as any),
    supplierIds.length
      ? context.supabase.from('purchase_supplier_statement_balances').select('id,supplier_id,supplier_name,statement_date,period_start,period_end,opening_balance,statement_purchase_amount,statement_payment_amount,statement_credit_amount,closing_balance,extraction_status,reconciliation_status,reconciliation_difference,source_file,notes').in('supplier_id', supplierIds).order('statement_date', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (paymentError) throw new Error(paymentError.message)
  if (statementError) throw new Error(statementError.message)

  const paidByPurchase = new Map<string, number>()
  for (const row of payments ?? []) {
    paidByPurchase.set(row.purchase_id, (paidByPurchase.get(row.purchase_id) || 0) + num(row.amount))
  }
  let enriched = purchaseRows.map((row: any) => {
    const paid = paidByPurchase.get(row.id) || 0
    return { ...row, paid_amount: paid, outstanding_amount: Math.max(0, num(row.total_amount) - paid) }
  })
  if (bool(args.outstanding_only)) enriched = enriched.filter((row: any) => row.outstanding_amount > 0)

  const latestStatementBySupplier = new Map<string, MoniToolJson>()
  for (const row of statements ?? []) {
    const key = row.supplier_id || row.supplier_name
    if (!latestStatementBySupplier.has(key)) latestStatementBySupplier.set(key, row)
  }

  return {
    range: { start_date: startDate, end_date: endDate, time_zone: 'Asia/Seoul' },
    filters: {
      supplier_query: supplier || null,
      item_query: item || null,
      outstanding_only: bool(args.outstanding_only),
    },
    actual_purchases_summary: {
      purchase_count: enriched.length,
      total_amount: enriched.reduce((sum: number, row: any) => sum + num(row.total_amount), 0),
      paid_amount: enriched.reduce((sum: number, row: any) => sum + num(row.paid_amount), 0),
      outstanding_amount: enriched.reduce((sum: number, row: any) => sum + num(row.outstanding_amount), 0),
    },
    actual_purchases: enriched,
    supplier_statement_balances: [...latestStatementBySupplier.values()],
    separation_rule: 'supplier_statement_balances는 거래처 명세서 잔액이며 실제 입고·매입 행으로 간주하지 않습니다.',
  }
}

async function searchProductsAndRecipes(args: MoniToolJson, context: MoniAgentToolContext) {
  const product = text(args.product_query, 160)
  let query = context.supabase
    .from('products')
    .select('id,product_name,product_code,product_type,weight_g,product_spec,storage_type,shelf_life_days,shelf_life_standard,packaging_material,lot_rule,allergens,food_type_name,is_active,business_id')
    .in('business_id', businessIdsWithLegacy(context))
    .limit(Math.min(50, limit(args.limit, 20)))
  if (product) query = query.or(`product_name.ilike.%${safeSearch(product)}%,product_code.ilike.%${safeSearch(product)}%,id.ilike.%${safeSearch(product)}%`)
  if (bool(args.active_only)) query = query.eq('is_active', true)
  const { data: products, error } = await query
  if (error) throw new Error(error.message)
  const productIds = (products ?? []).map((row: any) => row.id)
  const [{ data: recipes, error: recipeError }, { data: mappings, error: mappingError }] = await Promise.all([
    productIds.length
      ? context.supabase
          .from('recipes')
          .select('id,product_id,product_name,food_type_id,food_type_name,ratio_percent,sort_order,is_active,ingredient_type,semi_product_id')
          .in('product_id', productIds)
          .order('sort_order')
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length
      ? context.supabase
          .from('raw_material_mapping')
          .select('id,product_id,product_name,recipe_id,raw_material_ref_id,raw_material_name,packing_unit,packing_weight_g,mapping_scope')
          .in('product_id', productIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])
  if (recipeError) throw new Error(recipeError.message)
  if (mappingError) throw new Error(mappingError.message)
  return {
    filters: { product_query: product || null, active_only: bool(args.active_only) },
    products: products ?? [],
    recipes: recipes ?? [],
    raw_material_mappings: mappings ?? [],
  }
}

export async function executeMoniReadOnlyTool(
  name: string,
  args: MoniToolJson,
  context: MoniAgentToolContext,
) {
  switch (name) {
    case 'get_business_clock': return getBusinessClock()
    case 'get_company_context': return getCompanyContext(args, context)
    case 'search_production_records': return searchProductionRecords(args, context)
    case 'search_production_plans': return searchProductionPlans(args, context)
    case 'get_raw_material_inventory': return getRawMaterialInventory(args, context)
    case 'search_raw_material_transactions': return searchRawMaterialTransactions(args, context)
    case 'search_sales_and_receivables': return searchSalesAndReceivables(args, context)
    case 'search_purchases_and_payables': return searchPurchasesAndPayables(args, context)
    case 'search_products_and_recipes': return searchProductsAndRecipes(args, context)
    default: throw new Error(`지원하지 않는 MONI 읽기 전용 도구입니다: ${name}`)
  }
}
