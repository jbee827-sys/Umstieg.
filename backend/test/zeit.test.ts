import { describe, it, expect } from 'vitest';
import { berlinTeile } from '../src/core/zeit.js';

// Die DB-Fahrplandaten sind in DEUTSCHER Ortszeit definiert. Der Container
// laeuft in UTC. Ohne explizite Zone fragt der Server im Sommer die Stunde von
// vor zwei Stunden ab - live gemessen am 30.08.2026: echte Zeit 17:26,
// geliefert wurden Zuege von 15:04 bis 15:53, alle laengst abgefahren.
describe('berlinTeile', () => {
  it('Sommerzeit: UTC+2', () => {
    expect(berlinTeile(new Date('2026-08-30T15:26:00Z'))).toEqual({
      jahr: '2026',
      monat: '08',
      tag: '30',
      stunde: '17',
    });
  });

  it('Winterzeit: UTC+1', () => {
    expect(berlinTeile(new Date('2026-01-15T15:26:00Z'))).toEqual({
      jahr: '2026',
      monat: '01',
      tag: '15',
      stunde: '16',
    });
  });

  it('ueber Mitternacht springt auch das Datum', () => {
    // 22:30 UTC im Sommer = 00:30 des Folgetags in Berlin
    expect(berlinTeile(new Date('2026-08-30T22:30:00Z'))).toEqual({
      jahr: '2026',
      monat: '08',
      tag: '31',
      stunde: '00',
    });
  });

  it('Jahreswechsel', () => {
    // 23:30 UTC am 31.12. im Winter = 00:30 am 01.01. des Folgejahres
    expect(berlinTeile(new Date('2026-12-31T23:30:00Z'))).toEqual({
      jahr: '2027',
      monat: '01',
      tag: '01',
      stunde: '00',
    });
  });

  it('Mittag bleibt Mittag', () => {
    expect(berlinTeile(new Date('2026-06-01T10:00:00Z')).stunde).toBe('12');
  });
});
