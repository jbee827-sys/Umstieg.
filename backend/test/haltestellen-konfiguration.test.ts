import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';

afterEach(() => vi.unstubAllEnvs());

describe('Haltestellenpfad ohne Konfiguration (Paket 2.5)', () => {
  it('meldet sauber „nicht eingerichtet“, der Bahnhofspfad laeuft', async () => {
    vi.stubEnv('MOTIS_BASIS_URL', '');
    const app = buildApp();
    const tafel = await app.inject('/api/haltestelle/tafel?id=a&lat=1&lon=2&typ=dep');
    expect(tafel.statusCode).toBe(503);
    expect(tafel.json().fehler).toBe('haltestellen-nicht-eingerichtet');
    const weg = await app.inject('/api/weg?vonLat=1&vonLon=2&nachLat=1&nachLon=2.001&profil=normal&variante=schnellste');
    expect(weg.json().fehler).toBe('haltestellen-nicht-eingerichtet');
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });

  it('mit Konfiguration fragt das Backend die eingestellte Basis-URL', async () => {
    vi.stubEnv('MOTIS_BASIS_URL', 'https://motis.test');
    const fetchSpion = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    const app = buildApp({ stations: { sucheBahnhoefe: async () => [], sucheBahnhoefeNahebei: async () => [], holeStationsInfo: vi.fn(), ermittleGruppe: vi.fn() } } as never);
    await app.inject('/api/orte?q=Kassel');
    expect(String(fetchSpion.mock.calls[0][0])).toMatch(/^https:\/\/motis\.test\/api\/v1\/geocode\?/);
    fetchSpion.mockRestore();
    await app.close();
  });
});
