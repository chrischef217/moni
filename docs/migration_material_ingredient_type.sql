BEGIN;

-- Pre-check
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'raw_materials' AND column_name = 'ingredient_type'
  ) AS raw_materials_has_ingredient_type,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'packaging_materials' AND column_name = 'ingredient_type'
  ) AS packaging_materials_has_ingredient_type;

-- 1) Add columns (idempotent)
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS ingredient_type text;

ALTER TABLE public.packaging_materials
  ADD COLUMN IF NOT EXISTS ingredient_type text;

-- 2) Backfill defaults for existing rows
UPDATE public.raw_materials
SET ingredient_type = '원재료'
WHERE ingredient_type IS NULL OR btrim(ingredient_type) = '';

UPDATE public.packaging_materials
SET ingredient_type = '부재료'
WHERE ingredient_type IS NULL OR btrim(ingredient_type) = '';

-- 3) Optional constraints (safe add via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_raw_materials_ingredient_type'
      AND conrelid = 'public.raw_materials'::regclass
  ) THEN
    ALTER TABLE public.raw_materials
      ADD CONSTRAINT ck_raw_materials_ingredient_type
      CHECK (ingredient_type IN ('원재료', '반제품', '기타'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_packaging_materials_ingredient_type'
      AND conrelid = 'public.packaging_materials'::regclass
  ) THEN
    ALTER TABLE public.packaging_materials
      ADD CONSTRAINT ck_packaging_materials_ingredient_type
      CHECK (ingredient_type IN ('부재료', '기타'));
  END IF;
END $$;

-- Post-check
SELECT ingredient_type, COUNT(*) AS cnt
FROM public.raw_materials
GROUP BY ingredient_type
ORDER BY ingredient_type;

SELECT ingredient_type, COUNT(*) AS cnt
FROM public.packaging_materials
GROUP BY ingredient_type
ORDER BY ingredient_type;

SELECT COUNT(*) AS invalid_raw_materials
FROM public.raw_materials
WHERE ingredient_type NOT IN ('원재료', '반제품', '기타');

SELECT COUNT(*) AS invalid_packaging_materials
FROM public.packaging_materials
WHERE ingredient_type NOT IN ('부재료', '기타');

COMMIT;
