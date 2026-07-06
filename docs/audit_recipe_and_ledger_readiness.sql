-- MONI 원료수불부 작성 전 검증 SQL (읽기 전용)
-- 주의: 이 파일은 SELECT만 포함합니다.

-- =========================================================
-- 0) 기준 데이터 집합
-- =========================================================
with production_base as (
  select
    pr.id,
    pr.lot_number,
    pr.work_date,
    pr.product_id,
    pr.product_name,
    pr.planned_quantity_g,
    pr.actual_quantity_g,
    pr.status
  from production_records pr
),
production_scope as (
  select *
  from production_base
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct
    ps.product_id,
    ps.product_name
  from production_scope ps
),
recipe_rows as (
  select
    r.id as recipe_id,
    r.product_id,
    r.product_name,
    r.food_type_id,
    r.food_type_name,
    r.ratio_percent,
    r.ingredient_type,
    r.semi_product_id
  from recipes r
  join products_in_scope p
    on p.product_id = r.product_id
),
recipe_totals as (
  select
    r.product_id,
    max(r.product_name) as product_name,
    count(*) as recipe_row_count,
    sum(coalesce(r.ratio_percent, 0)) as ratio_total
  from recipe_rows r
  group by r.product_id
),
mapping_all as (
  select
    m.id as mapping_id,
    m.food_type_id,
    m.raw_material_name,
    m.is_default,
    m.created_at,
    coalesce(to_jsonb(m)->>'mapping_scope', 'global') as mapping_scope,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id
  from raw_material_mapping m
),
mapping_resolved as (
  select
    rr.recipe_id,
    rr.product_id,
    rr.product_name,
    rr.food_type_id,
    rr.food_type_name,
    rr.ratio_percent,
    rr.ingredient_type,
    rr.semi_product_id,
    mp.mapping_id,
    mp.mapping_scope,
    mp.raw_material_ref_id,
    mp.raw_material_name as mapped_raw_material_name,
    rm.id as resolved_material_id,
    rm.item_name as resolved_item_name,
    rm.is_active as resolved_item_active,
    case
      when mp.mapping_id is not null then 'mapped'
      when fb.id is not null then 'name_fallback'
      else 'unmapped'
    end as mapping_status
  from recipe_rows rr
  left join lateral (
    select ma.*
    from mapping_all ma
    where ma.is_default = true
      and (
        (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
        or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
        or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
      )
    order by
      case
        when ma.mapping_scope = 'recipe' then 1
        when ma.mapping_scope = 'product' then 2
        when ma.mapping_scope = 'global' then 3
        else 9
      end,
      ma.created_at desc nulls last,
      ma.mapping_id desc
    limit 1
  ) mp on true
  left join raw_materials rm
    on (
      mp.raw_material_ref_id is not null
      and rm.id = mp.raw_material_ref_id
    )
  left join raw_materials fb
    on (
      mp.mapping_id is null
      and lower(trim(fb.item_name)) = lower(trim(rr.food_type_name))
    )
),
mapping_needs_review as (
  select
    mr.*,
    case
      when mr.mapping_status = 'unmapped' then '매핑 없음'
      when mr.mapping_status = 'name_fallback' then '이름 fallback만 가능'
      when mr.mapping_status = 'mapped' and mr.raw_material_ref_id is not null and mr.resolved_material_id is null then 'raw_material_ref_id 불일치'
      when mr.mapping_status = 'mapped' and coalesce(mr.resolved_item_active, true) = false then '연결 원재료 비활성'
      else null
    end as review_reason
  from mapping_resolved mr
),
is_default_false_only as (
  select
    rr.recipe_id,
    rr.product_id,
    rr.product_name,
    rr.food_type_id,
    rr.food_type_name,
    count(*) filter (where ma.is_default = false) as false_count,
    count(*) filter (where ma.is_default = true) as true_count
  from recipe_rows rr
  left join mapping_all ma
    on (
      (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
      or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
      or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
    )
  group by
    rr.recipe_id,
    rr.product_id,
    rr.product_name,
    rr.food_type_id,
    rr.food_type_name
),
semifinished_raw as (
  select
    rm.id,
    rm.item_name,
    rm.ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    nullif(lower(to_jsonb(rm)->>'semifinished_usage_type'), '') as semifinished_usage_type
  from raw_materials rm
  where rm.ingredient_type = '반제품'
),
semifinished_check as (
  select
    sr.id as raw_material_id,
    sr.item_name as raw_material_name,
    sr.ingredient_type,
    sr.linked_product_id,
    sr.semifinished_usage_type,
    p.id as linked_product_exists_id,
    p.product_name as linked_product_name,
    p.product_type as linked_product_type,
    case
      when sr.semifinished_usage_type is null then 'stock'
      when sr.semifinished_usage_type in ('stock', 'inline') then sr.semifinished_usage_type
      else 'invalid'
    end as usage_type_normalized
  from semifinished_raw sr
  left join products p
    on p.id = sr.linked_product_id
),
semifinished_recipe_exists as (
  select
    sc.*,
    case
      when sc.linked_product_id is null then 0
      else (
        select count(*)
        from recipes r
        where r.product_id = sc.linked_product_id
      )
    end as linked_recipe_count
  from semifinished_check sc
),
demand_base as (
  select
    ps.id as production_record_id,
    ps.work_date,
    ps.lot_number,
    ps.product_id,
    ps.product_name,
    ps.planned_quantity_g,
    ps.actual_quantity_g,
    rr.recipe_id,
    rr.food_type_id,
    rr.food_type_name,
    rr.ratio_percent,
    rr.ingredient_type,
    rr.semi_product_id,
    case
      when ps.planned_quantity_g is null then null
      when rr.ratio_percent is null then null
      else round((ps.planned_quantity_g * rr.ratio_percent) / 100.0, 3)
    end as required_g
  from production_scope ps
  join recipe_rows rr
    on rr.product_id = ps.product_id
),
material_demand as (
  select
    mb.work_date,
    mr.resolved_material_id as raw_material_id,
    coalesce(mr.resolved_item_name, mr.mapped_raw_material_name, mb.food_type_name) as material_name,
    sum(coalesce(mb.required_g, 0)) as total_required_g
  from demand_base mb
  left join mapping_resolved mr
    on mr.recipe_id = mb.recipe_id
  group by
    mb.work_date,
    mr.resolved_material_id,
    coalesce(mr.resolved_item_name, mr.mapped_raw_material_name, mb.food_type_name)
),
stock_snapshot as (
  select
    rm.id as raw_material_id,
    rm.item_name as material_name,
    coalesce(rm.current_stock_g, 0)::numeric as current_stock_g
  from raw_materials rm
),
stock_risk as (
  select
    md.work_date,
    md.raw_material_id,
    md.material_name,
    md.total_required_g,
    ss.current_stock_g,
    (coalesce(ss.current_stock_g, 0) - coalesce(md.total_required_g, 0)) as remaining_after_plan_g
  from material_demand md
  left join stock_snapshot ss
    on ss.raw_material_id = md.raw_material_id
),
tx_base as (
  select
    rt.id,
    coalesce(rt.txn_type, '') as txn_type,
    coalesce(rt.lot_number, '') as lot_number,
    coalesce(rt.note, '') as note,
    nullif(to_jsonb(rt)->>'production_record_id', '') as production_record_id_text,
    case
      when coalesce(to_jsonb(rt)->>'quantity_g', '') ~ '^-?\\d+(\\.\\d+)?$' then (to_jsonb(rt)->>'quantity_g')::numeric
      when coalesce(to_jsonb(rt)->>'qty_g', '') ~ '^-?\\d+(\\.\\d+)?$' then (to_jsonb(rt)->>'qty_g')::numeric
      when coalesce(to_jsonb(rt)->>'quantity', '') ~ '^-?\\d+(\\.\\d+)?$' then (to_jsonb(rt)->>'quantity')::numeric
      else null
    end as qty_g
  from raw_material_transactions rt
),
tx_confirm_outbound as (
  select *
  from tx_base
  where upper(txn_type) = 'OUTBOUND'
    and (
      note ilike '%production_record_id=%'
      or note ilike '%lot_number=%'
      or production_record_id_text is not null
    )
),
tx_inbound_semifinished as (
  select *
  from tx_base
  where upper(txn_type) = 'INBOUND'
    and (
      note ilike '%반제품%'
      or note ilike '%semifinished%'
      or note ilike '%source_product=%'
    )
),
tx_risk_duplicate as (
  select
    key_type,
    key_value,
    count(*) as tx_count
  from (
    select
      'production_record_id'::text as key_type,
      production_record_id_text as key_value
    from tx_confirm_outbound
    where production_record_id_text is not null
    union all
    select
      'lot_number'::text as key_type,
      nullif(regexp_replace(note, '.*lot_number=([^; ]+).*', '\1'), note) as key_value
    from tx_confirm_outbound
    where note ilike '%lot_number=%'
  ) s
  where key_value is not null
  group by key_type, key_value
  having count(*) > 1
)
-- =========================================================
-- 1) 생산일정/제품 연결 검증
-- =========================================================
select
  'A1. production_records 전체' as section,
  count(*) as row_count
from production_base
union all
select
  'A2. 생산일정 범위(취소 제외)',
  count(*)
from production_scope
union all
select
  'A3. product_id 없음',
  count(*)
from production_scope
where coalesce(product_id, '') = ''
union all
select
  'A4. product_id 불일치',
  count(*)
from production_scope ps
left join products p on p.id = ps.product_id
where coalesce(ps.product_id, '') <> ''
  and p.id is null
union all
select
  'A5. product_name만 있고 product_id 없음',
  count(*)
from production_scope
where coalesce(product_name, '') <> ''
  and coalesce(product_id, '') = ''
union all
select
  'A6. planned_quantity_g null/0',
  count(*)
from production_scope
where coalesce(planned_quantity_g, 0) <= 0
union all
select
  'A7. actual_quantity_g null/0',
  count(*)
from production_scope
where coalesce(actual_quantity_g, 0) <= 0
;

-- 문제 생산기록 상세
select
  ps.id,
  ps.work_date,
  ps.lot_number,
  ps.product_id,
  ps.product_name,
  ps.planned_quantity_g,
  ps.actual_quantity_g,
  ps.status,
  case
    when coalesce(ps.product_id, '') = '' then 'product_id 없음'
    when p.id is null then 'product_id 불일치'
    when coalesce(ps.planned_quantity_g, 0) <= 0 then 'planned_quantity_g null/0'
    when coalesce(ps.actual_quantity_g, 0) <= 0 then 'actual_quantity_g null/0'
    else '정상'
  end as issue_reason
from production_scope ps
left join products p on p.id = ps.product_id
where coalesce(ps.product_id, '') = ''
   or p.id is null
   or coalesce(ps.planned_quantity_g, 0) <= 0
   or coalesce(ps.actual_quantity_g, 0) <= 0
order by ps.work_date desc, ps.lot_number asc;

-- =========================================================
-- 2) 제품별 레시피 등록/100% 검증
-- =========================================================
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id, product_name
  from production_scope
)
select
  p.product_id,
  max(coalesce(p.product_name, pr.product_name)) as product_name,
  count(r.id) as recipe_row_count,
  coalesce(sum(coalesce(r.ratio_percent, 0)), 0) as ratio_total,
  case
    when count(r.id) = 0 then '레시피 없음'
    when round(coalesce(sum(coalesce(r.ratio_percent, 0)), 0)::numeric, 2) <> 100 then '합계 100% 아님'
    else '정상'
  end as recipe_status
