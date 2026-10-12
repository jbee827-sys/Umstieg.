import { describe, it, expect, vi } from 'vitest';
import { baueOverpassQL, overpassQuery, protokolliereVersuch, type OverpassVersuch } from '../src/clients/overpass.js';

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
    expect(dritteUrl).toContain('kumi.systems');
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
