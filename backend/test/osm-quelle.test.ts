import { describe, expect, it, vi } from 'vitest';
import { erzeugeOsmQuelle } from '../src/osm/quelle.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { GefundenerEintrag, OsmBestand } from '../src/osm/bestand.js';
import type { OsmErneuerung } from '../src/osm/erneuerung.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

const AUS_BESTAND = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] } as unknown as OverpassAntwort;
const AUS_OVERPASS = { elements: [{ type: 'node', id: 2, lat: 0, lon: 0 }] } as unknown as OverpassAntwort;
const JETZT = new Date('2026-10-12T12:00:00Z');

const berlin: StationsInfo = {
  eva: '8098160',
  evas: ['8098160', '8011160', '8089021'],
  name: 'Berlin Hbf',
  lat: 52.525,
  lon: 13.369,
  gleise: [],
};

function gefunden(ueber: Partial<GefundenerEintrag> = {}): GefundenerEintrag {
  return {
    schluessel: '8011160',
    name: 'Berlin Hbf',
    lat: 52.525,
    lon: 13.369,
    geholtAm: '2026-10-10T12:00:00.000Z',
    abfrageVersion: ABFRAGE_VERSION,
    osm: AUS_BESTAND,
    herkunft: 'start',
    ...ueber,
  };
}

function aufbau(liest: GefundenerEintrag | null, { overpassWirft = false } = {}) {
  const bestand: OsmBestand = {
    hatVolume: true,
    lies: vi.fn(async () => liest),
    schreibe: vi.fn(async () => true),
  };
  const erneuerung: OsmErneuerung = {
    stosseAn: vi.fn(),
    spaeter: vi.fn(),
    beiErneuert: vi.fn(),
    leerlauf: async () => {},
  };
  const overpass = vi.fn(async () => {
    if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
    return AUS_OVERPASS;
  });
  const quelle = erzeugeOsmQuelle({ bestand, erneuerung, overpass, jetzt: () => JETZT });
  return { quelle, bestand, erneuerung, overpass };
}

describe('OSM-Quelle', () => {
  it('fragt den Bestand unter der kleinsten EVA der Gruppe', async () => {
    const a = aufbau(gefunden());
    await a.quelle.hole(berlin);
    expect(a.bestand.lies).toHaveBeenCalledWith('8011160');
  });

  it('nimmt frische Bestandsdaten ohne Overpass und ohne Erneuerung', async () => {
    const a = aufbau(gefunden());
    expect(await a.quelle.hole(berlin)).toBe(AUS_BESTAND);
    expect(a.overpass).not.toHaveBeenCalled();
    expect(a.erneuerung.stosseAn).not.toHaveBeenCalled();
  });

  it('nimmt alte Bestandsdaten sofort und stoesst die Erneuerung an', async () => {
    const a = aufbau(gefunden({ geholtAm: '2026-09-01T12:00:00.000Z' }));
    expect(await a.quelle.hole(berlin)).toBe(AUS_BESTAND);
    expect(a.erneuerung.stosseAn).toHaveBeenCalledWith({
      schluessel: '8011160',
      name: 'Berlin Hbf',
      lat: 52.525,
      lon: 13.369,
      evas: ['8098160', '8011160', '8089021'],
    });
  });

  it('stoesst die Erneuerung auch bei fremder Abfrageversion an', async () => {
    const a = aufbau(gefunden({ abfrageVersion: 'alt000000000' }));
    await a.quelle.hole(berlin);
    expect(a.erneuerung.stosseAn).toHaveBeenCalled();
  });

  it('holt einen fehlenden Bahnhof von Overpass und schreibt ihn', async () => {
    const a = aufbau(null);
    expect(await a.quelle.hole(berlin)).toBe(AUS_OVERPASS);
    expect(a.overpass).toHaveBeenCalledWith(52.525, 13.369, 400);
    expect(a.bestand.schreibe).toHaveBeenCalledWith({
      schluessel: '8011160',
      name: 'Berlin Hbf',
      lat: 52.525,
      lon: 13.369,
      geholtAm: '2026-10-12T12:00:00.000Z',
      abfrageVersion: ABFRAGE_VERSION,
      osm: AUS_OVERPASS,
    });
  });

  it('reicht einen Overpass-Fehler weiter und schreibt nichts', async () => {
    const a = aufbau(null, { overpassWirft: true });
    await expect(a.quelle.hole(berlin)).rejects.toThrow(/Overpass nicht erreichbar/);
    expect(a.bestand.schreibe).not.toHaveBeenCalled();
  });

  it('merkt einen gescheiterten Bahnhof zum Nachholen vor und wirft weiter', async () => {
    const a = aufbau(null, { overpassWirft: true });
    await expect(a.quelle.hole(berlin)).rejects.toThrow(/Overpass nicht erreichbar/);
    expect(a.erneuerung.spaeter).toHaveBeenCalledWith({
      schluessel: '8011160',
      name: 'Berlin Hbf',
      lat: 52.525,
      lon: 13.369,
      evas: ['8098160', '8011160', '8089021'],
    });
  });

  it('merkt nichts vor, wenn Overpass liefert oder der Bestand trifft', async () => {
    const geholt = aufbau(null);
    await geholt.quelle.hole(berlin);
    expect(geholt.erneuerung.spaeter).not.toHaveBeenCalled();
    const getroffen = aufbau(gefunden());
    await getroffen.quelle.hole(berlin);
    expect(getroffen.erneuerung.spaeter).not.toHaveBeenCalled();
  });

  it('wirft ohne Koordinaten', async () => {
    const a = aufbau(null);
    await expect(a.quelle.hole({ ...berlin, lat: undefined, lon: undefined })).rejects.toThrow(
      /keine Koordinaten/,
    );
  });

  it('nimmt die eigene EVA als Schluessel, wenn die Gruppe leer ist', async () => {
    const a = aufbau(null);
    await a.quelle.hole({ ...berlin, evas: [] });
    expect(a.bestand.lies).toHaveBeenCalledWith('8098160');
  });

  it('kommt ohne Erneuerung aus', async () => {
    const bestand: OsmBestand = {
      hatVolume: false,
      lies: vi.fn(async () => gefunden({ geholtAm: '2026-01-01T00:00:00.000Z' })),
      schreibe: vi.fn(async () => false),
    };
    const quelle = erzeugeOsmQuelle({ bestand, erneuerung: null, overpass: vi.fn(), jetzt: () => JETZT });
    expect(await quelle.hole(berlin)).toBe(AUS_BESTAND);
  });
});
