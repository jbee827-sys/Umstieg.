import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { holeWagenposition } from '../src/clients/wagenreihung.js';

/**
 * Zuvor lagen diese Tests in `timetables.test.ts` – einem anderen Client.
 * Hierher verschoben und am 02.09.2026 um die Unterscheidung erweitert, um
 * die es geht:
 *
 * `null` heisst „die Auskunft steht, sie kennt den Wagen nur nicht": der
 * Normalfall nach Konzept 7, den der Aufrufer mit dem Hinweis auf die
 * Bahnsteigmitte auffaengt. Ein Netzausfall ergab frueher denselben Wert und
 * wurde damit als Normalfall verbucht – der Aufrufer konnte ihn nicht
 * protokollieren, weil er ihn nicht zu sehen bekam.
 *
 * Fuer den Reisenden aendert das nichts: Beide Wege enden in derselben
 * Bahnsteigmitte mit demselben Hinweis (belegt in `protokoll.test.ts`).
 * Nur im Protokoll stehen sie jetzt auseinander.
 */

function ladeFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/db/${name}`, import.meta.url)), 'utf8');
}

/** Antwortet immer mit der aufgezeichneten Formation des ICE 1006. */
function formationMock(): typeof fetch {
  return vi.fn(
    async () =>
      new Response(ladeFixture('wagenreihung-ice1006.json'), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

function statusMock(status: number): typeof fetch {
  return vi.fn(
    async () => new Response('kein Inhalt', { status }),
  ) as unknown as typeof fetch;
}

describe('holeWagenposition', () => {
  it('liefert den Abschnitt des gesuchten Wagens', async () => {
    expect(await holeWagenposition('1006', '20260825', '26', formationMock())).toEqual({
      abschnitt: 'C',
    });
  });

  it('Wagen nicht in der Formation → null', async () => {
    expect(await holeWagenposition('1006', '20260825', '99', formationMock())).toBeNull();
  });

  it('keine Daten (404) → null, kein Fehler', async () => {
    // Die Wagenreihung fuehrt nicht jeden Zug und nicht jeden Tag. Das ist
    // eine Auskunft, kein Ausfall – als Ausfall gezaehlt liefe das Protokoll
    // bei voelliger Betriebsruhe voll.
    expect(await holeWagenposition('1006', '20260825', '26', statusMock(404))).toBeNull();
  });

  it('Netzfehler wirft, statt sich als "keine Daten" auszugeben', async () => {
    // Frueher stand hier `→ null (normaler Fall laut Konzept)`. Das Konzept
    // nennt als Normalfall aber „ohne Daten", nicht „ohne Netz"; der Test
    // hatte beides in einen Topf geworfen. Genau diese Gleichsetzung machte
    // einen Ausfall der Wagenreihung unsichtbar.
    const netzFehler = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(holeWagenposition('1006', '20260825', '26', netzFehler)).rejects.toThrow();
  });

  it('HTTP 503 wirft – eine ausgefallene Quelle ist keine leere Formation', async () => {
    await expect(holeWagenposition('1006', '20260825', '26', statusMock(503))).rejects.toThrow();
  });
});
