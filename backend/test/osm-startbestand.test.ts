import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entpackeEintrag } from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';

const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
const dateien = (() => {
  try {
    return readdirSync(BESTAND).filter((n) => n.endsWith('.json.gz'));
  } catch {
    return [];
  }
})();

// 382 Dateien entpacken: allein gut 1 s, in der vollen, parallelen Suite auf
// einem knappen Rechner ueber 5 s (14.10.2026).
const ENTPACKEN_MS = 30_000;

describe('Startbestand im Repo', () => {
  it('hat mindestens 350 Bahnhoefe', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(350);
  });

  it('bleibt unter 15 MB', () => {
    const summe = dateien.reduce((s, n) => s + statSync(join(BESTAND, n)).size, 0);
    expect(summe).toBeLessThan(15 * 1024 * 1024);
  });

  it('ist durchweg in der aktuellen Abfrageversion und heisst wie sein Schluessel', async () => {
    for (const n of dateien) {
      const e = await entpackeEintrag(readFileSync(join(BESTAND, n)));
      expect(e.abfrageVersion, n).toBe(ABFRAGE_VERSION);
      expect(`${e.schluessel}.json.gz`).toBe(n);
    }
  }, ENTPACKEN_MS);

  it('enthaelt die Metropolen', async () => {
    const namen = new Set<string>();
    for (const n of dateien) namen.add((await entpackeEintrag(readFileSync(join(BESTAND, n)))).name);
    for (const muster of [/^Berlin Hbf$/, /^Hamburg Hbf$/, /^Frankfurt ?\(Main\) ?Hbf$/, /^München Hbf$/, /^Köln Hbf$/]) {
      expect([...namen].some((n) => muster.test(n)), String(muster)).toBe(true);
    }
  }, ENTPACKEN_MS);
});
