alter table public.moni_mcp_oauth_tokens
  add column if not exists refresh_count integer not null default 0,
  add column if not exists last_refreshed_at timestamptz;

alter table public.moni_mcp_oauth_tokens
  drop constraint if exists moni_mcp_oauth_tokens_refresh_count_check;

alter table public.moni_mcp_oauth_tokens
  add constraint moni_mcp_oauth_tokens_refresh_count_check
  check (refresh_count >= 0);

comment on column public.moni_mcp_oauth_tokens.refresh_count is 'Number of successful refresh-token rotations for this logical token row.';
comment on column public.moni_mcp_oauth_tokens.last_refreshed_at is 'Timestamp of the latest successful refresh-token rotation.';
