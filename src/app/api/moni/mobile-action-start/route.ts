import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { assertSafeUserRequest } from '@/lib/moni/agent/guardrails'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

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
    headings: Array.isArray(raw?.headings)
      ? raw.headings.map((item: unknown) => text(item, 120)).filter(Boolean).slice(0, 6)
      : [],
  }
}

function classifyRawMaterialCardIntent(value: string) {
  const current = value.replace(/\s+/g, ' ').trim()
  const rawContext = /(원재료|원료|부자재)/.test(current)
  const create = /(?:입고|매입).*(?:등록|기록|잡아|잡아줘|입력|작성|처리|반영|해줘|해주세요|해 줘)|(?:등록|기록|입력|작성).*(?:입고|매입)|(?:입고)\s*(?:해줘|해주세요|해 줘)/.test(current)
  const update = /(?:수정|변경|정정|고쳐|바꿔)/.test(current)
  const remove = /(?:삭제|지워|제거|없애)/.test(current)
  if (rawContext && remove) return 'DELETE' as const
  if (rawContext && update) return 'UPDATE' as const
  if ((rawContext || /입고/.test(current)) && create) return 'CREATE' as const
  return null
}

function responseText(operation: 'CREATE' | 'UPDATE' | 'DELETE') {
  if (operation === 'CREATE') return '원재료 입고 입력 카드를 열었습니다. 필요한 값을 한 번에 입력한 뒤 ‘입력 내용 확인’을 눌러 주세요.'
  if (operation === 'UPDATE') return '원재료 입고 수정 카드를 열었습니다. 수정할 기록과 변경값을 선택한 뒤 ‘변경 내용 확인’을 눌러 주세요.'
  return '원재료 입고 삭제 카드를 열었습니다. 삭제할 기록을 선택한 뒤 ‘삭제 내용 확인’을 눌러 주세요.'
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
    const operation = classifyRawMaterialCardIntent(rawMessage)
    if (!operation) return NextResponse.json({ ok: false, code: 'NOT_MOBILE_CARD_INTENT', error: '모바일 원재료 업무 카드 요청이 아닙니다.' }, { status: 422 })

    const threadId = text(body.thread_id, 80)
    if (!threadId) return NextResponse.json({ ok: false, error: 'MONI 대화방이 준비되지 않았습니다.' }, { status: 400 })

    const page = cleanPage(body.page)
    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase.from('moni_ai_threads')
      .select('id,title,status')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .eq('status', 'ACTIVE')
      .maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: 'MONI 대화방을 확인할 수 없습니다.' }, { status: 404 })

    const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString()
    const { data: activeRun, error: runError } = await supabase.from('moni_ai_agent_runs')
      .select('id')
      .eq('business_id', BUSINESS_ID)
      .eq('thread_id', threadId)
      .eq('status', 'RUNNING')
      .gte('started_at', staleBefore)
      .limit(1)
      .maybeSingle()
    if (runError) throw new Error(runError.message)
    if (activeRun) return NextResponse.json({
      ok: false,
      code: 'MONI_BUSY',
      error: 'MONI가 이전 질문에 답변 중입니다. 답변이 끝난 뒤 다시 보내 주세요.',
    }, { status: 409, headers: { 'Cache-Control': 'no-store' } })

    const now = new Date().toISOString()
    const { data: userMessage, error: userError } = await supabase.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID,
      thread_id: threadId,
      role: 'user',
      content: rawMessage,
      page_context: page,
    }).select('id').single()
    if (userError) throw new Error(userError.message)

    const finalText = responseText(operation)
    const { data: assistantMessage, error: assistantError } = await supabase.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID,
      thread_id: threadId,
      role: 'assistant',
      content: finalText,
      page_context: page,
      provider: 'moni-system',
      model: 'MONI_MOBILE_ACTION_CARD_V1',
    }).select('id').single()
    if (assistantError) throw new Error(assistantError.message)

    const { error: updateError } = await supabase.from('moni_ai_threads').update({
      title: thread.title || rawMessage.replace(/\s+/g, ' ').slice(0, 80),
      current_page: page,
      updated_at: now,
      last_message_at: now,
    }).eq('id', threadId).eq('business_id', BUSINESS_ID)
    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({
      ok: true,
      text: finalText,
      thread_id: threadId,
      assistant_message_id: assistantMessage.id,
      source_user_message_id: userMessage.id,
      structured_action_card: true,
      operation,
      agent_runtime: 'MONI_MOBILE_ACTION_CARD_V1',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '모바일 업무 카드를 시작하지 못했습니다.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
