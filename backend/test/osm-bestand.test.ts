import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dateiname,
  erzeugeBestand,
  istVeraltet,
  packeEintrag,
  schluesselVon,
  type BestandsEintrag,
} from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import { baueOverpassQL } from '../src/clients/overpass.js';
import { createHash } from 'node:crypto';
import type { OverpassAntwort } from '../src/core/typen.js';

const WURZEL = fileURLToPath(new URL('../.test-ablage/osm-bestand/', import.meta.url));
let start: string;
let volume: string;

function eintrag(schluessel: string, ueber: Partial<BestandsEintrag> = {}): BestandsEintrag {
  return {
    schluessel,
    name: `Bahnhof ${schluessel}`,
    lat: 52,
    lon: 13,
    geholtAm: '2026-10-12T10:00:00.000Z',
    abfrageVersion: ABFRAGE_VERSION,
    osm: { elements: [{ type: 'node', id: 1, lat: 52, lon: 13 }] } as unknown as OverpassAntwort,
    ...ueber,
  };
}

async function lege(ordner: string, e: BestandsEintrag): Promise<void> {
  mkdirSync(ordner, { recursive: true });
  writeFileSync(join(ordner, dateiname(e.schluessel)), await packeEintrag(e));
}

beforeEach(() => {
  const lauf = join(WURZEL, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  start = join(lauf, 'start');
  volume = join(lauf, 'volume');
});
afterEach(() => rmSync(WURZEL, { recursive: true, force: true }));

describe('ABFRAGE_VERSION', () => {
  it('ist der Kurzhash der aktuellen Overpass-Abfrage', () => {
    const erwartet = createHash('sha256').update(baueOverpassQL(0, 0, 400)).digest('hex').slice(0, 12);
    expect(ABFRAGE_VERSION).toBe(erwartet);
  });
});

describe('schluesselVon', () => {
  it('nimmt die kleinste EVA der Gruppe', () => {
    expect(schluesselVon(['8098160', '8011160', '8089021'])).toBe('8011160');
  });
});

describe('istVeraltet', () => {
  const jetzt = new Date('2026-10-12T12:00:00Z');
  it('ist frisch bis 30 Tage in der aktuellen Version', () => {
    expect(istVeraltet({ geholtAm: '2026-09-13T12:00:01Z', abfrageVersion: ABFRAGE_VERSION }, jetzt)).toBe(false);
  });
  it('ist ab mehr als 30 Tagen veraltet', () => {
    expect(istVeraltet({ geholtAm: '2026-09-12T11:59:59Z', abfrageVersion: ABFRAGE_VERSION }, jetzt)).toBe(true);
  });
  it('ist in einer fremden Abfrageversion veraltet', () => {
    expect(istVeraltet({ geholtAm: '2026-10-12T11:00:00Z', abfrageVersion: 'alt000000000' }, jetzt)).toBe(true);
  });
  it('ist mit unlesbarem Datum veraltet', () => {
    expect(istVeraltet({ geholtAm: 'gestern', abfrageVersion: ABFRAGE_VERSION }, jetzt)).toBe(true);
  });
});

describe('erzeugeBestand – lesen', () => {
  it('liefert null, wenn nichts da ist', async () => {
    expect(await erzeugeBestand({ startPfad: start, volumePfad: volume }).lies('8000105')).toBeNull();
  });

  it('nimmt das Volume vor dem Startbestand', async () => {
    await lege(start, eintrag('8000105', { name: 'aus dem Start' }));
    await lege(volume, eintrag('8000105', { name: 'vom Volume' }));
    const gefunden = await erzeugeBestand({ startPfad: start, volumePfad: volume }).lies('8000105');
    expect(gefunden?.name).toBe('vom Volume');
    expect(gefunden?.herkunft).toBe('volume');
  });

  it('nimmt den frischen Startbestand vor einem Volume-Eintrag aus alter Abfrageversion', async () => {
    await lege(start, eintrag('8000105', { name: 'neues Image' }));
    await lege(volume, eintrag('8000105', { name: 'alte Abfrage', abfrageVersion: 'alt000000000' }));
    const gefunden = await erzeugeBestand({ startPfad: start, volumePfad: volume }).lies('8000105');
    expect(gefunden?.name).toBe('neues Image');
    expect(gefunden?.herkunft).toBe('start');
  });

  it('nimmt den frischen Startbestand vor einem Volume-Eintrag ueber 30 Tage', async () => {
    const jetzt = () => new Date('2026-12-01T12:00:00Z');
    await lege(start, eintrag('8000105', { name: 'neu gefuellt', geholtAm: '2026-11-25T12:00:00Z' }));
    await lege(volume, eintrag('8000105', { name: 'alt erneuert', geholtAm: '2026-10-20T12:00:00Z' }));
    const gefunden = await erzeugeBestand({ startPfad: start, volumePfad: volume, jetzt }).lies('8000105');
    expect(gefunden?.name).toBe('neu gefuellt');
  });

  it('bleibt beim Volume, wenn auch der Startbestand veraltet ist', async () => {
    await lege(start, eintrag('8000105', { name: 'aus dem Start', abfrageVersion: 'alt000000000' }));
    await lege(volume, eintrag('8000105', { name: 'vom Volume', abfrageVersion: 'alt000000000' }));
    const gefunden = await erzeugeBestand({ startPfad: start, volumePfad: volume }).lies('8000105');
    expect(gefunden?.herkunft).toBe('volume');
  });

  it('faellt auf den Startbestand zurueck', async () => {
    await lege(start, eintrag('8000105'));
    const gefunden = await erzeugeBestand({ startPfad: start, volumePfad: volume }).lies('8000105');
    expect(gefunden?.herkunft).toBe('start');
    expect(gefunden?.osm.elements).toHaveLength(1);
  });

  it('behandelt eine kaputte Datei als fehlend und warnt', async () => {
    mkdirSync(start, { recursive: true });
    writeFileSync(join(start, dateiname('8000105')), 'kein gzip');
    const log = { warn: vi.fn() };
    const gefunden = await erzeugeBestand({ startPfad: start, log }).lies('8000105');
    expect(gefunden).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ degradation: 'osm-bestand-kaputt', schluessel: '8000105' }),
      expect.any(String),
    );
  });

  it('behandelt eine abgeschnittene Datei als fehlend', async () => {
    mkdirSync(start, { recursive: true });
    const voll = await packeEintrag(eintrag('8000105'));
    writeFileSync(join(start, dateiname('8000105')), voll.subarray(0, Math.floor(voll.length / 2)));
    expect(await erzeugeBestand({ startPfad: start }).lies('8000105')).toBeNull();
  });
});

