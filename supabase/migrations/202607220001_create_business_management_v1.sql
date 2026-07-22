create extension if not exists pgcrypto;

create table if not exists public.business_people (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  name text not null,
  person_type text not null check (person_type in ('sales_freelancer', 'production_freelancer', 'employee')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  phone text,
  email text,
  contract_start date,
  contract_end date,
  commission_rate numeric(8,3) not null default 0 check (commission_rate >= 0),
  pay_type text not null default 'hourly' check (pay_type in ('commission', 'hourly', 'daily', 'fixed')),
  pay_rate numeric(14,2) not null default 0 check (pay_rate >= 0),
  withholding_rate numeric(6,3) not null default 3.3 check (withholding_rate >= 0 and withholding_rate <= 100),
  contract_document_ready boolean not null default false,
  id_document_ready boolean not null default false,
  bank_document_ready boolean not null default false,
  bank_name text,
  bank_account_holder text,
  bank_account_number text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_people_business_status_idx
  on public.business_people (business_id, status, person_type);

create table if not exists public.sales_clients (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  company_name text not null,
  contact_name text,
  phone text,
  email text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  assigned_person_id uuid references public.business_people(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_clients_business_status_idx
  on public.sales_clients (business_id, status, company_name);

create table if not exists public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  client_id uuid references public.sales_clients(id) on delete set null,
  title text not null,
  stage text not null default 'lead' check (stage in ('lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost')),
  expected_amount numeric(14,2) not null default 0 check (expected_amount >= 0),
  won_amount numeric(14,2) not null default 0 check (won_amount >= 0),
  close_date date,
  next_action_date date,
  assigned_person_id uuid references public.business_people(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_opportunities_business_stage_idx
  on public.sales_opportunities (business_id, stage, close_date);

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  client_id uuid references public.sales_clients(id) on delete set null,
  opportunity_id uuid references public.sales_opportunities(id) on delete set null,
  activity_date date not null,
  activity_type text not null default '상담',
  summary text not null,
  next_action text,
  next_action_date date,
  assigned_person_id uuid references public.business_people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_activities_business_date_idx
  on public.sales_activities (business_id, activity_date desc);

create table if not exists public.freelancer_work_logs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  person_id uuid not null references public.business_people(id) on delete cascade,
  work_date date not null,
  hours numeric(8,2) not null default 0 check (hours >= 0),
  pay_amount_override numeric(14,2) check (pay_amount_override is null or pay_amount_override >= 0),
  source_type text not null default 'manual' check (source_type in ('manual', 'production_adjustment')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freelancer_work_logs_business_date_idx
  on public.freelancer_work_logs (business_id, work_date, person_id);

create table if not exists public.freelancer_settlements (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  person_id uuid not null references public.business_people(id) on delete cascade,
  settlement_month date not null,
  source_type text not null check (source_type in ('sales', 'production', 'manual')),
  gross_amount numeric(14,2) not null default 0 check (gross_amount >= 0),
  withholding_rate numeric(6,3) not null default 3.3 check (withholding_rate >= 0 and withholding_rate <= 100),
  withholding_amount numeric(14,2) not null default 0 check (withholding_amount >= 0),
  net_amount numeric(14,2) not null default 0 check (net_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  detail_json jsonb not null default '{}'::jsonb,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, person_id, settlement_month, source_type)
);

create index if not exists freelancer_settlements_business_month_idx
  on public.freelancer_settlements (business_id, settlement_month, status);

alter table public.business_people enable row level security;
alter table public.sales_clients enable row level security;
alter table public.sales_opportunities enable row level security;
alter table public.sales_activities enable row level security;
alter table public.freelancer_work_logs enable row level security;
alter table public.freelancer_settlements enable row level security;

comment on table public.business_people is '인사관리 확장형 인력 마스터. V1은 영업·생산 프리랜서 중심으로 사용한다.';
comment on table public.freelancer_settlements is '영업 및 생산 프리랜서 월별 3.3% 정산 결과.';
