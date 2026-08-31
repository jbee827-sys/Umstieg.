import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { LISTEN_HOST } from '../src/server-host.js';
import type { FastifyInstance } from 'fastify';

/**
 * Der Fly-Proxy erreicht die Maschine ueber ihre PRIVATE IPv6-Adresse
 * (`fdaa:...`). Band der Server auf `0.0.0.0`, lauschte er nur auf IPv4 -
 * die App lief, war gesund, und der Proxy kam trotzdem nicht heran. Nach
 * aussen sah das aus, als wuerde die Bahnhofssuche nichts vorschlagen; in
 * Wahrheit lief kein einziger Aufruf durch.
 *
 * Am 31.08.2026 in Produktion gemessen:
 *   http://127.0.0.1:3001/api/health                  -> {"status":"ok"}
 *   http://[fdaa:be:db0f:a7b:1c0:f24d:ac5a:2]:3001/.. -> Connection refused
 *
 * Fly meldete das als `[PU03] unreachable worker host` - eine Folgemeldung,
 * weil der Proxy keinen erreichbaren Kandidaten fand.
 */
describe('Der Server ist ueber IPv6 erreichbar', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('nimmt Verbindungen auf der IPv6-Loopback an', async () => {
    app = buildApp();
    await app.listen({ port: 0, host: LISTEN_HOST });
    const adresse = app.server.address();
    if (!adresse || typeof adresse === 'string') throw new Error('keine Adresse');

    // Genau der Pfad, den der Fly-Proxy nimmt. Mit `0.0.0.0` schlaegt das
    // mit ECONNREFUSED fehl.
    const antwort = await fetch(`http://[::1]:${adresse.port}/api/health`);
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ status: 'ok' });
  });

  it('bleibt dabei ueber IPv4 erreichbar', async () => {
    // Doppelstapel: `::` nimmt auch IPv4-Verbindungen an (IPv4-mapped).
    // Gesundheitspruefungen und lokale Aufrufe gehen weiter ueber 127.0.0.1.
    app = buildApp();
    await app.listen({ port: 0, host: LISTEN_HOST });
    const adresse = app.server.address();
    if (!adresse || typeof adresse === 'string') throw new Error('keine Adresse');

    const antwort = await fetch(`http://127.0.0.1:${adresse.port}/api/health`);
    expect(antwort.status).toBe(200);
  });
});
