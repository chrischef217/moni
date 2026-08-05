import { NextRequest, NextResponse } from 'next/server'
import { POST_LOGIN_COOKIE_NAME, safePostLoginPath } from '@/lib/allowance/post-login'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  const target = safePostLoginPath(request.cookies.get(POST_LOGIN_COOKIE_NAME)?.value)
  const destination = session && target
    ? new URL(target, request.nextUrl.origin)
    : new URL('/', request.nextUrl.origin)
  const response = NextResponse.redirect(destination, { status: 302 })
  response.cookies.set({
    name: POST_LOGIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
