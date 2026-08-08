alter table public.moni_mcp_acceptance_windows
  add column if not exists preflight_run_id uuid references public.moni_mcp_preflight_runs(id) on delete set null,
  add column if not exists admin_tool_catalog_hash text,
  add column if not exists freelancer_tool_catalog_hash text;

create index if not exists idx_moni_mcp_acceptance_windows_preflight
  on public.moni_mcp_acceptance_windows(preflight_run_id);

comment on column public.moni_mcp_acceptance_windows.preflight_run_id is 'Exact PASS preflight used to authorize this acceptance window.';
comment on column public.moni_mcp_acceptance_windows.admin_tool_catalog_hash is 'Admin tool snapshot hash validated immediately before opening.';
comment on column public.moni_mcp_acceptance_windows.freelancer_tool_catalog_hash is 'Freelancer tool snapshot hash validated immediately before opening.';
