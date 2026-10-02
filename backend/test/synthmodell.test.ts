import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gleicherBahnsteigErgebnis, syntheseGraph, wendeFastaAn } from '../src/core/synthmodell.js';
import { berechneRoute, istGleicherBahnsteig } from '../src/core/routing.js';
import { haversineM } from '../src/core/graph.js';
import type { FastaAnlage, StationsInfo } from '../src/core/typen.js';

// ~15 m in Grad Länge bei 51° N
const M15_LON = 0.000214;

describe('syntheseGraph mit der vollständigen RIS-Gleisliste', () => {
  // Echte Antwort Hamburg Hbf (Halle), 02.10.2026: 8 Gleise, 15 Teilgleise.
  const roh = JSON.parse(
    readFileSync(fileURLToPath(new URL('./fixtures/db/platforms-hamburg-8002549.json', import.meta.url)), 'utf8'),
  ) as { platforms: { name: string }[] };
  const hamburg: StationsInfo = {
    eva: '8002549',
    evas: ['8002549'],
    name: 'Hamburg Hbf',
    gleise: roh.platforms.map((p) => ({ gleis: p.name, ris: p })),
  };

  it('Teilgleise sind keine eigenen Gleise – sie gehören zu ihrem parentPlatform', () => {
    const graph = syntheseGraph(hamburg);
    expect(graph.gleise).toEqual(['5', '6', '7', '8', '11', '12', '13', '14']);
  });

  it('linkedPlatforms bildet die Bahnsteige: 5/6, 7/8, 11/12, 13/14', () => {
    const graph = syntheseGraph(hamburg);
    const bahnsteigVon = (gleis: string) => graph.knoten.get(`gleis${gleis}:mitte`)!.bahnsteigId;
    expect(bahnsteigVon('5')).toBe(bahnsteigVon('6'));
    expect(bahnsteigVon('7')).toBe(bahnsteigVon('8'));
    expect(bahnsteigVon('11')).toBe(bahnsteigVon('12'));
    expect(bahnsteigVon('13')).toBe(bahnsteigVon('14'));
    expect(new Set(graph.gleise.map(bahnsteigVon)).size).toBe(4);
  });
});

