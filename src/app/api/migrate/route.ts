/**
 * Legacy DOOBAE → Supabase migration endpoint.
 * Production execution is permanently disabled. Non-production execution requires
 * a DB-backed MONI admin session and POST, never GET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { migrateDoobaeData } from '@/lib/migrate_doobae'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function productionDisabled() {
  return process.env.VERCEL_ENV === 'production'
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Legacy migration endpoint does not support GET.' },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  if (productionDisabled()) {
    return NextResponse.json(
      { success: false, error: 'Legacy migration execution is disabled in production.' },
      { status: 410, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, error: 'MONI 로그인이 필요합니다.' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ success: false, error: '관리자만 실행할 수 있습니다.' }, { status: 403 })
  }

  try {
    const result = await migrateDoobaeData()
    return NextResponse.json({
      success: result.errors.length === 0,
      message: result.errors.length === 0 ? 'DOOBAE 데이터 이전 완료' : '일부 오류가 발생했습니다.',
      counts: {
        products: result.products,
        raw_materials: result.raw_materials,
        productions: result.productions,
        packaging_materials: result.packaging_materials,
      },
      errors: result.errors,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('마이그레이션 오류:', error)
    return NextResponse.json(
      { success: false, message: '마이그레이션 중 오류 발생' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
