import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph } from '../src/core/graph.js';
import { berechneRoute } from '../src/core/routing.js';
import { mittellinie, querLagen } from '../src/core/mittellinie.js';
import { baueBahnhofSchema, vereinfacheLinie } from '../src/core/schema.js';
import { entpackeEintrag } from '../src/osm/bestand.js';
import { syntheseGraph } from '../src/core/synthmodell.js';
import type { BahnhofSchema, OverpassAntwort, RoutenPfad, StationGraph, StationsInfo } from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

/**
 * Berlin Hbf 14 -> 6 ueber die vier Rolltreppen, durch alle fuenf Ebenen.
 *
 * Seit dem 03.11.2026 ist ein Aufzug ein Schacht, und die schnellste Route
 * faehrt in einem Zug von 2 nach -2 (237 s gegen 280 s ueber die Rolltreppen).
 * Diese Tests pruefen aber das Schema einer Route durch alle Ebenen. Gesucht
 * wird deshalb ohne Aufzugkanten; das Schema bekommt den ganzen Graphen.
 */
function berlinUeberRolltreppen(graph: StationGraph): RoutenPfad {
  const ohneAufzug: StationGraph = {
    ...graph,
    adjazenz: new Map([...graph.adjazenz].map(([id, kanten]) => [id, kanten.filter((k) => k.typ !== 'aufzug')])),
  };
  return berechneRoute(ohneAufzug, 'gleis14:mitte', 'gleis6:mitte', 'schnellste', 'normal')!;
}

describe('baueBahnhofSchema – Lage der Bahnsteige', () => {
  const graph = baueGraph(ladeFixture('synthetisch/quer-bahnhof'));
  const pfad = berechneRoute(graph, 'gleis5:mitte', 'gleis3:mitte', 'schnellste', 'normal')!;
  const schema = baueBahnhofSchema(graph, pfad);
  const ebene0 = schema.ebenen[0];

  it('ordnet die Bahnsteige nach ihrer Lage, nicht nach der Gleisnummer', () => {
    // Von Nord nach Sued liegen sie 3, 1, 5. Eine Sortierung nach Nummer
    // ergaebe 1, 3, 5 - und zeichnete den Bahnhof falsch herum.
    expect(ebene0.bahnsteige.map((b) => b.gleise.join('/'))).toEqual(['3', '1', '5']);
  });

  it('nennt den Abstand quer zur Gleisrichtung in Metern', () => {
    const quer = ebene0.bahnsteige.map((b) => Math.round(b.querM!));
    expect(quer[0]).toBe(0);
    expect(quer[1]).toBeGreaterThanOrEqual(21);
    expect(quer[1]).toBeLessThanOrEqual(23);
    expect(quer[2]).toBeGreaterThanOrEqual(54);
    expect(quer[2]).toBeLessThanOrEqual(57);
  });

  it('nennt die Bahnsteiglänge aus der Achse', () => {
    // 0,001° Länge auf Breite 52° ≈ 68,5 m
    for (const bahnsteig of ebene0.bahnsteige) {
      expect(bahnsteig.laengeM).toBeGreaterThan(67);
      expect(bahnsteig.laengeM).toBeLessThan(70);
    }
  });

  it('nimmt Orientierungspunkte mit ihrer Ebene auf', () => {
    expect(schema.pois).toContainEqual(expect.objectContaining({ art: 'kiosk', level: 0 }));
  });
});

