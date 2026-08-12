alter table public.moni_action_confirmations
  drop constraint if exists moni_action_confirmations_status_check;

alter table public.moni_action_confirmations
  add constraint moni_action_confirmations_status_check
  check (
    status = any (
      array[
        'PENDING'::text,
        'EXECUTING'::text,
        'EXECUTED'::text,
        'CANCELLED'::text,
        'EXPIRED'::text,
        'FAILED'::text
      ]
    )
  );
