# Umstiegs-Navigator („Umstieg.")

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Schritt-für-Schritt-Anweisung und Karte – und live bewertet, ob der Anschluss erreichbar ist.

**Konzept:** [`2026-08-24-umstiegs-navigator-design.md`](./2026-08-24-umstiegs-navigator-design.md)
**Implementierungsplan (17 Tasks):** [`docs/plans/2026-08-24-umsetzungsplan-mvp.md`](./docs/plans/2026-08-24-umsetzungsplan-mvp.md)
**UI-Design (Claude Design Import):** [`design/Umstieg.dc.html`](./design/Umstieg.dc.html)

## Architektur

- **Backend:** Node.js ≥ 20, Fastify 5, TypeScript (strict). Zustandslos, keine Datenbank, RAM-LRU-Cache. Holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten (Marketplace-APIs).
- **Frontend:** React + Vite + TypeScript. Design siehe unten. Mobil zuerst.
- **Betrieb:** ein Docker-Container (Backend liefert Frontend statisch aus) – noch nicht gebaut.

## Projektstand (25.08.2026)

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
| Task 16 – SSE-Überwachung, FaSta | 🔶 **angefangen, NICHT committet** – Details unten unter „Wiedereinstieg" |
| Task 17 – Degradationstests, Docker, Mobile-Feinschliff | ⬜ offen |

