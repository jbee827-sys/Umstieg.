# Frontend nach dem Designkonzept – Designdokument

Stand: 31.08.2026 · Validiert im Brainstorming · Zieldokument für die Umsetzung mit Claude Code

Setzt [`design/Umstieg.dc.html`](../../../design/Umstieg.dc.html) um (6 Screens, Claude-Design-Import vom 24.08.2026) und schliesst die in [`docs/2026-08-31-design-abgleich.md`](../../2026-08-31-design-abgleich.md) belegte Lücke.

---

## 1. Ziel und Abgrenzung

Die App folgt heute dem Konzept**text**, nicht dem Design**bild**. Der Umsetzungsplan entstand am 24.08.2026 um 19:51, der Design-Import kam um 21:10 – der Plan wurde nie nachgezogen und erwähnt das Design mit keiner Silbe. Übernommen wurden nur die Tokens (Farben, Archivo), nicht Aufbau und Fluss.

**Ziel:** Das Frontend so umbauen, dass es dem Entwurf entspricht – sechs Bildschirme statt drei Ansichten, Schema statt Landkarte, ein Schritt statt einer Liste, ein Gleiswechsel als Entscheidung statt als stille Neuberechnung.

**Ausdrücklich nicht das Ziel:** Änderungen am Backend. Es bleibt in diesem Vorhaben unangetastet. Was Backend bräuchte, ist hier vollständig spezifiziert (Abschnitt 8), aber nicht Teil der Umsetzung.

**Ebenfalls nicht das Ziel:** eine pixelgenaue Kopie des Prototyps. Der Entwurf zeigt ein Mock-Szenario mit erfundenen Werten (Wagen 26, Platz 61). Übernommen werden Aufbau, Reihenfolge und Sprache, nicht die Beispieldaten.

## 2. Festgelegte Entscheidungen

| Entscheidung | Festlegung | Begründung |
|---|---|---|
| Navigation | Zustand im Speicher, **kein** Router | Die Route lebt bewusst nur im Speicher (offline-fähig). Eine teilbare URL wäre eine Lüge – nach dem Neuladen wäre sie leer. `#impressum`/`#datenschutz` bleiben wie bisher |
| Kartenanzeige | Schema als Regelanzeige, echte Karte hinter „Mehr" | Der Entwurf kennt keine Kartenbibliothek. MapLibre bleibt für die Fälle erhalten, in denen echte Geometrie hilft (Vorplatz, Aussenwege) |
| Backend-Bildschirme | Ticket-Import und Wagenreihung werden **nur spezifiziert** | Kein Code ohne Funktion. Die Navigationsleiste kennt sie nicht |
| Störungsbildschirm | Kein fester Eintrag in der Leiste | Eine Seite, die meistens leer wäre, ist ein toter Knopf. Stattdessen Kennzeichen am Dashboard |
| Gehprofil | Hinter „Mehr einstellen", nicht gestrichen | Im Entwurf kommt es nicht vor; für langsame Gehende ersatzlos zu streichen wäre ein Rückschritt |
| Testinfrastruktur | jsdom + Testing Library **zuerst** | Sechs Bildschirme ohne Test zu bauen ist blind. Zwei Fehler vom 30.08. liessen sich nachweislich nicht testen |

## 3. Architektur

Kein neuer Dienst, keine neue Datenquelle, keine Änderung an der API. Umgebaut wird allein die Gliederung des Frontends.

```
                    ┌──────────────────────────────────────┐
                    │  App.tsx  – Zustand, Datenfluss,     │
                    │  Bildschirmwahl (KEIN Layout mehr)   │
                    └──────────────────────────────────────┘
                                     │
   ┌──────────┬──────────────┬───────┴───────┬──────────────┐
   ▼          ▼              ▼               ▼              ▼
Eingabe   Dashboard     Navigation       Stoerung      Angekommen
                                              ▲
                          SSE-Gleiswechsel ───┘  (Vorschlag, nicht Automatik)

                    ┌──────────────────────────────────────┐
                    │  Navigationsleiste (unten, fixiert)  │
                    └──────────────────────────────────────┘
```