describe('syntheseGraph', () => {
  it('4-Gleis-Station ohne Koordinaten: Querung vorhanden, jede Gleis-zu-Gleis-Route existiert', () => {
    const info: StationsInfo = {
      eva: '8000001',
      evas: ['8000001'],
      name: 'Teststadt',
      gleise: [{ gleis: '1' }, { gleis: '2' }, { gleis: '3' }, { gleis: '4' }],
    };
    const graph = syntheseGraph(info);

    expect(graph.stufe).toBe(3);
    expect(graph.gleise).toEqual(['1', '2', '3', '4']);
    expect([...graph.knoten.keys()].some((id) => id.includes('quer'))).toBe(true);

    for (const von of graph.gleise) {
      for (const nach of graph.gleise) {
        if (von === nach) continue;
        const pfad = berechneRoute(graph, `gleis${von}:mitte`, `gleis${nach}:mitte`, 'schnellste');
        expect(pfad, `Route ${von}→${nach}`).not.toBeNull();
      }
    }
  });

  it('ohne FaSta-Anlagen gibt es keine barrierefreie Route (nur Treppen)', () => {
    const info: StationsInfo = {
      eva: 'x', evas: ['x'], name: 'T',
      gleise: [{ gleis: '1', lat: 51, lon: 10 }, { gleis: '2', lat: 51, lon: 10 + M15_LON }],
    };
    const graph = syntheseGraph(info);
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')).not.toBeNull();
  });

  it('FaSta-Aufzüge ACTIVE → barrierefreie Route existiert', () => {
    const info: StationsInfo = {
      eva: 'x', evas: ['x'], name: 'T',
      gleise: [{ gleis: '1', lat: 51, lon: 10 }, { gleis: '2', lat: 51, lon: 10 + M15_LON }],
    };
    const anlagen: FastaAnlage[] = [
      { id: 'a1', typ: 'AUFZUG', lat: 51, lon: 10, status: 'ACTIVE' },
      { id: 'a2', typ: 'AUFZUG', lat: 51, lon: 10 + M15_LON, status: 'ACTIVE' },
    ];
    const pfad = berechneRoute(syntheseGraph(info, anlagen), 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei');
    expect(pfad).not.toBeNull();
    expect(pfad!.kanten.filter((k) => k.typ === 'aufzug')).toHaveLength(2);
  });

  it('FaSta-Aufzug INACTIVE → barrierefreie Route null', () => {
    const info: StationsInfo = {
      eva: 'x', evas: ['x'], name: 'T',
      gleise: [{ gleis: '1', lat: 51, lon: 10 }, { gleis: '2', lat: 51, lon: 10 + M15_LON }],
    };
    const anlagen: FastaAnlage[] = [
      { id: 'a1', typ: 'AUFZUG', lat: 51, lon: 10, status: 'INACTIVE' },
      { id: 'a2', typ: 'AUFZUG', lat: 51, lon: 10 + M15_LON, status: 'INACTIVE' },
    ];
    // Der Status wird seit §5 NICHT mehr beim Bau eingetragen: Dieser Graph
    // wird gecacht, ein gerade defekter Aufzug bliebe 10 Minuten lang darin
    // stehen. Er kommt pro Anfrage ueber wendeFastaAn auf einer Kopie dazu.
    const graph = syntheseGraph(info, anlagen);
    wendeFastaAn(graph, anlagen);
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
  });

  it('Gleise mit (nahezu) gleichen Koordinaten teilen sich den Bahnsteig', () => {
    const info: StationsInfo = {
      eva: 'x', evas: ['x'], name: 'T',
      gleise: [
        { gleis: '4', lat: 51, lon: 10 },
        { gleis: '5', lat: 51, lon: 10 },
        { gleis: '6', lat: 51, lon: 10 + 2 * M15_LON },
      ],
    };
    const graph = syntheseGraph(info);
    expect(istGleicherBahnsteig(graph, '4', '5')).toBe(true);
    expect(istGleicherBahnsteig(graph, '4', '6')).toBe(false);

    // Weg zum Nachbargleis am selben Bahnsteig kommt ohne Ebenenwechsel aus
    const pfad = berechneRoute(graph, 'gleis4:mitte', 'gleis5:mitte', 'schnellste');
    expect(pfad!.kanten.every((k) => k.typ === 'eben')).toBe(true);
  });
});

describe('gleicherBahnsteigErgebnis', () => {
  it('Sonderausgabe: Gleis gegenüber, kein Ebenenwechsel, Gehzeit ≤ 30 s', () => {
    const ergebnis = gleicherBahnsteigErgebnis('5', 3);
    expect(ergebnis.schritte).toHaveLength(1);
    expect(ergebnis.schritte[0].text).toContain('Gleis 5 gegenüber');
    expect(ergebnis.schritte[0].text).toContain('kein Ebenenwechsel');
    expect(ergebnis.schritte[0].typ).toBe('ziel');
    expect(ergebnis.gehzeitSek).toBeLessThanOrEqual(30);
    expect(ergebnis.stufe).toBe(3);
  });
});

describe('Verankerung des Synthesemodells', () => {
  // Die Gleisliste aus RIS::Stations traegt NIE Koordinaten - platforms/{eva}
  // liefert nur Namen. Ohne Verankerung an der Stationsposition landete jede
  // Stufe-3-Route bei 51 N / 10 O, einem Acker in Mitteldeutschland, und die
  // Karte zeigte echte OSM-Kacheln von dort.
  const berlinHbf: StationsInfo = {
    eva: '8098160',
    evas: ['8098160'],
    name: 'Berlin Hbf (tief)',
    lat: 52.525592,
    lon: 13.369545,
    gleise: [{ gleis: '5' }, { gleis: '6' }, { gleis: '7' }, { gleis: '8' }],
  };

  it('legt die Knoten an die Stationsposition, nicht auf den Nullpunkt', () => {
    const graph = syntheseGraph(berlinHbf);
    for (const knoten of graph.knoten.values()) {
      expect(knoten.lat).toBeCloseTo(52.5256, 2);
      expect(knoten.lon).toBeCloseTo(13.3695, 2);
    }
  });

  it('haelt die Bahnsteige im Standardabstand auseinander', () => {
    const graph = syntheseGraph(berlinHbf);
    const laengen = [...graph.knoten.values()].map((k) => k.lon);
    // Vier Bahnsteige a 15 m ≈ 45 m Spanne – nicht alles auf einem Punkt.
    expect(Math.max(...laengen)).toBeGreaterThan(Math.min(...laengen));
  });

  it('faellt ohne Stationsposition auf den bisherigen Nullpunkt zurueck', () => {
    const ohneOrt: StationsInfo = { eva: '8000001', evas: ['8000001'], name: 'Ohne Ort', gleise: [{ gleis: '1' }] };
    const graph = syntheseGraph(ohneOrt);
    const erster = [...graph.knoten.values()][0];
    expect(erster.lat).toBeCloseTo(51, 5);
    expect(erster.lon).toBeCloseTo(10, 3);
  });
});

describe('syntheseGraph: Verankerung aus FaSta (§5)', () => {
  const info: StationsInfo = {
    eva: '8000152',
    evas: ['8000152'],
    name: 'Teststadt',
    lat: 52.0,
    lon: 12.0,
    gleise: [{ gleis: '1' }, { gleis: '2' }, { gleis: '3' }, { gleis: '4' }],
  };

  // Ein Bahnsteig 1/2, dessen beide Anlagen ~200 m noerdlich der
  // Stationsposition stehen. Der Bahnsteig muss dorthin wandern.
  const anlagen1u2: FastaAnlage[] = [
    { id: 'a1', typ: 'AUFZUG', lat: 52.0018, lon: 12.0, status: 'ACTIVE', beschreibung: 'zu Gleis 1/2' },
    { id: 'a2', typ: 'ROLLTREPPE', lat: 52.0018, lon: 12.0004, status: 'ACTIVE', beschreibung: 'zu Bstg Gl 1/2 Ostseite' },
  ];

  function alleKanten(graph: ReturnType<typeof syntheseGraph>) {
    return [...new Set([...graph.adjazenz.values()].flat())];
  }

  it('ein benannter Bahnsteig sitzt auf dem Schwerpunkt seiner Anlagen', () => {
    const graph = syntheseGraph(info, anlagen1u2);
    const gleis1 = graph.knoten.get('gleis1:mitte')!;
    // Schwerpunkt der beiden Anlagen, nicht die Stationsposition 52.0.
    expect(gleis1.lat).toBeCloseTo(52.0018, 4);
    expect(gleis1.lat).not.toBeCloseTo(52.0, 4);
    // Gleis 2 liegt am selben Bahnsteig.
    expect(graph.knoten.get('gleis2:mitte')!.bahnsteigId).toBe(gleis1.bahnsteigId);
  });

  it('die Kante zur Querung traegt den gerechneten Weg, nicht mehr pauschal 10 m', () => {
    const kanten = alleKanten(syntheseGraph(info, anlagen1u2));
    const aufzug = kanten.find((k) => k.typ === 'aufzug');
    const rolltreppe = kanten.find((k) => k.typ === 'rolltreppe');
    expect(aufzug, 'ein Aufzug muss eine Kante erzeugen').toBeDefined();
    expect(aufzug!.anlageId).toBe('a1');
    // Die Rolltreppe steht ~27 m oestlich des Schwerpunkts, der Aufzug ~14 m
    // westlich davon: Der gerechnete Weg unterscheidet die beiden.
    expect(rolltreppe!.laengeM).toBeGreaterThan(aufzug!.laengeM);
  });

  it('der Status wird beim Bau NICHT eingetragen - er gehoert nicht in den Cache', () => {
    const defekt = anlagen1u2.map((a) => ({ ...a, status: 'INACTIVE' as const }));
    const kanten = alleKanten(syntheseGraph(info, defekt));
    expect(kanten.every((k) => k.status === undefined)).toBe(true);
  });

  it('Anlagen ohne Gleisbezug verschieben keinen Bahnsteig', () => {
    const stoerung: FastaAnlage[] = [
      { id: 'p1', typ: 'AUFZUG', lat: 52.01, lon: 12.01, status: 'ACTIVE', beschreibung: 'von Parkhaus A zum 1. UG' },
      { id: 'p2', typ: 'ROLLTREPPE', lat: 52.02, lon: 12.02, status: 'ACTIVE', beschreibung: '1.UG - Tram Haltestelle 5' },
    ];
    const graph = syntheseGraph(info, stoerung);
    // Kein benannter Bahnsteig -> alles bleibt an der Stationsposition.
    expect(graph.knoten.get('gleis1:mitte')!.lat).toBeCloseTo(52.0, 4);
  });

  // Der Muenchener Fall: nur 16 % der Anlagen tragen einen Gleisbezug. Die
  // uebrigen duerfen keine barrierefreie Route kosten, die es heute gibt.
  it('Anlagen ohne Gleisbezug erzeugen weiterhin ihre Kante', () => {
    const namenlos: FastaAnlage[] = [
      { id: 'n1', typ: 'AUFZUG', lat: 52.0, lon: 12.0, status: 'ACTIVE', beschreibung: 'von EG zu UG' },
      { id: 'n2', typ: 'AUFZUG', lat: 52.0, lon: 12.0004, status: 'ACTIVE', beschreibung: 'Haupthalle - VTE' },
    ];
    const kanten = alleKanten(syntheseGraph(info, namenlos));
    expect(kanten.filter((k) => k.typ === 'aufzug').length).toBeGreaterThan(0);
  });

  it('ohne Anlagen bleibt der Aufbau wie bisher - nur der Abstand ist 20 m', () => {
    const graph = syntheseGraph(info);
    expect(graph.stufe).toBe(3);
    expect(graph.gleise).toEqual(['1', '2', '3', '4']);
    const b0 = graph.knoten.get('gleis1:mitte')!;
    const b1 = graph.knoten.get('gleis2:mitte')!;
    expect(haversineM(b0.lat, b0.lon, b1.lat, b1.lon)).toBeCloseTo(20, 0);
  });
});

describe('syntheseGraph gegen echte FaSta-Antworten', () => {
  function ladeAnlagen(datei: string): FastaAnlage[] {
    const roh = JSON.parse(
      readFileSync(fileURLToPath(new URL(`./fixtures/db/${datei}`, import.meta.url)), 'utf8'),
    ) as {
      equipmentnumber?: number;
      type?: string;
      state?: string;
      description?: string;
      geocoordX?: number;
      geocoordY?: number;
    }[];
    return roh
      .filter((f) => (f.type === 'ELEVATOR' || f.type === 'ESCALATOR') && f.geocoordX !== undefined)
      .map((f) => ({
        id: String(f.equipmentnumber),
        typ: f.type === 'ELEVATOR' ? ('AUFZUG' as const) : ('ROLLTREPPE' as const),
        lat: f.geocoordY!,
        lon: f.geocoordX!,
        status: f.state === 'ACTIVE' ? ('ACTIVE' as const) : ('INACTIVE' as const),
        ...(f.description ? { beschreibung: f.description } : {}),
      }));
  }

  it('Hannover: sechs Bahnsteige bekommen echte Koordinaten', () => {
    const info: StationsInfo = {
      eva: '8000152', evas: ['8000152'], name: 'Hannover Hbf', lat: 52.3767, lon: 9.7411,
      gleise: '1 2 3 4 7 8 9 10 11 12 13 14'.split(' ').map((gleis) => ({ gleis })),
    };
    const graph = syntheseGraph(info, ladeAnlagen('fasta-hannover-8000152.json'));
    const bahnsteige = new Set(
      [...graph.knoten.values()].filter((k) => k.gleis).map((k) => k.bahnsteigId),
    );
    expect(bahnsteige.size).toBe(6);
  });

  it('Berlin: Parkhaus, Tram und U-Bahn verschieben keinen Bahnsteig', () => {
    const info: StationsInfo = {
      eva: '8011160', evas: ['8011160'], name: 'Berlin Hbf', lat: 52.525, lon: 13.3694,
      gleise: '1 2 3 4 5 6 7 8 11 12 13 14 15 16'.split(' ').map((gleis) => ({ gleis })),
    };
    const graph = syntheseGraph(info, ladeAnlagen('fasta-berlin-8011160.json'));
    // Die Parkhaus-Anlagen streuen ueber 339 m und duerfen nicht ziehen.
    for (const k of [...graph.knoten.values()].filter((n) => n.gleis)) {
      expect(haversineM(52.525, 13.3694, k.lat, k.lon), `Gleis ${k.gleis}`).toBeLessThan(400);
    }
  });
});
