import { Buffer } from 'node:buffer'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { GET as legacyGET, POST as legacyPOST } from '@/app/api/moni/agent-chat/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { assertSafeUserRequest } from '@/lib/moni/agent/guardrails'
import {
  loadPinnedProjectContext,
  loadThreadMemory,
  maybeRefreshThreadMemory,
} from '@/lib/moni/agent/memory'
import { reportPmoEvent } from '@/lib/moni/agent/pmo'
import { runMoniSdkAgent } from '@/lib/moni/agent/sdk-runtime'
import type { MoniAgentPageContext } from '@/lib/moni/agent-v2'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const MAX_MESSAGE_LENGTH = 6000
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024
const BUCKET = 'moni-ai-attachments'
const DEFAULT_OPENAI_MODEL = 'gpt-5'

type Json = Record<string, any>
type AgentRequest = {
  action?: string
  message?: string
  page?: MoniAgentPageContext
  thread_id?: string
  attachment_ids?: string[]
}
type LoadedAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  base64: string
  extractedText: string
}
type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

function resolveOpenAIModel() {
  return text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_OPENAI_MODEL
}

function resolveMemoryModel() {
  return text(process.env.OPENAI_MONI_MEMORY_MODEL, 100) || resolveOpenAIModel()
}

function cleanPage(raw: MoniAgentPageContext | undefined): MoniAgentPageContext {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings)
      ? raw!.headings!.map((item) => text(item, 120)).filter(Boolean).slice(0, 6)
      : [],
  }
}

function detectRequestType(message: string) {
  const normalized = message.toLowerCase()
  const bugTerms = ['오류', '에러', '버그', '안돼', '안 돼', '사라져', '잘못', '깨져', '중복', '이상해', '작동하지']
  const featureTerms = ['기능 추가', '추가해', '만들어줘', '개발', '업그레이드', '버튼 추가', '화면 수정', '바꿔줘', '개선해', '개선할']
  if (bugTerms.some((term) => normalized.includes(term))) return 'BUG'
  if (featureTerms.some((term) => normalized.includes(term))) return 'FEATURE'
  return 'OPERATIONS'
}

function buildPmoMarkdown(
  threadId: string,
  session: SessionUser,
  message: string,
  page: MoniAgentPageContext,
  requestType: string,
  toolsUsed: string[],
) {
  return `# MONI Agent PMO 요청\n\n- 요청 ID: ${threadId}\n- 요청 유형: ${requestType}\n- 요청 사용자: ${session.displayName} (${session.loginId})\n- 사용자 권한: ${session.role}\n- 발생 화면: ${page.pathname || '확인 불가'}${page.search || ''}\n- 사용 도구: ${toolsUsed.length ? toolsUsed.join(', ') : '없음'}\n- 접수 시각: ${new Date().toISOString()}\n\n## 사용자 요청\n${message}\n\n## 처리 원칙\n- MONI Agent는 조회·분석 전용이며 업무 데이터와 코드를 직접 수정하지 않았습니다.\n- GPT(PMO)가 기존 결정, 코드, DB, 운영 배포를 비교해 개발 여부를 결정합니다.\n`
}

