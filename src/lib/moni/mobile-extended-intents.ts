export type MobileExtendedDomain =
  | 'product_master'
  | 'production_unit'
  | 'recipe'
  | 'raw_material_master'
  | 'packaging_master'
  | 'sanitation'
  | 'finished_goods_adjustment'
  | 'receivable'
  | 'sales_target'
  | 'sales_client'
  | 'sales_pricing'
  | 'business_person'
  | 'business_opportunity'
  | 'business_activity'
  | 'business_work_log'

export type MobileExtendedOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'DEACTIVATE'
  | 'ADJUST'
  | 'RECEIVE'
  | 'REVERSE'
  | 'SET_DUE'
  | 'SET_RULE'
  | 'SET_TARGET'
  | 'CLEAR_TARGET'

export type MobileExtendedIntent = {
  domain: MobileExtendedDomain
  operation: MobileExtendedOperation
}

const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
const has = (value: string, pattern: RegExp) => pattern.test(compact(value))

function mutation(value: string): 'CREATE' | 'UPDATE' | 'DELETE' | 'DEACTIVATE' | null {
  if (has(value, /(?:삭제|지워|제거|없애)/)) return 'DELETE'
  if (has(value, /(?:비활성|사용\s*중지|거래\s*중지|활동\s*종료)/)) return 'DEACTIVATE'
  if (has(value, /(?:수정|변경|정정|고쳐|바꿔|업데이트|설정|조정|맞춰|반영)/)) return 'UPDATE'
  if (has(value, /(?:등록|추가|신규|생성|입력|작성|기록|만들어|잡아)/)) return 'CREATE'
  return null
}

function hasExplicitWriteCue(value: string) {
  return Boolean(mutation(value))
    || has(value, /(?:처리|실행)\s*(?:해줘|해주세요|해 줘|해라|해)/)
    || has(value, /(?:으로|로)\s*(?:해줘|해주세요|해 줘|바꿔|맞춰)/)
}

