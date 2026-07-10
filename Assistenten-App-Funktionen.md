# Assistenten-App — Funktionen im Überblick

Die Assistenten-App organisiert die Zusammenarbeit zwischen Arbeitgeber und Assistenz- bzw. Aushilfskräften im Arbeitgebermodell — von der Dienstplanung über die Zeiterfassung bis zur Minijob-konformen Abrechnung. Die Entscheidungshoheit liegt dabei immer beim Arbeitgeber.

## Kalender & Slot-Vergabe

- Arbeitgeber legt wöchentlich oder monatlich offene Zeit-Slots an
- Assistenzkräfte sehen freie Slots und tragen sich ein
- Letzte Entscheidung (Bestätigung) liegt beim Arbeitgeber
- Kein manuelles Kalender-Abstimmen mehr nötig

## Verfügbarkeiten

- Assistenzkräfte hinterlegen ihre eigenen Verfügbarkeiten
- Erleichtert die Slot-Planung und vermeidet Doppelbuchungen
- Übersicht über Abwesenheiten

## Zeiterfassung

- Automatisch aus bestätigten Kalender-Slots
- Alternativ manuelle Zeiteinträge möglich
- Zähl-Modus einstellbar: nur Slots, nur Einträge, oder beides

## Aufgaben (To-dos)

- Aufgabenverwaltung für Arbeitgeber und Assistenzkräfte
- Zuweisung, Status, Nachverfolgung
- Zentrale Übersicht statt Zettel/WhatsApp-Nachrichten

## Lohnabrechnung (Payroll)

- Minijob-Modus: Minijob-konforme Berechnung inkl. UV-Umlage
- Alle Beitragssätze (KV, RV-AG, Pauschsteuer, U2, Insolvenzgeld, RV-AN) im Admin-Bereich editierbar — bei Gesetzesänderungen ohne Code-Anpassung pflegbar
- RV-Pflicht/Aufstockung pro Mitarbeiter:in einstellbar
- Bezirk-Modus: Rückrechnung vom Kostenträger-Pauschalsatz auf Bruttolohn (optionaler Schalter, kein fester Bestandteil)
- Monats- und Jahresabrechnung auf Knopfdruck
- Konto-/Guthabenübersicht (Budget-Tracking, z. B. Persönliches Budget)

## Berichte & Nachweise

- Automatisch generierte Dienstberichte, z. B. für den Bezirk
- Druckansicht pro Monat und Assistenzkraft
- Versand per E-Mail direkt aus der App

## Benachrichtigungen

- Push-Benachrichtigungen (auch als installierte App/PWA, inkl. iOS)
- Automatische Erinnerungen: offene Slots, Monatsabschluss
- In-App-Benachrichtigungen als Fallback ohne Push

## Benutzer- & Mandantenverwaltung

- Rollen: Admin/Arbeitgeber und Assistenzkraft
- Mehrere Organisationen sauber getrennt (Mandantenfähigkeit, Multi-Tenant)
- Kontrollierte Registrierung (Zugangs-Gating)
- Sperren/Entsperren von Mandanten im Superadmin-Bereich
- Datensicherung / Export-Import

## Zusatzfunktion: Smart-Home-Anbindung (Home Assistant)

Ein Nice-to-have-Feature, das kaum genutzt werden dürfte, aber die technische Tiefe des Produkts zeigt.

- Zeigt live an, wer aktuell da ist, wer als nächstes kommt und wie viele Slots noch offen sind
- Fünf fertige Sensoren (aktuelle/nächste Assistenzkraft, offene Slots, heutige Einsätze) plus ein Anwesenheits-Sensor für eigene Automationen
- Anbindung über den bestehenden Zugangs-Token — kein zusätzliches Konto oder Login nötig
- Beispiel-Automationen bereits vorbereitet: Erinnerung 30 Minuten vor Ankunft, Heizung automatisch hochdrehen, wenn die Assistenzkraft eintrifft

## Auch für normale Minijobs & Haushaltshilfen nutzbar

Kurze Antwort: ja. Die Bezirk-Anbindung ist nur eine optionale Einstellung, kein fester Bestandteil.

- **Minijob-Logik ist generisch.** Die Berechnung von UV-Umlage, RV-Pflicht/Aufstockung und die Arbeitgeberdaten in der Abrechnung gelten für jeden Minijob im Privathaushalt — unabhängig davon, ob es sich um eine Assistenzkraft, eine Haushaltshilfe, eine Reinigungskraft oder z. B. eine Nanny handelt.
- **Bezirk-Modus ist ein Schalter, kein Zwang.** Er wird nur aktiviert, wenn ein Kostenträger (Bezirk) einen Pauschalsatz zahlt, aus dem der Bruttolohn zurückgerechnet werden muss. Für eine normale private Anstellung bleibt dieser Modus einfach deaktiviert — der Stundensatz wird dann direkt verwendet.
- **Slot-Vergabe, Zeiterfassung, Aufgaben und Benachrichtigungen** funktionieren identisch, egal wer die Assistenz- bzw. Aushilfskraft ist.
- **Eine Einschränkung:** Die App berechnet und organisiert die Werte, ersetzt aber nicht die offizielle Meldung. Die verbindliche Anmeldung eines Minijobs im Privathaushalt läuft weiterhin über das Haushaltsscheckverfahren der Minijob-Zentrale — die App liefert dafür die nötigen Zahlen, reicht sie aber nicht automatisch ein.

Für die Praxis heißt das: Der Kern des Produkts — Slot-basierte Planung statt Kalender-Pingpong, automatische Zeiterfassung, fertige Lohnzahlen auf Knopfdruck — ist eine allgemeine Lösung für private Arbeitgeber von Minijobber:innen. Das Arbeitgebermodell in der Eingliederungshilfe ist der Ursprungsfall, aber nicht die einzige Zielgruppe.
