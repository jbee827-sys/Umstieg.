import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { Ueberwachung } from '../src/core/ueberwachung.js';

// CORS_ORIGIN wird in buildApp() gelesen, deshalb je Fall neu setzen und
// hinterher aufraeumen – sonst faerbt der Fall auf andere Tests ab.
const urspruenglich = process.env.CORS_ORIGIN;

afterEach(() => {
  if (urspruenglich === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = urspruenglich;
});

describe('CORS', () => {
  it('ohne CORS_ORIGIN werden keine CORS-Header gesendet', async () => {
    delete process.env.CORS_ORIGIN;
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://fremde-seite.example' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('erlaubte Herkunft bekommt den passenden Header', async () => {
    process.env.CORS_ORIGIN = 'https://umstieg.vercel.app';
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://umstieg.vercel.app' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://umstieg.vercel.app');
  });

  it('fremde Herkunft bekommt keinen Freigabe-Header', async () => {
    process.env.CORS_ORIGIN = 'https://umstieg.vercel.app';
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://angreifer.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // Der SSE-Strom braucht eine eigene Pruefung: Er ruft `reply.hijack()` und
  // schreibt seine Header selbst auf den Socket. Was @fastify/cors an die
  // Fastify-Antwort haengt, kommt dabei nie auf die Leitung. Bis zum
  // 03.09.2026 pruefte diese Datei nur /api/health - eine Route ohne hijack -
  // und belegte damit genau den Fall nicht, der in Produktion fehlschlug.
  //
  // Ueber einen echten Socket statt app.inject(): inject bricht die
  // hijack-Antwort nicht ab und liefe in den Timeout.
  async function sseKopf(herkunft: string) {
    const app = buildApp({ ueberwachung: new Ueberwachung(async () => []) });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const steuerung = new AbortController();
    try {
      const antwort = await fetch(`http://127.0.0.1:${port}/api/live/8011160`, {
        headers: { origin: herkunft },
        signal: steuerung.signal,
      });
      return {
        freigabe: antwort.headers.get('access-control-allow-origin'),
        vary: antwort.headers.get('vary'),
      };
    } finally {
      steuerung.abort();
      await app.close();
    }
  }

  it('auch der SSE-Strom traegt den Freigabe-Header', async () => {
    process.env.CORS_ORIGIN = 'https://umstieg.vercel.app';
    expect((await sseKopf('https://umstieg.vercel.app')).freigabe).toBe(
      'https://umstieg.vercel.app',
    );
  });

  it('der SSE-Strom gibt fremden Herkuenften keine Freigabe', async () => {
    process.env.CORS_ORIGIN = 'https://umstieg.vercel.app';
    expect((await sseKopf('https://angreifer.example')).freigabe).toBeNull();
  });

  // Auch die ABLEHNUNG haengt an der Herkunft. Ohne `Vary` darf ein
  // Zwischenspeicher die kopflose Antwort, die eine fremde Herkunft bekommen
  // hat, an eine erlaubte ausliefern - und die scheiterte dann an einer
  // Freigabe, die es eigentlich gibt. @fastify/cors sendet den Header
  // deshalb in BEIDEN Faellen; diese Route tat es zuerst nur im erlaubten.
  it('nennt Origin in beiden Faellen als Variationsgrund', async () => {
    process.env.CORS_ORIGIN = 'https://umstieg.vercel.app';
    expect((await sseKopf('https://umstieg.vercel.app')).vary).toBe('Origin');
    expect((await sseKopf('https://angreifer.example')).vary).toBe('Origin');
  });

  it('mehrere Herkuenfte kommagetrennt, Leerzeichen werden getrimmt', async () => {
    process.env.CORS_ORIGIN = 'https://a.example ,  https://b.example';
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://b.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://b.example');
  });
});
