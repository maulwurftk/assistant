# To-do-Funktion für Assistenten · Architektur-Entwurf

_Stand: 2026-07-05, Fragen §7 geklärt, Umsetzung läuft.
Kontext: Multi-Tenant ist live (Migrationen 0001–0013), nächste freie Migrationsnummer: **0014**.
Referenzen: [Architektur](multi-tenancy-architektur.md) · [Betriebsplan](multi-tenancy-betriebsplan.md)._

---

## 1. Anforderung (O-Ton Thomas)

To-do-Liste für die Assistenten, **gepflegt und überwacht vom Arbeitgeber**, mit zwei Arten von Aufgaben:

- **Wiederholend:** z. B. „bei jedem Dienst Mistkübel ausräumen"
- **Einmalig:** z. B. „Kinotickets für Freitag besorgen"

Idee: lässt sich mit den **Tätigkeiten** (`activities`) kombinieren.

## 2. Kernentscheidung: Vorlagen + dünne Erledigungen statt Instanzen-Flut

Die naive Lösung — für jede Wiederholung per Cron eine Aufgaben-Zeile pro Dienst erzeugen — erzeugt
Datenmüll, braucht einen Materialisierungs-Job und geht kaputt, wenn Dienste nachträglich angelegt/
verschoben werden. Besser: **nichts vorab materialisieren.**

