create or replace function public.sync_inline_semiproduct_recipe_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_product_id text;
  v_usage_type text;
begin
  if new.is_default is not true
     or new.recipe_id is null
     or new.raw_material_ref_id is null then
    return new;
  end if;

  select linked_product_id, coalesce(semifinished_usage_type, 'inline')
    into v_linked_product_id, v_usage_type
  from public.raw_materials
  where id = new.raw_material_ref_id;

  if v_linked_product_id is not null and v_usage_type = 'inline' then
    update public.recipes
       set ingredient_type = '반제품',
           semi_product_id = v_linked_product_id
     where id = new.recipe_id
       and (
         coalesce(ingredient_type, '') <> '반제품'
         or semi_product_id is distinct from v_linked_product_id
       );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_inline_semiproduct_recipe_type
on public.raw_material_mapping;

create trigger trg_sync_inline_semiproduct_recipe_type
after insert or update of raw_material_ref_id, recipe_id, is_default
on public.raw_material_mapping
for each row
execute function public.sync_inline_semiproduct_recipe_type();

with targets as (
  select distinct on (r.id)
         r.id as recipe_id,
         rm.linked_product_id
  from public.recipes r
  join public.raw_material_mapping m
    on m.recipe_id = r.id
   and m.is_default = true
  join public.raw_materials rm
    on rm.id = m.raw_material_ref_id
  where rm.linked_product_id is not null
    and coalesce(rm.semifinished_usage_type, 'inline') = 'inline'
  order by r.id, m.created_at desc nulls last, m.id desc
)
update public.recipes r
   set ingredient_type = '반제품',
       semi_product_id = t.linked_product_id
  from targets t
 where r.id = t.recipe_id
   and (
     coalesce(r.ingredient_type, '') <> '반제품'
     or r.semi_product_id is distinct from t.linked_product_id
   );