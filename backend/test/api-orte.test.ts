import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { orteAusTreffern } from '../src/clients/motis-abbildung.js';
import { HaltestellenNichtVerfuegbarError } from '../src/clients/motis-pausen.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';
import type { HaltestellenClient } from '../src/clients/haltestellen.js';

const berlin = orteAusTreffern(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/motis/geocode-berlin-hbf.json', import.meta.url)), 'utf8')),
);
const BERLIN_HBF = { name: 'Berlin Hbf', eva: '8011160', lat: 52.525592, lon: 13.369545 };

function stations(o: { wirft?: unknown } = {}) {
  return {
    sucheBahnhoefe: vi.fn(async () => {
      if (o.wirft) throw o.wirft;
      return [BERLIN_HBF];
    }),
    sucheBahnhoefeNahebei: vi.fn(async () => {
      if (o.wirft) throw o.wirft;
      return [BERLIN_HBF];
    }),
    holeStationsInfo: vi.fn(),
    ermittleGruppe: vi.fn(async (e: string) => [e]),
  };
}

function haltestellen(o: { wirft?: boolean } = {}) {
  const h = {
    sucheOrte: vi.fn(async () => {
      if (o.wirft) throw new HaltestellenNichtVerfuegbarError('Test');
      return berlin;
    }),
    orteNahebei: vi.fn(async () => berlin.slice(0, 2)),
    tafel: vi.fn(),
    tafelFrisch: vi.fn(),
    fussweg: vi.fn(),
    fahrt: vi.fn(),
  };
  return h as typeof h & HaltestellenClient;
}

describe('GET /api/orte', () => {
  it('fuehrt beide Quellen zusammen', async () => {
    const app = buildApp({ stations: stations(), haltestellen: haltestellen() });
    const res = await app.inject('/api/orte?q=Berlin%20Hbf');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.quellen).toEqual({ bahnhoefe: 'ok', haltestellen: 'ok' });
    expect(body.orte[0]).toMatchObject({ eva: '8011160', haltestelleId: expect.any(String) });
  });

  it('nutzt die Schreibvarianten der Bahnhofssuche wie /api/stations', async () => {
    const s = stations();
    s.sucheBahnhoefe.mockResolvedValueOnce([]);
    const app = buildApp({ stations: s, haltestellen: haltestellen() });
    await app.inject('/api/orte?q=S%2BU%20Berlin%20Hbf');
    expect(s.sucheBahnhoefe.mock.calls.length).toBeGreaterThan(1);
  });

  it('MOTIS faellt aus: nur Bahnhoefe, Bahnhofspfad unberuehrt (K5, F6)', async () => {
    const app = buildApp({ stations: stations(), haltestellen: haltestellen({ wirft: true }) });
    const res = await app.inject('/api/orte?q=Berlin');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.quellen.haltestellen).toBe('ausfall');
    expect(body.orte).toEqual([{ ...BERLIN_HBF, verkehrsmittel: ['bahn'] }]);
  });

  it('ohne Einrichtung: nicht-eingerichtet, Bahnhoefe wie bisher', async () => {
    const app = buildApp({ stations: stations(), haltestellen: null });
    const body = (await app.inject('/api/orte?q=Berlin')).json();
    expect(body.quellen.haltestellen).toBe('nicht-eingerichtet');
    expect(body.orte).toHaveLength(1);
  });

  it('DB-Zugang fehlt: Haltestellen kommen trotzdem', async () => {
    const app = buildApp({ stations: stations({ wirft: new FehlendeZugangsdatenError() }), haltestellen: haltestellen() });
    const body = (await app.inject('/api/orte?q=Berlin')).json();
    expect(body.quellen.bahnhoefe).toBe('zugang-fehlt');
    expect(body.orte.length).toBeGreaterThan(0);
  });

  it('DB-Zugang fehlt und nichts eingerichtet: leere Liste mit Begruendung, kein Fehler', async () => {
    const app = buildApp({ stations: stations({ wirft: new FehlendeZugangsdatenError() }), haltestellen: null });
    const res = await app.inject('/api/orte?q=Berlin');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orte: [], quellen: { bahnhoefe: 'zugang-fehlt', haltestellen: 'nicht-eingerichtet' } });
  });

  it('beide Quellen fallen aus: 503 mit dem Stand der Quellen', async () => {
    const app = buildApp({ stations: stations({ wirft: new Error('DB weg') }), haltestellen: haltestellen({ wirft: true }) });
    const res = await app.inject('/api/orte?q=Berlin');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ fehler: 'orte-nicht-verfuegbar', quellen: { bahnhoefe: 'ausfall', haltestellen: 'ausfall' } });
  });

  it('Standortsuche: beide Quellen nach Koordinate', async () => {
    const s = stations();
    const h = haltestellen();
    const app = buildApp({ stations: s, haltestellen: h });
    expect((await app.inject('/api/orte?lat=52.525&lon=13.369')).statusCode).toBe(200);
    expect(h.orteNahebei).toHaveBeenCalledWith(52.525, 13.369);
    expect(s.sucheBahnhoefeNahebei).toHaveBeenCalledWith(52.525, 13.369, 1000);
  });

  it.each(['/api/orte', '/api/orte?q=a&lat=1&lon=2', '/api/orte?lat=91&lon=0', '/api/orte?lat=&lon=1', '/api/orte?q=%20'])(
    '400 bei %s',
    async (url) => {
      const app = buildApp({ stations: stations(), haltestellen: haltestellen() });
      expect((await app.inject(url)).statusCode).toBe(400);
    },
  );
});
