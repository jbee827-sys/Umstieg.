# Verständliche Textnavigation – Konzept und Umsetzungsplan

Stand: 06.11.2026. Erarbeitet im Brainstorming mit Julian (Thread „Verständliche Textnavigation entwerfen“). Grundlage ist der Code auf `main` (Commit `68a28fe`, enthält bereits `fix/offene-punkte`).

Dieses Dokument ist für Claude Code geschrieben. Es legt Ziel, Entscheidungen und Regeln fest, lässt aber die genaue Ausgestaltung im Code offen. Wo der Code etwas anderes zeigt als hier beschrieben, gilt der Code; die Abweichung wird im Arbeitspaket begründet und Julian gemeldet. Richtungsfragen (siehe Abschnitt 9) werden vor der Umsetzung bei Julian geklärt, nicht geraten.

---

## 1. Ausgangslage

Die Wegtexte entstehen in `backend/src/core/textgen.ts` (`generiereSchritte`). Die Funktion kennt je Kante nur den Typ (`eben`, `treppe`, `rolltreppe`, `aufzug`, `rampe`), die Peilung und die Länge. Daraus entstehen Sätze wie „40 m halbrechts“, „wenige Meter links“ oder „Treppe hinunter zur Unterführung (-1)“.

Deutlich zu erkennen ist, dass diese Texte zwar genau, für Reisende aber kaum nutzbar sind:

- **Meter und Winkel sind unterwegs nicht überprüfbar.** Niemand zählt 40 m ab oder schätzt „halbrechts“ in einer Halle.
- **Der Text kennt keinen Ort.** Er weiß nicht, dass man in einer Unterführung läuft, an welchen Gleisaufgängen man vorbeikommt oder dass ein Gang „Nordpassage“ heißt.
- **Ebenennummern** („Ebene 1“, „Unterführung (-1)“) entsprechen keiner Beschilderung.
- **Zu viele Schritte.** Trotz des Zusammenfassens vom 21.10.2026 entstehen an verwinkelten Wegen weiterhin viele Kleinstschritte (vgl. `scripts/schritte-messung.ts`).

Die Informationen für bessere Texte liegen großteils bereits vor. Eine Zählung über den Startbestand (`backend/osm-bestand/`, 382 Bahnhöfe, 06.11.2026) ergibt:

| Merkmal in den OSM-Daten | Anzahl |
|---|---|
| Fußwege und Gänge (`footway`, `corridor`) | 64.101 |
| davon mit `tunnel=yes`/`building_passage` | 6.830 |
| davon mit `bridge=yes` | 1.219 |
| davon mit Namen | 1.829 (an 260 Bahnhöfen) |
| Knoten mit `entrance` bzw. `railway=train_station_entrance` | 6.578 |
| benannte Läden (`shop` + `name`), bisher nur Kioske abgefragt | 808 |

Die Namen sind allerdings überwiegend Straßen- und Platznamen („Bahnhofplatz“, „Franzstraße“); echte Gangnamen („Hieber Passage“, „Viktoriapassage“, „Sobek-Steg“) sind seltener. Somit müssen Namen nach Lage gefiltert werden (siehe 4.2). Diese Merkmale gehen heute beim Graphbau verloren: `GraphKante` trägt weder Lage noch Namen.

Die Reddit-Auswertung (`/mnt/project-files/nutzergewinnung/reddit-auswertung-wegfuehrung.md`) zeigt zudem, dass falsch als ebenerdig dargestellte Wege das größte Vertrauensproblem sind (G1). Der neue Text darf diesen Fehler nicht verstärken.

---

## 2. Ziel und Entscheidungen

**Ziel:** Der Weg wird ganzheitlich verstanden und so beschrieben, wie ein ortskundiger Mensch ihn erklären würde: an Bezugspunkten (Treppen, Rolltreppen, Aufzüge, Unter- und Überführungen, Hauptgänge, Ausgänge, Läden) statt an Metern und Winkeln.

