# Urlaub & Abwesenheiten · Architektur-Entwurf

_Stand: 2026-10-08, **umgesetzt** (siehe §10), Migration **0026** noch nicht eingespielt.
Referenzen: [Payroll AT](payroll-at-architektur.md) · [Rates-Snapshot](payroll-rates-snapshot-plan.md) · `src/lib/leave.ts` (Mutterschutz-Zeitraum, 0025)._

> Keine Rechtsberatung. Rechtliche Eckpunkte unten sind der gesetzliche Mindeststandard; Arbeitsvertrag
> und Bewilligungsbescheid des Bezirks gehen vor, wenn sie mehr regeln.

---

## 1. Rechtlicher Rahmen (DE, BUrlG) – was die App abbilden muss

| Punkt | Regel | Konsequenz für die App |
|---|---|---|
| Anspruch | 24 Werktage (6-Tage-Woche) = **20 Arbeitstage bei 5-Tage-Woche** = 4 Wochen. Minijobber/Teilzeit haben vollen Anspruch, **anteilig nach Arbeitstagen/Woche**, nicht nach Stunden. | Anspruch wird in **Tagen** geführt, Bezahlung in **Stunden/€**. |
| Formel regelmäßig | `Basis (20) × Arbeitstage pro Woche / 5` – z. B. 2 Tage/Woche → 8 Tage | `days_per_week` am Vertrag |
| Formel unregelmäßig | `24 × tatsächliche Arbeitstage im Jahr / 312` (bzw. `20 × AT / 260`) | aus bestätigten `calendar_slots` (distinct dates) berechenbar |
| Mehr Urlaub | vertraglich jederzeit möglich; +5 Tage bei Schwerbehinderung (§ 208 SGB IX) | `base_days`, `extra_days` am Vertrag |
| Wartezeit / Teilurlaub | Voller Anspruch erst nach 6 Monaten; davor bzw. bei Ein-/Austritt im Jahr **1/12 pro vollem Monat** (§§ 4, 5) | Pro-rata-Logik im Jahres-Job + bei Austritt |
| Urlaubsentgelt | **Referenzprinzip** (§ 11): Ø-Verdienst der **letzten 13 Wochen** vor Urlaubsbeginn (ohne Überstunden) | Tagessatz aus bestätigten Slots der 13 Wochen, beim Genehmigen eingefroren |
| Krankheit im Urlaub | Tage mit AU werden nicht angerechnet (§ 9) | Urlaubstage → Krankheitstage umbuchbar |
| Übertragung / Verfall | Urlaub ist im Kalenderjahr zu nehmen, Übertrag bis 31.03. Verfall **nur**, wenn AG rechtzeitig konkret auf Resturlaub + Verfall hingewiesen hat (BAG 2019, Mitwirkungsobliegenheit). Bei Langzeitkrankheit: Verfall frühestens 15 Monate nach Jahresende. | Hinweis-Schreiben **dokumentiert** versenden; Verfall-Job prüft Nachweis |
| Abgeltung | Bei Ende des Arbeitsverhältnisses wird Resturlaub ausbezahlt (§ 7 Abs. 4) | Buchung `payout` → Lohnzeile |
| Mutterschutz | kürzt den Urlaub **nicht** (§ 24 MuSchG), Rest verfällt nicht | Abwesenheitstyp `maternity` ohne Kürzung |
| Elternzeit | AG **darf** um 1/12 pro vollem Monat kürzen – muss es aber erklären (§ 17 BEEG) | optionale Buchung `parental_reduction` |
| Abgrenzung | Krankheit + Feiertag = **Ausfallprinzip** (EFZG: was sie laut Dienstplan verdient hätte), Urlaub = Referenzprinzip | Unterschiedliche Bewertung je Typ |

### Wer bezahlt?

- **Arbeitgeber** = Budgetnehmer (Mandant). Urlaubsentgelt ist normales Arbeitsentgelt → zählt voll zur
  **Minijob-Verdienstgrenze**, zu Pauschalabgaben und Lohnabrechnung.
- **Keine Umlage-Erstattung** für Urlaub. U1 erstattet (Minijob-Zentrale) nur Entgeltfortzahlung bei
  **Krankheit**, U2 nur Mutterschutz.
