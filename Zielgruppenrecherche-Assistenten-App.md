# Zielgruppenrecherche – Assistenten-App

Stand: 24.07.2026

## Kurzfassung

Die Assistenten-App bedient eine Nische, die kaum spezialisierte Software hat: private Arbeitgeber im Minijob-Bereich, die Dienstplanung, Zeiterfassung und Lohnabrechnung heute mit Excel, WhatsApp und Kopfrechnen lösen. Der Ursprungsfall – Menschen mit Behinderung im Arbeitgebermodell (Persönliches Budget) – ist das schärfste, am schlechtesten bediente Segment. Die generische Minijob-Logik öffnet aber einen deutlich größeren Zusatzmarkt (Haushaltshilfen, Nannies, private Pflege).

## 1. Primäre Zielgruppe: Menschen im Arbeitgebermodell (Eingliederungshilfe)

**Wer:** Menschen mit Behinderung, die über das Persönliche Budget (SGB IX) selbst Arbeitgeber ihrer Assistenzkräfte sind – meist Assistenznehmer:innen mit hohem, planbarem Assistenzbedarf (24h-Assistenz, Nacht-/Wochenenddienste).

**Kernproblem:** Sie führen faktisch einen Kleinbetrieb – Dienstplan, Zeiterfassung, Minijob-Abrechnung inkl. UV-Umlage, Nachweise gegenüber dem Kostenträger (Bezirk) –, meist ohne betriebswirtschaftliche Vorbildung und mit hoher administrativer Belastung parallel zum eigenen Unterstützungsbedarf.

