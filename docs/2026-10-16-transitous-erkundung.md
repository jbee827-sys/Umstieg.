# Paket 0 – Erkundung gegen Transitous (16.10.2026)

Grundlage: Konzept Umstieg 2.0 (`docs/superpowers/specs/2026-10-16-umstieg-2-design.md`),
MOTIS-OpenAPI (Branch `master`, abgerufen am 16.10.2026). Alle Abrufe liefen von
Julians Rechner aus, nacheinander mit 1,2 s Pause und User-Agent
`Umstieg/0.1-erkundung (+https://www.umstieg.online)`. Insgesamt **59 Anfragen** (53 davon mit Zeitmessung).
Die Rohantworten liegen in `.superpowers/erkundung-2026-10-16/roh/` (gitignored),
eine Auswahl davon unter `backend/test/fixtures/motis/`.

## 0.1 Netzzugang

`GET https://api.transitous.org/api/v1/geocode?text=Kassel%20Rathaus&type=STOP`
→ HTTP 200 in 0,34 s. **Erfüllt.**

## 0.2 Befund je Annahme

### A1 – DELFI, VBB und VBN sind enthalten, Echtzeit je Region · **bestätigt, mit Vorbehalten**

Die Haltestellen-IDs nennen ihre Quelle als Präfix: `de-DELFI_…`, `de-VBB_…`,
`de-VBN_…`, dazu `at-Railway-Current-Reference-Data-2026_…` für große Bahnhöfe.
Gefunden wurden 24 Suchbegriffe aus allen 16 Bundesländern, Stadt und Land.

| Haltestelle | Bundesland | Echtzeit (Abfahrten mit `realTime`) | `track` |
|---|---|---|---|
| Kassel Rathaus (Tram) | HE | 19 von 20 | 0 von 20 |
| Berlin Hbf | BE | 9 von 24 | 22 von 24 |
| S+U Hauptbahnhof/Washingtonplatz (Bus) | BE | **0 von 20** | 20 von 20 |
| S+U Alexanderplatz | BE | 6 von 21 | 14 von 21 |
| München Hbf | BY | 22 von 23 | 21 von 23 |
| Karlsplatz (Stachus) | BY | 19 von 21 | 21 von 21 |
| Leipzig Hbf | SN | 20 von 20 | **1 von 20** |
| Dresden Postplatz | SN | 17 von 20 | 20 von 20 |
| Rostock, Lange Straße | MV | 20 von 20 | 20 von 20 |
| Wiesenburg, Bahnhof (Bus) | BB | 16 von 21 | 4 von 21 |
| Titisee Bahnhof | BW | 15 von 20 | 20 von 20 |
| Cochem Bahnhof | RP | 15 von 20 | 14 von 20 |
| Köln Neumarkt | NW | 18 von 20 | 20 von 20 |
| Hannover Kröpcke | NI | 20 von 21 | 21 von 21 |
| Erfurt, Anger | TH | 20 von 20 | 20 von 20 |

Echtzeit ist verbreitet, aber lückenhaft: Berliner Busse kamen ganz ohne. F5 („laut
Fahrplan“) ist damit kein Randfall.

**Neue Befunde, die das Konzept nicht kannte:**

1. **Fremde Treffer.** Die Suche liefert weltweit: „Wien Karlsplatz“, „New Hamburg“
   (USA), „Zug Postplatz“ (CH). Treffer tragen `country`; Umstieg. filtert auf `DE`.
2. **Mitfahr- und Fernbusquellen.** `de-amarillo-bw_…` (Mitfahrbänke, Modus
   `RIDE_SHARING` oder leer), `eu-blablacar-bus_…`, `eu-flixbus_…`. Treffer ohne
   einen Modus aus Bus, Tram, U-Bahn, S-Bahn, Bahn, Fähre oder Seilbahn fallen weg.
3. **Doppelte Haltestellen.** Derselbe Ort kommt mehrfach aus verschiedenen Quellen
   (Leipzig Hbf aus DELFI und `nl-OpenOV`). Entdoppelt wird nach Name und Lage.
4. **Doppelte Fahrten.** In Wiesenburg steht jede Busfahrt zweimal in der Tafel,
   einmal aus DELFI und einmal aus VBB, mit gleicher Linie, gleichem Ziel und gleicher
   Sollzeit, aber verschiedenen IDs. Die Tafel entdoppelt nach Linie, Ziel und
   Sollzeit.
