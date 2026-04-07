/**
 * 재고 부족 사전 감지 엔진
 * - 최근 3개월 생산 빈도 TOP 제품 기반
 * - BOM 비율로 1회 필요량 계산
 * - 현재 재고 ÷ 1회필요량 < 3이면 경고 생성
 */
import { supabase } from './supabase'

export interface StockAlert {
  product_name: string
  product_code: string
  item_name: string
  item_code: string | null
  current_stock_g: number
  required_per_production_g: number
  possible_productions: number
  recommended_order_g: number
  severity: 'critical' | 'warning'  // 0회: critical, 1~2회: warning
}

// 최근 N개월 생산 빈도 기준 상위 제품 조회
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

  // 제품별 평균 생산량 집계
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
    .map(([code, v]) => ({
      product_code: code,
      product_name: v.product_name,
      avg_quantity_g: v.count > 0 ? v.total_g / v.count : 0,
      production_count: v.count,
    }))
    .sort((a, b) => b.production_count - a.production_count)
    .slice(0, limit)
}

// 제품 코드로 BOM 조회
async function getBomByProductCode(productCode: string) {
  const { data } = await supabase
    .from('bom_items')
    .select('*')
    .eq('product_code', productCode)
    .eq('business_id', 'default')

  return data ?? []
}

// 원료명으로 현재 재고 조회
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

// 원료 코드로 현재 재고 조회
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
  // 코드로 못 찾으면 이름으로 재시도
  return getStockByItemName(itemName)
}

/**
 * 재고 부족 감지 엔진 메인 함수
 * 채팅 시작 시 또는 매일 아침 cron에서 호출
 */
export async function runStockAlertEngine(): Promise<StockAlert[]> {
  const alerts: StockAlert[] = []

  // Step 1: 최근 3개월 생산 빈도 TOP 10 제품
  const topProducts = await getTopProductsByFrequency(3, 10)
  if (topProducts.length === 0) return alerts

  // Step 2: 각 제품 BOM 조회 및 재고 비교
  for (const product of topProducts) {
    const bom = await getBomByProductCode(product.product_code)
    if (bom.length === 0) continue

    for (const item of bom) {
      // Step 3: 1회 생산 시 필요량
      const requiredPerProduction = product.avg_quantity_g * (item.ratio_percent / 100)
      if (requiredPerProduction <= 0) continue

      // Step 4: 현재 재고 조회
      const currentStock = await getStockByItemCode(item.raw_code, item.raw_name)

      // Step 5: 가능 생산 횟수 계산
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
          recommended_order_g: Math.round(requiredPerProduction * 10 - currentStock), // 10회치 발주 권장
          severity: possibleProductions < 1 ? 'critical' : 'warning',
        })
      }
    }
  }

  // 중복 원료 제거 (여러 제품에서 동일 원료 경고 시 가장 심각한 것만)
  const uniqueAlerts = new Map<string, StockAlert>()
  for (const alert of alerts) {
    const key = alert.item_name
    const existing = uniqueAlerts.get(key)
    if (!existing || alert.possible_productions < existing.possible_productions) {
      uniqueAlerts.set(key, alert)
    }
  }

  return Array.from(uniqueAlerts.values()).sort((a, b) => a.possible_productions - b.possible_productions)
}

/**
 * 알림을 ai_alerts 테이블에 저장
 */
export async function saveAlerts(alerts: StockAlert[]) {
  if (alerts.length === 0) return

  const rows = alerts.map((a) => ({
    id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    alert_type: a.severity === 'critical' ? 'stock_critical' : 'stock_warning',
    message: `${a.product_name} 생산 시 필요한 ${a.item_name}이 ${a.possible_productions}회치밖에 없습니다. 현재재고: ${(a.current_stock_g / 1000).toFixed(1)}kg / 1회필요량: ${(a.required_per_production_g / 1000).toFixed(1)}kg`,
    is_read: false,
    business_id: 'default',
  }))

  await supabase.from('ai_alerts').insert(rows)
}

/**
 * 읽지 않은 알림 조회
 */
export async function getUnreadAlerts(): Promise<string[]> {
  const { data } = await supabase
    .from('ai_alerts')
    .select('message')
    .eq('business_id', 'default')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(5)

  return data?.map((a) => a.message) ?? []
}

/**
 * 알림 읽음 처리
 */
export async function markAlertsRead() {
  await supabase
    .from('ai_alerts')
    .update({ is_read: true })
    .eq('business_id', 'default')
    .eq('is_read', false)
}
