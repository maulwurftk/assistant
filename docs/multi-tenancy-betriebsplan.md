# Migrations-Betriebsplan: Multi-Tenant-Umbau

_Operative Leitplanke für die Umsetzung (via Fable). Zweck: **Prod bleibt bis zum bewussten Cutover
unangetastet.** Gebaut und getestet wird auf **Staging**, dann laufen die geprüften Skripte 1:1 auf Prod._
_Begleitdokumente: [Architektur](multi-tenancy-architektur.md) · [Roadmap](multi-tenancy-roadmap.md) ·
[Backup-Spec](backup-export-import-spec.md)._

---

## 0. Grundprinzipien (nicht verhandelbar)

1. **Die Env bestimmt das Ziel.** Fable führt SQL/Code gegen die DB aus, auf die
   `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` zeigen. **Während des Baus zeigen sie auf
   Staging.** Prod-Keys liegen so lange weg.
2. **Prod wird genau einmal angefasst:** im Cutover (§6), nach grünen Tests, mit Backup davor.
3. **Migrations sind nummerierte SQL-Dateien** (§1). Reihenfolge = einzige Wahrheit. Auf Prod läuft exakt
   das, was auf Staging grün war — kein Nachbauen von Hand.

---

## 1. Migrations-Konvention (heute festlegen)

Bisher: lose `supabase-migration-*.sql` im Repo-Root, manuell im SQL-Editor eingespielt, keine feste
Reihenfolge. Für den MT-Umbau eine **geordnete Serie** anlegen:

```
supabase/migrations-mt/
  0001_organizations.sql
  0002_tenant_id_columns_nullable.sql
  0003_current_tenant_fn.sql
  0004_platform_admins.sql
  0005_backfill_karas_org.sql          # Bestandsdaten → Karas (nur einmal, tenant-spezifisch)
  0006_constraints_notnull_fk.sql       # NOT NULL, FKs, Composite-Unique/FK, Uniqueness-Fixes
  0007_indexes_tenant.sql
  0008_rls_calendar_slots.sql           # BLAUPAUSE zuerst (eine Tabelle end-to-end)
  0009_rls_all_tables.sql               # nach Blaupause repliziert
  0010_provision_tenant_fn.sql          # Onboarding-RPC
  0011_import_backup_fn.sql             # Backup-RPC (aus Backup-Spec)
  ...
  down/                                  # Rollback-Gegenstücke (v.a. alte RLS-Policies wiederherstellen)
```

- **Jede Datei idempotent** (`drop policy if exists …`, `add column if not exists …`) — wie schon in
  `schema.sql` gepflegt.
- `0005_backfill_karas_org.sql` ist **prod-spezifisch** (echte Karas-Daten). Auf Staging stattdessen die
  synthetischen Test-Orgs (§3).
- Optional, aber empfohlen: `supabase init` + `supabase link`, dann `supabase db push` statt Copy-Paste in
  den SQL-Editor. Ohne das: Dateien in Reihenfolge in den SQL-Editor einspielen (erst Staging, dann Prod).

---

## 2. Staging aufsetzen (zweites Free-Projekt)

- [ ] Supabase-Dashboard → **neues Projekt** `assistenten-app-staging`, **Region EU**.
- [ ] **`supabase/schema.sql`** im SQL-Editor des Staging-Projekts ausführen → identischer Ausgangspunkt
      wie Prod (Single-Tenant-Baseline).
- [ ] **⚠️ ZUERST die Auth-User anlegen, DANN erst das Seed-SQL.** Unter **Authentication → Users** die drei
      Demo-User mit **„Auto Confirm"** anlegen: `demo-admin@example.com`, `demo-anna@example.com`,
      `demo-ben@example.com`. Grund: `profiles.id` ist ein FK auf `auth.users` — ohne die User bricht der
      Seed ab (bzw. der Header von `seed-demo.sql` beschreibt genau das).
- [ ] **Danach** `supabase/seed-demo.sql` ausführen (verknüpft sich per E-Mail mit den Auth-Usern, kein
      UUID-Kopieren nötig). **Keine echten Prod-Personendaten kopieren** (DSGVO).
