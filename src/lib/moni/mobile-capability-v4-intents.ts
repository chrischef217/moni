export type MobileCapabilityV4Domain =
  | 'production_daily'
  | 'quality_management'
  | 'compliance_management'
  | 'sales_accessory_charge'
  | 'sales_tax_invoice'
  | 'sales_commission_settlement'
  | 'hr_required_document'
  | 'freelancer_monthly_settlement'
  | 'settlement_print'
  | 'quote_management'
  | 'financial_audit'
  | 'audit_records'
  | 'control_tower'
  | 'moni_intelligence'

export type MobileCapabilityV4Operation = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESOLVE'

export type MobileCapabilityV4Intent = {
  domain: MobileCapabilityV4Domain
  operation: MobileCapabilityV4Operation
}

const normalized = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const has = (value: string, pattern: RegExp) => pattern.test(value)

function mutation(value: string) {
  if (has(value, /(삭제|제거|지워|없애)/)) return 'DELETE' as const
  if (has(value, /(수정|변경|정정|고쳐|바꿔|취소)/)) return 'UPDATE' as const
  if (has(value, /(등록|추가|생성|작성|발행|업로드|저장|반영|입력|만들)/)) return 'CREATE' as const
  return null
}

export function classifyMobileCapabilityV4Intent(raw: unknown): MobileCapabilityV4Intent | null {
  const value = normalized(raw)
  if (!value) return null

  if (has(value, /(MONI\s*Intelligence|모니\s*인텔리전스|인텔리전스)/i)) {
    return { domain: 'moni_intelligence', operation: 'READ' }
  }
  if (has(value, /(Control\s*Tower|컨트롤\s*타워|경영\s*대시보드|통합\s*대시보드)/i)) {
    return { domain: 'control_tower', operation: 'READ' }
  }

  if (has(value, /(감사\s*기록|감사\s*이력|재무감사\s*결과)/)) {
    return { domain: 'audit_records', operation: 'READ' }
  }
  if (has(value, /(재무\s*감사|회계\s*감사|자체\s*감사)/)) {
    return { domain: 'financial_audit', operation: has(value, /(분석|실행|시작|감사해|검토해|돌려)/) ? 'CREATE' : 'READ' }
  }

  if (has(value, /(정산서).*(출력|인쇄|PDF|pdf|보여|다운로드)|(?:출력|인쇄|PDF|pdf|다운로드).*(?:정산서)/)) {
    return { domain: 'settlement_print', operation: 'READ' }
  }

  if (has(value, /(월별\s*프리랜서\s*정산|프리랜서\s*월(?:별)?\s*정산|프리랜서\s*정산)/)) {
    const op = mutation(value)
    return { domain: 'freelancer_monthly_settlement', operation: op === 'DELETE' ? 'READ' : op || (has(value, /(계산|정산해|정산하|확정)/) ? 'CREATE' : 'READ') }
  }

  if (has(value, /(필수\s*서류|인사\s*서류|계약서\s*파일|신분증\s*파일|통장\s*파일)/)) {
    return { domain: 'hr_required_document', operation: mutation(value) || 'READ' }
  }

  if (has(value, /(영업\s*(?:수당|커미션)\s*정산|영업\s*정산서|판매\s*수당\s*정산)/)) {
    const op = mutation(value)
    return { domain: 'sales_commission_settlement', operation: op === 'DELETE' ? 'READ' : op || (has(value, /(계산|정산해|정산하|확정)/) ? 'CREATE' : 'READ') }
  }

  if (has(value, /(세금\s*계산서|세금계산서)/)) {
    const op = mutation(value)
    return { domain: 'sales_tax_invoice', operation: op || (has(value, /(발행해|발행하|만들어|작성해)/) ? 'CREATE' : 'READ') }
  }

  if (has(value, /(견적서|견적\s*문서|quotation|quote)/i)) {
    return { domain: 'quote_management', operation: mutation(value) || 'READ' }
  }

  if (has(value, /(택배비|배송비|운임|포장비|팔레트비|기타\s*비용|기타비용)/)) {
    const op = mutation(value)
    if (op) return { domain: 'sales_accessory_charge', operation: op === 'DELETE' ? 'UPDATE' : op }
  }

  if (has(value, /(규정\s*준수|규정준수|컴플라이언스|compliance)/i)) {
    const resolve = has(value, /(해결|조치\s*완료|해소|완료\s*처리|resolve)/i)
    return { domain: 'compliance_management', operation: resolve ? 'RESOLVE' : 'READ' }
  }

  if (has(value, /(품질\s*관리|품질관리|품질\s*검사|검사\s*결과|inspection)/i)) {
    const op = mutation(value)
    return { domain: 'quality_management', operation: op === 'CREATE' || op === 'UPDATE' ? 'UPDATE' : 'READ' }
  }

  if (has(value, /(생산\s*일보|생산일보|일일\s*생산\s*현황)/)) {
    return { domain: 'production_daily', operation: 'READ' }
  }

  return null
}

export function isMobileCapabilityV4Write(intent: MobileCapabilityV4Intent) {
  return intent.operation !== 'READ'
}
