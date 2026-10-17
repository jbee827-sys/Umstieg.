import { describe, it, expect, vi } from 'vitest';
import { erkenneBahnhof, rundeKoordinate } from './bahnhofErkennung';
import type { Standort } from './typen';
import type { Ort } from '../api/typen';

const leer = { ok: true as const, antwort: { orte: [] as Ort[], quellen: { bahnhoefe: 'ok' as const, haltestellen: 'ok' as const } } };

function standort(lat: number, lon: number, genauigkeitM = 20): Standort {
  return { lat, lon, genauigkeitM, zeitstempel: 0 };
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
    const suche = vi.fn(async (_lat: number, _lon: number) => leer);
    await erkenneBahnhof(standort(52.5249253, 13.3696291), suche);
    expect(suche).toHaveBeenCalledWith(52.525, 13.37);
  });

  it('reicht Bahnhoefe und Haltestellen durch (Umstieg 2.0)', async () => {
    const treffer: Ort[] = [
      { name: 'Berlin Hbf', eva: '8011160', lat: 52.525, lon: 13.369, verkehrsmittel: ['bahn'] },
      { name: 'S+U Hauptbahnhof/Washingtonplatz', haltestelleId: 'h', lat: 52.524, lon: 13.37, verkehrsmittel: ['bus'] },
    ];
    const suche = vi.fn(async () => ({ ...leer, antwort: { ...leer.antwort, orte: treffer } }));
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369), suche);
    expect(ergebnis).toEqual({ ok: true, treffer });
  });

  it('meldet 503 als Degradation, statt zu werfen', async () => {
    const suche = vi.fn(async () => ({ ok: false as const, fehler: 'nicht-verfuegbar' as const }));
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369), suche);
    expect(ergebnis).toEqual({ ok: false, fehler: 'nicht-verfuegbar' });
  });
});

describe('erkenneBahnhof prueft die Genauigkeit', () => {
  it('sucht gar nicht erst, wenn der Fix groeber ist als der Suchradius', async () => {
    // Der Server sucht im Umkreis von 1000 m. Ist die Unsicherheit groesser,
    // ist die Suchflaeche kleiner als der Fehler - das Ergebnis waere geraten.
    const suche = vi.fn(async (_lat: number, _lon: number) => leer);
    const ergebnis = await erkenneBahnhof(standort(52.525, 13.369, 2000), suche);
    expect(suche).not.toHaveBeenCalled();
    expect(ergebnis).toEqual({ ok: false, fehler: 'zu-ungenau' });
  });

  it('sucht bei brauchbarem Fix weiterhin', async () => {
    const suche = vi.fn(async (_lat: number, _lon: number) => leer);
    await erkenneBahnhof(standort(52.525, 13.369, 400), suche);
    expect(suche).toHaveBeenCalledTimes(1);
  });

  it('die Grenze selbst gilt noch als brauchbar', async () => {
    const suche = vi.fn(async (_lat: number, _lon: number) => leer);
    await erkenneBahnhof(standort(52.525, 13.369, 1000), suche);
    expect(suche).toHaveBeenCalledTimes(1);
  });
});
