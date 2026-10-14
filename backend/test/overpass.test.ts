import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { baueOverpassQL, overpassQuery, protokolliereVersuch, type OverpassVersuch } from '../src/clients/overpass.js';
import {
  erzeugeOverpassPausen,
  istAbgewiesen,
  pauseFuer,
  PAUSE_406_MS,
  PAUSE_429_MS,
  PAUSE_ABGEWIESEN_MS,
} from '../src/clients/overpass-pausen.js';

// Die Tests kennen die Vorgaben – eine Variable aus der Shell darf sie nicht kippen.
beforeEach(() => {
  vi.stubEnv('OVERPASS_URL_PRIMARY', '');
  vi.stubEnv('OVERPASS_URL_FALLBACK', '');
});
afterEach(() => vi.unstubAllEnvs());

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('baueOverpassQL', () => {
  it('enthält alle relevanten Elementklassen und die Koordinaten', () => {
    const ql = baueOverpassQL(52.5, 13.4, 400);
    expect(ql).toContain('way["railway"="platform"]');
    expect(ql).toContain('relation["railway"="platform"]');
    // Stuttgart, Karlsruhe, Mannheim: Die Gleisnummer steht an der Kante.
    expect(ql).toContain('way["railway"="platform_edge"]');
    expect(ql).toContain('footway|steps|corridor');
    expect(ql).toContain('"highway"="elevator"');
    expect(ql).toContain('conveying');
    expect(ql).toContain('around:400,52.5,13.4');
    expect(ql).toContain('[out:json]');
  });
});

describe('overpassQuery', () => {
  it('reicht die JSON-Antwort der Primärinstanz durch', async () => {
    const antwort = { elements: [{ type: 'node', id: 1, lat: 52.5, lon: 13.4 }] };
    const fetchFn = vi.fn(async () => jsonResponse(antwort));
    const res = await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(res.elements).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('wertet HTTP-Fehlerstatus als Fehlversuch', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 429))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    const res = await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(res.elements).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fällt nach zwei Fehlversuchen auf die Fallback-Instanz zurück', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    const res = await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(res.elements).toEqual([]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const dritteUrl = String(fetchFn.mock.calls[2][0]);
    expect(dritteUrl).toContain('maps.mail.ru');
  });

  it('wirft, wenn alle Versuche scheitern', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('kaputt'));
    await expect(
      overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0),
    ).rejects.toThrow(/Overpass nicht erreichbar/);
    expect(fetchFn).toHaveBeenCalledTimes(4); // 2× primär, 2× fallback
  });
});

describe('overpassQuery – Versuchsprotokoll', () => {
  it('meldet jeden Versuch mit Instanz, Ergebnis und Dauer', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 504))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    const versuche: OverpassVersuch[] = [];
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, (v) => versuche.push(v));
    expect(versuche).toHaveLength(2);
    expect(versuche[0]).toMatchObject({ instanz: 'overpass-api.de', versuch: 1, ok: false, status: 504 });
    expect(versuche[1]).toMatchObject({ instanz: 'overpass-api.de', versuch: 2, ok: true, status: 200 });
    for (const v of versuche) expect(v.dauerMs).toBeGreaterThanOrEqual(0);
  });

  it('meldet auch einen Netzfehler ohne Status', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    const versuche: OverpassVersuch[] = [];
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, (v) => versuche.push(v));
    expect(versuche[0].ok).toBe(false);
    expect(versuche[0].status).toBeUndefined();
    expect(versuche[0].fehler).toMatch(/fetch failed/);
  });
});

