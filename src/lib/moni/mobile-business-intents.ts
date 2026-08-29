export type MobileBusinessDomain =
  | 'raw_material_inbound'
  | 'packaging_inbound'
  | 'production_plan'
  | 'production_work'
  | 'sales_order'
  | 'sales_statement'
  | 'sales_export_bundle'
  | 'purchase'
  | 'payment'

export type MobileBusinessOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CANCEL'
  | 'COMPLETE'
  | 'CONFIRM'
  | 'SHOW'

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
  // Generic courtesy endings such as "해줘" are not write intent by themselves.
  // Read requests like "작업지시서 내역 리스트업 좀 해줘" must stay on the Agent read path.
  const create = has(text, /(등록|입력|작성|추가|잡아|잡아줘|처리|반영|생성|만들어|발행)/)
  const inboundWrite = has(text, /(?:입고|매입).*(?:등록|입력|기록|작성|처리|반영|잡아)/)
    || has(text, /(?:등록|입력|기록|작성|처리|반영).*(?:입고|매입)/)
    || has(text, /(?:입고|매입)\s*(?:해줘|해주세요|해 줘)$/)
  const v4SalesSpecial = /(택배비|배송비|운임|포장비|팔레트비|기타\s*비용|기타비용|세금\s*계산서|세금계산서|견적서|영업\s*(?:수당|커미션)\s*정산|영업\s*정산서)/

  // 거래명세표 + Commercial Invoice/Packing List를 함께 요청하면 하나의 수출 문서 번들로 처리한다.
  // 거래명세표 분기보다 먼저 판단해야 복합 요청이 빈 국내 판매 카드로 축소되지 않는다.
  const hasExportDocs = has(text, /(commercial\s*invoice|invoice|인보이스|packing\s*list|packinglist|패킹\s*리스트|패킹리스트)/i)
  const exportBundleWrite = hasExportDocs && (create || has(text, /(거래\s*명세(?:표)?|수출|export|문서|서류)/i))
  if (exportBundleWrite && !remove && !cancel && !update) return { domain: 'sales_export_bundle', operation: 'CREATE' }

  // 거래명세표는 매출 입력과 별도 업무 목적이다.
  if (has(text, /거래\s*명세(?:표)?/)) {
    const statementWrite = has(text, /거래\s*명세(?:표)?(?:를|을|은|는|이|가)?\s*(?:입력|작성|발행|생성|만들|등록|새로)/)
      || has(text, /(?:입력|작성|발행|생성|만들|등록)\s*(?:할|해야|해|해서|하고|하자|해줘|해주세요)?\s*(?:거래\s*명세(?:표)?)/)
    const statementShow = has(text, /거래\s*명세(?:표)?(?:를|을|은|는|이|가)?\s*(?:보여|열어|띄워|확인|조회|다시\s*봐|출력)/)
      || has(text, /(?:보여|열어|띄워|확인|조회|출력).*(?:거래\s*명세(?:표)?)/)
      || has(text, /(?:거래\s*명세(?:표)?).*(?:pdf|PDF)/)
    if (statementWrite) return { domain: 'sales_statement', operation: 'CREATE' }
    if (statementShow && !update && !cancel && !remove) return { domain: 'sales_statement', operation: 'SHOW' }
    return null
  }

  // 조회 질문은 기존 MONI Agent가 처리한다. 카드 라우팅은 명확한 쓰기 의도가 있을 때만 허용한다.
  if (has(text, /(부재료|포장재|부자재)/) && has(text, /(입고|수불)/)) {
    if (remove) return { domain: 'packaging_inbound', operation: 'DELETE' }
    if (update) return { domain: 'packaging_inbound', operation: 'UPDATE' }
    if (inboundWrite) return { domain: 'packaging_inbound', operation: 'CREATE' }
    return null
  }

  if (has(text, /(원재료|원료)/) && has(text, /(입고|매입|수불)/)) {
    if (remove) return { domain: 'raw_material_inbound', operation: 'DELETE' }
    if (update) return { domain: 'raw_material_inbound', operation: 'UPDATE' }
    if (inboundWrite) return { domain: 'raw_material_inbound', operation: 'CREATE' }
    return null
  }

  if (has(text, /(생산계획|월간 생산계획|생산 계획)/)) {
    if (remove || cancel) return { domain: 'production_plan', operation: 'DELETE' }
    if (update) return { domain: 'production_plan', operation: 'UPDATE' }
    if (create || has(text, /(계획 잡|계획 세|계획해|계획 짜)/) || has(text, /(?:생산계획|생산 계획)\s*(?:해줘|해주세요|해 줘)$/)) return { domain: 'production_plan', operation: 'CREATE' }
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
    if (create || has(text, /(?:작업지시|생산지시).*(?:발행|만들|생성)/) || has(text, /(?:작업지시(?:서)?|생산지시)\s*(?:해줘|해주세요|해 줘)$/)) return { domain: 'production_work', operation: 'CREATE' }
    return null
  }

  if (has(text, /(판매|납품|매출)/) && !has(text, /(판매단가|판매규격|가격 설정)/) && !has(text, v4SalesSpecial)) {
    if (cancel || remove) return { domain: 'sales_order', operation: 'CANCEL' }
    if (update) return { domain: 'sales_order', operation: 'UPDATE' }
    if (create || has(text, /(판매등록|납품등록|매출등록)/) || has(text, /(?:판매|납품|매출)\s*(?:해줘|해주세요|해 줘)$/)) return { domain: 'sales_order', operation: 'CREATE' }
    return null
  }

  if (has(text, /(지급|결제|대금 지급|매입대금)/) && !has(text, /(매입처)/)) {
    if (create || has(text, /(?:지급|결제).*(?:등록|처리|실행|반영)/) || has(text, /(?:지급|결제)\s*(?:해줘|해주세요|해 줘)$/)) return { domain: 'payment', operation: 'CREATE' }
    return null
  }

  if (has(text, /(매입|구매)/) && !has(text, /(원재료.*입고|원료.*입고)/)) {
    if (cancel || remove) return { domain: 'purchase', operation: 'CANCEL' }
    if (create || has(text, /(매입등록|구매등록)/) || has(text, /(?:매입|구매)\s*(?:해줘|해주세요|해 줘)$/)) return { domain: 'purchase', operation: 'CREATE' }
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
    sales_statement: '거래명세표',
    sales_export_bundle: '거래명세표 + 수출 Invoice + Packing List',
    purchase: '매입',
    payment: '지급',
  }
  if (intent.domain === 'sales_statement' && intent.operation === 'SHOW') return '이 대화에서 가장 최근에 생성한 거래건의 거래명세표를 불러옵니다.'
  if (intent.domain === 'sales_export_bundle') return '앞 대화에서 이미 제공한 품목·수량·수출정보를 자동으로 불러와 거래명세표 + Commercial Invoice + Packing List 생성 준비를 합니다. 이미 말한 값은 다시 입력시키지 않고, 정확히 확인이 필요한 값만 표시합니다.'
  const op = intent.operation === 'CREATE' ? (intent.domain === 'sales_statement' ? '작성' : '입력') : intent.operation === 'UPDATE' ? '수정' : intent.operation === 'DELETE' || intent.operation === 'CANCEL' ? '취소·삭제' : intent.operation === 'COMPLETE' ? '완료' : '확정'
  const actionLabel = intent.operation === 'CREATE' ? '입력 내용 확인' : intent.operation === 'UPDATE' ? '변경 내용 확인' : intent.operation === 'DELETE' ? '삭제 내용 확인' : intent.operation === 'CANCEL' ? '취소 내용 확인' : intent.operation === 'COMPLETE' ? '완료 내용 확인' : '확정 내용 확인'
  return `${labels[intent.domain]} ${op} 카드를 열었습니다. 필요한 값을 확인·수정한 뒤 ‘${actionLabel}’을 눌러 주세요.`
}
