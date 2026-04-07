/**
 * 구글 캘린더 연동 유틸리티
 * OAuth2 인증 후 이벤트 CRUD 처리
 * 환경변수: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

export interface CalendarEvent {
  title: string
  date: string        // YYYY-MM-DD
  description?: string
  type: 'order' | 'delivery' | 'production'
}

// 이벤트 타입별 색상 코드 (구글 캘린더 colorId)
const EVENT_COLORS: Record<CalendarEvent['type'], string> = {
  order: '5',       // 바나나(노랑) — 발주
  delivery: '2',    // 세이지(녹색) — 입고
  production: '9',  // 블루베리(파랑) — 생산
}

// OAuth2 인증 URL 생성
export function getGoogleAuthUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.')

  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/auth/google/callback`
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events')

  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`
}

// Authorization code → access_token 교환
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/auth/google/callback`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`토큰 교환 실패: ${err}`)
  }

  return res.json()
}

// refresh_token으로 access_token 갱신
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) throw new Error('토큰 갱신 실패')
  const data = await res.json()
  return data.access_token
}

// 구글 캘린더에 이벤트 생성
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<{ id: string; htmlLink: string }> {
  const startDate = event.date
  const endDate = event.date  // 종일 이벤트

  const body = {
    summary: event.title,
    description: event.description ?? '',
    start: { date: startDate },
    end: { date: endDate },
    colorId: EVENT_COLORS[event.type],
    reminders: {
      useDefault: false,
      overrides: [{ method: 'email', minutes: 60 * 24 }],  // 하루 전 이메일 알림
    },
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`캘린더 이벤트 생성 실패: ${err}`)
  }

  return res.json()
}

// 발주 + 입고예정 이벤트 한번에 생성
export async function createOrderAndDeliveryEvents(
  accessToken: string,
  itemName: string,
  quantityKg: number,
  supplier: string,
  orderDate: string,
  leadTimeDays: number
): Promise<void> {
  // 발주일 이벤트
  await createCalendarEvent(accessToken, {
    title: `📦 발주: ${itemName} ${quantityKg}kg - ${supplier}`,
    date: orderDate,
    description: `원료: ${itemName}\n수량: ${quantityKg}kg\n공급업체: ${supplier}\n리드타임: ${leadTimeDays}일`,
    type: 'order',
  })

  // 입고 예정일 계산
  const deliveryDate = new Date(orderDate)
  deliveryDate.setDate(deliveryDate.getDate() + leadTimeDays)
  const deliveryDateStr = deliveryDate.toISOString().slice(0, 10)

  await createCalendarEvent(accessToken, {
    title: `🚚 입고예정: ${itemName} ${quantityKg}kg`,
    date: deliveryDateStr,
    description: `원료: ${itemName}\n입고예정량: ${quantityKg}kg\n공급업체: ${supplier}`,
    type: 'delivery',
  })
}