Julians Entscheidungen vom 06.11.2026:

| Frage | Entscheidung |
|---|---|
| Darstellung | **Kurzfassung plus bessere Schritte.** Oben ein Satz über den ganzen Weg, darunter weniger, verständlichere Einzelschritte. |
| Meterangaben | **Grob im Satz nur ohne Bezugspunkt** („etwa 50 m“). Sonst stehen Meter und Sekunden nur klein als Zusatz unter dem Schritt (wie heute in `Schrittsheet`). |
| Ton | **Knapp, ohne Anrede**, wegweiserartig: „Treppe runter in die Unterführung, dann zweiter Aufgang rechts hoch zu Gleis 7.“ |
| Bezugspunkte | **Bahnanlagen, Gangnamen, Ausgänge und Läden.** Läden nur mit Absicherung (siehe 4.3). |
| Bauweise | **Weg C:** Zur Laufzeit feste Satzbausteine (regelbasiert, kostenlos, offline, testbar). Claude hilft nur während der Entwicklung beim Schreiben und Prüfen der Satzvarianten. **Keine KI zur Laufzeit.** |

Zielbild am Beispiel eines Wegs von Gleis 1 nach Gleis 3 durch eine Unterführung:

> **Kurz:** Treppe runter in die Unterführung, dann zweiter Aufgang rechts hoch zu Gleis 3.
> 1. Am Bahnsteig Richtung Abschnitt C bis zur Treppe
> 2. Treppe runter in die Unterführung
> 3. Zweiter Aufgang rechts, Treppe hoch zu Gleis 3 · *60 m · ca. 50 s*

---

## 3. Aufbau

```
RoutenPfad ──► Etappen (neu: etappen.ts) ──► Bezugspunkte (neu: bezugspunkte.ts)
                                                   │
                                                   ▼
                         Satzbaukasten (textgen.ts + satzbausteine.ts)
                                   │                     │
                                   ▼                     ▼
                              schritte[]            kurzfassung
```

1. **Graphbau merkt sich mehr** (`graph.ts`): Kanten tragen ihre Lage und ggf. ihren Namen, der Graph eine Liste von Bezugspunkten (Ausgänge, Läden).
2. **Etappen** (`etappen.ts`, neu): Zerlegung des Pfads in Abschnitte, die ein Mensch benennen würde.
3. **Bezugspunkte** (`bezugspunkte.ts`, neu): Zuordnung des stärksten verfügbaren Bezugspunkts je Etappe.
4. **Satzbaukasten** (`textgen.ts`, umgebaut; `satzbausteine.ts`, neu): Etappe → Schritt; Kernetappen → Kurzfassung.

**Was gleich bleibt (Invarianten, nicht verhandelbar):**

- `Schritt` behält `typ`, `level`, `knotenVon`, `knotenBis`, `sekunden`, `distanzM`. Karte, Ebenenschema und Ampel laufen unverändert.
- **Jede besuchte Ebene behält mindestens einen Schritt, der auf ihr endet.** Das Frontend ordnet Schritte über den Wechsel von `level` den Bändern des Schemas zu (`besuchJeSchritt` in `frontend/src/schema/bandmodell.ts`). Ein Schritt darf Durchgang und folgenden Aufgang zusammenfassen („Zweiter Aufgang rechts, Treppe hoch zu Gleis 3“), solange die Ebene des Durchgangs bereits durch den vorherigen Schritt („Treppe runter in die Unterführung“) besucht ist.
- **Summe der Schritt-Sekunden = `gehzeitSek`** (`verteileGehzeit`).
- Der Stopp (WC/Kiosk) bleibt ein eigener Schritt.

**Neu im Ergebnis:** `RouteErgebnis.kurzfassung?: string` (Backend `typen.ts`, Frontend `api/typen.ts`), ebenso im `Weg` des Haltestellenpfads.

---

## 4. Daten

### 4.1 Erweiterte OSM-Abfrage

