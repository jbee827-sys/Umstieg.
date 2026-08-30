import { describe, it, expect } from 'vitest';
import { aktiverSchritt } from './fortschritt';
import type { Schritt } from '../api/typen';

/** Drei Schritte a 30 s – deutlich ueber MINDEST_SCHRITT_MS. */
function schritte(): Schritt[] {
  return [
    { text: 'eins', typ: 'eben', sekunden: 30 },
    { text: 'zwei', typ: 'treppe', sekunden: 30 },
    { text: 'drei', typ: 'eben', sekunden: 30 },
  ];
}

describe('aktiverSchritt', () => {
  it('startet beim ersten Schritt', () => {
    expect(aktiverSchritt(schritte(), 1000, 1000, 0)).toBe(0);
  });

  it('bleibt bis zur Sekunde vor dem Uebergang beim ersten', () => {
    expect(aktiverSchritt(schritte(), 0, 29_999, 0)).toBe(0);
  });

  it('wechselt exakt am Uebergang', () => {
    expect(aktiverSchritt(schritte(), 0, 30_000, 0)).toBe(1);
  });

  it('erreicht den letzten Schritt', () => {
    expect(aktiverSchritt(schritte(), 0, 65_000, 0)).toBe(2);
  });

  it('laeuft nicht ueber das Listenende hinaus', () => {
    expect(aktiverSchritt(schritte(), 0, 999_999, 0)).toBe(2);
  });

  it('vor der Startzeit bleibt es beim ersten Schritt', () => {
    expect(aktiverSchritt(schritte(), 10_000, 0, 0)).toBe(0);
  });

  it('der Versatz verschiebt den Vorschlag nach vorn', () => {
    expect(aktiverSchritt(schritte(), 0, 0, 2)).toBe(2);
  });

  it('der Versatz verschiebt auch zurueck', () => {
    expect(aktiverSchritt(schritte(), 0, 65_000, -2)).toBe(0);
  });

  it('der Versatz wird an beiden Enden begrenzt', () => {
    expect(aktiverSchritt(schritte(), 0, 0, -5)).toBe(0);
    expect(aktiverSchritt(schritte(), 0, 0, 99)).toBe(2);
  });

  it('sehr kurze Schritte bekommen die Mindestanzeigedauer', () => {
    const kurz: Schritt[] = [
      { text: 'kurz', typ: 'eben', sekunden: 2 },
      { text: 'lang', typ: 'eben', sekunden: 60 },
    ];
    // Ohne Untergrenze waere nach 3 s schon Schritt 2 dran.
    expect(aktiverSchritt(kurz, 0, 3_000, 0)).toBe(0);
    expect(aktiverSchritt(kurz, 0, 8_000, 0)).toBe(1);
  });

  it('ohne sekunden zaehlt allein der Versatz - Degradation', () => {
    const ohneZeit: Schritt[] = [
      { text: 'eins', typ: 'eben' },
      { text: 'zwei', typ: 'eben' },
    ];
    expect(aktiverSchritt(ohneZeit, 0, 999_999, 0)).toBe(0);
    expect(aktiverSchritt(ohneZeit, 0, 999_999, 1)).toBe(1);
  });

  it('leere Schrittliste -> 0', () => {
    expect(aktiverSchritt([], 0, 1000, 0)).toBe(0);
  });
});
