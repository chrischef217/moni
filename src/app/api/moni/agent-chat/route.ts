import { Buffer } from 'node:buffer'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { GET as getProductionDashboard } from '@/app/api/moni/production-dashboard/route'
import { GET as getReceivables } from '@/app/api/moni/receivables/route'
import { GET as getSalesTargets } from '@/app/api/moni/sales-targets/route'
import { GET as getFinancialControl } from '@/app/api/moni/financial-control/route'
import { GET as getSalesOperations } from '@/app/api/moni/sales-operations/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const MAX_MESSAGE_LENGTH = 6000
const MAX_HISTORY = 12
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_OPENAI_MODEL = 'gpt-5'

type Json = Record<string, any>
type ChatMessage = { role: 'user' | 'assistant'; content: string }
type PageContext = {
  pathname?: string
  search?: string
  title?: string
  headings?: string[]
}
type AgentRequest = {
  action?: string
  message?: string
  messages?: Array<{ role?: string; content?: string }>
  page?: PageContext
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
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveGeminiModel() {
  const configured = text(process.env.GEMINI_MODEL, 100) || DEFAULT_GEMINI_MODEL
  return /^gemini-2\.0(?:-|$)/.test(configured) ? DEFAULT_GEMINI_MODEL : configured
}

function resolveOpenAIModel() {
  return text(process.env.OPENAI_MONI_MODEL, 100) || DEFAULT_OPENAI_MODEL
}

function normalizeHistory(raw: AgentRequest['messages']): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item?.role === 'user' || item?.role === 'assistant')
    .map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: text(item.content, MAX_MESSAGE_LENGTH),
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY)
}

function cleanPage(raw: PageContext | undefined) {
  const headings = Array.isArray(raw?.headings)
    ? raw!.headings!.map((item) => text(item, 120)).filter(Boolean).slice(0, 6)
    : []
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings,
  }
}

async function source(responsePromise: Promise<Response>, label: string): Promise<Json> {
  try {
    const response = await responsePromise
    const payload = await response.json() as Json
    if (!response.ok || payload.ok === false) {
      return { available: false, error: `${label}: ${text(payload.error, 240) || '데이터 조회 실패'}` }
    }
    return { available: true, payload }
  } catch (error) {
    return { available: false, error: `${label}: ${error instanceof Error ? error.message : '데이터 조회 실패'}` }
  }
}

function receivablesContext(result: Json) {
  if (!result.available) return result
  const payload = result.payload ?? {}
  const orders = Array.isArray(payload.orders) ? payload.orders : []
  const priority = (row: Json) => {
    if (row.collection_state === 'overdue') return 0
    if (row.collection_state === 'due_today') return 1
    if (row.collection_state === 'due_soon') return 2
    if (row.collection_state === 'no_due_date') return 3
    return 4
  }
  const open = orders
    .filter((row: Json) => num(row.outstanding_amount) > 0)
    .sort((a: Json, b: Json) => priority(a) - priority(b) || text(a.due_date || '9999-12-31').localeCompare(text(b.due_date || '9999-12-31')))
    .slice(0, 10)
    .map((row: Json) => ({
      statement_number: row.statement_number,
      client_name: row.client_name,
      sale_date: row.sale_date,
      due_date: row.due_date,
      collection_label: row.collection_label,
      d_day: row.d_day,
      total_amount: row.total_amount,
      received_amount: row.received_amount,
      outstanding_amount: row.outstanding_amount,
      unverified_partial: row.unverified_partial,
    }))
  return { available: true, summary: payload.summary ?? {}, open_receivables: open }
}

function targetContext(result: Json) {
  if (!result.available) return result
  const payload = result.payload ?? {}
  return {
    available: true,
    range: payload.range ?? null,
    company: payload.company ?? null,
    people: Array.isArray(payload.people) ? payload.people.slice(0, 20) : [],
  }
}

function financialContext(result: Json) {
  if (!result.available) return result
  const payload = result.payload ?? {}
  const forecast = Array.isArray(payload.forecast_rows) ? payload.forecast_rows.slice(0, 10) : []
  return {
    available: true,
    range: payload.range ?? null,
    today: payload.today ?? null,
    summary: payload.summary ?? {},
    tax: payload.tax ?? {},
    forecast_rows: forecast.map((row: Json) => ({
      source: row.source,
      type: row.type,
      date: row.date,
      amount: row.amount,
      label: row.label,
    })),
  }
}

