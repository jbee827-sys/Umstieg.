# Umstieg.

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Schritt-für-Schritt-Anweisung und Karte – und live bewertet, ob der Anschluss erreichbar ist.

**Konzept:** [`2026-08-24-umstiegs-navigator-design.md`](./2026-08-24-umstiegs-navigator-design.md)
**Implementierungsplan MVP (17 Tasks):** [`docs/plans/2026-08-24-umsetzungsplan-mvp.md`](./docs/plans/2026-08-24-umsetzungsplan-mvp.md)
**Spec Standort (P1):** [`docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md`](./docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md)
**Plan Standort (P1, 12 Tasks):** [`docs/superpowers/plans/2026-08-27-standort-und-navigation.md`](./docs/superpowers/plans/2026-08-27-standort-und-navigation.md)
**Spec Schrittnavigation:** [`docs/superpowers/specs/2026-08-30-schrittnavigation-design.md`](./docs/superpowers/specs/2026-08-30-schrittnavigation-design.md)
**Plan Schrittnavigation (8 Tasks):** [`docs/superpowers/plans/2026-08-30-schrittnavigation.md`](./docs/superpowers/plans/2026-08-30-schrittnavigation.md)
**UI-Design (Claude Design Import):** [`design/Umstieg.dc.html`](./design/Umstieg.dc.html)
**Designregeln (Farben, Schrift, Bauteile):** [`design/DESIGN.md`](./design/DESIGN.md), Begründungen in [`BRIEF.md`](./BRIEF.md)

## Architektur

- **Backend:** Node.js ≥ 20, Fastify 5, TypeScript (strict). Zustandslos, keine Datenbank, RAM-LRU-Cache. Holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten (Marketplace-APIs).
- **Frontend:** React + Vite + TypeScript. Design siehe unten. Mobil zuerst.
- **Betrieb:** Frontend statisch auf **Vercel**, Backend als dauerhaft laufender **Container** (Fly.io). Bewusst getrennt – SSE, EVA-Poller und Graph-Cache brauchen einen Prozess mit Gedächtnis, den Serverless nicht garantiert. Siehe [`docs/deployment.md`](./docs/deployment.md).

## Hier weitermachen (Stand 07.10.2026)

> **Die Übersicht ist umgebaut** – die drei Anforderungen aus `BRIEF.md`,
> Abschnitt 2 („Dashboard — hier liegt das eigentliche Problem"). Nicht
> committet, nicht ausgeliefert.
>
> 1. **Bahnsteigstreifen statt drei Standortknöpfen** (a). Ein Balken ist der
>    Bahnsteig, darauf drei Stellen mit Ring und Minuten; die Wahl zeigt EIN
>    Standortpunkt – derselbe wie im Ebenenschema –, der in 200 ms an die neue
>    Stelle wandert (`--verlauf-marke`, das einzige Federn der App). Für
>    Screenreader bleiben es drei Knöpfe mit `aria-pressed`. Standort- und
>    Routenwahl sehen damit nicht mehr gleich aus.
> 2. **Ebenenangabe auf beiden Karten** (b): `Ebene 0` / `Ebene −2` aus dem
>    ersten und letzten Ebenenbesuch (`gleisEbenen` in `schema/bandmodell.ts`).
>    Im Standardmodell steht nichts – dort sind die Ebenen geraten. „tief" und
>    „Abschnitt C" aus dem Entwurfsbild bewusst nicht (Gründe in
>    `design/DESIGN.md` §8).
> 3. **„Navigation starten" steht fest über der Leiste** (c). Die Übersicht
>    hat jetzt den Aufbau der Wegseite: `.app-dashboard` so hoch wie das
>    Sichtfeld, nur `.dashboard-rollbereich` rollt. Nicht `sticky` mit festem
>    Abstand – die Leiste wächst mit großer Geräteschrift.
>
> **Was die Sichtprüfung gefunden hat** (Chrome, Rahmen 360 × 740, echte
> Route München 5 → 82, Stufe 1):
>
> - **Die gewählte Routenzeile saß seit August 8 px tiefer** (`218a0c3`). Eine
>   Regel für die blanke Klasse `.gewaehlt` – gemeint war das Abzeichen
>   „✓ Bahnhof" in der Eingabe – gab jedem gewählten Element `margin-top: 8px`.
>   Auf dem Streifen fiel es auf, weil die gewählte Stelle den Balken
>   zerbrach. Das Abzeichen heißt jetzt `.bahnhof-gewaehlt`; ein Test hält
>   `.gewaehlt` regelfrei.
> - **Nähte im Balken**: drei Hintergrundstücke zu je einem Drittel landeten
>   auf Bruchteilen eines Pixels. Der Balken ist jetzt EIN Hintergrund
>   (`.bahnsteigstreifen::before`).
>
> | Gemessen im Rahmen | 360 hell | 360 dunkel | 320 hell | 320 dunkel |
> |---|---|---|---|---|
> | Seite rollt / rollt quer | nein / nein | nein / nein | nein / nein | nein / nein |
> | Knopf über der Leiste | 594–652 / 670–740 | ebenso | ebenso | ebenso |
> | Standortpunkt auf dem Ring | ±0 px | ±0 px | ±0 px | ±0 px |
> | kleinster Kontrast der neuen Schrift | 5,96:1 | 7,76:1 | 5,96:1 | 7,76:1 |
>
> Dazu: Wechsel Mitte → Ostende (Punkt wandert, Route kommt mit 11 min) und
> 150 % Grundschrift (Knopf bleibt über der Leiste, nichts rollt quer).
>
> ```bash
> cd frontend && npm test && npm run lint && npm run build   # 443 von 443, Lint sauber, Build grün
> ```
>
> **Nicht geprüft:** Den Streifen **nach** der Nahtkorrektur hat niemand mehr
> gesehen – der Browser-Tab war danach verdeckt, die Maße oben stammen aus
> dem Rahmen selbst. Das Standardmodell auf der Übersicht ist nur im Test
> belegt. Das Backend ist unberührt.
>
> **Nächster Schritt unverändert: ausliefern** – Fly.io mit `--ha=false` und
> Vercel, wie am 05.10. notiert (heute kam nur Frontend dazu, das Backend
> trägt aber noch `662b8c7` und `32292fb`), danach M9/M10 am Gerät. **Weiter offen am Design:** Bewegung
> an die Token anschließen, Seitenübergänge mit Pfad-Adressen, ToDo 38
> (Vorbehalte in „Alle Schritte"), Eingabe-Bildschirm und iPad (beide warten
> auf einen Entwurf).

### Davor (05.10.2026)

> **Seit dem 19.09. sind acht Commits dazugekommen.** Die ersten sechs stammen
> vom 21.09. bis 02.10., die letzten beiden vom 05.10.:
>
> | Commit | Was |
> |---|---|
> | `682a43e` | Neues Farb- und Formsystem (`BRIEF.md`, `design/DESIGN.md`): Weiß–Rot–Grau, Alarm = Rot **und** Gelb (zweigeteilte Lampe, gestreifter Saum), Rundungsstaffel, Schrift in `rem`, Nordstern in der Navileiste |
> | `1054c36` | Dunkelmodus über Token statt fester Farbwerte |
> | `662b8c7` | Teilgleise aus dem Fahrplan („7A-D", „2 D-G") auf das OSM-Gleis abbilden – `loeseGleis` über `parentPlatform` und `linkedPlatforms` |
> | `f3d4485` | Bildhöhe nach Bahnsteigdichte statt fester 180 px (**erledigt ToDo 37**), grobes Ersatzbild für das Standardmodell |
> | `9d74685` | Schlüssel-Tresor liegt auf `E:\jbeer\.secrets`, der Pfad steht nur noch in `backend/scripts/secrets.ts` |
> | `32292fb` | Gleisnummern in jeder OSM-Schreibweise (`local_ref`, `railway:track_ref`, `platform_edge`) und DB-Gleise über `ref:IFOPT` |
> | *(05.10.)* | Sichtprüfung im Browser und alles, was sie gefunden hat – siehe unten |
> | *(05.10.)* | dieses README |
>
> **Der Gleisabgleich trägt.** Im echten Abgleich vom 02.10. (116 Bahnhöfe,
> 884 Fahrplangleise einer Stunde) fanden sich vorher 22,4 % der Gleise nicht
> im OSM-Graphen, und jede dieser Routen fiel ins Standardmodell. Jetzt sind es
> **1,1 %**: Neun Fahrplanzeilen nennen gar kein Gleis (`pp=""`), und eine
> trifft zwei Bahnsteighälften (Konstanz: „2" gegen OSM `2a`/`2b`, ToDo 39).
> Stuttgart, Karlsruhe, Mannheim, Singen, Iserlohn und Zwickau haben jetzt
> Gleise; Altonas und Münchens S-Bahnsteige kommen über die IFOPT-Kennung.
>
> ### Geprüft am 05.10.2026
>
> **Jeder Commit einzeln** (ausgecheckt, Tests, Lint, Build – Protokolle in
> `.superpowers/pruefung-2026-10-05/`, gitignored):
>
> | Commit | Backend | Frontend | Lint | Build |
> |---|---|---|---|---|
> | `682a43e` | 438/438 | 395/395 | sauber | grün |
> | `1054c36` | 438/438 | 395/395 | sauber | grün |
> | `662b8c7` | 449/449 | 395/395 | sauber | grün |
> | `f3d4485` | 449/449 | 410/410 | sauber | grün |
> | `9d74685` | 449/449 | 410/410 | sauber | grün |
> | `32292fb` | 463/463 | 410/410 | sauber | grün |
>
> Einzige Build-Meldung, in allen sechs gleich: Der nachgeladene Kartenbaustein
> (MapLibre) ist 944 kB groß – bekannt und gewollt, er lädt erst beim Aufklappen.
>
> **Simulationen auf dem Stand `32292fb`**, alle offline über die Ablage:
>
> | Lauf | Ergebnis |
> |---|---|
> | Routen (`simulation-lauf3.ts`, Lauf 9) | 2253 Routen an 120 Bahnhöfen, 1 Befund – Düsseldorf 1 → 20 (ToDo 27), unverändert; Auswertung identisch mit Lauf 8 vom 02.10. |
> | Bild bei 180 und bei 400 px Platz | 0 Befunde, 0 sich überdeckende Symbolschilder (3551 geprüft) |
> | Anfragetest (`anfragen-pruefung.ts`) | 3446 Anfragen, 0 Befunde |
>
> **Sichtprüfung in Chrome** gegen den lokalen Server mit echten DB-Daten,
> Rahmen 360 × 740 (dazu 320, 375, 390 und 412 px Breite gemessen), hell und
> dunkel: Eingabe, Live-Zugtafel, Übersicht mit grüner und roter Ampel, Weg in
> München 5 → 82 (12 Schritte, echtes Schema mit 17 Bahnsteigen) und
> Stuttgart 8 → 16 (Standardmodell mit Ersatzbild), Meldungen, Angekommen.
>
> | Geprüft | Ergebnis |
> |---|---|
> | Rollt die Wegseite? | nein, in keinem der 12 Schritte |
> | Steht das aktive Band still? | Oberkante bei allen 12 Schritten auf derselben Höhe |
> | Fußtext im Bild? | in allen Schritten innerhalb des Fensters |
> | Letzter Schritt | grünes „Angekommen" statt „Weiter" |
> | Dichtes Bild (München, 17 Balken) | Gleisnamen und Balken überdecken sich nicht mehr (`f3d4485`) |
> | Standardmodell | grobes Ersatzbild statt 17 Balken im Abstand von 5 px (`f3d4485`) |
>
> ### Was die Sichtprüfung gefunden hat – und behoben ist
>
> 1. **Die Grundschrift 18 px hatte nie gegriffen.** Sie stand an `body`,
>    `rem` rechnet aber mit `html` (16 px). Die ganze Staffel aus `682a43e` lag
>    damit 11 % unter Plan: die Beschriftung bei 13,3 statt 15 px – unter der
>    eigenen Untergrenze –, der Hauptknopf bei 19,6 statt 22 px. Und eine am
>    Gerät eingestellte große Schrift schlug nicht durch. Jetzt
>    `html { font-size: 112.5% }`; `bandbild.ts` rechnete schon immer mit 18 px.
> 2. **13 Schriftfarben unter 4,5:1.** `neutral-500` und `neutral-600` als
>    Schrift, obwohl `index.css` das ausschließt – darunter die Gehzeit neben
>    der Ampel (auf der roten Fläche 3,9:1), die Gruppentitel der Zugtafel
>    (2,6:1) und die Detailzeile unter jedem Schritt. Alle auf `neutral-700`
>    (hell ab 5,4:1); `src/schriftfarben.test.ts` hält es fest.
> 3. **Das Lockup war nachts unsichtbar** – ein PNG mit dunkler Wortmarke auf
>    dem Nachtgrund. Jetzt kehrt ein Filter es im Dunkelmodus um
>    (`--lockup-filter`), das Rot landet nahe am Nachtrot.
> 4. **Die Gehzeit neben der Ampel wurde zerquetscht** (gemeldet). Bei
>    „Abfahrt jetzt" auf roter Ampel blieben ihr 0 px in drei Zeilen, bei
>    „125:00" zwei Zeilen, auf 320 px schon bei „4:16". Jetzt bleibt sie
>    einzeilig und rutscht, wenn neben der Restzeit kein Platz ist, als eigene
>    Zeile darunter.
> 5. **Mit dem Echtzeit-Banner blieb dem Bild auf der Wegseite nichts.**
>    Banner in voller Länge, „Live-Daten · Stand" und ein zweizeiliger Titel
>    ließen 56 px – genau den Ankerabstand. Auf dieser Seite sagt das Banner
>    jetzt nur noch, dass und seit wann die Echtzeit fehlt; der Stand-Satz
>    entfällt dann; der Titel nimmt die Größe der Anweisung und die volle
>    Breite (das Stufen-Abzeichen steht neben dem Bahnhofsnamen). Ergebnis:
>    190 px, das ganze Band ist zu sehen. Die Störmeldung ist ein Overlay und
>    war nie betroffen.
> 6. Kleinere: „Ankunft: Wagen (optional)" bricht um – die Felder stehen jetzt
>    trotzdem auf einer Höhe; „Route wird berechnet …" brach im Knopf um, jetzt
>    „Wird berechnet …".
>
> **Auf Wunsch geändert:**
>
> - **Die Marke über „Übersicht" ist weg** (der „Nordstern" aus `682a43e`).
>   Die vier Einträge der Navileiste sind wieder gleichrangig.
> - **„Mehr einstellen" heißt „Einstellungen"** und trägt neben dem Gehtempo
>   die **Darstellung: System · Hell · Dunkel**. Ohne Wahl folgt die App dem
>   Gerät. Die Wahl liegt im `localStorage` – als einziger Eintrag dort, nur
>   bei ausdrücklich Hell oder Dunkel, „System" löscht ihn. Die
>   Datenschutzerklärung sagt das jetzt; ihre alte Zusage „localStorage wird
>   nicht verwendet" ist gefallen, ein Test verhindert ihre Rückkehr. Die
>   dunkle Palette steht dafür zweimal in `index.css` (Systemwahl und eigene
>   Wahl); `einstellungen/darstellung-css.test.ts` hält beide gleich.
>
> ```bash
> cd frontend && npm test && npm run lint && npm run build   # 427 von 427, Lint sauber, Build grün
> cd backend  && npm test && npm run lint                    # 463 von 463, Lint sauber
> ```
>
> **Nicht geprüft:** Hell auf einem Gerät mit dunklem System ist gesehen,
> Dunkel auf einem hellen System nicht (der Rechner steht auf dunkel) – die
> Palette ist dort dieselbe, der Test vergleicht sie. Und Overpass antwortete
> am Abend schleppend: Stuttgart und Berlin kamen im Browser nur als
> Standardmodell, München als Stufe 1.
>
> **Zwei Arbeitskopien.** `D:\Claude-code\Umstieg` ist die ältere Kopie
> desselben Repos (Stand `32292fb`), gearbeitet wird in
> `E:\jbeer\Claude-code\Umstieg`. Dort liefen noch die Dev-Server vom 02.10.;
> sie sind beendet und aus `E:` neu gestartet. Nach dem Push steht `D:`
> zurück.
>
> **Nächster Schritt: ausliefern** (Fly.io mit `--ha=false` und Vercel – beide
> Seiten haben sich geändert), **danach M9 und M10 am Gerät** (ToDo 3 und 30).

### Davor (19.09.2026)

> **Die Navigationsseite rollt nicht mehr.** Sie war eine lange Seite: Zum
> „Weiter" musste man hinunterrollen, und dabei rollte das Ebenenbild oben weg
> — genau das Bild, nach dem man gerade schaut. Jetzt sitzt alles fest: Kopf
> oben, Schema im dehnbaren Bereich dazwischen, Schritt-Box und Navileiste
> unten am Rand (`.app-navigation` in `App.css`, `height: 100dvh`,
> `overflow: hidden`; das Schema ist das einzige Kind mit `flex: 1`).
>
> **Das aktive Band steht still.** Es beginnt immer `ANKER_H` = 56 px unter der
> Oberkante des Bildbereichs; die Nachbarebenen wandern darum herum aus dem
> Fenster (`stapelVersatz()` in `schema/masse.ts`, als `translateY` auf dem
> Stapel). Die Rechnung kommt ohne Messen im Browser aus, weil vor dem aktiven
> Band genau `index` ruhige Zeilen zu je 34 + 22 px liegen — es ist immer
> **ein** Band aktiv. Vorher wanderte das große Band mit dem Fortschritt nach
> unten aus dem Sichtfeld.
>
> **Die Entscheidung des Tages: `aktivHoehe` hängt nicht mehr an der Zahl der
> Besuche.** Im festen Bildschirm blieben für das Bild noch rund 180 px statt
> 356 — das Band wurde unten abgeschnitten, samt seinem Fußtext („Treppe
> hinunter bei 32 m · 2 Treppen"). Herunterskalieren hätte auch die
> Beschriftung halbiert; im Abzug gemessen schrumpfte das SVG auf 287 × 103 px
> und war unlesbar. Stattdessen wird das Bild für **180 px neu gezeichnet**
> (`AKTIV_H` in `masse.ts`): Die Bahnsteige rücken zusammen, die Schrift bleibt
> in voller Größe. Damit ist nicht mehr der Stapel der feste Rahmen, sondern
> das Sichtfeld — `STAPEL_H = 468` ist ersatzlos entfallen. Auf höheren
> Geräten bleibt das Bild bei 180 px und es werden dafür **mehr Nachbarebenen**
> sichtbar; das ist die nützlichere Verwendung des Platzes als ein gedehntes
> Bild derselben Ebene.
>
> **Die Bildsimulation trägt die neue Fläche:** 2082 Routen an 111 Bahnhöfen,
> 5630 Bänder, **0 Befunde** — jeder Wegpunkt, jede Marke, jeder Start- und
> Zielpunkt und jedes Symbol liegt weiterhin im Bild, 0 sich überdeckende
> Symbolschilder. Das ist der Grund, warum `masse.ts` EINE Quelle für
> Komponente und Simulation ist: Eine Flächenänderung lässt sich sofort gegen
> die ganze Ablage prüfen.
>
> **Weiter auf der Seite:**
>
> - **Legende und Hinweiszeilen unter dem Bild sind weg** — Bahnhofname +
>   Vorbehalt, der Kreuzungswinkelsatz und `modell.vorbehalte` (daher
>   „Bahnsteigabschnitte (A–G) sind in den Quellen nicht verortet",
>   `core/schema.ts`). Im Rückfallbild `ErsatzSchema` ebenso. Der Bahnhofname
>   bleibt im `aria-label` des Bildes — sonst hätte es keine Ortsangabe mehr.
>   **Die Vorbehalte stehen damit nirgends mehr sichtbar** (ToDo 38).
> - **Beim letzten Schritt tritt ein grünes „Angekommen" an die Stelle des
>   ausgegrauten „Weiter"** (`--color-gruen`, dieselbe Farbe wie die
>   Angekommen-Fläche). Der lose Knopf unter dem Sheet ist gefallen — er stand
>   dort auf **jedem** Schritt, auch mitten im Bahnhof. „Zurück" und
>   „Weiter"/„Angekommen" sind ein Paar: gleiche Höhe, gleiche ovale Form.
> - **Karte und Streckenhinweise stehen im Aufklapper „Alle Schritte"**
>   (`Schrittsheet` nimmt dafür ein `zusatz?: ReactNode`). Sie wären im festen
>   Bildschirm kein Platz mehr, sollen aber nicht verschwinden — ein Hinweis
>   wie „Aufzug außer Betrieb" gehört nicht gelöscht. Der Aufklapper rollt in
>   sich (`max-height: 40dvh`), damit er die Spalte nicht doch wieder sprengt.
>
> **`scripts/abzug.tsx` zeichnet jetzt Kopf und Navileiste mit.** Bis heute
> zeichnete er `<Navigation>` allein. Seit die Seite ihre Höhe unter Kopf,
> Bild, Schritt-Box und Leiste aufteilt, beweist ein Abzug ohne die Nachbarn
> nichts mehr — die Sichtprüfung unten wäre sonst wertlos gewesen. Dazu die
> fehlende Zeichensatzangabe ergänzt; die Mappe zeigte „ZurÃ¼ck".
>
> **Zum ersten Mal seit dem 16.09. wieder im Browser angesehen** (Chrome-
> Erweiterung, vier Geräte aus echten Routendaten über
> `frontend/scripts/abzug.tsx`, Rahmen 360 × 740):
>
> | Geprüft | Ergebnis |
> |---|---|
> | Rollt die Seite? | `scrollHeight == clientHeight` in allen vier — nein |
> | Steht das Bild still? | Oberkante des aktiven Bandes **y = 178** bei Schritt 1, 5 und 9 und in Berlin |
> | Wird das Band abgeschnitten? | Überstand 1 px bzw. −33 px — der Fußtext ist in allen vier sichtbar |
> | Grüner Knopf | nur im letzten Schritt; davor „Weiter" |
> | Legende / Hinweiszeilen | nicht mehr im DOM |
>
> ```bash
> cd frontend && npm test && npm run lint    # 395 von 395, Lint sauber
> cd backend  && npm test && npm run lint    # 438 von 438, Lint sauber
> # Bildsimulation: 2082 Routen, 5630 Bänder, 0 Befunde
> cd frontend && npx tsx --tsconfig tsconfig.app.json scripts/simulation-bild.ts ../backend/osm-ablage/laeufe/lauf5-ablage.jsonl
> ```
>
> Sichtprüfungen aus `scripts/abzug.tsx` liegen in `frontend/.abzug/`
> (gitignored). Aufruf:
> `npx tsx --tsconfig tsconfig.app.json scripts/abzug.tsx <ziel.html> "<Titel|Untertitel|Bahnhof|an|ab|pos>=<route.json>" …`
>
> **Ausgeliefert am 19.09.2026.** Commit `f1475b7`, `feat/mvp` und `main`
> stehen gleichauf bei GitHub, Vercel liefert die Produktion unter
> <https://www.umstieg.online>. Gegen die Live-Seite geprüft, dass der neue
> Stilbaustein drin ist (`app-navigation`, `schema-fenster`,
> `knopf-angekommen`, keine `schema-legende`). **Fly.io wurde nicht neu
> ausgeliefert** — die Änderung ist rein im Frontend, das Backend ist
> unberührt.
>
> **Nächster Schritt: M9 und M10 am Gerät** (ToDo 3 und 30) — jetzt mit der
> zusätzlichen Frage, ob 180 px Bildhöhe in der Halle reichen (ToDo 37).

### Davor (15./16.09.2026, nachts)

> **„Anfang" heißt jetzt etwas (ToDo 31, entschieden und umgesetzt).** Der
> Anfang eines Bahnsteigs ist das **Nord- bzw. Westende** – für alle
> Bahnsteige einer Ebene an derselben Achse ausgerichtet (`core/richtung.ts`,
> angewandt in `baueGraph`). Die Knöpfe und die Standortmarken im Bild sagen
> es: „Nordende · Mitte · Südende" oder „Westende · Mitte · Ostende".
> Vergleichend gemeint – „N" heißt „das nördlichere der beiden Enden" – und
> damit an jedem Bahnsteig wahr, der nicht exakt West-Ost liegt.
>
> **Warum die Himmelsrichtung:** Sie ist die einzige Orientierung, die an
> **jedem** Bahnhof aus den vorhandenen Daten belegt ist. Kopf und
> Empfangsgebäude holt die Overpass-Abfrage nicht, und die Fahrtrichtung des
> Zuges ließe sich nur aus dem Laufweg schätzen – an Brücken und Kurven nennte
> sie das falsche Ende. Ohne gemessene Achse (Standardmodell) bleibt es bei
> „Anfang/Ende": Dort wäre eine Himmelsrichtung erfunden.
>
> **Wie willkürlich der alte Anfang war, zeigt der Vergleich von Lauf 4 und
> Lauf 5** (dieselbe Ablage, nur anderer Code): An **72 von 111 Bahnhöfen** lag
> er an verschiedenen Bahnsteigen an entgegengesetzten Enden. Umbenannt sind
> 323 von 672 unterscheidbaren Kombinationen aus Gleispaar und Variante, 349
> bleiben gleich.
>
> **Kein Weg hat sich geändert, nur sein Name.** Simulation 5 über die ganze
> Ablage – 2082 Routen an 111 Bahnhöfen – liefert dieselben Gehzeiten, dieselbe
> Ebenenfolge, denselben einen Befund (Düsseldorf 1 → 20, ToDo 27) und dieselben
> sechs Bahnhöfe mit Umwegen (ToDo 29); deren Meterangaben zählen jetzt ab dem
> neuen Anfang. Im Bild: **0 Befunde**, 0 sich überdeckende Symbolschilder.
> Einzige Abweichung: Augsburg 6 → 12 barrierefrei ab Anfang ist 1 m kürzer
> (267 → 266 m) – **ToDo 36**, Ursache nicht untersucht.
>
> **Neu: der Anfragetest** (`backend/scripts/anfragen-pruefung.ts`, ohne Netz
> und ohne Tresor). Er stellt **3446 Anfragen** an eine echte App – jedes
> Gleispaar von Berlin Hbf mit jeder Variante und jedem Standort, dazu kaputte
> und böswillige Eingaben, am Ende an einem echten Socket auch SSE und die
> Ratenbegrenzung. Er hat einen **500er** gefunden: `?q=Berlin&q=Hamburg`
> machte aus `q` eine Liste, und `q.trim()` warf. Dieselbe Falle stand bei
> `lat`/`lon`. Behoben an **einer** Stelle für alle Routen (`app.ts`): Ein
> mehrfach angegebener Parameter ist 400, und unbekannte Pfade antworten
> `{fehler: 'nicht-gefunden'}` statt in Fastifys Standardtext.
>
> ```bash
> cd backend && npm test && npm run lint     # 438 von 438, Lint sauber
> cd frontend && npm test && npm run lint    # 378 von 378, Lint sauber
> cd frontend && npm run build               # grün
> cd backend && npx tsx scripts/anfragen-pruefung.ts   # 3446 Anfragen, 0 Befunde
> ```
>
> **Nicht geprüft:** Der Blick im Browser – die Chrome-Erweiterung war nicht
> verbunden. Die neuen Knopfbeschriftungen sind maschinell belegt, aber noch
> von niemandem gesehen; das gehört zu **M10** (ToDo 30). Und
> `simulation-standort.ts` lief nicht neu (Netz und Tresor), deshalb trägt die
> Tabelle unter „Simulation: die Standortwahl über 62 Bahnhöfe" einen Vorbehalt.
>
> **Ausgeliefert am 16.09.2026** (ToDo 25, nach neun Tagen Rückstand).
> `feat/mvp` und `main` stehen gleichauf bei GitHub, Fly.io läuft mit **einer**
> Maschine in `fra` (1/1 gesund), Vercel liefert den neuen Build
> (`assets/index-WkyI6rX9.js`) unter <https://umstieg.vercel.app>. Die
> `vercel.json` ist unverändert geblieben – Falle 2 hat diesmal nicht
> zugeschlagen.
>
> Gegen die Produktion geprüft: `/api/health`, die CORS-Freigabe für
> `umstieg.vercel.app`, der reparierte Doppelparameter (400 statt 500), der
> unbekannte Pfad (`{"fehler":"nicht-gefunden"}`) und vier echte Routen. Die
> Entscheidung ist dort live zu sehen – **München Gleis 5 → 82: ab dem
> Westende 944 s, ab dem Ostende 625 s**, Bahnsteigenden `W`/`O`.
>
> Damit fiel auch **ToDo 35**: Braunschweig barrierefrei misst in der
> Produktion 192 s ohne eine Treppe – dieselbe Zahl wie offline.
>
> **Nächster Schritt: M9 und M10 am Gerät** (ToDo 3 und 30) – der Nachtest der
> reparierten Routenwahl und der erste Blick auf die neuen Knopfbeschriftungen
> im Bahnhof.

### Davor (14.09.2026, abends)

> **Zuletzt (14.09., abends):** Drei Änderungen am Ebenenschema, alle auf
> `feat/mvp` committet, **nicht gepusht, nicht deployt**:
>
> 1. **Das Band mit Ankunfts- oder Abfahrtsgleis zeigt keinen Weg mehr** –
>    nur den Standort (Anfang/Mitte/Ende) auf dem Balken, den Ebenenwechsel
>    als rote Scheibe mit Symbol am genutzten Zugang und das Ziel. Den Weg
>    dazwischen sagt der Text. Übergangsebenen behalten die Linie.
> 2. **Anlagen als Symbole** statt Striche und Kästen: Rolltreppe (zwei
>    Waagerechte, 45°-Diagonale), Treppe, Aufzug – im Balken, im Grundriss,
>    in der Legende und neben den Schritten. Treppe und Rolltreppe am selben
>    Ort: nur die Rolltreppe; ein Aufzug steht daneben. Quelle:
>    `components/AnlagenSymbol.tsx`, Regeln in `schema/symbole.ts`.
> 3. **Geglättete Schritte** (`core/textgen.ts`, `GLAETTUNG_M = 6`):
>    Versätze der Fußwege unter 6 m quer sind keine eigenen Schritte mehr.
>    München 5 → 82: 11 statt 23 Schritte.
>
> **Der Zickzack im München-Beispiel war kein Routingfehler.** Keine
> erzwungene Alternative ist schneller als die gewählte Route (625 s). Er kam
> aus der Bildabbildung – die Querlage springt, wo die Bezugsbahnsteige
> wechseln, und längs zeichnet das Bild 0,45 px/m, quer bis 1,5 px/m – und
> aus der L-Treppe der kartierten Fußwege am Holzkirchner Flügelbahnhof, die
> der Text Stufe für Stufe ansagte.
>
> **Simulation, vierter Durchgang**, über die ganze Ablage
> (`LISTE=ablage npx tsx scripts/simulation-lauf3.ts <aus.jsonl>`, danach
> `frontend/scripts/simulation-bild.ts <aus.jsonl>`): 2082 Routen an 111
> Bahnhöfen – 19 groß, 60 mittel, 32 klein.
>
> | Prüfung | Ergebnis |
> |---|---|
> | Routing: Schema, Markierung, Schritte, Alternativen | 1 Befund – Düsseldorf Hbf 1 → 20: Wegzerlegung 236 statt 231 m |
> | Bild | 0 Befunde (erster Symbolsatz: 344 Routen an 67 Bahnhöfen) |
> | Symbolschilder im Grundriss, die sich decken | 0 (erster Symbolsatz: 846 Paare) |
> | Scheiben auf dem Balken / abseits | 2708 / 504 – abseits heißt ≥ 20 px oder jenseits der Bahnsteigenden |
> | Schritte je Route (951 Routen, 115 Bahnhöfe) | Median 11 → 6, „wenige Meter" 5468 → 813; keine Route länger, keine Anlage verloren |
> | Bekannte Werte aus diesem README | 22 von 23 exakt oder schneller; Braunschweig barrierefrei 192 s offline gegen 191 s aus der Produktion (mit FaSta, andere Messung) |
>
> **Zwei Funde der Simulation, beide vor dem Commit behoben:** Das erste
> Setzverfahren schob Symbole nur hin und her – 191 ragten über ihren Balken,
> 304 standen auf einem Punkt. Jetzt zerfällt der Balken an den Punkten in
> freie Abschnitte, und zu dichte Orte werden einer. Und 126 Scheiben hingen
> halb auf der Balkenkante: Treppen, die auf breiten Inselbahnsteigen neben
> der Achse ansetzen. Sie rasten jetzt am genutzten Zugang ein.
>
> **Offen:** 195 Routen an 19 Bahnhöfen nehmen Treppen oder Rampen ohne
> Ebenenwechsel („stumm"); 6 Bahnhöfe mit Umwegen zu einem Zugang (Bielefeld,
> Bonn, Gütersloh, Schwerin, Wittenberge, Berlin-Spandau); Düsseldorf 1 → 20
> (s. o.); die U-Form eines Kopfbahnhofs steht nur noch im Text (154 Routen
> an 18 Bahnhöfen); was „Anfang" im Bahnhof bedeutet, sagen die Knöpfe nicht.
> `simulation-schema.ts` und `simulation-standort.ts` lesen beim Start den
> Schlüssel-Tresor – nur nach Rückfrage starten (siehe `D:\Claude-code\CLAUDE.md`).
> Alle offenen Punkte stehen als **ToDos 25–35** unter „Offene ToDos".
>
> ```bash
> cd backend && npm test && npm run lint     # 418 von 418, Lint sauber
> cd frontend && npm test && npm run lint    # 371 von 371, Lint sauber
> ```
>
> **OSM-Ablage:** `backend/osm-ablage/osm-cache/` (gitignored); im Code kennt
> nur `ABLAGE` in `scripts/osm-ablage-fuellen.ts` den Pfad. Routen für Abzüge
> und Planmappe: `backend/osm-ablage/routen/`, Laufprotokolle:
> `backend/osm-ablage/laeufe/`. Planmappe: `frontend/scripts/design-mappe.tsx`.
>
> **Commits des Abends**, alle auf `feat/mvp`: `4013f48` (Ablage ins Projekt),
> `39352d6` (Schritttexte glätten), `2682a37` (Anlagensymbole, Gleisbänder ohne
> Linie), `d915ed0` (Simulation prüft die Schritte), `cd8d261` und dieser Stand
> (README, Planmappe).
>
> **Nicht gepusht, nicht deployt:** `feat/mvp` steht 23 Commits vor
> `origin/feat/mvp` und vor `main`; die Produktion zeigt den Stand vom 07.09.
> Nächster Schritt: pushen, `main` per Fast-Forward nachziehen, Fly.io
> (`--ha=false`) und Vercel deployen – danach M9 am Gerät.
>
> **Planmappe, neuer Stand** (privates Artefakt):
> <https://claude.ai/code/artifact/656f33a6-7c0a-43bc-bb3d-77450100e7fc>. Die
> ältere Planmappe und die Leinwand in `design/schema/` zeigen noch den Stand vor
> den Symbolen.

### Davor (14.09.2026, nachmittags)

