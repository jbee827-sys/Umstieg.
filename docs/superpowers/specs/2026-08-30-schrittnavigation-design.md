# Schrittnavigation im Bahnhof – Designdokument

Stand: 30.08.2026 · Validiert im Brainstorming · Zieldokument für die Umsetzung mit Claude Code

Ergänzt [`2026-08-24-umstiegs-navigator-design.md`](../../../2026-08-24-umstiegs-navigator-design.md) (Abschnitte 6 und 9) und [`2026-08-27-standort-und-navigation-design.md`](./2026-08-27-standort-und-navigation-design.md).

---

## 1. Ziel und Abgrenzung

Der Nutzer soll unterwegs im Bahnhof erkennen, **auf welchem Schritt seiner Route er gerade ist**, und die Karte soll ihm genau diesen Schritt zeigen – auf der richtigen Ebene und im richtigen Ausschnitt.

**Ausdrücklich nicht das Ziel:** ein blauer Punkt, der metergenau stimmt. In einer Bahnhofshalle liefert GPS ±100 m und keine Stockwerksinformation; gemessen wurden am 29.08.2026 im laufenden Betrieb ±118 m, und das an einem Fenster. Ein Punkt, der Genauigkeit vortäuscht, ist in einem 400-m-Bahnhof schlechter als kein Punkt – diese Linie ist aus der Standort-Spec (Abschnitt 5.2, `GENAUIGKEIT_MAX_M`) übernommen und gilt hier weiter.

**Der Ansatz stattdessen:** Die App kennt Start, Ziel, Weg und Gehzeit je Abschnitt. Daraus lässt sich der wahrscheinliche Fortschritt ableiten, ohne irgendetwas zu messen. Die Uhr schlägt vor, der Mensch entscheidet.

## 2. Festgelegte Entscheidungen

| Entscheidung | Festlegung |
|---|---|
| Positionsbegriff | Fortschritt entlang der bekannten Route, **kein** absoluter Standort |
| Fortschaltung | Zeitbasierter Vorschlag, Bestätigung oder Korrektur durch Antippen |
| Sensorik | Keine neue. Kein Beschleunigungssensor, kein Kompass, kein Barometer |
| Kartenverhalten | Karte folgt dem aktiven Schritt: Ebene automatisch, Ausschnitt automatisch |
| Stufe 3 | Schematische Skizze statt geografischer Karte |
| Zustandshaltung | Vollständig im Browser. Das Backend bleibt zustandslos |

**Begründung zur Sensorik:** Ein Barometer – der einzige zuverlässige Weg zur Stockwerkserkennung – ist über keine Web-API zugänglich. `DeviceMotion` verlangt auf iOS eine eigene Freigabe per Nutzergeste und liefert auf Rolltreppen und in anfahrenden Zügen unbrauchbare Werte. Der Aufwand stünde in keinem Verhältnis zum Gewinn gegenüber der Zeitschätzung.

## 3. Architektur

Kein neuer Dienst, keine neue Datenquelle. Die Kette bleibt, sie liefert nur mehr aus:

```
Backend  core/textgen.ts   baueSegmente() -> EIN Segment = EIN Schritt
              |             Segment kennt bereits typ, laengeM, deltaLevel, zielLevel
              |             -> sekunden und level je Schritt ergaenzen (heute verworfen)
              v
         RouteErgebnis.schritte[]  { text, typ, distanzM?, sekunden, level, knotenVon, knotenBis }
              |
              v  REST, unveraendert
Browser  navigation/fortschritt.ts   rein: (schritte, startZeit, jetzt, versatz) -> Index
              |
              +--> Schrittliste     aktiver Schritt gross, uebrige gedaempft
              +--> Karte            Ebene, Ausschnitt und Einfaerbung aus dem aktiven Schritt
```

**Grundprinzipien:**

1. **Die Zeit schlägt vor, der Mensch entscheidet.** Eine Korrektur des Nutzers hält – sie wird nicht von der nächsten Zeitschätzung überstimmt.
2. **Kein Textparsing.** Ebene und Geometrie kommen als Daten, nie aus dem Schritttext. Formulierungen dürfen sich ändern, ohne dass die Navigation bricht.
3. **Offline-fest.** Der gesamte Fortschritt wird aus der einmal geladenen Route berechnet. Reißt die Verbindung im Bahnhof ab, funktioniert die Navigation weiter (Konzeptkorrektur 3).
4. **Genauigkeit nie vortäuschen.** Wo die Geometrie geschätzt ist, sieht die Darstellung erkennbar nach Schema aus.

## 4. Datenmodell

`Schritt` wächst um drei Felder, rein additiv – bestehende Clients brechen nicht:

| Feld | Typ | Bedeutung |
|---|---|---|
| `sekunden` | `number` | Gehzeit dieses Schritts, gleiche Formel wie `gehzeitSekunden`, je Segment statt aufsummiert |
| `level` | `number` | Ebene, auf der der Schritt **endet**. Bei einem Ebenenwechsel die Zielebene – dort landet man |
| `knotenVon` / `knotenBis` | `number` | Indexbereich im Routenpfad; daraus zeichnet die Karte das Teilstück |

