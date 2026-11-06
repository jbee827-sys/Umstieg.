import { afterEach, describe, expect, it, vi } from 'vitest';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { generiereText } from '../src/core/textgen.js';
import type {
  Bezugspunkt,
  GraphKante,
  GraphKnoten,
  KantenLage,
  KantenTyp,
  BahnhofSchema,
  RoutenPfad,
  StationGraph,
} from '../src/core/typen.js';

/*
 * Ein kleiner Bahnhof in Metern (x = Ost, y = Nord) um 52° N:
 *
 *   Gleis 1/2 (Bahnsteig wA) liegt bei y = 0 von x = 0 bis 200, Ebene 0.
 *   Gleis 3 (wB) bei y = 40, Gleis 5 (wC) bei y = 80 - beide auf Ebene 0.
 *   Die Unterfuehrung (Ebene -1) laeuft bei x = 150 nach Norden, von y = 4
 *   bis y = 80. Aus ihr fuehrt je eine Treppe nach Osten (rechts) auf die
 *   Bahnsteige.
 */
const M_LAT = 111_320;
const M_LON = M_LAT * Math.cos((52 * Math.PI) / 180);

function k(id: string, x: number, y: number, level: number, extra: Partial<GraphKnoten> = {}): GraphKnoten {
  return { id, lat: 52 + y / M_LAT, lon: 13 + x / M_LON, level, ...extra };
}

const KNOTEN: GraphKnoten[] = [
  k('gleis1:anfang', 0, 0, 0, { gleis: '1', abschnitt: 'anfang', bahnsteigId: 'wA' }),
  k('gleis1:mitte', 100, 0, 0, { gleis: '1', abschnitt: 'mitte', bahnsteigId: 'wA' }),
  k('gleis1:ende', 200, 0, 0, { gleis: '1', abschnitt: 'ende', bahnsteigId: 'wA' }),
  k('gleis2:mitte', 110, 0, 0, { gleis: '2', abschnitt: 'mitte', bahnsteigId: 'wA' }),
  k('p1', 150, 0, 0),
  k('u0', 150, 4, -1),
  k('u40', 150, 40, -1),
  k('u80', 150, 80, -1),
  k('gleis3:anfang', 100, 40, 0, { gleis: '3', abschnitt: 'anfang', bahnsteigId: 'wB' }),
  k('gleis3:mitte', 156, 40, 0, { gleis: '3', abschnitt: 'mitte', bahnsteigId: 'wB' }),
  k('gleis3:ende', 250, 40, 0, { gleis: '3', abschnitt: 'ende', bahnsteigId: 'wB' }),
  k('gleis5:anfang', 100, 80, 0, { gleis: '5', abschnitt: 'anfang', bahnsteigId: 'wC' }),
  k('gleis5:mitte', 156, 80, 0, { gleis: '5', abschnitt: 'mitte', bahnsteigId: 'wC' }),
  k('gleis5:ende', 250, 80, 0, { gleis: '5', abschnitt: 'ende', bahnsteigId: 'wC' }),
];

function abstand(a: GraphKnoten, b: GraphKnoten): number {
  return Math.hypot((a.lon - b.lon) * M_LON, (a.lat - b.lat) * M_LAT);
}

function kante(
  knoten: Map<string, GraphKnoten>,
  von: string,
  nach: string,
  typ: KantenTyp = 'eben',
  merkmale: { lage?: KantenLage; name?: string; ebeneBelegt?: boolean } = {},
): GraphKante {
  const a = knoten.get(von)!;
  const b = knoten.get(nach)!;
  return {
    von,
    nach,
    laengeM: typ === 'treppe' ? 6 : abstand(a, b),
    deltaLevel: b.level - a.level,
    typ,
    barrierefrei: typ === 'eben',
    ...merkmale,
  };
}

interface Bahnhof {
  graph: StationGraph;
  /** Kante zwischen zwei Knoten, in beliebiger Richtung. */
  kanteZwischen: (a: string, b: string) => GraphKante;
}

