import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getStrictMcpSessionFromRequest } from '@/lib/moni/mcp/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('revoke_token'),
    token_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('revoke_client'),
    client_id: z.string().trim().min(8).max(200),
  }),
  z.object({
    action: z.literal('disable_client'),
    client_id: z.string().trim().min(8).max(200),
  }),
])

async function requireAdmin(request: NextRequest) {
  const session = await getStrictMcpSessionFromRequest(request)
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: 'DB에 등록된 MONI 로그인이 필요합니다.' }, { status: 401 }) }
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ ok: false, error: 'ChatGPT 연결 관리는 관리자만 사용할 수 있습니다.' }, { status: 403 }) }
  }
  return { session }
}

function publicToken(row: Record<string, unknown>) {
  return {
    id: row.id,
    client_id: row.client_id,
    scopes: row.scopes,
    user_login_id: row.user_login_id,
    user_display_name: row.user_display_name,
    user_role: row.user_role,
    access_expires_at: row.access_expires_at,
    refresh_expires_at: row.refresh_expires_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  const supabase = createMoniServiceRoleClient()
  const [{ data: clients, error: clientError }, { data: tokens, error: tokenError }] = await Promise.all([
    supabase
      .from('moni_mcp_oauth_clients')
      .select('client_id,client_name,redirect_uris,is_active,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('moni_mcp_oauth_tokens')
      .select('id,client_id,scopes,user_login_id,user_display_name,user_role,access_expires_at,refresh_expires_at,last_used_at,revoked_at,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  if (clientError) return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 })
  if (tokenError) return NextResponse.json({ ok: false, error: tokenError.message }, { status: 500 })

  const tokenRows = (tokens ?? []).map((row) => publicToken(row as Record<string, unknown>))
  const activeCount = tokenRows.filter((row) => !row.revoked_at && Date.parse(String(row.refresh_expires_at || '')) > Date.now()).length

  return NextResponse.json({
    ok: true,
    generated_at: new Date().toISOString(),
    summary: {
      client_count: (clients ?? []).length,
      active_connection_count: activeCount,
      revoked_connection_count: tokenRows.filter((row) => Boolean(row.revoked_at)).length,
    },
    clients: clients ?? [],
    connections: tokenRows,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '연결 폐기 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const supabase = createMoniServiceRoleClient()
  const now = new Date().toISOString()
  const input = parsed.data

  if (input.action === 'revoke_token') {
    const { data, error } = await supabase
      .from('moni_mcp_oauth_tokens')
      .update({ revoked_at: now, updated_at: now })
      .eq('id', input.token_id)
      .is('revoked_at', null)
      .select('id,client_id,user_login_id,revoked_at')
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, revoked: data, actor: auth.session.loginId })
  }

  const { error: tokenError } = await supabase
    .from('moni_mcp_oauth_tokens')
    .update({ revoked_at: now, updated_at: now })
    .eq('client_id', input.client_id)
    .is('revoked_at', null)
  if (tokenError) return NextResponse.json({ ok: false, error: tokenError.message }, { status: 500 })

  if (input.action === 'disable_client') {
    const { error: clientError } = await supabase
      .from('moni_mcp_oauth_clients')
      .update({ is_active: false, updated_at: now })
      .eq('client_id', input.client_id)
    if (clientError) return NextResponse.json({ ok: false, error: clientError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    client_id: input.client_id,
    action: input.action,
    actor: auth.session.loginId,
    revoked_at: now,
  })
}
