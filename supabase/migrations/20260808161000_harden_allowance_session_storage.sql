-- MONI allowance authentication defense-in-depth.
-- Safe rollout prerequisite: DB-only auth code is deployed and there are no active legacy sessions.

alter table public.allowance_platform_users enable row level security;
alter table public.allowance_platform_sessions enable row level security;
alter table public.allowance_platform_state enable row level security;

revoke all on table public.allowance_platform_users from anon, authenticated;
revoke all on table public.allowance_platform_sessions from anon, authenticated;
revoke all on table public.allowance_platform_state from anon, authenticated;

grant all on table public.allowance_platform_users to service_role;
grant all on table public.allowance_platform_sessions to service_role;
grant all on table public.allowance_platform_state to service_role;

-- Historical sessions used raw UUID bearer tokens. All of them must already be expired
-- before this migration is applied. Never delete an active session implicitly.
delete from public.allowance_platform_sessions
where expires_at <= now()
  and token !~ '^[0-9a-f]{64}$';

do $$
begin
  if exists (
    select 1
    from public.allowance_platform_sessions
    where token !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'active or unexpected legacy allowance sessions remain; aborting hash constraint';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.allowance_platform_sessions'::regclass
      and conname = 'allowance_platform_sessions_token_sha256_check'
  ) then
    alter table public.allowance_platform_sessions
      add constraint allowance_platform_sessions_token_sha256_check
      check (token ~ '^[0-9a-f]{64}$');
  end if;
end $$;
