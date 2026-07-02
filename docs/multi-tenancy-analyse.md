# Multi-Tenancy-Analyse

_Stand: Analyse für die Frage „Kann die App mit anderen Arbeitgebern (persönliche Assistenz / Arbeitgebermodell) geteilt werden?"_

## Kurzfassung

Die App ist heute **Single-Tenant**: ein Arbeitgeber, eine `payroll_settings`-Zeile, ein Kreis von Assistent:innen, ein Bezirk-Konto. Für echtes Teilen mit anderen gibt es **zwei grundverschiedene Wege**:

| Weg | Aufwand | Datenschutz-Last | Empfehlung |
|-----|---------|------------------|------------|
| **A) Self-Host-Vorlage** (jeder betreibt eigene Instanz) | gering | liegt beim Betreiber | ✅ risikoarmer Einstieg |
| **B) Gehostetes SaaS** (eine Instanz, viele Mandanten) | hoch | liegt bei dir | erst bei belegter Nachfrage |

Diese Analyse beschreibt, was Weg B technisch erfordert – und warum A vorher sinnvoll ist.

---

## 1. Ist-Zustand (Single-Tenant)

- **Keine `tenant`/`organization`-Ebene.** Alle Tabellen hängen direkt an `profiles` (Rolle `admin` oder `assistant`).
- **`payroll_settings`**: genau eine Zeile (`.limit(1).single()` an vielen Stellen). Stundensatz, Bezirkssatz, Beitragssätze, Budget – global.
- **`account_ledger`** (virtuelles Konto): ein Kontobuch, RLS = „alle Admins".
- **RLS-Modell**: Trennung nur zwischen `admin` (sieht alles) und `assistant` (sieht Eigenes). Es gibt **keine** Trennung zwischen verschiedenen Arbeitgebern – jeder Admin sähe alle Daten.
- **Ein Admin = Vollzugriff auf ALLES.** In einer geteilten Instanz wäre das ein Totalausfall der Mandantentrennung.

**Fazit:** In der jetzigen Form würde ein zweiter Arbeitgeber die Daten des ersten sehen. Teilen ohne Umbau ist ausgeschlossen.

---

## 2. Weg A – Self-Host-Vorlage (empfohlen für den Start)

Jeder Interessent betreibt seine **eigene** Supabase- + Vercel-Instanz aus demselben Code.

**Vorteile**
- Kein Umbau der Datenlogik nötig – der Single-Tenant-Code bleibt korrekt.
- **Du verarbeitest keine fremden personenbezogenen Daten** → die DSGVO-Verantwortung (AVV, Löschkonzept, TOMs) liegt beim jeweiligen Betreiber, nicht bei dir.
- Beitragssätze sind seit dem letzten Update pro Instanz pflegbar (kein Code-Deploy nötig).

**Zu tun**
1. `README` mit Setup-Anleitung (Supabase-Projekt, Migrations-Reihenfolge, Env-Vars, Vercel-Deploy).
2. Migrations bündeln / nummerieren (aktuell viele einzelne `supabase-migration-*.sql`) → eine geordnete Ausführungsliste oder ein Setup-Script.
3. Secrets sauber dokumentieren (`SUPABASE_*`, `RESEND_API_KEY`, `CRON_SECRET`, `VAPID_*`).
4. Lizenz + Disclaimer (ist eingebaut).

**Aufwand:** ~1 Tag Doku + Aufräumen. Kein Architekturumbau.

---

## 3. Weg B – Gehostetes SaaS (Multi-Tenant)

Eine Instanz, viele Arbeitgeber. Deutlich mehr Arbeit **und** rechtliche Verantwortung.

### 3.1 Datenmodell

- Neue Tabelle **`organizations`** (Mandant): `id`, `name`, `created_at`, Plan/Status.
- **`tenant_id`** (FK auf `organizations`) auf **allen** fachlichen Tabellen:
  `profiles`, `time_entries`, `calendar_slots`, `monthly_reports`, `notifications`,
  `payroll_settings`, `payroll_runs`, `account_ledger`, `push_subscriptions`,
  `activities`, `unavailability`.
