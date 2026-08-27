# Standort & Live-Navigation (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App fragt den Gerätestandort ab, um den Umstiegsbahnhof vorzubelegen, die eigene Position auf der Karte zu zeigen und die Ankunft am Zielgleis zu erkennen.

**Architecture:** Die Browser-Geolocation-API steckt ausschließlich in einem React-Hook (`useStandort`); die gesamte Entscheidungslogik (Distanz, Verweildauer, Rundung, Zielermittlung) liegt in reinen Funktionen unter `frontend/src/standort/` und ist ohne Browser-Mocks unit-testbar. Serverseitig lernt der bestehende Endpunkt `/api/stations` eine Umkreissuche als Alternative zur Namenssuche. Rohkoordinaten verlassen den Browser nie – gerundet wird vor dem Absenden.

**Tech Stack:** Backend Node ≥20 · Fastify 5 · TypeScript strict · vitest 3. Frontend React 19 · Vite 8 · TypeScript ~6.0 · MapLibre GL 6 · vitest (neu). Betrieb Docker + Caddy.

**Spec:** [`docs/superpowers/specs/2026-08-27-standort-und-navigation-design.md`](../specs/2026-08-27-standort-und-navigation-design.md)

## Global Constraints

- **Vorbedingung:** Task 16 (SSE/FaSta) muss abgeschlossen, grün und committet sein. Der Arbeitsbaum enthält sonst unfertige Arbeit mit 2 roten Tests (`wendeFastaAn` fehlt in `backend/src/core/synthmodell.ts`), die sich mit P1 vermischen würde. Alternativ vorher `git stash`.
- **Commit nur bei grüner Suite.** `cd backend && npm test` und `cd frontend && npm test` müssen vor jedem Commit vollständig grün sein.
- **Backend-Imports tragen `.js`-Endungen** (ESM/NodeNext), auch für `.ts`-Quellen: `import { x } from './datei.js'`.
- **Frontend-Stilkonvention der bestehenden Dateien beibehalten:** `.ts`-Logikdateien mit Semikolon (wie `src/api/client.ts`), `.tsx`-Komponenten ohne Semikolon (wie `src/App.tsx`). Frontend-Imports **ohne** Dateiendung.
- **Bezeichner und UI-Texte auf Deutsch**, wie im gesamten Projekt.
- **Keine Zahlenliterale für Schwellenwerte** im Frontend – ausschließlich die Konstanten aus `frontend/src/standort/schwellen.ts`. Der Umkreisradius der Bahnhofssuche ist davon ausgenommen: Er ist eine Serverentscheidung und steht in `backend/src/routes/api.ts`.
- **Frontend und Backend spiegeln bewusst.** Es sind getrennte npm-Pakete mit eigener `tsconfig`; das Frontend kann nichts aus `backend/src` importieren. Deshalb wird `haversineM` in `frontend/src/standort/distanz.ts` wortgleich gespiegelt – wie schon `frontend/src/api/typen.ts` die Backend-Typen spiegelt (Kopfkommentar dort). Jede gespiegelte Datei trägt einen Verweis auf ihr Original.
- **Rundung geschieht im Browser vor dem Absenden**, niemals serverseitig.
- **Kein `localStorage`, keine Cookies, kein Logging von Koordinaten.** `logger: false` in `backend/src/app.ts` bleibt unverändert.
- **Genauigkeitsgrenze:** `GENAUIGKEIT_MAX_M = 100`. Bei schlechterem Fix wird der Punkt ausgeblendet und der Ankunftszähler pausiert, ohne zurückgesetzt zu werden.
- **Stufe-3-Routen bekommen keine Ankunftserkennung** – die Koordinaten des Synthesemodells sind konstruiert.

---

## Dateistruktur

**Backend (alle bestehenden Muster folgen `clients/stations.ts`)**

| Datei | Verantwortung |
|---|---|
| `src/clients/db-endpunkte.ts` | *ändern* – `epStopPlacesByPosition` ergänzen |
| `src/clients/stations.ts` | *ändern* – `sucheBahnhoefeNahebei`, gemeinsames Mapping ausklammern |
| `src/routes/api.ts` | *ändern* – `/api/stations` nimmt `lat`+`lon` alternativ zu `q` |
| `src/server.ts` | *ändern* – FIXTURE_EVA-Modus deckt die Umkreissuche mit ab |
| `test/fixtures/db/stations-by-position.json` | *neu* – handgebaut, mit Verifikationshinweis |

**Frontend**

| Datei | Verantwortung |
|---|---|
| `src/standort/schwellen.ts` | *neu* – benannte Konstanten, sonst nichts |
| `src/standort/typen.ts` | *neu* – `Standort`, `StandortStatus`, `AnkunftZustand` |
| `src/standort/distanz.ts` | *neu* – Haversine + Genauigkeitspolygon, rein |
| `src/standort/ankunft.ts` | *neu* – Verweildauer-Zustandsmaschine + Zielermittlung, rein |
| `src/standort/bahnhofErkennung.ts` | *neu* – Rundung + API-Aufruf, rein (fetch injizierbar) |
| `src/standort/useStandort.ts` | *neu* – **einzige** Datei mit Browser-API-Zugriff |
| `src/api/client.ts` | *ändern* – `sucheStationenNahebei` |
| `src/components/StandortStreifen.tsx` | *neu* – Ankunftsvorschlag mit Bestätigung |
| `src/components/Angekommen.tsx` | *neu* – Zielscreen |
| `src/components/Eingabe.tsx` | *ändern* – Vorbelegung des erkannten Bahnhofs |
| `src/components/Karte.tsx` | *ändern* – Positionspunkt + Genauigkeitskreis |
| `src/App.tsx` | *ändern* – Hook einbinden, Ansichten `angekommen`/`abgefahren` |

**Betrieb**

| Datei | Verantwortung |
|---|---|
| `Caddyfile` | *neu* – TLS-Terminierung und Security-Header |
| `frontend/vite.config.ts` | *ändern* – HTTPS in der Entwicklung |

---

### Task 1: Backend – Umkreissuche im stations-Client

**Files:**
- Modify: `backend/src/clients/db-endpunkte.ts`
- Modify: `backend/src/clients/stations.ts:41-54`
- Create: `backend/test/fixtures/db/stations-by-position.json`
- Test: `backend/test/stations.test.ts`

**Interfaces:**
- Consumes: `dbGet` und `BahnhofTreffer` aus `stations.ts`, `RIS_STATIONS_BASIS` aus `db-endpunkte.ts`.
- Produces:
  - `epStopPlacesByPosition(lat: number, lon: number, radiusM: number): string`
  - `sucheBahnhoefeNahebei(lat: number, lon: number, radiusM: number, fetchFn?: typeof fetch): Promise<BahnhofTreffer[]>`

- [ ] **Step 1: Fixture anlegen**

Create `backend/test/fixtures/db/stations-by-position.json`. Gleiche Hülle wie `stations-suche.json`, weil der Endpunkt laut Doku dieselbe `stopPlaces`-Struktur liefert:

```json
{
  "_hinweis": "HANDGEBAUT nach Marketplace-Doku, NICHT gegen eine echte Antwort verifiziert. Vor Live-Betrieb pruefen (siehe TODO in src/clients/db-endpunkte.ts).",
  "stopPlaces": [
    {
      "evaNumber": "8011160",
      "names": { "DE": { "nameLong": "Berlin Hbf" } },
      "position": { "latitude": 52.524925, "longitude": 13.369629 }
    },
    {
      "evaNumber": "8089021",
      "names": { "DE": { "nameLong": "Berlin Hbf (tief)" } },
      "position": { "latitude": 52.52505, "longitude": 13.36936 }
    }
  ]
}
```

- [ ] **Step 2: Failing Tests schreiben**

In `backend/test/stations.test.ts`: Import um `sucheBahnhoefeNahebei` erweitern, im `fetchMock` eine Zeile für den neuen Pfad ergänzen (**vor** der `/stop-places/`-Zeile, sonst greift die allgemeinere Regel zuerst), und einen neuen `describe`-Block anhängen.

Im `fetchMock` direkt nach der `by-name`-Zeile einfügen:

```ts
    else if (url.includes('/stop-places/by-position')) fixture = ladeFixture('stations-by-position');
```

Neuer Block hinter `describe('holeStationsInfo', ...)`:

