import { describe, it, expect } from 'vitest';
import {
  GEWICHTE,
  berechneRoute,
  findeStartknoten,
  istGleicherBahnsteig,
} from '../src/core/routing.js';
import { baueGraph } from '../src/core/graph.js';
import { gehzeitSekunden, kantenZeitSekunden } from '../src/core/gehzeit.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  Gehprofil,
  GraphKante,
  GraphKnoten,
  OverpassAntwort,
  RoutenVariante,
  StationGraph,
} from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

/** Baut einen StationGraph von Hand – bekannte Topologie für gezielte Routingfälle. */
function macheGraph(knotenListe: GraphKnoten[], kanten: GraphKante[], gleise: string[]): StationGraph {
  const knoten = new Map(knotenListe.map((k) => [k.id, k]));
  const adjazenz = new Map<string, GraphKante[]>();
  for (const kante of kanten) {
    for (const ende of [kante.von, kante.nach]) {
      if (!adjazenz.has(ende)) adjazenz.set(ende, []);
      adjazenz.get(ende)!.push(kante);
    }
  }
  return { knoten, adjazenz, stufe: 1, gleise };
}

const k = (
  id: string,
  lat: number,
  lon: number,
  level = 0,
  extra: Partial<GraphKnoten> = {},
): GraphKnoten => ({ id, lat, lon, level, ...extra });

const eben = (von: string, nach: string, laengeM: number): GraphKante => ({
  von, nach, laengeM, deltaLevel: 0, typ: 'eben', barrierefrei: true,
});

/**
 * Treppe-vs-Aufzug-Bahnhof: Gleis 1 und Gleis 2 über Unterführung (−1) verbunden.
 * Beide Ebenenwechsel gehen wahlweise per Treppe (15 m) oder Aufzug (5 m).
 */
function treppeVsAufzugGraph(aufzugStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): StationGraph {
  const knoten = [
    k('gleis1:mitte', 52.0, 13.0, 0, { gleis: '1', abschnitt: 'mitte', bahnsteigId: 'bs1' }),
    k('gleis1:anfang', 52.0, 12.9995, 0, { gleis: '1', abschnitt: 'anfang', bahnsteigId: 'bs1' }),
    k('a@0', 52.0001, 13.0),
    k('u1@-1', 52.0001, 13.00005, -1),
    k('u2@-1', 52.0002, 13.00005, -1),
    k('b@0', 52.0002, 13.0),
    k('gleis2:mitte', 52.0003, 13.0, 0, { gleis: '2', abschnitt: 'mitte', bahnsteigId: 'bs2' }),
    k('gleis3:mitte', 52.00031, 13.0, 0, { gleis: '3', abschnitt: 'mitte', bahnsteigId: 'bs2' }),
  ];
  const treppe = (von: string, nach: string, deltaLevel: number): GraphKante => ({
    von, nach, laengeM: 15, deltaLevel, typ: 'treppe', barrierefrei: false,
  });
  const aufzug = (von: string, nach: string, deltaLevel: number): GraphKante => ({
    von, nach, laengeM: 5, deltaLevel, typ: 'aufzug', barrierefrei: true, status: aufzugStatus,
  });
  const kanten = [
    eben('gleis1:anfang', 'gleis1:mitte', 50),
    eben('gleis1:mitte', 'a@0', 10),
    treppe('a@0', 'u1@-1', -1),
    aufzug('a@0', 'u1@-1', -1),
    eben('u1@-1', 'u2@-1', 50),
    treppe('u2@-1', 'b@0', 1),
    aufzug('u2@-1', 'b@0', 1),
    eben('b@0', 'gleis2:mitte', 10),
  ];
  return macheGraph(knoten, kanten, ['1', '2', '3']);
}

describe('GEWICHTE', () => {
  it('enthält nur noch die Vorlieben, nicht die Zeit', () => {
    expect(GEWICHTE.ebenenwechselMalusSek).toBe(45);
    expect(GEWICHTE.abbiegenMalusSek).toBe(15);
    expect(GEWICHTE.abbiegenSchwelleGrad).toBe(45);
  });

  it('rechnet die Zeit mit denselben Zahlen wie die Anzeige', () => {
    // Frueher standen hier `basisMproSek`, `rolltreppeBonusSek` und
    // `aufzugMalusSek` - ein zweites Kostenmodell neben dem der Gehzeit.
    // Genau daran ging die Behauptung "schnellste" kaputt.
    expect(kantenZeitSekunden({ laengeM: 100, typ: 'eben' }, 'normal')).toBe(100);
    expect(kantenZeitSekunden({ laengeM: 0, typ: 'rolltreppe' }, 'normal')).toBe(10);
    expect(kantenZeitSekunden({ laengeM: 0, typ: 'treppe' }, 'normal')).toBe(20);
    expect(kantenZeitSekunden({ laengeM: 0, typ: 'aufzug' }, 'normal')).toBe(60);
    // Zuschlaege sind fest, Strecke skaliert mit dem Profil.
    expect(kantenZeitSekunden({ laengeM: 60, typ: 'treppe' }, 'langsam')).toBe(120);
  });
});

