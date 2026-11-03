# Reddit-Rückmeldungen umsetzen – Entwurf

Stand: 03.11.2026. Grundlage: `Umstieg_Konzepte/08-reddit-auswertung-wegfuehrung.md`
(G1–G6, B.1/B.2) und der Code auf `fix/offene-punkte` (= `main`, Stand
`d1be87a`, 02.11.2026). Alle Befunde unten sind mit dem heutigen Code
nachgerechnet (Diagnoseskripte unter `backend/osm-ablage/diagnose/`,
gitignored), nicht aus der Auswertung übernommen.

## 1. Anlass und Ziel

Die Rückmeldungen aus r/deutschebahn und r/bahn sollen generisch gelöst
werden: Jede Änderung gilt für alle Bahnhöfe, nicht für den gemeldeten
einzelnen. Jede Änderung wird über den ganzen Startbestand (382 Bahnhöfe)
gemessen, bevor sie als fertig gilt.

**Ziele**
- Zeiten, die der Wirklichkeit näher kommen (Aufzug, Stopp an WC/Kiosk).
- Gleisbezeichnungen, die Fahrgäste kennen.
- Ein Ebenenschema, das die Bahnsteige in ihrer echten Lage zeigt.
- Eine Ampel, die einen unerreichbaren Anschluss nie grün zeigt.

**Nicht in dieser Runde** (bewusst): G6 Baustellen (München-Laim), alle
Vorschläge aus B.2 (Einstiegsposition, Liniennummern, Tutorial zur Ampel,
OSM-Rückgabe …), der Dunkelmodus (am 02.11. erledigt).

**Anti-Ziele** – das wäre ein Fehlschlag, auch wenn es technisch läuft:
- Ein Sonderfall für einen einzelnen Bahnhof im Code.
- Eine angezeigte Zeit, die nicht die ist, nach der die Route gesucht wurde
  (Grundsatz aus `core/gehzeit.ts`: Der Router minimiert, was er hinschreibt).
- Ein Weg, der als stufenfrei gilt und Stufen hat.
- Neue Routen über Gleise (Gleisprüfung gegen die Basis vom 03.11.).

## 2. Was am 02.11.2026 schon behoben ist (geprüft am 03.11.)

| Meldung | Befund heute |
|---|---|
| A3 Bonn 1→2/3 | Weg durch die Unterführung (Rolltreppe/Treppe), stufenfrei: Absage |
| A4 Köln 8→10 | über Treppen, 184 s |
| A5 Neumünster 1→4 | durch die Unterführung |
| A6 München Zickzack | 5→26, 12→20 laufen über den Querbahnsteig, keine Kreuzung |
| A7 München Gleis 34 | im Graphen vorhanden |
| A2 Stuttgart | 306 von 306 Gleispaaren mit Weg |
| Dunkelmodus Karte | natürliche Farben |

Basis der Gleisprüfung (03.11.): 169 von 14.812 Routen kreuzen ein Gleis, an
19 Bahnhöfen (Dortmund Hbf 66, Siegen 16, Bremen 14 …). Datei:
`backend/osm-ablage/laeufe/gleise-basis-0311.json`.

## 3. G1-Rest – Wege über Gleise

Kein neues Verhalten, sondern Abarbeiten der Reste mit der Regel vom 02.11.
(Knoten gehört zu höchstens einem Bahnsteig, verlassen nur über OSM-Wege):

- Die 169 Routen ansehen, beginnend mit der häufigsten Kante
  (Dortmund `gleis6:mitte > n2385416821@1`, 40 Routen). Lösung nur als
  allgemeine Regel, nie als Ausnahme für einen Bahnhof.
- Umfang (Claudes Wahl): nach Häufigkeit der verursachenden Kante
  abarbeiten, nur allgemeine Ursachen beheben. Was sich nur durch eine
  OSM-Korrektur lösen ließe oder dabei eine andere Route bräche, wird je
  Bahnhof als Liste berichtet, nicht erzwungen.
