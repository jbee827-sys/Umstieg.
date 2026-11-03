import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph, graphZuGeoJSON, haversineM, pfadZuGeoJSON } from '../src/core/graph.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import { erreichbareGleisPaare } from '../src/core/klassifikation.js';
import { berechneRoute } from '../src/core/routing.js';
import { generiereSchritte } from '../src/core/textgen.js';
import type { GraphKante, OverpassAntwort, StationGraph } from '../src/core/typen.js';

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

/**
 * Gleisnummern, wie OSM sie tatsächlich schreibt (Abgleich 02.10.2026).
 *
 * Gelesen wurde nur `ref` an `railway=platform`. Dadurch fehlten an 16 von
 * 116 Bahnhöfen Fahrplangleise – darunter Stuttgart, Karlsruhe und Mannheim
 * Hbf, die in OSM vollständig erfasst sind, nur eben in einer anderen
 * Schreibweise.
 */
describe('Gleisnummern in allen OSM-Schreibweisen', () => {
  // Ein Bahnsteig, ~205 m lang, ~11 m breit, ohne eigene Gleisnummer.
  const rechteck = (id: number, tags: Record<string, string>): OverpassAntwort['elements'] => [
    { type: 'node', id: 1, lat: 52.0, lon: 13.0 },
    { type: 'node', id: 2, lat: 52.0, lon: 13.003 },
    { type: 'node', id: 3, lat: 52.0001, lon: 13.003 },
    { type: 'node', id: 4, lat: 52.0001, lon: 13.0 },
    { type: 'way', id, nodes: [1, 2, 3, 4, 1], tags: { railway: 'platform', public_transport: 'platform', ...tags } },
  ];
  const bahnsteigVon = (graph: StationGraph, gleis: string) => graph.knoten.get(`gleis${gleis}:mitte`)?.bahnsteigId;

  it('liest local_ref – die Gleisnummer des ÖPNV-Schemas (Singen, Offenburg)', () => {
    const graph = baueGraph({ elements: rechteck(100, { local_ref: '4;5', train: 'yes' }) });
    expect(graph.gleise).toEqual(['4', '5']);
    expect(bahnsteigVon(graph, '4')).toBe(bahnsteigVon(graph, '5'));
  });

  it('nimmt local_ref vor ref – ref ist dort die Bahnsteigbezeichnung (Ostkreuz „Rn1")', () => {
    const graph = baueGraph({ elements: rechteck(100, { ref: 'Rn1', local_ref: '8' }) });
    expect(graph.gleise).toEqual(['8']);
  });

  it('nimmt local_ref vor ref, wenn beide sich widersprechen (Halle, „Bahnsteig 4/5")', () => {
    // ref=5;6 ist dort falsch: Der Bahnsteig heisst 4/5, die DB verbindet 4 mit 5.
    const graph = baueGraph({ elements: rechteck(100, { ref: '5;6', local_ref: '4;5', name: 'Bahnsteig 4/5' }) });
    expect(graph.gleise).toEqual(['4', '5']);
  });

  it('liest railway:track_ref (Karlsruhe, „Poststraße")', () => {
    const graph = baueGraph({ elements: rechteck(100, { 'railway:track_ref': '2' }) });
    expect(graph.gleise).toEqual(['2']);
  });

  it('hängt die Gleisnummern der Bahnsteigkanten an ihren Bahnsteig (Stuttgart, Mannheim)', () => {
    const graph = baueGraph({
      elements: [
        ...rechteck(100, {}),
        { type: 'node', id: 11, lat: 52.0001, lon: 13.0002 },
        { type: 'node', id: 12, lat: 52.0001, lon: 13.0028 },
        { type: 'node', id: 13, lat: 52.0, lon: 13.0002 },
        { type: 'node', id: 14, lat: 52.0, lon: 13.0028 },
        { type: 'way', id: 201, nodes: [11, 12], tags: { railway: 'platform_edge', ref: '7' } },
        { type: 'way', id: 202, nodes: [13, 14], tags: { railway: 'platform_edge', ref: '8' } },
      ],
    });
    expect(graph.gleise).toEqual(['7', '8']);
    expect(bahnsteigVon(graph, '7')).toBe('w100');
    expect(bahnsteigVon(graph, '8')).toBe('w100');
  });

  it('hängt eine Kante nicht an einen Bahnsteig, den sie nur kreuzt (Berlin Hbf, Gleis 3)', () => {
    // Kreuzungsbahnhof: Die Kante von Gleis 3 (ohne level) liegt unten,
    // nord-süd. Oben, auf Ebene 2, quert ein Bahnsteig ost-west genau ihre Mitte.
    const graph = baueGraph({
      elements: [
        // oben, Ebene 2, ost-west, mit eigenen Gleisen
        { type: 'node', id: 1, lat: 52.0, lon: 12.999 },
        { type: 'node', id: 2, lat: 52.0, lon: 13.001 },
        { type: 'node', id: 3, lat: 52.0001, lon: 13.001 },
        { type: 'node', id: 4, lat: 52.0001, lon: 12.999 },
        { type: 'way', id: 100, nodes: [1, 2, 3, 4, 1], tags: { railway: 'platform', ref: '11;12', level: '2' } },
        // unten, Ebene -2, nord-süd, die Kante liegt auf seinem Westrand
        { type: 'node', id: 5, lat: 51.999, lon: 13.0 },
        { type: 'node', id: 6, lat: 52.001, lon: 13.0 },
        { type: 'node', id: 7, lat: 52.001, lon: 13.00015 },
        { type: 'node', id: 8, lat: 51.999, lon: 13.00015 },
        { type: 'way', id: 200, nodes: [5, 6, 7, 8, 5], tags: { railway: 'platform', ref: '4', level: '-2' } },
        { type: 'node', id: 11, lat: 51.999, lon: 13.0 },
        { type: 'node', id: 12, lat: 52.00005, lon: 13.0 },
        { type: 'node', id: 13, lat: 52.001, lon: 13.0 },
        { type: 'way', id: 300, nodes: [11, 12, 13], tags: { railway: 'platform_edge', ref: '3' } },
      ],
    });
    expect(graph.knoten.get('gleis3:mitte')?.bahnsteigId).toBe('w200');
    expect(graph.knoten.get('gleis3:mitte')?.level).toBe(-2);
  });

  it('nimmt eine Bahnsteigkante ohne Bahnsteig als eigenen Bahnsteig', () => {
    const graph = baueGraph({
      elements: [
        { type: 'node', id: 11, lat: 52.0, lon: 13.0 },
        { type: 'node', id: 12, lat: 52.0, lon: 13.003 },
        { type: 'way', id: 201, nodes: [11, 12], tags: { railway: 'platform_edge', ref: '3', level: '1' } },
      ],
    });
    expect(graph.gleise).toEqual(['3']);
    expect(graph.knoten.get('gleis3:mitte')?.level).toBe(1);
  });
});

