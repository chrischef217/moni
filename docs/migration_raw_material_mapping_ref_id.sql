BEGIN;

-- 1) Current row count before schema extension.
SELECT
  COUNT(*) AS raw_material_mapping_count_before
FROM raw_material_mapping;

-- 2) Add a stable text reference to raw_materials.id.
ALTER TABLE raw_material_mapping
  ADD COLUMN IF NOT EXISTS raw_material_ref_id text;

-- 3) Add a reusable lookup index for mapping resolution.
CREATE INDEX IF NOT EXISTS idx_raw_material_mapping_raw_material_ref_id
  ON raw_material_mapping (raw_material_ref_id);

-- 4) Add the FK only when it is not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_raw_material_mapping_raw_material_ref_id'
      AND conrelid = 'raw_material_mapping'::regclass
  ) THEN
    ALTER TABLE raw_material_mapping
      ADD CONSTRAINT fk_raw_material_mapping_raw_material_ref_id
      FOREIGN KEY (raw_material_ref_id)
      REFERENCES raw_materials(id)
      NOT VALID;
  END IF;
END $$;

-- 5) Diagnostic: rows that have more than one possible material match by name.
WITH match_candidates AS (
  SELECT
    m.id AS mapping_id,
    m.raw_material_name,
    COUNT(rm.id) AS candidate_count,
    array_agg(rm.id ORDER BY rm.id) AS candidate_material_ids
  FROM raw_material_mapping m
  JOIN raw_materials rm
    ON btrim(rm.item_name) = btrim(m.raw_material_name)
   AND (
        m.business_id IS NULL
        OR rm.business_id IS NULL
        OR rm.business_id = m.business_id
   )
  WHERE m.raw_material_ref_id IS NULL
    AND m.raw_material_name IS NOT NULL
    AND btrim(m.raw_material_name) <> ''
  GROUP BY m.id, m.raw_material_name
)
SELECT *
FROM match_candidates
WHERE candidate_count > 1
ORDER BY raw_material_name, mapping_id;

-- 6) Backfill only unambiguous one-to-one name matches.
WITH match_candidates AS (
  SELECT
    m.id AS mapping_id,
    rm.id AS raw_material_ref_id,
    COUNT(rm.id) OVER (PARTITION BY m.id) AS candidate_count
  FROM raw_material_mapping m
  JOIN raw_materials rm
    ON btrim(rm.item_name) = btrim(m.raw_material_name)
   AND (
        m.business_id IS NULL
        OR rm.business_id IS NULL
        OR rm.business_id = m.business_id
   )
  WHERE m.raw_material_ref_id IS NULL
    AND m.raw_material_name IS NOT NULL
    AND btrim(m.raw_material_name) <> ''
),
unique_matches AS (
  SELECT mapping_id, raw_material_ref_id
  FROM match_candidates
  WHERE candidate_count = 1
)
UPDATE raw_material_mapping m
SET raw_material_ref_id = u.raw_material_ref_id
FROM unique_matches u
WHERE m.id = u.mapping_id;

-- 7) Verification after extension and conservative backfill.
SELECT
  COUNT(*) AS total_mappings,
  COUNT(raw_material_ref_id) AS mappings_with_raw_material_ref_id,
  COUNT(*) FILTER (WHERE raw_material_ref_id IS NULL) AS mappings_without_raw_material_ref_id
FROM raw_material_mapping;

SELECT
  COUNT(*) AS invalid_raw_material_ref_id_count
FROM raw_material_mapping m
LEFT JOIN raw_materials rm
  ON rm.id = m.raw_material_ref_id
WHERE m.raw_material_ref_id IS NOT NULL
  AND rm.id IS NULL;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'raw_material_mapping'
  AND column_name IN ('raw_material_ref_id', 'raw_material_id', 'raw_material_name')
ORDER BY column_name;

COMMIT;
