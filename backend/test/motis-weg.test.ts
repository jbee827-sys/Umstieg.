import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dekodierePolylinie, pfadAusPlan } from '../src/clients/motis-weg.js';
import type { MotisPlanAntwort } from '../src/clients/motis-typen.js';
import type { RoutenPfad } from '../src/core/typen.js';

const plan = (name: string): MotisPlanAntwort =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${name}.json`, import.meta.url)), 'utf8'));

function pruefeInvariante(pfad: RoutenPfad): void {
  expect(pfad.kanten.length).toBe(pfad.knoten.length - 1);
  pfad.kanten.forEach((k, i) => {
    expect(k.von).toBe(pfad.knoten[i].id);
    expect(k.nach).toBe(pfad.knoten[i + 1].id);
    expect(k.deltaLevel).toBe(pfad.knoten[i + 1].level - pfad.knoten[i].level);
    expect(k.laengeM).toBeGreaterThanOrEqual(0);
  });
  expect(new Set(pfad.knoten.map((k) => k.id)).size).toBe(pfad.knoten.length);
}

describe('dekodierePolylinie', () => {
  it('Google-Beispiel mit Genauigkeit 5', () => {
    expect(dekodierePolylinie('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });
  it('leere Zeichenkette ergibt keine Punkte', () => expect(dekodierePolylinie('', 6)).toEqual([]));
  it('abgeschnittene Zeichenkette haengt nicht und wirft nicht', () => {
    expect(() => dekodierePolylinie('_p~iF~ps|U_', 5)).not.toThrow();
  });
  it('Genauigkeit 6 aus MOTIS: Punkte liegen in Berlin', () => {
    const leg = plan('plan-berlin-hbf-gleis7-bus').direct[0].legs[0];
    const punkte = dekodierePolylinie(leg.legGeometry.points, leg.legGeometry.precision);
    expect(punkte.length).toBe(leg.legGeometry.length);
    expect(punkte[0].lat).toBeCloseTo(52.525, 2);
    expect(punkte[0].lon).toBeCloseTo(13.369, 2);
  });
});

describe('pfadAusPlan', () => {
  it('Kassel A -> B: eben, rund 90 m, eine Ebene', () => {
    const pfad = pfadAusPlan(plan('plan-kassel-a-b'))!;
    pruefeInvariante(pfad);
    expect(pfad.kanten.every((k) => k.typ === 'eben')).toBe(true);
    expect(pfad.laengeM).toBeGreaterThan(80);
    expect(pfad.laengeM).toBeLessThan(110);
    expect(new Set(pfad.knoten.map((k) => k.level))).toEqual(new Set([0]));
  });

  it('Berlin Gleis 7 -> Bus: Treppe HOCH von -2 nach -1, obwohl MOTIS -1 -> -2 schreibt (Review Focus 3)', () => {
    const pfad = pfadAusPlan(plan('plan-berlin-hbf-gleis7-bus'))!;
    pruefeInvariante(pfad);
    const treppen = pfad.kanten.filter((k) => k.typ === 'treppe');
    expect(treppen).toHaveLength(1);
    expect(treppen[0].deltaLevel).toBe(1);
    expect(pfad.knoten[0].level).toBe(-2);
  });

  it('Berlin: Ebenensprung ohne Treppenschritt (-1 -> 0 am Washingtonplatz) wird Rampe, nicht Treppe', () => {
    const pfad = pfadAusPlan(plan('plan-berlin-hbf-gleis7-bus'))!;
    const rampen = pfad.kanten.filter((k) => k.typ === 'rampe');
    expect(rampen).toHaveLength(1);
    expect(rampen[0].deltaLevel).toBe(1);
    expect(rampen[0].barrierefrei).toBe(true);
    expect(pfad.knoten.at(-1)!.level).toBe(0);
  });

  it('Alexanderplatz Rollstuhl: Aufzuege statt Treppen, Ziel auf Ebene -3', () => {
    const pfad = pfadAusPlan(plan('plan-alexanderplatz-s-u8-rollstuhl'))!;
    pruefeInvariante(pfad);
    expect(pfad.kanten.some((k) => k.typ === 'treppe')).toBe(false);
    const aufzuege = pfad.kanten.filter((k) => k.typ === 'aufzug');
    expect(aufzuege.length).toBe(2);
    expect(aufzuege.every((k) => k.laengeM === 0)).toBe(true);
    expect(pfad.knoten.at(-1)!.level).toBe(-3);
  });

  it('Alexanderplatz zu Fuss: drei Treppen, alle abwaerts, Summe 1 -> -3', () => {
    const pfad = pfadAusPlan(plan('plan-alexanderplatz-s-u8'))!;
    pruefeInvariante(pfad);
    const treppen = pfad.kanten.filter((k) => k.typ === 'treppe');
    expect(treppen.length).toBe(3);
    expect(treppen.every((k) => k.deltaLevel < 0)).toBe(true);
    expect(treppen.reduce((s, k) => s + k.deltaLevel, 0)).toBe(-4);
    expect(treppen.every((k) => !k.barrierefrei)).toBe(true);
  });

  it('Laenge bleibt nah an der Angabe von MOTIS', () => {
    for (const name of ['plan-kassel-a-b', 'plan-berlin-hbf-gleis7-bus', 'plan-alexanderplatz-s-u8']) {
      const roh = plan(name);
      const pfad = pfadAusPlan(roh)!;
      const motisM = roh.direct[0].legs[0].distance!;
      expect(Math.abs(pfad.laengeM - motisM) / motisM).toBeLessThan(0.15);
    }
  });

  it('Treppe ohne Ebenenwechsel wird zum ebenen Stueck', () => {
    const roh = plan('plan-kassel-a-b');
    const leg = roh.direct[0].legs[0];
    leg.steps = [leg.steps![0], { ...leg.steps![1], relativeDirection: 'STAIRS', fromLevel: 0, toLevel: 0 }, ...leg.steps!.slice(2)];
    const pfad = pfadAusPlan(roh)!;
    pruefeInvariante(pfad);
    expect(pfad.kanten.some((k) => k.typ === 'treppe')).toBe(false);
  });

  it('Startebene kommt aus den Schritten, nicht aus einem abweichenden from.level (Review 2)', () => {
    const roh = plan('plan-kassel-a-b');
    const leg = roh.direct[0].legs[0];
    leg.from = { ...leg.from, level: 0 };
    leg.steps = leg.steps!.map((s) => ({ ...s, fromLevel: -1, toLevel: -1 }));
    const pfad = pfadAusPlan(roh)!;
    expect(pfad.knoten[0].level).toBe(-1);
    expect(pfad.kanten.every((k) => k.typ === 'eben')).toBe(true);
  });

  it('kein Weg: null', () => {
    expect(pfadAusPlan(plan('plan-kein-weg'))).toBeNull();
    expect(pfadAusPlan({ direct: [], itineraries: [] })).toBeNull();
    expect(pfadAusPlan({} as MotisPlanAntwort)).toBeNull();
    expect(pfadAusPlan(undefined as unknown as MotisPlanAntwort)).toBeNull();
  });
});
