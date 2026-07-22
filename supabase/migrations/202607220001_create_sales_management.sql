alter table public.sales_clients
  add column if not exists business_registration_number text,
  add column if not exists representative_name text,
  add column if not exists address text,
  add column if not exists payment_terms text;

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  statement_number text not null,
  sale_date date not null,
  client_id uuid not null references public.sales_clients(id),
  assigned_person_id uuid references public.business_people(id),
  status text not null default 'confirmed' check (status in ('draft','confirmed','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid')),
  vat_rate numeric(5,2) not null default 10,
  supply_amount numeric(18,2) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, statement_number)
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id text references public.products(id),
  product_name text not null,
  specification text,
  quantity numeric(18,3) not null check (quantity > 0),
  unit text not null default 'kg',
  unit_price numeric(18,2) not null default 0,
  supply_amount numeric(18,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders(id),
  action text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sales_orders_business_date_idx
  on public.sales_orders (business_id, sale_date desc);
create index if not exists sales_orders_client_idx
  on public.sales_orders (client_id, sale_date desc);
create index if not exists sales_orders_person_idx
  on public.sales_orders (assigned_person_id, sale_date desc);
create index if not exists sales_order_items_order_idx
  on public.sales_order_items (order_id, sort_order);
create index if not exists sales_order_history_order_idx
  on public.sales_order_history (order_id, created_at desc);
