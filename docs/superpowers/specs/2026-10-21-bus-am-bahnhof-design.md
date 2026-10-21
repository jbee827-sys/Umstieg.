# Bus, Tram und U-Bahn am Bahnhof – Entwurf

Stand: 21.10.2026 · Zweig `feat/umstieg-2` · Anlass: Rückmeldung Julian aus der Nutzung

## 1. Befund

Die Ortsuche zeigt an einem Bahnhof die Verkehrsmittel aus Transitous (Bahn, Tram,
Bus …). Gewählt werden können danach nur Züge. Zwei Ursachen, beide am Code und
gegen Transitous belegt (`.superpowers/bus-analyse/`, 7 Bahnhöfe, 21.10.2026):

1. **Ablauf.** Bleibt „Dein Anschluss“ leer, gilt der Bahnhofspfad (`pfadFuer`).
   Seine Tafel ist die DB-Tafel (Timetables) mit den Blöcken Regional, Fern,
   S-Bahn, U-Bahn – Busse und Trams kommen darin nicht vor.
2. **Umkreis.** Auch im Haltestellenpfad fragt die Tafel `stoptimes` mit
   `radius=30`. MOTIS liefert dann den Halt, seine Kinder und gleichnamige Halte.
   Busbahnhöfe heißen oft anders und liegen weiter weg:

   | Bahnhof | 30 m | 150 m | 300 m | Bushalt mit anderem Namen |
   |---|---|---|---|---|
   | Göttingen | 0 Bus | 41 | 72 | Bahnhof/ZOB 120–205 m |
   | Fulda | 0 | 33 | 45 | Bahnhof/ZOB 128–190 m |
   | Lüneburg | 0 | 131 | 172 | Bf. Lüneburg (ZOB) 45–150 m |
   | Erfurt Hbf | 34 | 39 | 60 | Busbahnhof 137–166 m |
   | Kassel-Wilhelmshöhe, Hannover Hbf, Münster Hbf | Busse schon in der Gruppe | | | |

   Bei gleichnamigen Gruppen ändert ein größerer Umkreis nichts Schädliches.

## 2. Entscheidungen (Julian, 21.10.2026)

- Bus, Tram, U-Bahn stehen in **beiden** Tafeln („Du kommst an“ und Abfahrt).
- Das zweite Ortsfeld verschwindet hinter dem Knopf **„Andere Haltestelle“** und
  heißt auch so.
- Das Abzeichen „Präzise Karte“ im Kopf der Navigationsseite entfällt.

## 3. Lösung

### Backend

- `GET /api/haltestelle/tafel?…&umkreis=bahnhof` fragt `stoptimes` mit
  **250 m** statt 30 m. Ohne den Parameter bleibt es bei 30 m: An einer
  gewöhnlichen Haltestelle in der Stadt brächten 250 m fremde Halte in die
  Tafel. 250 m deckt alle gemessenen Busbahnhöfe; Erfurt Thomaseck (257 m) ist
  die Grenze.
- Jeder Tafeleintrag trägt seinen Halt: `haltId` (`place.stopId`) und
  `haltName` (`place.name`). Daran erkennt die Oberfläche „anderer Name“ und
  daran hängt die Live-Überwachung (Halt-ID mit 30 m findet die Fahrt).
- Zwischenspeicher je Halt, Richtung **und** Umkreis.

### Frontend

- **Bahnhofstafel:** Die DB-Tafel bekommt darunter die Blöcke U-Bahn, Tram, Bus,
  Fähre aus der Haltestellentafel des Bahnhofs (`umkreis=bahnhof`). Bahn und
  S-Bahn aus Transitous werden nicht gezeigt – die stehen schon in der DB-Tafel.
  Weicht der Haltname vom Bahnhof ab, steht er in der Zeile („ab Bahnhof/ZOB“).
  Ohne Haltestellen-ID des Bahnhofs oder bei Ausfall bleibt es still bei der
  DB-Tafel.
- **Gemischter Umstieg:** Wählt man auf einer Seite eine Fahrt aus Transitous,
  wird der Umstieg als Haltestellenumstieg gerechnet (`/api/weg`, Karte,
  Haltestellen-Live). Der DB-Zug der anderen Seite wird beim Absenden seiner
  Transitous-Fahrt zugeordnet (gleiche Minute, gleiches Gleis, sonst gleiche
  Linie) – so stimmen Steigkoordinate, Ebene und Live-Filter. Findet sich keine,
  beginnt der Weg an der Bahnhofskoordinate mit dem bestehenden Hinweis „Steig
  unbekannt …“.
- **Seite mit Bus:** Gleis- und Wagenfeld dieser Seite entfallen, an ihrer Stelle
  steht die Steigzeile.
- **„Andere Haltestelle“:** zugeklappt ein Knopf; aufgeklappt das bisherige
  Ortsfeld mit Titel „Andere Haltestelle“ und einem Knopf zum Entfernen. Ein
  Entwurf mit gesetztem Ort öffnet es gleich.
- **Haltestellenpfad an einem Bahnhof:** Hat der Ort eine EVA, fragt auch seine
  Haltestellentafel mit `umkreis=bahnhof`.

## 4. Nicht Teil davon

- Die Symbolzeile der Ortsuche bleibt, wie Transitous den Halt kennt (Göttingen
  zeigt dort weiter keinen Bus).
- Navigationsseite: eigener Schritt nach Rücksprache.
