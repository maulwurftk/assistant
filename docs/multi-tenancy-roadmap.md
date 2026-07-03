# Fahrplan: Multi-Tenant-SaaS (Weg B)

_Konkreter Umbaupfad von der jetzigen Single-Tenant-App zu einer Instanz, in der mehrere
Arbeitgeber (Mandanten) vollständig getrennt arbeiten. Reihenfolge ist bewusst gewählt –
jede Phase baut auf der vorherigen auf._

## Leitprinzip

Ein Mandant = eine `organization`. **Jede** fachliche Zeile bekommt eine `tenant_id`.
Die Trennung wird auf **zwei** Ebenen erzwungen:
1. **RLS** (Datenbank) – die harte Grenze, gilt auch bei Programmierfehlern.
2. **App-Code** – v.a. die Service-Role-Routen, die RLS umgehen, müssen `tenant_id` selbst setzen/prüfen.

Der häufigste Multi-Tenant-Bug ist eine vergessene Filterung → Datenleck über Mandanten hinweg.
Deshalb: RLS als Default-Deny, App-Code als zweite Schicht, plus automatisierte Cross-Tenant-Tests.

---

## Phase 0 — Entscheidungen (vor dem Code)

- **Rollenmodell:** `superadmin` (du, plattformweit) · `admin` (nur eigener Mandant) · `assistant`.
- **Onboarding-Modell:** Selbstregistrierung mit Bestätigung, oder Mandanten nur von dir angelegt?
- **Abrechnung/Limits:** kostenlos zum Testen, später Plan/Seats? (beeinflusst `organizations`-Felder)
- **Datenresidenz:** Supabase-Region EU (DSGVO).

## Phase 1 — Datenmodell

- Neue Tabelle **`organizations`**: `id, name, slug, created_at, status, plan`.
- **`tenant_id uuid not null references organizations(id)`** auf allen fachlichen Tabellen:
  `profiles, activities, time_entries, calendar_slots, monthly_reports, notifications,
  payroll_settings, payroll_runs, account_ledger, push_subscriptions, unavailability`.
- **`payroll_settings` wird pro Mandant** (heute genau eine globale Zeile). Alle Stellen mit
  `.limit(1).single()` müssen künftig `.eq('tenant_id', …).single()` verwenden.
- Index auf `tenant_id` je Tabelle (Performance, da jede Query danach filtert).
- Helper-Funktion in SQL:
  ```sql
  create or replace function public.current_tenant() returns uuid
    language sql stable security definer as $$
      select tenant_id from public.profiles where id = auth.uid()
    $$;
  ```

## Phase 2 — RLS neu (die kritische Phase)

- Jede Policy zusätzlich `tenant_id = public.current_tenant()` prüfen (USING **und** WITH CHECK).
- Muster pro Tabelle:
  ```sql
  create policy tenant_rw on public.time_entries for all
    using (tenant_id = public.current_tenant())
    with check (tenant_id = public.current_tenant());
  ```
- Feinere Rollen obendrauf (Assistent nur Eigenes) bleiben, aber **immer** zusätzlich tenant-gefiltert.
- `organizations`: nur eigener Mandant lesbar; `superadmin` sieht alle (separate Policy).
- **Testpflicht:** für jede Tabelle ein Test „User aus Tenant A darf Zeile aus Tenant B nicht
  lesen/schreiben/löschen" – muss scheitern.

## Phase 3 — Auth & Onboarding

- Registrierung: legt `organization` + ersten `admin` (mit `tenant_id`) transaktional an.
- Einladungs-Flow: Admin lädt Assistenten in **seinen** Mandanten ein (Token-Mail).
- `profiles.tenant_id` wird beim Anlegen gesetzt und ist unveränderlich.
- Session → Tenant-Auflösung über `current_tenant()`.

## Phase 4 — App-Code tenant-fähig machen

- **Service-Role-Routen** (umgehen RLS!) müssen `tenant_id` manuell erzwingen. Betroffen in dieser App:
  `api/admin/create-user, api/payroll/konto(+[id]), api/payroll/send-email, api/payroll/settings,
  api/notify-admin, api/remind-open-slots, api/send-monthly-reminders, api/slot-request,
  api/ha/status, api/calendar.ics`.
  → Jede muss den Tenant des Aufrufers ermitteln und **alle** Queries/Inserts darauf einschränken.
- **Token-Endpunkte** (`ha/status`, `calendar.ics`): Token bleibt pro Profil, Query zusätzlich
  tenant-scopen. Optional Token um Tenant erweitern.
- **Cron-Routen** (`remind-open-slots`, `send-monthly-reminders`): laufen über **alle** Mandanten,
  müssen aber pro Mandant korrekt gruppieren (nicht global mischen).
- Alle Server-Komponenten/Seiten: `payroll_settings`-Abfragen tenant-scopen.

## Phase 5 — Superadmin & Betriebssicht

- Plattform-Übersicht: Mandanten, Nutzerzahl, Status.
- Mandant sperren/löschen (inkl. Datenlöschung → DSGVO).
- Zentrale Pflege der Minijob-Sätze als Default (Mandant kann überschreiben – gibt es schon).

## Phase 6 — Recht & Betrieb (parallel, extern)

- **DSGVO:** AVV-Muster, Datenschutzerklärung, Verzeichnis von Verarbeitungstätigkeiten,
  Löschkonzept, TOMs. Du wirst Auftragsverarbeiter fremder Beschäftigtendaten.
- **StBerG:** Disclaimer (vorhanden) reicht als Basis; bei „echtem" Angebot anwaltlich prüfen.
- **Auth-Härtung:** MFA für Admins, Rate-Limiting, Audit-Log (wer hat was geändert).
- **Backups/Monitoring/Support-Prozess.**

## Phase 7 — Migration der Bestandsdaten

- Eine `organization` „Karas" anlegen, alle bestehenden Zeilen mit deren `tenant_id` versehen
  (ein einmaliges `UPDATE ... SET tenant_id = <karas>`), dann `tenant_id NOT NULL` erzwingen.
- Reihenfolge: Spalte nullable hinzufügen → befüllen → NOT NULL + FK → RLS scharf schalten.

## Phase 8 — Testing & Rollout

- Cross-Tenant-RLS-Testsuite (automatisiert) als Merge-Gate.
- Zwei Test-Mandanten parallel betreiben, gegenseitige Unsichtbarkeit verifizieren.
- Erst danach echte Tester einladen.

---

## Grober Aufwand & Risiko

| Phase | Größe | Hauptrisiko |
|-------|-------|-------------|
| 1 Datenmodell | mittel | Migration der Bestandsdaten |
| 2 RLS | **groß** | vergessene Policy → Datenleck |
| 3 Auth/Onboarding | mittel–groß | Tenant-Zuordnung bei Registrierung |
| 4 App-Code | mittel | Service-Role-Routen übersehen |
| 5 Superadmin | mittel | — |
| 6 Recht/DSGVO | extern, laufend | Verantwortung als Auftragsverarbeiter |
| 7 Migration | klein | Reihenfolge |
| 8 Testing | mittel | Vollständigkeit der Cross-Tenant-Tests |

**Summe: Wochen, nicht Tage** – plus dauerhafte Betriebs-/Rechtsverantwortung.

## Empfohlener Startpunkt

Phase 1 + 2 an **einer** Tabelle (z.B. `calendar_slots`) end-to-end durchziehen – inkl.
Cross-Tenant-Test – als Blaupause. Läuft das sauber, wird es auf alle Tabellen repliziert.
So fällt ein Denkfehler früh auf, bevor er in 11 Tabellen steckt.
