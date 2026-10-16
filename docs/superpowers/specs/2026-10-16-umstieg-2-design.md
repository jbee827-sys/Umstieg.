# Umstieg 2.0 – Umsetzungskonzept

Stand: 16.10.2026 · **Endgültige Fassung** (ersetzt den Entwurf mit eigenem Server) · Grundlage: `01-moeglichkeiten-und-umsetzungswege.md` (Analyse, nicht im Repository), Repository `jbee827-sys/Umstieg.` (Stand `2552618`), MOTIS-OpenAPI (Branch `master`, abgerufen am 16.10.2026), Transitous-Quellenliste `feeds/de.json` (abgerufen am 16.10.2026)

**Entscheidungen (Julian, 16.10.2026):** Weg A – Transitous als externe Schnittstelle, wechselbar gebaut, sodass vor den ersten Einnahmen ein eigener MOTIS-Server übernimmt (E1). E2–E4 am selben Tag entschieden (Abschnitt 3).

**Ins Repository übernommen am 16.10.2026** (Abschnitt 11). Befunde aus Paket 0 stehen in [`docs/2026-10-16-transitous-erkundung.md`](../../2026-10-16-transitous-erkundung.md) und sind in Abschnitt 3 nachgetragen; der Umsetzungsplan liegt unter [`docs/superpowers/plans/2026-10-16-umstieg-2.md`](../plans/2026-10-16-umstieg-2.md).

## 0. Wie dieses Konzept zu lesen ist

Das Konzept legt fest, **was** Umstieg 2.0 leisten muss und **welche Grenzen** die Umsetzung einhält. Wie etwas im Einzelnen gebaut wird, bleibt bewusst offen, solange die Grenzen eingehalten sind. Damit lässt es sich anpassen, ohne neu geschrieben zu werden.

| Kennzeichnung | Bedeutung | Wer darf ändern |
|---|---|---|
| **F** – Festlegung | Verbindlich; Abweichung nur nach Rückfrage bei Julian | Julian |
| **L** – Leitplanke | Ziel und Grenze sind verbindlich, der Weg dorthin nicht | Claude Code im Rahmen, mit Begründung im Commit |
| **V** – Vorschlag | Ausgangspunkt; darf ersetzt werden, wenn sich bei der Umsetzung etwas Besseres zeigt | Claude Code, Abweichung im README-Abschnitt „Hier weitermachen“ vermerken |
| **A** – Annahme | Noch nicht bestätigt; wird geprüft, bevor darauf gebaut wird | Prüfung in Paket 0 bzw. Rückfrage |
| **E** – offene Entscheidung | Braucht Julians Antwort; bis dahin gilt die genannte Vorgabe | Julian |

Für Claude Code gilt bei jedem Paket: zuerst README „Hier weitermachen“, dieses Konzept und die betroffenen Dateien lesen, dann die Annahmen des Pakets prüfen. Widerspricht der Code oder die Schnittstelle dem Konzept, gilt der Befund, und das Konzept wird angepasst (Abschnitt 11).

## 1. Ziel

Umstieg. zeigt an **jeder ÖPNV-Haltestelle in Deutschland** (Bus, Tram, U-Bahn, S-Bahn, Bahn) den Fußweg vom Ankunftssteig zum Abfahrtssteig, auch zwischen nahe gelegenen getrennten Haltestellen, und bewertet live, ob der Anschluss erreichbar ist. Die heutigen Stärken an DB-Bahnhöfen (Wagenposition, Ebenenschema, Aufzugsstatus) bleiben erhalten.

### Erfolgskriterien (L)