export function classifyMobileExtendedIntent(raw: string): MobileExtendedIntent | null {
  const value = compact(raw)
  if (!value) return null

  // Read-only questions must keep flowing through the normal MONI agent.
  // An extended card opens only when the user clearly asks to mutate a PC business form.
  const writeCue = hasExplicitWriteCue(value)

  if (has(value, /(?:완제품|제품)\s*재고.*(?:조정|실사)|(?:재고조정|실사재고).*(?:완제품|제품)/)
      && (writeCue || has(value, /(?:조정|실사)\s*(?:해줘|해주세요|해 줘|해라)/))) {
    return { domain: 'finished_goods_adjustment', operation: 'ADJUST' }
  }

  if (has(value, /(?:입금|수금)/) && !has(value, /(?:매입|지급|대금\s*지급)/)) {
    if (has(value, /(?:취소|되돌|역분개)/)) return { domain: 'receivable', operation: 'REVERSE' }
    if (has(value, /(?:예정일|수금일|입금일).*(?:설정|수정|변경|바꿔)|(?:설정|수정|변경|바꿔).*(?:예정일|수금일|입금일)/)) return { domain: 'receivable', operation: 'SET_DUE' }
    if (has(value, /(?:수금조건|입금조건|결제조건)/) && writeCue) return { domain: 'receivable', operation: 'SET_RULE' }
    if (has(value, /(?:등록|기록|입력|반영|처리|잡아|받은\s*걸\s*넣)/)) return { domain: 'receivable', operation: 'RECEIVE' }
    return null
  }

  if (has(value, /(?:영업|매출)\s*목표|목표\s*매출/)) {
    if (has(value, /(?:해제|삭제|없애)/)) return { domain: 'sales_target', operation: 'CLEAR_TARGET' }
    if (writeCue || has(value, /(?:목표).*(?:으로|로)\s*(?:해줘|해주세요|해 줘)/)) return { domain: 'sales_target', operation: 'SET_TARGET' }
    return null
  }

  if (has(value, /(?:판매규격|판매\s*규격|제품\s*단가|판매\s*단가|거래처별\s*단가|예외\s*단가|MOQ)/)) {
    const op = mutation(value)
    return op || writeCue ? { domain: 'sales_pricing', operation: op || 'UPDATE' } : null
  }

  if (has(value, /(?:거래처|고객사)/) && !has(value, /(?:판매|매출|수금|입금|미수|영업기회|상담|활동)/)) {
    const op = mutation(value)
    return op ? { domain: 'sales_client', operation: op } : null
  }

  if (has(value, /(?:영업기회|파이프라인)/)) {
    const op = mutation(value)
    return op ? { domain: 'business_opportunity', operation: op } : null
  }

  if (has(value, /(?:영업활동|상담기록|상담\s*기록|활동기록)/)) {
    const op = mutation(value)
    return op ? { domain: 'business_activity', operation: op } : null
  }

  if (has(value, /(?:작업시간|근무시간|작업일지|근무일지)/) && has(value, /(?:프리랜서|생산|인력|근무|작업)/) && writeCue) {
    const op = mutation(value)
    return op ? { domain: 'business_work_log', operation: op } : null
  }

  if (has(value, /(?:프리랜서|인력|직원)/) && writeCue) {
    const op = mutation(value)
    return op ? { domain: 'business_person', operation: op } : null
  }

  // The current PC sanitation page creates inspection logs; it does not expose edit/delete.
  if (has(value, /(?:위생점검|위생\s*점검|위생일지|위생\s*일지)/)
      && has(value, /(?:등록|입력|작성|기록|추가|신규|생성)/)) {
    return { domain: 'sanitation', operation: 'CREATE' }
  }

  if (has(value, /(?:생산단위|생산\s*단위)/)) {
    const op = mutation(value)
    return op ? { domain: 'production_unit', operation: op } : null
  }

  if (has(value, /(?:레시피|배합비|배합\s*비율)/)) {
    const op = mutation(value)
    return op ? { domain: 'recipe', operation: op } : null
  }

  // Inbound/transaction requests are intentionally left to the existing V2 transaction cards.
  if (has(value, /(?:원재료|원료)/) && !has(value, /(?:입고|매입|수불|재고조정)/)) {
    const op = mutation(value)
    return op ? { domain: 'raw_material_master', operation: op } : null
  }

  if (has(value, /(?:부재료|포장재|포장\s*자재)/) && !has(value, /(?:입고|매입|수불)/)) {
    const op = mutation(value)
    return op ? { domain: 'packaging_master', operation: op } : null
  }

  if (has(value, /(?:제품\s*마스터|제품\s*등록|제품\s*정보|품목\s*등록|품목\s*정보|제품\s*추가|품목\s*추가)/)) {
    const op = mutation(value)
    return op ? { domain: 'product_master', operation: op } : null
  }

  return null
}

export function mobileExtendedCardText(intent: MobileExtendedIntent) {
  const labels: Record<MobileExtendedDomain, string> = {
    product_master: '제품 정보',
    production_unit: '생산단위',
    recipe: '레시피',
    raw_material_master: '원재료 정보',
    packaging_master: '부재료 정보',
    sanitation: '위생점검 일지',
    finished_goods_adjustment: '완제품 재고조정',
    receivable: '수금·미수금',
    sales_target: '영업 목표매출',
    sales_client: '거래처 정보',
    sales_pricing: '판매규격·단가',
    business_person: '인력 정보',
    business_opportunity: '영업기회',
    business_activity: '영업활동',
    business_work_log: '근무·작업시간',
  }
  const actionLabel = intent.operation === 'UPDATE' ? '변경 내용 확인' : intent.operation === 'DELETE' ? '삭제 내용 확인' : intent.operation === 'DEACTIVATE' ? '비활성화 내용 확인' : intent.operation === 'ADJUST' ? '조정 내용 확인' : intent.operation === 'REVERSE' ? '취소 내용 확인' : intent.operation === 'RECEIVE' ? '수금 내용 확인' : intent.operation === 'SET_DUE' || intent.operation === 'SET_RULE' || intent.operation === 'SET_TARGET' || intent.operation === 'CLEAR_TARGET' ? '설정 내용 확인' : '입력 내용 확인'
  return `${labels[intent.domain]} 입력 카드를 열었습니다. 현재 PC 업무폼과 같은 기준으로 값을 확인·수정한 뒤 ‘${actionLabel}’을 눌러 주세요.`
}
