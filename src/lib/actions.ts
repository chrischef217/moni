import { supabase } from './supabase'
import type { Transaction, InventoryLog } from '@/types'

/**
 * AI 응답 텍스트에서 [ACTION:...] 블록을 파싱하여 DB에 저장
 */
export async function parseAndExecuteActions(text: string): Promise<{
  savedTransaction?: Transaction
  savedInventory?: InventoryLog
}> {
  const result: { savedTransaction?: Transaction; savedInventory?: InventoryLog } = {}

  // 거래 내역 저장 파싱
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

  // 재고 내역 저장 파싱
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