/**
 * Zuordnung über die IFOPT-Kennung (Abgleich 02.10.2026).
 *
 * RIS::Stations nennt je Gleis die DELFI-Kennung (`ifopt`), OSM trägt sie
 * am Bahnsteig (`ref:IFOPT`). Wo OSM die Gleisnummer nicht schreibt –
 * Hamburg-Altonas S-Bahnsteige, München Hbf tief –, verbindet sie die beiden
 * Quellen, ohne dass ein Name geraten wird.
 */
describe('Gleise über die IFOPT-Kennung', () => {
  const steig = (id: number, lat: number, tags: Record<string, string>): OverpassAntwort['elements'] => [
    { type: 'node', id: id * 10 + 1, lat, lon: 13.0 },
    { type: 'node', id: id * 10 + 2, lat, lon: 13.003 },
    { type: 'way', id, nodes: [id * 10 + 1, id * 10 + 2], tags: { railway: 'platform', ...tags } },
  ];
  const db = (gleis: string, ifopt: string) => ({ gleis, ris: { name: gleis, ifopt } });

  it('gibt einem Bahnsteig ohne Gleisnummer das Gleis, dessen Kennung er trägt (Altona)', () => {
    const graph = baueGraph({ elements: steig(1, 52.0, { 'ref:IFOPT': 'de:02000:80953:1:809109' }) }, [
      db('1', 'de:02000:80953:1:809109'),
    ]);
    expect(graph.gleise).toEqual(['1']);
  });

  it('nimmt den übergeordneten Bereich, wenn OSM nur ihn kennt (München tief, Gleis 1)', () => {
    const graph = baueGraph({ elements: steig(1, 52.0, { 'ref:IFOPT': 'de:09162:6:40' }) }, [
      db('1', 'de:09162:6:40:81'),
    ]);
    expect(graph.gleise).toEqual(['1']);
  });

  it('zieht den exakten Treffer dem Bereich vor (München tief, Gleis 2)', () => {
    const graph = baueGraph(
      {
        elements: [
          ...steig(1, 52.0, { 'ref:IFOPT': 'de:09162:6:40' }),
          ...steig(2, 52.001, { 'ref:IFOPT': 'de:09162:6:40:82' }),
        ],
      },
      [db('2', 'de:09162:6:40:82')],
    );
    expect(graph.knoten.get('gleis2:mitte')?.bahnsteigId).toBe('w2');
  });

  it('wählt nicht, wenn zwei Bahnsteige dieselbe Kennung tragen', () => {
    const graph = baueGraph(
      {
        elements: [
          ...steig(1, 52.0, { 'ref:IFOPT': 'de:08335:6554:2:2' }),
          ...steig(2, 52.001, { 'ref:IFOPT': 'de:08335:6554:2:2' }),
        ],
      },
      [db('2', 'de:08335:6554:2:2')],
    );
    expect(graph.gleise).toEqual([]);
  });

  it('nimmt einen Straßenbahnsteig auf, wenn die DB dort ein Gleis führt (Chemnitz)', () => {
    const graph = baueGraph(
      { elements: steig(1, 52.0, { tram: 'yes', local_ref: '4', 'ref:IFOPT': 'de:14511:30062:3:4' }) },
      [db('4', 'de:14511:30062:3:4')],
    );
    expect(graph.gleise).toEqual(['4']);
  });

  it('lässt Straßenbahnsteige ohne DB-Beleg draussen', () => {
    const graph = baueGraph({ elements: steig(1, 52.0, { tram: 'yes', local_ref: '4' }) }, [
      db('4', 'de:14511:30062:3:4'),
    ]);
    expect(graph.gleise).toEqual([]);
  });
});