// Overpass meldet einen Zeit- oder Speicherfehler mit HTTP 200, einem `remark`
// und leerem oder teilweisem `elements`. Als Erfolg gewertet wuerde so eine
// Antwort 30 Tage im Bestand liegen.
describe('overpassQuery – Laufzeitfehler mit HTTP 200', () => {
  const LAUFZEITFEHLER = {
    remark: 'runtime error: Query timed out in "query" at line 3 after 26 seconds.',
    elements: [],
  };

  it('wertet einen Laufzeitfehler-Hinweis trotz HTTP 200 als Fehlversuch', async () => {
    const zweite = { elements: [] };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(LAUFZEITFEHLER))
      .mockResolvedValueOnce(jsonResponse(zweite));
    const versuche: OverpassVersuch[] = [];
    const res = await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, (v) => versuche.push(v));
    expect(res).toEqual(zweite);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(versuche).toHaveLength(2);
    expect(versuche[0]).toMatchObject({ versuch: 1, ok: false, status: 200 });
    expect(versuche[0].fehler).toMatch(/Laufzeitfehler/);
    expect(versuche[1]).toMatchObject({ versuch: 2, ok: true });
  });

  it('wirft, wenn alle vier Antworten einen Laufzeitfehler tragen', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(LAUFZEITFEHLER));
    await expect(
      overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0),
    ).rejects.toThrow(/Overpass nicht erreichbar/);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('nimmt einen Hinweis ohne Laufzeitfehler als Erfolg', async () => {
    const antwort = { remark: 'Hinweis ohne Fehler', elements: [] };
    const fetchFn = vi.fn(async () => jsonResponse(antwort));
    const res = await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(res).toEqual(antwort);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('protokolliereVersuch', () => {
  it('schreibt Erfolge als info und Fehlschlaege als warn', () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const melde = protokolliereVersuch(log);
    melde({ instanz: 'overpass-api.de', versuch: 1, ok: false, status: 504, dauerMs: 7600 });
    melde({ instanz: 'overpass-api.de', versuch: 2, ok: true, status: 200, dauerMs: 4200 });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ereignis: 'overpass-versuch', ok: false, status: 504, dauerMs: 7600 }),
      'Overpass-Versuch',
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ ereignis: 'overpass-versuch', ok: true, versuch: 2 }),
      'Overpass-Versuch',
    );
  });
});

function abgewiesen(): TypeError {
  return new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED 162.55.144.139:443'), { code: 'ECONNREFUSED' }),
  });
}

function abgewiesenBeideAdressen(): TypeError {
  // So meldet Node es, wenn IPv4 UND IPv6 abweisen: ein AggregateError ohne eigenen Code.
  const v4 = Object.assign(new Error('connect ECONNREFUSED 162.55.144.139:443'), { code: 'ECONNREFUSED' });
  const v6 = Object.assign(new Error('connect ECONNREFUSED 2a01:4f8:261:3c4f::2:443'), { code: 'ECONNREFUSED' });
  return new TypeError('fetch failed', { cause: new AggregateError([v4, v6]) });
}

describe('pauseFuer', () => {
  it('pausiert nach 429, 406 und abgewiesener Verbindung, sonst nicht', () => {
    expect(pauseFuer({ status: 429 })).toBe(PAUSE_429_MS);
    expect(pauseFuer({ status: 406 })).toBe(PAUSE_406_MS);
    expect(pauseFuer({ fehler: abgewiesen() })).toBe(PAUSE_ABGEWIESEN_MS);
    expect(pauseFuer({ status: 504 })).toBe(0);
    expect(pauseFuer({ fehler: new Error('timeout') })).toBe(0);
    expect([PAUSE_429_MS, PAUSE_ABGEWIESEN_MS, PAUSE_406_MS]).toEqual([60_000, 1_800_000, 86_400_000]);
  });

  it('erkennt die abgewiesene Verbindung in beiden Formen von Node', () => {
    expect(istAbgewiesen(abgewiesen())).toBe(true);
    expect(istAbgewiesen(abgewiesenBeideAdressen())).toBe(true);
    expect(istAbgewiesen(new TypeError('fetch failed'))).toBe(false);
    expect(istAbgewiesen(undefined)).toBe(false);
  });
});

