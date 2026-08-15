-- Stage 2: after the application has switched to the actor-bound four-argument
-- RPC, make the legacy actor-unbound overload unavailable to every API role.

revoke all on function public.moni_execute_production_plan_action(uuid, text)
  from public, anon, authenticated, service_role;
