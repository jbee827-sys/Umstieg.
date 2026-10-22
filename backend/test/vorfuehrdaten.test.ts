import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zeichneAuf } from '../scripts/vorfuehrdaten.js';
import type { OverpassAntwort } from '../src/core/typen.js';

function osm(fixture: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${fixture}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

/**
 * Einführungstour (Plan Paket 1): Die Antworten von /api/route für die
 * Beispielreise, offline aus dem Startbestand - dieselben Bausteine wie die
 * Route selbst. Jede Kombination, die die App abfragt, liegt vor; was das
 * Backend mit 404 beantworten würde, steht als solche Antwort darin.
 */
describe('zeichneAuf', () => {
  const daten = zeichneAuf(osm('synthetisch/mini-bahnhof'), '1', '2');

  it('legt alle drei Varianten an allen drei Standorten ab', () => {
    expect(Object.keys(daten).sort()).toEqual([
      'barrierefrei|anfang',
      'barrierefrei|ende',
      'barrierefrei|mitte',
      'mit-stopp|anfang',
      'mit-stopp|ende',
      'mit-stopp|mitte',
      'schnellste|anfang',
      'schnellste|ende',
      'schnellste|mitte',
    ]);
  });

  it('traegt die Felder, die /api/route liefert', () => {
    const route = daten['schnellste|mitte'];
    expect(route.status).toBe(200);
    if (route.status !== 200) return;
    expect(route.antwort).toMatchObject({ stufe: expect.any(Number), gehzeitSek: expect.any(Number) });
    expect(route.antwort.schritte.length).toBeGreaterThan(0);
    expect(route.antwort.schema).toBeDefined();
    expect(route.antwort.karte).toBeDefined();
    expect(Array.isArray(route.antwort.hinweise)).toBe(true);
  });

  it('haelt eine Variante ohne Weg als 404 fest, mit dem Text des Backends', () => {
    // Der Mini-Bahnhof hat weder WC noch Kiosk.
    expect(daten['mit-stopp|mitte']).toEqual({
      status: 404,
      antwort: {
        fehler: 'keine-route',
        detail: 'Kein WC und kein Kiosk auf dem Weg gefunden.',
        hinweise: [],
      },
    });
  });
});
