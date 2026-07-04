# Security- & Bug-Scan · assistenten-app

_Stand: 2026-07-04, nach dem Multi-Tenant-Umbau (Commit de19c24, Branch `staging`).
Scan durch Fable 5 über den gesamten `src`-Baum, die Migrations-Serie `supabase/migrations-mt`
und `npm audit`. Bewertung im Kontext: Single-Betrieb (Karas) heute, Fremd-Mandanten erst nach
DSGVO-Freigabe. Schweregrade: 🔴 hoch · 🟠 mittel · 🟡 niedrig · ⚪ Info/Design._

> **Nachtrag (2026-07-04, Umsetzung):** Behoben in dieser Runde — **M1, M2, M3, M4, L3, L6, L7**
> (siehe ✅-Markierungen unten). Offen bewusst belassen: L1 (xlsx, geringe Exposure), L4, L5,
> D1–D3. `npm audit fix` (ohne `--force`) für L2 ausgeführt.
> ⚠️ **Wichtig:** `npm audit fix --force` hatte Next.js auf 9.3.3 heruntergestuft (App-brechend) —
> per `git checkout HEAD -- package.json package-lock.json` + `npm install` zurückgesetzt. Für die
> transitiven Advisories **niemals `--force`** verwenden.

Positiv vorab: Die zentrale Tenant-Isolation (RLS `tenant_id = current_tenant()` mit `USING`+`WITH CHECK`,
Composite-FKs, `force row level security`) ist durch die Testsuite (56 Tests) abgedeckt und war im Scan
nicht zu umgehen. Die Service-Role-Routen sind seit dem heutigen Sweep durchgängig tenant-gescoped.
Die folgenden Punkte sind das, was darüber hinaus auffällt.

---

## 🟠 Mittel

### ✅ M1 · `ignoreBuildErrors: true` versteckt Typfehler im Deploy — BEHOBEN
**Ort:** `next.config.ts` (`typescript.ignoreBuildErrors: true`)
**Problem:** Der Vercel-Build ignoriert TypeScript-Fehler. Genau diese Klasse hat heute 12 echte Fehler
verdeckt (fehlende `tenant_id`-Spalten, Null-Typen), die sonst live gegangen wären. Solange die Flag steht,
kann jede künftige Typ-Regression unbemerkt deployen.
**Lösung:** Jetzt entfernen — `tsc --noEmit` ist grün. Danach:
```ts
// next.config.ts — den typescript-Block ersatzlos streichen
```
und `npm run build` bzw. Vercel als echtes Gate nutzen. Optional einen `typecheck`-Schritt
(`tsc --noEmit`) in die CI/den Pre-Push hängen.

### ✅ M2 · Offene Weiterleitung über `next`-Parameter im Auth-Callback — BEHOBEN
**Ort:** `src/app/auth/callback/route.ts` und `src/app/api/auth/callback/route.ts`
**Problem:** `const next = searchParams.get('next') ?? '/…'` wird ungeprüft in
`NextResponse.redirect(\`${origin}${next}\`)` verwendet. Werte wie `next=//evil.example` oder
`next=/\evil.example` können — je nach Browser-Normalisierung — zu einer fremden Origin führen
(Open-Redirect, Phishing-Baustein). Der `origin`-Präfix schützt nicht zuverlässig gegen `//`-Formen.
**Lösung:** Nur interne, absolute Pfade zulassen:
```ts
const raw = searchParams.get('next') ?? '/dashboard'
const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
```

### ✅ M3 · `assistant-settings` ohne Tenant-Scope + stiller 0-Zeilen-Erfolg — BEHOBEN
**Ort:** `src/app/api/payroll/assistant-settings/route.ts`
**Problem:** Die Route aktualisiert `profiles` per `assistantId` aus dem Body, ohne Tenant-Filter und ohne
zu prüfen, ob überhaupt eine Zeile getroffen wurde. Cross-Tenant-Schreiben wird zwar durch die RLS-Policy
`p_admin_update` (verlangt `tenant_id = current_tenant()`) hart verhindert — der Angriff scheitert also —
aber die Route meldet in dem Fall trotzdem `{ ok: true }`, obwohl 0 Zeilen geändert wurden (irreführend,
und die einzige Verteidigung ist RLS statt Defense-in-Depth). Es ist die letzte Route, die den alten
`getUser()`+`role`-Pattern statt `resolveTenantAdmin()` nutzt.
**Lösung:** Auf den Helper umstellen und explizit scopen:
```ts
import { resolveTenantAdmin } from '@/lib/tenant'
const ctx = await resolveTenantAdmin()
if (!ctx) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })
// …
const { data, error } = await supabase
  .from('profiles').update(updatePayload)
  .eq('id', assistantId).eq('tenant_id', ctx.tenantId).select('id')
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
if (!data?.length) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
```

