# Assistenten-App – Einrichtungsanleitung

---

## Schritt 1: Supabase-Projekt erstellen

1. Gehen Sie zu [supabase.com](https://supabase.com) und melden Sie sich an
2. Oben links auf **"New project"** klicken
3. Projektnamen vergeben (z.B. `assistenten-app`), Region wählen, Datenbankpasswort setzen
4. Warten bis das Projekt bereit ist (~1–2 Minuten)

---

## Schritt 2: Datenbank einrichten

1. In der **linken Sidebar** auf **"SQL Editor"** klicken (2. Punkt, direkt unter "Table Editor")
2. Oben rechts auf **"New query"** klicken
3. Öffnen Sie die Datei [`supabase-schema.sql`](./supabase-schema.sql) aus dem Projektordner
4. Den **gesamten Inhalt** kopieren und in das SQL-Fenster einfügen
5. Auf **"Run"** klicken (oder `Strg+Enter`)
6. ✅ Alle Tabellen, Sicherheitsregeln und 10 Starter-Tätigkeiten werden angelegt

**Danach** ebenfalls ausführen — für die Google-Kalender-Synchronisation:
1. Wieder **"New query"**
2. Inhalt der Datei [`supabase-migration-ical.sql`](./supabase-migration-ical.sql) einfügen
3. **"Run"** klicken

---

## Schritt 3: Project URL und API-Keys kopieren

1. In der **linken Sidebar** ganz unten auf **"Project Settings"** klicken (Zahnrad-Icon)
2. Im Settings-Untermenü auf **"API Keys"** klicken

### Project URL
Die Project URL steht **nicht** direkt auf der Seite, sondern muss aus der **Project ID** zusammengebaut werden:

1. Auf der **General**-Seite finden Sie die **Project ID** (z.B. `rqtwlqsfrjnzduzdjrhe`) → auf **"Copy"** klicken
2. Ihre Project URL lautet dann:
   ```
   https://[PROJECT-ID].supabase.co
   ```
   Beispiel: `https://rqtwlqsfrjnzduzdjrhe.supabase.co`

### API Keys

Sie sehen zwei Tabs — bleiben Sie auf **"Publishable and secret API keys"**:

| Was Sie brauchen | Wo im Dashboard | Wohin in `.env.local` |
|---|---|---|
| **Publishable key** (`sb_publishable_...`) | Abschnitt "Publishable key" → Zeile "default" → Copy-Symbol | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **Secret key** (`sb_secret_...`) | Abschnitt "Secret keys" → Zeile "default" → **Auge-Symbol** zum Anzeigen, dann Copy | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ Den **Secret key** niemals veröffentlichen — er darf nur auf dem Server verwendet werden.

> 💡 Falls Sie den alten `eyJ...`-Key-Stil bevorzugen: Tab **"Legacy anon, service_role API keys"** — das funktioniert ebenfalls.

---

## Schritt 4: Umgebungsvariablen befüllen

Im Projektordner `assistenten-app` die Datei `.env.local.example` zu `.env.local` kopieren:
```
copy .env.local.example .env.local
```

`.env.local` in einem Texteditor öffnen und die Werte aus Schritt 3 eintragen:

```env
# Project ID aus Settings → General → "Project ID" → Copy → dann so zusammensetzen:
NEXT_PUBLIC_SUPABASE_URL=https://IHRE-PROJECT-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Schritt 5: Ersten Admin-Benutzer anlegen

Da noch kein Benutzer existiert, legen Sie den ersten Admin direkt in Supabase an.

### 5a – Benutzer anlegen
1. In der **linken Sidebar** auf **"Authentication"** klicken
2. Oben im Bereich auf **"Users"** klicken
3. Rechts oben: **"Add user"** → **"Create new user"**
4. E-Mail und Passwort eingeben → **"Create user"**
5. Den neu angelegten Benutzer in der Liste anklicken → die **User ID (UUID)** kopieren  
   Format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### 5b – Admin-Profil in der Datenbank anlegen
1. In der **linken Sidebar** auf **"SQL Editor"** klicken
2. **"New query"** → folgendes SQL einfügen und Ihre Daten eintragen:

```sql
INSERT INTO public.profiles (id, email, full_name, role, active)
VALUES (
  'IHRE-USER-ID-HIER',        -- UUID aus Schritt 5a
  'ihre@email.de',             -- dieselbe E-Mail wie in Schritt 5a
  'Ihr Vollständiger Name',
  'admin',
  true
);
```

3. **"Run"** klicken
4. ✅ Sie können sich jetzt anmelden

---

## Schritt 6: App lokal starten & testen

```bash
npm run dev
```

Öffnen Sie [http://localhost:3000](http://localhost:3000) — Sie werden automatisch zur Login-Seite weitergeleitet.

**Erste Schritte nach dem Login (als Admin):**
- **Admin → Tätigkeiten**: Die 10 Starter-Tätigkeiten prüfen / eigene ergänzen
- **Admin → Benutzer**: Assistenten anlegen
- **Kalender**: Erste Einsatz-Slots planen

---

## Schritt 7: Online deployen (Vercel)

1. Den Projektordner `assistenten-app` als neues Repository auf **GitHub** hochladen
2. Auf [vercel.com](https://vercel.com) → **"Add New Project"** → GitHub-Repo auswählen
3. Unter **"Environment Variables"** folgende Werte eintragen:

| Variable | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ihre Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ihr Publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ihr Secret key (`sb_secret_...`) |
| `NEXT_PUBLIC_APP_URL` | Ihre Vercel-URL (z.B. `https://assistenten-app.vercel.app`) |

4. **"Deploy"** klicken
5. ✅ Die App läuft jetzt online — auf Handy und PC!

> 💡 Danach in Supabase: **Authentication** → **URL Configuration** → **Site URL** auf Ihre Vercel-URL setzen (damit Login-Links funktionieren)

---

## Schritt 8: E-Mail-Benachrichtigungen aktivieren (optional, empfohlen)

Assistenten erhalten Monats-Erinnerungen per E-Mail, Sie werden benachrichtigt wenn ein Bericht gesendet wurde.

1. Kostenloses Konto auf [resend.com](https://resend.com) erstellen (3.000 E-Mails/Monat gratis)
2. Dort: **API Keys** → **"Create API Key"** → Key kopieren
3. In Vercel (Einstellungen → Environment Variables) eintragen:

```env
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@ihre-domain.de
ADMIN_EMAIL=ihre@email.de
```

---

## Schritt 9: Automatische Monats-Erinnerung einrichten (optional)

Assistenten werden automatisch am Monatsende erinnert, den Monat abzuschließen.

Datei `vercel.json` im Projektordner `assistenten-app` erstellen:
```json
{
  "crons": [{
    "path": "/api/send-monthly-reminders",
    "schedule": "0 8 28-31 * *"
  }]
}
```

In Vercel als Umgebungsvariable hinzufügen:
```
CRON_SECRET=ein-langer-zufaelliger-string-nur-fuer-sie
```

---

## Funktionsübersicht

| Funktion | Benutzer | Seite in der App |
|---|---|---|
| Zeiten eintragen (von/bis + Tätigkeit) | Assistent | `/zeiterfassung` |
| Monat abschließen & an Admin senden | Assistent | `/zeiterfassung` |
| Kalender ansehen | Alle | `/kalender` |
| Einsatz-Slots planen & Assistenten zuweisen | Admin | `/kalender` |
| Neue Benutzer anlegen / deaktivieren | Admin | `/admin/benutzer` |
| Tätigkeiten-Dropdown konfigurieren | Admin | `/admin/taetigkeiten` |
| Monatsberichte einsehen | Admin | `/admin/berichte` |
| Excel-Export (pro Assistent oder alle) | Admin | `/admin/berichte` |
| Benachrichtigungen lesen | Alle | `/benachrichtigungen` |