from products_in_scope p
left join products pr on pr.id = p.product_id
left join recipes r on r.product_id = p.product_id
group by p.product_id
order by product_name;

-- 레시피 합계 100% 오차 상세
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id
  from production_scope
),
recipe_totals as (
  select
    r.product_id,
    max(r.product_name) as product_name,
    count(*) as recipe_row_count,
    sum(coalesce(r.ratio_percent, 0)) as ratio_total
  from recipes r
  join products_in_scope p on p.product_id = r.product_id
  group by r.product_id
)
select
  rt.product_id,
  rt.product_name,
  rt.recipe_row_count,
  rt.ratio_total,
  round(rt.ratio_total::numeric, 2) - 100 as diff_from_100
from recipe_totals rt
where round(rt.ratio_total::numeric, 2) <> 100
order by abs(round(rt.ratio_total::numeric, 2) - 100) desc, rt.product_name;

-- =========================================================
-- 3) 실제 원재료 연결 검증 (recipe/product/global/fallback)
-- =========================================================
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id
  from production_scope
),
recipe_rows as (
  select
    r.id as recipe_id,
    r.product_id,
    r.product_name,
    r.food_type_id,
    r.food_type_name,
    r.ratio_percent
  from recipes r
  join products_in_scope p on p.product_id = r.product_id
),
mapping_all as (
  select
    m.id as mapping_id,
    m.food_type_id,
    m.raw_material_name,
    m.is_default,
    m.created_at,
    coalesce(to_jsonb(m)->>'mapping_scope', 'global') as mapping_scope,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id
  from raw_material_mapping m
),
resolved as (
  select
    rr.*,
    mp.mapping_id,
    mp.mapping_scope,
    mp.raw_material_ref_id,
    mp.raw_material_name as mapped_raw_material_name,
    rm.id as resolved_material_id,
    rm.item_name as resolved_item_name,
    rm.is_active as resolved_item_active,
    fb.id as fallback_material_id
  from recipe_rows rr
  left join lateral (
    select ma.*
    from mapping_all ma
    where ma.is_default = true
      and (
        (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
        or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
        or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
      )
    order by
      case
        when ma.mapping_scope = 'recipe' then 1
        when ma.mapping_scope = 'product' then 2
        when ma.mapping_scope = 'global' then 3
        else 9
      end,
      ma.created_at desc nulls last
    limit 1
  ) mp on true
  left join raw_materials rm on rm.id = mp.raw_material_ref_id
  left join raw_materials fb
    on mp.mapping_id is null
   and lower(trim(fb.item_name)) = lower(trim(rr.food_type_name))
)
select
  case
    when mapping_id is not null and raw_material_ref_id is not null and resolved_material_id is null then '확인필요(raw_material_ref_id 불일치)'
    when mapping_id is not null and coalesce(resolved_item_active, true) = false then '확인필요(연결 원재료 비활성)'
    when mapping_id is not null then '정상(매핑)'
    when fallback_material_id is not null then 'fallback만 가능'
    else '처리필요(미연결)'
  end as mapping_bucket,
  count(*) as row_count
from resolved
group by 1
order by 1;

-- 매핑 문제 상세
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id
  from production_scope
),
recipe_rows as (
  select
    r.id as recipe_id,
    r.product_id,
    r.product_name,
    r.food_type_id,
    r.food_type_name,
    r.ratio_percent
  from recipes r
  join products_in_scope p on p.product_id = r.product_id
),
mapping_all as (
  select
    m.id as mapping_id,
    m.food_type_id,
    m.raw_material_name,
    m.is_default,
    m.created_at,
    coalesce(to_jsonb(m)->>'mapping_scope', 'global') as mapping_scope,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id
  from raw_material_mapping m
),
resolved as (
  select
    rr.*,
    mp.mapping_id,
    mp.mapping_scope,
    mp.raw_material_ref_id,
    mp.raw_material_name as mapped_raw_material_name,
    rm.id as resolved_material_id,
    rm.item_name as resolved_item_name,
    rm.is_active as resolved_item_active,
    fb.id as fallback_material_id
  from recipe_rows rr
  left join lateral (
    select ma.*
    from mapping_all ma
    where ma.is_default = true
      and (
        (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
        or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
        or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
      )
    order by
      case
        when ma.mapping_scope = 'recipe' then 1
        when ma.mapping_scope = 'product' then 2
        when ma.mapping_scope = 'global' then 3
        else 9
      end,
      ma.created_at desc nulls last
    limit 1
  ) mp on true
  left join raw_materials rm on rm.id = mp.raw_material_ref_id
  left join raw_materials fb
    on mp.mapping_id is null
   and lower(trim(fb.item_name)) = lower(trim(rr.food_type_name))
)
select
  recipe_id,
  product_id,
  product_name,
  food_type_id,
  food_type_name,
  ratio_percent,
  mapping_scope,
  raw_material_ref_id,
  mapped_raw_material_name,
  resolved_item_name,
  resolved_item_active,
  case
    when mapping_id is null and fallback_material_id is null then '미연결'
    when mapping_id is null and fallback_material_id is not null then 'name_fallback'
    when mapping_id is not null and raw_material_ref_id is not null and resolved_material_id is null then 'raw_material_ref_id 불일치'
    when mapping_id is not null and coalesce(resolved_item_active, true) = false then '연결 원재료 비활성'
    else '정상'
  end as issue_reason
from resolved
where
  (mapping_id is null and fallback_material_id is null)
  or (mapping_id is null and fallback_material_id is not null)
  or (mapping_id is not null and raw_material_ref_id is not null and resolved_material_id is null)
  or (mapping_id is not null and coalesce(resolved_item_active, true) = false)
order by product_name, ratio_percent desc, food_type_name;

-- is_default=false만 존재하는 케이스
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id
  from production_scope
),
recipe_rows as (
  select
    r.id as recipe_id,
    r.product_id,
    r.product_name,
    r.food_type_id,
    r.food_type_name
  from recipes r
  join products_in_scope p on p.product_id = r.product_id
),
mapping_all as (
  select
    m.id,
    m.food_type_id,
    m.is_default,
    coalesce(to_jsonb(m)->>'mapping_scope', 'global') as mapping_scope,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id
  from raw_material_mapping m
)
select
  rr.recipe_id,
  rr.product_id,
  rr.product_name,
  rr.food_type_id,
  rr.food_type_name,
  count(*) filter (where ma.is_default = false) as is_default_false_count,
  count(*) filter (where ma.is_default = true) as is_default_true_count