### ✅ M4 · HTML-Injection in ausgehende E-Mails über Benutzernamen — BEHOBEN
**Ort:** `src/app/api/notify-admin/route.ts`, `src/app/api/slot-request/route.ts`,
`src/app/api/remind-open-slots/route.ts`, `src/app/api/payroll/send-email/route.ts`
**Problem:** Benutzergesteuerte Strings (`full_name`, Slot-`title`, `description`) werden roh in die
HTML-Mails interpoliert (`<p>${assistant.full_name}…`). Ein Assistent, der seinen Namen/Slot-Titel mit
HTML/Markup füllt, kann Inhalt in die an den Admin gehende Mail einschleusen (Link-Spoofing, kaputtes
Layout). Kein Server-Kompromiss, aber Phishing-Fläche — und relevanter, sobald fremde Mandanten dazukommen.
**Lösung:** Interpolierte Nutzerwerte escapen. Kleiner Helper in `src/lib`:
```ts
export const escapeHtml = (s: string) =>
  s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
```
und alle `${…full_name}` / `${…title}` / `${…description}` in den Mail-Templates durch
`${escapeHtml(...)}` ersetzen. (Die iCal-Route escaped bereits korrekt via `escapeIcal`.)

---

## 🟡 Niedrig

### L1 · `xlsx` (SheetJS): High-Advisories ohne npm-Fix
**Ort:** `package.json` → `xlsx@^0.18.5`; genutzt für Berichts-Export.
**Problem:** `npm audit` meldet Prototype Pollution (GHSA-4r6h-8v6p-xvw6) und ReDoS (GHSA-5pgg-2g8v-p4x9)
ohne verfügbaren npm-Fix. **Exposure gering:** Die App *schreibt* nur XLSX aus eigenen DB-Daten und *parst
keine* hochgeladenen XLSX — der ReDoS/Pollution-Pfad über Fremd-Input ist nicht erreichbar.
**Lösung:** Kein Notfall. Sauber wäre der Umstieg auf die von SheetJS gepflegte Version außerhalb npm
(`https://cdn.sheetjs.com/…`) oder auf `exceljs`. Bis dahin: sicherstellen, dass nie
nutzer-hochgeladene Tabellen durch `xlsx` gelesen werden (aktuell erfüllt).

### L2 · Behebbare transitive Advisories (`qs`, `postcss`, `js-yaml`, `@babel/core`, `hono`)
**Ort:** Transitive Abhängigkeiten (Build-/Tooling-Kette von Next.js).
**Problem:** Überwiegend moderate DoS/XSS-in-Tooling. `qs` hat einen sauberen Fix.
**Lösung:** `npm audit fix` (nicht `--force` — das würde laut Audit `next@9.3.3` erzwingen, ein
massiver Downgrade). Danach `npm run build` + `npm run test:rls` gegenprüfen. `hono`/`@babel/core`
stecken in der Next-Toolchain und verschwinden mit dem nächsten Next-Patch.

### ✅ L3 · Fehlende Eingabevalidierung in `unavailability` POST — BEHOBEN
**Ort:** `src/app/api/unavailability/route.ts`
**Problem:** `day_of_week` wird nicht auf 0–6 geprüft, Zeiten nicht auf `start < end`. Ungültige Werte
laufen in die DB-Check-Constraint und kommen als 500 zurück (statt sauberem 400).
**Lösung:** Vor dem Insert validieren:
```ts
if (type === 'recurring' && (day_of_week < 0 || day_of_week > 6))
  return NextResponse.json({ error: 'Ungültiger Wochentag' }, { status: 400 })
if (!all_day && start_time && end_time && start_time >= end_time)
  return NextResponse.json({ error: 'Endzeit muss nach Startzeit liegen' }, { status: 400 })
```

### L4 · `CRON_SECRET`-Vergleich nicht konstant-zeitig
**Ort:** `src/app/api/remind-open-slots/route.ts`, `src/app/api/send-monthly-reminders/route.ts`
**Problem:** `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` ist ein früh abbrechender Vergleich —
theoretisch Timing-Seitenkanal. In der Praxis über HTTP/Vercel kaum ausnutzbar.
**Lösungः** Optional `crypto.timingSafeEqual` auf gleich lange Buffer. Niedrige Priorität.