| Nr. | Kriterium | Prüfung |
|---|---|---|
| K1 | Haltestellen aller Bundesländer über Name und Standort auffindbar | Stichprobe 50 Haltestellen aus 10 Bundesländern, mindestens 49 gefunden |
| K2 | Tafel einer Haltestelle zeigt Linie, Verkehrsmittel, Ziel, Steig (wo vorhanden), Soll- und Ist-Zeit | Stichprobe Berlin, München, Kassel, ländlicher Raum |
| K3 | Ohne Echtzeit ist eine Abfahrt sichtbar als „laut Fahrplan“ gekennzeichnet | Test mit Fahrt ohne `realTime` |
| K4 | Fußweg zwischen zwei Steigen mit Schritten, Karte, Gehzeit und Ampel | 20 Testpaare, darunter Bahnhof → Bushaltestelle |
| K5 | Fällt Transitous aus, bleiben Bahnhöfe voll nutzbar, Haltestellen melden den Ausfall verständlich | Ausfalltest |
| K6 | Bestehende Bahnhofsfunktion unverändert | Alle bestehenden Tests grün, Live-Prüfung Hamburg/Frankfurt wie am 14.10. |
| K7 | Last auf Transitous bleibt im abgestimmten Rahmen | Zähler im Backend-Protokoll (Abschnitt 5.4) |

## 2. Festlegungen (F)

- **F1 – Zwei Datenpfade.** Der Bahnhofspfad (EVA, DB-APIs, eigener Graph, Overpass-Bestand) bleibt, wie er ist. Daneben entsteht der Haltestellenpfad über Transitous. 2.0 baut den Bahnhofspfad nicht um.
- **F2 – Umstiegs-Navigator, kein Reiseplaner.** Genutzt werden Haltestellensuche, Tafeln, Fahrtinformationen und reine Fußwege, nicht die Verbindungssuche von A nach B.
- **F3 – Zugriff nur über das eigene Backend.** Der Browser spricht nie direkt mit Transitous. Begründung: Bündelung und Zwischenspeicher halten die Last klein (Transitous verlangt Absprache bei vielen Anfragen), User-Agent mit Kontakt ist serverseitig zuverlässig setzbar, und ein späterer Anbieterwechsel betrifft nur das Backend.
- **F4 – Anbieterunabhängigkeit.** Der Haltestellenpfad spricht die MOTIS-API, nicht „Transitous“. Die Basis-URL ist Konfiguration. Ein späterer eigener MOTIS-Server (Ausbaustufe, Abschnitt 10) ist damit ein Konfigurationswechsel plus Betriebsaufgabe, keine Neuentwicklung.
- **F5 – Ehrliche Aktualität.** Jede Tafelzeile trägt, ob Echtzeit vorliegt; jede Live-Anzeige trägt einen Zeitstempel (Grundsatz aus dem MVP-Konzept, Abschnitt 3).
- **F6 – Degradieren statt ausfallen.** Kein Fehler von Transitous darf den Bahnhofspfad beeinträchtigen.
- **F7 – Nutzungsbedingungen von Transitous einhalten:** User-Agent mit Anwendungsname, Version und Kontakt; sichtbarer Link auf `transitous.org/sources`; OSM-Attribution; kein Massenabruf; Absprache im Matrix-Kanal vor dem Produktivbetrieb.

## 3. Offene Entscheidungen und Annahmen

