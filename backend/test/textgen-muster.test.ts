import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pfadAusPlan } from '../src/clients/motis-weg.js';
import { wegAusPfad } from '../src/core/fussweg.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { baueGraph } from '../src/core/graph.js';
import { klassifiziere } from '../src/core/klassifikation.js';
import { berechneRoute, findeStartknoten } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import { syntheseGraph } from '../src/core/synthmodell.js';
import { bahnsteigEndenAusSchema, generiereText } from '../src/core/textgen.js';
import type { RoutenPfad, Schritt, StationGraph } from '../src/core/typen.js';
import { entpackeEintrag } from '../src/osm/bestand.js';

/*
 * Musterwege (Konzept 09, Abschnitt 7): Wege aus dem Startbestand mit
 * festgehaltenem Soll-Text - so, wie `routes/api.ts` sie rechnet (Schema
 * zuerst, dann der Text mit denselben Bahnsteignamen).
 *
 * Aendert sich ein Soll-Text, ist das eine Entscheidung ueber Wortlaut, kein
 * Testrauschen: erst lesen, ob der neue Satz besser ist. Nach dem Neufuellen
 * des Startbestands koennen sich die Wege selbst aendern - dann
 * `npx tsx scripts/textpruefung.ts` laufen lassen und hier nachziehen.
 */

const graphen = new Map<string, Promise<StationGraph>>();

function graphVon(eva: string): Promise<StationGraph> {
  if (!graphen.has(eva)) {
    graphen.set(
      eva,
      (async () => {
        const datei = fileURLToPath(new URL(`../osm-bestand/${eva}.json.gz`, import.meta.url));
        const eintrag = await entpackeEintrag(readFileSync(datei));
        const graph = baueGraph(eintrag.osm);
        graph.stufe = klassifiziere(graph);
        return graph;
      })(),
    );
  }
  return graphen.get(eva)!;
}

/** Die Invarianten aus Konzept 09, Abschnitt 3 - fuer jeden Musterweg. */
function pruefeInvarianten(pfad: RoutenPfad, schritte: Schritt[], baender: number): void {
  expect(schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0)).toBe(gehzeitSekunden(pfad, 'normal'));
  const laeufe = schritte.filter((x, i) => x.level !== undefined && x.level !== schritte[i - 1]?.level).length;
  expect(laeufe).toBe(baender);
  for (const s of schritte) {
    expect(s.text).not.toMatch(/Ebene|[-−]\d|ebenerdig|stufenlos/);
  }
  expect(schritte.length).toBeLessThanOrEqual(6);
}

interface Muster {
  bahnhof: string;
  eva: string;
  an: string;
  ab: string;
  abschnitt: 'anfang' | 'mitte' | 'ende';
  kurz: string;
  schritte: string[];
}

