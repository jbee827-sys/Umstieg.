import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { HaltestellenAnfrageFehler, HaltestellenNichtVerfuegbarError } from '../src/clients/motis-pausen.js';
import type { HaltestellenTafelEintrag } from '../src/core/typen.js';

const MIT: HaltestellenTafelEintrag = { fahrtId: 't1', linie: '6', verkehrsmittel: 'tram', ziel: 'Ihringshäuser Straße', zeitSoll: '2026-10-16T14:11:00Z', zeitIst: '2026-10-16T14:12:00Z', steigSoll: 'A', steigLat: 51.3, steigLon: 9.4, steigGenau: true, echtzeit: true, ausfall: false };
const OHNE: HaltestellenTafelEintrag = { ...MIT, fahrtId: 't2', zeitIst: undefined, echtzeit: false };
const AUS: HaltestellenTafelEintrag = { ...MIT, fahrtId: 't3', ausfall: true };

function app(tafel: () => Promise<HaltestellenTafelEintrag[]>) {
  const haltestellen = { tafel: vi.fn(tafel), tafelFrisch: vi.fn(tafel), sucheOrte: vi.fn(), orteNahebei: vi.fn(), fussweg: vi.fn(), fahrt: vi.fn() };
  return { app: buildApp({ haltestellen } as never), haltestellen };
}
const URL_OK = '/api/haltestelle/tafel?id=de-DELFI_de%3A06611%3A200003%3A%3AA&lat=51.31263&lon=9.49286&typ=dep';

describe('GET /api/haltestelle/tafel', () => {
  it('mit und ohne Echtzeit, mit Ausfall, mit Zeitstempel (K2, K3)', async () => {
    const { app: a, haltestellen } = app(async () => [MIT, OHNE, AUS]);
    const res = await a.inject(URL_OK);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eintraege.map((e: HaltestellenTafelEintrag) => [e.echtzeit, e.ausfall])).toEqual([[true, false], [false, false], [true, true]]);
    expect(Date.parse(body.stand)).not.toBeNaN();
    expect(haltestellen.tafel).toHaveBeenCalledWith({ id: 'de-DELFI_de:06611:200003::A', lat: 51.31263, lon: 9.49286 }, 'dep');
  });

  it('umkreis=bahnhof: 250 m um den Bahnhof (Busbahnhof mit anderem Namen, 21.10.2026)', async () => {
    const { app: a, haltestellen } = app(async () => [MIT]);
    expect((await a.inject(`${URL_OK}&umkreis=bahnhof`)).statusCode).toBe(200);
    expect(haltestellen.tafel).toHaveBeenCalledWith({ id: 'de-DELFI_de:06611:200003::A', lat: 51.31263, lon: 9.49286, umkreisM: 250 }, 'dep');
  });

  it('MOTIS pausiert: 503 mit verstaendlichem Text (Spec 5.6)', async () => {
    const { app: a } = app(async () => { throw new HaltestellenNichtVerfuegbarError('pausiert'); });
    const res = await a.inject(URL_OK);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'haltestellen-nicht-verfuegbar', detail: 'Haltestellendaten gerade nicht verfügbar.' });
  });

  it('unbekannte Haltestelle: 404', async () => {
    const { app: a } = app(async () => { throw new HaltestellenAnfrageFehler(404, 'no radius'); });
    expect((await a.inject(URL_OK)).statusCode).toBe(404);
  });

  it('nicht eingerichtet: 503', async () => {
    const a = buildApp({ haltestellen: null } as never);
    expect((await a.inject(URL_OK)).json().fehler).toBe('haltestellen-nicht-eingerichtet');
  });

  it.each([
    '/api/haltestelle/tafel?lat=1&lon=2&typ=dep',
    `/api/haltestelle/tafel?id=${'x'.repeat(301)}&lat=1&lon=2&typ=dep`,
    '/api/haltestelle/tafel?id=a&lat=x&lon=2&typ=dep',
    '/api/haltestelle/tafel?id=a&lat=1&lon=2&typ=both',
    '/api/haltestelle/tafel?id=a&lat=1&lon=2&typ=dep&umkreis=stadt',
  ])('400: %s', async (url) => {
    const { app: a } = app(async () => []);
    expect((await a.inject(url)).statusCode).toBe(400);
  });
});
