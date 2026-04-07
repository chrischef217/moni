/**
 * 구글 OAuth2 콜백 핸들러
 * GET /api/auth/google/callback?code=xxx
 * 토큰을 쿠키에 저장 후 메인 페이지로 리다이렉트
 */
import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/google_calendar'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/?google_auth=failed', req.url))
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    // 토큰을 쿠키에 저장 (httpOnly, secure)
    const res = NextResponse.redirect(new URL('/?google_auth=success', req.url))
    res.cookies.set('google_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: tokens.expires_in,
      path: '/',
    })
    res.cookies.set('google_refresh_token', tokens.refresh_token ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: '/',
    })

    return res
  } catch (err) {
    console.error('Google OAuth 콜백 오류:', err)
    return NextResponse.redirect(new URL('/?google_auth=failed', req.url))
  }
}
