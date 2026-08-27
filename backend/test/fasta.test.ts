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

  it('parst Aufzüge und Rolltreppen mit Status und Koordinaten', async () => {
    const mock = (async () =>
      new Response(ladeFixture('fasta-facilities.json'), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const anlagen = await holeAnlagen('8011160', mock);
    expect(anlagen).toHaveLength(2);
    expect(anlagen[0]).toEqual({
      typ: 'AUFZUG',
      lat: 52.525,
      lon: 13.369,
      status: 'ACTIVE',
      beschreibung: 'Aufzug zur Ebene +1',
    });
    expect(anlagen[1].typ).toBe('ROLLTREPPE');
    expect(anlagen[1].status).toBe('INACTIVE');
  });

  it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    await expect(holeAnlagen('8011160')).rejects.toBeInstanceOf(FehlendeZugangsdatenError);
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
      { typ: 'AUFZUG', lat: 52.525, lon: 13.369, status: 'INACTIVE' },
    ];
    wendeFastaAn(graph, anlagen);
    expect(berechneRoute(graph, 'a@0', 'b@-1', 'barrierefrei')).toBeNull();
    // schnellste bleibt möglich – nur die barrierefreie Variante sperrt
    expect(berechneRoute(graph, 'a@0', 'b@-1', 'schnellste')).not.toBeNull();
  });

  it('weit entfernte Anlage verändert den Graphen nicht', () => {
    const graph = graphMitAufzug();
    wendeFastaAn(graph, [{ typ: 'AUFZUG', lat: 52.6, lon: 13.5, status: 'INACTIVE' }]);
    expect(berechneRoute(graph, 'a@0', 'b@-1', 'barrierefrei')).not.toBeNull();
  });
});
