import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { assertSafeUserRequest } from '@/lib/moni/agent/guardrails'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent, mobileBusinessCardText } from '@/lib/moni/mobile-business-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const MAX_MESSAGE_LENGTH = 6000
const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function cleanPage(raw: any) {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw.headings.map((item: unknown) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 })

    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const rawMessage = text(body.message, MAX_MESSAGE_LENGTH)
    const attachmentIds = Array.isArray(body.attachment_ids) ? body.attachment_ids.filter(Boolean) : []
    if (!rawMessage) return NextResponse.json({ ok: false, error: '업무 요청을 입력해 주세요.' }, { status: 400 })
    if (attachmentIds.length) return NextResponse.json({ ok: false, error: '사진이 포함된 요청은 사진 분석 경로를 사용해야 합니다.' }, { status: 422 })

    assertSafeUserRequest(rawMessage)
    const intent = classifyMobileBusinessIntent(rawMessage)
    if (!intent) return NextResponse.json({ ok: false, code: 'NOT_MOBILE_CARD_INTENT', error: '모바일 업무 카드 요청이 아닙니다.' }, { status: 422 })

    const threadId = text(body.thread_id, 80)
    if (!threadId) return NextResponse.json({ ok: false, error: 'MONI 대화방이 준비되지 않았습니다.' }, { status: 400 })
    const page = cleanPage(body.page)
    const db = createMoniServiceRoleClient()
    const threadResult = await db.from('moni_ai_threads').select('id,title,status').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).eq('status', 'ACTIVE').maybeSingle()
    if (threadResult.error) throw new Error(threadResult.error.message)
    if (!threadResult.data) return NextResponse.json({ ok: false, error: 'MONI 대화방을 확인할 수 없습니다.' }, { status: 404 })

    const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString()
    const running = await db.from('moni_ai_agent_runs').select('id').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('status', 'RUNNING').gte('started_at', staleBefore).limit(1).maybeSingle()
    if (running.error) throw new Error(running.error.message)
    if (running.data) return NextResponse.json({ ok: false, code: 'MONI_BUSY', error: 'MONI가 이전 질문에 답변 중입니다. 답변이 끝난 뒤 다시 보내 주세요.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })

    const now = new Date().toISOString()
    const userMessage = await db.from('moni_ai_messages').insert({ business_id: BUSINESS_ID, thread_id: threadId, role: 'user', content: rawMessage, page_context: page }).select('id').single()
    if (userMessage.error) throw new Error(userMessage.error.message)
    const finalText = mobileBusinessCardText(intent)
    const assistantMessage = await db.from('moni_ai_messages').insert({ business_id: BUSINESS_ID, thread_id: threadId, role: 'assistant', content: finalText, page_context: page, provider: 'moni-system', model: 'MONI_MOBILE_BUSINESS_CARD_V2' }).select('id').single()
    if (assistantMessage.error) throw new Error(assistantMessage.error.message)
    const update = await db.from('moni_ai_threads').update({ title: threadResult.data.title || rawMessage.replace(/\s+/g, ' ').slice(0, 80), current_page: page, updated_at: now, last_message_at: now }).eq('id', threadId).eq('business_id', BUSINESS_ID)
    if (update.error) throw new Error(update.error.message)

    return NextResponse.json({
      ok: true,
      text: finalText,
      thread_id: threadId,
      assistant_message_id: assistantMessage.data.id,
      source_user_message_id: userMessage.data.id,
      structured_action_card: true,
      domain: intent.domain,
      operation: intent.operation,
      agent_runtime: 'MONI_MOBILE_BUSINESS_CARD_V2',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 업무 카드를 시작하지 못했습니다.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