describe('baueBahnhofSchema – Bänder und Route', () => {
  const graph = baueGraph(ladeFixture('synthetisch/mini-bahnhof'));
  const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste', 'normal')!;
  const schema = baueBahnhofSchema(graph, pfad);

  it('legt für die Ebene mit Gleisen ein Gleisband an', () => {
    const ebene0 = schema.ebenen.find((e) => e.level === 0);
    expect(ebene0?.art).toBe('gleise');
    expect(ebene0?.bahnsteige.flatMap((b) => b.gleise).sort()).toEqual(['1', '2', '3']);
  });

  it('legt für die berührte Ebene ohne Gleise ein Verbindungsband an', () => {
    const unten = schema.ebenen.find((e) => e.level === -1);
    expect(unten?.art).toBe('verbindung');
    expect(unten?.bahnsteige).toEqual([]);
  });

  it('führt die Ebenen in der Reihenfolge des Wegs, nicht von oben nach unten', () => {
    // Hinunter in die Unterführung und wieder herauf: Ebene 0 kommt ZWEIMAL
    // vor. Eine nach Höhe sortierte Liste verschwiege die Reihenfolge - und
    // die ist es, der jemand folgt.
    expect(schema.ebenen.map((e) => e.level)).toEqual([0, -1, 0]);
  });

  it('markiert den ersten Besuch als Start und den letzten als Ziel', () => {
    expect(schema.ebenen[0].rolle).toBe('start');
    expect(schema.ebenen[schema.ebenen.length - 1].rolle).toBe('ziel');
    expect(schema.ebenen[1].rolle).toBeUndefined();
  });

  it('markiert Start- und Zielbahnsteig', () => {
    const ebene0 = schema.ebenen.find((e) => e.level === 0)!;
    const start = ebene0.bahnsteige.find((b) => b.rolle === 'start');
    const ziel = ebene0.bahnsteige.find((b) => b.rolle === 'ziel');
    expect(start?.gleise).toContain('1');
    expect(ziel?.gleise).toContain('2');
  });

  it('gibt jedem Besuch seinen eigenen Weg', () => {
    // Jeder Eintrag ist EIN Besuch, also genau ein Linienzug. Die frühere
    // Sammelliste je Ebene zog zwischen zwei Besuchen eine Linie, die
    // niemand geht.
    const besuche = schema.ebenen.filter((e) => e.level === 0);
    expect(besuche).toHaveLength(2);
    for (const b of besuche) expect(b.weg!.length).toBeGreaterThan(1);
  });

  it('zerlegt den Weg vollständig, auch wenn eine Ebene zweimal vorkommt', () => {
    let summe = 0;
    for (const ebene of schema.ebenen) {
      for (let i = 1; i < (ebene.weg?.length ?? 0); i++) {
        summe += Math.hypot(
          ebene.weg![i].x - ebene.weg![i - 1].x,
          ebene.weg![i].y - ebene.weg![i - 1].y,
        );
      }
    }
    const aufWechseln = pfad.kanten
      .filter((k) => k.deltaLevel !== 0)
      .reduce((sum, k) => sum + k.laengeM, 0);
    expect(summe).toBeLessThan(pfad.laengeM - aufWechseln + 2);
  });

  it('listet die Ebenenwechsel der Route in der Reihenfolge des Wegs', () => {
    expect(schema.wechsel.map((w) => [w.vonLevel, w.nachLevel])).toEqual([
      [0, -1],
      [-1, 0],
    ]);
    expect(schema.wechsel.every((w) => w.typ === 'treppe')).toBe(true);
  });

  it('meldet keinen Kreuzungswinkel, wenn Start und Ziel auf einer Ebene liegen', () => {
    expect(schema.kreuzungswinkelGrad).toBeUndefined();
  });
});

describe('baueBahnhofSchema – Berlin Hbf, Gleis 14 nach 6', () => {
  const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));
  const pfad = berlinUeberRolltreppen(graph);
  const schema = baueBahnhofSchema(graph, pfad);

  it('nennt die echte Bahnsteiglänge', () => {
    const unten = schema.ebenen.find((e) => e.level === -2)!;
    const bahnsteig = unten.bahnsteige.find((b) => b.gleise.includes('6'))!;
    expect(bahnsteig.laengeM).toBeGreaterThan(400);
    expect(bahnsteig.laengeM).toBeLessThan(460);
  });

  it('hält die Bahnsteige der Tiefebene in ihrer tatsächlichen Reihenfolge', () => {
    const unten = schema.ebenen.find((e) => e.level === -2)!;
    const folge = unten.bahnsteige.map((b) => b.gleise.join('/'));
    // Die Richtung der Querachse ist willkürlich, die REIHENFOLGE nicht.
    const erwartet = ['22', '7/8', '5/6', '3/4', '1/2'];
    expect([erwartet, [...erwartet].reverse()]).toContainEqual(folge);
  });

  it('nennt den Kreuzungswinkel zwischen Ankunfts- und Abfahrtsebene', () => {
    // Berlin Hbf ist ein Kreuzungsbahnhof: oben 76°, unten 157°.
    expect(schema.kreuzungswinkelGrad).toBeGreaterThan(70);
    expect(schema.kreuzungswinkelGrad).toBeLessThan(92);
  });

  it('bildet für jede berührte Ebene ein Band – hier fünf, nicht drei', () => {
    expect(schema.ebenen.map((e) => e.level)).toEqual([2, 1, 0, -1, -2]);
  });

  it('gibt je Gleisband die Gleisrichtung an', () => {
    const oben = schema.ebenen.find((e) => e.level === 2)!;
    expect(oben.richtungGrad).toBeGreaterThan(60);
    expect(oben.richtungGrad).toBeLessThan(90);
  });

  it('listet unter anlagen nur die Anlagen, die die Route nutzt', () => {
    // Berlin hat rund 200 Ebenenwechsel. Alle zu liefern hiesse, ein Bild mit
    // Platz fuer fuenf davon mit 200 zu fluten.
    expect(schema.anlagen).toHaveLength(4);
    expect(schema.anlagen.every((a) => a.typ === 'rolltreppe')).toBe(true);
  });

  it('zählt die Anlagen je Bahnsteig, statt sie einzeln aufzuführen', () => {
    const unten = schema.ebenen.find((e) => e.level === -2)!;
    const zielBahnsteig = unten.bahnsteige.find((b) => b.gleise.includes('6'))!;
    expect(zielBahnsteig.anlagen!.aufzug).toBeGreaterThan(0);
    expect(zielBahnsteig.anlagen!.rolltreppe).toBeGreaterThan(0);
  });
});

