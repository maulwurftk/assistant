# Feature-Spec: Manuelle Datensicherung (Export / Import)

_Selbstbedienungs-Sicherung der Fachdaten durch den Admin. **JSON**, re-importierbar. Zwei Import-Modi:
**Ergänzen (Upsert)** als Standard, **Ersetzen** als bewusst zu bestätigende Option._
_Zielausführung: Fable. Gegen das **aktuelle (Single-Tenant-)Schema** gebaut; §7 beschreibt die
Multi-Tenant-Anpassung, die im MT-Umbau (Phase 4) mitgezogen wird._

---

## 0. Scope & Grenzen (im UI klar kommunizieren)

- Sichert **Fachdaten** (die 11 App-Tabellen), **nicht** Auth-Accounts. `profiles.id` hängt an
  `auth.users` — Logins/Passwörter sind **nicht** im Export. → **Kein** Voll-Disaster-Recovery, sondern
  Schutz gegen App-Datenverlust (versehentliches Löschen, kaputter Edit, misslungene Migration) + DSGVO-
  Portabilität. UI-Label: **„Datensicherung (Fachdaten)"**, nicht „vollständiges Backup".
- Nur **Admin**. Datei enthält personenbezogene Daten (Namen, IBAN, Zeiten) → nur über HTTPS, kein
  serverseitiges Ablegen des Exports.

## 1. Referenz-Konventionen (aus dem Code übernehmen)

- **Auth + Rollencheck:** exakt wie [create-user](../src/app/api/admin/create-user/route.ts) (Zeilen 5–13):
  `createClient()` → `auth.getUser()` → `profiles.role === 'admin'`, sonst 401/403.
- **Datenoperationen:** Service-Role — `createAdminClient` aus `@supabase/supabase-js` (wie create-user)
  **oder** `createServiceClient()` aus [server.ts](../src/lib/supabase/server.ts). Bypasst RLS; daher
  Tenant-/Scope-Regeln (§7) im Code erzwingen.
- **Typen:** `Database` aus `@/types/database` — Tabellennamen typisiert verwenden.
- **Validierung:** `zod` (bereits Dependency) für Manifest + Payload-Form.
- **Next.js 16.2.6 / React 19:** Route-Handler wie im Bestand (`export async function GET/POST`). ⚠️ Falls
  `cookies()/headers()`-Signaturen abweichen, vor dem Coden gegen `node_modules/next/dist/docs/` prüfen
  (AGENTS.md).

## 2. Tabellen: Reihenfolge & Import-Klasse

**FK-Abhängigkeitsreihenfolge (Insert = Eltern zuerst; Delete = umgekehrt):**

```
profiles → activities → payroll_settings
        → time_entries, calendar_slots, monthly_reports, notifications,
          payroll_runs, account_ledger, assistant_unavailability
```

| Tabelle | Import-Klasse | Begründung |
|---------|---------------|------------|
| `profiles` | **Upsert-only, NIE löschen** | An `auth.users` gebunden. Löschen würde Login kappen + alles kaskadieren. Import aktualisiert Felder für vorhandene `id`; **fehlt** die `id` als Auth-User → **überspringen + Warnung** (Login kann hier nicht erzeugt werden). |
| `payroll_settings` | **Upsert (Singleton)** | Genau eine Zeile. |
| `activities` | Merge/Replace | Stammdaten. |
| `time_entries`, `calendar_slots`, `monthly_reports`, `notifications`, `payroll_runs`, `account_ledger`, `assistant_unavailability` | Merge/Replace | Reine Fachdaten. |
| `push_subscriptions` | **Aus Export ausschließen** | Flüchtige Device-Tokens, kein Backup-Wert. |

> **Wichtige Konsequenz für „Ersetzen":** `profiles` und `auth.users` werden **nicht** gelöscht. Ersetzt
> werden nur die Fachtabellen. So bleibt die Auth-Verknüpfung intakt und der Restore ist umkehrbar.

