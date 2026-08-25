# Umstiegs-Navigator („Umstieg.")

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Schritt-für-Schritt-Anweisung und Karte – und live bewertet, ob der Anschluss erreichbar ist.

**Konzept:** [`2026-08-24-umstiegs-navigator-design.md`](./2026-08-24-umstiegs-navigator-design.md)
**Implementierungsplan (17 Tasks):** [`docs/plans/2026-08-24-umsetzungsplan-mvp.md`](./docs/plans/2026-08-24-umsetzungsplan-mvp.md)
**UI-Design (Claude Design Import):** [`design/Umstieg.dc.html`](./design/Umstieg.dc.html)

## Architektur

- **Backend:** Node.js ≥ 20, Fastify 5, TypeScript (strict). Zustandslos, keine Datenbank, RAM-LRU-Cache. Holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten (Marketplace-APIs).
- **Frontend:** React + Vite + TypeScript. Design siehe unten. Mobil zuerst.
- **Betrieb:** ein Docker-Container (Backend liefert Frontend statisch aus) – noch nicht gebaut.

## Projektstand (24.08.2026)

| Arbeitspaket | Status |
|---|---|
| Task 1 – Repo + Backend-Gerüst (Fastify, `/api/health`, vitest) | ✅ fertig, getestet |
| Task 2 – Frontend-Gerüst (Vite React TS, Proxy) | 🔶 Scaffold liegt in `frontend/`, bewusst zurückgestellt |
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
| Task 13–14 – Frontend-Umsetzung des Designs, Karte | ⬜ offen (Design importiert, siehe unten) |
| Task 15–17 – Live-Daten, SSE, Härtung, Docker | ⬜ offen |

**Tests:** `cd backend && npm test` → 77 Tests grün (Stand dieses Commits). `npm run lint` sauber.

## API (Stand Task 12)

- `GET /api/health` → `{ status: 'ok' }`
- `GET /api/stations?q=<Suchtext>` → `BahnhofTreffer[]` (`{ name, eva, lat, lon }`). Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET`: **503** `{ fehler: 'db-zugang-fehlt' }`.
- `GET /api/route?eva=&gleisAn=&gleisAb=&abschnitt?=&profil?=&variante?=` → `RouteErgebnis`:
  - `profil`: `zuegig | normal | langsam` (Default `normal`) · `variante`: `schnellste | einfachste | barrierefrei` (Default `schnellste`)
  - Antwort: `{ stufe, schritte[], gehzeitSek, karte, hinweise[] }`; `karte` = GeoJSON-FeatureCollections je Ebene (Routenlinie + Start-/Zielmarker, `[lon, lat]`)
  - Degradation: Overpass-Ausfall oder unbrauchbare OSM-Daten → Synthesemodell (`stufe: 3`, „ca."-Distanzen, Hinweis); gleicher Bahnsteig → Kurzantwort ohne Routing; `wagen`-Parameter wird ab Task 15 (Wagenreihung) ausgewertet
  - Fehler: **400** `parameter-fehlt`/`parameter-ungueltig`, **404** `gleis-unbekannt`/`keine-route`, **503** `db-zugang-fehlt`
  - Cache: Graph je EVA 24 h (LRU max 100), im RAM

## UI-Design (importiert aus Claude Design, 24.08.2026)

Vollständig gesichert unter `design/` (Projekt „Umstieg mobile app design", `Umstieg.dc.html` + Modernist-Design-System + iOS-Frame + dc-Runtime). Kernpunkte für die Umsetzung in Task 13/14:

- **6 Screens:** Onboarding (Von/Nach + Ticket-PDF-Import), Dashboard (Gleise, Ampel, Routenwahl), Navigation (SVG-Karte + Schritt-Sheet), Störung/Gleiswechsel, Wagenreihung, Angekommen.
- **Design-Tokens:** Modernist-System (`design/_ds/.../styles.css`) – Akzent `#ec3013`, Hintergrund `#f3f2f2`, Text `#201e1d`, Font „Archivo" (Heading 800), Grün `#0f7a4f`, Gelb `#e08a00`.
- **Wichtig – Ampellogik im Design ist RELATIV zur Gehzeit** (nicht absolut wie im Konzept 6.4): Grün ≥ 2× Gehzeit, Gelb 1–2× Gehzeit, Rot < 1× Gehzeit. Bei Task 8 so übernehmen (Konzeptkorrektur, im Plan nachziehen).
- Mock-Szenario im Prototyp: RE 3 Stralsund → Berlin Hbf Gl. 6 (Ebene −2) → ICE 1006 Hamburg Gl. 14 (Ebene +1), Wagen 26/Platz 61, Abschnitt C.
- Prototyp enthält Ticket-PDF-Import als UI-Flow (laut Konzept Stufe 2 – UI schon da, Backend später).