describe('baueBahnhofSchema – eine Anlage zählt einmal', () => {
  // Berlin Hbf, 14 -> 6. Seit Task 3 ist ein Aufzug ein Schacht: eine Clique
  // aus einer Kante je Ebenenpaar, alle mit demselben `anlageSchluessel`.
  // Ein Schacht ueber fuenf Ebenen stand vorher vierfach an jedem Bahnsteig
  // (13/14: 24 Aufzuege, 5/6: 12), obwohl der ganze Bahnhof nur neun Schaechte hat.
  const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));
  const schluessel = new Set<string>();
  for (const kanten of graph.adjazenz.values()) {
    for (const k of kanten) if (k.typ === 'aufzug' && k.anlageSchluessel) schluessel.add(k.anlageSchluessel);
  }
  const schema = baueBahnhofSchema(graph, berlinUeberRolltreppen(graph));
  const bahnsteige = schema.ebenen.flatMap((e) => e.bahnsteige);

  it('zählt einen Schacht über fünf Ebenen am Bahnsteig als einen Aufzug', () => {
    expect(schluessel.size).toBe(9);
    const oben = schema.ebenen.find((e) => e.level === 2)!.bahnsteige.find((b) => b.gleise.includes('14'))!;
    expect(oben.anlagen!.aufzug).toBe(6);
    const unten = schema.ebenen.find((e) => e.level === -2)!.bahnsteige.find((b) => b.gleise.includes('6'))!;
    expect(unten.anlagen!.aufzug).toBe(3);
  });

  it('nennt nie mehr Aufzüge an einem Bahnsteig, als der Bahnhof Schächte hat', () => {
    for (const b of bahnsteige) {
      expect(b.anlagen?.aufzug ?? 0).toBeLessThanOrEqual(schluessel.size);
    }
  });

  it('zählt auch die Aufzüge einer Zugangsstelle je Schacht', () => {
    // Vorher [8,0,0] und [4,0,0] fuer dieselben zwei bzw. einen Schacht.
    const oben = schema.ebenen.find((e) => e.level === 2)!.bahnsteige.find((b) => b.gleise.includes('14'))!;
    expect(Math.max(...oben.zugaenge!.map((z) => z.aufzug))).toBe(2);
    const unten = schema.ebenen.find((e) => e.level === -2)!.bahnsteige.find((b) => b.gleise.includes('6'))!;
    expect(Math.max(...unten.zugaenge!.map((z) => z.aufzug))).toBe(2);
  });
});

describe('baueBahnhofSchema – Standardmodell ohne Bahnsteigachsen', () => {
  const info: StationsInfo = {
    eva: '8000001',
    name: 'Musterstadt',
    lat: 52.0,
    lon: 12.0,
    evas: ['8000001'],
    gleise: [{ gleis: '1' }, { gleis: '2' }],
  };
  const graph = syntheseGraph(info, []);
  const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste', 'normal')!;
  const schema = baueBahnhofSchema(graph, pfad);

  it('lässt die Bahnsteiglänge weg, statt eine zu erfinden', () => {
    const mitGleisen = schema.ebenen.flatMap((e) => e.bahnsteige);
    expect(mitGleisen.length).toBeGreaterThan(0);
    expect(mitGleisen.every((b) => b.laengeM === undefined)).toBe(true);
  });

  it('nennt den Vorbehalt, dass die Lage geschätzt ist', () => {
    expect(schema.vorbehalte.join(' ')).toMatch(/gesch(ä|ae)tzt/i);
  });
});