from recipe_rows rr
left join mapping_all ma
  on (
    (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
    or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
    or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
  )
group by rr.recipe_id, rr.product_id, rr.product_name, rr.food_type_id, rr.food_type_name
having count(*) filter (where ma.is_default = false) > 0
   and count(*) filter (where ma.is_default = true) = 0
order by rr.product_name, rr.food_type_name;

-- =========================================================
-- 4) 반제품 연결/사용방식 검증
-- =========================================================
with semifinished_raw as (
  select
    rm.id,
    rm.item_name,
    rm.ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    nullif(lower(to_jsonb(rm)->>'semifinished_usage_type'), '') as semifinished_usage_type
  from raw_materials rm
  where rm.ingredient_type = '반제품'
),
checked as (
  select
    sr.id as raw_material_id,
    sr.item_name as raw_material_name,
    sr.linked_product_id,
    sr.semifinished_usage_type,
    p.id as linked_product_exists_id,
    p.product_name as linked_product_name,
    p.product_type as linked_product_type,
    case
      when sr.semifinished_usage_type is null then 'stock'
      when sr.semifinished_usage_type in ('stock', 'inline') then sr.semifinished_usage_type
      else 'invalid'
    end as usage_type_normalized
  from semifinished_raw sr
  left join products p on p.id = sr.linked_product_id
)
select
  case
    when linked_product_id is null then '미연결'
    when linked_product_exists_id is null then 'linked_product_id 불일치'
    when linked_product_type <> '반제품' then '연결 제품구분 불일치'
    when usage_type_normalized = 'invalid' then 'usage_type 값 오류'
    else '정상'
  end as semi_bucket,
  count(*) as row_count
