with preferred_mapping as (
  select distinct on (r.id)
    r.id as recipe_id,
    rm.linked_product_id
  from public.recipes r
  join public.raw_material_mapping m
    on m.recipe_id = r.id
   and m.is_default = true
  join public.raw_materials rm
    on rm.id::text = coalesce(m.raw_material_ref_id::text, m.raw_material_id::text)
  where r.is_active = true
    and lower(replace(coalesce(r.ingredient_type, ''), ' ', '')) in ('반제품', 'semi', 'semiproduct')
    and r.semi_product_id is null
    and rm.linked_product_id is not null
  order by r.id,
    case
      when m.business_id = r.business_id then 0
      when m.business_id = '20220523011' then 1
      when m.business_id = 'default' then 2
      when m.business_id is null then 3
      else 4
    end,
    m.created_at desc
)
update public.recipes r
set semi_product_id = pm.linked_product_id
from preferred_mapping pm
where r.id = pm.recipe_id
  and r.semi_product_id is null;
