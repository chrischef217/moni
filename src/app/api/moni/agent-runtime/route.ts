import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { assertSafeUserRequest } from '@/lib/moni/agent/guardrails'
import { loadPinnedProjectContext, loadThreadMemory, maybeRefreshThreadMemory } from '@/lib/moni/agent/memory'
import { reportPmoEvent } from '@/lib/moni/agent/pmo'
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
type ThreadRow = Awaited<ReturnType<typeof ensureThread>>
const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function modelName() { return text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_MODEL }
function cleanPage(raw?: MoniAgentPageContext): MoniAgentPageContext {
  return {
    pathname: text(raw?.pathname, 300), search: text(raw?.search, 500), title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw!.headings!.map((item) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

function isConversationChainError(value: unknown) {
  const message = String(value || '').toLowerCase()
  return /no tool output found for function call/.test(message)
    || /no tool call found for function call output/.test(message)
    || (/reasoning item/.test(message) && /(missing|required|without)/.test(message))
    || (/conversation/.test(message) && /(not found|invalid|expired|does not exist)/.test(message))
}

function shouldDiscardPreviousConversation(value: unknown) {
  const message = String(value || '').toLowerCase()
  return isConversationChainError(message)
    || /max turns \(\d+\) exceeded/.test(message)
    || /조회 단계를 초과/.test(message)
}

async function clearConversationState(supabase: Supabase, threadId: string) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('moni_ai_threads').update({
    openai_conversation_id: null,
    openai_conversation_updated_at: now,
    updated_at: now,
  }).eq('id', threadId).eq('business_id', BUSINESS_ID)
  if (error) throw new Error(error.message)
}

async function conversationIdForRun(supabase: Supabase, thread: ThreadRow) {
  const conversationId = text(thread.openai_conversation_id, 200)
  if (!conversationId) return null

  const { data: lastRun, error } = await supabase.from('moni_ai_agent_runs')
    .select('status,error_message,started_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', thread.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (lastRun?.status === 'FAILED' && shouldDiscardPreviousConversation(lastRun.error_message)) {
    await clearConversationState(supabase, thread.id)
    return null
  }
  return conversationId
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
    let conversationId = await conversationIdForRun(supabase, thread)

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
    const runInput = {
      model,
      currentContent: [{ type: 'input_text', text: message }],
      currentUserText: message,
      recentHistory: [...(recentRows ?? [])].reverse().map((row: any) => ({ role: String(row.role), content: String(row.content || '') })),
      threadMemory, pinnedProjectContext,
      context: {
        supabase, businessId: BUSINESS_ID, threadId: thread.id, messageId: userMessage.id, page,
        session: { loginId: session.loginId, displayName: session.displayName, role: session.role },
      },
    }

    let result
    try {
      result = await runMoniConversationAgent({ ...runInput, conversationId })
    } catch (firstError) {
      const raw = firstError instanceof Error ? firstError.message : String(firstError || '')
      if (!conversationId || !isConversationChainError(raw)) throw firstError

      await clearConversationState(supabase, thread.id)
      await reportPmoEvent({
        supabase,
        businessId: BUSINESS_ID,
        threadId: thread.id,
        messageId: userMessage.id,
        page,
        session: { loginId: session.loginId, displayName: session.displayName, role: session.role },
      }, {
        event_type: 'BUG',
        severity: 'HIGH',
        title: 'OpenAI Conversation 도구 체인 자동복구',
        summary: '이전 Conversation 상태의 tool call/output 체인이 불완전해 새 Conversation으로 자동 재구성했습니다.',
        detection_source: 'SYSTEM_DETECTED',
        confidence: 1,
        validation_status: 'VERIFIED',
        validator_name: 'MONI_RUNTIME_GUARD',
        recommended_owner: 'GPT(PMO)',
        evidence: {
          error_code: 'OPENAI_CONVERSATION_CHAIN_BROKEN',
          capability: 'conversation_state_recovery',
          actual_value: text(raw, 1000),
          expected_value: '도구 호출 체인이 완결된 Conversation 상태',
          source_reference: '/api/moni/agent-runtime',
        },
      }).catch((reportError) => {
        console.error('[MONI_CONVERSATION_RECOVERY_PMO_ERROR]', reportError)
      })

      conversationId = null
      result = await runMoniConversationAgent({ ...runInput, conversationId: null })
    }

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
    const rawMessage = error instanceof Error ? error.message : 'MONI 응답 생성 중 오류가 발생했습니다.'
    const message = isConversationChainError(rawMessage)
      ? 'MONI 대화 연결 상태를 복구하지 못했습니다. 같은 오류가 반복되면 자동으로 PMO 점검 대상으로 분류됩니다.'
      : rawMessage
    console.error('[MONI_AGENT_SDK_ROUTE][MONI_CONVERSATION_ROUTE_ERROR]', { message: rawMessage, occurred_at: new Date().toISOString() })
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
