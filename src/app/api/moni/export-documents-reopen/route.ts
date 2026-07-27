import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown) => String(value ?? '').trim()

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const id = text(body?.id)
    if (!id) return NextResponse.json({ ok: false, error: '수정할 수출서류 ID가 필요합니다.' }, { status: 400 })

    const client = createMoniServiceRoleClient()
    const current = await client
      .from('export_documents')
      .select('id,status,sales_order_id,invoice_no')
      .eq('id', id)
      .maybeSingle()

    if (current.error) throw new Error(current.error.message)
    if (!current.data) return NextResponse.json({ ok: false, error: '수출서류를 찾을 수 없습니다.' }, { status: 404 })
    if (current.data.status === 'SHIPPED') {
      return NextResponse.json({ ok: false, error: '출고확정된 서류는 먼저 출고취소 후 수정해 주세요.' }, { status: 400 })
    }
    if (current.data.status !== 'CANCELLED') {
      return NextResponse.json({ ok: true, reopened: false })
    }

    const orderId = text(current.data.sales_order_id)
    if (orderId) {
      const receipts = await client
        .from('sales_receipts')
        .select('amount')
        .eq('order_id', orderId)
        .eq('status', 'posted')
      if (receipts.error) throw new Error(receipts.error.message)
      const postedAmount = (receipts.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
      if (postedAmount > 0) {
        return NextResponse.json({ ok: false, error: '연결된 판매건에 실제 입금이 있어 수출서류를 재수정할 수 없습니다. 판매관리에서 입금을 먼저 취소해 주세요.' }, { status: 400 })
      }

      const order = await client
        .from('sales_orders')
        .select('id,note')
        .eq('id', orderId)
        .eq('business_id', BUSINESS_ID)
        .maybeSingle()
      if (order.error) throw new Error(order.error.message)
      if (order.data) {
        const detachedReference = `CANCELLED:${id}:${orderId}`
        const note = [text(order.data.note), `수출서류 재수정으로 기존 연결 해제 · Invoice ${text(current.data.invoice_no)}`]
          .filter(Boolean)
          .join(' / ')
        const detached = await client
          .from('sales_orders')
          .update({ source_reference: detachedReference, status: 'cancelled', note, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('business_id', BUSINESS_ID)
        if (detached.error) throw new Error(detached.error.message)
      }
    }

    const reopened = await client
      .from('export_documents')
      .update({ status: 'GENERATED', shipped_at: null, sales_order_id: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'CANCELLED')
      .select('id,status')
      .single()

    if (reopened.error) throw new Error(reopened.error.message)
    return NextResponse.json({ ok: true, reopened: true, document: reopened.data })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '취소된 수출서류를 수정 상태로 전환하지 못했습니다.',
    }, { status: 500 })
  }
}
