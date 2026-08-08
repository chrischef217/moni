import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  closeMoniMcpAcceptanceWindow,
  getMoniMcpActivationState,
  openMoniMcpAcceptanceWindow,
} from '@/lib/moni/mcp/activation'
import {
  assertRecentPassingMcpPreflight,
  getMcpPreflightGateStatus,
} from '@/lib/moni/mcp/preflight'
import { getStrictMcpSessionFromRequest } from '@/lib/moni/mcp/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open_acceptance_window'),
    reason: z.string().trim().min(3).max(500),
    duration_minutes: z.number().int().min(5).max(30).default(15),
  }),
  z.object({ action: z.literal('close_acceptance_window') }),
])

async function requireAdmin(request: NextRequest) {
  const session = await getStrictMcpSessionFromRequest(request)
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: 'DB에 등록된 MONI 로그인이 필요합니다.' }, { status: 401 }) }
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ ok: false, error: 'MCP 수용검사 활성화는 관리자만 사용할 수 있습니다.' }, { status: 403 }) }
  }
  return { session }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const [state, preflight] = await Promise.all([
    getMoniMcpActivationState(),
    getMcpPreflightGateStatus(),
  ])
  return NextResponse.json({ ok: true, state, preflight }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'MCP 활성화 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    if (parsed.data.action === 'open_acceptance_window') {
      await assertRecentPassingMcpPreflight()
    }

    const state = parsed.data.action === 'open_acceptance_window'
      ? await openMoniMcpAcceptanceWindow({
          loginId: auth.session.loginId,
          displayName: auth.session.displayName,
          reason: parsed.data.reason,
          durationMinutes: parsed.data.duration_minutes,
        })
      : await closeMoniMcpAcceptanceWindow({ loginId: auth.session.loginId })
    const preflight = await getMcpPreflightGateStatus()

    return NextResponse.json({
      ok: true,
      state,
      preflight,
      actor: auth.session.loginId,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MCP 활성화 상태 변경에 실패했습니다.',
    }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  }
}
