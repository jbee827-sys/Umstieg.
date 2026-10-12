# OSM-Bestand – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der erste Aufruf eines Bahnhofs wartet nicht mehr auf Overpass: Startbestand der DB-Preisklassen 1–3 im Image, Gelerntes auf einem Fly-Volume, Erneuerung ab 30 Tagen im Hintergrund, jeder Overpass-Versuch im Log.

**Architecture:** Drei neue Module unter `backend/src/osm/` – `bestand.ts` (Dateien lesen/schreiben, „veraltet"), `erneuerung.ts` (Warteschlange im Hintergrund), `quelle.ts` (Bestand → Overpass, schreibt Gelerntes, stößt Erneuerung an) – plus `version.ts`. `routes/api.ts` holt OSM-Daten nur noch über die Quelle und wirft nach einer Erneuerung die Graph-Cache-Einträge des Bahnhofs heraus. `app.ts` verdrahtet alles aus zwei Einstellungen (`OSM_STARTBESTAND_PFAD`, `OSM_VOLUME_PFAD`); ohne sie verhält sich das Backend wie heute. Ein Skript erzeugt den Startbestand aus der StaDa-Liste.

**Tech Stack:** Node 22, TypeScript (ESM, `.js`-Importendungen), Fastify 5, Vitest, `node:zlib`, `node:fs/promises`, `lru-cache`; Fly.io (Volume, `su-exec` im Alpine-Image).

**Spec:** `docs/superpowers/specs/2026-10-12-osm-bestand-design.md`

## Global Constraints

- Befehle in `backend/`: `npm test`, `npm run lint`, `npm run build`.
- Overpass-Radius 400 m (`OVERPASS_RADIUS_M`); die Abfrage selbst, Instanzreihenfolge und Wartezeiten bleiben unverändert.
- Veraltet: `geholtAm` älter als 30 Tage **oder** `abfrageVersion` ungleich `ABFRAGE_VERSION` (erste 12 Hexzeichen des SHA-256 von `baueOverpassQL(0, 0, 400)`).
- Erneuerung: 10 s Pause zwischen zwei Abrufen, höchstens 50 Aufnahmen je Stunde, höchstens ein Versuch je Bahnhof und Tag.
- Schlüssel = kleinste EVA der Verkehrsstellengruppe; Datei `<Schlüssel>.json.gz` (gzip-JSON mit `schluessel, name, lat, lon, geholtAm, abfrageVersion, osm`).
- Startbestand `backend/osm-bestand/`, im Repo, unter 15 MB; im Image unter `/app/osm-bestand`, `OSM_STARTBESTAND_PFAD=/app/osm-bestand`.
- Volume `osm_daten`, 1 GB, Region `fra`, eingehängt unter `/data`; `OSM_VOLUME_PFAD=/data/osm`. Server läuft als `node`, Startskript per `su-exec`.
- Ohne `OSM_STARTBESTAND_PFAD` und `OSM_VOLUME_PFAD` (lokal, Tests) verhält sich das Backend exakt wie heute.
- Log-Kennungen: `degradation: 'osm-volume-fehlt' | 'osm-bestand-kaputt' | 'osm-volume-schreibfehler' | 'osm-erneuerung-gescheitert'`; `ereignis: 'overpass-versuch'`.
- Testablagen nur unter `backend/.test-ablage/` (gitignored) – nie im Temp-Scratchpad (`CLAUDE.md`).
- Volume anlegen, Fly-Deploy (`--ha=false`) und `git push` nur nach ausdrücklicher Rückfrage.
- Kommentare deutsch; Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Zwei gleichzeitige Erstaufrufe desselben unbekannten Bahnhofs schreiben dieselbe Datei** → sie bleibt lesbar (Zwischendatei + `rename`) – Test in Task 1.
- **Abgeschnittene oder kaputte Datei im Startbestand** → Overpass statt Absturz, Antwort 200 – Tests in Task 1 und Task 4.
- **`OSM_VOLUME_PFAD` gesetzt, aber nicht beschreibbar** → Server startet und antwortet, eine Warnung – Test in Task 5.
- **Neue Abfrageversion macht alle Einträge auf einmal veraltet** → Antworten sofort, Erneuerung höchstens 50 je Stunde – Tests in Task 3 und Task 4.
- **Bahnhof ohne `evas`-Liste** → Schlüssel aus `eva`, kein Absturz – Test in Task 4.

---

### Task 1: `osm/version.ts` und `osm/bestand.ts`

**Files:**
- Create: `backend/src/osm/version.ts`, `backend/src/osm/bestand.ts`
- Modify: `backend/src/clients/overpass.ts` (Konstante `OVERPASS_RADIUS_M` exportieren), `backend/src/routes/api.ts:66` (lokale Konstante entfernen, importieren), `.gitignore`, `.gitattributes`
- Test: `backend/test/osm-bestand.test.ts`

**Interfaces – Produces:**
- `OVERPASS_RADIUS_M = 400` (aus `clients/overpass.ts`)
- `ABFRAGE_VERSION: string`
- `MAX_ALTER_MS`, `schluesselVon(evas: string[]): string`, `dateiname(schluessel: string): string`, `istVeraltet(e: { geholtAm: string; abfrageVersion: string }, jetzt: Date, version?: string): boolean`
- `interface BestandsEintrag { schluessel: string; name: string; lat: number; lon: number; geholtAm: string; abfrageVersion: string; osm: OverpassAntwort }`
- `interface GefundenerEintrag extends BestandsEintrag { herkunft: 'volume' | 'start' }`
- `interface Warner { warn(obj: object, msg: string): void }`
- `interface OsmBestand { readonly hatVolume: boolean; lies(schluessel: string): Promise<GefundenerEintrag | null>; schreibe(eintrag: BestandsEintrag): Promise<boolean> }`
- `packeEintrag(e: BestandsEintrag): Promise<Buffer>`, `entpackeEintrag(roh: Buffer): Promise<BestandsEintrag>`
- `erzeugeBestand(opt?: { startPfad?: string; volumePfad?: string; log?: Warner }): OsmBestand`

- [ ] **Step 1: Ablagen ausschließen, `.gz` als binär**

In `.gitignore` (Wurzel) unter der Zeile `backend/osm-ablage/` ergänzen:

```gitignore
# Testablagen der Backend-Tests (OSM-Bestand) - nie im Temp-Scratchpad
backend/.test-ablage/
```

In `.gitattributes` unter `# Binaerdateien nie anfassen.` ergänzen:

```gitattributes
*.gz binary
```

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`backend/test/osm-bestand.test.ts`:

```ts
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
```

- [ ] **Step 3: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/osm-bestand.test.ts`
Expected: FAIL – `Cannot find module '../src/osm/bestand.js'`

- [ ] **Step 4: `OVERPASS_RADIUS_M` nach `clients/overpass.ts` verlegen**

In `backend/src/clients/overpass.ts` nach `const TIMEOUT_MS = 30_000;` einfügen:

```ts
/** Umkreis der Bahnhofsabfrage. Bestand, Erneuerung und Route nutzen denselben. */
export const OVERPASS_RADIUS_M = 400;
```

In `backend/src/routes/api.ts` die Zeile `const OVERPASS_RADIUS_M = 400;` löschen und den Import ergänzen:

```ts
import { OVERPASS_RADIUS_M } from '../clients/overpass.js';
```

- [ ] **Step 5: `osm/version.ts` schreiben**

```ts
import { createHash } from 'node:crypto';
import { baueOverpassQL, OVERPASS_RADIUS_M } from '../clients/overpass.js';

/**
 * Fassung der Overpass-Abfrage – aus ihr selbst abgeleitet, nicht von Hand
 * gezaehlt. Am 02.10.2026 kamen die Bahnsteigkanten dazu; Daten aus der Zeit
 * davor kennen sie nicht. Aendert sich die Abfrage, aendert sich dieser Wert,
 * und alles Gespeicherte gilt als veraltet.
 */
export const ABFRAGE_VERSION = createHash('sha256')
  .update(baueOverpassQL(0, 0, OVERPASS_RADIUS_M))
  .digest('hex')
  .slice(0, 12);
```

- [ ] **Step 6: `osm/bestand.ts` schreiben**

```ts
import { accessSync, constants, mkdirSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type { OverpassAntwort } from '../core/typen.js';
import { ABFRAGE_VERSION } from './version.js';

const entpacke = promisify(gunzip);
const packe = promisify(gzip);

/** Ab diesem Alter wird im Hintergrund erneuert – benutzt wird der Eintrag weiter. */
export const MAX_ALTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface BestandsEintrag {
  /** Kleinste EVA der Verkehrsstellengruppe – so erkennt der Graph-Cache den Bahnhof. */
  schluessel: string;
  name: string;
  lat: number;
  lon: number;
  geholtAm: string;
  abfrageVersion: string;
  /** Die Overpass-Antwort, unveraendert. */
  osm: OverpassAntwort;
}

export interface GefundenerEintrag extends BestandsEintrag {
  herkunft: 'volume' | 'start';
}

export interface Warner {
  warn(obj: object, msg: string): void;
}

export interface OsmBestand {
  readonly hatVolume: boolean;
  lies(schluessel: string): Promise<GefundenerEintrag | null>;
  /** Nur aufs Volume. `false`, wenn es keins gibt oder das Schreiben scheitert. */
  schreibe(eintrag: BestandsEintrag): Promise<boolean>;
}

export function schluesselVon(evas: string[]): string {
  return [...evas].sort()[0];
}

export function dateiname(schluessel: string): string {
  return `${schluessel}.json.gz`;
}

export function istVeraltet(
  e: { geholtAm: string; abfrageVersion: string },
  jetzt: Date,
  version: string = ABFRAGE_VERSION,
): boolean {
  if (e.abfrageVersion !== version) return true;
  const geholt = Date.parse(e.geholtAm);
  if (!Number.isFinite(geholt)) return true;
  return jetzt.getTime() - geholt > MAX_ALTER_MS;
}

export async function packeEintrag(e: BestandsEintrag): Promise<Buffer> {
  return packe(Buffer.from(JSON.stringify(e), 'utf8'));
}

export async function entpackeEintrag(roh: Buffer): Promise<BestandsEintrag> {
  const e = JSON.parse((await entpacke(roh)).toString('utf8')) as Partial<BestandsEintrag>;
  if (
    typeof e.schluessel !== 'string' ||
    typeof e.geholtAm !== 'string' ||
    typeof e.abfrageVersion !== 'string' ||
    !Array.isArray(e.osm?.elements)
  ) {
    throw new Error('Bestandsdatei unvollstaendig');
  }
  return e as BestandsEintrag;
}

const STILL: Warner = { warn: () => {} };

/**
 * Zwei Ablagen: der Startbestand im Image (nur lesen) und das Volume (lesen
 * und schreiben). Das Volume gewinnt – dort liegt, was das Backend selbst
 * geholt oder erneuert hat. Nichts hier darf eine Anfrage scheitern lassen:
 * Jeder Fehler wird zu „nicht vorhanden" oder „nicht geschrieben".
 */
export function erzeugeBestand(
  opt: { startPfad?: string; volumePfad?: string; log?: Warner } = {},
): OsmBestand {
  const log = opt.log ?? STILL;
  let volume = opt.volumePfad;
  if (volume) {
    try {
      mkdirSync(volume, { recursive: true });
      accessSync(volume, constants.W_OK);
    } catch (e) {
      log.warn(
        { degradation: 'osm-volume-fehlt', pfad: volume, grund: String(e) },
        'OSM-Volume nicht beschreibbar - ohne Volume weiter',
      );
      volume = undefined;
    }
  }

  async function lese(
    ordner: string,
    schluessel: string,
    herkunft: GefundenerEintrag['herkunft'],
  ): Promise<GefundenerEintrag | null> {
    let roh: Buffer;
    try {
      roh = await readFile(join(ordner, dateiname(schluessel)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn(
          { degradation: 'osm-bestand-kaputt', schluessel, herkunft, grund: String(e) },
          'OSM-Bestandsdatei nicht lesbar - wie fehlend behandelt',
        );
      }
      return null;
    }
    try {
      return { ...(await entpackeEintrag(roh)), herkunft };
    } catch (e) {
      log.warn(
        { degradation: 'osm-bestand-kaputt', schluessel, herkunft, grund: String(e) },
        'OSM-Bestandsdatei unlesbar - wie fehlend behandelt',
      );
      return null;
    }
  }

  return {
    hatVolume: volume !== undefined,

    async lies(schluessel) {
      if (volume) {
        const vomVolume = await lese(volume, schluessel, 'volume');
        if (vomVolume) return vomVolume;
      }
      return opt.startPfad ? lese(opt.startPfad, schluessel, 'start') : null;
    },

    async schreibe(eintrag) {
      if (!volume) return false;
      const ziel = join(volume, dateiname(eintrag.schluessel));
      // Erst daneben schreiben, dann umbenennen: Zwei gleichzeitige Schreiber
      // hinterlassen so eine ganze Datei, nie eine halbe.
      const zwischen = `${ziel}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      try {
        await writeFile(zwischen, await packeEintrag(eintrag));
        await rename(zwischen, ziel);
        return true;
      } catch (e) {
        log.warn(
          { degradation: 'osm-volume-schreibfehler', schluessel: eintrag.schluessel, grund: String(e) },
          'OSM-Bestand nicht geschrieben',
        );
        await rm(zwischen, { force: true }).catch(() => {});
        return false;
      }
    },
  };
}
```

- [ ] **Step 7: Test laufen lassen, er muss bestehen**

Run: `cd backend && npx vitest run test/osm-bestand.test.ts`
Expected: PASS (16 Tests)

- [ ] **Step 8: Gesamte Suite und Lint**

Run: `cd backend && npm test && npm run lint`
Expected: alle Tests grün (vorher 463), Lint sauber

- [ ] **Step 9: Commit**

```bash
git add .gitignore .gitattributes backend/src/osm/version.ts backend/src/osm/bestand.ts backend/src/clients/overpass.ts backend/src/routes/api.ts backend/test/osm-bestand.test.ts
git commit -m "feat(backend): OSM-Bestand - Dateien lesen und schreiben, veraltet erkennen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Overpass-Versuche einzeln protokollieren

**Files:**
- Modify: `backend/src/clients/overpass.ts`, `backend/src/app.ts` (Verdrahtung des Standard-Overpass-Clients)
- Test: `backend/test/overpass.test.ts` (ergänzen)

**Interfaces – Produces:**
- `interface OverpassVersuch { instanz: string; versuch: number; ok: boolean; status?: number; fehler?: string; dauerMs: number }`
- `overpassQuery(lat, lon, radiusM, fetchFn = fetch, retryWartezeitMs = 2000, beiVersuch?: (v: OverpassVersuch) => void)`
- `interface VersuchsLogger { info(obj: object, msg: string): void; warn(obj: object, msg: string): void }`
- `protokolliereVersuch(log: VersuchsLogger): (v: OverpassVersuch) => void`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Am Ende von `backend/test/overpass.test.ts` ergänzen (Import oben um `protokolliereVersuch, type OverpassVersuch` erweitern):

```ts
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
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/overpass.test.ts`
Expected: FAIL – `protokolliereVersuch` ist nicht exportiert / `versuche` bleibt leer

- [ ] **Step 3: `overpassQuery` um das Protokoll erweitern**

In `backend/src/clients/overpass.ts` vor `export async function overpassQuery` einfügen:

```ts
/**
 * Ein einzelner Versuch. Bis zum 12.10.2026 kannte das Log nur den Fehler des
 * LETZTEN Versuchs – bei Berlin Ostkreuz stand dort ein Timeout des
 * Ersatzservers, was der Hauptserver vorher geantwortet hatte, blieb unbekannt.
 */
export interface OverpassVersuch {
  /** Host der Instanz, z. B. "overpass-api.de". */
  instanz: string;
  /** 1 bis 4 in der Reihenfolge der Instanzen. */
  versuch: number;
  ok: boolean;
  status?: number;
  fehler?: string;
  dauerMs: number;
}

export interface VersuchsLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export function protokolliereVersuch(log: VersuchsLogger): (v: OverpassVersuch) => void {
  return (v) => {
    const eintrag = { ereignis: 'overpass-versuch', ...v };
    if (v.ok) log.info(eintrag, 'Overpass-Versuch');
    else log.warn(eintrag, 'Overpass-Versuch');
  };
}
```

`overpassQuery` ersetzen durch:

```ts
export async function overpassQuery(
  lat: number,
  lon: number,
  radiusM: number,
  fetchFn: typeof fetch = fetch,
  retryWartezeitMs = 2000,
  beiVersuch?: (v: OverpassVersuch) => void,
): Promise<OverpassAntwort> {
  const ql = baueOverpassQL(lat, lon, radiusM);
  const versuche = instanzReihenfolge();
  let letzterFehler: unknown;

  for (let i = 0; i < versuche.length; i++) {
    if (i > 0 && retryWartezeitMs > 0) {
      await new Promise((r) => setTimeout(r, retryWartezeitMs));
    }
    const instanz = new URL(versuche[i]).host;
    const beginn = Date.now();
    let status: number | undefined;
    try {
      const res = await fetchFn(versuche[i], {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(ql)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const antwort = (await res.json()) as OverpassAntwort;
      beiVersuch?.({ instanz, versuch: i + 1, ok: true, status, dauerMs: Date.now() - beginn });
      return antwort;
    } catch (e) {
      letzterFehler = e;
      beiVersuch?.({
        instanz,
        versuch: i + 1,
        ok: false,
        status,
        fehler: String(e).slice(0, 200),
        dauerMs: Date.now() - beginn,
      });
    }
  }
  throw new Error(`Overpass nicht erreichbar: ${String(letzterFehler)}`);
}
```

- [ ] **Step 4: Standard-Client in `app.ts` protokollieren lassen**

Import in `backend/src/app.ts` ändern zu:

```ts
import { overpassQuery, protokolliereVersuch } from './clients/overpass.js';
```

Die Zeile `overpass: clients.overpass ?? ((lat, lon, radiusM) => overpassQuery(lat, lon, radiusM)),` ersetzen durch:

```ts
      overpass:
        clients.overpass ??
        ((lat, lon, radiusM) =>
          overpassQuery(lat, lon, radiusM, fetch, 2000, protokolliereVersuch(instanz.log))),
```

- [ ] **Step 5: Tests und Lint**

Run: `cd backend && npx vitest run test/overpass.test.ts && npm test && npm run lint`
Expected: PASS, Suite grün, Lint sauber

- [ ] **Step 6: Commit**

```bash
git add backend/src/clients/overpass.ts backend/src/app.ts backend/test/overpass.test.ts
git commit -m "feat(backend): jeden Overpass-Versuch mit Instanz, Status und Dauer protokollieren" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `osm/erneuerung.ts` – Hintergrund-Erneuerung

**Files:**
- Create: `backend/src/osm/erneuerung.ts`
- Test: `backend/test/osm-erneuerung.test.ts`

**Interfaces:**
- Consumes: `OsmBestand`, `BestandsEintrag`, `Warner` (Task 1); `ABFRAGE_VERSION` (Task 1); `OVERPASS_RADIUS_M` (Task 1); `OverpassFn` aus `routes/api.ts` (nur Typ)
- Produces:
  - `interface ErneuerungsAuftrag { schluessel: string; name: string; lat: number; lon: number; evas: string[] }`
  - `interface OsmErneuerung { stosseAn(a: ErneuerungsAuftrag): void; beiErneuert(fn: (a: ErneuerungsAuftrag) => void): void; leerlauf(): Promise<void> }`
  - `PAUSE_MS = 10_000`, `MAX_PRO_STUNDE = 50`, `SPERRE_MS = 24 h`
  - `erzeugeErneuerung(o: { bestand: OsmBestand; overpass: OverpassFn; log?: Warner; jetzt?: () => Date; warte?: (ms: number) => Promise<void>; pauseMs?: number; maxProStunde?: number; sperreMs?: number }): OsmErneuerung`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`backend/test/osm-erneuerung.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { erzeugeErneuerung, type ErneuerungsAuftrag } from '../src/osm/erneuerung.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { BestandsEintrag, OsmBestand } from '../src/osm/bestand.js';
import type { OverpassAntwort } from '../src/core/typen.js';

const OSM = { elements: [] } as unknown as OverpassAntwort;

function auftrag(schluessel: string): ErneuerungsAuftrag {
  return { schluessel, name: `Bahnhof ${schluessel}`, lat: 52, lon: 13, evas: [schluessel] };
}

function aufbau({ overpassWirft = false, schreibtNicht = false } = {}) {
  let uhr = Date.parse('2026-10-12T12:00:00Z');
  const geschrieben: BestandsEintrag[] = [];
  const bestand: OsmBestand = {
    hatVolume: true,
    lies: vi.fn(async () => null),
    schreibe: vi.fn(async (e: BestandsEintrag) => {
      geschrieben.push(e);
      return !schreibtNicht;
    }),
  };
  const overpass = vi.fn(async () => {
    if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
    return OSM;
  });
  const warte = vi.fn(async () => {});
  const log = { warn: vi.fn() };
  const erneuerung = erzeugeErneuerung({ bestand, overpass, log, warte, jetzt: () => new Date(uhr) });
  return {
    erneuerung,
    bestand,
    overpass,
    warte,
    log,
    geschrieben,
    stelleUhr: (ms: number) => {
      uhr += ms;
    },
  };
}

describe('Hintergrund-Erneuerung', () => {
  it('holt, schreibt in der aktuellen Version und meldet den Erfolg', async () => {
    const a = aufbau();
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledWith(52, 13, 400);
    expect(a.geschrieben[0]).toMatchObject({
      schluessel: '8002549',
      abfrageVersion: ABFRAGE_VERSION,
      geholtAm: '2026-10-12T12:00:00.000Z',
    });
    expect(erneuert).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8002549' }));
  });

  it('nimmt denselben Bahnhof nicht doppelt auf', async () => {
    const a = aufbau();
    a.erneuerung.stosseAn(auftrag('8002549'));
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(1);
  });

  it('wartet 10 s zwischen zwei Abrufen, nicht vor dem ersten', async () => {
    const a = aufbau();
    a.erneuerung.stosseAn(auftrag('8002549'));
    a.erneuerung.stosseAn(auftrag('8000105'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(2);
    expect(a.warte).toHaveBeenCalledTimes(1);
    expect(a.warte).toHaveBeenCalledWith(10_000);
  });

  it('nimmt hoechstens 50 Bahnhoefe je Stunde auf', async () => {
    const a = aufbau();
    for (let i = 0; i < 60; i++) a.erneuerung.stosseAn(auftrag(String(8000100 + i)));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(50);
    a.stelleUhr(60 * 60 * 1000);
    a.erneuerung.stosseAn(auftrag('8000999'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(51);
  });

  it('versucht einen gescheiterten Bahnhof erst nach einem Tag wieder', async () => {
    const a = aufbau({ overpassWirft: true });
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.bestand.schreibe).not.toHaveBeenCalled();
    expect(erneuert).not.toHaveBeenCalled();
    expect(a.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ degradation: 'osm-erneuerung-gescheitert', schluessel: '8002549' }),
      expect.any(String),
    );

    a.stelleUhr(23 * 60 * 60 * 1000);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(1);

    a.stelleUhr(2 * 60 * 60 * 1000);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(a.overpass).toHaveBeenCalledTimes(2);
  });

  it('meldet keinen Erfolg, wenn nicht geschrieben wurde', async () => {
    const a = aufbau({ schreibtNicht: true });
    const erneuert = vi.fn();
    a.erneuerung.beiErneuert(erneuert);
    a.erneuerung.stosseAn(auftrag('8002549'));
    await a.erneuerung.leerlauf();
    expect(erneuert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/osm-erneuerung.test.ts`
Expected: FAIL – `Cannot find module '../src/osm/erneuerung.js'`

- [ ] **Step 3: `osm/erneuerung.ts` schreiben**

```ts
import { OVERPASS_RADIUS_M } from '../clients/overpass.js';
import type { OverpassFn } from '../routes/api.js';
import type { OsmBestand, Warner } from './bestand.js';
import { ABFRAGE_VERSION } from './version.js';

export const PAUSE_MS = 10_000;
export const MAX_PRO_STUNDE = 50;
export const SPERRE_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;

export interface ErneuerungsAuftrag {
  schluessel: string;
  name: string;
  lat: number;
  lon: number;
  /** Alle Verkehrsstellen – deren Graph-Cache-Eintraege fallen nach einer Erneuerung heraus. */
  evas: string[];
}

export interface OsmErneuerung {
  stosseAn(auftrag: ErneuerungsAuftrag): void;
  beiErneuert(fn: (auftrag: ErneuerungsAuftrag) => void): void;
  /** Wartet, bis die Warteschlange leer ist – fuer Tests. */
  leerlauf(): Promise<void>;
}

const STILL: Warner = { warn: () => {} };

/**
 * Erneuert veraltete Bahnhoefe, ohne dass jemand darauf wartet.
 *
 * Hoeflich gegenueber dem oeffentlichen Overpass: einer nach dem anderen,
 * 10 s Pause, hoechstens 50 Aufnahmen je Stunde – nach einem Deploy mit einer
 * neuen Abfrageversion waeren sonst alle Bahnhoefe auf einmal veraltet. Ein
 * Bahnhof wird hoechstens einmal am Tag versucht; scheitert es, bleiben seine
 * alten Daten.
 */
export function erzeugeErneuerung(o: {
  bestand: OsmBestand;
  overpass: OverpassFn;
  log?: Warner;
  jetzt?: () => Date;
  warte?: (ms: number) => Promise<void>;
  pauseMs?: number;
  maxProStunde?: number;
  sperreMs?: number;
}): OsmErneuerung {
  const log = o.log ?? STILL;
  const jetzt = o.jetzt ?? (() => new Date());
  const warte =
    o.warte ??
    ((ms: number) =>
      new Promise<void>((r) => {
        setTimeout(r, ms).unref();
      }));
  const pauseMs = o.pauseMs ?? PAUSE_MS;
  const maxProStunde = o.maxProStunde ?? MAX_PRO_STUNDE;
  const sperreMs = o.sperreMs ?? SPERRE_MS;

  const warteschlange: ErneuerungsAuftrag[] = [];
  const wartend = new Set<string>();
  const letzterVersuch = new Map<string, number>();
  const aufnahmen: number[] = [];
  const abonnenten: ((a: ErneuerungsAuftrag) => void)[] = [];
  let lauf: Promise<void> | null = null;

  async function erneuere(a: ErneuerungsAuftrag): Promise<void> {
    letzterVersuch.set(a.schluessel, jetzt().getTime());
    try {
      const osm = await o.overpass(a.lat, a.lon, OVERPASS_RADIUS_M);
      const geschrieben = await o.bestand.schreibe({
        schluessel: a.schluessel,
        name: a.name,
        lat: a.lat,
        lon: a.lon,
        geholtAm: jetzt().toISOString(),
        abfrageVersion: ABFRAGE_VERSION,
        osm,
      });
      if (!geschrieben) return;
      for (const fn of abonnenten) {
        try {
          fn(a);
        } catch {
          // Ein Abonnent darf die Warteschlange nicht anhalten.
        }
      }
    } catch (e) {
      log.warn(
        { degradation: 'osm-erneuerung-gescheitert', schluessel: a.schluessel, bahnhof: a.name, grund: String(e) },
        'OSM-Erneuerung gescheitert - alte Daten bleiben',
      );
    } finally {
      wartend.delete(a.schluessel);
    }
  }

  async function arbeite(): Promise<void> {
    let erster = true;
    while (warteschlange.length > 0) {
      if (!erster) await warte(pauseMs);
      erster = false;
      await erneuere(warteschlange.shift() as ErneuerungsAuftrag);
    }
  }

  function starte(): void {
    if (lauf) return;
    lauf = arbeite().finally(() => {
      lauf = null;
      // Was zwischen dem letzten Blick in die Schlange und hier kam, bleibt nicht liegen.
      if (warteschlange.length > 0) starte();
    });
  }

  return {
    stosseAn(a) {
      const t = jetzt().getTime();
      if (wartend.has(a.schluessel)) return;
      const letzter = letzterVersuch.get(a.schluessel);
      if (letzter !== undefined && t - letzter < sperreMs) return;
      while (aufnahmen.length > 0 && t - aufnahmen[0] >= STUNDE_MS) aufnahmen.shift();
      if (aufnahmen.length >= maxProStunde) return;
      aufnahmen.push(t);
      wartend.add(a.schluessel);
      warteschlange.push(a);
      starte();
    },
    beiErneuert(fn) {
      abonnenten.push(fn);
    },
    async leerlauf() {
      while (lauf) await lauf;
    },
  };
}
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `cd backend && npx vitest run test/osm-erneuerung.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Suite und Lint**

Run: `cd backend && npm test && npm run lint`
Expected: grün, sauber

- [ ] **Step 6: Commit**

```bash
git add backend/src/osm/erneuerung.ts backend/test/osm-erneuerung.test.ts
git commit -m "feat(backend): Hintergrund-Erneuerung veralteter OSM-Daten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `osm/quelle.ts` und Einbau in `/api/route`

**Files:**
- Create: `backend/src/osm/quelle.ts`
- Modify: `backend/src/routes/api.ts` (`ApiClients`, `registriereApiRouten`, `baueGraphEintrag`), `backend/src/app.ts` (`osmQuelle` aus den Clients weiterreichen)
- Test: `backend/test/osm-quelle.test.ts`, `backend/test/api-bestand.test.ts`

**Interfaces:**
- Consumes: Task 1 (`OsmBestand`, `schluesselVon`, `istVeraltet`, `ABFRAGE_VERSION`, `erzeugeBestand`, `packeEintrag`, `dateiname`), Task 3 (`OsmErneuerung`, `ErneuerungsAuftrag`)
- Produces:
  - `interface OsmQuelle { hole(info: StationsInfo): Promise<OverpassAntwort>; beiErneuert(fn: (a: ErneuerungsAuftrag) => void): void }`
  - `erzeugeOsmQuelle(o: { bestand: OsmBestand; erneuerung: OsmErneuerung | null; overpass: OverpassFn; jetzt?: () => Date }): OsmQuelle`
  - `ApiClients.osmQuelle?: OsmQuelle`

- [ ] **Step 1: Unit-Test der Quelle schreiben**

`backend/test/osm-quelle.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { erzeugeOsmQuelle } from '../src/osm/quelle.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { GefundenerEintrag, OsmBestand } from '../src/osm/bestand.js';
import type { OsmErneuerung } from '../src/osm/erneuerung.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

const AUS_BESTAND = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] } as unknown as OverpassAntwort;
const AUS_OVERPASS = { elements: [{ type: 'node', id: 2, lat: 0, lon: 0 }] } as unknown as OverpassAntwort;
const JETZT = new Date('2026-10-12T12:00:00Z');

const berlin: StationsInfo = {
  eva: '8098160',
  evas: ['8098160', '8011160', '8089021'],
  name: 'Berlin Hbf',
  lat: 52.525,
  lon: 13.369,
  gleise: [],
};

function gefunden(ueber: Partial<GefundenerEintrag> = {}): GefundenerEintrag {
  return {
    schluessel: '8011160',
    name: 'Berlin Hbf',
    lat: 52.525,
    lon: 13.369,
    geholtAm: '2026-10-10T12:00:00.000Z',
    abfrageVersion: ABFRAGE_VERSION,
    osm: AUS_BESTAND,
    herkunft: 'start',
    ...ueber,
  };
}

function aufbau(liest: GefundenerEintrag | null, { overpassWirft = false } = {}) {
  const bestand: OsmBestand = {
    hatVolume: true,
    lies: vi.fn(async () => liest),
    schreibe: vi.fn(async () => true),
  };
  const erneuerung: OsmErneuerung = { stosseAn: vi.fn(), beiErneuert: vi.fn(), leerlauf: async () => {} };
  const overpass = vi.fn(async () => {
    if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
    return AUS_OVERPASS;
  });
  const quelle = erzeugeOsmQuelle({ bestand, erneuerung, overpass, jetzt: () => JETZT });
  return { quelle, bestand, erneuerung, overpass };
}

describe('OSM-Quelle', () => {
  it('fragt den Bestand unter der kleinsten EVA der Gruppe', async () => {
    const a = aufbau(gefunden());
    await a.quelle.hole(berlin);
    expect(a.bestand.lies).toHaveBeenCalledWith('8011160');
  });

  it('nimmt frische Bestandsdaten ohne Overpass und ohne Erneuerung', async () => {
    const a = aufbau(gefunden());
    expect(await a.quelle.hole(berlin)).toBe(AUS_BESTAND);
    expect(a.overpass).not.toHaveBeenCalled();
    expect(a.erneuerung.stosseAn).not.toHaveBeenCalled();
  });

  it('nimmt alte Bestandsdaten sofort und stoesst die Erneuerung an', async () => {
    const a = aufbau(gefunden({ geholtAm: '2026-09-01T12:00:00.000Z' }));
    expect(await a.quelle.hole(berlin)).toBe(AUS_BESTAND);
    expect(a.erneuerung.stosseAn).toHaveBeenCalledWith({
      schluessel: '8011160',
      name: 'Berlin Hbf',
      lat: 52.525,
      lon: 13.369,
      evas: ['8098160', '8011160', '8089021'],
    });
  });

  it('stoesst die Erneuerung auch bei fremder Abfrageversion an', async () => {
    const a = aufbau(gefunden({ abfrageVersion: 'alt000000000' }));
    await a.quelle.hole(berlin);
    expect(a.erneuerung.stosseAn).toHaveBeenCalled();
  });

  it('holt einen fehlenden Bahnhof von Overpass und schreibt ihn', async () => {
    const a = aufbau(null);
    expect(await a.quelle.hole(berlin)).toBe(AUS_OVERPASS);
    expect(a.overpass).toHaveBeenCalledWith(52.525, 13.369, 400);
    expect(a.bestand.schreibe).toHaveBeenCalledWith({
      schluessel: '8011160',
      name: 'Berlin Hbf',
      lat: 52.525,
      lon: 13.369,
      geholtAm: '2026-10-12T12:00:00.000Z',
      abfrageVersion: ABFRAGE_VERSION,
      osm: AUS_OVERPASS,
    });
  });

  it('reicht einen Overpass-Fehler weiter und schreibt nichts', async () => {
    const a = aufbau(null, { overpassWirft: true });
    await expect(a.quelle.hole(berlin)).rejects.toThrow(/Overpass nicht erreichbar/);
    expect(a.bestand.schreibe).not.toHaveBeenCalled();
  });

  it('wirft ohne Koordinaten', async () => {
    const a = aufbau(null);
    await expect(a.quelle.hole({ ...berlin, lat: undefined, lon: undefined })).rejects.toThrow(
      /keine Koordinaten/,
    );
  });

  it('nimmt die eigene EVA als Schluessel, wenn die Gruppe leer ist', async () => {
    const a = aufbau(null);
    await a.quelle.hole({ ...berlin, evas: [] });
    expect(a.bestand.lies).toHaveBeenCalledWith('8098160');
  });

  it('kommt ohne Erneuerung aus', async () => {
    const bestand: OsmBestand = {
      hatVolume: false,
      lies: vi.fn(async () => gefunden({ geholtAm: '2026-01-01T00:00:00.000Z' })),
      schreibe: vi.fn(async () => false),
    };
    const quelle = erzeugeOsmQuelle({ bestand, erneuerung: null, overpass: vi.fn(), jetzt: () => JETZT });
    expect(await quelle.hole(berlin)).toBe(AUS_BESTAND);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/osm-quelle.test.ts`
Expected: FAIL – `Cannot find module '../src/osm/quelle.js'`

- [ ] **Step 3: `osm/quelle.ts` schreiben**

```ts
import { OVERPASS_RADIUS_M } from '../clients/overpass.js';
import type { OverpassAntwort, StationsInfo } from '../core/typen.js';
import type { OverpassFn } from '../routes/api.js';
import { istVeraltet, schluesselVon, type OsmBestand } from './bestand.js';
import type { ErneuerungsAuftrag, OsmErneuerung } from './erneuerung.js';
import { ABFRAGE_VERSION } from './version.js';

export interface OsmQuelle {
  /** OSM-Daten des Bahnhofs – aus dem Bestand, sonst von Overpass. Wirft wie Overpass. */
  hole(info: StationsInfo): Promise<OverpassAntwort>;
  beiErneuert(fn: (auftrag: ErneuerungsAuftrag) => void): void;
}

/**
 * Bestand vor Overpass (Spec 2026-10-12, Abschnitt 4). Was aus dem Bestand
 * kommt, wird immer sofort benutzt – auch veraltet; die Erneuerung laeuft
 * dahinter. Was von Overpass kommt, wird gespeichert, damit es das letzte Mal
 * war.
 */
export function erzeugeOsmQuelle(o: {
  bestand: OsmBestand;
  erneuerung: OsmErneuerung | null;
  overpass: OverpassFn;
  jetzt?: () => Date;
}): OsmQuelle {
  const jetzt = o.jetzt ?? (() => new Date());
  return {
    async hole(info) {
      if (info.lat === undefined || info.lon === undefined) {
        throw new Error('keine Koordinaten zum Bahnhof');
      }
      const evas = info.evas.length > 0 ? info.evas : [info.eva];
      const auftrag: ErneuerungsAuftrag = {
        schluessel: schluesselVon(evas),
        name: info.name,
        lat: info.lat,
        lon: info.lon,
        evas,
      };
      const gefunden = await o.bestand.lies(auftrag.schluessel);
      if (gefunden) {
        if (istVeraltet(gefunden, jetzt())) o.erneuerung?.stosseAn(auftrag);
        return gefunden.osm;
      }
      const osm = await o.overpass(info.lat, info.lon, OVERPASS_RADIUS_M);
      // Der Bestand warnt selbst, wenn das Schreiben scheitert – die Antwort geht trotzdem raus.
      await o.bestand.schreibe({
        schluessel: auftrag.schluessel,
        name: auftrag.name,
        lat: auftrag.lat,
        lon: auftrag.lon,
        geholtAm: jetzt().toISOString(),
        abfrageVersion: ABFRAGE_VERSION,
        osm,
      });
      return osm;
    },
    beiErneuert(fn) {
      o.erneuerung?.beiErneuert(fn);
    },
  };
}
```

- [ ] **Step 4: Unit-Test laufen lassen, er muss bestehen**

Run: `cd backend && npx vitest run test/osm-quelle.test.ts`
Expected: PASS (9 Tests)

- [ ] **Step 5: Integrationstest für `/api/route` schreiben**

`backend/test/api-bestand.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { dateiname, erzeugeBestand, packeEintrag, type OsmBestand } from '../src/osm/bestand.js';
import { erzeugeOsmQuelle } from '../src/osm/quelle.js';
import type { ErneuerungsAuftrag, OsmErneuerung } from '../src/osm/erneuerung.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { OverpassAntwort, RouteErgebnis, StationsInfo } from '../src/core/typen.js';

const WURZEL = fileURLToPath(new URL('../.test-ablage/api-bestand/', import.meta.url));
const miniOsm = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)), 'utf8'),
) as OverpassAntwort;

const ministadt: StationsInfo = {
  eva: '8000001',
  evas: ['8000001'],
  stationID: '4711',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

function clients() {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => miniOsm),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

const ROUTE = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function ordner(name: string): string {
  return join(WURZEL, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function legeStart(dir: string, ueber: { geholtAm?: string; inhalt?: Buffer } = {}): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const roh =
    ueber.inhalt ??
    (await packeEintrag({
      schluessel: '8000001',
      name: 'Ministadt',
      lat: 52,
      lon: 12,
      geholtAm: ueber.geholtAm ?? new Date().toISOString(),
      abfrageVersion: ABFRAGE_VERSION,
      osm: miniOsm,
    }));
  writeFileSync(join(dir, dateiname('8000001')), roh);
}

afterEach(() => rmSync(WURZEL, { recursive: true, force: true }));

describe('/api/route mit OSM-Bestand', () => {
  it('liest einen Bahnhof aus dem Bestand und fragt Overpass nicht', async () => {
    const start = ordner('start');
    await legeStart(start);
    const c = clients();
    const osmQuelle = erzeugeOsmQuelle({
      bestand: erzeugeBestand({ startPfad: start }),
      erneuerung: null,
      overpass: c.overpass,
    });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect((res.json() as RouteErgebnis).stufe).toBe(1);
    expect(c.overpass).not.toHaveBeenCalled();
  });

  it('holt einen fehlenden Bahnhof von Overpass und legt ihn aufs Volume', async () => {
    const volume = ordner('volume');
    const c = clients();
    const osmQuelle = erzeugeOsmQuelle({
      bestand: erzeugeBestand({ volumePfad: volume }),
      erneuerung: null,
      overpass: c.overpass,
    });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).toHaveBeenCalledTimes(1);
    expect(existsSync(join(volume, dateiname('8000001')))).toBe(true);
  });

  it('nimmt Overpass, wenn die Datei im Startbestand kaputt ist', async () => {
    const start = ordner('start');
    await legeStart(start, { inhalt: Buffer.from('abgeschnitten') });
    const c = clients();
    const osmQuelle = erzeugeOsmQuelle({
      bestand: erzeugeBestand({ startPfad: start }),
      erneuerung: null,
      overpass: c.overpass,
    });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).toHaveBeenCalledTimes(1);
  });

  it('antwortet bei veralteten Daten sofort und stoesst die Erneuerung an', async () => {
    const start = ordner('start');
    await legeStart(start, { geholtAm: '2026-01-01T00:00:00.000Z' });
    const c = clients();
    const erneuerung: OsmErneuerung = { stosseAn: vi.fn(), beiErneuert: vi.fn(), leerlauf: async () => {} };
    const osmQuelle = erzeugeOsmQuelle({ bestand: erzeugeBestand({ startPfad: start }), erneuerung, overpass: c.overpass });
    const res = await buildApp({ ...c, osmQuelle } as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).not.toHaveBeenCalled();
    expect(erneuerung.stosseAn).toHaveBeenCalledWith(expect.objectContaining({ schluessel: '8000001' }));
  });

  it('baut nach einer gelungenen Erneuerung neu', async () => {
    const c = clients();
    let melde: ((a: ErneuerungsAuftrag) => void) | undefined;
    const erneuerung: OsmErneuerung = {
      stosseAn: vi.fn(),
      beiErneuert: (fn) => {
        melde = fn;
      },
      leerlauf: async () => {},
    };
    const bestand: OsmBestand = {
      hatVolume: true,
      lies: vi.fn(async () => ({
        schluessel: '8000001',
        name: 'Ministadt',
        lat: 52,
        lon: 12,
        geholtAm: new Date().toISOString(),
        abfrageVersion: ABFRAGE_VERSION,
        osm: miniOsm,
        herkunft: 'volume' as const,
      })),
      schreibe: vi.fn(async () => true),
    };
    const app = buildApp({ ...c, osmQuelle: erzeugeOsmQuelle({ bestand, erneuerung, overpass: c.overpass }) } as never);

    await app.inject({ method: 'GET', url: ROUTE });
    await app.inject({ method: 'GET', url: ROUTE });
    expect(bestand.lies).toHaveBeenCalledTimes(1); // zweite Anfrage aus dem Graph-Cache

    melde?.({ schluessel: '8000001', name: 'Ministadt', lat: 52, lon: 12, evas: ['8000001'] });
    await app.inject({ method: 'GET', url: ROUTE });
    expect(bestand.lies).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/api-bestand.test.ts`
Expected: FAIL – Overpass wird trotz Bestand gerufen (`osmQuelle` wird noch ignoriert)

- [ ] **Step 7: Quelle in `routes/api.ts` einbauen**

Imports ergänzen:

```ts
import { erzeugeBestand } from '../osm/bestand.js';
import { erzeugeOsmQuelle, type OsmQuelle } from '../osm/quelle.js';
```

`ApiClients` erweitern:

```ts
export interface ApiClients {
  overpass: OverpassFn;
  stations: StationsClient;
  tafel: TafelFn;
  wagenposition: WagenpositionFn;
  fasta: FastaFn;
  /**
   * Bestand vor Overpass (Spec 2026-10-12). Ohne Angabe ein leerer Bestand –
   * dann fragt jede Route Overpass wie bisher.
   */
  osmQuelle?: OsmQuelle;
}
```

In `registriereApiRouten` direkt nach `const graphCache = erzeugeCache<GraphEintrag>(100, GRAPH_TTL_MS);` einfügen:

```ts
  const osmQuelle =
    clients.osmQuelle ??
    erzeugeOsmQuelle({ bestand: erzeugeBestand(), erneuerung: null, overpass: clients.overpass });
  // Nach einer Erneuerung im Hintergrund baut die naechste Anfrage aus den
  // frischen Daten - sonst hielte der Graph-Cache die alten noch bis zu 24 h.
  osmQuelle.beiErneuert((a) => {
    for (const eva of a.evas) graphCache.delete(eva);
    graphCache.delete([...a.evas].sort().join(','));
  });
```

Den Aufruf `baueGraphEintrag(info, clients.overpass, clients.fasta, req.log)` ersetzen durch:

```ts
            baueGraphEintrag(info, osmQuelle, clients.fasta, req.log),
```

In `baueGraphEintrag` die Signatur und den Overpass-Aufruf ändern:

```ts
async function baueGraphEintrag(
  info: StationsInfo,
  osmQuelle: OsmQuelle,
  fasta: FastaFn,
  log: FastifyBaseLogger,
): Promise<GraphEintrag> {
  let grund = 'keine Koordinaten zum Bahnhof';
  if (info.lat !== undefined && info.lon !== undefined) {
    try {
      const osm = await osmQuelle.hole(info);
```

(Der restliche Körper bleibt; `OVERPASS_RADIUS_M` wird in `api.ts` danach nicht mehr gebraucht – den Import aus Task 1 entfernen, falls der Linter ihn als unbenutzt meldet.)

In `backend/src/app.ts` reicht `buildApp` die Clients feldweise an `registriereApiRouten` weiter – `osmQuelle` muss dazu, sonst kommt sie aus den Tests nie an. Im Objekt von `registriereApiRouten(instanz, { ... })` nach der `overpass`-Angabe ergänzen:

```ts
      osmQuelle: clients.osmQuelle,
```

(Task 5 ersetzt diese Zeile durch die Verdrahtung aus den Einstellungen.)

- [ ] **Step 8: Tests laufen lassen, sie müssen bestehen**

Run: `cd backend && npx vitest run test/osm-quelle.test.ts test/api-bestand.test.ts`
Expected: PASS (14 Tests)

- [ ] **Step 9: Suite und Lint – die bestehenden Route-Tests bleiben unverändert grün**

Run: `cd backend && npm test && npm run lint`
Expected: grün (insbesondere `api.test.ts`, `protokoll.test.ts`, `degradation.test.ts` ohne Änderung), Lint sauber

- [ ] **Step 10: Commit**

```bash
git add backend/src/osm/quelle.ts backend/src/routes/api.ts backend/src/app.ts backend/test/osm-quelle.test.ts backend/test/api-bestand.test.ts
git commit -m "feat(backend): /api/route holt OSM-Daten aus dem Bestand vor Overpass" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verdrahtung in `buildApp` über die Einstellungen

**Files:**
- Modify: `backend/src/app.ts`
- Test: `backend/test/osm-verdrahtung.test.ts`

**Interfaces:**
- Consumes: `erzeugeBestand` (Task 1), `erzeugeErneuerung` (Task 3), `erzeugeOsmQuelle` (Task 4), `protokolliereVersuch` (Task 2)
- Produces: Umgebungsvariablen `OSM_STARTBESTAND_PFAD`, `OSM_VOLUME_PFAD`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`backend/test/osm-verdrahtung.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { dateiname, packeEintrag } from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

const WURZEL = fileURLToPath(new URL('../.test-ablage/osm-verdrahtung/', import.meta.url));
const miniOsm = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)), 'utf8'),
) as OverpassAntwort;
const ministadt: StationsInfo = {
  eva: '8000001', evas: ['8000001'], stationID: '4711', name: 'Ministadt', lat: 52, lon: 12,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};
const ROUTE = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function clients() {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => miniOsm),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

const ordner = (name: string) => join(WURZEL, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(WURZEL, { recursive: true, force: true });
});

describe('buildApp: OSM-Bestand aus den Einstellungen', () => {
  it('fragt ohne Einstellungen Overpass wie bisher', async () => {
    const c = clients();
    await buildApp(c as never).inject({ method: 'GET', url: ROUTE });
    expect(c.overpass).toHaveBeenCalledTimes(1);
  });

  it('liest mit OSM_STARTBESTAND_PFAD aus dem Startbestand', async () => {
    const start = ordner('start');
    mkdirSync(start, { recursive: true });
    writeFileSync(
      join(start, dateiname('8000001')),
      await packeEintrag({
        schluessel: '8000001', name: 'Ministadt', lat: 52, lon: 12,
        geholtAm: new Date().toISOString(), abfrageVersion: ABFRAGE_VERSION, osm: miniOsm,
      }),
    );
    vi.stubEnv('OSM_STARTBESTAND_PFAD', start);
    const c = clients();
    const res = await buildApp(c as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).not.toHaveBeenCalled();
  });

  it('lernt mit OSM_VOLUME_PFAD dazu', async () => {
    const volume = ordner('volume');
    vi.stubEnv('OSM_VOLUME_PFAD', volume);
    await buildApp(clients() as never).inject({ method: 'GET', url: ROUTE });
    expect(existsSync(join(volume, dateiname('8000001')))).toBe(true);
  });

  it('startet und antwortet, wenn das Volume nicht beschreibbar ist', async () => {
    const volume = ordner('volume');
    mkdirSync(join(volume, '..'), { recursive: true });
    writeFileSync(volume, 'eine Datei, kein Ordner');
    vi.stubEnv('OSM_VOLUME_PFAD', volume);
    const c = clients();
    const res = await buildApp(c as never).inject({ method: 'GET', url: ROUTE });
    expect(res.statusCode).toBe(200);
    expect(c.overpass).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/osm-verdrahtung.test.ts`
Expected: FAIL – Startbestand und Volume werden noch nicht gelesen

- [ ] **Step 3: `app.ts` verdrahten**

Imports ergänzen:

```ts
import { erzeugeBestand } from './osm/bestand.js';
import { erzeugeErneuerung } from './osm/erneuerung.js';
import { erzeugeOsmQuelle } from './osm/quelle.js';
import type { OverpassFn } from './routes/api.js';
```

Im `app.register(async (instanz) => { ... })` vor `registriereApiRouten(instanz, {` einfügen:

```ts
    const overpass: OverpassFn =
      clients.overpass ??
      ((lat, lon, radiusM) =>
        overpassQuery(lat, lon, radiusM, fetch, 2000, protokolliereVersuch(instanz.log)));
    /*
     * OSM-Bestand (Spec 2026-10-12): Startbestand im Image, Gelerntes auf dem
     * Volume. Beide nur ueber Einstellungen - ohne sie (lokal, Tests) bleibt
     * alles wie bisher. Die Tests nutzen 8000001 als Test-EVA; das ist Aachen
     * Hbf und liegt im Startbestand.
     */
    const bestand = erzeugeBestand({
      startPfad: process.env.OSM_STARTBESTAND_PFAD || undefined,
      volumePfad: process.env.OSM_VOLUME_PFAD || undefined,
      log: instanz.log,
    });
    const erneuerung = bestand.hatVolume
      ? erzeugeErneuerung({ bestand, overpass, log: instanz.log })
      : null;
```

In `registriereApiRouten(instanz, { ... })` die `overpass`-Zeilen aus Task 2 und die Zeile `osmQuelle: clients.osmQuelle,` aus Task 4 ersetzen durch:

```ts
      overpass,
      osmQuelle: clients.osmQuelle ?? erzeugeOsmQuelle({ bestand, erneuerung, overpass }),
```

- [ ] **Step 4: Tests laufen lassen, sie müssen bestehen**

Run: `cd backend && npx vitest run test/osm-verdrahtung.test.ts && npm test && npm run lint && npm run build`
Expected: PASS, Suite grün, Lint sauber, Build grün

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.ts backend/test/osm-verdrahtung.test.ts
git commit -m "feat(backend): OSM-Bestand ueber OSM_STARTBESTAND_PFAD und OSM_VOLUME_PFAD einschalten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Skript `bestand-fuellen.ts` und StaDa-Endpunkt

**Files:**
- Modify: `backend/src/clients/db-endpunkte.ts`
- Create: `backend/scripts/bestand-fuellen.ts`
- Test: `backend/test/bestand-fuellen.test.ts`

**Interfaces:**
- Consumes: `holeStationsInfo` (`clients/stations.ts`), `dbAuthHeader`, `overpassQuery`, `OVERPASS_RADIUS_M`, Task 1 (`packeEintrag`, `entpackeEintrag`, `dateiname`, `schluesselVon`, `ABFRAGE_VERSION`)
- Produces: `STADA_BASIS`, `epStadaStationen(kategorien: string): string`; `interface StadaStation { name: string; priceCategory?: number; evaNumbers?: { number: number; isMain?: boolean }[] }`; `hauptEva(s: StadaStation): string | null`; `BESTAND` (Pfad `backend/osm-bestand/`)

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`backend/test/bestand-fuellen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hauptEva } from '../scripts/bestand-fuellen.js';
import { epStadaStationen } from '../src/clients/db-endpunkte.js';

describe('bestand-fuellen', () => {
  it('fragt StaDa nach den Preisklassen', () => {
    expect(epStadaStationen('1-3')).toBe(
      'https://apis.deutschebahn.com/db-api-marketplace/apis/station-data/v2/stations?category=1-3',
    );
  });

  it('nimmt die Haupt-EVA', () => {
    expect(
      hauptEva({ name: 'X', evaNumbers: [{ number: 8098160 }, { number: 8011160, isMain: true }] }),
    ).toBe('8011160');
  });

  it('nimmt sonst die erste EVA', () => {
    expect(hauptEva({ name: 'X', evaNumbers: [{ number: 8000105 }] })).toBe('8000105');
  });

  it('liefert null ohne EVA', () => {
    expect(hauptEva({ name: 'X', evaNumbers: [] })).toBeNull();
    expect(hauptEva({ name: 'X' })).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/bestand-fuellen.test.ts`
Expected: FAIL – Modul bzw. `epStadaStationen` fehlt

- [ ] **Step 3: StaDa-Endpunkt ergänzen**

In `backend/src/clients/db-endpunkte.ts` nach `epPlatforms` einfügen:

```ts
// StaDa (Station Data v2): Bahnhoefe mit Preisklasse. Nur fuer das Skript
// `bestand-fuellen.ts` - am 12.10.2026 mit dem vorhandenen Zugang geprueft:
// `category=1-3` liefert 382 Bahnhoefe.
export const STADA_BASIS = 'https://apis.deutschebahn.com/db-api-marketplace/apis/station-data/v2';

export const epStadaStationen = (kategorien: string): string =>
  `${STADA_BASIS}/stations?category=${encodeURIComponent(kategorien)}`;
```

- [ ] **Step 4: Skript schreiben**

`backend/scripts/bestand-fuellen.ts`:

```ts
// Fuellt den STARTBESTAND des Backends (Spec 2026-10-12, Abschnitt 7) - die
// OSM-Daten aller Bahnhoefe der DB-Preisklassen 1-3, gepackt unter
// `backend/osm-bestand/`. Der Bestand liegt im Repo und im Image.
//
// Laeuft lokal, nicht im Betrieb: rund eine Stunde mit Pausen. Ueberspringt,
// was in der aktuellen Abfrageversion schon liegt - nach einem Abbruch einfach
// neu starten.
//
// Aufruf (aus backend/):  npx tsx scripts/bestand-fuellen.ts
// Bei toten Overpass-Spiegeln den Ersatz vorgeben, z. B.:
//   OVERPASS_URL_FALLBACK=https://maps.mail.ru/osm/tools/overpass/api/interpreter npx tsx scripts/bestand-fuellen.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epStadaStationen } from '../src/clients/db-endpunkte.js';
import { OVERPASS_RADIUS_M, overpassQuery } from '../src/clients/overpass.js';
import { dbAuthHeader, holeStationsInfo } from '../src/clients/stations.js';
import type { StationsInfo } from '../src/core/typen.js';
import { dateiname, entpackeEintrag, packeEintrag, schluesselVon } from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';
import { ladeSecrets } from './secrets.js';

export const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));

export interface StadaStation {
  name: string;
  priceCategory?: number;
  evaNumbers?: { number: number; isMain?: boolean }[];
}

export function hauptEva(s: StadaStation): string | null {
  const evas = s.evaNumbers ?? [];
  const haupt = evas.find((e) => e.isMain) ?? evas[0];
  return haupt ? String(haupt.number) : null;
}

const PAUSE_MS = 8000;
const PAUSE_DB_MS = 1500;
const PAUSE_NACH_FEHLER_MS = 45_000;
const VERSUCHE = 3;
const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function holeStadaListe(): Promise<StadaStation[]> {
  const res = await fetch(epStadaStationen('1-3'), {
    headers: { ...dbAuthHeader(), Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`StaDa: HTTP ${res.status}`);
  const j = (await res.json()) as { result?: StadaStation[] };
  return j.result ?? [];
}

async function liegtAktuell(pfad: string): Promise<boolean> {
  if (!existsSync(pfad)) return false;
  try {
    return (await entpackeEintrag(readFileSync(pfad))).abfrageVersion === ABFRAGE_VERSION;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  ladeSecrets();
  mkdirSync(BESTAND, { recursive: true });
  const stationen = await holeStadaListe();
  console.log(`${stationen.length} Bahnhoefe der Preisklassen 1-3, Abfrageversion ${ABFRAGE_VERSION}`);

  const erledigt = new Set<string>();
  let geholt = 0;
  const gescheitert: string[] = [];
  for (const [i, s] of stationen.entries()) {
    const kopf = `[${i + 1}/${stationen.length}] ${s.name}`;
    const eva = hauptEva(s);
    if (!eva) {
      gescheitert.push(`${s.name}: keine EVA`);
      continue;
    }
    let info: StationsInfo;
    try {
      info = await holeStationsInfo(eva);
      await warte(PAUSE_DB_MS); // die DB-API drosselt schneller als Overpass
    } catch (e) {
      console.log(`${kopf} … Stationsauskunft: ${String(e).slice(0, 80)}`);
      gescheitert.push(`${s.name}: Stationsauskunft`);
      await warte(PAUSE_NACH_FEHLER_MS);
      continue;
    }
    if (info.lat === undefined || info.lon === undefined) {
      gescheitert.push(`${s.name}: keine Koordinaten`);
      continue;
    }
    const schluessel = schluesselVon(info.evas.length > 0 ? info.evas : [info.eva]);
    if (erledigt.has(schluessel)) {
      console.log(`${kopf} … derselbe Bahnhof wie zuvor (${schluessel})`);
      continue;
    }
    erledigt.add(schluessel);
    const pfad = join(BESTAND, dateiname(schluessel));
    if (await liegtAktuell(pfad)) {
      console.log(`${kopf} … liegt schon (${schluessel})`);
      continue;
    }
    let ok = false;
    for (let versuch = 1; versuch <= VERSUCHE && !ok; versuch++) {
      try {
        const osm = await overpassQuery(info.lat, info.lon, OVERPASS_RADIUS_M);
        writeFileSync(
          pfad,
          await packeEintrag({
            schluessel,
            name: info.name,
            lat: info.lat,
            lon: info.lon,
            geholtAm: new Date().toISOString(),
            abfrageVersion: ABFRAGE_VERSION,
            osm,
          }),
        );
        console.log(`${kopf} … geholt (${schluessel}, ${osm.elements.length} Elemente)`);
        geholt++;
        ok = true;
        await warte(PAUSE_MS);
      } catch (e) {
        console.log(`${kopf} … Versuch ${versuch}: ${String(e).slice(0, 70)}`);
        await warte(PAUSE_NACH_FEHLER_MS * versuch);
      }
    }
    if (!ok) gescheitert.push(`${s.name}: Overpass nach ${VERSUCHE} Versuchen`);
  }
  console.log(`\nFERTIG: ${geholt} neu geholt, ${gescheitert.length} gescheitert`);
  for (const g of gescheitert) console.log('  ' + g);
}

// Nur als Skript laufen, nicht beim Import durch die Tests.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('bestand-fuellen.ts')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Test laufen lassen, er muss bestehen**

Run: `cd backend && npx vitest run test/bestand-fuellen.test.ts && npm test && npm run lint`
Expected: PASS (4 Tests), Suite grün, Lint sauber

- [ ] **Step 6: Commit**

```bash
git add backend/src/clients/db-endpunkte.ts backend/scripts/bestand-fuellen.ts backend/test/bestand-fuellen.test.ts
git commit -m "feat(backend): Skript bestand-fuellen - Startbestand aus der StaDa-Liste" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Startbestand erzeugen und festhalten

**Files:**
- Create: `backend/osm-bestand/*.json.gz` (vom Skript)
- Test: `backend/test/osm-startbestand.test.ts`

**Interfaces:**
- Consumes: Task 1 (`entpackeEintrag`, `ABFRAGE_VERSION`), Task 6 (Skript)

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`backend/test/osm-startbestand.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entpackeEintrag } from '../src/osm/bestand.js';
import { ABFRAGE_VERSION } from '../src/osm/version.js';

const BESTAND = fileURLToPath(new URL('../osm-bestand/', import.meta.url));
const dateien = (() => {
  try {
    return readdirSync(BESTAND).filter((n) => n.endsWith('.json.gz'));
  } catch {
    return [];
  }
})();

describe('Startbestand im Repo', () => {
  it('hat mindestens 350 Bahnhoefe', () => {
    expect(dateien.length).toBeGreaterThanOrEqual(350);
  });

  it('bleibt unter 15 MB', () => {
    const summe = dateien.reduce((s, n) => s + statSync(join(BESTAND, n)).size, 0);
    expect(summe).toBeLessThan(15 * 1024 * 1024);
  });

  it('ist durchweg in der aktuellen Abfrageversion und heisst wie sein Schluessel', async () => {
    for (const n of dateien) {
      const e = await entpackeEintrag(readFileSync(join(BESTAND, n)));
      expect(e.abfrageVersion, n).toBe(ABFRAGE_VERSION);
      expect(`${e.schluessel}.json.gz`).toBe(n);
    }
  });

  it('enthaelt die Metropolen', async () => {
    const namen = new Set<string>();
    for (const n of dateien) namen.add((await entpackeEintrag(readFileSync(join(BESTAND, n)))).name);
    for (const muster of [/^Berlin Hbf$/, /^Hamburg Hbf$/, /^Frankfurt ?\(Main\) ?Hbf$/, /^München Hbf$/, /^Köln Hbf$/]) {
      expect([...namen].some((n) => muster.test(n)), String(muster)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/osm-startbestand.test.ts`
Expected: FAIL – `0` Dateien

- [ ] **Step 3: Skript im Hintergrund laufen lassen (rund eine Stunde)**

Run (aus `backend/`, im Hintergrund, Ausgabe in die gitignorte Ablage):

```bash
OVERPASS_URL_FALLBACK=https://maps.mail.ru/osm/tools/overpass/api/interpreter npx tsx scripts/bestand-fuellen.ts > osm-ablage/bestand-lauf.log 2>&1
```

Expected: am Ende `FERTIG: … neu geholt, … gescheitert`. Bleiben Bahnhöfe mit „Overpass nach 3 Versuchen", dasselbe Kommando noch einmal starten – es holt nur die fehlenden. Bahnhöfe mit „keine Koordinaten" oder „keine EVA" bleiben draußen und werden im README genannt.

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `cd backend && npx vitest run test/osm-startbestand.test.ts`
Expected: PASS (4 Tests). Schlägt „Metropolen" fehl: `node -e` mit `entpackeEintrag` über die Dateien laufen lassen, den tatsächlichen Namen ablesen und das Muster anpassen – nicht den Bestand.

- [ ] **Step 5: Größe und Anzahl festhalten, dann committen**

Run: `cd backend && du -sh osm-bestand && ls osm-bestand | wc -l`

```bash
git add backend/osm-bestand backend/test/osm-startbestand.test.ts
git commit -m "feat(backend): Startbestand - OSM-Daten der Preisklassen 1-3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docker-Image, Startskript und Fly-Volume

**Files:**
- Modify: `backend/Dockerfile`, `backend/fly.toml`
- Create: `backend/docker-start.sh`
- Test: `backend/test/betrieb.test.ts`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`backend/test/betrieb.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lies = (datei: string) => readFileSync(fileURLToPath(new URL(`../${datei}`, import.meta.url)), 'utf8');

describe('Betrieb: OSM-Bestand im Image, Gelerntes auf dem Volume', () => {
  it('kopiert den Startbestand ins Image und nennt seinen Pfad', () => {
    const d = lies('Dockerfile');
    expect(d).toContain('COPY osm-bestand ./osm-bestand');
    expect(d).toContain('ENV OSM_STARTBESTAND_PFAD=/app/osm-bestand');
  });

  it('startet ueber das Startskript und gibt die Rechte erst dort ab', () => {
    const d = lies('Dockerfile');
    expect(d).toContain('apk add --no-cache su-exec');
    expect(d).toContain('ENTRYPOINT ["/usr/local/bin/docker-start.sh"]');
    expect(d).not.toMatch(/^USER node$/m);
    const s = lies('docker-start.sh');
    expect(s).toContain('chown -R node:node "$OSM_VOLUME_PFAD"');
    expect(s).toContain('exec su-exec node "$@"');
    expect(s).not.toContain('\r');
  });

  it('haengt das Volume ein und nennt den Pfad', () => {
    const f = lies('fly.toml');
    expect(f).toMatch(/\[mounts\]\s*\n\s*source = "osm_daten"\s*\n\s*destination = "\/data"/);
    expect(f).toContain('OSM_VOLUME_PFAD = "/data/osm"');
  });

  it('schliesst den Startbestand nicht vom Build aus', () => {
    expect(lies('.dockerignore')).not.toContain('osm-bestand');
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `cd backend && npx vitest run test/betrieb.test.ts`
Expected: FAIL – Dockerfile ohne `COPY osm-bestand`, `docker-start.sh` fehlt

- [ ] **Step 3: Startskript schreiben**

`backend/docker-start.sh` (LF-Zeilenenden über `.gitattributes`):

```sh
#!/bin/sh
# Startskript des Backend-Containers (Spec 2026-10-12, Abschnitt 8).
#
# Fly haengt das Volume als root ein; der Server laeuft aber bewusst nicht als
# root. Deshalb: als root den Ablageordner anlegen und an `node` uebergeben,
# dann den Server per su-exec als `node` starten.
set -e
if [ -n "$OSM_VOLUME_PFAD" ]; then
  mkdir -p "$OSM_VOLUME_PFAD"
  chown -R node:node "$OSM_VOLUME_PFAD"
fi
exec su-exec node "$@"
```

- [ ] **Step 4: Dockerfile anpassen**

In der Stufe `runtime` von `backend/Dockerfile`:

- nach `ENV NODE_ENV=production` ergänzen:

```dockerfile
ENV OSM_STARTBESTAND_PFAD=/app/osm-bestand
RUN apk add --no-cache su-exec
```

- nach `COPY --from=build /app/dist ./dist` ergänzen:

```dockerfile
# Startbestand der OSM-Daten (Preisklassen 1-3) - Bahnhoefe ohne Warten auf Overpass.
COPY osm-bestand ./osm-bestand

COPY docker-start.sh /usr/local/bin/docker-start.sh
RUN chmod +x /usr/local/bin/docker-start.sh
```

- die Zeilen `# Nicht als root laufen.` und `USER node` ersetzen durch:

```dockerfile
# Nicht als root laufen: Das Startskript gibt die Rechte per su-exec an `node`
# ab, nachdem es das Volume beschreibbar gemacht hat.
ENTRYPOINT ["/usr/local/bin/docker-start.sh"]
```

`CMD ["node", "dist/server.js"]` bleibt am Ende stehen.

- [ ] **Step 5: `fly.toml` anpassen**

Im Block `[env]` ergänzen:

```toml
  OSM_VOLUME_PFAD = "/data/osm"
```

Am Ende der Datei ergänzen:

```toml
# OSM-Bestand (Spec 2026-10-12): was das Backend selbst holt oder erneuert,
# ueberlebt Neustarts und Deploys. Ein Volume gehoert zu genau einer Maschine
# - passend zu --ha=false.
[mounts]
  source = "osm_daten"
  destination = "/data"
```

- [ ] **Step 6: Tests, Lint, Build**

Run: `cd backend && npx vitest run test/betrieb.test.ts && npm test && npm run lint && npm run build`
Expected: PASS, alles grün

- [ ] **Step 7: Commit**

```bash
git add backend/Dockerfile backend/fly.toml backend/docker-start.sh backend/test/betrieb.test.ts
git commit -m "feat(backend): Startbestand im Image, Fly-Volume fuer Gelerntes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Dokumentation

**Files:**
- Modify: `docs/deployment.md`, `README.md`

- [ ] **Step 1: `docs/deployment.md` ergänzen**

Neuen Abschnitt „OSM-Bestand und Volume" mit genau diesem Inhalt anlegen (an die Stelle hinter dem Fly-Deploy):

```markdown
## OSM-Bestand und Volume (seit 12.10.2026)

Das Backend holt OSM-Daten nicht mehr bei jedem ersten Aufruf von Overpass:

1. Graph-Cache im Arbeitsspeicher (24 h)
2. Volume `/data/osm` – was das Backend selbst geholt oder erneuert hat
3. Startbestand `/app/osm-bestand` – Preisklassen 1–3, im Image
4. Overpass – Ergebnis landet auf dem Volume

Daten älter als 30 Tage oder aus einer älteren Abfrageversion werden sofort
benutzt und im Hintergrund erneuert (10 s Pause, höchstens 50 je Stunde, ein
Versuch je Bahnhof und Tag).

**Einmalig: Volume anlegen**

    flyctl volumes create osm_daten --size 1 --region fra -a umstieg-backend

**Startbestand erneuern** (nötig, wenn sich die Overpass-Abfrage ändert –
der Test `osm-startbestand.test.ts` schlägt dann an):

    cd backend
    npx tsx scripts/bestand-fuellen.ts
    # tote Spiegel: OVERPASS_URL_FALLBACK=https://maps.mail.ru/osm/tools/overpass/api/interpreter voranstellen

Danach `backend/osm-bestand/` committen und deployen.

**Prüfen:** In den Fly-Logs steht jeder Overpass-Versuch einzeln
(`ereignis: overpass-versuch`), Probleme mit dem Bestand als
`degradation: osm-volume-fehlt | osm-bestand-kaputt | osm-volume-schreibfehler | osm-erneuerung-gescheitert`.
```

- [ ] **Step 2: README „Hier weitermachen" ergänzen**

Oben unter `## Hier weitermachen (Stand 12.10.2026)` einen Block mit: Anlass (Messwerte aus Spec §2), was gebaut ist (Tasks 1–8, Commits), Anzahl und Größe des Startbestands (aus Task 7 Step 5), gescheiterte Bahnhöfe aus dem Skriptlauf, Teststand (`npm test` – Anzahl), Status **nicht deployt**.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment.md README.md
git commit -m "docs: OSM-Bestand und Volume in deployment.md und README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ausliefern und im Betrieb prüfen (nur nach Rückfrage)

**Files:** keine Codeänderung; README-Nachtrag am Ende

- [ ] **Step 1: Rückfrage** – Volume anlegen (Kosten ~0,15 $/Monat), Fly-Deploy, `git push`. Ohne ausdrückliches Ja nicht weiter.

- [ ] **Step 2: Volume anlegen und Maschine prüfen**

Run:

```bash
flyctl volumes create osm_daten --size 1 --region fra -a umstieg-backend
flyctl machines list -a umstieg-backend
```

Expected: ein Volume in `fra`, genau eine Maschine in `fra`.

- [ ] **Step 3: Deployen**

Run: `flyctl deploy E:\jbeer\Claude-code\Umstieg\backend --ha=false`
Expected: eine Maschine, gesund, Volume `osm_daten` eingehängt. Meldet Fly, dass die bestehende Maschine kein Volume hat: abbrechen, Meldung dem Nutzer zeigen und das weitere Vorgehen (Maschine mit Volume neu anlegen) mit ihm klären.

- [ ] **Step 4: Prüfung 1 – Startbestand**

Run:

```bash
for e in 8002549 8000105; do curl -s -o /dev/null -w "$e %{http_code} %{time_total}s\n" -H "Origin: https://www.umstieg.online" "https://umstieg-backend.fly.dev/api/route?eva=$e&gleisAn=5&gleisAb=8&profil=normal&variante=schnellste&abschnitt=mitte"; done
```

Expected: 200, jeweils **unter 1 s** (vorher 35,9 s / 4,6 s). Darüber: Dauer der Stationsauskunft in den Logs prüfen und im README festhalten.

- [ ] **Step 5: Prüfung 2 und 3 – Lernen und Neustart**

Einen kleinen Bahnhof außerhalb des Bestands abfragen (EVA aus `/api/stations?q=Wiesenburg`), dann:

```bash
flyctl ssh console -a umstieg-backend -C "ls -la /data/osm"
flyctl machines restart <id> -a umstieg-backend
```

Danach denselben Bahnhof erneut abfragen. Expected: Datei liegt auf dem Volume; zweite Abfrage nach dem Neustart schnell.

- [ ] **Step 6: Prüfung 4 – Logs**

Run: `flyctl logs -a umstieg-backend --no-tail | grep -E "overpass-versuch|osm-"`
Expected: der Overpass-Abruf aus Step 5 als einzelne Versuche.

- [ ] **Step 7: README nachtragen, committen, pushen (nach Rückfrage)**

README-Block aus Task 9 auf „ausgeliefert" setzen, mit den Messwerten aus Step 4–6. Committen; `git push origin feat/mvp:main`, nach dem Vercel-Build `git push origin feat/mvp` (nacheinander, siehe README zur Vercel-Störung vom 12.10.).