- Erfolg: weniger Kreuzungen, keine neue Kreuzung, keine neue Lücke
  („ohne Weg“), gemessen mit `scripts/gleiskreuzung-pruefung.ts neu.json
  osm-ablage/laeufe/gleise-basis-0311.json`.
- **Nur messen und berichten, nicht ändern:** Wie viele stufenfreie Routen
  hängen an Ebenen, die geraten sind (Bahnsteig oder Weg ohne `level`-Tag,
  `ebeneBelegt=false`)? Ob daraus ein Hinweis „Stufenfreiheit unbekannt“
  wird, entscheidet Julian nach der Zahl.

## 4. G2 – Zeiten

### 4.1 Aufzug als Schacht (Entscheidung Julian)

Heute kostet jede Aufzugkante pauschal 60 s, und ein Aufzug über mehrere
Ebenen ist eine Kette von Kanten zwischen benachbarten Ebenen (Pass C in
`baueGraph`). Folgen: Berlin Hbf 2→12 zahlt für eine Fahrt −2→+1 dreimal
60 s, und die Anleitung nennt drei Schritte („Aufzug zur −1“, „zur 0“, „zur 1“).

Neu:
- Ein Aufzug (OSM-Knoten oder -Weg `highway=elevator`) ist ein **Schacht**
  mit allen Ebenen, die er bedient. Jedes Ebenenpaar des Schachts ist direkt
  verbunden – eine Fahrt ist eine Kante, ein Schritt („Aufzug zur Ebene 1“).
- Zeit einer Fahrt von Ebene a nach b in einem Schacht mit den Ebenen
  min…max:
  `Warten = (max − min) × 10 s + 15 s` – ungünstigster Fall, die Kabine
  kommt vom entferntesten Ende des Schachts;
  `Fahrt = |b − a| × 10 s + 15 s` – Ebenen plus Türen/Ein-/Aussteigen.
  Ebenen zählen in OSM-Einheiten, halbe Ebenen also halb.
  (10 s und 15 s sind Claudes Vorschlag; als benannte Konstanten in
  `gehzeit.ts`.)
- Die Zeit gilt **überall gleich**: Routing, angezeigte Gehzeit, Ampel,
  Schrittsekunden (Invariante Summe der Schritte = `gehzeitSek` bleibt).
- **Schnellste Route**: vergleicht Aufzug gegen Treppe/Rolltreppe mit diesen
  Zeiten und nimmt den schnelleren Weg. **Stufenfrei**: immer Aufzug, mit
  derselben Zeit. Keine Warteschlange, kein Zuschlag für große Bahnhöfe:
  Berlin 2→12 bleibt beim Aufzug (Entscheidung Julian; gerechnet rund
  260 s gegen 358 s über Rolltreppen).
- Ein Aufzug zwischen zwei Ebenen kostet danach 50 s statt 60 s.
- **Welche Ebenen zum Schacht gehören** (Claudes Wahl): die Ebenen aus dem
  `level`-Tag des Aufzugs, auch solche, an denen im Graphen kein Weg
  anschließt – die Kabine fährt den ganzen Schacht, und der ungünstigste Fall
  ist der physische. Fehlt der Tag oder nennt er weniger als zwei Ebenen,
  gelten die Ebenen, die der Graph am Aufzug kennt. Verbunden werden nur
  Ebenen, an denen ein Knoten existiert.

Mitzuziehen, weil der Schacht mehrere Kanten derselben Anlage erzeugt:
- **FaSta-Status je Anlage, nicht je Kante.** `wendeFastaAn` setzt den Status
  heute über die Entfernung auf genau EINE Kante. Schon heute bleibt damit
  bei einer Kette ein Teil eines gestörten Aufzugs benutzbar. Neu: Jede
  Aufzugkante trägt einen Anlagenschlüssel (OSM-Kennung); der Status gilt
  für alle Kanten derselben Anlage.
- **Zählen je Anlage** (siehe 6.3).
- Die Verbindungskanten in `zieheNaehte`-Umgebung (Ebenenwechsel-Wege mit
  `laengeM: 0, typ: 'rampe', barrierefrei: elevator`, `graph.ts` um Zeile
  400) prüfen: Ein Aufzug-Weg darf nicht zusätzlich eine kostenlose Rampe
  zwischen seinen Ebenen erzeugen.
