import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { pfadAusPlan } from '../src/clients/motis-weg.js';
import { HaltestellenNichtVerfuegbarError } from '../src/clients/motis-pausen.js';

const KASSEL = pfadAusPlan(JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/motis/plan-kassel-a-b.json', import.meta.url)), 'utf8')));
function app(fussweg: (...a: unknown[]) => Promise<unknown>) {
  const haltestellen = { fussweg: vi.fn(fussweg), tafel: vi.fn(), tafelFrisch: vi.fn(), sucheOrte: vi.fn(), orteNahebei: vi.fn(), fahrt: vi.fn() };
  return { a: buildApp({ haltestellen } as never), haltestellen };
}
const URL_OK = '/api/weg?vonLat=51.31263&vonLon=9.49286&nachLat=51.31214&nachLon=9.4919&profil=normal&variante=schnellste&ziel=Steig%20B';

describe('GET /api/weg', () => {
  it('Normalfall: Form wie /api/route plus Herkunft', async () => {
    const { a, haltestellen } = app(async () => KASSEL);
    const res = await a.inject(URL_OK);
    expect(res.statusCode).toBe(200);
    const w = res.json();
    expect(w).toMatchObject({ stufe: 1, herkunft: 'fussweg', hinweise: [] });
    expect(w.schritte.at(-1).text).toMatch(/zu Steig B$/);
    expect(haltestellen.fussweg).toHaveBeenCalledWith({ lat: 51.31263, lon: 9.49286 }, { lat: 51.31214, lon: 9.4919 }, 'FOOT');
  });

  it('barrierefrei: Rollstuhlprofil und Hinweis zum Aufzugstatus', async () => {
    const { a, haltestellen } = app(async () => KASSEL);
    const w = (await a.inject(URL_OK.replace('schnellste', 'barrierefrei'))).json();
    expect(haltestellen.fussweg).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'WHEELCHAIR');
    expect(w.hinweise.join(' ')).toMatch(/Aufzugstatus/);
  });

  it('Ebene wird durchgereicht', async () => {
    const { a, haltestellen } = app(async () => KASSEL);
    await a.inject('/api/weg?vonLat=52.52498&vonLon=13.36911&vonLevel=-2&nachLat=52.52334&nachLon=13.37022&profil=normal&variante=schnellste');
    expect(haltestellen.fussweg).toHaveBeenCalledWith({ lat: 52.52498, lon: 13.36911, level: -2 }, { lat: 52.52334, lon: 13.37022 }, 'FOOT');
  });

  it('kein Weg gefunden: ungefaehrer Weg statt Fehler', async () => {
    const { a } = app(async () => null);
    const w = (await a.inject(URL_OK)).json();
    expect(w.herkunft).toBe('luftlinie');
    expect(w.stufe).toBe(3);
  });

  it('barrierefrei ohne Weg: sagt, dass kein barrierefreier Weg gefunden wurde', async () => {
    const { a } = app(async () => null);
    const w = (await a.inject(URL_OK.replace('schnellste', 'barrierefrei'))).json();
    expect(w.herkunft).toBe('luftlinie');
    expect(w.hinweise[0]).toMatch(/Kein barrierefreier Weg/);
    expect(w.hinweise.join(' ')).not.toMatch(/Kein Fußweg im Kartenmaterial/);
  });

  it('MOTIS weg: 503 Haltestellendaten gerade nicht verfuegbar', async () => {
    const { a } = app(async () => { throw new HaltestellenNichtVerfuegbarError('Test'); });
    expect((await a.inject(URL_OK)).json().fehler).toBe('haltestellen-nicht-verfuegbar');
  });

  it.each([
    URL_OK.replace('profil=normal', 'profil=rennend'),
    URL_OK.replace('variante=schnellste', 'variante=mit-stopp'),
    URL_OK.replace('vonLat=51.31263', 'vonLat=abc'),
    URL_OK.replace('Steig%20B', 'x'.repeat(81)),
    '/api/weg?vonLat=51.3&vonLon=9.4&nachLat=52.5&nachLon=13.3&profil=normal&variante=schnellste',
    // 2,5 km: kein Umstieg mehr - und laenger, als MOTIS zu Fuss rechnet.
    '/api/weg?vonLat=51.3&vonLon=9.4&nachLat=51.3&nachLon=9.436&profil=normal&variante=schnellste',
  ])('400: %s', async (url) => {
    const { a } = app(async () => KASSEL);
    expect((await a.inject(url)).statusCode).toBe(400);
  });
});

describe('GET /api/weg: halbe Ebenen (Gesamtreview Umstieg 2.0)', () => {
  it('nimmt eine halbe OSM-Ebene an (level=-0.5, Zwischengeschoss)', async () => {
    const { a, haltestellen } = app(async () => KASSEL);
    const res = await a.inject('/api/weg?vonLat=52.52498&vonLon=13.36911&vonLevel=-0.5&nachLat=52.52334&nachLon=13.37022&nachLevel=0.5&profil=normal&variante=schnellste');
    expect(res.statusCode).toBe(200);
    expect(haltestellen.fussweg).toHaveBeenCalledWith({ lat: 52.52498, lon: 13.36911, level: -0.5 }, { lat: 52.52334, lon: 13.37022, level: 0.5 }, 'FOOT');
  });

  it.each(['abc', '21', 'Infinity'])('lehnt Ebene %s weiter ab', async (ebene) => {
    const { a } = app(async () => KASSEL);
    const res = await a.inject(`/api/weg?vonLat=52.52498&vonLon=13.36911&vonLevel=${ebene}&nachLat=52.52334&nachLon=13.37022&profil=normal&variante=schnellste`);
    expect(res.statusCode).toBe(400);
  });
});