function baueBahnhof(optionen: { unterfuehrungLage?: KantenLage; bezugspunkte?: Bezugspunkt[] } = {}): Bahnhof {
  const knoten = new Map(KNOTEN.map((x) => [x.id, x]));
  const lage = optionen.unterfuehrungLage;
  const unter = { ...(lage ? { lage } : {}), ebeneBelegt: true };
  const steig = { lage: 'bahnsteig' as const, ebeneBelegt: true };
  const kanten: GraphKante[] = [
    kante(knoten, 'gleis1:anfang', 'gleis1:mitte', 'eben', steig),
    kante(knoten, 'gleis1:mitte', 'gleis2:mitte', 'eben', steig),
    kante(knoten, 'gleis2:mitte', 'p1', 'eben', steig),
    kante(knoten, 'p1', 'gleis1:ende', 'eben', steig),
    kante(knoten, 'p1', 'u0', 'treppe', { ebeneBelegt: true }),
    kante(knoten, 'u0', 'u40', 'eben', unter),
    kante(knoten, 'u40', 'u80', 'eben', unter),
    kante(knoten, 'u40', 'gleis3:mitte', 'treppe', { ebeneBelegt: true }),
    kante(knoten, 'u80', 'gleis5:mitte', 'treppe', { ebeneBelegt: true }),
    kante(knoten, 'gleis3:anfang', 'gleis3:mitte', 'eben', steig),
    kante(knoten, 'gleis3:mitte', 'gleis3:ende', 'eben', steig),
    kante(knoten, 'gleis5:anfang', 'gleis5:mitte', 'eben', steig),
    kante(knoten, 'gleis5:mitte', 'gleis5:ende', 'eben', steig),
  ];
  const adjazenz = new Map<string, GraphKante[]>();
  for (const x of kanten) {
    for (const ende of [x.von, x.nach]) {
      if (!adjazenz.has(ende)) adjazenz.set(ende, []);
      adjazenz.get(ende)!.push(x);
    }
  }
  return {
    graph: {
      knoten,
      adjazenz,
      stufe: 1,
      gleise: ['1', '2', '3', '5'],
      ...(optionen.bezugspunkte ? { bezugspunkte: optionen.bezugspunkte } : {}),
    },
    kanteZwischen: (a, b) => kanten.find((x) => (x.von === a && x.nach === b) || (x.von === b && x.nach === a))!,
  };
}

function pfad(bahnhof: Bahnhof, ids: string[]): RoutenPfad {
  const knoten = ids.map((id) => bahnhof.graph.knoten.get(id)!);
  const kanten = ids.slice(1).map((id, i) => bahnhof.kanteZwischen(ids[i], id));
  return { knoten, kanten, laengeM: kanten.reduce((s, x) => s + x.laengeM, 0) };
}

/** Zugspitze am Ostende von wA: nach Osten geht es „in Fahrtrichtung“. */
const ENDEN = new Map([['wA', { anfang: 'entgegen der Fahrtrichtung', ende: 'in Fahrtrichtung' }]]);