**Tests:** `cd backend && npm test` → **100 von 102 grün, 2 rot** (beide in `test/fasta.test.ts`, siehe Wiedereinstieg). Letzter Commit `f4ba0d3` (Task 15) war vollständig grün mit 92 Tests. `npm run lint` sauber. Frontend: `cd frontend && npm run build` grün.

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
- `GET /api/stations?q=<Suchtext>` → `BahnhofTreffer[]` (`{ name, eva, lat, lon }`). Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET`: **503** `{ fehler: 'db-zugang-fehlt' }`.
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

## Wiedereinstieg: hier genau weitermachen (Task 16)

Task 16 wurde begonnen und **mitten in der TDD-Schleife gestoppt** – die neuen Dateien liegen **uncommittet** im Arbeitsverzeichnis (`git status` zeigt sie als `??` bzw. `M`). Nichts geht verloren, aber der erste Schritt beim Weitermachen ist, die zwei roten Tests grün zu bekommen.

**Zustand der neuen Dateien:**

| Datei | Zustand |
|---|---|
| `backend/src/core/ueberwachung.ts` | ✅ fertig – Poller **pro EVA**, Abonnenten-Verteilung, Ereignisse `gleiswechsel`/`verspaetung`/`heartbeat`, Timetables-Ausfall bricht nicht ab |
| `backend/test/live.test.ts` | ✅ 6 Tests grün (Gleiswechsel, Verspätung, ein Poll bei zwei Abonnenten, Heartbeat, Abmeldung, Fehlerfall) |
| `backend/src/clients/fasta.ts` | ✅ fertig – `holeAnlagen(eva)`, Status ≠ `ACTIVE` wird konservativ als `INACTIVE` geführt |
| `backend/test/fixtures/db/fasta-facilities.json` | ✅ handgebautes Fixture (Verifikationshinweis enthalten) |
| `backend/src/clients/db-endpunkte.ts` | ✅ um `epFastaFacilities` ergänzt (mit TODO: FaSta nutzt StaDa-Bahnhofsnummern, **nicht** EVA – Zuordnung vor Live-Betrieb klären) |
| `backend/test/fasta.test.ts` | 🔴 4 Tests: 2 grün (`holeAnlagen`), **2 rot** – erwarten `wendeFastaAn`, das noch nicht existiert |

**Schritt 1 (rot → grün):** `wendeFastaAn(graph, anlagen)` in `backend/src/core/synthmodell.ts` implementieren und exportieren. Erwartetes Verhalten laut den bereits geschriebenen Tests: Für jede FaSta-Anlage die nächstgelegene `aufzug`-/`rolltreppe`-Kante im Graphen suchen und deren `status` setzen; nur Anlagen in der Nähe wirken (weit entfernte lassen den Graphen unverändert – Schwellenwert wählen, ~50 m). `status: 'INACTIVE'` sperrt die Kante nur in der Variante `barrierefrei` (das erledigt `kanteErlaubt` in `routing.ts` bereits), `schnellste` bleibt unberührt.

**Danach fehlen für Task 16 noch:**

1. `backend/src/routes/live.ts` – SSE-Endpunkt `GET /api/live/:eva?zugAn&zugAb`, der `Ueberwachung.abonniere()` nutzt und bei Verbindungsabbruch die Abmeldefunktion aufruft. Tests: Ereignis kommt beim Client an, zwei Clients = ein Poll.
2. `Ueberwachung` in `app.ts` verdrahten (eine Instanz je App, `tafel`-Client injizierbar wie die übrigen).
3. FaSta in `/api/route` einhängen: bei `variante=barrierefrei` `holeAnlagen` abrufen, `wendeFastaAn` anwenden; FaSta-Ausfall → Route trotzdem berechnen + Hinweis „Aufzugstatus unbekannt" (Degradationstabelle Konzept 8).
4. Frontend: `frontend/src/api/sse.ts` (EventSource + Reconnect, bei Reconnect Route neu anfordern) und `frontend/src/components/LiveBanner.tsx`; Gleiswechsel → Route automatisch neu laden, Banner + `navigator.vibrate`.

**Dann Task 17:** Degradationstests (jede Zeile der Konzept-Tabelle Abschnitt 8 als eigener Test), `Dockerfile` + `docker-compose.yml` (Multi-Stage: Frontend-Build → Backend serviert `frontend/dist` via `@fastify/static`), README final.

**Unabhängig davon offen:** Spike-Nachlauf für die fehlenden 13 Bahnhöfe, sobald Overpass wieder stabil antwortet (`npx tsx scripts/spike-datenrealitaet.ts`, gecacht – fragt nur die fehlenden ab).

## Offene Punkte / Blocker

- **Uncommittete Arbeit (Task 16):** `ueberwachung.ts`, `fasta.ts`, `live.test.ts`, `fasta.test.ts`, `fixtures/db/fasta-facilities.json` sowie die Änderung an `db-endpunkte.ts` liegen im Arbeitsverzeichnis, aber **nicht im Git-Verlauf** – bewusst so, weil 2 Tests rot sind (Regel: Commit nur nach grünem Task). Siehe „Wiedereinstieg".
- **DB API Marketplace:** Registrierung ausstehend → `DB_CLIENT_ID`/`DB_CLIENT_SECRET` in `.env` (Vorlage `.env.example`). Bis dahin degradiert alles transparent auf Fixtures/Synthese.
- **Alle DB-Schemata sind ungeprüft:** Endpunktpfade wurden am 25.08.2026 gegen die Marketplace-Doku verifiziert, die **Antwort-Fixtures sind jedoch handgebaut** (`backend/test/fixtures/db/*`, jeweils mit Hinweis im Kopf). Vor Live-Betrieb gegen echte Antworten prüfen – die Parser können auf Feldnamen-Abweichungen laufen.
- **FaSta-Adressierung ungeklärt:** FaSta arbeitet mit StaDa-Bahnhofsnummern, die App reicht bisher die EVA durch (TODO in `db-endpunkte.ts`). Vor Live-Betrieb Zuordnung klären.
- **Manuelle Browser-Sichtprüfung steht aus:** Frontend wurde per Build, API-Aufruf und Proxy-Test verifiziert, aber noch nicht optisch auf einem 390-px-Viewport bzw. mit WebGL-Karte begutachtet.
- **GitHub-Remote:** `gh` CLI nicht installiert – Repo nur lokal (`main` = Doku-Basis, Arbeit auf `feat/mvp`). Für Push: `winget install GitHub.cli` + `gh auth login`, oder leeres Repo anlegen und URL mitteilen.
- **Vercel:** bewusst nicht verwendet (VITA-Projekt bleibt unberührt); Deployment-Ziel ist Docker.
- **Spike-Rohdaten** (`backend/test/fixtures/spike/`) sind gitignored – über das Script reproduzierbar.

## Konzeptkorrekturen (aus Analyse + Design übernommen)

1. Live-Polling **pro EVA-Nummer** bündeln statt pro Route (Ratenlimits).
2. Stufe 3 (Synthesemodell) ohne präzise Meterangaben – „ca."-Formulierungen.
3. Frontend hält berechnete Route offline-fähig im Speicher; SSE-Reconnect fordert Route neu an.
4. **Ampel relativ zur Gehzeit** (aus dem Design übernommen, ersetzt absolute 2-min-Schwelle).
