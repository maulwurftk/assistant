# Abgleich Abgabenbescheid Minijob-Zentrale vs. App (Juli 2026)

Stand: 2026-08-03 · Auslöser: Abgabenbescheid der Minijob-Zentrale vom 04.07.2026
(Betriebsnummer 80417610, fällige Abgaben 239,92 € zum 31.07.2026)

## Was falsch war

Die `payroll_settings` der App (Mandant "Karas") waren mit den Pauschalabgabensätzen
für **gewerbliche Minijobs** befüllt, nicht mit denen des **Haushaltsscheck-Verfahrens**
(private Haushalte), das hier tatsächlich gilt.

| Satz | falsch (App, vorher) | korrekt (Haushaltsscheck, seit 01.01.2026) |
|---|---|---|
| KV-Pauschale (AG) | 13,00 % | 5,00 % |
| RV-Pauschale (AG) | 15,00 % | 5,00 % |
| Umlage 1 (Krankheit/Kur) | *(Feld existierte gar nicht)* | 0,80 % |
| Umlage 2 (Mutterschaft) | 0,24 % | 0,22 % |
| Insolvenzgeldumlage | 0,06 % | 0,00 % (im Haushaltsscheck-Verfahren nicht vorgesehen) |
| RV-Aufstockung AN (falls nicht befreit) | 3,60 % | 13,60 % |
| Unfallversicherung | 1,60 % | 1,60 % (unverändert) |

Zusätzlich waren **Antonia Kleinert** und **Lisa Kapfer** in der App mit
`rv_pflicht = true` hinterlegt (RV-Aufstockung wird abgezogen). Die Original-
Haushaltsscheck-Anmeldungen beider Beschäftigungsverhältnisse zeigen jedoch bei
Punkt 10 ("möchte selbst Pflichtbeiträge zur Rentenversicherung zahlen") jeweils
**Nein** angekreuzt — das bedeutet automatische Befreiung von der
Rentenversicherungspflicht, sofern die Minijob-Zentrale nicht innerhalb eines
Monats widerspricht. Das erklärt auch, warum der Abgabenbescheid für beide in
jeder Periode einen RV-AN-Anteil von 0,00 € ausweist.

Weil die App im **Bezirk-Modus** läuft (der Bezirk zahlt 20 €/h pauschal inkl.
aller AG-Kosten, der tatsächliche Bruttolohn wird daraus zurückgerechnet), hat
der zu hoch angenommene AG-Kostenanteil den berechneten Bruttolohn pro Stunde
nach unten verzerrt — die Assistentinnen bekamen dadurch zu wenig ausgezahlt.

## Was behoben wurde

- **Code** (`src/lib/payroll.ts` + alle Anzeigeseiten: `SettingsForm.tsx`,
  `[year]/[month]/page.tsx`, `zeitraum/page.tsx`, `print/page.tsx`,
  `send-email/route.ts`, `settings/route.ts`, `types/database.ts`):
  - Neues Feld **U1** (Umlage 1) vollständig ergänzt (Interface, Berechnung,
    Formular, Anzeige, DB-Spalte).
  - Default-Sätze (`MINIJOB_RATES`) auf Haushaltsscheck-Werte umgestellt.
- **Datenbank (Produktion)**: Migration `supabase-migration-haushaltsscheck-rates.sql`
  angewendet — neue Spalte `mj_u1`, korrigierte Sätze für `payroll_settings`
  (Mandant Karas, `minijob_mode = true`).
- **Profile**: `rv_pflicht` für Kleinert und Kapfer auf `false` gestellt
  (entspricht den unterschriebenen Anmeldungen).
- `tsc --noEmit` fehlerfrei geprüft (auf dem echten Rechner, nicht im
  Sandbox-Mount — siehe bekannte Sandbox-Falle mit NUL-Padding).

## Nachzahlung

**An die Minijob-Zentrale:** nichts zusätzlich. Die 239,92 € auf dem Bescheid
sind bereits mit den korrekten Sätzen berechnet und werden automatisch per
SEPA-Lastschrift eingezogen (~30.07.2026, ein Werktag vor Fälligkeit).

**An die Assistentinnen** (Soll laut korrigierter Berechnung, Ist = tatsächlich
überwiesenes Netto):

| | Mai | Juni | Summe |
|---|---|---|---|
| **Antonia Kleinert** | Soll 558,37 € / Ist 467,75 € → **90,62 €** | Soll 549,64 € (31,5 h lt. Lohnzettel) / Ist 401,97 € → **147,67 €** | **238,29 €** |
| **Lisa Kapfer** | Soll 273,67 € / Ist 243,23 € → **30,44 €** | Soll 529,10 € / Ist 470,25 € → **58,85 €** | **89,29 €** |

Kein RV-AN-Abzug bei beiden (Befreiung siehe oben), daher Soll = Brutto = Netto.

## Offener Punkt

Kleinerts Juni-Kalender in der App zeigt aktuell 30,5 h (Summe der einzelnen
Termine), der Lohnzettel weist 31,5 h aus. Welcher Termin die fehlende Stunde
betrifft, ist noch nicht identifiziert — dazu wird noch der genaue Termin
gebraucht (fehlender Einsatz oder falsche Endzeit an einem bestehenden Termin),
bevor der App-Kalender nachträglich korrigiert wird.