**Bildschirmfluss:**

```
eingabe → dashboard → navigation → angekommen
              ↑            │
          stoerung ◄───────┘   (nur bei Gleiswechsel erreichbar)
```

`App.tsx` ist heute 357 Zeilen und trägt Standorterkennung, SSE, Countdown, Ankunftserkennung **und** drei Ansichten. Sechs Bildschirme würden sie unlesbar machen. Sie behält deshalb ausschliesslich Zustand, Datenfluss und Bildschirmwahl; jeder Bildschirm wird eine eigene Komponente.

**Zustandstyp:**

```ts
type Bildschirm = 'eingabe' | 'dashboard' | 'navigation' | 'stoerung' | 'angekommen'
```

Die Rechtsseiten (`impressum`, `datenschutz`) bleiben ein getrennter Zustand über den Hash – sie sind keine Reisebildschirme und dürfen aus jedem Zustand erreichbar sein.

## 4. Die Navigationsleiste

Unten fixiert, vier Einträge: **Eingabe · Dashboard · Navigation · Angekommen**.

**Wichtige Klarstellung:** Die „Screens"-Liste im Prototyp steht **ausserhalb** der `ums-screen`-Rahmen. Sie ist der Navigator des Design-Werkzeugs, keine App-Leiste. Diese Leiste ist eine **neue** Anforderung, kein Design-Rückstand.

| Eintrag | Aktiv, wenn |
|---|---|
| Eingabe | immer |
| Dashboard | eine Route berechnet ist |
| Navigation | eine Route berechnet ist |
| Angekommen | eine Route berechnet ist (manuelle Bestätigung bleibt möglich) |

Gesperrte Einträge sind sichtbar, aber nicht antippbar (`aria-disabled`), damit der Aufbau der App erkennbar bleibt.

**Störung** erscheint als Kennzeichen (Punkt) am Dashboard-Eintrag, sobald ein Gleiswechsel-Vorschlag vorliegt, und verschwindet, sobald er übernommen oder verworfen ist.

## 5. Die Bildschirme

### 5.1 Eingabe (Screen 1, ohne Ticket-Teil)

Bleibt weitgehend wie heute: Bahnhofssuche mit Vorschlägen, Gleis an/ab, Zugauswahl, Standortvorbelegung.

**Änderungen:**
- Der Ticket-Import-Block aus Screen 1 entfällt (siehe 8.1)
- Gehprofil und Routenvariante verschwinden aus der Hauptmaske – sie gehören ins Dashboard (Variante) beziehungsweise hinter „Mehr einstellen" (Profil)

### 5.2 Dashboard (Screen 2)

Der Bildschirm, der heute fehlt. Aufbau von oben:

1. **Kopf:** Bahnhofsname, Uhrzeit
2. **Ampel** – sofort nach den Gleisen, ohne Zugauswahl
3. **Blöcke** „Du kommst an" (Zug, Gleis, Ebene) und „Dein Anschluss" (Zug, Gleis, Ebene, Abschnitt)
4. **Routenknöpfe** mit Minutenangabe
5. **Nebenknöpfe** „Wagenreihung" und „Störung"
6. **„Navigation starten"**

Die beiden Nebenknöpfe stehen so im Entwurf. Umgesetzt wird davon nur
**„Störung"**, und zwar erst sichtbar, sobald ein Gleiswechsel-Vorschlag
vorliegt – vorher führte er auf eine leere Seite. **„Wagenreihung" entfällt**,
weil der Bildschirm dahinter nicht gebaut wird (8.2).

**Die zwei Ampelzustände sind der Kern dieses Bildschirms:**

| Fall | Anzeige |
|---|---|
| Abfahrtszeit bekannt | Farbige Ampel (Formel unverändert: Grün ≥ 2× Gehzeit, Gelb 1–2×, Rot < 1×), Restzeit, Gehzeit, Countdown |
| Abfahrtszeit unbekannt | Graue Ampel, **nur Gehzeit**, dazu der Satz: „Für die Bewertung fehlt die Abfahrtszeit – wähle deinen Anschlusszug." |

