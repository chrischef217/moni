import { NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { expandProductionRecipe, type RecipeExpansionResult } from '@/lib/moni/recipeExpansion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_BUSINESS_ID = '20220523011'

type Row = Record<string, unknown>

type ProductFormula = {
  productId: string
  productName: string
  unresolved: string[]
  materials: Array<{
    materialId: string
    materialName: string
    ratioPerGram: number
    isStockManaged: boolean
  }>
}

type MaterialMeta = {
  id: string
  itemCode: string
  name: string
  currentStockG: number
  packPriceWon: number | null
  packingWeightG: number | null
  pricePerG: number | null
}

type DashboardAlert = {
  id: string
  severity: 'danger' | 'warning' | 'info' | 'success'
  title: string
  detail: string
  metric?: string
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replaceAll(',', ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function nullablePositive(value: unknown): number | null {
  const parsed = numberValue(value)
  return parsed > 0 ? parsed : null
}

function kstDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date)
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

function monthEnd(date: string): string {
  const start = new Date(`${monthStart(date)}T00:00:00Z`)
  start.setUTCMonth(start.getUTCMonth() + 1)
  start.setUTCDate(0)
  return start.toISOString().slice(0, 10)
}

function previousMonthStart(date: string): string {
  const start = new Date(`${monthStart(date)}T00:00:00Z`)
  start.setUTCMonth(start.getUTCMonth() - 1)
  return start.toISOString().slice(0, 10)
}

function dateRange(start: string, end: string): string[] {
  const result: string[] = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) result.push(cursor)
  return result
}

function normalizeStatus(value: unknown): string {
  return text(value).toLocaleLowerCase('ko-KR')
}

function isCancelled(value: unknown): boolean {
  return ['cancelled', 'canceled', '취소'].includes(normalizeStatus(value))
}

function isPlanned(value: unknown): boolean {
  return ['planned', '예정', '작업지시'].includes(normalizeStatus(value))
}

function isCompleted(value: unknown): boolean {
  return ['completed', 'confirmed', 'complete', 'done', '완료', '확정', '생산완료'].includes(normalizeStatus(value))
}

function parsePackingWeight(value: unknown): number | null {
  const direct = nullablePositive(value)
  if (direct !== null) return direct
  const raw = text(value).toLowerCase().replaceAll(',', '')
  if (!raw) return null
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(kg|g)?/)
  if (!match) return null
  const numeric = Number(match[1])
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return match[2] === 'kg' ? numeric * 1000 : numeric
}

function recordLossG(record: Row): number {
  const planned = Math.max(0, numberValue(record.planned_quantity_g))
  const entered =
    Math.max(0, numberValue(record.actual_quantity_g)) +
    Math.max(0, numberValue(record.defect_quantity_g)) +
    Math.max(0, numberValue(record.sample_quantity_g))
  return Math.max(0, planned - entered)
}

function recordKey(record: Row): string {
  return text(record.id)
}

function productKey(record: Row): string {
  return text(record.product_id) || `name:${text(record.product_name)}`
}

function formatKgCompact(valueG: number): string {
  const kg = Math.max(0, valueG) / 1000
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: kg >= 100 ? 0 : 1 }).format(kg)}kg`
}

function formatWon(value: number): string {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(Math.round(value))}원`
}

async function buildFormula(record: Row): Promise<ProductFormula> {
  const productId = text(record.product_id)
  const productName = text(record.product_name)
  if (!productId) {
    return { productId: '', productName, unresolved: [`${productName || '제품'}: 제품 연결 정보 없음`], materials: [] }
  }

  let expansion: RecipeExpansionResult
  try {
    expansion = await expandProductionRecipe({
      productId,
      productName,
      quantityG: 1000,
      businessId: text(record.business_id) || DEFAULT_BUSINESS_ID,
    })
  } catch (error) {
    return {
      productId,
      productName,
      unresolved: [error instanceof Error ? error.message : `${productName}: 레시피 전개 실패`],
      materials: [],
    }
  }

  return {
    productId,
    productName: expansion.root.product_name || productName,
    unresolved: expansion.unresolved_items,
    materials: expansion.materials.map((material) => ({
      materialId: text(material.material_id),
      materialName: text(material.material_name),
      ratioPerGram: Math.max(0, numberValue(material.final_input_g)) / 1000,
      isStockManaged: material.is_stock_managed !== false,
    })),
  }
}

