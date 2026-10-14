import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { dateiname, erzeugeBestand, packeEintrag, type OsmBestand } from '../src/osm/bestand.js';
import { erzeugeOsmQuelle } from '../src/osm/quelle.js';
import type { ErneuerungsAuftrag, OsmErneuerung } from '../src/osm/erneuerung.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { OverpassAntwort, RouteErgebnis, StationsInfo } from '../src/core/typen.js';

const WURZEL = fileURLToPath(new URL('../.test-ablage/api-bestand/', import.meta.url));
const miniOsm = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)), 'utf8'),
) as OverpassAntwort;

const ministadt: StationsInfo = {
  eva: '8000001',
  evas: ['8000001'],
  stationID: '4711',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

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

const ROUTE = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function ordner(name: string): string {
  return join(WURZEL, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function legeStart(dir: string, ueber: { geholtAm?: string; inhalt?: Buffer } = {}): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const roh =
    ueber.inhalt ??
    (await packeEintrag({
      schluessel: '8000001',
      name: 'Ministadt',
      lat: 52,
      lon: 12,
      geholtAm: ueber.geholtAm ?? new Date().toISOString(),
      abfrageVersion: ABFRAGE_VERSION,
      osm: miniOsm,
    }));
  writeFileSync(join(dir, dateiname('8000001')), roh);
}

afterEach(() => rmSync(WURZEL, { recursive: true, force: true }));

describe('/api/route mit OSM-Bestand', () => {
  it('liest einen Bahnhof aus dem Bestand und fragt Overpass nicht', async () => {
    const start = ordner('start');
    await legeStart(start);
    const c = clients();
    const osmQuelle = erzeugeOsmQuelle({
      bestand: erzeugeBestand({ startPfad: start }),
      erneuerung: null,
      overpass: c.overpass,
    });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect((res.json() as RouteErgebnis).stufe).toBe(1);
    expect(c.overpass).not.toHaveBeenCalled();
  });

  it('holt einen fehlenden Bahnhof von Overpass und legt ihn aufs Volume', async () => {
    const volume = ordner('volume');
    const c = clients();
    const osmQuelle = erzeugeOsmQuelle({
      bestand: erzeugeBestand({ volumePfad: volume }),
      erneuerung: null,
      overpass: c.overpass,
    });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).toHaveBeenCalledTimes(1);
    expect(existsSync(join(volume, dateiname('8000001')))).toBe(true);
  });

  it('nimmt Overpass, wenn die Datei im Startbestand kaputt ist', async () => {
    const start = ordner('start');
    await legeStart(start, { inhalt: Buffer.from('abgeschnitten') });
    const c = clients();
    const osmQuelle = erzeugeOsmQuelle({
      bestand: erzeugeBestand({ startPfad: start }),
      erneuerung: null,
      overpass: c.overpass,
    });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).toHaveBeenCalledTimes(1);
  });

  it('antwortet bei veralteten Daten sofort und stoesst die Erneuerung an', async () => {
    const start = ordner('start');
    await legeStart(start, { geholtAm: '2026-01-01T00:00:00.000Z' });
    const c = clients();
    const erneuerung: OsmErneuerung = {
      stosseAn: vi.fn(),
      spaeter: vi.fn(),
      beiErneuert: vi.fn(),
      leerlauf: async () => {},
    };
    const osmQuelle = erzeugeOsmQuelle({ bestand: erzeugeBestand({ startPfad: start }), erneuerung, overpass: c.overpass });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).not.toHaveBeenCalled();
    expect(erneuerung.stosseAn).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8000001' }));
  });

  it('baut nach einer gelungenen Erneuerung neu', async () => {
    const c = clients();
    let melde: ((a: ErneuerungsAuftrag) => void) | undefined;
    const erneuerung: OsmErneuerung = {
      stosseAn: vi.fn(),
      spaeter: vi.fn(),
      beiErneuert: (fn) => {
        melde = fn;
      },
      leerlauf: async () => {},
    };
    const bestand: OsmBestand = {
      hatVolume: true,
      lies: vi.fn(async () => ({
        schluessel: '8000001',
        name: 'Ministadt',
        lat: 52,
        lon: 12,
        geholtAm: new Date().toISOString(),
        abfrageVersion: ABFRAGE_VERSION,
        osm: miniOsm,
        herkunft: 'volume' as const,
      })),
      schreibe: vi.fn(async () => true),
    };
    const app = buildApp({ ...c, osmQuelle: erzeugeOsmQuelle({ bestand, erneuerung, overpass: c.overpass }) } as never);

    await app.inject({ method: 'GET', url: ROUTE });
    await app.inject({ method: 'GET', url: ROUTE });
    expect(bestand.lies).toHaveBeenCalledTimes(1); // zweite Anfrage aus dem Graph-Cache

    melde?.({ schluessel: '8000001', name: 'Ministadt', lat: 52, lon: 12, evas: ['8000001'] });
    await app.inject({ method: 'GET', url: ROUTE });
    expect(bestand.lies).toHaveBeenCalledTimes(2);
  });
});