from checked
group by 1
order by 1;

-- inline인데 연결/레시피 누락
with semifinished_raw as (
  select
    rm.id,
    rm.item_name,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    nullif(lower(to_jsonb(rm)->>'semifinished_usage_type'), '') as semifinished_usage_type
  from raw_materials rm
  where rm.ingredient_type = '반제품'
)
select
  sr.id as raw_material_id,
  sr.item_name as raw_material_name,
  sr.linked_product_id,
  sr.semifinished_usage_type,
  case
    when sr.linked_product_id is null then 'inline인데 linked_product_id 없음'
    when not exists (select 1 from recipes r where r.product_id = sr.linked_product_id) then 'inline인데 연결 제품 레시피 없음'
    else '정상'
  end as issue_reason
from semifinished_raw sr
where coalesce(sr.semifinished_usage_type, 'stock') = 'inline'
  and (
    sr.linked_product_id is null
    or not exists (select 1 from recipes r where r.product_id = sr.linked_product_id)
  )
order by sr.item_name;

-- stock/null 반제품 현황
with semifinished_raw as (
  select
    rm.id,
    rm.item_name,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    nullif(lower(to_jsonb(rm)->>'semifinished_usage_type'), '') as semifinished_usage_type
  from raw_materials rm
  where rm.ingredient_type = '반제품'
)
select
  sr.id as raw_material_id,
  sr.item_name as raw_material_name,
  sr.linked_product_id,
  coalesce(sr.semifinished_usage_type, 'stock') as usage_type_normalized
