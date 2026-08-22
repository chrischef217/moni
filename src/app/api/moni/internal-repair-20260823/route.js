import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_HASH = 'f45d44e270353ec071010efa67a99533ec2ba7a7d0ba116d63df918ca3f4ce06'
const BUSINESS_ID = '20220523011'

const FIXES = [
  { product_id: 'PROD-0095', plan_date: '2026-08-03', before: 714750000, after: 714750, product_name: '닭나무집 닭육수농축액' },
  { product_id: 'PROD-0125', plan_date: '2026-08-03', before: 360988000, after: 360988, product_name: '춘소스' },
  { product_id: 'PROD-0089', plan_date: '2026-08-11', before: 621451000, after: 621451, product_name: '닭나무집 초계소스' },
  { product_id: 'PROD-0097', plan_date: '2026-08-12', before: 311367000, after: 311367, product_name: '춘 과일샐러드소스' },
  { product_id: 'PROD-0131', plan_date: '2026-08-14', before: 55555000, after: 55555, product_name: '지미부스터' },
]

function authorized(request) {
  const token = String(request.nextUrl.searchParams.get('token') || '')
  if (!token) return false
  return createHash('sha256').update(token).digest('hex') === TOKEN_HASH
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const db = createMoniServiceRoleClient()
  const beforeRows = []

  for (const fix of FIXES) {
    const { data, error } = await db
      .from('monthly_production_plans')
      .select('id,plan_date,product_id,product_name,planned_quantity_g,note,updated_at,business_id')
      .eq('business_id', BUSINESS_ID)
      .eq('product_id', fix.product_id)
      .eq('plan_date', fix.plan_date)
      .eq('planned_quantity_g', fix.before)

    if (error) {
      return NextResponse.json({ ok: false, stage: 'precheck', error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
    if (!data || data.length !== 1) {
      return NextResponse.json({ ok: false, stage: 'precheck', error: 'approved row mismatch', fix, matches: data?.length ?? 0 }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    beforeRows.push(data[0])
  }

  const afterRows = []
  for (const fix of FIXES) {
    const { data, error } = await db
      .from('monthly_production_plans')
      .update({ planned_quantity_g: fix.after, updated_at: new Date().toISOString() })
      .eq('business_id', BUSINESS_ID)
      .eq('product_id', fix.product_id)
      .eq('plan_date', fix.plan_date)
      .eq('planned_quantity_g', fix.before)
      .select('id,plan_date,product_id,product_name,planned_quantity_g,note,updated_at,business_id')

    if (error) {
      return NextResponse.json({ ok: false, stage: 'update', error: error.message, fix, completed: afterRows }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
    }
    if (!data || data.length !== 1) {
      return NextResponse.json({ ok: false, stage: 'update', error: 'unexpected update count', fix, matches: data?.length ?? 0, completed: afterRows }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    afterRows.push(data[0])
  }

  return NextResponse.json({ ok: true, updated_count: afterRows.length, before: beforeRows, after: afterRows }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
