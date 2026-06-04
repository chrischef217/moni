# 레시피 원재료 연결 이력/되돌리기 계획

## 목적
- 브라우저 `localStorage/sessionStorage/cookie`에 의존하지 않고, Supabase DB 기준으로 최근 처리 이력과 되돌리기를 제공한다.
- 다단계 되돌리기(가장 최근 처리부터 순차적으로 되돌림)를 지원한다.

## 적용 범위
- API: `/api/moni/raw-material-mapping/route.ts`
- UI: `src/components/AdminDashboard.tsx` (생산관리 > 레시피 원재료 연결)
- 마이그레이션: `docs/migration_recipe_material_mapping_history.sql`

## 데이터 모델
- 테이블: `recipe_material_mapping_history`
- 핵심 필드:
  - `new_mapping_id`: 이번 처리로 기본값이 된 매핑 id
  - `previous_default_mapping_ids`: 처리 직전 기본값 목록(jsonb 배열)
  - `mapping_scope`, `recipe_id`, `product_id`, `food_type_id`
  - `is_undone`, `undone_at`, `undone_by`

## 처리 흐름
1. 사용자가 원재료 연결 저장
2. API가 같은 scope key의 기존 기본값을 `is_default=false`로 전환
3. 새 매핑을 `is_default=true`로 저장
4. 위 변경 내용을 `recipe_material_mapping_history`에 기록

## 되돌리기 흐름
1. API가 `is_undone=false`인 최신 이력 1건 조회
2. `new_mapping_id` 매핑을 `is_default=false`로 전환
3. `previous_default_mapping_ids`를 `is_default=true`로 복원
4. 해당 이력을 `is_undone=true` 처리
5. 다음 최신 이력을 다시 UI에 노출

## UI 정책
- 탭명: `레시피 원재료 연결`
- 기본 필터: `처리 필요`(미처리/확인 필요/이름 임시 연결)
- 처리 완료 항목은 기본 목록에서 숨김
- 필터 하단에 `최근 처리 이력` 박스 표시
- `되돌리기` 버튼은 DB 최신 이력 기준으로 동작

## 예외 처리
- 이력 테이블이 아직 없는 경우:
  - 매핑 저장 자체는 성공 처리
  - UI에는 “이력 테이블 미준비” 경고 메시지 노출

## 주의
- 본 계획/SQL은 파일 생성용이며 DB에 자동 실행하지 않는다.