describe('pfadZuGeoJSON (ohne Graph, Umstieg 2.0)', () => {
  it('liefert dasselbe wie graphZuGeoJSON, je Ebene getrennt', () => {
    const a = { id: 'a', lat: 52, lon: 13, level: 0 };
    const b = { id: 'b', lat: 52.001, lon: 13, level: -1 };
    const pfad = {
      knoten: [a, b],
      kanten: [{ von: 'a', nach: 'b', laengeM: 110, deltaLevel: -1, typ: 'treppe' as const, barrierefrei: false }],
      laengeM: 110,
    };
    const leer: StationGraph = { knoten: new Map(), adjazenz: new Map(), stufe: 1, gleise: [] };
    expect(pfadZuGeoJSON(pfad)).toEqual(graphZuGeoJSON(leer, pfad));
    expect(Object.keys(pfadZuGeoJSON(pfad)).sort()).toEqual(['-1', '0']);
    expect(pfadZuGeoJSON({ knoten: [], kanten: [], laengeM: 0 })).toEqual({});
  });
});

/**
 * Stuttgart Hbf, gemeldet 02.11.2026: Der Baustellensteg traegt `level=1`, seine
 * Fortsetzung gar keines und gilt damit als Ebene 0. Derselbe OSM-Punkt wurde zu
 * zwei Knoten ohne Kante dazwischen, und die S-Bahn (99 von 156 Abfahrten) hing
 * an keinem Weg mehr. Die Naht greift nur, wenn Gleise sonst getrennt blieben.
 */
describe('Naht bei getrennten Gleisen', () => {
  const punkt = (id: number, lat: number, lon: number): OverpassAntwort['elements'][number] => ({ type: 'node', id, lat, lon });
  const weg = (id: number, nodes: number[], tags: Record<string, string>): OverpassAntwort['elements'][number] => ({ type: 'way', id, nodes, tags });
  const punkte = [
    punkt(1, 52.0, 12.0), punkt(2, 52.0, 12.001),
    punkt(3, 52.001, 12.0), punkt(4, 52.001, 12.001),
    punkt(5, 52.0003, 12.0005), punkt(6, 52.0007, 12.0005),
  ];
  const fussweg = { highway: 'footway' };
  const rampen = (graph: StationGraph): string[] => {
    const kanten = new Set([...graph.adjazenz.values()].flat().filter((k) => k.typ === 'rampe'));
    return [...kanten].map((k) => `${k.von}>${k.nach}:${k.deltaLevel}:${k.laengeM}`).sort();
  };

  it('verbindet belegte Ebene und erratenen Weg am gemeinsamen OSM-Punkt', () => {
    const graph = baueGraph({ elements: [
      ...punkte,
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '-1' }),
      weg(20, [1, 5], { ...fussweg, level: '1' }),
      weg(21, [5, 6], fussweg),
      weg(22, [6, 3], { ...fussweg, level: '-1' }),
    ] });
    expect(rampen(graph)).toEqual(['n5@0>n5@1:1:0', 'n6@0>n6@-1:-1:0']);
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).not.toBeNull();
  });

  it('gibt einem erratenen Verbindungsstueck die Ebene seiner Nachbarn statt zweier Rampen', () => {
    const graph = baueGraph({ elements: [
      ...punkte,
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
      weg(20, [1, 5], { ...fussweg, level: '1' }),
      weg(21, [5, 6], fussweg),
      weg(22, [6, 3], { ...fussweg, level: '1' }),
    ] });
    expect(rampen(graph)).toEqual([]);
    expect(graph.knoten.has('n5@0')).toBe(false);
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(true);
  });

  it('laesst einen verbundenen Bahnhof unangetastet', () => {
    const graph = baueGraph({ elements: [
      ...punkte,
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
      weg(20, [1, 3], { ...fussweg, level: '1' }),
      weg(21, [1, 6], fussweg),
    ] });
    expect(rampen(graph)).toEqual([]);
    expect(erreichbar(graph, 'n6@0', 'gleis1:mitte')).toBe(false);
  });

  it('verbindet zwei belegte Ebenen nicht - das waere geraten', () => {
    const graph = baueGraph({ elements: [
      ...punkte,
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '-1' }),
      weg(20, [1, 5], { ...fussweg, level: '1' }),
      weg(22, [5, 3], { ...fussweg, level: '-1' }),
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });

  it('ersetzt am Aufzugknoten nicht den Aufzug durch eine Rampe', () => {
    const graph = baueGraph({ elements: [
      ...punkte.filter((p) => p.id !== 5),
      { ...punkt(5, 52.0003, 12.0005), tags: { highway: 'elevator' } },
      punkt(7, 52.002, 12.0), punkt(8, 52.002, 12.001), punkt(9, 52.0015, 12.0005),
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '0' }),
      weg(12, [7, 8], { railway: 'platform', ref: '3', level: '1' }),
      weg(20, [1, 5], { ...fussweg, level: '1' }),
      weg(21, [5, 3], fussweg),
      // Der dritte Bahnsteig haengt nur ueber ein erratenes Stueck dran: Das
      // loest die Naht aus, und erst dann kann der Aufzugknoten falsch laufen.
      weg(23, [7, 9], { ...fussweg, level: '1' }),
      weg(24, [9, 2], fussweg),
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis3:mitte')).toBe(true);
    expect(rampen(graph)).toEqual([]);
    expect([...graph.adjazenz.get('n5@1')!].some((k) => k.typ === 'aufzug')).toBe(true);
  });

  it('gibt die Eingabe nicht veraendert zurueck', () => {
    const verbindung = weg(21, [5, 6], fussweg);
    baueGraph({ elements: [
      ...punkte,
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
      weg(20, [1, 5], { ...fussweg, level: '1' }),
      verbindung,
      weg(22, [6, 3], { ...fussweg, level: '1' }),
    ] });
    expect(verbindung.tags).toEqual({ highway: 'footway' });
  });

  describe('Stuttgart Hbf (Bestand vom 14.10.2026)', () => {
    const stuttgart = baueGraph(ladeFixture('overpass/stuttgart-hbf'));
    const zeit = (von: string, nach: string, variante: 'schnellste' | 'barrierefrei'): number | null => {
      const pfad = berechneRoute(stuttgart, `gleis${von}:mitte`, `gleis${nach}:mitte`, variante);
      return pfad ? gehzeitSekunden(pfad, 'normal') : null;
    };

    it('verbindet alle 18 Gleise', () => {
      expect(stuttgart.gleise).toHaveLength(18);
      expect(erreichbareGleisPaare(stuttgart)).toBe(1);
    });

    it.each(['schnellste', 'barrierefrei'] as const)('findet 1 -> 101 als %s: laenger als die Luftlinie, ohne Kurzschluss', (variante) => {
      // Luftlinie Gleis 1 zu 101: rund 490 m. Der Weg ueber Querbahnsteig, Steg
      // und Klett-Passage ist deutlich laenger, aber kein Vielfaches davon.
      const sekunden = zeit('1', '101', variante)!;
      expect(sekunden).toBeGreaterThan(600);
      expect(sekunden).toBeLessThan(1300);
    });

    it('laesst die Wege zwischen den oberen Gleisen, wo sie waren', () => {
      expect(zeit('8', '16', 'schnellste')).toBe(477);
    });
  });
});

