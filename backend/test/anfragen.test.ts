import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

/**
 * Anfragepruefung vom 15.09.2026 (`scripts/anfragen-pruefung.ts`): 3443
 * Anfragen, ein Serverfehler. `?q=Berlin&q=Hamburg` machte aus `q` eine
 * Liste, und `q.trim()` warf - ein 500er auf eine Eingabe, die nur doppelt
 * war. Dieselbe Falle stand bei `lat`/`lon` (`latRoh.trim()`).
 *
 * Die Regel gilt deshalb fuer ALLE Routen an einer Stelle: Ein Parameter,
 * der mehrfach kommt, ist ungueltig. Keine Route hat einen Grund, eine Liste
 * anzunehmen, und jede nimmt stillschweigend an, einen Text zu bekommen.
 */
function app() {
  return buildApp(
    {
      stations: {
        sucheBahnhoefe: async () => [],
        sucheBahnhoefeNahebei: async () => [],
        holeStationsInfo: async () => {
          throw new Error('darf nicht gefragt werden');
        },
        ermittleGruppe: async () => [],
      },
      overpass: async () => {
        throw new Error('darf nicht gefragt werden');
      },
      tafel: async () => [],
    },
    { logger: false },
  );
}

describe('Doppelte Parameter', () => {
  it.each([
    '/api/stations?q=Berlin&q=Hamburg',
    '/api/stations?lat=52.5&lat=52.6&lon=13.4',
    '/api/route?eva=8000001&gleisAn=1&gleisAn=2&gleisAb=2',
    '/api/board/8000001?type=dep&type=arr',
    '/api/live/8000001?zugAn=ICE%201&zugAn=ICE%202',
  ])('%s → 400 statt 500', async (url) => {
    const res = await app().inject({ url });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ fehler: 'parameter-ungueltig' });
  });

  it('laesst einfache Parameter durch', async () => {
    const res = await app().inject({ url: '/api/stations?q=Berlin' });
    expect(res.statusCode).toBe(200);
  });
});

describe('Unbekannte Pfade', () => {
  // Jede andere Fehlerantwort der App traegt `fehler`. Fastifys Standardtext
  // („Route GET:/api/gibtsnicht not found") war die einzige Ausnahme.
  it('antworten im Format der App', async () => {
    const res = await app().inject({ url: '/api/gibtsnicht' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ fehler: 'nicht-gefunden' });
  });

  it('auch bei einer Methode, die es nicht gibt', async () => {
    const res = await app().inject({ method: 'POST', url: '/api/route' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ fehler: 'nicht-gefunden' });
  });
});
