import { describe, it, expect, vi } from 'vitest';
import { baueOverpassQL, overpassQuery } from '../src/clients/overpass.js';

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