- **Refinanzierung über den Bezirk**: hängt am Bewilligungsbescheid. Typisch ist, dass das Budget einen Aufschlag
  für Ausfallzeiten (Urlaub/Krankheit) enthält oder Ersatzkräfte gesondert finanziert. **Im Bescheid prüfen** – sonst
  entstehen im Urlaub Doppelkosten (Urlaubsentgelt + Vertretung) aus demselben Topf.
  Faustregel: 4 Wochen Urlaub ≈ **+8,3 %** auf die tatsächlich gearbeiteten Stunden (4/48).

### Zielvereinbarung Bezirk Oberpfalz (Mandant Karas, 01.03.2026–29.02.2028) – Auswertung

- Bewilligt: Elternassistenz 9 h/Woche + Persönliche Assistenz 6 h/Woche, je **20,00 €/h brutto**, + max. 10 € Kontogebühr
  → **1.310 €/Monat** (= 15 h × 52/12 × 20 € + 10 €).
- Laut § 2: Im Stundensatz sind „sämtliche Kosten" inkl. AG-Sozialversicherung (ca. 15 % Minijob) enthalten.
  **Ein Aufschlag für Urlaub/Krankheit ist nicht ausgewiesen**, und das Budget rechnet mit **52 Wochen** à 15 h.
- Der Hilfebedarf muss vollständig abgedeckt sein → Urlaub einer Assistentin braucht Vertretung → Urlaubsentgelt ist
  **Zusatzkosten aus demselben Budget**. Ausgleich nur über die **Schwankungsreserve** (max. 2 Monatsbudgets = 2.620 €;
  Überschuss darüber geht nach 2 Monaten an den Bezirk zurück).
- Größenordnung: 4 Wochen × 15 h = **60 h/Jahr Urlaubsentgelt ≈ 1.200 €/Jahr (≈ 100 €/Monat)** voll belastet.
- Zwei saubere Wege:
  1. **Stundenlohn so kalkulieren, dass Urlaub im Satz steckt:** `20 / 1,1462 × 48/52 ≈ 16,11 €/h brutto`
     (statt ≈ 17,45 €/h ohne Urlaubsanteil; AG-Aufschlag 14,62 % lt. payroll_settings). Krankheit ist darin noch nicht enthalten.
  2. **Höheren Lohn zahlen und Urlaub aus Unterschreitungen/Schwankungsreserve finanzieren** – App muss dann die
     Reserve gegen offene Urlaubsansprüche (Rückstellung) zeigen.
- Nachweise (§ 6): **halbjährlich** Verwendungsnachweis (Gehaltsabrechnungen, Kontoauszüge) + Leistungsnachweis.
  Urlaubsentgelt ist zweckgebundene Lohnkosten → gehört in den Verwendungsnachweis, aber **nicht** als erbrachte
  Stunden in den Leistungsnachweis (siehe Entscheidung 5). Nachweise getrennt nach Elternassistenz / Persönliche
  Assistenz → Urlaubsentgelt anteilig zuordnen oder separat ausweisen.

