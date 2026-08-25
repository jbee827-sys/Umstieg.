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

function macheClients({ overpassWirft = false } = {}) {
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
