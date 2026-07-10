# Domain-Umzug: karas.pro → charmely.cloud

Ziel-Domain: **assistenz.charmely.cloud** (ersetzt `assistenz.karas.pro`)

Stand: Code ist vorbereitet (siehe unten „Bereits erledigt"). Die verbleibenden
Schritte sind extern (Cloudflare, Vercel, Supabase, Resend) und müssen in
dieser Reihenfolge gemeinsam durchgeführt werden.

## Bereits erledigt (Code)

- [x] Hardcoded Fallback-Domains in 6 API-Routen auf `assistenz.charmely.cloud`
      bzw. `noreply@charmely.cloud` vereinheitlicht (remind-open-slots,
      slot-request, notify-admin, send-monthly-reminders, payroll/send-email,
      calendar.ics)
- [x] Home-Assistant-Beispielkonfiguration (`home-assistant/README.md`,
      `home-assistant/assistenten.yaml`) auf neue Domain aktualisiert
- [x] `.env.local.prod-backup` mit TODO-Kommentaren versehen (Werte selbst
      NICHT umgestellt — erst nach DNS/Resend-Verifizierung live setzen)

## Noch offen (gemeinsam, in dieser Reihenfolge)

### 1. Cloudflare: Domain vorbereiten — ✅ erledigt (2026-07-06)
- [x] `charmely.cloud` in Cloudflare als Zone angelegt
- [x] Nameserver zeigen auf Cloudflare

### 2. Vercel: Domain zuordnen — ✅ erledigt (2026-07-06)
- [x] `assistenz.charmely.cloud` in Vercel hinzugefügt
- [x] CNAME bei Cloudflare angelegt, Zertifikat aktiv —
      `assistenz.charmely.cloud` ist erreichbar und funktioniert bereits

### 3. Supabase Dashboard (kritisch — sonst bricht Login) — ✅ erledigt (2026-07-06)
- [x] Bestätigt (2026-07-06): Dashboard lädt eingeloggt mit echten Daten unter
      `assistenz.charmely.cloud` — bestehende Session/normaler Login funktioniert
- [x] Authentication → URL Configuration → **Site URL** auf
      `https://assistenz.charmely.cloud` gesetzt
- [x] **Redirect URLs** ergänzt: `https://assistenz.charmely.cloud` (mit `https://`-Präfix,
      ohne Präfix wurde die Eintragung von Supabase nicht als gültiger Origin akzeptiert)
- [x] **Passwort-Reset getestet und funktioniert** (E-Mail kommt an, Link führt auf
      `assistenz.charmely.cloud/passwort-zuruecksetzen`) — dabei zusätzliche Falle
      gefunden: Authentication → Emails → **SMTP Settings → Sender email address**
      stand noch auf `noreply@karas.pro` (eigener, von Site-URL/Redirect-URLs
      unabhängiger Einstellungspunkt) und brach den Mailversand mit 500
      („karas.pro domain is not verified"). Auf `noreply@charmely.cloud` korrigiert.

### 4. Resend: Absenderdomain verifizieren — ✅ erledigt (2026-07-06)
- [x] In Resend: Domain `charmely.cloud` hinzugefügt
- [x] SPF-/DKIM-/DMARC-Records automatisch von Resend in Cloudflare angelegt
- [x] Verifizierung in Resend abgeschlossen (Status „Verified")
- [x] `FROM_EMAIL=noreply@charmely.cloud` in Vercel-Env (Production) gesetzt

### 5. Vercel Environment Variable — ⏳ läuft (Deploy von Commit 3bd7713)
- [ ] `NEXT_PUBLIC_APP_URL=https://assistenz.charmely.cloud/` in Vercel (Production)
      setzen — Zertifikat ist bereits aktiv, kann also jetzt gesetzt werden
- [x] `FROM_EMAIL=noreply@charmely.cloud` gesetzt (siehe Schritt 4)
- [x] Deployment über sauberen Git-Push getriggert (Commit `3bd7713` auf
      `main`/`staging`) statt über den kaputten Redeploy-Dialog — aktuell im Bau
- [ ] Nach Abschluss: Deployment-URL/SHA in Vercel gegen `3bd7713` prüfen

### 6. Alte Domain
- [ ] `assistenz.karas.pro` in Vercel als Redirect auf `assistenz.charmely.cloud`
      belassen (nicht sofort löschen) — vermeidet kaputte Bookmarks/Links in
      alten E-Mails
- [ ] Nach ein paar Wochen stabilem Betrieb: alte Redirect-URLs aus Supabase
      entfernen, alte Domain aus Vercel entfernen

## Risiko

Der einzige Schritt mit echtem Ausfallrisiko ist Schritt 3 (Supabase Site
URL/Redirects). Wird das nicht synchron mit der DNS-Umstellung gemacht, können
Login und Passwort-Reset für alle Mandanten kurzzeitig fehlschlagen. Am besten
Schritt 2 und 3 im selben Zeitfenster durchführen.
