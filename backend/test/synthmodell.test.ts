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
      eva: 'x', name: 'T',
      gleise: [{ gleis: '1', lat: 51, lon: 10 }, { gleis: '2', lat: 51, lon: 10 + M15_LON }],
    };
    const graph = syntheseGraph(info);
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')).not.toBeNull();
  });

  it('FaSta-Aufzüge ACTIVE → barrierefreie Route existiert', () => {
    const info: StationsInfo = {
      eva: 'x', name: 'T',
      gleise: [{ gleis: '1', lat: 51, lon: 10 }, { gleis: '2', lat: 51, lon: 10 + M15_LON }],
    };
    const anlagen: FastaAnlage[] = [
      { typ: 'AUFZUG', lat: 51, lon: 10, status: 'ACTIVE' },
      { typ: 'AUFZUG', lat: 51, lon: 10 + M15_LON, status: 'ACTIVE' },
    ];
    const pfad = berechneRoute(syntheseGraph(info, anlagen), 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei');
    expect(pfad).not.toBeNull();
    expect(pfad!.kanten.filter((k) => k.typ === 'aufzug')).toHaveLength(2);
  });

  it('FaSta-Aufzug INACTIVE → barrierefreie Route null', () => {
    const info: StationsInfo = {
      eva: 'x', name: 'T',
      gleise: [{ gleis: '1', lat: 51, lon: 10 }, { gleis: '2', lat: 51, lon: 10 + M15_LON }],
    };
    const anlagen: FastaAnlage[] = [
      { typ: 'AUFZUG', lat: 51, lon: 10, status: 'INACTIVE' },
      { typ: 'AUFZUG', lat: 51, lon: 10 + M15_LON, status: 'INACTIVE' },
    ];
    expect(
      berechneRoute(syntheseGraph(info, anlagen), 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei'),
    ).toBeNull();
  });

  it('Gleise mit (nahezu) gleichen Koordinaten teilen sich den Bahnsteig', () => {
    const info: StationsInfo = {
      eva: 'x', name: 'T',
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
