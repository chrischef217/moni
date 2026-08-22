-- MONI action confirmations/audit rows can target business tables whose primary keys
-- are either UUIDs or text IDs (for example export_documents uses EXPDOC-* text IDs).
-- Preserve all existing UUID values while allowing polymorphic text identifiers.

alter table public.moni_action_confirmations
  alter column target_id type text using target_id::text;

alter table public.moni_action_audit_log
  alter column target_id type text using target_id::text;

comment on column public.moni_action_confirmations.target_id is
  'Polymorphic target identifier. Supports UUID and text primary keys across MONI business domains.';

comment on column public.moni_action_audit_log.target_id is
  'Polymorphic target identifier matching target_table; supports UUID and text IDs.';
