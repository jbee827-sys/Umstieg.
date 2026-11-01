import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph } from '../src/core/graph.js';
import { prellbockEnde } from '../src/core/routing.js';
import { entpackeEintrag } from '../src/osm/bestand.js';

/**
 * Am Kopfgleis steht die Zugspitze bei der Ankunft immer am Prellbock - egal
 * woher der Zug kommt. In Frankfurt(Main)Hbf kommt der RE aus Bad Hersfeld
 * ueber Frankfurt(Main)Sued, das suedoestlich liegt, und faehrt doch von
 * Westen ein: Die Lage der Nachbarhalte sagt am Kopfbahnhof wenig.
 *
 * Das Prellbock-Ende verraet der Graph: Dort verbindet der Querbahnsteig alle
 * Bahnsteige, am Vorfeld enden sie offen. Gezaehlt ueber alle Kopfgleise
 * einer Ebene, damit ein einzelner Bahnsteig das Ergebnis nicht kippt.
 */
async function graphVon(eva: string) {
  const pfad = fileURLToPath(new URL(`../osm-bestand/${eva}.json.gz`, import.meta.url));
  return baueGraph((await entpackeEintrag(readFileSync(pfad))).osm);
}

/** Welche Himmelsrichtung ein Bahnsteigende hat - zum Pruefen gegen die Wirklichkeit. */
function richtungVon(graph: Awaited<ReturnType<typeof graphVon>>, gleis: string, ende: 'anfang' | 'ende') {
  const p = graph.knoten.get(`gleis${gleis}:${ende}`)!;
  const q = graph.knoten.get(`gleis${gleis}:${ende === 'anfang' ? 'ende' : 'anfang'}`)!;
  const nord = (p.lat - q.lat) * 111;
  const ost = (p.lon - q.lon) * 71;
  return Math.abs(nord) > Math.abs(ost) ? (nord > 0 ? 'N' : 'S') : ost > 0 ? 'O' : 'W';
}

describe('prellbockEnde – wo die Kopfgleise enden', () => {
  const faelle: [string, string, string[], string][] = [
    ['Frankfurt(Main)Hbf', '8000105', Array.from({ length: 24 }, (_, i) => String(i + 1)), 'O'],
    ['München Hbf', '8000261', ['15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26'], 'O'],
    ['Leipzig Hbf', '8010205', ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'], 'S'],
    ['Stuttgart Hbf', '8000096', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'], 'S'],
  ];
  for (const [name, eva, kopfgleise, richtung] of faelle) {
    it(`findet in ${name} das Prellbock-Ende (${richtung})`, async () => {
      const graph = await graphVon(eva);
      const gleis = kopfgleise.find((g) => graph.knoten.has(`gleis${g}:anfang`))!;
      const ende = prellbockEnde(graph, kopfgleise, gleis);
      expect(ende).toBeDefined();
      expect(richtungVon(graph, gleis, ende!)).toBe(richtung);
    });
  }

  it('schweigt ohne Kopfgleise im Graphen', async () => {
    const graph = await graphVon('8000105');
    expect(prellbockEnde(graph, ['999'], '999')).toBeUndefined();
  });
});
