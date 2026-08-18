# MONI Technical Notes

## raw_material_mapping Scope 확장

`raw_material_mapping`은 기존 글로벌 매핑을 유지하면서 아래 컬럼을 사용한다.

- `recipe_id`
- `product_id`
- `product_name`
- `mapping_scope`

`mapping_scope` 허용값:

- `recipe`
- `product`
- `global`

기존 35건 매핑은 `mapping_scope='global'`로 유지한다.

## 레시피 원재료 매핑 우선순위

생산 확정/미리보기에서 원재료 매핑 선택 순서는 아래와 같다.

1. `recipe_id` 기준 (`mapping_scope='recipe'`)
2. `product_id + food_type_id` 기준 (`mapping_scope='product'`)
3. `food_type_id` 기준 글로벌 (`mapping_scope='global'`)
4. 이름 일치 fallback (`raw_material_name` / `raw_materials.item_name`)

## 수동 매핑 UI 정책

- 생산관리 하위에 `레시피 원재료 연결` 화면 제공
- 사용자는 active `raw_materials` 목록에서만 선택 가능 (자유입력 금지)
- 적용 범위 선택:
  - 이 레시피에만 적용
  - 이 제품의 같은 항목에 적용
  - 같은 식품유형 전체에 적용
- 동일 scope key의 기존 default는 `is_default=false`로 내리고, 신규 매핑을 `is_default=true`로 저장

## 매핑 이력/되돌리기

- 브라우저 저장소(`localStorage/sessionStorage/cookie`)를 사용하지 않고 DB 이력 기준으로 처리
- 이력 테이블: `recipe_material_mapping_history`
- 최근 처리 조회: `GET /api/moni/raw-material-mapping?action=latest_history`
- 되돌리기: `POST /api/moni/raw-material-mapping` with `{ "action": "undo_last_mapping" }`
- 되돌리기 시 실제 row 삭제 없이 `is_default`와 `is_undone`만 전환
- 다단계 되돌리기: 최신 이력을 되돌린 뒤 다음 최신 이력을 계속 표시

## 판매관리 V1

판매관리는 영업관리 하위가 아니라 별도 대카테고리다.

관련 경로:

- 화면: `/sales-management`
- API: `/api/moni/sales-management`
- 기준 문서: `docs/SALES_MANAGEMENT_V1.md`

관련 테이블:

- 기존 공유: `sales_clients`, `business_people`, `products`
- 신규: `sales_orders`, `sales_order_items`, `sales_order_history`

운영 기준:

- 거래처·프리랜서·제품 마스터를 중복 생성하지 않는다.
- 판매 수정·취소 전 기존 주문과 품목을 `sales_order_history.snapshot`에 저장한다.
- 판매 통계는 `sales_orders.status='confirmed'`만 포함한다.
- 취소·작성중 판매는 통계에서 제외한다.
- 세금계산서는 V1에서 메뉴와 준비 중 화면만 제공한다.

## 완제품 재고조정

완제품 재고는 생산완료 입고와 확정 판매/수출 출고를 자동 계산하되, 실사 차이를 보정할 때만 별도 재고조정을 사용한다.

관련 화면/API:

- 화면: `/finished-goods-inventory` 재고 이력 팝업의 `재고조정`
- API: `GET/POST /api/moni/finished-goods-inventory-adjustments`
- UI 컨트롤러: `src/components/FinishedGoodsInventoryAdjustmentBridge.tsx`

관련 테이블:

- `finished_goods_inventory_adjustments`
  - `product_id`
  - `adjustment_date`
  - `input_quantity`
  - `input_unit` (`kg`/`g`)
  - `balance_before_g`
  - `target_stock_g`
  - `adjustment_g`
  - `reason`
  - `created_at`

운영 기준:

- 재고조정은 생산입고나 판매출고를 허위로 생성하지 않고 별도 감사 이력으로 저장한다.
- 사용자가 kg 또는 g으로 입력해도 DB 계산 기준은 g으로 변환한다.
- 입력값은 선택한 일자의 마감재고 목표값이며, `adjustment_g = target_stock_g - balance_before_g`로 기록한다.
- 조정 이력은 삭제하지 않고 재고 수불 이력에 `재고 조정`으로 표시한다.
- 저장 직후 완제품 재고를 다시 계산해 현재고와 처리 후 잔량에 즉시 반영한다.

## 판매규격 ↔ 부재료(포장재) 연결

판매규격 편집 화면의 기존 자유입력 `판매규격명`은 `포장재` 선택으로 대체한다.

관련 구조:

