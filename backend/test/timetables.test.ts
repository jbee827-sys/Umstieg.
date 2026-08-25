import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { holeTafel } from '../src/clients/timetables.js';
import { holeWagenposition } from '../src/clients/wagenreihung.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';

function ladeFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/db/${name}`, import.meta.url)), 'utf8');
}

/** fetch-Mock: /plan/ → Soll-Tafel, /fchg/ → Änderungen. */
function tafelFetchMock(): typeof fetch {
  return vi.fn(async (eingabe: RequestInfo | URL) => {
    const url = String(eingabe);
    const body = url.includes('/plan/') ? ladeFixture('tafel-plan.xml') : ladeFixture('tafel-fchg.xml');
    return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });
  }) as unknown as typeof fetch;
}

describe('holeTafel', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('führt Soll und Änderungen zusammen: Gleiswechsel und Verspätung erkannt', async () => {
    const tafel = await holeTafel('8011160', 'dep', tafelFetchMock());
    const ice = tafel.find((e) => e.zug === 'ICE 1006');
    expect(ice).toBeDefined();
    expect(ice!.zeitSoll).toBe('14:26');
    expect(ice!.zeitIst).toBe('14:35');
    expect(ice!.gleisSoll).toBe('14');
    expect(ice!.gleisIst).toBe('12');
    expect(ice!.ziel).toBe('Hamburg-Altona');
  });

  it('ohne Änderung bleiben zeitIst/gleisIst leer', async () => {
    const tafel = await holeTafel('8011160', 'dep', tafelFetchMock());
    const rb = tafel.find((e) => e.zug === 'RB 23');
    expect(rb).toBeDefined();
    expect(rb!.zeitIst).toBeUndefined();
    expect(rb!.gleisIst).toBeUndefined();
    expect(rb!.ziel).toBe('Golm');
  });

  it('Ankunftstafel: Züge mit Ankunft, Herkunft als ziel-Feld', async () => {
    const tafel = await holeTafel('8011160', 'arr', tafelFetchMock());
    const re = tafel.find((e) => e.zug === 'RE 3');
    expect(re).toBeDefined();
    expect(re!.zeitSoll).toBe('14:22');
    expect(re!.gleisSoll).toBe('6');
    expect(re!.ziel).toBe('Stralsund Hbf'); // bei Ankunft: Startbahnhof
    // RB 23 hat keine Ankunft an diesem Bahnhof → nicht in der Ankunftstafel
    expect(tafel.some((e) => e.zug === 'RB 23')).toBe(false);
  });

  it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    await expect(holeTafel('8011160', 'dep', tafelFetchMock())).rejects.toBeInstanceOf(
      FehlendeZugangsdatenError,
    );
  });
});

describe('holeWagenposition', () => {
  it('liefert den Abschnitt des gesuchten Wagens', async () => {
    const mock = (async () =>
      new Response(ladeFixture('wagenreihung-ice1006.json'), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    expect(await holeWagenposition('1006', '20260825', '26', mock)).toEqual({ abschnitt: 'C' });
  });

  it('Wagen nicht in der Formation → null', async () => {
    const mock = (async () =>
      new Response(ladeFixture('wagenreihung-ice1006.json'), { status: 200 })) as unknown as typeof fetch;
    expect(await holeWagenposition('1006', '20260825', '99', mock)).toBeNull();
  });

  it('keine Daten (404) → null, kein Fehler', async () => {
    const mock = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    expect(await holeWagenposition('1006', '20260825', '26', mock)).toBeNull();
  });

  it('Netzfehler → null (normaler Fall laut Konzept)', async () => {
    const mock = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await holeWagenposition('1006', '20260825', '26', mock)).toBeNull();
  });
});
