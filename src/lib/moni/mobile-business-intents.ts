export type MobileBusinessDomain =
  | 'raw_material_inbound'
  | 'packaging_inbound'
  | 'production_plan'
  | 'production_work'
  | 'sales_order'
  | 'purchase'
  | 'payment'

export type MobileBusinessOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CANCEL'
  | 'COMPLETE'
  | 'CONFIRM'

export type MobileBusinessIntent = {
  domain: MobileBusinessDomain
  operation: MobileBusinessOperation
}

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const has = (value: string, pattern: RegExp) => pattern.test(value)

export function classifyMobileBusinessIntent(value: unknown): MobileBusinessIntent | null {
  const text = normalize(value)
  if (!text) return null

  const remove = has(text, /(삭제|지워|제거|없애)/)
  const update = has(text, /(수정|변경|정정|고쳐|바꿔|업데이트)/)
  const cancel = has(text, /(취소|철회)/)
  const create = has(text, /(등록|입력|작성|추가|잡아|잡아줘|처리|반영|생성|만들어|발행|해줘|해주세요|해 줘)/)
  const inboundWrite = has(text, /(?:입고|매입).*(?:등록|입력|기록|작성|처리|반영|잡아|해줘|해주세요|해 줘)/)
    || has(text, /(?:등록|입력|기록|작성|처리|반영).*(?:입고|매입)/)

  // 조회 질문은 기존 MONI Agent가 처리한다. 카드 라우팅은 명확한 쓰기 의도가 있을 때만 허용한다.
  if (has(text, /(부재료|포장재|부자재)/) && has(text, /(입고|수불|재고)/)) {
    if (remove) return { domain: 'packaging_inbound', operation: 'DELETE' }
    if (update) return { domain: 'packaging_inbound', operation: 'UPDATE' }
    if (inboundWrite) return { domain: 'packaging_inbound', operation: 'CREATE' }
    return null
  }

  if (has(text, /(원재료|원료)/) && has(text, /(입고|매입|수불|재고)/)) {
    if (remove) return { domain: 'raw_material_inbound', operation: 'DELETE' }
    if (update) return { domain: 'raw_material_inbound', operation: 'UPDATE' }
    if (inboundWrite) return { domain: 'raw_material_inbound', operation: 'CREATE' }
    return null
  }

  if (has(text, /(생산계획|월간 생산계획|생산 계획)/)) {
    if (remove || cancel) return { domain: 'production_plan', operation: 'DELETE' }
    if (update) return { domain: 'production_plan', operation: 'UPDATE' }
    if (create || has(text, /(계획 잡|계획 세|계획해|계획 짜)/)) return { domain: 'production_plan', operation: 'CREATE' }
    return null
  }

  if (has(text, /(생산완료|생산 완료|완료 처리|작업 완료)/)) {
    if (create || has(text, /(?:완료|생산완료).*(?:처리|확정|입력|반영)/)) return { domain: 'production_work', operation: 'COMPLETE' }
    return null
  }
  if (has(text, /(생산확정|생산 확정|원재료 차감|차감 확정)/)) {
    if (create || has(text, /(?:확정|차감).*(?:처리|실행|반영)/)) return { domain: 'production_work', operation: 'CONFIRM' }
    return null
  }
  if (has(text, /(작업지시|생산지시|생산 작업)/)) {
    if (cancel || remove) return { domain: 'production_work', operation: 'CANCEL' }
    if (update) return { domain: 'production_work', operation: 'UPDATE' }
    if (create || has(text, /(?:작업지시|생산지시).*(?:발행|만들|생성)/)) return { domain: 'production_work', operation: 'CREATE' }
    return null
  }

  if (has(text, /(판매|납품|거래명세|매출)/) && !has(text, /(판매단가|판매규격|가격 설정)/)) {
    if (cancel || remove) return { domain: 'sales_order', operation: 'CANCEL' }
    if (update) return { domain: 'sales_order', operation: 'UPDATE' }
    if (create || has(text, /(판매등록|납품등록|거래명세).*(?:발행|생성|작성)/)) return { domain: 'sales_order', operation: 'CREATE' }
    return null
  }

  if (has(text, /(지급|결제|대금 지급|매입대금)/) && !has(text, /(매입처)/)) {
    if (create || has(text, /(?:지급|결제).*(?:등록|처리|실행|반영)/)) return { domain: 'payment', operation: 'CREATE' }
    return null
  }

  if (has(text, /(매입|구매)/) && !has(text, /(원재료.*입고|원료.*입고)/)) {
    if (cancel || remove) return { domain: 'purchase', operation: 'CANCEL' }
    if (create || has(text, /(매입등록|구매등록)/)) return { domain: 'purchase', operation: 'CREATE' }
    return null
  }

  return null
}

export function mobileBusinessCardText(intent: MobileBusinessIntent) {
  const labels: Record<MobileBusinessDomain, string> = {
    raw_material_inbound: '원재료 입고',
    packaging_inbound: '부재료 입고',
    production_plan: '생산계획',
    production_work: '생산 작업',
    sales_order: '판매',
    purchase: '매입',
    payment: '지급',
  }
  const op = intent.operation === 'CREATE' ? '입력' : intent.operation === 'UPDATE' ? '수정' : intent.operation === 'DELETE' || intent.operation === 'CANCEL' ? '취소·삭제' : intent.operation === 'COMPLETE' ? '완료' : '확정'
  const actionLabel = intent.operation === 'CREATE' ? '입력 내용 확인' : intent.operation === 'UPDATE' ? '변경 내용 확인' : intent.operation === 'DELETE' ? '삭제 내용 확인' : intent.operation === 'CANCEL' ? '취소 내용 확인' : intent.operation === 'COMPLETE' ? '완료 내용 확인' : '확정 내용 확인'
  return `${labels[intent.domain]} ${op} 카드를 열었습니다. 필요한 값을 확인·수정한 뒤 ‘${actionLabel}’을 눌러 주세요.`
}
