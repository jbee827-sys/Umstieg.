import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  alsJson,
  berechneBahnhof,
  fremdeGleise,
  graphAus,
  pruefeSlugs,
  slugVon,
  ubahnNamePasst,
  ubahnSchluessel,
  ubahnSteigeDesBahnhofs,
  type Bahnhofsdaten,
} from '../scripts/bahnhofsseiten-daten.js';
import { entpackeEintrag, type BestandsEintrag } from '../src/osm/bestand.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

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

  // Saarlouis Hbf (Stand 13.10.2026): OSM kennt nur Gleis 1 - eine Seite
  // ohne ein einziges Gleispaar waere leer.
  it('liefert nichts fuer weniger als zwei Gleise', () => {
    const e = eintrag('synthetisch/mini-bahnhof');
    expect(berechneBahnhof(e, graphAus(e), new Set(['2', '3']))).toBeNull();
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

  // Schlussreview 04.11.2026: Seit die DB-Namen gelten, heisst derselbe
  // Bahnsteig unter zwei Bahnhoefen verschieden. München Hbf (tief) r5370442
  // ist dort Gleis „1“, unter Karlsplatz (dessen eigener Bahnsteig per IFOPT
  // „1“/„2“ wurde) blieb er „81“/„82“ - und stand auf der Karlsplatz-Seite.
  it('erkennt denselben Bahnsteig an seiner Kennung, auch unter anderem Namen', () => {
    const mitte = { ...punkt(48.1405, 11.558), bahnsteigId: 'r5370442' };
    const gross = {
      schluessel: 'hbf',
      gleise: new Map([
        ['1', mitte],
        ['2', { ...punkt(48.14059, 11.558), bahnsteigId: 'r5370441' }],
        ['11', { ...punkt(48.141, 11.559), bahnsteigId: 'w11' }],
        ['12', { ...punkt(48.1411, 11.559), bahnsteigId: 'w12' }],
      ]),
    };
    const klein = {
      schluessel: 'karlsplatz',
      gleise: new Map([
        ['1', { ...punkt(48.139, 11.566), bahnsteigId: 'r3230775' }],
        ['81', mitte],
        ['82', mitte],
      ]),
    };
    expect([...(fremdeGleise([gross, klein]).get('karlsplatz') ?? [])].sort()).toEqual(['81', '82']);
  });

  it('zwei verschiedene Bahnsteige mit Kennung bleiben getrennt, auch dicht beieinander', () => {
    const gross = {
      schluessel: 'gross',
      gleise: new Map([
        ['1', { ...punkt(48.14, 11.55), bahnsteigId: 'r1' }],
        ['2', { ...punkt(48.15, 11.55), bahnsteigId: 'r2' }],
      ]),
    };
    const klein = { schluessel: 'klein', gleise: new Map([['7', { ...punkt(48.14005, 11.55), bahnsteigId: 'r7' }]]) };
    expect(fremdeGleise([gross, klein]).get('klein')?.size ?? 0).toBe(0);
  });

  it('zaehlt fuer „mehr Gleise“ nur Gleise, keine U-Bahn-Steige', () => {
    // Karlsplatz: 2 Gleise und 3 U-Bahn-Steige, Hbf: 4 Gleise. Mit den Steigen
    // gerechnet waere Karlsplatz der groessere Bahnhof.
    const geteilt = { ...punkt(48.1405, 11.558), bahnsteigId: 'r5370442' };
    const gross = {
      schluessel: 'hbf',
      gleise: new Map([
        ['1', geteilt],
        ['2', { ...punkt(48.1406, 11.558), bahnsteigId: 'r2' }],
        ['3', { ...punkt(48.1407, 11.558), bahnsteigId: 'r3' }],
        ['4', { ...punkt(48.1408, 11.558), bahnsteigId: 'r4' }],
      ]),
    };
    const klein = {
      schluessel: 'karlsplatz',
      gleise: new Map([
        ['81', geteilt],
        ['5', { ...punkt(48.139, 11.566), bahnsteigId: 'r5' }],
        [ubahnSchluessel('w1'), { ...punkt(48.1391, 11.566), bahnsteigId: 'w1' }],
        [ubahnSchluessel('w2'), { ...punkt(48.1392, 11.566), bahnsteigId: 'w2' }],
        [ubahnSchluessel('w3'), { ...punkt(48.1393, 11.566), bahnsteigId: 'w3' }],
      ]),
    };
    const fremd = fremdeGleise([gross, klein]);
    expect([...(fremd.get('karlsplatz') ?? [])]).toEqual(['81']);
    expect(fremd.get('hbf')?.size ?? 0).toBe(0);
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

/**
 * Spec 6.2/6.3: Gleisarten und U-Bahn-Steige in den Seitendaten. Die OSM-Daten
 * kommen aus dem eingecheckten Bestand, die DB-Gleisliste als kleine Fixture
 * (Auszug aus der RIS-Antwort vom 02.10.2026, osm-ablage/db-roh/8000261.json:
 * 8098263 „München Hbf (tief)“ fuehrt „1“/„2“ unter den Kennungen 81/82).
 */
describe('Gleisarten und U-Bahn (Spec 6.2/6.3)', () => {
  const lade = async (schluessel: string): Promise<BestandsEintrag> =>
    entpackeEintrag(readFileSync(fileURLToPath(new URL(`../osm-bestand/${schluessel}.json.gz`, import.meta.url))));
  const gleis = (name: string, evas: string[], ifopt?: string) => ({
    gleis: name,
    evas,
    ris: { name, ...(ifopt ? { ifopt: `de:09162:${ifopt}` } : {}) },
  });
  const muenchenDb: StationsInfo = {
    eva: '8000261',
    name: 'München Hbf',
    evas: ['8000261', '8098263'],
    sbahnEvas: ['8098263'],
    gleise: [
      gleis('5', ['8000261']),
      gleis('11', ['8000261'], '100:11:11'),
      gleis('1', ['8098263'], '6:40:81'),
      gleis('2', ['8098263'], '6:40:82'),
    ],
  };

  let muenchen: BestandsEintrag;
  let hamburg: BestandsEintrag;
  beforeAll(async () => {
    muenchen = await lade('8000261');
    hamburg = await lade('8002549');
  });

  it('München Hbf: gleisArt 1/2 sbahn, ubahn mit 3 Steigen', () => {
    const daten = berechneBahnhof(muenchen, graphAus(muenchen, muenchenDb))!;
    expect(daten.gleise).toEqual(expect.arrayContaining(['1', '2', '11']));
    expect(daten.gleise).not.toContain('81');
    expect(daten.gleisArt['1']).toBe('sbahn');
    expect(daten.gleisArt['2']).toBe('sbahn');
    expect(daten.gleisArt['11']).toBe('zug');
    expect(Object.keys(daten.gleisArt).sort()).toEqual([...daten.gleise].sort());
    expect(daten.ubahn.map((u) => u.label).sort()).toEqual(['U1 U2 U7 U8', 'U1 U2 U7 U8', 'U4 U5']);
    // Je Steig ein Paar je Gleis; `von` = Beschriftung, `nach` = Gleis.
    for (const u of daten.ubahn) {
      expect(u.paare.map((p) => p.nach)).toEqual(daten.gleise);
      expect(u.paare.every((p) => p.von === u.label && !p.gleicherBahnsteig)).toBe(true);
      expect(u.paare.some((p) => p.sek !== null && p.sek > 0)).toBe(true);
    }
    // Die U-Bahn-Steige sind keine Gleise: keine Gleispaare mit ihnen.
    expect(daten.paare).toHaveLength(daten.gleise.length * (daten.gleise.length - 1));
  }, 60_000);

  it('Hamburg Hbf: Mönckebergstraße fällt heraus, Hauptbahnhof Nord/Süd bleiben', () => {
    const graph = graphAus(hamburg);
    const alle = graph.ubahnSteige!.map((s) => s.name);
    expect(alle).toContain('Mönckebergstraße');
    const bleiben = ubahnSteigeDesBahnhofs(graph, hamburg.name).map((s) => s.name);
    expect(bleiben).not.toContain('Mönckebergstraße');
    expect(bleiben.filter((n) => n?.startsWith('Hauptbahnhof'))).toHaveLength(4);
    const daten = berechneBahnhof(hamburg, graph)!;
    expect(daten.ubahn).toHaveLength(bleiben.length);
  }, 60_000);

  it('ubahnNamePasst: Hbf = Hauptbahnhof, Himmelsrichtung erlaubt, fremder Name nicht', () => {
    expect(ubahnNamePasst('Hauptbahnhof Nord', 'Hamburg Hbf')).toBe(true);
    expect(ubahnNamePasst('Hauptbahnhof-Süd', 'Hamburg Hbf')).toBe(true);
    expect(ubahnNamePasst('Hauptbahnhof (U)', 'Bielefeld Hbf')).toBe(true);
    expect(ubahnNamePasst('S+U Hauptbahnhof', 'Berlin Hbf')).toBe(true);
    expect(ubahnNamePasst('Essen Hauptbahnhof', 'Essen Hbf')).toBe(true);
    expect(ubahnNamePasst('Mönckebergstraße', 'Hamburg Hbf')).toBe(false);
    expect(ubahnNamePasst('Staatsgalerie', 'Stuttgart Hbf')).toBe(false);
    expect(ubahnNamePasst('Rotes Rathaus', 'Berlin Alexanderplatz')).toBe(false);
    expect(ubahnNamePasst('Nord', 'Hamburg Hbf')).toBe(false);
    // Ohne Namen laesst sich nichts widerlegen.
    expect(ubahnNamePasst(undefined, 'Hamburg Hbf')).toBe(true);
  });

  it('ohne DB-Ablage: Daten wie heute, ubahn aus OSM subway=yes', () => {
    const daten = berechneBahnhof(muenchen, graphAus(muenchen))!;
    // Ohne Liste bleibt OSMs „81;82“ stehen; die Art kennt nur, was OSM selbst als S-Bahn ausweist.
    expect(daten.gleise).toEqual(expect.arrayContaining(['81', '82']));
    expect(Object.keys(daten.gleisArt).sort()).toEqual([...daten.gleise].sort());
    expect(daten.gleisArt['11']).toBe('zug');
    expect(daten.ubahn).toHaveLength(3);
  }, 60_000);

  it('ein Bahnhof ohne U-Bahn und S-Bahn: gleisArt alles Zuege, ubahn leer', () => {
    const mini = rechne('synthetisch/mini-bahnhof');
    expect(mini.gleisArt).toEqual({ '1': 'zug', '2': 'zug', '3': 'zug' });
    expect(mini.ubahn).toEqual([]);
    expect(alsJson(mini)).toContain('"ubahn": []');
  });

  it('alsJson: U-Bahn-Steig als Block, Paare je Zeile, gueltiges JSON', () => {
    const mini = rechne('synthetisch/mini-bahnhof');
    const mitSteig: Bahnhofsdaten = {
      ...mini,
      ubahn: [{ id: 'w7', label: 'U1 U2', paare: mini.paare.slice(0, 2).map((p) => ({ ...p, von: 'U1 U2' })) }],
    };
    const text = alsJson(mitSteig);
    expect(JSON.parse(text)).toEqual(mitSteig);
    expect(text.split('\n').filter((z) => z.includes('"von":'))).toHaveLength(
      mini.paare.length + 2,
    );
  });

  it('fremdeGleise: U-Bahn-Steige wandern wie Gleise zum Bahnhof mit mehr Gleisen', () => {
    const punkt = { lat: 48.14, lon: 11.56 };
    const gross = { schluessel: 'gross', gleise: new Map([['1', punkt], ['2', punkt], [ubahnSchluessel('w7'), { ...punkt, lat: 48.1401 }]]) };
    const klein = { schluessel: 'klein', gleise: new Map([[ubahnSchluessel('w7'), { ...punkt, lat: 48.1401 }]]) };
    expect([...(fremdeGleise([gross, klein]).get('klein') ?? [])]).toEqual([ubahnSchluessel('w7')]);
  });

  it('ohne verweist ein U-Bahn-Steig an den anderen Bahnhof', () => {
    const graph = graphAus(hamburg);
    const steige = ubahnSteigeDesBahnhofs(graph, hamburg.name);
    const daten = berechneBahnhof(hamburg, graph, new Set([ubahnSchluessel(steige[0].id)]))!;
    expect(daten.ubahn.map((u) => u.id)).not.toContain(steige[0].id);
    expect(daten.ubahn).toHaveLength(steige.length - 1);
  }, 60_000);
});
