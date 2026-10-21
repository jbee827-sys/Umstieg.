import { describe, it, expect } from 'vitest';
import { generiereSchritte, peilungGrad } from '../src/core/textgen.js';
import { gehzeitSekunden } from '../src/core/gehzeit.js';
import type { GraphKante, GraphKnoten, KantenTyp, RoutenPfad } from '../src/core/typen.js';

// Knoten aus Meter-Offsets (x = Ost, y = Nord) um 52° N – nur die PEILUNGEN
// zwischen Knoten zählen; Kantenlängen werden explizit gesetzt.
const M_PRO_GRAD_LAT = 111320;
const M_PRO_GRAD_LON = M_PRO_GRAD_LAT * Math.cos((52 * Math.PI) / 180);
const xy = (id: string, x: number, y: number, level = 0, gleis?: string): GraphKnoten => ({
  id,
  lat: 52 + y / M_PRO_GRAD_LAT,
  lon: 13 + x / M_PRO_GRAD_LON,
  level,
  ...(gleis ? { gleis } : {}),
});

const kante = (
  von: string,
  nach: string,
  typ: KantenTyp,
  laengeM: number,
  deltaLevel = 0,
): GraphKante => ({ von, nach, laengeM, deltaLevel, typ, barrierefrei: typ !== 'treppe' });

function machePfad(knoten: GraphKnoten[], kanten: GraphKante[]): RoutenPfad {
  return { knoten, kanten, laengeM: kanten.reduce((s, k) => s + k.laengeM, 0) };
}

describe('peilungGrad', () => {
  it('Punkt genau östlich → 90°, genau nördlich → 0°', () => {
    const a = xy('a', 0, 0);
    expect(peilungGrad(a, xy('o', 100, 0))).toBeCloseTo(90, 0);
    expect(peilungGrad(a, xy('n', 0, 100))).toBeCloseTo(0, 0);
  });
});

