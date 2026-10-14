import { describe, expect, it, vi } from 'vitest';
import { erzeugeErneuerung, NACHHOL_WARTEZEIT_MS, type ErneuerungsAuftrag } from '../src/osm/erneuerung.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { BestandsEintrag, OsmBestand } from '../src/osm/bestand.js';
import type { OverpassAntwort } from '../src/core/typen.js';

const OSM = { elements: [] } as unknown as OverpassAntwort;

function auftrag(schluessel: string): ErneuerungsAuftrag {
  return { schluessel, name: `Bahnhof ${schluessel}`, lat: 52, lon: 13, evas: [schluessel] };
}

function aufbau({ overpassWirft = false, schreibtNicht = false } = {}) {
  let uhr = Date.parse('2026-10-12T12:00:00Z');
  const geschrieben: BestandsEintrag[] = [];
  const bestand: OsmBestand = {
    hatVolume: true,
    lies: vi.fn(async () => null),
    schreibe: vi.fn(async (e: BestandsEintrag) => {
      geschrieben.push(e);
      return !schreibtNicht;
    }),
  };
  const overpass = vi.fn(async () => {
    if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
    return OSM;
  });
  const warte = vi.fn(async () => {});
  const log = { warn: vi.fn() };
  const erneuerung = erzeugeErneuerung({ bestand, overpass, log, warte, jetzt: () => new Date(uhr) });
  return {
    erneuerung,
    bestand,
    overpass,
    warte,
    log,
    geschrieben,
    stelleUhr: (ms: number) => {
      uhr += ms;
    },
  };
}

describe('Hintergrund-Erneuerung', () => {
  it('holt, schreibt in der aktuellen Version und meldet den Erfolg', async () => {
    const a = aufbau();
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledWith(52, 13, 400);
    expect(a.geschrieben[0]).toMatchObject({
      schluessel: '8002549',
      abfrageVersion: ABFRAGE_VERSION,
      geholtAm: '2026-10-12T12:00:00.000Z',
    });
    expect(erneuert).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8002549' }));
  });

  it('nimmt denselben Bahnhof nicht doppelt auf', async () => {
    const a = aufbau();
    a.erneuerung.stosseAn(auftrag('8002549'));
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(1);
  });

  it('wartet 10 s zwischen zwei Abrufen, nicht vor dem ersten', async () => {
    const a = aufbau();
    a.erneuerung.stosseAn(auftrag('8002549'));
    a.erneuerung.stosseAn(auftrag('8000105'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(2);
    expect(a.warte).toHaveBeenCalledTimes(1);
    expect(a.warte).toHaveBeenCalledWith(10_000);
  });

  it('nimmt hoechstens 50 Bahnhoefe je Stunde auf', async () => {
    const a = aufbau();
    for (let i = 0; i < 60; i++) a.erneuerung.stosseAn(auftrag(String(8000100 + i)));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(50);
    a.stelleUhr(60 * 60 * 1000);
    a.erneuerung.stosseAn(auftrag('8000999'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(51);
  });

  it('versucht einen gescheiterten Bahnhof erst nach einem Tag wieder', async () => {
    const a = aufbau({ overpassWirft: true });
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.bestand.schreibe).not.toHaveBeenCalled();
    expect(erneuert).not.toHaveBeenCalled();
    expect(a.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ degradation: 'osm-erneuerung-gescheitert', schluessel: '8002549' }),
      expect.any(String),
    );

    a.stelleUhr(23 * 60 * 60 * 1000);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(1);

    a.stelleUhr(2 * 60 * 60 * 1000);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(2);
  });

  it('meldet keinen Erfolg, wenn nicht geschrieben wurde', async () => {
    const a = aufbau({ schreibtNicht: true });
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(erneuert).not.toHaveBeenCalled();
  });

  it('protokolliert einen Fehler eines Abonnenten, ruft aber weitere auf', async () => {
    const a = aufbau();
    const werfer = vi.fn(() => {
      throw new Error('Abonnent kaputt');
    });
    const weiterer = vi.fn();
    a.erneuerung.beiErneuert(werfer);
    a.erneuerung.beiErneuert(weiterer);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.bestand.schreibe).toHaveBeenCalled();
    expect(a.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        ereignis: 'osm-erneuerung-abonnent-fehler',
        schluessel: '8002549',
      }),
      expect.any(String),
    );
    expect(weiterer).toHaveBeenCalled();
  });
});

describe('Hintergrund-Erneuerung – Nachholen', () => {
  function mitZeitgeber() {
    const zeitgeber: { fn: () => void; ms: number }[] = [];
    const overpass = vi.fn(async () => OSM);
    const bestand: OsmBestand = {
      hatVolume: true,
      lies: vi.fn(async () => null),
      schreibe: vi.fn(async () => true),
    };
    const erneuerung = erzeugeErneuerung({
      bestand,
      overpass,
      warte: async () => {},
      jetzt: () => new Date('2026-10-14T12:00:00Z'),
      zeitgeber: (fn, ms) => {
        zeitgeber.push({ fn, ms });
      },
    });
    return { erneuerung, overpass, bestand, zeitgeber };
  }

  it('holt einen vorgemerkten Bahnhof erst nach einer Stunde', async () => {
    const a = mitZeitgeber();
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.spaeter(auftrag('8010376'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).not.toHaveBeenCalled();
    expect(a.zeitgeber).toHaveLength(1);
    expect(a.zeitgeber[0].ms).toBe(NACHHOL_WARTEZEIT_MS);
    expect(NACHHOL_WARTEZEIT_MS).toBe(60 * 60 * 1000);
    a.zeitgeber[0].fn();
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledWith(52, 13, 400);
    expect(a.bestand.schreibe).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8010376' }));
    expect(erneuert).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8010376' }));
  });

  it('merkt denselben Bahnhof nur einmal vor, bis er angestossen ist', async () => {
    const a = mitZeitgeber();
    a.erneuerung.spaeter(auftrag('8010376'));
    a.erneuerung.spaeter(auftrag('8010376'));
    expect(a.zeitgeber).toHaveLength(1);
    a.zeitgeber[0].fn();
    await a.erneuerung.leerlauf();
    a.erneuerung.spaeter(auftrag('8010376'));
    expect(a.zeitgeber).toHaveLength(2);
  });

  it('haelt beim Nachholen die Tagessperre ein', async () => {
    const a = mitZeitgeber();
    a.erneuerung.stosseAn(auftrag('8010376'));
    await a.erneuerung.leerlauf();
    a.erneuerung.spaeter(auftrag('8010376'));
    a.zeitgeber[0].fn();
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(1);
  });
});
