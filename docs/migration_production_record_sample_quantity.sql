ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS sample_quantity_g numeric DEFAULT 0;
