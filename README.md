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

## Hier weitermachen (Stand 31.08.2026)

```bash
cd backend && npm test        # muss 180 von 180 grün sein
cd backend && npm run lint    # tsc --noEmit, muss sauber sein
cd frontend && npm test       # muss 37 von 37 grün sein
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

**Was fehlt, ist keine Zeile Code, sondern der Blick darauf:** Die
Sichtprüfung am Desktop ist am 29./30.08. erfolgt (Abschnitt „Abnahme im
Browser"). Offen bleibt, was nur ein Handy zeigt – Berechtigungsdialog,
GPS-Genauigkeit in der Bahnhofshalle, Ankunftserkennung am Gleis. Nächster
Schritt ist deshalb P1 Task 12 (Mobilabnahme, fünf Punkte im Plan). Das
braucht Handarbeit an einem echten Gerät.

## Offene ToDos

### Sofort (kleine Schritte, klar umrissen)

| # | Aufgabe | Hintergrund |
|---|---|---|
| ~~1~~ | ~~**EVA-Split bei grossen Bahnhöfen**~~ ✅ **erledigt 31.08.2026** | Gelöst über `groupMembers` aus RIS::Stations. Einzelheiten im Abschnitt „Verkehrsstellengruppen". |
| ~~1b~~ | ~~**Graph-Cache vergiftet sich selbst**~~ ✅ **erledigt 31.08.2026** | Frist jetzt nach Qualität: Stufe 1/2 volle 24 h, Stufe 3 zehn Minuten (`graphTtlMs` in `cache/lru.ts`). |
| ~~2~~ | ~~**FaSta-Adressierung schließen**~~ ✅ **erledigt 31.08.2026** | `stationID` wird durchgereicht. Der Fund dabei: Mit der EVA antwortete FaSta **nicht** mit einem Fehler, sondern mit HTTP 200 und `[ ]`. |
| 3a | **Erkennungsradius von 1000 m prüfen** | Am 31.08. beobachtet: Von `52.84/13.81` aus liegt Eberswalde Hbf **1094 m** entfernt – 94 m zu weit, die Umkreissuche liefert nichts, und die Vorbelegung bleibt leer. Die Rohantwort enthält dort 17 Bushaltestellen, aber keine Eisenbahn-Verkehrsstelle; der Filter arbeitet also richtig. Zu entscheiden ist der Radius (`ERKENNUNG_RADIUS_M` in `routes/api.ts`) – gehört in die Mobilabnahme. |
| 3 | **Mobilabnahme am echten Gerät** | Die Sichtprüfung am Desktop ist am 29./30.08. erfolgt (siehe „Abnahme im Browser"). Offen bleibt, was nur ein Handy zeigt: Berechtigungsdialog, Wiederkehrer ohne Dialog, Genauigkeit im Bahnhof, Ankunftserkennung am Gleis, und ob die automatische Ebenenwahl als Hilfe oder als Bevormundung ankommt. `mkcert`-Zertifikate in `frontend/.cert/` schalten den Dev-Server auf HTTPS. |
| 4 | **4 Lint-Warnungen im Frontend** (`cd frontend && npm run lint`) | Drei `set-state-in-effect` (Task 13/15 und die Bahnhofs-Vorbelegung), eine `purity` (`Date.now()` im Render). Alle bestehen bewusst; neue Warnungen wurden bei jeder Änderung behoben statt übernommen. |
| 5 | **Vercel: Framework-Preset steht auf „Services"** | Rückstand der `experimentalServices`-Erkennung beim `vercel link`. Die `vercel.json` überschreibt es, der Build ist nachweislich korrekt – kosmetisch, aber irreführend. Settings → Build & Deployment. |
| 6 | **Vercel-Preview-Variable nur für `feat/mvp`** | `VITE_API_BASE` konnte nicht „für alle Preview-Zweige" gesetzt werden (CLI-Fehler in v53.1.0: der vorgeschlagene Befehl ist derselbe, der scheitert). Neue Zweige brauchen einen eigenen Eintrag oder das Dashboard. |

### Als Nächstes (der Hauptstrang)

| # | Aufgabe | Umfang |
|---|---|---|
| 7 | **Drei Konzeptvorgaben, die nie gebaut wurden** | Siehe eigener Abschnitt „Konzeptlücken" weiter unten: der Abgleich OSM ↔ DB-Gleisliste (§4.3), FaSta-Koordinaten im Synthesemodell (§5) und die getrennten Blöcke Ankunft/Abfahrt (§9). Der erste ist seit dem 31.08. der wichtigste offene Punkt – er erklärt den München-Fehlschluss weiter unten. |
| 8 | **MVP-Task 17 abschließen** | `Dockerfile` steht. Offen: Degradationstests (jede Zeile der Konzept-Tabelle Abschnitt 8 als eigener Test) und Mobile-Feinschliff. |
| 9 | **Fehlende Design-Screens** | Von 6 Screens sind Eingabe, Routenansicht, Karte und „Angekommen" (P1 Task 9) gebaut. Offen: Störung/Gleiswechsel und Wagenreihung als eigene Screens. |

### Später / bei Gelegenheit

| # | Aufgabe | |
|---|---|---|
| 10 | **Spike-Nachlauf für 13 Bahnhöfe** | `npx tsx scripts/spike-datenrealitaet.ts` – gecacht, fragt nur die fehlenden ab, sobald Overpass stabil antwortet. |
| 11 | **DB-Antwortschema der Wagenreihung prüfen** | RIS::Stations, Timetables und FaSta sind gegen echte Antworten verifiziert – RIS::Stations am 31.08. mit aufgezeichneten Fixtures (`test/fixtures/db/gruppe-*.json`). **Nicht geprüft:** allein die Wagenreihung, deren Fixture weiterhin handgebaut ist. |
| 12 | **Ticket-PDF-Import** | Im Prototyp als UI-Flow vorhanden, laut Konzept Stufe 2. Backend fehlt. |
| 13 | **Repo-Sichtbarkeit** | Repo ist öffentlich. Inhaltlich unbedenklich (Historie mehrfach auf Secrets geprüft, zuletzt 28.08.2026 über alle Blobs – 0 Treffer), aber bewusst zu entscheiden. |
| 14 | **Frontend kann keine Komponenten testen** | `vitest.config.ts` nutzt `environment: 'node'`, geprüft werden also nur reine Funktionen. Beide Korrekturen vom 30.08. – der Netzfehler-Hinweis und der Genauigkeitshinweis – ließen sich **gar nicht** testen und wurden nur im Browser verifiziert. jsdom plus Testing Library wäre ein überschaubarer Schritt und schlösse genau die Lücke, die bei stillen Fehlern zubeißt. |
| 15 | **Drei geratene Schwellenwerte** | `MINDEST_SCHRITT_MS = 8000` (Anzeigedauer je Schritt), `ERKENNUNG_MAX_M = 1000` (Genauigkeitsbudget der Bahnhofserkennung) und `NOTBEHELF_TTL_MS = 600000` (Cache-Frist für Stufe 3; über `GRAPH_NOTBEHELF_TTL_MS` ohne Neubau verstellbar) sind begründete Startwerte ohne Messung dahinter. Zu hoch gewählt hinkt die Schrittanzeige hinterher, zu niedrig flackert sie. Erst die Mobilabnahme zeigt die Richtung. |

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

**Tests:** `cd backend && npm test` → **180 von 180 grün**, `npm run lint` (`tsc --noEmit`) sauber. Frontend: `cd frontend && npm test` → **37 von 37 grün**, `npm run build` grün; `npm run lint` meldet 4 Warnungen (siehe ToDo 4).

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

Vollständig gesichert unter `design/` (Projekt „Umstieg mobile app design", `Umstieg.dc.html` + Modernist-Design-System + iOS-Frame + dc-Runtime). Umgesetzt sind bisher Eingabe, Routenansicht mit Ampel und Karte; die Screens Störung/Gleiswechsel, Wagenreihung und Angekommen sind noch nicht gebaut (Störungsbanner kommt mit Task 16):

- **6 Screens:** Onboarding (Von/Nach + Ticket-PDF-Import), Dashboard (Gleise, Ampel, Routenwahl), Navigation (SVG-Karte + Schritt-Sheet), Störung/Gleiswechsel, Wagenreihung, Angekommen.
- **Design-Tokens:** Modernist-System (`design/_ds/.../styles.css`) – Akzent `#ec3013`, Hintergrund `#f3f2f2`, Text `#201e1d`, Font „Archivo" (Heading 800), Grün `#0f7a4f`, Gelb `#e08a00`.
- **Wichtig – Ampellogik ist RELATIV zur Gehzeit** (nicht absolut wie im Konzept 6.4): Grün ≥ 2× Gehzeit, Gelb 1–2× Gehzeit, Rot < 1× Gehzeit. ✅ so umgesetzt in `backend/src/core/gehzeit.ts` und im Frontend; Plandokument ist nachgezogen.
- Mock-Szenario im Prototyp: RE 3 Stralsund → Berlin Hbf Gl. 6 (Ebene −2) → ICE 1006 Hamburg Gl. 14 (Ebene +1), Wagen 26/Platz 61, Abschnitt C.
- Prototyp enthält Ticket-PDF-Import als UI-Flow (laut Konzept Stufe 2 – UI schon da, Backend später).

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

## Rechtliches

Impressum und Datenschutzerklärung sind erreichbar über `#impressum` und
`#datenschutz` sowie eine Fußzeile in beiden Ansichten. Die Betreiberangaben
stehen in [`frontend/src/rechtliches/betreiber.json`](./frontend/src/rechtliches/betreiber.json)
– der einzigen Stelle im Projekt mit personenbezogenen Daten; Impressum und
Datenschutzerklärung lesen beide von dort. Stehen dort Platzhalter, zeigt die
Impressumsseite eine rote Warnung.

Die Datenschutzerklärung beschreibt ausschließlich, was der Code nachweislich
tut: keine Cookies, kein `localStorage`, kein Tracking, Backend ohne Protokoll
(`logger: false`), Standort im Browser auf ~110 m gerundet, Kartenkacheln erst
beim Aufklappen. Schriften liegen lokal (`frontend/src/assets/fonts/`, SIL OFL
1.1) – **kein** Google Fonts.

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