- Synthesemodell (`synthmodell.ts`, Aufzüge aus FaSta): dieselbe Zeitformel;
  die Ebenen des Schachts sind dort die beiden verbundenen Ebenen.

### 4.2 Mit Stopp: 5 Minuten (Entscheidung Julian)

Heute rechnet „Mit Stopp: WC & Kiosk“ nur den Fußweg (Nordhausen 1→3: 222 s
inklusive Toilette). Neu: **300 s Aufenthalt** zusätzlich zum Fußweg, gleich
für WC und Kiosk (beide in einem Knopf; die Wahl des Stopps ändert sich
dadurch nicht). Die 300 s stehen als eigener Schritt in der Anleitung
(„5 min Stopp: WC“ bzw. „Kiosk“) und zählen in `gehzeitSek` und Ampel.
Wie der Aufenthalt im Pfad dargestellt wird, entscheidet der Bauende; die
Invariante Summe der Schritte = `gehzeitSek` muss halten.

### 4.3 Leipzig – keine Änderung

Die Unterführung ist ein echter OSM-Weg (Treppen `level=0;1`, Gang 22 m).
Wer am Querbahnsteig aussteigt, bekommt schon heute den Querbahnsteig
(11→13: Zugende 164 s über Querbahnsteig, Mitte 232 s durch die
Unterführung).

## 5. G3 – Bahnhofsteile und Zugänge: nichts zu bauen

- Stuttgart: am 02.11. erledigt. Fehlt ein Weg, sagt die App das (Standard-
  modell mit Hinweis, stufenfrei Absage).
- Tübingen (Bus → Zug): Der Weg kommt von Transitous, nicht aus unserem
  Graphen. Abfrage am 03.11.: Transitous setzt jedes Gleis auf seinen
  Bahnsteig; der Weg ZOB → Gleis 3/5 führt durch einen öffentlichen
  Durchgang des Empfangsgebäudes (`tunnel=building_passage`) in die
  Unterführung, 141 m. Das Tunnelstück nördlich des Gebäudes (Weg
  1216837980) endet in OSM ohne Verbindung – ein Datenfehler in OSM, kein
  Fehler im Code. Kein Bau. (Kann als OSM-Korrektur notiert werden.)

## 6. G4 und G5

### 6.1 Gleisnamen vergleichen ohne Schreibweise (G4)

RIS::Stations schreibt Teilgleise uneinheitlich: Augsburg „1 A-B“ (267
Fälle in der Ablage mit Leerzeichen), Hamburg „7G-I“ (31 ohne). Kommt aus
dem Fahrplan „7 G-I“, findet `loeseGleis` den Eintrag nicht. Neu: Jeder
Vergleich von Gleisnamen (Graph, DB-Liste, `istKopfgleis`, Teilgleis-
Auflösung) läuft über eine Normalform – ohne Leerzeichen, alle Striche
(‐ – — −) als „-“, ohne Groß/Klein. Angezeigt wird weiter der Name, wie er
angefragt wurde.

### 6.2 Gleise nach Verkehrsart, je Art ein Reiter (Entscheidung Julian)

München Hbf 51–56 und Marienplatz 51/52 sind U-Bahn-Steige
(`subway=yes`, ohne `train=yes`). Im DB-Fahrplan gibt es sie nicht; sichtbar
sind sie heute nur auf den Bahnhofsseiten. Bielefeld Hbf („Hauptbahnhof (U)“,
1–4), Düsseldorf Hbf (1;3, 2;4) und ein Steig in Stuttgart Hbf sind
unterirdische Stadtbahnen, nur als `light_rail` getaggt – ihre Nummern
stoßen mit den DB-Gleisen 1–4 zusammen.

Julians Vorgabe: Die Unterscheidung gilt allgemein, nicht nur für U-Bahn.
Drei Arten, je Art ein Reiter, soweit sie sich unterscheiden lassen:

- **Züge** – DB-Gleise des Fern- und Regionalverkehrs; alles, was sich
  nicht sicher als S-Bahn erkennen lässt, bleibt hier.
