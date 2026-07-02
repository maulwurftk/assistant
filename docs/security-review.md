# Security-Review

_Manueller Sicherheits-Review der App (Fokus: Auth, RLS, Token-Endpoints, Service-Role-Nutzung, neue Konto/HA/Push-Routen). Kein automatisierter Scan._

## Zusammenfassung

Insgesamt solide Grundstruktur: RLS ist auf den Kern-Tabellen aktiv, Admin-Routen prüfen die Rolle, Tokens sind pro Profil zufällig. **Drei Payroll-API-Routen prüften nur „eingeloggt", nicht „Admin"** – das wurde in diesem Durchgang behoben. Ein echter Missbrauchsvektor (beliebiger E-Mail-Versand) wurde geschlossen.

| # | Fund | Schwere | Status |
|---|------|---------|--------|
| 1 | `send-email`: jeder eingeloggte User konnte Mails an beliebige Adresse + beliebigen Namen auslösen | **Mittel** | ✅ behoben |
| 2 | `payroll/settings` POST ohne Admin-Check | Niedrig (RLS schützte) | ✅ behoben |
| 3 | `payroll/assistant-settings` POST ohne Admin-Check | Niedrig (RLS schützte) | ✅ behoben |
| 4 | Tokens in URL-Query (`calendar.ics`, `ha/status`) | Niedrig | ⚠️ akzeptiert (siehe unten) |
| 5 | Proxy-Allowlist umgeht Session-Redirect für Token/Cron-Routen | Info | ✅ korrekt (Eigen-Auth vorhanden) |

---

## Details

### 1. `send-email` – beliebiger Empfänger (behoben)
**Vorher:** Die Route prüfte nur `if (!user)`. Empfänger (`assistantEmail`), Name (`assistantName`) und Stundensatz kamen aus dem Request-Body. Ein eingeloggter Assistent hätte über die App-Domain (Resend) E-Mails an beliebige Adressen mit beliebigem Namen versenden können → Spam/Phishing über deine Domain-Reputation, HTML-Injection über `assistantName`.

**Fix:**
- Admin-Rollenprüfung ergänzt (403 sonst).
- **Empfänger + Name werden jetzt aus der DB** (`profiles` per `assistantId`) gelesen, nie aus dem Body. Body-`assistantName`/`assistantEmail` werden ignoriert.

### 2 + 3. Fehlende Admin-Checks bei `settings` / `assistant-settings` (behoben)
**Vorher:** Nur `if (!user)`. Ein Assistent hätte die Requests absetzen können. **RLS hat den Schreibzugriff faktisch blockiert** (Policies „Admins manage payroll settings" bzw. „Admins can update profiles"), daher niedrige Schwere. Trotzdem als Defense-in-Depth explizite Rollenprüfung ergänzt (403), damit die App nicht allein auf RLS als einzige Schicht baut.

### 4. Tokens in der URL-Query
`calendar.ics` und `ha/status` authentifizieren über `?token=<ical_token>`. URLs können in Server-/Proxy-Logs und Browser-History landen. Das ist bei iCal-Feeds **branchenüblich** (Kalender-Clients unterstützen keine Header) und der Token ist widerrufbar (`POST /api/ical-token` erzeugt neuen). Für `ha/status` gilt dasselbe Token; Inhalt = Namen + Einsatzplan (kein Hochrisiko). **Akzeptiert.** Optional härtbar: separater HA-Token, Rotationshinweis.

### 5. Proxy-Allowlist (Kontext-Info)
`src/proxy.ts` nimmt `/api/ha/`, `/api/calendar.ics`, `/api/send-monthly-reminders`, `/api/remind-open-slots` vom Login-Redirect aus. Das ist **korrekt**, weil diese Routen **eigene** Auth haben: Cron-Routen verlangen `Bearer $CRON_SECRET`, Token-Routen den `ical_token`. Ohne die Ausnahme hätten sie eine HTML-Login-Seite statt JSON/iCal zurückgegeben.

---

## Geprüft & unauffällig

- **RLS aktiv** auf `profiles`, `time_entries`, `calendar_slots`, `monthly_reports`, `notifications`, `payroll_settings`, `payroll_runs`, `account_ledger` (Admin-only), `push_subscriptions` (User-own).
- **Admin-Routen** (`create-user`, `admin/time-entries*`, `admin/calendar-slots`, `admin/…/template*`) prüfen `role === 'admin'`.
- **`ical-token`**: liest/rotiert nur das **eigene** Profil (`eq('id', user.id)`) – kein Fremd-Token-Leak.
- **`konto`-Routen**: Admin-Check via `requireAdmin()`; Service-Role nur nach bestätigter Rolle; idempotente Inserts via `dedup_key`.
- **`push/subscribe`**: an `user.id` gebunden.
- **SQL-Injection**: durchgängig Supabase-Query-Builder (parametrisiert); Datumswerte aus `new Date()` bzw. regex-validiertem `from/to`.
- **Service-Role-Key** nur serverseitig (API-Routen), nie im Client-Bundle.

---

## Empfehlungen (offen, nicht kritisch)

1. **Secrets rotieren**, falls Repo/Logs je geteilt wurden (`SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`).
2. **Rate-Limiting** auf E-Mail-/Benachrichtigungs-auslösenden Routen (Missbrauch/Kosten).
3. **VAPID-Keys** aus dem Chatverlauf gelten als kompromittiert-nah – bei echtem Rollout neu generieren und nur als Env-Var halten.
4. **Audit-Log** für sensible Aktionen (Lohnversand, Settings-Änderung, Ledger-Buchungen), sobald mehr als eine Person Admin ist.
5. Bei SaaS/Multi-Tenant (siehe `multi-tenancy-analyse.md`): MFA für Admins, Cross-Tenant-RLS-Tests.