Heute sehen beide Fälle gleich aus (`farbe` bleibt `null`), und das ist der eigentliche Mangel: Der Nutzer erfährt nicht, warum die Ampel schweigt.

**Nach der Abfahrtszeit** (plus Kulanz) trifft die Ampel weiterhin keine Aussage – unverändert aus der Standort-Spec.

**Routenknöpfe:**

| Knopf | Backend-Variante | Status |
|---|---|---|
| Schnellste Route | `schnellste` | wird gebaut |
| Barrierefrei (Aufzug) | `barrierefrei` | wird gebaut |
| Mit Stopp: WC & Kiosk | – | nur spezifiziert (8.3) |

`einfachste` verschwindet aus der Oberfläche. Die Backend-Variante bleibt bestehen und ungenutzt – sie zu entfernen wäre eine Backend-Änderung.

**Minuten am Knopf** bedeutet: beide Varianten werden vorab berechnet, also zwei `/api/route`-Aufrufe statt einem. Sie laufen parallel. Schlägt einer fehl, zeigt der Knopf keine Minuten statt einer Falschangabe; schlagen beide fehl, gilt die heutige Fehlerbehandlung.

### 5.3 Navigation (Screen 3)

Zwei Teile, übereinander.

**Oben – das Schema.** Ebenenbänder mit Gleisnummern und Orientierungspunkten, aktiver Abschnitt hervorgehoben. `Bahnhofsschema.tsx` existiert bereits für Stufe 3 und wird zur Regelanzeige ausgebaut.

Der Unterschied zu heute: Bei Stufe 1/2 stehen **echte** Daten bereit – `karte` (GeoJSON je Ebene), `level` und `knotenVon`/`knotenBis` je Schritt. Aus dieser Geometrie ein maßstabsfreies Schema abzuleiten ist die eigentliche Arbeit dieses Vorhabens.

Ableitungsregeln:
- Ein Band je vorkommender Ebene, sortiert von oben (höchstes `level`) nach unten
- Je Band die Gleisnummern, die auf dieser Ebene liegen
- Der aktive Schritt bestimmt das hervorgehobene Band
- Ebenenwechsel (Treppe, Rolltreppe, Aufzug, Rampe) werden als Verbindung zwischen zwei Bändern gezeichnet

**Echte Karte hinter „Mehr".** Aufklappbar, standardmäßig zu. MapLibre wird weiterhin erst bei Bedarf geladen – das Hauptbündel bleibt unberührt.

**Unten – das Schritt-Sheet.** Ein Schritt zur Zeit: „Schritt n von m", Titel, Detail, „Weiter" und „Zurück". Die vorhandenen Bausteine `aktiverSchritt` (Zeitfortschaltung) und `Schrittsteuerung` (Weiter/Zurück) werden hier zusammengeführt.

Die vollständige Liste bleibt als aufklappbare Übersicht erhalten. Die Begründung von damals – „der Nutzer soll den Weg im Ganzen behalten" – ist nicht falsch; sie war nur die falsche Voreinstellung.

### 5.4 Störung / Gleiswechsel (Screen 4)

**Die wichtigste Verhaltensänderung des ganzen Umbaus.** Heute rechnet die App bei einem Gleiswechsel still neu und schreibt das neue Gleis in die Eingabewerte. Der Nutzer erfährt es aus einem Banner, nachdem es passiert ist.

Neu: Der Gleiswechsel wird zu einem **Vorschlag**.