`baueOverpassQL` (`clients/overpass.ts`) wird ergänzt um:

- Ausgänge: `node["railway"="train_station_entrance"]`, `node["entrance"]` (kommen teils schon über Weg-Knoten mit; ausdrücklich abfragen, damit auch frei stehende erfasst sind).
- Benannte Läden und Gastronomie: `node["shop"]["name"]`, `way["shop"]["name"]`, `node["amenity"~"cafe|fast_food|restaurant"]["name"]`. Weitere Kategorien (z. B. `amenity=pharmacy`) erst nach Messung (Paket 2).

Folgen:

- `ABFRAGE_VERSION` (`osm/version.ts`) leitet sich aus der Abfrage ab und ändert sich automatisch. Der gespeicherte Bestand gilt damit als veraltet und wird im Hintergrund erneuert; der Startbestand im Repo wird mit `scripts/bestand-fuellen.ts` neu gefüllt.
- Die Antwortgröße je Bahnhof steigt, die Zahl der Overpass-Anfragen nicht. Paket 2 misst den Zuwachs an Bytes und Laufzeit an zehn großen Bahnhöfen; liegt der Zuwachs über 30 %, wird Julian vor dem Weiterbauen gefragt.

### 4.2 Merkmale im Graphen

An `GraphKante` (optional, damit Stufe 3 und Altfälle weiterlaufen):

- `lage?: 'unterfuehrung' | 'ueberfuehrung' | 'bahnsteig' | 'halle' | 'draussen' | 'gang'`, abgeleitet aus `tunnel`, `bridge`, `indoor`, `highway=corridor`, `railway=platform` und Ebene. Unbekannt bleibt `undefined`, nicht geraten.
- `name?: string`, **nur** wenn die Kante innen liegt (`tunnel`, `bridge`, `indoor`, `corridor`) **oder** der Name eindeutig einen Gang bezeichnet (enthält „Passage“, „Tunnel“, „Steg“, „Unterführung“, „Halle“, „Querbahnsteig“). Straßennamen nur im Haltestellenpfad (draußen).

Am `StationGraph`:

- `bezugspunkte: { art: 'ausgang' | 'laden'; name?: string; lat; lon; level; knotenId?: string }[]`.

Die Kennzeichnung, ob eine Ebene **belegt oder geraten** ist (`wayEbeneMitBeleg`), wird an die Kante durchgereicht (`ebeneBelegt?: boolean`), damit der Text darauf reagieren kann (siehe 6).

### 4.3 Absicherung bei Läden

Ein Laden wird nur genannt, wenn **alle** Bedingungen erfüllt sind:

1. Er hat einen Namen.
2. Er liegt höchstens etwa 10 m vom Weg entfernt und auf derselben Ebene.
3. Sein Name ist im Bahnhof eindeutig (zwei „Backwerk“ → keiner wird genannt).
4. Die Etappe hat keinen stärkeren Bezugspunkt (Rangfolge 5.2).

Damit bleiben veraltete OSM-Einträge ein begrenztes Risiko: Ein fehlender Laden macht den Satz ungenauer, aber nie falsch in der Richtung, weil Gleis und Anlage immer mitgenannt werden.

---

## 5. Etappen und Bezugspunkte

### 5.1 Etappenarten

| Art | Beschreibung | Beispiel |
|---|---|---|
| `bahnsteig` | Am Bahnsteig entlang bis zum Abgang | „Am Bahnsteig Richtung Abschnitt A bis zur Rolltreppe“ |
| `wechsel` | Treppe, Rolltreppe, Aufzug, Rampe mit Ziel | „Rolltreppe runter in die Unterführung“ |
| `durchgang` | Unterführung, Überführung, Gang, Querbahnsteig, Halle | „Durch die Nordpassage“ |
| `draussen` | Vorplatz, Straße, Ausgang | „Über den Bahnhofsvorplatz zum Ausgang Süd“ |
| `stopp` | WC/Kiosk wie heute | „5 min Stopp: WC“ |

