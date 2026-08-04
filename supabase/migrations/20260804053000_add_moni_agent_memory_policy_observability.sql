create table if not exists public.moni_ai_session_items (
  id bigint generated always as identity primary key,
  business_id text not null,
  thread_id uuid not null references public.moni_ai_threads(id) on delete cascade,
  source_message_id uuid references public.moni_ai_messages(id) on delete set null,
  item_type text not null default 'unknown',
  item jsonb not null,
  created_at timestamptz not null default now(),
  constraint moni_ai_session_items_item_object_check check (jsonb_typeof(item) = 'object')
);

create index if not exists moni_ai_session_items_thread_idx
  on public.moni_ai_session_items(thread_id, id);
create unique index if not exists moni_ai_session_items_source_message_uidx
  on public.moni_ai_session_items(thread_id, source_message_id)
  where source_message_id is not null;

create table if not exists public.moni_ai_thread_memory (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid not null references public.moni_ai_threads(id) on delete cascade,
  summary text not null default '',
  salient_facts jsonb not null default '[]'::jsonb,
  open_items jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  summarized_message_count integer not null default 0 check (summarized_message_count >= 0),
  last_summarized_message_id uuid references public.moni_ai_messages(id) on delete set null,
  last_summarized_at timestamptz,
  memory_version integer not null default 1 check (memory_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, thread_id),
  constraint moni_ai_thread_memory_facts_array_check check (jsonb_typeof(salient_facts) = 'array'),
  constraint moni_ai_thread_memory_open_items_array_check check (jsonb_typeof(open_items) = 'array'),
  constraint moni_ai_thread_memory_decisions_array_check check (jsonb_typeof(decisions) = 'array')
);

alter table public.moni_ai_agent_runs
  add column if not exists request_count integer,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists latency_ms integer,
  add column if not exists validation_status text not null default 'PENDING',
  add column if not exists prompt_version text,
  add column if not exists trace_id text,
  add column if not exists memory_version integer,
  add column if not exists usage jsonb not null default '{}'::jsonb;

alter table public.moni_ai_agent_runs
  drop constraint if exists moni_ai_agent_runs_status_check;
alter table public.moni_ai_agent_runs
  add constraint moni_ai_agent_runs_status_check
  check (status in ('RUNNING','COMPLETED','FAILED','LIMIT_REACHED','DENIED'));
alter table public.moni_ai_agent_runs
  drop constraint if exists moni_ai_agent_runs_validation_status_check;
alter table public.moni_ai_agent_runs
  add constraint moni_ai_agent_runs_validation_status_check
  check (validation_status in ('PENDING','PASSED','FAILED','NOT_APPLICABLE'));
alter table public.moni_ai_agent_runs
  drop constraint if exists moni_ai_agent_runs_usage_nonnegative_check;
alter table public.moni_ai_agent_runs
  add constraint moni_ai_agent_runs_usage_nonnegative_check
  check (
    (request_count is null or request_count >= 0) and
    (input_tokens is null or input_tokens >= 0) and
    (output_tokens is null or output_tokens >= 0) and
    (total_tokens is null or total_tokens >= 0) and
    (latency_ms is null or latency_ms >= 0) and
    (memory_version is null or memory_version > 0)
  );

alter table public.moni_ai_pmo_events
  add column if not exists detection_source text not null default 'MODEL_SUSPECTED',
  add column if not exists confidence numeric(4,3),
  add column if not exists validation_status text not null default 'PENDING',
  add column if not exists validator_name text,
  add column if not exists validated_at timestamptz,
  add column if not exists recommended_owner text,
  add column if not exists github_issue_number bigint,
  add column if not exists github_issue_url text,
  add column if not exists development_pr_number bigint,
  add column if not exists deployment_id text,
  add column if not exists resolution_evidence jsonb not null default '{}'::jsonb;

alter table public.moni_ai_pmo_events
  drop constraint if exists moni_ai_pmo_events_status_check;
alter table public.moni_ai_pmo_events
  add constraint moni_ai_pmo_events_status_check
  check (status in (
    'OPEN','ACKNOWLEDGED','TRIAGED','APPROVED','IN_PROGRESS','IN_DEVELOPMENT',
    'PREVIEW_TESTING','PMO_REVIEW','RESOLVED','REJECTED','DISMISSED'
  ));