**Entscheidung (2026-10-08): Weg 2.** Textlich gedeckt durch § 2 (Reserve „aus der Kostenüberschreitungen zu bestreiten sind") und § 6 Abs. 4 (Pflicht, Arbeitsrecht einzuhalten – Urlaubsentgelt ist gesetzliche Lohnkostenpflicht). Urlaub ist aber nicht ausdrücklich genannt → schriftliche Bestätigung beim Bezirk einholen und zu den Nachweisen legen.

**App-Folgen:** Budget-Ansicht um „Schwankungsreserve" (Stand vs. 2.620 €) und „Rückstellung offener Urlaub" erweitern;
Halbjahres-Export für Verwendungs- und Leistungsnachweis mit eigener Zeile Urlaubsentgelt.

### AT-Modus (`country_mode='at'`, UrlG) – Unterschiede

- 5 Wochen = 25 Arbeitstage (5-Tage-Woche) bzw. 30 Werktage; ab 25 Dienstjahren 6 Wochen; anteilig für Teilzeit/geringfügig.
- Urlaubsjahr = **Arbeitsjahr** (ab Eintritt), außer Umstellung auf Kalenderjahr vereinbart.
- Erste 6 Monate aliquot, danach voll.
- Urlaubsentgelt nach **Ausfallprinzip** (was sie verdient hätte).
- Verjährung 2 Jahre nach Ende des Urlaubsjahres; bei Austritt **Urlaubsersatzleistung**.
- Urlaubsgeld (13.) existiert bereits als `at_include_urlaubsgeld` – ist **unabhängig** vom Urlaubsanspruch.

---

## 2. Kernentscheidungen

1. **Konto als Buchungsjournal** (`leave_ledger`), nicht als Saldo-Spalte – analog `account_ledger`. Saldo = Summe.
   Prüfbar, rückwirkend korrigierbar, Jahreswechsel = Buchungen statt Überschreiben.
2. **Anspruch in Tagen, Entgelt in Minuten/€**, beim Genehmigen **eingefroren** (wie `payroll_runs.snapshot`).
   Spätere Lohn-/Satzänderungen verschieben bereits genehmigten Urlaub nicht.
3. **Vertragsdaten zeitversioniert** (`employment_terms`), weil sich Tage/Woche unterjährig ändern.
4. **Eine Abwesenheitstabelle für alle Typen** (Urlaub, Krank, Mutterschutz, Elternzeit, unbezahlt).
   `profiles.leave_*` (0025) wird später darauf migriert; `isOnLeaveAt()` liest dann aus `absences`.
5. **Flags-Prinzip wie Privat-Feature**: Urlaubsentgelt zählt in **Lohn/Minijob = ja**, in
   **Bezirk-Stundennachweis = nein** (eigene Zeile „Urlaubsentgelt/Ausfallzeiten").
6. **Modul pro Mandant** schaltbar (`vacation_enabled`).

---

## 3. Datenmodell (Migration 0026)

```sql
-- Mandanten-Einstellungen
alter table payroll_settings
  add column if not exists vacation_enabled        boolean not null default false,
  add column if not exists vacation_base_days      numeric(4,1) not null default 20,  -- bei 5-Tage-Woche (AT: 25)
  add column if not exists vacation_year_mode      text not null default 'calendar'
       check (vacation_year_mode in ('calendar','service_year')),                   -- AT: service_year
  add column if not exists vacation_carryover_until text not null default '03-31',  -- MM-DD
  add column if not exists vacation_reference_weeks int not null default 13,
  add column if not exists vacation_notice_month   int not null default 10;         -- Hinweis-Mail im Oktober

-- Ein-/Austritt
alter table profiles
  add column if not exists employment_start date,
  add column if not exists employment_end   date;

-- Vertragsbedingungen, zeitversioniert (exclude-Constraint braucht btree_gist)
create extension if not exists btree_gist;
create table employment_terms (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default current_tenant() references organizations(id),
  assistant_id   uuid not null references profiles(id) on delete cascade,
  valid_from     date not null,
  valid_until    date,                       -- null = offen
  days_per_week  numeric(3,1),               -- null = unregelmäßig -> Jahresarbeitstage-Methode
  base_days      numeric(4,1),               -- null = Mandanten-Default
  extra_days     numeric(4,1) not null default 0,  -- z.B. Schwerbehinderung
  note           text,
  created_at     timestamptz not null default now(),
  exclude using gist (assistant_id with =, daterange(valid_from, valid_until, '[]') with &&)
);

-- Abwesenheiten (Antrag + Genehmigung)
create table absences (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default current_tenant() references organizations(id),
  assistant_id    uuid not null references profiles(id) on delete cascade,
  type            text not null check (type in
                   ('vacation','sick','sick_child','maternity','parental','special','unpaid')),
  date_from       date not null,
  date_to         date not null,
  days            numeric(4,1),              -- angerechnete Arbeitstage (Urlaub); eingefroren bei Genehmigung
  workdays        date[],                    -- konkrete Tage (bei unregelmäßigem Dienstplan Pflicht)
  status          text not null default 'requested'
                   check (status in ('requested','approved','rejected','cancelled')),
  -- Entgelt-Snapshot (Urlaub: Referenzprinzip; Krank: Ausfallprinzip)
  paid_minutes    int,                       -- Summe bezahlter Minuten
  minutes_per_day int,
  calc_snapshot   jsonb,                     -- { method, refFrom, refTo, refMinutes, refWorkdays, slotIds[] }
  requested_by    uuid references profiles(id),
  decided_by      uuid references profiles(id),
  decided_at      timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  check (date_to >= date_from)
);

-- Urlaubskonto (Journal)
create table leave_ledger (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default current_tenant() references organizations(id),
  assistant_id  uuid not null references profiles(id) on delete cascade,
  leave_year    int not null,                -- Urlaubsjahr, dem die Tage zugeordnet sind
  kind          text not null check (kind in
                 ('entitlement','opening_balance','carryover','taken','expired',
                  'payout','parental_reduction','correction')),
  days          numeric(5,2) not null,       -- + Gutschrift / − Verbrauch
  absence_id    uuid references absences(id) on delete set null,
  expires_on    date,                        -- für entitlement/carryover
  note          text,
  dedup_key     text unique,                 -- z.B. 'ent:2027:<assistant>' -> Jobs idempotent
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

-- Nachweis Hinweispflicht (Voraussetzung für Verfall)
create table vacation_notices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default current_tenant() references organizations(id),
  assistant_id   uuid not null references profiles(id) on delete cascade,
  leave_year     int not null,
  remaining_days numeric(5,2) not null,
  expires_on     date not null,
  sent_at        timestamptz not null default now(),
  channel        text not null default 'email',
  message        text not null,              -- exakter versendeter Text
  read_at        timestamptz,                -- Bestätigung in der App
  unique (assistant_id, leave_year)
);

-- View: Saldo je Assistentin/Jahr
create view leave_balances as
  select tenant_id, assistant_id, leave_year,
         sum(days) filter (where days > 0) as credited,
         -sum(days) filter (where kind = 'taken') as taken,
         sum(days) as balance
  from leave_ledger group by 1,2,3;
```

**RLS** (Muster aus 0009): alles `tenant_id = current_tenant()`. Assistentin: `select` eigene Zeilen,
`insert` in `absences` nur eigene mit `status='requested'`, `update` nur eigene `requested → cancelled`.
Admin: alles. `leave_ledger`/`vacation_notices` schreibt nur Admin bzw. Server (Service-Role in Cron).
Indizes: `(tenant_id, assistant_id, date_from)`, `(tenant_id, assistant_id, leave_year)`.

---

## 4. Rechenlogik `src/lib/vacation.ts` (reine Funktionen, testbar)

```ts
entitlementForYear(terms: EmploymentTerm[], year, opts: {
  baseDefault, employmentStart, employmentEnd, country, workdaysInYear?  // für unregelmäßig
}): { days: number; segments: {from,to,days}[] }
```
- Je Vertragssegment: `base × days_per_week / 5 × (Monate im Segment / 12)` (DE: volle Monate, § 5).
- `days_per_week = null` → `24 × workdaysInYear / 312` (Vorjahres-Arbeitstage als Prognose, Jahresende-Korrektur per `correction`).
- Wartezeit: Eintritt in 2. Jahreshälfte → nur Zwölftel. Rundung: ab 0,5 aufrunden (§ 5 Abs. 2), Bruchteile < 0,5 bleiben stehen.
- AT: Urlaubsjahr ab `employment_start`, 25 Tage-Basis, aliquot in den ersten 6 Monaten.

```ts
countVacationDays(range, term, holidays, explicitDays?): number
```
- Regelmäßig: Wochentage laut Muster ohne gesetzliche Feiertage (Bayern; Feiertagsliste als Konstante/Tabelle je Bundesland).
- Unregelmäßig: Assistentin wählt die konkreten Tage (`workdays[]`), an denen sie lt. Dienstplan gearbeitet hätte.

```ts
vacationPay(slots13w: ConfirmedSlot[], days): { minutesPerDay, paidMinutes, snapshot }
```
- Basis: **bestätigte, lohnrelevante** Slots der 13 Wochen vor `date_from` (inkl. bezahlter Privat-Slots, exkl. Urlaub/Krank selbst).
- `minutesPerDay = Σ Minuten / Anzahl Arbeitstage im Referenzzeitraum`. Weniger als 13 Wochen beschäftigt → vorhandener Zeitraum.
- Bezahlung = `paidMinutes × Bruttostundenlohn` (bei `bezirk_mode` via `grossFromBezirkRate()` – siehe Bezirk-Falle!).

```ts
sickPay(plannedSlots) // Ausfallprinzip: geplante Slots im AU-Zeitraum
```

---

## 5. Abläufe

1. **Antrag** (Assistentin, `/urlaub`): Zeitraum wählen → App zeigt angerechnete Tage, Rest danach, Konflikte
   mit bereits zugewiesenen Slots. Status `requested`, Push an Admin.
2. **Genehmigung** (Admin): berechnet + friert `days`, `paid_minutes`, `calc_snapshot` ein, bucht
   `leave_ledger(kind='taken', days=−n)`. Zugewiesene Slots im Zeitraum → `open` + Benachrichtigung an
   andere Assistentinnen (Vertretung). Neue Zuweisung im Zeitraum blockiert (bestehende `isOnLeaveAt`-Logik).
3. **Krankmeldung im Urlaub**: Admin wandelt Tage in `sick` um → Gegenbuchung `correction +n`.
4. **Storno** vor Beginn: `cancelled` + Gegenbuchung.
5. **Lohnabrechnung**: Monat = bestätigte Slots **+ genehmigte Urlaubstage im Monat** (anteilig, wenn
   Urlaub monatsübergreifend: `paid_minutes` je Tag auf die Monate verteilen). Eigene Lohnzettel-Zeile
   „Urlaubsentgelt: n Tage × h:mm". Fließt in Brutto, Minijob-Abgaben, Minijobgrenzen-Warnung und in
   `payroll_runs.snapshot.vacation`. Bereits versendete Monate bleiben unverändert (Snapshot).
6. **Bezirk-Nachweis/Bericht**: Urlaubsstunden **nicht** als Assistenzstunden, sondern separat als Ausfallzeit.
7. **Budget**: Urlaubsentgelt belastet `account_ledger` (auto) wie normaler Lohn. Budget-Prognose zeigt
   offenen Urlaubsanspruch × Tagessatz als **Rückstellung**.

### Cron-Jobs (Vercel Cron, idempotent über `dedup_key`)

| Wann | Job |
|---|---|
| 01.01. (AT: Eintrittstag) | `entitlement` für neues Jahr buchen; Rest Vorjahr → `carryover` mit `expires_on = 31.03.` |
| 01.10. (einstellbar) | Hinweis-Mail je Assistentin mit Resturlaub > 0: „Sie haben noch X Tage, bitte bis 31.12. beantragen, sonst verfallen sie am 31.03." → `vacation_notices` + In-App-Bestätigung |
| 01.04. | Verfall: Rest-`carryover` → `expired` **nur wenn** `vacation_notices` für das Jahr existiert und keine Langzeit-AU; sonst stehen lassen + Admin-Warnung |
| bei `employment_end` | Rest → `payout`, landet als Lohnzeile im letzten Monat |

---

## 6. UI

- **Assistentin `/urlaub`**: Kachel Anspruch / genommen / geplant / Rest / „verfällt am"; Antragsformular; Liste.
- **Admin `/admin/urlaub`**: Tabelle aller Assistentinnen (Saldo, offene Anträge), Genehmigen/Ablehnen,
  Jahresübersicht (Urlaubsplan), Konto-Journal je Person mit manueller Korrekturbuchung, Startsaldo-Import.
- **Admin Benutzer**: Ein-/Austritt + Vertragsbedingungen (`employment_terms`) pflegen.
- **Kalender**: Abwesenheiten als Hintergrund-Band je Person; Zuweisung blockiert.
- **Payroll-Settings**: Sektion „Urlaub" (Modul an/aus, Basis-Tage, Urlaubsjahr, Hinweis-Monat).

---

## 7. Umsetzungsphasen

1. **0026 + `vacation.ts` + Tests**: Tabellen, RLS, Rechenfunktionen (inkl. Testfälle 2-Tage-Woche, unregelmäßig, Eintritt Juli, Vertragswechsel).
2. **Konto & Antrag**: Admin-Pflege Verträge/Startsaldo, Antrag/Genehmigung, Kalender-Blockade.
3. **Payroll-Integration**: Urlaubsentgelt in Abrechnung, Lohnzettel, Snapshot, Minijob-Check, Bezirk-Bericht.
4. **Jobs**: Jahreswechsel, Hinweis-Mail, Verfall, Abgeltung.
5. **Krankheit/EFZG + U1-Erstattung** (eigene Ausbaustufe), Migration `profiles.leave_*` → `absences`.

---

## 8. Offene Fragen (vor Phase 1 klären)

1. ~~Vertraglicher Urlaub?~~ **Geklärt (2026-10-08): keine schriftlichen Verträge** → gesetzlicher Mindesturlaub (`vacation_base_days = 20`). Siehe §9.
2. Feste Wochentage oder unregelmäßig? → Default **unregelmäßig** (`days_per_week = null`, Jahresarbeitstage aus bestätigten Slots), da nichts vereinbart ist.
3. ~~Wie finanziert der Bezirk Urlaub?~~ **Geklärt (Zielvereinbarung 07.04.2026):** kein gesonderter Anteil. **Entscheidung 2026-10-08: Weg 2** (Lohn bleibt, Urlaubsentgelt aus Unterschreitungen/Schwankungsreserve) – vorbehaltlich schriftlicher Bestätigung durch die Sachbearbeitung Bezirk Oberpfalz.
4. Startsalden: Wie viel Resturlaub haben die aktuellen Assistentinnen für 2026 (Opening-Balance-Buchung)?
5. Gilt für Mandanten in AT Arbeitsjahr oder wurde Kalenderjahr vereinbart?

---

## 9. Ergänzung: Keine schriftlichen Arbeitsverträge (Stand 2026-10-08)

Mündliche Arbeitsverhältnisse sind wirksam – Urlaub gilt dann in gesetzlicher Mindesthöhe. Aber:

- **Nachweisgesetz:** AG muss die wesentlichen Bedingungen schriftlich bzw. seit 01.01.2025 in **Textform** (z. B. E-Mail/PDF,
  mit Empfangsbestätigung) aushändigen – Entgelt/Arbeitszeit ab 1. Arbeitstag, **Urlaub binnen 1 Monat**. Verstoß = Ordnungswidrigkeit (bis 2.000 €).
- **Arbeit auf Abruf (§ 12 TzBfG):** Ist keine wöchentliche Arbeitszeit vereinbart, gelten **20 h/Woche als vereinbart** →
  rechnerisch über der Minijob-Grenze → Risiko SV-Nachforderung bei Prüfung. Arbeitszeit (bzw. Monatsstunden/Minijob) unbedingt festhalten.

### Feature „Arbeitsbedingungen-Nachweis" (vor Phase 2)

- Aus `profiles` + `employment_terms` + `payroll_settings` je Assistentin ein **Nachweis-PDF** erzeugen (Pflichtangaben § 2 NachwG:
  Parteien, Beginn, Tätigkeit, Arbeitsort, Entgelt, Arbeitszeit/Abrufregelung, **Urlaub**, Kündigungsfristen, Hinweis Minijob/RV).
- Versand per Mail + Bestätigung in der App (`employment_terms.notice_sent_at`, `notice_confirmed_at`) → zugleich Nachweis für Bezirk/Prüfung.
- Bei Änderung von `employment_terms` neuen Nachweis anstoßen (Pflicht spätestens am Tag der Änderung).

---

## 10. Umsetzungsstand (2026-10-08)

**Gebaut (tsc + `next build` grün, `npm run test:vacation` 19/19):**

| Bereich | Dateien |
|---|---|
| Migration | `supabase/migrations-mt/0026_vacation.sql` (+ `down/`) – employment_terms, absences, leave_ledger, vacation_notices, View leave_balances, Settings-/Profilspalten, RLS, Composite-FKs |
| Rechenlogik | `src/lib/vacation.ts` (Anspruch inkl. Wartezeit/Zwölftel/Vertragswechsel, Feiertage BY/DE/AT, 13-Wochen-Entgelt, FIFO-Konto) · Tests `__tests__/vacation/` |
| Server | `src/lib/vacation-server.ts` (Laden, Anspruch buchen, Vorschau, Payroll-Zeilen), `src/lib/vacation-actions.ts` (Genehmigen/Ablehnen/Stornieren) |
| API | `/api/urlaub/{absences,absences/[id],preview,ledger,terms,settings,notices/[id],cron}` |
| UI | `/urlaub` (Assistentin), `/admin/urlaub` (Übersicht + Rückstellung, Person: Beschäftigung, Arbeitsbedingungen, Konto, Abgeltung; Einstellungen), Nav, Kalender (Abwesenheiten als Ganztags-Balken, Zuweisung blockiert) |
| Lohn | Urlaubsentgelt als Zeilen „Urlaub (Urlaubsentgelt)"/„Urlaubsabgeltung" in Monatsübersicht, Lohnzettel, Mail + Snapshot, Zeitraum-Auswertung; nicht im Tätigkeitsbericht |
| NachwG | `/payroll/nachweis/[assistantId]` – druckbarer Nachweis der Arbeitsbedingungen |
| Cron | `vercel.json` täglich 05:15 UTC `/api/urlaub/cron` (Anspruch, Hinweis, Verfall, Austritt) |

**Bewusst noch nicht drin:** Lohnfortzahlung Krankheit (Ausfallprinzip, U1-Erstattung) – Krankmeldung blockiert nur Dienste;
Migration `profiles.leave_*` → `absences`; Urlaubsjahr = Arbeitsjahr (AT); halbe Urlaubstage.

**Rollout:** 0026 einspielen → deployen → Einstellungen › Urlaub aktivieren → je Assistentin Eintritt + Arbeitsbedingungen
(Wochenstunden!) → Startsaldo 2026 buchen → Nachweis drucken/aushändigen.
