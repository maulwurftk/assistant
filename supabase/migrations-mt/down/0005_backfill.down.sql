-- Rollback 0005 (Prod- wie Staging-Variante). Nur sinnvoll VOR 0006 (NOT NULL).
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','activities','time_entries','calendar_slots','monthly_reports',
    'notifications','payroll_settings','payroll_runs','account_ledger',
    'push_subscriptions','assistant_unavailability'
  ] loop
    execute format('update public.%I set tenant_id = null where tenant_id is not null', t);
  end loop;
  delete from public.organizations where slug in ('karas','demo-org-a','demo-org-b');
end $$;