function productionContext(result: Json) {
  if (!result.available) return result
  const payload = result.payload ?? {}
  const alerts = Array.isArray(payload.alerts) ? payload.alerts.slice(0, 8) : []
  return {
    available: true,
    kpis: payload.kpis ?? {},
    pricing: payload.pricing ?? {},
    alerts: alerts.map((row: Json) => ({ severity: row.severity, title: row.title, detail: row.detail, metric: row.metric })),
  }
}

function salesContext(result: Json) {
  if (!result.available) return result
  const payload = result.payload ?? {}
  const clients = Array.isArray(payload.clients) ? payload.clients : []
  const orders = Array.isArray(payload.orders) ? payload.orders : []
  return {
    available: true,
    summary: payload.summary ?? {},
    clients: clients.slice(0, 25).map((row: Json) => ({
      id: row.id,
      company_name: row.company_name,
      status: row.status,
      payment_terms: row.payment_terms,
      contact_name: row.contact_name,
    })),
    recent_orders: orders.slice(0, 10).map((row: Json) => ({
      statement_number: row.statement_number,
      sale_date: row.sale_date,
      client_id: row.client_id,
      total_amount: row.total_amount,
      payment_status: row.payment_status,
      status: row.status,
    })),
  }
}

function needsSalesContext(message: string, page: ReturnType<typeof cleanPage>) {
  const haystack = `${message} ${page.pathname} ${page.search} ${page.headings.join(' ')}`.toLowerCase()
  return ['거래처', '고객', '판매', '매출', '명세표', 'sales', 'client', 'customer'].some((keyword) => haystack.includes(keyword))
}

function detectRequestType(message: string) {
  const normalized = message.toLowerCase()
  const bugTerms = ['오류', '에러', '버그', '안돼', '안 돼', '사라져', '잘못', '깨져', '중복', '이상해']
  const featureTerms = ['기능 추가', '추가해', '만들어줘', '개발', '업그레이드', '버튼 추가', '화면 수정', '바꿔줘', '개선해']
  const dataTerms = ['자료 입력', '대량 입력', '엑셀 반영', '데이터 반영', '업로드한 자료', '재고 맞춰']
  if (bugTerms.some((term) => normalized.includes(term))) return 'BUG'
  if (featureTerms.some((term) => normalized.includes(term))) return 'FEATURE'
  if (dataTerms.some((term) => normalized.includes(term))) return 'DATA'
  return 'OPERATIONS'
}

