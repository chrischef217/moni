import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const PAGE_SIZE = 1000

type ProductRow = {
  id?: string | null
  product_name?: string | null
  product_code?: string | null
  product_spec?: string | null
  product_type?: string | null
  weight_g?: number | string | null
  is_active?: boolean | null
}

type ProductionRow = Record<string, unknown>
type SalesOrderRow = Record<string, unknown>
type SalesItemRow = Record<string, unknown>
type ClientRow = Record<string, unknown>

type Movement = {
  id: string
  product_id: string
  product_name: string
  date: string
  type: 'INBOUND' | 'OUTBOUND'
  quantity_g: number
  reference: string
  counterparty: string
  lot_number: string
  source_id: string
  balance_after_g: number
}

const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const normalize = (value: unknown) => text(value).toLocaleLowerCase('ko-KR').replace(/[\s._-]+/g, '')

function isFinishedProduct(value: unknown) {
  const key = normalize(value)
  return key === '완제품' || key === 'finished' || key === 'finishedproduct' || !key
}

function isCompletedProduction(value: unknown) {
  const key = normalize(value)
  return ['completed', 'confirmed', '완료', '확정', '생산완료'].includes(key)
}

function isConfirmedSale(value: unknown) {
  return normalize(value) === 'confirmed' || normalize(value) === '확정'
}

function productNameKey(value: unknown) {
  return normalize(value)
}