| Nr. | Frage | Vorgabe bis zur Antwort |
|---|---|---|
| **E1** | Transitous schließt kommerzielle Nutzung aus („commercial use is not allowed“), Umstieg. soll später Einnahmen erzielen. Wechsel vor den ersten Einnahmen auf eigenen Server, dauerhaft Transitous ohne Einnahmen oder gleich eigener Server? (Karte im Thread) | **Entschieden (Julian, 16.10.2026): Wechselbar bauen.** Transitous jetzt, eigener MOTIS-Server vor den ersten Einnahmen (Abschnitt 10) |
| **E2** | Arbeitszweig: weiter auf `feat/mvp` oder eigener Zweig `feat/umstieg-2`? | **Entschieden (Julian, 16.10.2026):** eigener Zweig `feat/umstieg-2`, damit `feat/mvp` auslieferbar bleibt |
| **E3** | Soll die Haltestellensuche die heutige Bahnhofssuche ersetzen (eine Suchleiste für alles) oder daneben stehen? | **Entschieden (Julian, 16.10.2026): zwei Ortsfelder im selben Fenster.** „Ankunft“ und „Anschluss“ haben je ein eigenes Suchfeld; jedes findet Bahnhöfe und Haltestellen (Bus, Tram, U-Bahn, S-Bahn) mit Verkehrsmittel-Symbol. Ein leerer Anschluss heißt „gleicher Ort“. So ist sichtbar, dass jemand von Berlin Hbf Gleis 3 zum Berliner ZOB will. Liegen beide im selben DB-Bahnhof, läuft der heutige Ablauf |
| **E4** | Wie geht der Nutzer an einer Haltestelle vor: Ankunft und Abfahrt aus Tafeln wählen (wie heute) oder nur zwei Steige/Linien wählen? | **Entschieden (Julian, 16.10.2026):** wie heute, Ankunftsfahrt und Anschlussfahrt aus Tafeln |
| A1 | Transitous enthält für Deutschland DELFI-Fahrpläne (CC BY 4.0) und DELFI-Echtzeit (GTFS-RT über die Mobilithek, CC BY-SA 4.0) sowie VBB und VBN | **Bestätigt (16.10.2026), mit Vorbehalten:** Treffer aus allen 16 Ländern; Echtzeit lückenhaft (Berliner Busse 0 von 20). Neu: fremde Länder, Mitfahrquellen, doppelte Halte und doppelte Fahrten aus DELFI und VBB – gefiltert bzw. entdoppelt |
| A2 | Der Steig einer Abfahrt ist bestimmbar | **Bestätigt (16.10.2026):** Jeder Tafeleintrag trägt eigene `place.stopId`, `lat`/`lon`, oft `level` und `description`. Steig aus `track`, sonst aus dem DHID-Steigteil (`…::A`), sonst nur Koordinate. Die DHID wird nur zur Anzeige gelesen, nie als Schlüssel (Lockerung von 5.1, siehe Plan) |
| A3 | `/api/v6/plan` mit leerem `transitModes` liefert unter `direct` einen reinen Fußweg mit `steps` und Ebenen (`fromLevel`/`toLevel`) | **Bestätigt (16.10.2026), zwei Fallen:** keine Abbiegerichtungen (nur `CONTINUE`/`STAIRS`/`ELEVATOR`), Treppen-Ebenen teils gegen die Gehrichtung. Rollstuhlprofil liefert eigenen Weg über Aufzüge |
| A4 | Die Last von Umstieg. ist für Transitous unkritisch (heute 78 Besucher in gut drei Wochen laut Vercel Analytics) | Abschätzung (16.10.2026): ≤ 42 Anfragen je Umstieg, unter 200 am Tag. Absprache im Matrix-Kanal bleibt bei Julian |
| A5 | Haltestellen-IDs von Transitous bleiben über die wöchentlichen Datenwechsel hinweg gültig | **Risiko bestätigt (16.10.2026):** IDs tragen Quellnamen mit Jahreszahl. Rückfall: `stoptimes` mit `center`+`radius` findet die Haltestelle über ihre Koordinate; geprüft. IDs werden weiter nicht dauerhaft gespeichert |

## 4. Architektur

```
Browser (React/Vite, Vercel) ── unverändert: VITE_API_BASE, CORS-Allowlist, SSE
   │
   ▼
Umstieg.-Backend (Fastify, Fly, eine Maschine)
   ├─ Bahnhofspfad (heute)     clients/stations · timetables · wagenreihung · fasta · overpass
   └─ Haltestellenpfad (neu)   clients/fahrplan.ts ──► MOTIS-API
                                                      └─ heute: https://api.transitous.org
                                                         später: eigener MOTIS (Abschnitt 10)
```

**Weiche (L):** Liegen Ankunfts- und Abfahrtsgleis im selben DB-Bahnhof, läuft der heutige Bahnhofspfad (`/api/route`, `/api/live/:eva`). In allen anderen Fällen läuft der Haltestellenpfad. Wie die Weiche erkannt wird (z. B. über die Zuordnung Haltestelle ↔ EVA aus Abschnitt 5.2), legt die Umsetzung fest.

**Datenfluss Haltestelle (V):** Suche → Tafel Ankunft → Tafel Abfahrt → Fußweg Steig → Steig → Anzeige → Live bis zur Abfahrt.

## 5. Backend

### 5.1 Client für die MOTIS-API (L)

Ein neuer Client im Stil der bestehenden Clients (`clients/timetables.ts`, `clients/overpass.ts`). Er kapselt alles Anbieterspezifische, sodass Routen und Kern nur mit eigenen Typen arbeiten.