```ts
  describe('sucheBahnhoefeNahebei', () => {
    it('parst Treffer aus dem Umkreis-Fixture', async () => {
      const treffer = await sucheBahnhoefeNahebei(52.525, 13.369, 1000, fetchMock());
      expect(treffer).toHaveLength(2);
      expect(treffer[0]).toEqual({
        name: 'Berlin Hbf',
        eva: '8011160',
        lat: 52.524925,
        lon: 13.369629,
      });
    });

    it('reicht Koordinaten und Radius als Query-Parameter durch', async () => {
      const mock = fetchMock();
      await sucheBahnhoefeNahebei(52.525, 13.369, 1000, mock);
      const [url] = (mock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(url).toContain('latitude=52.525');
      expect(url).toContain('longitude=13.369');
      expect(url).toContain('radius=1000');
    });

    it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
      vi.stubEnv('DB_CLIENT_ID', '');
      await expect(sucheBahnhoefeNahebei(52.525, 13.369, 1000, fetchMock())).rejects.toBeInstanceOf(
        FehlendeZugangsdatenError,
      );
    });
  });
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd backend && npx vitest run test/stations.test.ts`
Expected: FAIL – `sucheBahnhoefeNahebei is not a function` bzw. Importfehler.

- [ ] **Step 4: Endpunkt ergänzen**

In `backend/src/clients/db-endpunkte.ts` direkt nach `epStopPlacesByName` einfügen:

```ts
// Umkreissuche (Standorterkennung). Wie alle Pfade hier vor Live-Betrieb
// gegen die Marketplace-Doku verifizieren – siehe TODO im Dateikopf.
export const epStopPlacesByPosition = (lat: number, lon: number, radiusM: number): string =>
  `${RIS_STATIONS_BASIS}/stop-places/by-position?latitude=${lat}&longitude=${lon}&radius=${radiusM}`;
```

- [ ] **Step 5: Client implementieren**

In `backend/src/clients/stations.ts` den Import in Zeile 1 erweitern:

```ts
import {
  epPlatforms,
  epStopPlace,
  epStopPlacesByName,
  epStopPlacesByPosition,
} from './db-endpunkte.js';
```

Das Mapping aus `sucheBahnhoefe` ausklammern (DRY – beide Suchen liefern dieselbe Hülle) und `sucheBahnhoefe` darauf umstellen. Ersetze Zeilen 41–54 durch:

```ts
/** Beide Suchvarianten liefern dieselbe stopPlaces-Huelle. */
function zuTreffern(body: { stopPlaces?: StopPlace[] }): BahnhofTreffer[] {
  return (body.stopPlaces ?? [])
    .filter((sp) => sp.evaNumber && sp.names?.DE?.nameLong)
    .map((sp) => ({
      name: sp.names!.DE!.nameLong!,
      eva: sp.evaNumber!,
      lat: sp.position?.latitude ?? 0,
      lon: sp.position?.longitude ?? 0,
    }));
}

export async function sucheBahnhoefe(
  q: string,
  fetchFn: typeof fetch = fetch,
): Promise<BahnhofTreffer[]> {
  return zuTreffern((await dbGet(epStopPlacesByName(q), fetchFn)) as { stopPlaces?: StopPlace[] });
}

/** Bahnhöfe im Umkreis – Grundlage der Standorterkennung (P1). */
export async function sucheBahnhoefeNahebei(
  lat: number,
  lon: number,
  radiusM: number,
  fetchFn: typeof fetch = fetch,
): Promise<BahnhofTreffer[]> {
  const url = epStopPlacesByPosition(lat, lon, radiusM);
  return zuTreffern((await dbGet(url, fetchFn)) as { stopPlaces?: StopPlace[] });
}
```

- [ ] **Step 6: Gesamte Suite grün**

Run: `cd backend && npm test`
Expected: PASS – alle bisherigen Tests plus 3 neue. Die vorhandenen `sucheBahnhoefe`-Tests müssen unverändert grün bleiben (Beleg, dass die Ausklammerung nichts kaputt gemacht hat).

- [ ] **Step 7: Lint und Commit**

```bash
cd backend && npm run lint
git add backend/src/clients/db-endpunkte.ts backend/src/clients/stations.ts backend/test/fixtures/db/stations-by-position.json backend/test/stations.test.ts
git commit -m "feat: Umkreissuche im stations-Client (P1 Task 1)"
```

---

### Task 2: Backend – `/api/stations` mit lat/lon

**Files:**
- Modify: `backend/src/routes/api.ts:74-87`
- Modify: `backend/src/server.ts:20-33`
- Test: `backend/test/api.test.ts`

**Interfaces:**
- Consumes: `sucheBahnhoefeNahebei` aus Task 1.
- Produces: `StationsClient` (in `routes/api.ts`) erhält das zusätzliche Feld `sucheBahnhoefeNahebei: (lat: number, lon: number, radiusM: number) => Promise<BahnhofTreffer[]>`. **Alle Test-Fixture-Clients und `buildApp` müssen dieses Feld liefern.**

- [ ] **Step 1: Testfabrik erweitern**

`backend/test/api.test.ts` besitzt bereits die Fabrik `macheClients()` (Zeile 22–46). Ihr `stations`-Objekt (Zeile 28–33) muss um das neue Feld ergänzt werden, sonst schlägt die Typprüfung in **allen** bestehenden Tests fehl:

```ts
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => [
        { name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 },
      ]),
      sucheBahnhoefeNahebei: vi.fn(async () => [
        { name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 },
      ]),
    },
```

- [ ] **Step 2: Failing Tests schreiben**

An `backend/test/api.test.ts` anhängen:

```ts
describe('GET /api/stations mit Koordinaten', () => {
  it('liefert Treffer im Umkreis und reicht den Radius durch', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=52.525&lon=13.369' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(clients.stations.sucheBahnhoefeNahebei).toHaveBeenCalledWith(52.525, 13.369, 1000);
  });

  it('q und lat gleichzeitig → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Berlin&lat=52.5&lon=13.3' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('lat ohne lon → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=52.5' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('lat ausserhalb des Wertebereichs → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=200&lon=13.3' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('weder q noch Koordinaten → 400 parameter-fehlt', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-fehlt');
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd backend && npx vitest run test/api.test.ts`
Expected: FAIL – TypeScript meldet das unbekannte Feld `sucheBahnhoefeNahebei`, die Koordinatenfälle liefern 400 `parameter-fehlt` statt der erwarteten Antworten.

- [ ] **Step 4: Client-Schnittstelle erweitern**

In `backend/src/routes/api.ts` das Interface `StationsClient` (ab Zeile 23) ergänzen:

```ts
export interface StationsClient {
  sucheBahnhoefe: (q: string) => Promise<BahnhofTreffer[]>;
  sucheBahnhoefeNahebei: (
    lat: number,
    lon: number,
    radiusM: number,
  ) => Promise<BahnhofTreffer[]>;
  holeStationsInfo: (eva: string) => Promise<StationsInfo>;
}
```

In `backend/src/app.ts` die Voreinstellung ergänzen – dort steht bereits ein `stations`-Objekt:

```ts
    stations: clients.stations ?? {
      sucheBahnhoefe: (q) => sucheBahnhoefe(q),
      sucheBahnhoefeNahebei: (lat, lon, radiusM) => sucheBahnhoefeNahebei(lat, lon, radiusM),
      holeStationsInfo: (eva) => holeStationsInfo(eva),
    },
```

und den Import in Zeile 3 entsprechend erweitern:

```ts
import {
  holeStationsInfo,
  sucheBahnhoefe,
  sucheBahnhoefeNahebei,
} from './clients/stations.js';
```

- [ ] **Step 5: Route implementieren**

In `backend/src/routes/api.ts` den Handler aus Zeile 74–87 ersetzen:

