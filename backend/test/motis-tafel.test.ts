import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fahrtverlaufAusTrip, steigAusDhid, tafelAusStoptimes } from '../src/clients/motis-abbildung.js';
import type { MotisItinerary, MotisStoptimesAntwort } from '../src/clients/motis-typen.js';

const lade = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${name}.json`, import.meta.url)), 'utf8'));

describe('steigAusDhid', () => {
  it.each([
    ['de-DELFI_de:06611:200003::A', 'A'],
    ['de-DELFI_de:14612:37:1:1', '1'],
    ['de-VBB_de:12069:900220152::4', '4'],
    ['at-Railway-Current-Reference-Data-2026_de:11000:900003200:1:51', '51'],
  ])('%s -> %s', (id, steig) => expect(steigAusDhid(id)).toBe(steig));

  it.each([['de-DELFI_de:07135:070006'], ['de-DELFI_de:09162:1'], ['de-VBN_000090011007'], [''], [undefined]])(
    '%s -> kein Steig',
    (id) => expect(steigAusDhid(id)).toBeUndefined(),
  );
});

describe('tafelAusStoptimes', () => {
  it('Kassel: kein track, Steig aus der DHID, Echtzeit', () => {
    const t = tafelAusStoptimes(lade<MotisStoptimesAntwort>('stoptimes-dep-kassel-rathaus'), 'dep');
    const erste = t.find((e) => e.linie === '6' && e.ziel === 'Kassel Ihringshäuser Straße')!;
    expect(erste).toMatchObject({ verkehrsmittel: 'tram', steigSoll: 'A', steigGenau: true, echtzeit: true, ausfall: false });
    expect(erste.zeitSoll).toBe('2026-10-16T14:11:00Z');
    expect(erste.fahrtId).toMatch(/^20261016_/);
    expect(new Set(t.map((e) => e.steigSoll))).toEqual(new Set(['A', 'B']));
  });

  it('Berlin Hbf: Gleis aus track, Ausfall bleibt sichtbar trotz NOT_ALLOWED (Review Focus 1)', () => {
    const t = tafelAusStoptimes(lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf'), 'dep');
    expect(t.find((e) => e.linie === 'ICE 1206')).toMatchObject({ steigSoll: '7', verkehrsmittel: 'bahn', steigGenau: true, steigLevel: -2 });
    const ausfaelle = t.filter((e) => e.ausfall);
    expect(ausfaelle.length).toBe(2);
    expect(ausfaelle.every((e) => e.linie === 'S3' || e.linie === 'S5')).toBe(true);
  });

  it('jeder Eintrag nennt seinen Halt - Name und ID (Bus am Bahnhof, 21.10.2026)', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf-bus');
    const [e] = tafelAusStoptimes(roh, 'dep');
    const p = roh.stopTimes[0].place;
    expect(e.haltName).toBe(p.name);
    expect(e.haltId).toBe(p.stopId);
  });

  it('planmaessig nicht bedienbarer Halt ohne Ausfall faellt weg', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf-bus');
    roh.stopTimes = [{ ...roh.stopTimes[0], pickupDropoffType: 'NOT_ALLOWED', cancelled: false, tripCancelled: false }];
    expect(tafelAusStoptimes(roh, 'dep')).toEqual([]);
  });

  it('Berliner Bus ohne Echtzeit: echtzeit false, kein zeitIst', () => {
    const t = tafelAusStoptimes(lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf-bus'), 'dep');
    expect(t.length).toBe(8);
    expect(t.every((e) => !e.echtzeit && e.zeitIst === undefined)).toBe(true);
    expect(t[0]).toMatchObject({ linie: '245', verkehrsmittel: 'bus', steigSoll: 'Pos. 12' });
  });

  it('Wiesenburg: Fahrten aus DELFI und VBB erscheinen einmal; ein gemeldeter Ausfall gilt', () => {
    const t = tafelAusStoptimes(lade<MotisStoptimesAntwort>('stoptimes-dep-wiesenburg'), 'dep');
    const belzig1423 = t.filter((e) => e.ziel === 'Bad Belzig' && e.zeitSoll.includes('T14:23'));
    expect(belzig1423).toHaveLength(1);
    expect(belzig1423[0].ausfall).toBe(true);
    const re7 = t.filter((e) => e.linie === 'RE7');
    expect(re7).toHaveLength(1);
    expect(re7[0]).toMatchObject({ steigSoll: '1', steigGenau: true, echtzeit: true });
  });

  it('doppelte Fahrt behaelt ihre Fahrt-ID, egal welche Quelle zuerst kommt oder Echtzeit hat (BUG-1)', () => {
    // Die Live-Ueberwachung filtert auf die fahrtId. Wechselte sie zwischen zwei
    // Abrufen, gingen die Meldungen zum Anschluss still verloren.
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-wiesenburg');
    const re7 = roh.stopTimes.filter((s) => s.displayName === 'RE7');
    expect(re7).toHaveLength(2);
    const ids = new Set<string>();
    for (const reihenfolge of [re7, [...re7].reverse()]) {
      for (const beideEchtzeit of [false, true]) {
        const variante = reihenfolge.map((s) => ({ ...s, realTime: beideEchtzeit || s.realTime }));
        ids.add(tafelAusStoptimes({ ...roh, stopTimes: variante }, 'dep')[0].fahrtId);
      }
    }
    expect(ids.size).toBe(1);
  });

  it('doppelte Fahrt mit anders geschriebener Linie und anders geschriebenem Ziel erscheint einmal (Review 3)', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-wiesenburg');
    const [a] = roh.stopTimes.filter((s) => s.displayName === 'RE7');
    const b = { ...a, tripId: 'zweite', displayName: 'RE 7', headsign: 'Brück (Bahnhof)', cancelled: true, pickupDropoffType: 'NOT_ALLOWED' };
    const t = tafelAusStoptimes({ ...roh, stopTimes: [{ ...a, headsign: 'Brück, Bahnhof' }, b] }, 'dep');
    expect(t).toHaveLength(1);
    expect(t[0].ausfall).toBe(true);
  });

  it('leerer track verdraengt den Steig aus der DHID nicht (Review 9)', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-kassel-rathaus');
    const s = roh.stopTimes[0];
    roh.stopTimes = [{ ...s, place: { ...s.place, track: '', scheduledTrack: '' } }];
    expect(tafelAusStoptimes(roh, 'dep')[0].steigSoll).toBe('A');
  });

  it('Ankunft: Herkunft statt Ziel, Ankunftszeit', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-arr-kassel-rathaus');
    const t = tafelAusStoptimes(roh, 'arr');
    expect(t.length).toBeGreaterThan(0);
    const erster = roh.stopTimes[0];
    const passend = t.find((e) => e.fahrtId === erster.tripId)!;
    expect(passend.ziel).toBe(erster.tripFrom.name);
    expect(passend.zeitSoll).toBe(erster.place.scheduledArrival);
  });

  it('sortiert nach der wirklichen Zeit', () => {
    const t = tafelAusStoptimes(lade<MotisStoptimesAntwort>('stoptimes-dep-hannover-kroepcke'), 'dep');
    const zeiten = t.map((e) => e.zeitIst ?? e.zeitSoll);
    expect([...zeiten].sort()).toEqual(zeiten);
  });

  it('Steigwechsel: steigIst nur bei Abweichung mit Echtzeit', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf');
    const s = roh.stopTimes[0];
    roh.stopTimes = [{ ...s, place: { ...s.place, track: '8', scheduledTrack: '7' } }];
    expect(tafelAusStoptimes(roh, 'dep')[0]).toMatchObject({ steigSoll: '7', steigIst: '8' });
    roh.stopTimes = [{ ...s, realTime: false, place: { ...s.place, track: '8', scheduledTrack: '7' } }];
    expect(tafelAusStoptimes(roh, 'dep')[0].steigIst).toBeUndefined();
  });

  it('Halt ohne track, ohne DHID, ohne Elternhalt: Koordinate der Haltestelle (steigGenau false)', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf-bus');
    const s = roh.stopTimes[0];
    roh.stopTimes = [{ ...s, place: { ...s.place, stopId: 'de-DELFI_de:07135:070006', track: undefined, scheduledTrack: undefined, parentId: undefined } }];
    expect(tafelAusStoptimes(roh, 'dep')[0]).toMatchObject({ steigGenau: false });
    expect(tafelAusStoptimes(roh, 'dep')[0].steigSoll).toBeUndefined();
  });

  it('ohne Sollzeit kein Eintrag, kein Absturz bei leerer Antwort', () => {
    const roh = lade<MotisStoptimesAntwort>('stoptimes-dep-berlin-hbf-bus');
    roh.stopTimes = [{ ...roh.stopTimes[0], place: { ...roh.stopTimes[0].place, scheduledDeparture: undefined } }];
    expect(tafelAusStoptimes(roh, 'dep')).toEqual([]);
    expect(tafelAusStoptimes({ stopTimes: undefined } as unknown as MotisStoptimesAntwort, 'dep')).toEqual([]);
    expect(tafelAusStoptimes(undefined as unknown as MotisStoptimesAntwort, 'dep')).toEqual([]);
  });
});

describe('fahrtverlaufAusTrip', () => {
  it('Kassel Tram 6: Linie, Ziel, alle Halte', () => {
    const f = fahrtverlaufAusTrip(lade<MotisItinerary>('trip-kassel-tram'));
    expect(f.linie).toBe('6');
    expect(f.ziel).toBe('Kassel Ihringshäuser Straße');
    expect(f.halte.length).toBe(24);
    expect(f.halte[0].name).toBe('Kassel Schulzentrum Brückenhof');
    expect(f.halte[0].zeitSoll).toMatch(/Z$/);
  });

  it('ohne Echtzeit keine Ist-Zeiten (F5, Review 1)', () => {
    const roh = lade<MotisItinerary>('trip-kassel-tram');
    roh.legs = roh.legs.map((l) => ({ ...l, realTime: false }));
    const f = fahrtverlaufAusTrip(roh);
    expect(f.halte.every((h) => h.zeitIst === undefined)).toBe(true);
    expect(f.halte.every((h) => h.zeitSoll !== undefined)).toBe(true);
  });
});
