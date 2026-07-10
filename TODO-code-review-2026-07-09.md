# Code-Review-Feedback (qwen3.6) — geprüft am 2026-07-09, umgesetzt am 2026-07-10

Ausgangspunkt: Architektur-Feedback von qwen3.6 zu `assistenten-app`, gegen den echten Code verifiziert.

## Erledigt (2026-07-10)

- [x] **Callback-Route-Duplikat aufgelöst.** `src/app/api/auth/callback/route.ts` war toter Code (nirgends im Code referenziert) und wurde gelöscht. `src/app/auth/callback/route.ts` ist die einzig genutzte Route (Registrierung, Passwort-Reset).

- [x] **Parallele Zeiterfassung-Bäume geprüft — kein Duplikat.** `app/(main)/admin/zeiterfassung/` ist die interaktive Admin-Ansicht (mit Sidebar/Nav aus dem `(main)`-Layout). `app/admin/zeiterfassung/bericht/[assistantId]/[year]/[month]/` ist bewusst separat: eigenständige Druckansicht (Anwesenheitsnachweis) außerhalb der `(main)`-Route-Group, damit sie ohne App-Chrome rendert. Kein Handlungsbedarf.

- [x] **Kritischer Fund: Middleware war seit 2026-05-23 tot.** `git log` zeigte, dass eine funktionierende `src/middleware.ts` von einer früheren Claude-Session versehentlich in `src/proxy.ts` umbenannt wurde (Commit "Remove middleware.ts, keep only proxy.ts"). Next.js erkennt nur eine Datei namens exakt `middleware.ts` — die `proxy()`-Funktion wurde seitdem nie aufgerufen (bestätigt über leeres `middleware-manifest.json` im Build sowie fehlende Aufrufstellen im Code). Die App lief seit Mai ohne zentralen Auth-Guard, nur mit den verstreuten Page-Checks als Schutz. **Fix:** Datei zurück nach `src/middleware.ts` benannt (Funktion `middleware` statt `proxy`), `proxy.ts` gelöscht. Über Windows-Pfad verifiziert (nicht nur Mount).

- [x] **`hooks/`-Verzeichnis geprüft — kein Handlungsbedarf.** Keine eigenen Custom Hooks im Code gefunden, weder dupliziert noch einzeln. Ordner erst anlegen, wenn tatsächlich geteilte Hook-Logik entsteht.

## Offen / zur Beobachtung

- [ ] Die wiederhergestellte Middleware macht die 25 verstreuten Page-Level-Auth-Checks redundant, aber nicht falsch (defense in depth). Könnte man mittelfristig aufräumen, ist aber kein akuter Handlungsbedarf.
- [ ] Vor dem nächsten Deploy: kurzen manuellen Test des Login-/Redirect-Flows, da die Middleware jetzt wieder aktiv eingreift (z. B. `/login`-Redirect bei fehlender Session, `/dashboard`-Redirect bei bestehender Session auf `/login`).

## Geprüft und verworfen (falsches oder irreführendes Feedback)

- ~~"Fehlende `lib/`, `components/` at root"~~ — falsch, beide existieren unter `src/`.
- ~~"Theme-Script im `<head>` ist ein Antipattern"~~ — bewusst so gebaut (inline Script vor Hydration liest `localStorage`), verhindert Flash of Wrong Theme. Standard-Next.js-Pattern für Dark-Mode, kein Bug.
- ~~"Tief verschachtelte Routen sind schlecht"~~ — idiomatisches App-Router-Pattern, kein Antipattern per se. Relevanter ist der Punkt oben (zwei parallele Bäume).