```ts
  const ERKENNUNG_RADIUS_M = 1000;

  app.get<{ Querystring: { q?: string; lat?: string; lon?: string } }>(
    '/api/stations',
    async (req, reply) => {
      const q = req.query.q?.trim();
      const latRoh = req.query.lat;
      const lonRoh = req.query.lon;
      const hatKoordinaten = latRoh !== undefined || lonRoh !== undefined;

      if (!q && !hatKoordinaten) {
        return reply
          .code(400)
          .send({ fehler: 'parameter-fehlt', detail: 'q oder lat+lon ist erforderlich' });
      }
      if (q && hatKoordinaten) {
        return reply
          .code(400)
          .send({ fehler: 'parameter-ungueltig', detail: 'q und lat/lon schliessen sich aus' });
      }

      try {
        if (hatKoordinaten) {
          const lat = Number(latRoh);
          const lon = Number(lonRoh);
          const gueltig =
            latRoh !== undefined &&
            lonRoh !== undefined &&
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            lat >= -90 &&
            lat <= 90 &&
            lon >= -180 &&
            lon <= 180;
          if (!gueltig) {
            return reply
              .code(400)
              .send({ fehler: 'parameter-ungueltig', detail: 'lat und lon muessen gueltig sein' });
          }
          return await clients.stations.sucheBahnhoefeNahebei(lat, lon, ERKENNUNG_RADIUS_M);
        }
        return await clients.stations.sucheBahnhoefe(q!);
      } catch (e) {
        if (e instanceof FehlendeZugangsdatenError) {
          return reply.code(503).send({ fehler: 'db-zugang-fehlt' });
        }
        throw e;
      }
    },
  );
```

- [ ] **Step 6: FIXTURE_EVA-Modus nachziehen**

In `backend/src/server.ts` im Objekt `stations` (Zeile 21) ergänzen, damit die Entwicklung ohne DB-Zugang auch die Erkennung abdeckt:

```ts
      sucheBahnhoefeNahebei: async () => [
        { name: 'Berlin Hbf (Fixture)', eva: '8011160', lat: 52.5251, lon: 13.3694 },
      ],
```

- [ ] **Step 7: Tests grün**

Run: `cd backend && npm test`
Expected: PASS – alle Tests inklusive der 5 neuen.

- [ ] **Step 8: Lint und Commit**

```bash
cd backend && npm run lint
git add backend/src/routes/api.ts backend/src/app.ts backend/src/server.ts backend/test/api.test.ts
git commit -m "feat: /api/stations nimmt lat/lon als Alternative zu q (P1 Task 2)"
```

---

### Task 3: Frontend – Testinfrastruktur, Schwellen, Distanz

Das Frontend hat bisher **keine** Testinfrastruktur. Sie kommt hier dazu, weil ab Task 4 reine Logik entsteht, die geprüft werden muss.

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/standort/schwellen.ts`
- Create: `frontend/src/standort/distanz.ts`
- Test: `frontend/src/standort/distanz.test.ts`

**Interfaces:**
- Produces: `haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number` – identische Formel wie `backend/src/core/graph.ts:16-24` mit `ERDRADIUS_M = 6_371_000`. Konstanten aus `schwellen.ts` (siehe Step 3).

- [ ] **Step 1: vitest installieren**

```bash
cd frontend && npm install -D vitest@^3
```

In `frontend/package.json` im Abschnitt `scripts` ergänzen:

```json
    "test": "vitest run",
```

- [ ] **Step 2: vitest konfigurieren**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

`environment: 'node'` genügt: Getestet werden ausschließlich reine Funktionen, kein DOM.

- [ ] **Step 3: Schwellenwerte anlegen**

Create `frontend/src/standort/schwellen.ts`:

```ts
// Zentrale Schwellenwerte der Standortlogik. Begruendungen in der Spec,
// Abschnitt 2 und 5.2 – keine dieser Zahlen gehoert in eine andere Datei.

/** Schlechtere Genauigkeit → Punkt ausblenden, Ankunftszaehler pausieren. */
export const GENAUIGKEIT_MAX_M = 100;

/** Umkreis um das Zielgleis, ab dem die Ankunft in Frage kommt. */
export const ANKUNFT_RADIUS_M = 40;

/** Verweildauer im Radius, bevor die Ankunft vorgeschlagen wird. */
export const ANKUNFT_VERWEIL_MS = 15_000;

/** Nachkommastellen der gerundeten Koordinate (3 ≈ 110 m). */
export const KOORD_RUNDUNG = 3;

/** Kulanz nach der Abfahrtszeit, bevor "abgefahren" gilt. */
export const ABGEFAHREN_KULANZ_MS = 60_000;
```

Der Umkreisradius der Bahnhofssuche gehört **nicht** hierher – er wird serverseitig
in `routes/api.ts` festgelegt (Task 2). Eine Konstante dafür im Frontend wäre
unbenutzt.

- [ ] **Step 4: Failing Test schreiben**

Create `frontend/src/standort/distanz.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { haversineM } from './distanz';

describe('haversineM', () => {
  it('gleiche Koordinate → 0 m', () => {
    expect(haversineM(52.525, 13.369, 52.525, 13.369)).toBe(0);
  });

  it('0,001 Grad noerdlich → rund 111 m', () => {
    const d = haversineM(52.525, 13.369, 52.526, 13.369);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('ist symmetrisch', () => {
    const hin = haversineM(52.525, 13.369, 52.526, 13.371);
    const zurueck = haversineM(52.526, 13.371, 52.525, 13.369);
    expect(hin).toBeCloseTo(zurueck, 6);
  });

  it('funktioniert ueber den Nullmeridian hinweg', () => {
    const d = haversineM(51.4778, -0.0005, 51.4778, 0.0005);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(80);
  });
});
```

- [ ] **Step 5: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/standort/distanz.test.ts`
Expected: FAIL – `Failed to resolve import "./distanz"`.

- [ ] **Step 6: Implementieren**

Create `frontend/src/standort/distanz.ts`:

```ts
// Spiegel von backend/src/core/graph.ts:16-24 – identische Formel und
// identischer Erdradius, damit Frontend und Backend dieselbe Distanz
// berechnen. Bei Aenderungen dort hier nachziehen.

const ERDRADIUS_M = 6_371_000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * ERDRADIUS_M * Math.asin(Math.sqrt(a));
}
```

- [ ] **Step 7: Tests grün und Build prüfen**

Run: `cd frontend && npm test && npm run build`
Expected: PASS – 4 Tests grün, Build ohne TypeScript-Fehler.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/standort/
git commit -m "feat: Frontend-Testinfrastruktur, Schwellenwerte und Haversine (P1 Task 3)"
```

---

### Task 4: Frontend – Ankunfts-Zustandsmaschine und Zielermittlung

**Files:**
- Create: `frontend/src/standort/typen.ts`
- Create: `frontend/src/standort/ankunft.ts`
- Test: `frontend/src/standort/ankunft.test.ts`

**Interfaces:**
- Consumes: `haversineM` (Task 3), Konstanten aus `schwellen.ts` (Task 3), `RouteErgebnis` aus `src/api/typen.ts`.
- Produces:
  - `Standort`, `StandortStatus`, `AnkunftZustand` (in `typen.ts`)
  - `ANKUNFT_START: AnkunftZustand`
  - `pruefeAnkunft(zustand, standort, ziel, jetztMs): { zustand: AnkunftZustand; vorschlagen: boolean }`
  - `zielKoordinate(route: RouteErgebnis): { lat: number; lon: number } | null`

- [ ] **Step 1: Typen anlegen**

Create `frontend/src/standort/typen.ts`:

```ts
export type StandortStatus =
  | 'unbekannt'
  | 'frage-laeuft'
  | 'erteilt'
  | 'verweigert'
  | 'nicht-verfuegbar'
  | 'fehler';

export interface Standort {
  lat: number;
  lon: number;
  genauigkeitM: number;
  /** ms seit Epoch – jede Live-Anzeige traegt einen Zeitstempel (Konzept 3). */
  zeitstempel: number;
}

export interface AnkunftZustand {
  /** Zeitpunkt des Eintritts in den Zielradius, null = ausserhalb. */
  seit: number | null;
  /** Der Nutzer hat die Ankunft bestaetigt – kein weiterer Vorschlag. */
  bestaetigt: boolean;
}
```

- [ ] **Step 2: Failing Tests schreiben**

Create `frontend/src/standort/ankunft.test.ts`. Die Koordinaten sind so gewählt, dass 0,0002° ≈ 22 m (innerhalb 40 m) und 0,0005° ≈ 56 m (außerhalb) liegen:

```ts
import { describe, it, expect } from 'vitest';
import { ANKUNFT_START, pruefeAnkunft, zielKoordinate } from './ankunft';
import type { Standort } from './typen';
import type { RouteErgebnis } from '../api/typen';

const ZIEL = { lat: 52.525, lon: 13.369 };

function standort(lat: number, genauigkeitM = 15): Standort {
  return { lat, lon: 13.369, genauigkeitM, zeitstempel: 0 };
}

describe('pruefeAnkunft', () => {
  it('startet den Zaehler beim Eintritt in den Radius, schlaegt aber noch nichts vor', () => {
    const { zustand, vorschlagen } = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000);
    expect(zustand.seit).toBe(1000);
    expect(vorschlagen).toBe(false);
  });

  it('schlaegt nach Ablauf der Verweildauer vor', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const { vorschlagen } = pruefeAnkunft(start, standort(52.5252), ZIEL, 16_000);
    expect(vorschlagen).toBe(true);
  });

  it('schlaegt kurz vor Ablauf noch nicht vor', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const { vorschlagen } = pruefeAnkunft(start, standort(52.5252), ZIEL, 15_999);
    expect(vorschlagen).toBe(false);
  });

  it('setzt den Zaehler beim Verlassen des Radius zurueck', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const raus = pruefeAnkunft(start, standort(52.5255), ZIEL, 5000).zustand;
    expect(raus.seit).toBeNull();
  });

  it('pausiert bei schlechtem Fix, ohne den Zaehler zurueckzusetzen', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const ergebnis = pruefeAnkunft(start, standort(52.5252, 150), ZIEL, 20_000);
    expect(ergebnis.zustand.seit).toBe(1000);
    expect(ergebnis.vorschlagen).toBe(false);
  });

  it('schlaegt nach Bestaetigung nie wieder vor', () => {
    const bestaetigt = { seit: 1000, bestaetigt: true };
    const { vorschlagen } = pruefeAnkunft(bestaetigt, standort(52.5252), ZIEL, 60_000);
    expect(vorschlagen).toBe(false);
  });
});

