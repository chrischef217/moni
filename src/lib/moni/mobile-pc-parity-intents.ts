export type MobilePcParityDomain =
  | 'raw_material_pricing'
  | 'purchase_supplier'
  | 'purchase_receipt'
  | 'export_destination'
  | 'export_item'
  | 'official_document'
  | 'financial_cash'
  | 'financial_account'
  | 'financial_balance'
  | 'company_profile'
  | 'sales_return_credit'
  | 'raw_material_mapping'

export type MobilePcParityOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERSE'
export type MobilePcParityIntent = { domain: MobilePcParityDomain; operation: MobilePcParityOperation }

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const has = (value: string, pattern: RegExp) => pattern.test(value)

export function classifyMobilePcParityIntent(value: unknown): MobilePcParityIntent | null {
  const text = normalize(value)
  if (!text) return null
  const remove = has(text, /(삭제|지워|제거|없애)/)
  const update = has(text, /(수정|변경|정정|고쳐|바꿔|업데이트|설정)/)
  const create = has(text, /(등록|입력|작성|추가|생성|만들|새로|발행|잡아|처리|반영)/)
  const reverse = has(text, /(취소|되돌|역분개)/)

  if (has(text, /(원재료|원료)/) && has(text, /(기준\s*단가|포장\s*단가|매입\s*단가|kg\s*단가|가격)/) && (update || create)) {
    return { domain: 'raw_material_pricing', operation: 'UPDATE' }
  }

  if (has(text, /(매입처|구매처|공급처)/) && !has(text, /(입고|매입\s*내역|구매\s*내역)/)) {
    if (remove) return { domain: 'purchase_supplier', operation: 'DELETE' }
    if (update) return { domain: 'purchase_supplier', operation: 'UPDATE' }
    if (create) return { domain: 'purchase_supplier', operation: 'CREATE' }
  }

  if (has(text, /(매입[·\s-]*입고|입고\s*내역|매입\s*내역|구매\s*내역)/)) {
    if (remove) return { domain: 'purchase_receipt', operation: 'DELETE' }
    if (update) return { domain: 'purchase_receipt', operation: 'UPDATE' }
  }

  if (has(text, /(수출처|수출\s*거래처|해외\s*거래처)/)) {
    if (update) return { domain: 'export_destination', operation: 'UPDATE' }
    if (create) return { domain: 'export_destination', operation: 'CREATE' }
  }

  if (has(text, /(수출품목|수출\s*품목|수출\s*제품\s*설정|hs\s*code|hs코드)/i)) {
    if (update) return { domain: 'export_item', operation: 'UPDATE' }
    if (create) return { domain: 'export_item', operation: 'CREATE' }
  }

  if (has(text, /(대외\s*공문|공문)/)) {
    if (remove) return { domain: 'official_document', operation: 'DELETE' }
    if (update) return { domain: 'official_document', operation: 'UPDATE' }
    if (create) return { domain: 'official_document', operation: 'CREATE' }
  }

  if (has(text, /(현금흐름|입출금|입금\s*예정|출금\s*예정|지출\s*예정|직접\s*입출금)/)) {
    if (reverse) return { domain: 'financial_cash', operation: 'REVERSE' }
    if (update) return { domain: 'financial_cash', operation: 'UPDATE' }
    if (create) return { domain: 'financial_cash', operation: 'CREATE' }
  }

  if (has(text, /(재무\s*계좌|현금함|계좌\s*관리)/)) {
    if (update) return { domain: 'financial_account', operation: 'UPDATE' }
    if (create) return { domain: 'financial_account', operation: 'CREATE' }
  }

  if (has(text, /(계좌|현금함).*(잔액|기초잔액)|잔액.*(등록|입력|수정|변경)/)) {
    return { domain: 'financial_balance', operation: 'CREATE' }
  }

  if (has(text, /(회사\s*설정|회사\s*기본정보|사업자\s*정보|회사\s*정보|로고|대표자\s*서명)/) && (update || create)) {
    return { domain: 'company_profile', operation: 'UPDATE' }
  }

  if (has(text, /(제품\s*반품|판매\s*반품|매출\s*차감|반품\s*전표|차감\s*전표)/) && (create || has(text, /(반품|차감).*(해줘|해주세요|처리)/))) {
    return { domain: 'sales_return_credit', operation: 'CREATE' }
  }

  if (has(text, /(원재료\s*매핑|원료\s*매핑|레시피.*원재료.*연결|식품유형.*원재료.*연결)/)) {
    if (remove) return { domain: 'raw_material_mapping', operation: 'DELETE' }
    if (update) return { domain: 'raw_material_mapping', operation: 'UPDATE' }
    if (create || has(text, /(연결|매핑)/)) return { domain: 'raw_material_mapping', operation: 'CREATE' }
  }

  return null
}

export function mobilePcParityCardText(intent: MobilePcParityIntent) {
  const labels: Record<MobilePcParityDomain, string> = {
    raw_material_pricing: '원재료 기준단가', purchase_supplier: '매입처', purchase_receipt: '매입·입고',
    export_destination: '수출처', export_item: '수출품목', official_document: '대외 공문',
    financial_cash: '현금흐름 입출금', financial_account: '재무 계좌/현금함', financial_balance: '계좌 잔액',
    company_profile: '회사 설정', sales_return_credit: '반품·매출차감', raw_material_mapping: '원재료 매핑',
  }
  const op = intent.operation === 'CREATE' ? '입력' : intent.operation === 'UPDATE' ? '수정' : intent.operation === 'DELETE' ? '삭제' : '취소'
  return `${labels[intent.domain]} ${op} 카드를 열었습니다. PC와 같은 저장 규칙으로 미리보기 후 확정 실행됩니다.`
}
