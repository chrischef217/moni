import { Agent, run } from '@openai/agents'

export type MobileSalesExportExtractedItem = {
  name: string
  specification?: string
  quantity?: number | null
  unit?: string
  cartons?: number | null
  unit_price?: number | null
}

export type MobileSalesExportContext = {
  consignee_query?: string
  document_date?: string
  bill_to?: string
  port_of_loading?: string
  final_destination?: string
  vessel_flight?: string
  sailing_date?: string
  notify_party?: string
  terms_delivery_payment?: string
  incoterm?: string
  country_of_origin?: string
  reason_for_export?: string
  items: MobileSalesExportExtractedItem[]
}

const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseJson(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('대화 업무값 추출 결과가 JSON 형식이 아닙니다.')
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
}

function normalizeOutput(raw: Record<string, unknown>): MobileSalesExportContext {
  const rows = Array.isArray(raw.items) ? raw.items : []
  const items = rows.map((row) => {
    const item = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    return {
      name: text(item.name, 240),
      specification: text(item.specification, 240) || undefined,
      quantity: numberOrNull(item.quantity),
      unit: text(item.unit, 40).toUpperCase() || undefined,
      cartons: numberOrNull(item.cartons),
      unit_price: numberOrNull(item.unit_price),
    }
  }).filter((row) => row.name)

  return {
    consignee_query: text(raw.consignee_query, 240) || undefined,
    document_date: text(raw.document_date, 20) || undefined,
    bill_to: text(raw.bill_to, 300) || undefined,
    port_of_loading: text(raw.port_of_loading, 160) || undefined,
    final_destination: text(raw.final_destination, 160) || undefined,
    vessel_flight: text(raw.vessel_flight, 160) || undefined,
    sailing_date: text(raw.sailing_date, 20) || undefined,
    notify_party: text(raw.notify_party, 300) || undefined,
    terms_delivery_payment: text(raw.terms_delivery_payment, 300) || undefined,
    incoterm: text(raw.incoterm, 40).toUpperCase() || undefined,
    country_of_origin: text(raw.country_of_origin, 120) || undefined,
    reason_for_export: text(raw.reason_for_export, 240) || undefined,
    items,
  }
}

export async function extractMobileSalesExportContext(input: {
  currentMessage: string
  history: Array<{ role: string; content: string }>
}) {
  const history = input.history.slice(-12).map((row) => `${row.role === 'assistant' ? 'MONI' : '사용자'}: ${text(row.content, 2400)}`).join('\n')
  const model = text(process.env.OPENAI_MONI_MODEL, 100) || 'gpt-5'
  const agent = new Agent({
    name: 'MONI Mobile Export Context Extractor',
    model,
    modelSettings: { parallelToolCalls: false },
    instructions: `당신은 MONI 모바일 업무값 추출기입니다. 대화에서 사용자가 이미 제공하거나 명확히 확정한 수출 거래 사실만 JSON으로 추출합니다.\n\n절대 규칙:\n1. 제품 ID, 거래처 ID, 수출품목 설정 ID를 만들거나 추측하지 마세요. 이름/규격/수량 같은 사용자 제공 텍스트 사실만 추출합니다.\n2. MONI의 이전 답변은 맥락 참고용입니다. 사용자가 정정한 내용이 있으면 사용자 최신 내용을 우선합니다. MONI가 제안만 한 값은 사용자 확정으로 간주하지 않습니다.\n3. 제품명이 애매하거나 오타처럼 보여도 임의로 공식 제품명으로 교정하지 말고 사용자가 말한 이름 그대로 남깁니다.\n4. 수량 단위는 KG, EA, CTN, BOX 중 대화에 명시된 것을 사용하고, 불명확하면 빈 문자열로 둡니다.\n5. 날짜가 명시되지 않았으면 document_date는 빈 문자열입니다.\n6. 없는 값은 빈 문자열 또는 null로 두고 질문을 생성하지 마세요.\n7. 출력은 설명 없이 JSON 객체 하나만 반환합니다.\n\n스키마:\n{\n  "consignee_query":"",\n  "document_date":"",\n  "bill_to":"",\n  "port_of_loading":"",\n  "final_destination":"",\n  "vessel_flight":"",\n  "sailing_date":"",\n  "notify_party":"",\n  "terms_delivery_payment":"",\n  "incoterm":"",\n  "country_of_origin":"",\n  "reason_for_export":"",\n  "items":[{"name":"","specification":"","quantity":null,"unit":"","cartons":null,"unit_price":null}]\n}`,
  })

  const prompt = `[최근 대화]\n${history}\n\n[현재 요청]\n${text(input.currentMessage, 4000)}\n\n위 대화에서 이미 제공된 수출 거래 업무값만 추출하세요.`
  const result = await run(agent, prompt, { maxTurns: 1 })
  const raw = typeof result.finalOutput === 'string' ? result.finalOutput : JSON.stringify(result.finalOutput ?? {})
  return normalizeOutput(parseJson(raw))
}
