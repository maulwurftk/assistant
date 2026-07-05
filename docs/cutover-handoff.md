# Cutover-Handoff · assistenten-app (Multi-Tenant)

_Übergabe-Dokument für eine neue Sitzung. Stand: 2026-07-04, abends.
Referenzen: [Betriebsplan](multi-tenancy-betriebsplan.md) · [Architektur](multi-tenancy-architektur.md) ·
[Backup-Spec](backup-export-import-spec.md) · [Security-Scan](security-bug-scan-2026-07-04.md)._

---

## ⚠️ Zuerst lesen: aktueller Env-Zustand

`.env.local` zeigt **aktuell auf PROD** (`NEXT_PUBLIC_SUPABASE_URL=https://rqtwlqsfrjnzduzdjrhe.supabase.co`).

- Für **weitere Staging-Arbeiten** (z. B. `npm run test:rls`): erst zurück auf Staging
  (`yequvsxydshxuhytwrpm`) stellen, sonst laufen Tests/Migrationen gegen Prod.
- `db-migrate.mjs` und die Testsuite haben einen **Prod-Wächter** (Abbruch, wenn Nicht-Demo-Auth-User
  gefunden werden) — Prod wird also nicht versehentlich migriert. Der Wächter wird beim Cutover bewusst
  mit `--allow-prod` überbrückt.
- `SUPABASE_DB_URL` in `.env.local` prüfen: muss für den Cutover der **Prod**-Connection-String sein
  (Session-Pooler, IPv4). Aktuell unklar, ob gesetzt — vor dem Cutover verifizieren.

---

## Was fertig ist

**Code (Branch `staging`, HEAD `2217b00`, Vercel-Staging GRÜN):**
- Migrations-Serie `supabase/migrations-mt/` **0001–0012** inkl. `down/`-Gegenstücke,
  Staging-Variante `staging/0005_backfill_staging_orgs.sql` und Prod-Variante `0005_backfill_karas_org.sql`.
- RLS tenant-scoped auf allen 11 Fachtabellen; `current_tenant()`, `provision_tenant()`,
  `import_backup()`, `platform_admins`; `tenant_id default current_tenant()`.
- App-Code tenant-fähig: `src/lib/tenant.ts` (`resolveTenant`/`resolveTenantAdmin`), alle Service-Role-
  Routen gescoped, Crons pro `active`-Org gruppiert, Token-Endpunkte über Profil-Tenant.
- Registrierung: `/registrieren` + `/registrieren/abschliessen` (signUp → `provision_tenant`).
- Datensicherung: `src/lib/backup.ts`, Routen `api/admin/backup/export|import`, UI `admin/sicherung`.
- Security-Härtung (Scan `docs/security-bug-scan-2026-07-04.md`): M1–M4, L3, L6, L7 behoben.

**Datenbank:**
- **STAGING** (`yequvsxydshxuhytwrpm`): 0001–0012 eingespielt, Testsuite **56/56 grün**
  (`calendar-slots` 8 · `all-tables` 34 · `rpc` 11 · `backup` 3). Demo-Orgs: `demo-org-a` (Demo-Daten),
  `demo-org-b` (Test-User `test-*@example.com`, Passwort `Rls-Test-1234!` in `__tests__/…/shared.mjs`).
- **PROD** (`rqtwlqsfrjnzduzdjrhe`): **noch NICHT migriert** — unverändertes Single-Tenant-Schema.

---

## Offene Gates VOR dem Cutover (Betriebsplan §5 + §4)

Alle drei müssen erfüllt sein, sonst nicht cutovern:

1. **Prod-Backups gezogen (Pflicht, §5):**
   - Voll-Dump `public` + `auth` (enthält Logins):
     `PROD_DB_PW='<prod-db-passwort>' ./scripts/prod-backup.sh`
     → legt `~/supabasebackup/prod-full-<stamp>.dump` an (außerhalb Repo, ge-gitignored).
     Passwort: Supabase-Dashboard → Prod-Projekt → Settings → Database (Session-Pooler).
   - **App-JSON-Export** über das Sicherungs-Feature (oder Export-Route) — zusätzliches Fachdaten-Netz.
   - Beide Dateien an einen sicheren Ort, **nicht** ins Repo.
2. **Manueller 2-Browser-Staging-Test bestanden (§4):** siehe „Staging-Abnahme" unten. Noch offen.
3. **Prod-DB-Passwort / Connection-String** liegt vor (hat nur Thomas).

---

## Staging-Abnahme (falls noch nicht erfolgt)

Auf der grünen Staging-URL:
1. Login `demo-admin@example.com` (Passwort aus dem Staging-Setup, Vorschlag war `Demo1234!`).
   Hakt Login/Redirect → Staging-URL fehlt in Supabase → Authentication → URL Configuration.
2. Zwei Browser: demo-admin (Org A) vs. Inkognito `test-b-admin@example.com` / `Rls-Test-1234!` (Org B).
   In B darf **nichts** aus A sichtbar sein (auch nicht in Dropdowns/Benutzerlisten). A-Slot-UUID als B
   in die URL → Zugriff verweigert.
3. Registrierung über „Konto erstellen" → dritte, isolierte Org.
4. Admin → Datensicherung: Export ziehen, dieselbe Datei importieren → Vorschau „0 neu, alles aktualisiert".

---

## Cutover-Schritte (Betriebsplan §6, Wartungsfenster)

Reihenfolge strikt einhalten:

