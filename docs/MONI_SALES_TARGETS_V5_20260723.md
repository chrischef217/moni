# MONI 영업관리 V5 — 월 목표매출

## 목적
영업관리의 목표를 판매관리 실제매출과 연결해 월별로 `목표 → 실제 → 부족액 → 파이프라인 참고금액`을 확인한다.

## 데이터 기준
### 목표 / 실제매출
현재 MONI Control Tower의 기존 매출표시 기준을 보호하여 **부가세 포함 판매합계(`sales_orders.total_amount`)**를 기준으로 한다.

### 파이프라인
`sales_opportunities.expected_amount`에 사용자가 직접 입력한 원금액을 그대로 사용한다.
현재 CRM에는 수주확률 필드가 없으므로 다음과 같은 임의 가중치는 만들지 않는다.
- 리드 10%
- 제안 50%
- 협상 80%

따라서 파이프라인 금액은 실제매출과 합산하지 않고 참고지표로만 표시한다.

## 월 목표
`public.sales_monthly_targets`
- 회사 전체 목표
- 영업 프리랜서 개인 목표
- target_month는 해당 월 1일
- target_amount
- note

회사 목표는 월별 1개만 존재할 수 있다.
개인 목표는 월 × 영업 프리랜서별 1개만 존재할 수 있다.

## 계산
- 실제매출 = 해당 월 `sales_orders.status='confirmed'`의 `total_amount` 합계
- 목표 부족액 = max(목표 - 실제매출, 0)
- 달성률 = 실제매출 / 목표 × 100
- 이번 달 파이프라인 = `close_date`가 해당 월이고 stage가 lead/contacted/proposal/negotiation인 `expected_amount` 합계
- 종료일 미설정 파이프라인은 별도 건수/금액으로 표시
- won 파이프라인은 `won_amount`가 있으면 won_amount, 없으면 expected_amount를 참고값으로 표시

## 영업 담당자
개인 실제매출은 `sales_orders.assigned_person_id` 기준이다.
개인 파이프라인은 `sales_opportunities.assigned_person_id` 기준이다.
영업 프리랜서가 아직 없더라도 회사 전체 목표는 독립적으로 사용할 수 있다.

## 화면
영업관리 > 영업 목표매출
- 월 목표
- 실제 확정매출
- 목표 부족액
- 목표 달성률
- 이번 달 종료예정 파이프라인
- 종료일 미설정 파이프라인
- 영업 담당자별 목표/실적
- 이번 달 파이프라인 목록

## Control Tower
메인 Control Tower에 다음을 연결한다.
- 월 목표매출
- 목표 달성률
- 목표 부족액
- 이번 달 종료예정 파이프라인 건수/금액

## 데이터 보호
목표 테이블 검증은 transaction rollback으로 수행했다.
테스트 목표 123,456,789원을 insert 후 rollback했고 테스트 잔존 행 0건을 확인했다.

## 다음 단계
현금흐름/세금은 별도 원천 데이터를 확인한 뒤 실제 확인 가능한 금액만 연결한다.
