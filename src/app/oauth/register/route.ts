import { NextRequest, NextResponse } from 'next/server'
import { isMoniMcpRuntimeEnabled } from '@/lib/moni/mcp/activation'
import { registerMcpOAuthClient } from '@/lib/moni/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!(await isMoniMcpRuntimeEnabled())) {
    return NextResponse.json({
      error: 'temporarily_unavailable',
      error_description: 'MONI ChatGPT 연결은 비활성 상태입니다. 승인된 수용검사 창 또는 영구 운영 플래그가 필요합니다.',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const redirectUris = Array.isArray(body?.redirect_uris)
      ? body!.redirect_uris.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const authMethod = String(body?.token_endpoint_auth_method || 'none')
    if (authMethod !== 'none') {
      return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'MONI는 PKCE public client만 지원합니다.' }, { status: 400 })
    }

    const client = await registerMcpOAuthClient({
      redirectUris,
      clientName: String(body?.client_name || 'ChatGPT MONI'),
    })
    return NextResponse.json({
      client_id: client.client_id,
      client_id_issued_at: Math.floor(Date.parse(client.created_at) / 1000),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json({
      error: 'invalid_client_metadata',
      error_description: error instanceof Error ? error.message : 'OAuth client 등록에 실패했습니다.',
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
}
