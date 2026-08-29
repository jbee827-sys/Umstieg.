import { describe, it, expect } from 'vitest';
import { ANKUNFT_START, pruefeAnkunft, zielKoordinate } from './ankunft';
import type { Standort } from './typen';
import type { RouteErgebnis } from '../api/typen';

const ZIEL = { lat: 52.525, lon: 13.369 };

function standort(lat: number, genauigkeitM = 15): Standort {
  return { lat, lon: 13.369, genauigkeitM, zeitstempel: 0 };
}

describe('pruefeAnkunft', () => {
  it('startet den Zaehler beim Eintritt in den Radius, schlaegt aber noch nichts vor', () => {
    const { zustand, vorschlagen } = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000);
    expect(zustand.seit).toBe(1000);
    expect(vorschlagen).toBe(false);
  });

  it('schlaegt nach Ablauf der Verweildauer vor', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const { vorschlagen } = pruefeAnkunft(start, standort(52.5252), ZIEL, 16_000);
    expect(vorschlagen).toBe(true);
  });

  it('schlaegt kurz vor Ablauf noch nicht vor', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const { vorschlagen } = pruefeAnkunft(start, standort(52.5252), ZIEL, 15_999);
    expect(vorschlagen).toBe(false);
  });

  it('setzt den Zaehler beim Verlassen des Radius zurueck', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const raus = pruefeAnkunft(start, standort(52.5255), ZIEL, 5000).zustand;
    expect(raus.seit).toBeNull();
  });

  it('pausiert bei schlechtem Fix, ohne den Zaehler zurueckzusetzen', () => {
    const start = pruefeAnkunft(ANKUNFT_START, standort(52.5252), ZIEL, 1000).zustand;
    const ergebnis = pruefeAnkunft(start, standort(52.5252, 150), ZIEL, 20_000);
    expect(ergebnis.zustand.seit).toBe(1000);
    expect(ergebnis.vorschlagen).toBe(false);
  });

  it('schlaegt nach Bestaetigung nie wieder vor', () => {
    const bestaetigt = { seit: 1000, bestaetigt: true };
    const { vorschlagen } = pruefeAnkunft(bestaetigt, standort(52.5252), ZIEL, 60_000);
    expect(vorschlagen).toBe(false);
  });
});

describe('zielKoordinate', () => {
  const karte = {
    '0': {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [13.369, 52.525] },
          properties: { rolle: 'ziel' },
        },
      ],
    },
  };

  it('liest den Zielmarker aus dem GeoJSON (lon/lat-Reihenfolge)', () => {
    const route = { stufe: 1, schritte: [], gehzeitSek: 0, hinweise: [], karte } as RouteErgebnis;
    expect(zielKoordinate(route)).toEqual({ lat: 52.525, lon: 13.369 });
  });

  it('liefert null bei Stufe 3 – die Synthesekoordinaten sind konstruiert', () => {
    const route = { stufe: 3, schritte: [], gehzeitSek: 0, hinweise: [], karte } as RouteErgebnis;
    expect(zielKoordinate(route)).toBeNull();
  });

  it('liefert null ohne Karte', () => {
    const route = { stufe: 1, schritte: [], gehzeitSek: 0, hinweise: [] } as RouteErgebnis;
    expect(zielKoordinate(route)).toBeNull();
  });
});
