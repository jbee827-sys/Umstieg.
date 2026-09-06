import { describe, expect, it } from 'vitest';
import { namensvarianten } from '../src/core/bahnhofsname.js';

/**
 * Verkehrsverbuende schreiben Haltestellennamen anders als die Bahn.
 *
 * Gemessen am 03.09.2026 gegen die echte RIS::Stations-Suche:
 *
 *   "Berlin Gesundbrunnen"      -> Berlin Gesundbrunnen (EVA 8011102)
 *   "S+U Berlin Gesundbrunnen"  -> NICHTS
 *   "Berlin Gesundbrunnen Bhf"  -> NICHTS
 *   "Hockenheim"                -> Hockenheim
 *   "Hockenheim, Bahnhof"       -> NICHTS
 *   "Eberswalde, Hauptbahnhof"  -> Eberswalde Hbf
 *   "S Potsdam Hauptbahnhof"    -> Potsdam Hbf
 *
 * Die Suche verkraftet also "Hauptbahnhof" statt "Hbf" und ein einzelnes
 * "S", aber weder die kombinierte Vorsilbe "S+U" noch ein angehaengtes
 * "Bhf"/"Bahnhof".
 *
 * Ueber die Verkehrsstellengruppe laesst sich das NICHT loesen: An die
 * Gruppe kommt man nur ueber eine EVA, und an die EVA nur ueber einen Namen,
 * den die Suche annimmt. Deshalb wird hier eine Reihe von Schreibvarianten
 * gebildet, die der Reihe nach probiert werden - von genau nach grob.
 */
