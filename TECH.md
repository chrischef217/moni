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
