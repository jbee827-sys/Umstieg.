import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { dateiname, packeEintrag } from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

const WURZEL = fileURLToPath(new URL('../.test-ablage/osm-verdrahtung/', import.meta.url));
const miniOsm = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)), 'utf8'),
) as OverpassAntwort;
const ministadt: StationsInfo = {
  eva: '8000001', evas: ['8000001'], stationID: '4711', name: 'Ministadt', lat: 52, lon: 12,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};
const ROUTE = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function clients() {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => miniOsm),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

const ordner = (name: string) => join(WURZEL, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(WURZEL, { recursive: true, force: true });
});

describe('buildApp: OSM-Bestand aus den Einstellungen', () => {
  it('fragt ohne Einstellungen Overpass wie bisher', async () => {
    const c = clients();
    await buildApp(c as never).inject({ method: 'GET', url: ROUTE });
    expect(c.overpass).toHaveBeenCalledTimes(1);
  });

  it('liest mit OSM_STARTBESTAND_PFAD aus dem Startbestand', async () => {
    const start = ordner('start');
    mkdirSync(start, { recursive: true });
    writeFileSync(
      join(start, dateiname('8000001')),
      await packeEintrag({
        schluessel: '8000001', name: 'Ministadt', lat: 52, lon: 12,
        geholtAm: new Date().toISOString(), abfrageVersion: ABFRAGE_VERSION, osm: miniOsm,
      }),
    );
    vi.stubEnv('OSM_STARTBESTAND_PFAD', start);
    const c = clients();
    const res = await buildApp(c as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).not.toHaveBeenCalled();
  });

  it('lernt mit OSM_VOLUME_PFAD dazu', async () => {
    const volume = ordner('volume');
    vi.stubEnv('OSM_VOLUME_PFAD', volume);
    await buildApp(clients() as never).inject({ method: 'GET', url: ROUTE });
    expect(existsSync(join(volume, dateiname('8000001')))).toBe(true);
  });

  it('startet und antwortet, wenn das Volume nicht beschreibbar ist', async () => {
    const volume = ordner('volume');
    mkdirSync(join(volume, '..'), { recursive: true });
    writeFileSync(volume, 'eine Datei, kein Ordner');
    vi.stubEnv('OSM_VOLUME_PFAD', volume);
    const c = clients();
    const res = await buildApp(c as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).toHaveBeenCalledTimes(1);
  });
});

describe('buildApp: ein Pausenzustand fuer alle Overpass-Abrufe', () => {
  it('fragt einen abweisenden Server beim naechsten Bahnhof nicht erneut', async () => {
    vi.stubEnv('OVERPASS_URL_PRIMARY', '');
    vi.stubEnv('OVERPASS_URL_FALLBACK', '');
    const gefragt: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const host = new URL(String(url)).host;
        gefragt.push(host);
        if (host === 'overpass-api.de') {
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
          });
        }
        return new Response(JSON.stringify(miniOsm), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const c = clients();
    // Zwei verschiedene Bahnhoefe – sonst traefe die zweite Anfrage den Graph-Cache.
    const ohneOverpass = {
      ...c,
      overpass: undefined,
      stations: {
        ...c.stations,
        holeStationsInfo: vi.fn(async (eva: string) => ({ ...ministadt, eva, evas: [eva] })),
      },
    };
    const app = buildApp(ohneOverpass as never);
    await app.inject({ method: 'GET', url: ROUTE });
    await app.inject({ method: 'GET', url: ROUTE.replace('8000001', '8000002') });
    expect(gefragt.filter((h) => h === 'overpass-api.de')).toHaveLength(1);
    expect(gefragt.filter((h) => h === 'maps.mail.ru')).toHaveLength(2);
  }, 15_000);
});
