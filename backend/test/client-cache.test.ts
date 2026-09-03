import { describe, expect, it, vi } from 'vitest';
import { mitCache } from '../src/cache/clients.js';

/**
 * Jede Anfrage an die DB-APIs kostet Quote. Bisher war nur der
 * Overpass-Graph zwischengespeichert; Bahnhofssuche, Tafel, Gruppe und
 * FaSta gingen bei JEDEM Aufruf hinaus.
 *
 * Zwei Dinge muss dieser Baustein koennen, und das zweite ist das
 * wichtigere: wiederholte Aufrufe sparen (Cache) und GLEICHZEITIGE Aufrufe
 * buendeln. Der Angriff, gegen den das hier steht, besteht nicht aus
 * langsamen Wiederholungen, sondern aus einem Schwall auf einmal - und der
 * laeuft an einem reinen Cache vorbei, weil beim Eintreffen noch nichts
 * darin steht.
 */
describe('mitCache', () => {
  it('ruft die Quelle beim zweiten Mal nicht erneut auf', async () => {
    const quelle = vi.fn(async (x: string) => `wert:${x}`);
    const gecacht = mitCache(quelle, (x) => x, 60_000, 100);

    expect(await gecacht('a')).toBe('wert:a');
    expect(await gecacht('a')).toBe('wert:a');
    expect(quelle).toHaveBeenCalledTimes(1);
  });

  it('unterscheidet verschiedene Schluessel', async () => {
    const quelle = vi.fn(async (x: string) => `wert:${x}`);
    const gecacht = mitCache(quelle, (x) => x, 60_000, 100);

    await gecacht('a');
    await gecacht('b');
    expect(quelle).toHaveBeenCalledTimes(2);
  });

  it('bildet den Schluessel aus allen Argumenten', async () => {
    const quelle = vi.fn(async (eva: string, typ: string) => [`${eva}/${typ}`]);
    const gecacht = mitCache(quelle, (eva, typ) => `${eva}|${typ}`, 60_000, 100);

    await gecacht('8011160', 'arr');
    await gecacht('8011160', 'dep');
    expect(quelle).toHaveBeenCalledTimes(2);
  });

  it('fragt nach Ablauf der Frist erneut', async () => {
    const quelle = vi.fn(async (x: string) => `wert:${x}`);
    const gecacht = mitCache(quelle, (x) => x, 30, 100);

    await gecacht('a');
    await new Promise((f) => setTimeout(f, 60));
    await gecacht('a');
    expect(quelle).toHaveBeenCalledTimes(2);
  });

  // Der eigentliche Schutz gegen einen Schwall.
  it('buendelt gleichzeitige Aufrufe zu einem einzigen', async () => {
    let aufloesen: (w: string) => void = () => {};
    const quelle = vi.fn(
      () =>
        new Promise<string>((f) => {
          aufloesen = f;
        }),
    );
    const gecacht = mitCache(quelle, () => 'fest', 60_000, 100);

    const alle = Promise.all([gecacht(), gecacht(), gecacht(), gecacht()]);
    aufloesen('einmal');

    expect(await alle).toEqual(['einmal', 'einmal', 'einmal', 'einmal']);
    expect(quelle).toHaveBeenCalledTimes(1);
  });

  /**
   * Ein Fehler darf NICHT in den Cache.
   *
   * Sonst haelt ein einzelner Ausfall der Quelle den Bahnhof fuer die volle
   * Frist kaputt - lange, nachdem sich die Quelle erholt hat. Genau diese
   * Falle ist in diesem Projekt schon einmal zugeschnappt, damals bei der
   * Graphfrist (siehe `NOTBEHELF_TTL_MS`).
   */
  it('speichert einen Fehler nicht zwischen', async () => {
    const quelle = vi.fn(async () => {
      throw new Error('Quelle weg');
    });
    const gecacht = mitCache(quelle, () => 'fest', 60_000, 100);

    await expect(gecacht()).rejects.toThrow('Quelle weg');
    await expect(gecacht()).rejects.toThrow('Quelle weg');
    expect(quelle).toHaveBeenCalledTimes(2);
  });

  it('liefert nach einem Fehler wieder aus, sobald die Quelle antwortet', async () => {
    let kaputt = true;
    const quelle = vi.fn(async () => {
      if (kaputt) throw new Error('Quelle weg');
      return 'wieder da';
    });
    const gecacht = mitCache(quelle, () => 'fest', 60_000, 100);

    await expect(gecacht()).rejects.toThrow();
    kaputt = false;
    expect(await gecacht()).toBe('wieder da');
  });

  // Auch der gebuendelte Fehlerfall darf nichts festhalten.
  it('gibt die Buendelung nach einem Fehler wieder frei', async () => {
    let kaputt = true;
    const quelle = vi.fn(async () => {
      if (kaputt) throw new Error('Quelle weg');
      return 'wieder da';
    });
    const gecacht = mitCache(quelle, () => 'fest', 60_000, 100);

    await Promise.allSettled([gecacht(), gecacht()]);
    kaputt = false;
    expect(await gecacht()).toBe('wieder da');
  });
});
