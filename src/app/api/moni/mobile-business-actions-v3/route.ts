import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'
import { GET as salesAwareGET, POST as salesAwarePOST } from '../mobile-business-actions-v2/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)

async function latestUserTurn(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!session || !threadId) return null

  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads')
    .select('id')
    .eq('id', threadId)
    .eq('business_id', BUSINESS_ID)
    .eq('user_login_id', session.loginId)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  if (thread.error || !thread.data) return null

  const message = await db.from('moni_ai_messages')
    .select('id,content,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (message.error || !message.data) return null
  return message.data
}

export async function GET(request: NextRequest) {
  const response = await salesAwareGET(request)
  if (!response.ok) return response
  const payload = await response.json().catch(() => null) as Record<string, any> | null
  if (!payload) return NextResponse.json({ ok: false, error: '모바일 업무카드 응답을 읽지 못했습니다.' }, { status: 500 })

  try {
    const current = await latestUserTurn(request)
    if (current) {
      const intent = classifyMobileBusinessIntent(text(current.content, 6000))
      const cardSource = text(payload?.card?.source_user_message_id, 100)
      if (intent?.domain === 'sales_export_bundle') payload.card = null
      else if (cardSource && cardSource !== text(current.id, 100)) payload.card = null
    }
  } catch {
    // Never break the primary business-card response because of stale-card isolation.
  }

  if (payload?.card?.domain === 'sales_export_bundle') payload.card = null
  return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  return salesAwarePOST(request)
}
