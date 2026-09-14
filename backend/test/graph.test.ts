import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph, graphZuGeoJSON, haversineM } from '../src/core/graph.js';
import { berechneRoute } from '../src/core/routing.js';
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

/** Kuerzeste Strecke in Metern ueber die Kanten – fuer Erreichbarkeit mit Mass. */
function kuerzesteDistanz(graph: StationGraph, vonId: string, nachId: string): number {
  const dist = new Map<string, number>([[vonId, 0]]);
  const offen = new Set(graph.knoten.keys());
  while (offen.size > 0) {
    let u: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const k of offen) {
      const d = dist.get(k) ?? Number.POSITIVE_INFINITY;
      if (d < best) {
        best = d;
        u = k;
      }
    }
    if (u === null || best === Number.POSITIVE_INFINITY) break;
    offen.delete(u);
    if (u === nachId) return best;
    for (const kante of graph.adjazenz.get(u) ?? []) {
      const v = kante.von === u ? kante.nach : kante.von;
      const alt = best + kante.laengeM;
      if (alt < (dist.get(v) ?? Number.POSITIVE_INFINITY)) dist.set(v, alt);
    }
  }
  return Number.POSITIVE_INFINITY;
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

describe('graphZuGeoJSON', () => {
  it('liefert Routenlinien je Ebene plus Start-/Zielmarker (Koordinaten [lon, lat])', () => {
    const graph = baueGraph(ladeFixture('synthetisch/mini-bahnhof'));
    const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')!;
    const geo = graphZuGeoJSON(graph, pfad) as Record<
      string,
      { type: string; features: { type: string; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] }
    >;

    // Route wechselt die Ebene (Unterfuehrung) -> mehrere Ebenen-Schluessel
    expect(Object.keys(geo).length).toBeGreaterThanOrEqual(2);
    for (const sammlung of Object.values(geo)) {
      expect(sammlung.type).toBe('FeatureCollection');
    }

    const alleFeatures = Object.values(geo).flatMap((s) => s.features);
    const linien = alleFeatures.filter((f) => f.geometry.type === 'LineString' && f.properties.route === true);
    expect(linien.length).toBeGreaterThanOrEqual(2);

    const start = alleFeatures.find((f) => f.properties.rolle === 'start');
    const ziel = alleFeatures.find((f) => f.properties.rolle === 'ziel');
    expect(start).toBeDefined();
    expect(ziel).toBeDefined();
    const startKnoten = pfad.knoten[0];
    expect(start!.geometry.coordinates).toEqual([startKnoten.lon, startKnoten.lat]);
  });

  it('leerer Pfad -> leeres Objekt', () => {
    const graph = baueGraph(ladeFixture('synthetisch/mini-bahnhof'));
    expect(graphZuGeoJSON(graph, { knoten: [], kanten: [], laengeM: 0 })).toEqual({});
  });
});

/**
 * Der Ebenensprung, gefunden am 01.09.2026 bei der Sichtpruefung: Die
 * Weg-Seite zeigte Gleis 4 in Berlin Hbf auf Ebene 0 - zwei Stockwerke ueber
 * seinem wirklichen Ort. Ursache waren zwei Fehler, die sich addierten:
 *
 * 1. `wayEbene` raet 0, wenn OSM kein `level` fuehrt. Eine Vermutung, die
 *    wie eine Tatsache aussieht.
 * 2. Bahnsteigknoten heissen `gleisN:*` und werden nur einmal angelegt.
 *    Teilen sich zwei verschiedene Bahnsteige eine Gleisnummer - in Berlin
 *    der U-Bahnsteig "S+U Hauptbahnhof" (ohne level) und "Berlin
 *    Hauptbahnhof (Tief)" (level -2) -, behielt der Knoten die Ebene UND die
 *    Lage des zuerst verarbeiteten, wurde aber vom zweiten ans -2-Netz
 *    gehaengt. Ergebnis: eine ebene Kante ueber zwei Stockwerke.
 */
