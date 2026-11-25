-- HINWEIS: Ohne begin/commit – der Supabase-SQL-Editor rollt offene Transaktionen am Ende jedes Laufs zurück.
-- Jede Anweisung wird sofort gespeichert. Mehrfaches Ausführen ist unschädlich.
-- Tätigkeitsberichte: Langtexte + Zuordnung zur Zielvereinbarung (Bezirk Oberpfalz, ZV vom 07.04.2026)
-- Erzeugt am 24.11.2026. Betrifft nur bestätigte, nicht-private Einsätze Mai–Oktober 2026.
-- Erwartung: Schritt 1 meldet 70 aktualisierte Einsätze, Schritt 2 genau 1 gelöschten Test-Einsatz.
-- Nicht angefasst (bewusst offen): Kindergarten bringen 07.09., Terminbegleitung/Urlaubsvorbereitung 10.09.,
-- Packen helfen 12.09., Urlaubsvorbereitung 11.09.


-- 1) Beschreibung setzen + Tätigkeit auf die passende Kategorie der Zielvereinbarung stellen
with v(assistant, d, t, act, txt) as (values
  ('Antonia Kleinert', date '2026-05-06', time '17:00', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas zum Essen gehen begleitet, hingefahren und im Lokal unterstützt.'),
  ('Antonia Kleinert', date '2026-05-07', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas Eis essen gewesen, unterwegs auf Pia aufgepasst.'),
  ('Antonia Kleinert', date '2026-05-15', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Nachmittag mit Pia und Thomas, Pia beim Abendessen geholfen.'),
  ('Antonia Kleinert', date '2026-05-16', time '10:00', 'Elternassistenz – Freizeit mit Kind', 'Pias Kindergeburtstag: zusammen mit Thomas auf die Kinder aufgepasst, mit ihnen gespielt und bei der Feier geholfen.'),
  ('Antonia Kleinert', date '2026-05-20', time '14:00', 'Elternassistenz – Betreuung Tochter', 'Zuhause mit Pia und Thomas: gespielt, Pias Kinderzimmer aufgeräumt und gemeinsam gekocht.'),
  ('Antonia Kleinert', date '2026-05-22', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Ausflug mit Thomas und Pia. Gefahren und unterwegs auf Pia aufgepasst.'),
  ('Antonia Kleinert', date '2026-05-25', time '10:00', 'Elternassistenz – Freizeit mit Kind', 'Ausflug mit Thomas und Pia zur Holhöhe. Gefahren und unterwegs auf Pia aufgepasst.'),
  ('Antonia Kleinert', date '2026-05-29', time '16:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas auf dem Spielplatz, danach Pia beim Abendessen geholfen und mit ihr ihr Zimmer aufgeräumt.'),
  ('Lisa Kapfer', date '2026-05-13', time '14:00', 'Elternassistenz – Freizeit mit Kind', 'Ausflug in den Tierpark mit Thomas und Pia, gefahren und auf Pia aufgepasst.'),
  ('Lisa Kapfer', date '2026-05-18', time '09:00', 'Pers. Assistenz – Arzttermin', 'Thomas zum Arzttermin gefahren, in die Praxis begleitet und beim Ein- und Aussteigen geholfen.'),
  ('Lisa Kapfer', date '2026-05-19', time '14:30', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas unterwegs gewesen, Fahrt übernommen und Pia betreut.'),
  ('Lisa Kapfer', date '2026-05-26', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Pia hatte Besuch von anderen Kindern, zusammen mit Thomas auf die Kinder aufgepasst und mit ihnen gespielt.'),
  ('Lisa Kapfer', date '2026-05-27', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Nachmittagsausflug mit Thomas und Pia, unterwegs auf Pia geachtet und Thomas geholfen, wo es nötig war.'),
  ('Antonia Kleinert', date '2026-06-03', time '14:00', 'Elternassistenz – Betreuung Tochter', 'Pia zuhause zusammen mit Thomas betreut, mit ihr gespielt und danach ihr Zimmer aufgeräumt.'),
  ('Antonia Kleinert', date '2026-06-05', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Nachmittag daheim mit Pia und Thomas, gemeinsam mit Pia gekocht und gespielt.'),
  ('Antonia Kleinert', date '2026-06-10', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Zuhause-Betreuung von Pia mit Thomas: Spiele gemacht und zusammen das Kinderzimmer aufgeräumt.'),
  ('Antonia Kleinert', date '2026-06-12', time '16:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Thomas und Pia auf dem Spielplatz. Auf Pia an den Spielgeräten aufgepasst und ihr geholfen, wo Thomas mit dem Rollstuhl nicht hinkommt.'),
  ('Antonia Kleinert', date '2026-06-17', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Nachmittag nach dem Kindergarten mit Pia und Thomas, mit Pia gespielt und sie betreut.'),
  ('Antonia Kleinert', date '2026-06-19', time '16:00', 'Elternassistenz – Freizeit mit Kind', 'Nachmittag auf dem Spielplatz mit Pia und Thomas, Pia an den Geräten beaufsichtigt und gesichert.'),
  ('Antonia Kleinert', date '2026-06-24', time '15:30', 'Elternassistenz – Betreuung Tochter', 'Pia nach dem Kindergarten zusammen mit Thomas betreut.'),
  ('Antonia Kleinert', date '2026-06-29', time '09:00', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas zum Training ins Fitnessstudio gefahren und vor Ort unterstützt.'),
  ('Lisa Kapfer', date '2026-06-08', time '13:00', 'Elternassistenz – Freizeit mit Kind', 'Pia zum Parcours-Training gefahren und vor Ort unterstützt und gesichert. Thomas war dabei.'),
  ('Lisa Kapfer', date '2026-06-11', time '14:00', 'Elternassistenz – Freizeit mit Kind', 'Spielplatz mit Pia, Thomas war dabei. Ich habe auf Pia aufgepasst und ihr an den Geräten geholfen.'),
  ('Lisa Kapfer', date '2026-06-15', time '13:00', 'Elternassistenz – Freizeit mit Kind', 'Parcours mit Pia und Thomas: Fahrt, Hilfestellung bei den Übungen, auf Pia aufgepasst.'),
  ('Lisa Kapfer', date '2026-06-21', time '09:00', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas bei einer Unternehmung außer Haus begleitet, gefahren und vor Ort unterstützt.'),
  ('Lisa Kapfer', date '2026-06-22', time '13:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas beim Parcours-Training, Pia geholfen und gesichert.'),
  ('Lisa Kapfer', date '2026-06-26', time '15:00', 'Pers. Assistenz – Freizeitbegleitung', 'Freizeitbegleitung für Thomas, Fahrt hin und zurück und unterwegs geholfen, wo es nötig war.'),
  ('Lisa Kapfer', date '2026-06-29', time '13:00', 'Elternassistenz – Freizeit mit Kind', 'Pia zum Parcours-Training gefahren und vor Ort unterstützt und gesichert. Thomas war dabei.'),
  ('Lisa Kapfer', date '2026-06-30', time '17:00', 'Elternassistenz – Betreuung Tochter', 'Auf Pia aufgepasst, während Thomas seine Pflege gemacht hat. Die Pflege selbst habe ich nicht übernommen.'),
  ('Antonia Kleinert', date '2026-07-01', time '14:45', 'Elternassistenz – Betreuung Tochter', 'Nachmittagsbetreuung von Pia gemeinsam mit Thomas, gespielt und auf Pia geschaut.'),
  ('Antonia Kleinert', date '2026-07-06', time '09:00', 'Pers. Assistenz – Freizeitbegleitung', 'Mit Thomas im Fitnessstudio, Hin- und Rückfahrt und Unterstützung beim Training.'),
  ('Antonia Kleinert', date '2026-07-08', time '18:00', 'Elternassistenz – Betreuung Tochter', 'Pia am Abend zusammen mit Thomas betreut.'),
  ('Antonia Kleinert', date '2026-07-10', time '15:30', 'Elternassistenz – Betreuung Tochter', 'Nach dem Kindergarten mit Pia und Thomas daheim, gespielt und mit Pia zusammen gekocht.'),
  ('Antonia Kleinert', date '2026-07-13', time '08:30', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas zum Training ins Fitnessstudio gefahren und vor Ort unterstützt.'),
  ('Antonia Kleinert', date '2026-07-15', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Nachmittag nach dem Kindergarten mit Pia und Thomas, mit Pia gespielt und sie betreut.'),
  ('Antonia Kleinert', date '2026-07-18', time '11:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Thomas und Pia auf einem Kindergeburtstag, auf Pia aufgepasst.'),
  ('Antonia Kleinert', date '2026-07-20', time '09:30', 'Pers. Assistenz – Freizeitbegleitung', 'Mit Thomas im Fitnessstudio, Hin- und Rückfahrt und Unterstützung beim Training.'),
  ('Antonia Kleinert', date '2026-07-27', time '09:30', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas zum Training ins Fitnessstudio gefahren und vor Ort unterstützt.'),
  ('Lisa Kapfer', date '2026-07-03', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Ausflug mit Thomas und Pia. Gefahren und unterwegs auf Pia aufgepasst.'),
  ('Lisa Kapfer', date '2026-07-06', time '13:00', 'Elternassistenz – Freizeit mit Kind', 'Parcours mit Pia und Thomas: Fahrt, Hilfestellung bei den Übungen, auf Pia aufgepasst.'),
  ('Lisa Kapfer', date '2026-07-13', time '13:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas beim Parcours-Training, Pia geholfen und gesichert.'),
  ('Lisa Kapfer', date '2026-07-17', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas unterwegs gewesen, Fahrt übernommen und Pia betreut.'),
  ('Lisa Kapfer', date '2026-07-20', time '13:30', 'Elternassistenz – Freizeit mit Kind', 'Pia zum Parcours-Training gefahren und vor Ort unterstützt und gesichert. Thomas war dabei.'),
  ('Lisa Kapfer', date '2026-07-27', time '13:00', 'Elternassistenz – Betreuung Tochter', 'Auf Pia aufgepasst, Thomas war dabei.'),
  ('Antonia Kleinert', date '2026-08-07', time '13:00', 'Elternassistenz – Betreuung Tochter', 'Nachmittag mit Pia und Thomas, danach mit Pia ihr Kinderzimmer aufgeräumt.'),
  ('Antonia Kleinert', date '2026-08-18', time '09:00', 'Elternassistenz – Aufräumen / Einkauf', 'Mit Thomas Pias Kinderzimmer aufgeräumt und Sachen für Pia eingekauft.'),
  ('Antonia Kleinert', date '2026-08-19', time '12:30', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas bei einer Unternehmung außer Haus begleitet, gefahren und vor Ort unterstützt.'),
  ('Antonia Kleinert', date '2026-08-24', time '14:00', 'Pers. Assistenz – Freizeitbegleitung', 'Freizeitbegleitung für Thomas, Fahrt hin und zurück und unterwegs geholfen, wo es nötig war.'),
  ('Antonia Kleinert', date '2026-08-26', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Pia zusammen mit Thomas betreut und ihn im Alltag mit Pia unterstützt.'),
  ('Antonia Kleinert', date '2026-08-31', time '07:45', 'Pers. Assistenz – Arzttermin', 'Arztbegleitung: Thomas hin- und zurückgefahren und in der Praxis unterstützt.'),
  ('Lisa Kapfer', date '2026-08-11', time '12:00', 'Pers. Assistenz – Freizeitbegleitung', 'Thomas bei einer Unternehmung außer Haus begleitet, gefahren und vor Ort unterstützt.'),
  ('Lisa Kapfer', date '2026-08-13', time '09:00', 'Elternassistenz – Freizeit mit Kind', 'Pia zur Klettergruppe gefahren und vor Ort gesichert, Thomas war dabei.'),
  ('Lisa Kapfer', date '2026-08-14', time '14:00', 'Elternassistenz – Freizeit mit Kind', 'Nachmittagsausflug mit Pia und Thomas zum Eisessen, auf Pia aufgepasst.'),
  ('Lisa Kapfer', date '2026-08-21', time '13:00', 'Elternassistenz – Betreuung Tochter', 'Gemeinsam mit Thomas auf Pia geschaut und mit ihr gespielt.'),
  ('Lisa Kapfer', date '2026-08-25', time '14:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Pia und Thomas auf dem Spielplatz, Pia hat sich mit Freunden getroffen. Auf die Kinder aufgepasst.'),
  ('Lisa Kapfer', date '2026-08-27', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Nachmittag mit Pia und Thomas unterwegs, auf Pia aufgepasst.'),
  ('Lisa Kapfer', date '2026-08-28', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Mit Thomas und Pia auf dem Spielplatz. Auf Pia an den Spielgeräten aufgepasst und ihr geholfen, wo Thomas mit dem Rollstuhl nicht hinkommt.'),
  ('Lisa Kapfer', date '2026-08-31', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Spielplatz mit Pia und ihrem Freund, Thomas war dabei. Auf die beiden Kinder aufgepasst.'),
  ('Antonia Kleinert', date '2026-09-02', time '15:00', 'Elternassistenz – Aufräumen / Einkauf', 'Mit Thomas Kleidung für Pia gekauft, in die Läden begleitet und die Einkäufe getragen.'),
  ('Antonia Kleinert', date '2026-09-07', time '14:00', 'Elternassistenz – Betreuung Tochter', 'Pia nach dem Kindergarten zusammen mit Thomas betreut.'),
  ('Lisa Kapfer', date '2026-09-03', time '09:00', 'Pers. Assistenz – Arzttermin', 'Thomas zum Arzttermin gefahren, in die Praxis begleitet und beim Ein- und Aussteigen geholfen.'),
  ('Lisa Kapfer', date '2026-09-04', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Pia nachmittags zuhause betreut, gespielt und gemeinsam ihr Zimmer aufgeräumt. Thomas war dabei.'),
  ('Antonia Kleinert', date '2026-10-05', time '12:30', 'Pers. Assistenz – Einkauf', 'Mit Thomas einkaufen gewesen, Sachen aus den Regalen geholt, getragen und ins Auto geladen.'),
  ('Antonia Kleinert', date '2026-10-13', time '15:00', 'Elternassistenz – Freizeit mit Kind', 'Freizeit mit Pia und Thomas, Pia beschäftigt und beaufsichtigt.'),
  ('Antonia Kleinert', date '2026-10-14', time '13:30', 'Elternassistenz – Freizeit mit Kind', 'Mit Thomas zusammen etwas mit Pia unternommen, ich habe auf Pia geachtet.'),
  ('Antonia Kleinert', date '2026-10-15', time '10:00', 'Elternassistenz – Betreuung Tochter', 'Pia mit Thomas zusammen betreut.'),
  ('Antonia Kleinert', date '2026-10-16', time '15:00', 'Elternassistenz – Betreuung Tochter', 'Pia zusammen mit Thomas betreut und ihn im Alltag mit Pia unterstützt.'),
  ('Antonia Kleinert', date '2026-10-19', time '13:30', 'Elternassistenz – Freizeit mit Kind', 'Nachmittag mit Pia und Thomas unterwegs, auf Pia aufgepasst.'),
  ('Antonia Kleinert', date '2026-10-21', time '15:30', 'Pers. Assistenz – Einkauf', 'Einkauf mit Thomas, an die Regale geholfen und die Einkäufe getragen.'),
  ('Antonia Kleinert', date '2026-10-26', time '15:30', 'Elternassistenz – Freizeit mit Kind', 'Freizeit mit Pia und Thomas, Pia beschäftigt und beaufsichtigt.')
), upd as (
  update calendar_slots s
     set description = v.txt,
         activity_id = coalesce(
           (select a.id from activities a where a.name = v.act and a.tenant_id = s.tenant_id limit 1),
           s.activity_id)
    from v
    join profiles p on p.full_name = v.assistant
   where s.assigned_to = p.id
     and s.tenant_id = p.tenant_id
     and s.date = v.d
     and coalesce(s.actual_start_time, s.start_time) = v.t
     and s.status = 'assigned'
     and s.is_private = false
     and s.confirmed_at is not null
  returning s.id
)
select count(*) as aktualisiert_erwartet_70 from upd;

-- 2) Test-Einsatz vom 14.10.2026 löschen
with del as (
  delete from calendar_slots s
   using profiles p
   where s.assigned_to = p.id
     and p.full_name = 'Test'
     and s.date = date '2026-10-14'
     and s.title = 'test'
  returning s.id
)
select count(*) as geloescht_erwartet_1 from del;

