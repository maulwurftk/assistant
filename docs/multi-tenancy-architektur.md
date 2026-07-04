# Technische Architektur: Multi-Tenant (Weg B)

_Entwurf auf Basis von `multi-tenancy-analyse.md`, `multi-tenancy-roadmap.md`, der Todo-/Aufwandsdocs
und `supabase/schema.sql`. **Nur Architektur — kein Code.** Entscheidungen sind bewusst getroffen und
begründet; wo die vorhandenen Docs offen bleiben oder eine Falle enthalten, ist das markiert (⚠️/🐞)._

---

## 0. Kernentscheidungen (zuerst lesen)

| # | Frage | Entscheidung | Warum |
|---|-------|--------------|-------|
| D0 | Gehört ein User zu **einem** oder **mehreren** Mandanten? | **v1: 1 User = 1 Mandant** (`profiles.tenant_id` als Spalte) | Supabase-Auth hat **eine** E-Mail global (ein User-Pool pro Projekt). „1 User = 1 Tenant" ist die einfachste korrekte Form. Membership-Tabelle nur, wenn Assistent:innen nachweislich für mehrere Arbeitgeber **gleichzeitig auf der Plattform** arbeiten. Migrationspfad zu N:M ist offen gehalten (siehe §1.6). |
| D1 | Woraus wird der Tenant abgeleitet? | **Aus der Session/dem JWT** — nicht aus URL/Subdomain/Client-Header | Der Tenant ist an *wer eingeloggt ist* gebunden, serverseitig verifiziert, nicht fälschbar. Subdomain/Header sind bestenfalls Kosmetik (§2). |
| D2 | Wie prüft RLS den Tenant? | `tenant_id = (select current_tenant())`, **USING _und_ WITH CHECK**, Default-Deny | Der `(select …)`-Wrapper cacht den Wert pro Statement (Supabase-Perf-Pattern). WITH CHECK verhindert Schreiben *in fremde* Tenants. |
| D3 | Woher kommt `current_tenant()`? | **v1: `security definer`-Lookup auf `profiles`** (Source of Truth). JWT-Claim als spätere Optimierung. | Kein zusätzliches Auth-Hook-Setup nötig; korrekt, weil `tenant_id` **unveränderlich** ist. JWT-Claim spart den Lookup, lohnt erst bei Last. |
| D4 | Bekommt `superadmin` RLS-Bypass auf Fachtabellen? | **Nein.** Fachtabellen: ausnahmslos `tenant_id = current_tenant()`. Superadmin arbeitet über eine separate, auditierte Service-Role-Fläche. | Kleinste Blast-Radius. Ein Bug in einer „Superadmin sieht alles"-Policy = Totalleck über alle Mandanten. |
| D5 | Referenzielle Integrität über Tenants? | **Composite-FKs** `(child.*_id, tenant_id) → profiles(id, tenant_id)` | Verhindert auf DB-Ebene, dass eine Zeile eine fremde `assistant_id` referenziert — härter als RLS allein. |

> **Next.js-16-Vorbehalt:** Laut `AGENTS.md` weicht dieses Next.js von bekannten Konventionen ab
> (Middleware, `headers()`/`cookies()`, Route-Handler-Signaturen). Alle *Implementierungs*-Details in §2/§5
> (Middleware, Header-Propagation) **vor dem Coden** gegen `node_modules/next/dist/docs/` verifizieren.
> Dieser Entwurf legt die Architektur fest, nicht die genaue API.

---

## 1. Datenmodell & `tenant_id`-Strategie

### 1.1 Neue Wurzeltabelle `organizations`

```sql
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) >= 3),
  slug       text not null unique,              -- nur für Routing/Anzeige, NIE Security
  status     text not null default 'active' check (status in ('active','suspended','deleted')),
  plan       text not null default 'free',
  created_at timestamptz not null default now()
);
```

- **Kein `owner_id`-FK auf `auth.users` als Pflichtfeld.** Der „Owner" ergibt sich aus dem ersten
  `profiles`-Admin dieses Tenants. Ein direkter FK erzeugt nur eine zweite Wahrheit, die konsistent
  gehalten werden muss. (Optional als nullable Info-Feld, nicht als Autoritätsquelle.)
- `slug` ist **rein kosmetisch** (Anzeige, evtl. Subdomain). Er darf **nie** in einer Sicherheits­entscheidung
  vorkommen — sonst wird ein ratebarer String zum Angriffsvektor.

