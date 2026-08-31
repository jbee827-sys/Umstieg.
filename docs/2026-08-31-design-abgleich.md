# Design-Abgleich: warum die App nicht wie der Entwurf aussieht

Stand 31.08.2026. Anlass: Die laufende App weicht sichtbar vom
Design-Prototyp ab (`design/Umstieg.dc.html`, 6 Screens).

## Die Ursache: das Einlesen, nicht die Umsetzung

Der Code setzt seine Vorlage sauber um – **nur ist es die falsche Vorlage.**
Belegt durch die Zeitachse des ersten Projekttags:

| Uhrzeit | Commit | Was passierte |
|---|---|---|
| 19:51 | `29985f0` | Konzept **und** Umsetzungsplan (17 Tasks) geschrieben |
| 20:07 – 20:57 | 4 Commits | Tasks 1, 3, 4, 5 gebaut |
| **21:10** | `a25ff71` | **Design-Import (6 Screens) kommt an** |
| ab 25.08. | Tasks 13–15 | Frontend gebaut – nach dem Plan von 19:51 |

Das Design traf **80 Minuten nach** dem Plan ein, als schon vier Tasks
standen. Der Plan wurde danach **nie überarbeitet**. Die Gegenprobe:

```
$ grep -c "design/\|Umstieg.dc\|Screen\|Dashboard\|Onboarding" \
    docs/plans/2026-08-24-umsetzungsplan-mvp.md
0
```

**Null Treffer.** Der Umsetzungsplan erwähnt das Design mit keiner Silbe.
Task 13 heisst „Eingabe, Schrittliste, Ampel" und verlangt wörtlich eine
„nummerierte Schrittliste in großer Schrift" – genau das wurde gebaut. Die
Quelle dafür ist das Konzeptdokument, das eine einzelne Eingabemaske plus
Schrittliste beschreibt. Das Konzept ist Text, das Design ist Bild; gefolgt
wurde dem Text.

**Teilweise eingelesen wurde es doch** – und das erklärt, warum die App
vertraut *wirkt* und trotzdem falsch aufgebaut ist: Die Design-Tokens sind
übernommen (`#ec3013`, `#f3f2f2`, `#201e1d`, `#0f7a4f`, `#e08a00`, Archivo
in `src/index.css`). Farbe und Schrift stimmen, Aufbau und Fluss nicht.

**Der deutlichste Einzelbeleg** ist die Karte. Screen 3 des Designs enthält
**fünf SVG-Elemente** und kein Wort zu Kacheln, Rasterkarten oder einer
Kartenbibliothek – es ist ein Ebenenschema (`EBENE +1 · GLEISE 11–16`,
`EBENE 0 · HAUPTHALLE`, `EBENE −2 · GLEISE 1–8`). MapLibre stammt
ausschliesslich aus Task 14 des Plans. Dasselbe bei der Schrittanzeige:
Screen 3 zeigt `Schritt {{ stepNr }} von {{ stepTotal }}` mit **einem**
Schritt und einem „Weiter"-Knopf, nicht die volle Liste.

**Fazit:** Kein Umsetzungsfehler, sondern eine fehlende Rückkopplung. Es gibt
keinen Plan, der die sechs Screens in Tasks übersetzt. Solange der fehlt,
baut jede weitere Sitzung wieder am Konzepttext entlang.

**Erste Massnahme, bevor irgendetwas gebaut wird:** eine Spec, die die sechs
Screens in Bildschirme, Zustände und Übergänge übersetzt, und ein Plan
daraus. Sonst wiederholt sich genau dieser Fehler.

## ToDo-Liste

Reihenfolge nach Abhängigkeit, nicht nach Wichtigkeit. „Backend" heisst:
ohne Serveränderung nicht machbar.

### D0 – Spec und Plan für die Screens *(Voraussetzung für alles Weitere)*

Die sechs Screens in eine Spec übersetzen: je Screen Zweck, Zustände,
Datenquellen, Übergänge. Daraus ein Umsetzungsplan mit Tasks. Ohne diesen
Schritt gibt es weiterhin keine gemeinsame Vorlage.

Ablage nach Projektkonvention: `docs/superpowers/specs/` und
`docs/superpowers/plans/`.

---

### D1 – Navigationsleiste zwischen den Seiten

**Achtung, kein Design-Rückstand:** Die „Screens"-Liste im Prototyp steht
**ausserhalb** der `ums-screen`-Rahmen. Das ist der Navigator des
Design-Werkzeugs, keine App-Leiste. Der Wunsch ist also eine **neue**
Anforderung, keine Nachholung.

- **Ist:** `App.tsx` kennt drei Zustände (`eingabe | route | angekommen`)
  plus zwei Rechtsseiten. Kein Router, keine Leiste.
