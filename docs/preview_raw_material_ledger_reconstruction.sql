-- MONI 원료수불부 최종 미리보기 SQL (SELECT 전용)
-- 정책 반영:
-- 1) 제품 연결 기준은 product_id
-- 2) production_records.product_name은 스냅샷(표시용)
-- 3) 반제품은 inline 전개, 반제품 자체 입출고 미생성
-- 4) 실제 생산 투입 기준은 actual_quantity_g
-- 5) 정제수(raw_material_id = ITEM-1780680500370)는 비재고로 running balance/기초재고 계산 제외

/* ==================================================
 * SECTION 1) 생산 대상(실제 생산) 기본 미리보기
 * ================================================== */
with production_scope as (
  select
    pr.id as production_record_id,
    to_jsonb(pr)->>'work_date' as production_date,
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), '') as snapshot_product_name,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as actual_quantity_g,
    coalesce(to_jsonb(pr)->>'status', '') as status
  from production_records pr
  where coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) > 0
    and coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
    and nullif(to_jsonb(pr)->>'product_id', '') is not null
), products_scope as (
  select
    p.id as product_id,
    coalesce(nullif(to_jsonb(p)->>'name', ''), nullif(to_jsonb(p)->>'product_name', '')) as current_product_name
  from products p
)
select
  ps.production_record_id,
  ps.production_date,
  ps.product_id,
  pr.current_product_name,
  ps.snapshot_product_name,
  ps.actual_quantity_g
from production_scope ps
left join products_scope pr on pr.product_id = ps.product_id
order by ps.production_date, ps.production_record_id;

/* ==================================================
 * SECTION 2) product_id 기반 레시피 로드 검증
 * - product_name fallback 없이 product_id로만 조회
 * ================================================== */
with production_scope as (
  select
    pr.id as production_record_id,
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as actual_quantity_g
  from production_records pr
  where coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) > 0
    and coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
    and nullif(to_jsonb(pr)->>'product_id', '') is not null
), recipe_scope as (
  select
    r.id::text as recipe_id,
    nullif(to_jsonb(r)->>'product_id', '') as product_id,
    coalesce(nullif(to_jsonb(r)->>'food_type_id', ''), nullif(to_jsonb(r)->>'food_type_name', '')) as food_key,
    coalesce(nullif(to_jsonb(r)->>'food_type_name', ''), '(무명)') as food_type_name,
    coalesce((to_jsonb(r)->>'ratio_percent')::numeric, 0) as ratio_percent,
    coalesce(nullif(to_jsonb(r)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(r)->>'semi_product_id', '') as semi_product_id,
    coalesce((to_jsonb(r)->>'sort_order')::numeric, 999999) as sort_order
  from recipes r
  where coalesce((to_jsonb(r)->>'is_active')::boolean, true) = true
)
select
  ps.production_record_id,
  ps.product_id,
  count(rs.recipe_id) as recipe_row_count,
  sum(rs.ratio_percent) as ratio_sum
from production_scope ps
left join recipe_scope rs on rs.product_id = ps.product_id
group by ps.production_record_id, ps.product_id
order by ps.production_record_id;

/* ==================================================
 * SECTION 3) recipe/product/global 순서로 매핑 선택 미리보기
 * - name fallback 미사용(정책)
 * ================================================== */
with production_scope as (
  select
    pr.id as production_record_id,
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as actual_quantity_g
  from production_records pr
  where coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) > 0
    and coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
    and nullif(to_jsonb(pr)->>'product_id', '') is not null
), recipe_scope as (
  select
    r.id::text as recipe_id,
    nullif(to_jsonb(r)->>'product_id', '') as product_id,
    nullif(to_jsonb(r)->>'food_type_id', '') as food_type_id,
    coalesce(nullif(to_jsonb(r)->>'food_type_name', ''), '(무명)') as food_type_name,
    coalesce((to_jsonb(r)->>'ratio_percent')::numeric, 0) as ratio_percent,
    coalesce(nullif(to_jsonb(r)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(r)->>'semi_product_id', '') as semi_product_id,
    coalesce((to_jsonb(r)->>'sort_order')::numeric, 999999) as sort_order
  from recipes r
  where coalesce((to_jsonb(r)->>'is_active')::boolean, true) = true
), mapping_scope as (
  select
    m.id as mapping_id,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'food_type_id', '') as food_type_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id,
    nullif(to_jsonb(m)->>'raw_material_name', '') as raw_material_name,
    coalesce(nullif(to_jsonb(m)->>'mapping_scope', ''), 'global') as mapping_scope,
    coalesce((to_jsonb(m)->>'is_default')::boolean, true) as is_default,
    coalesce(to_jsonb(m)->>'created_at', '') as created_at
  from raw_material_mapping m
  where coalesce((to_jsonb(m)->>'is_default')::boolean, true) = true
), candidate as (
  select
    ps.production_record_id,
    rs.recipe_id,
    rs.product_id,
    rs.food_type_id,
    rs.food_type_name,
    rs.ingredient_type,
    rs.semi_product_id,
    rs.ratio_percent,
    mr.mapping_id as recipe_mapping_id,
    mp.mapping_id as product_mapping_id,
    mg.mapping_id as global_mapping_id,
    coalesce(mr.raw_material_ref_id, mp.raw_material_ref_id, mg.raw_material_ref_id) as selected_raw_material_ref_id,
    coalesce(mr.raw_material_name, mp.raw_material_name, mg.raw_material_name) as selected_raw_material_name,
    case
      when mr.mapping_id is not null then 'recipe'
      when mp.mapping_id is not null then 'product'
      when mg.mapping_id is not null then 'global'
      else null
    end as selected_scope
  from production_scope ps
  join recipe_scope rs on rs.product_id = ps.product_id
  left join mapping_scope mr
    on mr.mapping_scope = 'recipe'
   and mr.recipe_id = rs.recipe_id
  left join mapping_scope mp
    on mp.mapping_scope = 'product'
   and mp.product_id = rs.product_id
   and mp.food_type_id = rs.food_type_id
  left join mapping_scope mg
    on mg.mapping_scope = 'global'
   and mg.food_type_id = rs.food_type_id
)
select
  production_record_id,
  recipe_id,
  product_id,
  food_type_id,
  food_type_name,
  ingredient_type,
  ratio_percent,
  selected_scope,
  selected_raw_material_ref_id,
  selected_raw_material_name,
  case when selected_scope is null then 1 else 0 end as unresolved_mapping_flag
