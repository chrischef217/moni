import { NextRequest, NextResponse } from 'next/server'
import { buildSububuReport } from '@/lib/moni/sububu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const report = await buildSububuReport({
      from: request.nextUrl.searchParams.get('from'),
      to: request.nextUrl.searchParams.get('to'),
      materialName: request.nextUrl.searchParams.get('material_name'),
    })

    return NextResponse.json(report, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '수불부 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
