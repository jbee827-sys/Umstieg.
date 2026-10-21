import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  alsJson,
  berechneBahnhof,
  fremdeGleise,
  graphAus,
  pruefeSlugs,
  slugVon,
  type Bahnhofsdaten,
} from '../scripts/bahnhofsseiten-daten.js';
import type { BestandsEintrag } from '../src/osm/bestand.js';
import type { OverpassAntwort } from '../src/core/typen.js';

function eintrag(fixture: string, name = 'Testbahnhof Hbf'): BestandsEintrag {
  const pfad = fileURLToPath(new URL(`./fixtures/${fixture}.json`, import.meta.url));
  return {
    schluessel: '8000001',
    name,
    lat: 52.0004,
    lon: 12.001,
    geholtAm: '2026-10-13T18:19:12.496Z',
    abfrageVersion: 'test',
    osm: JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort,
  };
}

function rechne(fixture: string): Bahnhofsdaten {
  const e = eintrag(fixture);
  const daten = berechneBahnhof(e, graphAus(e));
  if (!daten) throw new Error(`${fixture}: keine Daten`);
  return daten;
}

/**
 * Konzept Nutzergewinnung AP 5a: Gehzeiten je Gleispaar, offline aus dem
 * Startbestand vorberechnet - dieselben Bausteine wie /api/route.
 */
describe('berechneBahnhof', () => {
  // Mini-Bahnhof: Gleis 1 allein, Gleise 2 und 3 an einem Bahnsteig,
  // dazwischen eine Unterfuehrung mit Treppen; ein Aufzug nur auf der Seite
  // von 2/3.
  const mini = rechne('synthetisch/mini-bahnhof');

  it('traegt die Kopfdaten des Bestandseintrags', () => {
    expect(mini).toMatchObject({
      name: 'Testbahnhof Hbf',
      eva: '8000001',
      slug: 'testbahnhof-hbf',
      lat: 52.0004,
      lon: 12.001,
      geholtAm: '2026-10-13T18:19:12.496Z',
    });
    expect([1, 2]).toContain(mini.stufe);
    expect(mini.gleise).toEqual(['1', '2', '3']);
  });

  it('rechnet jedes geordnete Gleispaar: n·(n−1)', () => {
    const n = mini.gleise.length;
    expect(mini.paare).toHaveLength(n * (n - 1));
    const schluessel = new Set(mini.paare.map((p) => `${p.von}>${p.nach}`));
    expect(schluessel.size).toBe(n * (n - 1));
    expect(mini.paare.every((p) => p.von !== p.nach)).toBe(true);
  });

  it('hat fuer jedes Paar eine Gehzeit ueber null, in Sekunden', () => {
    for (const p of mini.paare) {
      expect(p.sek, `${p.von}→${p.nach}`).not.toBeNull();
      expect(p.sek!).toBeGreaterThan(0);
      expect(Number.isInteger(p.sek)).toBe(true);
    }
  });

  it('erkennt den gemeinsamen Bahnsteig', () => {
    const paar = mini.paare.find((p) => p.von === '2' && p.nach === '3')!;
    expect(paar.gleicherBahnsteig).toBe(true);
    expect(mini.paare.find((p) => p.von === '1' && p.nach === '2')!.gleicherBahnsteig).toBe(false);
  });

  it('beschreibt den Weg: Treppe, Unterfuehrung, zwei Ebenenwechsel', () => {
    const paar = mini.paare.find((p) => p.von === '1' && p.nach === '2')!;
    expect(paar.anlagen).toContain('treppe');
    expect(paar.lage).toBe('unterfuehrung');
    expect(paar.wechsel).toBeGreaterThanOrEqual(2);
  });

  // Von Gleis 1 fuehrt nur eine Treppe hinab - stufenfrei geht es nicht.
  it('kennt kein stufenfreies Ziel, wo nur Treppen fuehren', () => {
    expect(mini.paare.find((p) => p.von === '1' && p.nach === '2')!.stufenfreiSek).toBeNull();
  });

  it('rechnet stufenfrei ueber Aufzuege - nie schneller als der schnellste Weg', () => {
    const aufzug = rechne('synthetisch/mini-bahnhof-aufzug');
    const paar = aufzug.paare.find((p) => p.von === '1' && p.nach === '2')!;
    expect(paar.stufenfreiSek).not.toBeNull();
    for (const p of [...aufzug.paare, ...mini.paare]) {
      if (p.stufenfreiSek !== null) expect(p.stufenfreiSek).toBeGreaterThanOrEqual(p.sek!);
    }
  });

  it('rechnet einen echten Bahnhof (Guetersloh) vollstaendig', () => {
    const g = rechne('overpass/guetersloh');
    expect(g.gleise.length).toBeGreaterThanOrEqual(2);
    expect(g.paare).toHaveLength(g.gleise.length * (g.gleise.length - 1));
    for (const p of g.paare) {
      if (p.sek !== null) expect(p.sek).toBeGreaterThan(0);
      if (p.stufenfreiSek !== null) expect(p.stufenfreiSek).toBeGreaterThanOrEqual(p.sek!);
    }
  });

  // Stufe 3 = Standardmodell: Die Werte waeren nur geschaetzt (Konzept 5a.2).
  it('liefert fuer Stufe 3 nichts', () => {
    const leer: BestandsEintrag = { ...eintrag('synthetisch/mini-bahnhof'), osm: { elements: [] } as unknown as OverpassAntwort };
    expect(berechneBahnhof(leer, graphAus(leer))).toBeNull();
  });

  it('laesst Gleise weg, die einem anderen Bahnhof gehoeren', () => {
    const e = eintrag('synthetisch/mini-bahnhof');
    const ohne3 = berechneBahnhof(e, graphAus(e), new Set(['3']))!;
    expect(ohne3.gleise).toEqual(['1', '2']);
    expect(ohne3.paare).toHaveLength(2);
  });
});