| Aufgabe | MOTIS-Endpunkt (laut OpenAPI) |
|---|---|
| Haltestellen nach Name | `GET /api/v1/geocode` mit `type=STOP` |
| Haltestellen nach Standort | `GET /api/v1/reverse-geocode` mit `type=STOP` |
| Ankunfts-/Abfahrtstafel | `GET /api/v6/stoptimes` (`stopId`, `time`, `arriveBy`, `n`, `window`) |
| Fahrtverlauf | `GET /api/v6/trip` (`tripId`) |
| Fußweg | `GET /api/v6/plan`, nur Direktweg zu Fuß, `pedestrianProfile` `FOOT` bzw. `WHEELCHAIR` |

Grenzen, die der Client einhält:

- **Versionen der Endpunkte sind Konfiguration oder zentrale Konstanten**, weil MOTIS seine Endpunkte versioniert (heute v1 und v6). Ein Versionswechsel darf nur eine Stelle betreffen.
- **Zeitgrenzen** je Anfrage (V: Suche 4 s, Tafel 4 s, Fußweg 8 s).
- **Pausenzustand nach dem Muster `clients/overpass-pausen.ts`:** Bei 429 wird `Retry-After` beachtet, bei Zeitüberschreitung oder 5xx eine kurze Pause eingelegt; in der Pause gibt es keine Anfrage, sondern sofort die Degradation. Kein zweiter Versuch innerhalb derselben Nutzeranfrage. (L: Transitous darf durch Umstieg. nie in Wiederholungsschleifen geraten, so wie es bei Overpass zur Sperre kam.)
- **Bündeln und Zwischenspeichern** mit dem vorhandenen `cache/lru.ts` und dem Bündelungsmuster aus `routes/api.ts` (`buendle`). V: Suche 24 h, Tafel 30 s, Fußweg je Steigpaar und Profil 24 h, Fahrtverlauf 60 s.
- **User-Agent** `Umstieg/<Version> (+https://www.umstieg.online; <Kontakt>)`; die Kontaktadresse ist Konfiguration (E-Mail-Adresse nicht im Repository).
- **Keine Annahmen über den Aufbau der IDs.** Haltestellen- und Fahrt-IDs werden unverändert durchgereicht und URL-kodiert.
- **Zeiten:** MOTIS liefert Zeitpunkte als ISO-Zeitstempel; Anzeige und Vergleiche laufen über die bestehenden Hilfen in `core/zeit.ts` (deutsche Ortszeit), nicht über die Zeitzone des Containers.
- **Tests ohne Netz:** Alle automatischen Tests laufen gegen Fixtures; kein Test ruft Transitous auf. Ein gesondertes, manuell gestartetes Prüfskript darf es (V: unter `backend/scripts/`).

### 5.2 Routen (V)

Neue Routen neben den bestehenden; `/api/stations`, `/api/board`, `/api/route` und `/api/live/:eva` bleiben unverändert.

| Route | Zweck | Hinweise |
|---|---|---|
| `GET /api/orte` | Suche nach Name oder Standort über alle Haltestellen | Ein Treffer, der zu einem DB-Bahnhof gehört, trägt zusätzlich die EVA. Zuordnung über Entfernung und Namensvergleich (`core/bahnhofsname.ts`) oder ein besseres Merkmal, falls Paket 0 eines findet |
| `GET /api/haltestelle/tafel` | Ankunft oder Abfahrt einer Haltestelle | Steig, Echtzeitkennzeichen, Ausfall |
| `GET /api/weg` | Fußweg zwischen zwei Steigen bzw. Koordinaten | Antwort in derselben Form wie die Schritte von `/api/route`, damit das Frontend Schrittliste, Karte und Ampel wiederverwendet |
| `GET /api/live/haltestelle` | SSE für Anschlussüberwachung | Gleiche Verbindungsgrenzen und CORS-Behandlung wie `/api/live/:eva` (`routes/live.ts`) |

Die Ratenbegrenzung (`app.ts`, `GRENZEN`) erhält Werte für die neuen Routen.

### 5.3 Eigene Typen (L)

