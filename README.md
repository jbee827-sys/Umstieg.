# Umstiegs-Navigator („Umstieg.")

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Schritt-für-Schritt-Anweisung und Karte – und live bewertet, ob der Anschluss erreichbar ist.

**Konzept:** [`2026-08-24-umstiegs-navigator-design.md`](./2026-08-24-umstiegs-navigator-design.md)
**Implementierungsplan MVP (17 Tasks):** [`docs/plans/2026-08-24-umsetzungsplan-mvp.md`](./docs/plans/2026-08-24-umsetzungsplan-mvp.md)
**Spec Standort (P1):** [`docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md`](./docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md)
**Plan Standort (P1, 12 Tasks):** [`docs/superpowers/plans/2026-08-27-standort-und-navigation.md`](./docs/superpowers/plans/2026-08-27-standort-und-navigation.md)
**UI-Design (Claude Design Import):** [`design/Umstieg.dc.html`](./design/Umstieg.dc.html)

## Architektur

- **Backend:** Node.js ≥ 20, Fastify 5, TypeScript (strict). Zustandslos, keine Datenbank, RAM-LRU-Cache. Holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten (Marketplace-APIs).
- **Frontend:** React + Vite + TypeScript. Design siehe unten. Mobil zuerst.
- **Betrieb:** ein Docker-Container (Backend liefert Frontend statisch aus) – noch nicht gebaut.

## Hier weitermachen (Stand 27.08.2026, HEAD `7b244ee`)

```bash
cd backend && npm test        # muss 120 von 120 grün sein
cd backend && npm run lint    # tsc --noEmit, muss sauber sein
cd frontend && npm run build  # muss grün sein
```

Arbeitsbaum ist sauber, alles committet. Der MVP steht bis einschließlich Task 16; offen sind **MVP-Task 17** und die **Tasks 3–12 des Standort-Plans (P1)**.

**Nächster Schritt:** P1 Task 3 aus [`docs/superpowers/plans/2026-08-27-standort-und-navigation.md`](./docs/superpowers/plans/2026-08-27-standort-und-navigation.md) – Frontend-Testinfrastruktur (vitest), `schwellen.ts`, `distanz.ts`. Der Plan enthält für jeden Task den fertigen Code, den Befehl und das erwartete Ergebnis.

**Eine Altlast zuerst:** P1 Task 2 ist implementiert und committet (`7b244ee`, 120 Tests grün), hat aber **die Task-Review noch nicht durchlaufen** – die Sitzung endete davor. Entweder die Review nachholen (`review-package` über `df30887..7b244ee`) oder bewusst überspringen und mit Task 3 starten.

| P1-Task | Status |
|---|---|
| 1 – Backend-Umkreissuche im stations-Client | ✅ fertig, Review sauber (`e914b87`) |
| 2 – `/api/stations` mit `lat`/`lon` | ✅ implementiert (`7b244ee`), **Review offen** |
| 3 – Frontend-Testinfrastruktur, Schwellen, Haversine | ⬜ offen ← **hier einsteigen** |
| 4 – Ankunfts-Zustandsmaschine + Zielermittlung | ⬜ offen |
| 5 – Bahnhofserkennung mit Rundung | ⬜ offen |
| 6 – `useStandort`-Hook | ⬜ offen |
| 7 – Bahnhof in der Eingabe vorbelegen | ⬜ offen |
| 8 – Positionspunkt + Genauigkeitskreis auf der Karte | ⬜ offen |
| 9 – Ankunftsvorschlag + „Angekommen"-Screen | ⬜ offen |
| 10 – Zustand „Zug ist abgefahren" | ⬜ offen |
| 11 – HTTPS: mkcert + Caddyfile | ⬜ offen |
| 12 – Mobilabnahme + README | ⬜ offen |

**Zwei Entscheidungen aus der Vorflug-Prüfung, die für Reviews gelten:**

1. `haversineM` wird bewusst aus `backend/src/core/graph.ts` nach `frontend/src/standort/distanz.ts` gespiegelt. Getrennte npm-Pakete, kein Import über die Grenze möglich; bestehende Projektkonvention (`api/typen.ts`). **Plan gilt.**
2. `useStandort.ts` bekommt bewusst **keine** Unit-Tests – die Datei enthält keine Entscheidungslogik, die steckt in `ankunft.ts`/`distanz.ts`/`bahnhofErkennung.ts`. Abgesichert wird sie in der Mobilabnahme (Task 12). **Plan gilt.**

Der Ausführungs-Ledger liegt unter `.superpowers/sdd/2026-08-27-standort-und-navigation/progress.md` (gitignored) und hält Commits, Rulings und zurückgestellte Minor-Findings fest.

