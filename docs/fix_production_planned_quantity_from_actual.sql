BEGIN;

-- =========================================
-- 실행 전 확인 1) 예정량 NULL/0 + 완료량>0 건수
-- =========================================
SELECT
  COUNT(*) AS target_count
FROM production_records
WHERE (planned_quantity_g IS NULL OR planned_quantity_g = 0)
  AND COALESCE(actual_quantity_g, 0) > 0
  AND LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'confirmed', '완료', '확정');

-- =========================================
-- 실행 전 확인 2) 완료량>0 전체 건수
-- =========================================
SELECT
  COUNT(*) AS actual_gt_zero_count
FROM production_records
WHERE COALESCE(actual_quantity_g, 0) > 0;

-- =========================================
-- 실행 전 확인 3) 보정 대상 미리보기
-- 예정량 = CEIL((완료량 + 1) / 1000) * 1000
-- (완료량이 1000단위로 딱 떨어져도 다음 1000으로 보정)
-- =========================================
SELECT
  id,
  lot_number,
  work_date,
  product_name,
  status,
  planned_quantity_g AS planned_before_g,
  actual_quantity_g AS actual_g,
  CEIL((COALESCE(actual_quantity_g, 0) + 1) / 1000.0) * 1000 AS planned_after_g
FROM production_records
WHERE (planned_quantity_g IS NULL OR planned_quantity_g = 0)
  AND COALESCE(actual_quantity_g, 0) > 0
  AND LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'confirmed', '완료', '확정')
ORDER BY work_date DESC, created_at DESC
LIMIT 200;

-- =========================================
-- 보정 UPDATE (예정량 컬럼만 수정)
-- =========================================
UPDATE production_records
SET planned_quantity_g = CEIL((COALESCE(actual_quantity_g, 0) + 1) / 1000.0) * 1000
WHERE (planned_quantity_g IS NULL OR planned_quantity_g = 0)
  AND COALESCE(actual_quantity_g, 0) > 0
  AND LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'confirmed', '완료', '확정');

-- =========================================
-- 실행 후 검증 1) 예정량 NULL/0 잔여 건수
-- =========================================
SELECT
  COUNT(*) AS remaining_zero_or_null_planned_count
FROM production_records
WHERE (planned_quantity_g IS NULL OR planned_quantity_g = 0)
  AND COALESCE(actual_quantity_g, 0) > 0
  AND LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'confirmed', '완료', '확정');

-- =========================================
-- 실행 후 검증 2) 예정량 <= 완료량 건수 (0이어야 정상)
-- =========================================
SELECT
  COUNT(*) AS planned_not_greater_than_actual_count
FROM production_records
WHERE COALESCE(actual_quantity_g, 0) > 0
  AND COALESCE(planned_quantity_g, 0) <= COALESCE(actual_quantity_g, 0)
  AND LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'confirmed', '완료', '확정');

-- =========================================
-- 실행 후 검증 3) 보정 결과 샘플
-- =========================================
SELECT
  id,
  lot_number,
  work_date,
  product_name,
  status,
  planned_quantity_g,
  actual_quantity_g
FROM production_records
WHERE COALESCE(actual_quantity_g, 0) > 0
  AND LOWER(TRIM(COALESCE(status, ''))) IN ('completed', 'confirmed', '완료', '확정')
ORDER BY work_date DESC, updated_at DESC NULLS LAST, created_at DESC
LIMIT 200;

COMMIT;
