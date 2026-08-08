-- MONI security hardening batch 1.
-- These legacy tables were previously exposed to anon/authenticated CRUD.
-- Source audit before this migration confirms no direct public Supabase table consumers
-- and no server `moniDb` anon consumers remain for this legacy actions surface.
-- Business data and business_id values are intentionally unchanged.

alter table public.bom_items enable row level security;
alter table public.cash_flow enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.packaging_materials enable row level security;
alter table public.packaging_transactions enable row level security;
alter table public.planned_productions enable row level security;
alter table public.productions enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.raw_material_transactions enable row level security;
alter table public.raw_materials enable row level security;
alter table public.transactions enable row level security;

revoke all on table public.bom_items from anon, authenticated;
revoke all on table public.cash_flow from anon, authenticated;
revoke all on table public.inventory_logs from anon, authenticated;
revoke all on table public.packaging_materials from anon, authenticated;
revoke all on table public.packaging_transactions from anon, authenticated;
revoke all on table public.planned_productions from anon, authenticated;
revoke all on table public.productions from anon, authenticated;
revoke all on table public.purchase_orders from anon, authenticated;
revoke all on table public.raw_material_transactions from anon, authenticated;
revoke all on table public.raw_materials from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
revoke all on table public.inventory_summary from anon, authenticated;

grant all on table public.bom_items to service_role;
grant all on table public.cash_flow to service_role;
grant all on table public.inventory_logs to service_role;
grant all on table public.packaging_materials to service_role;
grant all on table public.packaging_transactions to service_role;
grant all on table public.planned_productions to service_role;
grant all on table public.productions to service_role;
grant all on table public.purchase_orders to service_role;
grant all on table public.raw_material_transactions to service_role;
grant all on table public.raw_materials to service_role;
grant all on table public.transactions to service_role;
grant select on table public.inventory_summary to service_role;