Regeln:

- Grundlage bleiben die bestehenden Segmente (`baueSegmente`, `fasseZusammen`); Etappen sind eine Ebene darüber. Die bewährten Regeln (Glättung 6 m, Podeste, mehrfach zerlegte Rampen) bleiben erhalten.
- Ebene Stücke unter 15 m gehen in der Nachbaretappe derselben Ebene auf (wie `KURZ_M`).
- Mehrere ebene Segmente auf derselben Ebene und gleicher Lage werden **eine** Etappe, auch wenn sie abknicken.
- Die Richtung am Bahnsteig wird über die Abschnittsbuchstaben bestimmt (`GraphKnoten.abschnitt`), weil diese auf jedem Bahnsteig beschildert sind. Fehlen sie, wird „zum Bahnsteigende“ bzw. „zur Bahnsteigmitte“ verwendet, zuletzt grobe Meter.

### 5.2 Rangfolge der Bezugspunkte

Je Etappe wird der stärkste verfügbare Bezugspunkt gewählt:

1. **Gleisnummer am Aufgang** („Aufgang Gleis 7“), weil sie beschildert ist.
2. **Zählen der Aufgänge** als Ergänzung („zweiter Aufgang rechts“). Gezählt werden nur Abzweige zu anderen Bahnsteigen auf derselben Seite; bei mehr als vier entfällt das Zählen.
3. **Anlagen am Weg** (Rolltreppe, Aufzug).
4. **Gangnamen und Ausgänge** aus OSM („Nordpassage“, „Ausgang Bahnhofsplatz“).
5. **Läden** (nur mit Absicherung 4.3).
6. **Grobe Meter** („etwa 50 m“, auf 10 m gerundet, bei Stufe 3 mit „ca.“).

### 5.3 Richtungen

„Links“ und „rechts“ fallen nur noch an **Entscheidungspunkten**, also an Knoten, an denen im Graphen ein anderer begehbarer Weg abzweigt. Ein Knick ohne Abzweigung erzeugt keine Anweisung. Die Achtelrichtungen („halblinks“) entfallen im Text; an einer Gabelung genügt „links halten“ bzw. „rechts halten“.

---

## 6. Sätze und Kurzfassung

### 6.1 Satzbausteine

`satzbausteine.ts` enthält eine Tabelle: je Etappenart und Situation mehrere Varianten mit Platzhaltern, z. B.

```ts
wechsel: {
  runterInUnterfuehrung: ['{anlage} runter in die Unterführung'],
  hochZuGleis: ['{anlage} hoch zu Gleis {gleis}', '{zaehlung}, {anlage} hoch zu Gleis {gleis}'],
  aufzug: ['Aufzug {hochRunter} {ziel}'],
}
```

- Die Auswahl ist **deterministisch** (abhängig von Kontext wie erste/letzte Etappe, vorhandene Bezugspunkte), nie zufällig. Derselbe Weg ergibt immer denselben Text.
- Neue Formulierungen werden in der Tabelle ergänzt, ohne die Logik zu ändern.
- Claude schreibt die Varianten in Paket 5 und prüft sie in Paket 8 (Lesbarkeitsprüfung).

### 6.2 Wortwahl

- Alltagssprache: „runter/hoch“ statt „hinunter zur Ebene −1“.
- „Unterführung“/„Überführung“ nur, wenn `lage` das belegt; sonst „nach unten“/„nach oben“.
- Keine Ebenennummern im Text.
- **Kein „ebenerdig“ oder „stufenlos“, wenn eine beteiligte Ebene nur geraten ist** (`ebeneBelegt === false`). Dann neutral: „zu Gleis 3“.
- Der erste Schritt beginnt nicht mehr mit „Nach Ausstieg“, sondern nennt den Ausgangspunkt nur, wenn er hilft („Vom Zug aus …“). Genaue Form in Paket 5 mit Julian abstimmen.

