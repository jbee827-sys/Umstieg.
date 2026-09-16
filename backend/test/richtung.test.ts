import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baueGraph } from '../src/core/graph.js';
import { himmelsrichtungen, nachNordwesten } from '../src/core/richtung.js';
import { berechneRoute } from '../src/core/routing.js';
import { baueBahnhofSchema } from '../src/core/schema.js';
import type { OsmElement, OverpassAntwort } from '../src/core/typen.js';

/**
 * Was „Anfang" am Bahnsteig heisst (ToDo 31, entschieden am 15.09.2026).
 *
 * Bis dahin war der Anfang das Ende, das in OSM zufaellig zuerst gezeichnet
 * wurde - an zwei Nachbarbahnsteigen konnte er an entgegengesetzten Enden
 * liegen, und kein Knopf konnte sagen, welches Ende gemeint ist. Jetzt gilt
 * EINE Regel fuer alle: Der Anfang ist das Nord- bzw. Westende, fuer alle
 * Bahnsteige einer Ebene gleich ausgerichtet.
 */

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

describe('nachNordwesten – eine Gleisachse bekommt ihre Richtung', () => {
  it('richtet eine Nord-Sued-Achse nach Norden', () => {
    expect(nachNordwesten(0)).toBe(0);
    expect(nachNordwesten(180)).toBe(0);
  });

  it('richtet eine West-Ost-Achse nach Westen', () => {
    expect(nachNordwesten(90)).toBe(270);
    expect(nachNordwesten(270)).toBe(270);
  });

  it('nimmt bei einer schraegen Achse die Seite naeher an Nordwest', () => {
    expect(nachNordwesten(135)).toBe(315);
    expect(nachNordwesten(30)).toBe(30);
    expect(nachNordwesten(120)).toBe(300);
  });

  it('entscheidet den Gleichstand genau auf Nordost-Suedwest nach Norden', () => {
    // 45° und 225° stehen beide 90° von Nordwest ab. Ohne feste Regel waere
    // die Wahl dem Rechenrauschen ueberlassen.
    expect(nachNordwesten(45)).toBe(45);
    expect(nachNordwesten(225)).toBe(45);
  });
});

describe('himmelsrichtungen – was ein Knopf ueber ein Bahnsteigende sagen darf', () => {
  const nord = { lat: 52.001, lon: 13.0 };
  const sued = { lat: 52.0, lon: 13.0 };
  const west = { lat: 52.0, lon: 13.0 };
  const ost = { lat: 52.0, lon: 13.002 };

  it('nennt bei einem Nord-Sued-Bahnsteig Nord und Sued', () => {
    expect(himmelsrichtungen(nord, sued)).toEqual({ von: 'N', bis: 'S' });
    expect(himmelsrichtungen(sued, nord)).toEqual({ von: 'S', bis: 'N' });
  });

  it('nennt bei einem West-Ost-Bahnsteig West und Ost', () => {
    expect(himmelsrichtungen(west, ost)).toEqual({ von: 'W', bis: 'O' });
  });

  it('vergleicht nur die beiden Enden: das noerdlichere ist das Nordende', () => {
    // 30° aus der Nordrichtung: Das obere Ende liegt mehr noerdlich als
    // oestlich - „Nordende" ist wahr, auch wenn der Bahnsteig schraeg liegt.
    const a = { lat: 52.0, lon: 13.0 };
    const b = { lat: 52.0 + 0.001 * Math.cos(Math.PI / 6), lon: 13.0 + 0.00163 * Math.sin(Math.PI / 6) };
    expect(himmelsrichtungen(b, a)).toEqual({ von: 'N', bis: 'S' });
  });
});

/** Ein Bahnsteig als Way zwischen zwei Punkten, in der angegebenen Zeichenrichtung. */
function bahnsteig(
  id: number,
  ref: string,
  von: [number, number],
  nach: [number, number],
  level = '0',
): OsmElement[] {
  return [
    { type: 'node', id: id * 10 + 1, lat: von[0], lon: von[1] },
    { type: 'node', id: id * 10 + 2, lat: nach[0], lon: nach[1] },
    {
      type: 'way',
      id,
      nodes: [id * 10 + 1, id * 10 + 2],
      tags: { railway: 'platform', ref, level },
    },
  ];
}