describe('Bahnsteigebenen - keine geratenen Stockwerke', () => {
  const berlin = baueGraph(ladeFixture('overpass/berlin-hbf'));

  it('legt keine ebene Kante zwischen zwei Ebenen an', () => {
    const spruenge: string[] = [];
    for (const [vonId, kanten] of berlin.adjazenz) {
      for (const kante of kanten) {
        if (kante.typ !== 'eben' && kante.typ !== 'rampe') continue;
        const von = berlin.knoten.get(vonId)!;
        const nach = berlin.knoten.get(kante.nach)!;
        if (von.level !== nach.level) {
          spruenge.push(`${vonId}(L${von.level}) -${kante.typ}-> ${kante.nach}(L${nach.level})`);
        }
      }
    }
    // Ein ebener Schritt, der die Ebene wechselt, ist immer ein Datenfehler -
    // er waere zu Fuss nicht gehbar.
    expect(spruenge).toEqual([]);
  });

  it('legt Gleis 4 und 5 in die Tiefe, nicht ins Erdgeschoss', () => {
    const ebeneVon = (gleis: string) =>
      [...berlin.knoten.values()].filter((k) => k.gleis === gleis).map((k) => k.level);
    // "Berlin Hauptbahnhof (Tief)" fuehrt beide mit level=-2; der gleichnamige
    // U-Bahnsteig fuehrt gar keine Ebene. Belegtes schlaegt Geraten.
    expect(new Set(ebeneVon('4'))).toEqual(new Set([-2]));
    expect(new Set(ebeneVon('5'))).toEqual(new Set([-2]));
  });

  it('laesst die uebrigen Gleise, wo sie waren', () => {
    const ebeneVon = (gleis: string) => berlin.knoten.get(`gleis${gleis}:mitte`)?.level;
    expect(ebeneVon('15')).toBe(2); // Stadtbahn oben
    expect(ebeneVon('1')).toBe(-2); // Tief
    expect(ebeneVon('8')).toBe(-2);
  });

  it('haelt Gleis 4 im Wegenetz erreichbar', () => {
    // Die Korrektur darf den Bahnhof nicht zerschneiden: Wer die Ebene
    // richtigstellt, aber die Anbindung verliert, hat nichts gewonnen.
    expect(erreichbar(berlin, 'gleis15:mitte', 'gleis4:mitte')).toBe(true);
  });
});

/**
 * Zwischenziele der Variante `mit-stopp` (Spec 8.3).
 *
 * Die Spec ging davon aus, die Daten seien schon da - Overpass fragte WC und
 * Kiosk aber gar nicht ab. Seit dem 05.09.2026 tut sie es; hier steht, was
 * `baueGraph` daraus machen muss.
 */
describe('POI-Knoten fuer die Variante mit-stopp', () => {
  /** Zwei Bahnsteigpunkte auf einem Weg, daneben ein WC und ein Kiosk. */
  const mitPois: OverpassAntwort = {
    elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
      { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
      {
        type: 'way',
        id: 10,
        nodes: [1, 2],
        tags: { railway: 'platform', ref: '1', level: '0' },
      },
      // Dicht an den Bahnsteigknoten - die Anbindung greift bis 30 m, und
      // echte Bahnsteige sind eng besetzt. Mittig zwischen zwei Endknoten
      // laege beides ausserhalb, zu Recht.
      { type: 'node', id: 3, lat: 52.00005, lon: 12.0001, tags: { amenity: 'toilets' } },
      { type: 'node', id: 4, lat: 52.00006, lon: 12.0019, tags: { shop: 'kiosk' } },
    ],
  };

  it('nimmt WC und Kiosk als Knoten auf', () => {
    const graph = baueGraph(mitPois);
    const pois = [...graph.knoten.values()].filter((k) => k.poi);
    expect(pois.map((k) => k.poi).sort()).toEqual(['kiosk', 'wc']);
  });

  it('haengt sie an den begehbaren Graphen an', () => {
    // Ein POI, den kein Weg erreicht, ist als Zwischenziel wertlos.
    const graph = baueGraph(mitPois);
    const wc = [...graph.knoten.values()].find((k) => k.poi === 'wc')!;
    expect(erreichbar(graph, 'n1@0', wc.id)).toBe(true);
  });

  it('verbindet sie eben, nicht ueber einen Ebenenwechsel', () => {
    const graph = baueGraph(mitPois);
    const wc = [...graph.knoten.values()].find((k) => k.poi === 'wc')!;
    for (const kante of graph.adjazenz.get(wc.id) ?? []) {
      expect(kante.typ).toBe('eben');
      expect(kante.deltaLevel).toBe(0);
    }
  });

  it('macht aus einem POI kein Gleis', () => {
    // `gleise` speist die Gleisliste der Klassifikation - ein WC darf dort
    // nicht als waehlbares Gleis auftauchen.
    const graph = baueGraph(mitPois);
    expect(graph.gleise).toEqual(['1']);
  });

  it('kommt ohne POIs unveraendert zurecht', () => {
    const ohne: OverpassAntwort = { elements: mitPois.elements.slice(0, 3) };
    const graph = baueGraph(ohne);
    expect([...graph.knoten.values()].filter((k) => k.poi)).toHaveLength(0);
  });
});

/**
 * Regression (gemeldet 07.09.2026): Braunschweig Hbf fand keine barrierefreie
 * Route, obwohl vier Aufzuege kartiert und laut FaSta alle ACTIVE sind.
 *
 * Die Aufzuege waren nie das Problem - alle vier stehen als barrierefreie
 * Kanten im Graphen. Der Bahnsteig 1/2 kam nur nicht an seinen heran: In OSM
 * haengt dessen Aufzugausstieg auf Ebene 1 an KEINEM Wegenetz, er bildet mit
 * zwei Stummelknoten eine eigene Insel. Die Anbindung der Bahnsteigpunkte
 * waehlt genau EINEN naechsten Wegknoten (`ANBINDUNG_MAX_M`), und das war
 * mit 2 m ein anderer - der Aufzug in 8 m fiel heraus.
 *
 * Die drei uebrigen Bahnsteige funktionierten nur, weil OSM ihre Aufzuege
 * zufaellig mit dem Bahnsteigweg verbindet. Auf dieses Glueck darf sich eine
 * barrierefreie Auskunft nicht verlassen.
 */
