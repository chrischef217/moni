create table if not exists public.moni_ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid references public.moni_ai_threads(id) on delete set null,
  message_id uuid references public.moni_ai_messages(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED','LIMIT_REACHED')),
  step_count integer not null default 0 check (step_count >= 0),
  tool_call_count integer not null default 0 check (tool_call_count >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.moni_ai_tool_runs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  agent_run_id uuid not null references public.moni_ai_agent_runs(id) on delete cascade,
  thread_id uuid references public.moni_ai_threads(id) on delete set null,
  message_id uuid references public.moni_ai_messages(id) on delete set null,
  step_no integer not null check (step_no > 0),
  tool_name text not null,
  tool_arguments jsonb not null default '{}'::jsonb,
  status text not null check (status in ('RUNNING','COMPLETED','FAILED','DENIED')),
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.moni_ai_pmo_events (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid references public.moni_ai_threads(id) on delete set null,
  message_id uuid references public.moni_ai_messages(id) on delete set null,
  agent_run_id uuid references public.moni_ai_agent_runs(id) on delete set null,
  event_type text not null check (event_type in ('BUG','IMPROVEMENT','DATA_QUALITY','SECURITY','TOOL_FAILURE','CAPABILITY_GAP')),
  severity text not null check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED')),
  title text not null,
  summary text not null,
  fingerprint text not null,
  source text not null default 'MONI_AGENT',
  page_context jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  pmo_notes text,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, fingerprint)
);

create index if not exists moni_ai_agent_runs_thread_idx
  on public.moni_ai_agent_runs(thread_id, created_at desc);
create index if not exists moni_ai_tool_runs_agent_idx
  on public.moni_ai_tool_runs(agent_run_id, step_no);
create index if not exists moni_ai_pmo_events_status_idx
  on public.moni_ai_pmo_events(status, severity, last_seen_at desc);
create index if not exists moni_ai_pmo_events_thread_idx
  on public.moni_ai_pmo_events(thread_id, last_seen_at desc);

alter table public.moni_ai_agent_runs enable row level security;
alter table public.moni_ai_tool_runs enable row level security;
alter table public.moni_ai_pmo_events enable row level security;

revoke all on table public.moni_ai_agent_runs from anon, authenticated;
revoke all on table public.moni_ai_tool_runs from anon, authenticated;
revoke all on table public.moni_ai_pmo_events from anon, authenticated;

grant all on table public.moni_ai_agent_runs to service_role;
grant all on table public.moni_ai_tool_runs to service_role;
grant all on table public.moni_ai_pmo_events to service_role;
