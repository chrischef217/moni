import { NextRequest, NextResponse } from 'next/server'
import { POST_LOGIN_COOKIE_NAME, safePostLoginPath } from '@/lib/allowance/post-login'
import {
  AllowanceAuthStorageError,
  createSecureAllowanceSession,
  SESSION_COOKIE_NAME,
  verifySecureAllowanceLogin,
} from '@/lib/allowance/secure-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function postLoginTargetFromReferer(request: NextRequest) {
  try {
    const referer = request.headers.get('referer')
    if (!referer) return ''
    const url = new URL(referer)
    if (url.origin !== request.nextUrl.origin) return ''
    return safePostLoginPath(url.searchParams.get('return_to'))
  } catch {
    return ''
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { loginId?: string; password?: string } | null
    const loginId = body?.loginId?.trim() ?? ''
    const password = body?.password ?? ''

    if (!loginId || !password) {
      return NextResponse.json({ ok: false, error: '아이디와 비밀번호를 입력해 주세요.' }, { status: 400 })
    }

    const user = await verifySecureAllowanceLogin(loginId, password)
    if (!user) {
      return NextResponse.json({ ok: false, error: '로그인 정보가 올바르지 않습니다.' }, { status: 401 })
    }

    const token = await createSecureAllowanceSession(user)
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

    const postLoginTarget = postLoginTargetFromReferer(request)
    if (postLoginTarget) {
      response.cookies.set({
        name: POST_LOGIN_COOKIE_NAME,
        value: postLoginTarget,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 5 * 60,
      })
    }

    return response
  } catch (error) {
    const storageUnavailable = error instanceof AllowanceAuthStorageError
    return NextResponse.json({
      ok: false,
      error: storageUnavailable
        ? '로그인 시스템에 일시적으로 연결할 수 없습니다.'
        : '로그인 처리 중 오류가 발생했습니다.',
    }, { status: storageUnavailable ? 503 : 500 })
  }
}