describe('slugVon (Konzept 5a.5)', () => {
  it.each([
    ['Wiesenburg (Mark)', 'wiesenburg-mark'],
    ['Frankfurt (Main) Hbf', 'frankfurt-main-hbf'],
    ['Frankfurt(Main)Hbf', 'frankfurt-main-hbf'],
    ['Hannover Hbf', 'hannover-hbf'],
    ['Köln Hbf', 'koeln-hbf'],
    ['München Hbf', 'muenchen-hbf'],
    ['Gießen', 'giessen'],
    ['Überlingen', 'ueberlingen'],
    ['Frankfurt(M) Flughafen Fernbf', 'frankfurt-m-flughafen-fernbf'],
    ['Halle (Saale) Hbf', 'halle-saale-hbf'],
    ['Berlin Ostkreuz', 'berlin-ostkreuz'],
    ['Lindau-Insel', 'lindau-insel'],
    ['  Stuttgart  Hbf. ', 'stuttgart-hbf'],
  ])('%s → %s', (name, slug) => {
    expect(slugVon(name)).toBe(slug);
  });
});

describe('pruefeSlugs', () => {
  it('bricht bei zwei Bahnhoefen mit demselben Kurznamen ab', () => {
    expect(() =>
      pruefeSlugs([
        { name: 'Frankfurt (Main) Hbf', slug: 'frankfurt-main-hbf' },
        { name: 'Frankfurt(Main)Hbf', slug: 'frankfurt-main-hbf' },
      ]),
    ).toThrow(/frankfurt-main-hbf/);
  });

  it('laesst eindeutige Kurznamen durch', () => {
    expect(() => pruefeSlugs([{ name: 'A', slug: 'a' }, { name: 'B', slug: 'b' }])).not.toThrow();
  });
});

/**
 * Im Startbestand fuehrt OSM die Gleise 5-34 von München Hbf auch unter
 * München Hackerbrücke (deren eigene sind 1 und 2), dazu 51-56 unter
 * Karlsplatz. Eine Seite „Umsteigen in München Hackerbrücke" mit Gleis 34
 * waere falsch. Liegt dieselbe Bahnsteigmitte unter zwei Bahnhoefen, gehoert
 * sie dem mit mehr Gleisen; bei Gleichstand (Frankfurt Flughafen Fern- und
 * Regionalbahnhof, ein Gebaeude) beiden.
 */
describe('fremdeGleise', () => {
  const punkt = (lat: number, lon: number) => ({ lat, lon });
  const hbf = {
    schluessel: 'hbf',
    gleise: new Map([
      ['5', punkt(48.1405, 11.555)],
      ['6', punkt(48.1406, 11.555)],
      ['7', punkt(48.1407, 11.555)],
      ['8', punkt(48.1408, 11.555)],
    ]),
  };
  const hacker = {
    schluessel: 'hacker',
    gleise: new Map([
      ['1', punkt(48.142, 11.5486)],
      ['5', punkt(48.1405, 11.555)],
      ['6', punkt(48.14060004, 11.55500004)],
    ]),
  };

  it('nimmt dem kleineren Bahnhof die gemeinsamen Gleise', () => {
    const fremd = fremdeGleise([hbf, hacker]);
    expect([...(fremd.get('hacker') ?? [])].sort()).toEqual(['5', '6']);
    expect(fremd.get('hbf')?.size ?? 0).toBe(0);
  });

  it('laesst bei Gleichstand beiden alle Gleise', () => {
    const fern = { schluessel: 'fern', gleise: new Map([['Fern 4', punkt(50.05, 8.57)], ['Regio 1', punkt(50.051, 8.571)]]) };
    const regio = { schluessel: 'regio', gleise: new Map([['Fern 4', punkt(50.05, 8.57)], ['Regio 1', punkt(50.051, 8.571)]]) };
    const fremd = fremdeGleise([fern, regio]);
    expect(fremd.get('fern')?.size ?? 0).toBe(0);
    expect(fremd.get('regio')?.size ?? 0).toBe(0);
  });

  it('trennt gleichnamige Gleise, die weit auseinander liegen', () => {
    const anderer = { schluessel: 'anderer', gleise: new Map([['5', punkt(52.5, 13.4)]]) };
    expect(fremdeGleise([hbf, anderer]).get('anderer')?.size ?? 0).toBe(0);
  });
});

describe('alsJson', () => {
  it('ist gueltiges JSON mit einem Gleispaar je Zeile', () => {
    const mini = rechne('synthetisch/mini-bahnhof');
    const text = alsJson(mini);
    expect(JSON.parse(text)).toEqual(mini);
    expect(text.split('\n').filter((z) => z.includes('"von"'))).toHaveLength(mini.paare.length);
  });
});
