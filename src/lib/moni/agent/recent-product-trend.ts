import type { MoniAgentToolContext } from '@/lib/moni/agent/context-types'

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

type RecentMessage = { role: string; content: string }
type ProductRow = { id: string; product_name: string; product_code: string | null }
type MonthBucket = {
  month: string
  production_actual_g: number
  open_planned_g: number
  sales_quantity_kg: number
  sales_supply_amount: number
  sales_order_ids: Set<string>
}

export type RecentProductTrendResult = {
  answer: string
  monthsCount: number
  startDate: string
  endDate: string
  products: ProductRow[]
  monthRows: Array<Omit<MonthBucket, 'sales_order_ids'> & { sales_order_count: number }>
  currency: string | null
  durationMs: number
}

function factoryDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    date: `${values.year}-${values.month}-${values.day}`,
  }
}

function parseMonthCount(message: string) {
  const match = String(message || '').match(/(\d{1,2})\s*개월/)
  if (!match) return null
  const parsed = Number(match[1])
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) return null
  return parsed
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

function monthKey(value: unknown) {
  const date = String(value || '')
  return /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : ''
}

function formatKg(valueG: number) {
  const kg = valueG / 1000
  return kg.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function formatNumber(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function recentTrendContext(history: RecentMessage[]) {
  return history.slice(-8).map((item) => text(item.content, 2200)).join('\n')
}

export function isRecentProductTrendFollowupRequest(message: string, role: string, history: RecentMessage[]) {
  if (String(role || '').toLowerCase() !== 'admin') return false
  if (!parseMonthCount(message)) return false
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  if (!/(보여|알려|조회|자료|추이|정리|뽑)/.test(normalized)) return false
  const context = recentTrendContext(history)
  return /(월별\s*추이|생산완료량|판매수량|매출금액|최근\s*24개월|최신\s*6개월)/.test(context)
}

async function loadAllActiveProducts(context: MoniAgentToolContext) {
  const { data, error } = await context.supabase
    .from('products')
    .select('id,product_name,product_code')
    .eq('business_id', context.businessId)
    .eq('is_active', true)
    .order('product_name', { ascending: true })
    .limit(300)
  if (error) throw new Error(`제품 마스터 조회 실패: ${error.message}`)
  return (data ?? []) as ProductRow[]
}

function resolveTargetProducts(products: ProductRow[], history: RecentMessage[]) {
  const recent = history.slice(-8).reverse()
  for (const message of recent) {
    const content = String(message.content || '')
    const matches = products.filter((product) => product.product_name && content.includes(product.product_name))
    if (matches.length) {
      return [...new Map(matches.map((product) => [product.id, product])).values()].slice(0, 10)
    }
  }
  return []
}

async function pagedSelect<T>(builderFactory: (from: number, to: number) => any) {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; from < 10_000; from += pageSize) {
    const { data, error } = await builderFactory(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export async function resolveRecentProductTrendFollowup(
  context: MoniAgentToolContext,
  message: string,
  history: RecentMessage[],
): Promise<RecentProductTrendResult | null> {
  const startedAt = Date.now()
  const monthsCount = parseMonthCount(message)
  if (!monthsCount) return null

  const products = await loadAllActiveProducts(context)
  const targets = resolveTargetProducts(products, history)
  if (!targets.length) return null

  const today = factoryDateParts()
  const startMonth = shiftMonth(today.year, today.month, -(monthsCount - 1))
  const startDate = `${startMonth.year}-${String(startMonth.month).padStart(2, '0')}-01`
  const endDate = today.date
  const monthOrder = Array.from({ length: monthsCount }, (_, index) => {
    const period = shiftMonth(startMonth.year, startMonth.month, index)
    return `${period.year}-${String(period.month).padStart(2, '0')}`
  })
  const buckets = new Map<string, MonthBucket>(monthOrder.map((month) => [month, {
    month,
    production_actual_g: 0,
    open_planned_g: 0,
    sales_quantity_kg: 0,
    sales_supply_amount: 0,
    sales_order_ids: new Set<string>(),
  }]))
  const productIds = targets.map((product) => product.id)

  const productionRows = await pagedSelect<any>((from, to) => context.supabase
    .from('production_records')
    .select('work_date,product_id,product_name,planned_quantity_g,actual_quantity_g,status')
    .eq('business_id', context.businessId)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .in('product_id', productIds)
    .order('work_date', { ascending: true })
    .range(from, to))

  for (const row of productionRows) {
    const bucket = buckets.get(monthKey(row.work_date))
    if (!bucket) continue
    bucket.production_actual_g += num(row.actual_quantity_g)
    if (String(row.status || '').toLowerCase() === 'planned') bucket.open_planned_g += num(row.planned_quantity_g)
  }

  const orderRows = await pagedSelect<any>((from, to) => context.supabase
    .from('sales_orders')
    .select('id,sale_date,status')
    .eq('business_id', context.businessId)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: true })
    .range(from, to))
  const orderIds = orderRows.map((row) => String(row.id || '')).filter(Boolean)
  const orderDateById = new Map(orderRows.map((row) => [String(row.id), String(row.sale_date || '')]))

  let itemRows: any[] = []
  for (let offset = 0; offset < orderIds.length; offset += 200) {
    const orderChunk = orderIds.slice(offset, offset + 200)
    if (!orderChunk.length) continue
    const { data, error } = await context.supabase
      .from('sales_order_items')
      .select('order_id,product_id,product_name,quantity,quantity_kg,unit,supply_amount,currency')
      .in('order_id', orderChunk)
      .in('product_id', productIds)
    if (error) throw new Error(error.message)
    itemRows.push(...(data ?? []))
  }

  const currencies = new Set<string>()
  for (const row of itemRows) {
    const saleDate = orderDateById.get(String(row.order_id)) || ''
    const bucket = buckets.get(monthKey(saleDate))
    if (!bucket) continue
    bucket.sales_quantity_kg += num(row.quantity_kg)
    bucket.sales_supply_amount += num(row.supply_amount)
    bucket.sales_order_ids.add(String(row.order_id))
    const currency = text(row.currency, 12)
    if (currency) currencies.add(currency)
  }

  const currency = currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? null : 'MIXED'
  const monthRows = monthOrder.map((month) => {
    const bucket = buckets.get(month)!
    return {
      month: bucket.month,
      production_actual_g: bucket.production_actual_g,
      open_planned_g: bucket.open_planned_g,
      sales_quantity_kg: bucket.sales_quantity_kg,
      sales_supply_amount: bucket.sales_supply_amount,
      sales_order_count: bucket.sales_order_ids.size,
    }
  })

  const amountHeader = currency === 'MIXED'
    ? '판매 공급가액*'
    : `판매 공급가액${currency ? `(${currency})` : ''}`
  const table = [
    `| 월 | 생산완료(kg) | 현재 열린 작업지시(kg) | 판매수량(kg) | ${amountHeader} |`,
    '|---|---:|---:|---:|---:|',
    ...monthRows.map((row) => `| ${row.month} | ${formatKg(row.production_actual_g)} | ${formatKg(row.open_planned_g)} | ${formatNumber(row.sales_quantity_kg)} | ${formatNumber(row.sales_supply_amount)} |`),
  ].join('\n')
  const productLines = targets.map((product) => `- ${product.product_name}${product.id ? ` (${product.id})` : ''}`).join('\n')
  const currentMonthNote = `※ ${today.year}-${String(today.month).padStart(2, '0')}월은 ${today.date}까지의 데이터입니다.`
  const salesNote = currency === 'MIXED'
    ? '※ 판매 통화가 둘 이상이라 공급가액 합계를 하나의 통화 금액처럼 해석하면 안 됩니다.'
    : '※ 판매금액은 제품별 판매행의 공급가액 기준입니다.'
  const receivableNote = '※ 제품별 과거 월말 미수잔액은 주문 단위 수금 데이터를 제품별로 임의 배분하지 않기 위해 이 표에서 제외했습니다.'

  const answer = `최근 **${monthsCount}개월(${startDate}~${endDate})** 기준으로 직전 대화에서 확정한 제품들의 월별 추이를 바로 조회했습니다.\n\n${table}\n\n대상 제품\n${productLines}\n\n${currentMonthNote}\n${salesNote}\n${receivableNote}`

  return {
    answer,
    monthsCount,
    startDate,
    endDate,
    products: targets,
    monthRows,
    currency,
    durationMs: Date.now() - startedAt,
  }
}
