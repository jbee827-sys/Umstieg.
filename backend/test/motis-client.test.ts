import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { erzeugeMotisKern, MOTIS_PFADE, motisUserAgent } from '../src/clients/motis.js';
import {
  erzeugeMotisPausen,
  HaltestellenAnfrageFehler,
  HaltestellenNichtVerfuegbarError,
} from '../src/clients/motis-pausen.js';
import { erzeugeAnfragezaehler } from '../src/core/anfragezaehler.js';
import { APP_VERSION } from '../src/version.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/motis/${name}.json`, import.meta.url)), 'utf8'));

function antwort(body: unknown, status = 200, kopf: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...kopf } });
}

function pruefstand(fetchFn: (...a: unknown[]) => Promise<Response>) {
  const zaehler = erzeugeAnfragezaehler({ intervallMs: 0 });
  const pausen = erzeugeMotisPausen();
  const kern = erzeugeMotisKern({
    basisUrl: 'https://motis.test/',
    kontakt: 'betrieb@example.org',
    fetchFn: fetchFn as unknown as typeof fetch,
    pausen,
    zaehler,
  });
  return { kern, zaehler, pausen };
}

/** Die URL des n-ten Aufrufs. */
function aufruf(fetchFn: ReturnType<typeof vi.fn>, n = 0): URL {
  return new URL(String((fetchFn.mock.calls[n] as unknown[])[0]));
}