describe('baueBahnhofSchema – echte Lage auf der Ebene', () => {
  const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));
  const pfad = berlinUeberRolltreppen(graph);
  const schema = baueBahnhofSchema(graph, pfad);
  const oben = schema.ebenen.find((e) => e.level === 2)!;
  const unten = schema.ebenen.find((e) => e.level === -2)!;
  const start = oben.bahnsteige.find((b) => b.rolle === 'start')!;
  const ziel = unten.bahnsteige.find((b) => b.rolle === 'ziel')!;

  it('legt den Ursprung auf den Startpunkt der Route', () => {
    expect(oben.weg![0]).toEqual({ x: 0, y: 0 });
  });

  it('dreht die Gleisrichtung der Startebene auf die x-Achse', () => {
    // Waagerecht heisst: die 428 m liegen in x. Dass 2 Grad Rest bleiben,
    // ist echte Datenlage - die drei Bahnsteige der Ebene sind nicht exakt
    // parallel, und der Rahmen folgt ihrem Mittel, nicht einem von ihnen.
    expect(Math.abs(start.bis!.x - start.von!.x)).toBeGreaterThan(400);
    expect(Math.abs(start.bis!.y - start.von!.y)).toBeLessThan(20);
  });

  it('bündelt die Anlagen eines Bahnsteigs zu Zugängen mit Lage', () => {
    // Auf 428 m liegen 12 Anlagen in drei Gruppen – einzeln gezeichnet
    // wären sie Rauschen, als Zugänge sind sie die Auskunft.
    expect(start.zugaenge!.length).toBeGreaterThanOrEqual(2);
    expect(start.zugaenge!.length).toBeLessThanOrEqual(5);
    // `beiM` zaehlt ab dem Bahnsteiganfang - seit dem 15.09.2026 das
    // Westende (ToDo 31, geprueft in richtung.test.ts). Die Gruppe rund
    // 115 m vor dem OSTende ist dieselbe wie vorher; vorher war das Ostende
    // nur zufaellig der Anfang.
    const amOstende = start.zugaenge![start.zugaenge!.length - 1];
    const vomOstende = start.laengeM! - amOstende.beiM;
    expect(vomOstende).toBeGreaterThan(90);
    expect(vomOstende).toBeLessThan(140);
    expect(amOstende.rolltreppe + amOstende.treppe).toBeGreaterThan(1);
  });

  it('hält die Zugänge in der Reihenfolge entlang des Bahnsteigs', () => {
    const m = ziel.zugaenge!.map((z) => z.beiM);
    expect([...m].sort((a, b) => a - b)).toEqual(m);
  });

  it('markiert den Zugang, über den die Route den Bahnsteig verlässt', () => {
    expect(start.zugaenge!.filter((z) => z.aufRoute)).toHaveLength(1);
  });

  it('liefert den Weg je Ebene als Linienzug in Metern', () => {
    // Die Summe aller Ebenenwege ist der Weg - bis auf die Ebenenwechsel
    // selbst, die keiner Ebene gehören. Das ist die Invariante, die ein
    // zerlegter Linienzug halten muss.
    let summe = 0;
    for (const ebene of schema.ebenen) {
      for (let i = 1; i < (ebene.weg?.length ?? 0); i++) {
        summe += Math.hypot(
          ebene.weg![i].x - ebene.weg![i - 1].x,
          ebene.weg![i].y - ebene.weg![i - 1].y,
        );
      }
    }
    const aufWechseln = pfad.kanten
      .filter((k) => k.deltaLevel !== 0)
      .reduce((sum, k) => sum + k.laengeM, 0);
    expect(summe).toBeGreaterThan(pfad.laengeM - aufWechseln - 2);
    expect(summe).toBeLessThan(pfad.laengeM - aufWechseln + 2);
  });

  it('führt vom Zugang aus kurz über den Zielbahnsteig, nicht über dessen Ende', () => {
    // Regressionsschutz zum Bahnsteig-Umweg: Der genutzte Zugang muss nahe
    // am Ziel liegen, sonst läuft der Reisende den Bahnsteig ab.
    const genutzt = ziel.zugaenge!.find((z) => z.aufRoute)!;
    expect(Math.abs(genutzt.beiM - ziel.laengeM! / 2)).toBeLessThan(80);
  });

  it('verortet jede Anlage der Route', () => {
    expect(schema.anlagen).toHaveLength(4);
    for (const a of schema.anlagen) expect(a.pos).toBeDefined();
  });

  it('nennt je Gleisband, wie es im Bezugsrahmen liegt', () => {
    expect(oben.richtungLokalGrad).toBe(0);
    // Berlin kreuzt sich: die Tiefebene steht quer zur Hallenebene.
    expect(Math.abs(unten.richtungLokalGrad!)).toBeGreaterThan(70);
  });
});