- **Weg:** Ansichtszustand zu einem benannten Screen-Enum erweitern
  (`eingabe`, `ticket`, `dashboard`, `navigation`, `stoerung`,
  `wagenreihung`, `angekommen`). Untere Leiste als eigene Komponente,
  Einträge je nach Datenlage aktiv/inaktiv (z. B. Wagenreihung erst, wenn
  eine Wagennummer bekannt ist).
- **Entscheidung nötig:** echtes Routing (`#/dashboard`) oder weiter
  Zustand im Speicher. Für Zurück-Taste und Teilen von Links spricht
  Routing; dagegen spricht, dass die Route bewusst nur im Speicher lebt.
- **Aufwand:** mittel. **Backend:** nein.

### D2 – Dashboard: Ampel sofort nach Gleiseingabe

- **Ist:** Die Ampel erscheint erst in der Routenansicht, und `farbe` bleibt
  `null`, solange `werte.abfahrtZeit` fehlt – die Zeit kommt nur aus der
  Zugauswahl. Ohne Zugauswahl also eine graue Ampel ohne Aussage.
- **Soll (Screen 2):** Nach Ankunfts- und Abfahrtsgleis ein Dashboard mit
  Ampel, Restzeit **und** Gehzeit, dazu die Blöcke „Du kommst an" /
  „Dein Anschluss".
- **Weg:** Die Gehzeit steht bereits in `RouteErgebnis.gehzeitSek` und
  braucht keine Zugauswahl. Zwei Fälle trennen: **mit** Abfahrtszeit →
  farbige Ampel plus Countdown; **ohne** → Gehzeit allein und ein klarer
  Satz, dass die Bewertung eine Abfahrtszeit braucht. Heute sieht beides
  gleich aus.
- **Aufwand:** klein. **Backend:** nein.

### D3 – Routen-Schaltflächen auf drei reduzieren

- **Ist:** Zwei Gruppen. Gehprofil (`zügig | normal | langsam`) **und**
  Variante (`Schnellste | Einfachste | Barrierefrei`).
- **Soll (Design `ROUTEN`):** `Schnellste Route` · `Barrierefrei (Aufzug)` ·
  `Mit Stopp: WC & Kiosk`, jeweils mit Minutenangabe am Knopf.
- **Weg:** `Einfachste` aus der Oberfläche nehmen (Backend-Variante bleibt,
  nur ungenutzt). Gehprofil verschwindet aus der Hauptmaske – es ist eine
  Einstellung, keine Routenwahl; es gehört hinter „Mehr" oder in die
  Ticketdaten. **Minuten am Knopf** heisst: alle drei Varianten vorab
  rechnen, also drei `/api/route`-Aufrufe statt einem.
- **`Mit Stopp: WC & Kiosk` ist neu und braucht das Backend.** Nötig sind
  POI-Knoten (`amenity=toilets`, `shop=kiosk` aus OSM – Overpass liefert sie
  bereits im 400-m-Umkreis, sie werden nur nicht in den Graphen
  aufgenommen) und eine Wegsuche über einen Zwischenpunkt.
- **Aufwand:** klein (Umbau der Knöpfe) + mittel (neue Variante).
  **Backend:** ja, für die dritte Variante.

### D4 – Navigation: Schema statt Landkarte

- **Ist:** MapLibre mit **OSM-Rasterkacheln** für Stufe 1/2 (keine
  Satellitenbilder – aber der Einwand trägt genauso: eine Straßenkarte hilft
  in einer geschlossenen Halle nicht). `Bahnhofsschema.tsx` existiert, wird
  aber nur bei Stufe 3 gezeigt.
- **Soll (Screen 3):** Immer ein Schema – drei Ebenenbänder mit Gleisnummern
  und Orientierungspunkten (Anzeige, Kiosk, Aufzüge), aktiver Abschnitt
  hervorgehoben.
- **Weg:** `Bahnhofsschema` von „Notbehelf für Stufe 3" zur Regelanzeige
  ausbauen. Anders als heute stehen bei Stufe 1/2 **echte** Daten bereit:
  `karte` (GeoJSON je Ebene), `level` und `knotenVon`/`knotenBis` je
  Schritt. Aus der echten Geometrie ein maßstabsfreies Schema abzuleiten
  ist die eigentliche Arbeit.
- **Nebeneffekt:** MapLibre könnte ganz entfallen – das Hauptbündel sinkt
  spürbar. Vorher entscheiden, ob die Karte als „Mehr anzeigen" bleiben
  soll.
- **Aufwand:** groß. **Backend:** nein (Daten reichen).

### D5 – Textnavigation Schritt für Schritt

