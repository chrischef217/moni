import { NextRequest, NextResponse } from 'next/server'
import { createAllowanceSession, SESSION_COOKIE_NAME, verifyAllowanceLogin } from '@/lib/allowance/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { loginId?: string; password?: string } | null
    const loginId = body?.loginId?.trim() ?? ''
    const password = body?.password?.trim() ?? ''

    if (!loginId || !password) {
      return NextResponse.json({ ok: false, error: '아이디와 비밀번호를 입력해 주세요.' }, { status: 400 })
    }

    const user = await verifyAllowanceLogin(loginId, password)
    if (!user) {
      return NextResponse.json({ ok: false, error: '로그인 정보가 올바르지 않습니다.' }, { status: 401 })
    }

    const token = await createAllowanceSession(user)
    const response = NextResponse.json({ ok: true, user }, { status: 200 })

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 30,
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : '로그인 처리 중 오류가 발생했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