**Invariante, im Test festgehalten:** Die Summe aller `sekunden` ergibt exakt `gehzeitSek`. Liefen beide auseinander, widersprächen sich Ampel und Schrittanzeige – und die Ampel ist das Element, dem der Nutzer unter Zeitdruck glaubt.

**Bewusst kein Geometriefeld je Schritt.** Die Koordinaten stehen bereits in `karte`; sie ein zweites Mal auszuliefern hieße, sie irgendwann widersprüchlich zu haben. `knotenVon`/`knotenBis` verweisen, statt zu kopieren.

## 5. Navigationslogik

Neues Modul `frontend/src/navigation/fortschritt.ts` – reine Funktionen, keine Timer, kein Browser-Zugriff. Dieselbe Trennung wie bei `standort/`: Entscheidungslogik testbar, Browser-Anbindung getrennt.

```ts
aktiverSchritt(
  schritte: Schritt[],
  startZeitMs: number,
  jetztMs: number,
  versatz: number,
): number
```

- **`startZeitMs`** wird beim Öffnen der Routenansicht gesetzt, **nicht** bei der Berechnung. Zwischen „Route ansehen" und „losgehen" liegen oft Minuten.
- **`versatz`** ist die Summe der Nutzerkorrekturen. Tippt er „Weiter" oder „Zurück", verschiebt sich der Vorschlag dauerhaft. Das ist der Kern von „vorschlagen, nie erzwingen".
- **`jetztMs`** kommt als Parameter herein, damit die Logik ohne Fake-Timer prüfbar ist – dieselbe Entscheidung wie bei `pruefeAnkunft`.

Das Ergebnis wird auf `[0, schritte.length - 1]` begrenzt. Am Ende der Liste läuft nichts weiter; dort übernimmt die bestehende Ankunftserkennung aus P1.

**Mindestanzeigedauer.** Ein Schritt wie „wenige Meter rechts" hat wenige Sekunden Gehzeit und wäre vorbei, bevor der Nutzer hinsieht. Für die Fortschaltung gilt deshalb je Schritt eine Untergrenze von `MINDEST_SCHRITT_MS = 8000` – ein Startwert nach dem Vorbild der Schwellen in `standort/schwellen.ts`, in der Mobilabnahme nachzujustieren. Die Untergrenze wirkt **nur** auf die Anzeige; die Gehzeit selbst und damit die Ampel bleiben unberührt. Folge: Die Fortschaltung kann hinter der reinen Uhrzeit zurückbleiben – genau dafür gibt es die Korrektur.

## 6. Karte

Die Karte erhält `aktiverSchritt` und leitet daraus drei Dinge ab:

- **Ebene** aus `schritt.level`. Der Umschalter bleibt erhalten, aber als Korrektur statt als Pflichtbedienung. Das behebt nebenbei ein bestehendes Ärgernis: Heute muss der Nutzer raten, welche Ebene gerade die richtige ist.
- **Ausschnitt** via `fitBounds` auf das Teilstück des aktiven Schritts statt auf die Gesamtroute. Auf 390 px ist das der Unterschied zwischen lesbar und nicht.
- **Einfärbung** – Zurückgelegtes blass, aktiver Schritt kräftig im Akzentrot (`--color-accent`), Kommendes gedeckt.

Der Standortpunkt aus P1 bleibt unverändert daneben bestehen. Er sagt weiterhin „ungefähr hier, Ebene unbekannt" und widerspricht dem Fortschritt nicht – beides sind getrennte Aussagen, und der Nutzer sieht, welche wie sicher ist.

## 7. Stufe 3: Schema statt Landkarte

Bei `stufe === 3` wird MapLibre **gar nicht geladen**. Stattdessen eine SVG-Prinzipskizze: Bahnsteige als Balken, Querung als Verbindung, aktiver Schritt hervorgehoben, Bahnhofsname darüber.

**Begründung:** Am 29.08.2026 zeigte die Karte bei einer Stufe-3-Route eine Wiese in Mitteldeutschland – echte OSM-Kacheln, echte Attribution, vollständig erfundene Lage. Die Verankerung an der Stationsposition ist inzwischen behoben; die Geometrie *innerhalb* des Bahnhofs bleibt aber geschätzt. Eine geografische Karte über geschätzter Geometrie behauptet eine Vermessung, die nicht stattgefunden hat. Ein Schema behauptet sie nicht.

**Nebeneffekt:** Der 940-kB-MapLibre-Chunk wird bei Stufe-3-Routen nie geladen.

## 8. Fehlerfälle – degradieren statt ausfallen

| Ausfall | Verhalten |
|---|---|
| `sekunden` fehlt (ältere Backend-Version) | Rein manuelles Weiterschalten, Route bleibt vollständig benutzbar |
| `level` fehlt | Ebenen-Umschalter bleibt manuell wie heute |
| `knotenVon`/`knotenBis` fehlen | Karte zeigt die Gesamtroute wie heute, ohne Ausschnittsführung |
| Nutzer korrigiert über das Listenende hinaus | Begrenzung auf den letzten Schritt, danach übernimmt die Ankunftserkennung |
| Verbindung reißt ab | Kein Einfluss – der Fortschritt rechnet aus der geladenen Route |
| Stufe 3 | Schema statt Karte, Zeiten weiterhin als „ca."-Angaben |

