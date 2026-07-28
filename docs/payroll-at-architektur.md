# Lohnabrechnung Österreich — Architekturvorlage

Status: Entwurf für spätere Umsetzung. Kein Code, keine DB-Änderung — nur Bauplan, damit ein künftiger Umbau nicht bei null anfängt.

Bezug: aktuelles DE-Modul in `src/lib/payroll.ts`, `src/app/payroll/**`, `payroll_settings`/`payroll_runs` in `supabase/schema.sql`. Dieses Dokument beschreibt, was sich strukturell ändern müsste, um einen österreichischen Modus als **zweiten, parallelen Modus** (nicht als Ersatz) einzuziehen.

## 1. Warum kein reiner Zahlentausch reicht

Das DE-Modul bildet exakt das deutsche Haushaltsscheck-/Minijob-Verfahren ab:

- Minijob-Zentrale als zentrale Meldestelle, Betriebsnummer als Identifikator
- Pauschalabgaben AG: KV, RV, Pauschsteuer, U1, U2, Insolvenzgeldumlage, UV (BG-Beitrag)
- RV-Pflicht/KV-Pflicht als Schalter pro Assistent:in (`profiles.rv_pflicht`, `profiles.kv_pflicht`)
- "Bezirk-Modus": Kostenträger zahlt Pauschale inkl. AG-Kosten → Rückrechnung auf Brutto

Österreich hat dafür **keine 1:1-Entsprechung**:

- Geringfügige Beschäftigung (eigene Wertgrenze, jährlich angepasst) statt "Minijob" — andere Schwelle, andere Meldebehörde (ÖGK statt Minijob-Zentrale)
- Andere Beitragsarchitektur: DG-Beitrag zur Sozialversicherung, Dienstgeberzuschlag (DZ), Kommunalsteuer, ggf. betriebliche Vorsorge (MVK/"Abfertigung neu") — kein U1/U2/Insolvenzgeldumlage-Schema in dieser Form
- 13. und 14. Monatsgehalt (Urlaubs-/Weihnachtsgeld) ist Standard — im DE-Minijob-Modell nicht vorgesehen
- Kostenträger-Landschaft für persönliche Assistenz unterscheidet sich (Land/Sozialministeriumservice/Pflegegeld je Bundesland) statt "Bezirk zahlt Pauschale" — der Bezirk-Rückrechnungsmodus ist evtl. gar nicht übertragbar und müsste separat geklärt werden, nicht einfach umbenannt

Konsequenz: neues Datenmodell + neue Rechenlogik + neue Labels, nicht nur neue Zahlen in bestehenden Feldern.

## 2. Leitprinzip: Ländermodus statt Umbau

`payroll_settings` bekommt ein Feld `country_mode` (`'de' | 'at'`). Je nach Wert:

- werden unterschiedliche Einstellungs-Sets im UI angezeigt (DE-Minijob-Block vs. AT-Block)
- greift eine andere Berechnungsfunktion (`calculateMinijobDE()` vs. `calculateGeringfuegigAT()`)
- werden unterschiedliche Felder auf Lohnzettel/E-Mail gedruckt

So bleibt das bestehende DE-Modul unangetastet nutzbar, und AT wird additiv ergänzt — kein Breaking Change für bestehende Installationen.

## 3. Datenmodell (Vorschlag)

### 3.1 `payroll_settings` — neue/geänderte Spalten

