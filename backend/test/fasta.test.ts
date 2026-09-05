import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { holeAnlagen } from '../src/clients/fasta.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';
import { wendeFastaAn } from '../src/core/synthmodell.js';
import { berechneRoute } from '../src/core/routing.js';
import type { FastaAnlage, GraphKante, GraphKnoten, StationGraph } from '../src/core/typen.js';

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
