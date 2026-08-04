create table if not exists public.moni_ai_eval_canary_requests (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  token_hash text not null,
  case_id text not null,
  status text not null default 'PENDING',
  requested_by text not null default 'GPT(PMO)',
  expires_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  eval_run_id uuid references public.moni_ai_eval_runs(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moni_ai_eval_canary_requests_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint moni_ai_eval_canary_requests_status_check check (status in ('PENDING','RUNNING','COMPLETED','FAILED','EXPIRED')),
  unique (business_id, token_hash)
);

create index if not exists moni_ai_eval_canary_requests_pending_idx
  on public.moni_ai_eval_canary_requests(business_id, status, expires_at);

alter table public.moni_ai_eval_canary_requests enable row level security;
revoke all on table public.moni_ai_eval_canary_requests from anon, authenticated;
grant all on table public.moni_ai_eval_canary_requests to service_role;
