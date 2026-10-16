import { describe, it, expect, vi, afterEach } from 'vitest';
import { erzeugeAnfragezaehler } from '../src/core/anfragezaehler.js';

afterEach(() => vi.useRealTimers());

describe('Anfragezaehler', () => {
  it('zaehlt je Endpunkt und schreibt die Summe der Stunde ins Protokoll', () => {
    const info = vi.fn();
    const z = erzeugeAnfragezaehler({ log: { info }, jetzt: () => new Date('2026-10-16T14:59:00Z'), intervallMs: 0 });
    z.zaehle('geocode');
    z.zaehle('geocode');
    z.zaehle('stoptimes');
    z.schreibe();
    expect(info).toHaveBeenCalledWith(
      { ereignis: 'motis-anfragen', stunde: '2026-10-16T14', je: { geocode: 2, stoptimes: 1 }, summe: 3 },
      'MOTIS-Anfragen der Stunde',
    );
    expect(z.stand()).toEqual({});
    z.beende();
  });

  it('schreibt nichts, wenn nichts gezaehlt wurde', () => {
    const info = vi.fn();
    const z = erzeugeAnfragezaehler({ log: { info }, intervallMs: 0 });
    z.schreibe();
    expect(info).not.toHaveBeenCalled();
    z.beende();
  });

  it('der Stand ist eine Kopie, kein Zugriff auf das Innere', () => {
    const z = erzeugeAnfragezaehler({ intervallMs: 0 });
    z.zaehle('plan');
    z.stand().plan = 99;
    expect(z.stand()).toEqual({ plan: 1 });
  });

  it('schreibt stuendlich von selbst und hoert nach beende() auf', () => {
    vi.useFakeTimers();
    const info = vi.fn();
    const z = erzeugeAnfragezaehler({ log: { info } });
    z.zaehle('plan');
    vi.advanceTimersByTime(60 * 60_000);
    expect(info).toHaveBeenCalledTimes(1);
    z.beende();
    z.zaehle('plan');
    vi.advanceTimersByTime(60 * 60_000);
    expect(info).toHaveBeenCalledTimes(1);
  });
});
