import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

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
