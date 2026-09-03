# Umstiegs-Navigator („Umstieg.")

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Schritt-für-Schritt-Anweisung und Karte – und live bewertet, ob der Anschluss erreichbar ist.

**Konzept:** [`2026-08-24-umstiegs-navigator-design.md`](./2026-08-24-umstiegs-navigator-design.md)
**Implementierungsplan MVP (17 Tasks):** [`docs/plans/2026-08-24-umsetzungsplan-mvp.md`](./docs/plans/2026-08-24-umsetzungsplan-mvp.md)
**Spec Standort (P1):** [`docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md`](./docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md)
**Plan Standort (P1, 12 Tasks):** [`docs/superpowers/plans/2026-08-27-standort-und-navigation.md`](./docs/superpowers/plans/2026-08-27-standort-und-navigation.md)
**Spec Schrittnavigation:** [`docs/superpowers/specs/2026-08-30-schrittnavigation-design.md`](./docs/superpowers/specs/2026-08-30-schrittnavigation-design.md)
**Plan Schrittnavigation (8 Tasks):** [`docs/superpowers/plans/2026-08-30-schrittnavigation.md`](./docs/superpowers/plans/2026-08-30-schrittnavigation.md)
**UI-Design (Claude Design Import):** [`design/Umstieg.dc.html`](./design/Umstieg.dc.html)

## Architektur

- **Backend:** Node.js ≥ 20, Fastify 5, TypeScript (strict). Zustandslos, keine Datenbank, RAM-LRU-Cache. Holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten (Marketplace-APIs).
- **Frontend:** React + Vite + TypeScript. Design siehe unten. Mobil zuerst.
- **Betrieb:** Frontend statisch auf **Vercel**, Backend als dauerhaft laufender **Container** (Fly.io). Bewusst getrennt – SSE, EVA-Poller und Graph-Cache brauchen einen Prozess mit Gedächtnis, den Serverless nicht garantiert. Siehe [`docs/deployment.md`](./docs/deployment.md).

## Hier weitermachen (Stand 03.09.2026)