describe('baueBahnhofSchema – ohne Geometrie bleibt die Lage leer', () => {
  const info: StationsInfo = {
    eva: '8000001',
    name: 'Musterstadt',
    lat: 52.0,
    lon: 12.0,
    evas: ['8000001'],
    gleise: [{ gleis: '1' }, { gleis: '2' }],
  };
  const graph = syntheseGraph(info, []);
  const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste', 'normal')!;
  const schema = baueBahnhofSchema(graph, pfad);

  it('erfindet weder Bahnsteigenden noch Zugänge', () => {
    for (const bs of schema.ebenen.flatMap((e) => e.bahnsteige)) {
      expect(bs.von).toBeUndefined();
      expect(bs.zugaenge).toBeUndefined();
    }
  });
});

describe('baueBahnhofSchema – Geometrie der Ebene', () => {
  const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));
  const pfad = berlinUeberRolltreppen(graph);
  const schema = baueBahnhofSchema(graph, pfad);
  const uebergang = schema.ebenen.find((e) => e.level === 1)!;
  const gleisebene = schema.ebenen.find((e) => e.level === -2)!;

  it('gibt einer Übergangsebene ihr begehbares Netz', () => {
    // Ohne das zeigt die Ebene eine rote Linie im Nichts.
    expect(uebergang.netz!.length).toBeGreaterThan(2);
    for (const stueck of uebergang.netz!) expect(stueck.punkte.length).toBeGreaterThan(1);
  });

  it('lässt das Netz auf einer Gleisebene weg – dort tragen die Bahnsteige', () => {
    expect(gleisebene.netz).toBeUndefined();
  });

  it('zeichnet einen Aufzug als Punkt und eine Treppe als Strecke', () => {
    const alle = schema.ebenen.flatMap((e) => e.elemente ?? []);
    const aufzug = alle.find((a) => a.typ === 'aufzug');
    const treppe = alle.find((a) => a.typ === 'treppe' || a.typ === 'rolltreppe');
    expect(aufzug!.punkte).toHaveLength(1);
    expect(treppe!.punkte).toHaveLength(2);
  });

  it('markiert die Anlagen, über die die Route führt', () => {
    const aufRoute = schema.ebenen.flatMap((e) => e.elemente ?? []).filter((a) => a.aufRoute);
    expect(aufRoute.length).toBeGreaterThan(0);
  });

  it('nennt für die Anlagen am Zielbahnsteig ihre Lage entlang des Bahnsteigs', () => {
    const mitLage = (gleisebene.elemente ?? []).filter((a) => a.beiM !== undefined);
    expect(mitLage.length).toBeGreaterThan(8);
    for (const a of mitLage) {
      expect(a.beiM).toBeGreaterThanOrEqual(-10);
      expect(a.beiM).toBeLessThanOrEqual(440);
    }
  });
});

/** Die Gleise einer Ebene in der Reihenfolge des Schemas (erster Besuch). */
function gleisfolgeDerEbene(schema: BahnhofSchema, level: number): string[] {
  const ebene = schema.ebenen.find((e) => e.level === level)!;
  return ebene.bahnsteige.flatMap((b) => b.gleise);
}

/**
 * Liegen die Gruppen der Reihe nach - in einer der beiden Richtungen? Innerhalb
 * einer Gruppe ist die Reihenfolge frei: Zwei Bahnsteighaelften 1-4 m
 * nebeneinander sind im Bild gleichrangig.
 */
function istMonoton(gruppen: number[][]): boolean {
  if (gruppen.some((g) => g.some((p) => p < 0))) return false;
  const steigend = gruppen.every((g, i) => i === 0 || Math.max(...gruppen[i - 1]) < Math.min(...g));
  const fallend = gruppen.every((g, i) => i === 0 || Math.min(...gruppen[i - 1]) > Math.max(...g));
  return steigend || fallend;
}