## 3. Export

**Route:** `GET /api/admin/backup/export` — Admin-only.

**Ablauf:** Alle Tabellen aus §2 (außer `push_subscriptions`) lesen → JSON bauen → als Download
zurückgeben (`Content-Disposition: attachment; filename="sicherung-<slug>-<YYYY-MM-DD-HHmm>.json"`).

**Dateiformat:**

```jsonc
{
  "manifest": {
    "format": "assistenten-app-backup",
    "schemaVersion": 1,              // muss beim Import passen (§4.1)
    "appVersion": "<package.json version>",
    "exportedAt": "2026-07-04T09:00:00Z",
    "exportedBy": "<admin user id>",
    "tenant": { "id": null, "name": null },   // Single-Tenant: null; MT: gefüllt (§7)
    "counts": { "time_entries": 1234, "calendar_slots": 88, ... }
  },
  "data": {
    "profiles": [ ... ],
    "activities": [ ... ],
    "payroll_settings": [ ... ],
    "time_entries": [ ... ],
    "calendar_slots": [ ... ],
    "monthly_reports": [ ... ],
    "notifications": [ ... ],
    "payroll_runs": [ ... ],
    "account_ledger": [ ... ],
    "assistant_unavailability": [ ... ]
  }
}
```

- `counts` erlaubt dem Import eine Plausibilitätsanzeige, bevor er etwas anfasst.
- Vollständige Zeilen inkl. `id` (UUIDs bleiben erhalten → Upsert kann exakt wiederherstellen).

## 4. Import

**Route:** `POST /api/admin/backup/import` — Admin-only. Body: `{ mode: 'merge' | 'replace', backup: <Datei-JSON> }`.

### 4.1 Validierung (vor jedem DB-Zugriff)