> **Die Meldungsseite ist gebaut und im Browser gesehen** – Einzelheiten im
> Abschnitt [„Meldungsseite"](#meldungsseite-gebaut-03092026). Dabei sind auch
> **P4 und P5 gefallen**, die seit dem 01.09. auf ein Live-Ereignis warteten:
> Statt weiter darauf zu hoffen, wurden die Ereignisse von aussen eingespeist
> (siehe „Wie P4 und P5 doch noch sichtbar wurden").
>
> **Nächster Schritt: die Mobilabnahme am echten Gerät** (P1 Task 12 / ToDo 3).
> Das ist der letzte offene Punkt der Sichtprüfung und braucht Handarbeit an
> einem Handy – Berechtigungsdialog, GPS in der Bahnhofshalle,
> Ankunftserkennung am Gleis, Bedienbarkeit mit Gepäck.

```bash
cd backend && npm test        # muss 223 von 223 grün sein
cd backend && npm run lint    # oxlint + tsc --noEmit, muss sauber sein
cd frontend && npm test       # muss 179 von 179 grün sein
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

**Was fehlt, ist keine Zeile Code, sondern der Blick darauf:** Die
Sichtprüfung am Desktop ist erfolgt (Abschnitte „Abnahme im Browser" und
„Meldungsseite"). Offen bleibt, was nur ein Handy zeigt – Berechtigungsdialog,
GPS-Genauigkeit in der Bahnhofshalle, Ankunftserkennung am Gleis. Nächster
Schritt ist deshalb P1 Task 12 (Mobilabnahme, fünf Punkte im Plan). Das
braucht Handarbeit an einem echten Gerät.

## Offen: was NICHT geprüft ist (Stand 03.09.2026)

Der Frontend-Umbau und die sechs Feinschliffe sind **codeseitig fertig und
maschinell grün** (Stand 03.09.2026: 179 Frontend-Tests, 221 Backend-Tests, Build und Lint
sauber). Was fehlt, ist der Blick darauf. Dieser Abschnitt trennt bewusst,
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
| P6 | **Mobilabnahme am Gerät** | Unverändert offen: Berechtigungsdialog, GPS in der Halle, Ankunftserkennung, Bedienbarkeit mit Gepäck. |

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
| 3a | **Erkennungsradius von 1000 m prüfen** | Am 31.08. beobachtet: Von `52.84/13.81` aus liegt Eberswalde Hbf **1094 m** entfernt – 94 m zu weit, die Umkreissuche liefert nichts, und die Vorbelegung bleibt leer. Die Rohantwort enthält dort 17 Bushaltestellen, aber keine Eisenbahn-Verkehrsstelle; der Filter arbeitet also richtig. Zu entscheiden ist der Radius (`ERKENNUNG_RADIUS_M` in `routes/api.ts`) – gehört in die Mobilabnahme. |
| ~~3b~~ | ~~**Sichtprüfung der neuen Bildschirme**~~ ✅ **erledigt 03.09.2026** | Ampel (P1), Weg-Seite (P2) und Angekommen-Seite (P3) am 01.09.; P4 und P5 am 03.09. über eingespeiste Ereignisse. Offen bleibt allein die Mobilabnahme (ToDo 3). |
| ~~3e~~ | ~~**Der Ebenensprung**~~ ✅ **erledigt 01.09.2026** | Strukturell, nicht Berliner Eigenart: eine geratene Ebene 0 plus zwei Bahnsteige, die sich eine Gleisnummer teilen. Einzelheiten und Auszählung unter „Der Ebenensprung“. Der volle Abgleich OSM ↔ DB-Gleisliste (§4.3, ToDo 7) bleibt davon unberührt offen. |
| ~~3f~~ | ~~**Zugtafel kappen**~~ ✅ **erledigt 01.09.2026** | Zeitfenster −5/+45 Minuten und vier Kategorien statt einer Bandwurmliste. Aus 113 Einträgen wurden 51 in drei Blöcken. Siehe „Die Zugauswahl“. |
| 3g | **„Schnellste“ ist langsamer als „barrierefrei“** | 6 min gegen 5 min im selben Dashboard. Die schnellste Route darf nie langsamer sein als eine andere Variante. |
| ~~3c~~ | ~~**Gleichzeitige Graphbauten zusammenführen**~~ ✅ **erledigt 01.09.2026** | Zwei Karten laufender Versprechen in `routes/api.ts` – eine auf die EVA, eine auf den Bahnhofsschlüssel. Wer als Zweiter kommt, wartet auf den laufenden Bau, statt danebenher einen eigenen zu starten. Drei Tests in `test/cache.test.ts`. **Die Falle dabei:** Bei einem Bahnhof aus einer einzigen Verkehrsstelle sind EVA und Gruppenschlüssel dieselbe Zeichenkette – in **einer** Karte fand der innere Bau das noch offene äussere Versprechen und wartete auf sich selbst. Der Testlauf lief in den Timeout, nicht in eine Fehlermeldung. |
| ~~3d~~ | ~~**Frontend deployen**~~ ✅ **erledigt 01.09.2026** | Frontend auf Vercel, Backend auf Fly.io. Einzelheiten unter „Deployment 01.09.2026“ – dort steht auch, was dabei **nicht** nachweisbar war. |
| ~~3h~~ | ~~**Meldungsseite bauen**~~ ✅ **erledigt 03.09.2026** | Neues Modell `src/meldungen/`, neuer Bildschirm `src/screens/Meldungen.tsx`; `Stoerung.tsx` ist darin aufgegangen. 25 Tests dazu. Einzelheiten unter „Meldungsseite". |
| 3 | **Mobilabnahme am echten Gerät** | Die Sichtprüfung am Desktop ist am 29./30.08. erfolgt (siehe „Abnahme im Browser"). Offen bleibt, was nur ein Handy zeigt: Berechtigungsdialog, Wiederkehrer ohne Dialog, Genauigkeit im Bahnhof, Ankunftserkennung am Gleis, und ob die automatische Ebenenwahl als Hilfe oder als Bevormundung ankommt. `mkcert`-Zertifikate in `frontend/.cert/` schalten den Dev-Server auf HTTPS. |
| ~~4~~ | ~~**4 Lint-Warnungen im Frontend**~~ ✅ **erledigt 01.09.2026** | `npm run lint` ist jetzt ohne Ausgabe. Einzelheiten im Abschnitt „Lint-Warnungen aufgelöst“. Voraussetzung waren 11 neue Tests für `Zugauswahl` und `Eingabe` – beide Komponenten hatten vorher **keine**. |
| 5 | **Vercel: Framework-Preset steht auf „Services"** | Rückstand der `experimentalServices`-Erkennung beim `vercel link`. Die `vercel.json` überschreibt es, der Build ist nachweislich korrekt – kosmetisch, aber irreführend. Settings → Build & Deployment. |
| 6 | **Vercel-Preview-Variable nur für `feat/mvp`** | `VITE_API_BASE` konnte nicht „für alle Preview-Zweige" gesetzt werden (CLI-Fehler in v53.1.0: der vorgeschlagene Befehl ist derselbe, der scheitert). Neue Zweige brauchen einen eigenen Eintrag oder das Dashboard. |

### Als Nächstes (der Hauptstrang)

| # | Aufgabe | Umfang |
|---|---|---|
| 7 | **Drei Konzeptvorgaben, die nie gebaut wurden** | Siehe eigener Abschnitt „Konzeptlücken" weiter unten: der Abgleich OSM ↔ DB-Gleisliste (§4.3), FaSta-Koordinaten im Synthesemodell (§5) und die getrennten Blöcke Ankunft/Abfahrt (§9). Der erste ist seit dem 31.08. der wichtigste offene Punkt – er erklärt den München-Fehlschluss weiter unten. |
| 8 | **MVP-Task 17 abschließen** | `Dockerfile` steht. Offen: Degradationstests (jede Zeile der Konzept-Tabelle Abschnitt 8 als eigener Test) und Mobile-Feinschliff. |
| 9 | **Restliche Design-Screens** | Der Umbau nach dem Entwurf ist am 31.08. erfolgt (Spec und Plan unter `docs/superpowers/`). Offen bleiben allein die drei Punkte, die das Backend brauchen: Ticket-Import, Wagenreihungsseite und die Variante *Mit Stopp: WC & Kiosk* – vollständig spezifiziert in [Abschnitt 8 der Spec](./docs/superpowers/specs/2026-08-31-frontend-nach-design-design.md). Ursachenanalyse: [`docs/2026-08-31-design-abgleich.md`](./docs/2026-08-31-design-abgleich.md). |

### Später / bei Gelegenheit

| # | Aufgabe | |
|---|---|---|
| 10 | **Spike-Nachlauf für 13 Bahnhöfe** | `npx tsx scripts/spike-datenrealitaet.ts` – gecacht, fragt nur die fehlenden ab, sobald Overpass stabil antwortet. |
| 11 | **DB-Antwortschema der Wagenreihung prüfen** | RIS::Stations, Timetables und FaSta sind gegen echte Antworten verifiziert – RIS::Stations am 31.08. mit aufgezeichneten Fixtures (`test/fixtures/db/gruppe-*.json`). **Nicht geprüft:** allein die Wagenreihung, deren Fixture weiterhin handgebaut ist. |
| 12 | **Ticket-PDF-Import** | Im Prototyp als UI-Flow vorhanden, laut Konzept Stufe 2. Backend fehlt. |
| 13 | **Repo-Sichtbarkeit** | Repo ist öffentlich. Inhaltlich unbedenklich (Historie mehrfach auf Secrets geprüft, zuletzt 28.08.2026 über alle Blobs – 0 Treffer), aber bewusst zu entscheiden. |
| ~~14~~ | ~~**Frontend kann keine Komponenten testen**~~ ✅ **erledigt 31.08.2026** | jsdom und Testing Library sind eingerichtet (`vitest.config.ts`, `src/test-setup.ts`). Die Komponententests waren die Voraussetzung für den Frontend-Umbau. |
| 15 | **Zwei geratene Schwellenwerte** | `ERKENNUNG_MAX_M = 1000` (Genauigkeitsbudget der Bahnhofserkennung) und `NOTBEHELF_TTL_MS = 600000` (Cache-Frist für Stufe 3; über `GRAPH_NOTBEHELF_TTL_MS` ohne Neubau verstellbar) sind begründete Startwerte ohne Messung dahinter. Erst die Mobilabnahme zeigt die Richtung. *Der dritte Wert, `MINDEST_SCHRITT_MS = 8000` (Anzeigedauer je Schritt), ist am 02.09.2026 entfallen: Die Schrittanzeige rückt nicht mehr nach Zeit vor, damit gibt es keine Anzeigedauer mehr zu raten.* |

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
flyctl deploy D:\Claude-code\Umstieg\backend --ha=false
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
`C:\Users\jbeer\.secrets\` (Vererbung entfernt, nur der Benutzer hat Zugriff).
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
   `/d/Claude-code/...` statt `D:\Claude-code\...`, `&&` statt `;`, und keine
   Cmdlets wie `iwr`/`iex` (daran scheiterte das Fly-Install-Skript).
2. **Jeder Aufruf startet in `D:\Claude-code`, nicht im Projektordner.**
   Deshalb in jedem Befehl `cd /d/Claude-code/Umstieg/...` voranstellen –
   sonst „fatal: not a git repository".
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
| Eingabe | Bahnhofssuche, Gleise, Zugauswahl; Gehtempo hinter „Mehr einstellen" |
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
npx tsx watch --env-file="$HOME/.secrets/umstieg.env" src/server.ts
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

**Die Lehre für dieses Projekt:** `curl` ist kein Ersatz für einen Browser,
sobald eine Eigenschaft im Browser durchgesetzt wird – CORS, CSP,
Mixed-Content, `Permissions-Policy`. Bei allem, was der Browser und nicht der
Server entscheidet, zählt nur der Blick im Browser.

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

**§4.3 – Abgleich OSM ↔ DB-Gleisliste.** Das Konzept verlangt: „Gleisnummern
aus OSM (`ref` an Bahnsteigen) gegen die DB-Gleisliste abgleichen; bei Konflikt
gewinnt die DB-Liste." Beide Quellen laufen bis heute unabgeglichen
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

**§5 – FaSta-Koordinaten im Synthesemodell.** Stufe 3 soll die Lage von
Aufzügen und Rolltreppen aus FaSta beziehen. Tatsächlich wird FaSta nur bei
`variante=barrierefrei` abgefragt und fließt nicht in die Geometrie ein. Das
Standardmodell setzt seine Querung deshalb auf halber Bahnsteiglänge an, statt
sie dort zu vermuten, wo nachweislich ein Aufzug steht.

**§9 – getrennte Blöcke Ankunft und Abfahrt.** Vorgesehen sind zwei Blöcke mit
**je** Gleis, Zug und Wagennummer. Gebaut ist eine flache Maske mit *einer*
Wagennummer, die des Ankunftszugs. Für den Abfahrtszug fehlt das Feld – womit
der im Konzept genannte „verfeinerte Zielpunkt über die Abfahrts-Wagenposition"
keine Eingabe hätte. Der steht allerdings ohnehin unter Stufe 2.

## Bekannte Einschränkungen

Die Arbeitsliste steht oben unter [„Offene ToDos"](#offene-todos). Hier nur,
was dauerhaft gilt oder bewusst so ist:

- **Nur am Desktop gesehen, nie auf einem Handy.** Die Sichtprüfung am
  30.08. hat Layout, WebGL-Karte, Bahnhofssuche und den Standortpfad
  bestätigt. Was ein echtes Gerät zeigt – Berechtigungsdialog, GPS-Genauigkeit
  in einer Bahnhofshalle, Bedienbarkeit mit Gepäck – bleibt offen.
- **Browser-API-Dateien ohne Unit-Tests.** `api/sse.ts`, `LiveBanner` und
  `standort/useStandort.ts` sind nur über TypeScript und Build abgesichert –
  bewusst, sie enthalten keine Entscheidungslogik. Der SSE-**Endpunkt** wird
  dagegen in `test/live.test.ts` gegen einen echten HTTP-Server geprüft.
- **Das Wagenreihungs-Fixture ist weiterhin handgebaut**
  (`backend/test/fixtures/db/wagenreihung-ice1006.json`, mit Hinweis im Kopf).
  RIS::Stations, Timetables und FaSta sind gegen echte Antworten verifiziert;
  die Gruppen-Fixtures (`gruppe-*.json`) sind am 31.08.2026 von der echten API
  aufgezeichnet. Allein der Wagenreihungs-Parser kann noch auf
  Feldnamen-Abweichungen laufen.
- **Spike-Rohdaten** (`backend/test/fixtures/spike/`) sind gitignored – über
  `scripts/spike-datenrealitaet.ts` reproduzierbar.
- **München Hbf, Gleis 5 → 2 antwortet falsch** („gegenüber, kein
  Ebenenwechsel", 30 s). Gleis 2 liegt im S-Bahn-Tiefbahnhof. Ursache ist
  `istGleicherBahnsteig` auf OSM-Daten – siehe Konzeptlücke §4.3. Betrifft nur
  Bahnhöfe, an denen OSM eine Gleisnummer doppelt führt; Gleis 11 → 2 rechnet
  am selben Bahnhof korrekt.
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
