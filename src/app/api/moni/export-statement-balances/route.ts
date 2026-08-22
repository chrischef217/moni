import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const documentId = text(request.nextUrl.searchParams.get('id'))
    if (!documentId) {
      return NextResponse.json({ ok: false, error: '수출서류 ID가 필요합니다.' }, { status: 400 })
    }

    const db = createMoniServiceRoleClient()
    const documentResult = await db.from('export_documents')
      .select('id,sales_order_id')
      .eq('id', documentId)
      .maybeSingle()
    if (documentResult.error) throw new Error(documentResult.error.message)
    if (!documentResult.data) {
      return NextResponse.json({ ok: false, error: '수출서류를 찾을 수 없습니다.' }, { status: 404 })
    }

    const orderId = text(documentResult.data.sales_order_id)
    if (!orderId) {
      return NextResponse.json({ ok: true, balances: { previous: 0, received: 0, current: 0 }, currency: 'KRW' })
    }

    const orderResult = await db.from('sales_orders')
      .select('id,client_id,total_amount,sale_date,created_at,status,currency')
      .eq('id', orderId)
      .eq('business_id', BUSINESS_ID)
      .maybeSingle()
    if (orderResult.error) throw new Error(orderResult.error.message)
    if (!orderResult.data) {
      return NextResponse.json({ ok: false, error: '연결된 판매건을 찾을 수 없습니다.' }, { status: 404 })
    }

    const order = orderResult.data
    const currency = text(order.currency).toUpperCase() || 'KRW'
    let previousBalance = 0

    if (order.client_id) {
      let priorQuery = db.from('sales_orders')
        .select('id,total_amount,sale_date,created_at,status,currency')
        .eq('business_id', BUSINESS_ID)
        .eq('client_id', order.client_id)
        .neq('status', 'cancelled')
        .lte('sale_date', order.sale_date)
        .order('sale_date')
        .order('created_at')

      if (currency) priorQuery = priorQuery.eq('currency', currency)
      const priorOrdersResult = await priorQuery
      if (priorOrdersResult.error) throw new Error(priorOrdersResult.error.message)

      const priorOrders = (priorOrdersResult.data ?? []).filter((row) => {
        if (text(row.id) === orderId) return false
        if (text(row.sale_date) < text(order.sale_date)) return true
        return text(row.created_at) < text(order.created_at)
      })
      const priorIds = priorOrders.map((row) => text(row.id)).filter(Boolean)
      const priorReceiptsResult = priorIds.length
        ? await db.from('sales_receipts')
            .select('amount')
            .eq('business_id', BUSINESS_ID)
            .in('order_id', priorIds)
            .eq('status', 'posted')
        : { data: [], error: null }
      if (priorReceiptsResult.error) throw new Error(priorReceiptsResult.error.message)

      previousBalance = money(
        priorOrders.reduce((sum, row) => sum + num(row.total_amount), 0)
        - (priorReceiptsResult.data ?? []).reduce((sum, row) => sum + num(row.amount), 0),
      )
    }

    const currentReceiptsResult = await db.from('sales_receipts')
      .select('amount')
      .eq('business_id', BUSINESS_ID)
      .eq('order_id', orderId)
      .eq('status', 'posted')
    if (currentReceiptsResult.error) throw new Error(currentReceiptsResult.error.message)

    const received = money((currentReceiptsResult.data ?? []).reduce((sum, row) => sum + num(row.amount), 0))
    const currentBalance = money(previousBalance + num(order.total_amount) - received)

    return NextResponse.json({
      ok: true,
      currency,
      balances: {
        previous: previousBalance,
        received,
        current: currentBalance,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '수출 거래명세표 미수금을 계산하지 못했습니다.',
    }, { status: 500 })
  }
}
