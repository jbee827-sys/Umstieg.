import { describe, it, expect } from 'vitest';
import { erzeugeTimetablesBudget } from '../src/clients/timetables-budget.js';

/** Eine Uhr, die nur weitergeht, wenn der Test es sagt. */
function uhr(start = Date.parse('2026-10-24T12:00:00Z')) {
  let t = start;
  return { jetzt: () => new Date(t), vor: (ms: number) => void (t += ms) };
}

describe('Timetables-Budget', () => {
  it('erlaubt hoechstens proMinute Aufrufe in einer gleitenden Minute', () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 5, tafelAnteil: 5 });
    for (let i = 0; i < 5; i++) expect(budget.nimm('live')).toBe(true);
    expect(budget.nimm('live')).toBe(false);

    // 59 s spaeter liegen alle fuenf noch im Fenster ...
    u.vor(59_000);
    expect(budget.nimm('live')).toBe(false);
    // ... nach 60 s ist es wieder frei.
    u.vor(1_000);
    expect(budget.nimm('live')).toBe(true);
  });

  it('laesst die Tafel nur bis zu ihrem Anteil zu - der Rest bleibt dem Live-Poller', () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 5, tafelAnteil: 3 });
    for (let i = 0; i < 3; i++) expect(budget.nimm('tafel')).toBe(true);
    expect(budget.nimm('tafel')).toBe(false);
    expect(budget.nimm('live')).toBe(true);
    expect(budget.nimm('live')).toBe(true);
    expect(budget.nimm('live')).toBe(false);
  });

  it('abgelehnte Versuche verbrauchen nichts', () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 2, tafelAnteil: 1 });
    expect(budget.nimm('tafel')).toBe(true);
    for (let i = 0; i < 10; i++) expect(budget.nimm('tafel')).toBe(false);
    expect(budget.nimm('live')).toBe(true);
  });

  it('nach HTTP 429 geht bis Retry-After nichts hinaus', () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt });
    budget.merke429('30');
    expect(budget.nimm('live')).toBe(false);
    u.vor(29_000);
    expect(budget.nimm('live')).toBe(false);
    u.vor(1_000);
    expect(budget.nimm('live')).toBe(true);
  });

  it('ohne lesbares Retry-After pausiert 429 eine volle Minute', () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt });
    budget.merke429(null);
    u.vor(59_000);
    expect(budget.nimm('live')).toBe(false);
    u.vor(1_000);
    expect(budget.nimm('live')).toBe(true);
  });

  it('die Voreinstellung bleibt unter dem DB-Limit von 60 je Minute', () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt });
    let erlaubt = 0;
    while (budget.nimm('live')) erlaubt++;
    expect(erlaubt).toBeGreaterThan(40);
    expect(erlaubt).toBeLessThan(60);
  });
});
