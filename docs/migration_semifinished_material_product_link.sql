-- MONI 1단계: 반제품 원재료 ↔ 반제품 제품 연결 컬럼 추가
-- 주의: 이 파일은 수동 실행 전 검토용입니다.
-- 금지 정책에 따라 DELETE / DROP / TRUNCATE / UPDATE 문은 포함하지 않습니다.

-- 1) 컬럼 추가
ALTER TABLE raw_materials
ADD COLUMN IF NOT EXISTS linked_product_id text;

-- 2) 컬럼 존재 확인
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'raw_materials'
  AND column_name = 'linked_product_id';

-- 3) 재료유형이 반제품인 원재료 목록 확인
SELECT
  id,
  item_name,
  ingredient_type,
  linked_product_id,
  is_active,
  business_id
FROM raw_materials
WHERE ingredient_type = '반제품'
ORDER BY item_name;

-- 4) 제품구분이 반제품인 제품 목록 확인
SELECT
  id,
  product_name,
  product_type,
  is_active,
  business_id
FROM products
WHERE product_type = '반제품'
ORDER BY product_name;

-- 5) linked_product_id 연결 미리보기
SELECT
  rm.id AS raw_material_id,
  rm.item_name AS raw_material_name,
  rm.ingredient_type,
  rm.linked_product_id,
  p.id AS linked_product_exists_id,
  p.product_name AS linked_product_name,
  p.product_type AS linked_product_type
FROM raw_materials rm
LEFT JOIN products p
  ON p.id = rm.linked_product_id
WHERE rm.ingredient_type = '반제품'
ORDER BY rm.item_name;

-- 6) linked_product_id 값이 있으나 products와 매칭되지 않는 항목 확인
SELECT
  rm.id,
  rm.item_name,
  rm.linked_product_id
FROM raw_materials rm
LEFT JOIN products p
  ON p.id = rm.linked_product_id
WHERE rm.linked_product_id IS NOT NULL
  AND TRIM(rm.linked_product_id) <> ''
  AND p.id IS NULL
ORDER BY rm.item_name;