1. SSE meldet `gleiswechsel`
2. Die neue Route wird berechnet, aber **nicht angewendet**
3. Kennzeichen am Dashboard, Banner mit Verweis auf die Störungsseite
4. Die Störungsseite zeigt alt gegen neu:
   - Gleis alt → neu
   - Neue Gehzeit, neuer Abschnitt
   - Neue Abfahrt (und ob früher oder später)
   - Restzeit danach
   - Die Ampelaussage im Klartext („Die Ampel springt auf Rot: du hast nach dem Wechsel weniger Puffer als Gehzeit. Geh direkt los.")
5. **„Route übernehmen"** ersetzt die aktive Route. „Behalten" verwirft den Vorschlag.

Neuer Zustand: `vorschlag: { route: RouteErgebnis; werte: EingabeWerte; anlass: LiveEreignis } | null`.

**Randfall:** Trifft ein zweiter Gleiswechsel ein, während ein Vorschlag offen ist, ersetzt der neue den alten – der ältere ist dann überholt.

### 5.5 Angekommen (Screen 6)

„Du bist da." groß auf grünem Grund (`#0f7a4f`, als Token vorhanden). Darunter Puffer, Abfahrt, Wagen und Platz, soweit bekannt, sowie der Hinweis zur Fahrtrichtung. Knöpfe „Neue Reise" und – sobald die Wagenreihung gebaut ist – „Wagenreihung".

Alle Werte liegen in `werte` und `route` bereits vor. Fehlende Angaben (kein Wagen eingegeben) werden weggelassen, nicht erfunden.

## 6. Datenfluss

Unverändert gegenüber heute, mit einer Ergänzung:

```
Eingabe ──berechne()──► /api/route ──► route (Speicher) ──► Dashboard
                                              │
                                              ├──► Navigation (Schema + Sheet)
                                              └──► Angekommen

SSE /api/live ──gleiswechsel──► berechne(neu) ──► vorschlag (Speicher)
                                                       │
                                          „übernehmen" └──► route
```

Die Route bleibt vollständig im Speicher – die Anzeige funktioniert weiter, wenn die Verbindung im Bahnhof abreisst. Das gilt jetzt auch für den Vorschlag.

## 7. Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| Eine Variantenberechnung schlägt fehl | Der Knopf zeigt keine Minuten; die andere Variante bleibt wählbar |
| Beide schlagen fehl | Heutige Fehlerbehandlung (`FEHLER_TEXTE`), Verbleib auf der Eingabe |
| Neuberechnung nach Gleiswechsel schlägt fehl | Banner meldet den Wechsel im Klartext, ohne Vorschlag; die alte Route bleibt sichtbar und wird als überholt gekennzeichnet |
| Schema nicht ableitbar (keine `level`-Angaben) | Rückfall auf die Schrittliste; die Karte bleibt über „Mehr" erreichbar |
| Stufe 3 | Wie heute: Schema aus konstruierten Koordinaten, **kein** Kartenknopf |

## 8. Nur spezifiziert, nicht gebaut

Alles in diesem Abschnitt braucht Backend-Arbeit und ist **nicht** Teil der Umsetzung. Es steht hier, damit es beim nächsten Vorhaben nicht wieder neu gedacht werden muss.

### 8.1 Ticket-Import (Screen 1)

**Bildschirm:** „Ticket-PDF importieren" → „Ticket wird gelesen …" → erkannte Werte als Liste: Zug, Gleise, Wagen, Platz, Umstiegsbahnhof, Puffer. Danach „Umstieg starten" mit vorbelegten Feldern.

**Was fehlt:** Ein Backend-Endpunkt, der ein PDF entgegennimmt und die Reisedaten liest. Die maschinenlesbaren Daten stehen im **Aztec-Code** des Tickets, nicht im Fliesstext – ein reiner Textparser reicht nicht.

**Datenschutz – vorab zu klären:** Ein Ticket enthält Namen und Buchungsnummer. Die Datenschutzerklärung sagt heute ausdrücklich, dass nichts gespeichert wird und das Backend kein Protokoll führt (`logger: false`). Ein Upload verändert diese Aussage. Zu entscheiden ist, ob die Verarbeitung im Browser stattfinden kann (dann bleibt die Aussage wahr) oder serverseitig (dann muss die Erklärung angepasst werden).

**Empfehlung:** Verarbeitung im Browser prüfen, bevor ein Endpunkt gebaut wird.

### 8.2 Wagenreihung (Screen 5)

**Bildschirm:** Bahnsteiggrafik mit Abschnitten A–G, hervorgehobener Zielabschnitt, Wagenreihe mit Klassen, Text „Stell dich in Abschnitt C hin – dort hält Wagen 26", Knopf „Dorthin navigieren".

**Was fehlt – zwei Dinge:**

1. **Die vollen Wagenreihungsdaten.** `clients/wagenreihung.ts` holt sie bereits, aber `holeWagenposition` gibt nur den einen Abschnitt zurück und wirft den Rest weg. Für die Grafik braucht es alle Wagen mit Abschnitt und Klasse – ein zusätzliches Feld oder ein eigener Endpunkt.
2. **Konzeptlücke §9.** Der Bildschirm meint den **Abfahrts**zug, das Wagenfeld der Eingabe gehört zum **Ankunfts**zug. Ohne getrennte Blöcke Ankunft/Abfahrt ist er nicht sinnvoll zu füllen. **Das ist der eigentliche Blocker** – die Datenfrage allein wäre lösbar.

### 8.3 Routenvariante „Mit Stopp: WC & Kiosk"

**Was fehlt:** POI-Knoten im Graphen und eine Wegsuche über einen Zwischenpunkt.

Die Daten sind bereits da: Overpass liefert `amenity=toilets` und `shop=kiosk` im 400-m-Umkreis mit, `baueGraph` nimmt sie nur nicht auf. Nötig wären: POIs als Knoten aufnehmen, eine Variante `mit-stopp`, und Dijkstra zweimal laufen lassen (Start → POI → Ziel) mit Wahl des günstigsten POI.

**Offen:** ob der Nutzer den Zwischenstopp wählt (WC *oder* Kiosk) oder das System den nächstgelegenen nimmt. Der Entwurf nennt beide in einem Knopf.

## 9. Testbarkeit

**Das Problem:** `vitest.config.ts` läuft mit `environment: 'node'`. Geprüft werden heute nur reine Funktionen. Zwei Korrekturen vom 30.08. – der Netzfehler-Hinweis und der Genauigkeitshinweis – liessen sich **gar nicht** testen und wurden nur im Browser verifiziert.

Sechs Bildschirme ohne Test zu bauen wäre blind. Deshalb ist der **erste** Schritt der Umsetzung: jsdom und Testing Library ergänzen (README-ToDo 14).

**Was danach geprüft wird:**

| Einheit | Prüfung |
|---|---|
| Navigationsleiste | Gesperrte Einträge sind nicht antippbar; Kennzeichen erscheint bei Vorschlag |
| Dashboard-Ampel | Beide Zustände (mit/ohne Abfahrtszeit) zeigen unterschiedliche Aussagen |
| Routenknöpfe | Zwei Aufrufe; ein Fehlschlag lässt die andere Variante bestehen |
| Schema-Ableitung | Aus `karte`+`level` entsteht die erwartete Bänderfolge (reine Funktion, auch ohne DOM prüfbar) |
| Schritt-Sheet | Zeigt genau einen Schritt; Weiter/Zurück verschiebt |
| Störung | „Übernehmen" ersetzt die Route, „Behalten" nicht |
| Angekommen | Fehlende Werte werden weggelassen, nicht erfunden |

Die Ableitung des Schemas wird als **reine Funktion** gebaut (`schema/ableitung.ts`), getrennt von der Darstellung – so ist der schwierigste Teil ohne DOM prüfbar.

## 10. Was sich NICHT ändert

- Das Backend. Keine Zeile
- Die API-Schnittstelle
- Die Ampelformel (relativ zur Gehzeit, Konzeptkorrektur 4)
- Standorterkennung, Rundung auf 3 Nachkommastellen, Genauigkeitsgrenze
- Impressum, Datenschutzerklärung, lokale Schriften
- Die Design-Tokens – sie waren von Anfang an richtig übernommen