/**
 * Stuttgart Hbf: Die Mitte von Gleis 3/4 liegt 31 m vom eigenen naechsten Knoten
 * entfernt, aber nur 22 m von der Kante des Nachbarbahnsteigs. Die Anbindung nahm
 * den naechsten Knoten ueberhaupt - und 1 -> 3 lief in 86 s ueber die Gleise.
 */
describe('Anbindung an den Bahnsteig', () => {
  /** Zwei parallele Bahnsteige 22 m auseinander, die Mitte des zweiten ohne eigenen Knoten in Reichweite. */
  const nachbarn = (verbindung?: Record<string, string>): StationGraph => baueGraph({ elements: [
    { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
    { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
    { type: 'node', id: 3, lat: 52.0002, lon: 12.0 },
    { type: 'node', id: 4, lat: 52.0002, lon: 12.001 },
    { type: 'node', id: 5, lat: 52.0002, lon: 12.002 },
    { type: 'node', id: 6, lat: 52.0001, lon: 11.9995 },
    // Der Nachbar zuerst: Die Anbindung sieht nur Knoten, die schon angelegt sind.
    { type: 'way', id: 11, nodes: [3, 4, 5], tags: { railway: 'platform', ref: '2', level: '0' } },
    { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0' } },
    ...(verbindung ? [{ type: 'way' as const, id: 20, nodes: [1, 6, 3], tags: { highway: 'footway', level: '0', ...verbindung } }] : []),
  ] });

  it('nimmt den Weg um den Bahnsteig statt ueber das Gleis, wenn es ihn gibt', () => {
    // Je 68 m von der Mitte zum Bahnsteigende, dazu die Verbindung: nie die 22 m ueber das Gleis.
    const pfad = berechneRoute(nachbarn({}), 'gleis1:mitte', 'gleis2:mitte', 'schnellste');
    expect(pfad!.laengeM).toBeGreaterThan(130);
  });

  // Bis zum 02.11.2026 blieb die Kante, wenn sie die einzige Verbindung war - und
  // 803 Routen kreuzten deshalb ein Gleis. Fehlt der Weg im Kartenmaterial, sagt
  // das die Antwort ehrlich (Standardmodell, Absage), statt einen falschen zu zeigen.
  it('kennt keinen Weg, wenn nur das Gleis dazwischen liegt', () => {
    expect(erreichbar(nachbarn(), 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });

  it('kennt keinen stufenfreien Weg, wenn es nur das Gleis waere', () => {
    const graph = nachbarn({ wheelchair: 'no' });
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')).not.toBeNull();
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
  });

  it('springt auch nicht auf einen Fussweg, der zum Nachbarbahnsteig gehoert', () => {
    // Knoten 6 liegt 26 m von der Mitte von Gleis 1, aber 5,5 m vom Umriss von Gleis 2.
    const graph = baueGraph({ elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
      { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
      { type: 'node', id: 3, lat: 52.00028, lon: 12.0 },
      { type: 'node', id: 4, lat: 52.00028, lon: 12.002 },
      { type: 'node', id: 6, lat: 52.00023, lon: 12.001 },
      { type: 'way', id: 11, nodes: [3, 4], tags: { railway: 'platform', ref: '2', level: '0' } },
      { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0' } },
      { type: 'way', id: 20, nodes: [6, 4], tags: { highway: 'footway', level: '0' } },
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });

  it('fuehrt Stuttgart 1 -> 3 ueber den Querbahnsteig statt ueber die Gleise', () => {
    const stuttgart = baueGraph(ladeFixture('overpass/stuttgart-hbf'));
    const pfad = berechneRoute(stuttgart, 'gleis1:mitte', 'gleis3:mitte', 'schnellste');
    // Beide Bahnsteigmitten liegen rund 150 und 220 m vor dem Querbahnsteig.
    expect(gehzeitSekunden(pfad!, 'normal')).toBeGreaterThan(300);
  });
});

/**
 * Stuttgart fuehrt die Grosse Schalterhalle mit `access=no`, und der Graph lief
 * trotzdem durch. In Ulm fuehrte `access=private` 2 Nord -> 4 Nord in 38 statt
 * 218 s durch Gelaende, das niemand betreten darf.
 */
describe('Gesperrte Wege', () => {
  const graphMit = (tags: Record<string, string>): StationGraph => baueGraph({ elements: [
    { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
    { type: 'node', id: 2, lat: 52.0, lon: 12.0005 },
    { type: 'node', id: 3, lat: 52.001, lon: 12.0 },
    { type: 'node', id: 4, lat: 52.001, lon: 12.0005 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0' } },
    { type: 'way', id: 11, nodes: [3, 4], tags: { railway: 'platform', ref: '2', level: '0' } },
    { type: 'way', id: 20, nodes: [1, 3], tags: { highway: 'footway', level: '0', ...tags } },
  ] });

  it.each([
    [{ access: 'no' }, false],
    [{ access: 'private' }, false],
    [{ access: 'private', foot: 'designated' }, true],
    [{ access: 'no', foot: 'yes' }, true],
    [{ access: 'no', foot: 'permissive' }, true],
    [{ access: 'private', foot: 'no' }, false],
    [{ access: 'destination' }, true],
    [{ access: 'customers' }, true],
    [{ access: 'yes' }, true],
    [{}, true],
  ])('Fussweg mit %o begehbar: %s', (tags, begehbar) => {
    expect(erreichbar(graphMit(tags as Record<string, string>), 'gleis1:mitte', 'gleis2:mitte')).toBe(begehbar);
  });

  it('sperrt auch die Treppe', () => {
    const graph = baueGraph({ elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
      { type: 'node', id: 2, lat: 52.0, lon: 12.0005 },
      { type: 'node', id: 3, lat: 52.001, lon: 12.0 },
      { type: 'node', id: 4, lat: 52.001, lon: 12.0005 },
      { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0' } },
      { type: 'way', id: 11, nodes: [3, 4], tags: { railway: 'platform', ref: '2', level: '-1' } },
      { type: 'way', id: 20, nodes: [3, 1], tags: { highway: 'steps', level: '-1;0', access: 'no' } },
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });

  it('laesst einen Bahnsteig mit access=no als Gleis stehen', () => {
    const graph = baueGraph({ elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
      { type: 'node', id: 2, lat: 52.0, lon: 12.0005 },
      { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0', access: 'no' } },
    ] });
    // Der Fahrplan nennt das Gleis. Fehlte es, gaebe die Route „Gleis unbekannt“.
    expect(graph.gleise).toEqual(['1']);
  });
});

/**
 * Bahnsteig-Zugehoerigkeit (02.11.2026). 3655 Routen fuehrten ueber Gleise, und
 * nur 4 ihrer 411 verursachenden Kanten waren echte OSM-Wege: Den Rest riet der
 * Graph aus der Naehe zu einer Geraden. Jetzt gehoert jeder Knoten zu hoechstens
 * einem Bahnsteig, gemessen am Umriss, und geraten wird nur innerhalb davon.
 */
describe('Bahnsteig-Zugehoerigkeit', () => {
  const knoten = (id: number, lat: number, lon: number): OverpassAntwort['elements'][number] => ({ type: 'node', id, lat, lon });
  const bahnsteig = (id: number, nodes: number[], ref: string): OverpassAntwort['elements'][number] => ({
    type: 'way', id, nodes, tags: { railway: 'platform', ref, level: '0' },
  });

  it('nimmt keinen Knoten vom Umriss des Nachbarbahnsteigs in die Kette', () => {
    // Gleis 2 beult zur Achse von Gleis 1 aus: Knoten 4 liegt 9 m von deren
    // Gerader, aber 24 m von der eigenen - und bleibt trotzdem Gleis 2.
    const graph = baueGraph({ elements: [
      knoten(1, 52.0, 12.0), knoten(6, 52.0, 12.001), knoten(2, 52.0, 12.002),
      knoten(3, 52.0003, 12.0), knoten(4, 52.00008, 12.001), knoten(5, 52.0003, 12.002),
      bahnsteig(10, [1, 6, 2], '1'),
      bahnsteig(11, [3, 4, 5], '2'),
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });

  it('nimmt einen Knoten am eigenen Bogen auf, auch weit neben der Geraden', () => {
    // Der Bahnsteig biegt sich 26 m von seiner Sehne weg. Knoten 7 liegt 3 m neben
    // ihm, aber rund 23 m neben der Geraden und ausserhalb der 30 m um die Mitte.
    const graph = baueGraph({ elements: [
      knoten(1, 52.0, 12.0), knoten(2, 52.00023, 12.001), knoten(3, 52.0, 12.004),
      knoten(7, 52.00021, 12.001), knoten(8, 52.001, 12.001),
      knoten(9, 52.001, 12.0), knoten(10, 52.001, 12.002),
      bahnsteig(20, [1, 2, 3], '1'),
      bahnsteig(21, [9, 8, 10], '2'),
      { type: 'way', id: 30, nodes: [7, 8], tags: { highway: 'footway', level: '0' } },
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(true);
  });

  it('Koeln Hbf 8 -> 10 laeuft ueber die Passage, nicht quer ueber die Gleise', () => {
    const koeln = baueGraph(ladeFixture('overpass/koeln-hbf'));
    const pfad = berechneRoute(koeln, 'gleis8:mitte', 'gleis10:mitte', 'schnellste');
    expect(pfad!.kanten.some((k) => k.deltaLevel !== 0)).toBe(true);
    expect(gehzeitSekunden(pfad!, 'normal')).toBeGreaterThan(120);
  });
});

/**
 * Die Mitte war die Sehnenmitte der beiden Enden. An Berlin Hbf liegt sie fuer
 * Gleis 13/14 23 m neben dem eigenen und 1,6 m neben dem Nachbarbahnsteig: Jeder
 * Weg begann auf dem falschen Bahnsteig. 635 Routen kreuzten so ein Gleis.
 */
describe('Bahnsteigmitte im Bogen', () => {
  it('liegt auf dem Bahnsteig, nicht auf der Sehne', () => {
    const graph = baueGraph({ elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
      { type: 'node', id: 2, lat: 52.0004, lon: 12.001 },
      { type: 'node', id: 3, lat: 52.0004, lon: 12.002 },
      { type: 'node', id: 4, lat: 52.0, lon: 12.003 },
      { type: 'way', id: 10, nodes: [1, 2, 3, 4], tags: { railway: 'platform', ref: '1', level: '0' } },
    ] });
    const mitte = graph.knoten.get('gleis1:mitte')!;
    // Die Sehnenmitte laege 44 m unter dem flachen Scheitel des Bahnsteigs.
    expect(haversineM(mitte.lat, mitte.lon, 52.0004, 12.0015)).toBeLessThan(1);
  });

  it('bleibt in der Sehnenmitte, wo sie auf dem Bahnsteig liegt', () => {
    const graph = baueGraph({ elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 },
      { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
      { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0' } },
    ] });
    const mitte = graph.knoten.get('gleis1:mitte')!;
    expect(mitte.lat).toBeCloseTo(52.0, 6);
    expect(mitte.lon).toBeCloseTo(12.001, 6);
  });

  it('beginnt der Weg in Berlin auf dem eigenen Bahnsteig', () => {
    const berlin = baueGraph(ladeFixture('overpass/berlin-hbf'));
    const mitte = berlin.knoten.get('gleis14:mitte')!;
    const kante = berlin.knoten.get('n721945115@2')!; // Kante von Gleis 13/14
    // Rund 23 m waren es von der Sehnenmitte; auf dem Umriss sind es hoechstens wenige.
    expect(haversineM(mitte.lat, mitte.lon, kante.lat, kante.lon)).toBeLessThan(15);
  });
});

/**
 * Duesseldorf, Frankfurt-Hoechst: Die Treppe sagt `level=0;1`, die Passage an ihrem
 * Fuss `level=-1`. Derselbe OSM-Punkt wird so zu zwei Knoten, beide belegt, ohne
 * Kante. An einem Treppenende widersprechen sich nur die Angaben: Der geteilte
 * Punkt ist die Verbindung, wie es OSM meint.
 */
describe('Naht am Treppenende', () => {
  const punkte: OverpassAntwort['elements'] = [
    { type: 'node', id: 1, lat: 52.0, lon: 12.0 }, { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
    { type: 'node', id: 3, lat: 52.001, lon: 12.0 }, { type: 'node', id: 4, lat: 52.001, lon: 12.002 },
    { type: 'node', id: 5, lat: 52.0003, lon: 12.0 }, { type: 'node', id: 6, lat: 52.0007, lon: 12.0 },
  ];
  const stufen = (level: string): OverpassAntwort => ({ elements: [
    ...punkte,
    { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '1' } },
    { type: 'way', id: 11, nodes: [3, 4], tags: { railway: 'platform', ref: '2', level: '1' } },
    { type: 'way', id: 20, nodes: [1, 5], tags: { highway: 'steps', level, incline: 'down' } },
    { type: 'way', id: 21, nodes: [5, 6], tags: { highway: 'footway', level: '-1' } },
    { type: 'way', id: 22, nodes: [6, 3], tags: { highway: 'steps', level: '-1;1', incline: 'up' } },
  ] });

  it('verbindet die Treppe mit dem Weg an ihrem Fuss, auch wenn die Ebenen sich widersprechen', () => {
    const graph = baueGraph(stufen('0;1'));
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(true);
  });

  it('bleibt stufenfrei getrennt: Die Treppe bleibt eine Treppe', () => {
    const graph = baueGraph(stufen('0;1'));
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
  });

  it('braucht keine Naht, wenn die Ebenen stimmen', () => {
    const graph = baueGraph(stufen('-1;1'));
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(true);
    const kanten = new Set([...graph.adjazenz.values()].flat());
    expect([...kanten].filter((k) => k.laengeM === 0 && k.typ === 'rampe')).toEqual([]);
  });
});

/**
 * Duesseldorf Hbf: Die Treppe von Gleis 9 endet 3 m neben dem Passagenweg, ohne
 * gemeinsamen OSM-Punkt. Gemeint ist derselbe Gang; ohne ihn fehlte jeder Weg.
 */
describe('Luecke am Treppenfuss', () => {
  // Gleis 1 und 2 auf Ebene 1, je eine Treppe hinab; zwischen den Fuessen die Luecke.
  const mitLuecke = (fussLat: number, weitere: OverpassAntwort['elements'] = []): OverpassAntwort => ({ elements: [
    { type: 'node', id: 1, lat: 52.0, lon: 12.0 }, { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
    { type: 'node', id: 3, lat: 52.001, lon: 12.0 }, { type: 'node', id: 4, lat: 52.001, lon: 12.002 },
    { type: 'node', id: 5, lat: 52.0004, lon: 12.0 }, { type: 'node', id: 6, lat: fussLat, lon: 12.0 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '1' } },
    { type: 'way', id: 11, nodes: [3, 4], tags: { railway: 'platform', ref: '2', level: '1' } },
    { type: 'way', id: 20, nodes: [1, 5], tags: { highway: 'steps', level: '0;1', incline: 'down' } },
    { type: 'way', id: 21, nodes: [3, 6], tags: { highway: 'steps', level: '-1;1', incline: 'down' } },
    ...weitere,
  ] });

  it('verbindet einen Treppenfuss mit dem Weg 3 m daneben', () => {
    const graph = baueGraph(mitLuecke(52.000427));
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(true);
  });

  it('laesst 20 m Abstand offen', () => {
    const graph = baueGraph(mitLuecke(52.00058));
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });

  it('macht daraus keinen stufenfreien Weg', () => {
    const graph = baueGraph(mitLuecke(52.000427));
    const kanten = new Set([...graph.adjazenz.values()].flat());
    expect([...kanten].filter((k) => k.laengeM > 0 && k.laengeM < 5 && k.typ === 'rampe').every((k) => !k.barrierefrei)).toBe(true);
  });

  it('springt nicht von einem Treppenende auf einem Bahnsteig los', () => {
    // Zwei Bahnsteige 3 m auseinander, jede Treppe endet auf ihrem Bahnsteig:
    // Das waere die Kante ueber das Gleis, die dieser Umbau abgeschafft hat.
    const graph = baueGraph({ elements: [
      { type: 'node', id: 1, lat: 52.0, lon: 12.0 }, { type: 'node', id: 2, lat: 52.0, lon: 12.002 },
      { type: 'node', id: 3, lat: 52.000027, lon: 12.0 }, { type: 'node', id: 4, lat: 52.000027, lon: 12.002 },
      { type: 'node', id: 5, lat: 52.0005, lon: 12.0 }, { type: 'node', id: 6, lat: 52.0007, lon: 12.0 },
      { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform', ref: '1', level: '0' } },
      { type: 'way', id: 11, nodes: [3, 4], tags: { railway: 'platform', ref: '2', level: '0' } },
      { type: 'way', id: 20, nodes: [5, 1], tags: { highway: 'steps', level: '-1;0', incline: 'up' } },
      { type: 'way', id: 21, nodes: [6, 3], tags: { highway: 'steps', level: '-1;0', incline: 'up' } },
    ] });
    expect(erreichbar(graph, 'gleis1:mitte', 'gleis2:mitte')).toBe(false);
  });
});

/**
 * Berlin Hbf 2 -> 12 (Reddit, 03.11.2026): Eine Fahrt von -2 nach +1 war eine
 * Kette aus drei Kanten und drei Schritten („Aufzug zur -1“, „zur 0“, „zur 1“).
 * Ein Aufzug ist ein Schacht: Jedes Ebenenpaar ist direkt verbunden.
 */
describe('Aufzug als Schacht', () => {
  const punkt = (id: number, lat: number, lon: number, tags?: Record<string, string>): OverpassAntwort['elements'][number] =>
    ({ type: 'node', id, lat, lon, ...(tags ? { tags } : {}) });
  const weg = (id: number, nodes: number[], tags: Record<string, string>): OverpassAntwort['elements'][number] => ({ type: 'way', id, nodes, tags });
  const aufzugKanten = (graph: StationGraph): GraphKante[] =>
    [...new Set([...graph.adjazenz.values()].flat())].filter((k) => k.typ === 'aufzug');
  /** Schacht -2..2, Wege nur auf -2, 0 und 1. */
  const schacht = (fusswege: OverpassAntwort['elements']): StationGraph => baueGraph({ elements: [
    punkt(1, 52.0, 12.0), punkt(2, 52.0, 12.001),
    punkt(3, 52.001, 12.0), punkt(4, 52.001, 12.001),
    punkt(5, 52.0005, 12.002),
    punkt(42, 52.0005, 12.0, { highway: 'elevator', level: '-2;-1;0;1;2' }),
    weg(10, [1, 2], { railway: 'platform', ref: '1', level: '-2' }),
    weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
    ...fusswege,
  ] });
  const graph = schacht([
    weg(20, [1, 42], { highway: 'footway', level: '-2' }),
    weg(21, [42, 5], { highway: 'footway', level: '0' }),
    weg(22, [42, 3], { highway: 'footway', level: '1' }),
  ]);
  const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')!;

  it('Schacht: direkte Kante -2 ↔ 1, Spanne 4', () => {
    const k = aufzugKanten(graph);
    expect(k).toHaveLength(3); // -2↔0, -2↔1, 0↔1
    expect(k.map((x) => `${x.von}>${x.nach}`).sort()).toEqual(['n42@-2>n42@0', 'n42@-2>n42@1', 'n42@0>n42@1']);
    expect(k.every((x) => x.schachtSpanne === 4 && x.anlageSchluessel === 'n42')).toBe(true);
  });

  it('Route -2 → 1 nimmt EINE Aufzugkante', () => {
    const aufzug = pfad.kanten.filter((x) => x.typ === 'aufzug');
    expect(aufzug).toHaveLength(1);
    expect(Math.abs(aufzug[0].deltaLevel)).toBe(3);
  });

  it('ein Schritt: "Aufzug zur Ebene 1"', () => {
    expect(generiereSchritte(pfad).filter((s) => s.typ === 'aufzug').map((s) => s.text)).toEqual(['Aufzug zur Ebene 1']);
  });

  it('Aufzug mit nur einer angebundenen Ebene: keine Kante, kein Fehler', () => {
    const einsam = schacht([weg(21, [42, 5], { highway: 'footway', level: '0' })]);
    expect(aufzugKanten(einsam)).toEqual([]);
  });

  it('Aufzug-Weg erzeugt keine kostenlose Rampe zwischen seinen Ebenen', () => {
    // Der Aufzug sagt `level=0;1`, der Weg an seinem Fuss `level=-1`: Derselbe
    // OSM-Punkt 6 wird zu zwei Knoten. Bis zum 03.11.2026 verband sie eine
    // stufenfreie Rampe der Laenge 0 - eine Aufzugfahrt, die nichts kostete.
    const mitWeg = baueGraph({ elements: [
      punkt(1, 52.0, 12.0), punkt(2, 52.0, 12.001),
      punkt(3, 52.001, 12.0), punkt(4, 52.001, 12.001),
      punkt(6, 52.0004, 12.0), punkt(7, 52.0006, 12.0),
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '-1' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
      weg(20, [1, 6], { highway: 'footway', level: '-1' }),
      weg(30, [6, 7], { highway: 'elevator', level: '0;1' }),
      weg(21, [7, 3], { highway: 'footway', level: '1' }),
    ] });
    const kanten = [...new Set([...mitWeg.adjazenz.values()].flat())];
    expect(kanten.filter((k) => k.typ === 'rampe' && k.laengeM === 0)).toEqual([]);
    const stufenfrei = berechneRoute(mitWeg, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')!;
    const aufzug = stufenfrei.kanten.filter((k) => k.typ === 'aufzug');
    expect(aufzug).toHaveLength(1);
    expect(aufzug[0].anlageSchluessel).toBe('w30');
    // Tag 0;1 (Spanne 1), aber der Halt am Fuss liegt auf -1: Die Fahrt -1 -> 1
    // ist zwei Ebenen lang, die Spanne ist das Maximum aus Tag und Halten.
    expect(Math.abs(aufzug[0].deltaLevel)).toBe(2);
    expect(aufzug[0].schachtSpanne).toBe(2);
  });

  it('Aufzug mit wheelchair=no ueber drei Ebenen: keine Kante barrierefrei, keine stufenfreie Route', () => {
    const gesperrt = baueGraph({ elements: [
      punkt(1, 52.0, 12.0), punkt(2, 52.0, 12.001),
      punkt(3, 52.001, 12.0), punkt(4, 52.001, 12.001),
      punkt(5, 52.0005, 12.002),
      punkt(42, 52.0005, 12.0, { highway: 'elevator', level: '-2;0;1', wheelchair: 'no' }),
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '-2' }),
      weg(11, [3, 4], { railway: 'platform', ref: '2', level: '1' }),
      weg(20, [1, 42], { highway: 'footway', level: '-2' }),
      weg(21, [42, 5], { highway: 'footway', level: '0' }),
      weg(22, [42, 3], { highway: 'footway', level: '1' }),
    ] });
    const k = aufzugKanten(gesperrt);
    expect(k).toHaveLength(3);
    expect(k.some((x) => x.barrierefrei)).toBe(false);
    expect(berechneRoute(gesperrt, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
    expect(berechneRoute(gesperrt, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')).not.toBeNull();
  });

  it('Treppe und Rolltreppe tragen ihren Weg als Anlagenschluessel', () => {
    const stufen = baueGraph({ elements: [
      punkt(1, 52.0, 12.0), punkt(2, 52.0, 12.001), punkt(3, 52.0004, 12.0), punkt(4, 52.0004, 12.001),
      weg(10, [1, 2], { railway: 'platform', ref: '1', level: '0' }),
      weg(20, [1, 3], { highway: 'steps', level: '-1;0', incline: 'up' }),
      weg(21, [2, 4], { highway: 'footway', conveying: 'yes', level: '-1;0', incline: 'up' }),
      weg(22, [3, 4], { highway: 'footway', level: '-1' }),
    ] });
    const kanten = [...new Set([...stufen.adjazenz.values()].flat())];
    expect(kanten.find((k) => k.typ === 'treppe')?.anlageSchluessel).toBe('w20');
    expect(kanten.find((k) => k.typ === 'rolltreppe')?.anlageSchluessel).toBe('w21');
  });

  describe('Berlin Hbf (Fixture)', () => {
    const berlin = baueGraph(ladeFixture('overpass/berlin-hbf'));
    const route = (von: string, nach: string) => berechneRoute(berlin, `gleis${von}:mitte`, `gleis${nach}:mitte`, 'schnellste', 'normal')!;

    it('14 -> 6 faehrt in einem Zug von 2 nach -2, statt viermal umzusteigen', () => {
      // Der Schacht reicht von -2 bis 2: Warten 55 + Fahrt 55 = 110 s. Die vier
      // Rolltreppen kosten mit ihren Wegen 280 s.
      const pfad14 = route('14', '6');
      const aufzug = pfad14.kanten.filter((k) => k.typ === 'aufzug');
      expect(aufzug).toHaveLength(1);
      expect(Math.abs(aufzug[0].deltaLevel)).toBe(4);
      expect(generiereSchritte(pfad14).filter((s) => s.typ === 'aufzug').map((s) => s.text)).toEqual(['Aufzug zur Ebene -2']);
      expect(gehzeitSekunden(pfad14, 'normal')).toBeLessThan(280);
    });

    it('2 -> 12 haelt nicht mehr auf der -1, an der niemand aussteigt', () => {
      // Zwei Aufzuege, weil es zwei sind: F.A 9 (-2..0) und 35 m weiter F.PA3
      // bis zur 1. Der Halt von F.PA3 auf -2 liegt jenseits der Gleise.
      const texte = generiereSchritte(route('2', '12')).map((s) => s.text);
      expect(texte.filter((t) => t.startsWith('Aufzug'))).toEqual(['Aufzug zur Ebene 0', 'Aufzug zur Ebene 1']);
    });
  });
});