Die neuen Typen leben in `core/typen.ts` und werden in `frontend/src/api/typen.ts` gespiegelt (bestehende Regel). Sie beschreiben Umstieg., nicht MOTIS. Mindestens nötig:

- **Ort:** Name, Koordinate, Haltestellen-ID, optional EVA, Verkehrsmittel.
- **Tafeleintrag Haltestelle:** Fahrt-ID, Linie, Verkehrsmittel, Ziel, Soll-/Ist-Zeit, Soll-/Ist-Steig, Steigkoordinate, Echtzeit ja/nein, Ausfall ja/nein.
- **Weg:** Schritte (bestehender Typ `Schritt`), Gehzeit, Distanz, Geometrie, Herkunft der Daten, Hinweise.
- **Verkehrsmittel:** eine kleine eigene Aufzählung (V: Bus, Tram, U-Bahn, S-Bahn, Bahn, Fähre, Sonstiges) mit einer getesteten Zuordnung aus dem MOTIS-Feld `mode`. Unbekannte Werte fallen auf „Sonstiges“, nie auf einen Fehler.

### 5.4 Live-Überwachung (L)

`core/ueberwachung.ts` bündelt heute je EVA einen Abruf für alle Zuschauer. Diese Eigenschaft gilt auch für Haltestellen: **ein Abruf je Haltestelle, egal wie viele Zuschauer**. Ob dafür `ueberwachung.ts` verallgemeinert oder eine zweite Instanz mit eigener Abruffunktion genutzt wird, entscheidet die Umsetzung; die bestehenden Live-Tests müssen unverändert grün bleiben.

Abrufabstand V: 60 s. Begründung: Transitous liest Echtzeitquellen nach eigener Dokumentation etwa einmal je Minute; häufigeres Fragen bringt keine neuen Daten, nur Last.

Das Backend zählt Anfragen an die MOTIS-API je Endpunkt und Stunde und schreibt die Summen ins Protokoll (Nachweis für K7 und für die Absprache mit Transitous).

### 5.5 Schritte für den Fußweg (L)

Die Schritte aus `Leg.steps` (u. a. `relativeDirection`, `distance`, `fromLevel`, `toLevel`, `streetName`) werden in den bestehenden Typ `Schritt` übersetzt. Ein Ebenenwechsel wird als eigener Schritt sichtbar. Die Gehzeit berechnet weiterhin `core/gehzeit.ts` aus Distanz und Gehprofil, damit Ampel und Restzeit auf beiden Pfaden gleich rechnen. Textbausteine orientieren sich an `core/textgen.ts`.

### 5.6 Degradation (L)

| Lage | Verhalten |
|---|---|
| Transitous pausiert oder nicht erreichbar | Suche liefert nur Bahnhöfe (RIS::Stations); Haltestellen-Tafel und -Weg melden „Haltestellendaten gerade nicht verfügbar“; Bahnhofspfad unverändert |
| Fahrt ohne Echtzeit | Anzeige „laut Fahrplan“ |
| Kein Fußweg gefunden | Ungefähre Gehzeit aus Luftlinie mit Umwegfaktor und Hinweis „ungefährer Weg“ (Gegenstück zur Stufe 3 heute); Faktor V: 1,3 |
| Steig unbekannt | Position der Haltestelle statt des Steigs, mit Hinweis |
| Echtzeitquelle meldet sich ab | `quelle-weg`/`quelle-da` im Live-Strom wie heute |

## 6. Frontend (L)

