import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { assertSafeUserRequest } from '@/lib/moni/agent/guardrails'
import { loadPinnedProjectContext, loadThreadMemory, maybeRefreshThreadMemory } from '@/lib/moni/agent/memory'
import { runMoniConversationAgent } from '@/lib/moni/agent/conversation-runtime'
import type { MoniAgentPageContext } from '@/lib/moni/agent/context-types'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const MAX_MESSAGE_LENGTH = 6000
const DEFAULT_MODEL = 'gpt-5'

type AgentRequest = { message?: string; page?: MoniAgentPageContext; thread_id?: string }
type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
type Supabase = ReturnType<typeof createMoniServiceRoleClient>
const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function modelName() { return text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_MODEL }
function cleanPage(raw?: MoniAgentPageContext): MoniAgentPageContext {
  return {
    pathname: text(raw?.pathname, 300), search: text(raw?.search, 500), title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw!.headings!.map((item) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

async function ensureThread(supabase: Supabase, session: SessionUser, threadId: string, page: MoniAgentPageContext) {
  if (threadId) {
    const { data, error } = await supabase.from('moni_ai_threads').select('*')
      .eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).eq('status', 'ACTIVE').maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('MONI 대화방을 확인할 수 없습니다.')
    await supabase.from('moni_ai_threads').update({ current_page: page, updated_at: new Date().toISOString() }).eq('id', threadId)
    return data
  }
  const { data, error } = await supabase.from('moni_ai_threads').insert({
    business_id: BUSINESS_ID, user_login_id: session.loginId, user_display_name: session.displayName,
    user_role: session.role, current_page: page,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
    if (!threadId) return NextResponse.json({ ok: true, thread: null, messages: [] }, { headers: { 'Cache-Control': 'no-store' } })
    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase.from('moni_ai_threads')
      .select('id,title,status,pmo_handoff_status,last_message_at,openai_conversation_id')
      .eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: 'MONI 대화방을 찾을 수 없습니다.' }, { status: 404 })
    const { data: messages, error: messageError } = await supabase.from('moni_ai_messages')
      .select('id,role,content,provider,model,created_at').eq('thread_id', threadId).eq('business_id', BUSINESS_ID)
      .in('role', ['user', 'assistant']).order('created_at', { ascending: true }).limit(100)
    if (messageError) throw new Error(messageError.message)
    return NextResponse.json({ ok: true, thread, messages: messages ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'MONI 대화를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    const body = await request.json().catch(() => null) as AgentRequest | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })
    const message = text(body.message, MAX_MESSAGE_LENGTH)
    if (!message) return NextResponse.json({ ok: false, error: '질문을 입력해 주세요.' }, { status: 400 })
    assertSafeUserRequest(message)

    const page = cleanPage(body.page)
    const supabase = createMoniServiceRoleClient()
    const thread = await ensureThread(supabase, session, text(body.thread_id, 80), page)
    const { data: userMessage, error: userError } = await supabase.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID, thread_id: thread.id, role: 'user', content: message, page_context: page,
    }).select('id').single()
    if (userError) throw new Error(userError.message)

    const [{ data: recentRows }, threadMemory, pinnedProjectContext] = await Promise.all([
      supabase.from('moni_ai_messages').select('id,role,content,created_at').eq('thread_id', thread.id).eq('business_id', BUSINESS_ID)
        .in('role', ['user', 'assistant']).neq('id', userMessage.id).order('created_at', { ascending: false }).limit(8),
      loadThreadMemory(supabase, BUSINESS_ID, thread.id),
      loadPinnedProjectContext(supabase, BUSINESS_ID),
    ])

    const model = modelName()
    const result = await runMoniConversationAgent({
      model,
      currentContent: [{ type: 'input_text', text: message }],
      currentUserText: message,
      conversationId: thread.openai_conversation_id || null,
      recentHistory: [...(recentRows ?? [])].reverse().map((row: any) => ({ role: String(row.role), content: String(row.content || '') })),
      threadMemory, pinnedProjectContext,
      context: {
        supabase, businessId: BUSINESS_ID, threadId: thread.id, messageId: userMessage.id, page,
        session: { loginId: session.loginId, displayName: session.displayName, role: session.role },
      },
    })

    const { error: assistantError } = await supabase.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID, thread_id: thread.id, role: 'assistant', content: result.text,
      page_context: page, provider: 'openai', model,
    })
    if (assistantError) throw new Error(assistantError.message)

    const now = new Date().toISOString()
    const { error: threadUpdateError } = await supabase.from('moni_ai_threads').update({
      title: thread.title || message.replace(/\s+/g, ' ').slice(0, 80), current_page: page,
      updated_at: now, last_message_at: now, openai_conversation_id: result.conversationId,
      openai_conversation_updated_at: now,
    }).eq('id', thread.id)
    if (threadUpdateError) throw new Error(threadUpdateError.message)

    // Conversations API keeps the exact short-term thread. This compact DB
    // memory is refreshed asynchronously as a durable fallback for long-lived
    // conversations and provider-side conversation rebuilds.
    void maybeRefreshThreadMemory({
      supabase, businessId: BUSINESS_ID, threadId: thread.id, model, existingMemory: threadMemory,
    }).catch((memoryError) => {
      console.error('[MONI_MEMORY_REFRESH_ERROR]', {
        thread_id: thread.id,
        message: memoryError instanceof Error ? memoryError.message : 'memory refresh failed',
      })
    })

    return NextResponse.json({
      ok: true, text: result.text, provider: 'openai', model, thread_id: thread.id,
      agent_runtime: 'MONI_OPENAI_CONVERSATIONS_V1', conversation_state: 'SERVER_MANAGED',
      agent_run_id: result.agentRunId, agent_steps: result.stepCount, tool_call_count: result.toolCallCount,
      tools_used: result.toolsUsed, usage: result.usage, pmo_handoff_status: thread.pmo_handoff_status || 'NONE',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI 응답 생성 중 오류가 발생했습니다.'
    console.error('[MONI_AGENT_SDK_ROUTE][MONI_CONVERSATION_ROUTE_ERROR]', { message, occurred_at: new Date().toISOString() })
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
