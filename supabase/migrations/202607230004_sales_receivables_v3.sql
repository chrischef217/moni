alter table public.sales_clients
  add column if not exists payment_due_type text not null default 'none',
  add column if not exists payment_due_days integer,
  add column if not exists payment_due_day integer;

alter table public.sales_orders
  add column if not exists due_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_sales_clients_payment_due_type') then
    alter table public.sales_clients add constraint ck_sales_clients_payment_due_type
      check (payment_due_type in ('none','days_after_sale','next_month_day'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_sales_clients_payment_due_days') then
    alter table public.sales_clients add constraint ck_sales_clients_payment_due_days
      check (payment_due_days is null or payment_due_days between 0 and 365);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_sales_clients_payment_due_day') then
    alter table public.sales_clients add constraint ck_sales_clients_payment_due_day
      check (payment_due_day is null or payment_due_day between 1 and 31);
  end if;
end $$;

create table if not exists public.sales_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  receipt_date date not null,
  amount numeric(16,2) not null check (amount > 0),
  method text not null default 'bank' check (method in ('bank','cash','card','other')),
  reference_no text,
  note text,
  status text not null default 'posted' check (status in ('posted','reversed')),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_receipts_order on public.sales_receipts(order_id, status, receipt_date);
create index if not exists idx_sales_receipts_business_date on public.sales_receipts(business_id, receipt_date);
create index if not exists idx_sales_orders_due_date on public.sales_orders(business_id, due_date, status, payment_status);

create or replace function public.set_sales_order_due_date_from_client()
returns trigger
language plpgsql
as $$
declare
  v_type text;
  v_days integer;
  v_day integer;
  v_next_month date;
  v_last_day integer;
begin
  if new.due_date is not null then
    return new;
  end if;

  select payment_due_type, payment_due_days, payment_due_day
    into v_type, v_days, v_day
  from public.sales_clients
  where id = new.client_id;

  if v_type = 'days_after_sale' then
    new.due_date := new.sale_date + coalesce(v_days, 0);
  elsif v_type = 'next_month_day' then
    v_next_month := (date_trunc('month', new.sale_date)::date + interval '1 month')::date;
    v_last_day := extract(day from ((v_next_month + interval '1 month')::date - 1))::integer;
    new.due_date := v_next_month + (least(coalesce(v_day, 1), v_last_day) - 1);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sales_order_due_date_from_client on public.sales_orders;
create trigger trg_sales_order_due_date_from_client
before insert on public.sales_orders
for each row execute function public.set_sales_order_due_date_from_client();