- **S-Bahn** – DB-Gleise, die sich sicher als S-Bahn erkennen lassen.
  Erkennungsregel (Claudes Wahl, eng): Die DB führt das Gleis unter einer
  Verkehrsstelle, die nur S-Bahn anbietet (RIS `availableTransports` nur
  `CITY_TRAIN`, z. B. „München Hbf (tief)“), ODER der OSM-Bahnsteig weist
  sich ausschließlich als S-Bahn aus (Linien nur `S…` in `route_ref`/
  `description`, oder `light_rail=yes` bei einem Gleis, das die DB führt –
  Berliner S-Bahn). Im Zweifel: Züge. S-Bahn-Gleise bleiben normale Gleise
  (wählbar, Routing unverändert); nur die Bahnhofsseite gruppiert sie.
- **U-Bahn** – Steige, die die DB nicht führt: `subway=yes`, und
  unterirdische Stadtbahn (`light_rail=yes`, unter der Erde: `level` < 0,
  `tunnel=yes` oder `location=underground`), wenn kein DB-Gleis per IFOPT
  oder Namen auf diesen Bahnsteig fällt. Oberirdische Stadtbahn ohne DB-Gleis
  bleibt draußen wie die Straßenbahn. Fehlt die DB-Gleisliste oder ist sie
  unvollständig (`gleislisteUnvollstaendig`), zählt nur `subway=yes` als
  U-Bahn; `light_rail` bleibt dann wie heute (aus Fehlendem wird nichts
  geschlossen).

Für U-Bahn-Steige gilt:

- Im Graphen sind U-Bahn-Steige **keine Gleise** mehr (`graph.gleise`
  enthält sie nicht, kein Zusammenstoß mehr mit DB-Gleisnummern, vgl. Berlin
  „S+U Hauptbahnhof“ Gleis 4). Sie bleiben aber als eigene Art im Graphen
  erhalten und routbar, damit die Bahnhofsseite Gehzeiten zu ihnen rechnen
  kann.
- **Bahnhofsseite**: Über „Gehzeiten nach Ankunftsgleis“ stehen Reiter
  „Züge | S-Bahn | U-Bahn“, jeweils nur, wenn es die Art an diesem Bahnhof
  gibt; gibt es nur Züge, entfällt die Reiterleiste. „Züge“ und „S-Bahn“
  zeigen die heutigen Blöcke „Ankunft Gleis X“ für die Ankunftsgleise ihrer
  Art, mit Zeilen zu allen Gleisen beider Arten. Der Reiter „U-Bahn“ zeigt
  je U-Bahn-Steig eine aufklappbare Tabelle mit Gehzeit, Weg und Stufenfrei
  zu jedem Gleis (Claudes Vorschlag: eine Tabelle je Steig, weil die Zeiten
  in beide Richtungen gleich gerechnet werden). Beschriftung des Steigs aus
  OSM, möglichst mit Linien („U1 U2 U7 U8“), sonst „U-Bahn-Steig 51/53“.
  Unterirdische Stadtbahn heißt dort ebenfalls U-Bahn.
- Live-App: unverändert; U-Bahn-Fahrten laufen über den Haltestellenpfad.
- **Welche Steige zum Bahnhof gehören** (Claudes Wahl): Der Overpass-Umkreis
  bringt U-Bahn-Steige fremder Haltestellen mit (Hamburg Hbf:
  Mönckebergstraße; Stuttgart Hbf: Staatsgalerie; Alexanderplatz: Rotes
  Rathaus). Ein Steig erscheint im Reiter nur, wenn er im Bahnhofsgraphen
  erreichbar ist UND sein OSM-`name` zum Bahnhof passt (Namensschlüssel wie
  `core/bahnhofsname.ts`, „Hbf“ = „Hauptbahnhof“, Zusätze wie „Nord“/„Süd“
  erlaubt – Hamburg Hbf behält „Hauptbahnhof Nord/Süd“). Die Übergabe an
  Nachbarbahnhöfe (`fremdeGleise` in `bahnhofsseiten-daten.ts`) gilt für
  U-Bahn-Steige genauso wie für Gleise.

