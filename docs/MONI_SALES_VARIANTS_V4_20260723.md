# MONI 판매관리 V4 — 다중 판매규격·단가

## 목적
생산 Product Master의 제품 정의는 그대로 유지하면서, 실제 판매 시 제품 하나에 여러 판매규격과 가격을 사용할 수 있게 한다.

예:
- 같은 완제품 → 1kg 파우치 / 5kg 벌크 / 10EA BOX
- 각 규격마다 기본 판매단가와 MOQ
- 거래처마다 해당 규격의 별도 납품단가와 MOQ
- 거래처에 연결된 영업 프리랜서별 원/kg 정산단가

## 데이터 모델
### sales_product_variants
제품별 판매 전용 규격.
- product_id
- variant_name
- sales_unit: kg / ea / box
- unit_weight_g
- box_units
- default_unit_price
- moq_quantity
- is_default
- active

### sales_client_variant_terms
거래처 × 판매규격별 조건.
- unit_price
- moq_quantity
- active
- note

### sales_client_variant_agents
거래처 규격 조건별 영업 프리랜서 정산단가.
- settlement_rate_per_kg

### sales_order_items
판매 당시 Snapshot을 위해:
- sales_variant_id
- sales_variant_name
을 저장한다.

## 기존 V2 데이터 이전
기존 `sales_product_settings`의 비반제품 판매설정은 각 제품의 `기본 규격`으로 1회 복사했다.
Production DB 확인:
- 판매규격 83개 생성
- 반제품 판매규격 0개
- 기존 거래처/판매주문은 0건이므로 기존 거래 이력 변환 위험 없음

## 반제품 보호
DB trigger와 API 양쪽에서 `product_type='반제품'` 판매규격 등록을 거부한다.
Rollback 테스트에서 지미부스터(PROD-0131) 판매규격 생성 시도가 차단되고 잔존 테스트 행 0건을 확인했다.

## 판매등록 V4
새 판매등록은 `sales_variant_id`를 기준으로 한다.

가격 우선순위:
1. 해당 거래처 × 판매규격 가격이 있으면 사용
2. 없으면 판매규격 기본단가 사용

MOQ도 같은 우선순위를 사용한다.

가격이 0원이거나 MOQ보다 적은 주문은 저장하지 않는다.

kg 환산:
- kg → 수량 그대로 kg
- EA → 수량 × 개별중량(g) / 1000
- BOX → 수량 × BOX 입수량 × 개별중량(g) / 1000

영업 프리랜서 정산은 이 kg Snapshot에 `원/kg` 정산단가를 곱한다.

## 실제 입금과 판매 수정 보호
판매등록 화면에서는 `미입금/일부입금/입금완료`를 수동으로 변경하지 않는다.
수금상태는 V3 `sales_receipts` 실제 입금원장 기준이다.

실제 입금이 1건이라도 있는 판매건은:
- 금액/품목 수정 차단
- 판매취소 차단

잘못된 경우 수금·미수금 화면에서 입금을 먼저 역분개한 뒤 판매건을 수정/취소해야 한다.

## 거래명세표
판매 당시 제품명·판매규격·수량·단위·단가 Snapshot을 출력한다.
현재 두배 공급자 정보는 기존 명세표 기준을 유지한다.

## 영업 프리랜서 연결 보호
거래처에 현재 연결된 영업 프리랜서만 규격별 정산단가를 저장할 수 있다.
DB trigger로도 강제한다.
거래처-영업 프리랜서 연결이 해제/비활성화되면 해당 판매규격 정산단가 연결도 자동 제거한다.

## 메뉴 변경
판매관리 일반 진입은 V4 기준으로:
1. 판매규격·단가
2. 거래처 관리
3. 판매 등록
4. 거래명세표
5. 수금·미수금
6. 영업 정산서
7. 판매 통계
8. 세금계산서
9. 수출 관리

기존 V2 products/terms 라우트는 호환용으로 남기되 일반 메뉴에서는 제거한다.

## 다음 단계
- 영업관리 월 목표매출
- 파이프라인과 실제 매출의 목표 달성 비교
- Control Tower 목표/부족매출 연결
