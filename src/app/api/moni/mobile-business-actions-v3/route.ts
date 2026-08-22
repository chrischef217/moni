import { NextRequest, NextResponse } from 'next/server'
import { GET as salesAwareGET, POST as salesAwarePOST } from '../mobile-business-actions-v2/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const response = await salesAwareGET(request)
  if (!response.ok) return response
  const payload = await response.json().catch(() => null) as Record<string, any> | null
  if (!payload) return NextResponse.json({ ok: false, error: '모바일 업무카드 응답을 읽지 못했습니다.' }, { status: 500 })
  if (payload?.card?.domain === 'sales_export_bundle') payload.card = null
  return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  return salesAwarePOST(request)
}