| Spalte | Typ | Zweck |
|---|---|---|
| `country_mode` | text, default `'de'`, check in (`'de'`,`'at'`) | Schaltet UI + Berechnung |
| `at_geringfuegig_mode` | boolean | Analog zu `minijob_mode`, aber AT-Kontext |
| `at_geringfuegigkeitsgrenze` | numeric(10,2), Default **551,10** (2026, jährlich neu zu pflegen) | Schwelle für steuer-/SV-freie Beschäftigung |
| `at_uv_beitrag` | numeric(5,2), Default **1,10** | Unfallversicherung — Pflicht für jede:n geringfügig Beschäftigte:n, unabhängig von Anzahl |
| `at_mvk_beitrag` | numeric(5,2), Default **1,53** | Betriebliche Vorsorge "Abfertigung neu" — Pflicht ab 2. Beschäftigungsmonat (1. Monat beitragsfrei) |
| `at_dg_abgabe` | numeric(5,2), Default **0** (optional, i.d.R. 16,40 wenn aktiv) | Dienstgeberabgabe — nur bei **mehreren** geringfügig Beschäftigten mit Gesamtentgelt > 1,5× Geringfügigkeitsgrenze (2026: 826,65 €) |
| `at_kommunalsteuer` | numeric(5,2), Default **0** (optional, regulär 3,00) | Nur relevant, wenn Gesamtlohnsumme der Gemeinde den Freibetrag (1.460 €/Monat) übersteigt — bei einem einzelnen privaten Haushalt praktisch nie |
| `at_include_urlaubsgeld` | boolean | 13. Gehalt aliquot mit einrechnen? (nur falls KV/Einzelvertrag das vorsieht, s. 6.3) |
| `at_include_weihnachtsgeld` | boolean | 14. Gehalt aliquot mit einrechnen? (nur falls KV/Einzelvertrag das vorsieht, s. 6.3) |
| `at_dienstgeberkonto_nr` | text | ÖGK-Beitragskontonummer (Pendant zu `employer_tax_number`/Betriebsnummer) |
| `at_kostentraeger_name` | text | Freitext für Kostenträger (SMS bei PA am Arbeitsplatz / Land bei PA außerhalb, s. 6.4), ersetzt starres "Bezirk"-Konzept |

Bestehende DE-Spalten (`minijob_mode`, `bezirk_mode`, `mj_*`) bleiben unverändert erhalten und nur aktiv, wenn `country_mode = 'de'`.

### 3.2 `profiles` — neue Spalte

| Spalte | Typ | Zweck |
|---|---|---|
| `at_svs_pflicht` | boolean, default true | Pendant zu `rv_pflicht`/`kv_pflicht`, falls AT-seitig ein Befreiungstatbestand existiert (z.B. Mehrfachversicherung) |

`rv_pflicht`/`kv_pflicht` bleiben für DE bestehen; AT braucht ggf. ein eigenes, einfacheres Schema (in AT ist bei geringfügiger Beschäftigung i.d.R. nur die Unfallversicherung fix, KV/PV optional selbstversichert — das muss vor Umsetzung rechtlich geklärt werden, siehe Abschnitt 6).

### 3.3 `payroll_runs`

Keine strukturelle Änderung nötig — `total_pay` bleibt Endsumme, Details wandern in eine neue, versionierte JSON-Spalte:

| Spalte | Typ | Zweck |
|---|---|---|
| `breakdown_json` | jsonb | Snapshot der Berechnungsdetails (welche Abgaben, welche Sätze, welcher `country_mode` zum Zeitpunkt der Abrechnung) — wichtig für Nachvollziehbarkeit bei späteren Satzänderungen |

Diese Spalte ist auch für DE sinnvoll nachrüstbar (aktuell wird nur `hourly_rate`/`total_pay` gespeichert, keine historischen Einzelsätze — bei Satzänderung ist ein alter Lohnzettel heute nicht mehr exakt reproduzierbar).

## 4. Rechenlogik (`src/lib/payroll.ts`)

Vorschlag: bestehende Minijob-Funktionen unverändert lassen, neue Funktionen daneben:

```
export interface AtRates {
  dgBeitrag: number
  dz: number
  kommunalsteuer: number
  mvkBeitrag: number
  uvBeitrag: number
}

export interface AtBreakdown {
  brutto: number
  urlaubsgeldAnteil: number   // aliquot, falls aktiviert
  weihnachtsgeldAnteil: number
  bruttoGesamt: number        // brutto + Sonderzahlungsanteile
  netto: number                // AN-seitige Abzüge, falls unterhalb Geringfügigkeit ggf. 0
  dgBeitragAmount: number
  dzAmount: number
  kommunalsteuerAmount: number
  mvkAmount: number
  uvAmount: number
  totalAGAbgaben: number
  totalKosten: number
}

export function calculateGeringfuegigAT(
  brutto: number,
  rates: AtRates,
  options: { includeUrlaubsgeld: boolean; includeWeihnachtsgeld: boolean }
): AtBreakdown
```

