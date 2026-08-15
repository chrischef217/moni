import { Buffer } from 'node:buffer'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { assertSafeUserRequest } from '@/lib/moni/agent/guardrails'
import { loadPinnedProjectContext, loadThreadMemory, maybeRefreshThreadMemory } from '@/lib/moni/agent/memory'
import { reportPmoEvent } from '@/lib/moni/agent/pmo'
import { runMoniConversationAgent } from '@/lib/moni/agent/conversation-runtime'
import type { MoniAgentPageContext } from '@/lib/moni/agent/context-types'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import {
  isPdfDocumentRequest,
  isSalesStatementRequest,
  removePdfCapabilityRefusal,
  sanitizeMoniUserFacingText,
} from '@/lib/moni/agent/user-facing-text'
import { resolveSalesStatementArtifacts, salesStatementSelectionText } from '@/lib/moni/documents/sales-statement-resolver'
import {
  isExportDocumentRequest,
  requestedExportDocumentKinds,
  resolveLinkedExportDocument,
} from '@/lib/moni/documents/export-document-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const MAX_MESSAGE_LENGTH = 6000
const MAX_CURRENT_IMAGES = 4
const MAX_CONTEXT_IMAGES = 3
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const DEFAULT_MODEL = 'gpt-5'
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

type AgentRequest = {
  message?: string
  page?: MoniAgentPageContext
  thread_id?: string
  attachment_ids?: string[]
}
type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
type Supabase = ReturnType<typeof createMoniServiceRoleClient>
type ThreadRow = Awaited<ReturnType<typeof ensureThread>>
type ImageAttachmentRow = {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  storage_bucket: string
  storage_path: string
  message_id: string | null
  created_at: string
}
type LoadedImage = ImageAttachmentRow & { dataUrl: string }

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function modelName() { return text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_MODEL }
function cleanPage(raw?: MoniAgentPageContext): MoniAgentPageContext {
  return {
    pathname: text(raw?.pathname, 300), search: text(raw?.search, 500), title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw!.headings!.map((item) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

function normalizeAttachmentIds(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((item) => text(item, 80)).filter(Boolean))].slice(0, MAX_CURRENT_IMAGES)
}

function referencesEarlierImage(message: string) {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  return /(사진|이미지|첨부|그\s*사진|이\s*사진|이거|이것|그거|저거|첫\s*번째|두\s*번째|세\s*번째|이\s*부분|여기|아까\s*올린)/i.test(normalized)
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

function appendOnce(value: string, addition: string) {
  if (!addition || value.includes(addition)) return value
  return [value.trim(), addition.trim()].filter(Boolean).join('\n\n')
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

async function loadImageRows(supabase: Supabase, threadId: string, ids: string[]) {
  if (!ids.length) return [] as ImageAttachmentRow[]
  const { data, error } = await supabase.from('moni_ai_attachments')
    .select('id,file_name,mime_type,size_bytes,storage_bucket,storage_path,message_id,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('upload_status', 'READY')
    .in('id', ids)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as ImageAttachmentRow[]
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered = ids.map((id) => byId.get(id)).filter((row): row is ImageAttachmentRow => Boolean(row))
  if (ordered.length !== ids.length) throw new Error('첨부한 사진 일부를 확인할 수 없습니다. 다시 첨부해 주세요.')
  return ordered
}

async function loadRecentReferencedImages(supabase: Supabase, threadId: string, excludedIds: string[]) {
  const { data, error } = await supabase.from('moni_ai_attachments')
    .select('id,file_name,mime_type,size_bytes,storage_bucket,storage_path,message_id,created_at')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('upload_status', 'READY')
    .not('message_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(MAX_CONTEXT_IMAGES + excludedIds.length)
  if (error) throw new Error(error.message)
  return ((data ?? []) as ImageAttachmentRow[])
    .filter((row) => !excludedIds.includes(row.id) && ALLOWED_IMAGE_TYPES.has(String(row.mime_type || '').toLowerCase()))
    .slice(0, MAX_CONTEXT_IMAGES)
    .reverse()
}

async function downloadImage(supabase: Supabase, row: ImageAttachmentRow): Promise<LoadedImage> {
  const mimeType = String(row.mime_type || '').toLowerCase()
  const sizeBytes = Number(row.size_bytes || 0)
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error(`${row.file_name}은 지원하지 않는 사진 형식입니다.`)
  if (sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) throw new Error(`${row.file_name}은 10MB 이하 사진만 분석할 수 있습니다.`)
  const { data, error } = await supabase.storage.from(row.storage_bucket).download(row.storage_path)
  if (error || !data) throw new Error(`${row.file_name} 사진을 불러오지 못했습니다.`)
  const buffer = Buffer.from(await data.arrayBuffer())
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${row.file_name}은 10MB 이하 사진만 분석할 수 있습니다.`)
  return { ...row, dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` }
}

function buildImageContent(images: LoadedImage[]) {
  return images.flatMap((image, index) => [
    { type: 'input_text', text: `[첨부 사진 ${index + 1}: ${text(image.file_name, 160)}]` },
    { type: 'input_image', image_url: image.dataUrl, detail: 'auto' },
  ])
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
    const safeMessages = (messages ?? []).map((row: any) => row.role === 'assistant'
      ? { ...row, content: sanitizeMoniUserFacingText(removePdfCapabilityRefusal(row.content)) }
      : row)
    return NextResponse.json({ ok: true, thread, messages: safeMessages }, { headers: { 'Cache-Control': 'no-store' } })
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
    const rawMessage = text(body.message, MAX_MESSAGE_LENGTH)
    const attachmentIds = normalizeAttachmentIds(body.attachment_ids)
    if (!rawMessage && !attachmentIds.length) return NextResponse.json({ ok: false, error: '질문을 입력하거나 사진을 첨부해 주세요.' }, { status: 400 })
    const agentMessage = rawMessage || '첨부한 사진을 확인해줘.'
    assertSafeUserRequest(agentMessage)

    const page = cleanPage(body.page)
    const supabase = createMoniServiceRoleClient()
    const thread = await ensureThread(supabase, session, text(body.thread_id, 80), page)
    let conversationId = await conversationIdForRun(supabase, thread)

    const currentImageRows = await loadImageRows(supabase, thread.id, attachmentIds)
    const priorImageRows = attachmentIds.length === 0 && referencesEarlierImage(agentMessage)
      ? await loadRecentReferencedImages(supabase, thread.id, attachmentIds)
      : []
    const imageRows = [...currentImageRows, ...priorImageRows]
    const loadedImages = await Promise.all(imageRows.map((row) => downloadImage(supabase, row)))
    const storedUserText = [rawMessage || '첨부한 사진을 확인해줘.', attachmentIds.length ? `📷 사진 ${attachmentIds.length}장 첨부` : '']
      .filter(Boolean).join('\n\n')

    const { data: userMessage, error: userError } = await supabase.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID, thread_id: thread.id, role: 'user', content: storedUserText, page_context: page,
    }).select('id').single()
    if (userError) throw new Error(userError.message)

    if (currentImageRows.length) {
      const { error: attachError } = await supabase.from('moni_ai_attachments')
        .update({ message_id: userMessage.id, updated_at: new Date().toISOString() })
        .eq('business_id', BUSINESS_ID)
        .eq('thread_id', thread.id)
        .in('id', currentImageRows.map((row) => row.id))
      if (attachError) throw new Error(attachError.message)
    }

    const [{ data: recentRows }, threadMemory, pinnedProjectContext] = await Promise.all([
      supabase.from('moni_ai_messages').select('id,role,content,created_at').eq('thread_id', thread.id).eq('business_id', BUSINESS_ID)
        .in('role', ['user', 'assistant']).neq('id', userMessage.id).order('created_at', { ascending: false }).limit(8),
      loadThreadMemory(supabase, BUSINESS_ID, thread.id),
      loadPinnedProjectContext(supabase, BUSINESS_ID),
    ])

    const recentContextText = (recentRows ?? []).map((row: any) => String(row.content || '')).join('\n')
    const model = modelName()
    const currentContent: Record<string, unknown>[] = [
      { type: 'input_text', text: agentMessage },
      ...buildImageContent(loadedImages),
    ]
    const runInput = {
      model,
      currentContent,
      currentUserText: agentMessage,
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

    let finalText = sanitizeMoniUserFacingText(result.text)
    const pdfRequested = isPdfDocumentRequest(agentMessage)
    const statementRequested = isSalesStatementRequest(agentMessage)
    const exportDocumentRequested = isExportDocumentRequest(agentMessage)
    let statementHandled = false
    let exportDocumentHandled = false

    if (pdfRequested) {
      finalText = sanitizeMoniUserFacingText(removePdfCapabilityRefusal(finalText))
      if (!finalText) finalText = '요청하신 내용으로 PDF 파일을 준비했습니다.'
    }

    if (statementRequested && session.role === 'admin') {
      const artifacts = await resolveSalesStatementArtifacts(supabase as any, BUSINESS_ID, agentMessage)
      const exact = artifacts.matched
      if (exact.length === 1) {
        const artifact = exact[0]
        const statementUrl = artifact.canonical_form_url
          ? `${artifact.canonical_form_url}${artifact.canonical_form_url.includes('?') ? '&' : '?'}auto=1`
          : artifact.pdf_url
        const statementLabel = artifact.canonical_form_url ? '📄 거래명세표 PDF 저장' : '📄 거래명세표 PDF 다운로드'
        finalText = `거래명세표를 준비했습니다.\n\n**${artifact.sale_date} · ${artifact.client_name} · ${artifact.statement_number}**\n\n[${statementLabel}](${statementUrl})`
        statementHandled = true
      } else {
        const choices = exact.length > 1 ? exact : artifacts.candidates
        if (choices.length) {
          finalText = `거래명세표를 만들 거래를 특정해야 합니다. 아래 최근 거래 중 하나를 말씀해 주세요.\n\n${salesStatementSelectionText(choices)}`
          statementHandled = true
        }
      }
    }

    if (exportDocumentRequested && session.role === 'admin') {
      const artifact = await resolveLinkedExportDocument(supabase as any, BUSINESS_ID, agentMessage, recentContextText)
      if (artifact) {
        const kinds = requestedExportDocumentKinds(agentMessage)
        const links = [
          kinds.invoice ? `[📄 인보이스 PDF 저장 · ${artifact.invoice_no}](${artifact.invoice_url})` : '',
          kinds.packing ? `[📦 패킹 리스트 PDF 저장 · ${artifact.packing_list_no}](${artifact.packing_list_url})` : '',
        ].filter(Boolean).join('\n\n')
        finalText = `연결된 수출서류를 확인했습니다.\n\n**${artifact.document_date} · ${artifact.invoice_no} / ${artifact.packing_list_no}**\n\n${links}`
      } else {
        finalText = '연결된 인보이스·패킹 리스트를 정확히 특정하지 못했습니다. 거래명세표 번호 또는 인보이스 번호를 말씀해 주세요.'
      }
      exportDocumentHandled = true
    }

    const { data: assistantMessage, error: assistantError } = await supabase.from('moni_ai_messages').insert({
      business_id: BUSINESS_ID, thread_id: thread.id, role: 'assistant', content: finalText,
      page_context: page, provider: 'openai', model,
    }).select('id').single()
    if (assistantError) throw new Error(assistantError.message)

    if (pdfRequested && !statementHandled && !exportDocumentHandled) {
      const pdfUrl = `/api/moni/answer-pdf?thread_id=${encodeURIComponent(thread.id)}&assistant_message_id=${encodeURIComponent(assistantMessage.id)}`
      finalText = appendOnce(finalText, `[📄 PDF 파일 다운로드](${pdfUrl})`)
      const { error: pdfLinkError } = await supabase.from('moni_ai_messages')
        .update({ content: finalText })
        .eq('id', assistantMessage.id)
        .eq('thread_id', thread.id)
        .eq('business_id', BUSINESS_ID)
      if (pdfLinkError) throw new Error(pdfLinkError.message)
    }

    const now = new Date().toISOString()
    const { error: threadUpdateError } = await supabase.from('moni_ai_threads').update({
      title: thread.title || agentMessage.replace(/\s+/g, ' ').slice(0, 80), current_page: page,
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
      ok: true, text: finalText, provider: 'openai', model, thread_id: thread.id,
      assistant_message_id: assistantMessage.id,
      attachment_count: currentImageRows.length,
      image_context_count: loadedImages.length,
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
