ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS production_unit_id uuid,
  ADD COLUMN IF NOT EXISTS production_unit_name text,
  ADD COLUMN IF NOT EXISTS production_unit_weight_g numeric,
  ADD COLUMN IF NOT EXISTS planned_quantity_ea integer,
  ADD COLUMN IF NOT EXISTS planned_remainder_g numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_quantity_ea integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_production_records_production_unit'
  ) THEN
    ALTER TABLE production_records
      ADD CONSTRAINT fk_production_records_production_unit
      FOREIGN KEY (production_unit_id)
      REFERENCES product_production_units(id);
  END IF;
END $$;