- [ ] _Der **zweite** Test-Mandant für die Cross-Tenant-Isolation kommt erst in §4 — sobald `tenant_id`
      existiert. Jetzt gibt es die Spalte noch nicht, also hier noch **ein** Mandant (= die Demo-Daten)._
- [ ] Staging-Keys notieren (Settings → API): URL, anon key, service_role key.

## 3. Umgebungen: lokal + Vercel (Schutzschalter)

Reines Cloud-Setup — **Prod-Supabase _und_ Prod-Vercel bleiben unangetastet.** Die App läuft an *einer*
Stelle: **Vercel-Staging**. „Lokal" ist keine zweite Instanz, sondern nur, wo Fable im Terminal
`npm run build` / `npm test` ausführt (auf deinem Rechner).

### 🔒 PREFLIGHT — Pflicht-Gate, BEVOR Fable irgendetwas schreibt

> **Hintergrund (2026-07-04):** `.env.local` zeigte anfangs unbemerkt auf **Prod** (Ref
> `rqtwlqsfrjnzduzdjrhe`, `NEXT_PUBLIC_APP_URL=https://karas.pro`) — die Prod-Werte des ursprünglichen
> Setups waren nie ersetzt worden. Fable hat das erkannt und gestoppt, bevor etwas geschrieben wurde.
> Dieser Check macht das künftig unmöglich. **Staging-Ref = `yequvsxydshxuhytwrpm`, Prod-Ref =
> `rqtwlqsfrjnzduzdjrhe`.** Taucht die Prod-Ref oder `karas.pro` in `.env.local` auf → **STOPP**.

- [ ] **URL/App-URL:** `NEXT_PUBLIC_SUPABASE_URL` enthält die **Staging-Ref**, `NEXT_PUBLIC_APP_URL` ist
      `localhost`/Staging — **nicht** `karas.pro`:
      ```bash
      grep -E 'SUPABASE_URL|APP_URL' .env.local
      ```
- [ ] **Keys:** stammen aus dem **Staging**-Projekt (Settings → API Keys), Format `sb_publishable_…` /
      `sb_secret_…`. Auth-Check — der Key muss gegen **Staging** authentifizieren (HTTP 200), nicht 401:
      ```bash
      key=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)
      curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $key" \
        "https://yequvsxydshxuhytwrpm.supabase.co/rest/v1/"
      ```
      **200** = Key gehört zu Staging ✅ · **401** = falscher Key (evtl. Prod) → **STOPP, nicht weiterbauen.**
- [ ] Erst wenn beide Checks grün sind, darf Fable Migrationen/Code gegen die DB schreiben.

**Haupt-Testfläche: Staging-*Deployment* (Vercel).**
- [ ] **Separates Vercel-Projekt** `assistenten-app-staging` aus demselben Repo (eigener Staging-Branch,
      eigene Env-Vars) → Prod-Vercel bleibt unberührt. _Leichtere Alternative: Staging-Keys nur auf den
      **Preview**-Scope des bestehenden Projekts; dann fasst du aber Prod-Projekteinstellungen an._
- [ ] Loop: Fable ändert Code **auf `staging`** → Push → Vercel-Staging baut → auf Staging-URL testen.

**🔴 Branch-Strategie (Deploy-Isolation — Pflicht vor MT-Code):**
- `staging`-Branch = Fables Arbeitsbranch. **Staging**-Vercel-Projekt: _Production Branch_ = `staging`.
- `main` = Prod. **Prod**-Vercel-Projekt: _Production Branch_ = `main` (unverändert).
- Fable committet/pusht **nur auf `staging`**; `main` bleibt unberührt bis zum bewussten Merge/Cutover.
- **Warum kritisch:** Landet tenant-aware Code auf `main`, während die Prod-DB noch kein `tenant_id` hat,
  **bricht Prod**. Ein Ein-Branch-Setup (beide Vercel-Projekte bauen `main`) tut genau das — daher getrennte
  Branches. _(Status: `staging`-Branch existiert seit 2026-07-04; Vercel-Tracking noch zu setzen.)_
