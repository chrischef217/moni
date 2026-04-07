/**
 * 매일 아침 8시 알림 Cron Job
 * GET /api/cron/morning-check
 * Vercel Cron: "0 8 * * *" (매일 오전 8시 UTC)
 * 무료 플랜은 수동 호출로 대체
 */
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { runStockAlertEngine, saveAlerts } from '@/lib/stock_alert_engine'

export async function GET() {
  const results = {
    stock_alerts: 0,
    order_reminders: 0,
    planned_productions: 0,
    due_payments: 0,
    errors: [] as string[],
  }

  try {
    // ── 1. 재고 부족 원료 체크 ────────────────────────────────
    const stockAlerts = await runStockAlertEngine()
    if (stockAlerts.length > 0) {
      await saveAlerts(stockAlerts)
      results.stock_alerts = stockAlerts.length
    }
  } catch (e) {
    results.errors.push(`재고 알림: ${String(e)}`)
  }

  try {
    // ── 2. 발주 예정 원료 리드타임 체크 ──────────────────────
    const today = new Date().toISOString().slice(0, 10)
    const threeDaysLater = new Date()
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)
    const threeDaysStr = threeDaysLater.toISOString().slice(0, 10)

    const { data: orders } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('business_id', 'default')
      .eq('status', 'ordered')
      .lte('expected_arrival_date', threeDaysStr)
      .gte('expected_arrival_date', today)

    if (orders && orders.length > 0) {
      const msgs = orders.map((o) =>
        `${o.expected_arrival_date} 입고예정: ${o.item_name} ${(o.order_quantity_g / 1000).toFixed(1)}kg`
      )
      const alertRows = msgs.map((msg) => ({
        id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        alert_type: 'delivery_reminder',
        message: msg,
        is_read: false,
        business_id: 'default',
      }))
      await supabase.from('ai_alerts').insert(alertRows)
      results.order_reminders = orders.length
    }
  } catch (e) {
    results.errors.push(`발주 리드타임: ${String(e)}`)
  }

  try {
    // ── 3. 오늘 생산 예정 확인 ────────────────────────────────
    const today = new Date().toISOString().slice(0, 10)
    const { data: planned } = await supabase
      .from('planned_productions')
      .select('*')
      .eq('business_id', 'default')
      .eq('planned_date', today)
      .eq('status', 'pending')

    if (planned && planned.length > 0) {
      const msgs = planned.map((p) =>
        `오늘 생산예정: ${p.product_name} ${(p.planned_quantity_g / 1000).toFixed(1)}kg`
      )
      const alertRows = msgs.map((msg) => ({
        id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        alert_type: 'production_reminder',
        message: msg,
        is_read: false,
        business_id: 'default',
      }))
      await supabase.from('ai_alerts').insert(alertRows)
      results.planned_productions = planned.length
    }
  } catch (e) {
    results.errors.push(`생산 예정: ${String(e)}`)
  }

  try {
    // ── 4. 이번 주 대금 정산일 확인 ──────────────────────────
    const today = new Date()
    const weekLater = new Date()
    weekLater.setDate(weekLater.getDate() + 7)

    const { data: cashFlows } = await supabase
      .from('cash_flow')
      .select('*')
      .eq('business_id', 'default')
      .gte('due_date', today.toISOString().slice(0, 10))
      .lte('due_date', weekLater.toISOString().slice(0, 10))

    if (cashFlows && cashFlows.length > 0) {
      const msgs = cashFlows.map((c) =>
        `${c.due_date} ${c.type === 'receivable' ? '수취예정' : '지불예정'}: ${c.counterpart ?? '미상'} ${c.amount.toLocaleString()}원`
      )
      const alertRows = msgs.map((msg) => ({
        id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        alert_type: 'payment_reminder',
        message: msg,
        is_read: false,
        business_id: 'default',
      }))
      await supabase.from('ai_alerts').insert(alertRows)
      results.due_payments = cashFlows.length
    }
  } catch (e) {
    results.errors.push(`대금 정산일: ${String(e)}`)
  }

  return NextResponse.json({
    success: results.errors.length === 0,
    date: new Date().toISOString().slice(0, 10),
    results,
    message: `✓ 아침 점검 완료: 재고알림 ${results.stock_alerts}건, 입고예정 ${results.order_reminders}건, 생산예정 ${results.planned_productions}건, 대금정산 ${results.due_payments}건`,
  })
}
