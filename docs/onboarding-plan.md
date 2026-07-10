# Onboarding-Wizard nach Erstregistrierung — Umsetzungsplan

Stand: 2026-07-09 · Status: geplant, noch nicht begonnen

## Ziel

Nach Registrierung per Einladungscode (`/registrieren` → `provision_tenant`,
0013) landet der Arbeitgeber aktuell direkt im leeren `/dashboard`. Name,
Assistenzkräfte, Minijob-Modus und Budget werden bisher **nicht** abgefragt —
sie müssen der Admin selbst über verstreute Seiten (`/admin/benutzer`,
`/payroll/settings`) nachtragen, was leicht vergessen wird.

Neu: ein **Pflicht-Wizard** `/onboarding`, der direkt nach erfolgreicher
Provisionierung erzwungen wird und in einem Rutsch abfragt:

1. Eigener Name (Admin)
2. Assistenzkräfte anlegen (mit echten Logins)
3. Minijob-Modus ja/nein
4. Budget (inkl. Rücklage/Puffer)
5. Tätigkeiten auswählen

Erst nach Abschluss ist `/dashboard` & Co. erreichbar — analog zum
bestehenden Zombie-Schutz-Redirect (`/registrieren/abschliessen` bei
fehlendem Profil, siehe `(main)/layout.tsx`).