const MUSTER: Muster[] = [
  {
    bahnhof: 'Berlin Hbf (Aufzug über mehrere Ebenen)',
    eva: '8011160',
    an: '14',
    ab: '6',
    abschnitt: 'mitte',
    kurz: 'Aufzug runter zu Gleis 6.',
    schritte: ['Vom Zug aus nach links bis zum nächsten Aufzug', 'Aufzug runter zu Gleis 6'],
  },
  {
    bahnhof: 'Berlin Hbf (Gang mit Abzweigen)',
    eva: '8011160',
    an: '1',
    ab: '5',
    abschnitt: 'anfang',
    kurz: 'Nach rechts am Bahnsteig entlang, Rolltreppe hoch, dann Rolltreppe runter zu Gleis 5.',
    schritte: [
      'Vom Zug aus nach rechts bis zur nächsten Rolltreppe',
      'Rolltreppe hoch',
      'Durch den Gang, rechts, dann links, dann Rolltreppe runter zu Gleis 5',
    ],
  },
  {
    bahnhof: 'München Hbf (Querbahnsteig)',
    eva: '8000261',
    an: '14',
    ab: '6',
    abschnitt: 'mitte',
    kurz: 'Nach rechts am Bahnsteig entlang, dann rechts auf den Bahnsteig zu Gleis 6.',
    schritte: ['Vom Zug aus nach rechts bis zum Bahnsteigende', 'Durch den Gang', 'Rechts auf den Bahnsteig zu Gleis 6'],
  },
  {
    bahnhof: 'München Hbf (zum Tiefbahnhof)',
    eva: '8000261',
    an: '5',
    ab: '82',
    abschnitt: 'anfang',
    kurz: 'Nach rechts am Bahnsteig entlang, Rolltreppe runter in die Unterführung, dann Rolltreppe runter zu Gleis 82.',
    schritte: [
      'Vom Zug aus nach rechts bis zum Bahnsteigende',
      'Durch den Gang, rechts, dann Rolltreppe runter in die Unterführung',
      'Durch die Unterführung, rechts, dann rechts, dann Rolltreppe runter zu Gleis 82',
    ],
  },
  {
    bahnhof: 'Köln Hbf (Gangname)',
    eva: '8000207',
    an: '1',
    ab: '5',
    abschnitt: 'anfang',
    kurz: 'Nach links am Bahnsteig entlang, Treppe runter in die Unterführung, durch die B-Passage, dann Aufzug hoch zu Gleis 5.',
    schritte: [
      'Vom Zug aus nach links bis zur nächsten Treppe',
      'Treppe runter in die Unterführung',
      'Durch die B-Passage, dann Aufzug hoch zu Gleis 5',
    ],
  },
  {
    bahnhof: 'Bonn Hbf (Unterführung, Aufgänge gezählt)',
    eva: '8000044',
    an: '1',
    ab: '5',
    abschnitt: 'anfang',
    kurz: 'Nach rechts am Bahnsteig entlang, Rolltreppe runter in die Unterführung, dann dritter Aufgang links hoch zu Gleis 5.',
    schritte: [
      'Vom Zug aus nach rechts bis zur nächsten Rolltreppe',
      'Rolltreppe runter in die Unterführung, unten rechts',
      'Dritter Aufgang links, Rolltreppe hoch zu Gleis 5',
    ],
  },
  {
    bahnhof: 'Leipzig Hbf (Unterführung)',
    eva: '8010205',
    an: '6',
    ab: '16',
    abschnitt: 'anfang',
    kurz: 'Treppe runter in die Unterführung, dann Treppe hoch zu Gleis 16.',
    schritte: [
      'Vom Zug aus nach rechts bis zur nächsten Treppe',
      'Treppe runter in die Unterführung',
      'Durch die Unterführung, dann Treppe hoch auf den Bahnsteig',
      'Am Bahnsteig entlang zu Gleis 16',
    ],
  },
  {
    bahnhof: 'Leipzig Hbf (Querbahnsteig)',
    eva: '8010205',
    an: '2',
    ab: '10',
    abschnitt: 'mitte',
    kurz: 'Rolltreppe hoch, dann links auf den Bahnsteig zu Gleis 10.',
    schritte: [
      'Vom Zug aus nach rechts bis zur nächsten Rolltreppe',
      'Rolltreppe hoch',
      'Rolltreppe hoch',
      'Durch den Gang, links',
      'Links auf den Bahnsteig zu Gleis 10',
    ],
  },
  {
    bahnhof: 'Hamburg Hbf (Steg)',
    eva: '8002549',
    an: '2',
    ab: '13',
    abschnitt: 'mitte',
    kurz: 'Rolltreppe hoch, über den Südsteg, dann Rolltreppe runter zu Gleis 13.',
    schritte: ['Vom Zug aus zur Rolltreppe', 'Rolltreppe hoch', 'Über den Südsteg, dann Rolltreppe runter zu Gleis 13'],
  },
  {
    bahnhof: 'Stuttgart Hbf (Kopfbahnhof)',
    eva: '8000096',
    an: '2',
    ab: '10',
    abschnitt: 'mitte',
    kurz: 'Nach links bis zum Bahnsteigende, links, dann links zu Gleis 10.',
    schritte: ['Vom Zug aus nach links bis zum Bahnsteigende, links, dann links zu Gleis 10'],
  },
  {
    bahnhof: 'Günzburg (kleiner Bahnhof)',
    eva: '8000139',
    an: '1',
    ab: '5',
    abschnitt: 'anfang',
    kurz: 'Nach links am Bahnsteig entlang, Treppe runter in die Unterführung, dann Treppe hoch zu Gleis 5.',
    schritte: [
      'Vom Zug aus nach links bis zur nächsten Treppe',
      'Treppe runter in die Unterführung',
      'Durch die Unterführung, dann Treppe hoch zu Gleis 5',
    ],
  },
];