### 6.3 S-Bahn tief: DB-Name statt OSM-Nummer (G4)

OSM nennt die Münchner S-Bahn tief „81;82“, die DB „1“ und „2“ (IFOPT
`de:09162:6:40:81/82`). Die Live-App ordnet sie per IFOPT schon zu, hängt
die DB-Namen aber nur an – „81“ und „82“ bleiben in `graph.gleise`. Neu:
Ordnet die IFOPT-Kennung einem Bahnsteig DB-Gleise zu, ersetzen sie dessen
OSM-Nummern, die die DB an diesem Bahnhof nicht führt.

Die Bahnhofsseiten werden heute ohne DB-Daten gerechnet und zeigen deshalb
81/82. Dafür werden die RIS-Gleislisten aller 382 Bahnhöfe einmal geholt
(echte DB-Anfragen, Schlüssel über `ladeSecrets()`) und abgelegt – je
Verkehrsstelle der Gruppe auch `availableTransports`, das 6.2 für die
S-Bahn braucht; das
Skript der Bahnhofsseiten baut den Graphen dann wie der Server mit
`dbGleise`. Ablageort: gitignored unter `backend/osm-ablage/` (Claudes Wahl:
die Namen landen ohnehin in den eingecheckten Seitendaten, die Rohdaten
brauchen kein Repo).

### 6.4 Schema in echter Lage (G5)

Saarbrücken: Die Bahnsteige sind gebogen und verschieden lang. `ordneQuer`
projiziert die Mitte jedes Bahnsteigs auf eine mittlere Querachse und
ergibt 11, 16, 14, 8, 12, 6, 2, 5, 3, 1. Nachgemessen am OSM-Umriss, dort wo
zwei Bahnsteige nebeneinanderliegen, ist die Reihenfolge Süd→Nord
1 | 2/3 | 5/6 | 8 | 11/12 | 14/16.

- `baueGraph` merkt sich je Bahnsteig eine **Mittellinie** aus dem OSM-
  Umriss (Fläche) bzw. der Linie selbst (Linie, `platform_edge`).
  `kopiereGraph` übernimmt sie; das Synthesemodell hat keine und fällt auf
  die heutige Sehne zurück.
- **Reihenfolge**: aus den Querabständen zwischen Bahnsteigen, wo sie sich
  der Länge nach überlappen, zu einer Lage je Bahnsteig verrechnet.
  Bahnsteige ohne Überlappung behalten die heutige Projektion. Prüfsteine:
  Saarbrücken wie oben; Berlin Hbf tief Gleis 22 neben 7/8 bleibt.
- **Zugänge**: Eine Treppe/ein Aufzug gehört zu dem Bahnsteig, dessen
  Mittellinie er am nächsten liegt (statt Sehne plus halbe Krümmung als
  Spielraum). Dann bekommt Saarbrücken Gleis 12 nicht mehr die Abgänge von
  14/16.
- **Zählen je Anlage**: Jede Treppe, Rolltreppe, jeder Aufzug zählt einmal
  (über die OSM-Kennung), egal wie viele Kanten daraus werden.

### 6.5 Fußzeile nennt nur die genutzte Anlage (Entscheidung Julian)

Heute: „Treppe hinunter bei 195 m · 3 Treppen, 3 Aufzüge“. Neu:
„Treppe hinunter bei 195 m“ – nur die Anlage, die der Weg benutzt. Das
Schema zeichnet die übrigen Zugänge weiter.

## 7. B.1 – Fehler außerhalb der Wegführung

### 7.1 Ampel rechnet ab Ankunft (Entscheidung Julian)

Heute: Restzeit = Abfahrt − jetzt (`App.tsx`, `Dashboard.tsx`). Erfurt:
ICE an 16:21, RE ab 16:20 → „Entspannt erreichbar“.
Neu, an einer Stelle für alle Aufrufer (Ampel, Countdown, Mitteilung bei
Rot):
- Restzeit = Abfahrt − **max(jetzt, Ankunft)**. Ankunft = Ist-Ankunft, wenn
  bekannt, sonst Soll.
