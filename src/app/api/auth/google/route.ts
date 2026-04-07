/**
 * 구글 OAuth2 인증 시작 엔드포인트
 * GET /api/auth/google → 구글 로그인 페이지로 리다이렉트
 */
import { NextResponse } from 'next/server'
import { getGoogleAuthUrl } from '@/lib/google_calendar'

export async function GET() {
  try {
    const authUrl = getGoogleAuthUrl()
    return NextResponse.redirect(authUrl)
  } catch (error) {
    return NextResponse.json(
      { error: 'Google OAuth 설정이 필요합니다. GOOGLE_CLIENT_ID 환경변수를 확인하세요.' },
      { status: 500 }
    )
  }
}