- [ ] **⚠️ Supabase-Auth-URLs (Staging-Projekt) → Authentication → URL Configuration:** **Site URL** +
      **Redirect-Allow-List** um die Staging-Vercel-URL ergänzen (+ `http://localhost:3000` **nur** falls du
      den optionalen lokalen Speed-up nutzt) — sonst brechen Login/Redirects ab, obwohl DB/Code stimmen.

**RLS-/Cross-Tenant-Tests:** Fable ruft `npm test` **gegen die Staging-DB** auf (im Session-Terminal, kein
laufender App-Server nötig — reine Node-Tests, die die DB prüfen).

**Optionaler Speed-up: lokales `next dev` gegen Staging.** Nur wenn dir der Push-→-Build-→-warten-Loop pro
Änderung zu langsam ist (frisst das Fable-Fenster). Dann `.env.local` = Staging-Keys, `next dev` **kann Fable
starten** — du musst nichts manuell lokal betreiben. Kein Muss.

### Env-Matrix (aus `.env.example` / `vercel.json`)

| Variable | Lokal (`.env.local`) | Staging-Deploy (Vercel) | Prod (unverändert) |
|----------|----------------------|--------------------------|--------------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | **Staging** | **Staging** | Prod |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | **stabile** Staging-Domain, z. B. `https://assistenten-app-staging.vercel.app` (ohne Slash, **nicht** eine Preview-Hash-URL) | Prod-URL |
| `RESEND_API_KEY` / `FROM_EMAIL` / `ADMIN_EMAIL` | **weglassen** (Var nicht anlegen) → kein Mailversand | **weglassen** → kein Mailversand | Prod |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Staging-Paar (oder **weglassen** → Push aus) | Staging-Paar (oder weglassen) | Prod |
| `CRON_SECRET` | eigenes | eigenes | Prod |
| `GOOGLE_CALENDAR_ICAL_URL` | optional (weglassen) | optional (weglassen) | Prod |

