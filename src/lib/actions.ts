import { supabase } from './supabase'
import type { Transaction, InventoryLog } from '@/types'

// ── 원료 입고 ──────────────────────────────────────────────────
export async function saveRawInbound(data: {
  item_name: string
  item_code?: string | null
  quantity_g: number
  unit_price?: number | null
  supplier?: string | null
  txn_date: string
}): Promise<{ ok: boolean; error?: string }> {
  const id = `TXN-${Date.now()}`

  // 수불 내역 insert
  const { error: txnErr } = await supabase
    .from('raw_material_transactions')
    .insert({
      id,
      item_code: data.item_code ?? id,
      item_name: data.item_name,
      txn_type: 'INBOUND',
      quantity_g: data.quantity_g,
      unit_price: data.unit_price ?? 0,
      supplier: data.supplier ?? '',
      txn_date: data.txn_date,
      business_id: 'default',
    })

  if (txnErr) return { ok: false, error: txnErr.message }

  // 재고 업데이트: 있으면 +, 없으면 신규 생성
  const { data: existing } = await supabase
    .from('raw_materials')
    .select('id, current_stock_g')
    .eq('item_name', data.item_name)
    .eq('business_id', 'default')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('raw_materials')
      .update({ current_stock_g: (existing.current_stock_g ?? 0) + data.quantity_g })
      .eq('id', existing.id)
  } else {
    const newId = data.item_code ?? `ITEM-${Date.now()}`
    await supabase.from('raw_materials').insert({
      id: newId,
      item_name: data.item_name,
      item_code: newId,
      current_stock_g: data.quantity_g,
      supplier: data.supplier ?? '',
      is_active: true,
      business_id: 'default',
    })
  }

  return { ok: true }
}

// ── 원료 출고 ──────────────────────────────────────────────────
export async function saveRawOutbound(data: {
  item_name: string
  item_code?: string | null
  quantity_g: number
  note?: string | null
  txn_date: string
}): Promise<{ ok: boolean; warning?: string; error?: string }> {
  // 현재 재고 확인
  const { data: mat } = await supabase
    .from('raw_materials')
    .select('id, current_stock_g')
    .eq('item_name', data.item_name)
    .eq('business_id', 'default')
    .maybeSingle()

  const currentStock = mat?.current_stock_g ?? 0
  let warning: string | undefined

  if (currentStock < data.quantity_g) {
    warning = `⚠️ ${data.item_name} 재고가 부족합니다 (현재: ${currentStock.toLocaleString()}g, 출고요청: ${data.quantity_g.toLocaleString()}g)`
  }

  const id = `TXN-${Date.now()}`
  const { error: txnErr } = await supabase
    .from('raw_material_transactions')
    .insert({
      id,
      item_code: data.item_code ?? mat?.id ?? id,
      item_name: data.item_name,
      txn_type: 'OUTBOUND',
      quantity_g: data.quantity_g,
      note: data.note ?? '',
      txn_date: data.txn_date,
      business_id: 'default',
    })

  if (txnErr) return { ok: false, error: txnErr.message }

  // 재고 차감 (0 미만 방지)
  if (mat) {
    await supabase
      .from('raw_materials')
      .update({ current_stock_g: Math.max(0, currentStock - data.quantity_g) })
      .eq('id', mat.id)
  }

  return { ok: true, warning }
}

// ── 포장재 입고 ────────────────────────────────────────────────
export async function savePkgInbound(data: {
  material_name: string
  material_code?: string | null
  quantity: number
  unit_price?: number | null
  txn_date: string
}): Promise<{ ok: boolean; error?: string }> {
  const id = `PKG-TXN-${Date.now()}`

  const { error: txnErr } = await supabase
    .from('packaging_transactions')
    .insert({
      id,
      material_code: data.material_code ?? id,
      txn_type: 'INBOUND',
      quantity: data.quantity,
      txn_date: data.txn_date,
      business_id: 'default',
    })

  if (txnErr) return { ok: false, error: txnErr.message }

  // 재고 업데이트: 있으면 +, 없으면 신규 생성
  const { data: existing } = await supabase
    .from('packaging_materials')
    .select('id, current_stock')
    .eq('material_name', data.material_name)
    .eq('business_id', 'default')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('packaging_materials')
      .update({ current_stock: (existing.current_stock ?? 0) + data.quantity })
      .eq('id', existing.id)
  } else {
    const newId = data.material_code ?? `PKG-${Date.now()}`
    await supabase.from('packaging_materials').insert({
      id: newId,
      material_name: data.material_name,
      material_code: newId,
      unit_price: data.unit_price ?? 0,
      current_stock: data.quantity,
      is_active: true,
      business_id: 'default',
    })
  }

  return { ok: true }
}