describe('namensvarianten', () => {
  it('probiert den Namen zuerst unveraendert', () => {
    expect(namensvarianten('Berlin Hbf')[0]).toBe('Berlin Hbf');
  });

  it('entfernt die Verkehrsmittel-Vorsilbe', () => {
    expect(namensvarianten('S+U Berlin Gesundbrunnen')).toContain('Berlin Gesundbrunnen');
  });

  it('entfernt eine angehaengte Bahnhofs-Nachsilbe', () => {
    expect(namensvarianten('Berlin Gesundbrunnen Bhf')).toContain('Berlin Gesundbrunnen');
    expect(namensvarianten('Hockenheim, Bahnhof')).toContain('Hockenheim');
  });

  it('entfernt beides zusammen', () => {
    expect(namensvarianten('S+U Berlin Gesundbrunnen Bhf')).toContain('Berlin Gesundbrunnen');
  });

  /**
   * "Hauptbahnhof" DARF nicht fallen - die Suche kommt damit klar und
   * loeste "Eberswalde, Hauptbahnhof" korrekt auf. Faellt es doch, bliebe
   * "Eberswalde" uebrig, und das ist ein anderer Ort als der Bahnhof.
   */
  it('laesst Hauptbahnhof unangetastet', () => {
    const varianten = namensvarianten('Eberswalde, Hauptbahnhof');
    expect(varianten[0]).toBe('Eberswalde, Hauptbahnhof');
    expect(varianten).not.toContain('Eberswalde');
  });

  it('entfernt den Klammerzusatz der Verbuende', () => {
    expect(namensvarianten('S+U Berlin Hauptbahnhof [Gleis 1-8]')).toContain(
      'Berlin Hauptbahnhof',
    );
  });

  /**
   * Die VBB haengt die Stadt in RUNDEN Klammern an: "S+U Gesundbrunnen Bhf
   * (Berlin)". Gemessen am 06.09.2026 gegen die echte Suche:
   *
   *   "S+U Gesundbrunnen Bhf (Berlin)" -> NICHTS
   *   "Gesundbrunnen Bhf (Berlin)"     -> NICHTS
   *   "Gesundbrunnen (Berlin)"         -> Berlin Gesundbrunnen (8011102)
   *
   * Es ist also allein das "Bhf" VOR der Klammer, das die Suche abwuergt -
   * die Klammer selbst vertraegt sie. Die Nachsilbenregel war aber auf das
   * Zeilenende verankert und lief deshalb an einem Klammerzusatz vorbei.
   */
  it('schneidet die Nachsilbe auch dann ab, wenn ein Klammerzusatz folgt', () => {
    expect(namensvarianten('S+U Gesundbrunnen Bhf (Berlin)')).toContain('Gesundbrunnen (Berlin)');
  });

  /**
   * Die Stadt MUSS dabei stehenbleiben. Gemessen am 06.09.2026:
   * "Hauptbahnhof (Berlin)" -> Berlin Hbf, "Hauptbahnhof" allein -> 24
   * Treffer, angefuehrt von Muenchen Hbf. Den Zusatz wegzuwerfen waere also
   * nicht bloss unnoetig, sondern eine falsche Auskunft.
   */
  it('wirft den Klammerzusatz nicht weg - er unterscheidet die Staedte', () => {
    for (const v of namensvarianten('S+U Gesundbrunnen Bhf (Berlin)')) {
      expect(v).toMatch(/\(Berlin\)/);
    }
  });

  /**
   * Störwörter stehen an BEIDEN Enden - das ist der Kern von Weg A.
   *
   * Die alte Fassung führte zwei Listen, jede an ein Ende gebunden, mit
   * willkürlicher Überschneidung: "Bhf"/"Bf" standen in beiden, "Bahnhof" nur
   * hinten, "S"/"U" nur vorn, "Bus"/"Tram" nirgends. Jeder neue Verbund
   * brachte deshalb einen neuen Einzelfall. Gemessen am 06.09.2026 gegen die
   * echte Suche - alle fünf fielen durch, und alle aus demselben Grund.
   */
  it.each([
    ['Bahnhof Hockenheim', 'Hockenheim'],
    ['Bahnhof Eberswalde', 'Eberswalde'],
    ['Tram Hackescher Markt (Berlin)', 'Hackescher Markt (Berlin)'],
    ['Bus Zoologischer Garten (Berlin)', 'Zoologischer Garten (Berlin)'],
    ['Berlin Gesundbrunnen S+U', 'Berlin Gesundbrunnen'],
    ['Bahnhof, Züssow', 'Züssow'],
  ])('schält das Störwort aus %j und probiert %j', (roh, kern) => {
    expect(namensvarianten(roh)).toContain(kern);
  });

  /**
   * Die Gegenprobe zum Abschälen: Ein Name, der zufällig wie ein Störwort
   * anfängt, darf nicht angetastet werden. Der Trenner nach dem Störwort ist
   * das, was "S Treptower Park" von "Sankt Goar" unterscheidet.
   */
  it.each(['Hamburg-Altona', 'Frankfurt(Main)Hbf', 'Sankt Goar', 'Berlin Gesundbrunnen'])(
    'lässt %j unangetastet und kostet genau einen Aufruf',
    (name) => {
      expect(namensvarianten(name)).toEqual([name]);
    },
  );

  /**
   * Die Quote ist die Nebenbedingung: Jede Variante ist ein API-Aufruf.
   *
   * Fünf ist die bauartbedingte Obergrenze - Original plus vier Ableitungen
   * (ohne eckige Klammer, vorn geschält, hinten geschält, beides). Der Test
   * steht auf genau dieser Zahl statt auf einer bequemen höheren: So schlägt
   * er an, sobald jemand eine fünfte Ableitung hinzufügt, und die Frage nach
   * dem zusätzlichen Aufruf wird gestellt, statt unbemerkt zu bleiben.
   */
  it('kostet auch im schlimmsten Fall höchstens fünf Aufrufe', () => {
    const wild = 'S+U Bahnhof Bus Tram Gesundbrunnen Bhf Bf S+U [Gleis 1-8] (Berlin)';
    expect(namensvarianten(wild).length).toBeLessThanOrEqual(5);
  });

  it('liefert keine Dubletten und nichts Leeres', () => {
    const v = namensvarianten('Berlin Hbf');
    expect(new Set(v).size).toBe(v.length);
    expect(v.every((x) => x.trim().length > 0)).toBe(true);
  });

  it('gibt bei leerer Eingabe nichts zurueck', () => {
    expect(namensvarianten('   ')).toEqual([]);
  });

  // Ein Name ohne Zusaetze soll genau EINEN Versuch ergeben - sonst kostet
  // jede gewoehnliche Suche unnoetige Aufrufe gegen die Quote.
  it('erzeugt fuer einen sauberen Namen keinen zweiten Versuch', () => {
    expect(namensvarianten('Berlin Gesundbrunnen')).toEqual(['Berlin Gesundbrunnen']);
  });
});