describe('berechneRoute – schnellste', () => {
  it('wählt die Treppe statt des Aufzugs (Aufzug-Malus 60 s)', () => {
    const graph = treppeVsAufzugGraph();
    const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste');
    expect(pfad).not.toBeNull();
    expect(pfad!.kanten.some((ka) => ka.typ === 'treppe')).toBe(true);
    expect(pfad!.kanten.some((ka) => ka.typ === 'aufzug')).toBe(false);
    expect(pfad!.laengeM).toBe(100); // 10 + 15 + 50 + 15 + 10
  });

  it('nimmt die Rolltreppe trotz längerem Weg (Bonus −10 s)', () => {
    const graph = macheGraph(
      [k('s@0', 52.0, 13.0), k('z@-1', 52.0001, 13.0, -1)],
      [
        { von: 's@0', nach: 'z@-1', laengeM: 15, deltaLevel: -1, typ: 'treppe', barrierefrei: false },
        { von: 's@0', nach: 'z@-1', laengeM: 18, deltaLevel: -1, typ: 'rolltreppe', barrierefrei: false },
      ],
      [],
    );
    const pfad = berechneRoute(graph, 's@0', 'z@-1', 'schnellste');
    expect(pfad!.kanten).toHaveLength(1);
    expect(pfad!.kanten[0].typ).toBe('rolltreppe');
  });

  it('liefert Pfadstruktur: knoten[0]=Start, letzter=Ziel, kanten passend, laengeM = Summe', () => {
    const graph = treppeVsAufzugGraph();
    const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'schnellste')!;
    expect(pfad.knoten[0].id).toBe('gleis1:mitte');
    expect(pfad.knoten[pfad.knoten.length - 1].id).toBe('gleis2:mitte');
    expect(pfad.kanten).toHaveLength(pfad.knoten.length - 1);
    const summe = pfad.kanten.reduce((s, ka) => s + ka.laengeM, 0);
    expect(pfad.laengeM).toBe(summe);
  });

  it('kein Pfad zwischen unverbundenen Knoten → null', () => {
    const graph = macheGraph([k('a@0', 52, 13), k('b@0', 52.001, 13)], [], []);
    expect(berechneRoute(graph, 'a@0', 'b@0', 'schnellste')).toBeNull();
  });
});

describe('berechneRoute – barrierefrei', () => {
  it('wählt den Aufzug, Treppen sind gesperrt', () => {
    const graph = treppeVsAufzugGraph();
    const pfad = berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei');
    expect(pfad).not.toBeNull();
    expect(pfad!.kanten.filter((ka) => ka.typ === 'aufzug')).toHaveLength(2);
    expect(pfad!.kanten.some((ka) => ka.typ === 'treppe')).toBe(false);
  });

  it('Aufzug INACTIVE → keine barrierefreie Route (null)', () => {
    const graph = treppeVsAufzugGraph('INACTIVE');
    expect(berechneRoute(graph, 'gleis1:mitte', 'gleis2:mitte', 'barrierefrei')).toBeNull();
  });

  it('Rolltreppe ist ebenfalls gesperrt', () => {
    const graph = macheGraph(
      [k('s@0', 52.0, 13.0), k('z@-1', 52.0001, 13.0, -1)],
      [{ von: 's@0', nach: 'z@-1', laengeM: 18, deltaLevel: -1, typ: 'rolltreppe', barrierefrei: false }],
      [],
    );
    expect(berechneRoute(graph, 's@0', 'z@-1', 'barrierefrei')).toBeNull();
  });
});

