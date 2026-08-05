import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import {
  createAuthorizationCode,
  validateAuthorizationRequest,
} from '@/lib/moni/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function redirectWithParams(base: string, values: Record<string, string>) {
  const url = new URL(base)
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value)
  }
  return NextResponse.redirect(url, { status: 302 })
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const raw = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]))

  let authorization
  try {
    authorization = await validateAuthorizationRequest(raw)
  } catch (error) {
    return NextResponse.json({
      error: 'invalid_request',
      error_description: error instanceof Error ? error.message : '잘못된 OAuth 요청입니다.',
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }

  if (raw.decision !== 'approve') {
    return redirectWithParams(authorization.redirectUri, {
      error: 'access_denied',
      state: authorization.state,
    })
  }

  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'login_required', error_description: 'MONI 로그인이 필요합니다.' }, { status: 401 })
  }

  try {
    const code = await createAuthorizationCode({
      ...authorization,
      loginId: session.loginId,
      displayName: session.displayName,
      role: session.role,
    })
    return redirectWithParams(authorization.redirectUri, {
      code,
      state: authorization.state,
    })
  } catch (error) {
    return redirectWithParams(authorization.redirectUri, {
      error: 'server_error',
      error_description: error instanceof Error ? error.message.slice(0, 300) : 'MONI OAuth 승인에 실패했습니다.',
      state: authorization.state,
    })
  }
}