describe('baueGraph – der Bahnsteiganfang liegt im Norden bzw. Westen', () => {
  it('legt den Anfang ans Nordende, egal in welcher Richtung OSM zeichnet', () => {
    const osm: OverpassAntwort = {
      elements: [
        // Gleis 1 von Sued nach Nord gezeichnet, Gleis 2 von Nord nach Sued.
        ...bahnsteig(201, '1', [52.0, 13.0], [52.002, 13.0]),
        ...bahnsteig(202, '2', [52.002, 13.0003], [52.0, 13.0003]),
      ],
    };
    const graph = baueGraph(osm);
    for (const gleis of ['1', '2']) {
      const anfang = graph.knoten.get(`gleis${gleis}:anfang`)!;
      const ende = graph.knoten.get(`gleis${gleis}:ende`)!;
      expect(anfang.lat).toBeGreaterThan(ende.lat);
    }
  });

  it('legt den Anfang ans Westende eines West-Ost-Bahnsteigs', () => {
    const osm: OverpassAntwort = {
      elements: [...bahnsteig(301, '7', [52.0, 13.003], [52.0, 13.0])],
    };
    const graph = baueGraph(osm);
    expect(graph.knoten.get('gleis7:anfang')!.lon).toBeLessThan(graph.knoten.get('gleis7:ende')!.lon);
  });

  it('richtet alle Bahnsteige einer Ebene gleich aus, auch knapp um Nordost', () => {
    // Zwei fast parallele Bahnsteige, einer knapp links, einer knapp rechts
    // der Nordost-Diagonale (44° und 46°). Je fuer sich entschieden, laege
    // ihr Anfang an entgegengesetzten Enden. Die gemeinsame Achse der Ebene
    // verhindert das.
    const d = 0.001;
    const osm: OverpassAntwort = {
      elements: [
        ...bahnsteig(401, '3', [52.0, 13.0], [52.0 + d * 1.03, 13.0 + d * 1.63]),
        ...bahnsteig(402, '4', [52.0 + d * 0.97, 13.0003 + d * 1.63], [52.0, 13.0003]),
      ],
    };
    const graph = baueGraph(osm);
    const a3 = graph.knoten.get('gleis3:anfang')!;
    const a4 = graph.knoten.get('gleis4:anfang')!;
    const e3 = graph.knoten.get('gleis3:ende')!;
    const e4 = graph.knoten.get('gleis4:ende')!;
    expect(Math.sign(a3.lat - e3.lat)).toBe(Math.sign(a4.lat - e4.lat));
  });
});

describe('baueBahnhofSchema – die Enden tragen ihre Himmelsrichtung', () => {
  // `baueGraph` liefert Stufe 3, bis die Klassifikation laeuft. Berlin ist
  // Stufe 1 - so steht es nach `klassifiziere` im Graphen, wie in `/api/route`.
  const graph = { ...baueGraph(ladeFixture('overpass/berlin-hbf')), stufe: 1 as const };
  const pfad = berechneRoute(graph, 'gleis14:mitte', 'gleis6:mitte', 'schnellste', 'normal')!;

  it('nennt am Ankunftsbahnsteig, wohin sein Anfang zeigt', () => {
    const schema = baueBahnhofSchema(graph, pfad);
    const start = schema.ebenen[0].bahnsteige.find((b) => b.rolle === 'start')!;
    // `von` ist der Anfang. Gleis 14 liegt West-Ost: Anfang im Westen.
    expect(start.himmelsrichtung).toEqual({ von: 'W', bis: 'O' });
    expect(pfad.knoten[0].id).toBe('gleis14:mitte');
    expect(graph.knoten.get('gleis14:anfang')!.lon).toBeLessThan(graph.knoten.get('gleis14:ende')!.lon);
  });

  it('schweigt im Standardmodell – dort waere die Richtung erfunden', () => {
    const schema = baueBahnhofSchema({ ...graph, stufe: 3 }, pfad);
    for (const ebene of schema.ebenen) {
      for (const b of ebene.bahnsteige) expect(b.himmelsrichtung).toBeUndefined();
    }
  });
});
