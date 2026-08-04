create table if not exists public.moni_ai_agent_requests (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  thread_id uuid not null references public.moni_ai_threads(id) on delete cascade,
  client_request_id text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  agent_run_id uuid null references public.moni_ai_agent_runs(id) on delete set null,
  response_json jsonb null,
  error_message text null,
  expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists moni_ai_agent_requests_client_uidx
  on public.moni_ai_agent_requests (business_id, thread_id, client_request_id);

create unique index if not exists moni_ai_agent_requests_active_thread_uidx
  on public.moni_ai_agent_requests (business_id, thread_id)
  where status = 'RUNNING';

create index if not exists moni_ai_agent_requests_created_idx
  on public.moni_ai_agent_requests (business_id, created_at desc);

alter table public.moni_ai_agent_requests enable row level security;
revoke all on public.moni_ai_agent_requests from anon, authenticated;
grant select, insert, update, delete on public.moni_ai_agent_requests to service_role;

create or replace function public.moni_claim_agent_request(
  p_business_id text,
  p_thread_id uuid,
  p_client_request_id text,
  p_ttl_seconds integer default 120
)
returns table (
  request_id uuid,
  claim_status text,
  request_status text,
  response_json jsonb,
  error_message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.moni_ai_agent_requests%rowtype;
  v_now timestamptz := now();
  v_ttl integer := greatest(30, least(300, coalesce(p_ttl_seconds, 120)));
begin
  update public.moni_ai_agent_requests
  set status = 'FAILED',
      error_message = coalesce(error_message, 'THREAD_LEASE_EXPIRED'),
      finished_at = v_now,
      updated_at = v_now
  where business_id = p_business_id
    and thread_id = p_thread_id
    and status = 'RUNNING'
    and expires_at <= v_now;

  select * into v_existing
  from public.moni_ai_agent_requests r
  where r.business_id = p_business_id
    and r.thread_id = p_thread_id
    and r.client_request_id = p_client_request_id
  limit 1;

  if found then
    request_id := v_existing.id;
    request_status := v_existing.status;
    response_json := v_existing.response_json;
    error_message := v_existing.error_message;
    claim_status := case v_existing.status
      when 'COMPLETED' then 'REPLAY'
      when 'RUNNING' then 'IN_PROGRESS'
      else 'DUPLICATE_FAILED'
    end;
    return next;
    return;
  end if;

  begin
    insert into public.moni_ai_agent_requests (
      business_id,
      thread_id,
      client_request_id,
      status,
      expires_at
    ) values (
      p_business_id,
      p_thread_id,
      p_client_request_id,
      'RUNNING',
      v_now + make_interval(secs => v_ttl)
    )
    returning * into v_existing;

    request_id := v_existing.id;
    claim_status := 'CLAIMED';
    request_status := v_existing.status;
    response_json := null;
    error_message := null;
    return next;
    return;
  exception when unique_violation then
    select * into v_existing
    from public.moni_ai_agent_requests r
    where r.business_id = p_business_id
      and r.thread_id = p_thread_id
      and r.status = 'RUNNING'
    order by r.started_at desc
    limit 1;

    if not found then
      raise;
    end if;

    request_id := v_existing.id;
    claim_status := 'BUSY';
    request_status := v_existing.status;
    response_json := null;
    error_message := null;
    return next;
    return;
  end;
end;
$$;

create or replace function public.moni_finish_agent_request(
  p_request_id uuid,
  p_status text,
  p_agent_run_id uuid default null,
  p_response_json jsonb default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('COMPLETED', 'FAILED') then
    raise exception 'Unsupported MONI Agent request status: %', p_status;
  end if;

  update public.moni_ai_agent_requests
  set status = p_status,
      agent_run_id = p_agent_run_id,
      response_json = case when p_status = 'COMPLETED' then p_response_json else null end,
      error_message = case when p_status = 'FAILED' then p_error_message else null end,
      finished_at = now(),
      updated_at = now()
  where id = p_request_id
    and status = 'RUNNING';
end;
$$;

revoke all on function public.moni_claim_agent_request(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.moni_finish_agent_request(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.moni_claim_agent_request(text, uuid, text, integer) to service_role;
grant execute on function public.moni_finish_agent_request(uuid, text, uuid, jsonb, text) to service_role;
