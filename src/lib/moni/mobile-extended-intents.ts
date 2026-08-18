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

const has = (value: string, pattern: RegExp) => pattern.test(value.replace(/\s+/g, ' ').trim())

function mutation(value: string): 'CREATE' | 'UPDATE' | 'DELETE' | 'DEACTIVATE' | null {
  if (has(value, /(?:삭제|지워|제거|없애)/)) return 'DELETE'
  if (has(value, /(?:비활성|사용\s*중지|거래\s*중지|활동\s*종료)/)) return 'DEACTIVATE'
  if (has(value, /(?:수정|변경|정정|고쳐|바꿔|업데이트)/)) return 'UPDATE'
  if (has(value, /(?:등록|추가|신규|생성|입력|작성|만들어)/)) return 'CREATE'
  return null
}

export function classifyMobileExtendedIntent(raw: string): MobileExtendedIntent | null {
  const value = raw.replace(/\s+/g, ' ').trim()
  if (!value) return null

  if (has(value, /(?:완제품|제품)\s*재고.*(?:조정|실사)|(?:재고조정|실사재고).*(?:완제품|제품)/)) {
    return { domain: 'finished_goods_adjustment', operation: 'ADJUST' }
  }

  if (has(value, /(?:입금|수금)/) && !has(value, /(?:매입|지급|대금\s*지급)/)) {
    if (has(value, /(?:취소|되돌|역분개)/)) return { domain: 'receivable', operation: 'REVERSE' }
    if (has(value, /(?:예정일|수금일|입금일).*(?:설정|수정|변경)|(?:설정|수정|변경).*(?:예정일|수금일|입금일)/)) return { domain: 'receivable', operation: 'SET_DUE' }
    if (has(value, /(?:수금조건|입금조건|결제조건)/)) return { domain: 'receivable', operation: 'SET_RULE' }
    return { domain: 'receivable', operation: 'RECEIVE' }
  }

  if (has(value, /(?:영업|매출)\s*목표|목표\s*매출/)) {
    return { domain: 'sales_target', operation: has(value, /(?:해제|삭제|없애)/) ? 'CLEAR_TARGET' : 'SET_TARGET' }
  }

  if (has(value, /(?:판매규격|판매\s*규격|제품\s*단가|판매\s*단가|거래처별\s*단가|예외\s*단가|MOQ)/)) {
    return { domain: 'sales_pricing', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:거래처|고객사)/) && !has(value, /(?:판매|매출|수금|입금|미수|영업기회|상담|활동)/)) {
    return { domain: 'sales_client', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:영업기회|파이프라인)/)) {
    return { domain: 'business_opportunity', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:영업활동|상담기록|상담\s*기록|활동기록)/)) {
    return { domain: 'business_activity', operation: mutation(value) || 'CREATE' }
  }

  if (has(value, /(?:프리랜서|인력|직원)/) && has(value, /(?:등록|수정|변경|비활성|활동\s*종료|재활성|정산조건|계약)/)) {
    return { domain: 'business_person', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:작업시간|근무시간|작업일지|근무일지)/) && has(value, /(?:프리랜서|생산|인력|근무|작업)/)) {
    return { domain: 'business_work_log', operation: mutation(value) || 'CREATE' }
  }

  if (has(value, /(?:위생점검|위생\s*점검|위생일지|위생\s*일지)/)) {
    return { domain: 'sanitation', operation: mutation(value) || 'CREATE' }
  }

  if (has(value, /(?:생산단위|생산\s*단위)/)) {
    return { domain: 'production_unit', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:레시피|배합비|배합\s*비율)/)) {
    return { domain: 'recipe', operation: mutation(value) || 'UPDATE' }
  }

  // Inbound/transaction requests are intentionally left to the V2 transaction cards.
  if (has(value, /(?:원재료|원료)/) && !has(value, /(?:입고|매입|수불|재고조정)/)) {
    return { domain: 'raw_material_master', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:부재료|포장재|포장\s*자재)/) && !has(value, /(?:입고|매입|수불)/)) {
    return { domain: 'packaging_master', operation: mutation(value) || 'UPDATE' }
  }

  if (has(value, /(?:제품\s*마스터|제품\s*등록|제품\s*정보|품목\s*등록|품목\s*정보)/)) {
    return { domain: 'product_master', operation: mutation(value) || 'UPDATE' }
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
  return `${labels[intent.domain]} 입력 카드를 열었습니다. 현재 PC 업무폼과 같은 기준으로 값을 확인·수정한 뒤 ‘변경 내용 확인’을 눌러 주세요.`
}