/** Wo die Zugaenge eines Bahnsteigs liegen - die Lage im Bezugsrahmen, nicht `beiM`. */
function zugaengeVon(schema: BahnhofSchema, gleis: string): string[] {
  const bahnsteig = schema.ebenen.flatMap((e) => e.bahnsteige).find((b) => b.gleise.includes(gleis))!;
  return (bahnsteig.zugaenge ?? []).map((z) => `${z.pos.x},${z.pos.y}`);
}

/**
 * Saarbruecken Hbf: jedes Gleis eine eigene Bahnsteigflaeche, gebogen und
 * verschieden lang. Die Mitte jedes Bahnsteigs auf eine mittlere Querachse
 * projiziert ergab 11, 16, 14, 8, 12, 6, 2, 5, 3, 1 - am OSM-Umriss
 * nachgemessen liegen sie Sued -> Nord 1 | 2/3 | 5/6 | 8, 11 | 12 | 14/16.
 *
 * 8 und 11 sind EINE Gruppe: Beide liegen 3 m suedlich von 12 (8 im Osten,
 * 11 im Westen), nebeneinander liegen sie nirgends - welcher "weiter
 * suedlich" ist, entschieden 0,4 m Unterschied in ihrem Abstand zu 12. Die
 * Vorgabe hatte 8 | 11/12; nach ihrem eigenen Mass (1-4 m = eine Gruppe)
 * gehoert 8 ebenso zu 12 wie 11.
 */
describe('baueBahnhofSchema – Saarbrücken Hbf in echter Lage', () => {
  let schema: BahnhofSchema;
  beforeAll(async () => {
    const pfadBestand = fileURLToPath(new URL('../osm-bestand/8000323.json.gz', import.meta.url));
    const graph = baueGraph((await entpackeEintrag(readFileSync(pfadBestand))).osm);
    const pfad = berechneRoute(graph, 'gleis12:mitte', 'gleis14:mitte', 'schnellste', 'normal')!;
    schema = baueBahnhofSchema(graph, pfad);
  });

  it('Reihenfolge folgt der Lage, nicht der Nummer', () => {
    const ordnung = gleisfolgeDerEbene(schema, 1);
    const pos = (g: string): number => ordnung.indexOf(g);
    const gruppen = [['1'], ['2', '3'], ['5', '6'], ['8', '11'], ['12'], ['14', '16']];
    expect(istMonoton(gruppen.map((g) => g.map(pos))), ordnung.join(' ')).toBe(true);
  });

  it('Gleis 12 hat nicht die Zugänge von 14/16', () => {
    const von14 = new Set(zugaengeVon(schema, '14'));
    expect(von14.size).toBeGreaterThan(0);
    expect(zugaengeVon(schema, '12').length).toBeGreaterThan(0);
    expect(zugaengeVon(schema, '12').filter((z) => von14.has(z))).toEqual([]);
  });

  it('hängt jede verortete Anlage an ihren Bahnsteig', () => {
    // Das Bild legt die Symbole auf den Balken, den das Backend nennt - nicht
    // auf den, dessen Sehne am naechsten liegt. Die Sehne von 12 liegt im
    // Bogen 37 m neben dem Bahnsteig.
    const ebene = schema.ebenen.find((e) => e.level === 1)!;
    const zwoelf = ebene.bahnsteige.find((b) => b.gleise.includes('12'))!;
    const verortet = (ebene.elemente ?? []).filter((el) => el.beiM !== undefined);
    expect(verortet.length).toBeGreaterThan(0);
    for (const el of verortet) expect(el.bahnsteigId).toBeDefined();
    expect(verortet.some((el) => el.bahnsteigId === zwoelf.bahnsteigId)).toBe(true);
  });

  it('legt beiM auf den Bahnsteig, zwischen 0 und seine Länge', () => {
    for (const b of schema.ebenen.flatMap((e) => e.bahnsteige)) {
      for (const z of b.zugaenge ?? []) {
        expect(z.beiM).toBeGreaterThanOrEqual(0);
        expect(z.beiM).toBeLessThanOrEqual(b.laengeM!);
      }
    }
  });
});

/**
 * Den Zugang, den die Route nimmt, hat ihr Bahnsteig immer.
 *
 * Mit der Mittellinie gehoert eine Anlage dem naechsten Bahnsteig. Ueber
 * 6.265 Routen verloren dadurch 61 den Zugang, ueber den sie den Start- oder
 * Zielbahnsteig verlassen (Review 04.11.2026) - neun Bahnsteige standen ganz
 * ohne da. Der Weg geht trotzdem dort hin, also gehoert er dazu.
 */