5. **Suchnamen.** „Berlin ZOB“ findet als ersten Treffer eine albanische Fernbusquelle
   (`al-ShowMeBus`), „Hamburg ZOB“ den Hamburger Hbf (ein Alias derselben Station),
   „Uelzen Bahnhof“ steht nicht unter den ersten vier. Die Bahnhofssuche über
   RIS::Stations bleibt deshalb als zweite Quelle Teil der Suche (siehe 2.1 im Plan).

### A2 – Der Steig einer Abfahrt ist bestimmbar · **bestätigt**

Jeder Eintrag der Tafel trägt **seinen eigenen Halt**: `place.stopId` (z. B.
`de-DELFI_de:06611:200003::B`), `place.lat`/`lon`, oft `place.level` und
`place.description` („Bahnsteig Gleis 7“, „Steig 44“, „Bushalt R.-Hirsch-Str. ht.
Fr.-List-Ufer“). Das Steig-Kennzeichen kommt in dieser Reihenfolge aus:

1. `place.track` (bei den meisten Verbünden belegt, auch bei Bussen: „Pos. 12“),
2. sonst dem letzten Teil einer DHID-Steigkennung (`…::A` in Kassel; die DHID ist
   der bundesweite Standard für Haltestellen, VDV 432),
3. sonst keinem Kennzeichen; dann bleibt die Koordinate des Halts.

Die Koordinate ist in allen Stichproben belegt (Kassel: A und B 50 m auseinander,
Berlin Hbf: zwölf verschiedene Halte). Der Konzeptsatz „keine Annahmen über den
Aufbau der IDs“ wird damit an genau einer Stelle gelockert: Die DHID wird gelesen,
aber nur als Anzeige des Steigs, nie als Schlüssel.

### A3 – Reiner Fußweg über `/api/v6/plan` · **bestätigt, mit zwei Fallen**

`transitModes=` (leer) mit `directModes=WALK` liefert unter `direct` genau einen
Weg mit `legs[0].mode = WALK`, `steps` und Geometrie (Polylinie, Genauigkeit 6).
Mit `pedestrianProfile=WHEELCHAIR` kommt ein anderer Weg über Aufzüge
(Alexanderplatz S → U8: 192 m über Treppen, 165 m über zwei Aufzüge).

| Paar | Weg | Schritte | Ebenenwechsel |
|---|---|---|---|
| Berlin Hbf Gleis 7 → Bus Washingtonplatz | 309 m | 16 | Treppe −2 → −1 |
| München Hbf Gleis 16 → U2 | 413 m | 27 | Treppe 0 → −1, Aufzug → −4 |
| Alexanderplatz S → U8 | 192 m | 22 | drei Treppen 1 → −3 |
| Alexanderplatz S → U8, Rollstuhl | 165 m | 17 | zwei Aufzüge |
| Stachus S6 → Tram 18 | 196 m | 15 | drei Treppen −3 → 0 |
| Kassel Rathaus A → B | 92 m | 5 | keine |
| Kassel → Berlin (zu weit) | – | – | `direct: []` |

**Fallen, die die Übersetzung abfangen muss:**

1. **Keine Abbiegerichtung.** `relativeDirection` war in allen 120 Schritten
   `CONTINUE`, `STAIRS` oder `ELEVATOR`, nie `LEFT`/`RIGHT`. Richtungen kommen deshalb
   aus der Geometrie, so wie `core/textgen.ts` sie heute schon aus dem Graphen
   berechnet.
2. **Treppenrichtung verkehrt.** `fromLevel`/`toLevel` einer Treppe stehen teils
   gegen die Gehrichtung (Berlin: Schritt vorher −2, Treppe „−1 → −2“, Schritt
   danach −1). Ob es hinauf oder hinunter geht, folgt aus den Ebenen der Schritte
   davor und danach, nicht aus der Treppe selbst.
3. Schritte sind kleinteilig (viele 1–5 m). Zusammengefasst wird wie im Bahnhofspfad.

Fahrtrouten über die Fahrplanauskunft (`itineraries`) blieben bei leerem
`transitModes` aus, wie gewollt (F2).

### A5 – Haltestellen-IDs bleiben über Datenwechsel gültig · **nicht belegbar, Risiko bestätigt**

Ein wöchentlicher Datenwechsel lässt sich an einem Tag nicht beobachten. Die IDs
tragen aber den Quellnamen und teils eine **Jahreszahl**
(`at-Railway-Current-Reference-Data-2026_…`): Spätestens mit der Quelle für 2027
ändern sie sich. Dafür gibt es einen Rückfall, den das Konzept noch nicht kannte:

