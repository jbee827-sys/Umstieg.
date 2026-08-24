import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph } from '../src/core/graph.js';
import { erreichbareGleisPaare, klassifiziere } from '../src/core/klassifikation.js';
import type { GraphKante, GraphKnoten, OverpassAntwort, StationGraph } from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

/** Baut einen StationGraph von Hand – für gezielte Klassifikationsfälle. */
function macheGraph(
  knotenListe: GraphKnoten[],
  kanten: Omit<GraphKante, 'status'>[],
  gleise: string[],
): StationGraph {
  const knoten = new Map(knotenListe.map((k) => [k.id, k]));
  const adjazenz = new Map<string, GraphKante[]>();
  for (const kante of kanten) {
    for (const ende of [kante.von, kante.nach]) {
      if (!adjazenz.has(ende)) adjazenz.set(ende, []);
      adjazenz.get(ende)!.push(kante);
    }
  }
  return { knoten, adjazenz, stufe: 3, gleise };
}

const k = (id: string, level = 0, gleis?: string): GraphKnoten => ({
  id,
  lat: 52,
  lon: 12,
  level,
  ...(gleis ? { gleis, abschnitt: 'mitte' } : {}),
});

describe('klassifiziere', () => {
  it('Mini-Bahnhof (Ebenenwechsel + verbundene Bahnsteige) → Stufe 1', () => {
    const graph = baueGraph(ladeFixture('synthetisch/mini-bahnhof'));
    expect(klassifiziere(graph)).toBe(1);
  });

  it('Fußweg ohne Ebenenwechsel → Stufe 2', () => {
    const graph = macheGraph(
      [k('gleis1:mitte', 0, '1'), k('n1@0'), k('n2@0')],
      [
        { von: 'gleis1:mitte', nach: 'n1@0', laengeM: 5, deltaLevel: 0, typ: 'eben', barrierefrei: true },
        { von: 'n1@0', nach: 'n2@0', laengeM: 50, deltaLevel: 0, typ: 'eben', barrierefrei: true },
      ],
      ['1'],
    );
    expect(klassifiziere(graph)).toBe(2);
  });

  it('Ebenenwechsel vorhanden, aber Bahnsteige unverbunden → Stufe 2', () => {
    const graph = macheGraph(
      [k('gleis1:mitte', 0, '1'), k('gleis2:mitte', 0, '2'), k('n1@0'), k('n2@-1')],
      [
        { von: 'gleis1:mitte', nach: 'n1@0', laengeM: 5, deltaLevel: 0, typ: 'eben', barrierefrei: true },
        { von: 'n1@0', nach: 'n2@-1', laengeM: 20, deltaLevel: -1, typ: 'treppe', barrierefrei: false },
        // gleis2:mitte hängt in der Luft – keine Verbindung
      ],
      ['1', '2'],
    );
    expect(klassifiziere(graph)).toBe(2);
  });

  it('leerer Graph → Stufe 3', () => {
    const graph = macheGraph([], [], []);
    expect(klassifiziere(graph)).toBe(3);
  });

  it('Zernitz (kaum Daten) → Stufe 3 oder 2, nie 1', () => {
    const graph = baueGraph(ladeFixture('overpass/zernitz'));
    expect(klassifiziere(graph)).not.toBe(1);
  });
});

describe('erreichbareGleisPaare', () => {
  it('Mini-Bahnhof: alle Gleispaare verbunden → 1', () => {
    const graph = baueGraph(ladeFixture('synthetisch/mini-bahnhof'));
    expect(erreichbareGleisPaare(graph)).toBe(1);
  });

  it('zwei unverbundene Bahnsteige → 0', () => {
    const graph = macheGraph(
      [k('gleis1:mitte', 0, '1'), k('gleis2:mitte', 0, '2')],
      [],
      ['1', '2'],
    );
    expect(erreichbareGleisPaare(graph)).toBe(0);
  });
});