describe('Musterwege (Konzept 09, 7)', () => {
  for (const m of MUSTER) {
    it(`${m.bahnhof}: ${m.an} → ${m.ab} ab ${m.abschnitt}`, { timeout: 60_000 }, async () => {
      const graph = await graphVon(m.eva);
      const start = findeStartknoten(graph, m.an, m.abschnitt);
      const ziel = findeStartknoten(graph, m.ab);
      const pfad = berechneRoute(graph, start.knoten.id, ziel.knoten.id, 'schnellste', 'normal')!;
      const schema = baueBahnhofSchema(graph, pfad);
      const text = generiereText(pfad, {
        stil: 'bezug',
        profil: 'normal',
        graph,
        bahnsteigEnden: bahnsteigEndenAusSchema(schema),
      schema,
      });
      expect(text.schritte.map((s) => s.text)).toEqual(m.schritte);
      expect(text.kurzfassung).toBe(m.kurz);
      pruefeInvarianten(pfad, text.schritte, schema.ebenen.length);
    });
  }

  it('Standardmodell (Stufe 3): „ca.“ zeigt die Schätzung, nie „gegenüber“', () => {
    const graph = syntheseGraph({
      eva: '8000001',
      evas: ['8000001'],
      name: 'Ministadt',
      lat: 52.0,
      lon: 12.0,
      gleise: [
        { gleis: '1', lat: 52.0, lon: 12.0 },
        { gleis: '2', lat: 52.0004, lon: 12.0 },
      ],
    });
    const pfad = berechneRoute(
      graph,
      findeStartknoten(graph, '1', 'mitte').knoten.id,
      findeStartknoten(graph, '2').knoten.id,
      'schnellste',
      'normal',
    )!;
    const text = generiereText(pfad, { stil: 'bezug', profil: 'normal', graph, ungefaehr: true });
    expect(text.schritte.some((s) => s.text.toLowerCase().includes('ca. '))).toBe(true);
    expect(text.schritte[0].text).toBe('Vom Zug aus die Treppe runter');
    expect([...text.schritte.map((s) => s.text), text.kurzfassung].join(' ')).not.toMatch(/gegenüber|Unterführung/);
    expect(text.schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0)).toBe(gehzeitSekunden(pfad, 'normal'));
  });

  it('Haltestellenweg Göttingen Gleis 10 → Bus am ZOB: derselbe Baukasten, Steig als Ziel', () => {
    const plan = JSON.parse(
      readFileSync(fileURLToPath(new URL('./fixtures/motis/plan-goettingen-gleis10-zob.json', import.meta.url)), 'utf8'),
    );
    const weg = wegAusPfad(pfadAusPlan(plan)!, 'normal', 'zu Steig A (Bus 21)');
    expect(weg.schritte.map((s) => s.text)).toEqual([
      'Vom Ausstieg aus etwa 50 m bis zur Treppe',
      'Treppe runter, unten links',
      'Etwa 300 m geradeaus, rechts, dann links, dann rechts zu Steig A (Bus 21)',
    ]);
    expect(weg.kurzfassung).toBe('Treppe runter, dann etwa 300 m zu Steig A (Bus 21).');
  });
});
