import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { Reisewachen, type Versand } from '../src/core/reisewachen.js';
import { Ueberwachung } from '../src/core/ueberwachung.js';
import { pruefeAnmeldung } from '../src/routes/mitteilungen.js';
import type { Mitteilung } from '../src/core/mitteilungstexte.js';

/**
 * PUT/DELETE /api/mitteilungen/reise und POST /api/mitteilungen/test
 * (Konzept 6.1): Die App meldet ihre Reise an und ab; Texte entstehen nur
 * im Server.
 */
// Zeiten relativ zu jetzt: Eine Reise in der Vergangenheit endet sofort nach der Anmeldung.
const inMin = (min: number): string => new Date(Date.now() + min * 60_000).toISOString();
const REISE = {
  ort: { pfad: 'bahnhof', eva: '8011160' },
  bahnhofName: 'Berlin Hbf',
  haltWort: 'Gleis',
  an: { name: 'ICE 1134', soll: inMin(60), gleis: '8', richtung: 'Frankfurt(Main)Hbf' },
  ab: { name: 'RE 3352', anzeige: 'RE 3', soll: inMin(82), gleis: '6', richtung: 'Schwedt (Oder)' },
  gehzeitSek: 240,
};
const ANMELDUNG = { token: 'geraet-token-1', plattform: 'ios', reise: REISE };

function aufbau(o: { versand?: Versand | null; max?: number; maxEvas?: number } = {}) {
  const gesendet: Mitteilung[] = [];
  const versand: Versand | null =
    o.versand === undefined
      ? vi.fn(async (_t, _p, m: Mitteilung) => {
          gesendet.push(m);
          return 'ok' as const;
        })
      : o.versand;
  const ueberwachung = new Ueberwachung(async () => [], 24 * 60 * 60_000, undefined, o.maxEvas);
  const reisewachen = versand
    ? new Reisewachen({ bahnhof: ueberwachung, haltestellen: null }, versand, { max: o.max })
    : null;
  const app = buildApp({ ueberwachung, reisewachen, fcmVersand: versand, haltestellen: null });
  return { app, reisewachen, gesendet };
}

const sende = (
  app: ReturnType<typeof buildApp>,
  method: 'PUT' | 'DELETE' | 'POST',
  url: string,
  body: unknown,
  ip = '203.0.113.9',
) =>
  app.inject({
    method,
    url,
    payload: body as object,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });

const urspruenglich = process.env.CORS_ORIGIN;
afterEach(() => {
  if (urspruenglich === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = urspruenglich;
});

describe('PUT /api/mitteilungen/reise', () => {
  it('nimmt eine gueltige Anmeldung mit 204 an', async () => {
    const { app, reisewachen } = aufbau();
    const res = await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG);
    expect(res.statusCode).toBe(204);
    expect(reisewachen!.anzahl()).toBe(1);
    await app.close();
  });

  it('lehnt kaputte Anmeldungen mit 400 ab (EVA, Zeit, Plattform, Token, Gehzeit)', async () => {
    const { app, reisewachen } = aufbau();
    const kaputt = [
      { ...ANMELDUNG, token: '' },
      { ...ANMELDUNG, token: 'x'.repeat(4097) },
      { ...ANMELDUNG, plattform: 'web' },
      { ...ANMELDUNG, reise: { ...REISE, ort: { pfad: 'bahnhof', eva: '123' } } },
      { ...ANMELDUNG, reise: { ...REISE, ab: { ...REISE.ab, soll: 'morgen' } } },
      { ...ANMELDUNG, reise: { ...REISE, an: { ...REISE.an, ist: '16:05' } } },
      { ...ANMELDUNG, reise: { ...REISE, gehzeitSek: 0 } },
      { ...ANMELDUNG, reise: { ...REISE, gehzeitSek: 7201 } },
      { ...ANMELDUNG, reise: { ...REISE, haltWort: 'Bahnsteig' } },
      { ...ANMELDUNG, reise: { ...REISE, bahnhofName: 'x'.repeat(201) } },
      { ...ANMELDUNG, reise: { ...REISE, ab: undefined } },
      'kein objekt',
    ];
    for (const body of kaputt) {
      const res = await sende(app, 'PUT', '/api/mitteilungen/reise', body);
      expect(res.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.json()).toHaveProperty('fehler');
    }
    expect(reisewachen!.anzahl()).toBe(0);
    await app.close();
  });

  it('antwortet 503 nicht-eingerichtet ohne FCM-Zugang, und der Server startet trotzdem', async () => {
    const { app } = aufbau({ versand: null });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    const res = await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'nicht-eingerichtet' });
    // Abmelden geht trotzdem glatt.
    expect((await sende(app, 'DELETE', '/api/mitteilungen/reise', { token: 'x' })).statusCode).toBe(204);
    await app.close();
  });

  it('antwortet 503 nicht-eingerichtet ohne Umgebungsvariable (Produktionsweg)', async () => {
    const vorher = process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const app = buildApp({ haltestellen: null, ueberwachung: new Ueberwachung(async () => []) });
    const res = await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG);
    expect(res.statusCode).toBe(503);
    await app.close();
    if (vorher !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = vorher;
  });

  it('antwortet 503 nicht-eingerichtet fuer den Haltestellenpfad ohne Transitous', async () => {
    const { app } = aufbau();
    const bus = {
      ...ANMELDUNG,
      reise: {
        ...REISE,
        haltWort: 'Steig',
        ort: { pfad: 'haltestelle', an: { id: 'h-an', lat: 52.5, lon: 13.4 }, ab: { id: 'h-ab', lat: 52.5, lon: 13.4 } },
      },
    };
    const res = await sende(app, 'PUT', '/api/mitteilungen/reise', bus);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'nicht-eingerichtet' });
    await app.close();
  });

  it('antwortet 503 voll und 429 zu-viele aus den Reisewachen', async () => {
    const { app } = aufbau({ max: 1 });
    expect((await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG)).statusCode).toBe(204);
    const voll = await sende(app, 'PUT', '/api/mitteilungen/reise', { ...ANMELDUNG, token: 'anderes' }, '198.51.100.1');
    expect(voll.statusCode).toBe(503);
    expect(voll.json()).toEqual({ fehler: 'voll' });
    await app.close();

    const { app: app2 } = aufbau();
    for (let i = 0; i < 10; i++) {
      expect((await sende(app2, 'PUT', '/api/mitteilungen/reise', { ...ANMELDUNG, token: `t${i}` })).statusCode).toBe(204);
    }
    const zuViele = await sende(app2, 'PUT', '/api/mitteilungen/reise', { ...ANMELDUNG, token: 't10' });
    expect(zuViele.statusCode).toBe(429);
    expect(zuViele.json()).toEqual({ fehler: 'zu-viele' });
    await app2.close();
  });

  it('nimmt nie einen Text vom Aufrufer an', () => {
    const r = pruefeAnmeldung({
      ...ANMELDUNG,
      titel: 'Gewinnspiel',
      text: 'Hier klicken',
      reise: { ...REISE, titel: 'x', ab: { ...REISE.ab, text: 'y' } },
    });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/Gewinnspiel|Hier klicken|"titel"|"text"/);
  });

  it('begrenzt Anmeldungen auf 20 je Minute und Adresse', async () => {
    const { app } = aufbau();
    for (let i = 0; i < 20; i++) await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG);
    expect((await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG)).statusCode).toBe(429);
    await app.close();
  });
});

