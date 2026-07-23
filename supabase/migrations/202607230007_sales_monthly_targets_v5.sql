create table if not exists public.sales_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  target_month date not null,
  scope_type text not null default 'company' check (scope_type in ('company','person')),
  person_id uuid references public.business_people(id) on delete cascade,
  target_amount numeric(16,2) not null default 0 check (target_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(day from target_month) = 1),
  check ((scope_type='company' and person_id is null) or (scope_type='person' and person_id is not null))
);

create unique index if not exists uq_sales_monthly_targets_company
on public.sales_monthly_targets(business_id,target_month)
where scope_type='company';

create unique index if not exists uq_sales_monthly_targets_person
on public.sales_monthly_targets(business_id,target_month,person_id)
where scope_type='person';

create index if not exists idx_sales_monthly_targets_month
on public.sales_monthly_targets(business_id,target_month,scope_type);
