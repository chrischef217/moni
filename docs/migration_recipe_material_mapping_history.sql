BEGIN;

-- 레시피 원재료 연결 처리 이력 (되돌리기용)
CREATE TABLE IF NOT EXISTS recipe_material_mapping_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text,
  action_type text NOT NULL DEFAULT 'set_default',
  mapping_scope text NOT NULL,
  recipe_id uuid,
  product_id text,
  product_name text,
  food_type_id uuid,
  new_mapping_id uuid,
  previous_default_mapping_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_material_name text NOT NULL,
  recipe_item_name text,
  food_type_name text,
  actor_id text,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by text,
  is_undone boolean NOT NULL DEFAULT false,
  CONSTRAINT ck_recipe_mapping_history_action_type CHECK (action_type IN ('set_default')),
  CONSTRAINT ck_recipe_mapping_history_scope CHECK (mapping_scope IN ('recipe', 'product', 'global'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_mapping_history_business_created_at
  ON recipe_material_mapping_history (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipe_mapping_history_undone_created_at
  ON recipe_material_mapping_history (is_undone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recipe_mapping_history_recipe_id
  ON recipe_material_mapping_history (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_mapping_history_product_food_type
  ON recipe_material_mapping_history (product_id, food_type_id);

CREATE INDEX IF NOT EXISTS idx_recipe_mapping_history_food_type
  ON recipe_material_mapping_history (food_type_id);

CREATE INDEX IF NOT EXISTS idx_recipe_mapping_history_new_mapping
  ON recipe_material_mapping_history (new_mapping_id);

COMMIT;
