# Sondierung: Welche Geometrie trägt ein schematisches Bahnhofsbild?

Stand: 13.09.2026 · Anlass: D4 („Navigation: Schema statt Landkarte") aus
`docs/2026-08-31-design-abgleich.md` · Prüffall: Berlin Hbf, Gleis 14 → 6

Vorlage ist Screen 3 aus `design/Umstieg.dc.html`: drei Ebenenbänder mit
Beschriftung, Gleislinien mit Nummern, Bahnsteigbalken, Orientierungspunkte
(Anzeige · Kiosk · Aufzüge), Routenlinie über alle Ebenen, Abschnittsmarker
und Positionspunkt.

Skripte (Sondierung, wegwerfbar, aber reproduzierbar):
`backend/scripts/spike-schema-geometrie.ts`,
`spike-schema-overpass-live.ts`, `spike-abschnitt-verortung.ts`,
`spike-abschnitt-breite.ts`, `spike-bandaufbau.ts`,
`spike-wagenreihung-geometrie.ts`.

---

## 1. Der Prüflauf: Berlin Hbf 14 → 6

`/api/route?eva=8011160&gleisAn=14&gleisAb=6` (OSM aus dem Fixture vom
24.08., DB-APIs live):

| | |
|---|---|
| Stufe | 1 |
| Schritte | 26 |
| Gehzeit | 575 s (9:35 min, Profil normal) |
| Hinweise | keine (keine Degradation) |
| **Berührte Ebenen** | **+2 → +1 → 0 → −1 → −2** |

**Der Entwurf zeichnet drei Bänder, Berlin braucht fünf.** Die Bandzahl ist
keine Gestaltungsentscheidung, sie kommt aus dem Weg. Ein festes
Drei-Band-Bild wäre für diesen Umstieg falsch.

Letzter Schritt: „210 m links zu Gleis 6". Ziel ist die Bahnsteigmitte eines
430-m-Bahnsteigs — die Länge ist echt, die Zielwahl grob. Eigenes Thema.

---

## 2. Was die Quellen tatsächlich hergeben

### 2.1 OSM (Overpass) — die tragende Quelle

Aus dem 400-m-Abruf (3733 Elemente):

| Element | Berlin Hbf | verwertbar |
|---|---|---|
| Bahnsteige (Way + Relation) | 12 | 10 mit Gleisnummer, 8 mit `level` |
| Bahnsteigachse (Länge, Peilung) | je Bahnsteig | ja — 426–430 m oben wie unten |
| Aufzüge | 17 | ja, 16 mit `level` |
| Rolltreppen (`conveying`) | 61 | ja |
| Treppen | 124 | ja |
| Ebenen im Graphen | 9 | nur 2 tragen Gleise |
| `indoor=room` | 61 | alle mit `level` |
| Eingänge | 89 | ja |

**Die Querreihenfolge der Bahnsteige ist ableitbar** — das ist der Befund, der
über „Liste" gegen „Geometrie" entscheidet. Projiziert man die
Bahnsteigmitten auf die Achse quer zur Gleisrichtung, kommt die richtige
Reihenfolge heraus:

```
Ebene +2 (Gleisrichtung  76°):  15/16 @−50m | 13/14 @0m | 11/12 @+19m
Ebene −2 (Gleisrichtung 157°):  22 @−111m | 7/8 @−63m | 5/6 @−39m | 3/4 @−24m | 1/2 @0m
```

Ein Band kann seine Gleise also in der **echten** Reihenfolge und mit
**echten** Abständen zeichnen, nicht in Eingabereihenfolge.

**Berlin ist ein Kreuzungsbahnhof: Die beiden Gleisebenen stehen im Winkel
von 81° zueinander.** Parallele Bänder verschweigen das. Der Entwurf zeichnet
parallel — vertretbar als Abstraktion, aber es ist eine Entscheidung, keine
Selbstverständlichkeit, und sie gehört benannt.

### 2.2 Was OSM *nicht* hergibt

- **Abschnittsmarker A–G: null.** Auch mit erweiterter Abfrage
  (`railway=platform_section`, `public_transport=platform_section`) kein
  einziger Treffer. Deckt sich mit dem Datenrealitäts-Spike (14 von 27
  Bahnhöfen bundesweit, Berlin nicht darunter).
- **Gleisnummern an den Gleisachsen.** `railway=rail` liefert 63 Ways, 27 mit
  `ref` — die refs sind aber **Streckennummern** (6109, 6134, 6171), keine
  Gleisnummern. Gleislinien lassen sich zeichnen, aber nur über die
  Bahnsteige beschriften.
- **Anzeigetafeln.** 26 Treffer auf `information=board`, darunter
  „Geschichtspark Ehemaliges Zellengefängnis Moabit" und „Wildbienen". Genau
  **eine** echte Abfahrtstafel („Abfahrt (Departure)"). Als
  Orientierungspunkt derzeit nicht verwertbar.
- **Sauberes `level` überall.** Zwei Bahnsteige (U-Bahn „Gleis 4", „Gleis 5")
  haben keins und kollidieren mit den Fern-Gleisen gleicher Nummer — der in
  `graph.ts` dokumentierte Fall.
- Die Ebenen sind unordentlich: `0.5`, `−0.5`, `−1.3`, `−1.7`, sogar `0,5`
  mit Komma. Eine Bandregel muss entscheiden, welche Ebene ein Band verdient.

### 2.3 Korrektur eines früheren Befunds: POIs

Der erste Durchlauf gegen das Fixture meldete **0 WC und 0 Kioske** in Berlin
Hbf. Das ist ein **Aufzeichnungsartefakt**, kein Datenbefund: Das Fixture
stammt aus Commit `fcc6e53` (24.08.), die POI-Zeilen kamen erst mit `2b46a48`
in die Abfrage. Live gefragt:

| | Anzahl | davon mit `level` |
|---|---|---|
| WC | 6 | 3 |
| Kiosk | 2 | 1 |
| Laden (convenience) | 1 | 1 |
| Café | 13 | 8 |
| Imbiss | 16 | 15 |

**Konsequenz über diese Sondierung hinaus:** Das Berlin-Fixture ist für alles
jünger als der 24.08. veraltet. Tests der `mit-stopp`-Variante gegen dieses
Fixture prüfen einen Bahnhof ohne Zwischenziele.

### 2.4 DB RIS::Stations — weniger als das Konzept verspricht

```
Berlin Hbf · EVA-Gruppe 8011160, 8089021, 8098160 · stationID 1071
Gleise: 20 · davon mit Koordinate: 0
```

Konzept §4.2 nennt „Koordinaten, Bahnsteig-/Gleisliste". **Die Gleisliste
kommt, die Koordinaten nicht — bei keinem einzigen der 20 Gleise.** Für die
Geometrie ist RIS::Stations damit wertlos; es bleibt die Namensauflösung und
die `stationID` für FaSta.

Ein Nebenfund: Die Gleisnamen tragen Abschnitte — „Gleis 1 A - D", „Gleis 1
D - G", „Gleis 7 A - D", „Gleis 7 D - G". Das belegt, welche Abschnitte es
gibt, aber nicht, wo sie liegen.

### 2.5 DB FaSta — die reichste Quelle

69 Anlagen, **alle 69 mit Beschreibung**, alle mit Koordinaten und
Live-Status. Die Beschreibungen nennen Gleispaare und Ebenen:

```
AUFZUG     ACTIVE    Gleis 5/6 (C/D) - Gleis 15/16
AUFZUG     INACTIVE  Gleis 3/4 (C/D) - Gleis 15/16
ROLLTREPPE ACTIVE    von EG zu 1.UG
ROLLTREPPE INACTIVE  zu Gleis 13/14
```

Das Schema kann Aufzüge und Rolltreppen also **verortet, dem Bahnsteig
zugeordnet und mit Betriebsstatus** zeichnen. `verankerterBahnsteig()` in
`core/fasta-gleisbezug.ts` wertet das bereits aus — die Abschnittsbuchstaben
in den Klammern wirft der Parser heute weg.

---

## 3. Der Abschnitt A–G: teilweise belegt, nicht tragfähig

Das Alleinstellungsmerkmal hängt daran, aus „Wagen 26 → Abschnitt C" einen
Ort zu machen. OSM liefert dafür nichts (siehe 2.2). Bleibt FaSta.

**Test:** Acht Berliner Anlagen nennen einen Abschnitt. Projiziert man sie auf
die Achse ihres Bahnsteigs, liegen sie bei Achsenanteil 0,364 – 0,475. Eine
gleichmäßige Einteilung A–G erwartet „C/D" bei 0,429.

| | |
|---|---|
| Mittlerer Fehler | **13 m** |
| Größter Fehler | 28 m |
| Breite eines Abschnitts (430 m ÷ 7) | 61 m |
| Querabstand zur Bahnsteigachse | 4 m |

**Die gleichmäßige Einteilung ist damit in der Bahnsteigmitte bestätigt** —
der Fehler bleibt unter einem halben Abschnitt.

**Aber sie ist nur dort bestätigt.** Alle acht Proben lauten „C/D", also
Mitte. Daraus folgt **nicht**, dass die Einteilung an den Enden stimmt, und
vor allem folgt nicht, **welches Bahnsteigende A ist**. Der Richtungstest im
Skript (13 m gegen 65 m) sieht eindeutig aus, ist es aber nicht: Bei Proben
aus der Mitte misst er im Wesentlichen sich selbst.

**Breitentest über acht Großbahnhöfe** — wie oft trägt FaSta überhaupt
Abschnitte?

| Bahnhof | Anlagen | mit Abschnitt | Buchstaben |
|---|---|---|---|
| Berlin Hbf | 69 | 8 | C, D |
| Hamburg Hbf | 27 | 4 | D, E |
| Nürnberg Hbf | 36 | 11 | F |
| Mannheim Hbf | 25 | 5 | A |
| München Hbf | 25 | 0 | – |
| Frankfurt (Main) Hbf | 53 | 0 | – |
| Hannover Hbf | 20 | 0 | – |
| Köln Hbf | 20 | 0 | – |

**Vier von acht — und dort nur an einzelnen Bahnsteigen.** Als
Plausibilitätsanker taugt das, als Fundament der Abschnittsanzeige nicht.

## 3.1 Und die Quelle des Abschnitts ist tot

```
https://ist-wr.noncd.db.de/wagenreihung/1.0/556/20260913
→ getaddrinfo ENOTFOUND ist-wr.noncd.db.de
```

`nslookup`: **Non-existent domain.** Zur Gegenprobe löst
`apis.deutschebahn.com` im selben Netz sauber auf. Drei plausible
Nachfolgepfade am Marketplace (`ris-formation`, `ris-boarding`,
`ist-wagenreihung`) antworten mit HTTP 404 „API not found for requested URI".

**Der in `db-endpunkte.ts` hinterlegte Wagenreihungs-Dienst existiert nicht
mehr.** Die Wagenposition ist laut Konzept §1 der Kern des
Alleinstellungsmerkmals. Das Nachfolgeprodukt muss in der
Marketplace-Dokumentation nachgeschlagen werden — Raten hat hier nichts
ergeben und gehört nicht in diese Sondierung.

---

## 4. Der Flaschenhals: `/api/route` reicht die Geometrie nicht durch

`graphZuGeoJSON()` schreibt in `karte` **ausschließlich** die Routenlinie
(zerlegt nach Ebene) plus zwei Punkte Start/Ziel. Für 14 → 6:

```
Ebene  2: 2 Features (route, start)
Ebene  1: 1 Feature  (route)
Ebene  0: 1 Feature  (route)
Ebene −1: 1 Feature  (route)
Ebene −2: 2 Features (route, ziel)
```

Keine Bahnsteige, keine Gleisnummern, keine Aufzüge, keine POIs, keine
Ebenenliste. Das Frontend leitet sein heutiges Schema deshalb aus den
**Schritttexten** ab (`frontend/src/schema/ableitung.ts`) — Ebenen aus
`schritt.level`, Gleise nur aus den beiden Eingabefeldern.

**Damit ist eine Aussage in `2026-08-31-design-abgleich.md` zu korrigieren:**
D4 führt „Backend: nein (Daten reichen)". Die Daten liegen im *Graphen*, aber
nicht in der *Antwort*. Für Screen 3 braucht es eine Erweiterung des
Endpunkts — das ist keine reine Frontend-Aufgabe.

---

## 5. Screen 3, Element für Element

| Bildelement | Quelle | Urteil |
|---|---|---|
| Ebenenbänder | Graph-Ebenen + Route | **ja**, aber Zahl aus Daten (Berlin: 5, nicht 3) |
| Bandbeschriftung „GLEISE 11–16" | OSM `ref` je Ebene | **ja** |
| Bandbeschriftung „HAUPTHALLE" | – | **nein**, Ebene 0 heißt so per Konvention, nicht laut Daten |
| Gleislinien mit Nummern | OSM Bahnsteig-`ref` + Querprojektion | **ja**, inkl. echter Reihenfolge und Abstände |
| Bahnsteigbalken (Länge) | OSM Achse | **ja**, 426–430 m belegt |
| Orientierungspunkt „Aufzüge" | FaSta (Koordinate, Gleisbezug, Status) | **ja**, mit Live-Status |
| Orientierungspunkt „Kiosk" | OSM (live, nicht im Fixture) | **ja** |
| Orientierungspunkt „Anzeige" | OSM `information=board` | **nein**, 25 von 26 Treffern sind Fremdtafeln |
| Routenlinie über Ebenen | Pfad + `knotenVon/knotenBis` | **ja**, sobald der Endpunkt sie durchreicht |
| Ebenenwechsel-Pfeile | Kantentyp + `deltaLevel` | **ja** |
| Abschnittsmarker „C" | FaSta-Beschreibung | **eingeschränkt** — Mitte belegt, Richtung nicht, an 4 von 8 Bahnhöfen gar nicht; Eingangsquelle (Wagenreihung) tot |
| Positionspunkt | GPS / Schrittfortschritt | **eingeschränkt** — in geschlossener Halle unzuverlässig |
| Kreuzungswinkel der Ebenen | OSM Peilung | **ja** (Berlin 81°) — der Entwurf zeigt ihn nicht |

---

## 5a. Nachtrag 13.09.2026: ein Bahnsteig war eine Kette aus drei Punkten

Erst die ausgelieferte Geometrie machte es sichtbar. Auf Ebene −2 lief die
Route 342 m, obwohl das Ziel 92 m entfernt lag.

**Ursache:** Im Graphen bestand ein Bahnsteig aus genau drei Knoten —
`anfang`, `mitte`, `ende` — mit 215-m-Kanten dazwischen, und der
Bahnsteigumriss hing nicht am Fußwegnetz. Wer den Bahnsteig zwischen zwei
dieser Punkte betrat (also jeder, der eine Rolltreppe in der Mitte nimmt),
musste erst zu einem der drei laufen.

```
gleis6:anfang   Graph 127 m   Luftlinie 123 m
gleis6:mitte    Graph 342 m   Luftlinie  92 m
```

**Behoben** (`verdichteBahnsteigketten` in `core/graph.ts`): Die Kette wird
um die begehbaren Knoten ergänzt, die ohnehin auf dem Bahnsteig liegen, in
ihrer Reihenfolge entlang der Achse. Ein Knoten hängt an höchstens einem
Bahnsteig — dem nächsten —, sonst entstünde ein ebener Weg über die Gleise.

**Wirkung auf den Prüffall Berlin 14 → 6:**

| | vorher | nachher |
|---|---|---|
| Weglänge | 340 m | **265 m** |
| Gehzeit (normal) | 575 s | **305 s** |
| Schritte | 26 | 23 |
| genutzter Zugang an Gleis 5/6 | bei 119 m | **bei 242 m** |

Die Route nimmt jetzt die Rolltreppe, die neben der Bahnsteigmitte
herauskommt — statt der, die 123 m davor liegt. Vier Minuten.

## 6. Empfehlung

1. **Das Schema aus echter Geometrie ableiten, nicht aus den Schritttexten.**
   Bandzahl, Gleisreihenfolge, Bahnsteiglängen und Ebenenwechsel sind belegt
   — das heutige `ableitung.ts` lässt all das liegen, weil es nur `schritt.level`
   und die zwei Eingabegleise kennt.
2. **Der Endpunkt muss zuerst erweitert werden** (Bahnsteigachsen je Ebene,
   Gleisnummern, Ebeneninventar, Anlagen mit Status, POIs). Ohne das ist
   D4 nicht umsetzbar, und D4 ist derzeit als „Backend: nein" geführt.
3. **Bandregel festlegen:** Ebene mit Gleisen → Gleisband; Ebene ohne Gleise,
   die die Route berührt → Verbindungsband. Ebenen wie −1,3 / −1,7
   (Rolltreppenpodeste) gehören zusammengefasst, nicht als eigenes Band.
4. **Abschnittsanzeige zurückstellen.** Nicht wegen der Darstellung, sondern
   weil die Eingangsquelle fehlt. Wird sie ersetzt, ist die gleichmäßige
   Einteilung mit dem Hinweis „ungefähr" vertretbar — die Richtung braucht
   dann aber eine eigene Klärung.
5. **„Anzeige" als Orientierungspunkt aus dem Entwurf streichen** oder durch
   einen belegten ersetzen (Aufzug, Kiosk, Imbiss, Eingang).
6. **Zwei Funde außerhalb dieser Sondierung**, beide eigene Vorgänge:
   Wagenreihungs-Endpunkt tot (trifft den USP) und Berlin-Fixture veraltet
   (trifft die `mit-stopp`-Tests).
