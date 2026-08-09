-- Final public-grant cleanup for the UG Sales runtime state table.
-- Evidence before this migration:
-- - RLS is already enabled.
-- - There are zero RLS policies, so anon/authenticated have no effective row access.
-- - The table currently has zero rows.
-- - No MONI repository callsite references this table.
-- - service_role access must remain available for any external runtime consumer.
--
-- This migration changes grants only. It does not mutate rows or schema shape.

revoke all on table public.ug_sales_runtime_state from anon, authenticated;
grant all on table public.ug_sales_runtime_state to service_role;