1. **Backups (Gate 1) ziehen** — falls noch nicht geschehen.
2. **Env auf Prod stellen:** `.env.local` → Prod-URL + Prod-Keys + Prod-`SUPABASE_DB_URL`
   (Session-Pooler). (Zeigt aktuell schon auf die Prod-URL — Keys/DB-URL verifizieren.)
3. **Migrations gegen Prod, mit Prod-`0005` und `--allow-prod`:**
   ```
   node scripts/db-migrate.mjs --allow-prod \
     supabase/migrations-mt/0001_organizations.sql \
     supabase/migrations-mt/0002_tenant_id_columns_nullable.sql \
     supabase/migrations-mt/0003_current_tenant_fn.sql \
     supabase/migrations-mt/0004_platform_admins.sql \
     supabase/migrations-mt/0005_backfill_karas_org.sql \
     supabase/migrations-mt/0006_constraints_notnull_fk.sql \
     supabase/migrations-mt/0007_indexes_tenant.sql \
     supabase/migrations-mt/0008_rls_calendar_slots.sql \
     supabase/migrations-mt/0009_rls_all_tables.sql \
     supabase/migrations-mt/0010_provision_tenant_fn.sql \
     supabase/migrations-mt/0011_import_backup_fn.sql \
     supabase/migrations-mt/0012_tenant_id_default.sql
   ```
   **KRITISCHE ORDNUNG** (in den Dateien bereits so): Backfill `0005` **vor** NOT NULL `0006`
   **vor** RLS `0008/0009`. Sonst sperrt strikte RLS die noch-`tenant_id`-losen Bestandszeilen aus.
   `0005_backfill_karas_org.sql` legt Org „Karas" (slug `karas`) an und hängt alle Bestandszeilen dran;
   die Datei bricht ab, falls Staging-Demo-Orgs gefunden werden (Schutz gegen Falschlauf).
4. **App-Deploy Prod:** tenant-fähigen Code (Branch `staging`, Commit `2217b00`) auf **Prod-Vercel**
   ausrollen — **gemeinsam** mit dem RLS-Schritt. Nie „neue RLS + alte App" oder umgekehrt live.
   (Prod-Vercel-Env-Vars entsprechend: Prod-Supabase-Keys, Prod-APP_URL.)
5. **Smoke-Test Prod:** als Karas-Admin `tk.private@gmail.com` einloggen → alle eigenen Daten sichtbar,
   Zeiten/Slots/Payroll funktionieren, keine „permission denied" im Normalbetrieb.
6. **DB-Checks Prod:** jede Zeile hat `tenant_id`; `select current_tenant()` liefert die Karas-Org-ID.

---

## Nach dem Cutover (§7)

- **Zweiten echten Test-Mandanten** anlegen → gegenseitige Unsichtbarkeit real verifizieren, bevor
  fremde Tester eingeladen werden.
- Superadmin-/Betriebssicht (Architektur §1.6/§4.3) nachziehen.
- **Vor echten Fremddaten:** DSGVO (AVV, Löschkonzept, EU-Region) **und** die offenen Scan-Punkte,
  v. a. **D1: Rate-Limiting + Invite-Gating** an `/login`, `/registrieren`, `/api/slot-request`.
- Weitere offene Scan-Punkte: L1 (xlsx-Advisory, geringe Exposure), L4/L5, D2/D3 — siehe Scan-Doc.

## Rollback (§8)

- **Klein (RLS-Fehler):** `supabase/migrations-mt/down/`-Gegenstücke in umgekehrter Reihenfolge einspielen.
- **Groß (Datenschaden):** `prod-full-<stamp>.dump` per `pg_restore` in frisches Projekt, Keys/DNS umhängen.
  Deshalb ist Gate 1 Pflicht.

---

## Fallen / Lessons (nicht erneut hineinlaufen)

- **NIE `npm audit fix --force`** — stuft Next.js auf 9.3.3 herunter (App-brechend). Passiert am
  2026-07-04, per `git checkout HEAD -- package.json package-lock.json` + `npm install` behoben.
  Plain `npm audit fix` (ohne force) ist ok.
- **Route-Dateien** (`app/**/route.ts`) dürfen NUR HTTP-Handler (`GET/POST/…`) + Segment-Config
  (`dynamic`, `revalidate`, `runtime`, …) exportieren — kein Re-Export von Konstanten/Typen
  (brach den Build nach Entfernen von `ignoreBuildErrors`).
- **PostgREST-Embeds auf `profiles`** brauchen wegen der Composite-FKs (0006) einen Spalten-Hint:
  `profiles!assistant_id(...)` statt `profiles(...)` — sonst PGRST201 (mehrdeutig).
- **Sandbox-Mount hinkt** manchmal hinter Windows-Schreibvorgängen her; bei Konflikten Datei nur von
  EINER Seite schreiben. `node datei.mjs` statt `node --test` (letzteres hing). Git-Schreibops im Mount
  meiden; `.git/index.lock` ggf. entfernen. Lange Läufe via Desktop Commander auf dem echten Rechner.
- **GoTrue** lehnt `@example.com` bei Self-Signup ab (Admin-API nicht) — für Browser-Registrierungstests
  echte E-Mail nötig.

---

## Verifikations-Kurzbefehle

```
npx tsc --noEmit          # Typen (muss grün sein — ignoreBuildErrors ist entfernt)
npm run build             # Vercel-äquivalent
npm run test:rls          # 56 Cross-Tenant-Tests (NUR gegen Staging laufen lassen!)
```
