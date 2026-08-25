import { describe, it, expect } from 'vitest';
import { ampel, berechnePuffer, gehzeitSekunden } from '../src/core/gehzeit.js';
import type { GraphKante, KantenTyp, RoutenPfad } from '../src/core/typen.js';

const kante = (typ: KantenTyp, laengeM: number, deltaLevel = 0): GraphKante => ({
  von: 'a', nach: 'b', laengeM, deltaLevel, typ, barrierefrei: typ !== 'treppe',
});

const pfad = (...kanten: GraphKante[]): RoutenPfad => ({
  knoten: [],
  kanten,
  laengeM: kanten.reduce((s, k) => s + k.laengeM, 0),
});

describe('gehzeitSekunden', () => {
  it('100 m eben, Profil normal → 100 s', () => {
    expect(gehzeitSekunden(pfad(kante('eben', 100)), 'normal')).toBe(100);
  });

  it('100 m + Treppe hoch, Profil zügig → round(100/1.4) + 20 = 91 s', () => {
    expect(gehzeitSekunden(pfad(kante('eben', 100), kante('treppe', 0, 1)), 'zuegig')).toBe(91);
  });

  it('60 m eben, Profil langsam → 100 s', () => {
    expect(gehzeitSekunden(pfad(kante('eben', 60)), 'langsam')).toBe(100);
  });

  it('Zuschläge: Rolltreppe +10, Aufzug +60, Rampe +0', () => {
    expect(gehzeitSekunden(pfad(kante('eben', 100), kante('rolltreppe', 0, -1)), 'normal')).toBe(110);
    expect(gehzeitSekunden(pfad(kante('eben', 100), kante('aufzug', 0, 1)), 'normal')).toBe(160);
    expect(gehzeitSekunden(pfad(kante('eben', 50), kante('rampe', 50, 1)), 'normal')).toBe(100);
  });

  it('Treppenlänge zählt zusätzlich zum Zuschlag', () => {
    expect(gehzeitSekunden(pfad(kante('eben', 50), kante('treppe', 15, -1)), 'normal')).toBe(85);
  });
});

describe('ampel – relativ zur Gehzeit (Konzeptkorrektur 4)', () => {
  it('Umstiegszeit ≥ 2× Gehzeit → grün (Grenze inklusiv)', () => {
    expect(ampel(200, 100)).toBe('gruen');
    expect(ampel(201, 100)).toBe('gruen');
  });

  it('Umstiegszeit zwischen 1× und 2× Gehzeit → gelb', () => {
    expect(ampel(199, 100)).toBe('gelb');
    expect(ampel(150, 100)).toBe('gelb');
    expect(ampel(100, 100)).toBe('gelb'); // exakt 1× ist noch erreichbar
  });

  it('Umstiegszeit < 1× Gehzeit → rot', () => {
    expect(ampel(99, 100)).toBe('rot');
    expect(ampel(-30, 100)).toBe('rot');
  });

  it('Gehzeit 0 (gleicher Bahnsteig) → grün bei nichtnegativer Umstiegszeit', () => {
    expect(ampel(60, 0)).toBe('gruen');
    expect(ampel(0, 0)).toBe('gruen');
    expect(ampel(-1, 0)).toBe('rot');
  });
});

describe('berechnePuffer', () => {
  it('Abfahrt 5 min nach Ankunft, Gehzeit 120 s → Puffer 180 s', () => {
    const ankunft = new Date('2026-08-25T10:00:00Z');
    const abfahrt = new Date('2026-08-25T10:05:00Z');
    expect(berechnePuffer(abfahrt, ankunft, 120)).toBe(180);
  });

  it('negativer Puffer, wenn Gehzeit die Umstiegszeit übersteigt', () => {
    const ankunft = new Date('2026-08-25T10:00:00Z');
    const abfahrt = new Date('2026-08-25T10:02:00Z');
    expect(berechnePuffer(abfahrt, ankunft, 180)).toBe(-60);
  });
});
