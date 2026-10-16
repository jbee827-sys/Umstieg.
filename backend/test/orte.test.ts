import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { orteAusTreffern } from '../src/clients/motis-abbildung.js';
import { bahnhofAlsOrt, fuehreOrteZusammen } from '../src/core/orte.js';
import type { Ort } from '../src/core/typen.js';

const motis = (n: string) =>
  orteAusTreffern(JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${n}.json`, import.meta.url)), 'utf8')));
const BERLIN_HBF = { name: 'Berlin Hbf', eva: '8011160', lat: 52.525592, lon: 13.369545 };

describe('fuehreOrteZusammen', () => {
  it('Hauptbahnhof traegt EVA und Haltestellen-ID, Bushaltestelle nur die ID (Paket 2.1)', () => {
    const orte = fuehreOrteZusammen([BERLIN_HBF], motis('geocode-berlin-hbf'));
    expect(orte[0]).toMatchObject({
      name: 'Berlin Hbf',
      eva: '8011160',
      haltestelleId: expect.stringContaining('900003200'),
      verkehrsmittel: ['bahn', 'sbahn', 'ubahn', 'tram', 'bus'],
    });
    const bus = orte.find((o) => o.name.startsWith('S+U Hauptbahnhof/Washingtonplatz'))!;
    expect(bus.eva).toBeUndefined();
    expect(bus.verkehrsmittel).toEqual(['bus']);
    // Die zugeordnete Haltestelle erscheint nicht ein zweites Mal.
    expect(orte.filter((o) => o.haltestelleId === orte[0].haltestelleId)).toHaveLength(1);
  });

  it('Bahnhof ohne passende Haltestelle bleibt Bahnhof', () => {
    expect(fuehreOrteZusammen([BERLIN_HBF], [])).toEqual([bahnhofAlsOrt(BERLIN_HBF)]);
    expect(bahnhofAlsOrt(BERLIN_HBF)).toEqual({ ...BERLIN_HBF, verkehrsmittel: ['bahn'] });
  });

  it('ordnet nach Lage zu: Koeln Hbf erhaelt die Koelner Haltestelle, Berliner Halte bleiben ohne EVA', () => {
    const orte = fuehreOrteZusammen([{ name: 'Köln Hbf', eva: '8000207', lat: 50.943, lon: 6.959 }], motis('geocode-berlin-hbf'));
    expect(orte.filter((o) => o.eva === '8000207')).toHaveLength(1);
    expect(orte.find((o) => o.eva === '8000207')!.haltestelleId).toBeDefined();
    expect(orte.filter((o) => o.name.includes('Berlin') && o.eva)).toHaveLength(0);
  });

  it('Bushaltestelle direkt am Bahnhof wird nicht zum Bahnhof (kein Bahnverkehr)', () => {
    const bus: Ort = { name: 'Berlin Hbf', lat: 52.5256, lon: 13.3696, verkehrsmittel: ['bus'], haltestelleId: 'x' };
    const orte = fuehreOrteZusammen([BERLIN_HBF], [bus]);
    expect(orte.find((o) => o.haltestelleId === 'x')!.eva).toBeUndefined();
  });

  it('anderer Name in der Naehe wird nicht zugeordnet', () => {
    const nachbar: Ort = { name: 'Berlin Friedrichstraße', lat: 52.5256, lon: 13.3696, verkehrsmittel: ['bahn'], haltestelleId: 'y' };
    const orte = fuehreOrteZusammen([BERLIN_HBF], [nachbar]);
    expect(orte.find((o) => o.eva === '8011160')!.haltestelleId).toBeUndefined();
  });

  it('kappt auf max', () => {
    expect(fuehreOrteZusammen([BERLIN_HBF], motis('geocode-berlin-hbf'), 3)).toHaveLength(3);
  });
});
