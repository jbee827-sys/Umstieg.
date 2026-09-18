# Umstieg. MVP – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web-App, die für einen Umstiegsbahnhof den Weg vom Ankunftsgleis zum Abfahrtsgleis als Karte und Schrittliste liefert und live bewertet, ob der Anschluss erreichbar ist.

**Architecture:** Zustandsloses Fastify-Backend (reiner Orchestrator, RAM-LRU-Cache, keine Datenbank) holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten, baut daraus einen Routing-Graphen mit drei Qualitätsstufen und liefert Route + Text + Ampel an ein React/Vite-Frontend (MapLibre GL). Live-Überwachung per SSE mit Polling **pro EVA-Nummer** (nicht pro Route).

**Tech Stack:** Node.js ≥ 20, Fastify 5, TypeScript (strict), lru-cache, vitest · React 19, Vite, MapLibre GL JS · Docker (ein Container).

## Global Constraints

- Projektwurzel ist `D:\Claude-code\Umstieg` – alle Dateien liegen darunter. Konzeptdokument: `2026-08-24-umstiegs-navigator-design.md` (maßgebliche Spec).
- Keine Datenbank, keine Offline-Pipeline. Nur RAM-Cache (Graphen ~24 h, Live-Antworten 30–60 s).
- API-Schlüssel ausschließlich über Umgebungsvariablen: `DB_CLIENT_ID`, `DB_CLIENT_SECRET`, `OVERPASS_URL_PRIMARY`, `OVERPASS_URL_FALLBACK`.
- UI deutschsprachig, mobil zuerst, große Schrift, Text vor Karte, keine Gesten-Abhängigkeit.
- Grundprinzip: App funktioniert vollständig ohne Zugauswahl/Live-Daten; Live-Daten verfeinern nur. Degradieren statt ausfallen. Jede Live-Anzeige trägt Zeitstempel.
- DB-Marketplace-Endpunkte vor Implementierung gegen aktuelle Doku prüfen – nicht aus dem Gedächtnis kodieren. Ohne Schlüssel: gegen Fixtures entwickeln, Live-Pfad hinter Env-Guard.
- Overpass-Fairness: User-Agent setzen, Wiederholversuche mit Wartezeit, 24-h-Graph-Cache Pflicht, keine Overpass-Abfragen im Frontend. Spike: sequenziell mit ≥ 2 s Pause.
- Konzeptkorrekturen aus der Analyse (übernommen): (a) Live-Polling pro EVA bündeln, (b) Stufe 3 ohne präzise Meterangaben zwischen Ebenen („ca."-Formulierungen), (c) Frontend hält berechnete Route offline-fähig im Speicher, SSE-Reconnect fordert Route neu an.
- README.md nach jedem abgeschlossenen Arbeitspaket aktualisieren (Stand, was läuft, was fehlt, wie starten).
- Git: Commit nach jedem grünen Task. Kein GitHub-Remote (gh fehlt); Vercel nicht verwenden (VITA-Projekt bleibt unberührt; Deploy = Docker).

## Geteilte Typen (Referenz für alle Tasks)

Datei `backend/src/core/typen.ts` – alle Tasks verwenden exakt diese Namen:

```ts
export type KantenTyp = 'eben' | 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe';
export type Gehprofil = 'zuegig' | 'normal' | 'langsam';
export type RoutenVariante = 'schnellste' | 'einfachste' | 'barrierefrei';
export type Stufe = 1 | 2 | 3;

export interface GraphKnoten {
  id: string;                 // OSM: "n<id>"; synthetisch: "gleis7:mitte"
  lat: number;
  lon: number;
  level: number;              // OSM level-Tag; 0 wenn unbekannt
  gleis?: string;             // an Bahnsteigpunkten: "7", "7a"
  abschnitt?: string;         // "A".."F" | "anfang" | "mitte" | "ende"
}

export interface GraphKante {
  von: string;
  nach: string;
  laengeM: number;
  deltaLevel: number;         // level(nach) - level(von)
  typ: KantenTyp;
  barrierefrei: boolean;
  status?: 'ACTIVE' | 'INACTIVE'; // FaSta, nur aufzug/rolltreppe
}

export interface StationGraph {
  knoten: Map<string, GraphKnoten>;
  adjazenz: Map<string, GraphKante[]>; // ungerichtet: Kante in beiden Listen
  stufe: Stufe;
  gleise: string[];           // sortierte, eindeutige Gleisbezeichner
}

export interface RoutenPfad {
  knoten: GraphKnoten[];
  kanten: GraphKante[];       // kanten[i] verbindet knoten[i] und knoten[i+1]
  laengeM: number;
}

export interface Schritt {
  text: string;               // fertiger deutscher Anweisungssatz
  typ: KantenTyp | 'start' | 'ziel';
  distanzM?: number;          // auf 10 m gerundet, nur bei eben/rampe
}

export interface RouteErgebnis {
  stufe: Stufe;
  schritte: Schritt[];
  gehzeitSek: number;
  karte?: Record<string, unknown>; // GeoJSON FeatureCollection je Ebene (Schlüssel = level)
  hinweise: string[];         // transparente Degradations-/Fallback-Hinweise
}
```

---

### Task 1: Repo, Backend-Gerüst, README

**Files:**
- Create: `.gitignore`, `README.md`, `.env.example`
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`
- Create: `backend/src/server.ts`, `backend/src/app.ts`
- Test: `backend/test/app.test.ts`

**Interfaces:**
- Produces: `buildApp(): FastifyInstance` (aus `app.ts`, ohne listen – testbar via `app.inject`), `GET /api/health → { status: 'ok' }`. Server liest `PORT` (Default 3001).

- [ ] **Step 1: Git-Repo initialisieren, .gitignore, .env.example schreiben**

```gitignore
node_modules/
dist/
.env
*.log
```

```bash
# .env.example
DB_CLIENT_ID=
DB_CLIENT_SECRET=
OVERPASS_URL_PRIMARY=https://overpass-api.de/api/interpreter
OVERPASS_URL_FALLBACK=https://overpass.kumi.systems/api/interpreter
PORT=3001
```

- [ ] **Step 2: backend/package.json + tsconfig (strict) + vitest.config anlegen, Abhängigkeiten installieren**

```jsonc
// backend/package.json (Kern)
{
  "name": "umstieg-backend", "type": "module",
  "scripts": { "dev": "tsx watch src/server.ts", "build": "tsc", "test": "vitest run", "lint": "tsc --noEmit" },
  "dependencies": { "fastify": "^5", "@fastify/static": "^8", "lru-cache": "^11" },
  "devDependencies": { "typescript": "^5", "tsx": "^4", "vitest": "^3", "@types/node": "^22" }
}
```

- [ ] **Step 3: Failing Test schreiben**

```ts
// backend/test/app.test.ts
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('app', () => {
  it('liefert /api/health mit status ok', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 4: Test rot laufen lassen** – `npm test` in backend/, erwartet FAIL (app.js fehlt)
- [ ] **Step 5: `app.ts` (buildApp mit health-Route) + `server.ts` (listen auf PORT) implementieren**
- [ ] **Step 6: Test grün** – `npm test`
- [ ] **Step 7: README.md anlegen** (Projektüberblick, Stand, Startanleitung, offene Punkte: DB-Keys, gh/vercel) **und committen**

### Task 2: Frontend-Gerüst

**Files:**
- Create: `frontend/` via `npm create vite@latest frontend -- --template react-ts`
- Modify: `frontend/vite.config.ts` (Proxy `/api` → `http://localhost:3001`)
- Modify: `frontend/src/App.tsx` (Titel „Umstieg.", leere Eingabemaske-Platzhalterstruktur)

**Interfaces:**
- Produces: laufendes Vite-Dev-Setup mit API-Proxy; `npm run build` erzeugt `frontend/dist` (wird später vom Backend statisch ausgeliefert).

- [ ] **Step 1: Vite-Scaffold erzeugen, Abhängigkeiten installieren**
- [ ] **Step 2: Proxy konfigurieren, App.tsx auf deutschen Titel + Grundlayout reduzieren**
- [ ] **Step 3: Verifizieren:** `npm run build` läuft fehlerfrei (`tsc && vite build`)
- [ ] **Step 4: Commit**

### Task 3: Overpass-Client + Fixture-Recorder

**Files:**
- Create: `backend/src/clients/overpass.ts`, `backend/src/core/typen.ts`
- Create: `backend/scripts/record-fixture.ts`
- Test: `backend/test/overpass.test.ts`, Fixtures unter `backend/test/fixtures/overpass/`

**Interfaces:**
- Produces: `overpassQuery(lat: number, lon: number, radiusM: number, fetchFn?: typeof fetch): Promise<OverpassAntwort>` mit `OverpassAntwort = { elements: OsmElement[] }`, `OsmElement = { type: 'node'|'way'; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string,string> }`. Primär-/Fallback-Instanz aus Env, User-Agent `umstiegs-navigator/0.1 (dev)`, 1 Retry je Instanz mit 2 s Wartezeit.
- Produces: `baueOverpassQL(lat, lon, radiusM): string` (exportiert für Tests; Query gemäß Konzept 4.1 inkl. elevator/conveying/steps/platform/level).

- [ ] **Step 1: Failing Tests:** `baueOverpassQL` enthält alle Elementklassen; `overpassQuery` nutzt Fallback-URL, wenn Primär-Fetch zweimal wirft (fetchFn gemockt); Antwort-JSON wird durchgereicht.
- [ ] **Step 2: Rot laufen lassen**
- [ ] **Step 3: Implementieren** (fetch mit AbortSignal.timeout(25000), Retry-Schleife über [primär, primär, fallback, fallback])
- [ ] **Step 4: Grün laufen lassen**
- [ ] **Step 5: record-fixture.ts schreiben:** `tsx scripts/record-fixture.ts <name> <lat> <lon> [radius]` → speichert nach `test/fixtures/overpass/<name>.json`
- [ ] **Step 6: Drei echte Fixtures aufnehmen** (Kandidaten, nach tatsächlicher Datenlage ggf. tauschen: `berlin-hbf` 52.5251/13.3694 · `guetersloh` 51.9063/8.3853 · `kleinstation` – kleiner Halt, z. B. `zernitz` 52.9436/12.2839). Sequenziell, ≥ 2 s Pause.
- [ ] **Step 7: Commit**

### Task 4: Graphbau aus OSM

**Files:**
- Create: `backend/src/core/graph.ts`
- Test: `backend/test/graph.test.ts`, `backend/test/fixtures/synthetisch/mini-bahnhof.json` (handgebautes Mini-OSM: 2 Bahnsteige, 1 Unterführung, 2 Treppen, 1 Aufzug)

**Interfaces:**
- Consumes: `OverpassAntwort` (Task 3), Typen aus `typen.ts`.
- Produces: `baueGraph(osm: OverpassAntwort): StationGraph` (ohne `stufe` – wird in Task 5 gesetzt, Feld initial 3) und `haversineM(lat1, lon1, lat2, lon2): number`. Regeln: Bahnsteig-Ways (`railway=platform`) → Bahnsteigpunkte Anfang/Mitte/Ende je `ref`-Gleis (bei `ref="4;5"` beide Gleise); `highway=steps` → typ `treppe` (`conveying=*` → `rolltreppe`); `highway=elevator`-Node → Aufzugkante zwischen allen dort endenden Ebenen; Fußwege → typ `eben` (mit `incline` → `rampe`); `wheelchair=no` oder typ `treppe` → `barrierefrei=false`; Kantenlänge Haversine; Bahnsteigpunkte werden an den nächstgelegenen Fußwegknoten ≤ 30 m angebunden.

- [ ] **Step 1: Failing Tests gegen Mini-Fixture:** exakte Anzahl Gleise (`['1','2']`), Aufzugkante mit `barrierefrei=true`, Treppenkante `deltaLevel=-1`/`barrierefrei=false`, Haversine Berlin→Bahnsteigpunkt plausibel (±1 m an Referenzwert)
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün**
- [ ] **Step 5: Smoke-Test gegen echtes Fixture** (`berlin-hbf`: > 5 Gleise gefunden, Graph zusammenhängend zwischen ≥ 2 Bahnsteigen)
- [ ] **Step 6: Commit**

### Task 5: Klassifikation (Stufe 1/2/3)

**Files:**
- Create: `backend/src/core/klassifikation.ts`
- Test: `backend/test/klassifikation.test.ts`

**Interfaces:**
- Consumes: `StationGraph`.
- Produces: `klassifiziere(graph: StationGraph): Stufe` – Stufe 1: ≥ 1 Ebenenwechsel-Kante mit echten level-Daten UND zusammenhängender Fußweg-Graph zwischen ≥ 80 % der Bahnsteige; Stufe 2: Bahnsteige + irgendein Fußweg; sonst 3. Zusätzlich `erreichbareGleisPaare(graph): number` (Anteil verbundener Gleispaare, für Spike-Report).

- [ ] **Step 1: Failing Tests:** Mini-Fixture-Graph → 1; Graph ohne Ebenenwechselkanten aber mit Fußweg → 2; leerer Graph → 3
- [ ] **Step 2: Rot** · **Step 3: Implementieren (BFS über Komponenten)** · **Step 4: Grün** · **Step 5: Commit**

### Task 6: Datenrealitäts-Spike

**Files:**
- Create: `backend/scripts/spike-datenrealitaet.ts`, `backend/scripts/spike-bahnhoefe.ts` (Liste ~40 Bahnhöfe: Name, lat, lon, Kategorie groß/mittel/klein – quer durch Deutschland)
- Create (Ergebnis): `docs/spike-datenrealitaet-ergebnis.md`, Rohdaten-Cache `backend/test/fixtures/spike/<slug>.json`

**Interfaces:**
- Consumes: `overpassQuery`, `baueGraph`, `klassifiziere`, `erreichbareGleisPaare`.
- Produces: Markdown-Report mit (a) Stufenverteilung gesamt und je Größenkategorie, (b) Anteil Bahnhöfe mit `railway:platform_section`-Daten (Wagenpositions-USP!), (c) Anteil mit level-Tags, (d) Empfehlungstext. **Entscheidungstor:** Ist Stufe 1 < 20 % der Fälle, wird Priorität von AP6-Kartenfeinheiten auf Synthesemodell/Textqualität verschoben (im Report + README festhalten). DB-Abschnittsdaten-Check nur bei vorhandenen `DB_CLIENT_*`-Keys, sonst als „offen – blockiert auf Registrierung" ausweisen.

- [ ] **Step 1: Bahnhofsliste anlegen** (40 Einträge, je ~13 groß / ~14 mittel / ~13 klein)
- [ ] **Step 2: Spike-Script:** je Bahnhof: Cache-Datei vorhanden? sonst Overpass (2,5 s Pause); Graph + Klassifikation + Kennzahlen sammeln; Markdown-Report generieren
- [ ] **Step 3: Lauf durchführen** (dauert ~2–4 min netto)
- [ ] **Step 4: Report prüfen, Entscheidungstor auswerten, README aktualisieren, Commit**

### Task 7: Routing – Dijkstra mit drei Varianten

**Files:**
- Create: `backend/src/core/routing.ts`
- Test: `backend/test/routing.test.ts`

**Interfaces:**
- Consumes: `StationGraph`, `RoutenVariante`, `Gehprofil`.
- Produces:
  - `findeStartknoten(graph, gleis: string, abschnitt?: string): { knoten: GraphKnoten; hinweis?: string }` (Abschnitt unbekannt → Mitte + Hinweis)
  - `berechneRoute(graph, startId: string, zielId: string, variante: RoutenVariante): RoutenPfad | null` (null = kein Pfad, z. B. barrierefrei unmöglich)
  - `istGleicherBahnsteig(graph, gleisAn: string, gleisAb: string): boolean`
  - Kantengewichte (Sekunden, exportierte Konstante `GEWICHTE`): Basis = laengeM / 1.0 m/s; schnellste: rolltreppe −10 s Bonus, aufzug +60 s Malus; einfachste: +45 s je Ebenenwechsel, +15 s je Richtungswechsel > 45°; barrierefrei: treppe/rolltreppe gesperrt, `status='INACTIVE'` sperrt Kante.

- [ ] **Step 1: Failing Tests auf synthetischem Graphen** (bekannte Topologie: schneller Treppenweg vs. langer Aufzugweg): schnellste wählt Treppe; barrierefrei wählt Aufzug; barrierefrei mit INACTIVE-Aufzug → null; einfachste minimiert Abbiegungen; gleicher Bahnsteig erkannt
- [ ] **Step 2: Rot** · **Step 3: Dijkstra implementieren (binärer Heap nicht nötig – Graphen sind klein, einfache Prioritätsliste)** · **Step 4: Grün** · **Step 5: Commit**

### Task 8: Gehzeit + Ampel

**Files:**
- Create: `backend/src/core/gehzeit.ts`
- Test: `backend/test/gehzeit.test.ts`

**Interfaces:**
- Produces: `gehzeitSekunden(pfad: RoutenPfad, profil: Gehprofil): number` (Geschwindigkeiten 1.4/1.0/0.6 m/s; Zuschläge je Ebenenwechsel-Kante: treppe +20, rolltreppe +10, aufzug +60, rampe +0); `ampel(umstiegszeitSek: number, gehzeitSek: number): 'gruen'|'gelb'|'rot'` – **relativ zur Gehzeit** (Konzeptkorrektur 4 aus dem Design: grün ≥ 2× Gehzeit, gelb 1–2× Gehzeit, rot < 1× Gehzeit); `berechnePuffer(abfahrt: Date, ankunft: Date, gehzeitSek: number): number` (Sekunden Umstiegszeit minus Gehzeit).

- [ ] **Step 1: Failing Tests mit exakten Zahlen** (100 m eben normal = 100 s; 100 m + Treppe hoch zügig = round(100/1.4)+20 = 91 s; ampel(200,100)=gruen, ampel(150,100)=gelb, ampel(99,100)=rot, Grenzen inklusiv bei 2×/1×)
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: Commit**

### Task 9: Textgenerierung

**Files:**
- Create: `backend/src/core/textgen.ts`
- Test: `backend/test/textgen.test.ts`

**Interfaces:**
- Consumes: `RoutenPfad`.
- Produces: `generiereSchritte(pfad: RoutenPfad): Schritt[]`. Regeln: benachbarte `eben`-Kanten gleicher Richtung (±22,5°) zu einem Schritt zusammenfassen; Distanzen auf 10 m runden (< 10 m → „wenige Meter"); Richtungsskala über Winkeländerung zwischen Segmenten: −180…180° → rechts (< −67,5), halbrechts (−67,5…−22,5), geradeaus (±22,5), halblinks (22,5…67,5), links (> 67,5); Ebenenwechsel explizit: „Rolltreppe hoch zur Ebene 0", „Aufzug zur Unterführung (−1)", „Treppe hinunter zur Ebene −1"; erster Schritt „Nach Ausstieg …", letzter Schritt endet „… zu Gleis {ziel}". Hilfsfunktion `peilungGrad(a: GraphKnoten, b: GraphKnoten): number` exportiert.

- [ ] **Step 1: Failing Tests:** fester synthetischer Pfad → exakte Satzfolge (deckt alle 5 Richtungen, Rundung, Ebenenwechsel-Benennungen ab); Beispiel aus Konzept 6.3 als Referenzfall nachgebaut
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: Commit**

### Task 10: Synthesemodell (Stufe 3) + Sonderfall gleicher Bahnsteig

**Files:**
- Create: `backend/src/core/synthmodell.ts`
- Test: `backend/test/synthmodell.test.ts`

**Interfaces:**
- Consumes: `StationsInfo = { eva: string; name: string; gleise: { gleis: string; lat?: number; lon?: number }[] }` (Definition in typen.ts ergänzen), optional FaSta-Anlagenliste `FastaAnlage = { typ: 'AUFZUG'|'ROLLTREPPE'; lat: number; lon: number; status: 'ACTIVE'|'INACTIVE'; beschreibung?: string }`.
- Produces: `syntheseGraph(info: StationsInfo, anlagen?: FastaAnlage[]): StationGraph` – Standardmuster: alle Bahnsteige parallel, eine Querung (Unterführung, level −1) auf halber Bahnsteiglänge; Aufzüge/Rolltreppen aus FaSta-Koordinaten dem nächsten Bahnsteig zuordnen; ohne Koordinaten: je Bahnsteig Treppe zur Querung. **Keine präzisen Meterangaben** – Kanten tragen `laengeM` als grobe Schätzung (Bahnsteigabstand 15 m), Textausgabe für Stufe 3 nutzt „ca."-Formulierungen (Flag in Schritt-Texten: Distanz auf 10 m gerundet mit Präfix „ca. ").
- Sonderfall in `routing.ts` bereits erkannt (`istGleicherBahnsteig`); hier Test der Endausgabe: „Gleis {ab} gegenüber, kein Ebenenwechsel" mit gehzeitSek ≤ 30.

- [ ] **Step 1: Failing Tests:** 4-Gleis-Station → Graph mit Querung, jede Gleis-zu-Gleis-Route existiert; FaSta-Aufzug INACTIVE → barrierefreie Route null; gleicher Bahnsteig (Gleis „4"/„5" am selben Bahnsteig laut StationsInfo) → Sonderausgabe
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: Commit**

### Task 11: Stations-Client (RIS::Stations) hinter Env-Guard

**Files:**
- Create: `backend/src/clients/stations.ts`
- Test: `backend/test/stations.test.ts`, Fixture `backend/test/fixtures/db/stations-suche.json` (handgebaut nach Doku-Schema, mit Kommentar-Hinweis auf Verifikationspflicht)

**Interfaces:**
- Produces: `sucheBahnhoefe(q: string, fetchFn?): Promise<BahnhofTreffer[]>` mit `BahnhofTreffer = { name: string; eva: string; lat: number; lon: number }`; `holeStationsInfo(eva: string, fetchFn?): Promise<StationsInfo>`. Ohne `DB_CLIENT_ID`/`DB_CLIENT_SECRET` wirft `FehlendeZugangsdatenError` (eigene Klasse) – Aufrufer degradiert. **Endpunktpfade als Konstanten in einer Datei `backend/src/clients/db-endpunkte.ts` bündeln mit TODO-Kommentar: vor Live-Betrieb gegen aktuelle Marketplace-Doku verifizieren.**

- [ ] **Step 1: Failing Tests** (gemocktes fetchFn liefert Fixture → Treffer geparst; fehlende Keys → FehlendeZugangsdatenError)
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: Commit**

### Task 12: REST-Route /api/route + /api/stations + Cache

**Files:**
- Create: `backend/src/routes/api.ts`, `backend/src/cache/lru.ts`
- Modify: `backend/src/app.ts` (Routen registrieren)
- Test: `backend/test/api.test.ts`

**Interfaces:**
- Consumes: alles aus Tasks 3–11.
- Produces: `GET /api/stations?q=…` → `BahnhofTreffer[]` (ohne Keys: 503 mit `{ fehler: 'db-zugang-fehlt' }`); `GET /api/route?eva&gleisAn&gleisAb&wagen?&profil&variante` → `RouteErgebnis` (+ Feld `ampelfarbe?` erst mit Live-Daten in Task 15/16). Ablauf gemäß Konzept-Datenfluss; Overpass-Ausfall → Synthesemodell; Cache: `graphCache` (LRU max 100, TTL 24 h, Schlüssel eva), `liveCache` (TTL 30 s). Für Tests: App-Factory akzeptiert injizierbare Client-Funktionen (`buildApp({ overpass?, stations?, … })`).
- Produces zusätzlich: GeoJSON-Export `grapZuGeoJSON(graph, pfad): Record<string, FeatureCollection>` je Ebene (in `graph.ts` ergänzt) für das Kartenfeld `karte`.

- [ ] **Step 1: Failing Tests:** Route-Endpunkt mit injizierten Fixture-Clients liefert `RouteErgebnis` mit Schritten + Gehzeit; Overpass-Client wirft → Antwort `stufe: 3` + Hinweis; zweiter Aufruf trifft Cache (Client-Spy 1×)
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: README (API-Doku) + Commit**

### Task 13: Frontend – Eingabe, Schrittliste, Ampel

**Files:**
- Create: `frontend/src/api/client.ts` (typisierter Backend-Client, Typen aus Backend gespiegelt in `frontend/src/api/typen.ts`)
- Create: `frontend/src/components/Eingabe.tsx`, `Schrittliste.tsx`, `Ampel.tsx`
- Modify: `frontend/src/App.tsx` (Zustand: eingabe → route; Route bleibt im Speicher – offline-fähig)

**Interfaces:**
- Consumes: REST-API aus Task 12.
- Produces: Bedienbare App: Bahnhofssuche (Vervollständigung, bei 503 Freitext-Fallback mit Koordinaten-Hinweis), Gleis an/ab (Pflicht), Wagennummer (optional), Gehprofil- und Variantenwahl (große Schaltflächen); Routenansicht mit fixierter Ampel oben (grau „ohne Live-Daten" solange keine Zugauswahl), nummerierter Schrittliste in großer Schrift, Hinweisliste.

- [ ] **Step 1: API-Client + Typen** · **Step 2: Komponenten bauen (mobil zuerst, hoher Kontrast, min. 44 px Touch-Ziele)** · **Step 3: Manuell verifizieren** (Backend mit Fixture-Modus `FIXTURE_EVA=… npm run dev`, Route auf dem Handy-Viewport im Browser prüfen) · **Step 4: `npm run build` grün, Commit + README**

### Task 14: Karte (MapLibre GL, Ebenen)

**Files:**
- Create: `frontend/src/components/Karte.tsx`
- Modify: `frontend/src/App.tsx` (Karte einklappbar unter Schrittliste)

**Interfaces:**
- Consumes: `RouteErgebnis.karte` (GeoJSON je Ebene), Start-/Zielknoten.
- Produces: MapLibre-Karte mit OSM-Rasterbasiskarte (Attribution ODbL!), GeoJSON-Layer je Ebene mit Umschalter (−1/0/+1), Routenlinie, Start-/Zielmarker; eingeklappt als Standard (Text vor Karte).

- [ ] **Step 1: Karte-Komponente** · **Step 2: Ebenen-Umschalter** · **Step 3: Manuelle Verifikation Berlin-Fixture** · **Step 4: Build grün, Commit**

### Task 15: Live – Tafeln, Zugauswahl, Wagenreihung

**Files:**
- Create: `backend/src/clients/timetables.ts`, `backend/src/clients/wagenreihung.ts`
- Create: `frontend/src/components/Zugauswahl.tsx`
- Modify: `backend/src/routes/api.ts` (`GET /api/board/:eva?type=arr|dep`), `frontend/src/components/Eingabe.tsx`
- Test: `backend/test/timetables.test.ts`, Fixtures `backend/test/fixtures/db/tafel-*.xml` (Timetables liefert XML – Parser mit fast-xml-parser)

**Interfaces:**
- Produces: `holeTafel(eva: string, typ: 'arr'|'dep', fetchFn?): Promise<TafelEintrag[]>` mit `TafelEintrag = { zug: string; zeitSoll: string; zeitIst?: string; gleisSoll: string; gleisIst?: string; ziel: string }`; `holeWagenposition(zugnummer: string, datum: string, wagen: string, fetchFn?): Promise<{ abschnitt: string } | null>` (null = normaler Fall „keine Daten"); Zugauswahl-UI übernimmt Zug/Gleis/Zeit inkl. Änderungen in die Eingabe; `/api/route` nutzt Wagenposition für Startknoten (`findeStartknoten` mit Abschnitt).

- [ ] **Step 1: Failing Tests gegen XML-Fixtures** (Soll+Änderung zusammengeführt, Gleiswechsel erkannt; Wagenreihung leer → null)
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: UI-Anbindung, Build, Commit**

### Task 16: Live-Überwachung – SSE, Neuberechnung, FaSta

**Files:**
- Create: `backend/src/routes/live.ts` (SSE), `backend/src/core/ueberwachung.ts` (Poller **pro EVA**, Abonnenten-Verteilung), `backend/src/clients/fasta.ts`
- Create: `frontend/src/components/LiveBanner.tsx`, `frontend/src/api/sse.ts`
- Test: `backend/test/live.test.ts`, `backend/test/fasta.test.ts`

**Interfaces:**
- Produces: `GET /api/live/:eva?zugAn&zugAb` → SSE-Events `gleiswechsel | verspaetung | heartbeat`, Payload je Event `{ typ, zug, alt?, neu?, zeitstempel }`; Poller pollt Timetables-Änderungen alle 30 s **einmal je EVA** und verteilt an alle Abonnenten; Frontend: Reconnect-Logik (EventSource onerror → neu verbinden, Route neu anfordern), Gleiswechsel → Route automatisch neu laden + Banner + `navigator.vibrate`; FaSta-Client `holeAnlagen(eva): Promise<FastaAnlage[]>` fließt in barrierefreie Variante (INACTIVE sperrt Kante, Warnung bei unbekanntem Status).

- [ ] **Step 1: Failing Tests:** simulierte Änderungsdaten → SSE-Event `gleiswechsel`; zwei Abonnenten, ein Poll (Spy); FaSta INACTIVE → Route weicht aus oder Warnhinweis
- [ ] **Step 2: Rot** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: Frontend-Anbindung, Commit + README**

### Task 17: Härtung – Degradationstabelle, Docker, Mobile-Feinschliff

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`
- Test: `backend/test/degradation.test.ts` (jede Zeile der Konzept-Tabelle Abschnitt 8 als eigener Test)
- Modify: README.md (finaler Stand: Betrieb, Grenzen, Lizenz-/Attributionspflichten ODbL/CC BY, offene Punkte Stufe-2-Features)

**Interfaces:**
- Consumes: gesamte App.
- Produces: Ein Container (Multi-Stage: Frontend-Build → Backend serviert `frontend/dist` via `@fastify/static`); alle 6 Degradationszeilen getestet; Zeitstempel an jeder Live-Anzeige verifiziert; Lighthouse-artige manuelle Mobilprüfung (Viewport 390 px).

- [ ] **Step 1: Degradationstests schreiben (rot→grün einzeln)** · **Step 2: Dockerfile + Compose, lokaler Build-Test** · **Step 3: README final, Commit**

---

## Self-Review (durchgeführt)

- **Spec-Abdeckung:** Konzeptabschnitte 1–13 → Tasks 1–17 zugeordnet; Abschnitt 14 (Stufe 2) bewusst außen vor; Abschnitt 15 Risiken → Spike (Task 6), Env-Guards (Task 11), Attribution (Task 14/17). Datenrealitäts-Spike ergänzt als Task 6 mit Entscheidungstor.
- **Platzhalter-Scan:** keine TBD/TODO-Lücken; DB-Endpunktpfade bewusst als zu verifizierende Konstanten gekennzeichnet (Spec-Vorgabe, kein Platzhalter).
- **Typkonsistenz:** alle Tasks referenzieren `typen.ts`-Namen (`StationGraph`, `RoutenPfad`, `Schritt`, `RouteErgebnis`, `StationsInfo`, `FastaAnlage`, `BahnhofTreffer`, `TafelEintrag`); Funktionsnamen zwischen Producer/Consumer abgeglichen (`baueGraph`, `klassifiziere`, `berechneRoute`, `findeStartknoten`, `istGleicherBahnsteig`, `gehzeitSekunden`, `ampel`, `generiereSchritte`, `syntheseGraph`, `grapZuGeoJSON`).
