import { supabase } from './supabase'
import type { Transaction, InventoryLog } from '@/types'

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
  savedPlanned?: Record<string, unknown>
}> {
  const result: {
    savedTransaction?: Transaction
    savedInventory?: InventoryLog
    savedProduction?: Record<string, unknown>
    savedRawInbound?: Record<string, unknown>
    savedRawOutbound?: Record<string, unknown>
    savedPkgInbound?: Record<string, unknown>
    savedPlanned?: Record<string, unknown>
  } = {}

  // ── 기존: 거래 내역 저장 ──────────────────────────────────
  const transactionMatch = text.match(
    /\[ACTION:SAVE_TRANSACTION\]([\s\S]*?)\[\/ACTION\]/
  )
  if (transactionMatch) {
    try {
      const data: Transaction = JSON.parse(transactionMatch[1].trim())
      const { data: saved, error } = await supabase
        .from('transactions')
        .insert({ ...data, business_id: 'default' })
        .select()
        .single()

      if (error) {
        console.error('거래 내역 저장 오류:', error)
      } else {
        result.savedTransaction = saved
      }
    } catch (e) {
      console.error('거래 내역 JSON 파싱 오류:', e)
    }
  }

  // ── 기존: 재고 내역 저장 ──────────────────────────────────
  const inventoryMatch = text.match(
    /\[ACTION:SAVE_INVENTORY\]([\s\S]*?)\[\/ACTION\]/
  )
  if (inventoryMatch) {
    try {
      const data: InventoryLog = JSON.parse(inventoryMatch[1].trim())
      const { data: saved, error } = await supabase
        .from('inventory_logs')
        .insert({ ...data, business_id: 'default' })
        .select()
        .single()

      if (error) {
        console.error('재고 내역 저장 오류:', error)
      } else {
        result.savedInventory = saved
      }
    } catch (e) {
      console.error('재고 내역 JSON 파싱 오류:', e)
    }
  }

  // ── Sprint 2: 생산 실적 저장 ──────────────────────────────
  const productionMatch = text.match(
    /\[ACTION:SAVE_PRODUCTION\]([\s\S]*?)\[\/ACTION\]/
  )
  if (productionMatch) {
    try {
      const data = JSON.parse(productionMatch[1].trim())
      const id = `PROD-${Date.now()}`
      const { data: saved, error } = await supabase
        .from('productions')
        .insert({ id, ...data, business_id: 'default' })
        .select()
        .single()

      if (error) {
        console.error('생산 실적 저장 오류:', error)
      } else {
        result.savedProduction = saved
      }
    } catch (e) {
      console.error('생산 실적 JSON 파싱 오류:', e)
    }
  }

  // ── Sprint 2: 원료 입고 저장 + 재고 업데이트 ──────────────
  const rawInboundMatch = text.match(
    /\[ACTION:SAVE_RAW_INBOUND\]([\s\S]*?)\[\/ACTION\]/
  )
  if (rawInboundMatch) {
    try {
      const data = JSON.parse(rawInboundMatch[1].trim())
      const id = `TXN-${Date.now()}`

      // 수불 내역 insert
      const { data: saved, error } = await supabase
        .from('raw_material_transactions')
        .insert({
          id,
          item_code: data.item_code,
          item_name: data.item_name,
          txn_type: 'INBOUND',
          quantity_g: data.quantity_g,
          unit_price: data.unit_price ?? 0,
          supplier: data.supplier ?? '',
          txn_date: data.txn_date,
          business_id: 'default',
        })
        .select()
        .single()

      if (error) {
        console.error('원료 입고 저장 오류:', error)
      } else {
        result.savedRawInbound = saved

        // 재고 증가
        await supabase.rpc('increment_raw_stock', {
          p_item_code: data.item_code,
          p_quantity_g: data.quantity_g,
        }).then(({ error: rpcErr }) => {
          if (rpcErr) {
            // RPC 미존재 시 fallback: 직접 update
            supabase
              .from('raw_materials')
              .select('current_stock_g')
              .eq('item_code', data.item_code)
              .single()
              .then(({ data: mat }) => {
                if (mat) {
                  supabase
                    .from('raw_materials')
                    .update({ current_stock_g: (mat.current_stock_g ?? 0) + data.quantity_g })
                    .eq('item_code', data.item_code)
                    .then(() => {})
                }
              })
          }
        })
      }
    } catch (e) {
      console.error('원료 입고 JSON 파싱 오류:', e)
    }
  }

  // ── Sprint 2: 원료 출고 저장 + 재고 차감 ─────────────────
  const rawOutboundMatch = text.match(
    /\[ACTION:SAVE_RAW_OUTBOUND\]([\s\S]*?)\[\/ACTION\]/
  )
  if (rawOutboundMatch) {
    try {
      const data = JSON.parse(rawOutboundMatch[1].trim())
      const id = `TXN-${Date.now()}`

      const { data: saved, error } = await supabase
        .from('raw_material_transactions')
        .insert({
          id,
          item_code: data.item_code,
          item_name: data.item_name,
          txn_type: 'OUTBOUND',
          quantity_g: data.quantity_g,
          note: data.note ?? '',
          txn_date: data.txn_date,
          business_id: 'default',
        })
        .select()
        .single()

      if (error) {
        console.error('원료 출고 저장 오류:', error)
      } else {
        result.savedRawOutbound = saved

        // 재고 차감
        const { data: mat } = await supabase
          .from('raw_materials')
          .select('current_stock_g')
          .eq('item_code', data.item_code)
          .single()

        if (mat) {
          await supabase
            .from('raw_materials')
            .update({ current_stock_g: Math.max(0, (mat.current_stock_g ?? 0) - data.quantity_g) })
            .eq('item_code', data.item_code)
        }
      }
    } catch (e) {
      console.error('원료 출고 JSON 파싱 오류:', e)
    }
  }

  // ── Sprint 2: 포장재 입고 저장 + 재고 업데이트 ───────────
  const pkgInboundMatch = text.match(
    /\[ACTION:SAVE_PKG_INBOUND\]([\s\S]*?)\[\/ACTION\]/
  )
  if (pkgInboundMatch) {
    try {
      const data = JSON.parse(pkgInboundMatch[1].trim())
      const id = `PKG-TXN-${Date.now()}`

      const { data: saved, error } = await supabase
        .from('packaging_transactions')
        .insert({
          id,
          material_code: data.material_code,
          txn_type: 'INBOUND',
          quantity: data.quantity,
          txn_date: data.txn_date,
          business_id: 'default',
        })
        .select()
        .single()

      if (error) {
        console.error('포장재 입고 저장 오류:', error)
      } else {
        result.savedPkgInbound = saved

        // 재고 증가
        const { data: mat } = await supabase
          .from('packaging_materials')
          .select('current_stock')
          .eq('material_code', data.material_code)
          .single()

        if (mat) {
          await supabase
            .from('packaging_materials')
            .update({ current_stock: (mat.current_stock ?? 0) + data.quantity })
            .eq('material_code', data.material_code)
        }
      }
    } catch (e) {
      console.error('포장재 입고 JSON 파싱 오류:', e)
    }
  }

  // ── Sprint 2: 생산 예정 저장 ──────────────────────────────
  const plannedMatch = text.match(
    /\[ACTION:SAVE_PLANNED\]([\s\S]*?)\[\/ACTION\]/
  )
  if (plannedMatch) {
    try {
      const data = JSON.parse(plannedMatch[1].trim())
      const id = `PLAN-${Date.now()}`

      const { data: saved, error } = await supabase
        .from('planned_productions')
        .insert({ id, ...data, status: 'pending', business_id: 'default' })
        .select()
        .single()

      if (error) {
        console.error('생산 예정 저장 오류:', error)
      } else {
        result.savedPlanned = saved
      }
    } catch (e) {
      console.error('생산 예정 JSON 파싱 오류:', e)
    }
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

  if (error) {
    console.error('거래 내역 조회 오류:', error)
    return []
  }
  return data ?? []
}

/**
 * 현재 달 생산 실적 조회
 */
export async function getMonthlyProductions() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabase
    .from('productions')
    .select('*')
    .eq('business_id', 'default')
    .gte('work_date', startOfMonth)
    .order('work_date', { ascending: false })

  if (error) {
    console.error('생산 실적 조회 오류:', error)
    return []
  }
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

  if (error) {
    console.error('원료 재고 조회 오류:', error)
    return []
  }
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

  if (error) {
    console.error('포장재 재고 조회 오류:', error)
    return []
  }
  return data ?? []
}

/**
 * 재고 현황 조회 (뷰 사용)
 */
export async function getInventorySummary() {
  const { data, error } = await supabase
    .from('inventory_summary')
    .select('*')

  if (error) {
    console.error('재고 현황 조회 오류:', error)
    return []
  }
  return data ?? []
}

/**
 * 숫자를 한국식 콤마 형식으로 변환
 */
export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원'
}