describe('generiereSchritte', () => {
  it('Referenzpfad → exakte Satzfolge (Richtungen, Rundung, Ebenenwechsel)', () => {
    // Kurs je Kante (Kompass): 0° · 10° (merge) · 10° Rolltreppe hoch · 55° (halbrechts)
    // · 145° für 8 m, dann 100° für 30 m · 355° (links) · Treppe hinunter
    // · Aufzug (senkrecht, gleiche Koordinate) · 355° geradeaus zu Gleis 7.
    // Die 8 m bei 145° liegen nur 4,7 m neben der Sehne p4→p6: ein Versatz,
    // kein Abbiegen (GLAETTUNG_M = 6). Bis zum 14.09.2026 standen dort zwei
    // Schritte, „Wenige Meter rechts" und „30 m halblinks".
    const knoten = [
      xy('p0', 0, 0),
      xy('p1', 0, 25),
      xy('p2', 3.82, 46.67),
      xy('p3', 5.9, 58.48, 1),
      xy('p4', 22.28, 69.95, 1),
      xy('p5', 26.87, 63.4, 1),
      xy('p6', 56.41, 58.19, 1),
      xy('p7', 55.1, 73.13, 1),
      xy('p8', 54.23, 83.09, 0),
      xy('p9', 54.23, 83.09, -1),
      xy('p10', 50.74, 122.94, -1, '7'),
    ];
    const kanten = [
      kante('p0', 'p1', 'eben', 25),
      kante('p1', 'p2', 'eben', 22),
      kante('p2', 'p3', 'rolltreppe', 12, 1),
      kante('p3', 'p4', 'eben', 20),
      kante('p4', 'p5', 'eben', 8),
      kante('p5', 'p6', 'eben', 30),
      kante('p6', 'p7', 'eben', 15),
      kante('p7', 'p8', 'treppe', 10, -1),
      kante('p8', 'p9', 'aufzug', 0, -1),
      kante('p9', 'p10', 'eben', 40),
    ];
    const schritte = generiereSchritte(machePfad(knoten, kanten));

    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 50 m geradeaus',
      'Rolltreppe hoch zur Ebene 1',
      '20 m halbrechts',
      '40 m halbrechts',
      '20 m links',
      'Treppe hinunter zur Ebene 0',
      'Aufzug zur Unterführung (-1)',
      '40 m geradeaus zu Gleis 7',
    ]);
    expect(schritte.map((s) => s.typ)).toEqual([
      'eben', 'rolltreppe', 'eben', 'eben', 'eben', 'treppe', 'aufzug', 'eben',
    ]);
    expect(schritte.map((s) => s.distanzM)).toEqual([
      50, undefined, 20, 40, 20, undefined, undefined, 40,
    ]);
  });

  it('halblinks: 45° nach links mit echtem Versatz', () => {
    // 0° für 20 m, dann 315° für 21 m – der Knick liegt 7,9 m neben der Sehne.
    const knoten = [xy('a', 0, 0), xy('b', 0, 20), xy('c', -15, 35, 0, '2')];
    const kanten = [kante('a', 'b', 'eben', 20), kante('b', 'c', 'eben', 21)];
    expect(generiereSchritte(machePfad(knoten, kanten)).map((s) => s.text)).toEqual([
      'Nach Ausstieg 20 m geradeaus',
      '20 m halblinks zu Gleis 2',
    ]);
  });

  it('einzelne Kante: Präfix und Gleis-Suffix im selben Schritt', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 38, 0, '5')];
    const schritte = generiereSchritte(machePfad(knoten, [kante('a', 'b', 'eben', 38)]));
    expect(schritte).toHaveLength(1);
    expect(schritte[0].text).toBe('Nach Ausstieg 40 m geradeaus zu Gleis 5');
    expect(schritte[0].distanzM).toBe(40);
  });

  it('benachbarte eben-Kanten gleicher Richtung werden zusammengefasst, > 22,5° nicht', () => {
    // 0° · 15° (merge) · 60° (kein merge, halbrechts)
    const knoten = [
      xy('a', 0, 0),
      xy('b', 0, 20),
      xy('c', 5.18, 39.32),
      xy('d', 22.5, 49.32, 0, '2'),
    ];
    const kanten = [
      kante('a', 'b', 'eben', 20),
      kante('b', 'c', 'eben', 20),
      kante('c', 'd', 'eben', 20),
    ];
    const schritte = generiereSchritte(machePfad(knoten, kanten));
    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 40 m geradeaus',
      '20 m halbrechts zu Gleis 2',
    ]);
  });

  it('ungefaehr-Flag (Stufe 3): Distanzen mit ca.-Präfix', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 38, 0, '5')];
    const schritte = generiereSchritte(machePfad(knoten, [kante('a', 'b', 'eben', 38)]), {
      ungefaehr: true,
    });
    expect(schritte[0].text).toBe('Nach Ausstieg ca. 40 m geradeaus zu Gleis 5');
  });

  it('Ebenenwechsel-Richtung folgt der Laufrichtung, nicht der Kantenspeicherrichtung', () => {
    // Kante wie im Graphbau von unten (0) nach oben (1) gespeichert: deltaLevel +1.
    // Der Pfad begeht sie rückwärts (oben → unten) → "hinunter" zur Ebene 0.
    const oben = xy('oben', 0, 0, 1);
    const unten = xy('unten', 0, 15, 0, '9');
    const treppenKante = {
      von: 'unten', nach: 'oben', laengeM: 10, deltaLevel: 1,
      typ: 'treppe' as const, barrierefrei: false,
    };
    const pfad = { knoten: [oben, unten], kanten: [treppenKante], laengeM: 10 };
    expect(generiereSchritte(pfad)[0].text).toBe('Nach Ausstieg Treppe hinunter zur Ebene 0 zu Gleis 9');
  });

  it('Rampe erhält Distanz und Ebenenwechsel-Text', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 28, -1, '3')];
    const schritte = generiereSchritte(machePfad(knoten, [kante('a', 'b', 'rampe', 28, -1)]));
    expect(schritte[0].text).toBe('Nach Ausstieg Rampe hinunter zur Unterführung (-1) zu Gleis 3');
    expect(schritte[0].distanzM).toBe(30);
  });
});

