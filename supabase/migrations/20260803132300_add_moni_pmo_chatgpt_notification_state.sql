alter table public.moni_ai_pmo_events
  add column if not exists chatgpt_notified_at timestamptz,
  add column if not exists notification_channel text;

create index if not exists moni_ai_pmo_events_notification_idx
  on public.moni_ai_pmo_events(status, severity, chatgpt_notified_at, last_seen_at desc);
