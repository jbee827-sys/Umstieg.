import { describe, it, expect } from 'vitest';
import {
  erzeugeMotisPausen,
  PAUSE_429_STANDARD_MS,
  PAUSE_HOECHSTENS_MS,
  PAUSE_STOERUNG_MS,
  retryAfterMs,
} from '../src/clients/motis-pausen.js';

const T0 = new Date('2026-10-16T12:00:00Z');

describe('retryAfterMs', () => {
  it('liest Sekunden', () => expect(retryAfterMs('120', T0)).toBe(120_000));
  it('liest ein HTTP-Datum', () =>
    expect(retryAfterMs('Fri, 16 Oct 2026 12:05:00 GMT', T0)).toBe(300_000));
  it('liefert null bei fehlendem oder unlesbarem Kopf', () => {
    expect(retryAfterMs(null, T0)).toBeNull();
    expect(retryAfterMs(undefined, T0)).toBeNull();
    expect(retryAfterMs('bald', T0)).toBeNull();
    expect(retryAfterMs('', T0)).toBeNull();
  });
  it('kein negativer Wert fuer ein Datum in der Vergangenheit', () =>
    expect(retryAfterMs('Fri, 16 Oct 2026 11:00:00 GMT', T0)).toBe(0));
});

describe('MotisPausen', () => {
  function pruefstand() {
    let jetzt = T0;
    const pausen = erzeugeMotisPausen({ jetzt: () => jetzt });
    return { pausen, weiter: (ms: number) => (jetzt = new Date(jetzt.getTime() + ms)) };
  }

  it('ist anfangs nicht pausiert', () => {
    expect(pruefstand().pausen.pausiertBis()).toBeNull();
  });

  it('429 mit Retry-After haelt genau so lange an', () => {
    const { pausen, weiter } = pruefstand();
    expect(pausen.merke({ status: 429, retryAfter: '90' })).toBe(90_000);
    weiter(89_000);
    expect(pausen.pausiertBis()).not.toBeNull();
    weiter(1_000);
    expect(pausen.pausiertBis()).toBeNull();
  });

  it('429 ohne Retry-After: Standardpause', () => {
    const { pausen } = pruefstand();
    expect(pausen.merke({ status: 429 })).toBe(PAUSE_429_STANDARD_MS);
  });

  it('429 mit Retry-After 0: trotzdem eine Standardpause, keine Schleife', () => {
    // Ein „sofort wieder“ waere genau die Einladung zur Wiederholungsschleife.
    const { pausen } = pruefstand();
    expect(pausen.merke({ status: 429, retryAfter: '0' })).toBe(PAUSE_429_STANDARD_MS);
  });

  it('kappt ein ueberlanges Retry-After', () => {
    const { pausen } = pruefstand();
    expect(pausen.merke({ status: 429, retryAfter: '86400' })).toBe(PAUSE_HOECHSTENS_MS);
  });

  it('5xx, Zeitueberschreitung und Netzfehler: kurze Pause', () => {
    for (const e of [
      { status: 503 },
      { status: 500 },
      { fehler: new DOMException('t', 'TimeoutError') },
      { fehler: new TypeError('fetch failed') },
    ]) {
      const { pausen } = pruefstand();
      expect(pausen.merke(e)).toBe(PAUSE_STOERUNG_MS);
      expect(pausen.pausiertBis()).not.toBeNull();
    }
  });

  it('4xx ausser 429 ist ein Fehler der Anfrage, keine Stoerung', () => {
    const { pausen } = pruefstand();
    expect(pausen.merke({ status: 400 })).toBe(0);
    expect(pausen.merke({ status: 404 })).toBe(0);
    expect(pausen.merke({ status: 422 })).toBe(0);
    expect(pausen.pausiertBis()).toBeNull();
  });

  it('eine laengere laufende Pause wird nicht verkuerzt', () => {
    const { pausen } = pruefstand();
    pausen.merke({ status: 429, retryAfter: '600' });
    pausen.merke({ status: 503 });
    expect(pausen.pausiertBis()!.getTime()).toBe(T0.getTime() + 600_000);
  });
});