describe('MOTIS-Kern', () => {
  it('Version im User-Agent entspricht package.json (F7)', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
    expect(motisUserAgent('betrieb@example.org')).toBe(
      `Umstieg/${APP_VERSION} (+https://www.umstieg.online; betrieb@example.org)`,
    );
    expect(motisUserAgent(undefined)).toBe(`Umstieg/${APP_VERSION} (+https://www.umstieg.online)`);
    expect(motisUserAgent('  ')).toBe(`Umstieg/${APP_VERSION} (+https://www.umstieg.online)`);
  });

  it('Suche: richtiger Pfad, Typ STOP, Sprache, User-Agent, Zaehler', async () => {
    const fetchFn = vi.fn(async () => antwort(fixture('geocode-kassel-rathaus')));
    const { kern, zaehler } = pruefstand(fetchFn);
    const treffer = await kern.geocode('Kassel Rathaus');
    expect(treffer.length).toBe(10);
    const u = aufruf(fetchFn);
    expect(u.origin + u.pathname).toBe(`https://motis.test${MOTIS_PFADE.geocode}`);
    expect(u.searchParams.get('text')).toBe('Kassel Rathaus');
    expect(u.searchParams.get('type')).toBe('STOP');
    expect(u.searchParams.get('language')).toBe('de');
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(motisUserAgent('betrieb@example.org'));
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(zaehler.stand()).toEqual({ geocode: 1 });
  });

  it('Standortsuche rundet auf drei Nachkommastellen, bevor sie hinausgeht', async () => {
    const fetchFn = vi.fn(async () => antwort(fixture('reverse-kassel-3stellen')));
    const { kern } = pruefstand(fetchFn);
    await kern.reverseGeocode(51.312634, 9.492859);
    const u = aufruf(fetchFn);
    expect(u.pathname).toBe(MOTIS_PFADE.reverseGeocode);
    expect(u.searchParams.get('place')).toBe('51.313,9.493');
    expect(u.searchParams.get('type')).toBe('STOP');
  });

  it('Tafel: stopId plus Koordinate als Rueckfall, Fenster ab jetzt, Ankunft vorwaerts (Review Focus 2, 4)', async () => {
    const fetchFn = vi.fn(async () => antwort(fixture('stoptimes-arr-kassel-rathaus')));
    const { kern } = pruefstand(fetchFn);
    const ab = new Date('2026-10-16T13:45:00Z');
    await kern.stoptimes({ stopId: 'de-DELFI_de:06611:200003::A', lat: 51.31263, lon: 9.49286, typ: 'arr', ab });
    const u = aufruf(fetchFn);
    expect(u.pathname).toBe(MOTIS_PFADE.stoptimes);
    expect(u.searchParams.get('stopId')).toBe('de-DELFI_de:06611:200003::A');
    expect(u.searchParams.get('center')).toBe('51.31263,9.49286');
    expect(u.searchParams.get('radius')).toBe('30');
    expect(u.searchParams.get('time')).toBe('2026-10-16T13:45:00.000Z');
    expect(u.searchParams.get('arriveBy')).toBe('true');
    expect(u.searchParams.get('direction')).toBe('LATER');
    expect(u.searchParams.get('window')).toBe('7200');
    expect(u.searchParams.get('withAlerts')).toBe('false');
  });

  it('Abfahrtstafel: arriveBy false', async () => {
    const fetchFn = vi.fn(async () => antwort(fixture('stoptimes-dep-kassel-rathaus')));
    const { kern } = pruefstand(fetchFn);
    await kern.stoptimes({ stopId: 'x', lat: 1, lon: 2, typ: 'dep', ab: new Date() });
    expect(aufruf(fetchFn).searchParams.get('arriveBy')).toBe('false');
  });

  it('Fussweg: nur zu Fuss, kein Linienverkehr (F2), Profil wird durchgereicht', async () => {
    const fetchFn = vi.fn(async () => antwort(fixture('plan-kassel-a-b')));
    const { kern } = pruefstand(fetchFn);
    await kern.plan({
      von: { lat: 52.52498, lon: 13.36911, level: -2 },
      nach: { lat: 52.52334, lon: 13.37022 },
      profil: 'WHEELCHAIR',
    });
    const u = aufruf(fetchFn);
    expect(u.pathname).toBe(MOTIS_PFADE.plan);
    expect(u.searchParams.get('fromPlace')).toBe('52.52498,13.36911,-2');
    expect(u.searchParams.get('toPlace')).toBe('52.52334,13.37022');
    expect(u.searchParams.get('transitModes')).toBe('');
    expect(u.searchParams.get('directModes')).toBe('WALK');
    expect(u.searchParams.get('pedestrianProfile')).toBe('WHEELCHAIR');
    // 2 km Luftlinie mal Umweg, im Rollstuhltempo: unter 30 min ging das nicht.
    expect(Number(u.searchParams.get('maxDirectTime'))).toBeGreaterThanOrEqual(3600);
  });

  it('IDs werden unveraendert und kodiert durchgereicht', async () => {
    const fetchFn = vi.fn(async () => antwort(fixture('trip-kassel-tram')));
    const { kern } = pruefstand(fetchFn);
    await kern.trip('20261016_15:53_de-DELFI_3060271660');
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toContain('tripId=20261016_15%3A53_de-DELFI_3060271660');
    expect(aufruf(fetchFn).searchParams.get('tripId')).toBe('20261016_15:53_de-DELFI_3060271660');
  });

  it('429 mit Retry-After: Pause, danach keine Anfrage, sofort Degradation', async () => {
    const fetchFn = vi.fn(async () => antwort({ error: 'langsam' }, 429, { 'retry-after': '120' }));
    const { kern, pausen, zaehler } = pruefstand(fetchFn);
    await expect(kern.geocode('a')).rejects.toBeInstanceOf(HaltestellenNichtVerfuegbarError);
    expect(pausen.pausiertBis()).not.toBeNull();
    await expect(kern.geocode('b')).rejects.toBeInstanceOf(HaltestellenNichtVerfuegbarError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    // Gezaehlt wird, was hinausging - nicht, was die Pause abgefangen hat.
    expect(zaehler.stand()).toEqual({ geocode: 1 });
  });

  it('Zeitueberschreitung: ein Versuch, dann Pause', async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const { kern, pausen } = pruefstand(fetchFn);
    await expect(kern.stoptimes({ stopId: 'x', lat: 1, lon: 2, typ: 'dep', ab: new Date() })).rejects.toBeInstanceOf(
      HaltestellenNichtVerfuegbarError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(pausen.pausiertBis()).not.toBeNull();
  });

  it('5xx: Pause; 4xx: Anfragefehler ohne Pause', async () => {
    const fuenf = vi.fn(async () => antwort({ error: 'kaputt' }, 500));
    const a = pruefstand(fuenf);
    await expect(a.kern.geocode('x')).rejects.toBeInstanceOf(HaltestellenNichtVerfuegbarError);
    expect(a.pausen.pausiertBis()).not.toBeNull();

    const vier = vi.fn(async () => antwort(fixture('trip-fehler'), 400));
    const b = pruefstand(vier);
    const fehler = await b.kern.trip('gibtsnicht').catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(HaltestellenAnfrageFehler);
    expect((fehler as HaltestellenAnfrageFehler).status).toBe(400);
    expect(b.pausen.pausiertBis()).toBeNull();
  });

  it('unlesbare Antwort ist eine Stoerung, kein Absturz', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>', { status: 200 }));
    const { kern } = pruefstand(fetchFn);
    await expect(kern.geocode('x')).rejects.toBeInstanceOf(HaltestellenNichtVerfuegbarError);
  });
});
