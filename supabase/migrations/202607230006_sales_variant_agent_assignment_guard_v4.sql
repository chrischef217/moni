create or replace function public.enforce_sales_variant_agent_assignment()
returns trigger
language plpgsql
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.sales_client_variant_terms where id = new.term_id;
  if v_client_id is null then
    raise exception '거래처 판매조건을 확인할 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.sales_client_people
    where client_id = v_client_id and person_id = new.person_id and active = true
  ) then
    raise exception '거래처에 연결된 영업 프리랜서만 정산단가를 설정할 수 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_sales_variant_agent_assignment on public.sales_client_variant_agents;
create trigger trg_enforce_sales_variant_agent_assignment
before insert or update on public.sales_client_variant_agents
for each row execute function public.enforce_sales_variant_agent_assignment();

create or replace function public.cleanup_sales_variant_agents_on_client_people()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.active = false) then
    delete from public.sales_client_variant_agents a
    using public.sales_client_variant_terms t
    where a.term_id = t.id
      and t.client_id = old.client_id
      and a.person_id = old.person_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cleanup_sales_variant_agents_on_client_people on public.sales_client_people;
create trigger trg_cleanup_sales_variant_agents_on_client_people
after update or delete on public.sales_client_people
for each row execute function public.cleanup_sales_variant_agents_on_client_people();
