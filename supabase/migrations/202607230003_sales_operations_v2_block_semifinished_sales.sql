update public.sales_product_settings s
set is_sellable = false, updated_at = now()
from public.products p
where p.id = s.product_id
  and p.product_type = '반제품';

create or replace function public.enforce_sales_finished_product_only()
returns trigger
language plpgsql
as $$
begin
  if new.is_sellable = true and exists (
    select 1 from public.products p
    where p.id = new.product_id and p.product_type <> '완제품'
  ) then
    raise exception '반제품은 판매 가능 제품으로 설정할 수 없습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_sales_finished_product_only on public.sales_product_settings;
create trigger trg_enforce_sales_finished_product_only
before insert or update of is_sellable, product_id on public.sales_product_settings
for each row execute function public.enforce_sales_finished_product_only();