> **Zuletzt (14.09.):** Das Frontend zeichnet das neue Ebenenschema (D4) –
> ein Band je Ebenenbesuch, Bahnsteige längs maßstäblich samt Versatz, der
> Weg als Linienzug auch auf Gleisebenen (die U-Form eines Kopfbahnhofs ist
> jetzt sichtbar), jede Treppe an beiden Enden markiert, Standortleiste
> „Anfang · Mitte · Ende" mit dem Anfang immer links. Dateien:
> `frontend/src/schema/{bandmodell,bandbild,masse}.ts`,
> `components/Ebenenschema.tsx`, Tests gegen echte Routen in
> `schema/testdaten/`. **Committet auf `feat/mvp`, nicht gepusht, nicht
> deployt.**
>
> **Der wichtigste Fund war ein Graphfehler:** An jedem Bahnsteig mit zwei
> Gleisen wurde nur die Kette des zuletzt verarbeiteten Gleises verdichtet
> (`verdichteBahnsteigketten`, Achsen nach Bahnsteig statt nach Gleis
> geschlüsselt). Leipzig 6 → 16 ab Mitte lief deshalb 354 s über den Kopf;
> richtig sind **323 s durch die Unterführung**. Gemessen über 99 Bahnhöfe:
> 245 von 1044 Routen werden schneller, keine langsamer, 13 nehmen einen
> anderen Weg. Die Tabelle „Der Standort am Ankunftsgleis entscheidet" unten
> (13.09.) ist damit für die Mitte überholt.
>
> **Simulation, dritter Durchgang** (`backend/scripts/simulation-lauf3.ts` +
> `frontend/scripts/simulation-bild.ts`, Ablage über
> `osm-ablage-fuellen.ts`): 399 Routen an 23 Bahnhöfen, null Befunde in
> Schema, Alternativen und Bild. Neu geprüft: Bahnsteigwege (Umweg zu einem
> Zugang – hätte den Kettenfehler an 36 Bahnhöfen gemeldet) und
> Alternativen (keine erzwungene Route über irgendeinen Ebenenwechsel ist
> schneller als die gewählte).
>
> **Offen:** 111 Routen nehmen Treppen/Rampen ohne Ebenenwechsel („stumm",
> im Bild unsichtbar); 6 Bahnhöfe mit Umwegen anderer Ursache (Berlin-Spandau
> Gleis 3: Treppe unerreichbar); Bild an Nürnberg und Schwerin; 54 Bahnhöfe
> von Lauf 3 fehlen in der Ablage (Overpass); was „Anfang" im Bahnhof
> bedeutet, sagen die Knöpfe nicht. Planmappe: `frontend/scripts/design-mappe.tsx`.

### Davor (13.09.2026, abends)

> **Zuletzt (13.09., abends):** Die **Standortwahl am Ankunftsgleis** steht
> jetzt auch in der App – drei Knöpfe auf dem Dashboard, je mit der Gehzeit
> von dort. Zwei Simulationen liefen dazu: das Schema über 60 Metropol- und
> Großbahnhöfe (35 ausgewertet, **null Befunde**) und die Standortwahl über
> 62 Bahnhöfe (**null Befunde**, 62 von 62 kennen alle drei Startpunkte).
>
> **Die Simulation hat drei Fehler in der Gleisliste aufgedeckt**, und der
> schwerste betrifft die Metropolknoten: München Hbf führte vier „Gleise"
> 1–4, die Straßenbahnhaltestellen auf dem Vorplatz sind, und Leipzig Hbf
> kannte sein Gleis 19 nicht. Siehe „Die Gleisliste enthielt
> Straßenbahnsteige".
>
> **Der Standort entscheidet messbar:** an 62 von 62 Bahnhöfen die Gehzeit,
> an 10 den Weg selbst – und die Richtung dreht sich (München: Anfang
> gewinnt, Hamburg-Altona: Ende, Dresden: Mitte).
>
> **Der nächste Schritt ist unverändert die Umsetzung im Frontend** –
> `Ebenenschema.tsx` leitet sein Bild weiter aus den Schritttexten ab und
> kennt weder Bahnsteige noch Zugänge noch Netz. Der Endpunkt liefert alles,
> was sie braucht.
>
> **Nicht deployt:** `main` steht 11 Commits zurück; alles seit dem 08.09.
> liegt nur auf `feat/mvp`.

### Davor: Bahnhofsschema mit Geometrie (13.09.2026, vormittags)

> Das Bahnhofsschema liefert echte Geometrie je Ebene – siehe „Schematische
> Navigation: Geometrie statt Schrittliste". Zwei Fehler kamen dabei heraus,
> die nur die Geometrie sichtbar machen konnte; Berlin 14 → 6 braucht seitdem
> 305 s statt 575 s.

### Davor: Mobilabnahme (Stand 07.09.2026)

> **Am 07.09. lief die Mobilabnahme (P6 / ToDo 3) – erstmals am echten
> Gerät.** Zwei Ergebnisse:
>
> 1. **Die Bahnhofserkennung trägt.** Bahnhöfe werden am Gerät sehr gut
>    erkannt. Damit steht `ERKENNUNG_RADIUS_M = 1000` erstmals unter echter
>    Beobachtung statt nur als Schätzung – ToDo 3a bleibt formal offen, weil
>    kein Grenzwert gemessen wurde, aber der Verdacht von Eberswalde
>    (1094 m) hat sich im Alltag nicht bestätigt.
> 2. **Die Routenwahl war tot.** Keine der drei Zeilen liess sich antippen.
>    Vier Fehler übereinander, alle behoben – Einzelheiten unter
>    „Die Routenwahl war auf dem Handy nicht bedienbar".
>
> **Der Fund dahinter wiegt schwerer als der Fehler:** Die Naht zwischen
> Knopf und Wirkung war an **keiner** Stelle getestet. `Dashboard.test.tsx`
> mockte `onVariante` weg, `varianten.test.ts` prüfte den Lader – dazwischen
> lag ungeprüfter Code, und genau dort sassen alle vier Fehler.
>
> **Die Mobilabnahme ist danach durchgelaufen: M1–M8 sind beantwortet.**
> M1, M3, M6, M7 sauber, M4 ohne bestimmbaren Grenzwert. Zwei Funde:
> **M5** – die Ankunftserkennung ist in der Halle strukturell unerreichbar
> (ToDo 23) – und **M8**: der Reise-Parser ist zu formatnah, nicht nur die
> VMV fällt durch (ToDo 20). `ERKENNUNG_MAX_M` ist damit vom Tisch, es war
> nie geraten; **offen bleibt allein `NOTBEHELF_TTL_MS`.**
>
> **Danach gemeldet und behoben: Braunschweig Hbf fand keine barrierefreie
> Route** – nicht weil Aufzüge fehlten (vier kartiert, laut FaSta alle
> ACTIVE), sondern weil der Aufzug von Bahnsteig 1/2 in OSM an keinem
> Wegenetz hängt und die Bahnsteiganbindung je Punkt nur **einen** Wegknoten
> wählt. Siehe „Braunschweig fand keine barrierefreie Route". Die Regel dagegen
> ist bewusst schmal (≤ 10 m, nur bei eindeutigem Kandidaten) und gegen die
> Produktion geprüft: aus der Absage werden 191 s ohne eine Treppe.
>
> **Dabei ein Eigentor, das festgehalten gehört:** Ein Prüfskript las
> `anlage.description` statt `beschreibung` und liess FaStas Beschreibungen
> leer aussehen. Auf dieser Falschmessung stand kurzzeitig die Behauptung,
> §5 trage in Braunschweig nichts bei. Sie ist zurückgenommen – die
> Beschreibungen sind vollständig da, und der verwaiste Aufzug nennt seinen
> Bahnsteig selbst (`"zu Gleis 1/2"`). **Die ausgelieferte 10-m-Regel ist
> damit schwächer als nötig**, siehe ToDo 24.
>
> **Nächster Schritt: M9** – der Nachtest der reparierten Routenwahl am
> Gerät. Danach ToDo 20.
>
> **Nicht vergessen: ToDo 20, das VMV-Format.** Unverändert offen, die drei
> Blocker stehen isoliert in der ToDo-Tabelle.

<details>
<summary>Vorheriger Stand (06.09.2026)</summary>


