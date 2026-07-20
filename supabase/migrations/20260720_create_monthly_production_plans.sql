create table if not exists public.monthly_production_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  product_id text not null,
  product_name text not null,
  planned_quantity_g numeric not null check (planned_quantity_g > 0),
  note text,
  business_id text default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monthly_production_plans_plan_date_idx
  on public.monthly_production_plans (plan_date);
create index if not exists monthly_production_plans_product_id_idx
  on public.monthly_production_plans (product_id);

alter table public.monthly_production_plans enable row level security;

create policy "service role manages monthly production plans"
  on public.monthly_production_plans
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
