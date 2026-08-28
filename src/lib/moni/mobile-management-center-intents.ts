export type MobileManagementCenterDomain =
  | 'sales_statement_history'
  | 'export_document_history'
  | 'official_document_history'
  | 'tax_control'

export type MobileManagementCenterIntent = {
  domain: MobileManagementCenterDomain
  operation: 'READ'
}

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const has = (value: string, pattern: RegExp) => pattern.test(value)

export function classifyMobileManagementCenterIntent(raw: unknown): MobileManagementCenterIntent | null {
  const value = normalize(raw)
  if (!value) return null

  const writeCue = has(value, /(등록|추가|작성|생성|발행|수정|변경|삭제|취소|반영|입력|만들어|만들어줘)/)
  const historyCue = has(value, /(전체|목록|이력|지난|과거|기간|검색|찾아|관리|현황|내역|조회)/)

  if (has(value, /(현금\s*흐름.*세무|현금흐름.*세무|재무.*세무|세무.*종합|세무.*현황|세무.*관리|세무.*대시보드|세무.*전체|이번\s*달.*세무|이번달.*세무|월별.*세무)/)) {
    return { domain: 'tax_control', operation: 'READ' }
  }

  if (has(value, /(수출\s*서류|수출서류|수출\s*문서|수출문서)/) && (historyCue || has(value, /(보여|열어)/))) {
    return { domain: 'export_document_history', operation: 'READ' }
  }

  if (has(value, /(대외\s*공문|공문)/) && !writeCue && (historyCue || has(value, /(보여|열어|출력|인쇄|pdf)/i))) {
    return { domain: 'official_document_history', operation: 'READ' }
  }

  if (has(value, /거래\s*명세(?:표)?/) && !writeCue && historyCue) {
    return { domain: 'sales_statement_history', operation: 'READ' }
  }

  return null
}

export function mobileManagementCenterText(intent: MobileManagementCenterIntent) {
  const labels: Record<MobileManagementCenterDomain, string> = {
    sales_statement_history: '거래명세표 전체 이력',
    export_document_history: '수출서류 전체 이력',
    official_document_history: '대외공문 조회·출력',
    tax_control: '현금흐름·세무 종합관리',
  }
  return `${labels[intent.domain]} 관리 카드를 열었습니다. 기간과 조건을 선택하면 모바일에서 필요한 정보만 빠르게 조회할 수 있습니다.`
}
