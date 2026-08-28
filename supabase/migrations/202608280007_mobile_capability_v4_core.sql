-- Mobile MONI V4 support tables for capabilities that did not have a canonical PC data table.
-- Runtime production migration is applied by GPT(PMO); this file preserves the schema in GitHub SSOT.

create table if not exists public.moni_quotes (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  quote_number text not null,
  quote_date date not null default current_date,
  valid_until date,
  client_id uuid,
  client_name text not null default '',
  contact_name text not null default '',
  currency text not null default 'KRW',
  status text not null default 'draft' check (status in ('draft','issued','sent','cancelled')),
  vat_rate numeric not null default 10,
  items jsonb not null default '[]'::jsonb,
  supply_amount numeric not null default 0,
  vat_amount numeric not null default 0,
  total_amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quote_number)
);
create index if not exists idx_moni_quotes_business_date on public.moni_quotes(business_id, quote_date desc);
alter table public.moni_quotes enable row level security;

create table if not exists public.moni_sales_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  order_id uuid,
  invoice_number text not null,
  issue_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','issued','cancelled')),
  recipient_name text not null default '',
  business_registration_number text not null default '',
  supply_amount numeric not null default 0,
  vat_amount numeric not null default 0,
  total_amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, invoice_number)
);
create index if not exists idx_moni_tax_invoices_business_date on public.moni_sales_tax_invoices(business_id, issue_date desc);
alter table public.moni_sales_tax_invoices enable row level security;

create table if not exists public.moni_hr_required_documents (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  person_id uuid not null,
  document_type text not null,
  attachment_id uuid not null,
  status text not null default 'active' check (status in ('active','expired','replaced','deleted')),
  expires_on date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, person_id, document_type, attachment_id)
);
create index if not exists idx_moni_hr_docs_person on public.moni_hr_required_documents(business_id, person_id, status);
alter table public.moni_hr_required_documents enable row level security;
