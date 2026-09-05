import { describe, it, expect } from 'vitest';
import { gleicherBahnsteigErgebnis, syntheseGraph } from '../src/core/synthmodell.js';
import { berechneRoute, istGleicherBahnsteig } from '../src/core/routing.js';
import type { FastaAnlage, StationsInfo } from '../src/core/typen.js';

// ~15 m in Grad Länge bei 51° N
const M15_LON = 0.000214;

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
    expect(
      berechneRoute(syntheseGraph(info, anlagen), 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei'),
    ).toBeNull();
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