describe('Verwaiste Aufzugausstiege (Braunschweig Hbf)', () => {
  const bs = baueGraph(ladeFixture('overpass/braunschweig-hbf'));

  /** Knotenmengen, die ueber barrierefreie Kanten zusammenhaengen. */
  function bfKomponente(graph: StationGraph, start: string): Set<string> {
    const gesehen = new Set<string>([start]);
    const stapel = [start];
    while (stapel.length > 0) {
      const id = stapel.pop()!;
      for (const kante of graph.adjazenz.get(id) ?? []) {
        if (!kante.barrierefrei) continue;
        const nachbar = kante.von === id ? kante.nach : kante.von;
        if (!gesehen.has(nachbar)) {
          gesehen.add(nachbar);
          stapel.push(nachbar);
        }
      }
    }
    return gesehen;
  }

  it('bindet den Aufzug an Bahnsteig 1/2 an', () => {
    // n4061917638 ist der Aufzug 8 m neben der Mitte von Gleis 1
    // (FaSta-Anlage 10453807, ACTIVE). Ohne Anbindung ist er unerreichbar.
    const vonGleis1 = bfKomponente(bs, 'gleis1:mitte');
    expect(vonGleis1.has('n4061917638@1')).toBe(true);
  });

  it('findet eine barrierefreie Route von Gleis 1 nach Gleis 5', () => {
    const pfad = berechneRoute(bs, 'gleis1:mitte', 'gleis5:mitte', 'barrierefrei', 'normal');
    expect(pfad).not.toBeNull();
  });

  it('laesst keinen Bahnsteig ohne Aufzug zurueck', () => {
    // Die Richtung ist entscheidend. Vom verwaisten Aufzug AUS kommt man
    // sehr wohl an Bahnsteige - ueber Ebene 0 zu den Gleisen 3 bis 8. Die
    // Sperre wirkt nur andersherum: Bahnsteig 1/2 erreicht keinen Aufzug.
    // Ein Bahnsteig auf Ebene 1, von dem aus barrierefrei kein Aufzug zu
    // erreichen ist, ist eine Sackgasse - dorthin kommt niemand im Rollstuhl.
    const ohneAufzug: string[] = [];
    for (const gleis of bs.gleise) {
      const id = `gleis${gleis}:mitte`;
      if (!bs.knoten.has(id)) continue;
      const komp = bfKomponente(bs, id);
      const hatAufzug = [...komp].some((k) =>
        (bs.adjazenz.get(k) ?? []).some((kante) => kante.typ === 'aufzug'),
      );
      if (!hatAufzug) ohneAufzug.push(id);
    }
    expect(ohneAufzug).toEqual([]);
  });
});

describe('Bahnsteig als begehbare Linie', () => {
  const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));

  it('macht den Bahnsteig auf ganzer Laenge begehbar, nicht nur an drei Punkten', () => {
    // n2739626420 ist der Fuss einer Rolltreppe, 5 m neben der Achse von
    // Gleis 5/6 und 123 m von dessen Anfang. Die Bahnsteigmitte liegt bei
    // 215 m - 92 m Luftlinie. Ueber eine Kette aus nur anfang/mitte/ende
    // waren es 342 m: erst 123 m zurueck zum Anfang, dann 215 m vor.
    const d = kuerzesteDistanz(graph, 'n2739626420@-2', 'gleis6:mitte');
    expect(d).toBeLessThan(150);
  });

  it('verdichtet die Kette JEDES Gleises eines Bahnsteigs, nicht nur des letzten', () => {
    // Leipzig Hbf, Bahnsteig 6/7, gemessen am 14.09.2026: gleis6:mitte hing
    // nur an gleis6:anfang und gleis6:ende, je 103 m entfernt. Die Treppe zur
    // Unterfuehrung 72 m weiter kostete deshalb 139 s statt 72 s - erst zum
    // Anfang, dann zurueck. Die Achsen waren nach Bahnsteig geschluesselt, und
    // gleis7:* ueberschrieb gleis6:*.
    const zwei = baueGraph(ladeFixture('synthetisch/zweigleisbahnsteig'));
    // Mitte bei 102 m, Treppenkopf bei 62 m: 41 m Luftlinie.
    expect(kuerzesteDistanz(zwei, 'gleis1:mitte', 'n710@0')).toBeLessThan(60);
    expect(kuerzesteDistanz(zwei, 'gleis2:mitte', 'n710@0')).toBeLessThan(60);
  });

  it('verbindet keine Knoten des Nachbarbahnsteigs in die Kette', () => {
    // Die Tiefbahnsteige liegen 24 m auseinander. Wuerde die Anbindung so
    // weit greifen, entstuende ein ebener Weg zwischen zwei Bahnsteigen -
    // durch die Gleise hindurch.
    const d = kuerzesteDistanz(graph, 'gleis6:mitte', 'gleis8:mitte');
    expect(d).toBeGreaterThan(40);
  });
});
