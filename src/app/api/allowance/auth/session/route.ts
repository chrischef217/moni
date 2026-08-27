import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { SESSION_COOKIE_NAME } from '@/lib/allowance/secure-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
    const user = await getSessionFromRequest(request)
    if (!user || !rawToken) {
      return NextResponse.json({ ok: false, error: '로그인 세션이 없습니다.' }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true, user }, { status: 200 })

    // Re-issue the same token as a browser-session cookie. This upgrades
    // pre-existing 30-minute cookies after deployment and avoids fixed-time
    // expiry while MONI remains open.
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: rawToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : '세션 확인 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