describe('berechneRoute – einfachste', () => {
  // Geometrie: Kollinearer Weg S→p1→Z (kein Richtungswechsel, 50 m Korridorlänge)
  // gegen Zickzack S→q1→Z (~86° Knick, 40 m). schnellste nimmt den kurzen Zickzack,
  // einfachste zahlt dort +15 s Abbiege-Malus und bleibt auf dem geraden Weg.
  function abbiegeGraph(): StationGraph {
    const knoten = [
      k('s@0', 52.0, 13.0),
      k('p1@0', 52.0002, 13.0),
      k('q1@0', 52.0002, 13.0003),
      k('z@0', 52.0004, 13.0),
    ];
    const kanten = [
      eben('s@0', 'p1@0', 25),
      eben('p1@0', 'z@0', 25),
      eben('s@0', 'q1@0', 20),
      eben('q1@0', 'z@0', 20),
    ];
    return macheGraph(knoten, kanten, []);
  }

  it('minimiert Abbiegungen: gerader Weg trotz größerer Länge', () => {
    const pfad = berechneRoute(abbiegeGraph(), 's@0', 'z@0', 'einfachste');
    expect(pfad!.knoten.map((kn) => kn.id)).toEqual(['s@0', 'p1@0', 'z@0']);
  });

  it('schnellste nimmt im selben Graphen den kurzen Zickzack', () => {
    const pfad = berechneRoute(abbiegeGraph(), 's@0', 'z@0', 'schnellste');
    expect(pfad!.knoten.map((kn) => kn.id)).toEqual(['s@0', 'q1@0', 'z@0']);
  });

  it('meidet Ebenenwechsel (+45 s je Wechsel)', () => {
    // Treppenweg 30 m gesamt vs. ebener Korridor 100 m: schnellste → Treppe,
    // einfachste → 30 + 2×45 = 120 s > 100 s → eben.
    const knoten = [
      k('s@0', 52.0, 13.0),
      k('m@-1', 52.00013, 13.0, -1),
      k('z@0', 52.00027, 13.0),
    ];
    const kanten = [
      { von: 's@0', nach: 'm@-1', laengeM: 15, deltaLevel: -1, typ: 'treppe' as const, barrierefrei: false },
      { von: 'm@-1', nach: 'z@0', laengeM: 15, deltaLevel: 1, typ: 'treppe' as const, barrierefrei: false },
      eben('s@0', 'z@0', 100),
    ];
    const graph = macheGraph(knoten, kanten, []);
    expect(berechneRoute(graph, 's@0', 'z@0', 'einfachste')!.kanten).toHaveLength(1);
    expect(berechneRoute(graph, 's@0', 'z@0', 'schnellste')!.kanten).toHaveLength(2);
  });
});

describe('findeStartknoten', () => {
  it('findet den Bahnsteigpunkt zum angefragten Abschnitt', () => {
    const { knoten, hinweis } = findeStartknoten(treppeVsAufzugGraph(), '1', 'anfang');
    expect(knoten.id).toBe('gleis1:anfang');
    expect(hinweis).toBeUndefined();
  });

  it('unbekannter Abschnitt → Mitte mit Hinweis', () => {
    const { knoten, hinweis } = findeStartknoten(treppeVsAufzugGraph(), '1', 'C');
    expect(knoten.id).toBe('gleis1:mitte');
    expect(hinweis).toBeTruthy();
  });

  it('ohne Abschnitt → Mitte ohne Hinweis', () => {
    const { knoten, hinweis } = findeStartknoten(treppeVsAufzugGraph(), '2');
    expect(knoten.id).toBe('gleis2:mitte');
    expect(hinweis).toBeUndefined();
  });

  it('unbekanntes Gleis → wirft', () => {
    expect(() => findeStartknoten(treppeVsAufzugGraph(), '99')).toThrow(/99/);
  });
});