describe('erzeugeBestand – schreiben', () => {
  it('schreibt ohne Volume nichts', async () => {
    const bestand = erzeugeBestand({ startPfad: start });
    expect(bestand.hatVolume).toBe(false);
    expect(await bestand.schreibe(eintrag('8000105'))).toBe(false);
  });

  it('schreibt aufs Volume und liest es wieder', async () => {
    const bestand = erzeugeBestand({ volumePfad: volume });
    expect(bestand.hatVolume).toBe(true);
    expect(await bestand.schreibe(eintrag('8002549', { name: 'Hamburg Hbf' }))).toBe(true);
    expect((await bestand.lies('8002549'))?.name).toBe('Hamburg Hbf');
    expect(readdirSync(volume)).toEqual(['8002549.json.gz']);
  });

  it('arbeitet ohne Volume weiter, wenn der Pfad nicht beschreibbar ist', () => {
    mkdirSync(join(volume, '..'), { recursive: true });
    writeFileSync(volume, 'eine Datei, kein Ordner');
    const log = { warn: vi.fn() };
    const bestand = erzeugeBestand({ volumePfad: volume, log });
    expect(bestand.hatVolume).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ degradation: 'osm-volume-fehlt' }),
      expect.any(String),
    );
  });

  it('meldet einen Schreibfehler und laesst keine Zwischendatei liegen', async () => {
    const log = { warn: vi.fn() };
    const bestand = erzeugeBestand({ volumePfad: volume, log });
    mkdirSync(join(volume, dateiname('8000105'))); // Ziel ist ein Ordner: rename scheitert
    expect(await bestand.schreibe(eintrag('8000105'))).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ degradation: 'osm-volume-schreibfehler', schluessel: '8000105' }),
      expect.any(String),
    );
    expect(readdirSync(volume).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('bleibt lesbar, wenn zwei Anfragen denselben Bahnhof gleichzeitig schreiben', async () => {
    const bestand = erzeugeBestand({ volumePfad: volume });
    await Promise.all([
      bestand.schreibe(eintrag('8000105', { name: 'erste' })),
      bestand.schreibe(eintrag('8000105', { name: 'zweite' })),
    ]);
    const gefunden = await bestand.lies('8000105');
    expect(['erste', 'zweite']).toContain(gefunden?.name);
    expect(readdirSync(volume)).toEqual(['8000105.json.gz']);
  });
});
