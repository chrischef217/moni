import { NextRequest, NextResponse } from 'next/server'
import { isMoniMcpRuntimeEnabled } from '@/lib/moni/mcp/activation'
import {
  createAuthorizationCode,
  validateAuthorizationRequest,
} from '@/lib/moni/mcp/oauth'
import { getStrictMcpSessionFromRequest } from '@/lib/moni/mcp/session'

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
  if (!(await isMoniMcpRuntimeEnabled())) {
    return NextResponse.json({
      error: 'temporarily_unavailable',
      error_description: 'MONI ChatGPT 연결은 비활성 상태입니다. 승인된 수용검사 창 또는 영구 운영 플래그가 필요합니다.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

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

  const session = await getStrictMcpSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({
      error: 'login_required',
      error_description: 'DB에 등록된 MONI 사용자 로그인이 필요합니다. fallback 세션은 ChatGPT 연결에 사용할 수 없습니다.',
    }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
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