describe('Glatte Richtung: Versätze der Fußwege sind keine Schritte', () => {
  // München Hbf, Gleis 5 → 82 ab Anfang (14.09.2026): Die kartierten Fußwege
  // am Kopf des Holzkirchner Flügelbahnhofs laufen als L-Treppe – 20 m ost,
  // 7 m nord, 45 m ost, 28 m nord. Daraus wurden acht Schritte: „wenige Meter
  // rechts / 20 m halblinks / wenige Meter links / 40 m rechts …". Niemand
  // biegt dort ab; der Fußweg macht nur einen Versatz.
  it('ein Versatz unter 6 m quer wird kein eigener Schritt', () => {
    const knoten = [xy('a', 0, 0), xy('b', 20, 0), xy('c', 20, 4), xy('d', 46, 4, 0, '3')];
    const kanten = [kante('a', 'b', 'eben', 20), kante('b', 'c', 'eben', 4), kante('c', 'd', 'eben', 26)];
    expect(generiereSchritte(machePfad(knoten, kanten)).map((s) => s.text)).toEqual([
      'Nach Ausstieg 50 m geradeaus zu Gleis 3',
    ]);
  });

  it('eine Treppe aus kurzen Fußwegstücken wird EINE Richtung', () => {
    // Vier Stufen zu je 8 m ost und 3 m nord: im Ganzen ein Weg nach Nordost.
    const punkte: [number, number][] = [[0, 0], [8, 0], [8, 3], [16, 3], [16, 6], [24, 6], [24, 9], [32, 9]];
    const knoten = punkte.map(([x, y], i) => xy(`s${i}`, x, y, 0, i === punkte.length - 1 ? '4' : undefined));
    const kanten = punkte.slice(1).map(([x, y], i) => {
      const [x0, y0] = punkte[i];
      return kante(`s${i}`, `s${i + 1}`, 'eben', Math.hypot(x - x0, y - y0));
    });
    const pfad = machePfad(knoten, kanten);
    const schritte = generiereSchritte(pfad, { profil: 'normal' });

    expect(schritte.map((s) => s.text)).toEqual(['Nach Ausstieg 40 m geradeaus zu Gleis 4']);
    // Der Schritt deckt weiter den ganzen Pfad, und die Zeit bleibt dieselbe.
    expect(schritte[0].knotenVon).toBe(0);
    expect(schritte[0].knotenBis).toBe(pfad.knoten.length - 1);
    expect(schritte.reduce((a, s) => a + (s.sekunden ?? 0), 0)).toBe(gehzeitSekunden(pfad, 'normal'));
  });

  it('eine Abbiegung mit mehr als 6 m Versatz bleibt ein eigener Schritt', () => {
    // Schutz gegen zu viel Glättung: 15 m quer ist ein Weg, kein Versatz.
    const knoten = [xy('a', 0, 0), xy('b', 20, 0), xy('c', 20, 15), xy('d', 40, 15, 0, '3')];
    const kanten = [kante('a', 'b', 'eben', 20), kante('b', 'c', 'eben', 15), kante('c', 'd', 'eben', 20)];
    expect(generiereSchritte(machePfad(knoten, kanten)).map((s) => s.text)).toEqual([
      'Nach Ausstieg 20 m geradeaus',
      '20 m links',
      '20 m rechts zu Gleis 3',
    ]);
  });
});

/**
 * Zwei Segmente: 200 m eben (aus zwei verschmelzenden Kanten gleicher
 * Richtung) und eine Treppe von Ebene 0 nach 1.
 * gehzeitSekunden normal = round(210/1,0) + 20 = 230.
 */
