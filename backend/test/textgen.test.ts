import { describe, it, expect } from 'vitest';
import { generiereSchritte, peilungGrad } from '../src/core/textgen.js';
import type { GraphKante, GraphKnoten, KantenTyp, RoutenPfad } from '../src/core/typen.js';

// Knoten aus Meter-Offsets (x = Ost, y = Nord) um 52° N – nur die PEILUNGEN
// zwischen Knoten zählen; Kantenlängen werden explizit gesetzt.
const M_PRO_GRAD_LAT = 111320;
const M_PRO_GRAD_LON = M_PRO_GRAD_LAT * Math.cos((52 * Math.PI) / 180);
const xy = (id: string, x: number, y: number, level = 0, gleis?: string): GraphKnoten => ({
  id,
  lat: 52 + y / M_PRO_GRAD_LAT,
  lon: 13 + x / M_PRO_GRAD_LON,
  level,
  ...(gleis ? { gleis } : {}),
});

const kante = (
  von: string,
  nach: string,
  typ: KantenTyp,
  laengeM: number,
  deltaLevel = 0,
): GraphKante => ({ von, nach, laengeM, deltaLevel, typ, barrierefrei: typ !== 'treppe' });

function machePfad(knoten: GraphKnoten[], kanten: GraphKante[]): RoutenPfad {
  return { knoten, kanten, laengeM: kanten.reduce((s, k) => s + k.laengeM, 0) };
}

describe('peilungGrad', () => {
  it('Punkt genau östlich → 90°, genau nördlich → 0°', () => {
    const a = xy('a', 0, 0);
    expect(peilungGrad(a, xy('o', 100, 0))).toBeCloseTo(90, 0);
    expect(peilungGrad(a, xy('n', 0, 100))).toBeCloseTo(0, 0);
  });
});

describe('generiereSchritte', () => {
  it('Referenzpfad → exakte Satzfolge (alle 5 Richtungen, Rundung, Ebenenwechsel)', () => {
    // Kurs je Kante (Kompass): 0° · 10° (merge) · 10° Rolltreppe hoch · 55° (halbrechts)
    // · 145° (rechts, <10 m) · 100° (halblinks) · 355° (links) · Treppe hinunter
    // · Aufzug (senkrecht, gleiche Koordinate) · 355° geradeaus zu Gleis 7.
    const knoten = [
      xy('p0', 0, 0),
      xy('p1', 0, 25),
      xy('p2', 3.82, 46.67),
      xy('p3', 5.9, 58.48, 1),
      xy('p4', 22.28, 69.95, 1),
      xy('p5', 26.87, 63.4, 1),
      xy('p6', 56.41, 58.19, 1),
      xy('p7', 55.1, 73.13, 1),
      xy('p8', 54.23, 83.09, 0),
      xy('p9', 54.23, 83.09, -1),
      xy('p10', 50.74, 122.94, -1, '7'),
    ];
    const kanten = [
      kante('p0', 'p1', 'eben', 25),
      kante('p1', 'p2', 'eben', 22),
      kante('p2', 'p3', 'rolltreppe', 12, 1),
      kante('p3', 'p4', 'eben', 20),
      kante('p4', 'p5', 'eben', 8),
      kante('p5', 'p6', 'eben', 30),
      kante('p6', 'p7', 'eben', 15),
      kante('p7', 'p8', 'treppe', 10, -1),
      kante('p8', 'p9', 'aufzug', 0, -1),
      kante('p9', 'p10', 'eben', 40),
    ];
    const schritte = generiereSchritte(machePfad(knoten, kanten));

    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 50 m geradeaus',
      'Rolltreppe hoch zur Ebene 1',
      '20 m halbrechts',
      'Wenige Meter rechts',
      '30 m halblinks',
      '20 m links',
      'Treppe hinunter zur Ebene 0',
      'Aufzug zur Unterführung (-1)',
      '40 m geradeaus zu Gleis 7',
    ]);
    expect(schritte.map((s) => s.typ)).toEqual([
      'eben', 'rolltreppe', 'eben', 'eben', 'eben', 'eben', 'treppe', 'aufzug', 'eben',
    ]);
    expect(schritte.map((s) => s.distanzM)).toEqual([
      50, undefined, 20, undefined, 30, 20, undefined, undefined, 40,
    ]);
  });

  it('einzelne Kante: Präfix und Gleis-Suffix im selben Schritt', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 38, 0, '5')];
    const schritte = generiereSchritte(machePfad(knoten, [kante('a', 'b', 'eben', 38)]));
    expect(schritte).toHaveLength(1);
    expect(schritte[0].text).toBe('Nach Ausstieg 40 m geradeaus zu Gleis 5');
    expect(schritte[0].distanzM).toBe(40);
  });

  it('benachbarte eben-Kanten gleicher Richtung werden zusammengefasst, > 22,5° nicht', () => {
    // 0° · 15° (merge) · 60° (kein merge, halbrechts)
    const knoten = [
      xy('a', 0, 0),
      xy('b', 0, 20),
      xy('c', 5.18, 39.32),
      xy('d', 22.5, 49.32, 0, '2'),
    ];
    const kanten = [
      kante('a', 'b', 'eben', 20),
      kante('b', 'c', 'eben', 20),
      kante('c', 'd', 'eben', 20),
    ];
    const schritte = generiereSchritte(machePfad(knoten, kanten));
    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 40 m geradeaus',
      '20 m halbrechts zu Gleis 2',
    ]);
  });

  it('ungefaehr-Flag (Stufe 3): Distanzen mit ca.-Präfix', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 38, 0, '5')];
    const schritte = generiereSchritte(machePfad(knoten, [kante('a', 'b', 'eben', 38)]), {
      ungefaehr: true,
    });
    expect(schritte[0].text).toBe('Nach Ausstieg ca. 40 m geradeaus zu Gleis 5');
  });

  it('Ebenenwechsel-Richtung folgt der Laufrichtung, nicht der Kantenspeicherrichtung', () => {
    // Kante wie im Graphbau von unten (0) nach oben (1) gespeichert: deltaLevel +1.
    // Der Pfad begeht sie rückwärts (oben → unten) → "hinunter" zur Ebene 0.
    const oben = xy('oben', 0, 0, 1);
    const unten = xy('unten', 0, 15, 0, '9');
    const treppenKante = {
      von: 'unten', nach: 'oben', laengeM: 10, deltaLevel: 1,
      typ: 'treppe' as const, barrierefrei: false,
    };
    const pfad = { knoten: [oben, unten], kanten: [treppenKante], laengeM: 10 };
    expect(generiereSchritte(pfad)[0].text).toBe('Nach Ausstieg Treppe hinunter zur Ebene 0 zu Gleis 9');
  });

  it('Rampe erhält Distanz und Ebenenwechsel-Text', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 28, -1, '3')];
    const schritte = generiereSchritte(machePfad(knoten, [kante('a', 'b', 'rampe', 28, -1)]));
    expect(schritte[0].text).toBe('Nach Ausstieg Rampe hinunter zur Unterführung (-1) zu Gleis 3');
    expect(schritte[0].distanzM).toBe(30);
  });
});