- Die Suche zeigt Haltestellen mit Verkehrsmittel-Symbolen (E3). Ein Treffer mit EVA führt in den heutigen Bahnhofsablauf.
- Für Haltestellen gibt es eine Tafel- und Fahrtauswahl mit Linie, Verkehrsmittel, Ziel, Steig, Soll/Ist und Kennzeichnung „laut Fahrplan“ (E4).
- Weg-Ansicht, Schrittliste, Karte, Ampel und Live-Banner werden wiederverwendet; das Ebenenschema erscheint nur auf dem Bahnhofspfad.
- **Kopplung an die EVA lösen:** `App.tsx` (929 Zeilen) sowie `eingabespeicher.ts` und `reisespeicher.ts` tragen den Ort heute als `eva`. Der Ort wird zu einem Wert, der entweder Bahnhof oder Haltestelle ist. Die Speicher erhöhen ihre `FASSUNG`; ältere Einträge werden umgewandelt oder verworfen (bestehende Regel in `eingabespeicher.ts`). Solange A5 nicht bestätigt ist, wird eine gespeicherte Haltestellen-ID beim Laden neu aufgelöst statt blind verwendet.
- Designregeln aus `design/DESIGN.md` und `BRIEF.md` gelten unverändert; neue Bauteile folgen ihnen.
- **Datenschutz:** Bei der Standortsuche gehen Koordinaten des Nutzers über das Backend an Transitous (die IP-Adresse des Nutzers nicht). Die Datenschutzerklärung (`components/Datenschutz.tsx`) wird entsprechend ergänzt; Koordinaten werden vor dem Weiterreichen auf V: drei Nachkommastellen (rund 100 m) gerundet, wenn Paket 0 zeigt, dass die Treffer dabei brauchbar bleiben.
- Quellenangaben in Fußzeile und Impressum: Transitous mit Link auf `transitous.org/sources`, DELFI, OpenStreetMap. `NOTICE` wird ergänzt.
- Der DB-Navigator-Import (`ReiseImport.tsx`) bleibt Bahnhöfen vorbehalten; eine Erweiterung auf Bus- und Tramumstiege ist nicht Teil von 2.0.

## 7. Arbeitspakete

Aufwand in Stunden für Claude Code einschließlich Tests (optimistisch / wahrscheinlich / pessimistisch). Jedes Paket endet mit grünen Tests und sauberem Lint in den betroffenen Ordnern (`npm test && npm run lint`, Frontend zusätzlich `npm run build`), einem Commit und einem kurzen Eintrag in README „Hier weitermachen“. Pakete sind so geschnitten, dass sie einzeln auslieferbar sind.

### Paket 0 – Erkundung gegen Transitous (Voraussetzung)

| Nr. | Aufgabe | Aufwand | Fertig, wenn |
|---|---|---|---|
| 0.1 | Netzzugang prüfen: Die eingebaute Cloud-Umgebung sperrte `api.transitous.org`; Julian hat am 16.10.2026 die Standard-Cloud-Umgebung des Projekts geändert; ein Testthread auf der neuen Umgebung erreichte Transitous am selben Tag (Suche 1,1 s, Abfahrten 0,5 s). Die Umsetzung läuft deshalb in einem neuen Thread | – | Ein Abruf von `/api/v1/geocode` gelingt |
| 0.2 | A1–A3 und A5 mit Stichproben prüfen (10 Bundesländer, Stadt und Land, Bahnhof → Bushaltestelle); Antworten als Fixtures unter `backend/test/fixtures/` ablegen | 3/5/8 | Kurzbericht unter `docs/` mit Befund je Annahme |
| 0.3 | Lastabschätzung (Anfragen je Nutzung, je Stunde bei heutiger Nutzung) als Grundlage für die Absprache | 1/1/2 | Zahlen im Bericht |

**Meilenstein M0:** Annahmen bestätigt oder Konzept angepasst; Julian stimmt die Nutzung im Transitous-Matrix-Kanal ab.

### Paket 1 – Backend-Client

| Nr. | Aufgabe | Aufwand | Fertig, wenn |
|---|---|---|---|
| 1.1 | Client mit eigenen Typen, gegen Fixtures getestet | 3/5/8 | Tests für alle Aufgaben aus 5.1 |
| 1.2 | Pausenzustand, Zeitgrenzen, Bündelung, Zwischenspeicher, Zähler | 2/4/6 | Tests: 429 mit `Retry-After`, Zeitüberschreitung, Pause ohne Anfrage |
| 1.3 | Zuordnung Verkehrsmittel | 1/1/2 | Tabellentest einschließlich unbekannter Werte |

### Paket 2 – Backend-Routen und Live