## Projektstand (27.08.2026)

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
| Task 17 – Degradationstests, Docker, Mobile-Feinschliff | ⬜ offen |
| P1 – Standort & Live-Navigation (12 Tasks) | 🔶 Tasks 1–2 fertig, 3–12 offen (Tabelle oben) |

**Tests:** `cd backend && npm test` → **120 von 120 grün**, `npm run lint` (`tsc --noEmit`) sauber. Frontend: `cd frontend && npm run build` grün; `npm run lint` meldet 3 Warnungen, die alle aus Task 13/15 stammen und vor P1 schon bestanden.

**Nicht maschinell geprüft:** Die Frontend-SSE-Anbindung (`api/sse.ts`, `LiveBanner`) ist nur über TypeScript und Build abgesichert – das Frontend hat noch keine Testinfrastruktur. Der SSE-Endpunkt selbst wird dagegen in `test/live.test.ts` gegen einen echten HTTP-Server geprüft.

## Was Ende-zu-Ende funktioniert

Der Durchstich steht: Eingabe → Route → Karte läuft real durch, verifiziert am Berlin-Hbf-Fixture (Gleis 6 → 14) über den Vite-Proxy.

- **Routing-Kern vollständig:** OSM-Graph (inkl. Bahnsteig-Relationen und Ebenen-Instanzen) → Klassifikation Stufe 1/2/3 → Dijkstra in drei Varianten → deutsche Schritttexte → Gehzeit je Profil.
- **Degradiert statt auszufallen:** Kein Overpass, unbrauchbare OSM-Daten oder unbekanntes Gleis → Synthesemodell mit „ca."-Angaben und transparentem Hinweis. Keine DB-Schlüssel → 503 mit klarem Fehlercode, Frontend fällt auf EVA-Freitexteingabe zurück.
- **Live-Daten angebunden:** Ankunfts-/Abfahrtstafel (IRIS-XML, Soll + Änderungen zusammengeführt, Gleiswechsel und Verspätung erkannt), Zugauswahl per Antippen, Wagenreihung bestimmt den Startabschnitt am Bahnsteig.
- **Ampel relativ zur Gehzeit** (Konzeptkorrektur 4) mit 10-Sekunden-Countdown, grau solange keine Zugauswahl vorliegt.
- **Frontend nach Design-Tokens:** mobil zuerst, große Touch-Ziele, Text vor Karte; MapLibre-Karte mit Ebenen-Umschalter und ODbL-Attribution, lazy geladen (Hauptbundle bleibt bei ~200 KB).

Wichtigste Erkenntnis aus dem Spike: **74 % Stufe 1** – Indoor-Routing über OSM trägt, das Entscheidungstor wurde nicht ausgelöst.

## API (Stand Task 15)