Wichtig: Die Funktion braucht schon in der Signatur die Sonderzahlungs-Option, weil das der materielle Unterschied zu DE ist (nicht nur andere Prozentsätze).

`ratesFromSettings()` bekommt ein AT-Pendant (`atRatesFromSettings()`), analog zum bestehenden Muster (Fallback auf Default, wenn Spalte null).

Kein Bezirk-Rückrechnungs-Pendant vorsehen, bis Abschnitt 6 geklärt ist — nicht blind aus DE übernehmen.

## 5. UI (`src/app/payroll/settings/_components/SettingsForm.tsx`)

- Ganz oben: Auswahl `country_mode` (Radio: Deutschland / Österreich), analog zum bestehenden Aufbau
- Der komplette Block "Minijob-Modus" + "Bezirk-Modus" wird nur bei `country_mode === 'de'` gerendert
- Neuer Block "Geringfügige Beschäftigung (AT)" nur bei `country_mode === 'at'`:
  - Checkbox `at_geringfuegig_mode` (analog `minijobMode`)
  - Tabelle der AT-Sätze (analog `RATE_FIELDS`, aber mit AT-Labels: "DG-Beitrag SV", "Dienstgeberzuschlag (DZ)", "Kommunalsteuer", "Betriebliche Vorsorge (MVK)", "Unfallversicherung (AUVA)")
  - Zwei Checkboxen: "13. Gehalt aliquot einrechnen" / "14. Gehalt aliquot einrechnen"
  - Feld `at_dienstgeberkonto_nr` statt `employer_tax_number`-Label "Betriebsnummer"
  - Freitextfeld `at_kostentraeger_name` statt starrem Bezirk-Konzept

Die restlichen Blöcke (persönliches Budget, private Stunden, Stundensatz/Zähl-Modus) sind länderunabhängig und bleiben unverändert.

## 6. Recherche-Ergebnisse zu den offenen Punkten (Stand: 24.07.2026)

Web-Recherche durchgeführt, damit die Architektur nicht auf Vermutungen aufbaut. Sätze/Werte ändern sich jährlich (v.a. Geringfügigkeitsgrenze) — vor Produktivsetzung gegen den dann aktuellen Stand (WKO, ÖGK) gegenprüfen.

### 6.1 Geringfügigkeitsgrenze 2026

