import { NextRequest, NextResponse } from 'next/server'
import { getMoniMcpAcceptanceStatus } from '@/lib/moni/mcp/acceptance-status'
import { getStrictMcpSessionFromRequest } from '@/lib/moni/mcp/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getStrictMcpSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'DB에 등록된 MONI 로그인이 필요합니다.' }, { status: 401 })
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'MCP 수용검사 상태는 관리자만 확인할 수 있습니다.' }, { status: 403 })
  }

  try {
    const status = await getMoniMcpAcceptanceStatus()
    return NextResponse.json({ ok: true, status }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MCP 수용검사 상태 확인에 실패했습니다.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