**Nicht enthalten** (separat, später): Editierbarkeit einzelner
Onboarding-Antworten im Nachhinein (dafür existieren bereits
`/admin/benutzer` und `/payroll/settings`), E-Mail-Einladungen statt
Admin-vergebener Passwörter für Assistenzkräfte, Aufgabenvorlagen
(`todo_templates`, `/admin/aufgaben` → Tab „Vorlagen") — das ist ein
separates Konzept (titel-/turnusbasierte Aufgaben statt einfacher
Tätigkeits-Kategorien) und bleibt bewusst außen vor, um den Wizard schlank
zu halten.

---

## 1 · Datenmodell: Abschluss-Flag

Neue Spalte, damit der Guard zuverlässig weiß, ob der Wizard durchlaufen
wurde (nicht über "hat mind. 1 Assistenzkraft" o. ä. raten):

```sql
-- Migration 0016_onboarding_flag.sql
alter table public.organizations
  add column onboarding_completed_at timestamptz null;

alter table public.payroll_settings
  add column reserve_months numeric not null default 2;
```

`reserve_months` ist neu und bildet den bisher nur clientseitig in
`localStorage` gehaltenen Wert aus dem Rücklagen-Rechner
(`RuecklagenRechner.tsx`, Feld „Rücklage in Monaten Budget", Default `2`)
persistent pro Tenant ab (Details siehe Schritt 4 unten).

- `null` (bei `organizations.onboarding_completed_at`) → Wizard ausstehen, Guard greift.
- gesetzt beim letzten Wizard-Schritt (Server-Aktion, `security definer` oder
  über bestehenden `resolveTenantAdmin()`-Pattern wie in
  `/api/admin/create-user`).
- Down-Migration: Spalte droppen (Standardmuster, siehe `migrations-mt/down/`).

`payroll_settings` hat laut `database.ts` bereits sinnvolle Defaults
(`hourly_rate`, `monthly_budget: 1310`, `minijob_mode: false` …) — prüfen,
ob `provision_tenant` schon eine Default-Zeile pro Tenant anlegt. Falls ja,
macht der Wizard nur `UPDATE` statt `INSERT`; falls nein, wird das in
Schritt 3/4 des Wizards nachgeholt (`upsert`).

## 2 · Redirect-Guard

In `src/app/(main)/layout.tsx` (dort sitzt bereits der Zombie-Schutz für
fehlendes Profil) zusätzliche Prüfung ergänzen:

```
kein Profil            → /registrieren/abschliessen   (bestehend)
Profil, aber Org.onboarding_completed_at = null → /onboarding   (neu)
sonst                   → normaler Seitenaufruf
```

`/onboarding` selbst muss den umgekehrten Guard bekommen: bereits
abgeschlossen → redirect `/dashboard` (Refresh-Schutz, analog zu
`current_tenant()`-Check in `registrieren/abschliessen/page.tsx`).

## 3 · Route `/onboarding` — Wizard-Grundgerüst

Client Component mit lokalem Step-State (kein Zwischenspeichern in der DB
zwischen Schritten nötig, außer bei Verlassen/Reload — siehe Risiken unten).
UI-Bausteine aus dem bestehenden Kit wiederverwenden (`Card`, `Input`,
`Button`, `Progress`-Anzeige à la 1/4 · 2/4 · 3/4 · 4/4).

### Schritt 1 — Eigener Name

- Feld "Ihr Name" (Vorbelegung: `profiles.full_name`, das bei
  `provision_tenant` evtl. nur aus der E-Mail generiert wurde).
- Speichern: `UPDATE profiles SET full_name = ... WHERE id = auth.uid()`.

### Schritt 2 — Assistenzkräfte anlegen

- Wiederholbares Formular: Name + E-Mail (+ Passwort, vom Admin vergeben,
  wie im bestehenden `/admin/benutzer`-Dialog) pro Assistenzkraft.
- "+ Weitere Assistenzkraft hinzufügen" / einzelne Zeile entfernen.
- Mindestens **0** Einträge erlaubt (falls der Admin allein startet und
  später über `/admin/benutzer` nachträgt) — aber deutlicher Hinweis, dass
  das jederzeit dort nachholbar ist.
- Technisch: pro Zeile ein Call auf die **bestehende** Route
  `/api/admin/create-user` (siehe `src/app/api/admin/create-user/route.ts`)
  — kein Duplikat der Logik, nur ein anderer Aufrufkontext. Response-Fehler
  pro Zeile inline anzeigen (z. B. E-Mail bereits vergeben), Rest der Liste
  bleibt bestehen.

### Schritt 3 — Minijob-Modus

- Toggle "Minijob-konforme Abrechnung aktivieren?" (ja/nein) →
  `payroll_settings.minijob_mode`.
- Bei "ja": kurzer Hinweis-Text (UV-Umlage, Pauschsteuer etc. sind mit
  Standardwerten vorbelegt und später unter `/payroll/settings` feinjustierbar
  — im Wizard **keine** 7 Beitragssatz-Felder abfragen, das überfordert den
  Einstieg).

### Schritt 4 — Budget

- Felder: Stundensatz (`hourly_rate`), monatliches Budget
  (`monthly_budget`), optional Ziel-Wochenstunden (`weekly_hours_target`).
- **Neu — Rücklage/Puffer:** Feld „Rücklage in Monatsbudgets" (`reserve_months`,
  Default `2`, wie im bestehenden Rücklagen-Rechner) mit Kurzerklärung:
  „Wie viele Monatsbudgets sollen als Puffer auf dem Konto bleiben, bevor
  Geld zurücküberwiesen wird?" — bildet ab, wie viel Reserve das Budget
  vorhalten darf.
- Upsert in `payroll_settings`.

**Folgeänderung außerhalb des Wizards:** `RuecklagenRechner.tsx` liest
`budgetMonths` aktuell nur aus `localStorage` (Default `'2'`, siehe Zeile
20/25). Sollte auf `payroll_settings.reserve_months` als Startwert
umgestellt werden (localStorage danach nur noch als Session-Override),
sonst läuft der im Onboarding gepflegte Wert an dieser Stelle ins Leere.

### Schritt 5 — Tätigkeiten auswählen

- Angelehnt an `/admin/taetigkeiten` (Tabelle `activities`: nur `name` +
  `sort_order`, mandantenweit genutzt in Zeiterfassung und Aufgaben).
- Vorschlagsliste mit gängigen Tätigkeiten als ankreuzbare Chips/Checkboxen
  (z. B. Haushalt, Einkaufen, Behördengänge, Freizeitbegleitung, Pflege,
  Fahrdienst, Dokumentation) — vorbelegt/„zur Auswahl gestellt", damit der
  Admin nicht bei null anfängt.
- Freitextfeld „+ eigene Tätigkeit hinzufügen" für individuelle Einträge.
- Mindestens 1 Auswahl sinnvoll, aber nicht hart erzwingen (leere Liste ist
  über `/admin/taetigkeiten` jederzeit nachpflegbar).
- Speichern: Bulk-`insert` der ausgewählten/eingegebenen Namen in
  `activities` (tenant-scoped, `sort_order` fortlaufend).
- Abschluss-Button setzt `organizations.onboarding_completed_at = now()` und
  routet nach `/dashboard`.

## 4 · Server-Aktionen

Statt vieler kleiner Client-Supabase-Calls: eine gebündelte
API-Route `/api/onboarding/complete` (Muster wie `create-user/route.ts`,
`resolveTenantAdmin()`), die in einer Transaktion:

1. `profiles.full_name` aktualisiert,
2. `payroll_settings` upsertet (minijob_mode, hourly_rate, monthly_budget,
   weekly_hours_target, reserve_months),
3. ausgewählte Tätigkeiten aus Schritt 5 in `activities` einfügt,
4. `organizations.onboarding_completed_at` setzt.

Assistenzkräfte-Anlage (Schritt 2) bleibt einzeln über
`/api/admin/create-user`, da dort schon Fehlerbehandlung pro Person
existiert und ein Teil-Fehlschlag (eine von drei E-Mails ungültig) nicht
den ganzen Wizard blockieren soll.

## 5 · Risiken / offene Punkte

- **Abbruch mittendrin** (Tab schließen nach Schritt 2): Da
  `onboarding_completed_at` erst am Ende gesetzt wird, greift der Guard beim
  nächsten Login wieder und der Admin landet erneut in Schritt 1 — bereits
  angelegte Assistenzkräfte bleiben aber bestehen (Schritt 2 ist idempotent
  wiederholbar, ggf. Vorbefüllung mit bereits angelegten Kräften ergänzen,
  damit sie nicht doppelt angelegt werden).
- **Superadmin-Testkonten**: `/onboarding` darf `platform_admins` nicht
  betreffen — Guard nur für normale Tenant-Admins mit fehlendem
  `onboarding_completed_at` greifen lassen.
- **Bestehender Mandant (Org Karas)**: Migration muss
  `onboarding_completed_at` für alle **existierenden** Orgs beim Rollout auf
  `now()` vorbelegen (`update organizations set onboarding_completed_at = now()`),
  sonst wird der Bestandskunde beim nächsten Login unerwartet in den Wizard
  geschickt.
- **Rolle "assistant" vs. weitere Admins**: Schritt 2 sollte nur Assistenzkräfte
  anlegen (role fest `assistant`), keine Rollenwahl — Rollenwahl bleibt
  `/admin/benutzer` vorbehalten, um den Wizard schlank zu halten.
- **Bestandsmandant & `reserve_months`**: Backfill setzt für Org Karas den
  Default `2` (entspricht dem bisherigen `localStorage`-Default) — kein
  Verhaltenssprung für den laufenden Betrieb.
- **Doppelte Tätigkeiten**: Wenn ein Admin im Wizard einen Namen wählt, der
  (z. B. durch Mehrfach-Klick auf „Weiter") schon existiert, `insert` mit
  `on conflict (tenant_id, name) do nothing` absichern — dafür ggf. Unique
  Constraint auf `activities (tenant_id, name)` ergänzen, falls noch nicht
  vorhanden (prüfen).

## 6 · Umsetzungsreihenfolge

1. Migration 0016 (`onboarding_completed_at`, `reserve_months` + Backfill
   Bestandsmandant)
2. `/api/onboarding/complete` Route
3. `/onboarding`-Seite (5 Schritte, State, Progress)
4. Guard in `(main)/layout.tsx` + Rück-Guard in `/onboarding` selbst
5. `RuecklagenRechner.tsx` auf `payroll_settings.reserve_months` als
   Startwert umstellen
6. Manueller Testlauf: neue Test-Org per Einladungscode registrieren,
   kompletten Wizard durchlaufen, Abbruch-Fall (Reload nach Schritt 2) prüfen,
   danach `/admin/benutzer`, `/payroll/settings` und `/admin/taetigkeiten`
   gegenprüfen, dass Werte angekommen sind.