function beispielPfad(): RoutenPfad {
  const a = xy('a', 0, 0, 0);
  const b = xy('b', 0, 100, 0);
  const c = xy('c', 0, 200, 0);
  const d = xy('d', 0, 200, 1);
  return machePfad(
    [a, b, c, d],
    [kante('a', 'b', 'eben', 100), kante('b', 'c', 'eben', 100), kante('c', 'd', 'treppe', 10, 1)],
  );
}

describe('Schritte tragen Zeit und Ebene', () => {
  it('jeder Schritt hat sekunden, und die Summe ist die Gehzeit', () => {
    const pfad = beispielPfad();
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    for (const s of schritte) expect(typeof s.sekunden).toBe('number');
    const summe = schritte.reduce((a, s) => a + (s.sekunden ?? 0), 0);
    expect(summe).toBe(gehzeitSekunden(pfad, 'normal'));
  });

  it('level ist die ZIEL-Ebene eines Ebenenwechsels, nicht die Ausgangsebene', () => {
    const schritte = generiereSchritte(beispielPfad(), { profil: 'normal' });
    const treppe = schritte.find((s) => s.typ === 'treppe');
    expect(treppe?.level).toBe(1);
  });

  it('ohne profil bleiben sekunden undefiniert - Rueckwaertskompatibilitaet', () => {
    const schritte = generiereSchritte(beispielPfad());
    expect(schritte[0].sekunden).toBeUndefined();
    expect(schritte[0].level).toBeDefined();
  });
});

describe('Schritte verweisen auf ihren Pfadbereich', () => {
  it('deckt den Pfad lueckenlos und ohne Ueberschneidung ab', () => {
    const pfad = beispielPfad();
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    expect(schritte[0].knotenVon).toBe(0);
    expect(schritte[schritte.length - 1].knotenBis).toBe(pfad.knoten.length - 1);
    for (let i = 1; i < schritte.length; i++) {
      expect(schritte[i].knotenVon).toBe(schritte[i - 1].knotenBis);
    }
  });

  it('ein verschmolzenes Segment umfasst mehrere Knoten', () => {
    const schritte = generiereSchritte(beispielPfad(), { profil: 'normal' });
    const spannen = schritte.map((s) => (s.knotenBis ?? 0) - (s.knotenVon ?? 0));
    expect(Math.max(...spannen)).toBeGreaterThanOrEqual(1);
    for (const spanne of spannen) expect(spanne).toBeGreaterThan(0);
  });
});

describe('zielZusatz (Haltestellenpfad, Umstieg 2.0)', () => {
  function geraderPfad(): RoutenPfad {
    const a: GraphKnoten = { id: 'a', lat: 52.0, lon: 13.0, level: 0 };
    const b: GraphKnoten = { id: 'b', lat: 52.00045, lon: 13.0, level: 0, gleis: '7' };
    return machePfad([a, b], [{ von: 'a', nach: 'b', laengeM: 50, deltaLevel: 0, typ: 'eben', barrierefrei: true }]);
  }

  it('ersetzt „zu Gleis“ am letzten Schritt', () => {
    const schritte = generiereSchritte(geraderPfad(), { profil: 'normal', zielZusatz: 'zu Steig B (Bus 245)' });
    expect(schritte.at(-1)!.text).toMatch(/zu Steig B \(Bus 245\)$/);
    expect(schritte.at(-1)!.text).not.toMatch(/Gleis 7/);
  });

  it('ohne zielZusatz bleibt alles wie bisher', () => {
    expect(generiereSchritte(geraderPfad(), { profil: 'normal' }).at(-1)!.text).toMatch(/zu Gleis 7$/);
  });
});

