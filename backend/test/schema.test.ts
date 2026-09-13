import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph } from '../src/core/graph.js';
import { berechneRoute } from '../src/core/routing.js';
import { baueBahnhofSchema, vereinfacheLinie } from '../src/core/schema.js';
import { syntheseGraph } from '../src/core/synthmodell.js';
import type { OverpassAntwort, RoutenPfad, StationsInfo } from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

/** Ohne Route: nur die Geometrie soll geprüft werden, nicht der Weg darüber. */
const OHNE_ROUTE: RoutenPfad = { knoten: [], kanten: [], laengeM: 0 };

describe('baueBahnhofSchema – Lage der Bahnsteige', () => {
  const graph = baueGraph(ladeFixture('synthetisch/quer-bahnhof'));
  const schema = baueBahnhofSchema(graph, OHNE_ROUTE);
  const ebene0 = schema.ebenen.find((e) => e.level === 0)!;

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

  it('sortiert die Ebenen von oben nach unten', () => {
    expect(schema.ebenen.map((e) => e.level)).toEqual([0, -1]);
  });

  it('markiert Start- und Zielbahnsteig', () => {
    const ebene0 = schema.ebenen.find((e) => e.level === 0)!;
    const start = ebene0.bahnsteige.find((b) => b.rolle === 'start');
    const ziel = ebene0.bahnsteige.find((b) => b.rolle === 'ziel');
    expect(start?.gleise).toContain('1');
    expect(ziel?.gleise).toContain('2');
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
  const pfad = berechneRoute(graph, 'gleis14:mitte', 'gleis6:mitte', 'schnellste', 'normal')!;
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
  const pfad = berechneRoute(graph, 'gleis14:mitte', 'gleis6:mitte', 'schnellste', 'normal')!;
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
    const erster = start.zugaenge![0];
    expect(erster.beiM).toBeGreaterThan(90);
    expect(erster.beiM).toBeLessThan(140);
    expect(erster.rolltreppe + erster.treppe).toBeGreaterThan(1);
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
  const pfad = berechneRoute(graph, 'gleis14:mitte', 'gleis6:mitte', 'schnellste', 'normal')!;
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
