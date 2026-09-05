import { describe, it, expect } from 'vitest';
import { bahnsteigSchluessel, verankerterBahnsteig } from '../src/core/fasta-gleisbezug.js';

/**
 * Jede Zeichenkette hier stammt aus einer ECHTEN FaSta-Antwort (Sondierung
 * 05.09.2026, fünf Bahnhöfe). Erfundene Beispiele wären hier wertlos: Der
 * ganze Sinn des Parsers ist, mit dem tatsächlichen Vokabular der DB
 * zurechtzukommen, und das ist unregelmässiger, als eine Doku vermuten lässt.
 */
describe('verankerterBahnsteig', () => {
  it('erkennt das Vokabular aller fuenf sondierten Bahnhoefe', () => {
    expect(verankerterBahnsteig('zu Gleis 15/16')).toEqual(['15', '16']);
    expect(verankerterBahnsteig('zu Bstg Gl 11/12')).toEqual(['11', '12']);
    expect(verankerterBahnsteig('zu Bstg Gl 3/4 Ostseite')).toEqual(['3', '4']);
    expect(verankerterBahnsteig('zu Bst 9/10')).toEqual(['9', '10']);
    expect(verankerterBahnsteig('B2-Ebene zu Gl. 101/102 S-Bahn')).toEqual(['101', '102']);
    expect(verankerterBahnsteig('zu Gleis 3/4')).toEqual(['3', '4']);
  });

  // Falle 1, belegt in der Berliner Rohantwort: Der Bindestrich ist ein
  // TRENNER, kein Bereich - "1.UG" ist eine Ebene, kein Gleis. Die naive
  // Lesart machte daraus "Gleis 1 bis 22".
  it('liest "Gleis 22 - 1.UG - Kein Halt EG" als genau ein Gleis', () => {
    expect(verankerterBahnsteig('Gleis 22 - 1.UG - Kein Halt EG')).toEqual(['22']);
  });

  // Falle 2, belegt in der Muenchener Rohantwort: 1a ist nicht 1.
  it('behaelt den Buchstabensuffix', () => {
    expect(verankerterBahnsteig('von UG zu Gleis 1a (S-Bahn)')).toEqual(['1a']);
    expect(verankerterBahnsteig('von UG zu Gleis 2a (S-Bahn)')).toEqual(['2a']);
  });

  it('ein echter Bereich nennt mehr als zwei Gleise und verankert deshalb nichts', () => {
    expect(verankerterBahnsteig('zu Gleis 3-8 Abschnitt D/E')).toBeNull();
  });

  it('zwei Fundstellen sind eine Verbindung und verankern nichts', () => {
    expect(verankerterBahnsteig('Gleis 5/6 (C/D) - Gleis 11/12')).toBeNull();
    expect(verankerterBahnsteig('Gleis 3/4 (C/D) - Gleis 13/14')).toBeNull();
  });

  it('Anlagen ohne Gleisbezug verankern nichts', () => {
    for (const text of [
      'von Parkhaus A zum 1. UG',
      '1.UG - Tram Haltestelle 5',
      'Nicht Reisendenrelevant',
      'DB Lounge',
      'Ecke Arnulf-/Luisenstr. zu U1',
      'B-Ebene <-> Strassenbahn',
      'von EG zu Zwischenebene',
      'Fahrtreppe HF 0204',
      '',
    ]) {
      expect(verankerterBahnsteig(text), text).toBeNull();
    }
    expect(verankerterBahnsteig(undefined)).toBeNull();
  });
});

describe('bahnsteigSchluessel', () => {
  it('sortiert numerisch - 12/11 und 11/12 sind derselbe Bahnsteig', () => {
    expect(bahnsteigSchluessel(['12', '11'])).toBe('11/12');
    expect(bahnsteigSchluessel(['11', '12'])).toBe('11/12');
  });

  it('sortiert nicht alphabetisch - 9 kommt vor 10', () => {
    expect(bahnsteigSchluessel(['10', '9'])).toBe('9/10');
  });

  it('vertraegt den Buchstabensuffix', () => {
    expect(bahnsteigSchluessel(['1a'])).toBe('1a');
  });
});