### 1.2 `tenant_id` auf allen 11 Fachtabellen

`tenant_id uuid not null references public.organizations(id) on delete restrict`
auf: `profiles, activities, time_entries, calendar_slots, monthly_reports, notifications,
payroll_settings, payroll_runs, account_ledger, push_subscriptions, assistant_unavailability`.

- **`on delete restrict`, nicht `cascade`.** Das Löschen eines Mandanten muss ein bewusster,
  auditierter Vorgang sein (§4.3 / DSGVO), kein Seiteneffekt eines versehentlichen `delete organizations`.
  Die Kaskade wird explizit im Lösch-Job gefahren.
- Für die **Migration** wird die Spalte zuerst `nullable` angelegt, befüllt, dann auf `not null` gezogen
  (§6).

### 1.3 Indizes: immer `tenant_id` zuerst

Jede Fachquery filtert künftig `where tenant_id = …`. Daher **führende** `tenant_id`-Spalte in den
relevanten zusammengesetzten Indizes, nicht nur ein Solo-Index:

```sql
create index on public.time_entries (tenant_id, date);
create index on public.calendar_slots (tenant_id, status, start_time);
create index on public.monthly_reports (tenant_id, assistant_id, year, month);
create index on public.notifications (tenant_id, user_id, read);
-- Solo-Index auf tenant_id nur dort, wo keine sinnvolle Kombination existiert (z.B. activities, payroll_settings).
```

### 1.4 🐞 Zwei Uniqueness-Bugs, die die vorhandenen Docs übersehen

Diese globalen Unique-Constraints **kollidieren über Mandanten hinweg** und müssen tenant-lokal werden:

```sql
-- account_ledger.dedup_key ist heute GLOBAL unique → zwei Tenants mit gleichem dedup_key kollidieren
alter table public.account_ledger drop constraint account_ledger_dedup_key_key;
alter table public.account_ledger add constraint account_ledger_tenant_dedup_uk unique (tenant_id, dedup_key);

-- payroll_settings: heute „genau eine Zeile" per App-Logik → künftig genau eine PRO Tenant, DB-erzwungen
alter table public.payroll_settings add constraint payroll_settings_tenant_uk unique (tenant_id);
```

Unkritisch (dürfen global bleiben): `profiles.ical_token` (Zufalls-UUID, globale Eindeutigkeit gewollt),
`push_subscriptions.endpoint` (Endpoint ist von Natur aus global eindeutig), `profiles.email`
(= `auth.users.email`, global eindeutig, siehe D0).

Die vorhandenen `unique(assistant_id, year, month)` (monthly_reports) und `unique(year, month, assistant_id)`
(payroll_runs) bleiben korrekt, weil `assistant_id` bereits eindeutig einem Tenant zugeordnet ist —
der Klarheit halber kann man `tenant_id` voranstellen, funktional nötig ist es nicht.

### 1.5 🛡️ Composite-FKs (Defense-in-Depth, empfohlen)

RLS mit `WITH CHECK (tenant_id = current_tenant())` stellt sicher, dass die **eigene** `tenant_id` einer
Zeile stimmt — aber **nicht**, dass eine referenzierte `assistant_id`/`assigned_to`/`user_id` zum selben
Tenant gehört. Ein Admin könnte (mit Kenntnis einer fremden UUID) eine Zeile mit korrekter eigener
`tenant_id`, aber fremdem `assistant_id` anlegen. Fix auf DB-Ebene:

```sql
-- profiles muss (id, tenant_id) als Kandidatenschlüssel anbieten
alter table public.profiles add constraint profiles_id_tenant_uk unique (id, tenant_id);

-- Kindtabellen referenzieren das Paar → Tenant-fremde Referenzen werden physisch unmöglich
alter table public.time_entries
  add constraint time_entries_assistant_tenant_fk
  foreign key (assistant_id, tenant_id) references public.profiles(id, tenant_id) on delete cascade;
-- analog: calendar_slots(assigned_to,tenant_id) / (created_by,tenant_id),
--         monthly_reports, payroll_runs, notifications(user_id,tenant_id),
--         push_subscriptions, assistant_unavailability
```