- Abfahrt vor Ankunft → Rot, Text „Anschluss nicht erreichbar“ – auch wenn
  erst eine Verspätung das verursacht.
- Ist die Abfahrtszeit verstrichen (über die bestehende Kulanz
  `ABGEFAHREN_KULANZ_MS` hinaus), gilt wie heute „Zug abgefahren“ ohne
  Bewertung – auch wenn er vor der Ankunft fuhr (Claudes Wahl).
- Die Mitteilung bei Rot feuert wie heute nur beim WECHSEL auf Rot, nicht
  beim Start einer Reise, deren Anschluss schon unerreichbar ist; das zeigt
  der Bildschirm (Claudes Wahl).
- Die Anschlussauswahl bleibt, wie sie ist (Entscheidung Julian): Auch
  Züge vor der Ankunft sind wählbar; die Ampel sagt dann Rot.

### 7.2 Ersatzverkehr und Linienarten (Nürnberg)

Transitous meldet RB30/RE30/RE1/RE32 als `BUS` ab Nelson-Mandela-Platz –
echter Schienenersatzverkehr; die U2/U3 teils als `TRAM` (Fehler in DELFI).
Claudes Vorschlag:
- Bus/Reisebus mit Zuglinienname (RE, RB, IRE, IC, ICE, S + Ziffer) wird als
  „Ersatzverkehr“ gekennzeichnet.
- `TRAM`/`BUS` mit Linienname `U<Zahl>` gilt als U-Bahn.
- Prüfen (wenige Leseabfragen an Transitous): Schneidet `n=10` in der
  Stoptimes-Abfrage Züge ab („manche Regionalzüge fehlen“)? Wenn ja, so weit
  erhöhen, dass das Fenster vollständig ist.

### 7.3 Abdeckung erklären

- Bahnhofsseiten: ein Satz, wie die 382 Bahnhöfe ausgewählt sind
  (DB-Preisklassen 1–3) und dass die App jeden anderen Bahnhof live rechnet.
- Prüfen, ob Schwäbisch Hall-Hessental in der Suche gefunden wird; falls
  nicht, Ursache beheben.
- Bahnhof im Ausland (Bologna): Die App sagt klar, dass sie nur Bahnhöfe in
  Deutschland abdeckt, statt keinen Umstieg zu finden. Wo der Treffer
  herkommt (RIS-Suche oder Transitous), klärt der Bauende.

## 8. Auswirkungen und Prüfung

- **Neu erzeugen** nach den Änderungen an Graph/Zeiten: Bahnhofsseiten
  (`npm run bahnhofsseiten`) und Vorführdaten der Einführungstour
  (`npm run vorfuehrdaten`, danach Schritt 7 „9 statt 6 Minuten“ prüfen –
  die Beispielreise Berlin 14→6 kann sich durch den Aufzug ändern).
- **Messen über alle 382 Bahnhöfe, vorher/nachher**:
  Gleisprüfung (keine neue Kreuzung); wie viele schnellste Routen wechseln
  zwischen Aufzug und Treppe, in welche Richtung; Gehzeiten-Verteilung;
  Schema-Reihenfolge (Zahl der Bahnhöfe mit geänderter Reihenfolge, die
  geänderten einzeln ansehen); `anfragen-pruefung.ts`,
  `simulation-bild.ts`, `simulation-lauf3.ts` ohne neue Befunde.
- **Tests**: Backend- und Frontend-Suite, **nacheinander, nie parallel**
  (sonst falsche Timeouts), Lint und Build. Zu jeder Regel ein Test.
- **Git**: Commits auf `fix/offene-punkte`, Autor Julian, keine Claude-
  Kennzeichnung. Auslieferung (Fly, `main`) erst nach Julians Freigabe.

## 9. Offen für den Bauenden

Algorithmus der Querlage (6.4) im Einzelnen, Darstellung des Aufenthalts im
Pfad (4.2), Speicherort der Mittellinie im Graphen, Beschriftung der
U-Bahn-Steige, Form der Ersatzverkehr-Kennzeichnung in der Tafel.
