import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import type { OverpassAntwort, RouteErgebnis, StationsInfo } from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

const miniOsm = ladeFixture('synthetisch/mini-bahnhof');

const ministadt: StationsInfo = {
  eva: '8000001',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

function macheClients({ overpassWirft = false, abschnitt = null as string | null } = {}) {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => {
      if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
      return miniOsm;
    }),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => [
        { name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 },
      ]),
    },
    tafel: vi.fn(async () => [
      {
        zug: 'ICE 1006',
        zeitSoll: '14:26',
        zeitIst: '14:35',
        gleisSoll: '14',
        gleisIst: '12',
        ziel: 'Hamburg-Altona',
      },
    ]),
    wagenposition: vi.fn(async () => (abschnitt ? { abschnitt } : null)),
  };
}

const ROUTE_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

describe('GET /api/route', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('liefert RouteErgebnis mit Schritten, Gehzeit und Karte (Fixture-Clients)', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.stufe).toBe(1);
    expect(ergebnis.schritte.length).toBeGreaterThan(0);
    expect(ergebnis.schritte[0].text).toMatch(/^Nach Ausstieg/);
    expect(ergebnis.gehzeitSek).toBeGreaterThan(0);
    expect(ergebnis.karte).toBeDefined();
    expect(Array.isArray(ergebnis.hinweise)).toBe(true);
  });

  it('Overpass-Ausfall → Stufe 3 (Synthesemodell) mit Hinweis und ca.-Angaben', async () => {
    const app = buildApp(macheClients({ overpassWirft: true }));
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.stufe).toBe(3);
    expect(ergebnis.hinweise.length).toBeGreaterThan(0);
    expect(ergebnis.schritte.some((s) => s.text.toLowerCase().includes('ca. '))).toBe(true);
  });

  it('zweiter Aufruf trifft den Graph-Cache (Clients nur 1× befragt)', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    await app.inject({ method: 'GET', url: ROUTE_URL });
    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.overpass).toHaveBeenCalledTimes(1);
    expect(clients.stations.holeStationsInfo).toHaveBeenCalledTimes(1);
  });

  it('fehlende Pflichtparameter → 400', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/route?eva=8000001&gleisAn=1' });
    expect(res.statusCode).toBe(400);
  });

  it('unbekanntes Gleis → 404 mit Fehlercode', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({
      method: 'GET',
      url: '/api/route?eva=8000001&gleisAn=1&gleisAb=99',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().fehler).toBe('gleis-unbekannt');
  });
});

describe('GET /api/route – Wagenposition', () => {
  it('nutzt die Wagenposition für den Startabschnitt', async () => {
    const clients = macheClients({ abschnitt: 'anfang' });
    const app = buildApp(clients);
    const res = await app.inject({
      method: 'GET',
      url: `${ROUTE_URL}&zugAn=1006&wagen=26`,
    });
    expect(res.statusCode).toBe(200);
    expect(clients.wagenposition).toHaveBeenCalledTimes(1);
    const [zugnummer, datum, wagen] = clients.wagenposition.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ];
    expect(zugnummer).toBe('1006');
    expect(datum).toMatch(/^\d{8}$/);
    expect(wagen).toBe('26');
  });

  it('keine Wagenreihungsdaten → Bahnsteigmitte mit transparentem Hinweis', async () => {
    const app = buildApp(macheClients({ abschnitt: null }));
    const res = await app.inject({ method: 'GET', url: `${ROUTE_URL}&zugAn=1006&wagen=26` });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('Bahnsteigmitte'))).toBe(true);
  });

  it('ohne wagen-Parameter wird die Wagenreihung nicht abgefragt', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.wagenposition).not.toHaveBeenCalled();
  });
});

describe('GET /api/board/:eva', () => {
  it('liefert die Tafel über den injizierten Client', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=dep' });
    expect(res.statusCode).toBe(200);
    const tafel = res.json() as { zug: string; gleisIst?: string }[];
    expect(tafel[0].zug).toBe('ICE 1006');
    expect(tafel[0].gleisIst).toBe('12');
    expect(clients.tafel).toHaveBeenCalledWith('8000001', 'dep');
  });

  it('ungültiger type → 400', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=xyz' });
    expect(res.statusCode).toBe(400);
  });

  it('ohne DB-Zugangsdaten → 503', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    vi.stubEnv('DB_CLIENT_SECRET', '');
    const app = buildApp(); // echte Clients ohne Schlüssel
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=dep' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'db-zugang-fehlt' });
  });
});

describe('GET /api/stations', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('liefert Treffer über den injizierten Client', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Mini' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 }]);
  });

  it('ohne DB-Zugangsdaten → 503 mit fehler db-zugang-fehlt', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    vi.stubEnv('DB_CLIENT_SECRET', '');
    const app = buildApp(); // echte Clients, aber ohne Schlüssel
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Berlin' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'db-zugang-fehlt' });
  });

  it('fehlendes q → 400', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/stations' });
    expect(res.statusCode).toBe(400);
  });
});
