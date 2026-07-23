create or replace function public.mark_freelancer_settlement_paid_v6(
  p_settlement_id uuid,
  p_paid_date date
)
returns public.freelancer_settlements
language plpgsql
as $$
declare
  v_row public.freelancer_settlements;
begin
  select * into v_row
  from public.freelancer_settlements
  where id = p_settlement_id and business_id = '20220523011'
  for update;

  if not found then
    raise exception '정산건을 찾을 수 없습니다.';
  end if;
  if v_row.status <> 'confirmed' then
    raise exception '확정 상태의 정산건만 지급완료 처리할 수 있습니다.';
  end if;
  if p_paid_date is null then
    raise exception '지급일이 필요합니다.';
  end if;

  update public.freelancer_settlements
  set status = 'paid', paid_date = p_paid_date, updated_at = now()
  where id = p_settlement_id
  returning * into v_row;

  insert into public.finance_settlement_payment_events(
    business_id, settlement_id, event_type, payment_date, amount
  ) values (
    '20220523011', p_settlement_id, 'paid', p_paid_date, v_row.net_amount
  );

  return v_row;
end;
$$;

create or replace function public.reverse_freelancer_settlement_payment_v6(
  p_settlement_id uuid,
  p_reason text
)
returns public.freelancer_settlements
language plpgsql
as $$
declare
  v_row public.freelancer_settlements;
  v_old_paid_date date;
begin
  select * into v_row
  from public.freelancer_settlements
  where id = p_settlement_id and business_id = '20220523011'
  for update;

  if not found then
    raise exception '정산건을 찾을 수 없습니다.';
  end if;
  if v_row.status <> 'paid' then
    raise exception '지급완료 상태의 정산건만 지급취소할 수 있습니다.';
  end if;
  if btrim(coalesce(p_reason,'')) = '' then
    raise exception '지급취소 사유가 필요합니다.';
  end if;

  v_old_paid_date := v_row.paid_date;

  update public.freelancer_settlements
  set status = 'confirmed', paid_date = null, updated_at = now()
  where id = p_settlement_id
  returning * into v_row;

  insert into public.finance_settlement_payment_events(
    business_id, settlement_id, event_type, payment_date, amount, reason
  ) values (
    '20220523011', p_settlement_id, 'reversed', v_old_paid_date, v_row.net_amount, btrim(p_reason)
  );

  return v_row;
end;
$$;
