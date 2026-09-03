revoke execute on function public.moni_execute_raw_material_transaction_action(uuid,text,text,text) from public;
grant execute on function public.moni_execute_raw_material_transaction_action(uuid,text,text,text) to postgres, anon, authenticated, service_role;
