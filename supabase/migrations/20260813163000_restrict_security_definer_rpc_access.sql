-- Security-definer functions are server/trigger internals. They must not be
-- callable through PostgREST by anonymous or ordinary authenticated clients.

revoke all on function public.moni_apply_confirmed_sales_prices(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.moni_apply_confirmed_sales_prices(text, jsonb)
  to service_role;

revoke all on function public.moni_seed_ai_thread_context()
  from public, anon, authenticated;
grant execute on function public.moni_seed_ai_thread_context()
  to service_role;

revoke all on function public.moni_update_financial_payable(
  text, uuid, text, numeric, date, text, text, text, integer, date, text, text
) from public, anon, authenticated;
grant execute on function public.moni_update_financial_payable(
  text, uuid, text, numeric, date, text, text, text, integer, date, text, text
) to service_role;

revoke all on function public.sync_inline_semiproduct_recipe_type()
  from public, anon, authenticated;
grant execute on function public.sync_inline_semiproduct_recipe_type()
  to service_role;