> **Am 06.09. sind der Reise-Import für DB Navigator und VBB durchgezogen und
> ISR verworfen worden.** Alles ausgeliefert, `main` und `feat/mvp` stehen
> gleich, Fly.io und Vercel sind auf dem Stand. Drei Fixes:
>
> 1. **Bahnhofsnamen mit Klammerzusatz** (`7d9d352`) – der gemeldete Fehler.
>    Zwei Fehler übereinander: Der Parser fraß die schließende Klammer
>    („S+U Gesundbrunnen Bhf (Berlin" – unbalanciert), und die Nachsilbenregel
>    war auf `$` verankert und lief am Klammerzusatz vorbei. Ohne beides keine
>    Navigation.
> 2. **Störwörter an beiden Enden** (`99570b1`) – der generische Ersatz für
>    zwei einseitig gebundene Listen, deren Asymmetrie laufend neue
>    Einzelfälle erzeugte. Sechs belegte Lücken zu, gegen die Produktion
>    geprüft.
> 3. **ISR Data Service verworfen** (`440392b`) – zu teuer und ohnehin nur für
>    Zugangsberechtigte. Dabei OpenStation gefunden: offen, ohne Schlüssel,
>    65.007 Wegekanten – löst §4.3 aber **nicht** (nur 10 % der Bahnsteige
>    tragen Koordinaten). ToDo 17/18.
>
> **Nächster Schritt: ToDo 20, das VMV-Format.** Der Parser erkennt es gar
> nicht; die drei Blocker sind isoliert und stehen dort. Der Zuschnitt ist
> entschieden – **Bus-Etappen bleiben draußen, der Anspruch endet am letzten
> Bahnhalt** –, damit schrumpft die Aufgabe auf diese drei Punkte.
>
> **Unverändert offen und weiterhin der einzige Blocker für Code:** die
> Mobilabnahme am Gerät (P6 / ToDo 3). Sie hält drei geratene Zahlen fest –
> `ERKENNUNG_RADIUS_M`, `ERKENNUNG_MAX_M`, `NOTBEHELF_TTL_MS`.

</details>

<details>
<summary>Vorheriger Stand (05.09.2026)</summary>


> **Am 04./05.09. sind fünf Vorhaben gefallen** – die enge Fassung von
> Konzeptlücke §4.3, die Degradationstabelle (MVP-Task 17), die getrennten
> Blöcke §9, die Routenvariante „Mit Stopp" und zuletzt **Konzeptlücke §5
> (FaSta-Koordinaten, ToDo 7b)**. Die ersten vier sind ausgeliefert; **§5
> liegt auf `feat/mvp` und ist noch nicht deployt** – `main` steht 9 Commits
> zurück.
>
> **Drei Funde dabei wiegen schwerer als die Vorhaben selbst** und stehen
> weiter unten ausführlich: Die **Wagenreihung ist tot** (der Endpunkt
> existiert nicht mehr), der **volle §4.3 ist auf Datenmangel blockiert**
> (die DB liefert keine Bahnsteigkoordinaten), und die Degradationstests
> haben zwei Lücken aufgedeckt, von denen eine ein echter Fehler war.
>
> **Nächster Schritt: die Mobilabnahme am echten Gerät** (P1 Task 12 / ToDo 3).
> Das ist der letzte offene Punkt der Sichtprüfung und braucht Handarbeit an
> einem Handy – Berechtigungsdialog, GPS in der Bahnhofshalle,
> Ankunftserkennung am Gleis, Bedienbarkeit mit Gepäck. **Sie ist seit dem
> 05.09. der einzige Punkt, der Code blockiert:** Zwei geratene Schwellenwerte
> (ToDo 15) und der Erkennungsradius (ToDo 3a) warten auf ihre Messung.
>
> **Danach offen, in dieser Reihenfolge:** §5 ausliefern und im echten Bahnhof
> gegenlesen (siehe „Was an §5 noch nicht geprüft ist“), das Oberlimit auf
> Upstream-Aufrufe (P2 der Härtung), die Entscheidung zur Wagenposition.

```bash
cd backend && npm test        # muss 347 von 347 grün sein
cd backend && npm run lint    # oxlint + tsc --noEmit, muss sauber sein
cd frontend && npm test       # muss 268 von 268 grün sein
cd frontend && npm run lint   # oxlint + tsc --noEmit, muss sauber sein
cd frontend && npm run build  # muss grün sein
```

**Die App läuft in Produktion und rechnet echte Routen.** Deployment, DB-Zugang
und die Verbindung Frontend↔Backend sind abgeschlossen und Ende-zu-Ende
verifiziert – Einzelheiten im Abschnitt „Deployment-Stand". Der MVP steht bis
einschließlich Task 16.

**P1 (Standort & Live-Navigation) ist codeseitig fertig.** Die App fragt den
Standort ab, belegt den Bahnhof vor, zeigt den Positionspunkt auf der Karte,
schlägt die Ankunft vor und kennt den Zustand „Zug ist abgefahren". Tasks 1–11
sind umgesetzt und maschinell geprüft.

**Am 31.08.2026 sind die drei grössten Backend-Lücken geschlossen** (siehe
„Verkehrsstellengruppen" weiter unten): Ein Bahnhof wird jetzt über **alle**
seine Verkehrsstellen ausgewertet, ein degradierter Graph blockiert den
Bahnhof nicht mehr einen ganzen Tag, und FaSta wird endlich richtig
adressiert. Alles gegen die echte DB-API verifiziert.

**Am 01.09.2026 sind zwei ToDos aus der Sofort-Liste geschlossen:** Der
Backend-Fix gegen doppelte Graphbauten (3c) und die vier Lint-Warnungen im
Frontend (4). Letzteres brachte nebenbei die ersten Tests für `Zugauswahl`
und `Eingabe` – beide waren bis dahin ungetestet.

**Am 03.09.2026 ist die Meldungsseite gebaut** – der Bildschirm `stoerung`
geht darin auf, die Leiste trägt einen Zähler, und der Verlauf einer Reise
bleibt erhalten. Gegen eingespeiste Live-Ereignisse im Browser gesehen.

**Am 05.09.2026 ist Konzeptlücke §5 geschlossen** (ToDo 7b): Bahnsteige im
Synthesemodell holen ihre Lage aus FaSta, wo FaSta sie benennt, und der Weg
zur Querung wird gerechnet statt geraten. Gemessen an Hannover Hbf: aus 12
geratenen Bahnsteigen werden 6 echte, aus 0 barrierefreien Kanten werden 14.
Der Weg dorthin verwarf den zuerst gewählten Ansatz – siehe „Was FaSta
wirklich liefert“. **Noch nicht deployt.**

**Am 04./05.09.2026 sind vier weitere Vorhaben gefallen**, alle ausgeliefert:
Konzeptlücke §4.3 in enger Fassung (die DB-Gleisliste trennt jetzt, was OSM
zusammenlegt – gegen die echte API gemessen), die Degradationstabelle als
Test (MVP-Task 17, Schritt 1), Konzeptlücke §9 (getrennte Blöcke Ankunft und
Abfahrt) und die Routenvariante „Mit Stopp: WC & Kiosk". Dazu vom Subagenten:
das doppelte Bahnhofsnamen-Vokabular aufgelöst, der CSP-Header ergänzt und
`disableRequestLogging` auf `logController` umgestellt. Einzelheiten in den
Abschnitten weiter unten.

**Was fehlt, ist keine Zeile Code, sondern der Blick darauf:** Die
Sichtprüfung am Desktop ist erfolgt (Abschnitte „Abnahme im Browser" und
„Meldungsseite"). Offen bleibt, was nur ein Handy zeigt – Berechtigungsdialog,
GPS-Genauigkeit in der Bahnhofshalle, Ankunftserkennung am Gleis. Nächster
Schritt ist deshalb P1 Task 12 (Mobilabnahme, fünf Punkte im Plan). Das
braucht Handarbeit an einem echten Gerät.

</details>

## Schematische Navigation: Geometrie statt Schrittliste (13.09.2026)

D4 aus dem Design-Abgleich („Navigation: Schema statt Landkarte") ist
angegangen – und dabei hat sich die Aufgabe als größer herausgestellt, als
sie dort stand.

### Der Ausgangsbefund

`docs/spike-schema-geometrie-ergebnis.md` hält die Sondierung fest. Kurz:

- **OSM trägt die Geometrie.** Bahnsteigachsen, Querreihenfolge, Aufzüge,
  Rolltreppen, Treppen, Ebenen – alles belegt. Die Querreihenfolge ist echt
  ableitbar (Berlins Gleis 22 liegt neben 7/8, nicht hinter 1/2).
- **RIS::Stations liefert keine Koordinaten** – bei keinem der 20 Berliner
  Gleise. Konzept §4.2 verspricht sie.
- **Abschnitte A–G sind nicht verortet.** OSM kennt für Berlin keinen
  einzigen; FaSta nennt sie an 4 von 8 Großbahnhöfen und dort nur an
  einzelnen Bahnsteigen.
- **Zur Wagenreihung: kein neuer Fund.** Dass `ist-wr.noncd.db.de` nicht mehr
  existiert, steht seit dem 04.09. unter „Die Wagenreihung ist tot". Der
  Spike hat es nachgemessen, nicht entdeckt.

**Eine Aussage im Anforderungsdokument war zunächst falsch:** „Der Wegverlauf
innerhalb einer Ebene ist nicht belegt". Für Stufe 1 stimmt das nicht – jeder
Pfadknoten trägt Koordinaten. Korrigiert.

### Was gebaut wurde

`GET /api/route` liefert neu ein Feld `schema` (`core/schema.ts`), **ohne
einen einzigen zusätzlichen externen Aufruf** – die Daten lagen im Graphen und
wurden nur nie ausgeliefert:

- **Bezugsrahmen in Metern.** Ursprung ist der Startpunkt der Route, die
  x-Achse die Gleisrichtung der Ankunftsebene.
- **Ebenen als Ablauffolge, nicht nach Höhe.** Ein Eintrag ist EIN BESUCH.
  Wer hinunter in die Unterführung geht und wieder herauf, hat drei Einträge:
  Ebene 1, Ebene 0, Ebene 1.
- **Bahnsteige** mit Länge, Querlage und Zugängen; ein Zugang bündelt die
  Anlagen an einer Stelle („bei 242 m, vier Rolltreppen"). Berlins Gleis 5/6
  trägt 27 Anlagen an acht Stellen.
- **Begehbares Netz** der Übergangsebenen (80 m um den Weg, zu Gängen und
  Ringen verschmolzen) – ohne es hängt die Route im Leeren.
- **Anlagen mit Grundriss:** Rolltreppe und Treppe als Strecke, Aufzug als
  Punkt. Das ist keine Gestaltung, sondern ihre Form.
- **Linienzüge geglättet** (Douglas-Peucker, 1,5 m) – kleiner als jede Ecke,
  an der jemand abbiegt, größer als das Messrauschen.

Antwortgröße median 5,4 kB, größter gemessener Wert 19,7 kB (Dortmund).

### Zwei Fehler, die erst die Geometrie sichtbar gemacht hat

**1. Ein Bahnsteig war eine Kette aus drei Knoten.** `anfang`, `mitte`,
`ende`, dazwischen 215-m-Kanten, und der Umriss hing nicht am Fußwegnetz. Wer
den Bahnsteig zwischen zwei dieser Punkte betrat – also jeder, der eine
Rolltreppe in der Mitte nimmt – musste erst zu einem der drei laufen. Berlin
14 → 6: **342 m statt 92**. Behoben mit `verdichteBahnsteigketten`; ein Knoten
hängt an höchstens einem Bahnsteig, sonst entstünde ein ebener Weg über die
Gleise.

Wirkung: **340 m → 265 m, Gehzeit 575 s → 305 s.**

**2. Der Weg je Ebene war eine Sammelliste.** Zwei Besuche derselben Ebene
landeten hintereinander darin, und die Verbindung zwischen ihnen war eine
erfundene Strecke – im Bild als Weg zu sehen. In Hannover 279 statt 185 m.
Gefunden von der Simulation, in 8 von 16 geprüften Bahnhöfen. **Berlin 14 → 6
ist zufällig monoton; an diesem einen Prüffall wäre es nie aufgefallen.**

### Simulation über 60 Bahnhöfe

`backend/scripts/simulation-schema.ts` fährt die volle Kette Overpass → Graph
→ Route → Schema, stets vom ersten zum letzten Gleis, und prüft jede
Behauptung des Schemas. **Erster Lauf: 41 ausgewertet, nach der Korrektur
null Befunde.**

| | |
|---|---|
| Ebenen je Bahnhof | 1: 8 · 2: 22 · 3: 6 · 4: 11 |
| Kreuzende Ebenen > 20° | 4 – Dortmund 88°, Düsseldorf 87°, Osnabrück 83°, Kassel-Wf 67° |
| Schemabau | median 2 ms, max 24 ms |

**Der Zweiebenenfall ist die Mehrheit, nicht Berlins fünf.** Und acht
Bahnhöfe haben genau eine Ebene – Kopfbahnhöfe wie Karlsruhe und Kiel.

### Der Standort am Ankunftsgleis entscheidet den Weg

Leipzig Hbf, Gleis 6 → 16, beide auf derselben Ebene. Zwei Wege konkurrieren:
die U-Form um den Kopf des Bahnhofs und die Unterführung am anderen Ende.

```
Anfang   303 m · 343 s · durch die Unterführung (Ebenen 1 → 0 → 1)
Mitte    354 m · 354 s · U-Form, eine Ebene
Ende     251 m · 251 s · U-Form, eine Ebene
```

Das Routing findet beide Wege von selbst – die Bahnsteigverdichtung hat das
erst möglich gemacht. Gebraucht wird nur die **Eingabe, wo jemand steht**.
`/api/route` nimmt sie als `abschnitt=anfang|mitte|ende` bereits entgegen;
`findeStartknoten` wertet sie aus. Solange die Wagenreihung fehlt, ist das die
einzige Eingabe, die den Weg kennt.

Das Fixture `test/fixtures/synthetisch/kopfbahnhof.json` hält den Fall klein
und prüfbar fest.

### Entwurf

`design/schema/` – fünf Artboards gegen echte Daten, veröffentlicht als
Leinwand. Der Platz folgt dem Reisenden: die aktive Ebene bekommt 323 px (bei
zwei Ebenen 461), die übrigen schrumpfen auf eine Zeile.

| Artboard | Fall |
|---|---|
| Main | Berlin Hbf 14 → 6 · fünf Ebenen, 430-m-Bahnsteige, 81° Kreuzung |
| Kopfbahnhof | Leipzig 6 → 16 · Standortwahl entscheidet den Weg |
| KleinerBahnhof | Braunschweig 1 → 6 · hinunter und wieder herauf |
| Standardmodell | Stufe 3 · ohne Maßstab, „Länge unbekannt" |
| Gekreuzt | Grundriss statt Bänder · die 81° sichtbar |

Anforderungen und Datenvertrag:
`docs/2026-09-13-schema-navigation-anforderungen.md`, echter
Beispieldatensatz: `docs/beispiel-schema-berlin-14-6.json`.

### Offen am Design

Nach Gewicht:

1. ~~**Das Frontend zeichnet noch das alte Bild.**~~ ✅ **umgesetzt am
   14.09.2026** – die Bänder kommen aus der echten Geometrie; seit dem Abend
   ohne Linie auf den Gleisbändern und mit Anlagensymbolen (siehe „Hier
   weitermachen").
2. ~~**Standortwahl als Bedienelement.**~~ ✅ **gebaut am 13.09.2026** – drei
   Knöpfe auf dem **Dashboard**, über der Routenwahl. Die Frage „Eingabemaske
   oder Navigationsseite" ist damit zugunsten des Dashboards entschieden: Erst
   dort ist sichtbar, was die Wahl am Weg ändert, und die Eingabemaske ist
   nach der Mobilabnahme ohnehin lang genug. Siehe „Die Standortwahl am
   Ankunftsgleis".
3. **Parallel oder gedreht bei kreuzenden Ebenen.** Betrifft rund jeden
   zehnten Umstieg. Artboard „Gekreuzt" zeigt die Gegenposition; entschieden
   ist nichts.
4. **Abschnitt A–G: Platz reserviert, Quelle fehlt.** Die gleichmäßige
   Einteilung ist nur in der Bahnsteigmitte belegt (13 m Fehler bei 61 m
   Abschnittsbreite), die Richtung gar nicht.
5. ~~**Der Längsversatz der Bahnsteige zueinander fehlt im Vertrag.**~~ ✅
   **erledigt mit D4 (14.09.2026)** – `von` und `bis` liegen im Bezugsrahmen,
   die Balken stehen längs maßstäblich samt Versatz.
6. ~~**Der Rot-Konflikt ist ungelöst.**~~ ✅ **gelöst mit `682a43e` (21.09.2026):** Rot ist Sekundärfarbe, der Alarm ist Rot **und** Gelb – zweigeteilte Lampe, gestreifter Saum (`design/DESIGN.md`). Ursprünglich: `#ec3013` ist Route, Aktion und Ampelrot
   zugleich. Die Artboards weichen aus, indem sie grüne und gelbe Ampeln
   zeigen.
7. ~~**Wie Vorbehalte sichtbar werden**~~ ✅ **seit dem 11.10.2026 im
   Aufklapper „Alle Schritte"** (ToDo 38). Davor: seit dem
   19.09.2026 **gar nicht mehr**. Die Fußzeile unter dem Bild ist mit der
   Legende gefallen, weil der feste Bildschirm den Platz nicht mehr hergibt.
   Die Frage ist damit offen wie zuvor, nur ohne Zwischenlösung: ToDo 38.
8. **„Anzeige" als Orientierungspunkt ist gestrichen.** 25 von 26
   OSM-Treffern auf `information=board` sind Fremdtafeln („Wildbienen").
   Ersatz offen.

### Offen am Rande

- ~~**Die Gleisliste des Graphen enthält Nicht-Gleise**~~ – **behoben am
  13.09.2026**, und sie war nicht harmlos: siehe „Die Gleisliste enthielt
  Straßenbahnsteige". Was **offen bleibt**, ist der Rest, den nur die
  DB-Gleisliste entscheiden kann: Kaiserslautern führt ein Gleis „120" aus
  `ref="1;120"` (Ebene 1, ohne Tram- oder Bus-Merkmal), und Hof Hbf ein
  Gleis „10". Beide Bahnhöfe fallen deshalb in der Simulation mit „keine
  Route" aus – Kaiserslautern (EVA 8000189) auch in Lauf 9 noch mit 12 von 12
  Routen ohne Weg; `baueGraph` kennt die DB-Gleisliste seit `32292fb`, nutzt
  sie aber nur zum Zuordnen über IFOPT, nicht als Filter. `/api/route` holt die DB-Gleisliste ohnehin (als Trenner in
  `istGleicherBahnsteig`) – sie auch als **Filter** zu benutzen, verbietet
  sich nach bisheriger Regel („aus einer lückenhaften Liste darf nichts
  geschlossen werden"), wäre aber zu messen wert.
- ~~**Vier Bahnhöfe der Stichprobe haben in OSM keinen einzigen Bahnsteig mit
  Gleisnummer**~~ – **großteils erledigt mit `32292fb` (02.10.2026):** Die
  Nummern standen in OSM, nur in Schreibweisen, die nicht gelesen wurden
  (`local_ref`, `railway:track_ref`, `platform_edge`). Singen, Zwickau und
  Iserlohn rechnen in Lauf 9 echte Routen (Stufe 1), Mannheim laut Abgleich
  vom 02.10. ebenso. Husum ist in der Ablage nicht enthalten und ungeprüft.
- **Drei Bahnhöfe der Stichprobe tragen keinen einzigen Zugang** –
  Hamburg-Altona, Chemnitz Hbf, Jena Paradies. Ungeprüft, ob das die Daten
  sind oder die Ableitung.
- **Das Berlin-Fixture ist älter als die POI-Zeilen der Overpass-Abfrage**
  (Commit `fcc6e53` gegen `2b46a48`). Tests der `mit-stopp`-Variante prüfen
  damit einen Bahnhof ohne Zwischenziele.

## Die Standortwahl am Ankunftsgleis (13.09.2026, abends)

Der Endpunkt nahm `abschnitt` seit dem Vormittag entgegen, die App hatte kein
Bedienelement dafür. Die Wahl, die den Weg entscheidet, war nicht treffbar.

### Was gebaut wurde

Drei Knöpfe auf dem Dashboard, **über** der Routenwahl: Anfang, Mitte, Ende,
je mit der Gehzeit, die von dort gilt. Nebeneinander statt untereinander wie
die Routenwahl – die Wahl ist räumlich, und die Reihenfolge im Markup ist die
Reihenfolge am Bahnsteig.

Beide Knopfreihen lesen aus **einem** Gehzeit-Speicher, geschlüsselt nach
Variante **und** Standort. Zwei getrennte Listen hätten nach jedem Wechsel die
jeweils andere stillschweigend veralten lassen: Minuten vom alten Standort an
den neuen Knöpfen. Was einmal geholt ist, bleibt richtig und wird nicht
zweimal geholt.

### Die Naht zwischen Knopf und Wirkung – endlich geprüft

`frontend/src/App.test.tsx` ist neu und die erste Datei, die das Dazwischen
prüft: echter `App`, echte Verdrahtung, gemockt ist nur die Netzgrenze. Genau
dort saßen am 07.09. alle vier Fehler der toten Routenwahl – `Dashboard.test.tsx`
mockte `onVariante` weg, `varianten.test.ts` prüfte den Lader, und dazwischen
lag ungeprüfter Code.

Drei Funde, alle von den eigenen Tests:

1. **Ein laufender Standortwechsel sperrte die Routenwahl nicht mit.** Zwei
   Anfragen für dieselbe Route hätten sich stapeln können.
2. **Der Gleiswechsel-Vorschlag rechnete ohne `abschnitt`** und fiel damit
   still auf die Bahnsteigmitte zurück. Am Kopfbahnhof hätte der Vorschlag
   einen anderen Weg gezeigt als den auf dem Schirm, ohne dass irgendetwas
   das sagt.
3. **Nach dem Übernehmen blieb der Gehzeit-Speicher des alten Gleises stehen.**

## Simulation: das Schema über 60 Metropol- und Großbahnhöfe (13.09.2026)

Zweiter Durchgang, bewusst andere Bahnhöfe als im ersten – die drei
Metropolknoten als Pflicht. **35 ausgewertet, null Befunde.**

| | |
|---|---|
| Ebenen je Bahnhof | min 1 · median 3 · max 5 |
| Antwortgröße | min 0,6 kB · median 4,6 kB · max 20,6 kB (Berlin Hbf) |
| Schemabau | median 2 ms, max 30 ms |
| Bahnsteige ohne Achse | 0 |
| Kreuzende Ebenen > 20° | 3 – Ludwigshafen 75°, Köln Messe/Deutz 46°, Berlin Südkreuz 31° |

**25 fielen aus, und nur ein Teil davon liegt an uns:** 18 an
Overpass-Zeitüberschreitungen (die öffentliche Instanz war unter Last), 4 an
Bahnhöfen ohne einen einzigen Bahnsteig in OSM, 1 nicht gefunden – und **2 an
einem echten Fehler**, siehe unten.

### Was der Ausfall über die Simulation selbst sagt

Die Pause von 3 s lief nur nach **erfolgreichen** Abrufen; ein Fehlschlag ging
ohne Atempause in den nächsten. Gegen eine Drosselung ist das genau die
falsche Reaktion. `simulation-standort.ts` macht es anders (längere
Grundpause, wachsende nach Fehlschlägen) und kann mit `ABLAGE_NUR=1` ganz ohne
Netz laufen.

## Die Gleisliste enthielt Straßenbahnsteige und verschluckte echte Gleise

Der Auslöser war eine Zeile im Lauf: `Kaiserslautern Hbf … keine Route 1 → 120`.
Die Simulation fährt vom ersten zum letzten Gleis – und in
**Frankfurt(Main)Hbf war das letzte „Gleis" der Straßenbahnsteig „Platz der
Republik"**. Der Metropolknoten war damit gar nicht gemessen.

Dahinter lagen drei Fehler, alle über **983 Bahnsteigrefs aus 94 abgelegten
Bahnhöfen** nachgemessen:

1. **Trennzeichen.** `parseRefs` kannte `;` und `/`. In den Daten stehen
   außerdem `,` und `:` – Leipzig Hbf trägt `"18a,19"`, Hannover `"2,2a"` und
   `"2b,3,3a,3b"`, Düsseldorf `"3:4"`. Diese Gleise fehlten in der Liste, und
   an ihrer Stelle stand ein Gebilde, das kein Gleis ist. Ausgerechnet an
   **Leipzig Hbf hieß das: Gleis 19 gibt es nicht** – an dem Bahnhof, an dem
   der Kopfbahnhof-Fall gemessen wurde. Hannover gewinnt acht Gleise zurück.
2. **Vorsilbe.** `"Gleis 21"` ist Gleis 21. Vier Gleise an einem Bahnhof waren
   so nicht eingebbar.
3. **Straßenbahnsteige.** `railway=platform` tragen in OSM auch Tram- und
   Bussteige. Der gefährliche Fall ist nicht `"B"` oder `"Omnibusbahnhof"`,
   sondern die **Zahl**: **München Hbf führte vier „Gleise" 1–4, die samt und
   sonders Haltestellen auf dem Vorplatz sind** (Hauptbahnhof Süd,
   Hopfenstraße, Holzkirchner Bahnhof). Wer Gleis 2 eingab, wurde zur Tram
   geschickt.

**Die Regel dagegen ist eng gehalten und gegen die Ablage geprüft.** `train=yes`
zu *verlangen* wäre zu scharf (184 von 983 Refs tragen es nicht, darunter
Kaiserslauterns Gleise 1 und 8/10), und `highway=platform` mitzunehmen nimmt
Düsseldorfs Gleis 1 mit. Ausgeschlossen wird nur, was sich **selbst** als Tram-
oder Bussteig ausweist und sich nicht auch als Eisenbahnsteig. Dazu: eine
Gleisbezeichnung trägt eine Ziffer – Basels `"Regio 1"` und `"Fern 4"` bleiben.

Gemessen über 94 Bahnhöfe: **867 Einträge werden 808**, davon 74 entfernt und
15 gewonnen. Jeder entfernte zahlenförmige Eintrag ist einzeln geprüft und war
ein Straßenbahnsteig. Ein Bahnhof fällt dabei auf null Gleise: **Mannheim Hbf**,
dessen Liste aus vier Tram-Haltestellen bestand, während die echten
DB-Bahnsteige dort nur `name` tragen und kein `ref`. Das ist die ehrlichere
Antwort – vorher führte die App zu einer Tram.

## Simulation: die Standortwahl über 62 Bahnhöfe – null Befunde

`backend/scripts/simulation-standort.ts` fährt jeden Bahnhof **dreimal** – vom
Anfang, von der Mitte, vom Ende des Ankunftsbahnsteigs – und prüft jede der
drei Antworten gegen dasselbe Ebenendesign. Dazu eine Zusicherung, die bisher
nirgends geprüft war: **Jeder Ebenenwechsel der Route muss auf beiden Ebenen
als Anlage markiert sein.**

- **62 von 62 kennen alle drei Startpunkte.** Der Rückfall auf die Mitte trat
  kein einziges Mal ein.
- **An 62 von 62 ändert der Standort die Gehzeit, an 10 den Weg selbst.**

| Bahnhof | Anfang | Mitte | Ende | Spanne |
|---|---|---|---|---|
| Hamburg-Altona | 734 s | 512 s | **282 s** | 452 s |
| Frankfurt(Main)Hbf | 673 s | 463 s | **250 s** | 423 s |
| München Hbf | 944 s | 785 s | **625 s** | 319 s |
| Essen Hbf | 408 s | 168 s | **121 s** | 287 s |
| Dresden Hbf | 330 s | **244 s** | 519 s | 275 s |
| Kiel Hbf | **179 s** | 311 s | 444 s | 265 s |

> **Seit ToDo 31 (15.09.2026) ist „Anfang" das Nord- bzw. Westende.** Die
> Tabelle ist mit der alten, zufälligen Zeichenrichtung gemessen. Nachgeprüft
> über Lauf 5: München ist umbenannt (Gleis 5 liegt West → Ost, das Ostende
> gewinnt mit 625 s – oben schon getauscht), Hamburg-Altona und Frankfurt sind
> unverändert; Essen, Dresden und Kiel sind nicht nachgeprüft.

**Die Richtung dreht sich.** In München gewinnt das Ostende, in Hamburg-Altona
das Ende, in Dresden die Mitte. Eine feste Annahme – „Reisende stehen in der
Mitte" – wäre an jedem zweiten Bahnhof die falsche. Und der Sonderfall zählt:
**Fulda und Mainz sind ab der Mitte in 4 bzw. 6 Sekunden am Ziel** und ab den
Enden in vier Minuten.

Zehnmal ist es nicht dieselbe Strecke, sondern ein anderer Weg:

```
Berlin Gesundbrunnen   anfang/mitte  -1 → -2 → -1
                       ende          -1 → 0 → -0,3 → -0,7 → -1
Köln Messe/Deutz       anfang         1 → 0            (596 s)
                       mitte/ende     1 → -1 → 0       (750 s / 548 s)
Trier Hbf              anfang/mitte   0 → -1 → 0
                       ende           0                (eine Ebene)
Schwerin Hbf           anfang         0                (269 s)
                       mitte/ende     0 → -1 → 0       (429 s / 244 s)
```

### Ein Befund war meine eigene Fehlmessung

Der erste Lauf meldete **11 nicht markierte Treppen an drei Bahnhöfen**. Die
Prüfung suchte den **ersten** Besuch einer Ebene – während `schema.ebenen` seit
dem 13.09. eine Liste von **Besuchen** ist und Berlin Hbf die Ebene −1 zweimal
betritt, einmal über Rolltreppen und einmal über Treppen. Auf dem zweiten
Besuch stehen die Treppen sehr wohl.

Die Fehlmessung hatte bereits zu einer Änderung an `elementeFuer` geführt; sie
ist zurückgenommen. Sie hätte eine Anlage in **beide** Bilder gezeichnet, auch
in das, in dem niemand sie benutzt. **Dieselbe Klasse Irrtum wie am 07.09.**
(`description` statt `beschreibung`) – eine falsche Messung, auf der kurz eine
Behauptung stand. Geprüft ist die Zusicherung jetzt an beiden Enden: in der
Simulation über alle Besuche, und als Test gegen Berlin Hbf ab allen drei
Standorten.

## Offen: was NICHT geprüft ist (Stand 05.09.2026)

Der Frontend-Umbau und die sechs Feinschliffe sind **codeseitig fertig und
maschinell grün** (Stand 05.09.2026: 260 Frontend-Tests, **331** Backend-Tests,
Build und Lint sauber – die 28 neuen kommen aus §5, siehe „Was FaSta wirklich
liefert“). Was fehlt, ist der Blick darauf. Dieser Abschnitt trennt bewusst,
**was gesehen wurde und was nicht** – die schwersten Fehler dieses Projekts
waren allesamt nur im Browser sichtbar.

### Im Browser bestätigt (31.08.2026)

| Prüfung | Ergebnis |
|---|---|
| Eingabebildschirm, Navigationsleiste, gesperrte Einträge | ✅ |
| Bahnhofssuche: 3 Treffer, Bushaltestellen gefiltert | ✅ |
| Impressum/Datenschutz **nur** auf der Eingabe | ✅ (Feinschliff 1) |
| Dashboard erscheint nach Sekunden statt nach 61 s | ✅ (Blocker behoben) |
| Routenknöpfe als Zeilen mit Radio-Punkt und Minuten | ✅ (Feinschliff 2) |
| Ampel: graue Aussage mit Begründung, Gehzeit sichtbar | ✅ |

### NICHT geprüft – hier bitte weitermachen

Von den sechs Punkten steht nur noch einer offen: **P6, die Mobilabnahme.**

| # | Was | Stand |
|---|---|---|
| ~~P1~~ | ~~**Ampel-Layout nach der Korrektur**~~ | ✅ **gesehen 01.09.2026.** Statustext steht unter der Zeitleiste, kein „–:––“-Artefakt, Gehzeit rechts. Geprüft in beiden Zuständen: grün mit Countdown („Entspannt erreichbar“) und grau mit Begründung. Der Countdown lief zwischen zwei Aufnahmen weiter – der 10-Sekunden-Takt treibt die Anzeige auch nach dem Umbau auf `jetzt` als Zustand. |
| ~~P2~~ | ~~**Weg-Seite**~~ | ✅ **gesehen 01.09.2026, Fehler gefunden und behoben.** Ebenenschema, Schritt-Sheet, „Alle Schritte“, der neue „Angekommen“-Knopf und „Echte Karte anzeigen“ stehen. Das Schema legte Gleis 4 anfangs auf Ebene 0 statt −2 – Ursache und Korrektur unter „Der Ebenensprung“. Nach der Korrektur erneut im Browser geprüft: Gleis 4 liegt auf EBENE −2. |
| ~~P3~~ | ~~**Angekommen-Seite**~~ | ✅ **gesehen 01.09.2026.** Grüne Fläche mit weißem Haken, „Du bist da. / Gleis 4“, Kacheln Puffer und Abfahrt, „Neue Reise“. **Nicht** gesehen: der Wagenkasten – er verlangt `istFernverkehr(zugAbName) && (wagen \|\| abschnitt)`, und die Wagennummer war leer. Die Bedingung ist im Code geprüft, der Kasten selbst nicht. |
| ~~P4~~ | ~~**Globale Störmeldung**~~ | ✅ **gesehen 03.09.2026.** Das rote Band fährt von oben ein, bedeckt etwa ein Drittel und trägt Titel, Klartext und Zeitstempel – über dem Dashboard, ohne Seitenwechsel. Wartete seit dem 01.09. auf ein Live-Ereignis; statt weiter zu warten, wurde eines eingespeist (siehe „Wie P4 und P5 doch noch sichtbar wurden"). **Was damit NICHT belegt ist:** dass das Backend eine echte Änderung erkennt. Geprüft ist der Weg ab dem SSE-Strom. Der Test lief lokal – in Produktion war der Strom zu dem Zeitpunkt gar nicht erreichbar, siehe „Der Live-Strom war in Produktion nie erreichbar". |
| ~~P5~~ | ~~**Störungsseite mit Verspätung**~~ | ✅ **gesehen 03.09.2026**, auf demselben Weg. Aus der Störungsseite ist inzwischen die Meldungsseite geworden; gesehen wurden beide Ereignistypen, der Zähler, der Verlauf und das Übernehmen. Einzelheiten unter „Meldungsseite". |
| P6 | **Mobilabnahme am Gerät** | Unverändert offen. Acht Punkte als Prüfliste direkt unter dieser Tabelle – **sie blockiert drei geratene Zahlen im Code**. |

### Was an §5 (FaSta-Koordinaten) noch nicht geprüft ist (05.09.2026)

Die Verankerung ist gegen **echte FaSta-Antworten** getestet (Hannover und
Berlin als Fixtures im Repo), aber nie gegen einen **echten Routenabruf**. Der
Unterschied ist derselbe wie überall in diesem Projekt: Maschinell grün heisst,
dass die Bausteine stimmen – nicht, dass ein Reisender die richtige Auskunft
liest.

| # | Was offen ist | Warum es zählt |
|---|---|---|
| §5-A | **Kein echter Routenabruf.** Alle Tests speisen die Anlagen selbst ein. Niemand hat einen Stufe-3-Bahnhof über die laufende App abgefragt und den Text gelesen. | Die Kette Stationsdaten → `stationID` → FaSta → Verankerung → Textausgabe ist nur in Stücken belegt, nicht am Stück. |
| §5-B | **Die Achsenableitung ist nicht abgesichert.** Ab zwei verankerten Bahnsteigen bestimmt deren Richtung, wo die *unverankerten* liegen. Kein Test prüft das Ergebnis – in den Fixtures sind entweder alle Bahnsteige verankert (Hannover, Berlin) oder nur einer (Unit-Tests). | Genau der gemischte Fall ist der Regelfall an mittelgrossen Bahnhöfen. **Zu schreiben:** ein Test mit zwei verankerten und zwei unverankerten Bahnsteigen, der die Lage der unverankerten gegen die Achse prüft. |
| §5-C | **Der Kopfbahnhof bleibt falsch modelliert.** München (16 % Gleisbezug) und Frankfurt (36 %) benennen nur ihren S-Bahn-Teil. Stufe 3 nimmt weiter „genau eine Unterführung" an – dort treffen sich alle Bahnsteige am Querbahnsteig. | §5 löst das **nicht** und war nie dafür gedacht. Die Auskunft ist dort nicht schlechter als vorher, aber auch nicht richtig. Eigenes Thema. |
| §5-D | **Die Textausgabe ist ungesehen.** Aus „ca. 10 m" werden jetzt Werte zwischen 5 und 35 m. Ob die Sätze damit noch plausibel klingen, hat niemand gelesen. | Eine Route, die „ca. 6 m" sagt, wo 30 m zu gehen sind, wäre schlechter als die alte Pauschale. |
| §5-E | **`operationalResumeDate` liegt ungenutzt.** FaSta liefert bei defekten Anlagen ein Datum („wieder ab …"). | Eigener Nutzen für die barrierefreie Route, eigener Entwurf. Nicht Teil von §5. |
| §5-F | **Verbindungsanlagen ausgelassen** (ToDo 10b). Anlagen, die zwei Bahnsteige nennen, sind die Querung selbst – 6 von 69 in Berlin. | Bewusst ausgelassen: Sie tragen nur *einen* Punkt, eine Verbindung braucht zwei. |

**Was dagegen belegt ist:** Der Parser gegen alle fünf sondierten Vokabulare
und beide Rohdaten-Fallen; die Verankerung gegen die echten Antworten von
Hannover (6 Bahnsteige) und Berlin (Parkhäuser und Tram ziehen nichts); die
Cache-Naht (derselbe gecachte Graph beantwortet zwei Anfragen verschieden,
sobald der Aufzug ausfällt); und alle fünf Zeilen der Degradation.

### Mobilabnahme: die Prüfliste (P6 / ToDo 3 / P1 Task 12)

Der letzte offene Punkt der Sichtprüfung – und der einzige, der **Code
blockiert**: Drei Zahlen im Repo sind begründete Schätzungen ohne Messung
dahinter und warten auf dieses Gerät.

**Vorbereitung:** `mkcert`-Zertifikate liegen in `frontend/.cert/` und schalten
den Dev-Server auf HTTPS – ohne das gibt der Browser den Standort nicht heraus.

| # | Was prüfen | Woran es scheitern kann | Was notieren |
|---|---|---|---|
| M1 | **Berechtigungsdialog beim ersten Aufruf** | Der Dialog erscheint auf iOS nur nach einer Nutzergeste; kommt er nicht, bleibt die Vorbelegung stumm leer statt zu erklären. | Erscheint er? Was steht drin? Was passiert bei „Ablehnen"? |
| M2 | **Wiederkehrer ohne Dialog** | Beim zweiten Besuch darf nichts erneut fragen – tut es das doch, ist der Zustand nicht gespeichert (und *soll* er das? Die App hält bewusst nichts). | Verhalten beim zweiten Aufruf |
| M3 | **GPS-Genauigkeit in der Bahnhofshalle** | Am 29.08. am Fenster gemessen: **±118 m**. In der Halle ist mehr zu erwarten. Ab ±2000 m verlangt die App Handeingabe. | Der tatsächliche Wert, drinnen **und** am Bahnsteig |
| M4 | **Erkennungsradius** (`ERKENNUNG_RADIUS_M = 1000` in `routes/api.ts`) | Belegt am 31.08.: Von `52.84/13.81` liegt Eberswalde Hbf **1094 m** entfernt – 94 m zu weit, die Umkreissuche liefert nichts, die Vorbelegung bleibt leer. | Ab welcher Entfernung der richtige Bahnhof noch gefunden wird → **ToDo 3a entscheiden** |
| M5 | **Ankunftserkennung am Gleis** | Sie schlägt vor, der Mensch bestätigt. Schlägt sie zu früh oder gar nicht vor, ist die Zeitschätzung daneben. | Wann der Vorschlag kommt, gemessen am tatsächlichen Ankommen |
| M6 | **Automatische Ebenenwahl: Hilfe oder Bevormundung?** | Die Karte springt auf die Ebene des aktiven Schritts. Das kann entlasten – oder den Nutzer die Orientierung kosten, wenn er selbst blättern wollte. | Der subjektive Eindruck. Diese Frage hat keine maschinelle Antwort. |
| M7 | **Bedienbarkeit mit Gepäck** | Trefferflächen, Daumenreichweite, Lesbarkeit in der Halle bei Gegenlicht. | Welche Elemente man nicht trifft |
| M8 | **Teilen-Menü und Einfügen** (Reise-Import) | Belegt sind bisher nur DB Navigator und VBB, beide am Rechner eingefügt. Über das Teilen-Menü des Betriebssystems ist der Weg ungeprüft. | Welche App welchen Text liefert, und was der Parser daraus macht |

**Die drei Zahlen, die auf diese Abnahme warten** (ToDo 15 und 3a):

| Konstante | Wert | Wo | Was die Abnahme entscheidet |
|---|---|---|---|
| `ERKENNUNG_RADIUS_M` | 1000 m | `routes/api.ts` | M4 – reicht der Radius, oder braucht Eberswalde 1200 m? |
| `ERKENNUNG_MAX_M` | 1000 m | Genauigkeitsbudget | M3 – ab welcher Ungenauigkeit die Vorbelegung schadet statt hilft |
| `NOTBEHELF_TTL_MS` | 600000 (10 min) | `cache/lru.ts`, über `GRAPH_NOTBEHELF_TTL_MS` verstellbar | Wie schnell sich ein Bahnhof nach einer Overpass-Erholung erfängt |

### Nebenbefunde der Sichtprüfung (01.09.2026)

| Was | Beobachtung |
|---|---|
| ~~**Die Zugtafel ist ungekappt**~~ ✅ behoben | Berlin Hbf lieferte über die Gruppe **129 Ankünfte**, alle gezeichnet – das Zeichnen dauerte so lange, dass die Bildschirmaufnahme in eine 30-Sekunden-Zeitüberschreitung lief. Siehe „Die Zugauswahl“. |
| **Barrierefrei ist schneller als „schnellste“** | Im Dashboard stand „Schnellste Route 6 min“ über „Barrierefrei (Aufzug) 5 min“. Die schnellste Route darf nie langsamer sein als eine andere Variante – die Gehzeitgewichtung der Varianten passt nicht zusammen. |
| **Standort ohne GPS** | Am Rechner meldet die App „Dein Standort ist nur auf ± 2000 m genau – zu grob“ und verlangt Handeingabe. Sauber formuliert, kein stiller Fehlschlag. |

### Der Ebenensprung (P2, gefunden und behoben 01.09.2026)

Auf der Weg-Seite stand Gleis 4 im Schema auf **EBENE 0** – die Route selbst
endete auf **Ebene −2** (Berlin Hbf tief). Die Rohdaten zeigten, wo es
auseinanderfiel:

```
11  level=-2  typ=aufzug   Aufzug zur Ebene -2
12  level=-2  typ=eben     Wenige Meter links
13  level=0   typ=eben     Wenige Meter halbrechts zu Gleis 4   <-- unmöglich
```

**Ein Schritt vom Typ `eben` wechselte zwei Stockwerke.** Das ist strukturell,
nicht Berliner Eigenart – zwei Fehler in `core/graph.ts` addierten sich:

1. **Eine Vermutung sah aus wie eine Tatsache.** `wayEbene()` gab `0`
   zurück, wenn OSM kein `level` führt. Nichts unterschied das noch von
   einem echten Erdgeschoss.
2. **Zwei Bahnsteige mit derselben Gleisnummer fielen zu einem Knoten
   zusammen.** Bahnsteigpunkte heißen `gleisN:*` und wurden nur einmal
   angelegt (`if (!knoten.has(id))`). In Berlin Hbf tragen **zwei
   verschiedene** Bahnsteige ein Gleis 4:

   | Element | `ref` | `level` | Name |
   |---|---|---|---|
   | `r6809883` | `4` | – | S+U Hauptbahnhof (U-Bahn) |
   | `r13392159` | `3;4` | `-2` | Berlin Hauptbahnhof (Tief) |

   Der zuerst verarbeitete U-Bahnsteig legte `gleis4:*` an – mit **seiner**
   Lage und der geratenen Ebene 0. Der zweite fand den Knoten vor, legte ihn
   nicht neu an, hängte ihn aber ans −2-Netz. Heraus kam eine ebene Kante
   über zwei Stockwerke. Nicht nur die Ebene war falsch, auch die **Lage**:
   Die Punkte lagen am U-Bahnsteig.

**Wie breit trifft es?** Ausgezählt über alle drei echten Fixtures:

| Fixture | Bahnsteig-Elemente ohne `level` | Gleisnummern auf mehreren Bahnsteigen |
|---|---|---|
| Berlin Hbf | 4 von 13 | **Gleis 4 und Gleis 5** – beide mit U-Bahn kollidiert |
| Gütersloh | 1 von 5 | keine (das untagged Element führt keine `ref`) |
| Zernitz | – (Stufe 3, keine Bahnsteigdaten) | keine |

Gütersloh entkam nur, weil sein Element ohne `level` keine Gleisnummer
trägt. Die Kombination „geteilte Gleisnummer + fehlendes `level`“ ist in OSM
verbreitet, wo DB und Nahverkehr sich einen Bahnhof teilen.

**Die Korrektur** (drei Teile, `core/graph.ts`):

1. `wayEbeneMitBeleg()` trennt **belegt** von **geraten**. Ein `level`-Tag,
   `tunnel` oder `bridge` gilt als Beleg; der Rest ist eine Vermutung, die
   sich als solche zu erkennen gibt.
2. **Eine Quelle je Gleisnummer**, vor dem Knotenbau bestimmt: Belegtes
   Stockwerk schlägt geratenes. Der unterlegene Bahnsteig verliert nur seine
   Punkte – sein Umriss bleibt begehbar, er ist echte Geometrie.
3. **Die Anbindung hängt an der Ebene des Knotens**, nicht an der des gerade
   verarbeiteten Bahnsteigs. Nach 1. und 2. sind beide gleich; die Zeile
   steht da, damit eine ebene Kante über Stockwerke auch dann unmöglich
   bleibt, wenn jemand später an der Auswahl dreht.

Die Regel ist bewusst schmal. Sie löst den beobachteten Fall und ersetzt
**nicht** den vollen Abgleich OSM ↔ DB-Gleisliste (Konzeptlücke §4.3, ToDo 7):
Tragen beide Bahnsteige einen Beleg, bleibt es bei der Reihenfolge – dann
wäre die DB-Gleisliste die einzige Instanz, die entscheiden könnte.

Vier Tests in `test/graph.test.ts` halten das fest, darunter eine Invariante,
die nichts über Berlin weiß: **keine ebene Kante zwischen zwei Ebenen.**
Vorher schlugen 6 solcher Kanten auf.

### Bekannter Rückstand, bewusst offen

**Der Kaltstart bleibt langsam – aber nicht mehr doppelt so lange.** Ursache,
am 31.08. gemessen: Zwei gleichzeitige Anfragen für denselben Bahnhof fanden
beide den Graph-Cache leer, bauten den Graphen unabhängig und fragten Overpass
doppelt – **24 s und 61 s statt 2 s**. Am 01.09. im Backend behoben (ToDo 3c);
das Frontend lädt die Varianten weiterhin nacheinander, jetzt aber aus einem
eigenen Grund (siehe `api/varianten.ts`).

**Was bleibt:** Ein unbekannter Bahnhof kostet beim ersten Aufruf immer noch
rund 24 Sekunden – so lange braucht Overpass. Gebrochen ist nur die
Verdopplung, nicht der Abruf selbst. Wer das kürzen will, muss beim
Overpass-Abruf ansetzen, nicht am Cache.

**Ausgeliefert am 01.09.2026** – Frontend wie Backend. Siehe „Deployment
01.09.2026“.

## Offene ToDos

### Sofort (kleine Schritte, klar umrissen)

| # | Aufgabe | Hintergrund |
|---|---|---|
| ~~1~~ | ~~**EVA-Split bei grossen Bahnhöfen**~~ ✅ **erledigt 31.08.2026** | Gelöst über `groupMembers` aus RIS::Stations. Einzelheiten im Abschnitt „Verkehrsstellengruppen". |
| ~~1b~~ | ~~**Graph-Cache vergiftet sich selbst**~~ ✅ **erledigt 31.08.2026** | Frist jetzt nach Qualität: Stufe 1/2 volle 24 h, Stufe 3 zehn Minuten (`graphTtlMs` in `cache/lru.ts`). |
| ~~2~~ | ~~**FaSta-Adressierung schließen**~~ ✅ **erledigt 31.08.2026** | `stationID` wird durchgereicht. Der Fund dabei: Mit der EVA antwortete FaSta **nicht** mit einem Fehler, sondern mit HTTP 200 und `[ ]`. |
| 3a | **Erkennungsradius von 1000 m prüfen** | 🔶 **Am 07.09.2026 am Gerät: Bahnhöfe werden sehr gut erkannt.** Der Verdacht von Eberswalde hat sich im Alltag nicht bestätigt; ein Grenzwert ist trotzdem nicht gemessen, deshalb bleibt der Eintrag offen. Am 31.08. beobachtet: Von `52.84/13.81` aus liegt Eberswalde Hbf **1094 m** entfernt – 94 m zu weit, die Umkreissuche liefert nichts, und die Vorbelegung bleibt leer. Die Rohantwort enthält dort 17 Bushaltestellen, aber keine Eisenbahn-Verkehrsstelle; der Filter arbeitet also richtig. Zu entscheiden ist der Radius (`ERKENNUNG_RADIUS_M` in `routes/api.ts`) – gehört in die Mobilabnahme. |
| ~~3b~~ | ~~**Sichtprüfung der neuen Bildschirme**~~ ✅ **erledigt 03.09.2026** | Ampel (P1), Weg-Seite (P2) und Angekommen-Seite (P3) am 01.09.; P4 und P5 am 03.09. über eingespeiste Ereignisse. Offen bleibt allein die Mobilabnahme (ToDo 3). |
| ~~3e~~ | ~~**Der Ebenensprung**~~ ✅ **erledigt 01.09.2026** | Strukturell, nicht Berliner Eigenart: eine geratene Ebene 0 plus zwei Bahnsteige, die sich eine Gleisnummer teilen. Einzelheiten und Auszählung unter „Der Ebenensprung“. Der volle Abgleich OSM ↔ DB-Gleisliste (§4.3, ToDo 7) bleibt davon unberührt offen. |
| ~~3f~~ | ~~**Zugtafel kappen**~~ ✅ **erledigt 01.09.2026** | Zeitfenster −5/+45 Minuten und vier Kategorien statt einer Bandwurmliste. Aus 113 Einträgen wurden 51 in drei Blöcken. Siehe „Die Zugauswahl“. |
| ~~3g~~ | ~~**„Schnellste“ ist langsamer als „barrierefrei“**~~ ✅ **war bereits am 02.09.2026 erledigt** | `d532ec7` „die schnellste Route ist jetzt die schnellste“. Router und Anzeige benutzten zwei verschiedene Kostenmodelle (Rolltreppe −10 s beim Routen, +10 s in der Anzeige); seither ist `kantenZeitSekunden` für beide die einzige Quelle. Der Eintrag stand hier zwei Tage lang zu Unrecht als offen – nachgeprüft am 04.09. an der Historie und am grünen Invariantentest in `test/routing.test.ts`. |
| ~~3c~~ | ~~**Gleichzeitige Graphbauten zusammenführen**~~ ✅ **erledigt 01.09.2026** | Zwei Karten laufender Versprechen in `routes/api.ts` – eine auf die EVA, eine auf den Bahnhofsschlüssel. Wer als Zweiter kommt, wartet auf den laufenden Bau, statt danebenher einen eigenen zu starten. Drei Tests in `test/cache.test.ts`. **Die Falle dabei:** Bei einem Bahnhof aus einer einzigen Verkehrsstelle sind EVA und Gruppenschlüssel dieselbe Zeichenkette – in **einer** Karte fand der innere Bau das noch offene äussere Versprechen und wartete auf sich selbst. Der Testlauf lief in den Timeout, nicht in eine Fehlermeldung. |
| ~~3d~~ | ~~**Frontend deployen**~~ ✅ **erledigt 01.09.2026** | Frontend auf Vercel, Backend auf Fly.io. Einzelheiten unter „Deployment 01.09.2026“ – dort steht auch, was dabei **nicht** nachweisbar war. |
| ~~3h~~ | ~~**Meldungsseite bauen**~~ ✅ **erledigt 03.09.2026** | Neues Modell `src/meldungen/`, neuer Bildschirm `src/screens/Meldungen.tsx`; `Stoerung.tsx` ist darin aufgegangen. 25 Tests dazu. Einzelheiten unter „Meldungsseite". |
| 3 | **Mobilabnahme am echten Gerät** | 🔶 **am 07.09.2026 gelaufen, M1–M8 beantwortet** (Tabelle unter „Die Mobilabnahme"). M1, M3, M6, M7 sauber; M4 ohne Grenzwert; **M5 und M8 sind Funde** (ToDo 23 bzw. 20). Offen bleibt allein **M9** – der Nachtest der reparierten Routenwahl, prüfbar erst nach dem Deployment. Die Sichtprüfung am Desktop ist am 29./30.08. erfolgt (siehe „Abnahme im Browser"). Offen bleibt, was nur ein Handy zeigt: Berechtigungsdialog, Wiederkehrer ohne Dialog, Genauigkeit im Bahnhof, Ankunftserkennung am Gleis, und ob die automatische Ebenenwahl als Hilfe oder als Bevormundung ankommt. `mkcert`-Zertifikate in `frontend/.cert/` schalten den Dev-Server auf HTTPS. |
| ~~4~~ | ~~**4 Lint-Warnungen im Frontend**~~ ✅ **erledigt 01.09.2026** | `npm run lint` ist jetzt ohne Ausgabe. Einzelheiten im Abschnitt „Lint-Warnungen aufgelöst“. Voraussetzung waren 11 neue Tests für `Zugauswahl` und `Eingabe` – beide Komponenten hatten vorher **keine**. |
| ~~4b~~ | ~~**Doppeltes Bahnhofsnamen-Vokabular**~~ ✅ **erledigt 04.09.2026** | Die Vorsilben-/Nachsilbenliste stand im Frontend-Parser *und* in `core/bahnhofsname.ts`. Die Frontend-Normalisierung ist gefallen, die Auflösung liegt ganz im Backend (`d6150d9`). Der Bahnhof wandert weiterhin als **Suchtext** ins Formular, nicht als getroffene Wahl. |
| ~~4c~~ | ~~**CSP-Header fehlt**~~ ✅ **erledigt 04.09.2026** | `3d8a842`. Die Quellen sind aus dem Code belegt statt geraten: Kartenkacheln, der SSE-Strom auf Fly.io, MapLibres Worker (`blob:`), lokale Schriften. Vercel Web Analytics lädt same-origin, braucht also keine Fremddomain. 7 Tests prüfen die `vercel.json` direkt. |
| ~~4d~~ | ~~**Deprecation-Warnung `disableRequestLogging`**~~ ✅ **erledigt 04.09.2026** | `dcac4ca`, auf `logController` umgestellt (Fastify 6 entfernt die alte Option). Die sechs Datenschutztests liefen unverändert weiter – **kein** Zugriffsprotokoll, wie die Datenschutzerklärung zusagt. |
| 21 | **Leerzeichen vor dem Komma nach der eckigen Klammer** | `analysiere()` in `frontend/src/reise/reisetext.ts` ersetzt den Klammerzusatz durch `' '`, das Backend (`KLAMMERZUSATZ` in `core/bahnhofsname.ts`) durch `''`. Aus „S+U Hauptbahnhof [Gleis 1-8], Berlin" wird deshalb **„S+U Hauptbahnhof , Berlin"** – mit Leerzeichen vor dem Komma. Am 06.09.2026 nebenbei aufgefallen, als das VMV-Format zerlegt wurde. Schadet der Suche derzeit **nicht** (die Störwort-Schälung räumt es mit weg), landet aber sichtbar als Suchtext im Formular. Kosmetisch, eine Zeile. |
| 24 | **Verwaiste Aufzüge über FaSta zuordnen statt über 10 m** | Die ausgelieferte Regel (`VERWAIST_MAX_M = 10`) rät den Bahnsteig über die Entfernung. FaSta **benennt** ihn: Der verwaiste Aufzug in Braunschweig trägt `"zu Gleis 1/2"`, und `verankerterBahnsteig()` aus §5 löst das bereits auf. Der Verbindungsschlüssel ist OSMs `ref:operator_inventory` = FaSta-Anlagennummer, in beiden Datensätzen vorhanden. Damit fiele eine geratene Zahl weg. **Zu klären:** Der Graph wird ohne FaSta gebaut (FaSta kommt je Anfrage auf einer Kopie dazu) – die Anbindung müsste also in `wendeFastaAn` wandern oder der Graphbau FaSta kennen. Die 10-m-Regel bliebe als Rückfall für Anlagen ohne Beschreibung (Hannover: 2 von 20). |
| 23 | **Die Ankunftserkennung ist in der Halle unerreichbar** | M5 der Mobilabnahme: `pruefeAnkunft()` sperrt bei `genauigkeitM > GENAUIGKEIT_MAX_M` (100 m), gemessen wurden ±118 m **am Fenster**. Der Zähler startet in der Halle nie, Radius und Verweildauer kommen nicht zum Tragen. Die 100 m sind für den Kartenpunkt richtig und für die Ankunft zu streng – **zwei Fragen an einer Zahl**. Zu entscheiden ist eine eigene, lockerere Ankunftsschwelle, nicht ein neuer Wert für beide. Nach der Abnahme nicht dringend: Selberklicken funktioniert. Einzelheiten unter „Die Mobilabnahme". |
| ~~22~~ | ~~**Die Naht Knopf → Wirkung bleibt ungetestet**~~ ✅ **erledigt 13.09.2026** | `frontend/src/App.test.tsx` klickt durch den echten `App`, gemockt ist nur die Netzgrenze (siehe „Die Naht zwischen Knopf und Wirkung – endlich geprüft"). Ursprünglich: Die vier Fehler vom 07.09. sassen alle zwischen zwei grünen Testdateien: `Dashboard.test.tsx` mockt `onVariante` weg, `varianten.test.ts` speist die Hole-Funktion ein. Behoben sind die Fehler, die Lücke nicht – es gibt weiterhin **keinen** Test, der `App.tsx` mit einem echten Klick durchläuft. Ein `App.test.tsx` mit gemocktem `holeRoute` würde die ganze Gattung schliessen, nicht nur diesen Fall. |
| 4e | **Test für die Achsenableitung (§5-B)** | Ab zwei verankerten Bahnsteigen bestimmt deren Richtung, wo die *unverankerten* liegen. Kein Test prüft das Ergebnis: In den Fixtures sind entweder alle Bahnsteige verankert (Hannover, Berlin) oder nur einer (Unit-Tests). Gebraucht wird ein Fall mit zwei verankerten **und** zwei unverankerten – der Regelfall an mittelgrossen Bahnhöfen. Eine Stunde Arbeit. |
| 5 | **Vercel: Framework-Preset steht auf „Services"** | Rückstand der `experimentalServices`-Erkennung beim `vercel link`. Die `vercel.json` überschreibt es, der Build ist nachweislich korrekt – kosmetisch, aber irreführend. Settings → Build & Deployment. |
| 6 | **Vercel-Preview-Variable nur für `feat/mvp`** | `VITE_API_BASE` konnte nicht „für alle Preview-Zweige" gesetzt werden (CLI-Fehler in v53.1.0: der vorgeschlagene Befehl ist derselbe, der scheitert). Neue Zweige brauchen einen eigenen Eintrag oder das Dashboard. |
| ~~25~~ | ~~**Ausliefern: 23 Commits auf `feat/mvp`**~~ ✅ **erledigt 16.09.2026** | 28 Commits gepusht, `main` per Fast-Forward nachgezogen, Fly.io mit `--ha=false` (eine Maschine, 1/1 gesund) und Vercel in Produktion. `vercel.json` danach geprüft: unverändert. Gegen die Produktion nachgemessen: Health, CORS, vier Routen, der reparierte Doppelparameter. M9 und M10 sind damit nicht mehr blockiert. |
| 26 | **Zwei Simulationen lesen den Schlüssel-Tresor ohne Not** | `simulation-schema.ts` und `simulation-standort.ts` rufen `ladeSecrets()` beim Start immer auf – auch mit `ABLAGE_NUR=1`, wo kein Netz gebraucht wird. Nach `D:\Claude-code\CLAUDE.md` starten sie deshalb nur nach Rückfrage. Nur laden, wenn wirklich abgerufen wird; dann laufen beide ohne. |
| 36 | **Augsburg 6 → 12 barrierefrei: 1 m kürzer als vor ToDo 31** | Lauf 5 gegen Lauf 4, ab Anfang: 266 statt 267 m, 386 statt 387 s, gleiche Ebenenfolge. Die einzige Route von 672 unterscheidbaren Kombinationen, die weder gleich blieb noch nur die Seiten tauschte. Vermutlich ein Nebeneffekt der jetzt umgedrehten Bahnsteigkette (`verdichteBahnsteigketten` arbeitet vom Anfang aus) – **nicht untersucht**. Klein, aber es zeigt eine Reihenfolgeabhängigkeit, die es nicht geben sollte. |
| 27 | **Düsseldorf Hbf 1 → 20: Wegzerlegung 236 statt 231 m** | Der einzige Routing-Befund von Lauf 4 (`pruefeSchema`, ab Mitte, schnellste). Die Linienzüge der Besuche sind 5 m länger als der Pfad ohne Ebenenwechsel. Douglas-Peucker kann nicht verlängern – die Ursache liegt woanders (Besuchsgrenzen, doppelte Punkte an einem Wechsel?). Nicht aus dem Symbolumbau. |
| ~~37~~ | ~~**Die 180 px Bildhöhe sind an EIN Gerät angepasst**~~ ✅ **erledigt 02.10.2026** (`f3d4485`) | Die Bildhöhe wird jetzt gemessen (`ResizeObserver` in `Ebenenschema.tsx`) und richtet sich nach der Dichte der Bahnsteige (`aktivHoehe(bildBedarf, verfuegbar)` in `masse.ts`); die Simulation zeichnet bei wählbarem Platz (`VERFUEGBAR`). Am 05.10. im Browser bestätigt: München mit 17 Balken ohne Überdeckung. Ursprünglich: `AKTIV_H = 180` war aus einem Rahmen von 360 × 740 abgeleitet und nur dort richtig. |
| ~~38~~ | ~~**Die Datenvorbehalte stehen nirgends mehr**~~ ✅ **erledigt 11.10.2026** – zuletzt im Aufklapper „Alle Schritte“ (`bildVorbehalte` in `schema/bandmodell.ts`, Liste `.schema-vorbehalte`): Schema-Satz, Kreuzungswinkel ab 20°, `schema.vorbehalte`; beim groben Bild nur „Schema, keine Karte – die Abstände sind nicht maßstäblich.“ Ursprünglich: | Mit der Fußzeile unter dem Bild sind am 19.09.2026 drei Auskünfte verschwunden: dass das Bild ein Schema und nicht maßstäblich ist, der Kreuzungswinkel zweier Ebenen, und `modell.vorbehalte` („Bahnsteigabschnitte (A–G) sind in den Quellen nicht verortet", `core/schema.ts:787`). Sie waren auf Wunsch zu entfernen, weil sie den festen Bildschirm füllten, ohne sich je zu ändern. Sie sind damit aber nicht falsch geworden. Naheliegender Ort: der Aufklapper „Alle Schritte", wo seit heute schon Karte und Streckenhinweise liegen – `Schrittsheet` nimmt dafür ein `zusatz`. Siehe „Offen am Design", Punkt 7. |
| 39 | **Der letzte echte Rest des Gleisabgleichs: Konstanz „2"** | Abgleich vom 02.10.2026 (`osm-ablage/laeufe/db-auswertung-5.log`): Der Fahrplan nennt Gleis „2", OSM führt nur die Hälften `2a` und `2b` als eigene Bahnsteigpolygone. `linkedPlatforms` nennt beide, sie liegen aber an zwei `bahnsteigId` – `loeseGleis` wählt dann bewusst nicht. Welche Hälfte gemeint ist, sagt keine Quelle; die Mitte zwischen beiden wäre eine Annahme. Ein Fall von 884, die Route fällt ins Standardmodell. Die übrigen neun Restfälle nennen im Fahrplan gar kein Gleis. |
| 40 | **Acht Beschriftungen im Ebenenschema unter 15 px** | Die belegte Ausnahme aus `design/DESIGN.md` Abschnitt 3 (`schema-gleisname`, `schema-standort`, `schema-bandrechts` u. a., 0,5 bis 0,72 rem = 9 bis 13 px). Seit dem 05.10. rechnet `rem` wirklich mit 18 px, damit stimmen sie mit `NAME_H` in `bandbild.ts` überein. Zu lösen über die Maße des Schemas, nicht über die Schriftgröße – erst am Gerät entscheiden, ob sie in der Halle reichen (ToDo 30). |

### Als Nächstes (der Hauptstrang)

| # | Aufgabe | Umfang |
|---|---|---|
| 7a | ~~**§4.3 Abgleich OSM ↔ DB-Gleisliste (eng)**~~ ✅ **erledigt 04.09.2026** | Die DB-Gleisliste trennt jetzt, was OSM zusammenlegt. Gegen die echte API gemessen. Siehe „Die DB-Gleisliste als Trenner“. |
| **7a+** | **§4.3 in voller Fassung** | **Auf Datenmangel blockiert, nicht auf Aufwand.** Der `platforms`-Endpunkt führt nachweislich keine Koordinaten – ohne sie lässt sich die OSM-Geometrie nicht an der DB verankern. Einzelheiten unter „Was der `platforms`-Endpunkt liefert“. |
| ~~7b~~ | ~~**§5 FaSta-Koordinaten im Synthesemodell**~~ ✅ **erledigt 05.09.2026** | Die Zuordnung Anlage → Bahnsteig kommt aus `description` („zu Gleis 15/16" = Bahnsteig 15/16), **nicht** aus der Geometrie – geometrisches Clustern wäre nachweislich falsch gewesen. Siehe „Was FaSta wirklich liefert“. Der Befund, der dahin führte: **Durch den Spike aufgewertet:** FaSta ist die *einzige* verbliebene Quelle mit echten Koordinaten (`FastaAnlage` trägt `lat`/`lon`). Damit ist §5 nicht nur ein Feinschliff der Stufe 3, sondern der einzige Hebel, der die Geometrie überhaupt noch verbessern kann. |
| ~~7c~~ | ~~**§9 getrennte Blöcke Ankunft/Abfahrt**~~ ✅ **erledigt 05.09.2026** | Zwei Blöcke mit je Zug, Gleis und Wagennummer. Deckte einen Fehler auf: Der Angekommen-Bildschirm zeigte den **Ankunfts**wagen. Siehe „Getrennte Blöcke – und der Wagen, der zum falschen Zug gehörte“. |
| 8 | **MVP-Task 17 abschließen** | `Dockerfile` steht, **Schritt 1 ist erledigt** (`test/degradation.test.ts`, 13 Tests – siehe „Die Degradationstabelle als Test“). Offen bleibt der Mobile-Feinschliff, der ohnehin an der Mobilabnahme hängt. Die Aufgabenbeschreibung im Plan ist an einer Stelle überholt: Sie verlangt „Backend serviert `frontend/dist` via `@fastify/static`“ – das ist am 03.09. mit der Trennung Vercel/Fly.io entfallen. |
| ~~9a~~ | ~~**Ticket-PDF-Import**~~ ⛔ **entschieden dagegen, 03.09.2026** | Die Spec fragte: „Verarbeitung im Browser prüfen, bevor ein Endpunkt gebaut wird.“ Der Reise-Import hat das beantwortet – Text im Browser, PDFs bewusst abgelehnt als Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO). Ein Upload-Endpunkt würde diese Entscheidung widerrufen. **Nicht bauen.** |
| 9b | **Wagenreihungsseite** | ⛔ **Blockiert – es gibt keine Datenquelle mehr.** Siehe „Die Wagenreihung ist tot“. |
| **20** | **Reise-Import: das VMV-Format** | Der Parser erkennt es **gar nicht** – `parseReise` gibt `null` zurück, kein einziger Abschnitt. Am 06.09.2026 an einem echten Text isoliert, drei voneinander unabhängige Blocker, alle im Parser: (1) `istRahmen` wirft jede Zeile mit ` -> ` weg – der Pfeil ist als Kopfzeilen-Trenner gedacht, die VMV benutzt ihn mitten in der Fahrtzeile; (2) `von` ist kein Rollenwort, und die Ankunft wird gar nicht durch ein Wort markiert, sondern durch den Pfeil; (3) Abfahrt und Ankunft stehen **auf einer Zeile**, das Modell des Parsers ist ein Halt je Zeile. **Zuschnitt entschieden 06.09.2026: Bus-Etappen bleiben draußen, der Anspruch endet am letzten Bahnhalt** – die Form „Haltestelle, Ort (Zusatz)" (`Seebad Heringsdorf, Heringsdorf (Seebad)`, `Ahlbeck, Bahnhof (UBB), Ahlbeck (Seebad)`) muss damit **nicht** gelöst werden. Vorläufig: „erstmal". |
| ~~9c~~ | ~~**Variante „Mit Stopp: WC & Kiosk“**~~ ✅ **erledigt 05.09.2026** | Gebaut und ausgeliefert. Die Spec-Annahme „die Daten sind bereits da“ stimmte nicht – die Overpass-Abfrage holte WC und Kiosk nie. Siehe „Mit Stopp: WC & Kiosk“. |
| 28 | **Stumme Treppen und Rampen** | Lauf 4: 195 Routen an 19 Bahnhöfen nehmen eine Treppe oder Rampe, ohne dass der Graph einen Ebenenwechsel kennt (35 Treppen-, 769 Rampenkanten) – etwa eine Unterführung ohne `level`. Im Bild steht dort keine Scheibe, im Text schon. Je Fall zu klären: Fehlt `level` in OSM, oder liest der Graph `incline`/`ramp` nicht? |
| 29 | **Umwege zu einem Zugang an 7 Bahnhöfen** | `pruefeBahnsteigwege`, Lauf 4: Bielefeld (Gleis 5, zwei Treppen), Bonn (Gleis 4), Gütersloh (Gleis 2 und 3), Schwerin (Gleis 1: Treppe über 258 statt 120 m, zwei Aufzüge), Wittenberge (Gleis 1, Aufzug), Berlin-Spandau (Gleis 3: Treppe bei 397 m unerreichbar). **Seit Lauf 8 (02.10.) dazu Berlin Ostkreuz** (Gleis 5: Treppe bei 21 m über 236 statt 28 m) – Ostkreuz hat erst seit `32292fb` Gleise, der Fall war vorher unsichtbar. Nach der Kettenkorrektur eine andere Ursache – je Bahnhof am Graphen nachsehen. |
| 30 | **M10: das neue Schema am Gerät** | Mit M9 nach dem Deployment (ToDo 25). Tragen die 11-px-Symbole in der Halle bei Gegenlicht? Reicht auf dem Ankunftsband der Punkt ohne Linie – auch am Kopfbahnhof, wo die U-Form nur noch im Text steht (154 Routen an 18 Bahnhöfen)? Stimmen die geglätteten Schritte im Gehen (`GLAETTUNG_M = 6` ist begründet, nicht gemessen)? **Seit dem 19.09. dazu:** Bleibt das verankerte Bild beim Durchklicken wirklich ruhig, oder wirkt das Springen der Nachbarebenen darum herum unruhig? Und findet die Hand den „Weiter"-Knopf unten am Rand mit Koffer in der anderen? |
| ~~31~~ | ~~**Was „Anfang" im Bahnhof heißt**~~ ✅ **entschieden und umgesetzt 15.09.2026** | **Anfang = Nord- bzw. Westende**, für alle Bahnsteige einer Ebene an derselben Achse ausgerichtet (`core/richtung.ts`, angewandt in `baueGraph`). Die Knöpfe und die Standortmarken im Bild sagen es: „Nordende · Mitte · Südende" oder „Westende · Mitte · Ostende" – vergleichend, also „das nördlichere der beiden Enden". Warum die Himmelsrichtung: Sie ist die einzige Orientierung, die an **jedem** Bahnhof aus den Daten belegt ist. Kopf und Empfangsgebäude kennt die Overpass-Abfrage nicht, und die Fahrtrichtung ließe sich nur aus dem Laufweg schätzen – an Brücken und Kurven das falsche Ende. Ohne gemessene Achse (Standardmodell) bleibt es bei „Anfang/Ende". Vorher: die zufällige Zeichenrichtung in OSM, an Nachbarbahnsteigen oft entgegengesetzt. Siehe „Hier weitermachen". |

Der Umbau nach dem Entwurf ist am 31.08. erfolgt (Spec und Plan unter
`docs/superpowers/`); Spec-Abschnitt 8 ist
[hier](./docs/superpowers/specs/2026-08-31-frontend-nach-design-design.md),
die Ursachenanalyse in [`docs/2026-08-31-design-abgleich.md`](./docs/2026-08-31-design-abgleich.md).

### Später / bei Gelegenheit

| # | Aufgabe | |
|---|---|---|
| 10b | **FaSta-Verbindungsanlagen auswerten** | Anlagen, die **zwei** Bahnsteige nennen („Gleis 5/6 (C/D) - Gleis 11/12“), sind die Querung selbst – 6 von 69 in Berlin. Sie tragen aber nur *einen* Punkt, und eine Verbindung braucht zwei. Bewusst ausgelassen (§5-Spec, Abschnitt 9). |
| 10 | **Spike-Nachlauf für 13 Bahnhöfe** | `npx tsx scripts/spike-datenrealitaet.ts` – gecacht, fragt nur die fehlenden ab, sobald Overpass stabil antwortet. |
| ~~11~~ | ~~**DB-Antwortschema der Wagenreihung prüfen**~~ ⛔ **nicht mehr prüfbar, 05.09.2026** | Am 04.09. versucht, dabei den Grund gefunden: Der Endpunkt existiert nicht mehr. Das handgebaute Fixture lässt sich gegen nichts mehr verifizieren. Siehe „Die Wagenreihung ist tot“. RIS::Stations, Timetables und FaSta bleiben gegen echte Antworten verifiziert. |
| 16 | **Ersatz für die Wagenreihung suchen** | Falls die Wagenposition zurückkommen soll: Der Marketplace müsste ein Formations-Produkt führen, das abonnierbar ist. Drei geratene Pfade antworteten am 04.09. mit 404 – zu klären wäre es im Marketplace-Katalog, nicht durch Raten. |
| 12 | **Ticket-PDF-Import** | Im Prototyp als UI-Flow vorhanden, laut Konzept Stufe 2. Backend fehlt. |
| 13 | **Repo-Sichtbarkeit** | Repo ist öffentlich. Inhaltlich unbedenklich (Historie mehrfach auf Secrets geprüft, zuletzt 28.08.2026 über alle Blobs – 0 Treffer), aber bewusst zu entscheiden. |
| ~~14~~ | ~~**Frontend kann keine Komponenten testen**~~ ✅ **erledigt 31.08.2026** | jsdom und Testing Library sind eingerichtet (`vitest.config.ts`, `src/test-setup.ts`). Die Komponententests waren die Voraussetzung für den Frontend-Umbau. |
| 17 | **RIS::Stations hat keinen Rückfallweg** | Die einzige Quelle ohne Zeile in der Degradationstabelle. Fällt sie aus, ist die App tot – und über `stationID` hängt FaSta und damit §5 daran. Kleinste wirksame Maßnahme: StaDa ist bereits abonniert und ungenutzt und führt dieselbe Bahnhofsnummer. Siehe „ISR verworfen", Abschnitt „Was das über RIS::Stations sagt". |
| 18 | **OpenStation auswerten** | Offener NeTEx-Datensatz der DB InfraGO, kein Schlüssel: `Level` gegen den Ebenensprung, Aufzüge + SIRI FM als FaSta-Gegenstück, 65.007 Wegekanten als Gegenprobe zu OSM. **Löst §4.3 nicht** – nur 10 % der Bahnsteige tragen Koordinaten, die Kanten keine Länge. Zahlen und Grenzen im Abschnitt „ISR verworfen". |
| ~~19~~ | ~~**ISR Data Service beziehen**~~ ⛔ **entschieden dagegen, 06.09.2026** | Zu teuer (1.846 €/Jahr) – und ohnehin nur für Zugangsberechtigte nach ERegG § 1 Abs. 12. Der vorhandene Schlüssel deckt es nachweislich nicht ab. **Nicht erneut aufmachen.** |
| 15 | 🔶 **Noch EIN geratener Schwellenwert** | `ERKENNUNG_MAX_M` ist seit dem 07.09.2026 erledigt: Die Zahl ist an den Suchradius des Servers gebunden (1000 m) und damit begründet, nicht geraten – siehe „M3: die 2000 m waren nie eine Schwelle". Offen bleibt `NOTBEHELF_TTL_MS`. Ursprünglicher Eintrag: `ERKENNUNG_MAX_M = 1000` (Genauigkeitsbudget der Bahnhofserkennung) und `NOTBEHELF_TTL_MS = 600000` (Cache-Frist für Stufe 3; über `GRAPH_NOTBEHELF_TTL_MS` ohne Neubau verstellbar) sind begründete Startwerte ohne Messung dahinter. Erst die Mobilabnahme zeigt die Richtung. *Der dritte Wert, `MINDEST_SCHRITT_MS = 8000` (Anzeigedauer je Schritt), ist am 02.09.2026 entfallen: Die Schrittanzeige rückt nicht mehr nach Zeit vor, damit gibt es keine Anzeigedauer mehr zu raten.* |
| 32 | **Veraltete Planansichten** | Die Leinwand `design/schema/` und die ältere Planmappe (Artefakt `c9fced14…`) zeigen den Stand vor den Symbolen; die neue ist im Abschnitt „Hier weitermachen" verlinkt. Die alte zu überschreiben verlangt, ihre Fassung unter `C:\Users\jbeer\.claude\projects\…` zu lesen – nur nach Rückfrage. |
| 33 | **Drei Spike-Skripte schreiben in einen alten Temp-Ordner** | `spike-schema-geometrie.ts`, `spike-schema-overpass-live.ts` und `spike-wagenreihung-geometrie.ts` tragen den Scratchpad-Pfad einer früheren Sitzung (`…/6db04a47…/scratchpad/schema-geometrie`) – außerhalb des Projekts. Auf `backend/osm-ablage/` umstellen oder löschen; es sind Wegwerfsondierungen. |
| 34 | **Lücken der Ablage füllen** | Von der Liste `LAUF_3` fehlen 54 Bahnhöfe in der Ablage (Overpass lieferte am 14.09. nicht). `osm-ablage-fuellen.ts` braucht Netz und liest den Tresor – nur nach Rückfrage. |
| ~~35~~ | ~~**Braunschweig barrierefrei an der Produktion nachmessen**~~ ✅ **erledigt 16.09.2026** | Gegen die frisch ausgelieferte Produktion (EVA 8000049, Gleis 1 → 6, `variante=barrierefrei`, ab der Mitte): **192 s, 12 Schritte, keine Treppe, kein Hinweis** – dieselbe Zahl wie offline. Die 191 s vom 07.09. waren der alte Stand, nicht eine andere Messung. Der Bahnsteig meldet seine Enden als `N`/`S`. |

### P1 – Standort & Live-Navigation

| P1-Task | Status |
|---|---|
| 1 – Backend-Umkreissuche im stations-Client | ✅ fertig, Review sauber (`e914b87`) |
| 2 – `/api/stations` mit `lat`/`lon` | ✅ fertig, Review nachgeholt, Fehler behoben (`d6bc572`); **gegen die echte API verifiziert** (28.08.2026) |
| 3 – Frontend-Testinfrastruktur, Schwellen, Haversine | ✅ fertig, 4 Tests (`6a5e534`) |
| 4 – Ankunfts-Zustandsmaschine + Zielermittlung | ✅ fertig, 9 Tests (`8c225e8`) |
| 5 – Bahnhofserkennung mit Rundung | ✅ fertig, 6 Tests (`e99840d`) |
| 6 – `useStandort`-Hook | ✅ fertig, bewusst ohne Unit-Tests (`6e2d820`) |
| 7 – Bahnhof in der Eingabe vorbelegen | ✅ fertig, gegen den Fixture-Modus geprüft (`fe9e9a6`) |
| 8 – Positionspunkt + Genauigkeitskreis auf der Karte | ✅ fertig, 3 Tests (`60784a8`) |
| 9 – Ankunftsvorschlag + „Angekommen"-Screen | ✅ fertig (`60a9ead`) |
| 10 – Zustand „Zug ist abgefahren" | ✅ fertig (`5183298`) |
| 11 – HTTPS | ✅ **gekürzt umgesetzt** (`20700dd`): Dev-Server schaltet auf HTTPS, sobald `frontend/.cert/` Zertifikate enthält. Das `Caddyfile` entfällt – Fly.io und Vercel terminieren TLS selbst |
| 12 – Mobilabnahme + README | 🔶 README nachgezogen, **Abnahme am Gerät offen** |

**Zwei Entscheidungen aus der Vorflug-Prüfung, die für Reviews gelten:**

1. `haversineM` wird bewusst aus `backend/src/core/graph.ts` nach `frontend/src/standort/distanz.ts` gespiegelt. Getrennte npm-Pakete, kein Import über die Grenze möglich; bestehende Projektkonvention (`api/typen.ts`). **Plan gilt.**
2. `useStandort.ts` bekommt bewusst **keine** Unit-Tests – die Datei enthält keine Entscheidungslogik, die steckt in `ankunft.ts`/`distanz.ts`/`bahnhofErkennung.ts`. Abgesichert wird sie in der Mobilabnahme (Task 12). **Plan gilt.**

Der Ausführungs-Ledger liegt unter `.superpowers/sdd/2026-08-27-standort-und-navigation/progress.md` (gitignored) und hält Commits, Rulings und zurückgestellte Minor-Findings fest.

## Deployment-Stand (28.08.2026, abgeschlossen)

Beide Ziele laufen, die Kette ist Ende-zu-Ende geprüft.

| | Adresse | Stand |
|---|---|---|
| **Frontend** (Vercel) | <https://umstieg.vercel.app> | ✅ Vite-Build, `VITE_API_BASE` einkompiliert |
| **Backend** (Fly.io) | <https://umstieg-backend.fly.dev> | ✅ 1 Maschine, Region `fra`, Health-Check grün |
| **GitHub** | <https://github.com/jbee827-sys/Umstieg.> | ✅ `feat/mvp` und `main` gleichauf (31.08.2026) |

Verifiziert am 28.08.2026 gegen die Produktion:

```
/api/health                          HTTP 200
/api/stations?q=Berlin Hbf           HTTP 200   4 Treffer, echte Koordinaten
/api/stations?lat=&lon=              HTTP 200   Umkreissuche (P1 Task 2)
/api/board/8000105?type=dep          HTTP 200   Verspätung + Gleiswechsel erkannt
/api/route?eva=8011160&gleisAn=6&gleisAb=14
                                     HTTP 200   Stufe 1, 30 Schritte, 380 s
```

Der Durchstich läuft damit erstmals gegen **echte** DB-Daten und echtes
Overpass, nicht mehr gegen Fixtures.

### Vier Fallen, die dabei aufgeschlagen sind

**1. Fly legt ungefragt eine zweite Maschine an.** `min_machines_running = 1`
ist eine Unter-, keine Obergrenze. Zwei Maschinen teilen weder Poller-Zustand
noch Graph-Cache – jede pollt die DB-APIs eigenständig und füllt ihren eigenen
Overpass-Cache, also genau die Verdopplung, die Konzeptkorrektur 1 vermeiden
will. **Deploys brauchen deshalb `--ha=false`**, festgehalten in `fly.toml` und
`docs/deployment.md`:

```powershell
flyctl deploy E:\jbeer\Claude-code\Umstieg\backend --ha=false
flyctl machines list                     # es darf genau eine geben
```

**2. `vercel link` will das Backend nach Vercel deployen.** Die CLI schreibt
ungefragt einen `experimentalServices`-Block in `vercel.json`, der `backend/`
unter `/_/backend` mitdeployen würde – genau die Zusammenlegung, gegen die
`docs/deployment.md` argumentiert. Zweimal passiert, zweimal zurückgesetzt.
**Nach jedem `vercel link` oder `vercel deploy` die `vercel.json` prüfen.**

**3. `0.0.0.0` reicht Fly nicht – es muss `::` sein.** Der Fly-Proxy
verbindet sich mit der Maschine über deren **private IPv6-Adresse**
(`fdaa:…`). Bindet der Server auf `0.0.0.0`, lauscht er nur auf IPv4: Die App
läuft, meldet sich gesund, und ist von aussen trotzdem tot. Am 31.08.2026 in
Produktion gemessen:

```
http://127.0.0.1:3001/api/health                     → {"status":"ok"}
http://[fdaa:be:db0f:a7b:1c0:f24d:ac5a:2]:3001/…     → Connection refused
```

Fly meldet das als `[PU03] unreachable worker host … this is a Fly issue` –
was nach einem Plattformausfall klingt, aber nur heisst: kein erreichbarer
Kandidat. `flyctl machines list` zeigte dabei durchgehend `started` und
`1/1 passing`. **Die Zeile stand seit dem ersten Commit unverändert**, und bis
zum 30.08. funktionierte alles; geändert hat sich der Weg, den Fly nimmt.
`LISTEN_HOST = '::'` in `src/server-host.ts` nimmt beide Protokolle an und
macht die App von dieser Wahl unabhängig.

Kein Test hätte das gefunden: Die ganze Suite läuft über `app.inject()`, das
gar keinen Socket öffnet. `test/listen.test.ts` ist der erste Test, der
wirklich lauscht – und er scheitert ohne den Fix mit demselben
`ECONNREFUSED ::1` wie der Proxy.

**4. CORS ist der leicht vergessene vierte Schritt.** Ohne `CORS_ORIGIN`
antwortet das Backend zwar mit 200, aber ohne `access-control-allow-origin` –
der Browser blockiert dann jeden Aufruf, und im Frontend sieht es aus, als
täte die App gar nichts. Gesetzt sind alle drei Produktions-Aliase; fremde
Herkünfte bekommen weiterhin keinen Header (keine Wildcard).

### DB API Marketplace

Abonniert auf **einer** Anwendung (das Backend nutzt ein einziges
Schlüsselpaar für alle Aufrufe – verteilt man die APIs, liefert der Rest 401):

| API | Nutzung | Schema geprüft |
|---|---|---|
| RIS::Stations | Bahnhofssuche, Umkreissuche, Gleisliste, **Verkehrsstellengruppe** | ✅ gegen echte Antwort (Fixtures aufgezeichnet 31.08.) |
| Timetables | Ankunfts-/Abfahrtstafel, SSE-Poller | ✅ gegen echte Antwort |
| FaSta | Aufzüge/Rolltreppen bei `variante=barrierefrei` | ✅ gegen echte Antwort (31.08.): StaDa-Nummer 1071 → 69 Anlagen |
| StaDa | derzeit ungenutzt | ⬜ abonniert |

**Zwei Fehler in RIS::Stations, die nur mit echten Schlüsseln sichtbar wurden**
(behoben in `fdcabe7`):

1. Die Basis-URL stand unter `/db/apis/ris-stations/v1` statt unter
   `/db-api-marketplace/apis/ris-stations/v1` wie alle anderen Produkte. Das
   ergab ein dauerhaftes **401**, das wie ein Schlüsselproblem aussah.
2. `Accept: application/json` quittiert das Gateway mit **415**
   `No acceptable representation`. RIS::Stations verlangt den Vendor-Media-Type
   `application/vnd.de.db.ris+json`. Die anderen APIs sind mit
   `application/json` zufrieden.

Das Antwortschema selbst stimmte unverändert – die handgebauten Fixtures waren
richtig geraten. Timetables ebenso: Verspätung und Gleiswechsel werden aus
echtem IRIS-XML korrekt erkannt.

### Zugangsdaten

Die Schlüssel liegen **nicht im Repo**, sondern im Tresor
`E:\jbeer\.secrets\` (seit 02.10.2026; vorher `C:\Users\jbeer\.secrets\`).
Skripte lesen ihn über `backend/scripts/secrets.ts` – der Pfad steht nur dort.
Konvention und Fallstricke stehen dort in `README.md`; `.env.example` verweist
darauf und bleibt leer. Einzelheiten: [`docs/deployment.md`](./docs/deployment.md).

> ⚠️ **Vorgeschichte, als Warnung.** Die Datei lag zwischenzeitlich als
> `backend/.env.txt` im Arbeitsbaum – Notepad hängt beim Speichern `.txt` an,
> und `.gitignore` sperrte nur exakt `.env`. In einem **öffentlichen** Repo
> hätte ein `git add -A` die Schlüssel veröffentlicht. `.gitignore` deckt jetzt
> `.env` und `.env.*` ab (mit Ausnahme von `.env.example`). Die Historie wurde
> über alle Blobs geprüft: **0 Treffer**.

Beim Eintragen auf **LF-Zeilenenden und keine Leerzeichen** achten – Notepad
schreibt CRLF und hängt beim Einfügen gern ein Leerzeichen an. Das Zeichen wird
Teil des Schlüssels, und das Ergebnis ist ein stiller 401. Genau so passiert.

### Zweige

Gearbeitet wird auf **`feat/mvp`**. `main` wird nach jedem abgeschlossenen
Abschnitt nachgezogen – bisher per Fast-Forward, weil `main` stets direkter
Vorfahr war und es deshalb nichts zu verschmelzen gab:

```bash
git checkout main && git merge --ff-only feat/mvp && git push origin main
git checkout feat/mvp        # weiter geht es hier
```

Das Deployment hängt **nicht** am Zweig: `flyctl deploy` schiebt den Stand des
Arbeitsverzeichnisses hoch, unabhängig davon, wo HEAD gerade steht.

### Eigenheiten dieses Rechners

1. **`!`-Befehle laufen in Git Bash, nicht in PowerShell.** Also Unix-Syntax:
   `/e/jbeer/Claude-code/...` statt `E:\jbeer\Claude-code\...`, `&&` statt
   `;`, und keine Cmdlets wie `iwr`/`iex` (daran scheiterte das
   Fly-Install-Skript).
2. **Jeder Aufruf startet im Arbeitsbereich, nicht im Projektordner.**
   Deshalb in jedem Befehl `cd /e/jbeer/Claude-code/Umstieg/...` voranstellen –
   sonst „fatal: not a git repository". Der Arbeitsbereich liegt inzwischen auf
   `E:\jbeer\Claude-code`; `D:\Claude-code\Umstieg` ist eine ältere Kopie
   desselben Repos und wird nicht mehr nachgezogen.
3. **Der Befehl heisst `flyctl`, nicht `fly`.** Der Windows-Installer (winget)
   legt ausschliesslich `flyctl.exe` an; die Kurzform `fly` erzeugt nur das
   Unix-Installskript. `fly deploy` quittiert PowerShell deshalb mit
   „Der Begriff ist nicht als Name eines Cmdlet erkannt". Der Paketordner
   `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Fly-io.flyctl_*` steht bereits
   im PATH – es fehlt nichts ausser dem richtigen Namen.
4. **`flyctl auth login` braucht ein echtes Terminal.** In der Agenten-Shell
   fehlt das TTY: `flyctl auth login requires an interactive terminal`. Einmal in
   einem normalen Terminalfenster anmelden – danach liegt der Token in
   `~/.fly/config.yml` und alle weiteren Aufrufe funktionieren.

## Projektstand (31.08.2026)

| Arbeitspaket | Status |
|---|---|
| Task 1 – Repo + Backend-Gerüst (Fastify, `/api/health`, vitest) | ✅ fertig, getestet |
| Task 2 – Frontend-Gerüst (Vite React TS, Proxy) | ✅ fertig, Build grün |
| Task 3 – Overpass-Client (Fallback/Retry) + Fixture-Recorder + 3 echte Fixtures | ✅ fertig, 5 Tests grün |
| Task 4 – Graphbau aus OSM (inkl. Bahnsteig-**Relationen**, Ebenen-Instanzen) | ✅ fertig, 8 Tests grün |
| Task 5 – Klassifikation Stufe 1/2/3 + Verbundenheitsanalyse | ✅ fertig, 7 Tests grün |
| Task 6 – **Datenrealitäts-Spike** (40 Bahnhöfe) | ✅ ausgeführt (27/40 erfasst, Rest Overpass-Ausfälle) – **Tor: keine Prioritätsverschiebung** |
| Task 7 – Routing (Dijkstra, 3 Varianten, Abbiege-Malus) | ✅ fertig, 17 Tests grün |
| Task 8 – Gehzeit + Ampel **relativ zur Gehzeit** | ✅ fertig, 11 Tests grün |
| Task 9 – Textgenerierung (Richtungsskala, Zusammenfassung, ca.-Flag) | ✅ fertig, 6 Tests grün |
| Task 10 – Synthesemodell Stufe 3 + gleicher Bahnsteig | ✅ fertig, 6 Tests grün |
| Task 11 – RIS::Stations-Client hinter Env-Guard | ✅ fertig, 6 Tests grün (Endpunkte verifiziert 25.08.2026) |
| Task 12 – REST-API `/api/route` + `/api/stations` + LRU-Cache + GeoJSON | ✅ fertig, 8 Tests grün |
| Task 13 – Frontend: Eingabe, Schrittliste, Ampel (Design-Tokens) | ✅ fertig (manuelle Browser-Sichtprüfung auf Mobilgerät steht noch aus) |
| Task 14 – Karte (MapLibre, Ebenen-Umschalter, lazy geladen) | ✅ fertig (WebGL-Sichtprüfung im Browser empfohlen) |
| Task 15 – Live-Tafeln, Zugauswahl, Wagenreihung, farbige Ampel | ✅ fertig (Timetables-XML + ist-wr-JSON, hinter Env-Guard bzw. öffentlich) |
| Task 16 – SSE-Überwachung, FaSta | ✅ fertig, 112 Tests grün |
| Task 17 – Degradationstests, Docker, Mobile-Feinschliff | 🔶 `Dockerfile` steht und läuft in Produktion (28.08.2026); `docker-compose.yml`/Caddy entfallen; Degradationstests und Mobile-Feinschliff offen |
| P1 – Standort & Live-Navigation (12 Tasks) | 🔶 Tasks 1–11 fertig; Task 12 (Mobilabnahme am Gerät) offen (Tabelle oben) |
| Rechtliches – Impressum, Datenschutz, lokale Schriften | ✅ fertig, im Browser geprüft |
| Schrittnavigation (Spec 30.08.2026, 8 Tasks) | ✅ fertig, **im Browser gegen die Produktion verifiziert** (30.08.) |
| Verkehrsstellengruppen + Cache-Frist + FaSta-Adressierung (31.08.2026) | ✅ fertig, **gegen die echte DB-API verifiziert** (31.08.) |
| Frontend-Umbau nach dem Designkonzept (31.08.2026) | ✅ fertig – fünf Bildschirme, Navigationsleiste, Schema statt Karte, Gleiswechsel als Vorschlag; **Browser-Sichtprüfung offen** |

**Tests:** `cd backend && npm test` → **221 von 221 grün**, `npm run lint` (`oxlint` + `tsc --noEmit`) sauber. Frontend: `cd frontend && npm test` → **138 von 138 grün** (jsdom + Testing Library), `npm run build` grün; `npm run lint` (seit 02.09.2026 ebenfalls `oxlint` + `tsc --noEmit`) sauber.

Die Backend-Suite läuft mit **`TZ=UTC`** (`vitest.config.ts`) – wie die Produktion. Ohne das sind Zeitzonenfehler auf einem deutschen Rechner unsichtbar; genau so ist der Fehler entstanden, dass die Zugauswahl nur abgefahrene Züge zeigte.

**Nicht maschinell geprüft:** Die Frontend-SSE-Anbindung (`api/sse.ts`, `LiveBanner`) und `useStandort.ts` sind nur über TypeScript und Build abgesichert – beide enthalten keine reine Logik, sondern sprechen Browser-APIs an. Der SSE-Endpunkt selbst wird dagegen in `test/live.test.ts` gegen einen echten HTTP-Server geprüft; `useStandort` gehört in die Mobilabnahme.

## Was Ende-zu-Ende funktioniert

Der Durchstich steht **in Produktion gegen echte Daten**: Eingabe → Route → Karte läuft real durch, verifiziert am 28.08.2026 über <https://umstieg-backend.fly.dev> (Berlin Hbf, Gleis 6 → 14, Stufe 1, 30 Schritte, 380 s). Bis dahin war das nur gegen das Berlin-Hbf-Fixture über den Vite-Proxy geprüft.

- **Routing-Kern vollständig:** OSM-Graph (inkl. Bahnsteig-Relationen und Ebenen-Instanzen) → Klassifikation Stufe 1/2/3 → Dijkstra in drei Varianten → deutsche Schritttexte → Gehzeit je Profil.
- **Degradiert statt auszufallen:** Kein Overpass, unbrauchbare OSM-Daten oder unbekanntes Gleis → Synthesemodell mit „ca."-Angaben und transparentem Hinweis. Keine DB-Schlüssel → 503 mit klarem Fehlercode, Frontend fällt auf EVA-Freitexteingabe zurück.
- **Live-Daten angebunden:** Ankunfts-/Abfahrtstafel (IRIS-XML, Soll + Änderungen zusammengeführt, Gleiswechsel und Verspätung erkannt), Zugauswahl per Antippen, Wagenreihung bestimmt den Startabschnitt am Bahnsteig.
- **Ampel relativ zur Gehzeit** (Konzeptkorrektur 4) mit 10-Sekunden-Countdown, grau solange keine Zugauswahl vorliegt.
- **Frontend nach Design-Tokens:** mobil zuerst, große Touch-Ziele, Text vor Karte; MapLibre-Karte mit Ebenen-Umschalter und ODbL-Attribution, lazy geladen (Hauptbundle bleibt bei ~200 KB).

Wichtigste Erkenntnis aus dem Spike: **74 % Stufe 1** – Indoor-Routing über OSM trägt, das Entscheidungstor wurde nicht ausgelöst.

## API (Stand Task 15)

- `GET /api/health` → `{ status: 'ok' }`
- `GET /api/board/:eva?type=arr|dep` → `TafelEintrag[]` (`{ zug, zeitSoll, zeitIst?, gleisSoll, gleisIst?, ziel }`; Soll aus `/plan`, Änderungen aus `/fchg` zusammengeführt). Abgefragt wird die **ganze Verkehrsstellengruppe** und nach `(zug, zeitSoll)` entdoppelt, sortiert nach Sollzeit – ohne das lieferte Berlin Hbf eine leere Tafel. Ein ausgefallener Bahnhofsteil nimmt die übrigen nicht mit; fallen alle aus, bleibt der Fehler stehen. Ohne Schlüssel: **503**.
- `GET /api/stations?q=<Suchtext>` **oder** `?lat=&lon=` → `BahnhofTreffer[]` (`{ name, eva, lat, lon }`). Die Koordinatenvariante (P1 Task 2) sucht im Umkreis von 1000 m; der Radius ist bewusst eine Serverentscheidung und steht in `routes/api.ts`. Die Werte sind bereits im Browser auf 3 Nachkommastellen (~110 m) gerundet – Rohkoordinaten verlassen das Gerät nie (`standort/bahnhofErkennung.ts`). `q` und `lat`/`lon` schließen sich aus → **400** `parameter-ungueltig`; das gilt auch für eine einzelne Koordinate oder Werte außerhalb −90…90 bzw. −180…180. Weder noch → **400** `parameter-fehlt`. Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET`: **503** `{ fehler: 'db-zugang-fehlt' }`.
- `GET /api/live/:eva?zugAn=&zugAb=` → **SSE-Strom** mit den Ereignissen `gleiswechsel`, `verspaetung`, `heartbeat` (Payload `{ typ, zug?, alt?, neu?, zeitstempel }`). Gepollt wird **einmal je EVA**, unabhängig von der Zahl der Zuschauer; die Zugparameter filtern nur die Zustellung. Verbindungsabbruch meldet den Abonnenten ab, der letzte Abmelder stoppt den Poller.
- `GET /api/route?eva=&gleisAn=&gleisAb=&zugAn?=&wagen?=&abschnitt?=&profil?=&variante?=` → `RouteErgebnis` (`zugAn`+`wagen` → Wagenreihung bestimmt den Start-Abschnitt; keine Daten → Bahnsteigmitte mit Hinweis):
  - `profil`: `zuegig | normal | langsam` (Default `normal`) · `variante`: `schnellste | einfachste | barrierefrei` (Default `schnellste`)
  - Antwort: `{ stufe, schritte[], gehzeitSek, karte, hinweise[] }`; jeder Schritt trägt zusätzlich `sekunden` (Summe = `gehzeitSek`, Invariante im Test), `level` (Ebene, auf der der Schritt endet) und `knotenVon`/`knotenBis` (Bereich im Routenpfad, daraus zeichnet die Karte das Teilstück). Alle vier sind optional – ältere Clients brechen nicht.; `karte` = GeoJSON-FeatureCollections je Ebene (Routenlinie + Start-/Zielmarker, `[lon, lat]`)
  - Degradation: Overpass-Ausfall oder unbrauchbare OSM-Daten → Synthesemodell (`stufe: 3`, „ca."-Distanzen, Hinweis); gleicher Bahnsteig → Kurzantwort ohne Routing; Wagenreihung ohne Daten → Bahnsteigmitte mit Hinweis
  - Fehler: **400** `parameter-fehlt`/`parameter-ungueltig`, **404** `gleis-unbekannt`/`keine-route`, **503** `db-zugang-fehlt`
  - Cache: Graph je **Bahnhof** (Schlüssel = sortierte EVA-Gruppe, LRU max 100), im RAM. Frist nach Qualität: Stufe 1/2 24 h, Stufe 3 nur 10 Minuten (`GRAPH_NOTBEHELF_TTL_MS` verstellt sie)

## UI-Design (importiert aus Claude Design, 24.08.2026)

Vollständig gesichert unter `design/` (Projekt „Umstieg mobile app design",
`Umstieg.dc.html` + Modernist-Design-System + iOS-Frame + dc-Runtime).

**Am 31.08.2026 umgebaut** – bis dahin folgte die App dem Konzept*text* statt
dem Design*bild*; Ursache und Belege in
[`docs/2026-08-31-design-abgleich.md`](./docs/2026-08-31-design-abgleich.md),
Spec und Plan unter `docs/superpowers/`.

**Gebaut sind fünf Bildschirme** mit unterer Navigationsleiste:

| Bildschirm | Inhalt |
|---|---|
| Eingabe | Bahnhofssuche, Gleise, Zugauswahl; Gehtempo und Darstellung unter „Einstellungen" (bis 05.10.2026 „Mehr einstellen") |
| Dashboard | Ampel **ab der Gleiseingabe**, Ankunfts-/Anschlussblock, zwei Routenknöpfe mit Minuten |
| Navigation | Ebenenschema, ein Schritt zur Zeit, echte Karte hinter „Mehr" |
| Störung | Gleiswechsel als **Vorschlag** – alt gegen neu, „Route übernehmen" |
| Angekommen | Grüne Fläche auf ⅓ mit weißem Haken, Kacheln Puffer/Abfahrt, Wagenkasten bei ICE/IC |

**Sechs Feinschliffe am 31.08.2026 nachgezogen:** Fußzeile nur auf der
Eingabe · Ampel mit Zeitleiste und Routenzeilen nach Entwurf · „Angekommen"-Knopf
auf der Weg-Seite · Angekommen-Fläche auf ⅓ statt Vollbild · globale rote
Störmeldung von oben, unabhängig von der Seite · einheitliche
Navigationsleiste auf allen Bildschirmen.

**Nicht gebaut, nur spezifiziert** (brauchen das Backend): Ticket-Import,
Wagenreihungsseite und die Variante „Mit Stopp: WC & Kiosk" – siehe
Abschnitt 8 der Spec.

**Drei Festlegungen, die vom Entwurf abweichen und warum:**

1. **Die Navigationsleiste ist eine Neuerung, kein Design-Rückstand.** Die
   „Screens"-Liste im Prototyp steht *ausserhalb* der Bildschirmrahmen – sie
   ist der Navigator des Design-Werkzeugs.
2. **Das Gehtempo bleibt**, eingeklappt. Im Entwurf kommt es nicht vor; es
   ersatzlos zu streichen wäre für langsame Gehende ein Rückschritt.
3. **Die echte Karte bleibt erreichbar.** Der Entwurf kennt keine
   Kartenbibliothek, aber für Wege über einen Vorplatz hilft die Geometrie.
   Bei Stufe 3 gibt es sie weiterhin gar nicht – dort wären die Koordinaten
   konstruiert.

- **Design-Tokens:** Modernist-System (`design/_ds/.../styles.css`) – Akzent `#ec3013`, Hintergrund `#f3f2f2`, Text `#201e1d`, Font „Archivo" (Heading 800), Grün `#0f7a4f`, Gelb `#e08a00`. Diese waren von Anfang an richtig übernommen.
- **Wichtig – Ampellogik ist RELATIV zur Gehzeit** (nicht absolut wie im Konzept 6.4): Grün ≥ 2× Gehzeit, Gelb 1–2× Gehzeit, Rot < 1× Gehzeit.


## Entwicklung starten

```bash
cd backend && npm install && npm run dev   # Backend auf :3001
cd backend && npm test                     # Testsuite
cd frontend && npm install && npm run dev  # Frontend auf :5173, Proxy auf :3001
npx tsx scripts/spike-datenrealitaet.ts    # Datenrealitäts-Spike (im Ordner backend/, dauert ~5 min, cached)
npx tsx scripts/record-fixture.ts <name> <lat> <lon>  # neues Overpass-Fixture
```

**Dev MIT DB-Zugang:** Die Schlüssel liegen im Tresor ausserhalb des Repos. In Git Bash, aus `backend/`:

```bash
npx tsx watch --env-file="E:/jbeer/.secrets/umstieg.env" src/server.ts
```

`npm run dev` allein lädt **keine** `.env` – es gibt weder `dotenv` noch `--env-file` in den Skripten. Ohne die Variablen läuft das Backend im degradierten Modus.

**Dev ohne DB-Zugang:** `FIXTURE_EVA=berlin npm run dev` (im Backend) → `/api/route` läuft gegen das Berlin-Hbf-Fixture (EVA 8011160, z. B. Gleis 6 → 14), `/api/stations` liefert einen festen Treffer – für die Namens- **und** die Umkreissuche. Keine externen Aufrufe.

**HTTPS in der Entwicklung (für Standorttests am Handy):** `navigator.geolocation`
liefert außerhalb von `localhost` nur in einem sicheren Kontext etwas. Liegen
Zertifikate in `frontend/.cert/`, schaltet Vite von selbst auf HTTPS um:

```bash
cd frontend
mkcert -install
mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem localhost <LAN-IP>
```

Die LAN-IP steht in `ipconfig`; ohne sie ist der Rechner vom Handy aus nicht
erreichbar. Fehlt `mkcert`: `winget install FiloSottile.mkcert`. Ohne
Zertifikate läuft der Dev-Server unverändert über HTTP – die Standortfunktionen
sind dann nur auf `localhost` verfügbar. `.cert/` ist gitignored.

## Deployment

Vollstaendige Anleitung: [`docs/deployment.md`](./docs/deployment.md).

Zwei Ziele, bewusst getrennt: **Vercel** liefert den statischen Frontend-Build,
**Fly.io** betreibt das Backend als dauerhaft laufenden Container. Das Backend
darf nicht schlafen gelegt werden – Poller, offene SSE-Verbindungen und der
24-h-Graph-Cache leben im Prozess.

Verbunden werden beide ueber eine Env-Variable, nicht ueber einen Proxy:

| Umgebung | `VITE_API_BASE` | Wirkung |
|---|---|---|
| lokal | leer | Aufrufe bleiben relativ, Vite-Proxy → `localhost:3001` |
| Vercel | `https://umstieg-backend.fly.dev` | Aufrufe gehen direkt ans Backend |

Ein `vercel.json`-Rewrite fuer `/api/*` waere naheliegend, ist aber bewusst
**nicht** gesetzt: der SSE-Strom liefe sonst durch Vercels Proxy und wuerde dort
gepuffert oder getrennt. Gegenstueck im Backend ist `CORS_ORIGIN` (kommagetrennte
Allowlist; leer = keine CORS-Header, die sichere Voreinstellung fuer lokal).

```bash
cd backend && flyctl deploy --ha=false   # Backend – ohne den Schalter legt Fly eine zweite Maschine an
vercel deploy --prod              # Frontend (aus dem Wurzelverzeichnis)
```

## Spike-Ergebnis (Task 6, 25.08.2026)

Report: [`docs/spike-datenrealitaet-ergebnis.md`](./docs/spike-datenrealitaet-ergebnis.md). Kernzahlen (27 von 40 Bahnhöfen erfasst, 13 wegen Overpass-Überlastung offen – Koordinatenliste bleibt, Wiederholung füllt den Cache nach):

- **Stufe 1: 74 %** (groß: 8/8, mittel: 8/11, klein: 4/8) → **Entscheidungstor NICHT ausgelöst**, Stufe-1-Pfad wie geplant.
- Abschnittsmarker (A–F) nur an 52 % der Bahnhöfe in OSM → Wagenpositions-Feature primär über DB-Stationsdaten (bestätigt Konzept).
- DB-Abschnittsdaten-Check weiterhin **blockiert auf Marketplace-Registrierung**.

## Live-Überwachung (Task 16, fertig)

- **Poller pro EVA** (`core/ueberwachung.ts`): Ein Abruf je Bahnhof, egal wie viele Clients zuschauen. `letzterStand` ist nach Zug **und Sollzeit** geschlüsselt – ein durchfahrender Zug steht in beiden Tafeln, und nur nach Zugnummer geschlüsselt hätten sich die Einträge gegenseitig überschrieben und bei jedem Poll eine Phantom-Verspätung erzeugt.
- **SSE-Endpunkt** (`routes/live.ts`): `reply.hijack()`, Ereignisse als `event:`/`data:`-Paare, Abmeldung am `close` des Requests. Geprüft gegen einen echten HTTP-Server, nicht per `inject()` – ein SSE-Strom endet nie und ließe `inject()` hängen.
- **FaSta in `/api/route`**: nur bei `variante=barrierefrei`, weil nur dort der Betriebsstatus über die Route entscheidet. Angewendet wird auf einer **Kopie** des Graphen (`kopiereGraph`) – sonst bliebe ein gerade defekter Aufzug 24 h im Graph-Cache gesperrt, lange nachdem er wieder läuft.
- **Frontend**: `api/sse.ts` (EventSource, Wiederverbindung fordert die Route neu an) und `components/LiveBanner.tsx`. Ein Gleiswechsel schreibt das neue Gleis in die Eingabewerte, berechnet die Route neu, zeigt den Banner und löst `navigator.vibrate` aus.

**MVP-Task 17 (teilweise):** Das `Dockerfile` steht und läuft seit 28.08.2026 in Produktion auf Fly.io. Der ursprünglich geplante Multi-Stage-Container, der auch `frontend/dist` ausliefert, sowie `docker-compose.yml` und der `Caddyfile` sind **entfallen** – Vercel übernimmt das Frontend, und Fly.io wie Vercel liefern HTTPS automatisch. Die Abhängigkeit von P1 Task 11 besteht damit nicht mehr.

Offen bleiben: **Degradationstests** (jede Zeile der Konzept-Tabelle Abschnitt 8 als eigener Test) und der **Mobile-Feinschliff**.

**Unabhängig davon offen:** Spike-Nachlauf für die fehlenden 13 Bahnhöfe, sobald Overpass wieder stabil antwortet (`npx tsx scripts/spike-datenrealitaet.ts`, gecacht – fragt nur die fehlenden ab).

## Verkehrsstellengruppen (31.08.2026)

Ein grosser Bahnhof ist mehrere Verkehrsstellen, und die App wertet jetzt alle
aus. Grundlage ist `groupMembers` aus RIS::Stations.

| Bahnhof | Leader | Gruppe | `stationID` |
|---|---|---|---|
| Berlin Hbf | 8011160 | 8011160, 8089021, 8098160 | 1071 |
| München Hbf | 8000261 | 8000261, 8098261, 8098262, 8098263 | 4234 |
| Frankfurt(M) Hbf | 8000105 | 8000105, 8098105 | 1866 |
| Köln Hbf | 8000207 | *nur sich selbst* | 3320 |

**Vier Eigenschaften, die das Verfahren bestimmen:**

1. **`groupMembers` steht nur in den SUCHANTWORTEN**, und dort nur beim
   führenden Eintrag. `stop-places/{eva}` trägt das Feld **gar nicht** – auch
   nicht für den Leader. Aufgelöst wird deshalb über den Namen plus Abgleich
   der `stationID`, die auf jedem Mitglied steht.
2. **Die Suche liefert immer nur den Leader.** `8098160` taucht weder in
   `by-name` noch in `by-position` auf – es *soll* nicht, es ist ein
   Gruppenmitglied. Das Frontend bekommt also von selbst die richtige Nummer
   und musste **nicht** geändert werden; die API-Schnittstelle ist unverändert.
3. **Bushaltestellen scheiden über die Gruppe aus, nicht über einen
   Verkehrsarten-Filter** – der würde hier versagen: „Berlin Hbf
   (Invalidenstraße)" führt `INTER_REGIONAL_TRAIN` (SEV-Busse sind als IRE
   gebucht) und „Hamburg Hbf ZOB" hat 19 „Gleise" namens `ZOB 1`…`ZOB 15`.
   Beide haben keine `stationID` und stehen in keiner Gruppe. `istGueltigeEva`
   fängt die sechsstelligen Nahverkehrs-IDs, die Gruppe fängt den Rest.
4. **Gleislisten werden nach Namen VEREINIGT, nicht verkettet.** München führt
   Gleis 13 unter drei Mitgliedern gleichzeitig – die Unterteilung ist
   betrieblich, nicht physisch.

**Was das konkret ändert** (Berlin Hbf, gemessen 31.08.2026):

```
Gleisliste   vorher  4 (nur 11–14)      nachher 20 (1–8, 11–16)
Abfahrtstafel vorher 0 Einträge         nachher 134
Route Gl. 6 → 14    Stufe 1, 30 Schritte, 380 s
Route Gl. 6 → 15    Stufe 1, 23 Schritte, 366 s   (S-Bahn, vorher unerreichbar)
FaSta               vorher [ ] (EVA)    nachher 69 Anlagen (StaDa 1071)
```

**Degradation:** Fällt die Suche aus, bleibt es bei der einen Verkehrsstelle –
lieber die Gleise eines Bahnhofsteils als gar keine Route. Fällt ein
Bahnhofsteil aus, liefern die übrigen trotzdem.

**Bekannte Lücke in DBs eigenen Daten:** `8089522` („Berlin Hbf (S-Bahn)",
Gleis 22, S21-Tunnel) hat **keine** `stationID` und steht in **keiner** Gruppe,
obwohl dort echte Züge halten (12 in der Stunde). Es bleibt bewusst ein eigener
Treffer in der Suchliste. Es per Namens- oder Umkreisheuristik einzugemeinden
würde „Invalidenstraße" und „Washingtonplatz" mitziehen – wir folgen DBs
Gruppierung.

## Standort & Live-Navigation (P1, Code fertig – Abnahme offen)

Was der Code tut, wenn die Standortfreigabe erteilt ist:

- **Bahnhof vorbelegen:** Der Standort wird genau einmal je Sitzung in einen
  Bahnhof aufgelöst. Genau ein Treffer im Umkreis → Vorbelegung; mehrere →
  Auswahlliste, weil ein geratener Wert bei Bahnhöfen an einem gemeinsamen
  Vorplatz schlechter ist als eine Frage. Ein Tastendruck im Bahnhofsfeld
  verdrängt die Erkennung dauerhaft.
- **Rohkoordinaten verlassen das Gerät nie.** Gerundet wird im Browser auf
  3 Nachkommastellen (~110 m) – genug zur Bahnhofszuordnung, zu grob für ein
  Bewegungsprofil. Kein `localStorage`, keine Cookies, kein Koordinaten-Logging.
- **Positionspunkt auf der Karte** mit Genauigkeitskreis als berechnetes
  Polygon (echte Meter, zoomfest – anders als MapLibres `circle-radius`). GPS
  kennt kein Stockwerk, deshalb liegt der Punkt auf einer eigenen Quelle und
  ist auf allen Ebenen sichtbar.
- **Ein Fix schlechter als 100 m wird nicht gezeichnet**, sondern begründet
  ausgeblendet. Ein Punkt 200 m daneben ist in einem 400-m-Bahnhof aktiv
  schädlich. Der Ankunftszähler pausiert dabei, ohne zurückgesetzt zu werden.
- **Ankunft wird vorgeschlagen, nie erzwungen.** 40 m Radius, 15 s Verweildauer,
  dann die Frage „Bist du an Gleis X angekommen?". Verglichen wird horizontale
  Distanz – wer in der Unterführung unter dem Zielbahnsteig hindurchgeht, ist
  horizontal am Ziel und eine Etage zu tief. Stufe-3-Routen bekommen gar keine
  Erkennung, nur einen manuellen Knopf: Deren Koordinaten sind konstruiert.
- **Nach der Abfahrtszeit** (plus 1 min Kulanz) trifft die Ampel keine Aussage
  mehr, statt dauerhaft rot zu leuchten.

**Ungeprüft ist all das im Browser.** Verifiziert sind die reinen Funktionen
über 22 Unit-Tests und die Serverseite gegen den Fixture-Modus. Der
Berechtigungsdialog, der Positionspunkt und die Ankunftserkennung am Gleis
brauchen die Mobilabnahme (Task 12).

## Abnahme im Browser (30.08.2026, gegen die Produktion)

Die fünf Punkte aus dem Umsetzungsplan, alle auf <https://umstieg.vercel.app>
durchgespielt – nicht lokal:

| Prüfung | Ergebnis |
|---|---|
| Aktiver Schritt hervorgehoben, erledigte gedämpft | ✅ Schritt 1 blass, Schritt 2 mit Rahmen und Tönung |
| Uhr rückt von selbst weiter | ✅ nach ~20 s von Schritt 1 auf 2, ohne Zutun |
| „Weiter"/„Zurück" | ✅ „Schritt 3 von 14", Korrektur bleibt bestehen |
| Karte wählt die Ebene des Schritts | ✅ Schritt 5 → Ebene 0, Schritt 10 → Unterführung (−1), selbständig |
| Handwahl behält Vorrang | ✅ von Hand auf −1 gestellt, Weiterschalten überstimmt sie nicht |
| Stufe 3 zeigt ein Schema | ✅ drei Balken, aktiver rot, Ebenen am Rand, **kein Kartenknopf** – MapLibre wird nicht geladen |

Dazu bestätigt: Zugauswahl mit echten kommenden Zügen inklusive Folgestunde,
Verspätungen mit durchgestrichener Sollzeit, der Genauigkeitshinweis
(„± 2000 m – zu grob"), Fußzeile mit Impressum und Datenschutz.

**Nicht geprüft und nur am Gerät prüfbar:** Berechtigungsdialog, GPS-Genauigkeit
in einer Bahnhofshalle, Ankunftserkennung am Zielgleis, und ob die automatische
Ebenenwahl unterwegs als Hilfe oder als Bevormundung ankommt.

## Was der Browser vorher gezeigt hat (29./30.08.2026)

Erste echte Sichtprüfung, mit drei Funden, die kein Test gefunden hätte:

1. **Bahnhofssuche lieferte Kennungen, die nicht antippbar waren.** Zwei der
   fünf Treffer für „Berlin Hbf" waren sechsstellige Nahverkehrs-IDs; ein Tipp
   darauf endete in einem unbehandelten **HTTP 500**. Behoben: `istGueltigeEva`
   filtert die Suche und schützt beide Endpunkte.
2. **Bei Stufe 3 zeigte die Karte eine Wiese in Mitteldeutschland.** Das
   Synthesemodell lag hart auf 51 N / 10 O und benutzte `info.lat`/`info.lon`
   nie. Behoben – und zusätzlich zeigt Stufe 3 jetzt ein Schema statt einer
   Landkarte.
3. **Die Schrift kam von Google Fonts.** Behoben: Archivo wird lokal
   ausgeliefert, der Build enthält keinen Google-Verweis mehr.
4. **Die Zugauswahl zeigte nur abgefahrene Züge.** Um 17:26 Uhr lieferte die
   Tafel Züge von 15:04 bis 15:53. `epTafelPlan` baute die Stunde mit
   `Date#getHours()`, also der **Prozesszeit** – der Container läuft in UTC,
   der DB-Fahrplan ist in deutscher Ortszeit definiert. Im Sommer zwei Stunden
   zu früh, im Winter eine. Behoben über `core/zeit.ts`, das die Zone
   ausdrücklich nennt. Dieselbe Ursache steckte in `heuteJJJJMMTT()` für die
   Wagenreihung. **Und es wurde nur eine Stunde geholt** – um 17:55 fehlte der
   18:05, also genau der Anschluss, um den es geht; jetzt sind es zwei Stunden.
5. **Die Bahnhofssuche schwieg bei Netzfehlern.** `fehler: 'netz'` fiel durch
   beide Auswertungszweige: keine Vorschläge, keine Meldung. Häufigste Ursache
   ist eine Vercel-Vorschau-Adresse, die nicht in `CORS_ORIGIN` steht.
6. **Die Bahnhofserkennung prüfte die Genauigkeit nicht.** Bei einem
   2000-m-Fix wurde ein 1000-m-Umkreis abgefragt – die Antwort war geraten.
   Neu: `ERKENNUNG_MAX_M`. Ausserdem verbrauchte ein grober Erstfix den
   einzigen Erkennungsversuch, was die Vorbelegung auf dem Handy unbrauchbar
   gemacht hätte (Netzortung zuerst, GPS Sekunden später).

Bestätigt hat die Prüfung: WebGL-Karte, Ebenen-Umschalter, ODbL-Attribution,
Bahnhofssuche gegen RIS::Stations, `watchPosition` und die Genauigkeitsgrenze
(„Standort zu ungenau (± 124 m) – Punkt ausgeblendet"). Kein horizontales
Scrollen; `App.css` hat **null** Media-Queries, das Layout ist rein fluid mit
`max-width: 430px`.

## Deployment 03.09.2026

Beide Ziele ausgeliefert, Stand `217bfe1` auf `feat/mvp` und `main`.

| Ziel | Ergebnis |
|---|---|
| **Fly.io** (`flyctl deploy --ha=false`) | ✅ genau **eine** Maschine (`flyctl machines list`), `/api/health` 200 |
| **Vercel** (`vercel deploy --prod`) | ✅ `Ready`, Alias `umstieg.vercel.app` |

Geprüft wurde am **Inhalt** des Produktionsbundles, nicht am Dateinamen (siehe
die Falle unter „Deployment 01.09.2026"): `Aktuell keine Meldungen`,
`ungelesene`, `Route übernehmen` sind da – und **`Alte Route behalten` ist
verschwunden**, der Beleg, dass die alte Störungsseite wirklich ersetzt ist.

**In Produktion im Browser gesehen:** Bahnhofssuche gegen die echte DB-API,
Route Gleis 6 → 14 in **Stufe 1** (der Ebenen-Fix vom 01.09. ist damit
nebenbei an echten OSM-Daten bestätigt, was am 01.09. am Overpass-Ausfall
scheiterte), „Schnellste 10 min" über „Barrierefrei 13 min" – die Reihenfolge
stimmt, ToDo 3g hält. Die Eingabe überlebte einen Reload aus dem
`sessionStorage`. Die Meldungsseite steht mit Live-Zeitstempel.

**Der Deploy hat einen Fehler zutage gefördert, der zwei Tage unbemerkt
lief** – siehe „Der Live-Strom war in Produktion nie erreichbar". Das Backend
wurde deshalb zweimal ausgeliefert: einmal mit dem Stand `d51fe87`, dann mit
dem Fix `217bfe1`.

## Deployment 01.09.2026

Beide Ziele ausgeliefert, Stand `4cb3664` auf `feat/mvp` und `main`.

| Ziel | Ergebnis |
|---|---|
| **Vercel** (`vercel deploy --prod`) | ✅ `Ready`, Aliase `umstieg.vercel.app`, `umstieg.online`, `www.umstieg.online` |
| **Fly.io** (`flyctl deploy --ha=false`) | ✅ rollierender Neustart, Smoke- und Health-Checks bestanden, `/api/health` 200 |

**Eine Falle beim Nachprüfen:** Der Dateiname des Frontend-Bundles taugt
**nicht** als Beleg. Vercel baut selbst und erzeugt einen anderen
Content-Hash als der lokale Build – `index-Ctmp4DAS.js` in Produktion gegen
`index-CJ9LyV78.js` lokal, bei praktisch gleicher Größe. Wer danach geht,
hält einen frischen Deploy für misslungen. Geprüft wird am **Inhalt**: Das
Produktionsbundle enthält „Regionalverkehr“, „Fernverkehr“ und „S-Bahn“, und
der alte Text „in der aktuellen Stunde“ ist verschwunden.

**Der Git-Push löst eigene Deploys aus.** Die Vercel-Git-Anbindung baute nach
`git push` zusätzlich einen Production-Deploy für `main` und einen Preview
für `feat/mvp`. Der CLI-Deploy war der neueste und trägt die Aliase – aber
die Liste in `vercel ls` zeigt drei Einträge, wo man einen erwartet.

> **Nachtrag 03.09.2026:** Der Satz „Der SSE-Strom steht nachweislich" aus
> dieser Zeit stützte sich auf `curl`. Er war für `curl` wahr und für den
> Browser falsch – der Strom sendete keine CORS-Header. Siehe „Der Live-Strom
> war in Produktion nie erreichbar".

### Was am 01.09. NICHT nachweisbar war

**Der Ebenen-Fix ist in Produktion nicht bestätigt.** Direkt nach dem Deploy
lieferte Berlin Hbf **Stufe 3** – und im Synthesemodell gibt es gar keine
OSM-Bahnsteige, der Fehler kann dort nicht auftreten. Die Antwort ist also
kein Beleg, weder dafür noch dagegen. Grund ist ein Overpass-Ausfall:
Gütersloh Hbf, ein kleiner Bahnhof, fiel nach 27 Sekunden ebenso auf Stufe 3
mit „Kartendaten nicht verfügbar“. Overpass war zu dem Zeitpunkt generell
nicht erreichbar, nicht unser Backend.

Belegt ist der Fix durch 187 Tests – darunter die Invariante „keine ebene
Kante zwischen zwei Ebenen“ – und durch die Sichtprüfung gegen dasselbe
Fixture. **Der Nachweis an der echten Produktion steht aus** und ist beim
nächsten Mal nachzuholen, sobald Overpass antwortet:

```bash
curl -s "https://umstieg-backend.fly.dev/api/route?eva=8011160&gleisAn=15&gleisAb=4&profil=normal&variante=schnellste"
# erwartet: "stufe": 1 und der letzte Schritt auf level -2, nicht 0
```

Nebenbei war zu sehen, dass der Cache-Fix vom 31.08. (ToDo 1b) arbeitet: Der
Stufe-3-Notbehelf hält nur zehn Minuten, der Bahnhof erholt sich also von
selbst, sobald Overpass zurück ist – statt einen Tag lang degradiert zu
bleiben.

## Die Zugauswahl (01.09.2026)

Die Auswahlliste zeigte alles, was die Tafel hergab. Über die drei
Verkehrsstellen von Berlin Hbf waren das **113 Abfahrten** – als eine einzige
Liste. Das Zeichnen dauerte so lange, dass die Bildschirmaufnahme in eine
30-Sekunden-Zeitüberschreitung lief; auf einem Handy wäre die Liste
unbenutzbar gewesen.

**Zwei Griffe, beide in `api/tafelauswahl.ts`** – reine Funktionen, ohne DOM
prüfbar:

**1. Ein Zeitfenster um jetzt.** −5 bis +45 Minuten (`FENSTER_VOR_MIN`,
`FENSTER_NACH_MIN`). Gemessen wird an der **wirklichen** Zeit
(`zeitIst ?? zeitSoll`): Ein Zug, dessen Sollzeit längst durch ist, der aber
verspätet noch fährt, gehört in die Liste – ihn wegzulassen wäre der
schlimmere Fehler. Der Abstand wird über Mitternacht gefaltet, sonst fällt um
23:50 der halbe Nachtverkehr heraus.

**2. Vier Kategorien** in fester Reihenfolge: Regionalverkehr, Fernverkehr,
S-Bahn, U-Bahn. Leere Kategorien fallen weg.

Die Zuordnung ist bewusst asymmetrisch: Die Fernverkehrsgattungen sind eine
kurze, geschlossene Liste (ICE, IC, EC, IR, RJ, NJ, EN, TGV, FLX …), `S` und
`U` sind eindeutig – **alles Übrige ist Regionalverkehr.** Der Grund steht in
den Daten: Berlin Hbf führt neben RE auch `OE` (Ostdeutsche Eisenbahn), und
die Liste der Regionalbetreiber ist offen (NEB, ODEG, ERB, WFB, VIA …). Eine
Whitelist dafür wäre immer lückenhaft, und ein danebenliegender Zug
verschwände in einer Kategorie „Sonstige“, die dem Reisenden nichts sagt.

**Am Bildschirm:** eine Auswahlfläche, darin die Blöcke durch einen Strich
getrennt. Jeder Block rollt für sich (`max-height: 216px`, rund vier Zeilen),
die Kategorieüberschrift bleibt dabei stehen (`position: sticky`). Hätte die
Fläche als Ganzes gerollt, müsste man an einer Kategorie vorbeiscrollen, die
einen nicht angeht – genau der Zustand, der behoben werden sollte.

Der Zeitpunkt des Fensters wird **beim Abruf** festgehalten, nicht bei jedem
Rendern von der Uhr gelesen. Sonst schöbe sich das Fenster bei jedem
Tastendruck im Formular weiter, und Züge verschwänden aus einer offenen
Liste, während man sie ansieht – derselbe Fehler wie `Date.now()` im Render,
nur an anderer Stelle.

Aus 113 Einträgen wurden 51 in drei Blöcken (Regional 8, Fern 10, S-Bahn 33).
16 Tests halten das fest.

## Lint-Warnungen aufgelöst (01.09.2026)

Vier Warnungen standen seit dem Frontend-Umbau, alle vier „bewusst“. Beim
Hinsehen war jede davon ein Hinweis auf einen überflüssigen zweiten
Rendergang – keine Geschmacksfrage.

| Datei | Warnung | Aufgelöst durch |
|---|---|---|
| `components/Zugauswahl.tsx` | `set-state-in-effect` | Die Tafel wird aus dem **Klick** geladen, der die Liste aufklappt, nicht aus einem Effekt, der auf `offen` lauscht. Der Effekt brauchte einen zusätzlichen Rendergang, nur um mit dem Laden zu beginnen. |
| `components/Eingabe.tsx` | `set-state-in-effect` (Vorbelegung) | Zustandsanpassung beim Prop-Wechsel statt Effekt – das von React dafür vorgesehene Muster. **Die Falle:** Als Anfangswert des Vergleichs darf nicht `erkannt` stehen, sonst ist der Vergleich beim ersten Rendern wahr und ein bereits erkannter Bahnhof landet nie im Feld. Der Anfangswert ist `null` – als Prop unmöglich. |
| `components/Eingabe.tsx` | `set-state-in-effect` (Vorschläge) | Ob Vorschläge sichtbar sind, steht beim Rendern schon fest (`sichtbareVorschlaege`). Sie im Effekt zu **löschen** war der einzige Grund, dort überhaupt Zustand zu setzen. |
| `App.tsx` | `purity` (`Date.now()` im Render) | Der Tick-Zähler ist durch den Zeitpunkt selbst ersetzt: `jetzt` ist Zustand, fortgeschrieben vom 10-Sekunden-Takt **und** von jedem Seitenwechsel. Ohne den zweiten Auslöser ginge die Ampel mit einer bis zu zehn Sekunden alten Zahl auf. |

Voraussetzung war Testabdeckung: `Zugauswahl` und `Eingabe` hatten **keine**.
Die 11 Tests in `Zugauswahl.test.tsx` und `Eingabe.test.tsx` wurden **vor**
dem Umbau geschrieben und liefen gegen den alten Code grün – nur so belegen
sie, dass der Umbau nichts verändert hat.

Ein Nachzieher: `setBildschirm` ist jetzt ein `useCallback` statt eines
nackten Setters. Der Linter kann seine Stabilität nicht sehen und will ihn in
der Abhängigkeitsliste von `berechne` genannt haben.

## Eingabe bleibt in der Sitzung (02.09.2026)

Wer vom Dashboard zur Eingabe zurückging oder unterwegs die Seite neu lud,
fand ein leeres Formular vor und musste Bahnhof, Gleise und Zugauswahl erneut
zusammensuchen — am Bahnsteig, mit dem Anschluss im Nacken, die teuerste
Stelle für verlorene Eingaben.

Die Eingabe liegt jetzt im **`sessionStorage`** (`src/sitzung/eingabespeicher.ts`).
Gespeichert wird beim Absenden, geleert bei „Angekommen". Bewusste Grenze: Wer
mitten im Tippen neu lädt, verliert das Halbfertige — von der Eingabeseite kommt
man ohnehin nur durch Absenden weg.

Gespeichert wird ein **Abbild des Formulars**, nicht `EingabeWerte`. Aus dem
Absende-Datensatz ließe sich die Maske nicht zurückbauen: Der gewählte Bahnhof
ist dort auf Name und EVA eingedampft, die Zugauswahl auf Zugname und Zeit.
Drei Dinge muss der Speicher aushalten, jedes mit eigenem Test: `sessionStorage`
**wirft** in Safaris privatem Modus schon beim Zugriff auf die Eigenschaft;
ein beschädigter oder fremder Eintrag darf das Formular nicht sprengen
(Schemaprüfung beim Lesen); ein Eintrag aus einer älteren Feldfassung wird über
einen Versionsschlüssel verworfen statt fehlgedeutet.

**Kein Zustimmungsbanner.** Die Speicherung ist für den ausdrücklich gewünschten
Dienst erforderlich (§ 25 Abs. 2 Nr. 2 TTDSG); `localStorage` wird weiterhin
nicht angefasst. Die Datenschutzerklärung sagte bis dahin „speichert nichts auf
deinem Gerät" und „weder `localStorage` noch `sessionStorage`" — beides ist
korrigiert, und **beide Zusagen hängen jetzt an Tests**: `eingabespeicher.test.ts`
belegt, dass nie in `localStorage` geschrieben wird, `Datenschutz.test.tsx`, dass
die Seite den neuen Zustand benennt und die alten Sätze nicht zurückkehren.
Zum zweiten Mal in zwei Tagen wäre sonst eine Zusage nebenbei unwahr geworden.

### Drei Rücknahmen in der Navigation

- **„Ich bin da" entfernt.** Der Ersatzknopf erschien nur ohne Zielkoordinate
  und tat dasselbe wie „Angekommen", der immer da steht. Der Streifen „Ja, ich
  bin da" bleibt — das ist die Rückfrage bei erkannter Ankunft, kein Dauerknopf.
- **Kein Weiterschalten nach Zeit mehr.** `aktiverSchritt` schätzte aus den
  Gehzeiten, welcher Schritt dran sein dürfte. Eine Uhr weiß aber nicht, ob
  jemand vor der Rolltreppe wartet oder stehengeblieben ist, um ein Schild zu
  lesen — sie schaltet trotzdem weiter, und dann steht auf dem Bildschirm ein
  anderer Schritt als der, den der Mensch geht. Übrig bleibt `schrittPosition`:
  reines Begrenzen des Nutzer-Zählers. `startZeit` und
  `navigation/schwellen.ts` sind damit entfallen.
- **„Angekommen" aus der Leiste.** Das Ende der Reise ist kein Ort zum
  Nachschlagen; als Dauereintrag lud die Leiste dazu ein, ihn mitten im Umstieg
  zu treffen und die laufende Navigation zu beenden. Erreichbar bleibt der
  Bildschirm über den Knopf auf der Weg-Seite.

### Nebenbei

`{meldung}` stand in vier Zweigen von `App.tsx` **doppelt** — die Störmeldung
wurde übereinander gezeichnet. Fiel nie auf, weil beide Kopien identisch
aussehen und die obere die untere verdeckt.

**Stand:** 154 Frontend-Tests (vorher 138), Lint, Typprüfung und Build sauber.

## Stille Fehler aufgelöst (02.09.2026)

Der Vorlauf: Am selben Tag war die Protokollierung eingeschaltet worden, damit
Rückfälle nicht länger lautlos geschehen. Diese Runde ist die Nachprüfung —
**was ist dabei liegengeblieben, und was lief die ganze Zeit still mit?**

Ein Muster zieht sich durch alle Funde: Zwei verschiedene Zustände werden auf
denselben Wert abgebildet, und danach ist der Unterschied nicht mehr
herstellbar. „Kenne ich nicht" und „konnte nicht fragen" ergeben beide eine
kurze Gleisliste. „Keine Daten" und „kein Netz" ergeben beide `null`. Wer den
Wert später liest, sieht nur noch den harmloseren der beiden Fälle.

| # | Fund | Ursache | Behoben durch |
|---|---|---|---|
| 1 | **`gleis-unbekannt` war eine Falschaussage** | Fällt die Gleisliste einer Verkehrsstelle aus, fehlt deren Gleis in der Vereinigung. Berlin Hbf führt Gleis 6 unter 8098160 — die Route Gleis 6 → 14 antwortete mit 404 „Eines der Gleise wurde an diesem Bahnhof nicht gefunden." Das Gleis gibt es; wir konnten nur nicht fragen. Der Zähler `gleisteileOhneAntwort` war am Vortag eingebaut worden — und wurde **von niemandem gelesen**. | `gleislisteUnvollstaendig()` trennt beide Fälle. Unvollständig → **503 `gleisliste-unvollstaendig`** mit eigener Meldung im Frontend: erneut versuchen hilft, korrigieren nicht. Vollständig → weiterhin 404. |
| 2 | **Das `gruppe-unbekannt`-Log war auf dem Hauptpfad tot** | `ermittleGruppe` fing den Ausfall intern ab und gab still `[eva]` zurück, warf also nie. Der Eintrag in `api.ts` hängt an einem `catch`, das damit unerreichbar war. **Grün war sein Test nur, weil das Mock warf.** | Der Rückfall gehört dem Aufrufer — er ist der Einzige mit Logger. `ermittleGruppe` wirft jetzt; `holeStationsInfo` fängt und vermerkt `gruppeUnvollstaendig`. |
| 3 | **Der Live-Poller verstummte lautlos** | `ueberwachung.pruefeJetzt` kehrte bei Timetables-Ausfall still zurück. Der SSE-Strom bleibt offen und wird einfach stumm — vom Fall „es ändert sich nichts" nicht zu unterscheiden. Bei der Protokollierungsrunde übersehen. | `Ueberwachung` nimmt einen Logger (eigene Minimal-Schnittstelle, `core` kennt Fastify weiterhin nicht). |
| 4 | **Ein Teilausfall überlebte seine Ursache um 24 Stunden** | `graphTtlMs` bewertete allein die Graphqualität. Ein sauberer OSM-Graph mit lückenhafter Gleisliste bekam die vollen 24 h — dieselbe Falle wie bei Stufe 3, nur an der anderen Datenquelle. | Die Frist richtet sich nach dem schlechteren von beidem. |
| 5 | **FaSta und Wagenreihung hinterließen keine Spur** | Von fünf dokumentierten Degradationen protokollierten nur drei. Diese beiden erzeugten allein einen Hinweis **für den Reisenden**. Der liest ihn und plant um; wer die Ursache abstellen müsste, erfuhr nichts. | Beide protokollieren. `holeWagenposition` trennt außerdem Ausfall (wirft) von „kennt den Wagen nicht" (`null`) — sonst wäre der neue Eintrag genauso tot gewesen wie Fund 2. |
| 6 | **Das Frontend prüfte weniger als das Backend** | Kein `suspicious`, kein `perf`, kein promise-Plugin, und `lint` rief kein `tsc --noEmit`. Diese Entscheidung war nie getroffen worden, sie hatte sich ergeben. | Profile angeglichen. Zutage kamen zwei hängende Zustände (siehe unten). |
| 7 | **Die Datenschutzerklärung war unwahr geworden** | Siehe eigener Abschnitt. | `disableRequestLogging` plus eigener Fehlerbehandler. |

### Zwei hängende Zustände im Frontend

Das angeglichene Lintprofil fand sie, nachgeprüft wurden sie von Hand:

- **`Zugauswahl`**: `holeTafel(...).then(...)` ohne `.catch()`. Wirft der Abruf,
  läuft `setLaden(false)` nie — „Tafel wird geladen …" dreht bis zum Neuladen
  der Seite. Ein hängender Spinner ist die unehrlichste aller Anzeigen: Er
  verspricht, dass gleich etwas kommt.
- **`App`**: Bei einem Wurf bliebe `erkennungLaeuft` dauerhaft `true`, und die
  Bedingung lässt dann keinen zweiten Versuch mehr zu — die Bahnhofserkennung
  wäre für die ganze Sitzung tot, ohne sichtbares Zeichen.

Beide Aufrufe werfen heute nicht: Der API-Client fängt selbst ab. Das ist eine
Zusicherung des Aufgerufenen, und daran darf ein Ladezustand nicht hängen.

### Was der Linter meldete und trotzdem falsch lag

Drei Regeln wurden Fundstelle für Fundstelle nachgeprüft und **abgeschaltet
statt befolgt** — die Begründung steht jeweils in `.oxlintrc.json`:

- `unicorn/no-array-sort` (8 Treffer): jedes `.sort()` läuft auf einem frisch
  erzeugten Array. Kein geteilter Zustand wird mutiert.
- `react/no-array-index-key` (3 Treffer): alle Schlüssel sind zusammengesetzt
  (`${i}-${schritt.text}`), und keine dieser Listen sortiert um.
- `eslint/no-await-in-loop`: die Treffer sind Wiederholschleifen — dort ist das
  sequenzielle `await` der Zweck.

Aufgenommen wurde dafür `promise/catch-or-return`, die in keiner Kategorie
steht und Fund 6 gefunden hätte. Vorsicht beim Lesen: `void promise.then(...)`
gilt ihr als bewusste Entsorgung und wird **nicht** gemeldet.

### Die Datenschutzerklärung war zwei Tage lang unwahr

Der schwerwiegendste Fund, und er entstand als Nebenwirkung des Fixes vom
Vortag. Das Einschalten von `logger` aktiviert Fastifys **Anfrageprotokoll**
mit — je Anfrage ein Eintrag mit `url` und `remoteAddress`. Auf der
Datenschutzseite steht:

> „Die Anwendung selbst schreibt keine Protokolle."
> „Ein Zugriffsprotokoll mit Koordinaten wird nicht geführt."

Beides war damit falsch. Die URL der Bahnhofssuche **ist** die Koordinate
(`/api/stations?lat=..&lon=..`); die Rundung auf ~110 m macht den
Personenbezug gröber, nicht abwesend. Nachgewiesen, nicht vermutet: Der Test
fand `52.52` und `remoteAddress` im Protokollstrom.

`disableRequestLogging: true` nimmt Fastify allerdings auch die Meldung eines
500ers ab — ein echter Serverfehler wäre danach völlig still gewesen, also
genau der Zustand, gegen den diese Runde angeht. Deshalb ein eigener
Fehlerbehandler: Er meldet das Routen**muster** (`/api/stations`) statt der
aufgerufenen URL. Der Unterschied zwischen beiden ist exakt die
Abfragezeichenkette. Fehler unter 500 gehen unprotokolliert durch, sonst kann
jeder Aufrufer das Protokoll von außen füllen.

Eine Zusage in einer Datenschutzerklärung ist keine Formulierung, sondern eine
Eigenschaft des Systems. `backend/test/datenschutz.test.ts` hält sie jetzt
fest, damit sie nicht ein zweites Mal nebenbei verlorengeht.

### Stand danach

**221 Backend-Tests** (vorher 196) und **138 Frontend-Tests** (vorher 137),
Lint, Typprüfung und Build auf beiden Seiten sauber. Neu: `unvollstaendig`,
`datenschutz` und `wagenreihung` — Letzterer hatte bis dahin keine eigene
Datei; seine Tests lagen in `timetables.test.ts` und sind mit umgezogen.

Ein Test hat dabei die Seite gewechselt: `Netzfehler → null (normaler Fall
laut Konzept)` behauptete mehr, als das Konzept hergibt. Als Normalfall nennt
es „ohne **Daten**", nicht „ohne **Netz**" — der Test hatte beides in einen
Topf geworfen, und genau diese Gleichsetzung machte den Ausfall unsichtbar.
Für den Reisenden ändert sich nichts: Beide Wege enden in derselben
Bahnsteigmitte mit demselben Hinweis. Nur im Protokoll stehen sie jetzt
auseinander.

## Meldungsseite (gebaut 03.09.2026)

Das Konzept wurde am 02.09. abgestimmt und am 03.09. umgesetzt. Der Bildschirm
`stoerung` ist darin **aufgegangen** – zwei fast gleiche Seiten für dasselbe
Ereignis wären eine Seite zu viel gewesen.

| Datei | Was |
|---|---|
| `src/meldungen/modell.ts` (neu) | Das Modell: `Meldung`, `Vorschlag`, Liste anlegen, ungelesen zählen, als gelesen markieren, Route nachtragen, Übernahme festhalten. Rein und ohne React – 12 Tests. |
| `src/screens/Meldungen.tsx` (neu) | Leerer Zustand, neueste Änderung, Verlauf – 16 Tests, darunter die sechs umgezogenen aus `Stoerung.test.tsx`. |
| `src/screens/Stoerung.tsx` | Entfallen. `verschiebung()`, `minutenText()` und der Ampelsatz sind mitgewandert. |
| `src/navigation/bildschirme.ts` | `stoerung` → `meldungen`, als vierter Leisteneintrag. |
| `src/components/Navileiste.tsx` | Abzeichen mit **Anzahl** statt des Punkts; das Kennzeichen sitzt jetzt dort, wohin es führt. |
| `src/App.tsx` | `vorschlag` → `meldungen[]`; Ankunft leert die Liste. |
| `src/screens/Dashboard.tsx` | `onStoerung` → `onMeldungen`, „Störung ansehen" → „Meldung ansehen". Nicht im Konzept vorgesehen, aber erzwungen: Der Zielbildschirm gab es nicht mehr. |

**Stand:** 179 Frontend-Tests (vorher 154), Lint, Typprüfung und Build sauber.

### Vier Entscheidungen, die das Konzept offenließ

Sie sind hier festgehalten, weil sie beim Bauen entstanden und nicht im
freigegebenen Text stehen.

1. **Die Meldung entsteht sofort, die Route wird nachgetragen.** Ein
   Gleiswechsel wird gemeldet, bevor die neue Route steht. Entstünde die
   Meldung erst mit der Route, zählte ein **fehlgeschlagener** Abruf gar nicht
   mit – und der Reisende erführe vom Wechsel allein aus dem Banner, das er
   wegwischen kann. Eine Meldung ohne Route sagt das auch: kein
   Übernehmen-Knopf, kein Ampelsatz (der hinge an der neuen Gehzeit, und die
   alte an seine Stelle zu setzen hieße, eine Vermutung als Tatsache
   auszugeben).

2. **Der Live-Strom läuft auf der Meldungsseite mit.** Er lief bis dahin nur
   auf Dashboard und Weg. Der leere Zustand sagt zu, dass noch hingehört wird,
   und der Zeitstempel daneben soll es belegen – wäre der Strom auf genau
   dieser Seite geschlossen, wäre beides unwahr, sobald jemand sie offen
   lässt. Im Browser nachgewiesen: Der Heartbeat traf **auf der offenen
   Meldungsseite** ein und setzte den Stand auf 12:38 Uhr.

3. **Die neueste Meldung trägt alles Vorherige mit.** Eine Verspätung setzt
   auf dem letzten Vorschlag auf, nicht daneben. Liegt ein noch nicht
   übernommener Gleiswechsel vor, trägt die neueste Meldung **neues Gleis UND
   neue Zeit** – sonst wäre nach einer Verspätung der Gleiswechsel nicht mehr
   übernehmbar, denn übernehmen lässt sich nur die neueste. Im Browser
   bestätigt: Nach einem Klick standen Gl. 12 und ab 12:57 gemeinsam im
   Dashboard.

4. **Eine übernommene Meldung zeigt keinen Knopf mehr.** Die Seite ist
   dauerhaft erreichbar, anders als ihr Vorgänger. Nach dem Übernehmen wäre
   „Route übernehmen" ein Knopf, der nichts mehr tut – schlimmer als keiner.
   `markiereUebernommen` hält den Zustand fest, die Seite stellt ihn fest.

### Was so blieb, wie es freigegeben war

Zähler und Hervorhebung nach der Tabelle des Konzepts (rotes Abzeichen mit
Anzahl bei Ungelesenem; nach dem Öffnen kein Abzeichen mehr, aber der Eintrag
bleibt hervorgehoben bis „Angekommen"). Gezählt werden Gleiswechsel **beider**
Züge und Zeitänderungen. Der neue Wert groß und in Rot, der alte daneben
durchgestrichen – mit `<s className="tafel-alt">`, demselben Mittel wie in der
Zugtafel. **Genau ein Knopf: „Route übernehmen".** „Alte Route behalten" ist
entfallen: Der Knopf verschwindet, die Entscheidung nicht – wer nicht
übernehmen will, verlässt die Seite.

**Das Lesen ist ein Ereignis, kein Zustandsabgleich.** Zurückgesetzt wird der
Zähler beim Öffnen der Seite und beim Eintreffen einer Meldung, während sie
offen ist. Ein erster Versuch legte das in einen `useEffect`, der auf die
Liste hörte, die er selbst setzte – der Linter meldete beides (`set-state-in-effect`,
`exhaustive-effect-dependencies`) und hatte recht.

### Wie P4 und P5 doch noch sichtbar wurden

Beide standen seit dem 01.09. auf „nicht erzwingbar": Ereignisse feuern nur bei
einer Änderung zwischen zwei Abfragen, und in einer Viertelstunde Beobachtung
änderte sich an der Tafel nichts. Statt weiter zu warten, wurde das Ereignis
**von aussen eingespeist**: eine Wegwerf-Attrappe (rund 45 Zeilen Node, im
Scratchpad, **nicht** im Repo) beantwortet `/api/stations`, `/api/route` und
`/api/board` mit aufgezeichneten echten Antworten und liefert unter
`/api/live/:eva` einen echten SSE-Strom – Heartbeat, nach 4 s ein
`gleiswechsel`, nach 16 s eine `verspaetung`. Ein zweiter Dev-Server mit
`VITE_API_BASE=http://localhost:3002` zeigt darauf; **am Anwendungscode wurde
dafür nichts geändert.**

Gesehen wurden damit: das rote Störband über dem Dashboard (P4), das Abzeichen
mit der **1** und dann der **2** an der Leiste, die Meldungsseite mit
durchgestrichener alter und roter neuer Zeit, Gehzeit-Gegenüberstellung,
Ampelsatz und Verlaufszeilen (P5), das Übernehmen mit beiden Änderungen
zugleich, und das Abzeichen, das nach dem Lesen verschwindet, während die
Hervorhebung bleibt.

**Was das nicht belegt:** dass das **Backend** eine echte Änderung erkennt.
Geprüft ist der Weg ab dem SSE-Strom – SSE-Client, `App`, Modell, Bildschirm,
Leiste. Die Erkennung selbst (`core/ueberwachung.ts`, Vergleich zweier
Timetables-Abfragen) hängt weiterhin allein an ihren eigenen Tests und ist nie
an einer echten Fahrplanänderung beobachtet worden. Das bleibt offen und ist
nach wie vor nicht erzwingbar.

### Bewusst nicht gebaut

Die Liste ist **unbegrenzt**. Ein Umstieg dauert Minuten und Ereignisse sind
selten; eine Obergrenze wäre ein geratener Schwellenwert mehr. Im Versuch
standen fünf Einträge übereinander – das trägt. Wer je eine lange Liste sieht,
weiß dann auch, wo zu kappen wäre.

## Reichweitenmessung (03.09.2026)

`@vercel/analytics` in `main.tsx`, nicht in `App.tsx`: Die Messung gehört zur
Auslieferung, nicht zur Anwendung, und die Komponententests sollen sie nicht
mitrendern. Im Vercel-Projekt war Web Analytics bereits eingeschaltet – es
fehlte allein das Skript.

**Die Datenschutzerklärung wäre damit zum dritten Mal in vier Tagen nebenbei
unwahr geworden.** Drei Sätze standen dem entgegen:

| Stelle | Sagte |
|---|---|
| Kurzfassung | „bindet keine Analyse- oder Werbedienste ein" |
| „Keine Cookies, kein Tracking" | „Es gibt keine Reichweitenmessung" |
| Anbieterliste | Vercel „liefert die Webseite aus" – ohne die Messung |

Alle drei sind korrigiert, und **beide Richtungen hängen an Tests**
(`Datenschutz.test.tsx`): dass die Messung benannt wird, und dass die alten
Formulierungen nicht zurückkehren.

### `beforeSend` ist keine Kosmetik

Vercel sendet je Seitenaufruf die aufgerufene Adresse. `analytik/ereignis.ts`
**schneidet die Abfragezeichenkette ab**, bevor irgendetwas das Gerät
verlässt – eine reine Funktion mit sechs Tests.

Heute trägt keine Adresse dieser App einen Parameter; die gerundete Koordinate
geht an die API, nicht in die URL des Frontends. Der Punkt ist die Zukunft:
Genau dieser Fall ist im **Backend schon einmal eingetreten**. Fastifys
Anfrageprotokoll trug `url`, und die URL der Bahnhofssuche IST die Koordinate –
nachzulesen unter „Die Datenschutzerklärung war zwei Tage lang unwahr". Dort
wurde daraufhin das Routen*muster* protokolliert statt der Adresse. Hier ist
die Entsprechung, dass die Abfragezeichenkette gar nicht erst mitgeht.

### Was rechtlich angenommen wurde

Die Messung läuft **ohne Cookies und ohne Speicher auf dem Gerät**. Damit
greift § 25 TTDSG nicht (der regelt Speichern und Auslesen auf dem Endgerät),
und ein Zustimmungsbanner ist nicht erforderlich. Als Rechtsgrundlage für die
Verarbeitung ist das berechtigte Interesse nach Art. 6 Abs. 1 lit. f DSGVO
genannt, mit Hinweis auf das Widerspruchsrecht nach Art. 21.

**Das ist die verbreitete Lesart für cookielose Messung, aber keine
Rechtsberatung** – wer es sicher wissen will, lässt es prüfen. Die Alternative
wäre ein Einwilligungsbanner, das die App bisher bewusst nicht hat.

## Die Leiste sass an drei verschiedenen Hoehen (03.09.2026)

Gemeldet als „die Leiste springt auf der Meldungsseite nach oben". Sie sprang
nicht – sie stand dort nie unten. `.navileiste` war `position: sticky;
bottom: 0`, und **Sticky hilft nur, wenn es etwas zu rollen gibt.** Auf einer
kurzen Seite gibt es das nicht; die Leiste stand einfach im Fluss, direkt
hinter dem Text. Auf allen anderen Seiten füllte der Inhalt die Höhe, und es
fiel nicht auf. Die leere Meldungsseite war der erste Bildschirm, der kürzer
ist als das Sichtfeld.

Beim Nachmessen kam ein zweiter Fall dazu: Dieselbe Leiste sass an **drei**
verschiedenen Höhen.

| Lage | Abstand zum Unterrand | Ursache |
|---|---|---|
| Kurze Seite | mitten im Bild | `sticky` ohne Rollweg wirkt nicht |
| Lange Seite, mitten im Rollen | 0 px | `sticky` greift |
| Lange Seite, am Ende des Rollens | 40 px | `padding-bottom` von `.app` |

**Drei Griffe:**

1. **`margin-top: auto`** statt `24px`. Der automatische Rand schluckt den
   freien Platz in der Spalte und schiebt die Leiste auf die volle Höhe
   hinunter – auch ohne Rollweg.
2. **`.app` bekommt unten kein Polster mehr.** Die Leiste ist das letzte
   Kind; ein Polster darunter schob sie genau dort vom Rand weg, wo sie im
   Fluss liegt. Ihr eigenes Polster samt `safe-area-inset` trägt den Abstand.
3. **`min-height: 100dvh`** neben `100vh`. Auf dem Handy zählt `100vh` die
   Adressleiste mit – die Spalte wäre höher als das Sichtfeld und die Leiste
   stünde um deren Höhe unterhalb des Bildrands. Gehört zur Mobilabnahme, die
   als Nächstes ansteht.

Dazu ein **`z-index: 10`**: über der Ampel (5), unter der Störmeldung (50).
Vorher hatte die Leiste keinen, ihre Stapelposition hing allein daran, dass
sie zufällig das letzte Element im DOM ist. Gegenüber positionierten Nachbarn
ist das keine Zusicherung.

**Nachgemessen statt angesehen.** Die Screenshots skalierten unzuverlässig,
deshalb im DOM gemessen (`getBoundingClientRect` gegen `innerHeight`).
Ergebnis auf allen vier Seiten und in allen drei Rollzuständen: **0 px
Abstand zum Unterrand**, Höhe 70, gleicher Hintergrund, gleicher Rahmen,
gleiches Polster.

Ein Unit-Test kann das nicht halten: jsdom hat keine Layout-Engine und liefert
für jede Box 0×0. Was maschinell prüfbar ist, ist geprüft – dass die Leiste
auf **jeder** Seite mit denselben Werten gerendert wird (`bildschirme.test.ts`,
`Navileiste.test.tsx`). Die Lage im Bild bleibt eine Sache des Messens im
Browser.

**Nebenbei:** Der Leisteneintrag „Dashboard" heißt jetzt **„Übersicht"** – die
App spricht sonst durchgehend Deutsch. Der interne Schlüssel bleibt
`dashboard`; Beschriftung und Schlüssel gehen hier bewusst auseinander. Die
Beschriftungen hängen jetzt an einem eigenen Test.

## Der Live-Strom war in Produktion nie erreichbar (03.09.2026)

Gefunden bei der Abnahme des Deploys im Browser, und der schwerste Fund seit
der Datenschutzsache: **`/api/live/:eva` sendete keine CORS-Header.** Für den
Browser war der Strom damit unerreichbar – seit der Trennung von Frontend und
Backend am 28.08.2026. Jede Live-Eigenschaft in Produktion war tot: das
Störband, Gleiswechsel, Verspätungen, der Zeitstempel des letzten Kontakts.

**Die Ursache steht in `routes/live.ts` seit dem ersten Tag.** Die Route ruft
`reply.hijack()` und schreibt ihre Header mit `reply.raw.writeHead()` selbst
auf den Socket. Was `@fastify/cors` an die *Fastify*-Antwort gehängt hat, kommt
dabei nie auf die Leitung. `/api/stations` und `/api/route` waren nie
betroffen – sie hijacken nicht.

**Warum es zwei Tage überlebt hat, ist der eigentliche Punkt.** Beide
Prüfungen, die es hätten finden müssen, konnten es nicht sehen:

| Prüfung | Warum sie blind war |
|---|---|
| `test/cors.test.ts` | Prüfte ausschließlich `/api/health` – eine Route **ohne** `hijack()`. Vier grüne Tests belegten CORS für genau den Fall, der nie das Problem war. |
| `curl -sN .../api/live/8011160` | **`curl` setzt CORS nicht durch.** Es schickt den Origin-Header mit und zeigt die Antwort, ganz gleich ob eine Freigabe zurückkommt. Der Strom sah einwandfrei aus – Heartbeats inklusive. Genau mit diesem Befehl stand am 01.09. im README „Der SSE-Strom steht nachweislich". Er stand – nur nicht für einen Browser. |

Dasselbe Muster wie am 02.09.: Zwei verschiedene Zustände („erreichbar" und
„erreichbar, aber nicht für den, der es braucht") fallen auf dieselbe
Beobachtung zusammen, und danach ist der Unterschied nicht mehr herstellbar.

**Die Korrektur.** `registriereLiveRouten` bekommt die Allowlist und spiegelt
im `writeHead` selbst, was `@fastify/cors` für eine einfache GET-Anfrage täte:
die passende Herkunft zurück, sonst nichts, dazu `Vary: Origin` – sonst darf
ein Zwischenspeicher die Antwort für eine Herkunft an eine andere ausliefern.

Zwei Tests halten es fest, beide über einen **echten Socket** statt
`app.inject()` (inject bricht eine hijack-Antwort nicht ab und liefe in den
Timeout): erlaubte Herkunft bekommt die Freigabe, fremde nicht.

**Ein Rest fiel erst beim Nachprüfen der Ränder auf.** `Vary: Origin` stand
zuerst nur im erlaubten Fall. Auch die **Ablehnung** hängt aber an der
Herkunft: Ohne `Vary` darf ein Zwischenspeicher die kopflose Antwort einer
fremden Herkunft an eine erlaubte ausliefern – die scheiterte dann an einer
Freigabe, die es eigentlich gibt. `@fastify/cors` sendet den Header in beiden
Fällen; jetzt tut es diese Route auch. Praktisch war das Risiko klein (die
Antwort trägt `Cache-Control: no-cache`), aber der Kommentar im Code
behauptete, `@fastify/cors` zu spiegeln – und das war nur fast wahr.

**Alle Ränder nachgeprüft (03.09.2026), am lebenden Objekt statt gefolgert:**

| Prüfung | Ergebnis |
|---|---|
| Alle fünf Routen (`health`, `stations`, `board`, `route`, `live`) | ✅ Freigabe-Header |
| Alle drei Produktionsdomains (`umstieg.vercel.app`, `umstieg.online`, `www.umstieg.online`) | ✅ alle in `CORS_ORIGIN`, alle bekommen die Freigabe – auch auf dem SSE-Strom. **Im Browser** nachgeprüft auf `umstieg.vercel.app` und `www.umstieg.online` (dorthin leitet `umstieg.online` um): Live-Zeitstempel auf der Meldungsseite. Nur `curl` hätte hier nach der Lehre unten nicht gereicht. |
| Fremde Herkunft | ✅ keine Freigabe, auf keiner Route |
| Weitere Routen mit `hijack()` | ✅ keine – `live.ts` ist die einzige, der Rest läuft über Fastifys normalen Weg |

**In Produktion bestätigt (03.09.2026, nach dem Deploy).** Der Beleg ist die
Meldungsseite selbst: Vor dem Fix stand dort dauerhaft „Die Live-Verbindung
steht noch nicht." – der Zustand für „`stand` ist null", also kein Heartbeat.
Nach dem Fix erschien „Live-Daten · Stand: 13:08 Uhr". Damit läuft der
Live-Strom zum ersten Mal aus dem ausgelieferten Frontend.

### Was auch danach offen bleibt

- **Ein echtes Ereignis ist in Produktion weiterhin nie beobachtet worden.**
  Durch den Browser gelaufen ist der **Heartbeat**. Gleiswechsel und
  Verspätung nehmen dieselbe Verbindung und denselben
  `addEventListener`-Pfad – CORS-seitig sind sie damit abgedeckt –, aber die
  **Erkennung** im Backend (`core/ueberwachung.ts`) hängt weiter allein an
  ihren Tests. Das ist eine andere Frage als diese hier und nach wie vor
  nicht erzwingbar.
- **Vorschau-Deployments erreichen die API weiterhin nicht.** Ihre URLs
  stehen nicht in `CORS_ORIGIN`, absichtlich: Eine Wildcard liesse jede
  fremde Vercel-App an die API. Siehe ToDo 6.
- **Eine neue Domain fällt niemandem auf.** Wer einen Alias hinzufügt, muss
  ihn in `CORS_ORIGIN` nachtragen; kein Test merkt das. Am 03.09. war genau
  das der Fall: Der Zweig-Alias von `feat/mvp` fehlte. Nachgetragen; die
  vollständige Liste und die zwei Fallen beim Ändern stehen jetzt in
  [`docs/deployment.md`](./docs/deployment.md). Ebenso würde eine
  **künftige zweite Route mit `hijack()`** den Fehler wiederholen – die
  Tests decken heute `live.ts`, nicht „jede Route, die hijackt".

**Die Lehre für dieses Projekt:** `curl` ist kein Ersatz für einen Browser,
sobald eine Eigenschaft im Browser durchgesetzt wird – CORS, CSP,
Mixed-Content, `Permissions-Policy`. Bei allem, was der Browser und nicht der
Server entscheidet, zählt nur der Blick im Browser.

## Grenzen gegen den Missbrauch der Quellen (03.09.2026)

Ausgangspunkt war eine generische Härtungsliste („20 Dinge vor dem Deploy").
Dreizehn ihrer Punkte haben hier keinen Anknüpfungspunkt – die App hat keine
Konten, keine Sessions, keine Cookies, keine Datenbank, keine Uploads, kein
LLM. Der Kern der Liste traf aber genau: **Das Backend war ein
unauthentifizierter, öffentlicher Proxy vor vier kostenpflichtigen APIs.**

**CORS schützt davor nicht.** Es ist eine Regel für Browser, kein
Zugriffsschutz; `curl` ignoriert sie vollständig. Wer die Fly-Domain kannte,
konnte die Quoten von RIS::Stations, Timetables, FaSta und Overpass
leerlaufen lassen.

Vier Maßnahmen:

- **Ratenbegrenzung je Aufrufer UND Route** (14/21/21/70 je Minute). Der
  Zählschlüssel trägt die Route mit, sonst sperrte die Tippsuche die
  Routenberechnung mit aus. `/api/health` bleibt ausgenommen: Liefe Flys
  Gesundheitsprüfung in die Grenze, hätte die Schutzmaßnahme den Ausfall
  selbst erzeugt.
- **Obergrenzen für den Live-Strom** (140 gesamt, 2 je Aufrufer, 35 EVAs).
  Nicht die Verbindung kostet, sondern der Poller dahinter: Jede neue EVA ist
  eine weitere Abfrage gegen Timetables, alle 30 Sekunden, dauerhaft.
- **Zwischenspeicher mit Bündelung** für Stammdaten (24 h), Suche (10 min),
  FaSta (5 min) und Tafel (20 s). Die Bündelung wiegt schwerer als der
  Speicher: Ein Schwall läuft an einem reinen Cache vorbei, weil beim
  Eintreffen der zweiten Anfrage die erste noch unterwegs und der Speicher
  deshalb leer ist. Fehler werden bewusst nicht gespeichert, sonst überlebt
  ein Ausfall seine Ursache.
- **Sicherheitsereignisse ohne Personenbezug** (`core/sicherheitsprotokoll.ts`).

Der Live-Poller umgeht den Tafel-Speicher vollständig. Er ist die
Frischequelle; ein Cache in seinem Pfad verschluckte genau die Änderung, wegen
der es den SSE-Strom gibt.

Nicht zwischengespeichert wird die Umkreissuche: Ihr Schlüssel wäre die
Koordinate, und die zehn Minuten zu halten widerspräche der Zusage, sie sofort
zu verwerfen. Es geht dabei auch nichts verloren – gegen den Missbrauchsfall
hälfe ein Speicher ohnehin nicht, weil geratene Koordinaten jedes Mal einen
neuen Schlüssel bilden.

### Zwei Fallen, die beide unsichtbar waren

**`trustProxy` fehlte.** Ohne das ist `req.ip` auf Fly die Adresse des
Fly-Proxys – alle Besucher landeten in EINEM Zähler. Die Grenze wäre
wirkungslos gewesen und hätte beim ersten Andrang alle gleichzeitig
ausgesperrt.

**Die Routen wurden vor dem Plugin registriert.** `onRoute`-Haken feuern
sofort, `app.register()` ist aufgeschoben: Das Plugin war geladen, die Grenzen
aber an keine einzige Route geknüpft. Es sah exakt so aus wie jetzt, nur ohne
Wirkung. Deshalb liegen die Routen jetzt in einer eigenen Registrierung.

Beides ist in `test/ratelimit.test.ts` festgehalten.

### `@fastify/static` ist raus

`npm audit` meldete vier High-Advisories, darunter Path Traversal im
Directory Listing. Das Paket war deklariert, wurde im Code aber **nirgends
verwendet**. Die richtige Behebung war deshalb nicht das Upgrade, sondern der
Rauswurf. Jetzt: 0 vulnerabilities.

### Die Datenschutzerklärung zog im selben Commit mit

„Die Anwendung selbst schreibt keine Protokolle" wäre mit dem
Sicherheitsprotokoll unwahr geworden – es wäre das vierte Mal in fünf Tagen
gewesen, dass eine Zusage nebenbei verlorengeht.

Aufgelöst nicht durch einen Kompromiss, sondern durch eine Unterscheidung:
**Protokolliert wird, DASS eine Grenze gegriffen hat und WO – nie, wer sie
ausgelöst hat.** Der Eintrag trägt Ereignisart, Routen-Muster, Trefferzahl und
Fensterlänge. Die Adresse bleibt im Zählwerk im Arbeitsspeicher und wird nie
geschrieben.

Aggregiert wird aus einem zweiten Grund: Ein Eintrag je abgewiesener Anfrage
wäre selbst die Schwachstelle. Wer schnell genug anfragt, füllte damit die
Platte – der Schutz wäre der Angriff.

Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO; Erwägungsgrund 49 nennt Netz- und
Informationssicherheit ausdrücklich. Die Zusage „Ein Zugriffsprotokoll mit
Koordinaten wird nicht geführt" bleibt wahr und bleibt stehen. Nachgewiesen in
`test/datenschutz.test.ts`: Eine gegriffene Grenze hinterlässt weder Adresse
noch URL noch Koordinate, und eine gewöhnliche Anfrage weiterhin gar nichts.

### Gemessen am laufenden Server

21 Anfragen durch, die 22. abgewiesen, Health unberührt. Vier Abweisungen
ergaben **einen** Protokolleintrag:

```json
{"ereignis":"ratelimit","route":"/api/stations","treffer":1,"fenster":"60s"}
```

## Reise-Import aus Fahrplan-Apps (03.09.2026)

Statt Bahnhof und zwei Gleise zu tippen, den geteilten Text aus der
Fahrplan-App einfügen. Knopf unter der Wagennummer, Fenster statt Seite,
Auswertung **ausschließlich im Browser** – kein Upload-Endpunkt, keine
Speicherung, keine Konten.

### Warum Text und nicht die Fahrkarte

Zwei echte Dateien verglichen. Der Textexport („Verbindung teilen") enthält
Zug, Zeit, Bahnhof und **Gleis** je Abschnitt – und keinen Namen, keine
Anschrift, keine Auftragsnummer. Die DB-Rechnung als PDF ist das
Gegenbeispiel: Name, Wohnanschrift, Auftragsnummer, Zahlungsmittel – und von
den gebrauchten Feldern **kein einziges**. Sie sagt selbst: „Dieses Dokument
berechtigt nicht zur Fahrt."

PDFs gar nicht erst anzunehmen ist deshalb Datenminimierung (Art. 5 Abs. 1
lit. c DSGVO), keine Einschränkung. Nimmt man sie an, laden Leute Rechnungen
mit ihrer Wohnanschrift hoch.

**Wagen und Sitzplatz stehen in keiner der beiden Dateien.** Sie bleiben
manuell; das Feld ist ohnehin als optional gekennzeichnet.

Echte Beispieldateien liegen unter `Beispiel Ticket/` und sind gitignored –
die Rechnung trägt Name, Anschrift und Zahlungsmittel.

### Live verfolgen geht erst am Reisetag

Gemessen gegen die echte Timetables-API, zwei Bahnhöfe, gleiches Ergebnis:

| Vorlauf | `/plan` |
|---|---|
| ~15 h | 200, 57 Halte |
| ~23 h | **404** |
| 2 bis 14 Tage | **404** |

Kein leeres Ergebnis, sondern gar keine Daten. Eine Reise lässt sich also
Wochen vorher eintragen, aber erst am Reisetag verfolgen. Das Fenster sagt es,
statt einen leeren Live-Strom zu zeigen.

**Nebenbefund: EVA 8011160 (Berlin Hbf) führt überhaupt keinen Fahrplan.** Die
Daten liegen unter 8098160 und 8089021. Dass die App Verkehrsstellengruppen
zusammenführt, ist damit tragend, nicht kosmetisch.

### Felder erkennen, nicht Formate

Die erste Fassung kannte genau ein Format (DB Navigator) und scheiterte am
ersten VBB-Text. Ein Erkenner je App hätte für jede weitere App einen weiteren
gebraucht – es gibt Dutzende Verbund-Apps, keine davon dokumentiert.

`frontend/src/reise/reisetext.ts` klopft deshalb jede Zeile auf **Felder** ab:
Zeit und Rolle (Pflicht), Ort (was nach Abzug des Übrigen bleibt), Gleis, Zug,
Richtung. Wo sie in der Zeile stehen, ist gleichgültig:

```text
DB:   Ab 22:53 Eberswalde, Gleis 4          Schlüsselwort zuerst
VBB:  22:53 - Abfahrt Eberswalde, Gleis 4   ZEIT zuerst
```

Auch ob die Zugbezeichnung über der Abfahrt steht (DB) oder darunter (VBB,
„mit RE3 Richtung ..."), spielt keine Rolle – gesucht wird im Umfeld des
Halts. Ein neues Format wird durch **ein Wort mehr im Vokabular** unterstützt,
nicht durch neuen Code.

Geraten wird trotzdem nicht: Ohne Zeit, Rolle und Ort entsteht kein Abschnitt,
ohne Abschnitt kommt `null`. Ein falsch erkanntes Gleis ist schlimmer als ein
nicht erkanntes.

### Drei Fehler, die echte Texte aufgedeckt haben

1. **Reihenfolge.** Der VBB schreibt die Zeit zuerst; der Ausdruck verlangte
   das Schlüsselwort am Zeilenanfang. Keine einzige Zeile passte.
2. **„S+U" war nie ein Text, sondern ein Ausdruck.** Die Maskierung erfasste
   nur den Punkt, also wurde daraus die Regel „ein oder mehr S, gefolgt von
   U". Traf nie.
3. **Der Klammerzusatz.** „S+U Berlin Hauptbahnhof [Gleis 1-8], Gleis 4" – der
   Zusatz in eckigen Klammern ist Namensbestandteil, nicht das Gleis. Ohne ihn
   vorher zu entfernen, las die Erkennung „1-8" statt „4".

### Bahnhofsnamen: die Suche probiert Varianten

Der eigentliche Blocker fiel erst im Browser auf, nicht im Test. Gemessen
gegen die echte RIS::Stations-Suche:

```text
Berlin Hauptbahnhof          -> Berlin Hbf             ok
Eberswalde, Hauptbahnhof     -> Eberswalde Hbf         ok
S Potsdam Hauptbahnhof       -> Potsdam Hbf            ok
S+U Berlin Gesundbrunnen     -> NICHTS
Berlin Gesundbrunnen Bhf     -> NICHTS
Hockenheim, Bahnhof          -> NICHTS
```

Die Gleise wären übernommen worden, der Bahnhof aber nicht auflösbar – und
ohne EVA rechnet die App nicht.

**Über die Verkehrsstellengruppe ist das nicht zu lösen.** Die Gruppe zu
Gesundbrunnen gibt es und sie enthält genau die gesuchte S-Bahn-Stelle
(8011102 plus 8089015 „Berlin Gesundbrunnen(S)"). Nur kommt man an die Gruppe
ausschließlich über eine EVA – und an die EVA nur über einen Namen, den die
Suche annimmt. Für einen Namen, der ins Leere läuft, gibt es keinen Einstieg.

Deshalb löst `backend/src/core/bahnhofsname.ts` das eine Stufe früher: Die
Suchroute probiert Schreibvarianten der Reihe nach durch, von genau nach grob,
und hört beim ersten Treffer auf. Zwei Eigenschaften waren dabei wichtig:

- **Ein sauberer Name kostet genau einen Aufruf.** Sonst zahlte die Tippsuche
  die Varianten bei jedem Tastendruck mit.
- **„Hauptbahnhof" bleibt unangetastet.** Die Suche kommt damit klar; ein
  abgeschnittenes „Eberswalde" wäre ein anderer Ort als der Bahnhof. Deshalb
  muss vor der Nachsilbe ein Trenner stehen.

Das hilft auch jedem, der von Hand „S+U Gesundbrunnen" eintippt. Nachgemessen
am laufenden Server: „S+U Berlin Gesundbrunnen Bhf" löst jetzt auf „Berlin
Gesundbrunnen" auf, „Hockenheim, Bahnhof" auf „Hockenheim".

### Übernommen wird erst nach Bestätigung

Anfangs schloss das Fenster bei genau einem Umstieg sofort und füllte die
Felder. Das war falsch: Gelesen werden fremde, undokumentierte Formate, und
ein falsch erkanntes Gleis, das ungefragt im Formular landet, fällt niemandem
auf – bis man am falschen Ende des Bahnsteigs steht.

Jetzt zwei Stufen: Umstieg antippen zeigt, **was genau in welches Feld
wandert**; erst „Übernehmen" schreibt es. Dazu „Zurück zur Auswahl".

Mit übernommen werden auch **Ankunfts- und Anschlusszug**, wie bei der Auswahl
aus der Live-Tafel. `zeitIst` und `gleisIst` bleiben dabei bewusst leer: Sie
bedeuten „laut Live-Tafel geändert", und aus einem geteilten Text weiß niemand
etwas über Änderungen. Gefüllt hätten sie einen Gleiswechsel behauptet, den es
nie gab.

Der Bahnhof landet als **Suchtext**, nicht als getroffene Wahl: Berlin Hbf
führt drei EVA-Nummern, von denen eine gar keinen Fahrplan hat. Welche gemeint
ist, entscheidet die Bahnhofssuche, nicht der Text.

## Die DB-Gleisliste als Trenner (04.09.2026)

Konzeptlücke §4.3, in enger Fassung geschlossen. Der Anlass war der Münchener
Fehlschluss: Gleis 5 → 2 antwortete „Gleis 2 gegenüber, kein Ebenenwechsel" in
30 Sekunden, obwohl Gleis 2 im S-Bahn-Tiefbahnhof liegt.

**Die Angabe, die das widerlegt, wurde abgerufen und drei Zeilen später
weggeworfen.** `clients/stations.ts` fragt die Gleisliste **je Verkehrsstelle**
ab – `listen` läuft parallel zu `evas`, die Herkunft ist also bekannt. Dann:

```ts
if (!p.name || gesehen.has(p.name)) continue;   // erster EVA gewinnt, Herkunft verfällt
gleise.push({ gleis: p.name });
```

Jedes Gleis behält jetzt seine Verkehrsstellen (`evas` je Eintrag), und
`istGleicherBahnsteig` schließt daraus: **Zwei Gleise mit disjunkten
Verkehrsstellen können nie derselbe Bahnsteig sein**, was OSM auch behauptet.

Gegen die echte API gemessen (04.09.2026):

```
Gruppe München:  8098263, 8098262, 8000261, 8098261
Gleis 2:   8098263                       <- S-Bahn tief, allein
Gleis 5:   8098262, 8000261, 8098261     <- disjunkt zu Gleis 2
Gleis 11:  8098262, 8000261
Liste vollständig (gleisteileOhneAntwort: 0)
```

### Zwei Fälle schließen bewusst nichts

**Ein Gleis an mehreren Verkehrsstellen ist ein echtes „beides".** München
führt Gleis 13 unter drei Mitgliedern – betrieblich unterteilt, nicht physisch
getrennt. Einen Gewinner zu küren wäre derselbe Fehler eine Ebene höher.
Deshalb `evas: string[]`, keine einzelne EVA.

**Eine unvollständige Gleisliste trennt gar nicht.** Ist
`gleislisteUnvollstaendig` wahr, wird die Liste erst gar nicht durchgereicht.
Ein ausgefallener Bahnhofsteil heißt nicht „anderer Bahnsteig"; sonst wäre ein
falscher Weg nur gegen einen anderen getauscht.

### Was damit NICHT gelöst ist

Die falsche Behauptung ist weg, **die Route ist weiterhin falsch**: Gleis 5 → 2
liefert jetzt 2 Schritte, 41 s, komplett auf `level 0`. Die DB-Liste trennt,
sie korrigiert keine Geometrie. Dafür bräuchte es den vollen §4.3 – und der ist
blockiert, siehe den nächsten Abschnitt.

`evas` ist optional, aus demselben Grund wie `gleisteileOhneAntwort`: Es gibt
genau einen echten Erzeuger, alles andere sind Fixtures. Fehlt es, entscheidet
OSM wie vorher – der sichere Rückfall.

## Was der `platforms`-Endpunkt liefert (04.09.2026)

Gemessen, bevor der volle §4.3 spezifiziert wurde – und die Messung hat ihn
gestoppt:

```
8098263 (S-Bahn tief):  name, heights, end, headPlatform, ifopt, length, linkedPlatforms, sectors, start
8000261 (Haupthalle):   name, heights, end, linkedPlatforms, sectors, start
```

**Keine Koordinaten, an keinem der beiden Bahnhofsteile.** Die
`lat`/`lon`-Felder in `StationsInfo.gleise` sind aus dieser Quelle nicht
füllbar. Der Code wusste das an einer Stelle bereits – `synthmodell.ts`
vermerkt: „Die Gleisliste aus RIS::Stations trägt **nie** Koordinaten – sie
liefert nur Namen."

Damit ist „OSM-Geometrie an DB-Koordinaten verankern" mit diesem Endpunkt
unmöglich. **Das ist kein Aufwandsproblem, sondern ein Datenproblem.**

Zwei Nebenfunde, die etwas taugen könnten:

- **`linkedPlatforms`** nennt ausdrücklich, welche Bahnsteige physisch
  zusammengehören – für den Tiefbahnhof `1 ↔ 2`. Das ist die Aussage, die
  `istGleicherBahnsteig` heute aus Geometrie *errät*, hier autoritativ. Aber:
  in der Haupthalle ist das Feld durchweg **leer**. Als positiver Beleg
  brauchbar, als alleinige Quelle nicht.
- **`ifopt`** (`de:09162:6:40:81`) wäre der Ankerpunkt zu OSMs `ref:IFOPT` –
  fehlt aber lückenhaft; in der Haupthalle haben Gleis 5 und 6 keinen.

## Die Wagenreihung ist tot (04.09.2026)

Der Versuch, ToDo 11 zu erledigen (das handgebaute Fixture gegen echte
Antworten prüfen), endete mit einem größeren Fund:

```
ist-wr.noncd.db.de       -> NXDOMAIN (gegengeprüft über 8.8.8.8)
apis.deutschebahn.com    -> 46.18.57.2  ok
Marketplace: ris-formation / ris-formations / fahrzeugreihung -> 3x HTTP 404
```

`clients/wagenreihung.ts` ruft `ist-wr.noncd.db.de` auf – einen freien Endpunkt
ohne Authentifizierung, den es **nicht mehr gibt**. Und Wagenreihung steht nicht
auf der Abonnementliste (RIS::Stations, Timetables, FaSta, StaDa). Es gibt
derzeit **keine** Quelle für Wagenreihungsdaten.

**Der Nebenbefund wiegt schwerer als die blockierte Seite.** Die Wagenposition
ist in Produktion seit jeher wirkungslos: Jeder Aufruf mit Wagennummer läuft in
den DNS-Fehler, wird gefangen und degradiert auf „Route startet an der
Bahnsteigmitte". Der Degradationspfad arbeitet **korrekt** – er verdeckt nur,
dass die Funktion nie etwas anderes tut. Genau deshalb ist es niemandem
aufgefallen; und es erklärt, warum der Wagenkasten auf der Angekommen-Seite am
01.09. nie zu sehen war (dort stand als Ursache „die Wagennummer war leer").

Ein Degradationspfad, der einen Totalausfall ununterscheidbar von einem
Normalfall macht, ist dasselbe Muster wie bei Zeile 2 der Degradationstabelle.

## Die Degradationstabelle als Test (04.09.2026)

MVP-Task 17, Schritt 1: jede Zeile der Konzepttabelle Abschnitt 8 als eigener
Test (`backend/test/degradation.test.ts`, 13 Tests). Geprüft wird nicht nur,
**dass** die App bei einem Ausfall antwortet, sondern dass sie **sagt, was ihr
fehlt**.

Die Tests haben zwei Lücken aufgedeckt.

### Zeile 2 war nie gebaut

Fiel Timetables aus, wurde der Live-Strom einfach stumm. Der Kommentar im Code
benannte das Problem selbst: „Der Strom bleibt offen und wird einfach stumm –
vom Fall ‚es ändert sich gerade nichts' ist das für den Zuschauer nicht zu
unterscheiden." Sichtbar war der Ausfall **nur im Serverprotokoll**. Das
Konzept verlangt ein Banner; es existierte nirgends, die Zeichenkette
„Echtzeitdaten" kam im ganzen Projekt nicht vor.

Jetzt melden `quelle-weg` und `quelle-da` die **Zustandskante** – nur beim
Wechsel, nicht bei jedem Durchlauf; ein Banner, keine Flut. Das Frontend zeigt
„Echtzeitdaten derzeit nicht verfügbar", bis die Quelle wieder antwortet.

Bewusst **kein** `LiveBanner` und **kein** Wegklick-Knopf: Der Ausfall ist ein
*Zustand*, kein Ereignis. Ihn wegklickbar zu machen hieße, eine Aussage zu
verbergen, die noch gilt.

### Zeile 6 deckte einen echten Fehler auf

Warf `sende` bei einem abgerissenen Zuschauer, riss der Wurf ungefangen den
**ganzen Durchlauf** ab – und mit ihm die Aktualisierung für **jeden anderen
Zuschauer derselben EVA**. Ein einziges totes Handy in der Bahnhofshalle hätte
gereicht, um allen übrigen die Live-Daten abzudrehen. Weder Test noch Protokoll
zeigten das je.

### Zeile 4 nennt jetzt das fehlende Gleis

„Gleis nicht im Kartenmaterial gefunden" ließ offen, **welches** der beiden
eingegebenen die Route ungenau macht.

### Was am Konzept-Wortlaut nicht gebaut wurde

Zeile 4 verlangt den Rückfall „auf das Synthesemodell **nur für dieses Gleis**";
der Code ersetzt den ganzen Graphen. Das ist bewusst so geblieben. Ein
Teilrückfall müsste dem fehlenden Gleis eine **Position erfinden** und sie
mitten in sonst präzise Geometrie setzen, ausgeliefert als Stufe 1 oder 2 –
genau die Fehlerklasse, die den Münchener Fehlschluss erzeugt hat. Nach dem
Befund des `platforms`-Endpunkts steht zudem fest, dass es dafür keine
Koordinate gäbe. Das heutige Verhalten ist ehrlicher: Es wertet die *ganze*
Route auf „ca." ab, sobald ein Teil geraten ist.

## Getrennte Blöcke – und der Wagen, der zum falschen Zug gehörte (05.09.2026)

Konzeptlücke §9. Die Maske war nach **Feldart** gruppiert – beide Züge in einer
Gruppe, beide Gleise in einer zweiten, darunter eine einzelne Wagennummer. Der
Nutzer denkt aber nach Reiseabschnitt: „mein ankommender Zug: Gleis 6,
ICE 1006, Wagen 26." Jetzt zwei `fieldset`-Blöcke, „Ankunft" und „Abfahrt", je
mit Zug, Gleis und Wagennummer.

`fieldset`/`legend` statt `div`/`label`, damit Screenreader „Ankunft – Gleis"
vorlesen statt zweimal nur „Gleis".

### Der Fehler, der dabei herausfiel

`wagen` heißt jetzt `wagenAn`, `wagenAb` ist neu. Asymmetrische Namen in einer
symmetrischen Maske sind eine Fehlerquelle – und eine lag bereits im Code:

Der **Angekommen-Bildschirm zeigte den Ankunftswagen**. Er handelt aber
durchweg vom Anschluss – Abfahrtsgleis, Abfahrtszeit, Anschlusszug – und
`zeigtWagen` prüft seit jeher `istFernverkehr(zugAbName)`, also den
Abfahrtszug. Angezeigt wurde damit der Wagen, aus dem man **ausgestiegen** ist,
statt der, in den man einsteigen soll. Aufgefallen war es nie, weil das Feld in
der Praxis leer blieb – siehe „Die Wagenreihung ist tot".

### Verträglich mit dem Reise-Import

Der Import übernimmt keine Wagennummern – sie stehen in keinem geteilten Text –
und **leert jetzt beide Felder**. Eine vorher getippte gehört zur *ersetzten*
Reise; stehen geblieben haftete sie an einem fremden Zug. Dieselbe Überlegung,
aus der dort schon `zeitIst` und `gleisIst` bewusst leer bleiben.

`wagenAb` geht bewusst **nicht** ans Routing: Der verfeinerte Zielpunkt über die
Abfahrts-Wagenposition steht laut Konzept unter Stufe 2. Der Backend-Parameter
bleibt `wagen` (Ankunft), die API ändert sich nicht.

Ein vor dem Umbau gespeicherter Entwurf fällt einmal durch die Prüfung und wird
verworfen – leeres Formular statt kaputter Maske. Er liegt in `sessionStorage`
und überlebt ohnehin nur die Sitzung.

## Mit Stopp: WC & Kiosk (05.09.2026)

Spec 8.3, die letzte der drei offenen Design-Varianten.

**Die Spec-Annahme stimmte nicht.** Sie sagte, die Daten seien schon da:
„Overpass liefert `amenity=toilets` und `shop=kiosk` im 400-m-Umkreis mit." Die
Abfrage in `clients/overpass.ts` holte nur Bahnsteige, Fußwege, Treppen,
Aufzüge und Rolltreppen. Sie holt jetzt beides, in **beiden** OSM-Formen:
größere Anlagen sind als Fläche erfasst, kleinere als Punkt.

Das kostet **jede** Abfrage etwas, auch die der Mehrheit, die die Variante nie
wählt – der Graph wird je Bahnhof zwischengespeichert, nicht je Variante. Vier
Zeilen mehr gegen zwei parallele Cachevarianten war die günstigere Seite des
Tauschs; die Cache-Schlüssellogik ist die Stelle, an der am 01.09. schon einmal
ein Graphbau auf sich selbst gewartet hat.

### POIs hängen am Graphen, sie sind nicht sein Gerüst

Ein Zwischenziel bekommt **genau eine** ebene Kante zum nächsten begehbaren
Knoten, höchstens 30 m. Ohne diese Grenze liefe irgendwann eine „schnellste"
Route als Abkürzung durch eine Toilette.

Die Ebene kommt aus dem `level`-Tag, sonst vom Anschlussknoten. Ein WC im
Untergeschoss ans Erdgeschoss zu hängen wäre schlimmer als es wegzulassen – der
Weg dorthin führte durch keine Treppe.

### Gewählt wird nach Gehzeit, nicht nach Luftlinie

Geprüft werden die fünf nächstgelegenen Zwischenziele (Vorauswahl per
Luftlinie, Entscheidung per echter Gehzeit beider Teilwege). Ein WC zehn Meter
entfernt, aber nur über zwei Treppen erreichbar, ist der schlechtere Stopp.

Der Entwurf nennt WC und Kiosk in **einem** Knopf – also wählt das System das
günstigere, statt den Nutzer zu fragen.

Findet sich kein erreichbares Zwischenziel, ist die Antwort `null` und die API
404. Still auf den direkten Weg auszuweichen hieße, einen Stopp zu versprechen,
den es nicht gibt.

### Gemessen in Produktion (05.09.2026)

| Berlin Hbf, Gleis 6 → 14 | Schritte | Gehzeit |
|---|---|---|
| `variante=schnellste` | 32 | 575 s |
| `variante=mit-stopp` | 34 | 670 s |

Der Umweg kostet 95 Sekunden – die Stopp-Route ist damit nachweislich länger
als die direkte, genau die Invariante aus `test/routing.test.ts`, hier gegen
die echte Produktion belegt.

### Zwei Fallen unterwegs

**Ein Kommentar im Template-Literal ist kein Kommentar.** Die Overpass-Abfrage
ist eine Template-Zeichenkette; ein dort eingefügtes `//` landet als
Abfragetext in der Anfrage, und Backticks darin beenden die Zeichenkette. Fiel
sofort beim Typcheck auf.

**Der Linter lag falsch.** `no-await-in-loop` schlägt in `varianten.ts`
`Promise.all()` vor – also genau den Fehler, den der Kommentar dort seit dem
01.09. beschreibt: Zwei gleichzeitige Anfragen fanden den Graph-Cache leer,
24 s und 61 s statt 2 s. Unterdrückt mit Begründung an der Zeile, nicht
pauschal. Zweiter Fall dieser Art, siehe „Was der Linter meldete und trotzdem
falsch lag".

## Was FaSta wirklich liefert (05.09.2026)

Der Bau von §5 (ToDo 7b) begann mit einer Sondierung, und die hat den zuerst
gewählten Weg **verworfen**. Das ist der eigentliche Ertrag des Tages.

Der Anlass, nachzusehen: `test/fixtures/db/fasta-facilities.json` trug in der
ersten Zeile seinen eigenen Vorbehalt – *„HANDGEBAUTES Fixture … Vor
Live-Betrieb gegen echte Antworten verifizieren"*. Verifiziert war bisher nur
die **Adressierung** (`stationnumber` statt EVA, ToDo 2), nicht die Nutzlast.

Fünf Bahnhöfe, echte API (`scripts/spike-fasta.ts`, `scripts/spike-fasta-auswertung.ts`):

| Bahnhof | Anlagen m. Koord. | Gleisbezug in `description` | benannte Bahnsteige | Nachbarabstand |
|---|---|---|---|---|
| Hannover Hbf | 20 | **90 %** | 6 | 20–26 m |
| Berlin Hbf | 69 | 65 % | 7 | 10–22 m, **178 m** über Ebenen |
| Eberswalde Hbf | 9 | 44 % | 1 | – |
| Frankfurt Hbf | 53 | 36 % | 2 (**nur S-Bahn**) | 26 m |
| München Hbf | 25 | 16 % | 2 (**nur S-Bahn**) | 15–20 m |

### Warum geometrisches Clustern falsch gewesen wäre

Der naheliegende Weg – Anlagen nach Nähe gruppieren, jedes Cluster ist ein
Bahnsteig – scheitert an zwei Dingen, und beide sind gemessen:

1. **Die Menge ist verunreinigt.** Berlins Anlagen streuen über **339 m**. Das
   kommt nicht von langen Bahnsteigen, sondern von `„von Parkhaus A zum 1. UG"`,
   `„1.UG – Tram Haltestelle 5"`, `„zu U-Bahn Gleis"`, `„Nicht Reisendenrelevant"`.
2. **Die Schwelle ist nicht übertragbar.** 30 m ergibt in Berlin 6 Cluster, in
   Hannover 2. Es gibt keinen Wert, der beides richtig macht.

**Was stattdessen trägt, ist die Auskunft selbst.** `description` nennt fast
immer ein **Gleispaar** – „zu Gleis 15/16", „zu Bstg Gl 11/12", „zu Bst 9/10".
Ein Gleispaar *ist* ein Bahnsteig. Damit entfällt das Raten vollständig, und
die Zuordnung passt genau auf das vorhandene `bahnsteigId`-Konzept.

### Die Abdeckung spaltet sich nach Bahnhofstyp

Durchgangsbahnhöfe werden gut beschriftet (Hannover 90 %), Kopfbahnhöfe
schlecht (München 16 %, Frankfurt 36 %) – dort benennt FaSta nur den
S-Bahn-Teil. Das passt zur Sache: An einem Kopfbahnhof gibt es keine
Unterführung, alle Bahnsteige treffen sich am Querbahnsteig. Die
Stufe-3-Annahme „genau eine Querung" ist dort ohnehin falsch, und §5 löst das
nicht.

Deshalb greift die Verankerung **je Bahnsteig**, nicht je Bahnhof: echt, wo es
Belege gibt, synthetisch für den Rest.

### Zwei Parserfallen, beide in den Rohdaten

| Rohtext | Naive Lesart | Richtig |
|---|---|---|
| `"Gleis 22 - 1.UG - Kein Halt EG"` | Bereich „Gleis 1 bis 22" | Ein Gleis: **22**. Der Bindestrich trennt, `1.UG` ist eine Ebene |
| `"von UG zu Gleis 1a (S-Bahn)"` | Gleis **1** | Gleis **1a**. Der Suffix trägt Bedeutung |

Der erste Versuch ist in beide getreten. Ein Bereich gilt jetzt nur bei
unmittelbar angrenzendem Bindestrich, und eine Zahl mit folgendem `.` plus
Buchstabe ist eine Ebene, kein Gleis.

### Der Fund, der im Bau zugeschlagen hätte

Die Selbstprüfung der Spec fand einen Widerspruch, der ohne sie erst im
Betrieb aufgefallen wäre – und dann still: **`wendeFastaAn` hätte den
Aufzugstatus verworfen.** Es ordnet Anlagen der nächstgelegenen Kante zu,
begrenzt auf 50 m. Im verankerten Modell sitzt der Kantenknoten aber auf dem
Bahnsteigschwerpunkt und die Anlage an ihrem echten Ort – an Berlins 280 m
langen Bahnsteigen bis zu **~140 m** auseinander.

Die barrierefreie Route wäre also auf einem defekten Aufzug weitergelaufen.
Kein Randfall, sondern der Regelfall an großen Bahnhöfen. Gelöst über
Zuordnung per `equipmentnumber` statt per Entfernung; der OSM-Pfad benutzt
weiterhin die Entfernung.

### Was die Verankerung nicht kosten durfte

Ein zweiter Widerspruch fiel erst beim Ausformulieren des Codes auf: Wären
**nur noch** verankerte Anlagen kantenbildend, verlöre München 84 % seiner
Aufzugkanten – und aus „barrierefreie Route vorhanden" würde „keine Route".
Eine bessere Geometrie hätte eine Auskunft gekostet.

Die Trennung heißt deshalb: **Verankerung prägt die Lage, Kanten trägt jede
Anlage.** Eine Anlage ohne Gleisbezug verschiebt keinen Bahnsteig, erzeugt
aber weiterhin ihre Kante nach der bisherigen Regel.

### Nebenbefunde

- **Das Fixture hatte die falsche Form.** FaSta liefert ein **blankes Array**,
  das handgebaute Fixture lieferte `{facilities: […]}`. Der Client vertrug
  beides – zufällig, nicht aus Absicht. Ersetzt durch echte Aufzeichnungen von
  Hannover und Berlin.
- **`state: UNKNOWN` kommt wirklich vor** (Frankfurt 1×, Eberswalde 2×). Die
  konservative Abbildung auf `INACTIVE` in `clients/fasta.ts` ist damit
  **belegt** richtig, nicht nur vorsichtig.
- **Unbekannte Felder:** `stateExplanation`, `operationalResumeDate`,
  `operatorname`, `stationnumber`. Ungenutzt. `operationalResumeDate` („Aufzug
  wieder ab …") hätte eigenen Nutzen und verdient einen eigenen Entwurf.
- **Rund eine Anlage je Bahnhof trägt keine Koordinaten** (Berlin 69 von 70).
  Der Filter im Client bleibt.
- **Der Bahnsteigabstand war geraten.** 15 m stand ohne Messung im Code;
  gemessen sind 20–26 m. Jetzt 20 m.

### Die Cache-Naht

FaSta liefert zweierlei in einer Antwort, und die beiden dürfen nicht
zusammen behandelt werden:

- **Koordinaten sind stabil.** Ein Aufzug wandert nicht – sie gehen in den
  Graphcache.
- **`state` ist live.** Er geht es nicht, und tut es weiterhin nicht.

`syntheseGraph` trägt deshalb **keinen** Status mehr beim Bau ein; er kommt
pro Anfrage über `wendeFastaAn` auf einer Kopie dazu. Der Beweis steht in
`test/cache.test.ts`: **Derselbe** gecachte Graph beantwortet zwei Anfragen
verschieden, sobald der Aufzug ausfällt – während Overpass nachweislich nur
einmal gefragt wurde.

FaSta wird für die Geometrie **nur** gerufen, wenn ein Bahnhof wirklich auf
Stufe 3 fällt – höchstens einmal je Graphbau (Frist 10 min), der
5-Minuten-Clientcache liegt darunter.

## Deployment 05.09.2026

Backend und Frontend ausgeliefert, `main` per Fast-Forward auf `feat/mvp`
nachgezogen (12 Commits). Beide Zweige und beide Fernzweige stehen auf
demselben Commit.

```
Backend   Fly.io   /api/health -> {"status":"ok"}, genau EINE Maschine, Checks 1/1
Frontend  Vercel   Produktion ausgeliefert, umstieg.vercel.app antwortet
```

**Dabei gelernt: der Push auf `main` deployt selbst.** Die
Vercel-Git-Integration hängt an `main` und hat nach dem Fast-Forward von sich
aus ein zweites Produktions-Deployment gestartet. Das vorherige
`vercel deploy --prod` von Hand war überflüssig – beide bauten denselben
Commit, es ist nichts auseinandergelaufen. **Für künftige Auslieferungen reicht
der Push auf `main`.** Das Backend folgt keinem Zweig; es wird weiterhin mit
`flyctl deploy <pfad>\backend --ha=false` aus dem Arbeitsverzeichnis deployt.

## Was als Nächstes drankommt (Stand 05.09.2026)

**Zuerst: Browsertest auf einem echten Gerät.** Alles Bisherige ist gegen
Chrome am Rechner geprüft. Was ein Handy im Bahnhof zeigt – Teilen-Menü des
Betriebssystems, Einfügen ins Textfeld, Trefferflächen mit Gepäck in der Hand
– ist ungeprüft. Die acht Punkte stehen als Prüfliste unter „Mobilabnahme:
die Prüfliste“; **drei geratene Zahlen im Code hängen daran** und lassen sich
ohne diese Messung nicht entscheiden.

Offene Punkte, nach Dringlichkeit (Stand 05.09.2026):

1. ~~**Vokabular liegt doppelt.**~~ ✅ erledigt 04.09.2026 (`d6150d9`).
2. **Weitere echte Texte durchprobieren.** Bisher belegt: DB Navigator und
   VBB. Was scheitert, ist nach dem Umbau fast immer eine fehlende Vokabel –
   und die ist eine Zeile. **Unverändert offen.**
3. **P2 der Härtung, zweite Hälfte:** Der CSP-Header ist am 04.09. ergänzt
   (`3d8a842`). Offen bleibt das harte Oberlimit auf Upstream-Aufrufe je
   Stunde mit degradierter Auslieferung – die Ratenbegrenzung bremst je
   Aufrufer, viele Aufrufer summieren sich weiterhin.
4. ~~**Die Deprecation-Warnung** zu `disableRequestLogging`~~ ✅ erledigt
   04.09.2026 (`dcac4ca`), auf `logController` umgestellt.
5. ~~**§5 – FaSta-Koordinaten (ToDo 7b).**~~ ✅ **erledigt 05.09.2026, aber
   noch nicht ausgeliefert und nie an einem echten Routenabruf gesehen.**
   Die Bahnsteige holen ihre Lage jetzt aus FaSta, wo FaSta sie benennt.
   Was noch aussteht, steht als Prüfliste unter „Was an §5 noch nicht geprüft
   ist“ – vor allem: deployen, einen Stufe-3-Bahnhof abfragen und den Text
   lesen. Ein Test fehlt benennbar (ToDo 4e).
6. **Ersatz für die Wagenreihung** oder die bewusste Entscheidung, die
   Wagenposition fallen zu lassen. Solange beides aussteht, führt die
   Eingabemaske zwei Wagenfelder, die nichts bewirken.

Nicht geplant, bewusst: **keine KI für die Texterkennung.** Der Text müsste
das Gerät verlassen, was die gesamte Datenschutzarchitektur kippt; die App
soll im Bahnhof ohne Netz funktionieren; und die Art des Scheiterns wäre
falsch herum. Ein Parser scheitert laut („nicht erkannt"), ein Sprachmodell
leise und plausibel – es schreibt bereitwillig ein Gleis, das im Text nie
stand. Mit Gepäck und zwölf Minuten Umsteigezeit ist ein selbstbewusst
falsches Gleis schlimmer als gar keins.

## Braunschweig fand keine barrierefreie Route (07.09.2026)

Gemeldet nach dem Deployment: Braunschweig Hbf antwortet auf „Barrierefrei"
mit „Keine barrierefreie Route gefunden", obwohl der Bahnhof Aufzüge hat.

**Vier Verdächtige waren binnen einer Stunde ausgeschlossen** – und keiner
davon war es:

| Verdacht | Befund |
|---|---|
| Aufzüge fehlen in OSM | ❌ Vier kartiert, alle `wheelchair=yes`, `level="0;1"`, Betreiber DB InfraGO |
| Der Graph baut keine Aufzugkanten | ❌ Alle vier vorhanden, alle `barrierefrei=true` |
| FaSta sperrt sie als defekt | ❌ FaSta meldet **fünf** Anlagen, alle `ACTIVE`; die IDs decken sich mit OSMs `ref:operator_inventory` |
| Die Filterregel ist zu streng | ❌ Ebene Wege gelten als barrierefrei, sofern nicht `wheelchair=no` |

**Die Ursache liegt in der Anbindung.** Braunschweig hat auf Bahnsteigebene
fünf getrennte barrierefreie Inseln – eine je Bahnsteig, weil die Bahnsteige
nur über Ebene 0 verbunden sind:

| Insel | Gleise | Aufzug |
|---|---|---|
| 49 Knoten | **1, 2** | **keiner** |
| 29 | 7, 8 | ✅ |
| 29 | 3, 3b, 4 | ✅ |
| 28 | 5, 6 | ✅ |
| **3** | – | **verwaister vierter Aufzug** |

Der vierte Aufzug (OSM `n4061917638`, FaSta `10453807`, ACTIVE) steht **8 m**
von der Mitte des Gleises 1 – und hat auf Ebene 1 genau zwei Nachbarn: einen
2-Meter-Stummel und sich selbst eine Etage tiefer. Aus der Insel von Gleis 1
führen überhaupt nur **zwei Kanten heraus, beide Treppen**.

Der Mechanismus steht in `core/graph.ts`: Jeder Bahnsteigpunkt wird an
**genau einen** – den nächstgelegenen – Wegknoten derselben Ebene gehängt
(`ANBINDUNG_MAX_M = 30`). `gleis1:mitte` fand einen in 2 m; der Aufzug in
8 m war für keinen der sechs Punkte von Gleis 1 und 2 der Nächste und fiel
heraus.

**Dass die anderen drei funktionierten, war Glück in Fremddaten.** Bei ihnen
verbindet OSM den Aufzug selbst mit dem Bahnsteigweg. Gegengeprüft: Die drei
Bahnsteig-Relationen enthalten ihren Aufzug auch geometrisch, `1;2` nicht.

### Zwei naheliegende Wege waren versperrt

- **Punkt-in-Fläche**, schwellenwertfrei im Stil von §5: Der verwaiste Aufzug
  liegt *ausserhalb* der Bahnsteigfläche `1;2`. Löst diesen Fall nicht.
- ~~**FaSta-`description`**, der §5-Weg von der Anlage zum Bahnsteig: In
  Braunschweig sind alle fünf Beschreibungen leer.~~ **Falsch – zurückgenommen
  am 07.09.2026.** Das Prüfskript las `anlage.description`; der Client mappt
  das Feld auf **`beschreibung`** (`clients/fasta.ts:50`), also war jede
  Antwort `undefined`. Nachgemessen sind die Beschreibungen **vollständig
  da**: Braunschweig 5/5, Berlin 69/69, Hannover 18/20. Der verwaiste Aufzug
  sagt sogar selbst, wohin er gehört: **`"zu Gleis 1/2"`**.

**Damit ist die gebaute Regel schwächer als nötig.** `verankerterBahnsteig()`
aus §5 löst `"zu Gleis 1/2"` nach `['1','2']` auf, und OSMs
`ref:operator_inventory` trägt genau die FaSta-Anlagennummer
(`n4061917638` → `10453807`) – der Verbindungsschlüssel liegt also in beiden
Datensätzen. Eine Anbindung über diesen Weg bräuchte **keinen Umkreis und
keine Eindeutigkeitsprüfung**, weil die Quelle den Bahnsteig benennt statt
ihn zu raten. Aufgenommen als ToDo 24. Die 10-m-Regel bleibt bis dahin
stehen: Sie ist geprüft, ausgeliefert und wirkt auch dort, wo eine Anlage
keine Beschreibung trägt (Hannover: 2 von 20).

### Die Regel, die daraus wurde

Bewusst schmal, wie die gegen den Ebenensprung. `verbindeVerwaisteAufzuege()`
greift nur, wenn **alle drei** Bedingungen zutreffen:

1. Die barrierefreie Insel enthält einen Aufzug und **keinen** Bahnsteig.
2. Ein Bahnsteigpunkt derselben Ebene liegt näher als `VERWAIST_MAX_M`.
3. **Alle** Bahnsteigpunkte in diesem Umkreis gehören zu **einer** Insel.

`VERWAIST_MAX_M = 10` – entschieden am 07.09.2026, gemessen ist die Zahl
nicht. Sie ist bewusst viel enger als die 30 m der normalen Anbindung:
Dort wird ein Bahnsteig mit dem Wegenetz verbunden, das ohnehin zu ihm
gehört; hier wird eine Lücke in Fremddaten überbrückt. **Ein falsch
verbundener Aufzug ist auf der barrierefreien Route der teuerste denkbare
Fehler** – er schickt jemanden im Rollstuhl zu einem Lift, den er nicht
erreicht. Das ist schlechter als die ehrliche Absage. Bedingung 3 zählt
deshalb Inseln, nicht Gleisnummern: Ein Bahnsteig trägt oft zwei Gleise
(Braunschweig: „1;2"), und die sind derselbe begehbare Ort.

**Die Falle beim Bauen:** Der erste Entwurf rechnete die Inseln über *alle*
barrierefreien Kanten – also auch über die Aufzüge. Damit fuhr die Suche vom
verwaisten Ausstieg hinunter auf Ebene 0, fand dort Bahnsteige und hielt die
Insel für versorgt. Bedingung 1 traf nie zu, die Regel feuerte kein einziges
Mal. Gefragt ist, was der Ausstieg auf **seiner** Ebene zu Fuss erreicht.
Derselbe Denkfehler steckte zuerst auch im Test – die Richtung zählt: Vom
Aufzug aus *kommt* man an Bahnsteige (über Ebene 0 zu den Gleisen 3–8), nur
nicht umgekehrt.

### Gemessen über alle vier Fixtures

| Fixture | Aufzugkanten | Reparaturen |
|---|---|---|
| Braunschweig Hbf | 4 | **1** |
| Berlin Hbf | 30 | 0 |
| Gütersloh | 0 | 0 |
| Zernitz | 0 | 0 |

Drei Tests halten es fest, alle gegen die **echten** Overpass-Daten von
Braunschweig (neues Fixture): die Anbindung selbst, die Route Gleis 1 → 5,
und die Invariante **kein Bahnsteig ohne erreichbaren Aufzug**. Backend
steht bei 347.

## Die Mobilabnahme (07.09.2026, M1–M8 durch)

Nach neun Tagen als „einziger Blocker für Code" ist die Abnahme am Gerät
gelaufen. **Acht von neun Punkten sind beantwortet**, M9 (der Nachtest der
reparierten Routenwahl) steht noch aus, weil er erst nach dem Deployment
prüfbar ist.

| # | Ergebnis |
|---|---|
| M1 | ✅ **Der Dialog kommt.** Bei Ablehnung bleibt die Vorbelegung aus – wie vorgesehen. |
| M2 | ✅ **Die Erteilung bleibt gespeichert.** Nicht von der App: Sie hält dazu nichts. Der Speicher ist der Browser. |
| M3 | ✅ **Am Bahnhof erkannt.** Die Handeingabe-Aufforderung greift bei zu grobem Fix wie vorgesehen. Ein konkreter ±-Wert in der Halle wurde nicht notiert. |
| M4 | 🔶 **Funktioniert sehr gut**, aber kein Grenzwert bestimmbar. Der Radius bleibt bei 1000 m. |
| M5 | ⛔ **Die Ankunft wird nicht erkannt.** Nur Selberklicken. Ursache gefunden, siehe unten. |
| M6 | ✅ **Der Ebenensprung mit dem nächsten Schritt ist gut** – Hilfe, nicht Bevormundung. *Die Ebene hat andere Probleme; deren Anforderung steht aus.* |
| M7 | ✅ **Alles gut bedienbar.** |
| M8 | ⛔ **Viele Texte werden nicht gut erkannt**, z. B. die der VMV. Die Formate sind noch zu unterschiedlich. |

### M2: Wie lange die Freigabe gilt – die App weiß es nicht

Die Frage kam bei der Abnahme auf, und die Antwort ist unbequem: **Die App
kann es nicht beeinflussen und nicht auslesen.** Sie speichert zur Freigabe
nichts; `useStandort.ts` *fragt* nur über `navigator.permissions.query` nach
dem aktuellen Stand. Wie lange eine erteilte Freigabe hält, entscheidet
allein der Browser, und die Praxis geht auseinander: Chrome behält sie bis
zum Widerruf (setzt ungenutzte Berechtigungen aber selbsttätig zurück),
Safari behandelt sie deutlich kurzlebiger. **Verlassen darf sich die App auf
keines von beidem** – deshalb ist der Weg ohne Freigabe (Handeingabe) kein
Notbehelf, sondern der gleichberechtigte Pfad. Das war schon die Absicht;
M2 belegt sie.

### M3: die 2000 m waren nie eine Schwelle

Bei der Abnahme fiel „ab 2000 m Handeingabe" – so steht es sinngemäss auch
weiter oben unter „Nebenbefunde der Sichtprüfung". **Die Zahl ist keine
Schwelle, sondern war ein gemessener Wert.** Die Schwelle ist
`ERKENNUNG_MAX_M = 1000` in `standort/schwellen.ts`; der Rechner meldete
damals zufällig ±2000 m und löste sie deshalb aus. Beobachtet ist also: Die
Regel greift. **Nicht** beobachtet: wo sie greift.

Der Kommentar an der Konstante begründet die 1000 m sauber – der Server sucht
im Umkreis von 1000 m, und ist die Unsicherheit grösser als der Suchradius,
wäre das Ergebnis geraten. Die Zahl ist damit keine freie Schätzung mehr,
sondern an eine andere Zahl gebunden. **ToDo 15 schrumpft entsprechend:**
`ERKENNUNG_MAX_M` ist begründet, offen bleibt nur noch `NOTBEHELF_TTL_MS`.

### M5: die Ankunftserkennung ist in der Halle unerreichbar

Der schwerste Fund der Abnahme, und er ist kein Zahlendreher, sondern ein
Widerspruch zwischen zwei Konstanten.

`pruefeAnkunft()` in `standort/ankunft.ts` hat drei Tore, und das **erste**
sperrt:

```ts
if (standort.genauigkeitM > GENAUIGKEIT_MAX_M) return { zustand, vorschlagen: false }
```

`GENAUIGKEIT_MAX_M` ist **100 m**. Gemessen wurde am 29.08. **±118 m** – und
zwar *am Fenster*. In der Bahnhofshalle ist es schlechter. Der Zähler startet
also nie; `ANKUNFT_RADIUS_M` (40 m) und `ANKUNFT_VERWEIL_MS` (15 s) kommen
gar nicht erst zum Tragen. **Die Ankunftserkennung ist genau dort
unerreichbar, wo sie gebraucht wird.**

Die 100 m sind für ihren eigentlichen Zweck richtig: Ein Kartenpunkt, der auf
den Bahnsteig zeigen soll, darf nicht 118 m danebenliegen. Falsch ist, dass
**dieselbe** Schwelle die Ankunftserkennung sperrt – die braucht keine
Bahnsteiggenauigkeit, sie braucht „ungefähr am Zielgleis". Zwei verschiedene
Fragen an einer Zahl.

**Bewusst nicht sofort behoben.** Nach der Abnahme wiegt der Punkt leicht:
Das Selberklicken funktioniert, der Vorschlag war ohnehin nur eine Abkürzung,
und die Alternative – eine eigene, lockerere Schwelle für die Ankunft – ist
eine Entscheidung, keine Korrektur. Aufgenommen als ToDo 23.

### M8: der Parser ist zu formatnah

M8 bestätigt ToDo 20 und weitet es: Nicht nur die VMV fällt durch, sondern
„viele Texte". Die Formate sind untereinander zu verschieden, als dass die
bisherige Herangehensweise – ein Halt je Zeile, Rollenwörter als Marker –
sie alle trägt. Das ist mehr als die drei isolierten Blocker, die am 06.09.
notiert wurden. **ToDo 20 bleibt der nächste Hauptstrang**, aber der
Zuschnitt gehört vor dem Bauen noch einmal auf den Tisch.

## Die Routenwahl war auf dem Handy nicht bedienbar (07.09.2026)

Der erste Befund der Mobilabnahme, und der teuerste: **Keine der drei
Routenzeilen liess sich antippen.** Am Rechner war das nie aufgefallen – die
Sichtprüfung vom 31.08. hat die Knöpfe *gesehen* („Routenknöpfe als Zeilen mit
Radio-Punkt und Minuten ✅"), aber nie einen gedrückt.

**Es waren vier Fehler übereinander, und keiner davon lag im Knopf.** Der Tipp
feuerte die ganze Zeit. Nur war jeder Ausgang unsichtbar:

| # | Fehler | Wo | Wirkung |
|---|---|---|---|
| 1 | **Die Wahl wurde verworfen** | `App.tsx`, `eingabe.variante === 'barrierefrei' ? 'barrierefrei' : 'schnellste'` | „Mit Stopp" fiel still auf „Schnellste" zurück – **strukturell nie auswählbar** |
| 2 | **Kein Druckfeedback** | `.routenwahl-zeile` in `App.css` | Das einzige Bedienelement der App ohne `:active` – auf dem Touchscreen keinerlei Reaktion auf die Berührung |
| 3 | **Ladezustand unsichtbar** | `laden` wird nur an `Eingabe` gereicht | Nach dem Tippen sekundenlang nichts, bei kaltem Bahnhof bis zu 24 s |
| 4 | **Fehler unsichtbar** | `fehler` ebenso nur an `Eingabe` | Der 404 des Backends verpuffte folgenlos – bei einem Bahnhof ohne Aufzug **für immer** |

**Fehler 1 ist der lehrreiche.** Die Zeile stammt vom 31.08.2026, als es genau
zwei Varianten gab; `git blame` weist sie auf `8d8a02dc` aus. Am 05.09. kam
`mit-stopp` dazu (ToDo 9c) – und trat der **Liste** `ANGEBOTENE` bei, nicht
der Aufzählung daneben. Zwei Orte, die dasselbe wissen mussten, und einer
wurde vergessen. Genau das Muster, das am 04.09. schon einmal aufschlug
(ToDo 4b, doppeltes Bahnhofsnamen-Vokabular).

Die Korrektur zieht die Entscheidung an die Liste heran:

```ts
export function ersteVariante(gewuenscht: RoutenVariante): RoutenVariante {
  return ANGEBOTENE.includes(gewuenscht) ? gewuenscht : 'schnellste'
}
```

Eine neue Variante einzutragen reicht damit aus. Es gibt keine zweite Stelle
mehr, die vergessen werden kann.

### Warum es niemand gesehen hat

**Die Naht war an keiner Stelle getestet.** `Dashboard.test.tsx` reicht ein
`vi.fn()` als `onVariante` herein und prüft, dass es gerufen wird.
`varianten.test.ts` prüft den Lader mit einer eingespeisten Hole-Funktion.
Beide Seiten grün – und dazwischen der Code, in dem alle vier Fehler sassen.
Zwei Tests, die sich an den Rändern treffen, decken die Mitte nicht ab.

Am Rechner verdeckte zudem `cursor: pointer`, dass die Zeile kein
Druckfeedback hat: Der Zeigefinger-Cursor sagt „klickbar", und der Klick
*funktionierte* für „Barrierefrei" ja meistens. Auf dem Touchscreen gibt es
weder Cursor noch Hover – dort blieb nichts übrig, das den Tipp bestätigt
hätte.

### Nebenbefund: ein Tipp kostete drei Anfragen

`waehleVariante` rief `berechne` – dieselbe Funktion, die der
Eingabe-Bildschirm benutzt. Die holt über `ladeVarianten` **alle drei**
Varianten und ersetzte dabei den Variantenstand vollständig
(`setVarianten({ gewaehlt, [gewaehlt]: … })`), sodass die Minutenangaben der
anderen zwei Knöpfe erst verschwanden und dann einzeln wieder eintrudelten.
Der Kommentar darüber versprach seit dem 31.08. das Gegenteil: „Variante
wechseln, ohne neu zu rechnen wenn moeglich."

Jetzt holt der Wechsel genau die eine Variante, die getippt wurde, und
spreizt den Stand statt ihn zu ersetzen. Währenddessen nimmt keine Zeile
einen zweiten Tipp entgegen – sonst stapeln sich auf einer langsamen
Mobilverbindung drei Anfragen, und die zuletzt beantwortete gewinnt, was
nicht die zuletzt getippte sein muss.

### Was der Nutzer jetzt sieht

Die getippte Zeile trägt `aria-busy` und „lädt …" an der Stelle der Minuten,
die übrigen treten zurück und sind gesperrt. Schlägt die Variante fehl, steht
der **Text des Backends** unter der Gruppe – „Keine barrierefreie Route
gefunden (Treppen gesperrt, kein nutzbarer Aufzug)." oder „Kein WC und kein
Kiosk auf dem Weg gefunden." –, nicht die Gattungsmeldung aus `FEHLER_TEXTE`.
Der Grund ist konkreter als die Gattung, und bei diesen zwei Varianten ist
das Fehlschlagen der Normalfall, nicht die Ausnahme.

**Belegt durch 8 neue Tests** (4 in `varianten.test.ts`, 4 in
`Dashboard.test.tsx`); Frontend steht bei 268. **Nicht belegt:** dass sich die
Zeile am Gerät jetzt richtig anfühlt – das braucht dasselbe Handy noch einmal.

## ISR verworfen – und was die Suche stattdessen fand (06.09.2026)

**Entscheidung: ISR Data Service wird nicht bezogen. Zu teuer.** Der Eintrag
steht hier, damit die Frage nicht in einem halben Jahr erneut aufgemacht wird.

**Was ISR ist:** Das Infrastrukturregister der DB InfraGO – Bahnsteige,
Betriebsstellen, Streckenabschnitte und Tunnel des Schienennetzes. Es
beschreibt das Netz aus Betreibersicht, für Unternehmen, die Trassen planen.
Nicht den Fußweg eines Reisenden durch eine Halle.

**Der Schlüssel deckt es nicht ab.** Das ist geprüft, nicht vermutet: Gegen
`db-api-marketplace/apis/isr/v5` antworten genau die vier dokumentierten
Ressourcen mit **401 „Cannot find valid subscription"**, jeder erfundene Pfad
mit **404 „No resources match requested URI"**. Die beiden Antwortarten
trennen sauber „existiert, nicht abonniert" von „gibt es nicht" – und
widerlegen die Annahme, ein Schlüsselpaar decke alle Marketplace-Produkte ab.
Für RIS::Stations, Timetables und FaSta gilt sie, für ISR nicht.

| Bedingung | Wert |
|---|---|
| Preis | 1.846 € pro Jahr je Zugangsberechtigtem |
| Bezugsberechtigt | **nur „Zugangsberechtigte nach ERegG § 1 Abs. 12"** – Verkehrsunternehmen und Zugangsnachfrager |
| Ratenlimit | 1.000 Abfragen/Tag, 10/s |
| Koordinaten in `/bahnsteige` | **undokumentiert**, ohne Subscription nicht prüfbar |

Die Berechtigung wiegt schwerer als der Preis: Eine Wegeführungs-App ist kein
Zugangsberechtigter. Inhaltlich wäre ohnehin nur `/bahnsteige` in der Nähe –
`/betriebsstellen` doppelt RIS::Stations, die anderen beiden betreffen die
freie Strecke. **Nichts im Repo referenziert ISR; es fehlt der App nichts.**

### OpenStation – dieselbe Suche, ein besserer Fund

DB InfraGO veröffentlicht die Infrastrukturdaten der Personenbahnhöfe **offen
und ohne Schlüssel** nach NeTEx/SIRI (TSI-PRM-Pflichtdatensatz):

```
https://bahnhof.de/daten/netex     # HTTP 200, 291 MB XML, täglich neu
```

Am 06.09.2026 heruntergeladen und ausgezählt – nicht der Produktseite geglaubt:

| Element | Anzahl |
|---|---|
| `SitePathLink` (Wegekanten mit `From`/`To`) | **65.007** |
| `Quay` (Bahnsteige, z. B. „Bahnsteig Gleis 1") | 21.794 |
| `Level` | 19.989 |
| `AccessibilityAssessment` / `WheelchairAccess` / `TactileGuidance` | je 19.985 |
| `LiftEquipment` / `RampEquipment` / `EscalatorEquipment` | 7.598 / 6.991 / 1.749 |
| `AccessSpace` / `Entrance` | 10.692 / 4.938 |

**Der Haken ist derselbe wie bei §4.3, und er steht hier vor dem Nutzen:** Die
Geometrie ist dünn. Nur **2.245 von 21.794 Bahnsteigen** tragen einen
`Centroid` (10 %), bei `StopPlace` sind es 1.263 von 5.393. `SitePathLink`
führt **weder `Distance` noch `LineString` noch `TransferDuration`** – reine
Topologie, was mit was verbunden ist, ohne Länge und ohne Lage.

**OpenStation entsperrt §4.3 also nicht.** Drei Stoßrichtungen bleiben, in
denen es trotzdem trägt:

1. **`Level` als zweite Quelle gegen den Ebenensprung** – genau der Fehler vom
   01.09., wo eine geratene Ebene 0 auf −2 traf. Hier stehen 19.989 belegte
   Ebenenangaben.
2. **Aufzüge und Rolltreppen als Bestandsliste**, dazu **SIRI FM** für den
   Echtzeitstatus – ein FaSta-Gegenstück ohne Schlüssel und **ohne die
   `stationID`-Abhängigkeit**, die derzeit der einzige Weg zu FaSta ist.
3. **Die Wegetopologie als Gegenprobe zu OSM** – 65.007 Kanten, an denen sich
   prüfen ließe, ob der gebaute Graph Verbindungen erfindet oder übersieht.

Dokumentation: <https://github.com/dbinfrago/openstation-docs>

### Was das über RIS::Stations sagt

Bei der Analyse fiel nebenbei auf, was die Degradationstabelle des Konzepts
(Abschnitt 8) **nicht** enthält: eine Zeile für RIS::Stations. Sechs Ausfälle
sind dort geregelt – Overpass, Timetables, FaSta, fehlendes Gleis,
Wagenreihung, SSE. RIS::Stations steht in keiner. Der Code bestätigt es: Ein
Fehler aus `holeStationsInfo` wird in `routes/api.ts` durchgereicht, nur
fehlende Zugangsdaten geben ein sauberes 503. **Es ist die einzige Quelle ohne
Rückfallweg** – und über `stationID` hängt auch FaSta und damit §5 daran.
Aufgenommen als ToDo 17.

## Rechtliches

Impressum und Datenschutzerklärung sind erreichbar über `#impressum` und
`#datenschutz` sowie eine Fußzeile in beiden Ansichten. Die Betreiberangaben
stehen in [`frontend/src/rechtliches/betreiber.json`](./frontend/src/rechtliches/betreiber.json)
– der einzigen Stelle im Projekt mit personenbezogenen Daten; Impressum und
Datenschutzerklärung lesen beide von dort. Stehen dort Platzhalter, zeigt die
Impressumsseite eine rote Warnung.

Die Datenschutzerklärung beschreibt ausschließlich, was der Code nachweislich
tut: keine Cookies, kein `localStorage`, kein Tracking, Backend ohne
**Zugriffsprotokoll** (`disableRequestLogging`), Standort im Browser auf ~110 m
gerundet, Kartenkacheln erst beim Aufklappen. Schriften liegen lokal
(`frontend/src/assets/fonts/`, SIL OFL 1.1) – **kein** Google Fonts.

Bis zum 02.09.2026 stand hier `logger: false`. Das Backend protokolliert
inzwischen **Ausfälle** – Overpass, FaSta, RIS::Stations, Timetables –, damit
sie nicht länger lautlos geschehen. Diese Einträge nennen einen Bahnhof, keinen
Menschen. Was ausbleibt, ist Fastifys Anfrageprotokoll: Es trägt `url` und
`remoteAddress`, und die URL der Bahnhofssuche **ist** die Koordinate. Der Satz
„Ein Zugriffsprotokoll mit Koordinaten wird nicht geführt" war zwischenzeitlich
unwahr; `backend/test/datenschutz.test.ts` hält ihn jetzt fest.

## Konzeptlücken

Drei Vorgaben aus dem [Umsetzungskonzept](./2026-08-24-umstiegs-navigator-design.md)
sind nie gebaut worden. Sie stehen hier getrennt, weil sie keine Fehler sind,
sondern Entscheidungen, die noch anstehen.

> **Stand 05.09.2026 (abends):** §9 und §5 sind geschlossen, §4.3 zur Hälfte.
> Von den drei nie gebauten Vorgaben bleibt allein die volle Fassung von §4.3 –
> und die ist auf fehlende DB-Koordinaten blockiert, nicht auf Aufwand. Der
> Absatz zu §4.3 unten beschreibt den Zustand **vor** dem 04.09.; was sich
> geändert hat, steht direkt darunter.

**§4.3 – Abgleich OSM ↔ DB-Gleisliste.** Das Konzept verlangt: „Gleisnummern
aus OSM (`ref` an Bahnsteigen) gegen die DB-Gleisliste abgleichen; bei Konflikt
gewinnt die DB-Liste." Beide Quellen liefen bis zum 04.09. unabgeglichen
nebeneinander: Stufe 1 routet **geografisch** über OSM und kennt keine
EVA-Grenzen, das Synthesemodell dagegen ist **EVA-gebunden**.

Seit dem 31.08. ist das der wichtigste offene Punkt, weil es dafür jetzt einen
belegten Fehlschluss gibt. **München Hbf, Gleis 5 → Gleis 2** antwortet mit
„Gleis 2 gegenüber, kein Ebenenwechsel" – 1 Schritt, 30 Sekunden. Tatsächlich
liegt Gleis 2 im S-Bahn-Tiefbahnhof, eine Ebene tiefer. Die Gegenprobe
Gleis 11 → 2 rechnet korrekt 17 Schritte. Ursache ist `istGleicherBahnsteig`
in `core/routing.ts`: Es vergleicht `bahnsteigId` aus OSM, und dort trägt
offenbar ein Bahnsteig beide Gleisnummern. Ein Abgleich gegen die DB-Gleisliste
– die Gleis 2 eindeutig `8098263` (tief) zuordnet – würde genau das auffangen.

Der Fehler ist **älter als die Gruppenauflösung** und von ihr unberührt:
`istGleicherBahnsteig` arbeitet allein auf dem OSM-Graphen, dessen Aufbau
(Stationsposition, Radius 400 m) unverändert ist.

**Erledigt am 04.09.2026 – in enger Fassung.** Die DB-Gleisliste dient jetzt
als **Trenner**, nicht als Ersatz für die OSM-Geometrie: Zwei Gleise, die die
DB unter verschiedenen Verkehrsstellen führt, können nie derselbe Bahnsteig
sein. Das nimmt der Münchener Fehlauskunft die falsche Behauptung. Einzelheiten
und die Messung unter „Die DB-Gleisliste als Trenner“.

**Offen bleibt die volle Fassung – und sie ist blockiert.** „Bei Konflikt
gewinnt die DB-Liste" wörtlich zu nehmen hieße, die OSM-Geometrie an
DB-Koordinaten zu verankern. Die gibt es nicht: Der `platforms`-Endpunkt führt
keine (nachgemessen an zwei Münchener Verkehrsstellen, siehe „Was der
`platforms`-Endpunkt liefert"). Das ist kein Aufwandsproblem.

**§5 – FaSta-Koordinaten im Synthesemodell.** ✅ **Erledigt am 05.09.2026.**
Vorgesehen war, die Lage von Aufzügen und Rolltreppen aus FaSta zu beziehen;
tatsächlich wurde FaSta nur bei `variante=barrierefrei` abgefragt und floss
nicht in die Geometrie ein. Das Standardmodell setzte seine Querung deshalb auf
halbe Bahnsteiglänge, statt sie dort zu vermuten, wo nachweislich ein Aufzug
steht.

Jetzt holt jeder Bahnsteig, den FaSta **benennt**, seine Lage aus den echten
Anlagenkoordinaten, und der Weg zur Querung wird gerechnet statt geraten. Der
Weg dorthin war nicht der erwartete – Einzelheiten unter „Was FaSta wirklich
liefert“.

**§9 – getrennte Blöcke Ankunft und Abfahrt.** ✅ **Erledigt am 05.09.2026.**
Vorgesehen waren zwei Blöcke mit **je** Gleis, Zug und Wagennummer; gebaut war
eine flache Maske mit *einer* Wagennummer. Jetzt stehen beide Blöcke, `wagen`
heißt `wagenAn`, `wagenAb` ist dazugekommen. Der im Konzept genannte
„verfeinerte Zielpunkt über die Abfahrts-Wagenposition" bleibt Stufe 2 – und
wäre ohnehin nicht baubar, solange die Wagenreihung tot ist. Einzelheiten unter
„Getrennte Blöcke – und der Wagen, der zum falschen Zug gehörte“.

## Bekannte Einschränkungen

Die Arbeitsliste steht oben unter [„Offene ToDos"](#offene-todos). Hier nur,
was dauerhaft gilt oder bewusst so ist:

- **Der Reise-Import kennt nur zwei echte Textproben.** Belegt sind DB
  Navigator und VBB-App (je eine reale Verbindung, als Fixture in den Tests).
  Die Formate sind nicht dokumentiert und können sich ohne Vorwarnung ändern.
  Der Ausfallweg ist harmlos: Erkennung scheitert, es wird von Hand
  eingetippt – geraten wird nichts.
- **Wagen und Sitzplatz kommen aus keinem geteilten Text.** Weder der
  DB-Textexport noch die Rechnung führen sie. Das Feld bleibt manuell.
- **Live-Daten erst am Reisetag.** Timetables `/plan` kennt nur ein
  rollierendes Fenster von unter 24 Stunden (gemessen: 15 h voraus liefert
  Daten, 23 h voraus 404). Eine früher importierte Reise füllt die Felder,
  wird aber erst am Reisetag verfolgt.
- ~~**Die Vorsilben-/Nachsilbenliste für Bahnhofsnamen liegt doppelt**~~ –
  am 04.09.2026 aufgelöst (`d6150d9`): Die Frontend-Normalisierung ist
  gefallen, die Auflösung liegt allein in `backend/src/core/bahnhofsname.ts`.
  Der Bahnhof wandert weiterhin als **Suchtext** ins Formular, nicht als
  getroffene Wahl – Berlin Hbf führt drei EVA-Nummern, von denen eine keinen
  Fahrplan hat.
- **Nur am Desktop gesehen, nie auf einem Handy.** Die Sichtprüfung am
  30.08. hat Layout, WebGL-Karte, Bahnhofssuche und den Standortpfad
  bestätigt. Was ein echtes Gerät zeigt – Berechtigungsdialog, GPS-Genauigkeit
  in einer Bahnhofshalle, Bedienbarkeit mit Gepäck – bleibt offen.
- **Browser-API-Dateien ohne Unit-Tests.** `api/sse.ts`, `LiveBanner` und
  `standort/useStandort.ts` sind nur über TypeScript und Build abgesichert –
  bewusst, sie enthalten keine Entscheidungslogik. Der SSE-**Endpunkt** wird
  dagegen in `test/live.test.ts` gegen einen echten HTTP-Server geprüft.
- **Die Wagenposition ist in Produktion wirkungslos** – der Endpunkt existiert
  nicht mehr (siehe „Die Wagenreihung ist tot"). Jeder Aufruf mit Wagennummer
  degradiert auf „Route startet an der Bahnsteigmitte". Das Fixture
  (`backend/test/fixtures/db/wagenreihung-ice1006.json`) bleibt handgebaut und
  ist gegen nichts mehr zu verifizieren. RIS::Stations, Timetables und FaSta
  sind gegen echte Antworten verifiziert; die Gruppen-Fixtures
  (`gruppe-*.json`) sind am 31.08.2026 von der echten API aufgezeichnet.

- **Die Overpass-Abfrage holt WC und Kiosk für jeden Bahnhof mit**, auch für
  Nutzer, die die Variante „Mit Stopp" nie wählen. Der Graph wird je Bahnhof
  zwischengespeichert, nicht je Variante – die Alternative wären zwei parallele
  Cachevarianten gewesen. Bewusste Wahl, siehe „Mit Stopp: WC & Kiosk".
- **Spike-Rohdaten** (`backend/test/fixtures/spike/`) sind gitignored – über
  `scripts/spike-datenrealitaet.ts` reproduzierbar.
- **München Hbf, Gleis 5 → 2 antwortet nicht mehr falsch – aber noch nicht
  richtig.** Bis zum 04.09. lautete die Auskunft „Gleis 2 gegenüber, kein
  Ebenenwechsel", 30 s; Gleis 2 liegt im S-Bahn-Tiefbahnhof. Die falsche
  Kurzweg-Behauptung ist weg (gemessen gegen die echte API: 0 Treffer für
  „gegenüber"). **Die Route bleibt trotzdem falsch:** 2 Schritte, 41 s,
  komplett auf `level 0`. Der Grund ist nicht mehr `istGleicherBahnsteig`,
  sondern die OSM-Geometrie selbst – München trägt für den Tiefbahnhof keine
  Ebeneninformation, und die Knoten für Gleis 2 liegen am falschen Ort. Das zu
  beheben verlangt den vollen §4.3, und der ist auf fehlende DB-Koordinaten
  blockiert. Die Gegenprobe Gleis 11 → 2 rechnet weiter (18 Schritte, 551 s).
- **Vercel-Vorschau-Deployments erreichen die API nicht.** Ihre URLs stehen
  nicht in `CORS_ORIGIN`; für einen Vorschautest die konkrete URL vorübergehend
  aufnehmen. Absicht – eine Wildcard würde jede fremde Vercel-App an die API
  lassen.

### Am 28.08.2026 erledigt

- ~~**DB API Marketplace:** Registrierung ausstehend~~ → abonniert und in
  Produktion in Betrieb (RIS::Stations, Timetables, FaSta, StaDa).
- ~~**Alle DB-Schemata sind ungeprüft**~~ → RIS::Stations und Timetables gegen
  echte Antworten verifiziert; zwei Fehler dabei gefunden und behoben.
- ~~**GitHub-Remote fehlt**~~ → Repo liegt auf
  <https://github.com/jbee827-sys/Umstieg.>
- ~~**Vercel bewusst nicht verwendet**~~ → umgekehrt: Frontend läuft auf
  Vercel, Backend als Container. Das VITA-Projekt bleibt unberührt (eigenes
  Vercel-Projekt). Begründung: [`docs/deployment.md`](./docs/deployment.md).
- ~~**FaSta-Adressierung ungeklärt**~~ → am 31.08.2026 umgesetzt: `stationID`
  aus RIS::Stations wird durchgereicht. Dabei zeigte sich, dass die alte
  Adressierung nicht mit einem Fehler quittierte, sondern mit HTTP 200 und
  leerer Liste – `variante=barrierefrei` kannte in Produktion nie einen Aufzug,
  ohne dass es irgendwo auffiel.

## Konzeptkorrekturen (aus Analyse + Design übernommen)

1. Live-Polling **pro EVA-Nummer** bündeln statt pro Route (Ratenlimits).
2. Stufe 3 (Synthesemodell) ohne präzise Meterangaben – „ca."-Formulierungen.
3. Frontend hält berechnete Route offline-fähig im Speicher; SSE-Reconnect fordert Route neu an.
4. **Ampel relativ zur Gehzeit** (aus dem Design übernommen, ersetzt absolute 2-min-Schwelle).