- `sales_product_variants.packaging_material_id` → `packaging_materials.id` FK
- 판매규격 API: `/api/moni/sales-pricing-v4`
- UI: `src/components/SalesVariantPricingModule.tsx`

운영 기준:

- 판매규격의 포장재는 `부재료 관리`에 등록된 활성 `packaging_materials`에서만 선택한다.
- 사용자는 부재료명/코드/규격/유형을 타이핑 검색할 수 있다.
- 선택 시 `packaging_materials.spec`을 `포장재 규격`으로 즉시 표시한다.
- 저장 시 서버가 선택한 부재료를 다시 검증하고 `variant_name`은 해당 `material_name`으로 동기화한다.
- 기존 판매규격 데이터는 임의 매핑하지 않고 `packaging_material_id = null` 상태로 보존하며, 수정 시 실제 포장재를 사용자가 선택한다.

## MONI 모바일 PC 업무폼 카드 V1 — 2026-08-18

모바일 MONI의 업무 입력은 특정 원재료 기능만 별도로 구현하지 않고, PC 운영 화면의 실제 입력폼을 공통 카드 구조로 재사용한다.

### 라우팅

- 텍스트 업무 변경 의도 시작: `POST /api/moni/mobile-action-start`
- 생산/판매/매입/지급/부재료 거래 카드: `GET/POST /api/moni/mobile-business-actions`
- PC 운영폼 확장 카드: `GET/POST /api/moni/mobile-extended-actions`
- 원재료 입고 V2: 기존 원자적 실행 경로 유지
- 범용 UI: `src/components/MoniMobileExtendedFormCard.tsx`

조회·분석 질문은 카드로 가로채지 않고 기존 MONI Agent가 처리한다. 등록·수정·취소·삭제·조정·수금 등 명시적인 변경 의도가 있을 때만 업무카드를 연다.

### 모바일 카드 대상 PC 운영폼

기존 거래형 카드:

- 원재료 입고
- 부재료 입고
- 생산계획
- 작업지시 생성/수정/취소
- 생산완료/생산확정
- 판매 등록/수정/취소
- 매입 등록/취소
- 매입대금 지급

확장 범용 카드:

- 제품 마스터
- 제품 생산단위
- 레시피
- 원재료 마스터
- 부재료 마스터
- 위생점검 일지
- 완제품 재고조정
- 수금/입금 등록, 입금취소, 입금예정일, 거래처 수금조건
- 월 영업 목표
- 거래처
- 판매규격/기본단가/거래처 예외조건
- 인력
- 영업기회
- 영업활동
- 생산 프리랜서 작업시간

사용자/권한, 시스템 설정, 코드·배포 설정처럼 업무 데이터 입력이 아닌 관리 기능은 모바일 업무카드 범위에서 제외한다.

### 실행 안전 규칙

모든 변경은 아래 순서를 따른다.

```text
사용자 텍스트 변경 요청
→ 업무 종류 분류
→ PC 기준 필드/현재값/선택목록 카드 표시
→ 사용자 수정
→ prepare: PENDING confirmation + before_snapshot + 미리보기
→ 사용자 확정 실행
→ 서버에서 PENDING → EXECUTING 원자 잠금
→ 기존 PC API 또는 기존 생산 승인형 실행 함수 호출
→ 성공 검증
→ EXECUTED + result_snapshot
→ moni_action_audit_log 기록
```

- prepare와 execute를 같은 사용자 턴에서 실행하지 않는다.
- 이미 `EXECUTED`인 confirmation은 재실행하지 않고 기존 결과를 반환한다.
- 서버 실행 중에는 `EXECUTING` 잠금으로 이중 터치/재전송에 따른 중복 실행을 차단한다.
- 범용 카드 후보 DB row를 UI 필드에 넣을 때는 schema에 선언된 필드만 복사한다. `id`, `business_id` 등 내부 컬럼을 PC 저장 payload에 섞지 않는다.
- 제품/원재료/부재료 마스터의 삭제 의도는 과거 이력 보호를 위해 실제 row 삭제가 아니라 비활성 처리한다.
- 레시피의 식품유형은 canonical `food_type_master`를 검증·재사용하고, 존재하지 않을 때만 정상 생성한다.

### Tenant 기준 및 부재료 정합화

- 모든 새 모바일 업무카드와 PC 업무 API의 canonical `business_id`는 `20220523011`이다.
- 2026-08-18 기존 `packaging_materials` 10건과 `packaging_transactions` 1건의 legacy `business_id='default'`를 ID·수량·재고·이력을 변경하지 않고 `20220523011`로 정합화했다.
- 이후 모바일 부재료 로직에서 `default` 호환 우회 경로를 사용하지 않는다.
