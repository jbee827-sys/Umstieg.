import { describe, it, expect } from 'vitest';
import { gleicherHaltname, haltnamenZurSuche } from '../src/core/haltname.js';

/**
 * Namen aus dem IRIS-Laufweg (25.10.2026). Die Tafel nennt Bahnhofsteile mit
 * Zusatz - „München Hbf (tief)", „Hamburg Hbf (S-Bahn)", „Berlin Ostkreuz
 * (S)", „München Hbf Gl.27-36" -, RIS::Stations kennt sie ohne. In der
 * Simulation waren das 230 von 258 Haltes ohne Lage.
 */
describe('haltnamenZurSuche', () => {
  it('sucht zuerst den Namen, wie er ist', () => {
    expect(haltnamenZurSuche('Berlin Gesundbrunnen')).toEqual(['Berlin Gesundbrunnen']);
  });

  it('streift Zusaetze fuer Bahnhofsteile ab', () => {
    expect(haltnamenZurSuche('München Hbf (tief)')).toEqual(['München Hbf (tief)', 'München Hbf']);
    expect(haltnamenZurSuche('Hamburg Hbf (S-Bahn)')).toEqual(['Hamburg Hbf (S-Bahn)', 'Hamburg Hbf']);
    expect(haltnamenZurSuche('Berlin Ostkreuz (S)')).toEqual(['Berlin Ostkreuz (S)', 'Berlin Ostkreuz']);
    expect(haltnamenZurSuche('Berlin Gesundbrunnen(S)')).toEqual(['Berlin Gesundbrunnen(S)', 'Berlin Gesundbrunnen']);
    expect(haltnamenZurSuche('München Hbf Gl.27-36')).toEqual(['München Hbf Gl.27-36', 'München Hbf']);
    expect(haltnamenZurSuche('Köln Messe/Deutz Gl.11-12')).toEqual(['Köln Messe/Deutz Gl.11-12', 'Köln Messe/Deutz']);
  });

  it('laesst Klammern stehen, die zum Namen gehoeren', () => {
    expect(haltnamenZurSuche('Frankfurt(Main)Hbf')).toEqual(['Frankfurt(Main)Hbf']);
    expect(haltnamenZurSuche('Halle(Saale)Hbf')).toEqual(['Halle(Saale)Hbf']);
  });
});

describe('gleicherHaltname', () => {
  it('vergleicht ohne Gross/klein und doppelte Leerzeichen', () => {
    expect(gleicherHaltname('Berlin  Hbf', 'berlin hbf')).toBe(true);
    expect(gleicherHaltname('Oststadt', 'Oststadt Süd')).toBe(false);
  });
});
