import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { abstandM, orteAusTreffern, verkehrsmittelListe } from '../src/clients/motis-abbildung.js';
import type { MotisMatch } from '../src/clients/motis-typen.js';
import { namensSchluessel } from '../src/core/orte.js';

const treffer = (name: string): MotisMatch[] =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${name}.json`, import.meta.url)), 'utf8'));

describe('orteAusTreffern', () => {
  it('Berlin Hbf: Bahnhof zuerst, mit allen Verkehrsmitteln; Wien und Linz fallen weg', () => {
    const orte = orteAusTreffern(treffer('geocode-berlin-hbf'));
    expect(orte[0]).toEqual({
      name: 'Berlin Hauptbahnhof',
      lat: expect.any(Number),
      lon: expect.any(Number),
      haltestelleId: 'at-Railway-Current-Reference-Data-2026_de:11000:900003200:1:51',
      verkehrsmittel: ['bahn', 'sbahn', 'ubahn', 'tram', 'bus'],
    });
    const namen = orte.map((o) => o.name);
    expect(namen).not.toContain('Wien Hauptbahnhof');
    expect(namen).not.toContain('Linz Hauptbahnhof');
    expect(orte[0].eva).toBeUndefined();
  });

  it('Hamburg: fremde Laender fallen weg (New Hamburg, Hamburg Way)', () => {
    const namen = orteAusTreffern(treffer('geocode-hamburg-zob')).map((o) => o.name);
    expect(namen).not.toContain('New Hamburg');
    expect(namen).not.toContain('Hamburg Way');
    expect(namen).not.toContain('Hamburg Street');
    expect(namen).toContain('Hamburg Dammtor');
  });

  it('Stuttgart: Mitfahrbank und Eintraege ohne Linienverkehr fallen weg', () => {
    const namen = orteAusTreffern(treffer('geocode-stuttgart-charlottenplatz')).map((o) => o.name);
    expect(namen).toContain('Charlottenplatz');
    expect(namen).not.toContain('Stuttgart, Charlottenplatz');
    expect(namen).not.toContain('Stuttgart, P+R');
    expect(namen).not.toContain('Esslingen am Neckar, Charlottenplatz');
  });

  it('Wiesenburg: zwei Orte gleichen Namens bleiben zwei (Mark und Sachsen, 160 km)', () => {
    const bahnhoefe = orteAusTreffern(treffer('geocode-wiesenburg')).filter((o) => o.name === 'Wiesenburg, Bahnhof');
    expect(bahnhoefe).toHaveLength(2);
    expect(abstandM(bahnhoefe[0], bahnhoefe[1])).toBeGreaterThan(100_000);
  });

  it('derselbe Halt aus zwei Quellen erscheint einmal, der erste gewinnt', () => {
    const delfi: MotisMatch = { type: 'STOP', name: 'Leipzig, Hauptbahnhof', id: 'de-DELFI_x', lat: 51.34547, lon: 12.38206, country: 'DE', modes: ['REGIONAL_RAIL', 'TRAM'] };
    const zweite: MotisMatch = { ...delfi, name: 'Leipzig Hbf', id: 'nl-OpenOV_y', lat: 51.34655, lon: 12.38309, modes: ['REGIONAL_RAIL'] };
    const orte = orteAusTreffern([delfi, zweite]);
    expect(orte.map((o) => o.haltestelleId)).toEqual(['de-DELFI_x']);
  });

  it('ein anderer Name am selben Ort ist ein anderer Halt', () => {
    const namen = orteAusTreffern(treffer('geocode-wiesenburg')).map((o) => o.name);
    expect(namen).toContain('Wiesenburg, Bahnhof/B107');
  });

  it('Kassel: Rathaus mit S-Bahn und Tram', () => {
    expect(orteAusTreffern(treffer('geocode-kassel-rathaus'))[0]).toMatchObject({
      name: 'Kassel Rathaus',
      verkehrsmittel: ['sbahn', 'tram'],
    });
  });

  it('nur Haltestellen, keine Adressen', () => {
    const adresse: MotisMatch = { type: 'ADDRESS', name: 'Hauptstraße 1', id: 'a', lat: 52, lon: 13, country: 'DE', modes: ['BUS'] };
    expect(orteAusTreffern([adresse])).toEqual([]);
  });

  it('leere oder kaputte Eingabe ergibt eine leere Liste', () => {
    expect(orteAusTreffern([])).toEqual([]);
    expect(orteAusTreffern(undefined as unknown as MotisMatch[])).toEqual([]);
    expect(orteAusTreffern({} as unknown as MotisMatch[])).toEqual([]);
  });
});

describe('verkehrsmittelListe', () => {
  it('eindeutig und in fester Reihenfolge, Unbekanntes und Mitfahren fallen weg', () => {
    expect(verkehrsmittelListe(['BUS', 'TRAM', 'BUS', 'RIDE_SHARING', 'HIGHSPEED_RAIL', 'REGIONAL_RAIL'])).toEqual(['bahn', 'tram', 'bus']);
    expect(verkehrsmittelListe(undefined)).toEqual([]);
  });
});

describe('abstandM', () => {
  it('Kassel Rathaus A zu B rund 100 m', () => {
    const m = abstandM({ lat: 51.31263, lon: 9.49286 }, { lat: 51.31214, lon: 9.4919 });
    expect(m).toBeGreaterThan(70);
    expect(m).toBeLessThan(120);
  });
});

describe('namensSchluessel', () => {
  it.each([
    ['Berlin Hauptbahnhof', 'berlin hbf'],
    ['S+U Berlin Hauptbahnhof', 'berlin hbf'],
    ['Berlin Hbf', 'berlin hbf'],
    ['Leipzig, Hauptbahnhof', 'leipzig hbf'],
    ['München Hbf', 'muenchen hbf'],
    ['S+U Alexanderplatz Bhf (Berlin)', 'alexanderplatz'],
    ['Frankfurt (Main) Hbf', 'frankfurt hbf'],
    ['Wiesenburg, Bahnhof', 'wiesenburg'],
    ['Straße der Einheit', 'strasse der einheit'],
  ])('%s -> %s', (roh, schluessel) => expect(namensSchluessel(roh)).toBe(schluessel));
});
