-- ============================================================
-- Moni Sprint 3 마이그레이션 SQL
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- raw_materials current_stock_g 업데이트 함수 (입고/출고 자동 처리)
CREATE OR REPLACE FUNCTION update_raw_stock(
  p_item_name TEXT,
  p_delta_g NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE raw_materials
  SET current_stock_g = current_stock_g + p_delta_g
  WHERE item_name = p_item_name AND business_id = 'default';

  IF NOT FOUND THEN
    INSERT INTO raw_materials (id, item_name, item_code, current_stock_g, is_active, business_id)
    VALUES (
      'ITEM-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT,
      p_item_name,
      'ITEM-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT,
      GREATEST(0, p_delta_g),
      true,
      'default'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- packaging_materials current_stock 업데이트 함수
CREATE OR REPLACE FUNCTION update_pkg_stock(
  p_material_name TEXT,
  p_delta INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE packaging_materials
  SET current_stock = current_stock + p_delta
  WHERE material_name = p_material_name AND business_id = 'default';

  IF NOT FOUND THEN
    INSERT INTO packaging_materials (id, material_name, material_code, current_stock, is_active, business_id)
    VALUES (
      'PKG-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT,
      p_material_name,
      'PKG-' || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT,
      GREATEST(0, p_delta),
      true,
      'default'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;
