import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 })
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })

  try {
    const db = createMoniServiceRoleClient()
    const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).eq('status', 'ACTIVE').maybeSingle()
    if (thread.error) throw new Error(thread.error.message)
    if (!thread.data) return NextResponse.json({ ok: false, error: 'MONI 대화방을 확인할 수 없습니다.' }, { status: 404 })
    const latest = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'user').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (latest.error) throw new Error(latest.error.message)
    if (!latest.data) return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const intent = classifyMobileBusinessIntent(latest.data.content)
    if (!intent || intent.domain !== 'raw_material_inbound') return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })

    const headers = new Headers({ 'Cache-Control': 'no-store' })
    const cookie = request.headers.get('cookie')
    if (cookie) headers.set('cookie', cookie)
    const response = await fetch(new URL(`/api/moni/mobile-actions?thread_id=${encodeURIComponent(threadId)}&_=${Date.now()}`, request.url), { headers, cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '원재료 업무 카드를 확인하지 못했습니다.' }, { status: 500 })
  }
}
