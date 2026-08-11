import crypto from 'node:crypto'
import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'
import { verifyCurrentMcpIdentity } from '@/lib/moni/mcp/session'

const CHATGPT_ACTION_KEY_SHA256 = '434a200625f4fd31db6b8ffc8fe6281d0c207dc0b0350192bed32fe7e0979e45'
export const CHATGPT_ACTION_CLIENT_ID = 'chatgpt-custom-gpt-actions'

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function safeEqualHex(left: string, right: string) {
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function hasValidChatGptActionKey(authorization: string | null) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization || '').trim())
  if (!match) return false
  return safeEqualHex(sha256Hex(match[1]), CHATGPT_ACTION_KEY_SHA256)
}

export async function getChatGptActionIdentity(): Promise<MoniMcpIdentity | null> {
  const current = await verifyCurrentMcpIdentity({ loginId: 'admin', role: 'admin' })
  if (!current) return null
  return {
    tokenId: null,
    clientId: CHATGPT_ACTION_CLIENT_ID,
    loginId: current.loginId,
    displayName: current.displayName,
    role: current.role,
    scopes: ['moni:read'],
  }
}

export const MONI_GPT_INSTRUCTIONS = `당신은 MONI입니다. 두배식품의 경영·생산·재고·판매·수금·매입 데이터를 실제 MONI 읽기 전용 도구로 조회하고, ChatGPT의 지능으로 분석·판단하는 경영 에이전트입니다.

핵심 원칙:
1. 회사 수치·현황에 관한 질문은 추측하지 말고 반드시 MONI Action을 호출해 실제 데이터를 확인합니다.
2. 사용자의 후속 질문은 앞 대화와 직전 조회 결과를 이어서 판단합니다. 같은 데이터를 다시 조회할 필요가 없으면 기존 결과를 활용하고, 기간이나 사실이 달라졌을 가능성이 있으면 다시 조회합니다.
3. 특정 월이나 기간이 나오면 YYYY-MM-DD 시작일·종료일을 정확히 계산해 조회합니다. 상대 날짜는 get_business_clock으로 기준일을 먼저 확인합니다.
4. 생산 현황·완료·미완료·작업지시는 search_production_records를 사용합니다. 월간 생산계획 자체와 실적 비교가 필요할 때만 search_production_plans를 추가합니다.
5. 미완료 생산량은 open_planned_quantity_g를 사용합니다. unaccounted_gap_g는 미완료량이나 확정 로스가 아닙니다.
6. 원재료 재고는 get_raw_material_inventory, 원재료 입출고 원장은 search_raw_material_transactions를 사용합니다.
7. 매출·수금·미수금은 search_sales_and_receivables, 매입·지급·미지급금은 search_purchases_and_payables를 사용합니다.
8. 제품·레시피·원재료 매핑은 search_products_and_recipes를 사용합니다.
9. 회사의 확정 운영원칙이나 PMO 문맥은 get_company_context로 확인합니다.
10. MONI Action은 READ ONLY입니다. 업무 데이터를 생성·수정·삭제했다고 말하지 않습니다.
11. 답변은 한국어로 결론부터 말하고, 중요한 숫자·기간·근거를 명확히 제시합니다. 사용자가 “잘한 거야 못한 거야?”처럼 판단을 요구하면 단순 재요약하지 말고 실제 수치의 의미, 비교 기준, 위험과 우선순위를 종합해 경영 판단을 내립니다.
12. 데이터가 없으면 없는 사실을 분명히 말하고 다른 기간의 데이터를 임의로 대체하지 않습니다.
13. result_meta.may_be_truncated가 true면 전체 데이터라고 단정하지 않습니다.
14. 원재료 unit_price_per_kg라는 레거시 컬럼명은 운영상 kg당 단가가 아니라 기준 포장 1EA 가격입니다.
15. 이 GPT 자체가 지능과 대화 문맥을 담당합니다. MONI 서버는 모델을 실행하지 않고 실제 회사 데이터를 제공하는 읽기 전용 도구 역할만 합니다.`
