-- Prevent PMO/system context bridge rows from ever being exposed as assistant chat.
-- This migration changes only MONI AI conversation metadata; it does not touch
-- production, sales, purchase, inventory, or other business records.

create or replace function public.moni_force_internal_context_system_role()
returns trigger
language plpgsql
as $$
begin
  if (
    (coalesce(new.provider, '') = 'system' and coalesce(new.model, '') = 'pmo-context-bridge')
    or position('MONI_SHARED_CONTEXT_START' in coalesce(new.content, '')) > 0
    or position('MONI_SHARED_CONTEXT_END' in coalesce(new.content, '')) > 0
    or position('[PMO 승인 공용 프로젝트 문맥]' in coalesce(new.content, '')) > 0
    or position('[PMO 승인 공통 프로젝트 문맥]' in coalesce(new.content, '')) > 0
  ) then
    new.role := 'system';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_moni_force_internal_context_system_role on public.moni_ai_messages;
create trigger trg_moni_force_internal_context_system_role
before insert or update of role, content, provider, model
on public.moni_ai_messages
for each row
execute function public.moni_force_internal_context_system_role();

update public.moni_ai_messages
set role = 'system'
where role = 'assistant'
  and (
    (coalesce(provider, '') = 'system' and coalesce(model, '') = 'pmo-context-bridge')
    or content ilike '%MONI_SHARED_CONTEXT_START%'
    or content ilike '%MONI_SHARED_CONTEXT_END%'
    or content ilike '%[PMO 승인 공용 프로젝트 문맥]%'
    or content ilike '%[PMO 승인 공통 프로젝트 문맥]%'
  );
