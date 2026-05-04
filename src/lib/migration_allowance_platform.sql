-- ============================================================
-- Moni Allowance Platform Migration SQL
-- Apply in Supabase SQL Editor
-- ============================================================

create table if not exists allowance_platform_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists allowance_platform_users (
  login_id text primary key,
  role text not null check (role in ('admin', 'freelancer')),
  password_hash text not null,
  freelancer_ref_id bigint,
  display_name text,
  updated_at timestamptz not null default now()
);

create table if not exists allowance_platform_sessions (
  token text primary key,
  role text not null check (role in ('admin', 'freelancer')),
  login_id text not null,
  freelancer_ref_id bigint,
  display_name text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_allowance_sessions_expires_at
  on allowance_platform_sessions (expires_at);

create index if not exists idx_allowance_users_role
  on allowance_platform_users (role);
