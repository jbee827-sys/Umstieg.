import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { holeAnlagen } from '../src/clients/fasta.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';
import { wendeFastaAn } from '../src/core/synthmodell.js';
import { berechneRoute } from '../src/core/routing.js';
import { baueGraph } from '../src/core/graph.js';
import type { FastaAnlage, GraphKante, GraphKnoten, OverpassAntwort, StationGraph } from '../src/core/typen.js';

function ladeFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/db/${name}`, import.meta.url)), 'utf8');
}

describe('holeAnlagen', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  function antwortMit(fixture: string): typeof fetch {
    return (async () =>
      new Response(ladeFixture(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
  }

  // Aufgezeichnet am 05.09.2026 gegen die echte API. Das Vorgaengerfixture
  // war handgebaut UND hatte die falsche Form: FaSta liefert ein blankes
  // Array, nicht {facilities: [...]}. Der Client vertrug beides - zufaellig.
  it('parst die echte Hannover-Antwort (blankes Array)', async () => {
    const anlagen = await holeAnlagen('2545', antwortMit('fasta-hannover-8000152.json'));
    expect(anlagen.length).toBeGreaterThanOrEqual(18);
    for (const a of anlagen) {
      expect(a.id, 'jede Anlage braucht eine Identitaet').toBeTruthy();
      expect(['AUFZUG', 'ROLLTREPPE']).toContain(a.typ);
      expect(Number.isFinite(a.lat) && Number.isFinite(a.lon)).toBe(true);
    }
  });

  it('die Identitaet ist die equipmentnumber und ist eindeutig', async () => {
    const anlagen = await holeAnlagen('1071', antwortMit('fasta-berlin-8011160.json'));
    const ids = anlagen.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // In der Sondierung: Berlin 69 von 70 Anlagen mit Koordinaten.
  it('verwirft Anlagen ohne Koordinaten', async () => {
    const anlagen = await holeAnlagen('1071', antwortMit('fasta-berlin-8011160.json'));
    expect(anlagen.every((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))).toBe(true);
    expect(anlagen.length).toBeLessThan(70);
  });

  // Belegt: `state: UNKNOWN` kommt wirklich vor (Frankfurt 1x, Eberswalde 2x).
  // Die konservative Abbildung auf INACTIVE ist damit belegt richtig, nicht
  // nur vorsichtig - die barrierefreie Route verlaesst sich nie auf eine
  // Anlage mit unklarem Status.
  it('fuehrt jeden nicht-ACTIVE Status als INACTIVE', async () => {
    const anlagen = await holeAnlagen('1071', antwortMit('fasta-berlin-8011160.json'));
    expect(anlagen.every((a) => a.status === 'ACTIVE' || a.status === 'INACTIVE')).toBe(true);
  });

  it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    await expect(holeAnlagen('1071')).rejects.toBeInstanceOf(FehlendeZugangsdatenError);
  });
});

describe('wendeFastaAn (OSM-Graph)', () => {
  function graphMitAufzug(): StationGraph {
    const knoten: GraphKnoten[] = [
      { id: 'a@0', lat: 52.525, lon: 13.369, level: 0 },
      { id: 'b@-1', lat: 52.525, lon: 13.369, level: -1 },
    ];
    const kante: GraphKante = {
      von: 'a@0', nach: 'b@-1', laengeM: 5, deltaLevel: -1, typ: 'aufzug', barrierefrei: true,
    };
    const adjazenz = new Map<string, GraphKante[]>([
      ['a@0', [kante]],
      ['b@-1', [kante]],
    ]);
    return { knoten: new Map(knoten.map((k) => [k.id, k])), adjazenz, stufe: 1, gleise: [] };
  }

  it('INACTIVE-Anlage in der Nähe sperrt die Aufzugkante (barrierefrei → null)', () => {
    const graph = graphMitAufzug();
    const anlagen: FastaAnlage[] = [
      { id: 'a1', typ: 'AUFZUG', lat: 52.525, lon: 13.369, status: 'INACTIVE' },
    ];
    wendeFastaAn(graph, anlagen);
    expect(berechneRoute(graph, 'a@0', 'b@-1', 'barrierefrei')).toBeNull();
    // schnellste bleibt möglich – nur die barrierefreie Variante sperrt
    expect(berechneRoute(graph, 'a@0', 'b@-1', 'schnellste')).not.toBeNull();
  });

  it('weit entfernte Anlage verändert den Graphen nicht', () => {
    const graph = graphMitAufzug();
    wendeFastaAn(graph, [{ id: 'a1', typ: 'AUFZUG', lat: 52.6, lon: 13.5, status: 'INACTIVE' }]);
    expect(berechneRoute(graph, 'a@0', 'b@-1', 'barrierefrei')).not.toBeNull();
  });
});

describe('wendeFastaAn: Zuordnung ueber Identitaet', () => {
  function graphMitIdKante(): StationGraph {
    const knoten: GraphKnoten[] = [
      { id: 'gleis1:mitte', lat: 52.525, lon: 13.369, level: 0, gleis: '1' },
      { id: 'quer:bs0@-1', lat: 52.525, lon: 13.369, level: -1 },
    ];
    const kante: GraphKante = {
      von: 'gleis1:mitte',
      nach: 'quer:bs0@-1',
      laengeM: 45,
      deltaLevel: -1,
      typ: 'aufzug',
      barrierefrei: true,
      anlageId: '10499908',
    };
    return {
      knoten: new Map(knoten.map((k) => [k.id, k])),
      adjazenz: new Map([
        ['gleis1:mitte', [kante]],
        ['quer:bs0@-1', [kante]],
      ]),
      stufe: 3,
      gleise: ['1'],
    };
  }

  // Der Berliner Regelfall: 280 m langer Bahnsteig, Anlage ~145 m vom
  // Schwerpunkt. Die alte 50-m-Schranke haette den Status verworfen und die
  // barrierefreie Route auf einem defekten Aufzug weiterlaufen lassen.
  it('greift auch bei ~145 m Abstand, wenn die anlageId passt', () => {
    const graph = graphMitIdKante();
    wendeFastaAn(graph, [
      { id: '10499908', typ: 'AUFZUG', lat: 52.5263, lon: 13.369, status: 'INACTIVE' },
    ]);
    expect(berechneRoute(graph, 'gleis1:mitte', 'quer:bs0@-1', 'barrierefrei')).toBeNull();
  });

  it('eine fremde anlageId laesst die Kante unberuehrt', () => {
    const graph = graphMitIdKante();
    wendeFastaAn(graph, [
      { id: 'ganz-andere', typ: 'AUFZUG', lat: 52.525, lon: 13.369, status: 'INACTIVE' },
    ]);
    expect(berechneRoute(graph, 'gleis1:mitte', 'quer:bs0@-1', 'barrierefrei')).not.toBeNull();
  });

  // Der OSM-Pfad bleibt, wie er war: ohne anlageId zaehlt die Entfernung,
  // und die 50-m-Schranke wirkt weiter.
  it('ohne anlageId gilt weiterhin die Entfernung mit 50-m-Schranke', () => {
    const graph = graphMitIdKante();
    for (const liste of graph.adjazenz.values()) {
      for (const k of liste) delete k.anlageId;
    }
    wendeFastaAn(graph, [
      { id: 'x', typ: 'AUFZUG', lat: 52.5263, lon: 13.369, status: 'INACTIVE' },
    ]);
    expect(
      berechneRoute(graph, 'gleis1:mitte', 'quer:bs0@-1', 'barrierefrei'),
      '145 m entfernt - ausserhalb der Schranke, Status darf nicht greifen',
    ).not.toBeNull();
  });
});

// Review-Fokus 3: Ein Aufzug ueber mehrere Ebenen ist ein Schacht aus mehreren
// Kanten. Meldet FaSta ihn als gestoert, darf keine davon auf der stufenfreien
// Route bleiben - auch nicht die, die gar nicht die naechste zur Anlage ist.
describe('wendeFastaAn: gestoerter Schacht', () => {
  const punkt = (id: number, lat: number, lon: number, tags?: Record<string, string>): OverpassAntwort['elements'][number] =>
    ({ type: 'node', id, lat, lon, ...(tags ? { tags } : {}) });
  const weg = (id: number, nodes: number[], tags: Record<string, string>): OverpassAntwort['elements'][number] => ({ type: 'way', id, nodes, tags });
  const baue = (): StationGraph => baueGraph({ elements: [
    punkt(1, 52.0, 12.0), punkt(2, 52.0, 12.001),
    punkt(3, 52.001, 12.0), punkt(4, 52.001, 12.001),
    punkt(5, 52.0005, 12.002),
    punkt(42, 52.0005, 12.0, { highway: 'elevator', level: '-2;-1;0;1;2' }),
    weg(10, [1, 2], { railway: 'platform', ref: '1', level: '-2' }),
    weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
    weg(20, [1, 42], { highway: 'footway', level: '-2' }),
    weg(21, [42, 5], { highway: 'footway', level: '0' }),
    weg(22, [42, 3], { highway: 'footway', level: '1' }),
  ] });
  const aufzugKanten = (graph: StationGraph): GraphKante[] =>
    [...new Set([...graph.adjazenz.values()].flat())].filter((k) => k.typ === 'aufzug');
  // ~3 m noerdlich des Aufzugknotens
  const naheAnlage = (status: 'ACTIVE' | 'INACTIVE'): FastaAnlage =>
    ({ id: 'F1', typ: 'AUFZUG', lat: 52.00053, lon: 12.0, status });

  it('INACTIVE sperrt alle Kanten des Schachts, nicht nur die naechste', () => {
    const graph = baue();
    expect(aufzugKanten(graph)).toHaveLength(3);
    wendeFastaAn(graph, [naheAnlage('INACTIVE')]);
    expect(aufzugKanten(graph).every((k) => k.status === 'INACTIVE')).toBe(true);
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')).not.toBeNull();
  });

  it('ACTIVE setzt ebenfalls alle Kanten des Schachts', () => {
    const graph = baue();
    wendeFastaAn(graph, [naheAnlage('ACTIVE')]);
    expect(aufzugKanten(graph).every((k) => k.status === 'ACTIVE')).toBe(true);
  });
});
