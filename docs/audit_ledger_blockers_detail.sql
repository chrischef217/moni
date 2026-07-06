-- 원료수불부 blocker 상세 진단 SQL (SELECT 전용)
-- 주의: 데이터 변경 쿼리 금지 (INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/CREATE 없음)

-- 1) 생산기록-제품 연결 불일치 상세
with production_base as (
  select
    pr.id,
    coalesce(nullif(to_jsonb(pr)->>'production_date', ''), nullif(to_jsonb(pr)->>'work_date', '')) as production_date,
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), nullif(to_jsonb(pr)->>'name', '')) as production_product_name,
    pr.planned_quantity_g,
    pr.actual_quantity_g
  from production_records pr
  where coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_base as (
  select
    p.id,
    coalesce(nullif(to_jsonb(p)->>'name', ''), nullif(to_jsonb(p)->>'product_name', '')) as product_name
  from products p
),
joined as (
  select
    pb.*,
    p.id as matched_product_id,
    p.product_name as matched_product_name,
    (
      select count(*)
      from products_base ep
      where lower(trim(ep.product_name)) = lower(trim(pb.production_product_name))
    ) as exact_name_match_count,
    (
      select count(*)
      from products_base lp
      where lower(trim(lp.product_name)) like '%' || lower(trim(pb.production_product_name)) || '%'
         or lower(trim(pb.production_product_name)) like '%' || lower(trim(lp.product_name)) || '%'
    ) as like_name_match_count
  from production_base pb
  left join products_base p on p.id = pb.product_id
)
select
  j.id,
  j.production_date,
  j.product_id,
  j.production_product_name as product_name,
  j.planned_quantity_g,
  j.actual_quantity_g,
  j.matched_product_id,
  j.matched_product_name,
  case
    when coalesce(j.product_id, '') = '' and coalesce(j.production_product_name, '') = '' then 'product_id 없음'
    when coalesce(j.product_id, '') = '' and coalesce(j.production_product_name, '') <> '' and j.exact_name_match_count = 1 then 'product_name과 products.name이 정확히 일치하지만 product_id 미연결'
    when coalesce(j.product_id, '') = '' and coalesce(j.production_product_name, '') <> '' and j.like_name_match_count = 0 then '제품 후보 없음'
    when coalesce(j.product_id, '') = '' and coalesce(j.production_product_name, '') <> '' then 'product_name만 존재'
    when coalesce(j.product_id, '') <> '' and j.matched_product_id is null then 'product_id가 products.id에 없음'
    else '정상'
  end as reason
from joined j
where
  coalesce(j.product_id, '') = ''
  or j.matched_product_id is null
order by j.production_date desc nulls last, j.id;

-- 2) product_name 기준 exact 매칭 가능한 생산기록
with production_base as (
  select
    pr.id as production_record_id,
    coalesce(nullif(to_jsonb(pr)->>'production_date', ''), nullif(to_jsonb(pr)->>'work_date', '')) as production_date,
    nullif(to_jsonb(pr)->>'product_id', '') as current_product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), nullif(to_jsonb(pr)->>'name', '')) as production_product_name,
    pr.planned_quantity_g,
    pr.actual_quantity_g
  from production_records pr
  where coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_base as (
  select
    p.id as matched_product_id,
    coalesce(nullif(to_jsonb(p)->>'name', ''), nullif(to_jsonb(p)->>'product_name', '')) as matched_product_name
  from products p
),
exact_candidates as (
  select
    pb.production_record_id,
    pb.production_date,
    pb.production_product_name,
    pb.current_product_id,
    p.matched_product_id,
    p.matched_product_name,
    pb.planned_quantity_g,
    pb.actual_quantity_g,
    count(*) over (partition by pb.production_record_id) as exact_match_count
  from production_base pb
  join products_base p
    on lower(trim(p.matched_product_name)) = lower(trim(pb.production_product_name))
)
select
  ec.production_record_id,
  ec.production_date,
  ec.production_product_name,
  ec.current_product_id,
  ec.matched_product_id,
  ec.matched_product_name,
  ec.planned_quantity_g,
  ec.actual_quantity_g
from exact_candidates ec
where ec.exact_match_count = 1
order by ec.production_date desc nulls last, ec.production_record_id;