export async function GET() {
  try {
    const supabase = createMoniServiceRoleClient()
    const today = kstDateKey()
    const currentMonthStart = monthStart(today)
    const currentMonthEnd = monthEnd(today)
    const prevStart = previousMonthStart(today)
    const prevEnd = addDays(currentMonthStart, -1)
    const futureEnd = addDays(today, 14)
    const planWarningEnd = addDays(today, 7)

    const [recordsResult, materialsResult, txResult, expectedPlansResult] = await Promise.all([
      supabase
        .from('production_records')
        .select('*')
        .gte('work_date', prevStart)
        .lte('work_date', futureEnd)
        .order('work_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('raw_materials')
        .select('*')
        .eq('is_active', true)
        .order('item_name', { ascending: true }),
      supabase
        .from('raw_material_transactions')
        .select('id, item_code, txn_type, transaction_type, quantity_g, total_weight_g, txn_date, production_record_id, created_at')
        .gte('txn_date', prevStart)
        .lte('txn_date', currentMonthEnd)
        .order('txn_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('monthly_production_plans')
        .select('id, plan_date, product_id, product_name, planned_quantity_g, note, business_id')
        .gte('plan_date', today)
        .lte('plan_date', planWarningEnd)
        .order('plan_date', { ascending: true }),
    ])

    if (recordsResult.error) throw new Error(recordsResult.error.message || '생산기록 조회에 실패했습니다.')
    if (materialsResult.error) throw new Error(materialsResult.error.message || '원재료 조회에 실패했습니다.')
    if (txResult.error) throw new Error(txResult.error.message || '원재료 소모내역 조회에 실패했습니다.')
    if (expectedPlansResult.error) throw new Error(expectedPlansResult.error.message || '예상계획 조회에 실패했습니다.')

    const records = ((recordsResult.data ?? []) as Row[]).filter((row) => !isCancelled(row.status))
    const materials = (materialsResult.data ?? []) as Row[]
    const transactions = (txResult.data ?? []) as Row[]
    const expectedPlans = (expectedPlansResult.data ?? []) as Row[]

    const materialByRef = new Map<string, MaterialMeta>()
    const uniqueMaterials = new Map<string, MaterialMeta>()
    for (const row of materials) {
      if (row.is_stock_managed === false) continue
      const id = text(row.id)
      const itemCode = text(row.item_code)
      const packingWeightG = parsePackingWeight(row.packing_weight_g) ?? parsePackingWeight(row.spec)
      const packPriceWon = nullablePositive(row.unit_price_per_kg ?? row.unit_price)
      const meta: MaterialMeta = {
        id,
        itemCode,
        name: text(row.item_name) || id || itemCode,
        currentStockG: Math.max(0, numberValue(row.current_stock_g)),
        packPriceWon,
        packingWeightG,
        pricePerG: packPriceWon !== null && packingWeightG !== null ? packPriceWon / packingWeightG : null,
      }
      if (id) {
        materialByRef.set(id, meta)
        uniqueMaterials.set(id, meta)
      }
      if (itemCode) materialByRef.set(itemCode, meta)
    }

    const currentMonthRecords = records.filter((row) => text(row.work_date) >= currentMonthStart && text(row.work_date) <= currentMonthEnd)
    const dueRecords = currentMonthRecords.filter((row) => text(row.work_date) <= today)
    const completedCurrent = currentMonthRecords.filter((row) => isCompleted(row.status) || numberValue(row.actual_quantity_g) > 0)
    const previousRecords = records.filter((row) => text(row.work_date) >= prevStart && text(row.work_date) <= prevEnd)
    const previousCompleted = previousRecords.filter((row) => isCompleted(row.status) || numberValue(row.actual_quantity_g) > 0)
    const overdueRecords = records.filter((row) => isPlanned(row.status) && text(row.work_date) < today)
    const upcomingRecords = records
      .filter((row) => isPlanned(row.status) && text(row.work_date) >= today && text(row.work_date) <= futureEnd)
      .sort((a, b) => text(a.work_date).localeCompare(text(b.work_date)) || text(a.created_at).localeCompare(text(b.created_at)))

    const plannedDueG = dueRecords.reduce((sum, row) => sum + Math.max(0, numberValue(row.planned_quantity_g)), 0)
    const actualDueG = dueRecords.reduce((sum, row) => sum + Math.max(0, numberValue(row.actual_quantity_g)), 0)
    const monthTotalPlannedG = currentMonthRecords.reduce((sum, row) => sum + Math.max(0, numberValue(row.planned_quantity_g)), 0)
    const completedPlannedG = completedCurrent.reduce((sum, row) => sum + Math.max(0, numberValue(row.planned_quantity_g)), 0)
    const currentLossG = completedCurrent.reduce((sum, row) => sum + recordLossG(row), 0)
    const prevCompletedPlannedG = previousCompleted.reduce((sum, row) => sum + Math.max(0, numberValue(row.planned_quantity_g)), 0)
    const prevLossG = previousCompleted.reduce((sum, row) => sum + recordLossG(row), 0)
    const currentLossRate = completedPlannedG > 0 ? (currentLossG / completedPlannedG) * 100 : 0
    const previousLossRate = prevCompletedPlannedG > 0 ? (prevLossG / prevCompletedPlannedG) * 100 : 0

    const recordCostKnown = new Map<string, number>()
    const recordUnpricedMaterials = new Map<string, Set<string>>()
    const usedMaterialNames = new Set<string>()
    const unpricedUsedMaterialNames = new Set<string>()
    const dailyKnownCost = new Map<string, number>()

    for (const tx of transactions) {
      const type = normalizeStatus(tx.txn_type || tx.transaction_type)
      if (type !== 'outbound' && !type.includes('소모') && !type.includes('출고')) continue
      const material = materialByRef.get(text(tx.item_code))
      const materialName = material?.name || text(tx.item_code) || '원재료 확인 필요'
      usedMaterialNames.add(materialName)
      const quantityG = Math.max(0, numberValue(tx.total_weight_g ?? tx.quantity_g))
      const productionRecordId = text(tx.production_record_id)
      const txDate = text(tx.txn_date)

      if (!material || material.pricePerG === null) {
        unpricedUsedMaterialNames.add(materialName)
        if (productionRecordId) {
          const set = recordUnpricedMaterials.get(productionRecordId) ?? new Set<string>()
          set.add(materialName)
          recordUnpricedMaterials.set(productionRecordId, set)
        }
        continue
      }

      const cost = quantityG * material.pricePerG
      if (productionRecordId) recordCostKnown.set(productionRecordId, (recordCostKnown.get(productionRecordId) ?? 0) + cost)
      if (txDate >= currentMonthStart && txDate <= currentMonthEnd) {
        dailyKnownCost.set(txDate, (dailyKnownCost.get(txDate) ?? 0) + cost)
      }
    }

    let knownLossCostWon = 0
    let recordsWithIncompleteLossPrice = 0
    const dailyKnownLossCost = new Map<string, number>()
    const productLossMap = new Map<string, {
      product_id: string
      product_name: string
      planned_g: number
      actual_g: number
      loss_g: number
      known_loss_cost_won: number
      incomplete_price: boolean
    }>()

    for (const row of completedCurrent) {
      const plannedG = Math.max(0, numberValue(row.planned_quantity_g))
      const lossG = recordLossG(row)
      const lossRatio = plannedG > 0 ? lossG / plannedG : 0
      const knownCost = recordCostKnown.get(recordKey(row)) ?? 0
      const knownLossCost = knownCost * lossRatio
      const incomplete = (recordUnpricedMaterials.get(recordKey(row))?.size ?? 0) > 0
      knownLossCostWon += knownLossCost
      if (lossG > 0 && incomplete) recordsWithIncompleteLossPrice += 1
      const workDate = text(row.work_date)
      dailyKnownLossCost.set(workDate, (dailyKnownLossCost.get(workDate) ?? 0) + knownLossCost)

      const key = productKey(row)
      const current = productLossMap.get(key) ?? {
        product_id: text(row.product_id),
        product_name: text(row.product_name) || '제품명 없음',
        planned_g: 0,
        actual_g: 0,
        loss_g: 0,
        known_loss_cost_won: 0,
        incomplete_price: false,
      }
      current.planned_g += plannedG
      current.actual_g += Math.max(0, numberValue(row.actual_quantity_g))
      current.loss_g += lossG
      current.known_loss_cost_won += knownLossCost
      current.incomplete_price = current.incomplete_price || incomplete
      productLossMap.set(key, current)
    }

    const formulas = new Map<string, ProductFormula>()
    for (const row of upcomingRecords) {
      const key = productKey(row)
      if (formulas.has(key)) continue
      formulas.set(key, await buildFormula(row))
    }

    const projectedStockByMaterial = new Map<string, number>()
    for (const meta of Array.from(uniqueMaterials.values())) projectedStockByMaterial.set(meta.id, meta.currentStockG)

    const futureUsageByMaterial = new Map<string, { material: MaterialMeta | null; requiredG: number; firstShortageDate: string | null }>()
    const futureRecipeIssues = new Set<string>()
    let riskWorkOrderCount = 0

    for (const row of upcomingRecords) {
      const formula = formulas.get(productKey(row))
      const plannedG = Math.max(0, numberValue(row.planned_quantity_g))
      let rowHasRisk = false
      if (!formula || formula.unresolved.length > 0 || formula.materials.length === 0) {
        formula?.unresolved.forEach((issue) => futureRecipeIssues.add(issue))
        if (!formula) futureRecipeIssues.add(`${text(row.product_name) || '제품'}: 레시피 계산 불가`)
        rowHasRisk = true
      }

      for (const component of formula?.materials ?? []) {
        if (!component.isStockManaged || !component.materialId || component.ratioPerGram <= 0) continue
        const requiredG = plannedG * component.ratioPerGram
        const meta = materialByRef.get(component.materialId) ?? null
        const before = projectedStockByMaterial.get(component.materialId) ?? meta?.currentStockG ?? 0
        const after = before - requiredG
        projectedStockByMaterial.set(component.materialId, after)
        if (after < 0) rowHasRisk = true

        const usage = futureUsageByMaterial.get(component.materialId) ?? {
          material: meta,
          requiredG: 0,
          firstShortageDate: null,
        }
        usage.requiredG += requiredG
        if (!usage.firstShortageDate && after < 0) usage.firstShortageDate = text(row.work_date)
        futureUsageByMaterial.set(component.materialId, usage)
      }
      if (rowHasRisk) riskWorkOrderCount += 1
    }

    const shortages = Array.from(futureUsageByMaterial.entries())
      .map(([materialId, usage]) => {
        const meta = usage.material ?? materialByRef.get(materialId) ?? null
        const currentStockG = meta?.currentStockG ?? 0
        const shortageG = Math.max(0, usage.requiredG - currentStockG)
        const purchaseCostWon = shortageG > 0 && meta?.pricePerG !== null && meta?.pricePerG !== undefined
          ? shortageG * meta.pricePerG
          : null
        return {
          material_id: materialId,
          material_name: meta?.name || materialId,
          current_stock_g: Math.round(currentStockG),
          required_g: Math.round(usage.requiredG),
          shortage_g: Math.round(shortageG),
          first_shortage_date: usage.firstShortageDate,
          purchase_cost_won: purchaseCostWon === null ? null : Math.round(purchaseCostWon),
        }
      })
      .filter((row) => row.shortage_g > 0)
      .sort((a, b) => {
        const dateCompare = text(a.first_shortage_date).localeCompare(text(b.first_shortage_date))
        if (dateCompare !== 0) return dateCompare
        return b.shortage_g - a.shortage_g
      })

    const shortageKnownCostWon = shortages.reduce((sum, row) => sum + (row.purchase_cost_won ?? 0), 0)
    const shortageUnpricedCount = shortages.filter((row) => row.purchase_cost_won === null).length

    const currentWorkOrderMatchKeys = new Set(
      records.map((row) => `${text(row.work_date)}::${text(row.product_id) || text(row.product_name)}`),
    )
    const unconvertedExpectedPlans = expectedPlans.filter((plan) => {
      const key = `${text(plan.plan_date)}::${text(plan.product_id) || text(plan.product_name)}`
      return !currentWorkOrderMatchKeys.has(key)
    })

    const productionDaily = dateRange(currentMonthStart, currentMonthEnd)
    let cumulativePlanned = 0
    let cumulativeActual = 0
    const productionTrend = productionDaily.map((date) => {
      const dayRecords = currentMonthRecords.filter((row) => text(row.work_date) === date)
      cumulativePlanned += dayRecords.reduce((sum, row) => sum + Math.max(0, numberValue(row.planned_quantity_g)), 0)
      cumulativeActual += dayRecords.reduce((sum, row) => sum + Math.max(0, numberValue(row.actual_quantity_g)), 0)
      return {
        date,
        planned_cumulative_g: Math.round(cumulativePlanned),
        actual_cumulative_g: Math.round(cumulativeActual),
        is_future: date > today,
      }
    })

    const costTrend = productionDaily.map((date) => ({
      date,
      known_input_cost_won: Math.round(dailyKnownCost.get(date) ?? 0),
      known_loss_cost_won: Math.round(dailyKnownLossCost.get(date) ?? 0),
      is_future: date > today,
    }))

    const productLoss = Array.from(productLossMap.values())
      .map((row) => ({
        ...row,
        planned_g: Math.round(row.planned_g),
        actual_g: Math.round(row.actual_g),
        loss_g: Math.round(row.loss_g),
        loss_rate: row.planned_g > 0 ? Number(((row.loss_g / row.planned_g) * 100).toFixed(2)) : 0,
        known_loss_cost_won: Math.round(row.known_loss_cost_won),
      }))
      .filter((row) => row.loss_g > 0)
      .sort((a, b) => b.loss_rate - a.loss_rate || b.loss_g - a.loss_g)
      .slice(0, 5)

    const alerts: DashboardAlert[] = []
    if (overdueRecords.length > 0) {
      const oldest = [...overdueRecords].sort((a, b) => text(a.work_date).localeCompare(text(b.work_date)))[0]
      alerts.push({
        id: 'overdue-work-orders',
        severity: 'danger',
        title: `기한이 지난 작업지시 ${overdueRecords.length}건`,
        detail: `가장 오래된 항목: ${text(oldest.work_date)} · ${text(oldest.product_name) || '제품명 확인 필요'}`,
        metric: `${overdueRecords.length}건`,
      })
    }

    shortages.slice(0, 2).forEach((row, index) => {
      alerts.push({
        id: `shortage-${index}-${row.material_id}`,
        severity: 'danger',
        title: `${row.first_shortage_date || '향후 14일'} 원재료 부족 예상`,
        detail: `${row.material_name} ${formatKgCompact(row.shortage_g)} 부족`,
        metric: row.purchase_cost_won === null ? '단가 확인 필요' : formatWon(row.purchase_cost_won),
      })
    })

    if (futureRecipeIssues.size > 0) {
      alerts.push({
        id: 'future-recipe-issues',
        severity: 'danger',
        title: `향후 작업지시 레시피 확인 필요 ${futureRecipeIssues.size}건`,
        detail: Array.from(futureRecipeIssues).slice(0, 2).join(' / '),
      })
    }

    if (unconvertedExpectedPlans.length > 0) {
      const first = unconvertedExpectedPlans[0]
      alerts.push({
        id: 'unconverted-expected-plans',
        severity: 'warning',
        title: `7일 내 예상계획 미전환 ${unconvertedExpectedPlans.length}건`,
        detail: `가장 가까운 계획: ${text(first.plan_date)} · ${text(first.product_name) || '제품명 확인 필요'}`,
        metric: `${unconvertedExpectedPlans.length}건`,
      })
    }

    if (unpricedUsedMaterialNames.size > 0) {
      alerts.push({
        id: 'missing-prices',
        severity: 'warning',
        title: `생산 사용 원재료 단가 미등록 ${unpricedUsedMaterialNames.size}종`,
        detail: '금액 지표는 단가가 확인된 원재료만 집계합니다. 원재료관리에서 포장단가를 등록해야 전체 원가가 계산됩니다.',
        metric: `${unpricedUsedMaterialNames.size}종`,
      })
    }

    const highestLossProduct = productLoss[0]
    if (highestLossProduct && highestLossProduct.loss_rate >= 2) {
      alerts.push({
        id: 'high-loss-product',
        severity: 'warning',
        title: `${highestLossProduct.product_name} 로스율 확인 필요`,
        detail: `이번 달 계획량 대비 로스 ${formatKgCompact(highestLossProduct.loss_g)}`,
        metric: `${highestLossProduct.loss_rate.toFixed(2)}%`,
      })
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'no-critical-alert',
        severity: 'success',
        title: '현재 즉시 조치가 필요한 생산 위험이 없습니다.',
        detail: '작업지시, 원재료 재고, 생산 로스 기준으로 확인했습니다.',
      })
    }

    const knownInputCostWon = Array.from(dailyKnownCost.values()).reduce((sum, value) => sum + value, 0)

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      period: {
        today,
        month: today.slice(0, 7),
        month_start: currentMonthStart,
        month_end: currentMonthEnd,
        future_end: futureEnd,
      },
      kpis: {
        production: {
          planned_due_g: Math.round(plannedDueG),
          actual_g: Math.round(actualDueG),
          attainment_rate: plannedDueG > 0 ? Number(((actualDueG / plannedDueG) * 100).toFixed(1)) : 0,
          month_total_planned_g: Math.round(monthTotalPlannedG),
          overdue_work_orders: overdueRecords.length,
        },
        loss: {
          completed_planned_g: Math.round(completedPlannedG),
          loss_g: Math.round(currentLossG),
          loss_rate: Number(currentLossRate.toFixed(2)),
          previous_loss_rate: Number(previousLossRate.toFixed(2)),
          change_pp: Number((currentLossRate - previousLossRate).toFixed(2)),
          known_loss_cost_won: Math.round(knownLossCostWon),
          incomplete_price_records: recordsWithIncompleteLossPrice,
        },
        risk: {
          upcoming_work_orders: upcomingRecords.length,
          risk_work_orders: riskWorkOrderCount,
          shortage_materials: shortages.length,
          known_purchase_cost_won: Math.round(shortageKnownCostWon),
          unpriced_shortage_materials: shortageUnpricedCount,
          recipe_issue_count: futureRecipeIssues.size,
        },
      },
      pricing: {
        basis: '현재 등록 포장단가 기준',
        used_material_count: usedMaterialNames.size,
        unpriced_used_material_count: unpricedUsedMaterialNames.size,
        known_input_cost_won: Math.round(knownInputCostWon),
      },
      trends: {
        production: productionTrend,
        cost: costTrend,
      },
      product_loss: productLoss,
      shortages: shortages.slice(0, 10),
      alerts: alerts.slice(0, 6),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '생산 대시보드 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
