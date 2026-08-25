import { Buffer } from 'node:buffer'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { isSalesStatementRequest } from '@/lib/moni/agent/user-facing-text'
import {
  isExportDocumentRequest,
  requestedExportDocumentKinds,
  resolveLinkedExportDocument,
} from '@/lib/moni/documents/export-document-resolver'
import { GET as legacyGet, POST as legacyPost } from '../agent-runtime/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const DIRECT_RUNTIME = 'MONI_DIRECT_DOCUMENT_REDOWNLOAD_V1'

const text = (value: unknown, max = 6000) => String(value ?? '').trim().slice(0, max)

function hasRedownloadAction(value: string) {
  return /(?:다운로드|재다운로드|링크|다시|이미\s*생성|기존|만들어져|생성되어|바로\s*받|다시\s*받|열어|열기)/i.test(value)
}

function hasDocumentContext(value: string) {
  return /(?:거래\s*(?:명세표|명세서)|인보이스|invoice|패킹\s*(?:리스트|list)|packing\s*list|수출[^\n.]{0,18}(?:서류|문서)|\bDB-\d{8}-\d{3}\b|\bINV-\d{8}-\d{3}\b|\bPL-\d{8}-\d{3}\b)/i.test(value)
}

function looksLikeDocumentFollowup(value: string) {
  return /(?:이미\s*(?:생성|만들)|생성되어|만들어져|최근\s*출고|지금\s*출고|최근\s*건|그\s*건|그거|그걸|맞아|맞다고|바로|다운로드|링크|다시)/i.test(value)
}

function wantsExportFromContext(value: string) {
  return /(?:인보이스|invoice|패킹\s*(?:리스트|list)|packing\s*list|수출[^\n.]{0,18}(?:서류|문서)|\bINV-\d{8}-\d{3}\b|\bPL-\d{8}-\d{3}\b)/i.test(value)
}