-- 3) product_name 기준 매칭 불가능한 생산기록
with production_base as (
  select
    pr.id as production_record_id,
    coalesce(nullif(to_jsonb(pr)->>'production_date', ''), nullif(to_jsonb(pr)->>'work_date', '')) as production_date,
    nullif(to_jsonb(pr)->>'product_id', '') as current_product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), nullif(to_jsonb(pr)->>'name', '')) as production_product_name,
    pr.planned_quantity_g,
    pr.actual_quantity_g
  from production_records pr
  where coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_base as (
  select
    p.id,
    coalesce(nullif(to_jsonb(p)->>'name', ''), nullif(to_jsonb(p)->>'product_name', '')) as product_name
  from products p
)
select
  pb.production_record_id,
  pb.production_date,
  pb.production_product_name,
  pb.current_product_id,
  pb.planned_quantity_g,
  pb.actual_quantity_g
from production_base pb
where coalesce(pb.production_product_name, '') <> ''
  and not exists (
    select 1
    from products_base p
    where lower(trim(p.product_name)) = lower(trim(pb.production_product_name))
  )
order by pb.production_date desc nulls last, pb.production_record_id;

-- 4) 생산 대상 중 레시피 없는 제품 상세
with production_base as (
  select
    nullif(to_jsonb(pr)->>'product_id', '') as product_id,
    coalesce(nullif(to_jsonb(pr)->>'product_name', ''), nullif(to_jsonb(pr)->>'name', '')) as production_product_name,
    pr.planned_quantity_g,
    pr.actual_quantity_g
  from production_records pr
  where coalesce(lower(to_jsonb(pr)->>'status'), '') not in ('cancelled', 'canceled', 'deleted', 'void')
),
products_in_scope as (
  select
    pb.product_id,
    count(*) as production_record_count,
    sum(coalesce(pb.planned_quantity_g, 0)) as planned_quantity_total_g,
    sum(coalesce(pb.actual_quantity_g, 0)) as actual_quantity_total_g
  from production_base pb
  where coalesce(pb.product_id, '') <> ''
  group by pb.product_id
),
products_base as (
  select
    p.id as product_id,
    coalesce(nullif(to_jsonb(p)->>'name', ''), nullif(to_jsonb(p)->>'product_name', '')) as product_name,
    to_jsonb(p)->>'product_type' as product_type
  from products p
)
select
  pis.product_id,
  pb.product_name,
  pb.product_type,
  pis.production_record_count,
  pis.planned_quantity_total_g,
  pis.actual_quantity_total_g
from products_in_scope pis
join products_base pb on pb.product_id = pis.product_id
where not exists (
  select 1
  from recipes r
  where r.product_id = pis.product_id
)
order by pis.production_record_count desc, pb.product_name;

-- 5) 미연결 반제품 상세
with semifinished_scope as (
  select
    rm.id,
    rm.item_name,
    rm.ingredient_type,
    nullif(to_jsonb(rm)->>'linked_product_id', '') as linked_product_id,
    nullif(to_jsonb(rm)->>'semifinished_usage_type', '') as semifinished_usage_type
  from raw_materials rm
  where rm.ingredient_type = '반제품'
)
select
  ss.id,
  ss.item_name,
  ss.ingredient_type,
  ss.linked_product_id,
  ss.semifinished_usage_type
from semifinished_scope ss
where ss.linked_product_id is null
order by ss.item_name;

-- 6) 미연결 반제품의 제품 후보
with semifinished_scope as (
  select
    rm.id as raw_material_id,
    rm.item_name as raw_material_name
  from raw_materials rm
  where rm.ingredient_type = '반제품'
    and nullif(to_jsonb(rm)->>'linked_product_id', '') is null
),
products_base as (
  select
    p.id as candidate_product_id,
    coalesce(nullif(to_jsonb(p)->>'name', ''), nullif(to_jsonb(p)->>'product_name', '')) as candidate_product_name,
    to_jsonb(p)->>'product_type' as candidate_product_type
  from products p
)
select
  ss.raw_material_id,
  ss.raw_material_name,
  pb.candidate_product_id,
  pb.candidate_product_name,
  pb.candidate_product_type
from semifinished_scope ss
join products_base pb
  on (
    lower(trim(pb.candidate_product_name)) = lower(trim(ss.raw_material_name))
    or lower(trim(pb.candidate_product_name)) like '%' || lower(trim(ss.raw_material_name)) || '%'
    or lower(trim(ss.raw_material_name)) like '%' || lower(trim(pb.candidate_product_name)) || '%'
  )
order by
  ss.raw_material_name,
  case when lower(trim(pb.candidate_product_name)) = lower(trim(ss.raw_material_name)) then 0 else 1 end,
  pb.candidate_product_name;
