import { describe, it, expect } from 'vitest';
import { Ueberwachung } from '../src/core/ueberwachung.js';

describe('Ueberwachung: Platzreservierung', () => {
  it('zaehlt reservierte Schluessel als belegt', () => {
    const u = new Ueberwachung(async () => [], 30_000, undefined, 2);
    const frei = u.reserviere(['8011160']);
    expect(u.hatKapazitaetFuerAlle(['8000105', '8000261'])).toBe(false);
    expect(u.hatKapazitaetFuer('8000105')).toBe(true);
    frei();
    expect(u.hatKapazitaetFuerAlle(['8000105', '8000261'])).toBe(true);
  });
  it('belegt mit Reservierung und Abo fuer denselben Schluessel nur einen Platz', () => {
    const u = new Ueberwachung(async () => [], 30_000, undefined, 2);
    u.reserviere(['8011160']);
    const ab = u.abonniere('8011160', [], () => {});
    expect(u.hatKapazitaetFuer('8000105')).toBe(true);
    ab();
  });
  it('gibt eine doppelt reservierte Stelle erst nach beiden Freigaben frei', () => {
    const u = new Ueberwachung(async () => [], 30_000, undefined, 1);
    const a = u.reserviere(['8011160']);
    const b = u.reserviere(['8011160']);
    a();
    a();
    expect(u.hatKapazitaetFuer('8000105')).toBe(false);
    b();
    expect(u.hatKapazitaetFuer('8000105')).toBe(true);
  });
});

describe('Ueberwachung.stand', () => {
  it('liefert den letzten Tafelstand eines Schluessels, leer vor dem ersten Abruf', async () => {
    const eintrag = { zug: 'RE 3352', zeitSoll: '16:23', gleisSoll: '6', ziel: 'Schwedt (Oder)' };
    const u = new Ueberwachung(async () => [eintrag], 30_000, undefined, 2);
    expect(u.stand('8011160')).toEqual([]);
    const ab = u.abonniere('8011160', [], () => {});
    await u.pruefeJetzt('8011160');
    expect(u.stand('8011160')).toEqual([eintrag]);
    ab();
    expect(u.stand('8011160')).toEqual([]);
  });
});
