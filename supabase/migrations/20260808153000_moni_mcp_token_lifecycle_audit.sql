alter table public.moni_mcp_oauth_tokens
  add column if not exists refresh_count integer not null default 0,
  add column if not exists last_refreshed_at timestamptz;

alter table public.moni_mcp_oauth_tokens
  drop constraint if exists moni_mcp_oauth_tokens_refresh_count_check;

alter table public.moni_mcp_oauth_tokens
  add constraint moni_mcp_oauth_tokens_refresh_count_check
  check (refresh_count >= 0);

create or replace function public.moni_mcp_audit_refresh_rotation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.refresh_token_hash is distinct from new.refresh_token_hash then
    new.refresh_count := coalesce(old.refresh_count, 0) + 1;
    new.last_refreshed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.moni_mcp_audit_refresh_rotation() from public, anon, authenticated;
grant execute on function public.moni_mcp_audit_refresh_rotation() to service_role;

drop trigger if exists trg_moni_mcp_audit_refresh_rotation on public.moni_mcp_oauth_tokens;
create trigger trg_moni_mcp_audit_refresh_rotation
before update of refresh_token_hash on public.moni_mcp_oauth_tokens
for each row
execute function public.moni_mcp_audit_refresh_rotation();

comment on column public.moni_mcp_oauth_tokens.refresh_count is 'Number of successful refresh-token rotations for this logical token row.';
comment on column public.moni_mcp_oauth_tokens.last_refreshed_at is 'Timestamp of the latest successful refresh-token rotation.';
comment on function public.moni_mcp_audit_refresh_rotation() is 'Server-side audit hook that records successful refresh-token hash rotation without storing token plaintext.';