from candidate
order by production_record_id, ratio_percent desc, food_type_name;

/* ==================================================
 * SECTION 4) inline 반제품 전개(재귀), cycle 감지
 * - 반제품 자체는 최종 투입대상 아님
 * ================================================== */
with recursive
production_scope as (
  select
    pr.id as production_record_id,
    nullif(to_jsonb(pr)->>'product_id', '') as root_product_id,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as root_actual_g
  from production_records pr
  where coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) > 0
    and coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
    and nullif(to_jsonb(pr)->>'product_id', '') is not null
), recipe_scope as (
  select
    r.id::text as recipe_id,
    nullif(to_jsonb(r)->>'product_id', '') as product_id,
    nullif(to_jsonb(r)->>'food_type_id', '') as food_type_id,
    coalesce(nullif(to_jsonb(r)->>'food_type_name', ''), '(무명)') as food_type_name,
    coalesce((to_jsonb(r)->>'ratio_percent')::numeric, 0) as ratio_percent,
    coalesce(nullif(to_jsonb(r)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(r)->>'semi_product_id', '') as semi_product_id,
    coalesce((to_jsonb(r)->>'sort_order')::numeric, 999999) as sort_order
  from recipes r
  where coalesce((to_jsonb(r)->>'is_active')::boolean, true) = true
), mapping_scope as (
  select
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'food_type_id', '') as food_type_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id,
    nullif(to_jsonb(m)->>'raw_material_name', '') as raw_material_name,
    coalesce(nullif(to_jsonb(m)->>'mapping_scope', ''), 'global') as mapping_scope,
    coalesce((to_jsonb(m)->>'is_default')::boolean, true) as is_default
  from raw_material_mapping m
  where coalesce((to_jsonb(m)->>'is_default')::boolean, true) = true
), raw_scope as (
  select
    rm.id as raw_material_id,
    coalesce(nullif(to_jsonb(rm)->>'item_name', ''), '(무명)') as raw_material_name,
    coalesce(nullif(to_jsonb(rm)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    coalesce(nullif(to_jsonb(rm)->>'semifinished_usage_type', ''), 'stock') as semifinished_usage_type,
    coalesce((to_jsonb(rm)->>'is_stock_managed')::boolean, true) as is_stock_managed,
    coalesce((to_jsonb(rm)->>'current_stock_g')::numeric, 0) as current_stock_g
  from raw_materials rm
), expanded as (
  select
    ps.production_record_id,
    ps.root_product_id,
    rs.recipe_id,
    rs.product_id as recipe_product_id,
    rs.food_type_id,
    rs.food_type_name,
    rs.ingredient_type as recipe_ingredient_type,
    rs.semi_product_id,
    1 as depth,
    array[ps.root_product_id]::text[] as product_path,
    false as cycle_detected,
    (ps.root_actual_g * rs.ratio_percent / 100.0) as required_g,
    coalesce(mr.raw_material_ref_id, mp.raw_material_ref_id, mg.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr.raw_material_name, mp.raw_material_name, mg.raw_material_name) as mapped_raw_material_name,
    case
      when mr.raw_material_ref_id is not null or mr.raw_material_name is not null then 'recipe'
      when mp.raw_material_ref_id is not null or mp.raw_material_name is not null then 'product'
      when mg.raw_material_ref_id is not null or mg.raw_material_name is not null then 'global'
      else null
    end as selected_scope
  from production_scope ps
  join recipe_scope rs on rs.product_id = ps.root_product_id
  left join mapping_scope mr on mr.mapping_scope = 'recipe' and mr.recipe_id = rs.recipe_id
  left join mapping_scope mp on mp.mapping_scope = 'product' and mp.product_id = rs.product_id and mp.food_type_id = rs.food_type_id
  left join mapping_scope mg on mg.mapping_scope = 'global' and mg.food_type_id = rs.food_type_id

  union all

  select
    e.production_record_id,
    e.root_product_id,
    rs2.recipe_id,
    rs2.product_id as recipe_product_id,
    rs2.food_type_id,
    rs2.food_type_name,
    rs2.ingredient_type as recipe_ingredient_type,
    rs2.semi_product_id,
    e.depth + 1 as depth,
    e.product_path || rs2.product_id,
    (rs2.product_id = any(e.product_path)) as cycle_detected,
    (e.required_g * rs2.ratio_percent / 100.0) as required_g,
    coalesce(mr2.raw_material_ref_id, mp2.raw_material_ref_id, mg2.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr2.raw_material_name, mp2.raw_material_name, mg2.raw_material_name) as mapped_raw_material_name,
    case
      when mr2.raw_material_ref_id is not null or mr2.raw_material_name is not null then 'recipe'
      when mp2.raw_material_ref_id is not null or mp2.raw_material_name is not null then 'product'
      when mg2.raw_material_ref_id is not null or mg2.raw_material_name is not null then 'global'
      else null
    end as selected_scope
  from expanded e
  join raw_scope parent_raw on parent_raw.raw_material_id = e.mapped_raw_material_id
  join recipe_scope rs2
    on rs2.product_id = parent_raw.linked_product_id
   and parent_raw.ingredient_type = '반제품'
   and parent_raw.semifinished_usage_type = 'inline'
  left join mapping_scope mr2 on mr2.mapping_scope = 'recipe' and mr2.recipe_id = rs2.recipe_id
  left join mapping_scope mp2 on mp2.mapping_scope = 'product' and mp2.product_id = rs2.product_id and mp2.food_type_id = rs2.food_type_id
  left join mapping_scope mg2 on mg2.mapping_scope = 'global' and mg2.food_type_id = rs2.food_type_id
  where e.cycle_detected = false
)
select
  production_record_id,
  root_product_id,
  recipe_id,
  recipe_product_id,
  food_type_name,
  recipe_ingredient_type,
  mapped_raw_material_id,
  mapped_raw_material_name,
  selected_scope,
  depth,
  cycle_detected,
  required_g
from expanded
order by production_record_id, depth, recipe_id;

/* ==================================================
 * SECTION 5) 최종 leaf 원재료 사용량(반제품 자체 제외)
 * ================================================== */
with recursive
production_base as (
  select
    pr.id as production_record_id,
    coalesce(to_jsonb(pr)->>'work_date', '') as work_date,
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), '') as snapshot_product_name,
    coalesce((to_jsonb(pr)->>'planned_quantity_g')::numeric, 0) as planned_quantity_g,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as actual_quantity_g,
    coalesce(lower(to_jsonb(pr)->>'status'), '') as status
  from production_records pr
  where coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
), production_scope as (
  select
    pb.production_record_id,
    pb.product_id as root_product_id,
    pb.actual_quantity_g as root_actual_g,
    pb.work_date as production_date
  from production_base pb
  where pb.actual_quantity_g > 0
    and pb.product_id is not null
), recipe_scope as (
  select
    r.id::text as recipe_id,
    nullif(to_jsonb(r)->>'product_id', '') as product_id,
    nullif(to_jsonb(r)->>'food_type_id', '') as food_type_id,
    coalesce(nullif(to_jsonb(r)->>'food_type_name', ''), '(무명)') as food_type_name,
    coalesce((to_jsonb(r)->>'ratio_percent')::numeric, 0) as ratio_percent,
    coalesce(nullif(to_jsonb(r)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(r)->>'semi_product_id', '') as semi_product_id
  from recipes r
  where coalesce((to_jsonb(r)->>'is_active')::boolean, true) = true
), mapping_scope as (
  select
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'food_type_id', '') as food_type_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id,
    nullif(to_jsonb(m)->>'raw_material_name', '') as raw_material_name,
    coalesce(nullif(to_jsonb(m)->>'mapping_scope', ''), 'global') as mapping_scope
  from raw_material_mapping m
  where coalesce((to_jsonb(m)->>'is_default')::boolean, true) = true
), raw_scope as (
  select
    rm.id as raw_material_id,
    coalesce(nullif(to_jsonb(rm)->>'item_name', ''), '(무명)') as raw_material_name,
    coalesce(nullif(to_jsonb(rm)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    coalesce(nullif(to_jsonb(rm)->>'semifinished_usage_type', ''), 'stock') as semifinished_usage_type,
    coalesce((to_jsonb(rm)->>'is_stock_managed')::boolean, true) as is_stock_managed,
    coalesce((to_jsonb(rm)->>'current_stock_g')::numeric, 0) as current_stock_g
  from raw_materials rm
), expanded as (
  select
    ps.production_record_id,
    ps.production_date,
    ps.root_product_id,
    rs.recipe_id,
    rs.product_id as recipe_product_id,
    rs.food_type_name,
    rs.ingredient_type as recipe_ingredient_type,
    1 as depth,
    array[ps.root_product_id]::text[] as product_path,
    false as cycle_detected,
    (ps.root_actual_g * rs.ratio_percent / 100.0) as required_g,
    coalesce(mr.raw_material_ref_id, mp.raw_material_ref_id, mg.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr.raw_material_name, mp.raw_material_name, mg.raw_material_name) as mapped_raw_material_name
  from production_scope ps
  join recipe_scope rs on rs.product_id = ps.root_product_id
  left join mapping_scope mr on mr.mapping_scope = 'recipe' and mr.recipe_id = rs.recipe_id
  left join mapping_scope mp on mp.mapping_scope = 'product' and mp.product_id = rs.product_id and mp.food_type_id = rs.food_type_id
  left join mapping_scope mg on mg.mapping_scope = 'global' and mg.food_type_id = rs.food_type_id

  union all

  select
    e.production_record_id,
    e.production_date,
    e.root_product_id,
    rs2.recipe_id,
    rs2.product_id as recipe_product_id,
    rs2.food_type_name,
    rs2.ingredient_type as recipe_ingredient_type,
    e.depth + 1 as depth,
    e.product_path || rs2.product_id,
    (rs2.product_id = any(e.product_path)) as cycle_detected,
    (e.required_g * rs2.ratio_percent / 100.0) as required_g,
    coalesce(mr2.raw_material_ref_id, mp2.raw_material_ref_id, mg2.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr2.raw_material_name, mp2.raw_material_name, mg2.raw_material_name) as mapped_raw_material_name
  from expanded e
  join raw_scope parent_raw on parent_raw.raw_material_id = e.mapped_raw_material_id
  join recipe_scope rs2
    on rs2.product_id = parent_raw.linked_product_id
   and parent_raw.ingredient_type = '반제품'
   and parent_raw.semifinished_usage_type = 'inline'
  left join mapping_scope mr2 on mr2.mapping_scope = 'recipe' and mr2.recipe_id = rs2.recipe_id
  left join mapping_scope mp2 on mp2.mapping_scope = 'product' and mp2.product_id = rs2.product_id and mp2.food_type_id = rs2.food_type_id
  left join mapping_scope mg2 on mg2.mapping_scope = 'global' and mg2.food_type_id = rs2.food_type_id
  where e.cycle_detected = false
), leaf_usage as (
  select
    e.production_record_id,
    e.production_date,
    e.root_product_id,
    coalesce(r.raw_material_id, e.mapped_raw_material_id) as raw_material_id,
    coalesce(r.raw_material_name, e.mapped_raw_material_name, '(미매핑)') as raw_material_name,
    coalesce(r.is_stock_managed, true) as is_stock_managed,
    coalesce(r.current_stock_g, 0) as current_stock_g,
    sum(e.required_g) as required_g,
    max(case when e.cycle_detected then 1 else 0 end) as cycle_flag,
    max(case when e.mapped_raw_material_id is null and e.mapped_raw_material_name is null then 1 else 0 end) as unresolved_flag,
    max(case when e.recipe_ingredient_type = '반제품' then 1 else 0 end) as from_semifinished_flag
  from expanded e
  left join raw_scope r on r.raw_material_id = e.mapped_raw_material_id
  where not (
    coalesce(r.ingredient_type, '') = '반제품'
    and coalesce(r.semifinished_usage_type, 'stock') = 'inline'
  )
  group by
    e.production_record_id,
    e.production_date,
    e.root_product_id,
    coalesce(r.raw_material_id, e.mapped_raw_material_id),
    coalesce(r.raw_material_name, e.mapped_raw_material_name, '(미매핑)'),
    coalesce(r.is_stock_managed, true),
    coalesce(r.current_stock_g, 0)
)
select
  production_record_id,
  production_date,
  root_product_id,
  raw_material_id,
  raw_material_name,
  required_g as production_outbound_candidate_g,
  is_stock_managed,
  case when raw_material_id = 'ITEM-1780680500370' then true else false end as is_water,
  unresolved_flag,
  cycle_flag,
  from_semifinished_flag
from leaf_usage
order by production_date, production_record_id, raw_material_name;

/* ==================================================
 * SECTION 6) stock-managed 대상 날짜별 running balance 미리보기
 * - 정제수 및 비재고는 제외
 * ================================================== */
with recursive
production_scope as (
  select
    pr.id as production_record_id,
    nullif(to_jsonb(pr)->>'product_id', '') as root_product_id,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as root_actual_g,
    coalesce(to_jsonb(pr)->>'work_date', '') as production_date
  from production_records pr
  where coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) > 0
    and coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
    and nullif(to_jsonb(pr)->>'product_id', '') is not null
), recipe_scope as (
  select
    r.id::text as recipe_id,
    nullif(to_jsonb(r)->>'product_id', '') as product_id,
    nullif(to_jsonb(r)->>'food_type_id', '') as food_type_id,
    coalesce((to_jsonb(r)->>'ratio_percent')::numeric, 0) as ratio_percent,
    coalesce(nullif(to_jsonb(r)->>'ingredient_type', ''), '원재료') as ingredient_type
  from recipes r
  where coalesce((to_jsonb(r)->>'is_active')::boolean, true) = true
), mapping_scope as (
  select
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'food_type_id', '') as food_type_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id,
    nullif(to_jsonb(m)->>'raw_material_name', '') as raw_material_name,
    coalesce(nullif(to_jsonb(m)->>'mapping_scope', ''), 'global') as mapping_scope
  from raw_material_mapping m
  where coalesce((to_jsonb(m)->>'is_default')::boolean, true) = true
), raw_scope as (
  select
    rm.id as raw_material_id,
    coalesce(nullif(to_jsonb(rm)->>'item_name', ''), '(무명)') as raw_material_name,
    coalesce(nullif(to_jsonb(rm)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    coalesce(nullif(to_jsonb(rm)->>'semifinished_usage_type', ''), 'stock') as semifinished_usage_type,
    coalesce((to_jsonb(rm)->>'is_stock_managed')::boolean, true) as is_stock_managed,
    coalesce((to_jsonb(rm)->>'current_stock_g')::numeric, 0) as current_stock_g
  from raw_materials rm
), expanded as (
  select
    ps.production_record_id,
    ps.production_date,
    rs.recipe_id,
    rs.product_id,
    rs.ingredient_type,
    array[ps.root_product_id]::text[] as product_path,
    false as cycle_detected,
    (ps.root_actual_g * rs.ratio_percent / 100.0) as required_g,
    coalesce(mr.raw_material_ref_id, mp.raw_material_ref_id, mg.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr.raw_material_name, mp.raw_material_name, mg.raw_material_name) as mapped_raw_material_name
  from production_scope ps
  join recipe_scope rs on rs.product_id = ps.root_product_id
  left join mapping_scope mr on mr.mapping_scope = 'recipe' and mr.recipe_id = rs.recipe_id
  left join mapping_scope mp on mp.mapping_scope = 'product' and mp.product_id = rs.product_id and mp.food_type_id = rs.food_type_id
  left join mapping_scope mg on mg.mapping_scope = 'global' and mg.food_type_id = rs.food_type_id

  union all

  select
    e.production_record_id,
    e.production_date,
    rs2.recipe_id,
    rs2.product_id,
    rs2.ingredient_type,
    e.product_path || rs2.product_id,
    (rs2.product_id = any(e.product_path)) as cycle_detected,
    (e.required_g * rs2.ratio_percent / 100.0) as required_g,
    coalesce(mr2.raw_material_ref_id, mp2.raw_material_ref_id, mg2.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr2.raw_material_name, mp2.raw_material_name, mg2.raw_material_name) as mapped_raw_material_name
  from expanded e
  join raw_scope parent_raw on parent_raw.raw_material_id = e.mapped_raw_material_id
  join recipe_scope rs2
    on rs2.product_id = parent_raw.linked_product_id
   and parent_raw.ingredient_type = '반제품'
   and parent_raw.semifinished_usage_type = 'inline'
  left join mapping_scope mr2 on mr2.mapping_scope = 'recipe' and mr2.recipe_id = rs2.recipe_id
  left join mapping_scope mp2 on mp2.mapping_scope = 'product' and mp2.product_id = rs2.product_id and mp2.food_type_id = rs2.food_type_id
  left join mapping_scope mg2 on mg2.mapping_scope = 'global' and mg2.food_type_id = rs2.food_type_id
  where e.cycle_detected = false
), leaf_usage as (
  select
    e.production_date,
    coalesce(r.raw_material_id, e.mapped_raw_material_id) as raw_material_id,
    coalesce(r.raw_material_name, e.mapped_raw_material_name, '(미매핑)') as raw_material_name,
    coalesce(r.is_stock_managed, true) as is_stock_managed,
    sum(e.required_g) as outbound_g
  from expanded e
  left join raw_scope r on r.raw_material_id = e.mapped_raw_material_id
  where not (
    coalesce(r.ingredient_type, '') = '반제품'
    and coalesce(r.semifinished_usage_type, 'stock') = 'inline'
  )
  group by e.production_date, coalesce(r.raw_material_id, e.mapped_raw_material_id), coalesce(r.raw_material_name, e.mapped_raw_material_name, '(미매핑)'), coalesce(r.is_stock_managed, true)
), tx_scope as (
  select
    coalesce(to_jsonb(rt)->>'transaction_date', to_jsonb(rt)->>'date', '') as tx_date,
    coalesce(nullif(to_jsonb(rt)->>'raw_material_id', ''), nullif(to_jsonb(rt)->>'material_id', '')) as raw_material_id,
    coalesce((to_jsonb(rt)->>'inbound_quantity_g')::numeric, case when lower(coalesce(to_jsonb(rt)->>'transaction_type', '')) in ('inbound', '입고') then coalesce((to_jsonb(rt)->>'quantity_g')::numeric, 0) else 0 end) as inbound_g,
    coalesce((to_jsonb(rt)->>'outbound_quantity_g')::numeric, case when lower(coalesce(to_jsonb(rt)->>'transaction_type', '')) in ('outbound', '소모', '출고') then coalesce((to_jsonb(rt)->>'quantity_g')::numeric, 0) else 0 end) as outbound_g
  from raw_material_transactions rt
), daily_union as (
  select
    tx.tx_date as event_date,
    tx.raw_material_id,
    sum(tx.inbound_g) as inbound_g,
    sum(tx.outbound_g) as outbound_g,
    'actual_tx' as source
  from tx_scope tx
  where coalesce(tx.raw_material_id, '') <> ''
  group by tx.tx_date, tx.raw_material_id

  union all

  select
    lu.production_date as event_date,
    lu.raw_material_id,
    0::numeric as inbound_g,
    sum(lu.outbound_g) as outbound_g,
    'production_preview' as source
  from leaf_usage lu
  where coalesce(lu.raw_material_id, '') <> ''
  group by lu.production_date, lu.raw_material_id
), running_balance_scope as (
  select
    du.raw_material_id,
    du.event_date,
    du.source,
    sum(du.inbound_g - du.outbound_g) over (
      partition by du.raw_material_id
      order by du.event_date, du.source
      rows between unbounded preceding and current row
    ) as running_delta_without_opening
  from daily_union du
), opening_calc as (
  select
    rbs.raw_material_id,
    min(rbs.running_delta_without_opening) as min_running_without_opening
  from running_balance_scope rbs
  group by rbs.raw_material_id
), opening_reco as (
  select
    oc.raw_material_id,
    greatest(0, -oc.min_running_without_opening) as minimum_opening_no_negative_g
  from opening_calc oc
), raw_current as (
  select
    rm.id as raw_material_id,
    coalesce((to_jsonb(rm)->>'current_stock_g')::numeric, 0) as current_stock_g,
    coalesce((to_jsonb(rm)->>'is_stock_managed')::boolean, true) as is_stock_managed,
    coalesce(nullif(to_jsonb(rm)->>'item_name', ''), '(무명)') as raw_material_name
  from raw_materials rm
), tx_sum as (
  select
    tx.raw_material_id,
    sum(tx.inbound_g) as tx_inbound_sum_g,
    sum(tx.outbound_g) as tx_outbound_sum_g
  from tx_scope tx
  group by tx.raw_material_id
), preview_sum as (
  select
    lu.raw_material_id,
    sum(lu.outbound_g) as preview_outbound_sum_g
  from leaf_usage lu
  group by lu.raw_material_id
)
select
  rc.raw_material_id,
  rc.raw_material_name,
  orc.minimum_opening_no_negative_g,
  (rc.current_stock_g - coalesce(ts.tx_inbound_sum_g, 0) + coalesce(ts.tx_outbound_sum_g, 0) + coalesce(ps.preview_outbound_sum_g, 0)) as opening_to_match_current_stock_g,
  abs(
    orc.minimum_opening_no_negative_g -
    (rc.current_stock_g - coalesce(ts.tx_inbound_sum_g, 0) + coalesce(ts.tx_outbound_sum_g, 0) + coalesce(ps.preview_outbound_sum_g, 0))
  ) as reconciliation_gap_g,
  greatest(
    orc.minimum_opening_no_negative_g,
    (rc.current_stock_g - coalesce(ts.tx_inbound_sum_g, 0) + coalesce(ts.tx_outbound_sum_g, 0) + coalesce(ps.preview_outbound_sum_g, 0))
  ) as recommended_opening_g,
  case
    when abs(
      orc.minimum_opening_no_negative_g -
      (rc.current_stock_g - coalesce(ts.tx_inbound_sum_g, 0) + coalesce(ts.tx_outbound_sum_g, 0) + coalesce(ps.preview_outbound_sum_g, 0))
    ) = 0 then '정합'
    else '기초재고 후보 검토 필요'
  end as decision_note
from raw_current rc
join opening_reco orc on orc.raw_material_id = rc.raw_material_id
left join tx_sum ts on ts.raw_material_id = rc.raw_material_id
left join preview_sum ps on ps.raw_material_id = rc.raw_material_id
where rc.is_stock_managed = true
  and rc.raw_material_id <> 'ITEM-1780680500370'
order by rc.raw_material_name;

/* ==================================================
 * SECTION 7) 최종 readiness summary (SELECT only)
 * ================================================== */
with recursive
production_scope as (
  select
    pr.id as production_record_id,
    nullif(to_jsonb(pr)->>'product_id', '') as root_product_id,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as root_actual_g,
    coalesce(to_jsonb(pr)->>'work_date', '') as production_date
  from production_records pr
  where coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) > 0
    and coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
    and nullif(to_jsonb(pr)->>'product_id', '') is not null
), recipe_scope as (
  select
    r.id::text as recipe_id,
    nullif(to_jsonb(r)->>'product_id', '') as product_id,
    nullif(to_jsonb(r)->>'food_type_id', '') as food_type_id,
    coalesce((to_jsonb(r)->>'ratio_percent')::numeric, 0) as ratio_percent,
    coalesce(nullif(to_jsonb(r)->>'ingredient_type', ''), '원재료') as ingredient_type
  from recipes r
  where coalesce((to_jsonb(r)->>'is_active')::boolean, true) = true
), mapping_scope as (
  select
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'food_type_id', '') as food_type_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id,
    nullif(to_jsonb(m)->>'raw_material_name', '') as raw_material_name,
    coalesce(nullif(to_jsonb(m)->>'mapping_scope', ''), 'global') as mapping_scope
  from raw_material_mapping m
  where coalesce((to_jsonb(m)->>'is_default')::boolean, true) = true
), raw_scope as (
  select
    rm.id as raw_material_id,
    coalesce(nullif(to_jsonb(rm)->>'item_name', ''), '(무명)') as raw_material_name,
    coalesce(nullif(to_jsonb(rm)->>'ingredient_type', ''), '원재료') as ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    coalesce(nullif(to_jsonb(rm)->>'semifinished_usage_type', ''), 'stock') as semifinished_usage_type,
    coalesce((to_jsonb(rm)->>'is_stock_managed')::boolean, true) as is_stock_managed,
    coalesce((to_jsonb(rm)->>'current_stock_g')::numeric, 0) as current_stock_g
  from raw_materials rm
), expanded as (
  select
    ps.production_record_id,
    ps.production_date,
    rs.recipe_id,
    rs.product_id,
    rs.ingredient_type,
    array[ps.root_product_id]::text[] as product_path,
    false as cycle_detected,
    (ps.root_actual_g * rs.ratio_percent / 100.0) as required_g,
    coalesce(mr.raw_material_ref_id, mp.raw_material_ref_id, mg.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr.raw_material_name, mp.raw_material_name, mg.raw_material_name) as mapped_raw_material_name
  from production_scope ps
  join recipe_scope rs on rs.product_id = ps.root_product_id
  left join mapping_scope mr on mr.mapping_scope = 'recipe' and mr.recipe_id = rs.recipe_id
  left join mapping_scope mp on mp.mapping_scope = 'product' and mp.product_id = rs.product_id and mp.food_type_id = rs.food_type_id
  left join mapping_scope mg on mg.mapping_scope = 'global' and mg.food_type_id = rs.food_type_id

  union all

  select
    e.production_record_id,
    e.production_date,
    rs2.recipe_id,
    rs2.product_id,
    rs2.ingredient_type,
    e.product_path || rs2.product_id,
    (rs2.product_id = any(e.product_path)) as cycle_detected,
    (e.required_g * rs2.ratio_percent / 100.0) as required_g,
    coalesce(mr2.raw_material_ref_id, mp2.raw_material_ref_id, mg2.raw_material_ref_id) as mapped_raw_material_id,
    coalesce(mr2.raw_material_name, mp2.raw_material_name, mg2.raw_material_name) as mapped_raw_material_name
  from expanded e
  join raw_scope parent_raw on parent_raw.raw_material_id = e.mapped_raw_material_id
  join recipe_scope rs2
    on rs2.product_id = parent_raw.linked_product_id
   and parent_raw.ingredient_type = '반제품'
   and parent_raw.semifinished_usage_type = 'inline'
  left join mapping_scope mr2 on mr2.mapping_scope = 'recipe' and mr2.recipe_id = rs2.recipe_id
  left join mapping_scope mp2 on mp2.mapping_scope = 'product' and mp2.product_id = rs2.product_id and mp2.food_type_id = rs2.food_type_id
  left join mapping_scope mg2 on mg2.mapping_scope = 'global' and mg2.food_type_id = rs2.food_type_id
  where e.cycle_detected = false
), leaf_usage as (
  select
    e.production_record_id,
    e.production_date,
    coalesce(r.raw_material_id, e.mapped_raw_material_id) as raw_material_id,
    coalesce(r.raw_material_name, e.mapped_raw_material_name, '(미매핑)') as raw_material_name,
    coalesce(r.is_stock_managed, true) as is_stock_managed,
    sum(e.required_g) as required_g,
    max(case when e.cycle_detected then 1 else 0 end) as cycle_flag,
    max(case when e.mapped_raw_material_id is null and e.mapped_raw_material_name is null then 1 else 0 end) as unresolved_flag,
    max(case when e.ingredient_type = '반제품' then 1 else 0 end) as inline_expansion_flag
  from expanded e
  left join raw_scope r on r.raw_material_id = e.mapped_raw_material_id
  where not (
    coalesce(r.ingredient_type, '') = '반제품'
    and coalesce(r.semifinished_usage_type, 'stock') = 'inline'
  )
  group by
    e.production_record_id,
    e.production_date,
    coalesce(r.raw_material_id, e.mapped_raw_material_id),
    coalesce(r.raw_material_name, e.mapped_raw_material_name, '(미매핑)'),
    coalesce(r.is_stock_managed, true)
), tx_scope as (
  select
    coalesce(to_jsonb(rt)->>'transaction_date', to_jsonb(rt)->>'date', '') as tx_date,
    coalesce(nullif(to_jsonb(rt)->>'raw_material_id', ''), nullif(to_jsonb(rt)->>'material_id', '')) as raw_material_id,
    coalesce((to_jsonb(rt)->>'inbound_quantity_g')::numeric, case when lower(coalesce(to_jsonb(rt)->>'transaction_type', '')) in ('inbound', '입고') then coalesce((to_jsonb(rt)->>'quantity_g')::numeric, 0) else 0 end) as inbound_g,
    coalesce((to_jsonb(rt)->>'outbound_quantity_g')::numeric, case when lower(coalesce(to_jsonb(rt)->>'transaction_type', '')) in ('outbound', '소모', '출고') then coalesce((to_jsonb(rt)->>'quantity_g')::numeric, 0) else 0 end) as outbound_g
  from raw_material_transactions rt
), daily_union as (
  select
    tx.tx_date as event_date,
    tx.raw_material_id,
    sum(tx.inbound_g) as inbound_g,
    sum(tx.outbound_g) as outbound_g,
    'actual_tx' as source
  from tx_scope tx
  where coalesce(tx.raw_material_id, '') <> ''
  group by tx.tx_date, tx.raw_material_id

  union all

  select
    lu.production_date as event_date,
    lu.raw_material_id,
    0::numeric as inbound_g,
    sum(lu.required_g) as outbound_g,
    'production_preview' as source
  from leaf_usage lu
  where coalesce(lu.raw_material_id, '') <> ''
  group by lu.production_date, lu.raw_material_id
), running_balance_scope as (
  select
    du.raw_material_id,
    du.event_date,
    du.source,
    du.inbound_g,
    du.outbound_g,
    sum(du.inbound_g - du.outbound_g) over (
      partition by du.raw_material_id
      order by du.event_date, du.source
      rows between unbounded preceding and current row
    ) as running_delta_without_opening
  from daily_union du
), opening_calc as (
  select
    rbs.raw_material_id,
    min(rbs.running_delta_without_opening) as min_running_without_opening
  from running_balance_scope rbs
  group by rbs.raw_material_id
), opening_reco as (
  select
    oc.raw_material_id,
    greatest(0, -oc.min_running_without_opening) as minimum_opening_no_negative_g
  from opening_calc oc
), tx_sum as (
  select
    tx.raw_material_id,
    sum(tx.inbound_g) as tx_inbound_sum_g,
    sum(tx.outbound_g) as tx_outbound_sum_g
  from tx_scope tx
  group by tx.raw_material_id
), preview_sum as (
  select
    lu.raw_material_id,
    sum(lu.required_g) as preview_outbound_sum_g
  from leaf_usage lu
  group by lu.raw_material_id
), opening_final as (
  select
    rs.raw_material_id,
    rs.raw_material_name,
    rs.current_stock_g,
    rs.is_stock_managed,
    orc.minimum_opening_no_negative_g,
    (rs.current_stock_g - coalesce(ts.tx_inbound_sum_g, 0) + coalesce(ts.tx_outbound_sum_g, 0) + coalesce(ps.preview_outbound_sum_g, 0)) as opening_to_match_current_stock_g,
    greatest(
      orc.minimum_opening_no_negative_g,
      (rs.current_stock_g - coalesce(ts.tx_inbound_sum_g, 0) + coalesce(ts.tx_outbound_sum_g, 0) + coalesce(ps.preview_outbound_sum_g, 0))
    ) as recommended_opening_g
  from raw_scope rs
  join opening_reco orc on orc.raw_material_id = rs.raw_material_id
  left join tx_sum ts on ts.raw_material_id = rs.raw_material_id
  left join preview_sum ps on ps.raw_material_id = rs.raw_material_id
  where rs.is_stock_managed = true
    and rs.raw_material_id <> 'ITEM-1780680500370'
), running_with_opening as (
  select
    rbs.raw_material_id,
    rbs.event_date,
    rbs.source,
    (ofn.recommended_opening_g + rbs.running_delta_without_opening) as running_balance_g
  from running_balance_scope rbs
  join opening_final ofn on ofn.raw_material_id = rbs.raw_material_id
), stock_neg_check as (
  select
    count(*) as negative_row_count
  from running_with_opening rwo
  where rwo.running_balance_g < 0
), reconciliation_check as (
  select
    ofn.raw_material_id,
    max(rwo.running_balance_g) filter (
      where (rwo.event_date, rwo.source) = (
        select max(rwo2.event_date), max(rwo2.source)
        from running_with_opening rwo2
        where rwo2.raw_material_id = ofn.raw_material_id
      )
    ) as final_virtual_stock_g,
    ofn.current_stock_g
  from opening_final ofn
  left join running_with_opening rwo on rwo.raw_material_id = ofn.raw_material_id
  group by ofn.raw_material_id, ofn.current_stock_g
), reconciliation_gap as (
  select
    rc.raw_material_id,
    coalesce(rc.final_virtual_stock_g, ofn.recommended_opening_g) as final_virtual_stock_g,
    rc.current_stock_g,
    coalesce(rc.final_virtual_stock_g, ofn.recommended_opening_g) - rc.current_stock_g as final_stock_gap_g
  from reconciliation_check rc
  join opening_final ofn on ofn.raw_material_id = rc.raw_material_id
), opening_candidate as (
  select
    count(distinct ofn.raw_material_id) as opening_balance_candidate_count
  from opening_final ofn
), excluded_records as (
  select
    pb.production_record_id,
    pb.work_date,
    pb.product_id,
    pb.snapshot_product_name,
    pb.planned_quantity_g,
    pb.actual_quantity_g,
    pb.status,
    case
      when pb.product_id is null then 'product_id 없음'
      when pb.actual_quantity_g <= 0 then 'actual_quantity_g null/0'
      else '기타'
    end as exclusion_reason
  from production_base pb
  where pb.product_id is null or pb.actual_quantity_g <= 0
)
select
  (select count(*) from production_base) as total_non_cancelled_production_count,
  (select count(*) from production_scope) as production_record_count,
  (select count(*) from production_base pb where pb.product_id is not null and pb.actual_quantity_g <= 0) as excluded_nonpositive_actual_count,
  (select count(*) from production_base pb where pb.product_id is null) as excluded_missing_product_id_count,
  (select count(*) from leaf_usage) as final_leaf_usage_row_count,
  (select count(distinct raw_material_id) from leaf_usage where is_stock_managed = true and raw_material_id <> 'ITEM-1780680500370') as distinct_stock_material_count,
  (select count(*) from leaf_usage where is_stock_managed = false) as non_stock_usage_row_count,
  (select count(*) from leaf_usage where raw_material_id = 'ITEM-1780680500370') as water_usage_row_count,
  (select count(*) from leaf_usage where inline_expansion_flag = 1) as inline_semifinished_expansion_count,
  (select count(*) from leaf_usage where unresolved_flag = 1) as unresolved_mapping_count,
  (select count(*) from leaf_usage where cycle_flag = 1) as expansion_cycle_count,
  (select negative_row_count from stock_neg_check) as stock_negative_balance_count,
  (select count(*) from reconciliation_gap where final_stock_gap_g <> 0) as reconciliation_gap_material_count,
  (select opening_balance_candidate_count from opening_candidate) as opening_balance_candidate_count,
  (select count(*) from leaf_usage) as production_outbound_candidate_count,
  case
    when (select count(*) from leaf_usage where unresolved_flag = 1) = 0
     and (select count(*) from leaf_usage where cycle_flag = 1) = 0
     and (select negative_row_count from stock_neg_check) = 0
     and (select count(*) from reconciliation_gap where final_stock_gap_g <> 0) = 0
     and (select count(*) from production_base pb where pb.product_id is null) = 0
    then true
    else false
  end as readiness_for_ledger_insert;

/* ==================================================
 * SECTION 8) 제외된 생산기록 상세
 * ================================================== */
with production_base as (
  select
    pr.id as production_record_id,
    coalesce(to_jsonb(pr)->>'work_date', '') as work_date,
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), '') as snapshot_product_name,
    coalesce((to_jsonb(pr)->>'planned_quantity_g')::numeric, 0) as planned_quantity_g,
    coalesce((to_jsonb(pr)->>'actual_quantity_g')::numeric, 0) as actual_quantity_g,
    coalesce(lower(to_jsonb(pr)->>'status'), '') as status
  from production_records pr
  where coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('void', 'cancelled', 'canceled', 'deleted')
)
select
  pb.production_record_id,
  pb.work_date,
  pb.product_id,
  pb.snapshot_product_name as product_name,
  pb.planned_quantity_g,
  pb.actual_quantity_g,
  pb.status,
  case
    when pb.product_id is null then 'product_id 없음'
    when pb.actual_quantity_g <= 0 then 'actual_quantity_g null/0'
    else '기타'
  end as exclusion_reason
from production_base pb
where pb.product_id is null
   or pb.actual_quantity_g <= 0
order by pb.work_date, pb.production_record_id;
