create table if not exists public.moni_mcp_preflight_runs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  requested_by_login_id text not null,
  requested_by_display_name text,
  status text not null check (status in ('PASS','WARN','FAIL')),
  admin_tool_catalog_hash text not null,
  freelancer_tool_catalog_hash text not null,
  checks jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_moni_mcp_preflight_runs_created_at
  on public.moni_mcp_preflight_runs(created_at desc);

alter table public.moni_mcp_preflight_runs enable row level security;
revoke all on table public.moni_mcp_preflight_runs from anon, authenticated;
grant all on table public.moni_mcp_preflight_runs to service_role;

comment on table public.moni_mcp_preflight_runs is 'Admin-triggered deterministic MONI MCP readiness checks. No business writes.';