1. `zod`-Schema: `manifest.format === 'assistenten-app-backup'` und `schemaVersion === 1` — sonst **ablehnen**
   (klare Meldung „inkompatible/fremde Sicherung"). Kein Best-Effort-Parsen fremder Dateien.
2. Grobform von `data` prüfen (Arrays vorhanden, Pflichtfelder je Zeile).
3. Upload-Größenlimit (z. B. 25 MB) + nur ein Import gleichzeitig.

### 4.2 Sicherheits-Kernregeln (nicht verhandelbar)

- 🔒 **Keine IDs/Fremdschlüssel blind vertrauen, kein Cross-Scope-Schreiben.** Im MT-Fall (§7) wird
  `tenant_id` **erzwungen** auf den Tenant des Admins — Werte aus der Datei werden ignoriert.
- 🔒 **`profiles` nie löschen** (§2). Neue `profiles.id` ohne passenden Auth-User → **skip + Warnung**.
- **Referenzintegrität:** Fachzeilen, deren `assistant_id`/`assigned_to`/`user_id` auf ein nicht (mehr)
  existierendes Profil zeigen, werden übersprungen und im Report gelistet (statt harten FK-Fehler).

### 4.3 Atomarität — Empfehlung: ein `security definer`-RPC

Der Supabase-JS-Client kann **keine** tabellenübergreifende Transaktion. Für einen *destruktiven* „Ersetzen"
ist Atomarität aber Pflicht (sonst halb-gelöschter Zustand bei Fehler). Deshalb:

- **Empfohlen:** eine Postgres-Funktion `public.import_backup(p_payload jsonb, p_mode text)`
  (`security definer`), die **in einer Transaktion**:
  1. (Modus `replace`) die Fachtabellen in Delete-Reihenfolge leert — **ohne** `profiles`,
  2. die Zeilen in Insert-Reihenfolge einspielt (`insert ... on conflict (id) do update` für `merge`),
  3. (MT) `tenant_id` je Zeile auf den Caller-Tenant setzt,
  4. übersprungene/ungültige Zeilen als Report-JSON zurückgibt.
  Die Route macht nur Auth-Check + `rpc('import_backup', …)`. Ein Fehler rollt alles zurück.
- **Alternative (ohne RPC):** sequentielle Upserts im Client in FK-Reihenfolge. Zulässig für `merge`
  (nicht destruktiv). Für `replace` nur mit **verpflichtendem Pre-Restore-Snapshot** (§4.4) als Netz.

### 4.4 Pre-Restore-Snapshot (Pflicht bei `replace`, empfohlen bei `merge`)

Unmittelbar **vor** dem Import serverseitig einen frischen Export erzeugen und dem Admin als Download geben
(„Stand vor der Wiederherstellung"). Ein Fehlklick ist damit umkehrbar.

### 4.5 Dry-Run / Vorschau

Erst **Vorschau** zurückgeben, dann ausführen: „X Zeilen werden ergänzt, Y überschrieben, Z übersprungen
(kein Auth-User / fehlende Referenz)", getrennt nach Modus. Ausführung erst nach expliziter Bestätigung.
Bei `replace` zusätzlich Tippbestätigung (z. B. Wort „ERSETZEN") — analog zum Lösch-Job der MT-Architektur.

### 4.6 Antwort-Report

`{ mode, applied: {table: {inserted, updated}}, skipped: [{table, id, reason}], preRestoreSnapshot: <name> }`.

## 5. UI

**Neue Seite:** `src/app/(main)/admin/sicherung/page.tsx` (Admin-Bereich, neben `benutzer`, `berichte`, …).
Nav-Eintrag „Datensicherung" ergänzen.

- **Export:** ein Button → lädt JSON. Kurzer Hinweistext zum Scope (§0) + DSGVO-Warnung (personenbezogene
  Daten).
- **Import:** File-Picker → Client validiert grob → **Vorschau** (Server-Dry-Run) → Modus wählen
  (**Ergänzen** vorausgewählt) → bei „Ersetzen" Warn-Dialog + Tippbestätigung → Ausführen → Report anzeigen,
  Pre-Restore-Snapshot-Download anbieten.

## 6. Testfälle (Merge-Gate)

- Export → Import (merge) in dieselbe DB = Idempotenz (keine Duplikate, keine Änderungen).
- Zeilen löschen → Import (merge) stellt genau sie wieder her.
- `replace`: Fachdaten weg → korrekt neu aufgebaut; `profiles`/Logins **unangetastet**.
- Fremde/ältere `schemaVersion` → sauber abgelehnt, DB unberührt.
- Zeile mit unbekannter `assistant_id` → übersprungen + im Report.
- Nicht-Admin → 403. Fehler mitten im `replace` → vollständiger Rollback (RPC).
- (MT, §7) Import einer Sicherung aus Tenant A durch Admin B → landet unter Tenant B, **nie** in A.

## 7. Multi-Tenant-Anpassung (später, in MT-Phase 4)

Wenige, klar umrissene Änderungen — passt in den ohnehin fälligen tenant-Scoping-Sweep:

- **Export:** jede `select` zusätzlich `.eq('tenant_id', tenantId)`; `manifest.tenant` füllen. `tenantId`
  aus der verifizierten Session (`current_tenant()`), nie aus Request.
- **Import:** `tenant_id` **jeder** Zeile hart auf `tenantId` setzen (Datei-Wert verwerfen). Bei RPC-Variante
  passiert das in der Funktion — sicherste Stelle.
- Alles andere (Format, Modi, Snapshot, Reihenfolge) bleibt unverändert.

## 8. Empfohlene Bau-Reihenfolge (für Fable)

1. `GET …/export` + Manifest + Download (kein Risiko, sofort nützlich).
2. `POST …/import` **Dry-Run/Vorschau** (liest nur, schreibt nichts).
3. `import_backup`-RPC (merge) + Pre-Restore-Snapshot.
4. `replace`-Pfad (RPC + Tippbestätigung).
5. UI-Seite `admin/sicherung`.
6. Testfälle §6.
7. Später: §7 im MT-Umbau.