from semifinished_raw sr
where coalesce(sr.semifinished_usage_type, 'stock') = 'stock'
order by sr.item_name;

-- =========================================================
-- 5) 수불 중복 생성 위험 검증
-- =========================================================
with tx_base as (
  select
    rt.id,
    coalesce(rt.txn_type, '') as txn_type,
    coalesce(rt.lot_number, '') as lot_number,
    coalesce(rt.note, '') as note,
    nullif(to_jsonb(rt)->>'production_record_id', '') as production_record_id_text
  from raw_material_transactions rt
),
tx_confirm_outbound as (
  select *
  from tx_base
  where upper(txn_type) = 'OUTBOUND'
    and (
      note ilike '%production_record_id=%'
      or note ilike '%lot_number=%'
      or production_record_id_text is not null
    )
),
dup_by_record as (
  select
    production_record_id_text as key_value,
    count(*) as tx_count
  from tx_confirm_outbound
  where production_record_id_text is not null
  group by production_record_id_text
  having count(*) > 1
),
dup_by_lot as (
  select
    nullif(regexp_replace(note, '.*lot_number=([^; ]+).*', '\1'), note) as key_value,
    count(*) as tx_count
  from tx_confirm_outbound
  where note ilike '%lot_number=%'
  group by nullif(regexp_replace(note, '.*lot_number=([^; ]+).*', '\1'), note)
  having count(*) > 1
)
select 'production_record_id_dup' as risk_type, key_value, tx_count
from dup_by_record
union all
select 'lot_number_dup' as risk_type, key_value, tx_count
from dup_by_lot
order by risk_type, key_value;

