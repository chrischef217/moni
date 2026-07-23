create table if not exists public.sales_product_settings (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  product_id text not null references public.products(id) on delete cascade,
  is_sellable boolean not null default true,
  default_sales_unit text not null default 'kg' check (default_sales_unit in ('kg','ea','box')),
  unit_weight_g numeric(14,3),
  carton_units numeric(14,3),
  default_unit_price numeric(14,2) not null default 0,
  moq_quantity numeric(14,3) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, product_id)
);

create table if not exists public.sales_client_people (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  client_id uuid not null references public.sales_clients(id) on delete cascade,
  person_id uuid not null references public.business_people(id) on delete cascade,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, person_id)
);

create table if not exists public.sales_client_product_terms (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  client_id uuid not null references public.sales_clients(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  active boolean not null default true,
  sales_unit text not null default 'kg' check (sales_unit in ('kg','ea','box')),
  unit_price numeric(14,2) not null default 0,
  moq_quantity numeric(14,3) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, product_id)
);

create table if not exists public.sales_client_product_agents (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.sales_client_product_terms(id) on delete cascade,
  person_id uuid not null references public.business_people(id) on delete cascade,
  settlement_rate_per_kg numeric(14,2) not null default 0 check (settlement_rate_per_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (term_id, person_id)
);

alter table public.sales_order_items
  add column if not exists quantity_kg numeric(16,3);

create table if not exists public.sales_order_item_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  order_item_id uuid not null references public.sales_order_items(id) on delete cascade,
  client_id uuid not null references public.sales_clients(id),
  product_id text references public.products(id),
  person_id uuid not null references public.business_people(id),
  person_name text not null,
  sale_date date not null,
  quantity_kg numeric(16,3) not null default 0,
  settlement_rate_per_kg numeric(14,2) not null default 0,
  settlement_amount numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (order_item_id, person_id)
);

create index if not exists idx_sales_product_settings_business on public.sales_product_settings(business_id, is_sellable);
create index if not exists idx_sales_client_people_client on public.sales_client_people(client_id, active);
create index if not exists idx_sales_client_terms_client on public.sales_client_product_terms(client_id, active);
create index if not exists idx_sales_client_terms_product on public.sales_client_product_terms(product_id);
create index if not exists idx_sales_settlements_month on public.sales_order_item_settlements(business_id, sale_date, person_id);

insert into public.sales_product_settings (business_id, product_id, is_sellable, default_sales_unit, unit_weight_g, default_unit_price, moq_quantity)
select coalesce(nullif(p.business_id,''), '20220523011'), p.id, true, 'kg', nullif(p.weight_g,0), 0, 0
from public.products p
where p.is_active = true
on conflict (business_id, product_id) do nothing;

insert into public.sales_client_people (business_id, client_id, person_id, is_primary, active)
select c.business_id, c.id, c.assigned_person_id, true, true
from public.sales_clients c
where c.assigned_person_id is not null
on conflict (client_id, person_id) do nothing;