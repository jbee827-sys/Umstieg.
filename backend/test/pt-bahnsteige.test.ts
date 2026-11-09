import { describe, expect, it } from 'vitest';
import { baueOverpassQL, OVERPASS_RADIUS_M } from '../src/clients/overpass.js';
import { baueGraph, istBahnsteigFlaeche } from '../src/core/graph.js';
import { istGleicherBahnsteig } from '../src/core/routing.js';
import type { OsmElement } from '../src/core/typen.js';
import { istVeraltet } from '../src/osm/bestand.js';
import { mitPtBahnsteigen, PT_BAHNSTEIGE } from '../src/osm/pt-bahnsteige.js';
import { ABFRAGE_VERSION, ABFRAGE_VERSION_PT, abfrageVersionFuer } from '../src/osm/version.js';

/*
 * Bahnsteige, die nur noch `public_transport=platform` tragen (08.11.2026).
 * Frankfurt (Main) Hbf „Bstg. 1+1a“ verlor am 06.11.2026 `railway=platform`;
 * Gleis 1a war danach unerreichbar. Nur die gelisteten Bahnhoefe fragen die
 * Zusatzzeilen ab - alle anderen behalten ihre Abfrage und ihre Version.
 */

const knoten = (id: number, lat: number, lon: number): OsmElement => ({ type: 'node', id, lat, lon });

describe('Abfrage mit pt-Bahnsteigen', () => {
  it('fragt die Zusatzzeilen nur auf Wunsch ab', () => {
    const ohne = baueOverpassQL(50.1, 8.66, 400);
    const mit = baueOverpassQL(50.1, 8.66, 400, true, true);
    expect(ohne).not.toContain('public_transport');
    expect(mit).toContain('relation["public_transport"="platform"][!"railway"]');
    expect(mit).toContain('way["public_transport"="platform"][!"railway"][!"highway"]');
  });

  it('laesst die Version aller anderen Bahnhoefe unveraendert', () => {
    // Der Startbestand vom 07./08.11.2026 traegt diese Fassung. Aendert sie sich,
    // gilt er ganz als veraltet - das darf nur mit einem Neufuellen geschehen.
    expect(ABFRAGE_VERSION).toBe('160f2ffa856a');
    expect(ABFRAGE_VERSION_PT).not.toBe(ABFRAGE_VERSION);
    expect(baueOverpassQL(0, 0, OVERPASS_RADIUS_M)).not.toContain('public_transport');
  });

  it('gibt Frankfurt eine eigene Version, allen anderen die gemeinsame', () => {
    expect(PT_BAHNSTEIGE.has('8000105')).toBe(true);
    expect(mitPtBahnsteigen('8000105')).toBe(true);
    expect(mitPtBahnsteigen('8000001')).toBe(false);
    expect(mitPtBahnsteigen(undefined)).toBe(false);
    expect(abfrageVersionFuer('8000105')).toBe(ABFRAGE_VERSION_PT);
    expect(abfrageVersionFuer('8000001')).toBe(ABFRAGE_VERSION);
  });

  it('haelt einen gelisteten Bahnhof mit der gemeinsamen Version fuer veraltet', () => {
    const jetzt = new Date('2026-11-08T12:00:00Z');
    const geholtAm = '2026-11-07T12:00:00Z';
    expect(istVeraltet({ schluessel: '8000105', geholtAm, abfrageVersion: ABFRAGE_VERSION }, jetzt)).toBe(true);
    expect(istVeraltet({ schluessel: '8000105', geholtAm, abfrageVersion: ABFRAGE_VERSION_PT }, jetzt)).toBe(false);
    expect(istVeraltet({ schluessel: '8000001', geholtAm, abfrageVersion: ABFRAGE_VERSION }, jetzt)).toBe(false);
  });
});