describe('istGleicherBahnsteig', () => {
  it('zwei Gleise am selben physischen Bahnsteig → true', () => {
    expect(istGleicherBahnsteig(treppeVsAufzugGraph(), '2', '3')).toBe(true);
  });

  it('Gleise an verschiedenen Bahnsteigen → false', () => {
    expect(istGleicherBahnsteig(treppeVsAufzugGraph(), '1', '2')).toBe(false);
  });

  /**
   * Das Muster von München Hbf, Gleis 5 → 2 (Konzeptlücke §4.3).
   *
   * OSM führt beide Gleise an EINEM Bahnsteig – in `treppeVsAufzugGraph`
   * tragen Gleis 2 und 3 denselben `bahnsteigId` 'bs2'. Die Antwort war
   * deshalb „gegenüber, kein Ebenenwechsel“, während Gleis 2 in Wahrheit
   * im Tiefbahnhof liegt. Die DB-Gleisliste weiß es besser: Sie führt die
   * beiden unter verschiedenen Verkehrsstellen.
   *
   * Der Test darüber („zwei Gleise am selben physischen Bahnsteig → true“)
   * ist die Gegenprobe: ohne DB-Liste bleibt es beim OSM-Urteil.
   */
  const dbGetrennt = [
    { gleis: '2', evas: ['8098263'] }, // S-Bahn, tief
    { gleis: '3', evas: ['8000261'] }, // Halle
  ];

  it('DB führt die Gleise an verschiedenen Verkehrsstellen → false trotz gleichem OSM-Bahnsteig', () => {
    expect(istGleicherBahnsteig(treppeVsAufzugGraph(), '2', '3', dbGetrennt)).toBe(false);
  });

  it('DB führt ein Gleis an beiden Verkehrsstellen → OSM entscheidet weiter', () => {
    const ueberlappend = [
      { gleis: '2', evas: ['8098263'] },
      { gleis: '3', evas: ['8000261', '8098263'] },
    ];
    expect(istGleicherBahnsteig(treppeVsAufzugGraph(), '2', '3', ueberlappend)).toBe(true);
  });

  it('ein Gleis fehlt in der DB-Liste → OSM entscheidet weiter', () => {
    const lueckenhaft = [{ gleis: '2', evas: ['8098263'] }];
    expect(istGleicherBahnsteig(treppeVsAufzugGraph(), '2', '3', lueckenhaft)).toBe(true);
  });

  it('dasselbe Gleis bleibt derselbe Bahnsteig, auch wenn die DB-Liste trennt', () => {
    const kurios = [{ gleis: '2', evas: ['8098263'] }, { gleis: '2', evas: ['8000261'] }];
    expect(istGleicherBahnsteig(treppeVsAufzugGraph(), '2', '2', kurios)).toBe(true);
  });
});

/**
 * "Schnellste Route 6 min" stand im Dashboard ueber "Barrierefrei 5 min" -
 * die als schnellste bezeichnete Route war langsamer als beide Alternativen.
 * Am 02.09.2026 gegen die Produktion gemessen: 304 s gegen 295 s.
 *
 * Ursache: Der Router minimierte eine ANDERE Funktion, als er anzeigte. Eine
 * Rolltreppe bekam beim Routen -10 s gutgeschrieben, in der ausgewiesenen
 * Gehzeit aber +10 s berechnet; eine Treppe kostete beim Routen 0, in der
 * Anzeige +20 s. Zwei Kostenmodelle fuer dieselbe Sache.
 */
describe('Die schnellste Route ist die schnellste', () => {
  const berlin = baueGraph(ladeFixture('overpass/berlin-hbf'));
  const PAARE: [string, string][] = [
    ['15', '4'],
    ['16', '5'],
    ['11', '1'],
    ['15', '8'],
    ['12', '3'],
    ['14', '6'],
  ];
  const PROFILE: Gehprofil[] = ['zuegig', 'normal', 'langsam'];

  function gehzeitFuer(
    gleisAn: string,
    gleisAb: string,
    variante: RoutenVariante,
    profil: Gehprofil,
  ): number | null {
    const start = findeStartknoten(berlin, gleisAn);
    const ziel = findeStartknoten(berlin, gleisAb);
    const pfad = berechneRoute(berlin, start.knoten.id, ziel.knoten.id, variante, profil);
    return pfad ? gehzeitSekunden(pfad, profil) : null;
  }

  it('ist nie langsamer als eine andere Variante', () => {
    const verstoesse: string[] = [];
    for (const profil of PROFILE) {
      for (const [an, ab] of PAARE) {
        const schnellste = gehzeitFuer(an, ab, 'schnellste', profil);
        if (schnellste === null) continue;
        for (const andere of ['einfachste', 'barrierefrei'] as RoutenVariante[]) {
          const zeit = gehzeitFuer(an, ab, andere, profil);
          if (zeit === null) continue;
          if (schnellste > zeit) {
            verstoesse.push(
              `${profil} ${an}->${ab}: schnellste ${schnellste}s > ${andere} ${zeit}s`,
            );
          }
        }
      }
    }
    // Eine eingeschraenkte Suche (barrierefrei) kann das Optimum der
    // unbeschraenkten nicht unterbieten - vorausgesetzt, beide messen dasselbe.
    expect(verstoesse).toEqual([]);
  });

  it('richtet sich nach dem Gehprofil', () => {
    // Zuschlaege sind fest, Strecke nicht: Wer langsam geht, zahlt fuer
    // Meter mehr und darf deshalb eine andere Route bekommen als ein
    // Zuegiger. Ein profilblinder Router kann das nicht abbilden.
    const start = findeStartknoten(berlin, '15');
    const ziel = findeStartknoten(berlin, '4');
    for (const profil of PROFILE) {
      const pfad = berechneRoute(berlin, start.knoten.id, ziel.knoten.id, 'schnellste', profil);
      expect(pfad).not.toBeNull();
    }
  });
});
