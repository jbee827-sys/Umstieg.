import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';
import type { NamensQuelle } from '../src/core/namensaufloesung.js';

const BERNAU = {
  name: 'Bernau (b Berlin)',
  eva: '8013470',
  lat: 52.6797,
  lon: 13.5906,
  namen: ['Bernau (b Berlin)', 'Bernau(S)'],
  mitglieder: ['8013470'],
};

const stations = {
  sucheBahnhoefe: vi.fn(async () => []),
  sucheBahnhoefeNahebei: vi.fn(async () => []),
  holeStationsInfo: vi.fn(),
  ermittleGruppe: vi.fn(async (e: string) => [e]),
};

function quelle(o: { wirft?: unknown; treffer?: unknown[] } = {}): NamensQuelle {
  return {
    sucheMitGruppen: vi.fn(async () => {
      if (o.wirft) throw o.wirft;
      return (o.treffer ?? [BERNAU]) as never;
    }),
    amtlicheNamen: vi.fn(async () => BERNAU.namen),
  };
}

describe('GET /api/bahnhof-zum-namen', () => {
  it('loest "Bernau (S)" in einen Bahnhof-Ort auf', async () => {
    const app = buildApp({ stations, namen: quelle() });
    const res = await app.inject('/api/bahnhof-zum-namen?name=' + encodeURIComponent('Bernau (S)'));
    expect(res.statusCode).toBe(200);
    const { ort } = res.json();
    expect(ort.eva).toBe('8013470');
    expect(ort.verkehrsmittel).toEqual(['bahn']);
  });

  it('unbekannter Name: { ort: null }', async () => {
    const app = buildApp({ stations, namen: quelle({ treffer: [] }) });
    const res = await app.inject('/api/bahnhof-zum-namen?name=Nirgendwo');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ort: null });
  });

  it('ohne name: 400 parameter-fehlt', async () => {
    const app = buildApp({ stations, namen: quelle() });
    const res = await app.inject('/api/bahnhof-zum-namen');
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-fehlt');
  });

  it('101 Zeichen: 400 parameter-ungueltig', async () => {
    const app = buildApp({ stations, namen: quelle() });
    const res = await app.inject('/api/bahnhof-zum-namen?name=' + 'a'.repeat(101));
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('fehlende Zugangsdaten: 503 db-zugang-fehlt', async () => {
    const app = buildApp({ stations, namen: quelle({ wirft: new FehlendeZugangsdatenError() }) });
    const res = await app.inject('/api/bahnhof-zum-namen?name=Bernau');
    expect(res.statusCode).toBe(503);
    expect(res.json().fehler).toBe('db-zugang-fehlt');
  });

  it('anderer Fehler: 502 quelle-ausfall', async () => {
    const app = buildApp({ stations, namen: quelle({ wirft: new Error('kaputt') }) });
    const res = await app.inject('/api/bahnhof-zum-namen?name=Bernau');
    expect(res.statusCode).toBe(502);
    expect(res.json().fehler).toBe('quelle-ausfall');
  });
});
