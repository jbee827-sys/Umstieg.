import { describe, it, expect, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { Ueberwachung, type LiveEreignis } from '../src/core/ueberwachung.js';
import { berlinUhrzeit } from '../src/core/zeit.js';
import { erzeugeHaltestellenLive, haltestellenLiveSchluessel, haltestellenTafelAlsTafel } from '../src/routes/live.js';
import type { HaltestellenClient } from '../src/clients/haltestellen.js';
import type { HaltestellenTafelEintrag, TafelEintrag } from '../src/core/typen.js';

const E: HaltestellenTafelEintrag = { fahrtId: 'f1', linie: 'Bus 245', verkehrsmittel: 'bus', ziel: 'Zoo', zeitSoll: '2026-10-16T14:28:00Z', steigSoll: 'Pos. 11', steigLat: 52.5, steigLon: 13.3, steigGenau: true, echtzeit: false, ausfall: false };

describe('berlinUhrzeit', () => {
  it('Sommerzeit: UTC+2', () => expect(berlinUhrzeit('2026-10-16T14:28:00Z')).toBe('16:28'));
  it('Winterzeit: UTC+1', () => expect(berlinUhrzeit('2026-11-16T14:28:00Z')).toBe('15:28'));
});

describe('haltestellenTafelAlsTafel', () => {
  it('Fahrt-ID als Schluessel, Linie als Anzeige, Uhrzeit deutsch', () => {
    expect(haltestellenTafelAlsTafel(E)).toEqual({ zug: 'f1', anzeige: 'Bus 245', zeitSoll: '16:28', gleisSoll: 'Pos. 11', ziel: 'Zoo', ausfall: false });
  });
});

describe('Ueberwachung: Ausfall', () => {
  it('meldet einen neuen Ausfall einmal', async () => {
    let tafel: TafelEintrag[] = [{ zug: 'f1', zeitSoll: '16:28', gleisSoll: 'A', ziel: 'Zoo', anzeige: 'Bus 245', ausfall: false }];
    const u = new Ueberwachung(async () => tafel);
    const e: LiveEreignis[] = [];
    u.abonniere('h1', ['f1'], (x) => e.push(x));
    await u.pruefeJetzt('h1');
    tafel = [{ ...tafel[0], ausfall: true }];
    await u.pruefeJetzt('h1');
    await u.pruefeJetzt('h1');
    const ausfaelle = e.filter((x) => x.typ === 'ausfall');
    expect(ausfaelle).toHaveLength(1);
    expect(ausfaelle[0]).toMatchObject({ zug: 'f1', anzeige: 'Bus 245' });
  });
});

describe('Ueberwachung: Kapazitaet fuer mehrere Schluessel', () => {
  it('zwei neue Halte brauchen zwei freie Plaetze', () => {
    const u = new Ueberwachung(async () => [], 60_000, undefined, 2);
    u.abonniere('h0', [], () => {});
    expect(u.hatKapazitaetFuerAlle(['h1'])).toBe(true);
    expect(u.hatKapazitaetFuerAlle(['h1', 'h2'])).toBe(false);
    expect(u.hatKapazitaetFuerAlle(['h0', 'h1'])).toBe(true);
  });
});

function spionClient(tafelFrisch: HaltestellenClient['tafelFrisch']) {
  return { tafelFrisch: vi.fn(tafelFrisch), tafel: vi.fn(), sucheOrte: vi.fn(), orteNahebei: vi.fn(), fussweg: vi.fn(), fahrt: vi.fn() };
}

describe('erzeugeHaltestellenLive', () => {
  it('Ankunft und Abfahrt derselben Fahrt zur selben Sollminute: keine Phantom-Verspaetung', async () => {
    const an: HaltestellenTafelEintrag = { ...E, zeitIst: '2026-10-16T14:29:00Z', echtzeit: true };
    const ab: HaltestellenTafelEintrag = { ...E, zeitIst: '2026-10-16T14:30:00Z', echtzeit: true };
    const client = spionClient(async (_h, typ) => (typ === 'arr' ? [an] : [ab]));
    const live = erzeugeHaltestellenLive(client as never);
    live.merkeOrt('h1', { lat: 52.5, lon: 13.3 });
    const e: LiveEreignis[] = [];
    const schluessel = [haltestellenLiveSchluessel('h1', 'arr'), haltestellenLiveSchluessel('h1', 'dep')];
    for (const s of schluessel) live.ueberwachung.abonniere(s, ['f1'], (x) => e.push(x));
    for (let i = 0; i < 2; i++) for (const s of schluessel) await live.ueberwachung.pruefeJetzt(s);
    expect(e.filter((x) => x.typ === 'verspaetung')).toEqual([]);
  });

  it('ohne gemerkte Koordinate kein Abruf', async () => {
    const client = spionClient(async () => [E]);
    const live = erzeugeHaltestellenLive(client as never);
    const s = haltestellenLiveSchluessel('unbekannt', 'dep');
    live.ueberwachung.abonniere(s, [], () => {});
    await live.ueberwachung.pruefeJetzt(s);
    expect(client.tafelFrisch).not.toHaveBeenCalled();
  });
});

describe('GET /api/live/haltestelle', () => {
  async function starte(o: { maxHalte?: number } = {}) {
    const client = spionClient(async (_h, typ) => (typ === 'dep' ? [E] : []));
    const haltestellenLive = erzeugeHaltestellenLive(client as never, { maxHalte: o.maxHalte });
    const app = buildApp({ haltestellen: client, haltestellenLive } as never, { sseGrenzen: { gesamt: 3, jeAufrufer: 2 } });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as AddressInfo).port;
    return { app, port, client, haltestellenLive };
  }
  const pfad = '/api/live/haltestelle?an=h1&anLat=52.5&anLon=13.3&ab=h2&abLat=52.51&abLon=13.31&fahrtAn=f0&fahrtAb=f1';

  it('ein Strom fuer Ankunfts- und Abfahrtshaltestelle', async () => {
    const { app, port } = await starte();
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}${pfad}`, { signal: ctrl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    ctrl.abort();
    await app.close();
  });

  it('400 ohne Haltestelle oder mit kaputter Koordinate', async () => {
    const { app, port } = await starte();
    for (const url of ['/api/live/haltestelle', '/api/live/haltestelle?an=h1&anLat=x&anLon=1']) {
      expect((await fetch(`http://127.0.0.1:${port}${url}`)).status).toBe(400);
    }
    await app.close();
  });

  it('teilt die Verbindungsgrenze mit /api/live/:eva', async () => {
    const { app, port } = await starte();
    const ctrl = new AbortController();
    const offen = await Promise.all([
      fetch(`http://127.0.0.1:${port}${pfad}`, { signal: ctrl.signal }),
      fetch(`http://127.0.0.1:${port}/api/live/8000001`, { signal: ctrl.signal }),
    ]);
    expect(offen.map((r) => r.status)).toEqual([200, 200]);
    const dritte = await fetch(`http://127.0.0.1:${port}${pfad}`);
    expect(dritte.status).toBe(503);
    ctrl.abort();
    await app.close();
  });

  it('zwei Zuschauer derselben Haltestelle: ein Abruf (Spec 5.4)', async () => {
    const { app, port, client, haltestellenLive } = await starte();
    const ctrl = new AbortController();
    const url = `http://127.0.0.1:${port}/api/live/haltestelle?ab=h2&abLat=52.51&abLon=13.31&fahrtAb=f1`;
    const stroeme = await Promise.all([fetch(url, { signal: ctrl.signal }), fetch(url, { signal: ctrl.signal })]);
    expect(stroeme.map((r) => r.status)).toEqual([200, 200]);
    await haltestellenLive.ueberwachung.pruefeJetzt(haltestellenLiveSchluessel('h2', 'dep'));
    expect(client.tafelFrisch.mock.calls).toEqual([[{ id: 'h2', lat: 52.51, lon: 13.31 }, 'dep']]);
    ctrl.abort();
    await app.close();
  });

  it('Ankunftshaltestelle nur Ankuenfte, Anschlusshaltestelle nur Abfahrten (K7)', async () => {
    const { app, port, client, haltestellenLive } = await starte();
    const ctrl = new AbortController();
    expect((await fetch(`http://127.0.0.1:${port}${pfad}`, { signal: ctrl.signal })).status).toBe(200);
    await haltestellenLive.ueberwachung.pruefeJetzt(haltestellenLiveSchluessel('h1', 'arr'));
    await haltestellenLive.ueberwachung.pruefeJetzt(haltestellenLiveSchluessel('h2', 'dep'));
    // Nicht abonniert: kein Abruf.
    await haltestellenLive.ueberwachung.pruefeJetzt(haltestellenLiveSchluessel('h1', 'dep'));
    expect(client.tafelFrisch.mock.calls.map((c) => [(c[0] as { id: string }).id, c[1]])).toEqual([
      ['h1', 'arr'],
      ['h2', 'dep'],
    ]);
    ctrl.abort();
    await app.close();
  });

  it('Kapazitaet fuer beide Halte wird vor dem Oeffnen geprueft (Review Focus 5)', async () => {
    const { app, port, haltestellenLive } = await starte({ maxHalte: 1 });
    const res = await fetch(`http://127.0.0.1:${port}${pfad}`);
    expect(res.status).toBe(503);
    expect((await res.json()).fehler).toBe('zu-viele-haltestellen');
    // Nichts angemeldet: Der Platz bleibt frei.
    expect(haltestellenLive.ueberwachung.hatKapazitaetFuerAlle([haltestellenLiveSchluessel('h1', 'arr')])).toBe(true);
    await app.close();
  });

  it('nicht eingerichtet: 503', async () => {
    const app = buildApp({ haltestellen: null } as never);
    const res = await app.inject(pfad);
    expect(res.statusCode).toBe(503);
    expect(res.json().fehler).toBe('haltestellen-nicht-eingerichtet');
  });
});
