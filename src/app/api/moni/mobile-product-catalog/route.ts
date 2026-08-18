import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const BUSINESS_ID = '20220523011'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만 조회할 수 있습니다.' }, { status: 403 })
  try {
    const db = createMoniServiceRoleClient()
    const result = await db.from('products').select('id,product_name,product_code,weight_g,product_type,is_active,business_id').eq('business_id', BUSINESS_ID).eq('is_active', true).order('product_name')
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true, products: result.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '제품 목록을 조회하지 못했습니다.' }, { status: 500 })
  }
}
