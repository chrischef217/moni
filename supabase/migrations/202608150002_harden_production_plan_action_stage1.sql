-- Stage 1: add the hardened actor-bound production-plan RPC while preserving
-- the legacy two-argument overload until the application has switched over.
-- No operational business rows are changed.

create unique index if not exists uq_moni_action_audit_log_confirmation
  on public.moni_action_audit_log (confirmation_id)
  where confirmation_id is not null;

create or replace function public.moni_execute_production_plan_action(
  p_confirmation_id uuid,
  p_user_confirmation_text text,
  p_actor_login_id text,
  p_source_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id constant text := '20220523011';
  v_confirmation public.moni_action_confirmations%rowtype;
  v_plan public.monthly_production_plans%rowtype;
  v_product public.products%rowtype;
  v_before jsonb := null;
  v_after jsonb := null;
  v_target_id uuid := null;
  v_payload jsonb;
  v_quantity numeric;
  v_note text;
begin
  select * into v_confirmation
  from public.moni_action_confirmations
  where id = p_confirmation_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'confirmation_not_found');
  end if;
  if v_confirmation.business_id is distinct from v_business_id then
    return jsonb_build_object('ok', false, 'error', 'non_canonical_business');
  end if;
  if v_confirmation.action_domain is distinct from 'production_plan' then
    return jsonb_build_object('ok', false, 'error', 'invalid_action_domain');
  end if;
  if v_confirmation.status <> 'PENDING' then
    return jsonb_build_object('ok', false, 'error', 'confirmation_not_pending', 'status', v_confirmation.status);
  end if;
  if v_confirmation.expires_at <= now() then
    update public.moni_action_confirmations
       set status = 'EXPIRED', error_message = 'confirmation_expired'
     where id = p_confirmation_id;
    return jsonb_build_object('ok', false, 'error', 'confirmation_expired');
  end if;
  if coalesce(trim(p_user_confirmation_text), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'user_confirmation_required');
  end if;
  if v_confirmation.requested_by_login_id is distinct from p_actor_login_id
     or v_confirmation.source_client_id is distinct from p_source_client_id then
    return jsonb_build_object('ok', false, 'error', 'confirmation_actor_mismatch');
  end if;

  v_payload := coalesce(v_confirmation.payload, '{}'::jsonb);
  if coalesce(v_payload->>'business_id', '') <> v_business_id then
    raise exception 'canonical business_id is required';
  end if;

  if v_confirmation.action_type in ('CREATE', 'UPDATE') then
    v_quantity := round(coalesce((v_payload->>'planned_quantity_g')::numeric, 0));
    if v_quantity <= 0 then raise exception 'planned_quantity_g must be positive'; end if;

    select * into v_product
    from public.products
    where id = coalesce(v_payload->>'product_id', '')
      and is_active = true
      and business_id = v_business_id
    limit 1;
    if not found then raise exception 'active product not found in canonical business'; end if;
    v_note := nullif(trim(coalesce(v_payload->>'note', '')), '');
  end if;

  if v_confirmation.action_type = 'CREATE' then
    insert into public.monthly_production_plans (
      plan_date, product_id, product_name, planned_quantity_g, note, business_id
    ) values (
      (v_payload->>'plan_date')::date,
      v_product.id,
      v_product.product_name,
      v_quantity,
      v_note,
      v_business_id
    ) returning * into v_plan;
    v_target_id := v_plan.id;
    v_after := to_jsonb(v_plan);

  elsif v_confirmation.action_type = 'UPDATE' then
    if v_confirmation.target_id is null then raise exception 'target_id is required for update'; end if;
    select * into v_plan
    from public.monthly_production_plans
    where id = v_confirmation.target_id and business_id = v_business_id
    for update;
    if not found then raise exception 'production plan not found for update'; end if;

    v_before := to_jsonb(v_plan);
    update public.monthly_production_plans
       set plan_date = (v_payload->>'plan_date')::date,
           product_id = v_product.id,
           product_name = v_product.product_name,
           planned_quantity_g = v_quantity,
           note = v_note,
           business_id = v_business_id,
           updated_at = now()
     where id = v_plan.id
     returning * into v_plan;
    v_target_id := v_plan.id;
    v_after := to_jsonb(v_plan);

  elsif v_confirmation.action_type = 'DELETE' then
    if v_confirmation.target_id is null then raise exception 'target_id is required for delete'; end if;
    select * into v_plan
    from public.monthly_production_plans
    where id = v_confirmation.target_id and business_id = v_business_id
    for update;
    if not found then raise exception 'production plan not found for delete'; end if;

    v_before := to_jsonb(v_plan);
    v_target_id := v_plan.id;
    delete from public.monthly_production_plans where id = v_plan.id;

  else
    raise exception 'unsupported production plan action type';
  end if;

  update public.moni_action_confirmations
     set status = 'EXECUTED',
         target_id = coalesce(v_target_id, target_id),
         user_confirmation_text = p_user_confirmation_text,
         result_snapshot = jsonb_build_object('before', v_before, 'after', v_after),
         executed_at = now(),
         error_message = null
   where id = p_confirmation_id;

  insert into public.moni_action_audit_log (
    confirmation_id, business_id, action_domain, action_type,
    target_table, target_id, before_snapshot, after_snapshot,
    actor_login_id, actor_role, source_client_id, user_confirmation_text
  ) values (
    v_confirmation.id, v_business_id, v_confirmation.action_domain,
    v_confirmation.action_type, 'monthly_production_plans', v_target_id,
    v_before, v_after, v_confirmation.requested_by_login_id,
    v_confirmation.requested_by_role, v_confirmation.source_client_id,
    p_user_confirmation_text
  );

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', v_confirmation.id,
    'action_type', v_confirmation.action_type,
    'target_id', v_target_id,
    'before', v_before,
    'after', v_after,
    'executed_at', now()
  );
end;
$$;

revoke all on function public.moni_execute_production_plan_action(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.moni_execute_production_plan_action(uuid, text, text, text)
  to service_role;

comment on function public.moni_execute_production_plan_action(uuid, text, text, text)
  is 'Atomically validates actor, canonical tenant, confirmation state, mutation, audit, and finalization for MONI production plans.';