function saleQuantityToGrams(quantityValue: unknown, unitValue: unknown, productWeightG: number) {
  const quantity = num(quantityValue)
  if (!(quantity > 0)) return { grams: 0, supported: true }
  const unit = normalize(unitValue)

  if (['kg', 'kgs', 'kilogram', 'kilograms', '킬로', '킬로그램'].includes(unit)) {
    return { grams: quantity * 1000, supported: true }
  }
  if (['g', 'gram', 'grams', '그램'].includes(unit)) {
    return { grams: quantity, supported: true }
  }
  if (['ea', 'each', 'pc', 'pcs', '개', '개입'].includes(unit)) {
    if (productWeightG > 0) return { grams: quantity * productWeightG, supported: true }
    return { grams: 0, supported: false }
  }
  if (!unit) {
    // 기존 판매등록의 기본단위가 kg이므로 빈 단위는 kg으로 처리한다.
    return { grams: quantity * 1000, supported: true }
  }
  return { grams: 0, supported: false }
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

async function fetchAll<T>(makeQuery: (from: number, to: number) => any, label: string): Promise<T[]> {
  const rows: T[] = []
  for (let page = 0; page < 30; page += 1) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const result = await makeQuery(from, to)
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
    const pageRows = (result.data ?? []) as T[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) return rows
  }
  throw new Error(`${label}: 조회 건수가 안전 한도를 초과했습니다.`)
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const client = createMoniServiceRoleClient()
    const [productsResult, productions, orders, clients] = await Promise.all([
      client
        .from('products')
        .select('id,product_name,product_code,product_spec,product_type,weight_g,is_active,business_id')
        .order('product_name', { ascending: true })
        .limit(2000),
      fetchAll<ProductionRow>(
        (from, to) => client
          .from('production_records')
          .select('*')
          .order('work_date', { ascending: true })
          .order('created_at', { ascending: true })
          .range(from, to),
        '생산기록 조회 실패',
      ),
      fetchAll<SalesOrderRow>(
        (from, to) => client
          .from('sales_orders')
          .select('id,business_id,statement_number,sale_date,client_id,status,created_at')
          .eq('business_id', BUSINESS_ID)
          .order('sale_date', { ascending: true })
          .order('created_at', { ascending: true })
          .range(from, to),
        '판매기록 조회 실패',
      ),
      fetchAll<ClientRow>(
        (from, to) => client
          .from('sales_clients')
          .select('id,company_name,business_id')
          .eq('business_id', BUSINESS_ID)
          .order('company_name', { ascending: true })
          .range(from, to),
        '거래처 조회 실패',
      ),
    ])

    if (productsResult.error) throw new Error(productsResult.error.message)

    const products = ((productsResult.data ?? []) as ProductRow[])
      .filter((row) => isFinishedProduct(row.product_type))

    const productById = new Map<string, ProductRow>()
    const productByName = new Map<string, ProductRow>()
    for (const product of products) {
      const id = text(product.id)
      if (id) productById.set(id, product)
      const nameKey = productNameKey(product.product_name)
      if (nameKey && !productByName.has(nameKey)) productByName.set(nameKey, product)
    }

    const clientById = new Map<string, string>()
    for (const row of clients) {
      const id = text(row.id)
      if (id) clientById.set(id, text(row.company_name) || '거래처')
    }

    const confirmedOrders = orders.filter((row) => isConfirmedSale(row.status))
    const orderIds = confirmedOrders.map((row) => text(row.id)).filter(Boolean)
    const items: SalesItemRow[] = []
    for (let start = 0; start < orderIds.length; start += 300) {
      const ids = orderIds.slice(start, start + 300)
      if (!ids.length) continue
      const result = await client
        .from('sales_order_items')
        .select('id,order_id,product_id,product_name,specification,quantity,unit,created_at')
        .in('order_id', ids)
        .order('created_at', { ascending: true })
      if (result.error) throw new Error(`판매품목 조회 실패: ${result.error.message}`)
      items.push(...((result.data ?? []) as SalesItemRow[]))
    }

    const orderById = new Map<string, SalesOrderRow>()
    for (const order of confirmedOrders) orderById.set(text(order.id), order)

    const movements: Movement[] = []
    const conversionIssues: Array<Record<string, unknown>> = []

    for (const row of productions) {
      if (!isCompletedProduction(row.status)) continue
      const productId = text(row.product_id)
      const product = productById.get(productId) || productByName.get(productNameKey(row.product_name))
      if (!product) continue

      const goodQuantity = Object.prototype.hasOwnProperty.call(row, 'quantity_ok_g') && row.quantity_ok_g !== null
        ? num(row.quantity_ok_g)
        : num(row.actual_quantity_g)
      if (!(goodQuantity > 0)) continue

      movements.push({
        id: `production:${text(row.id)}`,
        product_id: text(product.id),
        product_name: text(product.product_name),
        date: text(row.work_date) || text(row.created_at).slice(0, 10),
        type: 'INBOUND',
        quantity_g: goodQuantity,
        reference: '생산완료',
        counterparty: '',
        lot_number: text(row.lot_number),
        source_id: text(row.id),
        balance_after_g: 0,
      })
    }

    for (const item of items) {
      const order = orderById.get(text(item.order_id))
      if (!order) continue
      const productId = text(item.product_id)
      const product = productById.get(productId) || productByName.get(productNameKey(item.product_name))
      if (!product) continue

      const converted = saleQuantityToGrams(item.quantity, item.unit, num(product.weight_g))
      if (!converted.supported) {
        conversionIssues.push({
          order_id: text(order.id),
          statement_number: text(order.statement_number),
          product_id: text(product.id),
          product_name: text(product.product_name),
          quantity: num(item.quantity),
          unit: text(item.unit),
          reason: '판매단위를 g으로 변환할 수 없습니다.',
        })
        continue
      }
      if (!(converted.grams > 0)) continue

      movements.push({
        id: `sale:${text(item.id)}`,
        product_id: text(product.id),
        product_name: text(product.product_name),
        date: text(order.sale_date) || text(order.created_at).slice(0, 10),
        type: 'OUTBOUND',
        quantity_g: converted.grams,
        reference: text(order.statement_number) || '판매등록',
        counterparty: clientById.get(text(order.client_id)) || '거래처',
        lot_number: '',
        source_id: text(order.id),
        balance_after_g: 0,
      })
    }

    movements.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

    const balances = new Map<string, number>()
    const stats = new Map<string, {
      inbound_g: number
      outbound_g: number
      production_count: number
      sales_count: number
      last_inbound_date: string
      last_outbound_date: string
    }>()

    for (const movement of movements) {
      const current = balances.get(movement.product_id) ?? 0
      const next = current + (movement.type === 'INBOUND' ? movement.quantity_g : -movement.quantity_g)
      balances.set(movement.product_id, next)
      movement.balance_after_g = next

      const row = stats.get(movement.product_id) ?? {
        inbound_g: 0,
        outbound_g: 0,
        production_count: 0,
        sales_count: 0,
        last_inbound_date: '',
        last_outbound_date: '',
      }
      if (movement.type === 'INBOUND') {
        row.inbound_g += movement.quantity_g
        row.production_count += 1
        if (!row.last_inbound_date || movement.date > row.last_inbound_date) row.last_inbound_date = movement.date
      } else {
        row.outbound_g += movement.quantity_g
        row.sales_count += 1
        if (!row.last_outbound_date || movement.date > row.last_outbound_date) row.last_outbound_date = movement.date
      }
      stats.set(movement.product_id, row)
    }

    const inventory = products.map((product) => {
      const id = text(product.id)
      const stat = stats.get(id) ?? {
        inbound_g: 0,
        outbound_g: 0,
        production_count: 0,
        sales_count: 0,
        last_inbound_date: '',
        last_outbound_date: '',
      }
      const stockG = balances.get(id) ?? 0
      return {
        product_id: id,
        product_name: text(product.product_name),
        product_code: text(product.product_code),
        product_spec: text(product.product_spec),
        weight_g: num(product.weight_g),
        is_active: product.is_active !== false,
        inbound_g: stat.inbound_g,
        outbound_g: stat.outbound_g,
        stock_g: stockG,
        production_count: stat.production_count,
        sales_count: stat.sales_count,
        last_inbound_date: stat.last_inbound_date || null,
        last_outbound_date: stat.last_outbound_date || null,
        negative_stock: stockG < 0,
      }
    }).sort((a, b) => {
      if (a.negative_stock !== b.negative_stock) return a.negative_stock ? -1 : 1
      if ((a.stock_g > 0) !== (b.stock_g > 0)) return a.stock_g > 0 ? -1 : 1
      return a.product_name.localeCompare(b.product_name, 'ko-KR')
    })

    const totalInboundG = inventory.reduce((sum, row) => sum + row.inbound_g, 0)
    const totalOutboundG = inventory.reduce((sum, row) => sum + row.outbound_g, 0)
    const totalStockG = inventory.reduce((sum, row) => sum + row.stock_g, 0)

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      summary: {
        product_count: inventory.length,
        stocked_product_count: inventory.filter((row) => row.stock_g > 0).length,
        negative_product_count: inventory.filter((row) => row.stock_g < 0).length,
        total_inbound_g: totalInboundG,
        total_outbound_g: totalOutboundG,
        total_stock_g: totalStockG,
        conversion_issue_count: conversionIssues.length,
      },
      inventory,
      movements: movements.slice().reverse(),
      conversion_issues: conversionIssues,
      policy: {
        inbound: '생산기록의 상태가 완료/확정인 완제품의 정상 생산량을 자동 입고로 계산',
        outbound: '판매관리의 확정 판매 품목을 자동 출고로 계산',
        cancellation: '생산 또는 판매 원본이 수정·취소되면 재고도 자동 재계산',
      },
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '완제품 재고 조회 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}
