import { afterEach, describe, expect, it } from 'vitest';
import { Writable } from 'node:stream';
import { buildApp } from '../src/app.js';
import { APP_EREIGNISSE } from '../src/routes/zaehler.js';

/**
 * Nutzungszaehlung der iOS-App (Plan App Store, Paket 4). Die
 * Datenschutzerklaerung sagt zu: gezaehlt wird nur der Name eines
 * Ereignisses, gespeichert nur eine Summe je Stunde - keine Adresse, keine
 * Kennung, kein Inhalt.
 */
function sammelLogger() {
  const zeilen: Record<string, unknown>[] = [];
  const roh: string[] = [];
  const strom = new Writable({
    write(stueck, _kodierung, fertig) {
      for (const zeile of String(stueck).split('\n')) {
        if (!zeile.trim()) continue;
        roh.push(zeile);
        zeilen.push(JSON.parse(zeile) as Record<string, unknown>);
      }
      fertig();
    },
  });
  return { zeilen, roh, optionen: { logger: { level: 'info', stream: strom } } };
}

const zaehle = (app: ReturnType<typeof buildApp>, name: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/zaehle',
    payload: name,
    headers: { 'content-type': 'text/plain', ...headers },
  });

const urspruenglich = process.env.CORS_ORIGIN;
afterEach(() => {
  if (urspruenglich === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = urspruenglich;
});

describe('POST /api/zaehle', () => {
  it('nimmt bekannte Ereignisse an und antwortet ohne Inhalt', async () => {
    const app = buildApp();
    for (const name of APP_EREIGNISSE) expect((await zaehle(app, name)).statusCode).toBe(204);
    await app.close();
  });

  it('lehnt alles andere ab - freier Text landete sonst im Protokoll', async () => {
    const app = buildApp();
    expect((await zaehle(app, 'Berlin Hbf Gleis 14')).statusCode).toBe(400);
    expect((await zaehle(app, '')).statusCode).toBe(400);
    expect((await zaehle(app, 'x'.repeat(200))).statusCode).toBe(413);
    await app.close();
  });

  it('schreibt beim Beenden eine Summe je Name - ohne Adresse, ohne Abfrage', async () => {
    const log = sammelLogger();
    const app = buildApp(undefined, log.optionen as never);
    await zaehle(app, 'start', { 'x-forwarded-for': '203.0.113.7' });
    await zaehle(app, 'start');
    await zaehle(app, 'bildschirm-weg');
    await app.close();

    const eintrag = log.zeilen.find((z) => z.ereignis === 'app-nutzung');
    expect(eintrag?.je).toEqual({ start: 2, 'bildschirm-weg': 1 });
    expect(eintrag?.summe).toBe(3);
    const alles = log.roh.join('\n');
    expect(alles).not.toContain('203.0.113.7');
    expect(alles).not.toContain('127.0.0.1');
    expect(alles).not.toContain('remoteAddress');
  });

  it('ohne Aufrufe kein Eintrag', async () => {
    const log = sammelLogger();
    const app = buildApp(undefined, log.optionen as never);
    await app.close();
    expect(log.zeilen.filter((z) => z.ereignis === 'app-nutzung')).toEqual([]);
  });

  it('die App (capacitor://localhost) bekommt die CORS-Freigabe', async () => {
    process.env.CORS_ORIGIN = 'https://www.umstieg.online,capacitor://localhost';
    const app = buildApp();
    const res = await zaehle(app, 'start', { origin: 'capacitor://localhost' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    await app.close();
  });
});