function buildPmoMarkdown(
  threadId: string,
  session: SessionUser,
  message: string,
  page: ReturnType<typeof cleanPage>,
  requestType: string,
  attachments: Array<{ fileName: string; mimeType: string }>,
  history: ChatMessage[],
) {
  const transcript = [...history.slice(-8), { role: 'user' as const, content: message }]
    .map((item) => `- ${item.role === 'user' ? '사용자' : 'MONI AI'}: ${item.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
  const attachmentText = attachments.length
    ? attachments.map((item) => `- ${item.fileName} (${item.mimeType})`).join('\n')
    : '- 없음'
  return `# MONI PMO 요청서\n\n- 요청 ID: ${threadId}\n- 요청 유형: ${requestType}\n- 요청 사용자: ${session.displayName} (${session.loginId})\n- 사용자 권한: ${session.role}\n- 발생 화면: ${page.pathname || '확인 불가'}${page.search || ''}\n- 화면 제목: ${page.title || '확인 불가'}\n- 접수 시각: ${new Date().toISOString()}\n\n## 사용자 요청 원문\n${message}\n\n## 첨부자료\n${attachmentText}\n\n## 최근 대화\n${transcript || '- 없음'}\n\n## 현재 확인된 사실\n- MONI AI는 조회·분석 전용이며 코드, DB 스키마, 업무 데이터를 직접 수정하지 않았습니다.\n- 현재 화면 경로와 첨부자료 메타데이터를 함께 저장했습니다.\n\n## PMO 확인 필요사항\n- 기존 의사결정 및 데이터 구조와의 충돌 여부\n- 실제 재현 여부와 영향 범위\n- 수정 필요성, 구현 범위, 테스트 기준\n\n## 미확인 사항\n- 사용자의 표현만으로 확정할 수 없는 기술 원인은 PMO가 코드와 DB를 확인해야 합니다.\n`
}

function buildSystemInstruction() {
  return `당신은 MONI Global Agent입니다. 한국 식품 제조 공장의 경영 운영 보조 AI입니다.

최우선 목적은 회사가 돈을 벌고, 받을 돈을 놓치지 않고, 더 돈 되는 결정을 하도록 돕는 것입니다.
의사결정 우선순위는 매출 → 수금 → 이익 → 현금흐름입니다.

[절대 규칙]
1. 아래 LIVE MONI CONTEXT에 있는 구조화된 실제 데이터만 회사 현황의 사실로 사용합니다.
2. 데이터가 없거나 source가 unavailable이면 추측하지 말고 "현재 MONI 데이터로 확인할 수 없습니다"라고 명시합니다.
3. 영업 파이프라인에 임의 확률을 부여하지 않습니다. expected_amount는 원금액 참고치일 뿐입니다.
4. 은행 API로 확인되지 않은 잔고를 역산하거나 추측하지 않습니다.
5. VAT/원천징수 참고값을 신고 확정세액이라고 말하지 않습니다.
6. 원재료 사용원가를 실제 현금지출로 간주하지 않습니다.
7. 이 Agent는 READ-ONLY입니다. 생성/수정/삭제/입금/재고/회계 처리 요청을 실제 실행하지 않습니다.
8. 사용자가 오류 수정, 화면 변경, 기능 추가, DB 변경, 개발을 요구하면 기술 작업을 하지 말고 PMO 접수 대상으로 기록되었다고 설명한 뒤 현재 동작·기대 동작·업무 영향을 정리합니다.
9. ACTION 태그, SQL, 숨겨진 DB 명령을 출력하거나 실행하려 하지 않습니다.
10. 현재 페이지 정보가 제공되면 사용자가 "여기", "이 화면", "이 거래처"라고 말할 때 페이지 문맥을 우선 사용하되, 특정 대상을 확정할 수 없으면 확인 질문을 합니다.
11. 첨부파일이 있으면 파일명과 내용에 근거해 분석하고, 읽을 수 없는 부분은 명확히 표시합니다. 첨부내용을 임의로 보완하지 않습니다.
12. 답변은 한국어로, 핵심 결론을 먼저 말하고 필요한 숫자와 근거를 짧게 제시합니다.
13. 사용자가 "지금 제일 먼저 할 일"을 물으면 연체 미수금 → 단기 현금부족 → 생산차질 위험 → 임박 수금 → 목표매출 부족 순으로 실제 존재하는 항목을 우선합니다.
14. 회사 내부 수치를 답할 때 가능하면 날짜/기준월을 같이 적습니다.
15. 기존 시스템에서 처리 가능한 업무는 새 기능을 제안하기보다 현재 페이지 또는 관련 메뉴 경로를 우선 안내합니다.`
}

function extractGeminiText(payload: Json) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  const parts = candidates.flatMap((candidate: Json) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
  return parts.map((part: Json) => text(part.text, 16000)).filter(Boolean).join('\n').trim()
}

function extractOpenAIText(payload: Json) {
  if (typeof payload.output_text === 'string') return text(payload.output_text, 16000)
  const output = Array.isArray(payload.output) ? payload.output : []
  return output
    .flatMap((item: Json) => Array.isArray(item.content) ? item.content : [])
    .filter((item: Json) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item: Json) => item.text)
    .join('\n')
    .trim()
}

async function ensureThread(
  supabase: SupabaseClient,
  session: SessionUser,
  threadId: string,
  page: ReturnType<typeof cleanPage>,
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

async function loadStoredHistory(supabase: SupabaseClient, threadId: string) {
  const { data, error } = await supabase
    .from('moni_ai_messages')
    .select('role,content,created_at')
    .eq('thread_id', threadId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY)
  if (error) throw new Error(error.message)
  return (data ?? []).reverse().map((item) => ({ role: item.role as 'user' | 'assistant', content: text(item.content, MAX_MESSAGE_LENGTH) }))
}

function extractSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const chunks = workbook.SheetNames.slice(0, 10).map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    return `[시트: ${sheetName}]\n${csv}`
  })
  return chunks.join('\n\n').slice(0, 120000)
}

