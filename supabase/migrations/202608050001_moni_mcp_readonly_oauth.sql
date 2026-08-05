-- MONI ChatGPT MCP V1: OAuth 2.1 credentials and read-only tool audit.
-- Business production, inventory, sales, and accounting tables are not modified.

create table if not exists public.moni_mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_name text not null,
  redirect_uris jsonb not null default '[]'::jsonb,
  redirect_fingerprint text not null unique,
  grant_types jsonb not null default '["authorization_code","refresh_token"]'::jsonb,
  response_types jsonb not null default '["code"]'::jsonb,
  token_endpoint_auth_method text not null default 'none' check (token_endpoint_auth_method = 'none'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(redirect_uris) = 'array'),
  check (jsonb_typeof(grant_types) = 'array'),
  check (jsonb_typeof(response_types) = 'array')
);

create table if not exists public.moni_mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.moni_mcp_oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  resource text not null,
  scopes text[] not null default array['moni:read']::text[],
  code_challenge text not null,
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  user_login_id text not null,
  user_display_name text,
  user_role text not null check (user_role in ('admin', 'freelancer')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moni_mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.moni_mcp_oauth_clients(client_id) on delete cascade,
  resource text not null,
  scopes text[] not null default array['moni:read']::text[],
  user_login_id text not null,
  user_display_name text,
  user_role text not null check (user_role in ('admin', 'freelancer')),
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moni_mcp_tool_runs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  oauth_token_id uuid references public.moni_mcp_oauth_tokens(id) on delete set null,
  oauth_client_id text not null,
  user_login_id text not null,
  user_role text not null check (user_role in ('admin', 'freelancer')),
  tool_name text not null,
  tool_arguments jsonb not null default '{}'::jsonb,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  duration_ms integer,
  output_bytes integer,
  output_preview text,
  output_truncated boolean not null default false,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists moni_mcp_codes_client_expires_idx
  on public.moni_mcp_oauth_codes(client_id, expires_at);
create index if not exists moni_mcp_tokens_client_user_idx
  on public.moni_mcp_oauth_tokens(client_id, user_login_id, revoked_at);
create index if not exists moni_mcp_tokens_access_expires_idx
  on public.moni_mcp_oauth_tokens(access_expires_at);
create index if not exists moni_mcp_tool_runs_user_started_idx
  on public.moni_mcp_tool_runs(user_login_id, started_at desc);
create index if not exists moni_mcp_tool_runs_tool_started_idx
  on public.moni_mcp_tool_runs(tool_name, started_at desc);

alter table public.moni_mcp_oauth_clients enable row level security;
alter table public.moni_mcp_oauth_codes enable row level security;
alter table public.moni_mcp_oauth_tokens enable row level security;
alter table public.moni_mcp_tool_runs enable row level security;

revoke all on public.moni_mcp_oauth_clients from anon, authenticated;
revoke all on public.moni_mcp_oauth_codes from anon, authenticated;
revoke all on public.moni_mcp_oauth_tokens from anon, authenticated;
revoke all on public.moni_mcp_tool_runs from anon, authenticated;

grant all on public.moni_mcp_oauth_clients to service_role;
grant all on public.moni_mcp_oauth_codes to service_role;
grant all on public.moni_mcp_oauth_tokens to service_role;
grant all on public.moni_mcp_tool_runs to service_role;