## 9. Oberfläche

Der aktive Schritt wird groß und in voller Breite dargestellt, die übrigen bleiben gedämpft sichtbar – der Nutzer soll den Weg im Ganzen behalten, nicht durch ein Guckloch geführt werden.

Unter dem aktiven Schritt zwei große Flächen „Zurück" und „Weiter" nach den Vorgaben aus Konzept Abschnitt 9: große Touch-Ziele, hoher Kontrast, keine Gesten. Wischgesten sind ausgeschlossen – ein Reisender mit Koffer in der einen und Handy in der anderen Hand kann nicht wischen.

Die Ampel bleibt unverändert oben fixiert. Sie ist die Antwort auf „Schaffe ich es?", die Schrittanzeige die auf „Wo muss ich hin?".

## 10. Teststrategie

**Backend** (vitest, bestehende Suite):

- `sekunden` je Schritt gegen das Berlin-Hbf-Fixture; Invariante Summe = `gehzeitSek`
- `level` je Schritt, insbesondere bei Ebenenwechseln (Zielebene, nicht Ausgangsebene)
- `knotenVon`/`knotenBis` decken den Pfad lückenlos und überschneidungsfrei ab

**Frontend** (vitest, seit P1 Task 3 vorhanden):

- `aktiverSchritt`: Zeitgrenzen exakt am Übergang, Versatz nach oben und unten, Begrenzung an beiden Enden, leere Schrittliste
- Kein Test für die Timer-Anbindung – dort steckt keine Entscheidungslogik, wie schon bei `useStandort`

**Nicht maschinell prüfbar** und daher Teil der Mobilabnahme: ob die automatische Ebenenwahl unterwegs als Hilfe oder als Bevormundung empfunden wird.

## 11. Umsetzungsreihenfolge

| AP | Inhalt | Abhängigkeit |
|---|---|---|
| 1 | `sekunden` und `level` je Schritt im Backend, inkl. Invariantentest | – |
| 2 | `knotenVon`/`knotenBis` im Backend | AP 1 |
| 3 | `navigation/fortschritt.ts` mit Tests | – (parallel zu 1–2) |
| 4 | Schrittliste: aktiver Schritt groß, Weiter/Zurück | AP 1, 3 |
| 5 | Karte folgt dem Schritt (Ebene, Ausschnitt, Einfärbung) | AP 2, 3 |
| 6 | Stufe-3-Schema als SVG, MapLibre dort nicht laden | AP 1 |
| 7 | Mobilabnahme | alle |

AP 1 und 3 sind unabhängig und können nebeneinander laufen.

## 12. Bewusst nicht im Umfang

- **Kompass / Kartenausrichtung** – auf iOS eine eigene Freigabe, und Bahnhofsstahl macht Magnetfelder unbrauchbar.
- **Sprachausgabe und Vibration je Schritt** – nachrüstbar, für die Grundfunktion nicht nötig.
- **Ortung über WLAN-Fingerprinting oder Beacons** – braucht Infrastruktur oder eine Datensammlung, die dem Datenschutzversprechen dieser App widerspricht.
- **Automatische Erkennung, dass der Nutzer falsch abgebogen ist** – setzt genau die Positionsgenauigkeit voraus, die es hier nicht gibt.

## 13. Risiken und offene Punkte

- **Die Zeitschätzung ist nur so gut wie das Gehprofil.** Wer stehen bleibt, um die Anzeigetafel zu lesen, läuft aus dem Takt. Deshalb ist die Korrektur keine Notlösung, sondern der vorgesehene Normalfall – die Oberfläche muss sie entsprechend prominent anbieten.
- **Automatische Ebenenwahl kann irritieren**, wenn der Nutzer gerade selbst umgeschaltet hat. Vorschlag: Nach einer manuellen Umschaltung für die Dauer des aktuellen Schritts nicht automatisch nachziehen. In der Mobilabnahme zu prüfen.
- **`knotenVon`/`knotenBis` koppeln Schritte an die Pfaddarstellung.** Ändert sich der Aufbau von `RoutenPfad`, müssen beide nachgezogen werden. Der Invariantentest aus AP 2 fängt das ab.
- **`MINDEST_SCHRITT_MS` ist geraten.** 8 Sekunden sind ein Startwert ohne Messung dahinter. Zu hoch gewählt hinkt die Anzeige spürbar hinterher, zu niedrig flackert sie bei Routen mit vielen kurzen Segmenten. Erst die Mobilabnahme zeigt, welche Richtung stimmt.
- **Sehr kurze Routen sind der ungünstigste Fall.** Bei „gleicher Bahnsteig" gibt es gar keine Schrittfolge, bei drei Schritten über 105 Sekunden ist die Fortschaltung kaum mehr wert als die Liste selbst. Der Nutzen wächst mit der Bahnhofsgröße – und dort ist er am größten, wo die App überhaupt gebraucht wird.
