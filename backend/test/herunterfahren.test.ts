import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { Ueberwachung } from '../src/core/ueberwachung.js';
import { registriereHerunterfahren } from '../src/herunterfahren.js';

/**
 * Ein Deploy auf Fly beendet die alte Maschine mit SIGINT und wartet 5 s.
 * Bis zum 18.10.2026 hatte der Server keinen Handler: Der Prozess starb
 * sofort, `onClose` lief nie - und mit ihm verschwand die angebrochene
 * Stunde des MOTIS-Zaehlers (K7-Nachweis gegenueber Transitous).
 */
describe('Herunterfahren', () => {
  it('app.close() beendet offene Live-Stroeme, statt auf sie zu warten', async () => {
    const app = buildApp({ ueberwachung: new Ueberwachung(async () => [], 30_000) });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const antwort = await fetch(`http://127.0.0.1:${port}/api/live/8011160`);
    expect(antwort.status).toBe(200);
    const leser = antwort.body!.getReader();
    await leser.read(); // ": verbunden"

    const zu = app.close();
    const ergebnis = await Promise.race([
      zu.then(() => 'geschlossen'),
      new Promise((r) => setTimeout(() => r('haengt'), 2000)),
    ]);
    expect(ergebnis).toBe('geschlossen');
    // Der Strom ist zu Ende - der Browser verbindet sich neu, mit der neuen Maschine.
    let fertig = false;
    for (let i = 0; i < 5 && !fertig; i++) fertig = (await leser.read()).done;
    expect(fertig).toBe(true);
  });

  it('ein Signal schliesst die App und beendet danach den Prozess', async () => {
    const prozess = new EventEmitter();
    const beende = vi.fn();
    const app = { close: vi.fn(async () => {}) };
    registriereHerunterfahren(app, { prozess, beende, notausMs: 1000, log: () => {} });
    prozess.emit('SIGINT');
    await vi.waitFor(() => expect(beende).toHaveBeenCalledWith(0));
    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('haengt das Schliessen, beendet der Notaus trotzdem', async () => {
    vi.useFakeTimers();
    try {
      const prozess = new EventEmitter();
      const beende = vi.fn();
      const app = { close: vi.fn(() => new Promise<void>(() => {})) };
      registriereHerunterfahren(app, { prozess, beende, notausMs: 4000, log: () => {} });
      prozess.emit('SIGTERM');
      expect(beende).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(4000);
      expect(beende).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ein zweites Signal startet kein zweites Schliessen', async () => {
    const prozess = new EventEmitter();
    const app = { close: vi.fn(() => new Promise<void>(() => {})) };
    registriereHerunterfahren(app, { prozess, beende: vi.fn(), notausMs: 60_000, log: () => {} });
    prozess.emit('SIGINT');
    prozess.emit('SIGTERM');
    expect(app.close).toHaveBeenCalledTimes(1);
  });
});