### 6.3 Kurzfassung

- Höchstens etwa 20 Wörter.
- Nennt die Ebenenwechsel und das Ziel; Bahnsteigstücke nur, wenn sie länger als etwa 100 m sind.
- Beispiele:
  > Gleich am selben Bahnsteig gegenüber, Gleis 8.
  > Aufzug runter in die Unterführung, dann Aufzug hoch zu Gleis 12.
  > Zum Kopf des Bahnsteigs, durch die Halle und rechts zu Gleis 14.
  > Rolltreppe runter, durch die Nordpassage, am Bäcker vorbei zu Gleis 101.
- „Am selben Bahnsteig gegenüber“ nur, wenn beide Gleise dieselbe `bahnsteigId` haben.

### 6.4 Schritte

- Ein Schritt je Etappe, Ziel drei bis fünf Schritte je Umstieg, höchstens etwa sechs.
- Die Variante `barrierefrei` nutzt denselben Baukasten.
- Der Haltestellenpfad (`fussweg.ts`, Umstieg 2.0) nutzt denselben Baukasten mit `zielZusatz` („zu Steig B (Bus 245)“) und Straßennamen als Bezugspunkt.

---

## 7. Absicherung und Tests

- **Schalter:** Umgebungsvariable (z. B. `TEXT_STIL=bezug|klassisch`, Vorgabe in Paket 9 mit Julian festlegen). Damit lassen sich alte und neue Texte vergleichen und bei Problemen sofort zurückschalten.
- **Musterwege** (`test/textgen-muster.test.ts`): etwa zehn Wege aus dem Startbestand mit festgehaltenem Soll-Text: Berlin Hbf (Aufzug, mehrere Ebenen), München Hbf (Querbahnsteig, Holzkirchner Flügelbahnhof), Köln Hbf, Bonn Hbf (Unterführung), Leipzig Hbf (Querbahnsteig), Hamburg Hbf, Stuttgart Hbf (Steg), ein kleiner Bahnhof mit zwei Bahnsteigen, ein Stufe-3-Bahnhof, ein Haltestellenweg.
- **Prüflauf über alle 382 Bahnhöfe** (`scripts/textpruefung.ts`, Aufbau wie `schritte-messung.ts`, offline aus dem Bestand). Regeln:
  - kein „Ebene“ und keine Ziffer mit Minuszeichen im Text,
  - Kurzfassung ≤ 20 Wörter,
  - ≤ 6 Schritte je Weg (Auffälligkeit, kein Fehler),
  - kein „ebenerdig/stufenlos“ bei geratener Ebene,
  - kein Laden ohne Eindeutigkeit,
  - Summe der Sekunden = `gehzeitSek`,
  - jede besuchte Ebene hat einen Schritt.
  Ausgabe: Zählung und Liste der Auffälligkeiten, Vorher/Nachher-Vergleich mit dem klassischen Text.
- **Lesbarkeitsprüfung durch Claude** (nur Entwicklung): Eine Stichprobe von etwa 50 Wegtexten aus dem Prüflauf wird als Datei ausgegeben und von Claude bewertet (verständlich? eindeutig? zu lang?). Schwache Sätze werden als neue Varianten in die Bausteintabelle übernommen. Kein Aufruf der Claude-API aus dem Code.

---

## 8. Arbeitspakete für Claude Code

Jedes Paket endet mit `npm test && npm run lint` (Backend und Frontend; Frontend zusätzlich `npm run build`) und einem Commit. Autor ist immer Julian; keine Co-Author-Zeile für Claude. Gearbeitet wird auf einem eigenen Zweig (Vorschlag `feat/textnavigation`), `main` bleibt bis zur Freigabe unverändert.

