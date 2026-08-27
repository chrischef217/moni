import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionFromRequest(request)
    if (!user) {
      return NextResponse.json({ ok: false, error: '로그인 세션이 없습니다.' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, user }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : '세션 확인 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