| Nr. | Aufgabe | Aufwand | Fertig, wenn |
|---|---|---|---|
| 2.1 | `/api/orte` mit Zuordnung zu DB-Bahnhöfen | 3/5/8 | Test: Hauptbahnhof trägt EVA, Bushaltestelle nicht |
| 2.2 | `/api/haltestelle/tafel` | 2/3/5 | Tests mit und ohne Echtzeit, mit Ausfall |
| 2.3 | `/api/weg` mit Schrittübersetzung und Degradation | 4/6/10 | Tests: Normalfall, Ebenenwechsel, kein Weg gefunden |
| 2.4 | Live für Haltestellen | 3/5/8 | Bestehende Live-Tests unverändert grün, neue Tests für Haltestellen |
| 2.5 | Konfiguration und Doku (`docs/deployment.md`) | 1/2/3 | Start ohne Konfiguration: Haltestellenpfad meldet sauber „nicht eingerichtet“ |

### Paket 3 – Frontend

| Nr. | Aufgabe | Aufwand | Fertig, wenn |
|---|---|---|---|
| 3.1 | Typen spiegeln, API-Client | 2/3/5 | Tests grün |
| 3.2 | Ort statt EVA in `App.tsx` und Sitzungsspeichern | 4/6/10 | Bahnhofsablauf unverändert (bestehende Tests), Altformat-Test |
| 3.3 | Suche mit Haltestellen | 3/5/8 | Komponententests |
| 3.4 | Tafel und Fahrtauswahl für Haltestellen | 4/6/10 | Kennzeichnung „laut Fahrplan“ getestet |
| 3.5 | Weg-Ansicht und Live für Haltestellen | 3/5/8 | Ablauf Ende-zu-Ende mit Fixture-Backend |
| 3.6 | Quellenangaben, `NOTICE` | 1/1/2 | Sichtbar in Fußzeile und Impressum |

### Paket 4 – Abnahme und Auslieferung

| Nr. | Aufgabe | Aufwand | Fertig, wenn |
|---|---|---|---|
| 4.1 | Prüfung K1–K7 gegen Produktion | 3/4/6 | Protokoll in `.superpowers/` (gitignored), Ergebnis im README |
| 4.2 | Ausfalltest K5 (Basis-URL auf nicht erreichbar stellen) | 1/2/3 | App bleibt bedienbar |
| 4.3 | Auslieferung Fly (`--ha=false`) und Vercel | 1/1/2 | Live-Prüfung wie am 14.10. |

**Summe:** wahrscheinlich 70 Stunden, Spanne 45–114 Stunden, Erwartungswert (O + 4M + P) / 6 rund 73 Stunden; mit 25 % Puffer etwa 90 Stunden. Nicht enthalten: Julians Entscheidungen, die Absprache mit Transitous und Gerätetests.

### Abhängigkeiten

```
0.1 ─► 0.2 ─► 0.3 ─► M0
        │
        └─► 1.x ─► 2.x ─► 3.x ─► 4.x
                         ▲
              3.1 ─► 3.2 (kann nach 1.1 parallel beginnen)
```

Kritischer Pfad: 0.1 → 0.2 → 1.x → 2.x → 3.4/3.5 → 4.x. Ohne Netzzugang (0.1) kann nur gegen Fixtures gebaut werden, und die Fixtures setzen 0.2 voraus.

## 8. Risiken

| Risiko | Wirkung | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|---|
| Transitous beendet oder begrenzt den Zugang (best effort, jederzeit möglich) | Hoch | Niedrig bis mittel | F4: Wechsel auf eigenen MOTIS ohne Neuentwicklung; Degradation hält Bahnhöfe am Laufen |
| Kommerzielle Nutzung ausgeschlossen | Hoch | Sicher, sobald Einnahmen fließen | E1, Ausbaustufe Abschnitt 10 |
| Echtzeitlücken je Region | Mittel | Hoch | F5: ehrliche Kennzeichnung |
| Steigangaben fehlen oder passen nicht zur Karte | Mittel | Hoch (Stichprobe Kassel: kein `track`) | Steig aus DHID und Koordinate des Halts ableiten; Rückfall auf Haltestellenposition |
| MOTIS ändert Endpunkte oder Felder | Mittel | Mittel | Versionen zentral (5.1), Fixtures als Vertragstest, Zuordnungen mit Rückfallwerten |
| Haltestellen-IDs ändern sich bei Datenwechseln | Niedrig | Unbekannt | A5; gespeicherte IDs neu auflösen |
| Antwortzeiten von Transitous zu hoch | Mittel | Unbekannt | Zwischenspeicher, Zeitgrenzen, Messung in Paket 0 |