const NACH_GLEIS_5 = ['gleis1:mitte', 'gleis2:mitte', 'p1', 'u0', 'u40', 'u80', 'gleis5:mitte'];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Textstil bezug (Konzept 09)', () => {
  it('Unterführung, zweiter Aufgang rechts - das Zielbild aus Abschnitt 2', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const p = pfad(bahnhof, NACH_GLEIS_5);
    const text = generiereText(p, { stil: 'bezug', profil: 'normal', graph: bahnhof.graph, bahnsteigEnden: ENDEN });
    expect(text.schritte.map((s) => s.text)).toEqual([
      'Vom Zug aus in Fahrtrichtung, etwa 50 m bis zur Treppe',
      'Treppe runter in die Unterführung',
      'Zweiter Aufgang rechts, Treppe hoch zu Gleis 5',
    ]);
    expect(text.kurzfassung).toBe('Treppe runter in die Unterführung, dann zweiter Aufgang rechts hoch zu Gleis 5.');
  });

  it('haelt die Invarianten: Ebenenlaeufe wie das Schema, Summe der Sekunden = Gehzeit, Kartenstuecke lueckenlos', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const p = pfad(bahnhof, NACH_GLEIS_5);
    const { schritte } = generiereText(p, { stil: 'bezug', profil: 'normal', graph: bahnhof.graph });
    expect(schritte.map((s) => s.level)).toEqual([0, -1, 0]);
    expect(schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0)).toBe(gehzeitSekunden(p, 'normal'));
    expect(schritte[0].knotenVon).toBe(0);
    expect(schritte.at(-1)!.knotenBis).toBe(p.knoten.length - 1);
    for (let i = 1; i < schritte.length; i++) expect(schritte[i].knotenVon).toBe(schritte[i - 1].knotenBis);
    expect(schritte.map((s) => s.typ)).toEqual(['eben', 'treppe', 'treppe']);
  });

  it('sagt „Unterführung“ nur, wenn die Lage es belegt (Konzept 09, 6.2)', () => {
    const bahnhof = baueBahnhof();
    const p = pfad(bahnhof, NACH_GLEIS_5);
    const { schritte } = generiereText(p, { stil: 'bezug', graph: bahnhof.graph, bahnsteigEnden: ENDEN });
    expect(schritte[1].text).toBe('Treppe runter');
    expect(schritte.some((s) => /Unterführung/.test(s.text))).toBe(false);
  });

  it('nennt keine Ebenennummern und kein Minuszeichen', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const { schritte, kurzfassung } = generiereText(pfad(bahnhof, NACH_GLEIS_5), { stil: 'bezug', graph: bahnhof.graph });
    for (const text of [...schritte.map((s) => s.text), kurzfassung!]) {
      expect(text).not.toMatch(/Ebene|[-−]\d/);
    }
  });

  it('ohne Fahrtrichtung und ohne Gleisseite: grobe Meter, keine geratene Richtung', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const { schritte } = generiereText(pfad(bahnhof, NACH_GLEIS_5), { stil: 'bezug', graph: bahnhof.graph });
    expect(schritte[0].text).toBe('Vom Zug aus etwa 50 m bis zur Treppe');
  });

  it('nie eine Himmelsrichtung (Julian, 06.11.2026: wo Norden ist, weiss niemand)', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    bahnhof.graph.gleisSeiten = new Map([['wA|1', { seite: 'rechts', quelle: 'kante' }]]);
    const text = generiereText(pfad(bahnhof, NACH_GLEIS_5), { stil: 'bezug', graph: bahnhof.graph });
    expect([...text.schritte.map((s) => s.text), text.kurzfassung].join(' ')).not.toMatch(/Nord|Süd|Ost|West/);
  });

  it('ohne Fahrtrichtung: rechts oder links mit dem Zug im Ruecken', () => {
    // Gleis 1 liegt suedlich der Achse (rechts, Blick West → Ost). Wer
    // aussteigt, schaut nach Norden - Osten, wo die Treppe ist, liegt rechts.
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    bahnhof.graph.gleisSeiten = new Map([['wA|1', { seite: 'rechts', quelle: 'kante' }]]);
    const { schritte, kurzfassung } = generiereText(pfad(bahnhof, NACH_GLEIS_5), { stil: 'bezug', graph: bahnhof.graph });
    expect(schritte[0].text).toBe('Vom Zug aus nach rechts, etwa 50 m bis zur Treppe');
    expect(kurzfassung).not.toMatch(/rechts am Bahnsteig/); // 50 m: zu kurz fuer die Kurzfassung

    bahnhof.graph.gleisSeiten = new Map([['wA|1', { seite: 'links', quelle: 'nachbarn' }]]);
    expect(generiereText(pfad(bahnhof, NACH_GLEIS_5), { stil: 'bezug', graph: bahnhof.graph }).schritte[0].text).toBe(
      'Vom Zug aus nach links, etwa 50 m bis zur Treppe',
    );
  });

  it('die Fahrtrichtung geht vor rechts/links', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    bahnhof.graph.gleisSeiten = new Map([['wA|1', { seite: 'rechts', quelle: 'kante' }]]);
    const { schritte } = generiereText(pfad(bahnhof, NACH_GLEIS_5), {
      stil: 'bezug',
      graph: bahnhof.graph,
      bahnsteigEnden: ENDEN,
    });
    expect(schritte[0].text).toBe('Vom Zug aus in Fahrtrichtung, etwa 50 m bis zur Treppe');
  });

  it('zaehlt die Treppen am Bahnsteig wie das Schema: „bis zur zweiten Treppe“', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    // Der Ausstieg (gleis1:mitte, x = 100) ist der Ursprung des Schemas; der
    // Bahnsteig reicht von x = 0 bis 200. Eine Treppe bei 125 m liegt auf dem
    // Weg, die genutzte bei 150 m.
    const zugang = (beiM: number, aufRoute: boolean) => ({
      beiM,
      pos: { x: beiM - 100, y: 0 },
      aufzug: 0,
      rolltreppe: 0,
      treppe: 1,
      aufRoute,
    });
    const schema: BahnhofSchema = {
      ebenen: [
        {
          level: 0,
          art: 'gleise',
          bahnsteige: [
            {
              bahnsteigId: 'wA',
              gleise: ['1', '2'],
              rolle: 'start',
              von: { x: -100, y: 0 },
              bis: { x: 100, y: 0 },
              zugaenge: [zugang(40, false), zugang(125, false), zugang(150, true)],
            },
          ],
        },
      ],
      anlagen: [],
      pois: [],
      wechsel: [],
      vorbehalte: [],
    };
    const { schritte } = generiereText(pfad(bahnhof, NACH_GLEIS_5), {
      stil: 'bezug',
      graph: bahnhof.graph,
      bahnsteigEnden: ENDEN,
      schema,
    });
    // Die Treppe bei 40 m liegt in der anderen Richtung und zaehlt nicht.
    expect(schritte[0].text).toBe('Vom Zug aus in Fahrtrichtung bis zur zweiten Treppe');
  });

  it('am selben Bahnsteig: „gegenüber“, nur bei gleicher bahnsteigId', () => {
    const bahnhof = baueBahnhof();
    const p = pfad(bahnhof, ['gleis1:mitte', 'gleis2:mitte']);
    const text = generiereText(p, { stil: 'bezug', graph: bahnhof.graph });
    expect(text.schritte.map((s) => s.text)).toEqual(['Vom Zug aus gegenüber zu Gleis 2']);
    expect(text.kurzfassung).toBe('Gleich am selben Bahnsteig gegenüber, Gleis 2.');
  });

  it('im Standardmodell nie „gegenüber“ - dort ist die Bahnsteigzuordnung geraten', () => {
    const bahnhof = baueBahnhof();
    const p = pfad(bahnhof, ['gleis1:mitte', 'gleis2:mitte']);
    const text = generiereText(p, { stil: 'bezug', graph: bahnhof.graph, ungefaehr: true });
    expect(text.schritte.some((s) => s.text.includes('gegenüber'))).toBe(false);
    expect(text.kurzfassung).not.toMatch(/gegenüber/);
  });

  it('Gangname schlaegt die Lage: „Durch die Nordpassage“', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    for (const [a, b] of [
      ['u0', 'u40'],
      ['u40', 'u80'],
    ]) {
      bahnhof.kanteZwischen(a, b).name = 'Nordpassage';
    }
    // Ohne Zaehlung (der Aufgang zu Gleis 3 faellt weg), damit der Name traegt
    bahnhof.graph.adjazenz.set(
      'u40',
      bahnhof.graph.adjazenz.get('u40')!.filter((x) => x.typ !== 'treppe'),
    );
    const { schritte, kurzfassung } = generiereText(pfad(bahnhof, NACH_GLEIS_5), {
      stil: 'bezug',
      graph: bahnhof.graph,
      bahnsteigEnden: ENDEN,
    });
    expect(schritte[2].text).toBe('Durch die Nordpassage, dann Treppe hoch zu Gleis 5');
    expect(kurzfassung).toBe('Treppe runter in die Unterführung, durch die Nordpassage, dann Treppe hoch zu Gleis 5.');
  });

  it('Laden nur, wenn sein Name im Bahnhof eindeutig ist (Konzept 09, 4.3)', () => {
    const laden = (name: string, x: number, y: number): Bezugspunkt => ({
      art: 'laden',
      name,
      lat: 52 + y / M_LAT,
      lon: 13 + x / M_LON,
      level: -1,
    });
    const ohneZaehlung = (b: Bahnhof) =>
      b.graph.adjazenz.set('u40', b.graph.adjazenz.get('u40')!.filter((x) => x.typ !== 'treppe'));

    const eindeutig = baueBahnhof({ bezugspunkte: [laden('Backwerk', 155, 40)] });
    ohneZaehlung(eindeutig);
    const mit = generiereText(pfad(eindeutig, NACH_GLEIS_5), { stil: 'bezug', graph: eindeutig.graph });
    expect(mit.schritte[2].text).toBe('An Backwerk vorbei, dann Treppe hoch zu Gleis 5');

    const doppelt = baueBahnhof({ bezugspunkte: [laden('Backwerk', 155, 40), laden('Backwerk', 0, 0)] });
    ohneZaehlung(doppelt);
    const ohne = generiereText(pfad(doppelt, NACH_GLEIS_5), { stil: 'bezug', graph: doppelt.graph });
    expect(ohne.schritte.some((s) => s.text.includes('Backwerk'))).toBe(false);

    const weit = baueBahnhof({ bezugspunkte: [laden('Backwerk', 175, 40)] });
    ohneZaehlung(weit);
    const zuWeit = generiereText(pfad(weit, NACH_GLEIS_5), { stil: 'bezug', graph: weit.graph });
    expect(zuWeit.schritte.some((s) => s.text.includes('Backwerk'))).toBe(false);
  });

  it('TEXT_STIL=klassisch liefert den alten Text ohne Kurzfassung', () => {
    vi.stubEnv('TEXT_STIL', 'klassisch');
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const text = generiereText(pfad(bahnhof, NACH_GLEIS_5), { graph: bahnhof.graph });
    expect(text.kurzfassung).toBeUndefined();
    expect(text.schritte[0].text).toMatch(/^Nach Ausstieg/);
  });

  it('ohne Angabe gilt der Stil bezug', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const text = generiereText(pfad(bahnhof, NACH_GLEIS_5), { graph: bahnhof.graph });
    expect(text.kurzfassung).toBeDefined();
    expect(text.schritte[0].text).toMatch(/^Vom Zug aus/);
  });

  it('der Stopp bleibt ein eigener Schritt, und die Sekunden gehen auf', () => {
    const bahnhof = baueBahnhof({ unterfuehrungLage: 'unterfuehrung' });
    const p = { ...pfad(bahnhof, NACH_GLEIS_5), stopp: { knotenIndex: 4, art: 'wc' as const, sekunden: 300 } };
    const { schritte, kurzfassung } = generiereText(p, { stil: 'bezug', profil: 'normal', graph: bahnhof.graph });
    const stopp = schritte.find((s) => s.typ === 'stopp')!;
    expect(stopp.text).toBe('5 min Stopp: WC');
    expect(stopp.knotenVon).toBe(4);
    expect(schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0)).toBe(gehzeitSekunden(p, 'normal'));
    expect(kurzfassung).toMatch(/Stopp am WC/);
  });

  it('eine geratene Naht (Rampe ohne Laenge) ist keine Rampe, sondern „weiter nach unten“', () => {
    const bahnhof = baueBahnhof();
    const naht = bahnhof.kanteZwischen('p1', 'u0');
    naht.typ = 'rampe';
    naht.laengeM = 0;
    const { schritte } = generiereText(pfad(bahnhof, NACH_GLEIS_5), { stil: 'bezug', graph: bahnhof.graph });
    expect(schritte[1].text).toBe('Weiter nach unten');
    expect(schritte.some((s) => /Rampe/.test(s.text))).toBe(false);
  });
});