alter table public.moni_ai_pmo_events
  drop constraint if exists moni_ai_pmo_events_detection_source_check;
alter table public.moni_ai_pmo_events
  add constraint moni_ai_pmo_events_detection_source_check
  check (detection_source in ('SYSTEM_DETECTED','USER_REPORTED','MODEL_SUSPECTED','VALIDATOR_DETECTED'));
alter table public.moni_ai_pmo_events
  drop constraint if exists moni_ai_pmo_events_validation_status_check;
alter table public.moni_ai_pmo_events
  add constraint moni_ai_pmo_events_validation_status_check
  check (validation_status in ('PENDING','VERIFIED','REJECTED','NOT_REQUIRED'));
alter table public.moni_ai_pmo_events
  drop constraint if exists moni_ai_pmo_events_confidence_check;
alter table public.moni_ai_pmo_events
  add constraint moni_ai_pmo_events_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 1));

create table if not exists public.moni_ai_pmo_event_transitions (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.moni_ai_pmo_events(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null default 'SYSTEM',
  actor_id text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists moni_ai_pmo_event_transitions_event_idx
  on public.moni_ai_pmo_event_transitions(event_id, id desc);

create or replace function public.log_moni_ai_pmo_event_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.moni_ai_pmo_event_transitions(event_id, from_status, to_status, actor_type, note)
    values (new.id, null, new.status, 'SYSTEM', 'PMO event created');
  elsif new.status is distinct from old.status then
    insert into public.moni_ai_pmo_event_transitions(event_id, from_status, to_status, actor_type, note)
    values (
      new.id,
      old.status,
      new.status,
      coalesce(nullif(new.evidence->>'transition_actor_type',''), 'SYSTEM'),
      nullif(new.evidence->>'transition_note','')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_moni_ai_pmo_event_transition() from public, anon, authenticated;
grant execute on function public.log_moni_ai_pmo_event_transition() to service_role;

drop trigger if exists moni_ai_pmo_event_transition_trigger on public.moni_ai_pmo_events;
create trigger moni_ai_pmo_event_transition_trigger
after insert or update of status on public.moni_ai_pmo_events
for each row execute function public.log_moni_ai_pmo_event_transition();

create table if not exists public.moni_ai_eval_runs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  suite_name text not null,
  model text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED','CANCELLED')),
  triggered_by text,
  case_count integer not null default 0 check (case_count >= 0),
  passed_count integer not null default 0 check (passed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moni_ai_eval_case_results (
  id bigint generated always as identity primary key,
  eval_run_id uuid not null references public.moni_ai_eval_runs(id) on delete cascade,
  case_id text not null,
  status text not null check (status in ('PASSED','FAILED','ERROR','SKIPPED')),
  score numeric(5,4),
  agent_run_id uuid references public.moni_ai_agent_runs(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  unique (eval_run_id, case_id),
  constraint moni_ai_eval_case_results_score_check check (score is null or (score >= 0 and score <= 1))
);
create index if not exists moni_ai_eval_case_results_run_idx
  on public.moni_ai_eval_case_results(eval_run_id, id);

alter table public.moni_ai_session_items enable row level security;
alter table public.moni_ai_thread_memory enable row level security;
alter table public.moni_ai_pmo_event_transitions enable row level security;
alter table public.moni_ai_eval_runs enable row level security;
alter table public.moni_ai_eval_case_results enable row level security;

revoke all on table public.moni_ai_session_items from anon, authenticated;
revoke all on table public.moni_ai_thread_memory from anon, authenticated;
revoke all on table public.moni_ai_pmo_event_transitions from anon, authenticated;
revoke all on table public.moni_ai_eval_runs from anon, authenticated;
revoke all on table public.moni_ai_eval_case_results from anon, authenticated;

grant all on table public.moni_ai_session_items to service_role;
grant all on table public.moni_ai_thread_memory to service_role;
grant all on table public.moni_ai_pmo_event_transitions to service_role;
grant all on table public.moni_ai_eval_runs to service_role;
grant all on table public.moni_ai_eval_case_results to service_role;
grant usage, select on sequence public.moni_ai_session_items_id_seq to service_role;
grant usage, select on sequence public.moni_ai_pmo_event_transitions_id_seq to service_role;
grant usage, select on sequence public.moni_ai_eval_case_results_id_seq to service_role;