// ── 포장재 출고 ────────────────────────────────────────────────
export async function savePkgOutbound(data: {
  material_name: string
  material_code?: string | null
  quantity: number
  note?: string | null
  txn_date: string
}): Promise<{ ok: boolean; warning?: string; error?: string }> {
  const { data: mat } = await supabase
    .from('packaging_materials')
    .select('id, current_stock')
    .eq('material_name', data.material_name)
    .eq('business_id', 'default')
    .maybeSingle()

  const currentStock = mat?.current_stock ?? 0
  let warning: string | undefined

  if (currentStock < data.quantity) {
    warning = `⚠️ ${data.material_name} 포장재 재고가 부족합니다 (현재: ${currentStock}개, 출고요청: ${data.quantity}개)`
  }

  const id = `PKG-TXN-${Date.now()}`
  const { error: txnErr } = await supabase
    .from('packaging_transactions')
    .insert({
      id,
      material_code: data.material_code ?? mat?.id ?? id,
      txn_type: 'OUTBOUND',
      quantity: data.quantity,
      note: data.note ?? '',
      txn_date: data.txn_date,
      business_id: 'default',
    })

  if (txnErr) return { ok: false, error: txnErr.message }

  if (mat) {
    await supabase
      .from('packaging_materials')
      .update({ current_stock: Math.max(0, currentStock - data.quantity) })
      .eq('id', mat.id)
  }

  return { ok: true, warning }
}

// ── 재고 조회 ──────────────────────────────────────────────────
export async function queryStock(
  type: 'raw' | 'packaging',
  item_name?: string | null
) {
  if (type === 'raw') {
    let q = supabase
      .from('raw_materials')
      .select('item_name, item_code, supplier, current_stock_g')
      .eq('business_id', 'default')
      .eq('is_active', true)
      .order('item_name')

    if (item_name) q = q.ilike('item_name', `%${item_name}%`)
    const { data } = await q
    return data ?? []
  } else {
    let q = supabase
      .from('packaging_materials')
      .select('material_name, material_code, spec, current_stock, unit_price')
      .eq('business_id', 'default')
      .eq('is_active', true)
      .order('material_name')

    if (item_name) q = q.ilike('material_name', `%${item_name}%`)
    const { data } = await q
    return data ?? []
  }
}

/**
 * AI 응답 텍스트에서 [ACTION:...] 블록을 파싱하여 DB에 저장
 */
