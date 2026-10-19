import { describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { Ueberwachung } from '../src/core/ueberwachung.js';

/**
 * Der SSE-Strom ist die einzige Route, die eine Verbindung OFFEN haelt - und
 * jede neue EVA startet dahinter einen eigenen 30-Sekunden-Poller gegen
 * Timetables.
 *
 * Ohne Obergrenzen sind damit zwei Dinge unbegrenzt, die Geld und Speicher
 * kosten: die Zahl offener Verbindungen und die Zahl laufender Poller. Eine
 * Ratenbegrenzung je Anfrage hilft dagegen nicht - eine Verbindung wird
 * einmal geoeffnet und bleibt dann stunden lang bestehen.
 */

/** Oeffnet einen SSE-Strom und laesst ihn offen; `schliesse()` gibt ihn frei. */
async function oeffneStrom(port: number, eva: string, ip: string) {
  const steuerung = new AbortController();
  const antwort = await fetch(`http://127.0.0.1:${port}/api/live/${eva}`, {
    headers: { 'x-forwarded-for': ip },
    signal: steuerung.signal,
  });
  return {
    status: antwort.status,
    koerper: antwort.headers.get('content-type')?.includes('json') ? await antwort.json() : null,
    schliesse: () => steuerung.abort(),
  };
}

async function starteApp(gesamt: number, jeAufrufer: number, maxEvas = 35) {
  const app = buildApp(
    { ueberwachung: new Ueberwachung(async () => [], 30_000, undefined, maxEvas) },
    { sseGrenzen: { gesamt, jeAufrufer } },
  );
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return { app, port };
}

describe('Obergrenzen des SSE-Stroms', () => {
  it('laesst so viele Verbindungen je Aufrufer zu wie erlaubt', async () => {
    const { app, port } = await starteApp(10, 2);
    const a = await oeffneStrom(port, '8011160', '203.0.113.1');
    const b = await oeffneStrom(port, '8011160', '203.0.113.1');
    expect([a.status, b.status]).toEqual([200, 200]);
    a.schliesse();
    b.schliesse();
    await app.close();
  });

  it('weist die naechste Verbindung desselben Aufrufers ab', async () => {
    const { app, port } = await starteApp(10, 2);
    const a = await oeffneStrom(port, '8011160', '203.0.113.1');
    const b = await oeffneStrom(port, '8011160', '203.0.113.1');
    const c = await oeffneStrom(port, '8011160', '203.0.113.1');

    expect(c.status).toBe(503);
    expect(c.koerper).toMatchObject({ fehler: 'zu-viele-verbindungen' });

    a.schliesse();
    b.schliesse();
    await app.close();
  });

  // Ein anderer Aufrufer darf davon nichts merken - sonst sperrt der erste
  // Andrang alle uebrigen aus.
  it('trifft andere Aufrufer nicht', async () => {
    const { app, port } = await starteApp(10, 2);
    const a = await oeffneStrom(port, '8011160', '203.0.113.1');
    const b = await oeffneStrom(port, '8011160', '203.0.113.1');
    const fremd = await oeffneStrom(port, '8011160', '198.51.100.7');

    expect(fremd.status).toBe(200);

    a.schliesse();
    b.schliesse();
    fremd.schliesse();
    await app.close();
  });

  it('gibt den Platz wieder frei, wenn eine Verbindung endet', async () => {
    const { app, port } = await starteApp(10, 2);
    const a = await oeffneStrom(port, '8011160', '203.0.113.1');
    const b = await oeffneStrom(port, '8011160', '203.0.113.1');
    b.schliesse();
    // Der Abbruch muss beim Server angekommen sein, bevor neu geoeffnet wird.
    await new Promise((f) => setTimeout(f, 120));

    const c = await oeffneStrom(port, '8011160', '203.0.113.1');
    expect(c.status).toBe(200);

    a.schliesse();
    c.schliesse();
    await app.close();
  });

  // Browserpruefung 19.10.2026: Mit zwei je Aufrufer wies der Server einen
  // Strom ab, und der Umstieg lief ohne Live-Daten weiter. Eine Adresse ist
  // kein Geraet - im ICE-WLAN und hinter dem NAT der Mobilfunker teilen sich
  // viele eine. Und nach einem Funkloch zaehlt der alte Strom weiter, bis
  // der Server merkt, dass niemand mehr zuhoert.
  it('laesst im Standard zehn Stroeme je Aufrufer zu, den elften nicht', async () => {
    const app = buildApp({ ueberwachung: new Ueberwachung(async () => [], 30_000) });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const stroeme = [];
    for (let i = 0; i < 11; i++) stroeme.push(await oeffneStrom(port, '8011160', '203.0.113.1'));

    expect(stroeme.slice(0, 10).map((s) => s.status)).toEqual(Array(10).fill(200));
    expect(stroeme[10].status).toBe(503);

    for (const s of stroeme) s.schliesse();
    await app.close();
  });

  it('weist ab, wenn die Gesamtzahl erreicht ist', async () => {
    const { app, port } = await starteApp(2, 5);
    const a = await oeffneStrom(port, '8011160', '203.0.113.1');
    const b = await oeffneStrom(port, '8011160', '198.51.100.7');
    const c = await oeffneStrom(port, '8011160', '192.0.2.9');

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(c.status).toBe(503);

    a.schliesse();
    b.schliesse();
    await app.close();
  });
});

describe('Obergrenze der ueberwachten EVA-Nummern', () => {
  // Die eigentliche Verstaerkung: Nicht die Verbindung kostet, sondern der
  // Poller dahinter. 35 verschiedene EVA-Nummern sind 35 Abfragen gegen
  // Timetables - alle 30 Sekunden, dauerhaft.
  it('nimmt keine neue EVA mehr an, wenn die Grenze erreicht ist', () => {
    const ueberwachung = new Ueberwachung(async () => [], 30_000, undefined, 2);
    ueberwachung.abonniere('8000001', [], () => {});
    ueberwachung.abonniere('8000002', [], () => {});

    expect(ueberwachung.hatKapazitaetFuer('8000003')).toBe(false);
  });

  // Wer auf eine bereits ueberwachte EVA aufspringt, kostet nichts extra:
  // Gepollt wird ohnehin nur einmal je EVA.
  it('laesst weitere Zuschauer einer bereits ueberwachten EVA zu', () => {
    const ueberwachung = new Ueberwachung(async () => [], 30_000, undefined, 2);
    ueberwachung.abonniere('8000001', [], () => {});
    ueberwachung.abonniere('8000002', [], () => {});

    expect(ueberwachung.hatKapazitaetFuer('8000001')).toBe(true);
  });

  it('gibt eine EVA wieder frei, wenn ihr letzter Zuschauer geht', () => {
    const ueberwachung = new Ueberwachung(async () => [], 30_000, undefined, 2);
    ueberwachung.abonniere('8000001', [], () => {});
    const ab = ueberwachung.abonniere('8000002', [], () => {});
    expect(ueberwachung.hatKapazitaetFuer('8000003')).toBe(false);

    ab();
    expect(ueberwachung.hatKapazitaetFuer('8000003')).toBe(true);
  });

  it('weist den Strom ab, wenn keine EVA mehr frei ist', async () => {
    const { app, port } = await starteApp(10, 5, 1);
    const a = await oeffneStrom(port, '8000001', '203.0.113.1');
    const b = await oeffneStrom(port, '8000002', '198.51.100.7');

    expect(a.status).toBe(200);
    expect(b.status).toBe(503);
    expect(b.koerper).toMatchObject({ fehler: 'zu-viele-bahnhoefe' });

    a.schliesse();
    await app.close();
  });
});
