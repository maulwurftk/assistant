-- Kontoauszug-Import (CSV/CAMT): Herkunft 'bank' + eindeutige Bank-Referenz,
-- damit derselbe Kontoauszug nie doppelt gebucht wird.
alter table public.account_ledger drop constraint if exists account_ledger_source_check;
alter table public.account_ledger
  add constraint account_ledger_source_check check (source in ('manual', 'auto', 'bank'));

alter table public.account_ledger add column if not exists bank_ref text;

create unique index if not exists account_ledger_bank_ref_uidx
  on public.account_ledger (tenant_id, bank_ref)
  where bank_ref is not null;
