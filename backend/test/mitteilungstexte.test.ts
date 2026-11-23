import { describe, expect, it } from 'vitest';
import {
  mitteilungsDaten,
  textAusfall,
  textErinnerung,
  textGleis,
  textRot,
  textZeitAb,
  textZeitAn,
  type TextZug,
} from '../src/core/mitteilungstexte.js';
import { berlinZeitpunktNahe } from '../src/core/zeit.js';

const RE3: TextZug = { anzeige: 'RE 3', uhr: '16:23', gleis: '6', richtung: 'Schwedt (Oder)' };
const ICE: TextZug = { anzeige: 'ICE 1134', uhr: '16:01', gleis: '8', richtung: 'Frankfurt(Main)Hbf' };

const alleBeispieltexte = [
  textRot(RE3, 6),
  textErinnerung('Berlin Hbf', RE3),
  textZeitAn(ICE, '16:01', '16:09', 14),
  textZeitAb(RE3, '16:23', '16:31'),
  textGleis(RE3, 'ab', 'Gleis', '6', '5'),
  textGleis(ICE, 'an', 'Gleis', '8', '9'),
  textGleis(RE3, 'ab', 'Steig', '2', '3'),
  textAusfall({ ...RE3, anzeige: 'Bus 245' }),
];

describe('Mitteilungstexte nach Konzept 4a', () => {
  it('liefert die Texte wörtlich', () => {
    expect(textRot(RE3, 6)).toEqual({ titel: 'Anschluss knapp', text: 'RE 3 in 6 Min. ab Gleis 6' });
    expect(textErinnerung('Berlin Hbf', RE3)).toEqual({ titel: 'Gleich in Berlin Hbf', text: 'RE 3: 16:23 ab Gleis 6' });
    expect(textZeitAn(ICE, '16:01', '16:09', 14)).toEqual({ titel: 'ICE 1134: 16:09 statt 16:01', text: '14 Min. zum Umsteigen' });
    expect(textZeitAb(RE3, '16:23', '16:31')).toEqual({ titel: 'RE 3: 16:31 statt 16:23', text: 'Anschluss erreichbar' });
    expect(textGleis(RE3, 'ab', 'Gleis', '6', '5')).toEqual({ titel: 'Gleis 5 statt 6', text: 'RE 3 nach Schwedt (Oder), ab 16:23' });
    expect(textGleis(ICE, 'an', 'Gleis', '8', '9')).toEqual({ titel: 'Gleis 9 statt 8', text: 'ICE 1134 aus Frankfurt(Main)Hbf, an 16:01' });
    expect(textGleis(RE3, 'ab', 'Steig', '2', '3').titel).toBe('Steig 3 statt 2');
    expect(textAusfall({ ...RE3, anzeige: 'Bus 245' })).toEqual({ titel: 'Bus 245 fällt aus', text: 'Andere Verbindung wählen' });
  });

  it('kein Satzpunkt, kein „Noch“, kein „Bitte“ in irgendeinem Text', () => {
    for (const t of alleBeispieltexte) expect(t.text).not.toMatch(/\.$|^Noch|Bitte/);
  });

  it('mitteilungsDaten: nur Strings, Zahlen als Dezimalstring', () => {
    expect(
      mitteilungsDaten({
        art: 'gleis-ab', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab', alt: '6', neu: '5',
        restMin: 9, gehMin: 4, status: 'erreichbar', stand: '15:56', gleisAlt: '6', gleisNeu: '5',
        aktion: 'weg', aktionGleis: '5',
      }),
    ).toEqual({
      art: 'gleis-ab', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab', alt: '6', neu: '5', restMin: '9', gehMin: '4',
      status: 'erreichbar', stand: '15:56', gleisAlt: '6', gleisNeu: '5', aktion: 'weg', aktionGleis: '5',
    });
  });

  it('lässt fehlende optionale Felder weg', () => {
    const d = mitteilungsDaten({
      art: 'rot', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab',
      restMin: 6, gehMin: 4, status: 'knapp', stand: '15:56', aktion: 'weg',
    });
    expect(Object.keys(d)).not.toContain('alt');
    expect(Object.values(d).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('berlinZeitpunktNahe', () => {
  const bezug = new Date('2026-11-23T22:52:00Z'); // 23:52 Berlin
  it('springt über Mitternacht zum nächstliegenden Zeitpunkt', () => {
    expect(berlinZeitpunktNahe('00:10', bezug).toISOString()).toBe('2026-11-23T23:10:00.000Z');
    expect(berlinZeitpunktNahe('23:40', bezug).toISOString()).toBe('2026-11-23T22:40:00.000Z');
  });
  it('geht rückwärts über Mitternacht', () => {
    const frueh = new Date('2026-11-23T23:05:00Z'); // 00:05 Berlin am 24.
    expect(berlinZeitpunktNahe('23:50', frueh).toISOString()).toBe('2026-11-23T22:50:00.000Z');
  });
  it('rechnet im Sommer mit +2 h', () => {
    const sommer = new Date('2026-07-15T12:00:00Z'); // 14:00 Berlin
    expect(berlinZeitpunktNahe('14:30', sommer).toISOString()).toBe('2026-07-15T12:30:00.000Z');
  });
  it('stimmt an der Umstellung auf Sommerzeit (29.03.2026)', () => {
    const bezug2 = new Date('2026-03-29T00:30:00Z'); // 01:30 Berlin (MEZ)
    expect(berlinZeitpunktNahe('03:10', bezug2).toISOString()).toBe('2026-03-29T01:10:00.000Z');
  });
  it('stimmt an der Umstellung auf Winterzeit (25.10.2026)', () => {
    const bezug3 = new Date('2026-10-24T23:00:00Z'); // 01:00 Berlin (MESZ)
    expect(berlinZeitpunktNahe('04:00', bezug3).toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });
});
