import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { holeGruppe, holeStationsInfo } from '../src/clients/stations.js';
import { graphTtlMs, GRAPH_TTL_MS, NOTBEHELF_TTL_MS } from '../src/cache/lru.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

/**
 * Eine unvollstaendige Gleisliste ist nicht dasselbe wie ein unbekanntes
 * Gleis - und der Unterschied entscheidet, was der Nutzer zu lesen bekommt.
 *
 * Berlin Hbf sind drei Verkehrsstellen. Gleis 6 steht unter 8098160, Gleis 14
 * unter 8011160. Faellt die Gleisliste von 8098160 aus, fehlt Gleis 6 in der
 * Vereinigung. Die Route Gleis 6 -> 14 endete dann in 404 "gleis-unbekannt",
 * und das Frontend sagte: "Eines der Gleise wurde an diesem Bahnhof nicht
 * gefunden." Das ist eine selbstbewusste Falschaussage. Gleis 6 gibt es; wir
 * konnten nur nicht danach fragen.
 *
 * Der Zaehler dafuer (`gleisteileOhneAntwort`) wurde am 02.09.2026 eingebaut -
 * aber von niemandem gelesen. Diese Tests schliessen die Luecke.
 */

function ladeFixture(name: string): unknown {
  const pfad = fileURLToPath(new URL(`./fixtures/db/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

const miniOsm = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)),
    'utf8',
  ),
) as OverpassAntwort;

/**
 * Echte Berlin-Fixtures, aber ausgewaehlte Endpunkte antworten mit einem
 * Fehler. `kaputtePlatforms` trifft die Gleisliste einzelner Mitglieder,
 * `sucheKaputt` die Gruppenaufloesung selbst.
 */
function berlinMock({ kaputtePlatforms = [] as string[], sucheKaputt = false } = {}): typeof fetch {
  return vi.fn(async (eingabe: RequestInfo | URL) => {
    const url = String(eingabe);
    if (url.includes('/stop-places/by-name/')) {
      if (sucheKaputt) return new Response('kaputt', { status: 503 });
      return new Response(JSON.stringify(ladeFixture('gruppe-suche-berlin')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const treffer = /\/(stop-places|platforms)\/(\d+)/.exec(url);
    if (!treffer) throw new Error(`unerwartete URL im Test: ${url}`);
    const [, endpunkt, eva] = treffer;
    if (endpunkt === 'platforms' && kaputtePlatforms.includes(eva)) {
      return new Response('kaputt', { status: 502 });
    }
    return new Response(
      JSON.stringify(ladeFixture(`gruppe-${endpunkt === 'platforms' ? 'pf' : 'sp'}-${eva}`)),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
}

describe('Die Gleisliste sagt, ob sie vollstaendig ist', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('vermerkt einen ausgefallenen Bahnhofsteil', async () => {
    const info = await holeStationsInfo('8011160', berlinMock({ kaputtePlatforms: ['8098160'] }));
    expect(info.gleisteileOhneAntwort).toBe(1);
    // Gleis 6 liegt auf 8098160 - es fehlt jetzt, und das ist der Punkt.
    expect(info.gleise.map((g) => g.gleis)).not.toContain('6');
  });

  it('vermerkt eine gescheiterte Gruppenaufloesung', async () => {
    // Hier antwortet die eine abgefragte Gleisliste sauber - der Zaehler
    // bleibt also 0. Unvollstaendig ist die Liste trotzdem: Zwei der drei
    // Verkehrsstellen wurden nie gefragt.
    const info = await holeStationsInfo('8011160', berlinMock({ sucheKaputt: true }));
    expect(info.gleisteileOhneAntwort).toBe(0);
    expect(info.gruppeUnvollstaendig).toBe(true);
  });

  it('schweigt, wenn wirklich alles da ist', async () => {
    const info = await holeStationsInfo('8011160', berlinMock());
    expect(info.gleisteileOhneAntwort).toBe(0);
    expect(info.gruppeUnvollstaendig).toBeFalsy();
  });

  it('bleibt bei Teilausfall bedienbar', async () => {
    const info = await holeStationsInfo('8011160', berlinMock({ kaputtePlatforms: ['8098160'] }));
    expect(info.name).toBeTruthy();
    expect(info.gleise.map((g) => g.gleis)).toContain('14');
  });
});

/**
 * `holeGruppe` verschluckte den Ausfall der Namenssuche und gab still
 * `[eva]` zurueck. Der Aufrufer in api.ts protokolliert `gruppe-unbekannt`
 * aber nur in seinem `catch` - der damit nie erreicht wurde. Das Log war auf
 * dem Hauptpfad tot; gruen war sein Test nur, weil das Mock warf.
 *
 * Wer zurueckfaellt, entscheidet der Aufrufer. Er ist der Einzige, der einen
 * Logger hat.
 */
describe('holeGruppe verschweigt den Ausfall nicht', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reicht einen Ausfall der Namenssuche nach oben durch', async () => {
    await expect(holeGruppe('8011160', berlinMock({ sucheKaputt: true }))).rejects.toThrow();
  });

  it('liefert die Gruppe, wenn die Suche antwortet', async () => {
    const evas = await holeGruppe('8011160', berlinMock());
    expect([...evas].sort()).toEqual(['8011160', '8089021', '8098160']);
  });
});

// ---------------------------------------------------------------------------
// Was der Nutzer zu lesen bekommt
// ---------------------------------------------------------------------------

function clientsMitInfo(info: StationsInfo) {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => miniOsm),
    stations: {
      holeStationsInfo: vi.fn(async () => info),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

const basis: StationsInfo = {
  eva: '8000001',
  evas: ['8000001'],
  stationID: '4711',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

const routeZu = (gleisAb: string) =>
  `/api/route?eva=8000001&gleisAn=1&gleisAb=${gleisAb}&profil=normal&variante=schnellste`;

describe('Unbekanntes Gleis oder ungefragtes Gleis', () => {
  it('sagt bei vollstaendiger Liste weiterhin "gleis-unbekannt"', async () => {
    // Die Gegenprobe. Ist die Liste vollstaendig, ist "kenne ich nicht" die
    // richtige Auskunft - sie darf durch den Fix nicht verschwinden.
    const app = buildApp(clientsMitInfo(basis) as never);
    const res = await app.inject({ method: 'GET', url: routeZu('99') });
    expect(res.statusCode).toBe(404);
    expect(res.json().fehler).toBe('gleis-unbekannt');
  });

  it('gesteht bei unvollstaendiger Liste ein, dass es nicht fragen konnte', async () => {
    const app = buildApp(clientsMitInfo({ ...basis, gleisteileOhneAntwort: 1 }) as never);
    const res = await app.inject({ method: 'GET', url: routeZu('99') });

    expect(res.json().fehler).toBe('gleisliste-unvollstaendig');
    // 503, nicht 404: Nicht die Anfrage ist falsch, die Quelle ist gerade weg.
    expect(res.statusCode).toBe(503);
  });

  it('gilt auch, wenn die Gruppe unvollstaendig blieb', async () => {
    const app = buildApp(clientsMitInfo({ ...basis, gruppeUnvollstaendig: true }) as never);
    const res = await app.inject({ method: 'GET', url: routeZu('99') });
    expect(res.json().fehler).toBe('gleisliste-unvollstaendig');
  });

  it('laesst eine gefundene Route unberuehrt', async () => {
    // Unvollstaendig heisst nicht unbrauchbar: Was da ist, wird geroutet.
    const app = buildApp(clientsMitInfo({ ...basis, gleisteileOhneAntwort: 1 }) as never);
    const res = await app.inject({ method: 'GET', url: routeZu('2') });
    expect(res.statusCode).toBe(200);
  });
});

/**
 * Die Frist hing bisher allein an der Graphqualitaet. Ein sauberer OSM-Graph
 * mit unvollstaendiger Gleisliste bekam damit die vollen 24 Stunden - der
 * Teilausfall von RIS::Stations wurde einen Tag lang konserviert, lange nach
 * der Erholung der Quelle.
 */
describe('Unvollstaendige Stationsdaten altern schnell', () => {
  it('haelt einen guten Graphen weiterhin lange', () => {
    expect(graphTtlMs(1, false)).toBe(GRAPH_TTL_MS);
  });

  it('kuerzt die Frist, wenn die Gleisliste Luecken hat', () => {
    expect(graphTtlMs(1, true)).toBe(NOTBEHELF_TTL_MS);
  });

  it('laesst den Notbehelf kurz, egal wie vollstaendig die Liste ist', () => {
    expect(graphTtlMs(3, false)).toBe(NOTBEHELF_TTL_MS);
  });
});