- `/api/v6/stoptimes` nimmt neben `stopId` auch `center` (Koordinate) und
  `radius`. Ist die ID unbekannt, gilt die Koordinate. Geprüft: unbekannte ID allein
  → HTTP 404 `no radius: stop_found=false`; unbekannte ID mit `center` der Kasseler
  Haltestelle und `radius=30` → die richtigen Abfahrten von Kassel Rathaus A und B.
- Mit gültiger ID ändert `center`+`radius=30` das Ergebnis nicht (Berlin
  Washingtonplatz: dieselben zwei Halte).

**Folge für den Bau:** Die Tafel schickt immer `stopId` **und** die Koordinate der
Haltestelle (nicht des Nutzers) mit `radius=30`. Eine gespeicherte Sitzung, deren ID
ausgelaufen ist, findet ihre Haltestelle damit weiter. Dauerhaft gespeichert werden
IDs weiterhin nicht.

### Datenschutz: Rundung auf drei Nachkommastellen

`reverse-geocode` mit `51.313,9.493` (gerundet) und `51.31263,9.49286` (genau)
lieferte dieselben fünf Haltestellen in derselben Reihenfolge, Berlin Hbf gerundet
den Bahnhof als ersten Treffer. **Die Rundung bleibt brauchbar** und gilt.

### Fahrtverlauf `/api/v6/trip`

Liefert die Fahrt als Itinerary mit einem Abschnitt und allen Zwischenhalten
(Kassel Tram 6: 22 Zwischenhalte). Eine kaputte `tripId` → HTTP 400. Für 2.0 nicht
im kritischen Pfad; der Client unterstützt den Abruf (Konzept 5.1), die Oberfläche
nutzt ihn noch nicht.

### Antwortzeiten (53 gemessene Anfragen)

| Endpunkt | Anzahl | Median | Maximum |
|---|---|---|---|
| `/api/v1/geocode` | 24 | 105 ms | 299 ms |
| `/api/v1/reverse-geocode` | 3 | 42 ms | 121 ms |
| `/api/v6/stoptimes` | 16 | 43 ms | 179 ms |
| `/api/v6/plan` | 8 | 50 ms | 182 ms |
| `/api/v6/trip` | 2 | 228 ms | 228 ms |

Die Zeitgrenzen des Konzepts (4 s Suche und Tafel, 8 s Fußweg) sind mehr als
zehnmal so groß wie das gemessene Maximum.

## 0.3 Lastabschätzung

Annahmen: ein Haltestellen-Umstieg = zwei Ortssuchen mit je etwa vier entprellten
Tippschritten, je eine Ankunfts- und Abfahrtstafel, ein Fußweg je Variante (Fuß,
Rollstuhl), Live-Überwachung zweier Haltestellen über 15 Minuten bei 60 s Abstand.

| Posten | Anfragen an Transitous |
|---|---|
| Suche (8 Tippschritte, Zwischenspeicher 24 h trifft oft) | ≤ 8 |
| Tafeln (Zwischenspeicher 30 s) | 2 |
| Fußweg (2 Profile, Zwischenspeicher 24 h je Steigpaar) | ≤ 2 |
| Live (2 Haltestellen × 15 Abrufe, egal wie viele zuschauen) | 30 |
| **Summe je Umstieg** | **≤ 42** |

Heutige Nutzung: 78 Besucher in gut drei Wochen (Vercel Analytics), also rund vier
am Tag. Selbst wenn jeder einen Haltestellen-Umstieg macht: **unter 200 Anfragen am
Tag, im Mittel unter 10 je Stunde**. Die Hälfte entfällt auf die Live-Überwachung;
sie ist zugleich der Posten, der mit der Nutzung wächst, aber durch die Bündelung je
Haltestelle nicht mit der Zahl der Zuschauer.

Das Backend schreibt dazu stündlich die tatsächlichen Zahlen je Endpunkt ins
Protokoll (K7, Plan Task 3). **Für die Absprache im Matrix-Kanal von Transitous**
(F7, Julian) reichen diese Zahlen.

## Was sich am Konzept ändert

- A1–A3 bestätigt, A5 als Risiko bestätigt, Rückfall über `center`+`radius` neu.
- Suche: Filter auf `country=DE` und Verkehrsmittel, Entdoppelung, RIS::Stations
  bleibt zweite Quelle.
- Tafel: Entdoppelung über Quellen hinweg.
- Fußweg: Richtung aus der Geometrie, Ebenen aus den Nachbarschritten.
- E3 (Julian, 16.10.2026): **zwei Ortsfelder** im Eingabefenster, Ankunft und
  Anschluss, jedes findet Bahnhöfe und Haltestellen. Ein leerer Anschluss bedeutet
  „gleicher Ort“.