describe('baueBahnhofSchema – der genutzte Zugang bleibt', () => {
  const faelle: [string, string, string, 'schnellste' | 'barrierefrei', 'start' | 'ziel'][] = [
    ['8013470', '1', '4', 'barrierefrei', 'start'],
    ['8000259', '5', '1', 'barrierefrei', 'ziel'],
    ['8000023', '5', '6', 'schnellste', 'start'],
  ];
  for (const [eva, von, nach, variante, rolle] of faelle) {
    it(`${eva} ${von} -> ${nach} (${variante}): ${rolle}bahnsteig trägt den genutzten Zugang`, async () => {
      const datei = fileURLToPath(new URL(`../osm-bestand/${eva}.json.gz`, import.meta.url));
      const graph = baueGraph((await entpackeEintrag(readFileSync(datei))).osm);
      const pfad = berechneRoute(graph, `gleis${von}:mitte`, `gleis${nach}:mitte`, variante, 'normal')!;
      const schema = baueBahnhofSchema(graph, pfad);
      const bahnsteig = schema.ebenen.flatMap((e) => e.bahnsteige).find((b) => b.rolle === rolle)!;
      expect(bahnsteig.zugaenge!.some((z) => z.aufRoute)).toBe(true);
    });
  }
});

describe('mittellinie', () => {
  // 100 m x 10 m, Ost-West, auf Breite 50°: Umriss mit nur vier Ecken - die
  // langen Seiten tragen keinen einzigen Punkt dazwischen.
  const mLon = 111_320 * Math.cos((50 * Math.PI) / 180);
  const p = (ost: number, nord: number) => ({ lat: 50 + nord / 111_320, lon: 7 + ost / mLon });
  const rechteck = [p(0, 0), p(100, 0), p(100, 10), p(0, 10), p(0, 0)];

  it('legt die Linie einer Fläche in ihre Mitte, auch zwischen zwei Ecken', () => {
    const linie = mittellinie(rechteck);
    expect(linie.length).toBeGreaterThanOrEqual(9);
    for (const q of linie) expect((q.lat - 50) * 111_320).toBeCloseTo(5, 1);
  });

  it('nimmt eine Linie, wie sie ist', () => {
    const kante = [p(0, 0), p(50, 2), p(100, 0)];
    expect(mittellinie(kante)).toEqual(kante);
  });
});

describe('querLagen', () => {
  const mLon = 111_320 * Math.cos((50 * Math.PI) / 180);
  const p = (ost: number, nord: number) => ({ lat: 50 + nord / 111_320, lon: 7 + ost / mLon });
  /** Ein Stueck eines Bogens: Ost-West ueber 600 m, in der Mitte um `woelbung` m nach Norden. */
  const bogen = (von: number, bis: number, nord: number, woelbung: number) =>
    Array.from({ length: 21 }, (_, i) => {
      const ost = von + ((bis - von) * i) / 20;
      const t = ost / 600;
      return p(ost, nord + woelbung * 4 * t * (1 - t));
    });

  it('ordnet gebogene Bahnsteige nach ihrem Abstand, nicht nach ihrer Mitte', () => {
    // A und B liegen 10 m auseinander, beide im selben Bogen. A ist kurz und
    // sitzt am Rand des Bogens - seine Mitte liegt deshalb 7 m suedlich der
    // von B, obwohl A noerdlich von B liegt.
    const linien = new Map([
      ['A', bogen(0, 150, 10, 30)],
      ['B', bogen(0, 600, 0, 30)],
    ]);
    const lagen = querLagen(linien);
    // Links der gemeinsamen Richtung ist positiv - bei West -> Ost also Norden.
    expect(lagen.get('A')! - lagen.get('B')!).toBeCloseTo(10, 0);
  });

  it('lässt einen Bahnsteig ohne Überlappung auf seiner Projektion', () => {
    const linien = new Map([
      ['A', [p(0, 0), p(100, 0)]],
      ['B', [p(500, 30), p(600, 30)]],
    ]);
    const lagen = querLagen(linien);
    expect(Math.abs(lagen.get('A')! - lagen.get('B')!)).toBeCloseTo(30, 0);
  });
});

