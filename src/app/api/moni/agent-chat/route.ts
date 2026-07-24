import { NextRequest, NextResponse } from 'next/server'
import { GET as getProductionDashboard } from '@/app/api/moni/production-dashboard/route'
import { GET as getReceivables } from '@/app/api/moni/receivables/route'
import { GET as getSalesTargets } from '@/app/api/moni/sales-targets/route'
import { GET as getFinancialControl } from '@/app/api/moni/financial-control/route'
import { GET as getSalesOperations } from '@/app/api/moni/sales-operations/route'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY = 10
const DEFAULT_MODEL = 'gemini-2.5-flash'

type Json = Record<string, any>
type ChatMessage = { role: 'user' | 'assistant'; content: string }
type PageContext = {
  pathname?: string
  search?: string
  title?: string
  headings?: string[]
}

type AgentRequest = {
  message?: string
  messages?: Array<{ role?: string; content?: string }>
  page?: PageContext
}

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveModel() {
  const configured = text(process.env.GEMINI_MODEL, 100) || DEFAULT_MODEL
  // Gemini 2.0 Flash was shut down on 2026-06-01. Never revive a stale configured 2.0 model.
  return /^gemini-2\.0(?:-|$)/.test(configured) ? DEFAULT_MODEL : configured
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
7. 이 V9 Agent는 READ-ONLY입니다. 생성/수정/삭제/입금/재고/회계 처리 요청을 받으면 실제 실행하지 말고, "승인 가능한 실행 기능이 아직 연결되지 않아 조회·판단만 가능합니다"라고 설명합니다.
8. ACTION 태그, SQL, 숨겨진 DB 명령을 출력하거나 실행하려 하지 않습니다.
9. 현재 페이지 정보가 제공되면 사용자가 "여기", "이 화면", "이 거래처"라고 말할 때 페이지 문맥을 우선 사용하되, 특정 거래처가 문맥에서 확정되지 않으면 확인 질문을 합니다.
10. 답변은 한국어로, 핵심 결론을 먼저 말하고 필요한 숫자와 근거를 짧게 제시합니다.
11. 사용자가 "지금 제일 먼저 할 일"을 물으면 연체 미수금 → 단기 현금부족 → 생산차질 위험 → 임박 수금 → 목표매출 부족 순으로 실제 존재하는 항목을 우선합니다.
12. 회사 내부 수치를 답할 때 가능하면 날짜/기준월을 같이 적습니다.`
}

function extractGeminiText(payload: Json) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  const parts = candidates.flatMap((candidate: Json) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
  return parts.map((part: Json) => text(part.text, 12000)).filter(Boolean).join('\n').trim()
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (session?.role !== 'admin') {
      return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null) as AgentRequest | null
    const message = text(body?.message, MAX_MESSAGE_LENGTH)
    if (!message) return NextResponse.json({ ok: false, error: '질문을 입력해 주세요.' }, { status: 400 })

    const apiKey = text(process.env.GOOGLE_AI_API_KEY, 500)
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'Google AI API Key가 서버에 설정되지 않았습니다.' }, { status: 503 })
    }

    const page = cleanPage(body?.page)
    const history = normalizeHistory(body?.messages)
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
      receivables: receivablesContext(receivablesRaw),
      sales_targets: targetContext(targetsRaw),
      financial_control: financialContext(financeRaw),
      production: productionContext(productionRaw),
      sales_management: includeSales ? salesContext(salesRaw) : { available: false, omitted: true, reason: '현재 질문/페이지에 판매 상세 컨텍스트가 필요하지 않음' },
    }

    const model = resolveModel()
    const contents = history.map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }))
    contents.push({
      role: 'user',
      parts: [{ text: `${message}\n\n[LIVE MONI CONTEXT]\n${JSON.stringify(liveContext)}` }],
    })

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
          maxOutputTokens: 1600,
        },
      }),
      cache: 'no-store',
    })

    const geminiPayload = await geminiResponse.json().catch(() => ({})) as Json
    if (!geminiResponse.ok) {
      const detail = text(geminiPayload?.error?.message, 400) || `Google AI 응답 오류 (${geminiResponse.status})`
      return NextResponse.json({ ok: false, error: detail, model }, { status: 502 })
    }

    const answer = extractGeminiText(geminiPayload)
    if (!answer) {
      return NextResponse.json({ ok: false, error: 'Google AI가 텍스트 응답을 반환하지 않았습니다.', model }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      text: answer,
      model,
      read_only: true,
      context_generated_at: liveContext.generated_at,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'MONI Agent 응답 생성 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}
