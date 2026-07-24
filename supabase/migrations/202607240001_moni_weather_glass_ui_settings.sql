create table if not exists public.moni_ui_settings (
  id text primary key default 'default',
  background_mode text not null default 'weather' check (background_mode in ('weather','manual','default')),
  location_label text not null default '경기도 여주시 점동면',
  latitude numeric(9,6),
  longitude numeric(9,6),
  kma_nx integer,
  kma_ny integer,
  weather_refresh_minutes integer not null default 30 check (weather_refresh_minutes between 10 and 180),
  manual_background_url text,
  default_background_url text,
  weather_backgrounds jsonb not null default '{}'::jsonb,
  weather_last_condition text,
  weather_last_temperature numeric(6,2),
  weather_last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.moni_ui_settings (id)
values ('default')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moni-backgrounds',
  'moni-backgrounds',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
