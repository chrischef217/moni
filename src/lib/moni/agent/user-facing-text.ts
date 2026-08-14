const INTERNAL_LABELS: Array<[RegExp, string]> = [
  [/\bunaccounted[_\s-]*gap(?:_g)?\b/gi, '계획-완료 차이'],
  [/\bopen_planned_quantity_g\b/gi, '미완료 작업지시 계획량'],
  [/\bcompleted_planned_quantity_g\b/gi, '완료 작업지시 계획량'],
  [/\bcompleted_actual_quantity_g\b/gi, '완료 실제 생산량'],
  [/\bcompleted_plan_gap_g\b/gi, '완료 기록 계획-실적 차이'],
  [/\bcompleted_achievement_rate_percent\b/gi, '완료 작업지시 달성률'],
  [/\bsearch_production_records\b/gi, '생산 기록 조회'],
  [/\bsearch_production_plans\b/gi, '생산 계획 조회'],
  [/\bsearch_sales_and_receivables\b/gi, '매출·수금 조회'],
  [/\bsearch_purchases_and_payables\b/gi, '매입·지급 조회'],
  [/\bget_monthly_management_snapshot\b/gi, '월간 경영 데이터 조회'],
  [/\bget_monthly_management_comparison\b/gi, '월간 비교 데이터 조회'],
  [/\btool[_\s-]*call(?:_count)?\b/gi, '내부 조회'],
  [/\bbusiness_id\b/gi, '사업자 기준'],
  [/\bopenai_conversation_id\b/gi, '대화 연결 정보'],
]

const PDF_REFUSAL_PATTERNS = [
  /PDF\s*파일[^\n.]{0,80}(?:첨부|생성|다운로드)[^\n.]{0,80}(?:권한|없|불가|못)[^\n.]*[.!]?/gi,
  /(?:직접\s*)?(?:첨부|파일\s*생성)[^\n.]{0,60}(?:할\s*수\s*없|지원하지\s*않)[^\n.]*[.!]?/gi,
  /(?:인쇄|프린트)\s*>?\s*PDF로\s*저장[^\n.]*[.!]?/gi,
]

function protectMarkdownDestinations(value: string) {
  const destinations: string[] = []
  const output = value.replace(/\]\(([^)]+)\)/g, (_match, destination: string) => {
    const index = destinations.push(destination) - 1
    return `](MONI_LINK_${index})`
  })
  return {
    output,
    restore: (sanitized: string) => sanitized.replace(/MONI_LINK_(\d+)/g, (_match, rawIndex: string) => destinations[Number(rawIndex)] || ''),
  }
}

export function sanitizeMoniUserFacingText(value: unknown) {
  const protectedLinks = protectMarkdownDestinations(String(value ?? '').replace(/\r\n/g, '\n'))
  let output = protectedLinks.output
  for (const [pattern, replacement] of INTERNAL_LABELS) output = output.replace(pattern, replacement)

  output = output
    .replace(/`([a-z][a-z0-9]*(?:_[a-z0-9]+){2,})`/g, '내부 지표')
    .replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+){3,})\b/g, '내부 지표')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return protectedLinks.restore(output)
}

export function removePdfCapabilityRefusal(value: unknown) {
  let output = String(value ?? '')
  for (const pattern of PDF_REFUSAL_PATTERNS) output = output.replace(pattern, '')
  output = output
    .replace(/아래\s*[‘'“"]?PDF용\s*원문[’'”"]?으로\s*정리[^\n.]*[.!]?/gi, '')
    .replace(/PDF용\s*원문\s*[:：]?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return output
}

export function isPdfDocumentRequest(value: unknown) {
  const input = String(value ?? '')
  return /(?:\bpdf\b|피디에프)/i.test(input)
    && /(?:파일|문서|보고서|다운로드|만들|작성|생성|저장|변환)/i.test(input)
}

export function isSalesStatementRequest(value: unknown) {
  return /거래\s*(?:명세표|명세서)/i.test(String(value ?? ''))
}
