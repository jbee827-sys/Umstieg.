import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { erzeugeHaltestellenClient } from '../src/clients/haltestellen.js';
import type { MotisKern } from '../src/clients/motis.js';

const lade = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${name}.json`, import.meta.url)), 'utf8'));

function kern() {
  return {
    geocode: vi.fn(async () => lade('geocode-kassel-rathaus')),
    reverseGeocode: vi.fn(async () => lade('reverse-kassel-3stellen')),
    stoptimes: vi.fn(async () => lade('stoptimes-dep-kassel-rathaus')),
    trip: vi.fn(async () => lade('trip-kassel-tram')),
    plan: vi.fn(async () => lade('plan-kassel-a-b')),
  };
}
const alsKern = (k: ReturnType<typeof kern>): MotisKern => k as unknown as MotisKern;

const KASSEL = { id: 'de-DELFI_de:06611:200003::A', lat: 51.31263, lon: 9.49286 };

describe('HaltestellenClient', () => {
  it('Suche: gleiche Eingabe nur einmal hinaus (24 h), auch in anderer Schreibung', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    await c.sucheOrte('Kassel Rathaus');
    await c.sucheOrte('kassel rathaus ');
    expect(k.geocode).toHaveBeenCalledTimes(1);
  });

  it('gleichzeitige Tafelabrufe werden gebuendelt', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    await Promise.all([c.tafel(KASSEL, 'dep'), c.tafel(KASSEL, 'dep'), c.tafel(KASSEL, 'dep')]);
    expect(k.stoptimes).toHaveBeenCalledTimes(1);
  });

  it('Ankunft und Abfahrt sind zwei Tafeln', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    await c.tafel(KASSEL, 'dep');
    await c.tafel(KASSEL, 'arr');
    expect(k.stoptimes).toHaveBeenCalledTimes(2);
  });

  it('Tafel fuer den Poller geht immer hinaus', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    await c.tafelFrisch(KASSEL, 'dep');
    await c.tafelFrisch(KASSEL, 'dep');
    expect(k.stoptimes).toHaveBeenCalledTimes(2);
  });

  it('Tafel beginnt fuenf Minuten vor jetzt und reicht ID und Koordinate durch', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k), { jetzt: () => new Date('2026-10-16T14:00:00Z') });
    await c.tafel(KASSEL, 'arr');
    expect(k.stoptimes).toHaveBeenCalledWith({ stopId: KASSEL.id, lat: KASSEL.lat, lon: KASSEL.lon, typ: 'arr', ab: new Date('2026-10-16T13:55:00Z') });
  });

  it('Standortsuche wird NIE zwischengespeichert (Datenschutz)', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    await c.orteNahebei(51.313, 9.493);
    await c.orteNahebei(51.313, 9.493);
    expect(k.reverseGeocode).toHaveBeenCalledTimes(2);
  });

  it('Fussweg je Steigpaar und Profil einmal; anderes Profil ist ein eigener Weg', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    const a = { lat: 51.31263, lon: 9.49286 };
    const b = { lat: 51.31214, lon: 9.4919 };
    await c.fussweg(a, b, 'FOOT');
    await c.fussweg(a, b, 'FOOT');
    await c.fussweg(a, b, 'WHEELCHAIR');
    await c.fussweg({ ...a, level: -1 }, b, 'FOOT');
    expect(k.plan).toHaveBeenCalledTimes(3);
  });

  it('kein Weg wird gespeichert, ein Fehler nicht', async () => {
    const k = kern();
    k.plan.mockResolvedValue(lade('plan-kein-weg'));
    const c = erzeugeHaltestellenClient(alsKern(k));
    expect(await c.fussweg({ lat: 1, lon: 1 }, { lat: 1, lon: 1.001 }, 'FOOT')).toBeNull();
    expect(await c.fussweg({ lat: 1, lon: 1 }, { lat: 1, lon: 1.001 }, 'FOOT')).toBeNull();
    expect(k.plan).toHaveBeenCalledTimes(1);

    k.geocode.mockRejectedValueOnce(new Error('weg'));
    await expect(c.sucheOrte('Kassel')).rejects.toThrow('weg');
    await c.sucheOrte('Kassel');
    expect(k.geocode).toHaveBeenCalledTimes(2);
  });

  it('Fahrtverlauf 60 s zwischengespeichert', async () => {
    const k = kern();
    const c = erzeugeHaltestellenClient(alsKern(k));
    const f = await c.fahrt('t1');
    await c.fahrt('t1');
    expect(f.linie).toBe('6');
    expect(k.trip).toHaveBeenCalledTimes(1);
  });

  it('liefert eigene Typen, keine MOTIS-Felder', async () => {
    const c = erzeugeHaltestellenClient(alsKern(kern()));
    const [ort] = await c.sucheOrte('Kassel Rathaus');
    expect(Object.keys(ort).sort()).toEqual(['haltestelleId', 'lat', 'lon', 'name', 'verkehrsmittel']);
    const [eintrag] = await c.tafel(KASSEL, 'dep');
    expect(eintrag).not.toHaveProperty('place');
    expect(eintrag).toHaveProperty('fahrtId');
    const pfad = await c.fussweg({ lat: 1, lon: 1 }, { lat: 1, lon: 1.001 }, 'FOOT');
    expect(pfad?.kanten.length).toBeGreaterThan(0);
  });
});
