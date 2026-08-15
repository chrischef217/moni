import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { buildSalesStatementPdf } from '@/lib/moni/documents/simple-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const number = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function safeFilename(value: string) {
  return value.replace(/[^0-9A-Za-z_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'MONI_Sales_Statement'
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })

    const orderId = text(request.nextUrl.searchParams.get('order_id'), 80)
    if (!orderId) return NextResponse.json({ ok: false, error: '거래명세표 대상 거래가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: order, error: orderError } = await supabase.from('sales_orders')
      .select('*')
      .eq('id', orderId)
      .eq('business_id', BUSINESS_ID)
      .maybeSingle()
    if (orderError) throw new Error(orderError.message)
    if (!order) return NextResponse.json({ ok: false, error: '판매 거래를 찾을 수 없습니다.' }, { status: 404 })

    const [{ data: items, error: itemError }, { data: client, error: clientError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.from('sales_order_items').select('*').eq('order_id', orderId).order('sort_order').order('created_at'),
      order.client_id
        ? supabase.from('sales_clients').select('*').eq('id', order.client_id).eq('business_id', BUSINESS_ID).maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      supabase.from('company_profile').select('*').eq('id', 'default').maybeSingle(),
    ])
    if (itemError) throw new Error(itemError.message)
    if (clientError) throw new Error(clientError.message)
    if (profileError) throw new Error(profileError.message)

    const buyerName = text(client?.company_name) || text(order.manual_client_name) || '거래처 미확인'
    const currency = text(order.currency, 10) || text(items?.[0]?.currency, 10) || 'KRW'
    const pdf = buildSalesStatementPdf({
      statementNumber: text(order.statement_number) || text(order.id),
      saleDate: text(order.sale_date),
      supplier: {
        companyName: text(profile?.company_name_ko) || '두배',
        registrationNumber: text(profile?.business_registration_number),
        representative: text(profile?.representative_name_ko),
        address: text(profile?.address_ko),
        phone: text(profile?.company_phone),
        businessType: text(profile?.business_type),
        businessItems: text(profile?.business_items),
      },
      buyer: {
        companyName: buyerName,
        address: text(client?.address),
        phone: text(client?.phone),
      },
      currency,
      items: (items ?? []).map((item: any) => ({
        name: text(item.product_name) || text(item.product_id) || '품목',
        specification: text(item.specification),
        quantity: number(item.quantity),
        unit: text(item.unit),
        unitPrice: number(item.unit_price),
        amount: number(item.supply_amount),
      })),
      supplyAmount: number(order.supply_amount),
      vatAmount: number(order.vat_amount),
      totalAmount: number(order.total_amount),
      note: text(order.note, 4000),
    })

    const filename = `${safeFilename(text(order.statement_number) || 'MONI_Sales_Statement')}.pdf`
    return new Response(Uint8Array.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[MONI_SALES_STATEMENT_PDF_ERROR]', { message: error instanceof Error ? error.message : 'unknown statement PDF error' })
    return NextResponse.json({ ok: false, error: '거래명세표 PDF를 만들지 못했습니다.' }, { status: 500 })
  }
}
