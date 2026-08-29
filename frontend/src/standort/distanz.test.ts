import { describe, it, expect } from 'vitest';
import { genauigkeitsPolygon, haversineM } from './distanz';

describe('haversineM', () => {
  it('gleiche Koordinate → 0 m', () => {
    expect(haversineM(52.525, 13.369, 52.525, 13.369)).toBe(0);
  });

  it('0,001 Grad noerdlich → rund 111 m', () => {
    const d = haversineM(52.525, 13.369, 52.526, 13.369);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('ist symmetrisch', () => {
    const hin = haversineM(52.525, 13.369, 52.526, 13.371);
    const zurueck = haversineM(52.526, 13.371, 52.525, 13.369);
    expect(hin).toBeCloseTo(zurueck, 6);
  });

  it('funktioniert ueber den Nullmeridian hinweg', () => {
    const d = haversineM(51.4778, -0.0005, 51.4778, 0.0005);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(80);
  });
});

describe('genauigkeitsPolygon', () => {
  it('ist ein geschlossener Ring', () => {
    const ring = genauigkeitsPolygon(52.525, 13.369, 50);
    expect(ring.length).toBe(33);
    expect(ring[0]).toEqual(ring[32]);
  });

  it('jeder Stuetzpunkt liegt rund radiusM vom Mittelpunkt entfernt', () => {
    const ring = genauigkeitsPolygon(52.525, 13.369, 50);
    for (const [lon, lat] of ring) {
      expect(haversineM(52.525, 13.369, lat, lon)).toBeCloseTo(50, 0);
    }
  });

  it('liefert [lon, lat] in GeoJSON-Reihenfolge', () => {
    const ring = genauigkeitsPolygon(52.525, 13.369, 50);
    expect(ring[0][0]).toBeCloseTo(13.369, 2);
    expect(ring[0][1]).toBeGreaterThan(52.525);
  });
});
