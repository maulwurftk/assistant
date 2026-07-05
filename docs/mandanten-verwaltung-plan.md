# Mandanten-Verwaltung im Superadmin-Panel — Umsetzungsplan

Stand: 2026-07-05 · Status: geplant, noch nicht begonnen

## Ziel

Mandanten (Kunden/Organisationen) zentral einsehen und bei Bedarf sperren
(z. B. Nichtzahler) oder entsperren. Grundlage existiert bereits:
`organizations.status` (`active` / `suspended` / `deleted`, Migration 0001) —
wird aber bisher **nirgends geprüft** und hat keine UI.

## Umfang (dieser Ausbau)

1. Status-Enforcement in der Datenbank
2. Superadmin-API `/api/superadmin/mandanten`
3. Superadmin-Seite `/superadmin/mandanten` (Liste + Sperren/Entsperren)
4. "Konto gesperrt"-Seite für betroffene User

**Nicht enthalten** (separat, später): Hard-Delete eines Mandanten
(Auth-User, Storage, Backups hängen dran), Billing/Plan-Verwaltung.

---

## 1 · Migration 0015: Status-Enforcement in `current_tenant()`

Zentraler Hebel: `current_tenant()` steckt in jeder RLS-Policy. Gibt sie
`null` zurück, greift überall Default-Deny — ein gesperrter Mandant verliert
mit einer Änderung sämtlichen Datenzugriff.

```sql
create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  join public.organizations o on o.id = p.tenant_id
  where p.id = auth.uid()
    and o.status = 'active'
$$;
```

- Signatur unverändert → keine Policy muss angefasst werden.
- Down-Migration: alte Funktionsdefinition aus 0003 wiederherstellen.
- Perf: ein zusätzlicher PK-Join, Funktion bleibt `stable` → 1× pro Statement.

**Achtung:** Diese Funktion ist das Herz der RLS. Vor Prod-Deploy gegen den
bestehenden Mandanten (Org Karas) testen: Login, Kalender, Zeiterfassung,
dann Org testweise auf `suspended` setzen → alles muss dicht sein → zurück.

## 2 · API-Route `/api/superadmin/mandanten`

Muster 1:1 von `/api/superadmin/registrierung/route.ts` übernehmen
(`resolvePlatformAdmin()` + `serviceClient()`, zod-Validierung).

- **GET** → Liste aller Orgs: `id, name, slug, status, plan, created_at`
  + User-Anzahl pro Org (Aggregat über `profiles`).
- **POST** `{ action: 'set_status', id, status: 'active' | 'suspended' }`
  → Status setzen. `deleted` vorerst NICHT über die API anbieten
  (Soft-Delete kommt mit dem Lösch-Konzept).
- Eigene Org (Karas) gegen versehentliches Selbst-Aussperren schützen:
  Sperren der Org, zu der der eingeloggte Superadmin-User gehört, ablehnen —
  oder zumindest mit explizitem Confirm-Flag.

## 3 · UI-Seite `/superadmin/mandanten`

Struktur von `/superadmin/registrierung` kopieren (gleiches Layout,
gleicher Client-Fetch-Ansatz).

- Tabelle: Name, Slug, Plan, Status-Badge, User-Anzahl, angelegt am.
- Aktion je Zeile: "Sperren" bzw. "Entsperren" mit Bestätigungsdialog
  (Hinweis: User können sich sofort nicht mehr anmelden, Daten bleiben).
- Navigation: Link zwischen den beiden Superadmin-Seiten
  (Registrierung ⇄ Mandanten).

## 4 · "Konto gesperrt"-Seite

Ohne sie sieht ein gesperrter User nur leere Seiten/Fehler.

- Statische Seite `/gesperrt`: "Dieses Konto ist derzeit gesperrt.
  Bitte wenden Sie sich an den Betreiber." (Kontakt-Mail).
- Erkennung: Nach Login prüfen, ob Profil/Org-Daten trotz gültiger Session
  leer zurückkommen (RLS greift) → Redirect auf `/gesperrt`.
  Einfachste Stelle: zentraler Layout-/Session-Check, wo das Profil ohnehin
  geladen wird.

---

## Reihenfolge & Test

1. Migration 0015 auf **Staging** einspielen, Funktionstest (s. o.).
2. API + UI bauen, lokal gegen Staging testen.
3. Sperr-Durchlauf mit Test-Mandant: sperren → Login/Daten dicht +
   `/gesperrt` erscheint → entsperren → alles wieder normal.
4. Prod: Migration einspielen, deployen, Smoke-Test mit Org Karas
   (NICHT sperren, nur Liste/Anzeige prüfen).

Hinweis Arbeitsweise: Commits/mechanische Schritte via Haiku-Subagent;
kein `npm install` im Mount, `node` statt `node --test`.

## Offene Fragen (vor Umsetzung kurz klären)

- Soll `plan` schon editierbar sein (free/paid), oder nur anzeigen?
- Grace-Period-Gedanke (erst Banner "Zahlung offen", dann Sperre)? — v1: nein, direkt sperren.
- Sperr-Grund/Notizfeld pro Org gewünscht?
