import { NextRequest, NextResponse } from 'next/server'
import { getStrictMcpSessionFromRequest } from '@/lib/moni/mcp/session'
import {
  getMcpPreflightGateStatus,
  runMoniMcpPreflight,
} from '@/lib/moni/mcp/preflight'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { MONI_BUSINESS_ID } from '@/lib/moni/mcp/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin(request: NextRequest) {
  const session = await getStrictMcpSessionFromRequest(request)
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: 'DB에 등록된 MONI 로그인이 필요합니다.' }, { status: 401 }) }
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ ok: false, error: 'MCP Preflight는 관리자만 실행할 수 있습니다.' }, { status: 403 }) }
  }
  return { session }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  const supabase = createMoniServiceRoleClient()
  const [{ data: latest, error }, gate] = await Promise.all([
    supabase
      .from('moni_mcp_preflight_runs')
      .select('id,status,requested_by_login_id,requested_by_display_name,admin_tool_catalog_hash,freelancer_tool_catalog_hash,checks,warnings,errors,started_at,finished_at,created_at')
      .eq('business_id', MONI_BUSINESS_ID)
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getMcpPreflightGateStatus(),
  ])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    gate,
    latest: latest || null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const result = await runMoniMcpPreflight({
      loginId: auth.session.loginId,
      displayName: auth.session.displayName,
    })
    const gate = await getMcpPreflightGateStatus()
    return NextResponse.json({ ok: true, result, gate }, {
      status: result.status === 'PASS' ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MCP Preflight 실행에 실패했습니다.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
