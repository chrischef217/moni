create table if not exists public.moni_alert_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  dedupe_key text not null,
  source_type text not null default 'internal_rule' check (source_type in ('internal_rule','external_intelligence','system')),
  source_ref text null,
  category text not null default 'system' check (category in ('collection','cash','sales','production','tax','data','external','system')),
  severity text not null default 'info' check (severity in ('critical','high','attention','data','info')),
  status text not null default 'new' check (status in ('new','sent','acknowledged','in_progress','resolved','ignored','deferred')),
  title text not null,
  summary text null,
  recommended_action text null,
  impact_amount numeric not null default 0 check (impact_amount >= 0),
  due_date date null,
  deep_link text null,
  evidence_json jsonb not null default '[]'::jsonb,
  source_url text null,
  read_at timestamptz null,
  acknowledged_at timestamptz null,
  deferred_until timestamptz null,
  resolved_at timestamptz null,
  reopened_at timestamptz null,
  reopen_count integer not null default 0 check (reopen_count >= 0),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, dedupe_key)
);

create index if not exists idx_moni_alert_events_status_priority
  on public.moni_alert_events (business_id, status, severity, last_detected_at desc);
create index if not exists idx_moni_alert_events_category
  on public.moni_alert_events (business_id, category, last_detected_at desc);

create table if not exists public.moni_alert_event_history (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  event_id uuid not null references public.moni_alert_events(id) on delete cascade,
  previous_status text null,
  next_status text not null,
  actor_type text not null default 'system' check (actor_type in ('system','user','notification_gateway')),
  note text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_moni_alert_event_history_event
  on public.moni_alert_event_history (event_id, created_at desc);

create table if not exists public.moni_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  event_id uuid not null references public.moni_alert_events(id) on delete cascade,
  channel text not null check (channel in ('web','line','email','other')),
  target_ref text null,
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sent','failed','skipped')),
  attempt_no integer not null default 1 check (attempt_no >= 1),
  error_message text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists idx_moni_alert_deliveries_event
  on public.moni_alert_deliveries (event_id, created_at desc);

create or replace function public.touch_moni_alert_event_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_moni_alert_event_updated_at on public.moni_alert_events;
create trigger trg_touch_moni_alert_event_updated_at
before update on public.moni_alert_events
for each row execute function public.touch_moni_alert_event_updated_at();
