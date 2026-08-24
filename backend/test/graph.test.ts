import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph, haversineM } from '../src/core/graph.js';
import type { OverpassAntwort, StationGraph } from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

/** Breitensuche über die Adjazenzliste – prüft Erreichbarkeit. */
function erreichbar(graph: StationGraph, vonId: string, nachId: string): boolean {
  const besucht = new Set<string>([vonId]);
  const queue = [vonId];
  while (queue.length > 0) {
    const aktuell = queue.shift()!;
    if (aktuell === nachId) return true;
    for (const kante of graph.adjazenz.get(aktuell) ?? []) {
      const naechster = kante.von === aktuell ? kante.nach : kante.von;
      if (!besucht.has(naechster)) {
        besucht.add(naechster);
        queue.push(naechster);
      }
    }
  }
  return false;
}

describe('haversineM', () => {
  it('berechnet die Distanz auf Meter genau', () => {
    // 0,002° Länge auf Breite 52° ≈ 136,9 m
    const d = haversineM(52.0, 12.0, 52.0, 12.002);
    expect(Math.abs(d - 136.9)).toBeLessThan(1);
  });
});

describe('baueGraph – Mini-Bahnhof', () => {
  const graph = baueGraph(ladeFixture('synthetisch/mini-bahnhof'));

  it('findet alle Gleise inkl. Mehrfach-ref "2;3"', () => {
    expect(graph.gleise).toEqual(['1', '2', '3']);
  });

  it('erzeugt Bahnsteigpunkte anfang/mitte/ende mit bahnsteigId', () => {
    const mitte = graph.knoten.get('gleis1:mitte');
    expect(mitte).toBeDefined();
    expect(mitte!.gleis).toBe('1');
    expect(mitte!.abschnitt).toBe('mitte');
    expect(mitte!.bahnsteigId).toBe('w201');
    // Gleis 2 und 3 liegen am selben Bahnsteig
    expect(graph.knoten.get('gleis2:mitte')!.bahnsteigId).toBe('w202');
    expect(graph.knoten.get('gleis3:mitte')!.bahnsteigId).toBe('w202');
  });

  it('erzeugt eine Aufzugkante zwischen den Ebenen-Instanzen des Aufzugknotens', () => {
    const kanten = graph.adjazenz.get('n130@-1') ?? [];
    const aufzug = kanten.find((k) => k.typ === 'aufzug');
    expect(aufzug).toBeDefined();
    expect(aufzug!.barrierefrei).toBe(true);
    expect([aufzug!.von, aufzug!.nach]).toContain('n130@0');
  });

  it('kollabiert die Treppe zu einer Kante mit deltaLevel und barrierefrei=false', () => {
    const kanten = graph.adjazenz.get('n122@-1') ?? [];
    const treppe = kanten.find((k) => k.typ === 'treppe');
    expect(treppe).toBeDefined();
    expect(treppe!.barrierefrei).toBe(false);
    const anderesEnde = treppe!.von === 'n122@-1' ? treppe!.nach : treppe!.von;
    expect(anderesEnde).toBe('n121@0');
    expect(Math.abs(treppe!.deltaLevel)).toBe(1);
  });

  it('verbindet Gleis 1 mit Gleis 2 über die Unterführung', () => {
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(true);
  });
});

describe('baueGraph – echte Fixtures (Smoke)', () => {
  it('Berlin Hbf: baut einen Graphen mit vielen Gleisen', () => {
    const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));
    expect(graph.gleise.length).toBeGreaterThan(5);
    expect(graph.knoten.size).toBeGreaterThan(100);
  });

  it('Zernitz: wirft nicht, auch wenn kaum Daten vorhanden sind', () => {
    const graph = baueGraph(ladeFixture('overpass/zernitz'));
    expect(graph.knoten.size).toBeGreaterThanOrEqual(0);
  });
});