function safePage(raw: any) {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings) ? raw.headings.map((item: unknown) => text(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

async function ensureThread(supabase: ReturnType<typeof createMoniServiceRoleClient>, session: any, threadId: string, page: any) {
  if (threadId) {
    const { data, error } = await supabase.from('moni_ai_threads').select('*')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .eq('status', 'ACTIVE')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('MONI 대화방을 확인할 수 없습니다.')
    return data
  }

  const { data, error } = await supabase.from('moni_ai_threads').insert({
    business_id: BUSINESS_ID,
    user_login_id: session.loginId,
    user_display_name: session.displayName,
    user_role: session.role,
    current_page: page,
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

async function directDocumentResponse(request: NextRequest) {
  const probe = request.clone()
  const body = await probe.json().catch(() => null) as any
  if (!body) return null

  const message = text(body.message)
  const threadId = text(body.thread_id, 80)
  const explicitStatement = isSalesStatementRequest(message)
  const explicitExport = isExportDocumentRequest(message)
  const maybeDirect = (hasRedownloadAction(message) && (explicitStatement || explicitExport))
    || looksLikeDocumentFollowup(message)
  if (!maybeDirect) return null

  const session = await getSessionFromRequest(request)
  if (!session || session.role !== 'admin') return null

  const supabase = createMoniServiceRoleClient()
  let recentContextText = ''
  if (threadId) {
    const { data: recentRows, error: recentError } = await supabase.from('moni_ai_messages')
      .select('role,content,created_at')
      .eq('business_id', BUSINESS_ID)
      .eq('thread_id', threadId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(8)
    if (recentError) throw new Error(recentError.message)
    recentContextText = [...(recentRows ?? [])].reverse().map((row: any) => text(row.content, 4000)).join('\n')
  }

  const inherited = looksLikeDocumentFollowup(message) && hasDocumentContext(recentContextText)
  const statementWanted = explicitStatement || (inherited && isSalesStatementRequest(recentContextText))
  const exportWanted = explicitExport || (inherited && wantsExportFromContext(recentContextText))
  if (!exportWanted) return null

  const artifact = await resolveLinkedExportDocument(supabase as any, BUSINESS_ID, message, recentContextText)
  if (!artifact) return null

  const page = safePage(body.page)
  const thread = await ensureThread(supabase, session, threadId, page)
  const { data: userMessage, error: userError } = await supabase.from('moni_ai_messages').insert({
    business_id: BUSINESS_ID,
    thread_id: thread.id,
    role: 'user',
    content: message,
    page_context: page,
  }).select('id').single()
  if (userError) throw new Error(userError.message)

  const inheritedKindsSource = explicitExport ? message : recentContextText
  const kinds = requestedExportDocumentKinds(inheritedKindsSource)
  const links = [
    statementWanted && artifact.statement_number
      ? `[📄 거래명세표 PDF 저장 · ${artifact.statement_number}](${artifact.statement_url})`
      : '',
    kinds.invoice && artifact.invoice_no
      ? `[📄 Commercial Invoice PDF 저장 · ${artifact.invoice_no}](${artifact.invoice_url})`
      : '',
    kinds.packing && artifact.packing_list_no
      ? `[📦 Packing List PDF 저장 · ${artifact.packing_list_no}](${artifact.packing_list_url})`
      : '',
  ].filter(Boolean)

  const finalText = [
    '이미 생성된 수출 문서를 확인했습니다. 다시 만들지 않고 바로 다운로드할 수 있습니다.',
    '',
    `**${artifact.document_date} · ${artifact.client_name} · 최근 수출 건**`,
    '',
    ...links,
  ].join('\n')

  const now = new Date().toISOString()
  const { data: assistantMessage, error: assistantError } = await supabase.from('moni_ai_messages').insert({
    business_id: BUSINESS_ID,
    thread_id: thread.id,
    role: 'assistant',
    content: finalText,
    page_context: page,
    provider: 'openai',
    model: 'deterministic-document-resolver',
  }).select('id').single()
  if (assistantError) throw new Error(assistantError.message)

  const usage = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const { data: run } = await supabase.from('moni_ai_agent_runs').insert({
    business_id: BUSINESS_ID,
    thread_id: thread.id,
    message_id: userMessage.id,
    provider: 'openai',
    model: 'deterministic-document-resolver',
    status: 'COMPLETED',
    validation_status: 'VERIFIED',
    prompt_version: DIRECT_RUNTIME,
    step_count: 1,
    tool_call_count: 1,
    request_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    latency_ms: 0,
    finished_at: now,
    usage,
    metadata: {
      direct_existing_document_redownload: true,
      export_document_id: artifact.id,
      statement_number: artifact.statement_number,
      invoice_no: artifact.invoice_no,
      packing_list_no: artifact.packing_list_no,
      inherited_context: inherited,
    },
  }).select('id').single()

  if (run?.id) {
    const payload = JSON.stringify({
      export_document_id: artifact.id,
      statement_number: artifact.statement_number,
      invoice_no: artifact.invoice_no,
      packing_list_no: artifact.packing_list_no,
    })
    await supabase.from('moni_ai_tool_runs').insert({
      business_id: BUSINESS_ID,
      agent_run_id: run.id,
      thread_id: thread.id,
      message_id: userMessage.id,
      step_no: 1,
      tool_name: 'resolve_existing_export_document_bundle',
      tool_arguments: { message, inherited_context: inherited },
      status: 'COMPLETED',
      result_summary: {
        preview: payload,
        truncated: false,
        output_bytes: Buffer.byteLength(payload, 'utf8'),
      },
      duration_ms: 0,
      finished_at: now,
    })
  }

  await supabase.from('moni_ai_threads').update({
    title: thread.title || message.replace(/\s+/g, ' ').slice(0, 80),
    current_page: page,
    updated_at: now,
    last_message_at: now,
  }).eq('id', thread.id).eq('business_id', BUSINESS_ID)

  return NextResponse.json({
    ok: true,
    text: finalText,
    provider: 'openai',
    model: 'deterministic-document-resolver',
    thread_id: thread.id,
    assistant_message_id: assistantMessage.id,
    attachment_count: 0,
    image_context_count: 0,
    agent_runtime: DIRECT_RUNTIME,
    agent_run_id: run?.id || null,
    agent_steps: 1,
    tool_call_count: 1,
    tools_used: ['resolve_existing_export_document_bundle'],
    usage,
    pmo_handoff_status: thread.pmo_handoff_status || 'NONE',
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  return legacyGet(request)
}

export async function POST(request: NextRequest) {
  try {
    const direct = await directDocumentResponse(request)
    if (direct) return direct
  } catch (error) {
    console.error('[MONI_DIRECT_DOCUMENT_REDOWNLOAD_ERROR]', error)
  }
  return legacyPost(request)
}