describe('zielKoordinate', () => {
  const karte = {
    '0': {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [13.369, 52.525] },
          properties: { rolle: 'ziel' },
        },
      ],
    },
  };

  it('liest den Zielmarker aus dem GeoJSON (lon/lat-Reihenfolge)', () => {
    const route = { stufe: 1, schritte: [], gehzeitSek: 0, hinweise: [], karte } as RouteErgebnis;
    expect(zielKoordinate(route)).toEqual({ lat: 52.525, lon: 13.369 });
  });

  it('liefert null bei Stufe 3 – die Synthesekoordinaten sind konstruiert', () => {
    const route = { stufe: 3, schritte: [], gehzeitSek: 0, hinweise: [], karte } as RouteErgebnis;
    expect(zielKoordinate(route)).toBeNull();
  });

  it('liefert null ohne Karte', () => {
    const route = { stufe: 1, schritte: [], gehzeitSek: 0, hinweise: [] } as RouteErgebnis;
    expect(zielKoordinate(route)).toBeNull();
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/standort/ankunft.test.ts`
Expected: FAIL – `Failed to resolve import "./ankunft"`.

- [ ] **Step 4: Implementieren**

Create `frontend/src/standort/ankunft.ts`:

```ts
import type { RouteErgebnis } from '../api/typen';
import { haversineM } from './distanz';
import { ANKUNFT_RADIUS_M, ANKUNFT_VERWEIL_MS, GENAUIGKEIT_MAX_M } from './schwellen';
import type { AnkunftZustand, Standort } from './typen';

export const ANKUNFT_START: AnkunftZustand = { seit: null, bestaetigt: false };

/**
 * Reine Zustandsmaschine: Die Zeit kommt als Parameter herein, damit die
 * Verweildauer ohne Fake-Timer pruefbar ist.
 *
 * Die Pruefung vergleicht HORIZONTALE Distanz. Wer in der Unterfuehrung unter
 * dem Zielbahnsteig hindurchgeht, ist horizontal nah und eine Etage zu tief –
 * deshalb die Verweildauer und die Bestaetigung durch den Nutzer.
 */
export function pruefeAnkunft(
  zustand: AnkunftZustand,
  standort: Standort,
  ziel: { lat: number; lon: number },
  jetztMs: number,
): { zustand: AnkunftZustand; vorschlagen: boolean } {
  if (zustand.bestaetigt) return { zustand, vorschlagen: false };

  // Unbrauchbarer Fix darf den Zaehler weder starten noch zuruecksetzen.
  if (standort.genauigkeitM > GENAUIGKEIT_MAX_M) return { zustand, vorschlagen: false };

  const entfernungM = haversineM(standort.lat, standort.lon, ziel.lat, ziel.lon);
  if (entfernungM > ANKUNFT_RADIUS_M) {
    return { zustand: { ...zustand, seit: null }, vorschlagen: false };
  }

  const seit = zustand.seit ?? jetztMs;
  return {
    zustand: { ...zustand, seit },
    vorschlagen: jetztMs - seit >= ANKUNFT_VERWEIL_MS,
  };
}

interface GeoPunkt {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: { rolle?: string };
}

/**
 * Zielmarker aus dem Routen-GeoJSON. Stufe 3 liefert null: Die Koordinaten des
 * Synthesemodells sind konstruiert (backend/src/core/synthmodell.ts), eine
 * Distanzpruefung dagegen waere sinnlos.
 */
export function zielKoordinate(route: RouteErgebnis): { lat: number; lon: number } | null {
  if (route.stufe === 3 || !route.karte) return null;
  for (const sammlung of Object.values(route.karte)) {
    const features = (sammlung as { features?: GeoPunkt[] })?.features ?? [];
    for (const feature of features) {
      if (feature.properties?.rolle !== 'ziel') continue;
      if (feature.geometry?.type !== 'Point') continue;
      const koord = feature.geometry.coordinates;
      if (!Array.isArray(koord) || koord.length < 2) continue;
      const [lon, lat] = koord as number[];
      if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon };
    }
  }
  return null;
}
```

- [ ] **Step 5: Tests grün**

Run: `cd frontend && npm test && npm run build`
Expected: PASS – 9 neue Tests grün, Build sauber.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/standort/
git commit -m "feat: Ankunfts-Zustandsmaschine und Zielermittlung (P1 Task 4)"
```

---

### Task 5: Frontend – Bahnhofserkennung mit Rundung

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/standort/bahnhofErkennung.ts`
- Test: `frontend/src/standort/bahnhofErkennung.test.ts`

**Interfaces:**
- Consumes: `SuchErgebnis` und das Muster von `sucheStationen` aus `src/api/client.ts:3-16`, `KOORD_RUNDUNG` aus `schwellen.ts`, `Standort` aus `typen.ts`.
- Produces:
  - `sucheStationenNahebei(lat: number, lon: number): Promise<SuchErgebnis>` (in `api/client.ts`)
  - `rundeKoordinate(wert: number): number`
  - `erkenneBahnhof(standort: Standort, sucheFn?): Promise<SuchErgebnis>`

- [ ] **Step 1: API-Client erweitern**

In `frontend/src/api/client.ts` direkt hinter `sucheStationen` (Zeile 16) einfügen:

```ts
/** Umkreissuche. Die Koordinaten sind bereits gerundet – siehe standort/bahnhofErkennung.ts. */
export async function sucheStationenNahebei(lat: number, lon: number): Promise<SuchErgebnis> {
  try {
    const res = await fetch(`/api/stations?lat=${lat}&lon=${lon}`);
    if (res.status === 503) return { ok: false, fehler: 'db-zugang-fehlt' };
    if (!res.ok) return { ok: false, fehler: 'netz' };
    return { ok: true, treffer: (await res.json()) as BahnhofTreffer[] };
  } catch {
    return { ok: false, fehler: 'netz' };
  }
}
```

- [ ] **Step 2: Failing Tests schreiben**

Create `frontend/src/standort/bahnhofErkennung.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { erkenneBahnhof, rundeKoordinate } from './bahnhofErkennung';
import type { Standort } from './typen';

function standort(lat: number, lon: number): Standort {
  return { lat, lon, genauigkeitM: 20, zeitstempel: 0 };
}

describe('rundeKoordinate', () => {
  it('rundet auf 3 Nachkommastellen', () => {
    expect(rundeKoordinate(52.5249253)).toBe(52.525);
  });

  it('rundet negative Werte korrekt', () => {
    expect(rundeKoordinate(-0.1276474)).toBe(-0.128);
  });

  it('laesst bereits gerundete Werte unveraendert', () => {
    expect(rundeKoordinate(13.369)).toBe(13.369);
  });
});

describe('erkenneBahnhof', () => {
  it('sendet ausschliesslich gerundete Koordinaten', async () => {
    const suche = vi.fn(async () => ({ ok: true as const, treffer: [] }));
    await erkenneBahnhof(standort(52.5249253, 13.3696291), suche);
    expect(suche).toHaveBeenCalledWith(52.525, 13.37);
  });

  it('reicht Treffer durch', async () => {
    const treffer = [{ name: 'Berlin Hbf', eva: '8011160', lat: 52.525, lon: 13.369 }];
    const suche = vi.fn(async () => ({ ok: true as const, treffer }));
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369), suche);
    expect(ergebnis).toEqual({ ok: true, treffer });
  });

  it('meldet 503 als Degradation, statt zu werfen', async () => {
    const suche = vi.fn(async () => ({ ok: false as const, fehler: 'db-zugang-fehlt' as const }));
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369), suche);
    expect(ergebnis).toEqual({ ok: false, fehler: 'db-zugang-fehlt' });
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/standort/bahnhofErkennung.test.ts`
Expected: FAIL – `Failed to resolve import "./bahnhofErkennung"`.

- [ ] **Step 4: Implementieren**

Create `frontend/src/standort/bahnhofErkennung.ts`:

```ts
import { sucheStationenNahebei, type SuchErgebnis } from '../api/client';
import { KOORD_RUNDUNG } from './schwellen';
import type { Standort } from './typen';

/**
 * Rundet auf KOORD_RUNDUNG Nachkommastellen (~110 m). Das geschieht bewusst
 * HIER im Browser und nicht serverseitig: Rohkoordinaten sollen das Geraet
 * nie verlassen. Die Genauigkeit reicht zur Bahnhofszuordnung, taugt aber
 * nicht zum Bewegungsprofil.
 */
export function rundeKoordinate(wert: number): number {
  const faktor = 10 ** KOORD_RUNDUNG;
  return Math.round(wert * faktor) / faktor;
}

export async function erkenneBahnhof(
  standort: Standort,
  sucheFn: (lat: number, lon: number) => Promise<SuchErgebnis> = sucheStationenNahebei,
): Promise<SuchErgebnis> {
  return sucheFn(rundeKoordinate(standort.lat), rundeKoordinate(standort.lon));
}
```

- [ ] **Step 5: Tests grün**

Run: `cd frontend && npm test && npm run build`
Expected: PASS – 6 neue Tests grün.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/standort/
git commit -m "feat: Bahnhofserkennung mit Koordinatenrundung im Browser (P1 Task 5)"
```

---

### Task 6: Frontend – `useStandort`-Hook

Die einzige Datei mit Browser-API-Zugriff. Sie enthält bewusst **keine** Entscheidungslogik und wird deshalb nicht unit-getestet – geprüft wird sie in der Mobilabnahme (Task 12).

**Files:**
- Create: `frontend/src/standort/useStandort.ts`

**Interfaces:**
- Consumes: `Standort`, `StandortStatus` aus `typen.ts`.
- Produces: `useStandort(): { status: StandortStatus; standort: Standort | null; starteVerfolgung: () => void; stoppeVerfolgung: () => void }`

- [ ] **Step 1: Implementieren**

Create `frontend/src/standort/useStandort.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Standort, StandortStatus } from './typen';

const OPTIONEN: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

function zuStandort(pos: GeolocationPosition): Standort {
  return {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    genauigkeitM: pos.coords.accuracy,
    zeitstempel: pos.timestamp,
  };
}

/**
 * Kapselt die Browser-Geolocation-API. Die Freigabe wird beim Mounten
 * angefragt; ist sie bereits erteilt, sieht ein Wiederkehrer dank der
 * Permissions-API keinen Dialog mehr.
 *
 * Bewusst ohne Entscheidungslogik – die liegt in ankunft.ts und
 * bahnhofErkennung.ts und ist dort ohne Browser-Mocks testbar.
 */
export function useStandort(): {
  status: StandortStatus;
  standort: Standort | null;
  starteVerfolgung: () => void;
  stoppeVerfolgung: () => void;
} {
  const [status, setStatus] = useState<StandortStatus>('unbekannt');
  const [standort, setStandort] = useState<Standort | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    // Fehlt die API, laeuft die Seite ueber http:// ausserhalb von localhost.
    if (!('geolocation' in navigator)) {
      setStatus('nicht-verfuegbar');
      return;
    }

    let abgebrochen = false;

    const frageAb = (): void => {
      setStatus('frage-laeuft');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (abgebrochen) return;
          setStandort(zuStandort(pos));
          setStatus('erteilt');
        },
        (fehler) => {
          if (abgebrochen) return;
          setStatus(fehler.code === fehler.PERMISSION_DENIED ? 'verweigert' : 'fehler');
        },
        OPTIONEN,
      );
    };

    // Permissions-API zuerst: erteilte Freigabe → kein erneuter Dialog.
    // Fehlt sie (aeltere Safari-Versionen), direkt abfragen.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((ergebnis) => {
          if (abgebrochen) return;
          if (ergebnis.state === 'denied') setStatus('verweigert');
          else frageAb();
        })
        .catch(() => {
          if (!abgebrochen) frageAb();
        });
    } else {
      frageAb();
    }

    return () => {
      abgebrochen = true;
    };
  }, []);

  const stoppeVerfolgung = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const starteVerfolgung = useCallback(() => {
    if (!('geolocation' in navigator) || watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStandort(zuStandort(pos));
        setStatus('erteilt');
      },
      (fehler) => {
        // Letzte bekannte Position bleibt stehen (Degradationstabelle).
        setStatus(fehler.code === fehler.PERMISSION_DENIED ? 'verweigert' : 'fehler');
      },
      OPTIONEN,
    );
  }, []);

  // Kein Tracking ueber die Lebensdauer der Komponente hinaus.
  useEffect(() => stoppeVerfolgung, [stoppeVerfolgung]);

  return { status, standort, starteVerfolgung, stoppeVerfolgung };
}
```

- [ ] **Step 2: Typprüfung und Lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: PASS – keine TypeScript-Fehler, keine Lint-Verstöße.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/standort/useStandort.ts
git commit -m "feat: useStandort-Hook kapselt die Geolocation-API (P1 Task 6)"
```

---

### Task 7: Frontend – Bahnhof in der Eingabe vorbelegen

**Files:**
- Modify: `frontend/src/components/Eingabe.tsx:25-29,46-58,108-121`
- Modify: `frontend/src/App.tsx:44-59,131-141`

**Interfaces:**
- Consumes: `useStandort` (Task 6), `erkenneBahnhof` (Task 5), `BahnhofTreffer` aus `src/api/typen.ts`.
- Produces: `EingabeProps` erhält das zusätzliche optionale Feld `erkannt?: BahnhofTreffer[]`.

- [ ] **Step 1: Eingabe um die Vorbelegung erweitern**

In `frontend/src/components/Eingabe.tsx` das Interface `EingabeProps` (Zeile 25) ersetzen:

```tsx
interface EingabeProps {
  laden: boolean
  fehler: string | null
  /** Per Standort erkannte Bahnhoefe; leer, solange nichts erkannt wurde. */
  erkannt?: BahnhofTreffer[]
  onBerechnen: (werte: EingabeWerte) => void
}
```

Die Signatur in Zeile 46 anpassen:

```tsx
export function Eingabe({ laden, fehler, erkannt, onBerechnen }: EingabeProps) {
```

Direkt hinter der Deklaration von `suchTimer` (Zeile 59) einfügen:

```tsx
  const [erkennungVerworfen, setErkennungVerworfen] = useState(false)

  // Vorbelegt wird NUR ein leeres Feld: Die Erkennung trifft verzoegert ein
  // und darf eine bereits getippte Eingabe nicht ueberschreiben.
  useEffect(() => {
    if (erkennungVerworfen || gewaehlt || suchtext !== '') return
    if (!erkannt || erkannt.length !== 1) return
    setGewaehlt(erkannt[0])
    setSuchtext(erkannt[0].name)
  }, [erkannt, erkennungVerworfen, gewaehlt, suchtext])
```

- [ ] **Step 2: Auswahlliste bei mehreren Treffern anzeigen**

In `frontend/src/components/Eingabe.tsx` direkt vor der Zeile `{gewaehlt && <span className="gewaehlt">…` (Zeile 140) einfügen:

```tsx
        {!gewaehlt && !erkennungVerworfen && erkannt && erkannt.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <div className="hinweis-box">Bahnhöfe in deiner Nähe:</div>
            <ul className="vorschlaege">
              {erkannt.map((treffer) => (
                <li key={treffer.eva}>
                  <button
                    type="button"
                    onClick={() => {
                      setGewaehlt(treffer)
                      setSuchtext(treffer.name)
                    }}
                  >
                    {treffer.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
```

Und die Markierung in Zeile 140 ersetzen, damit erkennbar bleibt, woher der Bahnhof kommt:

```tsx
        {gewaehlt && (
          <span className="gewaehlt">
            ✓ {gewaehlt.name}
            {erkannt?.some((t) => t.eva === gewaehlt.eva) && ' · automatisch erkannt'}
          </span>
        )}
```

Damit ein Tippen die Erkennung dauerhaft verdrängt, im `onChange` des Bahnhofsfelds (Zeile 117) ergänzen:

```tsx
          onChange={(e) => {
            setSuchtext(e.target.value)
            setGewaehlt(null)
            setErkennungVerworfen(true)
          }}
```

- [ ] **Step 3: App verdrahten**

In `frontend/src/App.tsx` die Importe ergänzen:

```tsx
import { erkenneBahnhof } from './standort/bahnhofErkennung'
import { useStandort } from './standort/useStandort'
import type { BahnhofTreffer } from './api/typen'
```

Im Komponentenrumpf hinter `const [, setTick] = useState(0)` (Zeile 52) einfügen:

```tsx
  const { status: standortStatus, standort, starteVerfolgung, stoppeVerfolgung } = useStandort()
  const [erkannt, setErkannt] = useState<BahnhofTreffer[]>([])
  const erkennungLief = useRef(false)

  // Genau einmal je Sitzung erkennen – danach bestimmt der Nutzer.
  useEffect(() => {
    if (!standort || erkennungLief.current) return
    erkennungLief.current = true
    void erkenneBahnhof(standort).then((ergebnis) => {
      if (ergebnis.ok) setErkannt(ergebnis.treffer.slice(0, 6))
    })
  }, [standort])
```

`useRef` in den React-Import in Zeile 1 aufnehmen:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
```

Die Eingabe in Zeile 139 um die Prop erweitern:

```tsx
      <Eingabe laden={laden} fehler={fehler} erkannt={erkannt} onBerechnen={berechne} />
```

Und unter der Kopfzeile einen Hinweis ergänzen, falls die Freigabe fehlt – direkt vor `<hr className="trennlinie" />` in Zeile 138:

```tsx
      {standortStatus === 'verweigert' && (
        <div className="hinweis-box">
          Ohne Standortfreigabe suchst du den Bahnhof von Hand. Du kannst sie in den
          Browsereinstellungen für diese Seite wieder erlauben.
        </div>
      )}
      {standortStatus === 'nicht-verfuegbar' && (
        <div className="hinweis-box">
          Die Standortbestimmung braucht eine sichere Verbindung (HTTPS).
        </div>
      )}
```

- [ ] **Step 4: Verfolgung an die Routenansicht koppeln**

In `frontend/src/App.tsx` hinter dem Countdown-Effekt (Zeile 59) einfügen:

```tsx
  // Verfolgung laeuft ausschliesslich in der Routenansicht.
  useEffect(() => {
    if (ansicht !== 'route') return
    starteVerfolgung()
    return stoppeVerfolgung
  }, [ansicht, starteVerfolgung, stoppeVerfolgung])
```

- [ ] **Step 5: Build und Lint**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: PASS – Build sauber, bestehende Tests weiterhin grün.

- [ ] **Step 6: Manuell gegen das Fixture prüfen**

```bash
cd backend && FIXTURE_EVA=berlin npm run dev    # Terminal 1
cd frontend && npm run dev                       # Terminal 2
```

Auf `http://localhost:5173` (localhost gilt als sicherer Kontext) erscheint der Berechtigungsdialog. Nach Erlauben muss „Berlin Hbf (Fixture) · automatisch erkannt" vorbelegt sein. Nach Ablehnen erscheint der Hinweis und die manuelle Suche funktioniert unverändert.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Eingabe.tsx
git commit -m "feat: erkannten Bahnhof in der Eingabe vorbelegen (P1 Task 7)"
```

---

### Task 8: Karte – Positionspunkt und Genauigkeitskreis

**Files:**
- Modify: `frontend/src/standort/distanz.ts`
- Modify: `frontend/src/standort/distanz.test.ts`
- Modify: `frontend/src/components/Karte.tsx:16-19,59-132,146-163`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `haversineM` (Task 3), `Standort` (Task 4), `GENAUIGKEIT_MAX_M` (Task 3).
- Produces: `genauigkeitsPolygon(lat: number, lon: number, radiusM: number): number[][]` – geschlossener Ring aus `[lon, lat]`-Paaren. `KarteProps` erhält `standort?: Standort | null`.

- [ ] **Step 1: Failing Test für das Polygon**

An `frontend/src/standort/distanz.test.ts` anhängen:

```ts
import { genauigkeitsPolygon, haversineM } from './distanz';

describe('genauigkeitsPolygon', () => {
  it('ist ein geschlossener Ring', () => {
    const ring = genauigkeitsPolygon(52.525, 13.369, 50);
    expect(ring.length).toBe(33);
    expect(ring[0]).toEqual(ring[32]);
  });

  it('jeder Stuetzpunkt liegt rund radiusM vom Mittelpunkt entfernt', () => {
    const ring = genauigkeitsPolygon(52.525, 13.369, 50);
    for (const [lon, lat] of ring) {
      expect(haversineM(52.525, 13.369, lat, lon)).toBeCloseTo(50, 0);
    }
  });

  it('liefert [lon, lat] in GeoJSON-Reihenfolge', () => {
    const ring = genauigkeitsPolygon(52.525, 13.369, 50);
    expect(ring[0][0]).toBeCloseTo(13.369, 2);
    expect(ring[0][1]).toBeGreaterThan(52.525);
  });
});
```

Die vorhandene Importzeile `import { haversineM } from './distanz';` am Dateikopf durch die neue oben ersetzen, damit kein Doppelimport entsteht.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/standort/distanz.test.ts`
Expected: FAIL – `genauigkeitsPolygon is not a function`.

- [ ] **Step 3: Polygon implementieren**

An `frontend/src/standort/distanz.ts` anhängen:

```ts
const RING_STUETZPUNKTE = 32;

/**
 * Geschlossener Ring aus [lon, lat]-Paaren um einen Mittelpunkt.
 *
 * Bewusst ein berechnetes Polygon statt MapLibres circle-radius: Nur so
 * entspricht der Radius echten Metern und bleibt beim Zoomen korrekt.
 */
export function genauigkeitsPolygon(lat: number, lon: number, radiusM: number): number[][] {
  const gradProMeterLat = 1 / 111_320;
  const gradProMeterLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: number[][] = [];
  for (let i = 0; i <= RING_STUETZPUNKTE; i++) {
    const winkel = (2 * Math.PI * i) / RING_STUETZPUNKTE;
    ring.push([
      lon + radiusM * gradProMeterLon * Math.sin(winkel),
      lat + radiusM * gradProMeterLat * Math.cos(winkel),
    ]);
  }
  return ring;
}
```

- [ ] **Step 4: Tests grün**

Run: `cd frontend && npm test`
Expected: PASS – 3 neue Tests grün.

- [ ] **Step 5: Karte erweitern**

In `frontend/src/components/Karte.tsx` die Importe ergänzen:

```tsx
import { genauigkeitsPolygon } from '../standort/distanz'
import { GENAUIGKEIT_MAX_M } from '../standort/schwellen'
import type { Standort } from '../standort/typen'
```

`KarteProps` (Zeile 16) erweitern:

```tsx
interface KarteProps {
  /** GeoJSON-FeatureCollections je Ebene (Schlüssel = level), aus /api/route */
  karte: Record<string, unknown>
  /** Aktueller Geraetestandort; null = keiner verfuegbar. */
  standort?: Standort | null
}
```

Signatur in Zeile 47:

```tsx
export function Karte({ karte, standort }: KarteProps) {
```

Hinter `const daten = …` (Zeile 57) einfügen:

```tsx
  // GPS kennt kein Stockwerk – der Punkt wird deshalb KEINER Ebene zugeordnet
  // und ist auf allen Ebenen sichtbar. Zu ungenaue Fixes werden verworfen:
  // ein Punkt 200 m daneben ist in einem 400-m-Bahnhof aktiv schaedlich.
  const brauchbar = standort != null && standort.genauigkeitM <= GENAUIGKEIT_MAX_M
  const positionsDaten = (): FeatureCollection =>
    brauchbar && standort
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [genauigkeitsPolygon(standort.lat, standort.lon, standort.genauigkeitM)],
              },
              properties: {},
            } as unknown as GeoFeature,
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [standort.lon, standort.lat] },
              properties: { rolle: 'standort' },
            },
          ],
        }
      : LEER
```

Im `map.on('load', …)`-Block hinter `addLayer('route-punkte')` (Zeile 107) einfügen:

```tsx
      map.addSource('position', { type: 'geojson', data: positionsDaten() })
      map.addLayer({
        id: 'position-kreis',
        type: 'fill',
        source: 'position',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2f6fd0', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'position-punkt',
        type: 'circle',
        source: 'position',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#2f6fd0',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#f8f4f4',
        },
      })
```

Und einen Effekt hinter dem Ebenen-Effekt (Zeile 132) ergänzen:

```tsx
  useEffect(() => {
    const quelle = mapRef.current?.getSource('position') as GeoJSONSource | undefined
    quelle?.setData(positionsDaten())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur auf Standortwechsel reagieren
  }, [standort])
```

Im geöffneten Kartenrahmen (Zeile 147) über `karte-ebenen` einfügen:

```tsx
          {standort && !brauchbar && (
            <div className="hinweis-box">
              Standort zu ungenau (± {Math.round(standort.genauigkeitM)} m) – Punkt ausgeblendet.
            </div>
          )}
          {brauchbar && (
            <div className="hinweis-box">Blauer Punkt: dein Standort · Ebene unbekannt</div>
          )}
```

- [ ] **Step 6: App durchreichen**

In `frontend/src/App.tsx` Zeile 108 ersetzen:

```tsx
            <Karte karte={route.karte} standort={standort} />
```

- [ ] **Step 7: Build, Lint, Tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/standort/distanz.ts frontend/src/standort/distanz.test.ts frontend/src/components/Karte.tsx frontend/src/App.tsx
git commit -m "feat: Positionspunkt und Genauigkeitskreis auf der Karte (P1 Task 8)"
```

---

### Task 9: Ankunftsvorschlag und „Angekommen"-Screen

**Files:**
- Create: `frontend/src/components/StandortStreifen.tsx`
- Create: `frontend/src/components/Angekommen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `pruefeAnkunft`, `zielKoordinate`, `ANKUNFT_START` (Task 4), `Standort` (Task 4).
- Produces: `StandortStreifen({ gleis, onBestaetigen })`, `Angekommen({ gleis, onNeu })`.

- [ ] **Step 1: Bestätigungsstreifen anlegen**

Create `frontend/src/components/StandortStreifen.tsx`:

```tsx
interface StandortStreifenProps {
  gleis: string
  onBestaetigen: () => void
}

// Die Ankunft wird VORGESCHLAGEN, nie erzwungen: Die Erkennung vergleicht
// horizontale Distanz und kann in der Unterfuehrung unter dem Zielbahnsteig
// anschlagen. Deshalb bleibt die Schrittliste stehen, bis der Nutzer tippt.
export function StandortStreifen({ gleis, onBestaetigen }: StandortStreifenProps) {
  return (
    <div className="hinweis-box" role="status">
      <p style={{ margin: '0 0 8px' }}>Bist du an Gleis {gleis} angekommen?</p>
      <button type="button" className="knopf-sekundaer" onClick={onBestaetigen}>
        Ja, ich bin da
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Zielscreen anlegen**

Create `frontend/src/components/Angekommen.tsx`:

```tsx
interface AngekommenProps {
  gleis: string
  onNeu: () => void
}

export function Angekommen({ gleis, onNeu }: AngekommenProps) {
  return (
    <main className="app">
      <header className="kopf">
        <div className="kicker">Umstieg.</div>
        <h1>Angekommen</h1>
        <p>Du bist an Gleis {gleis}. Gute Weiterfahrt.</p>
      </header>
      <hr className="trennlinie" />
      <button type="button" className="knopf-primaer" onClick={onNeu}>
        <span>Neue Eingabe</span>
      </button>
    </main>
  )
}
```

- [ ] **Step 3: Ankunftsprüfung in App verdrahten**

In `frontend/src/App.tsx` die Importe ergänzen:

```tsx
import { Angekommen } from './components/Angekommen'
import { StandortStreifen } from './components/StandortStreifen'
import { ANKUNFT_START, pruefeAnkunft, zielKoordinate } from './standort/ankunft'
```

Die Ansichts-Variable in Zeile 45 erweitern:

```tsx
  const [ansicht, setAnsicht] = useState<'eingabe' | 'route' | 'angekommen'>('eingabe')
```

Hinter dem Verfolgungs-Effekt einfügen:

```tsx
  const ankunft = useRef(ANKUNFT_START)
  const [ankunftVorschlag, setAnkunftVorschlag] = useState(false)

  useEffect(() => {
    if (ansicht !== 'route' || !standort || !route) return
    const ziel = zielKoordinate(route)
    // Stufe 3 und fehlender Zielmarker liefern null – dann bleibt nur der
    // manuelle Knopf, eine Pruefung gegen konstruierte Koordinaten waere sinnlos.
    if (!ziel) return
    const ergebnis = pruefeAnkunft(ankunft.current, standort, ziel, Date.now())
    ankunft.current = ergebnis.zustand
    setAnkunftVorschlag(ergebnis.vorschlagen)
  }, [ansicht, standort, route])
```

- [ ] **Step 4: Screen und Streifen einhängen**

In `frontend/src/App.tsx` vor dem Block `if (ansicht === 'route' …)` (Zeile 86) einfügen:

```tsx
  function bestaetigeAnkunft() {
    ankunft.current = { ...ankunft.current, bestaetigt: true }
    setAnkunftVorschlag(false)
    stoppeVerfolgung()
    setAnsicht('angekommen')
  }

  if (ansicht === 'angekommen' && werte) {
    return (
      <Angekommen
        gleis={werte.gleisAb}
        onNeu={() => {
          ankunft.current = ANKUNFT_START
          setAnsicht('eingabe')
        }}
      />
    )
  }
```

In der Routenansicht direkt hinter `<Schrittliste … />` (Zeile 104) einfügen:

```tsx
        {ankunftVorschlag && (
          <StandortStreifen gleis={werte.gleisAb} onBestaetigen={bestaetigeAnkunft} />
        )}
        {!zielKoordinate(route) && (
          <button type="button" className="knopf-sekundaer" onClick={bestaetigeAnkunft}>
            Ich bin da
          </button>
        )}
```

- [ ] **Step 5: Build, Lint, Tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StandortStreifen.tsx frontend/src/components/Angekommen.tsx frontend/src/App.tsx
git commit -m "feat: Ankunftsvorschlag mit Bestaetigung und Angekommen-Screen (P1 Task 9)"
```

---

### Task 10: Zustand „Zug ist abgefahren"

Schließt Lücke 18 der Analyse: Nach der Abfahrtszeit blieb die Ampel dauerhaft rot.

**Files:**
- Modify: `frontend/src/App.tsx:86-93`

**Interfaces:**
- Consumes: `ABGEFAHREN_KULANZ_MS` aus `schwellen.ts` (Task 3), vorhandene Hilfsfunktion `heuteUm` in `App.tsx:27`.

- [ ] **Step 1: Import ergänzen**

```tsx
import { ABGEFAHREN_KULANZ_MS } from './standort/schwellen'
```

- [ ] **Step 2: Zustand berechnen und anzeigen**

In `frontend/src/App.tsx` im Block `if (ansicht === 'route' && route && werte)` die Berechnung von `restSek` (Zeile 87) so erweitern:

```tsx
    const restSek = werte.abfahrtZeit
      ? (heuteUm(werte.abfahrtZeit).getTime() - Date.now()) / 1000
      : undefined
    const abgefahren = restSek !== undefined && restSek * 1000 < -ABGEFAHREN_KULANZ_MS
    const farbe = restSek === undefined || abgefahren ? null : ampelFarbe(restSek, route.gehzeitSek)
```

Und direkt hinter `<Ampel … />` (Zeile 93) einfügen:

```tsx
        {abgefahren && (
          <div className="hinweis-box" role="status">
            Der Zug ist abgefahren. Eine Alternativsuche gehört nicht zum Funktionsumfang – such
            den nächsten Anschluss bitte im Fahrplan.
          </div>
        )}
```

- [ ] **Step 3: Build, Lint, Tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: eigener Zustand nach der Abfahrtszeit statt dauerhaft roter Ampel (P1 Task 10)"
```

---

### Task 11: HTTPS für Entwicklung und Betrieb

Ohne HTTPS liefert `navigator.geolocation` außerhalb von `localhost` nichts – auf einem echten Mobilgerät ist das Feature sonst nicht prüfbar.

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/package.json`
- Create: `Caddyfile`

**Interfaces:**
- Consumes: nichts aus vorherigen Tasks.
- Produces: `Caddyfile` als fertiges Artefakt für Task 17 des MVP-Plans (Docker). Der Compose-Dienst wird **dort** verdrahtet – `Dockerfile` und `docker-compose.yml` existieren noch nicht, und dieser Plan legt sie nicht an.

- [ ] **Step 1: mkcert-Zertifikat erzeugen**

```bash
cd frontend
mkcert -install
mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem localhost 192.168.1.50
```

Die zweite Adresse durch die eigene LAN-IP ersetzen (`ipconfig` unter Windows) – nur so ist das Handy im selben Netz erreichbar. Ist `mkcert` nicht installiert: `winget install FiloSottile.mkcert`.

- [ ] **Step 2: Zertifikate aus Git heraushalten**

An `frontend/.gitignore` anhängen:

```
.cert/
```

- [ ] **Step 3: Vite auf HTTPS umstellen**

`frontend/vite.config.ts` ersetzen:

```ts
import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Geolocation braucht einen sicheren Kontext. Liegen lokale Zertifikate
// vor (mkcert, siehe README), laeuft der Dev-Server ueber HTTPS – nur so
// ist das Standort-Feature auf einem echten Mobilgeraet testbar.
const zertifikat = existsSync('.cert/key.pem')
  ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    https: zertifikat,
    host: true,
    // Alle API-Aufrufe gehen ans Fastify-Backend – das Frontend spricht nie
    // direkt mit Overpass/DB-APIs (Fairness- und Schlüsselschutz-Prinzip).
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

`host: true` bindet an alle Schnittstellen, damit das Handy den Server erreicht.

- [ ] **Step 4: Caddyfile anlegen**

Create `Caddyfile` im Projektwurzelverzeichnis:

```
# TLS-Terminierung vor dem Fastify-Container. Zertifikate holt und erneuert
# Caddy selbsttaetig ueber Let's Encrypt.
#
# Eingebunden wird dieser Dienst in Task 17 des MVP-Plans, wenn Dockerfile
# und docker-compose.yml entstehen. Domain vor dem ersten Start ersetzen.
umstieg.example.org {
	encode zstd gzip
	reverse_proxy app:3001

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		X-Frame-Options "DENY"
		-Server
	}
}
```

- [ ] **Step 5: Auf dem Mobilgerät prüfen**

```bash
cd backend && FIXTURE_EVA=berlin npm run dev
cd frontend && npm run dev
```

Am Handy im selben WLAN `https://<LAN-IP>:5173` öffnen. Erwartet: Seite lädt über HTTPS, der Standortdialog erscheint. Warnt der Browser vor dem Zertifikat, ist das mkcert-Wurzelzertifikat auf dem Handy nicht installiert – für den Test einmalig bestätigen.

- [ ] **Step 6: Commit**

```bash
git add frontend/vite.config.ts frontend/.gitignore Caddyfile
git commit -m "feat: HTTPS fuer Entwicklung (mkcert) und Betrieb (Caddyfile) (P1 Task 11)"
```

---

### Task 12: Mobilabnahme und Dokumentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: alle vorherigen Tasks.

- [ ] **Step 1: Abnahme auf einem echten Mobilgerät**

Weder Genauigkeit noch Berechtigungsdialog sind im Desktop-Emulator realistisch. Alle fünf Punkte einzeln durchgehen und das Ergebnis notieren:

1. Erster Aufruf → Dialog erscheint. Ablehnen → Hinweis erscheint, manuelle Eingabe funktioniert.
2. Neu laden mit erteilter Freigabe → **kein** Dialog mehr (Permissions-API greift).
3. An einem Bahnhof: Vorbelegung stimmt, Punkt und Genauigkeitskreis liegen plausibel.
4. In einer Unterführung: Bei schlechtem Fix verschwindet der Punkt, der Hinweis „Standort zu ungenau" erscheint, **kein** Ankunftsvorschlag.
5. Am Zielgleis: Vorschlag nach etwa 15 s, Bestätigung führt zum „Angekommen"-Screen.

- [ ] **Step 2: README aktualisieren**

In `README.md` die Projektstandstabelle um eine Zeile ergänzen und den Abschnitt „Entwicklung starten" erweitern:

```markdown
| P1 – Standort: Bahnhofserkennung, Positionspunkt, Ankunftserkennung | ✅ fertig |
```

```markdown
**HTTPS in der Entwicklung:** Das Standort-Feature braucht einen sicheren Kontext.
`mkcert -key-file frontend/.cert/key.pem -cert-file frontend/.cert/cert.pem localhost <LAN-IP>`
erzeugt die Zertifikate; Vite schaltet dann automatisch auf HTTPS um. Ohne
Zertifikate läuft der Dev-Server wie bisher über HTTP – die Standortfunktionen
sind dann nur auf `localhost` verfügbar.
```

Im Abschnitt „API" die Beschreibung von `/api/stations` ersetzen:

```markdown
- `GET /api/stations?q=<Suchtext>` **oder** `?lat=&lon=` → `BahnhofTreffer[]`. Die Koordinatenvariante sucht im Umkreis von 1000 m; die Werte sind bereits im Browser auf 3 Nachkommastellen (~110 m) gerundet. `q` und `lat`/`lon` schließen sich aus (**400** `parameter-ungueltig`). Ohne DB-Zugang: **503** `db-zugang-fehlt`.
```

- [ ] **Step 3: Vollständige Suite**

Run: `cd backend && npm test && npm run lint`
Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS – alles grün.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: Standort-Feature im README dokumentiert (P1 Task 12)"
```

---

## Selbstprüfung (durchgeführt)

**Spec-Abdeckung:** Spec 4 (Datenfluss/Rundung) → Task 5 · Spec 5.1–5.2 (Typen, Schwellen) → Tasks 3, 4 · Spec 5.3 (Hook) → Task 6 · Spec 5.4 (Zustandsmaschine) → Task 4 · Spec 5.5 (Karte) → Task 8 · Spec 5.6 (Komponenten) → Tasks 7, 9 · Spec 5.7 (Endzustände) → Tasks 9, 10 · Spec 6 (Backend) → Tasks 1, 2 · Spec 7 (HTTPS) → Task 11 · Spec 8 (Degradation) → Tasks 7 (verweigert, nicht verfügbar), 8 (Genauigkeit), 9 (Stufe 3), 2 (503) · Spec 9 (Tests) → Tasks 1–5, 8 · Spec 10 (Abnahme) → Task 12.

**Typkonsistenz:** `Standort`, `StandortStatus`, `AnkunftZustand` einmal in Task 4 definiert, überall gleich benannt. `sucheBahnhoefeNahebei` trägt in Client (Task 1), Interface und App (Task 2) denselben Namen und dieselbe Signatur. `zielKoordinate` liefert durchgehend `{ lat, lon } | null`.

**Bekannte Abgrenzung:** Task 11 legt `Caddyfile` an, verdrahtet aber keinen Compose-Dienst – `Dockerfile` und `docker-compose.yml` entstehen erst in Task 17 des MVP-Plans. Das ist bewusst so und in Task 11 vermerkt.
