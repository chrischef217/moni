alter table public.moni_action_confirmations
  drop constraint if exists moni_action_confirmations_action_type_check;

alter table public.moni_action_confirmations
  add constraint moni_action_confirmations_action_type_check
  check (
    action_type = any (
      array[
        'CREATE'::text,
        'UPDATE'::text,
        'DELETE'::text,
        'CREATE_WORK_ORDER'::text,
        'UPDATE_WORK_ORDER'::text,
        'CANCEL_WORK_ORDER'::text,
        'COMPLETE_PRODUCTION'::text,
        'CONFIRM_PRODUCTION'::text
      ]
    )
  );
