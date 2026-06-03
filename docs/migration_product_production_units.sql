CREATE TABLE IF NOT EXISTS product_production_units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_name text NOT NULL,
  unit_weight_g numeric NOT NULL CHECK (unit_weight_g > 0),
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  business_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_production_units_product_id
  ON product_production_units (product_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_production_units_default_per_product
  ON product_production_units (product_id)
  WHERE is_default = true;
