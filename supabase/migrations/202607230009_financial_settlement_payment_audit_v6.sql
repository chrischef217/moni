create table if not exists public.finance_settlement_payment_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  settlement_id uuid not null references public.freelancer_settlements(id) on delete cascade,
  event_type text not null check (event_type in ('paid','reversed')),
  payment_date date,
  amount numeric(16,2) not null default 0 check (amount >= 0),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_settlement_events_v6 on public.finance_settlement_payment_events(business_id,settlement_id,created_at desc);
