import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '../sales-orders-v4/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text = (value: unknown) => String(value ?? '').trim().toUpperCase()

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  if (!response.ok) return response
  const payload = await response.json() as any
  if (!payload?.ok || !Array.isArray(payload.orders)) {
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  }

  // RETURN/CREDIT vouchers are intentionally managed only in the dedicated
  // return/credit surface. Their negative amounts still remain in the legacy
  // summary calculation, so monthly net sales continues to reflect them.
  payload.orders = payload.orders.filter((row: any) => !['RETURN', 'CREDIT'].includes(text(row?.source_type)))

  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}

export const POST = legacyPOST
