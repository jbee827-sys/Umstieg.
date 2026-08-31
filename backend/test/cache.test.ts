import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { graphTtlMs, GRAPH_TTL_MS } from '../src/cache/lru.js';
import type { OverpassAntwort } from '../src/core/typen.js';

/**
 * Der Graph-Cache vergiftete sich selbst: Ein Overpass-Ausfall erzeugt einen
 * Stufe-3-Graphen (Standardmodell, „ca."-Angaben), und der wurde genauso
 * 24 Stunden gehalten wie ein guter. Der Bahnhof blieb einen Tag degradiert,
 * lange nach der Erholung. Am 29.08.2026 beobachtet: 19:00 Uhr Stufe 3, nach
 * einem Neustart mit leerem Cache sofort wieder Stufe 1.
 */
describe('Cache-Frist nach Datenqualitaet', () => {
  it('haelt einen brauchbaren Graphen die vollen 24 Stunden', () => {
    expect(graphTtlMs(1)).toBe(GRAPH_TTL_MS);
    expect(graphTtlMs(2)).toBe(GRAPH_TTL_MS);
  });

  it('haelt einen Notbehelf nur wenige Minuten', () => {
    expect(graphTtlMs(3)).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(graphTtlMs(3)).toBeGreaterThan(0);
  });
});

const miniOsm = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)),
    'utf8',
  ),
) as OverpassAntwort;

const ROUTE_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function clientsMitOverpass(overpass: () => Promise<OverpassAntwort>) {
  return {
    overpass: vi.fn(overpass),
    stations: {
      holeStationsInfo: vi.fn(async (eva: string) => ({
        eva,
        evas: [eva],
        name: 'Ministadt',
        lat: 52.0,
        lon: 12.0,
        gleise: [{ gleis: '1' }, { gleis: '2' }],
      })),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

describe('Ein degradierter Graph blockiert den Bahnhof nicht den ganzen Tag', () => {
  // Echte Zeit, keine nachgebaute Uhr: lru-cache haelt eine Referenz auf das
  // urspruengliche performance-Objekt und sieht Fake-Timer nicht. Die Frist
  // wird deshalb fuer den Test auf wenige Millisekunden gestellt.
  const KURZ_MS = 60;
  const warte = (ms: number) => new Promise((f) => setTimeout(f, ms));

  afterEach(() => vi.unstubAllEnvs());

  it('fragt Overpass nach Ablauf der kurzen Frist erneut', async () => {
    vi.stubEnv('GRAPH_NOTBEHELF_TTL_MS', String(KURZ_MS));
    const clients = clientsMitOverpass(async () => {
      throw new Error('Overpass nicht erreichbar (Test)');
    });
    const app = buildApp(clients as never);

    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.overpass).toHaveBeenCalledTimes(1);

    await warte(KURZ_MS * 2);
    await app.inject({ method: 'GET', url: ROUTE_URL });

    // Ohne qualitaetsabhaengige Frist bliebe es bei einem Aufruf - und der
    // Bahnhof bei Stufe 3, bis der Tag um ist.
    expect(clients.overpass).toHaveBeenCalledTimes(2);
  });

  it('erholt sich zu Stufe 1, sobald Overpass wieder antwortet', async () => {
    vi.stubEnv('GRAPH_NOTBEHELF_TTL_MS', String(KURZ_MS));
    let kaputt = true;
    const clients = clientsMitOverpass(async () => {
      if (kaputt) throw new Error('Overpass nicht erreichbar (Test)');
      return miniOsm;
    });
    const app = buildApp(clients as never);

    expect((await app.inject({ method: 'GET', url: ROUTE_URL })).json().stufe).toBe(3);

    kaputt = false;
    await warte(KURZ_MS * 2);
    expect((await app.inject({ method: 'GET', url: ROUTE_URL })).json().stufe).toBe(1);
  });

  it('haelt einen guten Graphen dagegen fest', async () => {
    vi.stubEnv('GRAPH_NOTBEHELF_TTL_MS', String(KURZ_MS));
    const clients = clientsMitOverpass(async () => miniOsm);
    const app = buildApp(clients as never);

    await app.inject({ method: 'GET', url: ROUTE_URL });
    await warte(KURZ_MS * 2);
    await app.inject({ method: 'GET', url: ROUTE_URL });

    // Stufe 1 faellt nicht unter die kurze Frist - sie gilt nur dem Notbehelf.
    expect(clients.overpass).toHaveBeenCalledTimes(1);
  });
});
