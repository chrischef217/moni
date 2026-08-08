-- MONI ChatGPT MCP acceptance windows.
-- Allows a short, audited activation window for real ChatGPT acceptance testing
-- without changing the permanent production feature flag.

create table if not exists public.moni_mcp_acceptance_windows (
  id uuid primary key default gen_random_uuid(),
  enabled_by_login_id text not null,
  enabled_by_display_name text,
  reason text not null check (char_length(reason) between 3 and 500),
  enabled_at timestamptz not null default now(),
  enabled_until timestamptz not null,
  revoked_at timestamptz,
  revoked_by_login_id text,
  created_at timestamptz not null default now(),
  check (enabled_until > enabled_at),
  check (enabled_until <= enabled_at + interval '30 minutes')
);

create index if not exists moni_mcp_acceptance_windows_active_idx
  on public.moni_mcp_acceptance_windows(enabled_until desc)
  where revoked_at is null;

alter table public.moni_mcp_acceptance_windows enable row level security;
revoke all on public.moni_mcp_acceptance_windows from anon, authenticated;
grant all on public.moni_mcp_acceptance_windows to service_role;