> **„Weglassen" heißt: die Env-Var gar nicht anlegen** (Vercel erlaubt keine leeren Werte). Der Code prüft
> überall auf Existenz (`if (process.env.RESEND_API_KEY)` …) und schaltet das Feature sonst ab. **Pflicht**
> auf Staging sind nur: die drei `…SUPABASE…`-Vars, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`.
> _Behoben:_ `api/payroll/send-email` instanziierte `new Resend(...)` beim Modul-Laden → das brach den
> Build („Collecting page data") ohne `RESEND_API_KEY`. Jetzt lazy im Handler + Guard (503 bei fehlender
> Config). `RESEND_*` kann daher auf Staging einfach **weggelassen** werden, kein Dummy nötig.

> **`RESEND_*` auf Staging weglassen** (Var nicht anlegen) — dann versendet das Test-System **keine echten
> E-Mails** an echte Leute (die App fällt laut `.env.example` sauber auf In-App/Push zurück). DSGVO + Nerven.
> **Crons:** laufen auf einem separaten Vercel-Prod-Deploy täglich gegen Staging — harmlos, weil `RESEND`
> leer ist; sonst die Routen zum Testen einfach manuell mit `Authorization: Bearer <CRON_SECRET>` aufrufen.
> **`NEXT_PUBLIC_*` (inkl. `_APP_URL`, `_VAPID_PUBLIC_KEY`) werden beim Build eingebacken** → nach dem
> Setzen/Ändern **neu deployen**, sonst greifen sie nicht. Und Staging-`APP_URL` muss = Supabase-Auth-Site-URL.

> Solange lokal + Staging-Deploy auf Staging-Keys zeigen, kann Fable auf **Prod** (weder DB noch Deploy)
> etwas verändern.

---

## 4. Bauen & Testen auf Staging

Reihenfolge nach [Architektur §6](multi-tenancy-architektur.md):

- [ ] `0001`–`0004` einspielen (organizations, tenant_id nullable, `current_tenant()`, platform_admins).
- [ ] Staging-Backfill: die zwei Test-Orgs auf die Testzeilen verteilen.
- [ ] `0006`–`0007` (Constraints, FKs, Uniqueness-Fixes, Indizes).
- [ ] **Blaupause `0008` (`calendar_slots`) end-to-end** inkl. Cross-Tenant-Test — erst wenn das sauber
      isoliert, `0009` auf die übrigen 10 Tabellen replizieren.
- [ ] `0010`/`0011` (Onboarding-RPC, Backup-RPC).
- [ ] App-Code tenant-fähig (Service-Role-Routen, Pages, Registrierung/Invite) — [Architektur §4/§5].
- [ ] **Cross-Tenant-Testsuite grün** ([Architektur §7]) als Gate: Read/Write/Delete-Isolation, Composite-FK,
      Cron-Gruppierung, Realtime, Onboarding-Doppelanlage. Merge/Deploy erst danach.
- [ ] Manuell: 2 Browser, 2 Admins, URL-/UUID-Manipulation → Zugriff verweigert.

---

## 5. Backups vor dem Cutover (Pflicht)

Direkt vor dem Prod-Cutover, **nichts** überspringen:

- [ ] **Voll-Dump Prod (public + auth)** lokal ziehen — das Master-Netz (enthält Logins):
      ```bash
      pg_dump "postgresql://postgres.<PROD_REF>:<PW>@aws-0-<REGION>.pooler.supabase.com:5432/postgres" \
        --schema=public --schema=auth -Fc -f prod-full-$(date +%Y%m%d-%H%M).dump
      ```
      (Connection-String: Dashboard → Settings → Database → **Session-Pooler** für IPv4.)
- [ ] **App-JSON-Export** über das Sicherungs-Feature ziehen (schnell lesbares Fachdaten-Netz).
- [ ] Beide Dateien an einen sicheren Ort (nicht ins Repo; enthalten Personendaten).

---

## 6. Cutover auf Prod (Wartungsfenster)

- [ ] Optional: kurze Wartungs-Info/Sperre (Karas-Instanz, geringe Stakes — kurzes Fenster reicht).
- [ ] Env **jetzt** auf **Prod** umstellen (bzw. Skripte im **Prod**-SQL-Editor einspielen).
- [ ] Migrations **in Reihenfolge** auf Prod anwenden — mit dem **prod-spezifischen** `0005_backfill_karas`
      (echte Karas-Org, alle Bestandszeilen → deren tenant_id) **vor** `0006` (NOT NULL) und **vor** dem
      RLS-Scharfschalten `0008/0009`.
- [ ] App-Deploy (tenant-fähiger Code) **gemeinsam** mit dem RLS-Schritt ausrollen — nie „neue RLS + alte
      App" oder umgekehrt live.
- [ ] **Smoke-Test Prod:** als Karas-Admin einloggen → eigene Daten vollständig sichtbar, Zeiten/Slots/
      Payroll funktionieren, keine „permission denied"-Fehler im Normalbetrieb.
- [ ] Prüfen: jede Zeile hat `tenant_id`; `select current_tenant()` liefert die Karas-Org.

---

## 7. Nach dem Cutover

- [ ] **Zweiten echten Mandanten** (Test-Arbeitgeber) anlegen → gegenseitige Unsichtbarkeit real
      verifizieren, bevor du fremde Tester einlädst.
- [ ] Superadmin-Fläche / Betriebssicht ([Architektur §1.6/§4.3]) nachziehen.
- [ ] Recht/DSGVO ([Roadmap Phase 6]) klären, bevor echte Fremddaten reinkommen.

## 8. Rollback

- **Klein (RLS-Fehler):** `down/`-Gegenstücke einspielen (alte Policies wiederherstellen / tenant-Spalten
  droppen) — schnell, ohne Voll-Restore.
- **Groß (Datenschaden):** letzter Ausweg = `prod-full-*.dump` per `pg_restore` in ein frisches Projekt
  zurückspielen, DNS/Keys umhängen. Deshalb ist §5 Pflicht.

---

## Reihenfolge in einem Satz

**Staging bauen → dort grün testen → Prod-Backup (full+auth & JSON) → geprüfte Skripte auf Prod (Backfill
vor NOT NULL vor RLS, App gemeinsam mit RLS) → Smoke-Test → zweiter Mandant → Fremd-Onboarding.**
