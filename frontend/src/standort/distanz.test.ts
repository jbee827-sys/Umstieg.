import { describe, it, expect } from 'vitest';
import { haversineM } from './distanz';

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