-- 생산소모/반제품입고 추정 거래 수
with tx_base as (
  select
    rt.id,
    coalesce(rt.txn_type, '') as txn_type,
    coalesce(rt.note, '') as note
  from raw_material_transactions rt
)
select
  sum(case when upper(txn_type) = 'OUTBOUND' and (note ilike '%production_record_id=%' or note ilike '%lot_number=%') then 1 else 0 end) as outbound_for_production_count,
  sum(case when upper(txn_type) = 'INBOUND' and (note ilike '%반제품%' or note ilike '%semifinished%' or note ilike '%source_product=%') then 1 else 0 end) as inbound_for_semifinished_count
from tx_base;

-- =========================================================
-- 6) 생산일정 기반 필요량/재고 부족/마이너스 재고 검증
-- =========================================================
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id
  from production_scope
),
recipe_rows as (
  select
    r.id as recipe_id,
    r.product_id,
    r.food_type_id,
    r.food_type_name,
    r.ratio_percent
  from recipes r
  join products_in_scope p on p.product_id = r.product_id
),
mapping_all as (
  select
    m.id,
    m.food_type_id,
    m.raw_material_name,
    m.is_default,
    coalesce(to_jsonb(m)->>'mapping_scope', 'global') as mapping_scope,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id,
    m.created_at
  from raw_material_mapping m
),
resolved as (
  select
    rr.recipe_id,
    rr.product_id,
    rr.food_type_name,
    rr.ratio_percent,
    mp.raw_material_ref_id,
    mp.raw_material_name as mapped_raw_material_name,
    rm.id as resolved_material_id,
    rm.item_name as resolved_item_name
  from recipe_rows rr
  left join lateral (
    select ma.*
    from mapping_all ma
    where ma.is_default = true
      and (
        (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
        or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
        or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
      )
    order by
      case
        when ma.mapping_scope = 'recipe' then 1
        when ma.mapping_scope = 'product' then 2
        else 3
      end,
      ma.created_at desc nulls last
    limit 1
  ) mp on true
  left join raw_materials rm on rm.id = mp.raw_material_ref_id
),
demand as (
  select
    ps.work_date,
    ps.id as production_record_id,
    ps.product_id,
    ps.product_name,
    rs.resolved_material_id as raw_material_id,
    coalesce(rs.resolved_item_name, rs.mapped_raw_material_name, rs.food_type_name) as material_name,
    round((coalesce(ps.planned_quantity_g, 0) * coalesce(rs.ratio_percent, 0)) / 100.0, 3) as required_g
  from production_scope ps
  join resolved rs on rs.product_id = ps.product_id
),
demand_agg as (
  select
    work_date,
    raw_material_id,
    material_name,
    sum(required_g) as required_g
  from demand
  group by work_date, raw_material_id, material_name
),
stock as (
  select
    rm.id as raw_material_id,
    rm.item_name,
    coalesce(rm.current_stock_g, 0)::numeric as current_stock_g
  from raw_materials rm
)
select
  da.work_date,
  da.raw_material_id,
  da.material_name,
  da.required_g,
  st.current_stock_g,
  (coalesce(st.current_stock_g, 0) - coalesce(da.required_g, 0)) as remaining_after_plan_g,
  case
    when st.raw_material_id is null then '재고 조회불가(매핑 미완성)'
    when coalesce(st.current_stock_g, 0) < 0 then '현재 마이너스 재고'
    when coalesce(st.current_stock_g, 0) < coalesce(da.required_g, 0) then '일정 기준 부족 위험'
    else '정상'
  end as stock_risk
from demand_agg da
left join stock st on st.raw_material_id = da.raw_material_id
where
  st.raw_material_id is null
  or coalesce(st.current_stock_g, 0) < 0
  or coalesce(st.current_stock_g, 0) < coalesce(da.required_g, 0)
order by da.work_date, da.material_name;

-- 현재 마이너스 재고 목록
select
  rm.id as raw_material_id,
  rm.item_name as raw_material_name,
  rm.current_stock_g
from raw_materials rm
where coalesce(rm.current_stock_g, 0) < 0
order by rm.current_stock_g asc, rm.item_name;

-- =========================================================
-- 7) 최종 요약
-- =========================================================
with production_scope as (
  select *
  from production_records
  where coalesce(lower(status), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select distinct product_id
  from production_scope
),
recipe_rows as (
  select
    r.id as recipe_id,
    r.product_id,
    r.food_type_id,
    r.food_type_name,
    r.ratio_percent
  from recipes r
  join products_in_scope p on p.product_id = r.product_id
),
recipe_total as (
  select
    r.product_id,
    sum(coalesce(r.ratio_percent, 0)) as ratio_total
  from recipe_rows r
  group by r.product_id
),
mapping_all as (
  select
    m.id,
    m.food_type_id,
    m.raw_material_name,
    m.is_default,
    m.created_at,
    coalesce(to_jsonb(m)->>'mapping_scope', 'global') as mapping_scope,
    nullif(to_jsonb(m)->>'recipe_id', '') as recipe_id,
    nullif(to_jsonb(m)->>'product_id', '') as product_id,
    nullif(to_jsonb(m)->>'raw_material_ref_id', '') as raw_material_ref_id
  from raw_material_mapping m
),
resolved as (
  select
    rr.recipe_id,
    rr.product_id,
    rr.food_type_id,
    rr.food_type_name,
    mp.id as mapping_id,
    mp.raw_material_ref_id,
    rm.id as resolved_material_id,
    rm.is_active as resolved_item_active,
    fb.id as fallback_material_id
  from recipe_rows rr
  left join lateral (
    select ma.*
    from mapping_all ma
    where ma.is_default = true
      and (
        (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
        or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
        or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
      )
    order by
      case
        when ma.mapping_scope = 'recipe' then 1
        when ma.mapping_scope = 'product' then 2
        else 3
      end,
      ma.created_at desc nulls last
    limit 1
  ) mp on true
  left join raw_materials rm on rm.id = mp.raw_material_ref_id
  left join raw_materials fb
    on mp.id is null
   and lower(trim(fb.item_name)) = lower(trim(rr.food_type_name))
),
default_false_only as (
  select
    rr.recipe_id,
    count(*) filter (where ma.is_default = false) as false_count,
    count(*) filter (where ma.is_default = true) as true_count
  from recipe_rows rr
  left join mapping_all ma
    on (
      (ma.mapping_scope = 'recipe' and ma.recipe_id = rr.recipe_id::text)
      or (ma.mapping_scope = 'product' and ma.product_id = rr.product_id and ma.food_type_id = rr.food_type_id)
      or (ma.mapping_scope = 'global' and ma.food_type_id = rr.food_type_id)
    )
  group by rr.recipe_id
),
semi as (
  select
    rm.id,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    nullif(lower(to_jsonb(rm)->>'semifinished_usage_type'), '') as semifinished_usage_type
  from raw_materials rm
  where rm.ingredient_type = '반제품'
),
tx_base as (
  select
    rt.id,
    coalesce(rt.txn_type, '') as txn_type,
    coalesce(rt.note, '') as note,
    nullif(to_jsonb(rt)->>'production_record_id', '') as production_record_id_text
  from raw_material_transactions rt
),
dup_record as (
  select production_record_id_text
  from tx_base
  where upper(txn_type) = 'OUTBOUND'
    and production_record_id_text is not null
  group by production_record_id_text
  having count(*) > 1
),
dup_lot as (
  select nullif(regexp_replace(note, '.*lot_number=([^; ]+).*', '\1'), note) as lot_key
  from tx_base
  where upper(txn_type) = 'OUTBOUND'
    and note ilike '%lot_number=%'
  group by nullif(regexp_replace(note, '.*lot_number=([^; ]+).*', '\1'), note)
  having count(*) > 1
),
negative_stock as (
  select id
  from raw_materials
  where coalesce(current_stock_g, 0) < 0
)
select
  (select count(*) from production_scope) as production_records_in_scope_count,
  (select count(*) from production_scope ps left join products p on p.id = ps.product_id where coalesce(ps.product_id, '') = '' or p.id is null) as production_product_mismatch_count,
  (select count(*) from products_in_scope p left join recipes r on r.product_id = p.product_id where r.id is null) as products_without_recipes_count,
  (select count(*) from recipe_total where round(coalesce(ratio_total, 0)::numeric, 2) <> 100) as products_ratio_not_100_count,
  (select count(*) from resolved where mapping_id is null and fallback_material_id is null) as mapping_unresolved_count,
  (select count(*) from resolved where mapping_id is null and fallback_material_id is not null) as mapping_name_fallback_count,
  (select count(*) from resolved where mapping_id is not null and raw_material_ref_id is not null and resolved_material_id is null) as mapping_ref_mismatch_count,
  (select count(*) from resolved where mapping_id is not null and coalesce(resolved_item_active, true) = false) as mapping_inactive_material_count,
  (select count(*) from default_false_only where false_count > 0 and true_count = 0) as mapping_is_default_false_only_count,
  (select count(*) from semi where linked_product_id is null) as semifinished_unlinked_count,
  (select count(*) from semi where coalesce(semifinished_usage_type, 'stock') not in ('stock', 'inline')) as semifinished_usage_invalid_count,
  (select count(*) from semi where coalesce(semifinished_usage_type, 'stock') = 'inline' and linked_product_id is null) as semifinished_inline_missing_link_count,
  (select count(*) from dup_record) as tx_duplicate_by_record_count,
  (select count(*) from dup_lot) as tx_duplicate_by_lot_count,
  (select count(*) from negative_stock) as negative_stock_material_count,
  case
    when
      (select count(*) from production_scope ps left join products p on p.id = ps.product_id where coalesce(ps.product_id, '') = '' or p.id is null) = 0
      and (select count(*) from products_in_scope p left join recipes r on r.product_id = p.product_id where r.id is null) = 0
      and (select count(*) from recipe_total where round(coalesce(ratio_total, 0)::numeric, 2) <> 100) = 0
      and (select count(*) from resolved where mapping_id is null and fallback_material_id is null) = 0
      and (select count(*) from resolved where mapping_id is null and fallback_material_id is not null) = 0
      and (select count(*) from resolved where mapping_id is not null and raw_material_ref_id is not null and resolved_material_id is null) = 0
      and (select count(*) from resolved where mapping_id is not null and coalesce(resolved_item_active, true) = false) = 0
      and (select count(*) from default_false_only where false_count > 0 and true_count = 0) = 0
      and (select count(*) from semi where linked_product_id is null) = 0
      and (select count(*) from semi where coalesce(semifinished_usage_type, 'stock') not in ('stock', 'inline')) = 0
      and (select count(*) from semi where coalesce(semifinished_usage_type, 'stock') = 'inline' and linked_product_id is null) = 0
      and (select count(*) from dup_record) = 0
      and (select count(*) from dup_lot) = 0
      and (select count(*) from negative_stock) = 0
    then '다음 단계 진행 가능'
    else '문제값 존재: 원료수불부 작성 SQL 생성 금지'
  end as readiness_decision
;
