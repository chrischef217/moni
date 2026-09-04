begin;

alter table public.raw_material_transactions
  add column if not exists expiration_kind text null,
  add column if not exists expiration_date date null,
  add column if not exists evidence_attachment_ids uuid[] not null default '{}'::uuid[];

alter table public.raw_material_transactions
  drop constraint if exists raw_material_transactions_expiration_kind_check;

alter table public.raw_material_transactions
  add constraint raw_material_transactions_expiration_kind_check
  check (expiration_kind is null or expiration_kind in ('소비기한', '유통기한', 'EXP'));

comment on column public.raw_material_transactions.expiration_kind is '입고 원재료 라벨에서 확인한 소비기한/유통기한/EXP 종류. 사진 또는 사용자 확인값.';
comment on column public.raw_material_transactions.expiration_date is '입고 원재료 라벨에서 확인한 기한 날짜. 제조일자 추정값을 저장하지 않는다.';
comment on column public.raw_material_transactions.evidence_attachment_ids is '해당 입고 기록의 사진 근거 moni_ai_attachments.id 목록.';

do $$
begin
  if to_regprocedure('public.moni_execute_raw_material_transaction_action_core_v1(uuid,text,text,text)') is null then
    if to_regprocedure('public.moni_execute_raw_material_transaction_action(uuid,text,text,text)') is null then
      raise exception 'moni_execute_raw_material_transaction_action 원본 함수가 없습니다.';
    end if;
    alter function public.moni_execute_raw_material_transaction_action(uuid,text,text,text)
      rename to moni_execute_raw_material_transaction_action_core_v1;
  end if;
end
$$;

create or replace function public.moni_execute_raw_material_transaction_action(
  p_confirmation_id uuid,
  p_user_confirmation_text text,
  p_actor_login_id text,
  p_source_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.moni_action_confirmations%rowtype;
  v_result jsonb;
  v_transaction_id text;
  v_action text;
  v_expiration_kind text;
  v_expiration_date date;
  v_evidence_ids uuid[] := '{}'::uuid[];
  v_requested_evidence_ids uuid[] := '{}'::uuid[];
  v_has_expiration_kind boolean := false;
  v_has_expiration_date boolean := false;
  v_has_evidence boolean := false;
begin
  select * into c
  from public.moni_action_confirmations
  where id = p_confirmation_id;

  if not found then
    raise exception '승인 건을 찾을 수 없습니다.';
  end if;

  v_action := upper(coalesce(c.action_type, ''));
  v_has_expiration_kind := c.payload ? 'expiration_kind';
  v_has_expiration_date := c.payload ? 'expiration_date';
  v_has_evidence := c.payload ? 'evidence_attachment_ids';

  if v_has_expiration_kind then
    v_expiration_kind := nullif(trim(c.payload->>'expiration_kind'), '');
    if v_expiration_kind is not null and v_expiration_kind not in ('소비기한', '유통기한', 'EXP') then
      raise exception '지원하지 않는 원재료 기한 종류입니다.';
    end if;
  end if;

  if v_has_expiration_date then
    begin
      v_expiration_date := nullif(trim(c.payload->>'expiration_date'), '')::date;
    exception when others then
      raise exception '원재료 기한 날짜 형식을 확인해 주세요.';
    end;
  end if;

  if v_has_evidence and jsonb_typeof(c.payload->'evidence_attachment_ids') = 'array' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_requested_evidence_ids
    from jsonb_array_elements_text(c.payload->'evidence_attachment_ids') as source(value);

    if cardinality(v_requested_evidence_ids) > 8 then
      raise exception '입고 사진 근거는 최대 8장까지 연결할 수 있습니다.';
    end if;

    if cardinality(v_requested_evidence_ids) > 0 then
      select coalesce(array_agg(a.id order by a.created_at), '{}'::uuid[])
        into v_evidence_ids
      from public.moni_ai_attachments a
      where a.business_id = c.business_id
        and a.id = any(v_requested_evidence_ids)
        and a.upload_status = 'READY';

      if cardinality(v_evidence_ids) <> cardinality(v_requested_evidence_ids) then
        raise exception '사진 근거 일부가 현재 사업체의 정상 업로드 파일과 일치하지 않습니다.';
      end if;
    end if;
  end if;

  v_result := public.moni_execute_raw_material_transaction_action_core_v1(
    p_confirmation_id,
    p_user_confirmation_text,
    p_actor_login_id,
    p_source_client_id
  );

  v_transaction_id := nullif(v_result->>'transaction_id', '');
  if v_transaction_id is not null and v_action in ('CREATE', 'UPDATE') then
    update public.raw_material_transactions
    set expiration_kind = case
          when v_action = 'CREATE' then v_expiration_kind
          when v_has_expiration_kind then v_expiration_kind
          else expiration_kind
        end,
        expiration_date = case
          when v_action = 'CREATE' then v_expiration_date
          when v_has_expiration_date then v_expiration_date
          else expiration_date
        end,
        evidence_attachment_ids = case
          when v_action = 'CREATE' then v_evidence_ids
          when v_has_evidence then v_evidence_ids
          else evidence_attachment_ids
        end
    where id = v_transaction_id
      and business_id = c.business_id;

    v_result := v_result || jsonb_build_object(
      'expiration_kind', case when v_action = 'CREATE' or v_has_expiration_kind then v_expiration_kind else null end,
      'expiration_date', case when v_action = 'CREATE' or v_has_expiration_date then v_expiration_date else null end,
      'evidence_attachment_ids', case when v_action = 'CREATE' or v_has_evidence then to_jsonb(v_evidence_ids) else '[]'::jsonb end
    );
  end if;

  return v_result;
end;
$function$;

revoke all on function public.moni_execute_raw_material_transaction_action_core_v1(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.moni_execute_raw_material_transaction_action_core_v1(uuid,text,text,text) to service_role;

grant execute on function public.moni_execute_raw_material_transaction_action(uuid,text,text,text) to postgres, anon, authenticated, service_role;

comment on function public.moni_execute_raw_material_transaction_action(uuid,text,text,text) is
  '원재료 입고 승인 실행 래퍼. 기존 재고 원장 실행을 보존하면서 소비/유통기한 및 사진 근거를 동일 트랜잭션에 연결한다.';

commit;