**551,10 €/Monat brutto.** Bis zu diesem Betrag fallen für den AN grundsätzlich keine Lohnsteuer und keine SV-Beiträge an (unverändert gegenüber 2025). [Quelle: everbill](https://www.everbill.com/geringfuegigkeitsgrenze/), [Quelle: FreeFinance](https://www.freefinance.at/versicherungen/geringfuegigkeitsgrenze.html)

→ Damit ist für die AT-Konstante ein eigenes Feld `at_geringfuegigkeitsgrenze` sinnvoll (jährlich manuell zu pflegen, analog zum bestehenden Muster "alle Sätze manuell pflegbar").

### 6.2 Pflichtabgaben unterhalb der Geringfügigkeitsgrenze — deutlich schlanker als DE

Strukturell wichtigster Unterschied zu Deutschland: Solange nur **eine** geringfügig beschäftigte Person angestellt ist, fällt AG-seitig nur **eine** Pflichtabgabe an:

- **Unfallversicherung (UV):** 1,1 % der allgemeinen Beitragsgrundlage — Pflicht für jede:n geringfügig Beschäftigte:n, unabhängig von der Anzahl. [Quelle: WKO](https://www.wko.at/einstellen/geringfuegige-beschaeftigung-sozialrechtlich)
- **Dienstgeberabgabe (16,4 % + 1,1 % UV = 20,5 % gesamt):** fällt nur an, wenn ein:e Arbeitgeber:in **mehrere** geringfügig Beschäftigte hat und deren Gesamtentgelt (ohne Sonderzahlungen) das 1,5-fache der Geringfügigkeitsgrenze übersteigt (2026: 826,65 €). Für eine einzelne Assistenzperson bei einem privaten Arbeitgeber (Assistenznehmer:in) i.d.R. **nicht** relevant, außer es werden mehrere Assistent:innen parallel beschäftigt und deren Summe übersteigt die Schwelle. [Quelle: WKO](https://www.wko.at/einstellen/geringfuegige-beschaeftigung-sozialrechtlich)
- **Betriebliche Vorsorge (MVK / "Abfertigung neu"): 1,53 %** — Pflicht ab dem **2. Monat** des Dienstverhältnisses (1. Monat beitragsfrei), unabhängig von Geringfügigkeit. [Quelle: WKO](https://www.wko.at/lohnverrechnung/abfertigung-neu-betriebliche-vorsorgekasse)
- **Kommunalsteuer:** grundsätzlich 3 %, aber es gibt einen monatlichen Freibetrag von 1.460 € Lohnsumme pro Gemeinde — bei einem einzelnen privaten Haushalt als Arbeitgeber wird diese Schwelle so gut wie nie erreicht, Kommunalsteuer fällt also in der Praxis meist **nicht** an. Vor Umsetzung trotzdem als Kann-Feld vorsehen, nicht hart auf 0 setzen.
- **Dienstnehmer:innen-Beitrag (14,12 %):** existiert nur, wenn sich die geringfügig beschäftigte Person **freiwillig selbst** kranken-/pensionsversichert. Das ist **keine** Lohnabzugs-Position, sondern eine separate, einmal jährlich fällige Zahlung der AN direkt an die ÖGK — fließt nicht in die Lohnabrechnung des Arbeitgebers ein und sollte im Modul nicht als Abzug vom Brutto behandelt werden. [Quelle: WKO](https://www.wko.at/lohnverrechnung/abfertigung-neu-betriebliche-vorsorgekasse)

Ergebnis für Abschnitt 4 (Rechenlogik): Der Normalfall "eine Assistenzperson, ein Kostenträger" braucht im Kern nur **UV (1,1 %) + MVK (1,53 %)** als AG-Abgaben. `at_dg_beitrag`/`at_dz`/`at_kommunalsteuer` sollten als **optionale** Felder mit Default 0 modelliert werden, die nur bei Mehrfachbeschäftigung bzw. Überschreiten der jeweiligen Schwellen aktiviert werden — nicht als Standard-Pauschalsätze wie bei DE.

### 6.3 13./14. Gehalt (Urlaubs-/Weihnachtsgeld)

Anspruch besteht, wenn ein Kollektivvertrag gilt oder es einzelvertraglich vereinbart ist; bei Geltung anteilig (aliquot) nach Beschäftigungsdauer, z. B. 9/12 bei neun Monaten. Sonderzahlungen selbst zählen **nicht** zur Geringfügigkeitsgrenze. [Quelle: Arbeiterkammer](https://www.arbeiterkammer.at/beratung/arbeitundrecht/Arbeitsvertraege/Weihnachts-Urlaubsgeld.html), [Quelle: GPA](https://www.gpa.at/meine-situation/ich-bin-geringfuegig-beschaeftigt)

Offen bleibt konkret: ob für das Anstellungsverhältnis "private:r Arbeitgeber:in ↔ persönliche Assistenz" ein Kollektivvertrag greift oder es ein freies/einzelvertragliches Verhältnis ohne KV-Bindung ist. Das entscheidet, ob `at_include_urlaubsgeld`/`at_include_weihnachtsgeld` verpflichtend oder rein optional sind — das ist eine Einzelfallfrage pro Anstellungsverhältnis/Bundesland und lässt sich nicht pauschal für alle Nutzer:innen der App beantworten. Deshalb bleiben es Checkboxen, kein Zwangsfeld.

### 6.4 Kostenträger-Modell (Ersatz für "Bezirk zahlt Pauschale")

Persönliche Assistenz **am Arbeitsplatz** wird bundesweit einheitlich vom **Sozialministeriumservice** aus Mitteln der Beschäftigungsoffensive für Menschen mit Behinderungen finanziert (Voraussetzung: Grad der Behinderung ≥ 50 % oder Pflegegeld ≥ Stufe 3, Nachweis bestehender Pflichtversicherung). Persönliche Assistenz **außerhalb** des Arbeitsplatzes fällt in die Zuständigkeit der **Bundesländer** — hier gibt es seit Kurzem einen Unterstützungsfonds, über den der Bund Länder, die nach harmonisierten Rahmenbedingungen (Pilotprojekte) arbeiten, mit bis zu 50 % der Kosten bezuschusst (max. 16,30 €/Assistenzstunde). Im "Arbeitgebermodell" stellt die assistenznehmende Person die Assistent:innen selbst an und trägt die volle Dienstgeberverantwortung (Lohnverrechnung, Bereitschaft, Krankheitsfall). [Quelle: WKO – PAA](https://www.wko.at/arbeitsrecht/unternehmer-mit-behinderung-persoenliche-assistenz), [Quelle: Sozialministeriumservice-Richtlinie PAA (PDF)](https://www.sozialministeriumservice.gv.at/Ueber_uns/News_und_Veranstaltungen/News/Richtlinie_Persoenliche_Assistenz_am_Arbeitsplatz_Reinschrif.pdf)

Für die Architektur heißt das: Es gibt **kein bundeseinheitliches** "Kostenträger zahlt X €/h inkl. aller AG-Kosten"-Schema wie beim deutschen Bezirk — je nachdem ob Arbeitsplatz-PA (SMS, bundesweit einheitlich) oder PA außerhalb (Land, pro Bundesland unterschiedlich ausgestaltet, teils noch Pilotphase) gilt ein anderer Fördersatz und eine andere Abrechnungslogik. Der bestehende `bezirk_mode`-Rückrechnungsmechanismus (`grossFromBezirkRate`) lässt sich als **Rechenprinzip** (Pauschale ÷ (1 + AG-Abgabenquote) = Brutto) 1:1 übernehmen, weil er rein mathematisch ist — aber ob der jeweilige AT-Kostenträger überhaupt einen "Pauschalsatz inkl. AG-Kosten" zahlt oder stattdessen ein fixes Stundenbudget ohne AG-Anteil, muss **pro Bundesland/Kostenträger** individuell geklärt werden, bevor `at_kostentraeger_name` mehr als ein Freitextfeld wird.

**Wichtig für die Umsetzung — Bundesland-Varianz betrifft nicht die Berechnungslogik:** Die eigentliche Lohnabrechnung (Abschnitt 6.2: UV, MVK, Geringfügigkeitsgrenze, Steuer) ist bundeseinheitlich und identisch in allen neun Bundesländern — dafür braucht es **keine** Bundesland-Auswahl im Code. Bundesland-Unterschiede gibt es ausschließlich auf der Kostenträger-Seite, und zwar exakt so, wie es beim bestehenden DE-`bezirk_mode` schon heute gehandhabt wird: Der Pauschalsatz variiert dort auch schon pro Bezirk, ohne dass die App eine Bezirks-Auswahl-Logik braucht — der Nutzer trägt einfach seinen individuellen Satz in `bezirk_mode`/`hourly_rate` ein. Für AT reicht dasselbe Muster: ein Freitextfeld `at_kostentraeger_name` (SMS oder das jeweilige Land) plus ein einzelnes, vom Nutzer eingetragenes €/h-Feld — keine Bundesland-Dropdown-Logik, keine neun parallelen Satz-Sets im Code.

### 6.5 Verbleibend offen (bewusst nicht pauschal beantwortbar)

1. Ob im konkreten Einzelfall ein Kollektivvertrag für das Assistenzverhältnis gilt (steuert Sonderzahlungspflicht) — Einzelfallfrage, nicht recherchierbar ohne konkreten Fall.
2. Genaue Förderlogik des jeweiligen Bundeslandes bei PA außerhalb des Arbeitsplatzes (Fondsmodell ist laut Quelle noch in Pilotphase, Ausgestaltung variiert) — vor Umsetzung beim zuständigen Land/Kostenträger direkt erfragen.
3. Formale Pflichtangaben für einen österreichischen Lohnzettel (Lohnkonto-Anforderungen) — sollte vor Anpassung von `PrintButton`/Lohnzettel-Layout einmal gezielt (idealerweise mit WKO/Lohnverrechnungs-Quelle) geprüft werden, hier nicht mit-recherchiert.

Diese drei Punkte sind Einzelfall- bzw. Formalfragen, die sich erst bei einer konkreten Umsetzung mit echtem Bundesland/Kostenträger sauber klären lassen — alles andere (Sätze, Struktur, Rechenlogik) ist oben bereits recherchiert und mit Quellen belegt.
