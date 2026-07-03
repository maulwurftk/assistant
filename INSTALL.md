# Eigene Instanz aufsetzen (Self-Host)

So richtest du in **~20 Minuten** eine eigene, unabhängige Instanz der Assistenten-App ein.
Jede Instanz hat ihre **eigenen Daten** (eigenes Supabase-Projekt) – nichts wird geteilt.

> **Selbstverantwortung:** Als Betreiber:in bist du für deine Instanz und die darin
> gespeicherten Daten selbst verantwortlich (u.a. DSGVO). Die App unterstützt bei der
> Organisation und ersetzt **keine** Steuer- oder Lohnabrechnungsberatung.

Du brauchst zwei kostenlose Konten: **Supabase** (Datenbank + Login) und **Vercel** (Hosting).

---

## 1 · Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) einloggen → **New project**.
2. Name + Datenbank-Passwort vergeben, **Region: EU** (Frankfurt) wählen. Anlegen.
3. Warten, bis das Projekt bereit ist (~2 Min).

## 2 · Datenbank-Schema einspielen

1. Im Supabase-Projekt links auf **SQL Editor** → **New query**.
2. Den **kompletten Inhalt** von [`supabase/schema.sql`](supabase/schema.sql) einfügen.
3. **Run** klicken. Es sollte „Success" erscheinen (kann man gefahrlos wiederholen).

## 3 · Zugangsdaten kopieren

Unter **Project Settings → API** findest du:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** Key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** Key (geheim!) → `SUPABASE_SERVICE_ROLE_KEY`

## 4 · E-Mail-Bestätigung ausschalten (empfohlen)

Damit du dich sofort einloggen kannst:
**Authentication → Providers → Email** → „**Confirm email**" **deaktivieren**.
(Oder Nutzer später manuell bestätigen.)

## 5 · Push-Schlüssel erzeugen (optional, aber empfohlen)

Einmalig im Terminal:
```bash
npx web-push generate-vapid-keys
```
Ergibt einen **Public** und einen **Private Key** → für `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
und `VAPID_PRIVATE_KEY`. `VAPID_EMAIL` auf `mailto:deine@mail.de` setzen.

## 6 · Auf Vercel deployen

1. Auf [vercel.com](https://vercel.com) einloggen → **Add New… → Project**.
2. Dieses Git-Repository importieren (bzw. deinen Fork davon).
3. **Environment Variables** setzen – alle Werte aus [`.env.example`](.env.example):
   - Pflicht: die 3 Supabase-Werte + `NEXT_PUBLIC_APP_URL`
     (die spätere Vercel-URL, z.B. `https://meine-app.vercel.app`)
   - Empfohlen: die VAPID-Keys + `CRON_SECRET` (ein langes Zufallsgeheimnis)
   - Optional: `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL` (für E-Mail-Versand)
4. **Deploy** klicken.

> ⚠️ Nach dem ersten Deploy die tatsächliche Vercel-URL als `NEXT_PUBLIC_APP_URL`
> eintragen und **einmal neu deployen** – `NEXT_PUBLIC_*`-Variablen werden beim Build
> fest eingebacken.

## 7 · Ersten Admin anlegen (Bootstrap)

Die App hat keine öffentliche Registrierung – der erste Admin wird von Hand angelegt:

1. Supabase → **Authentication → Users → Add user**: E-Mail + Passwort eingeben
   (**Auto Confirm User** aktivieren). Anlegen.
2. In der Users-Liste die **User-UID** dieses Nutzers kopieren.
3. Supabase → **SQL Editor**, ausführen (UID + Daten anpassen):
   ```sql
   insert into public.profiles (id, email, full_name, role)
   values ('HIER-USER-UID', 'admin@deine-mail.de', 'Vorname Nachname', 'admin');
   ```
4. Auf `https://deine-app.vercel.app/login` mit diesen Daten einloggen. Fertig – weitere
   Assistent:innen und Admins legst du dann bequem in der **Benutzerverwaltung** an.

## 8 · Automatische Erinnerungen (optional)

Damit „offene Slots in 48 h" und „Monatsabschluss" von selbst erinnert werden, muss ein
Scheduler zwei Routen aufrufen. Am einfachsten mit einem kostenlosen Dienst wie
[cron-job.org](https://cron-job.org):

| Route | Rhythmus | Header |
|-------|----------|--------|
| `POST https://…/api/remind-open-slots` | z.B. täglich 08:00 | `Authorization: Bearer <CRON_SECRET>` |
| `POST https://…/api/send-monthly-reminders` | z.B. am 28. um 08:00 | `Authorization: Bearer <CRON_SECRET>` |

Ohne Scheduler funktioniert alles andere normal – nur diese automatischen Erinnerungen
entfallen.

## 9 · Push am iPhone

Push funktioniert auf iOS **nur aus der installierten PWA**: im Safari die Seite öffnen →
Teilen → „**Zum Home-Bildschirm**" → App von diesem Icon starten → unter
**Benachrichtigungen** „Push testen".

---

## Mehrere Instanzen betreiben

Willst du mehreren Testern je eine eigene Instanz geben, wiederholst du Schritt 1–7 pro
Person: **eigenes Supabase-Projekt + eigenes Vercel-Projekt** (dasselbe Repo mehrfach
deployen ist ok). So bleiben die Daten sauber getrennt.

**Update einer Instanz:** neuen Stand ins Repo → Vercel deployt automatisch. Kommen neue
DB-Spalten/Tabellen dazu, das jeweils zugehörige Migrations-SQL im betreffenden Supabase-
Projekt nachziehen. (Ein automatischer Migrations-Runner ist als nächster Ausbauschritt
vorgesehen, siehe `docs/`.)

---

## Häufige Stolpersteine

- **Login geht nicht / „Invalid credentials":** E-Mail-Bestätigung nicht ausgeschaltet
  (Schritt 4) oder Nutzer nicht „Auto Confirmed".
- **Nach Login leere Seite / kein Zugriff:** Es fehlt die `profiles`-Zeile mit `role='admin'`
  (Schritt 7) oder die UID stimmt nicht mit dem Auth-Nutzer überein.
- **Push „VAPID-Schlüssel fehlt":** VAPID-Keys nicht gesetzt **oder** nach dem Setzen nicht
  neu deployed (Public Key wird beim Build eingebacken).
- **Keine E-Mails:** `RESEND_API_KEY`/`FROM_EMAIL` fehlen oder Domain bei Resend nicht
  verifiziert – die App läuft trotzdem (In-App + Push).
