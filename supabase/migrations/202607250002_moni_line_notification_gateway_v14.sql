alter table public.moni_alert_deliveries add column if not exists delivery_key text;
alter table public.moni_alert_deliveries add column if not exists message_type text not null default 'initial';
alter table public.moni_alert_deliveries add column if not exists retry_key uuid;
alter table public.moni_alert_deliveries add column if not exists provider_request_id text;
alter table public.moni_alert_deliveries add column if not exists http_status integer;
alter table public.moni_alert_deliveries add column if not exists retryable boolean not null default false;
alter table public.moni_alert_deliveries add column if not exists last_attempt_at timestamptz;

create unique index if not exists uq_moni_alert_deliveries_delivery_key
  on public.moni_alert_deliveries (business_id, delivery_key)
  where delivery_key is not null;

create table if not exists public.moni_notification_channels (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  channel text not null check (channel in ('line','email','other')),
  enabled boolean not null default false,
  minimum_severity text not null default 'high' check (minimum_severity in ('critical','high','attention','data','info')),
  quiet_hours_start time null,
  quiet_hours_end time null,
  timezone text not null default 'Asia/Bangkok',
  escalation_repeat_hours integer not null default 24 check (escalation_repeat_hours between 1 and 168),
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel)
);

create table if not exists public.moni_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default '20220523011',
  channel text not null check (channel in ('line','email','other')),
  recipient_ref text not null,
  display_name text null,
  active boolean not null default true,
  minimum_severity text not null default 'high' check (minimum_severity in ('critical','high','attention','data','info')),
  verified_at timestamptz null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, channel, recipient_ref)
);

insert into public.moni_notification_channels (business_id, channel, enabled, minimum_severity, timezone)
values ('20220523011','line',false,'high','Asia/Bangkok')
on conflict (business_id, channel) do nothing;

create or replace function public.touch_moni_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_moni_notification_channels on public.moni_notification_channels;
create trigger trg_touch_moni_notification_channels
before update on public.moni_notification_channels
for each row execute function public.touch_moni_notification_updated_at();

drop trigger if exists trg_touch_moni_notification_recipients on public.moni_notification_recipients;
create trigger trg_touch_moni_notification_recipients
before update on public.moni_notification_recipients
for each row execute function public.touch_moni_notification_updated_at();

revoke all on table public.moni_notification_channels from public, anon, authenticated;
revoke all on table public.moni_notification_recipients from public, anon, authenticated;
revoke all on table public.moni_alert_deliveries from public, anon, authenticated;