describe('Abbiegen nur an Entscheidungspunkten (Konzept 09, 5.3)', () => {
  // Ein Gang mit Knick nach links bei (0, 50); optional zweigt dort ein Weg ab.
  function gang(mitAbzweig: boolean) {
    const knoten = new Map<string, GraphKnoten>([
      ['s', k('gleis1:mitte', 0, 0, 0, { gleis: '1', bahnsteigId: 'wA' })],
      ['a', k('a', 0, 20, 0)],
      ['b', k('b', 0, 50, 0)],
      ['c', k('c', -40, 50, 0)],
      ['z', k('gleis9:mitte', -60, 50, 0, { gleis: '9', bahnsteigId: 'wZ' })],
      ['x', k('x', 30, 50, 0)],
    ]);
    const ids = ['s', 'a', 'b', 'c', 'z'];
    const kanten = ids.slice(1).map((id, i) => kante(knoten, ids[i], id, 'eben', { lage: 'halle', ebeneBelegt: true }));
    const adjazenz = new Map<string, GraphKante[]>();
    const alle = mitAbzweig ? [...kanten, kante(knoten, 'b', 'x')] : kanten;
    for (const x of alle) {
      for (const ende of [x.von, x.nach]) {
        if (!adjazenz.has(ende)) adjazenz.set(ende, []);
        adjazenz.get(ende)!.push(x);
      }
    }
    const graph: StationGraph = { knoten, adjazenz, stufe: 1, gleise: ['1', '9'] };
    const p: RoutenPfad = {
      knoten: ids.map((id) => knoten.get(id)!),
      kanten,
      laengeM: kanten.reduce((s, x) => s + x.laengeM, 0),
    };
    return { graph, p };
  }

  it('ein Knick ohne Abzweig erzeugt keine Anweisung', () => {
    const { graph, p } = gang(false);
    const { schritte } = generiereText(p, { stil: 'bezug', graph });
    expect(schritte.map((s) => s.text)).toEqual(['Vom Zug aus durch die Halle zu Gleis 9']);
  });

  it('am Abzweig: „links“', () => {
    const { graph, p } = gang(true);
    const { schritte } = generiereText(p, { stil: 'bezug', graph });
    expect(schritte.map((s) => s.text)).toEqual(['Vom Zug aus durch die Halle, links zu Gleis 9']);
  });
});