async function ensureThread(
  supabase: SupabaseClient,
  session: SessionUser,
  threadId: string,
  page: MoniAgentPageContext,
) {
  if (threadId) {
    const { data, error } = await supabase
      .from('moni_ai_threads')
      .select('*')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('MONI AI 대화방을 확인할 수 없습니다.')
    const { error: updateError } = await supabase
      .from('moni_ai_threads')
      .update({ current_page: page, updated_at: new Date().toISOString() })
      .eq('id', threadId)
    if (updateError) throw new Error(updateError.message)
    return data
  }

  const { data, error } = await supabase
    .from('moni_ai_threads')
    .insert({
      business_id: BUSINESS_ID,
      user_login_id: session.loginId,
      user_display_name: session.displayName,
      user_role: session.role,
      current_page: page,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

function extractSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  return workbook.SheetNames
    .slice(0, 10)
    .map((sheetName) => `[시트: ${sheetName}]\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false })}`)
    .join('\n\n')
    .slice(0, 120000)
}

async function loadAttachments(supabase: SupabaseClient, threadId: string, rawIds: unknown) {
  const ids = Array.isArray(rawIds)
    ? rawIds.map((item) => text(item, 80)).filter(Boolean).slice(0, MAX_ATTACHMENTS)
    : []
  if (!ids.length) return [] as LoadedAttachment[]

  const { data, error } = await supabase
    .from('moni_ai_attachments')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .eq('thread_id', threadId)
    .eq('upload_status', 'READY')
    .in('id', ids)
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const totalBytes = rows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0)
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error('한 번에 분석할 첨부파일은 합계 30MB 이하로 제한됩니다.')
  }

  const loaded: LoadedAttachment[] = []
  for (const row of rows) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(row.storage_bucket || BUCKET)
      .download(row.storage_path)
    if (downloadError || !blob) {
      throw new Error(downloadError?.message || `${row.file_name} 파일을 읽지 못했습니다.`)
    }
    const buffer = Buffer.from(await blob.arrayBuffer())
    const mimeType = text(row.mime_type, 180)
    let extractedText = text(row.extracted_text, 120000)
    if (!extractedText && ['text/plain', 'text/csv', 'application/json'].includes(mimeType)) {
      extractedText = buffer.toString('utf8').slice(0, 120000)
    } else if (!extractedText && [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(mimeType)) {
      extractedText = extractSpreadsheet(buffer)
    }

    if (extractedText && extractedText !== row.extracted_text) {
      await supabase
        .from('moni_ai_attachments')
        .update({ extracted_text: extractedText, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    }
    loaded.push({
      id: row.id,
      fileName: text(row.file_name, 240),
      mimeType,
      sizeBytes: Number(row.size_bytes || buffer.byteLength),
      base64: buffer.toString('base64'),
      extractedText,
    })
  }
  return loaded
}

function buildCurrentContent(message: string, attachments: LoadedAttachment[]) {
  const content: Json[] = [{ type: 'input_text', text: message }]
  for (const item of attachments) {
    if (item.extractedText) {
      content.push({ type: 'input_text', text: `\n[첨부파일: ${item.fileName}]\n${item.extractedText}` })
    } else if (item.mimeType.startsWith('image/')) {
      content.push({ type: 'input_image', image_url: `data:${item.mimeType};base64,${item.base64}`, detail: 'auto' })
    } else {
      content.push({ type: 'input_file', filename: item.fileName, file_data: `data:${item.mimeType};base64,${item.base64}` })
    }
  }
  return content
}

export async function GET(request: NextRequest) {
  return legacyGET(request)
}

export async function POST(request: NextRequest) {
  const legacyRequest = new NextRequest(request.clone())
  try {
    const body = await request.json().catch(() => null) as AgentRequest | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const action = text(body.action, 30).toLowerCase()
    if (action === 'handoff') return legacyPOST(legacyRequest)
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: 'MONI Agent의 OPENAI_API_KEY가 설정되지 않았습니다.' }, { status: 503 })
    }
    if (text(process.env.MONI_AGENT_V2_DISABLED, 10).toLowerCase() === 'true') {
      return NextResponse.json({ ok: false, error: 'MONI Agent가 운영 설정에서 비활성화되어 있습니다.' }, { status: 503 })
    }

    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

    const page = cleanPage(body.page)
    const supabase = createMoniServiceRoleClient()
    const thread = await ensureThread(supabase, session, text(body.thread_id, 80), page)
    const attachments = await loadAttachments(supabase, thread.id, body.attachment_ids)
    const message = text(body.message, MAX_MESSAGE_LENGTH)
      || (attachments.length ? '첨부한 자료를 분석해 주세요.' : '')
    if (!message) return NextResponse.json({ ok: false, error: '질문 또는 첨부파일이 필요합니다.' }, { status: 400 })
    assertSafeUserRequest(message)

    const { data: userMessage, error: userMessageError } = await supabase
      .from('moni_ai_messages')
      .insert({
        business_id: BUSINESS_ID,
        thread_id: thread.id,
        role: 'user',
        content: message,
        page_context: page,
      })
      .select('id')
      .single()
    if (userMessageError) throw new Error(userMessageError.message)

    if (attachments.length) {
      const { error: attachmentLinkError } = await supabase
        .from('moni_ai_attachments')
        .update({ message_id: userMessage.id, updated_at: new Date().toISOString() })
        .in('id', attachments.map((item) => item.id))
        .eq('thread_id', thread.id)
      if (attachmentLinkError) throw new Error(attachmentLinkError.message)
    }

    const [threadMemory, pinnedProjectContext] = await Promise.all([
      loadThreadMemory(supabase, BUSINESS_ID, thread.id),
      loadPinnedProjectContext(supabase, BUSINESS_ID),
    ])
    const model = resolveOpenAIModel()
    const result = await runMoniSdkAgent({
      model,
      currentContent: buildCurrentContent(message, attachments),
      threadMemory,
      pinnedProjectContext,
      context: {
        supabase,
        businessId: BUSINESS_ID,
        threadId: thread.id,
        messageId: userMessage.id,
        page,
        session: {
          loginId: session.loginId,
          displayName: session.displayName,
          role: session.role,
        },
      },
    })

    const { error: assistantMessageError } = await supabase
      .from('moni_ai_messages')
      .insert({
        business_id: BUSINESS_ID,
        thread_id: thread.id,
        role: 'assistant',
        content: result.text,
        page_context: page,
        provider: 'openai',
        model,
      })
    if (assistantMessageError) throw new Error(assistantMessageError.message)

    const requestType = detectRequestType(message)
    const isPmoRequest = requestType === 'BUG' || requestType === 'FEATURE'
    if (isPmoRequest) {
      await reportPmoEvent({
        supabase,
        businessId: BUSINESS_ID,
        threadId: thread.id,
        messageId: userMessage.id,
        agentRunId: result.agentRunId,
        page,
        session: {
          loginId: session.loginId,
          displayName: session.displayName,
          role: session.role,
        },
      }, {
        event_type: requestType === 'BUG' ? 'BUG' : 'IMPROVEMENT',
        severity: requestType === 'BUG' ? 'HIGH' : 'MEDIUM',
        title: requestType === 'BUG'
          ? `사용자 보고 오류: ${message.slice(0, 100)}`
          : `사용자 요청 개선: ${message.slice(0, 100)}`,
        summary: message,
        evidence: {
          page,
          tools_used: result.toolsUsed,
          agent_run_id: result.agentRunId,
        },
        detection_source: 'USER_REPORTED',
        confidence: null,
        validation_status: 'PENDING',
        recommended_owner: 'GPT(PMO)',
      })
    }

    const updatePayload: Json = {
      title: thread.title || message.replace(/\s+/g, ' ').slice(0, 80),
      current_page: page,
      request_type: requestType,
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    }
    if (isPmoRequest) {
      updatePayload.pmo_handoff_status = 'REQUESTED'
      updatePayload.pmo_handoff_reason = message.slice(0, 500)
      updatePayload.pmo_handoff_markdown = buildPmoMarkdown(
        thread.id,
        session,
        message,
        page,
        requestType,
        result.toolsUsed,
      )
    }
    const { error: threadUpdateError } = await supabase
      .from('moni_ai_threads')
      .update(updatePayload)
      .eq('id', thread.id)
    if (threadUpdateError) throw new Error(threadUpdateError.message)

    let memoryRefresh: Json = { refreshed: false, memoryVersion: threadMemory.memoryVersion }
    try {
      memoryRefresh = await maybeRefreshThreadMemory({
        supabase,
        businessId: BUSINESS_ID,
        threadId: thread.id,
        model: resolveMemoryModel(),
        existingMemory: threadMemory,
      })
    } catch (memoryError) {
      console.warn('[MONI_AGENT_MEMORY_REFRESH_ERROR]', {
        message: memoryError instanceof Error ? memoryError.message : String(memoryError),
        thread_id: thread.id,
        agent_run_id: result.agentRunId,
      })
    }

    console.info('[MONI_AGENT_SDK_ROUTE]', {
      agent_run_id: result.agentRunId,
      tools_used: result.toolsUsed,
      tool_call_count: result.toolCallCount,
      usage: result.usage,
      memory_refreshed: Boolean(memoryRefresh.refreshed),
      memory_version: memoryRefresh.memoryVersion,
      occurred_at: new Date().toISOString(),
    })

    return NextResponse.json({
      ok: true,
      text: result.text,
      provider: 'openai',
      model,
      thread_id: thread.id,
      read_only: true,
      agent_runtime: 'MONI_AGENT_SDK_V2',
      agent_run_id: result.agentRunId,
      agent_steps: result.stepCount,
      tool_call_count: result.toolCallCount,
      tools_used: result.toolsUsed,
      usage: result.usage,
      memory_version: memoryRefresh.memoryVersion,
      pmo_handoff_status: isPmoRequest ? 'REQUESTED' : thread.pmo_handoff_status,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다.'
    console.error('[MONI_AGENT_SDK_ROUTE_ERROR]', { message, occurred_at: new Date().toISOString() })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
