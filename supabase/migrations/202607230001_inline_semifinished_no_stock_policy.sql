-- MONI: 인라인 반제품은 재고를 보유하지 않는다는 운영 원칙을 DB에서 강제한다.
-- 2026-07-23 GPT(PMO) 승인 기준
--
-- 정책
-- 1. 현재 반제품은 모두 inline으로 운영한다.
-- 2. inline 반제품은 current_stock_g = 0, is_stock_managed = false를 강제한다.
-- 3. inline 반제품 자체의 원료수불 거래는 신규 생성/수정을 금지한다.
-- 4. 과거 거래기록은 삭제하지 않는다.
-- 5. 반제품 연결 제품은 product_type='반제품'이어야 한다.
-- 6. 변경 전 원본은 비공개 moni_internal 스키마에 백업한다.

begin;

create schema if not exists moni_internal;
revoke all on schema moni_internal from public;
revoke all on schema moni_internal from anon, authenticated;

create table if not exists moni_internal.raw_materials_inline_semifinished_backup_20260723 as
select
  rm.*,
  now() as backed_up_at,
  '2026-07-23 inline 반제품 재고정책 정상화 전 백업'::text as backup_reason
from public.raw_materials rm
where rm.ingredient_type = '반제품';

create table if not exists moni_internal.products_semifinished_type_backup_20260723 as
select
  p.*,
  now() as backed_up_at,
  '2026-07-23 지미부스터 제품구분 정합성 수정 전 백업'::text as backup_reason
from public.products p
where p.id = 'PROD-0131';

-- 지미부스터는 다수 활성 레시피에서 반제품으로 참조되므로 제품 마스터도 반제품으로 통일한다.
update public.products
set product_type = '반제품'
where id = 'PROD-0131'
  and product_name = '지미부스터'
  and product_type is distinct from '반제품';

-- 현재 등록된 모든 반제품을 inline / 비재고관리 / 0g으로 정상화한다.
update public.raw_materials
set
  semifinished_usage_type = 'inline',
  is_stock_managed = false,
  current_stock_g = 0
where ingredient_type = '반제품';

-- raw_materials를 어떤 경로로 수정하더라도 inline 반제품 재고가 다시 생기지 않도록 강제한다.
create or replace function public.enforce_inline_semifinished_inventory_policy()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ingredient_type = '반제품'
     and coalesce(nullif(trim(new.semifinished_usage_type), ''), 'inline') = 'inline' then
    if new.linked_product_id is not null and trim(new.linked_product_id) <> '' then
      perform 1
      from public.products p
      where p.id = new.linked_product_id
        and p.product_type = '반제품';

      if not found then
        raise exception
          '인라인 반제품의 연결 제품은 제품구분이 반제품이어야 합니다. linked_product_id=%',
          new.linked_product_id;
      end if;
    end if;

    new.semifinished_usage_type := 'inline';
    new.is_stock_managed := false;
    new.current_stock_g := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_inline_semifinished_inventory_policy
on public.raw_materials;

create trigger trg_enforce_inline_semifinished_inventory_policy
before insert or update of
  ingredient_type,
  semifinished_usage_type,
  is_stock_managed,
  current_stock_g,
  linked_product_id
on public.raw_materials
for each row
execute function public.enforce_inline_semifinished_inventory_policy();

-- 트리거 우회나 직접 SQL 오입력에도 정책 위반 데이터가 저장되지 않도록 CHECK를 추가한다.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.raw_materials'::regclass
      and conname = 'ck_inline_semifinished_no_stock'
  ) then
    alter table public.raw_materials
      add constraint ck_inline_semifinished_no_stock
      check (
        not (
          ingredient_type = '반제품'
          and coalesce(nullif(trim(semifinished_usage_type), ''), 'inline') = 'inline'
        )
        or (
          is_stock_managed = false
          and coalesce(current_stock_g, 0) = 0
        )
      );
  end if;
end;
$$;

-- 반제품은 완제품 생산 과정에서 하위 레시피가 재귀 전개되어 실제 원재료만 차감된다.
-- 따라서 inline 반제품 자체의 INBOUND/OUTBOUND 수불행은 앞으로 생성하거나 수정할 수 없다.
create or replace function public.reject_inline_semifinished_stock_transaction()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_material_name text;
begin
  select rm.item_name
    into v_material_name
  from public.raw_materials rm
  where rm.ingredient_type = '반제품'
    and coalesce(nullif(trim(rm.semifinished_usage_type), ''), 'inline') = 'inline'
    and (
      rm.id = nullif(trim(coalesce(new.item_code, '')), '')
      or rm.item_code = nullif(trim(coalesce(new.item_code, '')), '')
      or rm.item_name = nullif(trim(coalesce(new.raw_material_name, '')), '')
      or rm.item_name = nullif(trim(coalesce(new.item_name, '')), '')
    )
  limit 1;

  if v_material_name is not null then
    raise exception '인라인 반제품은 재고 수불 거래 대상이 아닙니다: %', v_material_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reject_inline_semifinished_stock_transaction
on public.raw_material_transactions;

create trigger trg_reject_inline_semifinished_stock_transaction
before insert or update
on public.raw_material_transactions
for each row
execute function public.reject_inline_semifinished_stock_transaction();

commit;
