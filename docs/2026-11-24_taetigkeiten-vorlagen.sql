-- Tätigkeits-Vorlagen für Karas (Zielvereinbarung Bezirk Oberpfalz) – 24.11.2026
-- Schritt 0: Migration 0030 (Spalten), Schritt 1: 13 Vorlagen anlegen, Schritt 2: die 6 Kategorien ausblenden.
-- Erwartung: 13 neue Tätigkeiten, 6 ausgeblendet. Mehrfach ausführbar (legt keine Duplikate an).
-- Reihenfolge: dieses SQL ZUERST, dann das Bericht-Langtext-SQL, dann git push.

begin;

alter table public.activities
  add column if not exists report_label text,
  add column if not exists default_description text;

comment on column public.activities.report_label is
  'Kategorie für den Tätigkeitsbericht (statt name). NULL = name verwenden.';
comment on column public.activities.default_description is
  'Vorschlagstext, der beim Auswählen der Tätigkeit in die Slot-Notizen übernommen wird.';

with tenant as (
  select tenant_id from activities where name = 'Elternassistenz – Freizeit mit Kind' limit 1
), v(name, report_label, default_description, sort_order) as (values
  ('Nachmittag zuhause mit Pia', 'Elternassistenz – Betreuung Tochter', 'Pia zuhause zusammen mit Thomas betreut, mit ihr gespielt und ihr Zimmer aufgeräumt.', 1),
  ('Spielplatz mit Pia', 'Elternassistenz – Freizeit mit Kind', 'Mit Thomas und Pia auf dem Spielplatz, auf Pia an den Spielgeräten aufgepasst.', 2),
  ('Ausflug mit Pia', 'Elternassistenz – Freizeit mit Kind', 'Ausflug mit Thomas und Pia, gefahren und unterwegs auf Pia aufgepasst.', 3),
  ('Pias Training (Parcours, Klettern)', 'Elternassistenz – Freizeit mit Kind', 'Pia zum Training gefahren, vor Ort geholfen und gesichert. Thomas war dabei.', 4),
  ('Kindergeburtstag / Besuch für Pia', 'Elternassistenz – Freizeit mit Kind', 'Zusammen mit Thomas auf die Kinder aufgepasst und mit ihnen gespielt.', 5),
  ('Betreuung während Pflege', 'Elternassistenz – Betreuung Tochter', 'Auf Pia aufgepasst, während Thomas seine Pflege gemacht hat. Die Pflege selbst habe ich nicht übernommen.', 6),
  ('Abendbetreuung Pia', 'Elternassistenz – Betreuung Tochter', 'Pia am Abend zusammen mit Thomas betreut und ihr beim Abendessen geholfen.', 7),
  ('Pias Zimmer aufräumen', 'Elternassistenz – Aufräumen / Einkauf', 'Mit Pia und Thomas Pias Zimmer aufgeräumt.', 8),
  ('Einkauf für Pia', 'Elternassistenz – Aufräumen / Einkauf', 'Mit Thomas Sachen für Pia eingekauft und die Einkäufe getragen.', 9),
  ('Fitnessstudio mit Thomas', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas zum Training ins Fitnessstudio gefahren und vor Ort unterstützt.', 10),
  ('Freizeit mit Thomas', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas bei einer Unternehmung außer Haus begleitet, gefahren und vor Ort unterstützt.', 11),
  ('Arzttermin Thomas', 'Pers. Assistenz – Arzttermin', 'Thomas zum Arzttermin gefahren und in die Praxis begleitet.', 12),
  ('Einkauf mit Thomas', 'Pers. Assistenz – Einkauf', 'Mit Thomas einkaufen gewesen, an die Regale geholfen und die Einkäufe getragen.', 13)
), ins as (
  insert into activities (tenant_id, name, report_label, default_description, sort_order, active)
  select t.tenant_id, v.name, v.report_label, v.default_description, v.sort_order, true
    from v cross join tenant t
   where not exists (select 1 from activities a where a.tenant_id = t.tenant_id and a.name = v.name)
  returning id
)
select count(*) as neu_angelegt_erwartet_13 from ins;

with hid as (
  update activities set active = false
   where name in ('Pers. Assistenz – Arzttermin', 'Pers. Assistenz – Einkauf', 'Pers. Assistenz – Freizeitbegleitung', 'Elternassistenz – Betreuung Tochter', 'Elternassistenz – Aufräumen / Einkauf', 'Elternassistenz – Freizeit mit Kind')
     and tenant_id = (select tenant_id from activities where name = 'Elternassistenz – Freizeit mit Kind' limit 1)
  returning id
)
select count(*) as ausgeblendet_erwartet_6 from hid;

-- Wenn beide Zahlen stimmen:  commit;   sonst:  rollback;
