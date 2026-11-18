import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sucheBahnhoefeMitGruppen, holeAmtlicheNamen } from '../src/clients/stations.js';

/**
 * Namensquelle fuer die Bahnhofsaufloesung (RIS::Stations).
 * Beide Fixtures sind am 18.11.2026 von der echten API aufgezeichnet,
 * unveraendert.
 */

function ladeFixture(name: string): unknown {
  const pfad = fileURLToPath(new URL(`./fixtures/db/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

function fake(fixture: string): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(ladeFixture(fixture)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('Namensquelle aus RIS::Stations', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('liefert Bahnhoefe mit Gruppe und offiziellen Namen, ohne fremde Nummernraeume', async () => {
    const t = await sucheBahnhoefeMitGruppen('Bernau (S)', fake('by-name-bernau-s'));
    expect(t[0]).toMatchObject({
      eva: '8013470',
      name: 'Bernau(b Berlin)',
      mitglieder: ['8013470', '8089205'],
      namen: ['Bernau(b Berlin)'],
    });
    expect(t.every((x) => /^80\d{5}$/.test(x.eva))).toBe(true);
    // nameLocal 'Bernau' zaehlt nicht
    expect(t.find((x) => x.eva === '8000911')?.namen).toEqual(['Bernau a Chiemsee']);
  });

  it('nennt nameLong und nameShort einer EVA - kein nameLocal, keine Sprechnamen, keine Kuerzel', async () => {
    expect(await holeAmtlicheNamen('8089205', fake('stop-place-8089205'))).toEqual(['Bernau (S)']);
  });
});