async function loadAttachments(supabase: SupabaseClient, threadId: string, rawIds: unknown) {
  const ids = Array.isArray(rawIds) ? rawIds.map((item) => text(item, 80)).filter(Boolean).slice(0, MAX_ATTACHMENTS) : []
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
  if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error('한 번에 분석할 첨부파일은 합계 30MB 이하로 제한됩니다.')

  const loaded: LoadedAttachment[] = []
  for (const row of rows) {
    const { data: blob, error: downloadError } = await supabase.storage.from(row.storage_bucket).download(row.storage_path)
    if (downloadError || !blob) throw new Error(downloadError?.message || `${row.file_name} 파일을 읽지 못했습니다.`)
    const buffer = Buffer.from(await blob.arrayBuffer())
    const mimeType = text(row.mime_type, 180)
    let extractedText = ''
    if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') {
      extractedText = buffer.toString('utf8').slice(0, 120000)
    } else if (mimeType === 'application/vnd.ms-excel' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
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

async function answerWithOpenAI(
  apiKey: string,
  model: string,
  history: ChatMessage[],
  prompt: string,
  attachments: LoadedAttachment[],
) {
  const currentContent: Json[] = [{ type: 'input_text', text: prompt }]
  for (const item of attachments) {
    if (item.extractedText) {
      currentContent.push({ type: 'input_text', text: `\n[첨부파일: ${item.fileName}]\n${item.extractedText}` })
    } else if (item.mimeType.startsWith('image/')) {
      currentContent.push({ type: 'input_image', image_url: `data:${item.mimeType};base64,${item.base64}`, detail: 'auto' })
    } else {
      currentContent.push({ type: 'input_file', filename: item.fileName, file_data: `data:${item.mimeType};base64,${item.base64}` })
    }
  }

  const input: Json[] = history.map((item) => ({
    role: item.role,
    content: [{ type: 'input_text', text: item.content }],
  }))
  input.push({ role: 'user', content: currentContent })

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: buildSystemInstruction(),
      input,
      max_output_tokens: 2000,
    }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as Json
  if (!response.ok) {
    const detail = text(payload?.error?.message, 500) || `OpenAI 응답 오류 (${response.status})`
    throw new Error(detail)
  }
  const answer = extractOpenAIText(payload)
  if (!answer) throw new Error('OpenAI가 텍스트 응답을 반환하지 않았습니다.')
  return answer
}

async function answerWithGemini(
  apiKey: string,
  model: string,
  history: ChatMessage[],
  prompt: string,
  attachments: LoadedAttachment[],
) {
  const contents: Json[] = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }],
  }))
  const parts: Json[] = [{ text: prompt }]
  for (const item of attachments) {
    if (item.extractedText) {
      parts.push({ text: `\n[첨부파일: ${item.fileName}]\n${item.extractedText}` })
    } else {
      parts.push({ inlineData: { mimeType: item.mimeType, data: item.base64 } })
    }
  }
  contents.push({ role: 'user', parts })

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
      contents,
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 2000,
      },
    }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as Json
  if (!response.ok) {
    const detail = text(payload?.error?.message, 500) || `Google AI 응답 오류 (${response.status})`
    throw new Error(detail)
  }
  const answer = extractGeminiText(payload)
  if (!answer) throw new Error('Google AI가 텍스트 응답을 반환하지 않았습니다.')
  return answer
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
    if (!threadId) return NextResponse.json({ ok: false, error: '대화방 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase
      .from('moni_ai_threads')
      .select('*')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: '대화방을 찾을 수 없습니다.' }, { status: 404 })

    const { data: messages, error: messageError } = await supabase
      .from('moni_ai_messages')
      .select('id,role,content,provider,model,created_at')
      .eq('thread_id', threadId)
      .in('role', ['user', 'assistant'])
      .order('created_at')
      .limit(100)
    if (messageError) throw new Error(messageError.message)

    return NextResponse.json({ ok: true, thread, messages: messages ?? [] })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'MONI AI 대화를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

    const body = await request.json().catch(() => null) as AgentRequest | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const page = cleanPage(body.page)
    const supabase = createMoniServiceRoleClient()
    const thread = await ensureThread(supabase, session, text(body.thread_id, 80), page)
    const storedHistory = await loadStoredHistory(supabase, thread.id)
    const clientHistory = normalizeHistory(body.messages)
    const history = storedHistory.length ? storedHistory : clientHistory

    if (text(body.action, 30).toLowerCase() === 'handoff') {
      const latestUserMessage = [...history].reverse().find((item) => item.role === 'user')?.content || '사용자가 MONI AI 대화를 PMO에 전달했습니다.'
      const markdown = buildPmoMarkdown(thread.id, session, latestUserMessage, page, thread.request_type || 'UNKNOWN', [], history)
      const { error } = await supabase
        .from('moni_ai_threads')
        .update({
          pmo_handoff_status: 'REQUESTED',
          pmo_handoff_reason: latestUserMessage.slice(0, 500),
          pmo_handoff_markdown: markdown,
          current_page: page,
          updated_at: new Date().toISOString(),
        })
        .eq('id', thread.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, thread_id: thread.id, pmo_handoff_status: 'REQUESTED' })
    }

    const attachments = await loadAttachments(supabase, thread.id, body.attachment_ids)
    const message = text(body.message, MAX_MESSAGE_LENGTH) || (attachments.length ? '첨부한 자료를 분석해 주세요.' : '')
    if (!message) return NextResponse.json({ ok: false, error: '질문 또는 첨부파일이 필요합니다.' }, { status: 400 })

    const requestType = detectRequestType(message)
    const isPmoRequest = requestType === 'BUG' || requestType === 'FEATURE'
    const includeSales = needsSalesContext(message, page)

    const [receivablesRaw, targetsRaw, financeRaw, productionRaw, salesRaw] = await Promise.all([
      source(getReceivables(request), '수금·미수금'),
      source(getSalesTargets(request), '영업 목표매출'),
      source(getFinancialControl(request), '현금흐름·세무'),
      source(getProductionDashboard(), '생산 대시보드'),
      includeSales ? source(getSalesOperations(request), '판매관리') : Promise.resolve({ available: false, omitted: true }),
    ])

    const liveContext = {
      generated_at: new Date().toISOString(),
      read_only: true,
      page,
      request_classification: {
        type: requestType,
        pmo_handoff: isPmoRequest,
      },
      attachments: attachments.map((item) => ({ file_name: item.fileName, mime_type: item.mimeType, size_bytes: item.sizeBytes })),
      receivables: receivablesContext(receivablesRaw),
      sales_targets: targetContext(targetsRaw),
      financial_control: financialContext(financeRaw),
      production: productionContext(productionRaw),
      sales_management: includeSales ? salesContext(salesRaw) : { available: false, omitted: true, reason: '현재 질문/페이지에 판매 상세 컨텍스트가 필요하지 않음' },
    }

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

    const prompt = `${message}\n\n[LIVE MONI CONTEXT]\n${JSON.stringify(liveContext)}`
    const openAIKey = text(process.env.OPENAI_API_KEY, 500)
    const geminiKey = text(process.env.GOOGLE_AI_API_KEY, 500)
    let provider = ''
    let model = ''
    let answer = ''

    if (openAIKey) {
      provider = 'openai'
      model = resolveOpenAIModel()
      answer = await answerWithOpenAI(openAIKey, model, history, prompt, attachments)
    } else if (geminiKey) {
      provider = 'google'
      model = resolveGeminiModel()
      answer = await answerWithGemini(geminiKey, model, history, prompt, attachments)
    } else {
      return NextResponse.json({ ok: false, error: 'OpenAI 또는 Google AI API Key가 서버에 필요합니다.' }, { status: 503 })
    }

    const { error: assistantMessageError } = await supabase
      .from('moni_ai_messages')
      .insert({
        business_id: BUSINESS_ID,
        thread_id: thread.id,
        role: 'assistant',
        content: answer,
        page_context: page,
        provider,
        model,
      })
    if (assistantMessageError) throw new Error(assistantMessageError.message)

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
        attachments,
        history,
      )
    }
    const { error: threadUpdateError } = await supabase.from('moni_ai_threads').update(updatePayload).eq('id', thread.id)
    if (threadUpdateError) throw new Error(threadUpdateError.message)

    return NextResponse.json({
      ok: true,
      text: answer,
      provider,
      model,
      thread_id: thread.id,
      read_only: true,
      pmo_handoff_status: isPmoRequest ? 'REQUESTED' : thread.pmo_handoff_status,
      context_generated_at: liveContext.generated_at,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}