- `GET /api/health` → `{ status: 'ok' }`
- `GET /api/board/:eva?type=arr|dep` → `TafelEintrag[]` (`{ zug, zeitSoll, zeitIst?, gleisSoll, gleisIst?, ziel }`; Soll aus `/plan`, Änderungen aus `/fchg` zusammengeführt). Ohne Schlüssel: **503**.
- `GET /api/stations?q=<Suchtext>` **oder** `?lat=&lon=` → `BahnhofTreffer[]` (`{ name, eva, lat, lon }`). Die Koordinatenvariante (P1 Task 2) sucht im Umkreis von 1000 m; der Radius ist bewusst eine Serverentscheidung und steht in `routes/api.ts`. `q` und `lat`/`lon` schließen sich aus → **400** `parameter-ungueltig`; das gilt auch für eine einzelne Koordinate oder Werte außerhalb −90…90 bzw. −180…180. Weder noch → **400** `parameter-fehlt`. Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET`: **503** `{ fehler: 'db-zugang-fehlt' }`.
- `GET /api/live/:eva?zugAn=&zugAb=` → **SSE-Strom** mit den Ereignissen `gleiswechsel`, `verspaetung`, `heartbeat` (Payload `{ typ, zug?, alt?, neu?, zeitstempel }`). Gepollt wird **einmal je EVA**, unabhängig von der Zahl der Zuschauer; die Zugparameter filtern nur die Zustellung. Verbindungsabbruch meldet den Abonnenten ab, der letzte Abmelder stoppt den Poller.
- `GET /api/route?eva=&gleisAn=&gleisAb=&zugAn?=&wagen?=&abschnitt?=&profil?=&variante?=` → `RouteErgebnis` (`zugAn`+`wagen` → Wagenreihung bestimmt den Start-Abschnitt; keine Daten → Bahnsteigmitte mit Hinweis):
  - `profil`: `zuegig | normal | langsam` (Default `normal`) · `variante`: `schnellste | einfachste | barrierefrei` (Default `schnellste`)
  - Antwort: `{ stufe, schritte[], gehzeitSek, karte, hinweise[] }`; `karte` = GeoJSON-FeatureCollections je Ebene (Routenlinie + Start-/Zielmarker, `[lon, lat]`)
  - Degradation: Overpass-Ausfall oder unbrauchbare OSM-Daten → Synthesemodell (`stufe: 3`, „ca."-Distanzen, Hinweis); gleicher Bahnsteig → Kurzantwort ohne Routing; Wagenreihung ohne Daten → Bahnsteigmitte mit Hinweis
  - Fehler: **400** `parameter-fehlt`/`parameter-ungueltig`, **404** `gleis-unbekannt`/`keine-route`, **503** `db-zugang-fehlt`
  - Cache: Graph je EVA 24 h (LRU max 100), im RAM

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

**Dev ohne DB-Zugang:** `FIXTURE_EVA=berlin npm run dev` (im Backend) → `/api/route` läuft gegen das Berlin-Hbf-Fixture (EVA 8011160, z. B. Gleis 6 → 14), `/api/stations` liefert einen festen Treffer. Keine externen Aufrufe.

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

**MVP-Task 17 (offen):** Degradationstests (jede Zeile der Konzept-Tabelle Abschnitt 8 als eigener Test), `Dockerfile` + `docker-compose.yml` (Multi-Stage: Frontend-Build → Backend serviert `frontend/dist` via `@fastify/static`) – dort wird auch der `Caddyfile` als Dienst eingebunden, den P1 Task 11 anlegt. Task 17 setzt also P1 Task 11 voraus, wenn HTTPS mitkommen soll.

**Unabhängig davon offen:** Spike-Nachlauf für die fehlenden 13 Bahnhöfe, sobald Overpass wieder stabil antwortet (`npx tsx scripts/spike-datenrealitaet.ts`, gecacht – fragt nur die fehlenden ab).

## Offene Punkte / Blocker

- **DB API Marketplace:** Registrierung ausstehend → `DB_CLIENT_ID`/`DB_CLIENT_SECRET` in `.env` (Vorlage `.env.example`). Bis dahin degradiert alles transparent auf Fixtures/Synthese.
- **Alle DB-Schemata sind ungeprüft:** Endpunktpfade wurden am 25.08.2026 gegen die Marketplace-Doku verifiziert, die **Antwort-Fixtures sind jedoch handgebaut** (`backend/test/fixtures/db/*`, jeweils mit Hinweis im Kopf). Vor Live-Betrieb gegen echte Antworten prüfen – die Parser können auf Feldnamen-Abweichungen laufen.
- **FaSta-Adressierung ungeklärt:** FaSta arbeitet mit StaDa-Bahnhofsnummern, die App reicht bisher die EVA durch (TODO in `db-endpunkte.ts`). Vor Live-Betrieb Zuordnung klären.
- **Manuelle Browser-Sichtprüfung steht aus:** Frontend wurde per Build, API-Aufruf und Proxy-Test verifiziert, aber noch nicht optisch auf einem 390-px-Viewport bzw. mit WebGL-Karte begutachtet. Das gilt auch für die SSE-Anbindung – der EventSource-Pfad im Browser ist bisher nur typgeprüft.
- **Frontend ohne Testinfrastruktur:** Es gibt keine Frontend-Tests. Vitest kommt mit P1 dazu (Task 3 des Plans).
- **GitHub-Remote:** `gh` CLI nicht installiert – Repo nur lokal (`main` = Doku-Basis, Arbeit auf `feat/mvp`). Für Push: `winget install GitHub.cli` + `gh auth login`, oder leeres Repo anlegen und URL mitteilen.
- **Vercel:** bewusst nicht verwendet (VITA-Projekt bleibt unberührt); Deployment-Ziel ist Docker.
- **Spike-Rohdaten** (`backend/test/fixtures/spike/`) sind gitignored – über das Script reproduzierbar.

## Konzeptkorrekturen (aus Analyse + Design übernommen)

1. Live-Polling **pro EVA-Nummer** bündeln statt pro Route (Ratenlimits).
2. Stufe 3 (Synthesemodell) ohne präzise Meterangaben – „ca."-Formulierungen.
3. Frontend hält berechnete Route offline-fähig im Speicher; SSE-Reconnect fordert Route neu an.
4. **Ampel relativ zur Gehzeit** (aus dem Design übernommen, ersetzt absolute 2-min-Schwelle).
