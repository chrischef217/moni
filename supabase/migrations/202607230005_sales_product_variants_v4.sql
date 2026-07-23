create table if not exists public.sales_product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  product_id text not null references public.products(id) on delete cascade,
  variant_name text not null,
  sales_unit text not null default 'kg' check (sales_unit in ('kg','ea','box')),
  unit_weight_g numeric(14,3),
  box_units numeric(14,3),
  default_unit_price numeric(16,2) not null default 0 check (default_unit_price >= 0),
  moq_quantity numeric(14,3) not null default 0 check (moq_quantity >= 0),
  is_default boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, product_id, variant_name)
);

create table if not exists public.sales_client_variant_terms (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  client_id uuid not null references public.sales_clients(id) on delete cascade,
  variant_id uuid not null references public.sales_product_variants(id) on delete cascade,
  active boolean not null default true,
  unit_price numeric(16,2) not null default 0 check (unit_price >= 0),
  moq_quantity numeric(14,3) not null default 0 check (moq_quantity >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, variant_id)
);

create table if not exists public.sales_client_variant_agents (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.sales_client_variant_terms(id) on delete cascade,
  person_id uuid not null references public.business_people(id) on delete cascade,
  settlement_rate_per_kg numeric(16,2) not null default 0 check (settlement_rate_per_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_id, person_id)
);

alter table public.sales_order_items
  add column if not exists sales_variant_id uuid references public.sales_product_variants(id) on delete set null,
  add column if not exists sales_variant_name text;

create index if not exists idx_sales_product_variants_product on public.sales_product_variants(business_id, product_id, active, sort_order);
create index if not exists idx_sales_client_variant_terms_client on public.sales_client_variant_terms(client_id, active);
create index if not exists idx_sales_order_items_variant on public.sales_order_items(sales_variant_id);

create or replace function public.reject_semifinished_sales_variant()
returns trigger
language plpgsql
as $$
declare
  v_type text;
begin
  select product_type into v_type from public.products where id = new.product_id;
  if coalesce(v_type,'') = '반제품' then
    raise exception '반제품은 판매규격으로 등록할 수 없습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_semifinished_sales_variant on public.sales_product_variants;
create trigger trg_reject_semifinished_sales_variant
before insert or update of product_id on public.sales_product_variants
for each row execute function public.reject_semifinished_sales_variant();

insert into public.sales_product_variants (
  business_id, product_id, variant_name, sales_unit, unit_weight_g, box_units,
  default_unit_price, moq_quantity, is_default, active, sort_order, note
)
select
  s.business_id,
  s.product_id,
  '기본 규격',
  coalesce(s.default_sales_unit,'kg'),
  s.unit_weight_g,
  s.carton_units,
  coalesce(s.default_unit_price,0),
  coalesce(s.moq_quantity,0),
  true,
  coalesce(s.is_sellable,true),
  0,
  s.note
from public.sales_product_settings s
join public.products p on p.id = s.product_id
where s.business_id='20220523011'
  and coalesce(p.product_type,'') <> '반제품'
on conflict (business_id, product_id, variant_name) do nothing;