/*
 * „Zu viele kleine Schritte“ (Julian, 21.10.2026). Messung ueber 364 Wege aus
 * dem Startbestand: 14 % aller Schritte waren „wenige Meter“, dazu dieselbe
 * Rampe dreimal hintereinander (Backnang) und Podeste zwischen zwei Treppen
 * als eigener Schritt (Aachen). Zusammengefasst wird im Bahnhofspfad nur
 * INNERHALB einer Ebene - jede Ebene des Wegs ist ein Band im Schema, und
 * `besuchJeSchritt` ordnet die Schritte ueber genau diese Laeufe zu.
 */
describe('generiereSchritte: weniger kleine Schritte', () => {
  it('dieselbe Rampe dreimal hintereinander ist ein Schritt - die Zeit bleibt dieselbe', () => {
    const knoten = [
      xy('a', 0, 0), xy('b', 0, 20), xy('c', 0, 25, -1), xy('d', 0, 30, -1), xy('e', 0, 35, -1), xy('f', 0, 60, -1, '4'),
    ];
    const kanten = [
      kante('a', 'b', 'eben', 20), kante('b', 'c', 'rampe', 5, -1), kante('c', 'd', 'rampe', 5),
      kante('d', 'e', 'rampe', 5), kante('e', 'f', 'eben', 25),
    ];
    const pfad = machePfad(knoten, kanten);
    const schritte = generiereSchritte(pfad, { profil: 'normal' });
    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 20 m geradeaus',
      'Rampe hinunter zur Unterführung (-1)',
      '30 m geradeaus zu Gleis 4',
    ]);
    expect(schritte[1]).toMatchObject({ knotenVon: 1, knotenBis: 4 });
  });

  it('Rampe, kurzes Stueck, Rampe auf derselben Ebene ist ein Schritt (Hennef)', () => {
    const knoten = [xy('a', 0, 0), xy('b', 0, 10), xy('c', 0, 20), xy('d', 8, 20), xy('e', 8, 30), xy('f', 8, 90, 0, '3')];
    for (const k of knoten.slice(0, 2)) k.level = 0.5;
    const kanten = [
      kante('a', 'b', 'eben', 10), kante('b', 'c', 'rampe', 10, -0.5), kante('c', 'd', 'eben', 8),
      kante('d', 'e', 'rampe', 10), kante('e', 'f', 'eben', 60),
    ];
    expect(generiereSchritte(machePfad(knoten, kanten), { profil: 'normal' }).map((x) => x.text)).toEqual([
      'Nach Ausstieg 10 m geradeaus',
      'Rampe hinunter zur Ebene 0',
      '60 m geradeaus zu Gleis 3',
    ]);
  });

  it('ein kurzes Podest nach einer Treppe gehoert zur Treppe - die Ebenenlaeufe bleiben', () => {
    // Aachen Hbf: Treppe hoch zur 0.5, „Wenige Meter rechts“, Treppe hoch zur 1.
    const knoten = [
      xy('a', 0, 0), xy('b', 0, 30), xy('c', 0, 35, 0.5), xy('d', 4, 35, 0.5), xy('e', 4, 40, 1), xy('f', 4, 80, 1, '9'),
    ];
    const kanten = [
      kante('a', 'b', 'eben', 30), kante('b', 'c', 'treppe', 5, 0.5), kante('c', 'd', 'eben', 4),
      kante('d', 'e', 'treppe', 5, 0.5), kante('e', 'f', 'eben', 40),
    ];
    const schritte = generiereSchritte(machePfad(knoten, kanten), { profil: 'normal' });
    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 30 m geradeaus',
      'Treppe hoch zur Ebene 0.5',
      'Treppe hoch zur Ebene 1',
      '40 m geradeaus zu Gleis 9',
    ]);
    // Je Ebene ein Lauf, wie im Schema: 0 · 0.5 · 1.
    expect(schritte.map((s) => s.level)).toEqual([0, 0.5, 1, 1]);
  });

  it('ein kurzer Versatz zwischen zwei Wegstuecken ist kein Abbiegen', () => {
    // Aachen: „70 m geradeaus · 10 m rechts · 30 m links“ - gegangen wird geradeaus.
    const knoten = [xy('a', 0, 0), xy('b', 0, 70), xy('c', 10, 70), xy('d', 10, 100, 0, '1')];
    const kanten = [kante('a', 'b', 'eben', 70), kante('b', 'c', 'eben', 10), kante('c', 'd', 'eben', 30)];
    const schritte = generiereSchritte(machePfad(knoten, kanten), { profil: 'normal' });
    expect(schritte.map((x) => x.text)).toEqual(['Nach Ausstieg 110 m geradeaus zu Gleis 1']);
  });

  it('ein kurzes Stueck vor einer echten Abbiegung geht in ihr auf', () => {
    // 60 m nach Norden, 10 m nach Osten, 40 m nach Osten weiter: rechts.
    const knoten = [xy('a', 0, 0), xy('b', 0, 60), xy('c', 7, 67), xy('d', 50, 67, 0, '2')];
    const kanten = [kante('a', 'b', 'eben', 60), kante('b', 'c', 'eben', 10), kante('c', 'd', 'eben', 43)];
    const schritte = generiereSchritte(machePfad(knoten, kanten), { profil: 'normal' });
    expect(schritte.map((x) => x.text)).toEqual(['Nach Ausstieg 60 m geradeaus', '50 m rechts zu Gleis 2']);
    expect(schritte[1]).toMatchObject({ knotenVon: 1, knotenBis: 3 });
  });

  it('die Schrittzeiten summieren sich weiter genau zur Gehzeit', () => {
    const knoten = [
      xy('a', 0, 0), xy('b', 0, 30), xy('c', 0, 35, 0.5), xy('d', 4, 35, 0.5), xy('e', 4, 40, 1), xy('f', 4, 80, 1, '9'),
    ];
    const kanten = [
      kante('a', 'b', 'eben', 30), kante('b', 'c', 'treppe', 5, 0.5), kante('c', 'd', 'eben', 4),
      kante('d', 'e', 'treppe', 5, 0.5), kante('e', 'f', 'eben', 40),
    ];
    const pfad = machePfad(knoten, kanten);
    for (const ueberEbenen of [false, true]) {
      const schritte = generiereSchritte(pfad, { profil: 'normal', ueberEbenen });
      expect(schritte.reduce((s, x) => s + (x.sekunden ?? 0), 0)).toBe(gehzeitSekunden(pfad, 'normal'));
    }
  });

  it('Haltestellenpfad (kein Schema): Treppe, Podest, Treppe in dieselbe Richtung ist EIN Schritt', () => {
    const knoten = [
      xy('a', 0, 0), xy('b', 0, 50, 1), xy('c', 0, 55, 0.5), xy('d', 3, 55, 0.5), xy('e', 3, 60, 0.25),
      xy('f', 5, 60, 0.25), xy('g', 5, 65, 0), xy('h', 100, 65, 0),
    ];
    for (const k of knoten.slice(0, 2)) k.level = 1;
    const kanten = [
      kante('a', 'b', 'eben', 50), kante('b', 'c', 'treppe', 5, -0.5), kante('c', 'd', 'eben', 3),
      kante('d', 'e', 'treppe', 5, -0.25), kante('e', 'f', 'eben', 2), kante('f', 'g', 'treppe', 5, -0.25),
      kante('g', 'h', 'eben', 95),
    ];
    const schritte = generiereSchritte(machePfad(knoten, kanten), { profil: 'normal', ueberEbenen: true, zielZusatz: 'zu Steig A (Bus 21)' });
    expect(schritte.map((s) => s.text)).toEqual([
      'Nach Ausstieg 50 m geradeaus',
      'Treppe hinunter zur Ebene 0',
      '100 m rechts zu Steig A (Bus 21)',
    ]);
  });
});
