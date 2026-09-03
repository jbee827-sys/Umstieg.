import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

/**
 * Die Suche probiert Schreibvarianten durch.
 *
 * Ein aus der VBB-App uebernommener Name ("S+U Berlin Gesundbrunnen Bhf")
 * liefert bei RIS::Stations nichts. Statt im Client am Namen herumzuschneiden
 * - was jede App anders braeuchte - probiert die Suche selbst die
 * naheliegenden Schreibweisen durch. Das hilft auch jedem, der so etwas von
 * Hand eintippt.
 */
const GESUNDBRUNNEN = {
  name: 'Berlin Gesundbrunnen',
  eva: '8011102',
  lat: 52.549,
  lon: 13.388,
};

function clients(kennt: Record<string, unknown[]>) {
  const sucheBahnhoefe = vi.fn(async (q: string) => kennt[q] ?? []);
  return {
    sucheBahnhoefe,
    clients: {
      overpass: vi.fn(async () => ({ elements: [] })),
      stations: {
        sucheBahnhoefe,
        sucheBahnhoefeNahebei: vi.fn(async () => []),
        holeStationsInfo: vi.fn(async () => ({ eva: '1', evas: ['1'], name: 'X', gleise: [] })),
        ermittleGruppe: vi.fn(async (eva: string) => [eva]),
      },
      tafel: vi.fn(async () => []),
      wagenposition: vi.fn(async () => null),
      fasta: vi.fn(async () => []),
    },
  };
}

describe('GET /api/stations probiert Schreibvarianten', () => {
  it('findet den Bahnhof trotz Vorsilbe und Nachsilbe', async () => {
    const k = clients({ 'Berlin Gesundbrunnen': [GESUNDBRUNNEN] });
    const app = buildApp(k.clients as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/stations?q=' + encodeURIComponent('S+U Berlin Gesundbrunnen Bhf'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([GESUNDBRUNNEN]);
  });

  /**
   * Ein sauberer Name darf KEINEN zweiten Aufruf kosten. Sonst zahlte jede
   * gewoehnliche Suche die Varianten mit - bei einer Tippsuche, die je
   * Eingabe feuert, waere das ein Vielfaches der Quote.
   */
  it('fragt bei einem sauberen Namen genau einmal', async () => {
    const k = clients({ 'Berlin Gesundbrunnen': [GESUNDBRUNNEN] });
    const app = buildApp(k.clients as never);

    await app.inject({ method: 'GET', url: '/api/stations?q=Berlin%20Gesundbrunnen' });

    expect(k.sucheBahnhoefe).toHaveBeenCalledTimes(1);
  });

  it('hoert auf, sobald eine Variante Treffer liefert', async () => {
    const k = clients({ 'Berlin Gesundbrunnen': [GESUNDBRUNNEN] });
    const app = buildApp(k.clients as never);

    await app.inject({
      method: 'GET',
      url: '/api/stations?q=' + encodeURIComponent('S+U Berlin Gesundbrunnen'),
    });

    // Zwei Versuche: der rohe Name, dann der ohne Vorsilbe - danach Schluss.
    expect(k.sucheBahnhoefe).toHaveBeenCalledTimes(2);
  });

  it('liefert eine leere Liste, wenn keine Variante trifft', async () => {
    const k = clients({});
    const app = buildApp(k.clients as never);

    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Gibtsnicht' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  /**
   * Faellt eine Variante mit einem Fehler aus, darf die naechste trotzdem
   * laufen - die DB-API quittiert manche Eingaben mit einem Fehler statt mit
   * einer leeren Liste. Erst wenn KEINE Variante trug, wird der Fehler
   * durchgereicht.
   */
  it('geht ueber eine fehlerhafte Variante hinweg', async () => {
    const sucheBahnhoefe = vi.fn(async (q: string) => {
      if (q === 'S+U Berlin Gesundbrunnen') throw new Error('DB-API: HTTP 400');
      return [GESUNDBRUNNEN];
    });
    const k = clients({});
    k.clients.stations.sucheBahnhoefe = sucheBahnhoefe;
    const app = buildApp(k.clients as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/stations?q=' + encodeURIComponent('S+U Berlin Gesundbrunnen'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([GESUNDBRUNNEN]);
  });

  it('meldet den Fehler, wenn keine einzige Variante durchkam', async () => {
    const k = clients({});
    k.clients.stations.sucheBahnhoefe = vi.fn(async () => {
      throw new Error('DB-API nicht erreichbar');
    });
    const app = buildApp(k.clients as never);

    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Berlin' });
    expect(res.statusCode).toBe(500);
  });
});