describe('DELETE /api/mitteilungen/reise', () => {
  it('beendet die Wache und antwortet 204, auch ohne Wache', async () => {
    const { app, reisewachen } = aufbau();
    await sende(app, 'PUT', '/api/mitteilungen/reise', ANMELDUNG);
    expect((await sende(app, 'DELETE', '/api/mitteilungen/reise', { token: ANMELDUNG.token })).statusCode).toBe(204);
    expect(reisewachen!.anzahl()).toBe(0);
    expect((await sende(app, 'DELETE', '/api/mitteilungen/reise', { token: ANMELDUNG.token })).statusCode).toBe(204);
    expect((await sende(app, 'DELETE', '/api/mitteilungen/reise', { token: '' })).statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /api/mitteilungen/test', () => {
  it('schickt die Beispiel-Mitteilung Gleiswechsel aus Konzept 4a', async () => {
    const { app, gesendet } = aufbau();
    const res = await sende(app, 'POST', '/api/mitteilungen/test', { token: 'g', plattform: 'ios' });
    expect(res.statusCode).toBe(204);
    expect(gesendet.map((m) => [m.art, m.titel, m.text])).toEqual([
      ['gleis-ab', 'Gleis 5 statt 6', 'RE 3 nach Schwedt (Oder), ab 16:23'],
    ]);
    expect(gesendet[0]!.daten).toMatchObject({ gleisAlt: '6', gleisNeu: '5', status: 'erreichbar', aktion: 'weg' });
    await app.close();
  });

  it('antwortet 502, wenn FCM ablehnt, und 503 ohne Versand', async () => {
    const { app } = aufbau({ versand: async () => 'token-ungueltig' });
    expect((await sende(app, 'POST', '/api/mitteilungen/test', { token: 'g', plattform: 'ios' })).statusCode).toBe(502);
    await app.close();
    const { app: ohne } = aufbau({ versand: null });
    expect((await sende(ohne, 'POST', '/api/mitteilungen/test', { token: 'g', plattform: 'ios' })).statusCode).toBe(503);
    await ohne.close();
  });

  it('erlaubt nur zwei Testmitteilungen je Minute und Adresse', async () => {
    const { app } = aufbau();
    for (let i = 0; i < 2; i++) await sende(app, 'POST', '/api/mitteilungen/test', { token: 'g', plattform: 'ios' });
    expect((await sende(app, 'POST', '/api/mitteilungen/test', { token: 'g', plattform: 'ios' })).statusCode).toBe(429);
    await app.close();
  });
});

describe('CORS fuer die App', () => {
  it('beantwortet den Preflight fuer PUT und DELETE von capacitor://localhost', async () => {
    process.env.CORS_ORIGIN = 'https://umstieg.online,capacitor://localhost';
    const { app } = aufbau();
    for (const methode of ['PUT', 'DELETE']) {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/mitteilungen/reise',
        headers: {
          origin: 'capacitor://localhost',
          'access-control-request-method': methode,
          'access-control-request-headers': 'content-type',
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
      expect(String(res.headers['access-control-allow-methods'])).toContain(methode);
    }
    await app.close();
  });
});