- `payroll_settings` wird **pro Tenant** eine Zeile (heute global) → alle `.limit(1).single()`-Abfragen müssen auf `tenant_id` filtern.
- Rollen erweitern: `superadmin` (du, plattformweit) vs. `admin` (nur eigener Tenant).

### 3.2 RLS (der kritische Teil)

Jede Policy muss zusätzlich `tenant_id = current_tenant()` prüfen. Muster:

```sql
-- Tenant-Zugehörigkeit des eingeloggten Users
create or replace function public.current_tenant() returns uuid
  language sql stable as $$
    select tenant_id from public.profiles where id = auth.uid()
  $$;

-- Beispiel: nur Daten des eigenen Tenants
create policy "tenant_isolation" on public.time_entries for all
  using (tenant_id = public.current_tenant())
  with check (tenant_id = public.current_tenant());
```

**Risiko:** RLS ist die einzige Schutzschicht. Ein Fehler in **einer** Policy = Datenleck über Mandanten hinweg. Erfordert systematische Tests (jede Tabelle, jede Operation, Cross-Tenant-Zugriff muss scheitern).

### 3.3 Anwendungscode

- **Service-Role-Routes** (bypassen RLS!) müssen `tenant_id` manuell erzwingen. Betroffen: `konto`, `ha/status`, `send-email`, `notify-admin`, `remind-open-slots`, `send-monthly-reminders`, `create-user`, `calendar.ics`. Jede dieser Routen ist heute „ein Tenant" – jede braucht Tenant-Scoping.
- Onboarding-Flow: Registrierung eines neuen Arbeitgebers legt `organization` + ersten `admin` an.
- Token-Endpoints (`ha/status`, `calendar.ics`): Token muss eindeutig einem Tenant zugeordnet bleiben (ist es via Profil, aber Query muss zusätzlich tenant-scopen).

### 3.4 Betrieb & Recht

- **DSGVO**: Du wirst Auftragsverarbeiter für fremde Beschäftigtendaten → AVV-Muster, Datenschutzerklärung, Verzeichnis von Verarbeitungstätigkeiten, Löschkonzept, TOMs, Hosting-Standort EU.
- **StBerG**: Sätze/Berechnungen für Dritte bereitzustellen kann als geschäftsmäßige Hilfeleistung in Steuersachen ausgelegt werden → Disclaimer nötig (eingebaut), im Zweifel anwaltlich prüfen.
- **Backups, Monitoring, Support, Update-Pfad** für Beitragssatz-Änderungen (zentral statt pro Self-Host).
- **Auth-Härtung**: MFA für Admins, Rate-Limiting, Audit-Log.

### 3.5 Aufwandsschätzung Weg B

| Block | grobe Größe |
|-------|-------------|
| Datenmodell + Migration `tenant_id` überall | mittel–groß |
| RLS-Policies neu + Cross-Tenant-Tests | groß (fehleranfällig) |
| Service-Role-Routes tenant-scopen | mittel |
| Onboarding/Registrierung/Billing | mittel–groß |
| DSGVO-/Rechts-Setup | extern, laufend |

→ **Wochen, nicht Tage** – plus laufende Verantwortung.

---

## 4. Empfehlung

1. **Jetzt:** Weg A vorbereiten (Doku + Migrations ordnen). Risikoarm, kein Architekturumbau.
2. **Validieren:** 2–3 Leute im Arbeitgebermodell die Self-Host-Variante testen lassen. Wollen sie es? Wo klemmt's?
3. **Erst bei belegter Nachfrage:** Weg B mit Tenant-Ebene + RLS-Testsuite + rechtlicher Beratung.

Die seit diesem Update konfigurierbaren Beitragssätze und der `payroll_enabled`-Schalter sind bereits Voraussetzungen, die beide Wege leichter machen.
