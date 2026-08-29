import { describe, it, expect, vi } from 'vitest';
import { erkenneBahnhof, rundeKoordinate } from './bahnhofErkennung';
import type { Standort } from './typen';

function standort(lat: number, lon: number): Standort {
  return { lat, lon, genauigkeitM: 20, zeitstempel: 0 };
}

describe('rundeKoordinate', () => {
  it('rundet auf 3 Nachkommastellen', () => {
    expect(rundeKoordinate(52.5249253)).toBe(52.525);
  });

  it('rundet negative Werte korrekt', () => {
    expect(rundeKoordinate(-0.1276474)).toBe(-0.128);
  });

  it('laesst bereits gerundete Werte unveraendert', () => {
    expect(rundeKoordinate(13.369)).toBe(13.369);
  });
});

describe('erkenneBahnhof', () => {
  it('sendet ausschliesslich gerundete Koordinaten', async () => {
    const suche = vi.fn(async () => ({ ok: true as const, treffer: [] }));
    await erkenneBahnhof(standort(52.5249253, 13.3696291), suche);
    expect(suche).toHaveBeenCalledWith(52.525, 13.37);
  });

  it('reicht Treffer durch', async () => {
    const treffer = [{ name: 'Berlin Hbf', eva: '8011160', lat: 52.525, lon: 13.369 }];
    const suche = vi.fn(async () => ({ ok: true as const, treffer }));
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369), suche);
    expect(ergebnis).toEqual({ ok: true, treffer });
  });

  it('meldet 503 als Degradation, statt zu werfen', async () => {
    const suche = vi.fn(async () => ({ ok: false as const, fehler: 'db-zugang-fehlt' as const }));
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369), suche);
    expect(ergebnis).toEqual({ ok: false, fehler: 'db-zugang-fehlt' });
  });
});
