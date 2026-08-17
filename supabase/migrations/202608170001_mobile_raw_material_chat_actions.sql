-- MONI mobile chat CRUD foundation for raw-material inbound records.
-- Business mutations remain confirmation-gated: prepare in application code,
-- then this RPC atomically executes one pre-existing PENDING confirmation.

create or replace function public.moni_execute_raw_material_transaction_action(
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
  c public.moni_action_confirmations%rowtype;
  m public.raw_materials%rowtype;
  tx public.raw_material_transactions%rowtype;
  tx_after public.raw_material_transactions%rowtype;
  v_action text;
  v_material_id text;
  v_transaction_id text;
  v_quantity_g numeric;
  v_old_quantity_g numeric;
  v_current_stock_g numeric;
  v_next_stock_g numeric;
  v_tx_date date;
  v_supplier text;
  v_note text;
  v_unit_price integer;
  v_quantity_packs numeric;
  v_packing_weight_g numeric;
  v_new_transaction_id text;
begin
  if coalesce(nullif(trim(p_user_confirmation_text), ''), '') = '' then
    raise exception '사용자의 명시적 승인 문구가 필요합니다.';
  end if;

  select * into c
  from public.moni_action_confirmations
  where id = p_confirmation_id
  for update;

  if not found then
    raise exception '승인 건을 찾을 수 없습니다.';
  end if;
  if c.action_domain <> 'raw_material_transaction' then
    raise exception '원재료 입고 승인 건이 아닙니다.';
  end if;
  if c.status <> 'PENDING' then
    raise exception '이미 처리됐거나 실행할 수 없는 승인 건입니다.';
  end if;
  if c.expires_at <= now() then
    update public.moni_action_confirmations
      set status = 'EXPIRED', error_message = 'confirmation_expired'
    where id = c.id;
    raise exception '승인 유효시간이 만료됐습니다. 다시 미리보기를 만들어 주세요.';
  end if;
  if coalesce(c.requested_by_login_id, '') <> coalesce(p_actor_login_id, '')
     or coalesce(c.source_client_id, '') <> coalesce(p_source_client_id, '') then
    raise exception '승인 건의 요청 주체가 현재 실행 주체와 일치하지 않습니다.';
  end if;

  v_action := upper(c.action_type);
  if v_action not in ('CREATE', 'UPDATE', 'DELETE') then
    raise exception '지원하지 않는 원재료 거래 작업입니다.';
  end if;

  update public.moni_action_confirmations
    set status = 'EXECUTING', user_confirmation_text = p_user_confirmation_text
  where id = c.id;

  if v_action = 'CREATE' then
    v_material_id := nullif(trim(c.payload->>'raw_material_id'), '');
    v_quantity_g := nullif(c.payload->>'quantity_g', '')::numeric;
    v_tx_date := coalesce(nullif(c.payload->>'tx_date', '')::date, current_date);
    v_supplier := nullif(trim(c.payload->>'supplier'), '');
    v_note := nullif(trim(c.payload->>'note'), '');
    v_unit_price := nullif(c.payload->>'unit_price', '')::integer;
    v_quantity_packs := nullif(c.payload->>'quantity_packs', '')::numeric;
    v_packing_weight_g := nullif(c.payload->>'packing_weight_g', '')::numeric;

    if v_material_id is null or v_quantity_g is null or v_quantity_g <= 0 or v_quantity_g <> trunc(v_quantity_g) then
      raise exception '원재료와 1g 단위의 올바른 입고수량이 필요합니다.';
    end if;

    select * into m
    from public.raw_materials
    where id = v_material_id
      and business_id = c.business_id
      and is_active is distinct from false
    for update;

    if not found then
      raise exception '현재 사업체의 활성 원재료 마스터에서 대상을 찾을 수 없습니다.';
    end if;
    if m.is_stock_managed is not true then
      raise exception '재고관리 대상이 아닌 원재료에는 입고를 직접 등록할 수 없습니다.';
    end if;

    v_current_stock_g := coalesce(m.current_stock_g, 0);
    v_next_stock_g := v_current_stock_g + v_quantity_g;
    v_new_transaction_id := 'RMT-CHAT-' || replace(gen_random_uuid()::text, '-', '');

    insert into public.raw_material_transactions (
      id, item_code, item_name, raw_material_name,
      txn_type, transaction_type, quantity_g, total_weight_g,
      quantity_packs, packing_weight_g,
      unit_price, supplier, note,
      txn_date, transaction_date, business_id
    ) values (
      v_new_transaction_id, m.id, m.item_name, m.item_name,
      'INBOUND', 'INBOUND', v_quantity_g, v_quantity_g,
      v_quantity_packs, coalesce(v_packing_weight_g, m.packing_weight_g),
      v_unit_price, v_supplier, v_note,
      v_tx_date, v_tx_date, c.business_id
    )
    returning * into tx_after;

    update public.raw_materials
      set current_stock_g = v_next_stock_g
    where id = m.id and business_id = c.business_id;

    update public.moni_action_confirmations
      set status = 'EXECUTED',
          executed_at = now(),
          result_snapshot = jsonb_build_object(
            'action_type', v_action,
            'transaction', to_jsonb(tx_after),
            'material_id', m.id,
            'material_name', m.item_name,
            'stock_before_g', v_current_stock_g,
            'stock_after_g', v_next_stock_g
          )
    where id = c.id;

    return jsonb_build_object(
      'ok', true,
      'action_type', v_action,
      'transaction_id', tx_after.id,
      'material_id', m.id,
      'material_name', m.item_name,
      'stock_before_g', v_current_stock_g,
      'stock_after_g', v_next_stock_g,
      'executed_at', now()
    );
  end if;

  v_transaction_id := nullif(trim(c.payload->>'transaction_id'), '');
  if v_transaction_id is null then
    raise exception '수정·삭제할 원재료 거래 ID가 필요합니다.';
  end if;

  select * into tx
  from public.raw_material_transactions
  where id = v_transaction_id
    and business_id = c.business_id
  for update;

  if not found then
    raise exception '대상 원재료 거래를 찾을 수 없습니다.';
  end if;
  if upper(coalesce(tx.txn_type, tx.transaction_type, '')) <> 'INBOUND' then
    raise exception '현재 모바일 카드에서는 원재료 입고 기록만 수정·삭제할 수 있습니다.';
  end if;
  if tx.production_record_id is not null or tx.source_purchase_id is not null then
    raise exception '생산 또는 매입 원장과 연결된 기록은 원본 업무에서 수정·취소해야 합니다.';
  end if;

  v_material_id := coalesce(nullif(trim(tx.item_code), ''), nullif(trim(c.payload->>'raw_material_id'), ''));
  select * into m
  from public.raw_materials
  where id = v_material_id
    and business_id = c.business_id
  for update;

  if not found then
    raise exception '거래와 연결된 원재료 마스터를 찾을 수 없습니다.';
  end if;
  if m.is_stock_managed is not true then
    raise exception '재고관리 대상이 아닌 원재료 기록은 직접 수정·삭제할 수 없습니다.';
  end if;

  v_old_quantity_g := coalesce(tx.quantity_g, tx.total_weight_g, 0);
  v_current_stock_g := coalesce(m.current_stock_g, 0);

  if v_action = 'DELETE' then
    v_next_stock_g := v_current_stock_g - v_old_quantity_g;
    if v_next_stock_g < 0 then
      raise exception '현재 재고보다 삭제하려는 과거 입고량이 커 재고가 음수가 됩니다. 후속 출고/소모 기록을 먼저 확인해 주세요.';
    end if;

    delete from public.raw_material_transactions
    where id = tx.id and business_id = c.business_id;

    update public.raw_materials
      set current_stock_g = v_next_stock_g
    where id = m.id and business_id = c.business_id;

    update public.moni_action_confirmations
      set status = 'EXECUTED',
          executed_at = now(),
          result_snapshot = jsonb_build_object(
            'action_type', v_action,
            'deleted_transaction', to_jsonb(tx),
            'material_id', m.id,
            'material_name', m.item_name,
            'stock_before_g', v_current_stock_g,
            'stock_after_g', v_next_stock_g
          )
    where id = c.id;

    return jsonb_build_object(
      'ok', true,
      'action_type', v_action,
      'transaction_id', tx.id,
      'material_id', m.id,
      'material_name', m.item_name,
      'stock_before_g', v_current_stock_g,
      'stock_after_g', v_next_stock_g,
      'executed_at', now()
    );
  end if;

  v_quantity_g := nullif(c.payload->>'quantity_g', '')::numeric;
  v_tx_date := coalesce(nullif(c.payload->>'tx_date', '')::date, tx.txn_date, tx.transaction_date, current_date);
  v_supplier := nullif(trim(c.payload->>'supplier'), '');
  v_note := nullif(trim(c.payload->>'note'), '');
  v_unit_price := nullif(c.payload->>'unit_price', '')::integer;
  v_quantity_packs := nullif(c.payload->>'quantity_packs', '')::numeric;
  v_packing_weight_g := nullif(c.payload->>'packing_weight_g', '')::numeric;

  if v_quantity_g is null or v_quantity_g <= 0 or v_quantity_g <> trunc(v_quantity_g) then
    raise exception '수정할 입고수량은 1g 단위의 양수여야 합니다.';
  end if;

  v_next_stock_g := v_current_stock_g - v_old_quantity_g + v_quantity_g;
  if v_next_stock_g < 0 then
    raise exception '수정 후 현재 재고가 음수가 됩니다. 후속 출고/소모 기록을 먼저 확인해 주세요.';
  end if;

  update public.raw_material_transactions
    set quantity_g = v_quantity_g,
        total_weight_g = v_quantity_g,
        quantity_packs = v_quantity_packs,
        packing_weight_g = coalesce(v_packing_weight_g, tx.packing_weight_g, m.packing_weight_g),
        unit_price = v_unit_price,
        supplier = v_supplier,
        note = v_note,
        txn_date = v_tx_date,
        transaction_date = v_tx_date
  where id = tx.id and business_id = c.business_id
  returning * into tx_after;

  update public.raw_materials
    set current_stock_g = v_next_stock_g
  where id = m.id and business_id = c.business_id;

  update public.moni_action_confirmations
    set status = 'EXECUTED',
        executed_at = now(),
        result_snapshot = jsonb_build_object(
          'action_type', v_action,
          'before', to_jsonb(tx),
          'after', to_jsonb(tx_after),
          'material_id', m.id,
          'material_name', m.item_name,
          'stock_before_g', v_current_stock_g,
          'stock_after_g', v_next_stock_g
        )
  where id = c.id;

  return jsonb_build_object(
    'ok', true,
    'action_type', v_action,
    'transaction_id', tx_after.id,
    'material_id', m.id,
    'material_name', m.item_name,
    'stock_before_g', v_current_stock_g,
    'stock_after_g', v_next_stock_g,
    'executed_at', now()
  );
end;
$$;

revoke all on function public.moni_execute_raw_material_transaction_action(uuid, text, text, text) from public;
grant execute on function public.moni_execute_raw_material_transaction_action(uuid, text, text, text) to service_role;
