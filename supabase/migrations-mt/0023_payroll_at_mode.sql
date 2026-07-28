-- ============================================================================
-- 0023 · Österreichischer Lohnabrechnungs-Modus (geringfügige Beschäftigung)
-- Ergänzt payroll_settings um einen zweiten, parallelen Länder-Modus neben
-- dem bestehenden deutschen Minijob-/Bezirk-Verfahren (mj_*, minijob_mode,
-- bezirk_mode). country_mode schaltet in der UI/Rechenlogik zwischen 'de'
-- und 'at' um — die DE-Spalten bleiben unverändert und aktiv, wenn
-- country_mode = 'de'. Kein Breaking Change für bestehende Installationen.
--
-- Hintergrund (siehe docs/payroll-at-architektur.md):
-- - Geringfügigkeitsgrenze 2026: 551,10 €/Monat
-- - AG-Pflichtabgaben im Normalfall (eine Assistenzperson): nur UV (1,1 %)
--   + MVK/"Abfertigung neu" (1,53 %) — deutlich schlanker als DE.
-- - Dienstgeberabgabe/Kommunalsteuer nur in Sonderfällen (Mehrfach-
--   beschäftigung bzw. Gemeinde-Freibetrag überschritten) -> Default 0,
--   optional aktivierbar.
-- - 13./14. Gehalt nur falls Kollektivvertrag/Einzelvertrag das vorsieht
--   (Einzelfallfrage, deshalb Checkboxen statt Zwangsfeld).
-- Idempotent.
-- ============================================================================

alter table public.payroll_settings
  add column if not exists country_mode text not null default 'de'
    check (country_mode in ('de', 'at'));

alter table public.payroll_settings
  add column if not exists at_geringfuegig_mode boolean not null default false;

alter table public.payroll_settings
  add column if not exists at_geringfuegigkeitsgrenze numeric(10,2) not null default 551.10;

alter table public.payroll_settings
  add column if not exists at_uv_beitrag numeric(5,2) not null default 1.10;

alter table public.payroll_settings
  add column if not exists at_mvk_beitrag numeric(5,2) not null default 1.53;

alter table public.payroll_settings
  add column if not exists at_dg_abgabe numeric(5,2) not null default 0;

alter table public.payroll_settings
  add column if not exists at_kommunalsteuer numeric(5,2) not null default 0;

alter table public.payroll_settings
  add column if not exists at_include_urlaubsgeld boolean not null default false;

alter table public.payroll_settings
  add column if not exists at_include_weihnachtsgeld boolean not null default false;

alter table public.payroll_settings
  add column if not exists at_dienstgeberkonto_nr text not null default '';

alter table public.payroll_settings
  add column if not exists at_kostentraeger_name text not null default '';

comment on column public.payroll_settings.country_mode is
  'Schaltet Lohnabrechnungs-Modus: de = deutsches Minijob-/Bezirk-Verfahren (mj_*, minijob_mode, bezirk_mode), at = österreichische geringfügige Beschäftigung (at_*).';
comment on column public.payroll_settings.at_geringfuegig_mode is
  'AT-Pendant zu minijob_mode: Lohnzettel/E-Mail zeigen AT-Abgaben-Aufschlüsselung.';
comment on column public.payroll_settings.at_geringfuegigkeitsgrenze is
  'Geringfügigkeitsgrenze in € (2026: 551,10) — jährlich manuell zu pflegen, ändert sich per Gesetz.';
comment on column public.payroll_settings.at_uv_beitrag is
  'Unfallversicherung AG-Anteil in % — Pflicht für jede geringfügig beschäftigte Person, unabhängig von der Anzahl.';
comment on column public.payroll_settings.at_mvk_beitrag is
  'Betriebliche Vorsorge "Abfertigung neu" (MVK) in % — Pflicht ab dem 2. Beschäftigungsmonat.';
comment on column public.payroll_settings.at_dg_abgabe is
  'Dienstgeberabgabe in % — nur bei mehreren geringfügig Beschäftigten mit Gesamtentgelt über 1,5x der Geringfügigkeitsgrenze. Default 0 (nicht der Regelfall).';
comment on column public.payroll_settings.at_kommunalsteuer is
  'Kommunalsteuer in % — nur relevant, wenn die Gesamtlohnsumme in der Gemeinde den monatlichen Freibetrag übersteigt. Default 0 (bei einem einzelnen privaten Haushalt praktisch nie der Fall).';
comment on column public.payroll_settings.at_include_urlaubsgeld is
  '13. Gehalt (Urlaubsgeld) aliquot mit einrechnen — nur falls Kollektivvertrag/Einzelvertrag das vorsieht.';
comment on column public.payroll_settings.at_include_weihnachtsgeld is
  '14. Gehalt (Weihnachtsgeld) aliquot mit einrechnen — nur falls Kollektivvertrag/Einzelvertrag das vorsieht.';
comment on column public.payroll_settings.at_dienstgeberkonto_nr is
  'ÖGK-Beitragskontonummer, AT-Pendant zu employer_tax_number/Betriebsnummer.';
comment on column public.payroll_settings.at_kostentraeger_name is
  'Freitext für den Kostenträger (z.B. Sozialministeriumservice oder das jeweilige Bundesland) — Ersatz für das starre deutsche "Bezirk"-Konzept, da die Kostenträger-Landschaft in AT je nach Bundesland/Assistenzform unterschiedlich ist.';