### L5 · Token in der Query-URL (`calendar.ics`, `ha/status`)
**Ort:** `src/app/api/calendar.ics/route.ts`, `src/app/api/ha/status/route.ts`
**Problem:** `?token=…` landet potenziell in Server-/Proxy-Logs und Referrern. Für iCal-Feeds ist das der
übliche Kompromiss (Kalender-Clients können keine Header setzen), und der Token ist pro Profil rotierbar
(`/api/ical-token` POST).
**Lösung:** So belassen; als Restrisiko dokumentiert. Bei Verdacht auf Leak: Token rotieren.

### ✅ L6 · Verbleibende `as any`-Typlöcher — TEILWEISE BEHOBEN (`weekly_template` typisiert)
**Ort:** `src/app/api/ical-token/route.ts` (`(profile as any).ical_token`), Reste in
`payroll/*`-Routen (`settings as any`, `weekly_template`).
**Problem:** `ical_token` ist inzwischen typisiert; die Casts umgehen die Typprüfung unnötig. `weekly_template`
existiert in `payroll_settings` real, fehlt aber im `Database`-Typ → deshalb der Cast.
**Lösung:** `as any` bei `ical_token` entfernen; `weekly_template` (jsonb) in `types/database.ts` unter
`payroll_settings` ergänzen, dann die Casts in `template`/`template-config` auflösen.

### ✅ L7 · Inkonsistente Auth-Callback-Fehlerbehandlung — BEHOBEN
**Ort:** `src/app/auth/callback/route.ts` vs. `src/app/api/auth/callback/route.ts`
**Problem:** Die `/api`-Variante prüft den `exchangeCodeForSession`-Fehler und leitet bei Fehler nach
`/login?error=auth`; die `/auth`-Variante ignoriert den Fehler und leitet trotzdem auf `/dashboard`
(→ User landet ausgeloggt, wird wieder zum Login gebounct). Zwei parallele Callback-Routen sind zudem
Wartungslast.
**Lösung:** Fehler auch in `/auth/callback` behandeln (Redirect nach `/login?error=auth`); mittelfristig auf
eine Callback-Route konsolidieren.

---

## ⚪ Info / Design (kein Fix nötig, bewusst festhalten)

### D1 · Offene Selbst-Provisionierung ohne Rate-Limit
`provision_tenant` lässt jeden eingeloggten User ohne Profil eine Org anlegen (gewollt für offenes
Signup). In Kombination mit fehlendem Rate-Limiting an `/login`, `/registrieren`, `/api/slot-request`
ist Org-/Request-Spam möglich. Für den Ein-Mandanten-Betrieb heute irrelevant. Vor dem Fremd-Onboarding:
Rate-Limiting (Vercel/Upstash) und ggf. Invite-Gating oder E-Mail-Domain-Restriktion — deckt sich mit
Betriebsplan §8 / Architektur §8 (Auth-Härtung).

### D2 · Globale Unique-Constraint `payroll_runs (year, month, assistant_id)`
Funktioniert multi-tenant-sicher, weil `assistant_id` bereits eindeutig einem Tenant gehört. Die
`send-email`-Route nutzt `onConflict: 'year,month,assistant_id'` — korrekt. Nur festhalten: falls die
Constraint je auf `(tenant_id, …)` umgestellt wird, muss der `onConflict` mitgezogen werden
(analog zum bereits erledigten `konto` → `tenant_id,dedup_key`).

### D3 · `migrations-mt` ohne automatischen Prod-Runner
Die Serie wird per `scripts/db-migrate.mjs` gefahren; für den Prod-Cutover ist der Prod-Wächter bewusst
über `--allow-prod` zu überbrücken und `0005_backfill_karas_org.sql` (statt der Staging-Variante) zu
verwenden (Betriebsplan §6). Kein Bug — als Cutover-Checkliste-Punkt notiert.

---

## Empfohlene Reihenfolge

1. **Schnell & risikoarm, jetzt:** M1 (Flag entfernen), M2 (Redirect-Validierung), M3
   (assistant-settings scopen), L3 (Validierung), `npm audit fix` (L2).
2. **Vor Fremd-Onboarding:** M4 (E-Mail-Escaping), D1 (Rate-Limit + Invite-Gating), L1 (xlsx-Ablösung),
   L6/L7 (Typlöcher, Callback-Konsolidierung).
3. **Restrisiko dokumentiert:** L4, L5, D2, D3.

Keiner der Punkte bricht die Tenant-Isolation — die Kernsicherheit des Umbaus steht. Es sind Härtungen
und Aufräumarbeiten. M1–M3 und L3 sind in wenigen Minuten erledigt und schließen die wirksamsten Lücken
(versteckte Buildfehler, Open-Redirect, stiller Cross-Tenant-No-op).