## Entwicklung starten

```bash
cd backend && npm install && npm run dev   # Backend auf :3001 (nur /api/health bisher)
cd backend && npm test                     # Testsuite
npx tsx scripts/spike-datenrealitaet.ts    # Datenrealitäts-Spike (im Ordner backend/, dauert ~5 min, cached)
npx tsx scripts/record-fixture.ts <name> <lat> <lon>  # neues Overpass-Fixture
```

Frontend (`frontend/`, zurückgestellt): `npm install && npm run dev` → :5173, Proxy auf :3001.

## Spike-Ergebnis (Task 6, 25.08.2026)

Report: [`docs/spike-datenrealitaet-ergebnis.md`](./docs/spike-datenrealitaet-ergebnis.md). Kernzahlen (27 von 40 Bahnhöfen erfasst, 13 wegen Overpass-Überlastung offen – Koordinatenliste bleibt, Wiederholung füllt den Cache nach):

- **Stufe 1: 74 %** (groß: 8/8, mittel: 8/11, klein: 4/8) → **Entscheidungstor NICHT ausgelöst**, Stufe-1-Pfad wie geplant.
- Abschnittsmarker (A–F) nur an 52 % der Bahnhöfe in OSM → Wagenpositions-Feature primär über DB-Stationsdaten (bestätigt Konzept).
- DB-Abschnittsdaten-Check weiterhin **blockiert auf Marketplace-Registrierung**.

## Nächste Schritte (in dieser Reihenfolge geplant)

1. Task 13–14: Design aus `design/Umstieg.dc.html` als React-Komponenten umsetzen (Tokens → CSS, 6 Screens, SVG-Karte → MapLibre/GeoJSON aus Task 12).
2. Task 15–17: Live-Daten (Polling **pro EVA**), SSE, Härtung, Docker.
3. Spike-Nachlauf: fehlende 13 Bahnhöfe erneut abfragen, sobald Overpass wieder stabil antwortet (`npx tsx scripts/spike-datenrealitaet.ts`, cached).

## Offene Punkte / Blocker

- **DB API Marketplace:** Registrierung ausstehend → `DB_CLIENT_ID`/`DB_CLIENT_SECRET` in `.env` (Vorlage `.env.example`). Bis dahin degradiert alles transparent auf Fixtures/Synthese.
- **GitHub-Remote:** `gh` CLI nicht installiert – Repo nur lokal (`main` = Doku-Basis, Arbeit auf `feat/mvp`). Für Push: `winget install GitHub.cli` + `gh auth login`, oder leeres Repo anlegen und URL mitteilen.
- **Vercel:** bewusst nicht verwendet (VITA-Projekt bleibt unberührt); Deployment-Ziel ist Docker.
- **Spike-Rohdaten** (`backend/test/fixtures/spike/`) sind gitignored – über das Script reproduzierbar.

## Konzeptkorrekturen (aus Analyse + Design übernommen)

1. Live-Polling **pro EVA-Nummer** bündeln statt pro Route (Ratenlimits).
2. Stufe 3 (Synthesemodell) ohne präzise Meterangaben – „ca."-Formulierungen.
3. Frontend hält berechnete Route offline-fähig im Speicher; SSE-Reconnect fordert Route neu an.
4. **Ampel relativ zur Gehzeit** (aus dem Design übernommen, ersetzt absolute 2-min-Schwelle).
