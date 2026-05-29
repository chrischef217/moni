export const AUDIT_CATEGORIES = [
  {
    key: 'tax',
    label: '세금 납부내역',
    shortLabel: '세금',
    description: '부가세, 종합소득세, 납세증명서',
  },
  {
    key: 'loan',
    label: '대출 현황',
    shortLabel: '대출',
    description: '대출잔액확인서, 상환스케줄',
  },
  {
    key: 'card',
    label: '카드 지출내역',
    shortLabel: '카드',
    description: '신한, 기업, 농협, 현대, 국민, 롯데',
  },
  {
    key: 'bank',
    label: '통장 내역',
    shortLabel: '통장',
    description: '추가 통장 및 입출금 거래',
  },
  {
    key: 'etc',
    label: '기타 자료',
    shortLabel: '기타',
    description: '임대차계약서, 설비목록 등',
  },
] as const

export type AuditCategoryKey = (typeof AUDIT_CATEGORIES)[number]['key']

export const AUDIT_CATEGORY_META = Object.fromEntries(
  AUDIT_CATEGORIES.map((category) => [category.key, category]),
) as Record<AuditCategoryKey, (typeof AUDIT_CATEGORIES)[number]>

export const AUDIT_PROMPTS: Record<AuditCategoryKey, string> = {
  tax: `한국 세무 전문가로서 두배(사업자번호 123-38-14284, 대표 배순애) 세금 문서를 분석.
- 부가세: 과세기간별 납부액, 미납/체납 여부, 분납/유예 여부
- 종합소득세: 연도별 납부액, 미납 여부
- 연도별 세금 납부액 합계
- 체납 시 금액과 사유 추정
- 감사 소견 (매우 디테일하게 전문가 소견 필요)
모든 금액은 원 단위로 명시. 한국어로 작성.`,
  loan: `한국 금융 전문가로서 분석.
- 금융기관별: 대출종류, 잔액, 금리, 월상환액, 만기일
- 총 부채 합계
- 월 고정 상환액 합계
- 정책자금/보증부 대출 여부
- 감사 소견 (부채비율, 상환능력, 리스크)
모든 금액은 원 단위로 명시. 한국어로 작성.`,
  card: `한국 회계 전문가로서 분석.
- 카드사별 월별 사용액 합계
- 지출 분류: 원재료/포장재, 물류비, 통신/IT, 공과금, 개인혼합지출, 기타사업비
- 할부 잔액
- 현금서비스 이용 내역
- 사업 vs 개인 지출 비율 추정
- 감사 소견
모든 금액은 원 단위로 명시. 한국어로 작성.`,
  bank: `한국 회계 전문가로서 분석.
- 연도별 입금/출금 합계
- 주요 입금처 TOP 10
- 주요 출금처 TOP 10
- 특이 거래 패턴
- 감사 소견
모든 금액은 원 단위로 명시. 한국어로 작성.`,
  etc: `한국 경영 전문가로서 분석.
- 문서 종류 및 주요 내용 요약
- 재무 감사 관련 핵심 수치/조건
- 투자 검토 시 중요 사항
- 감사 소견
한국어로 작성.`,
}

export function isAuditCategory(value: unknown): value is AuditCategoryKey {
  return typeof value === 'string' && value in AUDIT_CATEGORY_META
}