## 9. Kontextlücken und Deutungsspielräume

Beim Schreiben aufgefallen; jeweils mit dem Umgang, der bis zur Klärung gilt.

| Lücke | Deutung, die gilt | Klärung |
|---|---|---|
| „Alle Haltestellen“ – auch Fähren, Seilbahnen, Rufbusse (Flex)? | Alles, was Transitous als Haltestelle mit Fahrplan liefert; Rufbus-Bereiche ohne festen Halt nicht | Bei Bedarf Julian |
| „Wegführung“ – nur zwischen zwei Steigen oder auch vom Standort des Nutzers zur Haltestelle? | Nur Steig → Steig (Umstieg), wie der heutige Produktkern | Julian, falls Standort → Haltestelle gewünscht |
| Barrierefreiheit an Haltestellen | Variante „barrierefrei“ nutzt `WHEELCHAIR`; Aufzugsstatus gibt es nur an DB-Bahnhöfen (FaSta) | Paket 0 prüft Qualität |
| Umstieg zwischen Bahnhof und benachbarter Haltestelle | Haltestellenpfad mit Fußweg; Wagenposition entfällt dabei | – |
| Mehrere Steige einer Haltestelle mit gleichem Namen | Steig aus der gewählten Fahrt maßgeblich, nicht die Haltestelle | – |
| App Store | Nicht Teil von 2.0; heute Web-App | Eigenes Thema |
| Suchmaschinen-Seiten je Haltestelle (Analyse Nutzergewinnung) | Nicht Teil von 2.0 | Eigenes Thema |

## 10. Ausbaustufe: eigener MOTIS-Server (beschlossen mit E1, fällig vor den ersten Einnahmen)

Gilt, sobald Umstieg. Einnahmen erzielt oder Transitous nicht mehr trägt. Wegen F4 betrifft der Wechsel nur Betrieb und Konfiguration:

- MOTIS (MIT-Lizenz) als zweite Fly-App mit DELFI-Fahrplänen (CC BY), DELFI-Echtzeit (CC BY-SA) und OSM-Auszug Deutschland; die Quellen kann man aus Transitous' `feeds/de.json` übernehmen.
- Speicherhungriger Import auf einer kurzzeitig gestarteten großen Maschine, Dauerbetrieb klein.
- Kostenschätzung nach Fly-Standardpreisen etwa 50 $ (8 GB) bis 95 $ (16 GB) im Monat; vorher messen.
- Vor den Einnahmen die Lizenzen der Echtzeit-Teilquellen klären (CC BY-SA verlangt gleiche Lizenz für abgeleitete Daten).

Die Einzelheiten stehen im Nachtrag der Analyse (Abschnitt 8) und werden zu gegebener Zeit als eigenes Konzept geschrieben.

## 11. Pflege dieses Konzepts

- Das Konzept wird nach Bestätigung durch Julian als Spec ins Repository übernommen (V: `docs/superpowers/specs/2026-10-16-umstieg-2-design.md`, passend zur bestehenden Ablage) und dort weitergeführt.
- Jede Abweichung von einer Festlegung (F) braucht Julians Zustimmung; Abweichungen von Leitplanken (L) und Vorschlägen (V) werden mit Grund im Commit und im README vermerkt.
- Bestätigte oder widerlegte Annahmen werden in Abschnitt 3 mit Datum nachgetragen.

## Quellen

- Transitous, API-Bedingungen: https://transitous.org/api/ · Dokumentation: https://transitous.org/doc/ · Quellen Deutschland: https://github.com/public-transport/transitous/blob/main/feeds/de.json
- MOTIS-OpenAPI: https://raw.githubusercontent.com/motis-project/motis/master/openapi.yaml · Lizenz (MIT): https://github.com/motis-project/motis/blob/master/LICENSE
- Fly.io-Preise: https://fly.io/docs/about/pricing/
- Weitere Quellen: `01-moeglichkeiten-und-umsetzungswege.md`, Abschnitt Quellen (Analyse, nicht im Repository)