**Marktbeleg:** Recherche bestätigt eine echte Lücke – ein Betroffener berichtete öffentlich, selbst Software entwickelt zu haben, weil er trotz IT-Hintergrund keine passende Lösung fand ([der-querschnitt.de](https://www.der-querschnitt.de/fuer-eigenen-bedarf-entwickelt-software-fuer-unkomplizierte-assistenzplanung-78353)). Verbreitete Alternativen sind allgemeine Dienstplan-Tools (Ordio, Papershift, Aplano, Crewmeister), die für Schichtbetriebe/Gastronomie gebaut sind – nicht für Minijob-Privathaushalte oder Bezirk-Abrechnung.

**Größe:** Belastbare aktuelle Zahlen fehlen (letzte auffindbare Statistik: ca. 9.100 bewilligte Budgets im Bereich Eingliederungshilfe, Stand 2014 – [teilhabeberatung.de](https://www.teilhabeberatung.de/artikel/zehn-jahre-persoenliches-budget-eine-erfolgsgeschichte)). Zahl dürfte seither gewachsen sein, ist aber ein Nischenmarkt in der vierstelligen bis niedrigen fünfstelligen Größenordnung bundesweit – klein, aber mit hoher Zahlungsbereitschaft, da der administrative Schmerz groß und die Alternative (Fehler in der Abrechnung, Ärger mit dem Bezirk) teuer ist.

**Kaufentscheider:** teils die Assistenznehmer:innen selbst, teils Angehörige/gesetzliche Betreuer:innen, teils Unterstützer:innen aus Assistenzgenossenschaften/-vereinen, die mehrere Arbeitgebermodelle begleiten (→ passt zur bereits gebauten Mandantenfähigkeit/Multi-Tenant-Funktion).

## 2. Sekundäre Zielgruppe: Private Arbeitgeber von Minijobber:innen im Haushalt

**Wer:** Privathaushalte mit Haushaltshilfe, Nanny, Reinigungskraft, Pflege-Minijob – ohne Bezug zum Bezirk/Kostenträger.

**Kernproblem:** Gleiche Wechselkosten wie oben (Dienstplan, Zeiterfassung, Minijob-Abrechnung inkl. Pauschsteuer, KV, RV-AG, U2, Insolvenzgeld), aber ohne die Bezirk-Komplexität.

**Marktbeleg:** Deutlich größerer, aktiv wachsender Markt – Minijob-Zentrale hat die Verdienstgrenze für Haushaltshilfen 2026 auf 603 €/Monat angehoben, Mindestlohn auf 13,90 €/Std. ([minijob-zentrale.de](https://magazin.minijob-zentrale.de/minijob-grenze-2026-haushaltshilfen/)); zusätzliche Steuerförderung (20 % der Kosten, bis 510 €/Jahr) macht legale Minijob-Beschäftigung im Haushalt für den Staat aktiv gefördert und damit wachsend attraktiv.

**Wichtig für Positionierung:** Dieses Segment kennt die App-Funktionen (Bezirk-Modus) nicht als Kernprodukt, sondern würde sie schlicht deaktiviert lassen – Produkt ist bereits dafür vorbereitet (siehe Funktionsübersicht: „Bezirk-Modus ist ein Schalter, kein Zwang").

**Konkurrenz hier ist breiter:** allgemeine Dienstplan-/Zeiterfassungs-Tools (Ordio, Planday, Deputy, Papershift, gastromatic) zielen aber auf Betriebe/Schichtarbeit, nicht auf den 1-Arbeitgeber-1-bis-3-Mitarbeitende-Privathaushalt-Fall – auch hier bleibt eine Lücke für eine bewusst simple, Minijob-spezifische Lösung.

## 3. Tertiäre Zielgruppe (Multiplikatoren, nicht Endnutzer): Assistenzgenossenschaften, -vereine, Sozialberatung

**Wer:** Organisationen, die mehrere Arbeitgebermodell-Fälle begleiten (Beratung, Unterstützung bei Personalsuche, teils Lohnabrechnung als Dienstleistung).

**Rolle:** Kein Einzel-Kaufentscheider, aber Empfehlungs-/Vertriebshebel – wenn eine Genossenschaft die App ihren begleiteten Budgetnehmer:innen empfiehlt, skaliert das die Reichweite in Zielgruppe 1 deutlich stärker als Einzelakquise. Die Multi-Tenant-/Mandantenfähigkeit der App passt strukturell zu diesem Nutzungsmodell.

## Einordnung nach Produktreife

Die App ist aktuell auf einen Mandanten (Karas/Prod) zugeschnitten, mit Registrierungs-Gating und Mandantenverwaltung im Superadmin-Bereich – strukturell also schon auf „zweiter, dritter Mandant" vorbereitet. Für Zielgruppe 1 (Eingliederungshilfe) ist die Bezirk-Rückrechnung ein starkes Differenzierungsmerkmal gegenüber jeder generischen Dienstplan-Software. Für Zielgruppe 2 (private Minijob-Haushalte) ist der Bezirk-Bezug irrelevant, aber die Kernmechanik (Slot-Vergabe statt Kalender-Pingpong, automatische Zeiterfassung, Lohnzahlen auf Knopfdruck) trägt unverändert.

## Marktgröße Zielgruppe 1 (Arbeitgebermodell): Deutschland vs. Österreich

**Deutschland – offizielle Zahlen, aber mit Einschränkung:** Destatis erfasst die Zahl bewilligter „Persönlicher Budgets" im Rahmen der Eingliederungshilfe pro Jahr (Quelle: [Bundestagsdrucksache 19/30636](https://dserver.bundestag.de/btd/19/306/1930636.pdf)):

| Jahr | Bewilligte Persönliche Budgets (EGH) |
|---|---|
| 2008 | 2.321 |
| 2012 | 8.403 |
| 2014 | 9.119 |
| 2017 (Höchststand) | 11.198 |
| 2019 | 7.370 |

Wichtige Einschränkung: Diese Zahl misst „Persönliches Budget" insgesamt – also auch Fälle, in denen das Budget an einen ambulanten Dienst statt an selbst angestellte Assistenzkräfte geht. Das Arbeitgebermodell im engeren Sinn (Person ist selbst Arbeitgeber:in) wird nicht separat erfasst. Qualitative Quellen beschreiben es übereinstimmend als „relativ wenige" Betroffene; eine ältere, nicht amtlich belegte Schätzung nennt eine niedrige vierstellige Zahl bundesweit ([der-querschnitt.de](https://www.der-querschnitt.de/fuer-eigenen-bedarf-entwickelt-software-fuer-unkomplizierte-assistenzplanung-78353)). Zur Einordnung der Größenordnung: 2024 erhielten insgesamt 1.029.000 Menschen Eingliederungshilfe, davon 529.910 überhaupt Assistenzleistungen ([destatis.de](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Soziales/Sozialhilfe/eingliederungshilfe.html)) – das Arbeitgebermodell-Segment liegt damit klar unter 1 % aller EGH-Empfänger.

**Realistische Schätzung DE:** vermutlich zwischen 3.000 und 10.000 Personen/Haushalte bundesweit im Arbeitgebermodell – keine amtlich isoliert erhobene Zahl, sondern eine aus obigen Datenpunkten abgeleitete Bandbreite.

**Österreich – keine verwertbare Statistik gefunden:** Struktur ist zweigeteilt – Persönliche Assistenz am Arbeitsplatz (PAA) läuft bundesweit über das [Sozialministeriumservice](https://www.sozialministeriumservice.gv.at/weitere_Zielgruppen/Sonstige_Massnahmen_und_Projekte/Persoenliche_Assistenz_am_Arbeitsplatz/Persoenliche-Assistenz-am-Arbeitsplatz.de.html); Assistenz im Alltag/Freizeitbereich ist Landessache. Die [WAG Assistenzgenossenschaft](https://www.wag.or.at/) ist Servicestelle für Wien, NÖ und Burgenland, andere Bundesländer haben eigene Stellen. Weder WAG noch Sozialministeriumservice veröffentlichen NutzerInnenzahlen nach Organisationsform (Arbeitgebermodell vs. Genossenschaftsmodell) öffentlich.

Eine reine Bevölkerungs-Hochrechnung (AT ≈ 1/9 der Bevölkerung von DE) würde auf einen niedrigen zwei- bis dreistelligen Bereich hindeuten – das ist ausdrücklich eine grobe Schätzung ohne eigene Quellenbasis, keine belastbare Zahl. Für eine verlässliche Aussage müsste direkt bei WAG, Sozialministeriumservice oder den Landes-Behindertenhilfe-Stellen angefragt werden.

## Offene Fragen für die Weiterarbeit

- Direkte Anfrage bei WAG/Sozialministeriumservice (AT) bzw. bei einzelnen Bezirken/Landeswohlfahrtsverbänden (DE) für belastbarere, aktuellere Fallzahlen
- Direkte Konkurrenzprodukte im Nischenmarkt „Assistenzplanung Arbeitgebermodell" identifizieren (über der-querschnitt.de-Community, Fachforen, Assistenzgenossenschaften)
- Preisbereitschaft in beiden Zielgruppen unterscheiden (Zielgruppe 1: über Budget/Kostenträger ggf. finanzierbar; Zielgruppe 2: Preissensibilität wie bei Consumer-SaaS)

## Quellen

- [Für eigenen Bedarf entwickelt: Software für unkomplizierte Assistenzplanung – Der-Querschnitt.de](https://www.der-querschnitt.de/fuer-eigenen-bedarf-entwickelt-software-fuer-unkomplizierte-assistenzplanung-78353)
- [Zehn Jahre Persönliches Budget – eine Erfolgsgeschichte! | teilhabeberatung.de](https://www.teilhabeberatung.de/artikel/zehn-jahre-persoenliches-budget-eine-erfolgsgeschichte)
- [Persönliches Budget: Arbeitgebermodell einfach erklärt | Querleben](https://www.querleben.de/die-nutzung-des-persoenlichen-budgets-im-arbeitgebermodell/)
- [Minijob-Grenze 2026: Haushaltshilfen können mehr verdienen – Minijob Magazin](https://magazin.minijob-zentrale.de/minijob-grenze-2026-haushaltshilfen/)
- [Minijob-Beiträge 2026: Arbeitgeber zahlen geringere Umlage U1 – Minijob Magazin](https://magazin.minijob-zentrale.de/minijob-beitraege-2026/)
- [Dienstplan Software Vergleich 2026: 5 Tools im Überblick – Clockin](https://www.clockin.de/blog/dienstplan-software-vergleich-2026)
- [Persönliches Budget – Wikipedia](https://de.m.wikipedia.org/wiki/Pers%C3%B6nliches_Budget)
