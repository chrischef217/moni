import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok:false, error:'관리자 권한이 필요합니다.' }, { status:403 })
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok:false, error:'판매건 ID가 필요합니다.' }, { status:400 })
    const db = createMoniServiceRoleClient()
    const orderResult = await db.from('sales_orders').select('*').eq('id', id).eq('business_id', BUSINESS_ID).single()
    if (orderResult.error) return NextResponse.json({ ok:false, error:'판매건을 찾을 수 없습니다.' }, { status:404 })
    const order = orderResult.data
    if (text(order.status) === 'cancelled') return NextResponse.json({ ok:false, error:'취소된 판매건은 거래명세표를 출력할 수 없습니다.' }, { status:400 })
    if (text(order.source_type).toUpperCase() === 'EXPORT') return NextResponse.json({ ok:false, error:'수출 판매건은 수출 거래명세표 경로를 사용해 주세요.' }, { status:400 })

    const [itemsResult, clientResult, profileResult, receiptResult] = await Promise.all([
      db.from('sales_order_items').select('*').eq('order_id', id).order('sort_order').order('created_at'),
      order.client_id ? db.from('sales_clients').select('*').eq('id', order.client_id).eq('business_id', BUSINESS_ID).maybeSingle() : Promise.resolve({ data:null, error:null }),
      db.from('company_profile').select('*').eq('id','default').maybeSingle(),
      db.from('sales_receipts').select('*').eq('business_id', BUSINESS_ID).eq('order_id', id).eq('status','posted').order('receipt_date').order('created_at'),
    ])
    if (itemsResult.error) throw new Error(itemsResult.error.message)
    if (clientResult.error) throw new Error(clientResult.error.message)
    if (profileResult.error) throw new Error(profileResult.error.message)
    if (receiptResult.error) throw new Error(receiptResult.error.message)

    let previousBalance = 0
    if (order.client_id) {
      const priorOrdersResult = await db.from('sales_orders').select('id,total_amount,sale_date,created_at,status').eq('business_id', BUSINESS_ID).eq('client_id', order.client_id).neq('status','cancelled').lte('sale_date', order.sale_date).order('sale_date').order('created_at')
      if (priorOrdersResult.error) throw new Error(priorOrdersResult.error.message)
      const priorOrders = (priorOrdersResult.data ?? []).filter((row) => {
        if (text(row.id) === id) return false
        if (text(row.sale_date) < text(order.sale_date)) return true
        return text(row.created_at) < text(order.created_at)
      })
      const priorIds = priorOrders.map((row) => text(row.id)).filter(Boolean)
      const priorReceiptsResult = priorIds.length ? await db.from('sales_receipts').select('amount').eq('business_id', BUSINESS_ID).in('order_id', priorIds).eq('status','posted') : { data:[], error:null }
      if (priorReceiptsResult.error) throw new Error(priorReceiptsResult.error.message)
      previousBalance = money(priorOrders.reduce((sum,row)=>sum+num(row.total_amount),0) - (priorReceiptsResult.data ?? []).reduce((sum,row)=>sum+num(row.amount),0))
    }
    const received = money((receiptResult.data ?? []).reduce((sum,row)=>sum+num(row.amount),0))
    const currentBalance = money(previousBalance + num(order.total_amount) - received)

    return NextResponse.json({
      ok:true,
      order,
      items:itemsResult.data ?? [],
      client:clientResult.data ?? { company_name: text(order.manual_client_name) || '거래처' },
      company_profile:profileResult.data ?? null,
      receipts:receiptResult.data ?? [],
      balances:{ previous:previousBalance, received, current:currentBalance },
    })
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : '거래명세표 데이터를 불러오지 못했습니다.' }, { status:500 })
  }
}
