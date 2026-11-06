import { describe, expect, it } from 'vitest';
import { aussteigeSeite, gleisSchluessel, gleisSeiten, type BahnsteigLage } from '../src/core/gleisseite.js';

/*
 * Bahnsteige in Metern um 52° N, alle Achsen von West (Anfang) nach Ost
 * (Ende). Links der Achse ist damit Norden, rechts Sueden.
 */
const M_LAT = 111_320;
const M_LON = M_LAT * Math.cos((52 * Math.PI) / 180);
const p = (x: number, y: number) => ({ lat: 52 + y / M_LAT, lon: 13 + x / M_LON });

function steig(id: string, y: number, gleise: string[], extra: Partial<BahnsteigLage> = {}): BahnsteigLage {
  return { id, ebene: 0, gleise, anfang: p(0, y), ende: p(200, y), ...extra };
}

describe('gleisSeiten (Konzept 09: rechts/links beim Aussteigen)', () => {
  it('Bahnsteigkante mit Gleisnummer entscheidet', () => {
    const kanten = new Map([['7', [p(0, -4), p(200, -4)]]]);
    const ergebnis = gleisSeiten([steig('w1', 0, ['7'], { kanten })]);
    expect(ergebnis.get(gleisSchluessel('w1', '7'))).toMatchObject({ seite: 'rechts', quelle: 'kante' });
  });

  it('Seitenbahnsteig: das Gleis liegt zu den anderen Bahnsteigen hin', () => {
    const ergebnis = gleisSeiten([steig('haus', 0, ['1']), steig('insel', 20, ['2', '3'])]);
    expect(ergebnis.get(gleisSchluessel('haus', '1'))).toMatchObject({ seite: 'links', quelle: 'nachbarn' });
  });

  it('Inselbahnsteig: jedes Gleis zur Seite der naeheren Nummern ([1] | [2,3] | [4,5])', () => {
    const ergebnis = gleisSeiten([steig('a', 0, ['1']), steig('b', 20, ['2', '3']), steig('c', 40, ['4', '5'])]);
    expect(ergebnis.get(gleisSchluessel('b', '2'))?.seite).toBe('rechts');
    expect(ergebnis.get(gleisSchluessel('b', '3'))?.seite).toBe('links');
  });

  it('ohne Nachbarn und ohne Kante bleibt die Seite offen', () => {
    expect(gleisSeiten([steig('allein', 0, ['1'])]).size).toBe(0);
  });

  it('gebogener Bahnsteig: gemessen gegen die Mittellinie, nicht gegen die Sehne (Köln Hbf)', () => {
    // Bogen nach Norden: Die Mitte liegt 15 m ueber der Sehne. Gegen die
    // Sehne laegen beide Kanten noerdlich, also „links“.
    const linie = [p(0, 0), p(100, 15), p(200, 0)];
    const kanten = new Map([
      ['2', [p(0, -3), p(100, 12), p(200, -3)]],
      ['3', [p(0, 3), p(100, 18), p(200, 3)]],
    ]);
    const ergebnis = gleisSeiten([steig('bogen', 0, ['2', '3'], { kanten, linie })]);
    expect(ergebnis.get(gleisSchluessel('bogen', '2'))?.seite).toBe('rechts');
    expect(ergebnis.get(gleisSchluessel('bogen', '3'))?.seite).toBe('links');
  });

  it('zwei Gleise an derselben Kante sind unmoeglich: dann gilt keine Kante', () => {
    const kanten = new Map([
      ['2', [p(0, 3), p(200, 3)]],
      ['3', [p(0, 4), p(200, 4)]],
    ]);
    const ergebnis = gleisSeiten([steig('falsch', 0, ['2', '3'], { kanten })]);
    expect(ergebnis.get(gleisSchluessel('falsch', '2'))?.quelle).not.toBe('kante');
  });
});

describe('aussteigeSeite: mit dem Zug im Ruecken', () => {
  it('Gleis rechts der Achse: Wer aussteigt, hat das Ende rechts', () => {
    // Gleis im Sueden, man schaut nach Norden - Osten (das Ende) ist rechts.
    expect(aussteigeSeite('rechts', true)).toBe('rechts');
    expect(aussteigeSeite('rechts', false)).toBe('links');
  });

  it('Gleis links der Achse: das Ende ist links', () => {
    expect(aussteigeSeite('links', true)).toBe('links');
    expect(aussteigeSeite('links', false)).toBe('rechts');
  });
});
