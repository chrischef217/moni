alter table public.cash_flow
  alter column id set default (gen_random_uuid()::text),
  alter column business_id set default '20220523011',
  alter column type set default 'outflow';

alter table public.cash_flow
  add column if not exists status text not null default 'planned',
  add column if not exists category text not null default 'other',
  add column if not exists actual_date date,
  add column if not exists reference_no text,
  add column if not exists vat_amount integer not null default 0,
  add column if not exists vat_deductible boolean not null default false,
  add column if not exists tax_invoice_date date,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname='ck_cash_flow_type_v6') then
    alter table public.cash_flow add constraint ck_cash_flow_type_v6 check (type in ('inflow','outflow'));
  end if;
  if not exists (select 1 from pg_constraint where conname='ck_cash_flow_status_v6') then
    alter table public.cash_flow add constraint ck_cash_flow_status_v6 check (status in ('planned','posted','reversed'));
  end if;
  if not exists (select 1 from pg_constraint where conname='ck_cash_flow_category_v6') then
    alter table public.cash_flow add constraint ck_cash_flow_category_v6 check (category in ('purchase','operating_expense','payroll','tax','financing','investment','transfer','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='ck_cash_flow_amount_v6') then
    alter table public.cash_flow add constraint ck_cash_flow_amount_v6 check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='ck_cash_flow_vat_v6') then
    alter table public.cash_flow add constraint ck_cash_flow_vat_v6 check (vat_amount >= 0 and vat_amount <= amount);
  end if;
  if not exists (select 1 from pg_constraint where conname='ck_cash_flow_posted_date_v6') then
    alter table public.cash_flow add constraint ck_cash_flow_posted_date_v6 check (status <> 'posted' or actual_date is not null);
  end if;
end $$;

create index if not exists idx_cash_flow_business_due_v6 on public.cash_flow(business_id,status,due_date);
create index if not exists idx_cash_flow_business_actual_v6 on public.cash_flow(business_id,status,actual_date);
create index if not exists idx_cash_flow_tax_invoice_v6 on public.cash_flow(business_id,tax_invoice_date) where vat_deductible=true;

alter table public.freelancer_settlements
  add column if not exists due_date date,
  add column if not exists paid_date date;

create index if not exists idx_freelancer_settlements_due_v6 on public.freelancer_settlements(business_id,status,due_date);
create index if not exists idx_freelancer_settlements_paid_v6 on public.freelancer_settlements(business_id,status,paid_date);

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  account_name text not null,
  account_type text not null default 'bank' check (account_type in ('bank','cash')),
  institution_name text,
  masked_account_no text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, account_name)
);

create table if not exists public.finance_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  balance_date date not null,
  balance_amount numeric(16,2) not null check (balance_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id,balance_date)
);

create index if not exists idx_finance_balance_snapshots_latest_v6 on public.finance_balance_snapshots(business_id,account_id,balance_date desc);