- **`todo_templates`** — wiederkehrende Aufgaben als Definition („bei jedem Dienst X tun").
- **`todo_checks`** — *sparse*: eine Zeile entsteht **erst beim Abhaken** (Template × Dienst).
  Die Checkliste eines Dienstes ist ein Join: aktive Templates + vorhandene Checks.
- **`todos`** — einmalige Aufgaben als normale Zeilen mit Status.

Vorteile: kein Cron, keine Zombie-Instanzen bei Dienständerungen, nachträglich angelegte Dienste
haben automatisch die richtige Checkliste, Historie bleibt trotzdem auswertbar (Checks sind Fakten).

## 3. Datenmodell (Vorschlag Migration 0014)

```sql
-- Wiederkehrende Aufgaben (Definition, vom Arbeitgeber gepflegt)
create table todo_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default current_tenant() references organizations(id),
  title       text not null,
  description text,
  activity_id uuid references activities(id),  -- optionale Kopplung an Tätigkeit
  recurrence  text not null default 'per_shift'
              check (recurrence in ('per_shift','daily','weekly')),
  weekday     int check (weekday between 0 and 6), -- nur bei weekly
  assignee_id uuid references profiles(id),    -- null = gilt für alle Assistenten
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Erledigungen wiederkehrender Aufgaben (sparse, entsteht beim Abhaken)
create table todo_checks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default current_tenant() references organizations(id),
  template_id uuid not null references todo_templates(id) on delete cascade,
  slot_id     uuid references calendar_slots(id) on delete set null, -- Dienst-Bezug (per_shift)
  check_date  date not null default current_date,  -- Bezugstag (daily/weekly + Fallback)
  done_by     uuid not null references profiles(id),
  done_at     timestamptz not null default now(),
  note        text,
  confirmed_by uuid references profiles(id),   -- Abnahme durch Arbeitgeber (§7.3)
  confirmed_at timestamptz,
  unique (template_id, slot_id),          -- pro Dienst nur 1× abhakbar
  -- daily/weekly: eindeutig pro Tag (partieller Unique-Index, §7.5 — MVP):
  -- create unique index ... on todo_checks (template_id, check_date) where slot_id is null;
  constraint slot_or_date check (slot_id is not null or check_date is not null)
);

-- Einmalige Aufgaben
create table todos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default current_tenant() references organizations(id),
  title       text not null,
  description text,
  activity_id uuid references activities(id),
  assignee_id uuid references profiles(id),    -- null = wer zuerst kann
  due_date    date,
  status      text not null default 'open' check (status in ('open','done','cancelled')),
  done_by     uuid references profiles(id),
  done_at     timestamptz,
  note        text,                            -- Rückmeldung des Assistenten
  confirmed_by uuid references profiles(id),   -- Abnahme durch Arbeitgeber (§7.3)
  confirmed_at timestamptz,
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);
```

**Achtung Composite-FK-Muster (0006):** Alle FKs auf `profiles`/`activities`/`calendar_slots` im
Bestand sind composite `(tenant_id, id)` — beim echten Migrieren dasselbe Muster verwenden, sonst
bricht die Cross-Tenant-Integrität. Oben nur vereinfacht notiert. PostgREST-Embeds auf `profiles`
brauchen dann wieder Spalten-Hints (`profiles!assignee_id(...)`), siehe bekannte PGRST201-Falle.

## 4. RLS (analog Bestand, tenant-scoped)

| Tabelle | select | insert | update | delete |
|---|---|---|---|---|
| `todo_templates` | alle im Tenant | nur Admin | nur Admin | nur Admin |
| `todo_checks` | alle im Tenant | Assistent (nur `done_by = auth.uid()`) + Admin | Admin (Korrekturen) | Admin; Assistent nur eigene, z. B. < 24 h („aus Versehen abgehakt") |
| `todos` | alle im Tenant; optional nur `assignee_id in (null, ich)` | nur Admin | Admin alles; Assistent nur `status/done_by/done_at/note` und nur wenn `assignee_id in (null, ich)` | nur Admin |

Spalten-genaue Update-Beschränkung für Assistenten wie beim Bestandsmuster über `with check` +
Trigger oder eine kleine RPC (`complete_todo(p_id, p_note)`) lösen — RPC ist einfacher wasserdicht
zu machen und passt zum vorhandenen Stil (`provision_tenant`, `import_backup`).

## 5. Kombination mit Tätigkeiten (`activities`)

`activities` ist heute ein reiner Katalog (`name`, `active`, `sort_order`), an dem Zeiteinträge
hängen. Kopplung bewusst **lose** über nullable `activity_id`:

- Template „Mistkübel ausräumen" → `activity_id` = „Haushalt": beim Abhaken kann die UI anbieten,
  direkt einen Zeiteintrag mit dieser Tätigkeit zu erzeugen (Vorbefüllung, kein Zwang).
- Auswertbar: „welche Aufgaben gehören zu welcher Tätigkeit", Erledigungen je Tätigkeit.
- KEINE Vererbung von Pflichten in den Tätigkeiten-Katalog — der Katalog bleibt, was er ist.

## 6. UI-Skizze

- **Assistenten-Sicht** (Dashboard oder eigener Nav-Punkt „Aufgaben"):
  „Mein Dienst heute" → Checkliste (per_shift-Templates des Tenants, ggf. auf mich gefiltert)
  + fällige Einmalaufgaben (offen, `due_date` ≤ heute+X oder ohne Datum). Abhaken = 1 Tap,
  optional Notiz. Erledigt-Zustand realtime (Bestand: Realtime läuft schon für notifications).
- **Arbeitgeber-Sicht** `admin/aufgaben`: Templates pflegen (CRUD, Reihenfolge, Tätigkeit,
  Zuweisung), Einmalaufgaben anlegen, **Überwachung**: Matrix „Dienst × Template → erledigt von/um",
  offene Einmalaufgaben, überfällige markiert.
- **Benachrichtigungen** über bestehendes `notifications`-System: neue Einmalaufgabe → Assistent;
  optional „Dienst endete, Aufgabe X nicht abgehakt" → Arbeitgeber (das wäre der einzige Cron-Anteil,
  kann in bestehende Cron-Struktur pro active-Org eingehängt werden — v2, nicht MVP).

## 7. Entscheidungen Thomas (geklärt 2026-07-05)

1. **Pro Dienst** — zwei Dienste am selben Tag → zweimal abhaken. (Modell wie oben.)
2. **Beides** — Templates via nullable `assignee_id` für alle ODER eine bestimmte Person.
3. **MIT Abnahme** — Assistent hakt ab, Arbeitgeber bestätigt. → Zusatzspalten `confirmed_by`/`confirmed_at` auf `todo_checks` und `todos` + Bestätigen-Aktion in der Admin-Matrix. Unbestätigt ≠ unerledigt: Abhaken zählt, Abnahme ist zweite Ebene.
4. **Keine Fotos** im MVP (v2, Supabase Storage).
5. **daily/weekly gleich im MVP** — `recurrence` voll umsetzen inkl. partiellem Unique-Index (`(template_id, check_date) where slot_id is null`) und Checklisten-UI auch ohne Dienst-Bezug (Tages-Checkliste).
6. **Zeiteintrag-Kopplung später** — MVP nur `activity_id` im Datenmodell + Anzeige; Ein-Tap-Zeiteintrag-Flow ist v2.

## 8. Umsetzungsplan (freigegeben 2026-07-05)

1. ~~Fragen aus §7 klären~~ → erledigt, Modell final (inkl. Abnahme + daily/weekly).
2. Migration `0014_todos.sql` + `down/` (Composite-FKs!, RLS, ggf. RPC `complete_todo`), Staging einspielen.
3. RLS-Tests erweitern (`__tests__/rls-cross-tenant/`, Muster all-tables: Cross-Tenant-Isolation, Assistent-darf-nur-eigenes).
4. Typen (`types/database.ts`), UI Assistent + Admin, Nav.
5. tsc + build + Testsuite (NUR gegen Staging!), Staging-Abnahme, dann Prod (0014 + Deploy zusammen).