describe('vereinfacheLinie', () => {
  it('entfernt einen Punkt, der auf der Geraden seiner Nachbarn liegt', () => {
    const gerade = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(vereinfacheLinie(gerade, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('behält eine echte Ecke', () => {
    // Der Knick ist 5 m tief – das ist keine Messungenauigkeit, sondern
    // die Stelle, an der jemand abbiegt.
    const ecke = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];
    expect(vereinfacheLinie(ecke, 1)).toEqual(ecke);
  });

  it('behält Anfang und Ende auch bei grober Toleranz', () => {
    const linie = [
      { x: 0, y: 0 },
      { x: 3, y: 1 },
      { x: 6, y: -1 },
      { x: 9, y: 0 },
    ];
    const raus = vereinfacheLinie(linie, 50);
    expect(raus[0]).toEqual(linie[0]);
    expect(raus[raus.length - 1]).toEqual(linie[3]);
    expect(raus).toHaveLength(2);
  });

  it('lässt zu kurze Linienzüge unberührt', () => {
    const zwei = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(vereinfacheLinie(zwei, 5)).toEqual(zwei);
  });
});

/**
 * Jeder Ebenenwechsel der Route muss im Bild stehen - auf BEIDEN Ebenen.
 *
 * Fuer den Reisenden ist das der Unterschied zwischen "hier geht es runter,
 * dort wieder hoch" und einem Sprung ins Nichts. Die Zusicherung galt schon
 * vorher; geprueft war sie nicht.
 *
 * WICHTIG beim Pruefen: `schema.ebenen` ist eine Liste von BESUCHEN, und eine
 * Ebene kann mehrfach darin stehen. Wer nur den ersten Besuch ansieht,
 * erzeugt sich selbst einen Fehlbefund - genau das ist am 13.09.2026
 * passiert, als eine Simulationspruefung „Treppe auf Ebene -1 nicht
 * markiert" meldete. Berlin Hbf betritt die -1 zweimal: einmal ueber
 * Rolltreppen, einmal ueber Treppen.
 */
describe('baueBahnhofSchema – jeder Ebenenwechsel ist markiert', () => {
  const graph = baueGraph(ladeFixture('overpass/berlin-hbf'));

  for (const abschnitt of ['anfang', 'mitte', 'ende'] as const) {
    it(`Berlin Hbf ab ${abschnitt}: beide Enden jedes Wechsels tragen ihre Anlage`, () => {
      const pfad = berechneRoute(
        graph,
        `gleis14:${abschnitt}`,
        'gleis6:mitte',
        'schnellste',
        'normal',
      )!;
      const schema = baueBahnhofSchema(graph, pfad);
      expect(schema.wechsel.length).toBeGreaterThan(0);

      for (const wechsel of schema.wechsel) {
        for (const level of [wechsel.vonLevel, wechsel.nachLevel]) {
          const besuche = schema.ebenen.filter((e) => e.level === level);
          expect(besuche.length, `Ebene ${level} fehlt im Schema`).toBeGreaterThan(0);
          const markiert = besuche.some((e) =>
            (e.elemente ?? []).some((el) => el.typ === wechsel.typ && el.aufRoute),
          );
          expect(
            markiert,
            `${wechsel.typ} ${wechsel.vonLevel}→${wechsel.nachLevel} fehlt auf Ebene ${level}`,
          ).toBe(true);
        }
      }
    });
  }

  /**
   * Der Fall in Reinform: Die Route betritt Ebene -1 und verlaesst sie sofort
   * wieder, ohne einen Meter darauf zu gehen. `weg` hat dort genau EINEN
   * Punkt, und `abstandZumWeg` haette frueher Unendlich geliefert.
   */
  it('zeigt die Anlagen auch auf einer Ebene, die nur durchquert wird', () => {
    const durchgang = baueGraph(ladeFixture('synthetisch/durchquerte-ebene'));
    const pfad = berechneRoute(
      durchgang,
      'gleis1:mitte',
      'gleis2:mitte',
      'schnellste',
      'normal',
    )!;
    const schema = baueBahnhofSchema(durchgang, pfad);

    const durchquert = schema.ebenen.find((e) => e.level === -1);
    expect(durchquert, 'Ebene -1 fehlt im Schema').toBeDefined();
    // Kein Meter Weg auf dieser Ebene - nur hinunter und weiter hinunter.
    expect((durchquert!.weg ?? []).length).toBeLessThanOrEqual(1);
    // Beide Treppen muessen trotzdem im Bild stehen.
    expect((durchquert!.elemente ?? []).filter((e) => e.aufRoute)).toHaveLength(2);
  });
});
