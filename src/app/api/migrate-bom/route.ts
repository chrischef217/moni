/**
 * Legacy DOOBAE BOM migration endpoint.
 * Production execution is permanently disabled. Non-production execution requires
 * a DB-backed MONI admin session and POST, never GET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { BOM_DATA } from '@/lib/bom_data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function productionDisabled() {
  return process.env.VERCEL_ENV === 'production'
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Legacy BOM migration endpoint does not support GET.' },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  if (productionDisabled()) {
    return NextResponse.json(
      { success: false, error: 'Legacy BOM migration execution is disabled in production.' },
      { status: 410, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ success: false, error: 'MONI 로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ success: false, error: '관리자만 실행할 수 있습니다.' }, { status: 403 })

  try {
    const supabase = createMoniServiceRoleClient()
    const rows = BOM_DATA.map((b) => ({
      id: b.id,
      product_code: b.product_code,
      product_name: b.product_name,
      raw_code: b.raw_code ?? null,
      raw_name: b.raw_name,
      ratio_percent: b.ratio_percent,
      note: b.note ?? null,
      business_id: 'default',
    }))

    const { error } = await supabase
      .from('bom_items')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      message: 'BOM 데이터 이전 완료',
      counts: {
        bom_items: rows.length,
        products: new Set(rows.map((row) => row.product_code)).size,
      },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('BOM 마이그레이션 오류:', error)
    return NextResponse.json({ success: false, error: 'BOM migration failed.' }, { status: 500 })
  }
}
