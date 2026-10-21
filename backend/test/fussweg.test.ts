import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pfadAusPlan } from '../src/clients/motis-weg.js';
import { UMWEGFAKTOR, wegAusLuftlinie, wegAusPfad } from '../src/core/fussweg.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';

const pfad = (n: string) => pfadAusPlan(JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${n}.json`, import.meta.url)), 'utf8')))!;

describe('wegAusPfad', () => {
  it('Normalfall Kassel: Schritte, Gehzeit wie im Bahnhofspfad, Summe der Schritte = Gehzeit', () => {
    const p = pfad('plan-kassel-a-b');
    const w = wegAusPfad(p, 'normal', 'zu Steig B');
    expect(w.herkunft).toBe('fussweg');
    expect(w.gehzeitSek).toBe(gehzeitSekunden(p, 'normal'));
    expect(w.schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0)).toBe(w.gehzeitSek);
    expect(w.schritte.at(-1)!.text).toMatch(/zu Steig B$/);
    expect(w.schritte[0].text).toMatch(/^Nach Ausstieg/);
  });

  it('Ebenenwechsel Berlin: eigener Treppenschritt „hoch zur Ebene -1“', () => {
    const w = wegAusPfad(pfad('plan-berlin-hbf-gleis7-bus'), 'normal');
    const treppe = w.schritte.find((s) => s.typ === 'treppe')!;
    expect(treppe.text).toMatch(/Treppe hoch zur (Unterführung \(-1\)|Ebene -1)/);
    expect(Object.keys(w.karte!)).toContain('-2');
  });

  it('Rollstuhl Alexanderplatz: Aufzugsschritte', () => {
    const w = wegAusPfad(pfad('plan-alexanderplatz-s-u8-rollstuhl'), 'normal');
    expect(w.schritte.filter((s) => s.typ === 'aufzug').length).toBe(2);
  });
});

describe('wegAusLuftlinie', () => {
  it('kein Weg gefunden: Luftlinie mal 1,3, Hinweis, Stufe 3', () => {
    const von = { lat: 51.31263, lon: 9.49286 };
    const nach = { lat: 51.31363, lon: 9.49286 };
    const w = wegAusLuftlinie(von, nach, 'normal');
    expect(w.herkunft).toBe('luftlinie');
    expect(w.stufe).toBe(3);
    expect(w.distanzM).toBe(Math.round(111.2 * UMWEGFAKTOR));
    expect(w.gehzeitSek).toBe(Math.round(w.distanzM / 1.0));
    expect(w.hinweise[0]).toMatch(/ungefährer Weg/);
    expect(w.schritte).toHaveLength(1);
  });
});

describe('wegAusPfad: Goettingen Gleis 10 -> Bus am ZOB (21.10.2026)', () => {
  it('aus 14 kleinen Schritten werden hoechstens 7', () => {
    const plan = JSON.parse(
      readFileSync(fileURLToPath(new URL('./fixtures/motis/plan-goettingen-gleis10-zob.json', import.meta.url)), 'utf8'),
    );
    const weg = wegAusPfad(pfadAusPlan(plan)!, 'normal', 'zu Steig A (Bus 21)');
    expect(weg.schritte.length).toBeLessThanOrEqual(7);
    expect(weg.schritte.filter((s) => /Treppe/.test(s.text))).toHaveLength(1);
    expect(weg.schritte.some((s) => /wenige Meter/i.test(s.text))).toBe(false);
  });
});
