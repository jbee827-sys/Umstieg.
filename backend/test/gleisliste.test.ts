import { describe, it, expect } from 'vitest';
import { baueGraph } from '../src/core/graph.js';
import type { OverpassAntwort, OsmElement } from '../src/core/typen.js';

/**
 * Die Gleisliste eines Bahnhofs.
 *
 * Alle Faelle hier sind echt und stammen aus der Simulation vom 13.09.2026
 * ueber 94 abgelegte Bahnhoefe. Sie kam ans Licht, weil die Simulation stets
 * vom ersten zum letzten Gleis faehrt - und in Frankfurt(Main)Hbf das letzte
 * „Gleis" der Strassenbahnsteig „Platz der Republik" war. Der Metropolknoten
 * war damit gar nicht gemessen.
 */

let naechsteId = 1000;

/**
 * Ein Bahnsteig als Way, mit zwei Knoten. Mehr braucht die Gleisliste nicht:
 * Sie entsteht allein aus `ref`, die Geometrie haengt nur mit dran.
 */
function bahnsteig(tags: Record<string, string>): OsmElement[] {
  const a = naechsteId++;
  const b = naechsteId++;
  const w = naechsteId++;
  return [
    { type: 'node', id: a, lat: 52.5, lon: 13.37 },
    { type: 'node', id: b, lat: 52.5, lon: 13.372 },
    { type: 'way', id: w, nodes: [a, b], tags: { railway: 'platform', ...tags } },
  ];
}

function gleiseAus(...bahnsteige: Record<string, string>[]): string[] {
  const elements: OsmElement[] = bahnsteige.flatMap((t) => bahnsteig(t));
  return baueGraph({ elements } as OverpassAntwort).gleise;
}

describe('Gleisliste: Trennzeichen im ref-Tag', () => {
  it('trennt bei ";" und "/" – wie bisher', () => {
    expect(gleiseAus({ ref: '2;3' }, { ref: '11/12' })).toEqual(['2', '3', '11', '12']);
  });

  /**
   * Leipzig Hbf traegt "18a,19". Vor dem 13.09.2026 stand das als EIN Eintrag
   * in der Liste - Gleis 19 gab es fuer die App nicht, und wer es eingab,
   * bekam "nicht im Kartenmaterial" und das Standardmodell. Ausgerechnet an
   * dem Bahnhof, an dem der Kopfbahnhof-Fall gemessen wurde.
   */
  it('trennt bei "," – Leipzig Hbf "18a,19"', () => {
    expect(gleiseAus({ ref: '18a,19' })).toEqual(['18a', '19']);
  });

  /** Hannover Hbf: "2,2a" und "2b,3,3a,3b" – acht Gleise in drei Eintraegen. */
  it('trennt auch mehrfach – Hannover Hbf "2b,3,3a,3b"', () => {
    expect(gleiseAus({ ref: '2,2a' }, { ref: '2b,3,3a,3b' })).toEqual([
      '2', '2a', '2b', '3', '3a', '3b',
    ]);
  });

  /** Duesseldorf Hbf traegt "3:4". */
  it('trennt bei ":" – "3:4"', () => {
    expect(gleiseAus({ ref: '3:4', train: 'yes' })).toEqual(['3', '4']);
  });
});

describe('Gleisliste: ausgeschriebene Vorsilbe', () => {
  it('liest "Gleis 21" als 21', () => {
    expect(gleiseAus({ ref: 'Gleis 21', train: 'yes' })).toEqual(['21']);
  });

  it('liest auch "Gl. 7"', () => {
    expect(gleiseAus({ ref: 'Gl. 7', train: 'yes' })).toEqual(['7']);
  });

  it('laesst eine Bezeichnung ohne Vorsilbe in Ruhe', () => {
    expect(gleiseAus({ ref: '7', train: 'yes' })).toEqual(['7']);
  });
});

describe('Gleisliste: eine Gleisnummer traegt eine Ziffer', () => {
  it('nimmt nicht auf, was keine traegt', () => {
    expect(
      gleiseAus(
        { ref: 'Omnibusbahnhof' },
        { ref: 'Eilgutbühne' },
        { ref: 'Museumsbahnsteig', train: 'yes' },
        { ref: 'Platz der Republik' },
      ),
    ).toEqual([]);
  });

  /**
   * Basel Bad Bf bezeichnet seine Bahnsteige „Regio 1" bis „Fern 7". Das IST
   * dort die Gleisbezeichnung - eine reine Zahlenregel wuerde den Bahnhof
   * leer raeumen.
   */
  it('behaelt Bezeichnungen mit Ziffer – Basel Bad Bf "Regio 1", "Fern 4"', () => {
    expect(gleiseAus({ ref: 'Regio 1', train: 'yes' }, { ref: 'Fern 4', train: 'yes' })).toEqual([
      'Fern 4',
      'Regio 1',
    ]);
  });
});

describe('Gleisliste: Strassenbahn- und Bussteige sind keine Gleise', () => {
  /**
   * Frankfurts Bahnhofsvorplatz liefert vier davon - und `railway=platform`
   * tragen sie alle. Das letzte stand in der Gleisliste hinter Gleis 104.
   */
  it('laesst Strassenbahnsteige draussen', () => {
    expect(
      gleiseAus(
        { ref: 'B', tram: 'yes' },
        { ref: 'C', tram: 'yes' },
        { ref: 'Platz der Republik', tram: 'yes' },
        { ref: '24', train: 'yes' },
      ),
    ).toEqual(['24']);
  });

  /**
   * Der gefaehrlichere Fall: Der Strassenbahnsteig traegt eine ZAHL. Muenchen
   * Hbf hatte so die „Gleise" 1 bis 4 - allesamt Haltestellen auf dem
   * Vorplatz (Hauptbahnhof Sued, Hopfenstrasse, Holzkirchner Bahnhof). Ein
   * Reisender, der Gleis 2 eingab, wurde zu einer Tram geschickt.
   */
  it('laesst auch einen Strassenbahnsteig MIT Zahl draussen', () => {
    expect(gleiseAus({ ref: '1;2;5', tram: 'yes' }, { ref: '11', train: 'yes' })).toEqual(['11']);
  });

  it('laesst Bussteige draussen', () => {
    expect(gleiseAus({ ref: '3', bus: 'yes' }, { ref: '3', train: 'yes' })).toEqual(['3']);
  });

  /**
   * Die Regel ist bewusst eng. `train=yes` zu VERLANGEN waere zu scharf: 184
   * von 983 gemessenen Bahnsteigrefs tragen es nicht, darunter Kaiserslauterns
   * Gleise 1 und 8/10.
   */
  it('behaelt einen Bahnsteig ohne jede Verkehrsmittelangabe', () => {
    expect(gleiseAus({ ref: '8;10' })).toEqual(['8', '10']);
  });

  it('behaelt einen Bahnsteig, der BEIDES bedient', () => {
    expect(gleiseAus({ ref: '5', tram: 'yes', train: 'yes' })).toEqual(['5']);
  });

  /**
   * Und sie greift nicht nach `highway=platform`: Duesseldorfs Gleis 1 traegt
   * das, ohne Strassenbahn und ohne `train=yes`.
   */
  it('behaelt einen Bahnsteig mit highway=platform', () => {
    expect(gleiseAus({ ref: '1', highway: 'platform' })).toEqual(['1']);
  });
});
