export type MoniEtaKind =
  | 'monthly-comparison'
  | 'monthly-report'
  | 'lot-lookup'
  | 'production-read'
  | 'sales-read'
  | 'inventory-read'
  | 'write-operation'
  | 'general'

export type MoniThinkingStage = 'normal' | 'grace' | 'detail-1' | 'detail-2' | 'apology'

export const MONI_ETA_DEFAULTS: Record<MoniEtaKind, number> = {
  'monthly-comparison': 22,
  'monthly-report': 18,
  'lot-lookup': 14,
  'production-read': 16,
  'sales-read': 15,
  'inventory-read': 15,
  'write-operation': 18,
  general: 12,
}

const MUTATION_OBJECT = /(생산계획|작업지시|작업지시서|생산완료|생산확정|원재료\s*차감)/
const MUTATION_ACTION = /(등록|생성|만들|추가|수정|변경|취소|삭제|완료\s*(?:처리|입력|해|시켜)|확정\s*(?:처리|해|시켜)|차감\s*(?:처리|해|시켜)|실행|진행)/

export function classifyMoniEtaKind(question: string): MoniEtaKind {
  const normalized = String(question || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return 'general'

  if (MUTATION_OBJECT.test(normalized) && MUTATION_ACTION.test(normalized)) return 'write-operation'
  if (/\bLOT\d{8}-\d+\b/i.test(normalized)) return 'lot-lookup'

  const months = normalized.match(/(?:20\d{2}\s*년\s*)?(?:1[0-2]|0?[1-9])\s*월/g) || []
  const relativeMonth = /(지난\s*달|전월|이번\s*달|이번\s*월|금월|현재\s*월)/.test(normalized)
  const comparison = /(비교|차이|대비|두\s*달|두\s*가지|각각)/.test(normalized)
  const analysis = /(분석|종합|요약|평가|현황|상황|예측|보고|비교|차이|대비|알려|보여|조회)/.test(normalized)
  const production = /(생산|작업지시|생산계획|생산실적)/.test(normalized)
  const management = /(경영|매출|판매|수금|매입|지급|손익|현금흐름)/.test(normalized)

  if (months.length >= 2 && comparison && (production || management)) return 'monthly-comparison'
  if ((months.length >= 1 || relativeMonth) && analysis && (production || management)) return 'monthly-report'
  if (/(재고|원재료|입고|출고|입출고|소모|소비|사용량)/.test(normalized)) return 'inventory-read'
  if (/(매출|판매|수금|미수|거래처|고객사|판매처)/.test(normalized)) return 'sales-read'
  if (production) return 'production-read'
  return 'general'
}

export function thinkingStage(elapsedSeconds: number, estimatedSeconds: number): MoniThinkingStage {
  const overtime = Math.max(0, Math.floor(elapsedSeconds - estimatedSeconds))
  if (elapsedSeconds < estimatedSeconds) return 'normal'
  if (overtime < 10) return 'grace'
  if (overtime < 20) return 'detail-1'
  if (overtime < 30) return 'detail-2'
  return 'apology'
}

export function heartbeatDelayMs(stage: MoniThinkingStage) {
  if (stage === 'grace') return 1040
  if (stage === 'detail-1') return 820
  if (stage === 'detail-2') return 640
  if (stage === 'apology') return 500
  return 1320
}

export function robustEtaEstimate(samplesSeconds: number[], fallbackSeconds: number) {
  const samples = samplesSeconds
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 2 && value <= 120)
    .slice(0, 16)

  if (!samples.length) return Math.round(fallbackSeconds)
  const sorted = [...samples].sort((a, b) => a - b)
  const usable = sorted.length >= 7 ? sorted.slice(1, -1) : sorted
  const index = Math.min(usable.length - 1, Math.max(0, Math.floor((usable.length - 1) * 0.6)))
  const percentile = usable[index]
  return Math.max(5, Math.min(60, Math.round(percentile + 2)))
}

export function fallbackProgressText(kind: MoniEtaKind, stage: MoniThinkingStage) {
  const base: Record<MoniEtaKind, string> = {
    'monthly-comparison': '두 기간의 생산·경영 집계를 서로 맞춰 비교값을 확인하고 있습니다.',
    'monthly-report': '요청한 기간의 생산·경영 데이터를 모아 합계와 세부 항목을 확인하고 있습니다.',
    'lot-lookup': '지정한 LOT의 생산기록과 연결된 항목을 확인하고 있습니다.',
    'production-read': '생산계획·작업지시·생산실적 중 질문에 필요한 기록을 확인하고 있습니다.',
    'sales-read': '매출·수금·거래처 데이터를 질문 범위에 맞춰 확인하고 있습니다.',
    'inventory-read': '원재료·재고·입출고 기록을 질문 범위에 맞춰 확인하고 있습니다.',
    'write-operation': '현재 업무값과 승인 전 미리보기 조건을 확인하고 있습니다.',
    general: '질문에 필요한 회사 데이터와 답변 근거를 확인하고 있습니다.',
  }

  if (stage === 'detail-2') return `${base[kind]} 조회 결과 사이의 정합성도 함께 확인하는 중입니다.`
  if (stage === 'apology') return `${base[kind]} 예상보다 조회 범위가 커 최종 답변 정리에 시간이 더 필요합니다.`
  return base[kind]
}
