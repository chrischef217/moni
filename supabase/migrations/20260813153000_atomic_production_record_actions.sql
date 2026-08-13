-- MONI V1 production write boundary.
-- All production-record mutations, confirmation finalization, and audit logging
-- are committed in one PostgreSQL transaction. Existing operational rows are
-- not changed by this migration.

create unique index if not exists uq_moni_action_audit_log_confirmation
  on public.moni_action_audit_log (confirmation_id)
  where confirmation_id is not null;

create unique index if not exists uq_raw_material_outbound_production_item
  on public.raw_material_transactions (business_id, production_record_id, item_code)
  where production_record_id is not null and txn_type = 'OUTBOUND';

create or replace function public.moni_execute_production_record_action(
  p_confirmation_id uuid,
  p_user_confirmation_text text,
  p_actor_login_id text,
  p_source_client_id text,
  p_deduction_preview jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id constant text := '20220523011';
  v_confirmation public.moni_action_confirmations%rowtype;
  v_record public.production_records%rowtype;
  v_product public.products%rowtype;
  v_material public.raw_materials%rowtype;
  v_payload jsonb;
  v_before jsonb := null;
  v_after jsonb := null;
  v_target_id uuid := null;
  v_material_entry jsonb;
  v_required_g numeric;
  v_actual_g numeric;
  v_defect_g numeric;
  v_sample_g numeric;
  v_planned_g numeric;
  v_outbound_count integer := 0;
  v_outbound_total_g numeric := 0;
  v_tx_id text;
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
  if v_confirmation.action_domain is distinct from 'production_record' then
    return jsonb_build_object('ok', false, 'error', 'invalid_action_domain');
  end if;
  if v_confirmation.status <> 'PENDING' then
    return jsonb_build_object(
      'ok', false,
      'error', 'confirmation_not_pending',
      'status', v_confirmation.status
    );
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

  if v_confirmation.action_type = 'CREATE_WORK_ORDER' then
    if coalesce(v_payload->>'business_id', '') <> v_business_id then
      raise exception 'canonical business_id is required';
    end if;
    v_planned_g := round(coalesce((v_payload->>'planned_quantity_g')::numeric, 0));
    if v_planned_g <= 0 then raise exception 'planned_quantity_g must be positive'; end if;

    select * into v_product
    from public.products
    where id = coalesce(v_payload->>'product_id', '')
      and business_id = v_business_id
      and is_active = true
    limit 1;
    if not found then raise exception 'active product not found in canonical business'; end if;

    insert into public.production_records (
      lot_number, work_date, product_id, product_name,
      production_unit_id, production_unit_name, production_unit_weight_g,
      planned_quantity_ea, planned_remainder_g, actual_quantity_ea,
      planned_quantity_g, actual_quantity_g, defect_quantity_g, sample_quantity_g,
      worker_name, inspection_result, sanitation_check, note, status,
      business_id, updated_at
    ) values (
      v_payload->>'lot_number', (v_payload->>'work_date')::date,
      v_product.id, v_product.product_name,
      nullif(v_payload->>'production_unit_id', '')::uuid,
      nullif(v_payload->>'production_unit_name', ''),
      nullif(v_payload->>'production_unit_weight_g', '')::numeric,
      nullif(v_payload->>'planned_quantity_ea', '')::integer,
      coalesce(nullif(v_payload->>'planned_remainder_g', '')::numeric, 0),
      null, v_planned_g, null, 0, 0,
      nullif(v_payload->>'worker_name', ''), '적합', true,
      nullif(v_payload->>'note', ''), 'planned', v_business_id, now()
    ) returning * into v_record;
    v_target_id := v_record.id;
    v_after := to_jsonb(v_record);

  elsif v_confirmation.action_type in (
    'UPDATE_WORK_ORDER', 'CANCEL_WORK_ORDER', 'COMPLETE_PRODUCTION', 'CONFIRM_PRODUCTION'
  ) then
    if v_confirmation.target_id is null then raise exception 'target_id is required'; end if;

    select * into v_record
    from public.production_records
    where id = v_confirmation.target_id and business_id = v_business_id
    for update;
    if not found then raise exception 'production record not found in canonical business'; end if;

    v_before := to_jsonb(v_record);
    v_target_id := v_record.id;

    if v_confirmation.action_type = 'UPDATE_WORK_ORDER' then
      if lower(trim(coalesce(v_record.status, ''))) not in ('planned', 'plan', 'scheduled') then
        raise exception 'only planned work orders can be updated';
      end if;
      v_planned_g := round(coalesce((v_payload->>'planned_quantity_g')::numeric, 0));
      if v_planned_g <= 0 then raise exception 'planned_quantity_g must be positive'; end if;

      update public.production_records
         set work_date = (v_payload->>'work_date')::date,
             lot_number = v_payload->>'lot_number',
             planned_quantity_g = v_planned_g,
             planned_quantity_ea = nullif(v_payload->>'planned_quantity_ea', '')::integer,
             planned_remainder_g = coalesce(nullif(v_payload->>'planned_remainder_g', '')::numeric, 0),
             note = nullif(v_payload->>'note', ''),
             worker_name = nullif(v_payload->>'worker_name', ''),
             business_id = v_business_id,
             updated_at = now()
       where id = v_record.id
       returning * into v_record;

    elsif v_confirmation.action_type = 'CANCEL_WORK_ORDER' then
      if lower(trim(coalesce(v_record.status, ''))) not in ('planned', 'plan', 'scheduled') then
        raise exception 'only planned work orders can be cancelled';
      end if;
      update public.production_records
         set status = 'cancelled', business_id = v_business_id, updated_at = now()
       where id = v_record.id
       returning * into v_record;

    elsif v_confirmation.action_type = 'COMPLETE_PRODUCTION' then
      if lower(trim(coalesce(v_record.status, ''))) not in ('planned', 'plan', 'scheduled') then
        raise exception 'only planned work orders can be completed';
      end if;
      v_actual_g := round(coalesce((v_payload->>'actual_quantity_g')::numeric, 0));
      v_defect_g := round(coalesce((v_payload->>'defect_quantity_g')::numeric, 0));
      v_sample_g := round(coalesce((v_payload->>'sample_quantity_g')::numeric, 0));
      v_planned_g := round(coalesce(v_record.planned_quantity_g, 0));
      if v_actual_g < 0 or v_defect_g < 0 or v_sample_g < 0
         or v_actual_g + v_defect_g + v_sample_g <= 0
         or v_actual_g + v_defect_g + v_sample_g > v_planned_g then
        raise exception 'invalid completion quantities';
      end if;

      update public.production_records
         set actual_quantity_g = v_actual_g,
             actual_quantity_ea = nullif(v_payload->>'actual_quantity_ea', '')::integer,
             defect_quantity_g = v_defect_g,
             sample_quantity_g = v_sample_g,
             worker_name = nullif(v_payload->>'worker_name', ''),
             inspection_result = coalesce(nullif(v_payload->>'inspection_result', ''), '적합'),
             inspection_note = nullif(v_payload->>'inspection_note', ''),
             sanitation_check = coalesce((v_payload->>'sanitation_check')::boolean, true),
             status = 'completed', business_id = v_business_id, updated_at = now()
       where id = v_record.id
       returning * into v_record;

      insert into public.production_completion_metadata (
        production_record_id, writer_name, reviewer_name,
        actual_input_unit, actual_input_value,
        defect_input_unit, defect_input_value, sample_entries, updated_at
      ) values (
        v_record.id::text, '윤대열', '배순애',
        'kg', (v_payload->>'actual_input_kg')::numeric,
        'kg', (v_payload->>'defect_input_kg')::numeric,
        case when v_sample_g > 0 then jsonb_build_array(jsonb_build_object(
          'label', '샘플 1', 'value', (v_payload->>'sample_input_kg')::numeric,
          'unit', 'kg', 'grams', v_sample_g
        )) else '[]'::jsonb end,
        now()
      )
      on conflict (production_record_id) do update
         set writer_name = excluded.writer_name,
             reviewer_name = excluded.reviewer_name,
             actual_input_unit = excluded.actual_input_unit,
             actual_input_value = excluded.actual_input_value,
             defect_input_unit = excluded.defect_input_unit,
             defect_input_value = excluded.defect_input_value,
             sample_entries = excluded.sample_entries,
             updated_at = excluded.updated_at;

    elsif v_confirmation.action_type = 'CONFIRM_PRODUCTION' then
      if lower(trim(coalesce(v_record.status, ''))) not in ('completed', 'complete', 'done', '완료') then
        raise exception 'only completed production can be confirmed';
      end if;
      if p_deduction_preview is null
         or jsonb_typeof(p_deduction_preview->'materials') <> 'array'
         or jsonb_array_length(p_deduction_preview->'materials') = 0 then
        raise exception 'fresh deduction preview is required';
      end if;
      if coalesce((p_deduction_preview->>'has_missing_mapping')::boolean, true)
         or coalesce((p_deduction_preview->>'has_insufficient')::boolean, true) then
        raise exception 'deduction preview is not executable';
      end if;

      v_planned_g := round(coalesce(v_record.planned_quantity_g, 0));
      v_actual_g := round(coalesce(v_record.actual_quantity_g, 0));
      v_defect_g := round(coalesce(v_record.defect_quantity_g, 0));
      v_sample_g := round(coalesce(v_record.sample_quantity_g, 0));
      if round(coalesce((p_deduction_preview->>'planned_quantity_g')::numeric, -1)) <> v_planned_g
         or round(coalesce((p_deduction_preview->>'deduction_basis_g')::numeric, -1)) <> v_planned_g
         or round(coalesce((p_deduction_preview->>'entered_quantity_g')::numeric, -1))
            <> v_actual_g + v_defect_g + v_sample_g then
        raise exception 'deduction preview no longer matches production record';
      end if;

      if exists (
        select 1
        from jsonb_array_elements(p_deduction_preview->'materials') item
        group by item->>'material_id'
        having item->>'material_id' is null or count(*) <> 1
      ) then
        raise exception 'deduction preview materials must be uniquely aggregated';
      end if;

      if exists (
        select 1 from public.raw_material_transactions
        where business_id = v_business_id
          and production_record_id = v_record.id
          and txn_type = 'OUTBOUND'
      ) then
        raise exception 'production outbound already exists';
      end if;

      for v_material_entry in
        select value
        from jsonb_array_elements(p_deduction_preview->'materials')
        order by value->>'material_id'
      loop
        v_required_g := (v_material_entry->>'required_g')::numeric;
        if v_required_g <= 0 then raise exception 'required_g must be positive'; end if;

        select * into v_material
        from public.raw_materials
        where id = v_material_entry->>'material_id'
          and business_id = v_business_id
          and is_stock_managed = true
        for update;
        if not found then raise exception 'canonical stock-managed raw material not found'; end if;
        if coalesce(v_material.current_stock_g, 0) < v_required_g then
          raise exception 'insufficient raw material stock: %', v_material.item_name;
        end if;

        update public.raw_materials
           set current_stock_g = current_stock_g - v_required_g
         where id = v_material.id;

        v_outbound_count := v_outbound_count + 1;
        v_outbound_total_g := v_outbound_total_g + v_required_g;
        v_tx_id := 'RMT-' || p_confirmation_id::text || '-' || lpad(v_outbound_count::text, 3, '0');
        insert into public.raw_material_transactions (
          id, item_code, item_name, txn_type, quantity_g,
          unit_price, supplier, note, txn_date, business_id,
          transaction_type, transaction_date, raw_material_name,
          food_type_name, total_weight_g, production_record_id
        ) values (
          v_tx_id, coalesce(v_material.item_code, v_material.id), v_material.item_name,
          'OUTBOUND', v_required_g, null, null,
          'production_confirmation=' || p_confirmation_id::text || ';lot_number=' || v_record.lot_number,
          v_record.work_date, v_business_id, 'OUTBOUND', v_record.work_date,
          v_material.item_name, nullif(v_material_entry->>'food_type_name', ''),
          v_required_g, v_record.id
        );
      end loop;

      update public.production_records
         set status = 'confirmed', business_id = v_business_id, updated_at = now()
       where id = v_record.id
       returning * into v_record;
    end if;

    v_after := to_jsonb(v_record);
  else
    raise exception 'unsupported production record action type';
  end if;

  update public.moni_action_confirmations
     set status = 'EXECUTED', target_id = coalesce(v_target_id, target_id),
         user_confirmation_text = p_user_confirmation_text,
         result_snapshot = jsonb_build_object(
           'before', v_before, 'after', v_after,
           'outbound_count', v_outbound_count,
           'outbound_total_g', v_outbound_total_g
         ),
         executed_at = now(), error_message = null
   where id = p_confirmation_id;

  insert into public.moni_action_audit_log (
    confirmation_id, business_id, action_domain, action_type,
    target_table, target_id, before_snapshot, after_snapshot,
    actor_login_id, actor_role, source_client_id, user_confirmation_text
  ) values (
    v_confirmation.id, v_business_id, 'production_record', v_confirmation.action_type,
    'production_records', v_target_id, v_before, v_after,
    p_actor_login_id, v_confirmation.requested_by_role,
    p_source_client_id, p_user_confirmation_text
  );

  return jsonb_build_object(
    'ok', true,
    'confirmation_id', v_confirmation.id,
    'action_type', v_confirmation.action_type,
    'target_id', v_target_id,
    'before', v_before,
    'after', v_after,
    'outbound_count', v_outbound_count,
    'outbound_total_g', v_outbound_total_g,
    'executed_at', now()
  );
end;
$$;

revoke all on function public.moni_execute_production_record_action(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.moni_execute_production_record_action(uuid, text, text, text, jsonb)
  to service_role;

comment on function public.moni_execute_production_record_action(uuid, text, text, text, jsonb) is
  'Atomically executes approved MONI V1 production-record actions. CONFIRM alone deducts raw-material stock and writes OUTBOUND rows.';
