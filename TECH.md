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
