import { NextRequest, NextResponse } from 'next/server'
import { destroyAllowanceSession, SESSION_COOKIE_NAME } from '@/lib/allowance/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
    await destroyAllowanceSession(token)

    const response = NextResponse.json({ ok: true }, { status: 200 })
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : '로그아웃 처리 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