Trade-off: etwas mehr Constraint-Pflege bei Inserts (immer `tenant_id` mitgeben) — dafür ist eine ganze
Klasse von Cross-Tenant-Verweisen strukturell ausgeschlossen, nicht nur per Policy „hoffentlich abgedeckt".

### 1.6 Superadmin-Identität (nicht als Fachtabellen-Rolle)

Superadmin (= du, plattformweit) bekommt **keine** `profiles`-Zeile in einem Fachmandanten und **keinen**
RLS-Bypass. Stattdessen:

```sql
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
```

Der Superadmin-Bereich (§4/§5) läuft über dedizierte, auditierte Service-Role-Routen, die `platform_admins`
prüfen. So bleibt die `profiles.role`-Achse sauber (`admin` | `assistant`), und „plattformweit" ist von
„im Tenant" getrennt. Das umgeht auch das Problem, welchen `tenant_id` ein Superadmin hätte (er hat keinen).

### 1.7 D0 im Detail — 1 User/Tenant vs. Membership

- **Gewählt (v1):** `profiles.tenant_id` Spalte, unveränderlich nach Anlage. Einfachste korrekte Form.
- **Auslöser für Migration zu N:M** (`memberships(user_id, tenant_id, role)` + „aktiver Tenant" in Session/JWT):
  sobald **dieselbe Person als Assistent:in mehrere Plattform-Arbeitgeber gleichzeitig** bedienen soll.
  Dann kann `current_tenant()` nicht mehr aus dem Profil allein kommen (mehrdeutig) → aktiver Tenant wird
  Teil des JWT-Claims, plus Tenant-Switcher im UI, plus RLS-Prüfung „User ist Mitglied dieses aktiven Tenants".
- **Damit der spätere Umbau billig bleibt:** Fachcode bezieht den Tenant **ausschließlich** über eine
  Funktion (`current_tenant()` in SQL, `getCurrentTenant()` in TS) — nie direkt über `profiles.tenant_id`
  gelesen. Dann tauscht man später nur die Auflösung, nicht 40 Call-Sites.

---

## 2. Tenant-Auflösung: Session vs. Subdomain vs. Header

| Ansatz | Rolle | Sicherheit | Empfehlung |
|--------|-------|-----------|------------|
| **Session / JWT** (Tenant folgt aus `auth.uid()` → Profil bzw. Claim) | **Die Sicherheitsgrenze** | Serverseitig verifiziert, nicht fälschbar, an Auth gebunden | ✅ **Primär.** Einzige Quelle für Autorisierungsentscheidungen. |
| **Subdomain** (`karas.app.de`) | Kosmetik / Routing / Branding | Ein Hinweis, den man **gegen die Session prüfen muss** — allein wertlos/spoofbar | ⚪ Optional, später. Nie Security-Boundary. |
| **Header** (`X-Tenant-Id`) | Interner, **serverseitig gesetzter** Request-Wert | Vom Client gesendet = trivial fälschbar | ⚪ Nur *intern*: Middleware setzt ihn aus der verifizierten Session für Downstream. Client-Wert **nie** vertrauen. |

**Begründung:** Diese App ist ein internes Werkzeug pro Arbeitgeber, keine öffentliche Marketing-Fläche.
Der Nutzen von Subdomains (Branding, tenant-spezifische Landingpage) ist gering; der Preis (Wildcard-DNS,
Wildcard-TLS, Middleware-Parsing, Vercel-Domain-Setup) real. Und selbst mit Subdomain bliebe die
tatsächliche Grenze die Session — die Subdomain wäre nur ein zusätzlich zu validierender Parameter, also
mehr Angriffsfläche für null Sicherheitsgewinn. **Session zuerst; Subdomain frühestens, wenn Kunden
eigene URLs verlangen — und dann streng gegen die Session validiert.**

### 2.1 `current_tenant()` — die zentrale Auflösungsfunktion

**v1 (empfohlen): Source-of-Truth-Lookup auf `profiles`.**

```sql
create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;
```

- `security definer` umgeht RLS auf `profiles` → **keine Policy-Rekursion** (die `profiles`-Policy darf
  `current_tenant()` aufrufen, ohne sich selbst auszulösen). `set search_path` gegen Search-Path-Hijacking.
- `stable` + Aufruf als `(select current_tenant())` in Policies → einmal pro Statement ausgewertet.

**Spätere Optimierung: Tenant als JWT-Claim** (spart den Profil-Lookup ganz):

```sql
-- via Custom-Access-Token-Hook oder app_metadata gesetzt; dann:
create or replace function public.current_tenant()
returns uuid language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
$$;
```

Trade-off: Claim ist bis zum Token-Refresh (Default 1 h) „eingefroren". Weil `tenant_id` **unveränderlich**
ist, ist das folgenlos. Kosten: einmaliges Setup des Auth-Hooks + Sicherstellen, dass der Claim bei
Anlage/Login gesetzt wird. Für die aktuelle Größenordnung (wenige Mandanten, kleine Tabellen) bringt der
Profil-Lookup ausreichend Performance; **JWT-Claim erst bei belegtem Bedarf**. Da beide Varianten dieselbe
Funktionssignatur haben, ist der Wechsel ein Einzeiler ohne Änderung an den Policies.

---

## 3. RLS-Muster

### 3.1 Grundregeln

1. **Default-Deny.** RLS aktiv, keine `USING (true)`-Policies auf Fachtabellen.
2. **Jede** Fachtabelle prüft `tenant_id = (select current_tenant())` — in `USING` **und** `WITH CHECK`.
3. Feinere Rollenlogik (Assistent nur Eigenes, Admin alles) steht **immer zusätzlich** unter dem
   Tenant-Filter, nie stattdessen.
4. **Kein** Superadmin-Bypass auf Fachtabellen (D4).

### 3.2 Kanonisches Muster

```sql
-- Beispiel time_entries: Assistent verwaltet Eigenes, Admin sieht alles — beides tenant-lokal
alter table public.time_entries enable row level security;
alter table public.time_entries force row level security;   -- gilt auch für Tabellen-Owner

create policy te_assistant_rw on public.time_entries
  for all to authenticated
  using      (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid())
  with check (tenant_id = (select public.current_tenant()) and assistant_id = auth.uid());

create policy te_admin_read on public.time_entries
  for select to authenticated
  using (tenant_id = (select public.current_tenant()) and public.get_my_role() = 'admin');
```

- **`WITH CHECK` ist nicht optional.** Ohne sie könnte ein User eine Zeile mit fremder `tenant_id`
  **schreiben**, obwohl er sie nicht **lesen** könnte — ein klassisches „write into another tenant"-Leck.
- `get_my_role()` existiert schon (`security definer` auf `profiles`) und bleibt — nur immer mit dem
  Tenant-Filter kombiniert. (Da die Rolle aus dem eigenen Profil kommt und `tenant_id` ohnehin geprüft
  wird, ist „Admin von Tenant A sieht Tenant B" ausgeschlossen.)

### 3.3 `organizations`-Policies

```sql
create policy org_self_read on public.organizations
  for select to authenticated
  using (id = (select public.current_tenant()));   -- man sieht nur den eigenen Mandanten
-- KEINE Insert/Update/Delete-Policy für normale User: Anlage/Änderung nur via Service-Role (§4).
```

### 3.4 Realtime

`notifications`, `calendar_slots`, `monthly_reports` liegen in `supabase_realtime`. Realtime respektiert
RLS — sind die Policies korrekt tenant-scoped, sind auch die Subscriptions es. ⚠️ Beim Test explizit
verifizieren, dass ein Client aus Tenant A **keine** Realtime-Events aus Tenant B empfängt (eigener
Testfall, §7).

### 3.5 Testpflicht (Merge-Gate)

Für **jede** Tabelle × {select, insert, update, delete}: „User aus Tenant A auf Zeile aus Tenant B" muss
scheitern. Plus je ein Realtime-Isolationstest für die drei Realtime-Tabellen. Details §7.

---

## 4. Onboarding / Registrierung

### 4.1 Neuen Mandanten anlegen — **transaktional, serverseitig**

⚠️ Der in der Todo-Liste skizzierte Client-Flow (`supabase.auth.signUp()` → danach zwei separate
Client-Inserts) hat ein **Partial-Failure-Problem**: bricht Schritt 2/3 ab, existiert ein Auth-User ohne
Org/Profil (Zombie-Account, kann sich einloggen, hat keinen Tenant → `current_tenant()` = null → sperrt sich
selbst aus oder — schlimmer — Policies verhalten sich unerwartet).

**Stattdessen:** eine `security definer`-RPC bzw. eine Service-Role-Route, die Org + Admin-Profil in **einer
Transaktion** anlegt, aufgerufen unmittelbar nach `signUp`:

```sql
create or replace function public.provision_tenant(p_org_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- Verhindern, dass ein bereits zugeordneter User einen zweiten Tenant erzeugt:
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'user already provisioned';
  end if;

  insert into public.organizations (name, slug) values (p_org_name, p_slug) returning id into v_org;
  insert into public.profiles (id, tenant_id, email, full_name, role)
    values (auth.uid(), v_org,
            (select email from auth.users where id = auth.uid()),
            p_org_name, 'admin');
  return v_org;
end $$;
```

- Alles-oder-nichts. Der erste User eines Tenants wird `admin` mit `tenant_id = neue Org`.
- **Kein** `handle_new_user`-Trigger auf `auth.users`, der Profile automatisch anlegt — beim Registrieren
  ist der Tenant erst im RPC bekannt, bei Einladungen kommt er aus dem Token (§4.2). Automatische
  Profilerzeugung würde tenant-lose Profile produzieren.
- Wenn Tenant später als JWT-Claim geführt wird: nach `provision_tenant` einen Token-Refresh erzwingen,
  damit der Claim gesetzt ist.

### 4.2 Assistent:innen einladen

- Admin erzeugt Einladung → Single-Use-Token (Zufalls-UUID, Ablaufdatum), das **serverseitig** an
  `(tenant_id, rolle=assistant, ggf. E-Mail)` gebunden ist. Der Client sieht nur den opaken Token.
- Annahme: eingeladener User registriert/loggt sich ein → Service-Role-Route validiert Token, legt
  `profiles`-Zeile mit **der im Token hinterlegten `tenant_id`** an. Die `tenant_id` kommt aus dem
  serverseitig gespeicherten Invite, **nicht** aus einem Client-Feld.
- Token nach Nutzung invalidieren; abgelaufene/ungültige → Ablehnung.

### 4.3 Mandant sperren / löschen (Superadmin, DSGVO)

- `status = 'suspended'` → App verweigert Login/Zugriff (Check in Middleware + Policy-freundlich via
  `organizations.status`).
- Löschen = expliziter, auditierter Service-Role-Job: alle Zeilen `where tenant_id = X` je Tabelle löschen
  (feste Reihenfolge wg. FKs), dann `organizations`-Zeile, dann Auth-User der Mitglieder deaktivieren.
  Wegen `on delete restrict` (§1.2) passiert das **nur** über diesen Job, nie versehentlich.

---

## 5. Service-Role-Routen (RLS-Bypass — höchste Sorgfalt)

Der Service-Role-Client **umgeht RLS vollständig**. Jede solche Route ist ein potenzielles Loch.

### 5.1 Leitlinien

1. **Service-Role minimieren.** Wo eine Route im Kontext eines eingeloggten Users läuft, den
   **user-scoped Client (Anon-Key + JWT)** verwenden → RLS greift automatisch, Tenant-Filter „gratis".
   Service-Role nur, wo wirklich nötig: User-Anlage, Cross-Tenant-Crons, Superadmin.
2. **Zentraler Helper statt roher Client.** Kein Handler instanziiert den Service-Role-Client direkt.
   Stattdessen `resolveTenant(req)` → ermittelt & **verifiziert** den Tenant aus der *authentifizierten
   Session* (nie aus Client-Body/-Header/-Query) und liefert `tenantId`, der auf **jede** Query/Insert
   angewandt werden **muss**. Optional ein Wrapper, der `.eq('tenant_id', …)` erzwingt.
3. **Immer `.eq('tenant_id', tenantId)`** bei Reads/Updates/Deletes und `tenant_id: tenantId` bei Inserts.
   Die früheren `.limit(1).single()` auf `payroll_settings` werden zu
   `.eq('tenant_id', tenantId).single()`.

### 5.2 Routen-Inventar (aus den Docs; ⚠️ vor Umsetzung gegen echten Code gegenprüfen)

| Route | Muster |
|-------|--------|
| `api/admin/create-user` | Caller muss `admin` **seines** Tenants sein → neues Profil mit `tenant_id = caller.tenant`. |
| `api/admin/time-entries` (+`/[id]`) | `.eq('tenant_id', tenant)` bei GET/DELETE/UPDATE; DELETE nur wenn Zeilen-`tenant_id` == caller-Tenant. |
| `api/payroll/settings` | `.eq('tenant_id', tenant).single()` statt `.limit(1)`. |
| `api/payroll/konto` (+`/[id]`) | ledger tenant-scopen; `dedup_key` jetzt `(tenant_id, dedup_key)`. |
| `api/payroll/send-email`, `api/notify-admin` | Empfänger/Absender aus caller-Tenant auflösen. |
| `api/slot-request` | Slot muss zu caller-Tenant gehören. |
| **`api/remind-open-slots`** (Cron) | **Kein User-Kontext** → **pro Tenant iterieren** (s.u.). |
| **`api/send-monthly-reminders`** (Cron) | dito. |
| `api/ha/status`, `api/calendar.ics` | Token-basiert (§5.4). |

### 5.3 Cron-Routen: über alle Tenants, aber **pro Tenant gruppiert**

```
// Falsch: globaler Sweep mischt Mandanten (Tenant-A-Admin bekäme Mail über Tenant-B-Slots)
// Richtig:
for (org of activeOrganizations()) {
   slots = select ... where tenant_id = org.id and ...
   notifyAdminsOf(org, slots)
}
```

Der einzige Ort, an dem Cross-Tenant-Lesen **legitim** ist (Cron hat keine User-Session). Absicherung:
Auth per `CRON_SECRET`; strikte Gruppierung `by tenant_id`; nie Empfänger/Inhalt über Tenants mischen.
Nur **`status = 'active'`**-Orgs verarbeiten.

### 5.4 Token-Endpunkte (`calendar.ics`, `ha/status`)

Der Token (`profiles.ical_token`) identifiziert bereits **ein Profil** → dessen `tenant_id` ist eindeutig.
**Empfehlung:** Tenant serverseitig aus dem Profil des Tokens ableiten und alle Queries zusätzlich
`.eq('tenant_id', profile.tenant_id)` scopen. **Nicht** den Tenant zusätzlich in die URL schreiben
(Doc-„Option B" `?tenant=uuid`) — das ist redundant und ein Footgun (widersprüchliche Quelle). Token bleibt
opak und pro Profil; die Isolation folgt aus dem Profil, nicht aus einem URL-Parameter.

---

## 6. Migrationsreihenfolge

Ausgangslage ist günstig: es existiert real **nur ein** Mandant (Karas). Damit ist der gefährliche Teil —
„Live-Migration mit mehreren aktiven Tenants" — **nicht** die Situation. Es ist eine Umstellung einer
Single-Tenant-DB auf multi-tenant-fähig, solange nur ein Tenant existiert. Das erlaubt eine ruhige Cutover-
Reihenfolge in einem Wartungsfenster:

1. **Schema additiv:** `organizations` anlegen; `tenant_id` **nullable** auf alle 11 Tabellen;
   `current_tenant()`, `provision_tenant()` anlegen; `platform_admins` anlegen.
2. **Karas-Org + Backfill:** eine `organizations`-Zeile „Karas" anlegen, `update … set tenant_id = <karas>`
   auf allen 11 Tabellen. (Trivial, da alle Bestandszeilen zu diesem einen Tenant gehören.)
3. **Constraints scharf:** `tenant_id set not null`; FK auf `organizations`; Composite-Unique auf
   `profiles(id, tenant_id)`; Composite-FKs der Kindtabellen (§1.5); Uniqueness-Fixes (§1.4);
   `tenant_id`-führende Indizes (§1.3).
4. **RLS umstellen:** alte Policies droppen, neue tenant-scoped Policies (§3) anlegen, `force row level
   security`. — **Erst NACH Schritt 2**, sonst würde strikte RLS auf noch-null-`tenant_id`-Zeilen die
   laufende App aussperren. (Das korrigiert die Phasen-Reihenfolge der Roadmap, die RLS in Phase 2 vor der
   Datenmigration in Phase 7 setzt.)
5. **App-Deploy:** tenant-aware Queries/Routen (§5) + Registrierung/Invite (§4) + `TenantContext`/
   `getCurrentTenant()`. Reihenfolge zu 4: DB-RLS und App gemeinsam ausrollen (im Wartungsfenster), damit
   nie „neue RLS + alte App" oder umgekehrt live sind.
6. **Cross-Tenant-Testsuite grün** (§7) als Gate.
7. **Zweiten Tenant** (Test-Org) anlegen, gegenseitige Unsichtbarkeit real verifizieren.
8. **Danach** echte Tester/zweite Arbeitgeber einladen. Superadmin-Fläche (§4.3/§5) kann parallel/nachgelagert.

**Blaupausen-Empfehlung (aus der Roadmap übernommen und bekräftigt):** Schritte 1–4 zuerst an **einer**
Tabelle (z. B. `calendar_slots`) end-to-end inkl. Cross-Tenant-Test durchziehen. Sitzt das Muster, auf die
übrigen 10 Tabellen replizieren. So fällt ein Denkfehler auf, bevor er 11-fach dupliziert ist.

---

## 7. Test-Strategie (Merge-Gate) — Blaupause

Zwei Tenants A/B, je 1 Admin + 1 Assistent, je Fachzeilen. Automatisiert (z. B. `__tests__/rls-cross-tenant`):

- **Read-Isolation:** je Tabelle — User A liest, sieht **nie** B-Zeilen.
- **Write-Isolation (WITH CHECK):** User A versucht Insert/Update mit `tenant_id = B` → **scheitert**
  (`42501`). Auch: Insert mit eigener `tenant_id` aber **fremder** `assistant_id` → scheitert (Composite-FK).
- **Delete-Isolation:** User A `delete` auf B-Zeile → 0 rows / denied.
- **Service-Role-Routen:** GET/POST als User B nach POST als A → keine Vermischung.
- **Cron-Gruppierung:** Cron-Lauf erzeugt für A **nur** A-Benachrichtigungen.
- **Realtime:** Subscribe als A, Mutation als B → **kein** Event bei A (§3.4).
- **Onboarding:** `provision_tenant` doppelt für denselben User → zweiter Aufruf scheitert (kein zweiter
  Tenant, kein Zombie).

Zusätzlich manuell: zwei Browser, zwei Admins, URL-/UUID-Manipulation → Zugriff verweigert. Und die
Prod-Checks aus der Aufwandsschätzung (jeder User hat `tenant_id`; keine „denied"-Fehler im Normalbetrieb).

---

## 8. Recht & Betrieb (unverändert extern, s. Analyse/Roadmap)

DSGVO (AVV, Datenschutzerklärung, Verzeichnis, Löschkonzept, TOMs; EU-Region), StBerG-Disclaimer (vorhanden),
Auth-Härtung (MFA für Admins, Rate-Limiting, Audit-Log), Backups/Monitoring. Kein Code-, aber Freigabe-Gate
vor echtem Fremd-Onboarding.

---

## 9. Delta zu den bestehenden Docs (was dieser Entwurf ändert/ergänzt)

1. **Tenant-Auflösung** klar entschieden: Session/JWT ist die Grenze; Subdomain/Header nur Kosmetik/intern (§2).
2. **`current_tenant()`** mit `(select …)`-Caching, `set search_path`, plus JWT-Claim-Ausbaupfad (§2.1).
3. **Superadmin ohne RLS-Bypass** + eigene `platform_admins`-Tabelle statt Fachrolle (D4/§1.6).
4. **Composite-FKs** gegen Cross-Tenant-Referenzen (§1.5) — in den Docs nicht enthalten.
5. 🐞 **Zwei Uniqueness-Lecks** gefixt: `account_ledger.dedup_key` global → `(tenant_id, dedup_key)`;
   `payroll_settings` DB-erzwungen 1/Tenant (§1.4).
6. **Onboarding transaktional** via `provision_tenant`-RPC statt Client-Insert-Kette (§4.1) — behebt das
   Zombie-Account-Risiko.
7. **Token-Endpunkte** leiten Tenant aus dem Profil des Tokens ab, **nicht** aus URL-Param (§5.4).
8. **Migrationsreihenfolge korrigiert:** Backfill **vor** strikter RLS; DB+App gemeinsamer Cutover;
   Cutover ist entspannt, weil real nur ein Tenant existiert (§6).
9. **`on delete restrict`** auf `tenant_id`-FKs; Löschen nur als auditierter Job (§1.2/§4.3).

---

_Nächster sinnvoller Schritt (Umsetzung, tenant-weise Blaupause): §6 Schritte 1–4 an `calendar_slots`
end-to-end inkl. Cross-Tenant-Test — dann replizieren._