export async function parseAndExecuteActions(text: string): Promise<{
  savedTransaction?: Transaction
  savedInventory?: InventoryLog
  savedProduction?: Record<string, unknown>
  savedRawInbound?: Record<string, unknown>
  savedRawOutbound?: Record<string, unknown>
  savedPkgInbound?: Record<string, unknown>
  savedPkgOutbound?: Record<string, unknown>
  savedPlanned?: Record<string, unknown>
  stockWarning?: string
}> {
  const result: {
    savedTransaction?: Transaction
    savedInventory?: InventoryLog
    savedProduction?: Record<string, unknown>
    savedRawInbound?: Record<string, unknown>
    savedRawOutbound?: Record<string, unknown>
    savedPkgInbound?: Record<string, unknown>
    savedPkgOutbound?: Record<string, unknown>
    savedPlanned?: Record<string, unknown>
    stockWarning?: string
  } = {}

  // ── 기존: 거래 내역 ───────────────────────────────────────
  const transactionMatch = text.match(/\[ACTION:SAVE_TRANSACTION\]([\s\S]*?)\[\/ACTION\]/)
  if (transactionMatch) {
    try {
      const data: Transaction = JSON.parse(transactionMatch[1].trim())
      const { data: saved, error } = await supabase
        .from('transactions')
        .insert({ ...data, business_id: 'default' })
        .select()
        .single()
      if (!error) result.savedTransaction = saved
    } catch (e) { console.error('SAVE_TRANSACTION 파싱 오류:', e) }
  }

  // ── 기존: 재고 내역 ───────────────────────────────────────
  const inventoryMatch = text.match(/\[ACTION:SAVE_INVENTORY\]([\s\S]*?)\[\/ACTION\]/)
  if (inventoryMatch) {
    try {
      const data: InventoryLog = JSON.parse(inventoryMatch[1].trim())
      const { data: saved, error } = await supabase
        .from('inventory_logs')
        .insert({ ...data, business_id: 'default' })
        .select()
        .single()
      if (!error) result.savedInventory = saved
    } catch (e) { console.error('SAVE_INVENTORY 파싱 오류:', e) }
  }

  // ── Sprint 2: 생산 실적 ───────────────────────────────────
  const productionMatch = text.match(/\[ACTION:SAVE_PRODUCTION\]([\s\S]*?)\[\/ACTION\]/)
  if (productionMatch) {
    try {
      const data = JSON.parse(productionMatch[1].trim())
      const { data: saved, error } = await supabase
        .from('productions')
        .insert({ id: `PROD-${Date.now()}`, ...data, business_id: 'default' })
        .select()
        .single()
      if (!error) result.savedProduction = saved
    } catch (e) { console.error('SAVE_PRODUCTION 파싱 오류:', e) }
  }

  // ── Sprint 2/3: 원료 입고 ─────────────────────────────────
  const rawInboundMatch = text.match(/\[ACTION:SAVE_RAW_INBOUND\]([\s\S]*?)\[\/ACTION\]/)
  if (rawInboundMatch) {
    try {
      const data = JSON.parse(rawInboundMatch[1].trim())
      const res = await saveRawInbound(data)
      if (res.ok) result.savedRawInbound = data
      else console.error('원료 입고 오류:', res.error)
    } catch (e) { console.error('SAVE_RAW_INBOUND 파싱 오류:', e) }
  }

  // ── Sprint 2/3: 원료 출고 ─────────────────────────────────
  const rawOutboundMatch = text.match(/\[ACTION:SAVE_RAW_OUTBOUND\]([\s\S]*?)\[\/ACTION\]/)
  if (rawOutboundMatch) {
    try {
      const data = JSON.parse(rawOutboundMatch[1].trim())
      const res = await saveRawOutbound(data)
      if (res.ok) {
        result.savedRawOutbound = data
        if (res.warning) result.stockWarning = res.warning
      } else console.error('원료 출고 오류:', res.error)
    } catch (e) { console.error('SAVE_RAW_OUTBOUND 파싱 오류:', e) }
  }

  // ── Sprint 3: 포장재 입고 ─────────────────────────────────
  const pkgInboundMatch = text.match(/\[ACTION:SAVE_PKG_INBOUND\]([\s\S]*?)\[\/ACTION\]/)
  if (pkgInboundMatch) {
    try {
      const data = JSON.parse(pkgInboundMatch[1].trim())
      const res = await savePkgInbound(data)
      if (res.ok) result.savedPkgInbound = data
      else console.error('포장재 입고 오류:', res.error)
    } catch (e) { console.error('SAVE_PKG_INBOUND 파싱 오류:', e) }
  }

  // ── Sprint 3: 포장재 출고 ─────────────────────────────────
  const pkgOutboundMatch = text.match(/\[ACTION:SAVE_PKG_OUTBOUND\]([\s\S]*?)\[\/ACTION\]/)
  if (pkgOutboundMatch) {
    try {
      const data = JSON.parse(pkgOutboundMatch[1].trim())
      const res = await savePkgOutbound(data)
      if (res.ok) {
        result.savedPkgOutbound = data
        if (res.warning) result.stockWarning = res.warning
      } else console.error('포장재 출고 오류:', res.error)
    } catch (e) { console.error('SAVE_PKG_OUTBOUND 파싱 오류:', e) }
  }

  // ── Sprint 2: 생산 예정 ───────────────────────────────────
  const plannedMatch = text.match(/\[ACTION:SAVE_PLANNED\]([\s\S]*?)\[\/ACTION\]/)
  if (plannedMatch) {
    try {
      const data = JSON.parse(plannedMatch[1].trim())
      const { data: saved, error } = await supabase
        .from('planned_productions')
        .insert({ id: `PLAN-${Date.now()}`, ...data, status: 'pending', business_id: 'default' })
        .select()
        .single()
      if (!error) result.savedPlanned = saved
    } catch (e) { console.error('SAVE_PLANNED 파싱 오류:', e) }
  }

  return result
}

/**
 * 현재 달 거래 내역 조회
 */
export async function getMonthlyTransactions() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('business_id', 'default')
    .gte('created_at', startOfMonth)
    .lte('created_at', endOfMonth)
    .order('created_at', { ascending: true })

  if (error) { console.error('거래 내역 조회 오류:', error); return [] }
  return data ?? []
}

/**
 * 현재 달 생산 실적 조회
 */
export async function getMonthlyProductions() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('productions')
    .select('*')
    .eq('business_id', 'default')
    .gte('work_date', startOfMonth)
    .order('work_date', { ascending: false })

  if (error) { console.error('생산 실적 조회 오류:', error); return [] }
  return data ?? []
}

/**
 * 원료 재고 현황 조회
 */
export async function getRawMaterialStock() {
  const { data, error } = await supabase
    .from('raw_materials')
    .select('*')
    .eq('business_id', 'default')
    .eq('is_active', true)
    .order('item_name', { ascending: true })

  if (error) { console.error('원료 재고 조회 오류:', error); return [] }
  return data ?? []
}

/**
 * 포장재 현황 조회
 */
export async function getPackagingStock() {
  const { data, error } = await supabase
    .from('packaging_materials')
    .select('*')
    .eq('business_id', 'default')
    .eq('is_active', true)
    .order('material_name', { ascending: true })

  if (error) { console.error('포장재 재고 조회 오류:', error); return [] }
  return data ?? []
}

/**
 * 재고 현황 조회 (뷰 사용)
 */
export async function getInventorySummary() {
  const { data, error } = await supabase.from('inventory_summary').select('*')
  if (error) { console.error('재고 현황 조회 오류:', error); return [] }
  return data ?? []
}

/**
 * 숫자를 한국식 콤마 형식으로 변환
 */
export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원'
}
