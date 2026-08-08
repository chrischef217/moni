/**
 * 재고 부족 사전 감지 엔진
 * - 최근 3개월 생산 빈도 TOP 제품 기반
 * - BOM 비율로 1회 필요량 계산
 * - 현재 재고 ÷ 1회필요량 < 3이면 경고 생성
 */
import 'server-only'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

const supabase = createMoniServiceRoleClient()

export interface StockAlert {
  product_name: string
  product_code: string
  item_name: string
  item_code: string | null
  current_stock_g: number
  required_per_production_g: number
  possible_productions: number
  recommended_order_g: number
  severity: 'critical' | 'warning'
}

async function getTopProductsByFrequency(months: number, limit: number) {
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('productions')
    .select('product_code, product_name, quantity_ok_g')
    .eq('business_id', 'default')
    .eq('status', 'completed')
    .gte('work_date', sinceStr)

  if (error || !data) return []

  const productMap = new Map<string, { product_name: string; total_g: number; count: number }>()
  for (const row of data) {
    const key = row.product_code ?? row.product_name
    const existing = productMap.get(key)
    if (existing) {
      existing.total_g += row.quantity_ok_g ?? 0
      existing.count += 1
    } else {
      productMap.set(key, {
        product_name: row.product_name,
        total_g: row.quantity_ok_g ?? 0,
        count: 1,
      })
    }
  }

  return Array.from(productMap.entries())
    .map(([code, value]) => ({
      product_code: code,
      product_name: value.product_name,
      avg_quantity_g: value.count > 0 ? value.total_g / value.count : 0,
      production_count: value.count,
    }))
    .sort((a, b) => b.production_count - a.production_count)
    .slice(0, limit)
}

async function getBomByProductCode(productCode: string) {
  const { data } = await supabase
    .from('bom_items')
    .select('*')
    .eq('product_code', productCode)
    .eq('business_id', 'default')
  return data ?? []
}

async function getStockByItemName(itemName: string): Promise<number> {
  const { data } = await supabase
    .from('raw_materials')
    .select('current_stock_g')
    .ilike('item_name', itemName)
    .eq('business_id', 'default')
    .eq('is_active', true)
    .maybeSingle()
  return data?.current_stock_g ?? 0
}

async function getStockByItemCode(itemCode: string | null, itemName: string): Promise<number> {
  if (itemCode) {
    const { data } = await supabase
      .from('raw_materials')
      .select('current_stock_g')
      .eq('item_code', itemCode)
      .eq('business_id', 'default')
      .eq('is_active', true)
      .maybeSingle()
    if (data) return data.current_stock_g ?? 0
  }
  return getStockByItemName(itemName)
}

export async function runStockAlertEngine(): Promise<StockAlert[]> {
  const alerts: StockAlert[] = []
  const topProducts = await getTopProductsByFrequency(3, 10)
  if (topProducts.length === 0) return alerts

  for (const product of topProducts) {
    const bom = await getBomByProductCode(product.product_code)
    if (bom.length === 0) continue

    for (const item of bom) {
      const requiredPerProduction = product.avg_quantity_g * (item.ratio_percent / 100)
      if (requiredPerProduction <= 0) continue
      const currentStock = await getStockByItemCode(item.raw_code, item.raw_name)
      const possibleProductions = currentStock / requiredPerProduction

      if (possibleProductions < 3) {
        alerts.push({
          product_name: product.product_name,
          product_code: product.product_code,
          item_name: item.raw_name,
          item_code: item.raw_code,
          current_stock_g: currentStock,
          required_per_production_g: Math.round(requiredPerProduction),
          possible_productions: Math.floor(possibleProductions),
          recommended_order_g: Math.round(requiredPerProduction * 10 - currentStock),
          severity: possibleProductions < 1 ? 'critical' : 'warning',
        })
      }
    }
  }

  const uniqueAlerts = new Map<string, StockAlert>()
  for (const alert of alerts) {
    const existing = uniqueAlerts.get(alert.item_name)
    if (!existing || alert.possible_productions < existing.possible_productions) {
      uniqueAlerts.set(alert.item_name, alert)
    }
  }
  return Array.from(uniqueAlerts.values()).sort((a, b) => a.possible_productions - b.possible_productions)
}

export async function saveAlerts(alerts: StockAlert[]) {
  if (alerts.length === 0) return
  const rows = alerts.map((alert) => ({
    id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    alert_type: alert.severity === 'critical' ? 'stock_critical' : 'stock_warning',
    message: `${alert.product_name} 생산 시 필요한 ${alert.item_name}이 ${alert.possible_productions}회치밖에 없습니다. 현재재고: ${(alert.current_stock_g / 1000).toFixed(1)}kg / 1회필요량: ${(alert.required_per_production_g / 1000).toFixed(1)}kg`,
    is_read: false,
    business_id: 'default',
  }))
  await supabase.from('ai_alerts').insert(rows)
}

export async function getUnreadAlerts(): Promise<string[]> {
  const { data } = await supabase
    .from('ai_alerts')
    .select('message')
    .eq('business_id', 'default')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(5)
  return data?.map((alert) => alert.message) ?? []
}

export async function markAlertsRead() {
  await supabase
    .from('ai_alerts')
    .update({ is_read: true })
    .eq('business_id', 'default')
    .eq('is_read', false)
}