describe('overpassQuery – Sperrpause', () => {
  const PRIMAER = 'overpass-api.de';
  const ERSATZ = 'maps.mail.ru';
  const host = (f: ReturnType<typeof vi.fn>, i: number) => new URL(String(f.mock.calls[i][0])).host;

  function uhr() {
    let t = Date.parse('2026-10-14T12:00:00Z');
    return { jetzt: () => new Date(t), weiter: (ms: number) => (t += ms) };
  }

  it('fragt nach 429 nicht denselben Server erneut, sondern den Ersatzserver', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 429))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(host(fetchFn, 1)).toBe(ERSATZ);
  });

  it('wiederholt 504 am selben Server wie bisher', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 504))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }));
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0);
    expect(host(fetchFn, 1)).toBe(PRIMAER);
  });

  it('laesst einen Server nach 429 60 s in Ruhe und fragt ihn danach wieder', async () => {
    const u = uhr();
    const pausen = erzeugeOverpassPausen({ jetzt: u.jetzt });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('busy', 429))
      .mockImplementation(async () => jsonResponse({ elements: [] })); // je Aufruf eine frische Antwort
    const frage = () => overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, undefined, pausen);
    await frage(); // 429 vom Hauptserver, Ersatz liefert
    u.weiter(30_000);
    await frage(); // Hauptserver pausiert -> gleich der Ersatz
    expect(host(fetchFn, 2)).toBe(ERSATZ);
    u.weiter(31_000);
    await frage(); // Pause vorbei -> wieder der Hauptserver
    expect(host(fetchFn, 3)).toBe(PRIMAER);
  });

  it.each([
    ['eine Adresse', abgewiesen],
    ['IPv4 und IPv6', abgewiesenBeideAdressen],
  ])('laesst einen abweisenden Server 30 min in Ruhe (%s)', async (_name, fehler) => {
    const u = uhr();
    const pausen = erzeugeOverpassPausen({ jetzt: u.jetzt });
    const fetchFn = vi.fn(async (url: string) => {
      if (new URL(url).host === PRIMAER) throw fehler();
      return jsonResponse({ elements: [] });
    });
    const frage = () => overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, undefined, pausen);
    await frage();
    expect(fetchFn.mock.calls.map((c) => new URL(c[0]).host)).toEqual([PRIMAER, ERSATZ]);
    u.weiter(29 * 60_000);
    await frage();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(host(fetchFn, 2)).toBe(ERSATZ);
    u.weiter(2 * 60_000);
    await frage();
    expect(host(fetchFn, 3)).toBe(PRIMAER);
  });

  it('laesst einen Server nach 406 einen Tag in Ruhe', async () => {
    const u = uhr();
    const pausen = erzeugeOverpassPausen({ jetzt: u.jetzt });
    pausen.merke(PRIMAER, { status: 406 });
    expect(pausen.pausiertBis(PRIMAER)?.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    u.weiter(PAUSE_406_MS);
    expect(pausen.pausiertBis(PRIMAER)).toBeNull();
  });

  it('wirft sofort und ohne Netz, wenn alle Server pausiert sind', async () => {
    const pausen = erzeugeOverpassPausen({ jetzt: () => new Date('2026-10-14T12:00:00Z') });
    pausen.merke(PRIMAER, { fehler: abgewiesen() });
    pausen.merke(ERSATZ, { status: 429 });
    const fetchFn = vi.fn();
    const beginn = Date.now();
    await expect(
      overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 2000, undefined, pausen),
    ).rejects.toThrow(/Overpass nicht erreichbar: alle Server pausiert/);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(Date.now() - beginn).toBeLessThan(500); // keine 2-s-Wartezeit
  });

  it('vermerkt uebersprungene Server im Versuchsprotokoll', async () => {
    const pausen = erzeugeOverpassPausen({ jetzt: () => new Date('2026-10-14T12:00:00Z') });
    pausen.merke(PRIMAER, { fehler: abgewiesen() });
    const versuche: OverpassVersuch[] = [];
    const fetchFn = vi.fn(async () => jsonResponse({ elements: [] }));
    await overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0, (v) => versuche.push(v), pausen);
    expect(versuche[0]).toMatchObject({
      instanz: PRIMAER,
      versuch: 1,
      ok: false,
      dauerMs: 0,
      fehler: 'pausiert bis 2026-10-14T12:30:00.000Z',
    });
    expect(versuche[2]).toMatchObject({ instanz: ERSATZ, ok: true });
  });

  it('nimmt die Vorgaben, wenn die Variablen leer gesetzt sind', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('kaputt'));
    await expect(overpassQuery(52.5, 13.4, 400, fetchFn as unknown as typeof fetch, 0)).rejects.toThrow(
      /Overpass nicht erreichbar/,
    );
    expect(fetchFn.mock.calls.map((c) => new URL(String(c[0])).host)).toEqual([PRIMAER, PRIMAER, ERSATZ, ERSATZ]);
  });
});
