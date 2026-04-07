/**
 * 구글 캘린더 이벤트 CRUD API
 * POST /api/calendar/event — 이벤트 생성
 */
import { NextRequest, NextResponse } from 'next/server'
import { createCalendarEvent, refreshAccessToken } from '@/lib/google_calendar'
import type { CalendarEvent } from '@/lib/google_calendar'

export async function POST(req: NextRequest) {
  try {
    const body: CalendarEvent = await req.json()

    // 쿠키에서 토큰 읽기
    let accessToken = req.cookies.get('google_access_token')?.value
    const refreshToken = req.cookies.get('google_refresh_token')?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        {
          error: '구글 캘린더 연동이 필요합니다.',
          authUrl: '/api/auth/google',
          message: '구글 계정을 연결해주세요.',
        },
        { status: 401 }
      )
    }

    // access_token 만료 시 refresh
    if (!accessToken && refreshToken) {
      try {
        accessToken = await refreshAccessToken(refreshToken)
      } catch {
        return NextResponse.json(
          { error: '구글 토큰이 만료되었습니다. 다시 연결해주세요.', authUrl: '/api/auth/google' },
          { status: 401 }
        )
      }
    }

    const event = await createCalendarEvent(accessToken!, body)

    return NextResponse.json({
      success: true,
      message: `✓ 구글 캘린더에 "${body.title}" 이벤트가 등록됐습니다.`,
      eventId: event.id,
      link: event.htmlLink,
    })
  } catch (error) {
    console.error('캘린더 이벤트 생성 오류:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
