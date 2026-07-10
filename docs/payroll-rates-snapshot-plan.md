# Minijob-Beitragssätze: Snapshot pro Abrechnungsmonat — Umsetzungsplan

Stand: 2026-07-06 · Status: geplant, noch nicht begonnen

## Ausgangslage

`payroll_settings` hält die aktuell gültigen Minijob-Beitragssätze
(`mj_kv_ag`, `mj_rv_ag`, `mj_pauschsteuer`, `mj_u2`, `mj_insolvenzgeld`,
`mj_rv_an`, `uv_rate`) als einzelne, editierbare Spalten. Migration
`supabase-migration-rates.sql` hat das bereits von hartcodierten Werten
(`MINIJOB_RATES` in `src/lib/payroll.ts`) auf pro-Instanz pflegbare Werte
umgestellt — das war schon der richtige Schritt für "Gesetzesänderung ohne
Code-Anfassen".

## Problem

`src/app/payroll/[year]/[month]/page.tsx` liest die Sätze **live** aus der
aktuellen `payroll_settings`-Zeile (`ratesFromSettings(settings)`), auch wenn
ein Monat aus der Vergangenheit angezeigt wird. Es gibt keinen Snapshot pro
Abrechnungsperiode.

**Konsequenz:** Ändert man die Sätze heute (z. B. wegen einer
Gesetzesänderung), verändern sich rückwirkend auch bereits abgeschlossene
Monate — Lohnzettel und Dienstberichte, die z. B. an den Bezirk oder als
Nachweis gegenüber der Minijob-Zentrale gegangen sind, würden bei erneutem
Abruf plötzlich andere Zahlen zeigen. Das ist unabhängig von der Frage, ob
Beitragskomponenten hinzufügbar/entfernbar sein sollen — es betrifft schon
den heutigen Stand mit fixen Spalten.

## Ziel

Die zum Zeitpunkt der Abrechnung gültigen Sätze pro Monat einfrieren
(Snapshot), sodass:

1. Vergangene Abrechnungen stabil bleiben, auch wenn sich `payroll_settings`
   später ändert.
2. Neue/geänderte Sätze nur auf Monate ab dem Änderungszeitpunkt wirken.

## Umsetzungsvorschlag (grob)

1. **Neue Tabelle `payroll_rate_snapshots`** (oder Spalten direkt auf einer
   bestehenden Monats-/Periodentabelle, falls vorhanden): `tenant_id`, `year`,
   `month`, `mj_kv_ag`, `mj_rv_ag`, `mj_pauschsteuer`, `mj_u2`,
   `mj_insolvenzgeld`, `mj_rv_an`, `uv_rate`, `created_at`. Eindeutig pro
   `(tenant_id, year, month)`.
2. **Snapshot-Erzeugung:** Beim ersten Aufruf/Öffnen eines Abrechnungsmonats
   (oder beim expliziten "Monat abschließen") aktuelle
   `payroll_settings`-Sätze in `payroll_rate_snapshots` kopieren, falls für
   diesen Monat noch kein Snapshot existiert.
3. **Lese-Reihenfolge in `page.tsx`:** Erst prüfen, ob ein Snapshot für
   `(year, month)` existiert → falls ja, diesen verwenden. Falls nein (z. B.
   noch nicht abgeschlossener aktueller Monat), weiterhin live aus
   `payroll_settings` lesen (damit der laufende Monat weiterhin die aktuellen
   Einstellungen widerspiegelt, bis er "fixiert" wird).
4. **`ratesFromSettings`** in `src/lib/payroll.ts` entsprechend erweitern,
   damit sie sowohl von `payroll_settings` als auch von einem
   `payroll_rate_snapshots`-Row aufrufbar ist (gleiche Feldnamen, andere
   Quelle).
5. **Migration:** Für bereits vergangene Monate gibt es keinen rückwirkenden
   Snapshot — das ist unvermeidbar (die historischen Sätze zum jeweiligen
   Zeitpunkt sind nicht mehr rekonstruierbar, außer man kennt sie manuell).
   Snapshot-Pflicht gilt ab Einführung des Features nach vorn.

## Offene Fragen (vor Umsetzung klären)

- Snapshot automatisch beim ersten Öffnen eines Monats, oder erst bei
  explizitem "Monat abschließen"-Button? (Automatisch ist einfacher, aber
  "abschließen" ist konzeptionell sauberer — verhindert versehentliches
  Fixieren eines Monats, der noch mitten in der Erfassung ist.)
- Soll ein bereits fixierter Snapshot manuell korrigierbar sein (z. B. bei
  Fehleingabe), oder nur durch erneutes "Aufheben + neu Fixieren"?
- Betrifft das auch `bezirk_mode`/`grossFromBezirkRate`-Berechnungen, die
  ebenfalls live aus `payroll_settings` lesen? (Vermutlich ja, gleiche
  Snapshot-Quelle mitverwenden.)

## Separates Thema (niedrigere Priorität): dynamische Beitragskomponenten

Ursprüngliche Anfrage war auch, ob sich im Admin-Menü ganze
Beitragsposten hinzufügen/entfernen lassen sollen (statt nur bestehende
Sätze zu ändern) — z. B. falls eine neue Umlage eingeführt oder eine
abgeschafft wird. Das würde eine Umstellung von festen Spalten auf eine
Tabelle „Beitragskomponenten" (Name, Satz, aktiv/inaktiv,
gültig-ab/gültig-bis) erfordern, über die `calculateMinijob` iteriert statt
feste Felder zu referenzieren.

Einschätzung: niedrigere Priorität als der Snapshot-Fix oben. In der Praxis
ändern sich bei den Minijob-Pauschalabgaben in Deutschland meist nur
Prozentsätze, nicht die Struktur der Komponenten selbst — das aktuelle
sechs-Felder-Modell deckt das ab. Erst angehen, wenn tatsächlich eine neue
Komponente gesetzlich eingeführt wird oder der Bedarf konkret entsteht.
