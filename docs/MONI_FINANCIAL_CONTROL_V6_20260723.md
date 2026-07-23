# MONI 회계·세무 V6 — 현금흐름 Control

## 목적
MONI의 판매·수금 이후 실제 돈의 이동을 관리한다.

핵심 원칙:
- 매출 ≠ 실제 입금
- 원재료 사용원가 ≠ 실제 현금지출
- 예상 현금흐름 ≠ 은행잔고
- 등록 세무 참고값 ≠ 최종 신고세액

## 실제 현금 유입
이번 달 실제 입금:
1. `sales_receipts.status='posted'` 실제 판매대금 입금
2. `cash_flow.status='posted' AND type='inflow'` 직접 등록 기타 입금

## 실제 현금 유출
이번 달 실제 지출:
1. `cash_flow.status='posted' AND type='outflow'` 직접 등록 실제 지출
2. `freelancer_settlements.status='paid'`이며 `paid_date`가 해당 월인 실지급액(`net_amount`)

원재료 생산소모원가는 실제 구매/결제원장이 아니므로 현금지출 합계에 포함하지 않는다.

## 직접 입출금 원장 — cash_flow V6
기존 빈 `cash_flow` 테이블을 확장했다.

필드:
- type: inflow / outflow
- status: planned / posted / reversed
- category: purchase / operating_expense / payroll / tax / financing / investment / transfer / other
- due_date: 예정일
- actual_date: 실제 입출금일
- amount
- counterpart
- reference_no
- vat_amount
- vat_deductible
- tax_invoice_date
- note
- 취소시 reversed_at / reversal_reason

실제 반영(posted) 후에는 금액을 직접 수정하지 않는다.
오류는 reversed 처리 후 새 기록을 등록한다.

판매대금과 프리랜서 정산은 각각 전용 원장에서 자동 반영되므로 같은 돈을 cash_flow에 중복 입력하지 않는다.

## 30일 예상자금
향후 30일 유입:
- 아직 미수이며 입금예정일이 30일 내인 매출채권
- planned 상태 직접 예정입금

향후 30일 유출:
- planned 상태 직접 예정지출
- confirmed 상태이며 지급예정일이 30일 내인 프리랜서 정산 실지급액

예정 순증감 = 예정유입 - 예정유출.

이 값은 등록된 예정자료만 반영하며 미등록 지출을 추측하지 않는다.

## 계좌·현금함 잔액
은행 API 연동은 현재 없다.
따라서 은행잔고를 현금흐름 누계로 역산하지 않는다.

`finance_accounts`
- 은행계좌 / 현금함
- 계좌 표시정보
- active

`finance_balance_snapshots`
- account_id
- balance_date
- balance_amount

Control Tower의 `등록 계좌잔액`은 각 활성 계좌의 오늘 이하 최신 Snapshot 합계다.
잔액 미등록 계좌와 7일 초과 Snapshot은 경고한다.

## 프리랜서 지급
`freelancer_settlements`에:
- due_date
- paid_date
를 추가했다.

지급완료/지급취소는 DB 함수로 원자적으로 처리한다.
- `mark_freelancer_settlement_paid_v6`
- `reverse_freelancer_settlement_payment_v6`

지급 이벤트는 `finance_settlement_payment_events`에 별도 보존한다.
지급완료를 취소해도 이벤트 이력을 삭제하지 않는다.

## VAT 참고
매출 VAT:
- 해당 월 확정 `sales_orders.vat_amount`

등록 매입 VAT:
- 취소되지 않은 cash_flow 중
- `vat_deductible=true`
- `tax_invoice_date`가 해당 월인 `vat_amount`

등록자료 VAT 차액:
- 매출 VAT - 등록 매입 VAT

이 값은 **등록 자료 기준 참고값이며 실제 신고세액 확정값이 아니다.**
공제요건, 신고조정, 세무상 예외는 별도 검토가 필요하다.

## 원천징수 참고
해당 월 `freelancer_settlements` 중 confirmed/paid 상태의 `withholding_amount`를 참고값으로 표시한다.
신고기한이나 최종 신고여부를 이 숫자만으로 판정하지 않는다.

## Control Tower 연결
V6 이후 메인 화면에 추가:
- 등록 계좌잔액
- 이번 달 실제 입금
- 이번 달 실제 지출
- 이번 달 순현금증감
- 향후 30일 예정 순증감
- 등록자료 VAT 차액
- 프리랜서 원천징수 참고액
- 계좌잔액 최신성 경고
- 30일 예정자금 음수 경고

## 데이터 보호 검증
Production DB에서 transaction rollback 테스트:
- 임시 계좌 1개
- 잔액 Snapshot 1개
- 실제 운영비 지출 1개
을 transaction 안에서 생성해 제약조건을 확인했다.

`posted`인데 `actual_date`가 없는 cash_flow는 CHECK 제약으로 거부됨을 확인했다.
rollback 후 테스트 계좌/입출금 잔존 0건 확인.

## 다음 단계
MONI Intelligence는 위 실제 원천데이터를 바탕으로:
- 연체
- 목표 부족
- 30일 자금부족
- 원재료 부족
- 생산 로스
- 데이터 누락
을 동일 우선순위 체계로 평가한다.