describe('Bahnsteigflaeche ohne railway=platform', () => {
  it('erkennt public_transport=platform ohne railway und highway, aber keinen Bussteig', () => {
    expect(istBahnsteigFlaeche({ railway: 'platform' })).toBe(true);
    expect(istBahnsteigFlaeche({ public_transport: 'platform', ref: '1;1a' })).toBe(true);
    expect(istBahnsteigFlaeche({ public_transport: 'platform', bus: 'yes' })).toBe(false);
    expect(istBahnsteigFlaeche({ public_transport: 'platform', highway: 'platform' })).toBe(false);
    expect(istBahnsteigFlaeche({ public_transport: 'platform', railway: 'platform_edge' })).toBe(false);
    expect(istBahnsteigFlaeche(undefined)).toBe(false);
  });

  it('nimmt nur Eisenbahnsteige, keine Bushaltestellen und nichts Stillgelegtes (Suche 08.11.2026)', () => {
    // Frankenthal Hbf, Way 166118826
    expect(istBahnsteigFlaeche({ public_transport: 'platform', train: 'yes', ref: '2;3', area: 'yes' })).toBe(true);
    // Bebra: Bushaltestelle ohne bus=yes, Buchstabe als ref
    expect(istBahnsteigFlaeche({ public_transport: 'platform', name: 'Gilfershäuser Straße', ref: 'A' })).toBe(false);
    // Neudietendorf: Haltestelle ohne ref
    expect(istBahnsteigFlaeche({ public_transport: 'platform', name: 'Neudietendorf Regelschule' })).toBe(false);
    // Dueren 23: stillgelegt
    expect(istBahnsteigFlaeche({ public_transport: 'platform', 'disused:railway': 'platform', train: 'yes', ref: '23' })).toBe(false);
    expect(istBahnsteigFlaeche({ public_transport: 'platform', tram: 'yes', ref: '1' })).toBe(false);
  });

  // Nachbau von Frankfurt 1+1a: eine Relation aus vier Gliedern, zwei davon die
  // Bahnsteigkanten von Gleis 1 und 1a, zwei unbeschriftete Linien.
  const frankfurt = (flaechenTags: Record<string, string>) =>
    baueGraph({
      elements: [
        knoten(1, 50.0, 8.0), knoten(2, 50.0, 8.002), knoten(3, 50.0001, 8.002), knoten(4, 50.0001, 8.0),
        { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'platform_edge', ref: '1' } },
        { type: 'way', id: 11, nodes: [2, 3] },
        { type: 'way', id: 12, nodes: [3, 4], tags: { railway: 'platform_edge', ref: '1a' } },
        { type: 'way', id: 13, nodes: [4, 1] },
        {
          type: 'relation',
          id: 21494088,
          members: [
            { type: 'way', ref: 10, role: 'outer' }, { type: 'way', ref: 11, role: 'outer' },
            { type: 'way', ref: 12, role: 'outer' }, { type: 'way', ref: 13, role: 'outer' },
          ],
          tags: flaechenTags,
        },
      ],
    });

  it('macht Gleis 1 und 1a wieder zu einem Bahnsteig (Frankfurt, Relation 21494088 Version 3)', () => {
    const graph = frankfurt({ type: 'multipolygon', public_transport: 'platform', ref: '1;1a', area: 'yes' });
    expect(graph.gleise).toEqual(expect.arrayContaining(['1', '1a']));
    expect(istGleicherBahnsteig(graph, '1', '1a')).toBe(true);
  });

  it('behandelt sie wie dieselbe Flaeche mit railway=platform', () => {
    const vorher = frankfurt({ type: 'multipolygon', railway: 'platform', public_transport: 'platform', ref: '1;1a', level: '0' });
    const nachher = frankfurt({ type: 'multipolygon', public_transport: 'platform', ref: '1;1a' });
    expect(nachher.gleise).toEqual(vorher.gleise);
    expect(istGleicherBahnsteig(nachher, '1', '1a')).toBe(istGleicherBahnsteig(vorher, '1', '1a'));
  });
});