| Nr. | Paket | Inhalt | Ergebnis |
|---|---|---|---|
| 0 | Ausgangsmessung | `schritte-messung.ts` um eine Textausgabe erweitern; 40 Wege als Vorher-Stand festhalten | Datei mit Vorher-Texten und Kennzahlen (Schritte je Weg, Anteil „wenige Meter“) |
| 1 | Merkmale im Graphen | `lage`, `name`, `ebeneBelegt` an `GraphKante`; `bezugspunkte` am `StationGraph`; Tests in `graph.test.ts` | Graph trägt Merkmale; bestehende Tests grün |
| 2 | OSM-Abfrage erweitern | Ausgänge und benannte Läden in `baueOverpassQL`; Größenmessung an 10 Bahnhöfen; Startbestand neu füllen | Messwerte; bei > 30 % Zuwachs Rückfrage an Julian |
| 3 | Etappen | `etappen.ts` mit den Arten aus 5.1; Invarianten aus Abschnitt 3 als Tests | Etappen für alle Musterwege plausibel |
| 4 | Bezugspunkte | `bezugspunkte.ts`: Rangfolge 5.2, Zählen der Aufgänge, Entscheidungspunkte 5.3, Absicherung 4.3 | Je Etappe ein Bezugspunkt oder grobe Meter |
| 5 | Satzbaukasten | `satzbausteine.ts` (Varianten von Claude geschrieben), `textgen.ts` erzeugt Schritte aus Etappen; Schalter `TEXT_STIL` | Neue Schritte; klassischer Text weiter abrufbar |
| 6 | Kurzfassung | `kurzfassung` in Backend und Frontend; Anzeige über den Schritten (Übersicht und Schrittsheet); Vorführdaten der Einführungstour anpassen | Kurzfassung sichtbar |
| 7 | Haltestellenpfad und Stufe 3 | `fussweg.ts` und Stufe-3-Bahnhöfe auf den Baukasten umstellen | Beide Pfade mit neuem Text |
| 8 | Prüflauf und Lesbarkeit | `scripts/textpruefung.ts`; Musterwege; Lesbarkeitsprüfung durch Claude; Varianten nachschärfen | Prüfbericht mit Vorher/Nachher |
| 9 | Auslieferung | README „Hier weitermachen“ ergänzen; Julian gibt frei (Fly, Vercel) | Ausgeliefert nach Julians Freigabe |

Reihenfolge: 0 → 1 → 2 → 3 → 4 → 5 → 8 (Zwischenstand Julian zeigen) → 6 → 7 → 8 (final) → 9. Paket 2 kann parallel zu 3 und 4 laufen, da Läden erst in Paket 4 genutzt werden.

---

## 9. Offene Punkte für Julian

Diese Punkte sind bewusst offen und werden vor bzw. in dem genannten Paket mit Julian geklärt:

1. **Ort der Kurzfassung** (Paket 6): nur in der Übersicht vor „Navigation starten“, zusätzlich über dem Schrittsheet, oder beides?
2. **Erster Schritt** (Paket 5): „Nach Ausstieg“ behalten, durch „Vom Zug aus“ ersetzen oder weglassen?
3. **Ladenkategorien** (Paket 2): nur Läden und Gastronomie oder auch Apotheke, Reisezentrum, DB Lounge?
4. **Vorgabe des Schalters** (Paket 9): neuer Text sofort für alle oder zuerst nur zum Vergleich?
5. **Zusammenspiel mit G1** (Reddit-Auswertung): Der Text vermeidet falsche „ebenerdig“-Aussagen, behebt aber nicht die Ursache im Graphen. Ob G1-Restfälle vorher angegangen werden, entscheidet Julian.

---

## 10. Bewusst nicht enthalten

- **KI zur Laufzeit** (Kosten, Wartezeit, Risiko erfundener Anlagen).
- **Fahrtrichtung des Zugs** („vorne/hinten aussteigen“): wäre mit der Wagenreihung möglich, ist aber ein eigenes Thema.
- **Sprachausgabe und Übersetzung**: Der Satzbaukasten macht beides später leichter, ist aber nicht Teil dieses Plans.
