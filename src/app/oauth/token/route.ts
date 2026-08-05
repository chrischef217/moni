import { NextRequest, NextResponse } from 'next/server'
import { isMoniMcpEnabled, moniMcpResource } from '@/lib/moni/mcp/config'
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from '@/lib/moni/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  })
}

export async function POST(request: NextRequest) {
  if (!isMoniMcpEnabled()) {
    return oauthError('temporarily_unavailable', 'MONI ChatGPT 연결은 보안 수용검사 전까지 비활성 상태입니다.', 503)
  }

  const form = await request.formData().catch(() => null)
  if (!form) return oauthError('invalid_request', '폼 요청을 읽을 수 없습니다.')
  const grantType = String(form.get('grant_type') || '')
  const clientId = String(form.get('client_id') || '')
  const resource = String(form.get('resource') || moniMcpResource())
  if (!clientId || resource !== moniMcpResource()) {
    return oauthError('invalid_request', 'client_id 또는 resource가 올바르지 않습니다.')
  }

  try {
    if (grantType === 'authorization_code') {
      const code = String(form.get('code') || '')
      const redirectUri = String(form.get('redirect_uri') || '')
      const codeVerifier = String(form.get('code_verifier') || '')
      if (!code || !redirectUri || !codeVerifier) {
        return oauthError('invalid_request', 'code, redirect_uri, code_verifier가 필요합니다.')
      }
      const token = await exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier, resource })
      return NextResponse.json(token, {
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      })
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(form.get('refresh_token') || '')
      if (!refreshToken) return oauthError('invalid_request', 'refresh_token이 필요합니다.')
      const token = await refreshAccessToken({
        refreshToken,
        clientId,
        resource,
        requestedScope: String(form.get('scope') || ''),
      })
      return NextResponse.json(token, {
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      })
    }

    return oauthError('unsupported_grant_type', 'authorization_code와 refresh_token만 지원합니다.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth token 발급에 실패했습니다.'
    const code = ['invalid_grant', 'invalid_scope'].includes(message) ? message : 'server_error'
    return oauthError(code, message)
  }
}
