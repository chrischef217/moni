import { NextResponse } from 'next/server'
import { getMfdsConfigPreview, pingMfdsApi } from '@/lib/mfds_api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = getMfdsConfigPreview()
    const ping = await pingMfdsApi()

    return NextResponse.json(
      {
        ok: ping.ok,
        config,
        ping,
      },
      { status: ping.ok ? 200 : 502 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MFDS 테스트 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