- **Ist:** `Schrittliste.tsx` rendert **alle** Schritte; der aktive ist nur
  hervorgehoben. Der Kommentar nennt das ausdrücklich Absicht („nicht durch
  ein Guckloch laufen").
- **Soll (Screen 3):** Unteres Sheet mit `Schritt n von m`, Titel, Detail
  und „Weiter" – ein Schritt zur Zeit.
- **Weg:** Neue Komponente `Schrittsheet`, die `aktiverSchritt` und
  `Schrittsteuerung` (beide vorhanden) zusammenführt. Die Liste bleibt als
  aufklappbare Gesamtübersicht erhalten – die Begründung von damals ist
  nicht falsch, sie war nur die Voreinstellung.
- **Aufwand:** klein. **Backend:** nein.

### D6 – Störungs-/Gleiswechselseite

- **Ist:** `LiveBanner.tsx`, 36 Zeilen: „Gleiswechsel · alt → neu" und
  „Verstanden". Die Route wird **automatisch** neu berechnet, ohne dass du
  zustimmst.
- **Soll (Screen 4):** Eigene Seite mit Alt/Neu-Gleis, **neuer Gehzeit**,
  **neuer Abfahrt**, **Restzeit danach**, der Aussage der Ampel im Klartext
  („springt auf Rot – geh direkt los") und dem Knopf **„Route übernehmen"**.
- **Weg:** Die neue Route berechnen, aber **nicht** sofort anwenden, sondern
  als Vorschlag zeigen: alt gegen neu. Erst „Route übernehmen" ersetzt die
  aktive Route. Der Zustand „ein Vorschlag liegt vor" ist neu.
- **Aufwand:** mittel. **Backend:** nein (SSE liefert das Ereignis bereits).

### D7 – Wagenreihungsseite mit Abschnitt A–F

- **Ist:** Kein Screen. Nur ein Feld `wagen` in der Eingabe; der Abschnitt
  fliesst still in den Startknoten der Route ein.
- **Soll (Screen 5):** Bahnsteiggrafik mit Abschnitten A–G, hervorgehobener
  Zielabschnitt, Wagenreihe mit Klassen, Text „Stell dich in Abschnitt C
  hin", Knopf **„Dorthin navigieren"**.
- **Weg:** `/api/route` liefert den Abschnitt heute nur indirekt. Für die
  Grafik braucht es die **volle Wagenreihung** (alle Wagen mit Abschnitt und
  Klasse), nicht nur den einen Treffer – der Client
  `wagenreihung.ts` holt die Daten bereits, `holeWagenposition` wirft den
  Rest weg. Ein Endpunkt oder ein zusätzliches Feld muss sie durchreichen.
- **Blocker:** Die Seite ist für den **Abfahrtszug** gedacht, das
  Wagenfeld der Eingabe gehört aber zum **Ankunftszug** – das ist
  Konzeptlücke §9 (getrennte Blöcke Ankunft/Abfahrt). Ohne die ist der
  Screen nicht sinnvoll zu füllen.
- **Aufwand:** groß. **Backend:** ja.

### D8 – „Angekommen" groß in Grün

- **Ist:** `Angekommen.tsx`, 20 Zeilen: Überschrift „Angekommen", ein Satz,
  ein Knopf. Kein Grün, keine Reisedaten.
- **Soll (Screen 6):** „Du bist da." groß auf grünem Grund, dazu Puffer,
  Abfahrt, Wagen und Platz sowie der Hinweis zur Fahrtrichtung; Knöpfe
  „Neue Reise" und „Wagenreihung".
- **Weg:** Die Werte liegen bereits in `werte` und `route` vor. Das Grün
  (`#0f7a4f`) ist als Token vorhanden.
- **Aufwand:** klein. **Backend:** nein.

### D9 – Ticket-Import als eigenes Dashboard

- **Ist:** Nichts. Im README als ToDo 12 geführt, laut Konzept Stufe 2.
- **Soll (Screen 1):** „Ticket-PDF importieren" → „Ticket wird gelesen …" →
  erkannte Werte: Zug, Gleise, Wagen, Platz, Umstiegsbahnhof, Puffer.
- **Weg:** Das ist **kein UI-Thema**, sondern ein Backend-Vorhaben:
  PDF-Verarbeitung und das Lesen des Aztec-Codes (die maschinenlesbaren
  Daten stehen dort, nicht im Fliesstext). Dazu kommen Datenschutzfragen –
  ein Ticket enthält Namen und Buchungsnummer, und die Datenschutzerklärung
  sagt derzeit ausdrücklich, dass nichts gespeichert wird.
- **Aufwand:** groß, eigenes Vorhaben. **Backend:** ja.

## Reihenfolge-Vorschlag

1. **D0** (Spec und Plan) – ohne das wiederholt sich der Fehler.
2. **D2, D5, D8** – kleine Frontend-Schritte, sofort sichtbar, kein Backend.
3. **D1** – die Leiste, sobald es mehr Seiten gibt, die sie verbinden kann.
4. **D6** – braucht D1.
5. **D4** – groß, aber rein im Frontend.
6. **D3** (dritte Variante), **D7**, **D9** – Backend-Vorhaben, je einzeln.
