import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { holeStationsInfo } from '../src/clients/stations.js';
import type { TafelEintrag } from '../src/core/typen.js';

/**
 * Verkehrsstellengruppen (RIS::Stations `groupMembers`).
 *
 * Grosse Bahnhoefe sind mehrere Verkehrsstellen. Berlin Hbf ist drei:
 * 8011160 (Halle, Gleis 11-14), 8098160 (tief, Gleis 1-8) und 8089021
 * (S-Bahn, Gleis 15/16). Kein einzelnes EVA kennt Gleis 6 UND 14 - genau
 * der Umstieg, um den es geht.
 *
 * Alle Fixtures in diesem Test sind am 31.08.2026 von der echten API
 * aufgezeichnet, nicht handgebaut.
 */

function ladeFixture(name: string): unknown {
  const pfad = fileURLToPath(new URL(`./fixtures/db/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

/** Zaehlt die Aufrufe je Endpunkt, damit Tests die Abrufe belegen koennen. */
interface GruppenMock {
  fetch: typeof fetch;
  urls: string[];
}

function gruppenMock(): GruppenMock {
  const urls: string[] = [];
  const fetchFn = vi.fn(async (eingabe: RequestInfo | URL) => {
    const url = String(eingabe);
    urls.push(url);
    let fixture: unknown;
    if (url.includes('/stop-places/by-name/')) {
      fixture = ladeFixture('gruppe-suche-berlin');
    } else {
      const treffer = /\/(stop-places|platforms)\/(\d+)/.exec(url);
      if (!treffer) throw new Error(`unerwartete URL im Test: ${url}`);
      const [, endpunkt, eva] = treffer;
      fixture = ladeFixture(`gruppe-${endpunkt === 'platforms' ? 'pf' : 'sp'}-${eva}`);
    }
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, urls };
}

describe('Verkehrsstellengruppe', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fuehrt die Gleise aller Verkehrsstellen zusammen', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    const gleise = info.gleise.map((g) => g.gleis);

    // Ohne Gruppe kennt 8011160 nur 11-14 - Gleis 6 fehlte, und genau daran
    // scheiterte die Route Gleis 6 -> 14.
    expect(gleise).toContain('6');
    expect(gleise).toContain('14');
    expect(gleise).toContain('15');
  });

  it('nennt alle Mitglieder der Gruppe', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    expect([...info.evas].sort()).toEqual(['8011160', '8089021', '8098160']);
  });

  it('traegt die StaDa-Bahnhofsnummer fuer FaSta', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    expect(info.stationID).toBe('1071');
  });

  it('loest die Gruppe auch von einem Mitglied aus auf', async () => {
    // stop-places/{eva} liefert KEIN groupMembers - auch nicht fuer den
    // Leader. Aufgeloest wird ueber die Suche und den stationID-Abgleich.
    const info = await holeStationsInfo('8098160', gruppenMock().fetch);
    expect([...info.evas].sort()).toEqual(['8011160', '8089021', '8098160']);
    expect(info.gleise.map((g) => g.gleis)).toContain('14');
  });

  it('entdoppelt Gleisnamen, die mehrere Verkehrsstellen fuehren', async () => {
    // Muenchen fuehrt Gleis 13 unter drei Mitgliedern gleichzeitig - die
    // Unterteilung ist betrieblich, nicht physisch. Vereinigt wird deshalb
    // nach Namen, nicht verkettet.
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    const namen = info.gleise.map((g) => g.gleis);
    expect(new Set(namen).size).toBe(namen.length);
    // Berlin: 14 Eintraege tief (inkl. Abschnittsvarianten) + 4 oben + 2 S-Bahn
    expect(namen).toHaveLength(20);
  });

  it('bleibt bei einer einzelnen Verkehrsstelle, wenn es keine Gruppe gibt', async () => {
    // Koeln Hbf: groupMembers enthaelt nur sich selbst.
    const fetchFn = vi.fn(async (eingabe: RequestInfo | URL) => {
      const url = String(eingabe);
      let body: unknown;
      if (url.includes('/stop-places/by-name/')) {
        body = {
          stopPlaces: [
            {
              evaNumber: '8000207',
              groupMembers: ['8000207'],
              stationID: '3320',
              names: { DE: { nameLong: 'Köln Hbf' } },
              position: { latitude: 50.943, longitude: 6.958 },
            },
          ],
        };
      } else if (url.includes('/platforms/')) {
        body = { platforms: [{ name: '1' }, { name: '2' }] };
      } else {
        body = {
          stopPlaces: [
            {
              evaNumber: '8000207',
              stationID: '3320',
              names: { DE: { nameLong: 'Köln Hbf' } },
              position: { latitude: 50.943, longitude: 6.958 },
            },
          ],
        };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const info = await holeStationsInfo('8000207', fetchFn);
    expect(info.evas).toEqual(['8000207']);
    expect(info.gleise.map((g) => g.gleis)).toEqual(['1', '2']);
  });

  it('nimmt keine Bushaltestelle in die Gruppe auf', async () => {
    // Die Suche liefert 730749/727269 (Bus, sechsstellig) mit; sie stehen in
    // keiner Gruppe und duerfen auch ueber den Umweg nicht hineingeraten.
    const { fetch: fetchFn, urls } = gruppenMock();
    await holeStationsInfo('8011160', fetchFn);
    const abgefragt = urls
      .filter((u) => u.includes('/platforms/'))
      .map((u) => u.split('/platforms/')[1])
      .sort();
    expect(abgefragt).toEqual(['8011160', '8089021', '8098160']);
  });

  it('faellt auf die einzelne Verkehrsstelle zurueck, wenn die Suche scheitert', async () => {
    // Ein Ausfall der Suche darf die Route nicht verhindern - lieber die
    // Gleise einer Verkehrsstelle als gar keine.
    const fetchFn = vi.fn(async (eingabe: RequestInfo | URL) => {
      const url = String(eingabe);
      if (url.includes('/stop-places/by-name/')) {
        return new Response('kaputt', { status: 503 });
      }
      const treffer = /\/(stop-places|platforms)\/(\d+)/.exec(url);
      const [, endpunkt, eva] = treffer!;
      return new Response(
        JSON.stringify(ladeFixture(`gruppe-${endpunkt === 'platforms' ? 'pf' : 'sp'}-${eva}`)),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const info = await holeStationsInfo('8011160', fetchFn);
    expect(info.evas).toEqual(['8011160']);
    expect(info.gleise.map((g) => g.gleis)).toEqual(['11', '12', '13', '14']);
  });
});

// ---------------------------------------------------------------------------
// Fahrplantafel über die Gruppe
// ---------------------------------------------------------------------------

/**
 * Der Kern des Problems: 8011160 ist die EVA, die die Suche liefert – und
 * ihre Tafel ist LEER. Am 31.08.2026 gemessen: 8011160 → 0 Einträge,
 * 8098160 → 28, 8089021 → 42. Wer Berlin Hbf sucht, sah deshalb keine Züge.
 */
const TAFELN: Record<string, TafelEintrag[]> = {
  '8011160': [],
  '8098160': [
    { zug: 'ICE 1006', zeitSoll: '14:26', gleisSoll: '6', ziel: 'Hamburg-Altona' },
    { zug: 'RE 3', zeitSoll: '14:12', gleisSoll: '2', ziel: 'Stralsund' },
  ],
  '8089021': [
    { zug: 'S 5', zeitSoll: '14:18', gleisSoll: '15', ziel: 'Strausberg Nord' },
    // Derselbe Zug steht in zwei Bahnhofsteilen - er darf nur einmal erscheinen.
    { zug: 'RE 3', zeitSoll: '14:12', gleisSoll: '2', ziel: 'Stralsund' },
  ],
};

function tafelClients(overschreibung: Partial<Record<string, () => Promise<TafelEintrag[]>>> = {}) {
  const gruppe = vi.fn(async () => ['8011160', '8089021', '8098160']);
  const tafel = vi.fn(async (eva: string) => {
    const sonder = overschreibung[eva];
    if (sonder) return sonder();
    return TAFELN[eva] ?? [];
  });
  return {
    overpass: vi.fn(async () => {
      throw new Error('im Tafeltest nicht benutzt');
    }),
    stations: {
      holeStationsInfo: vi.fn(async () => {
        throw new Error('im Tafeltest nicht benutzt');
      }),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: gruppe,
    },
    tafel,
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

describe('GET /api/board über die Verkehrsstellengruppe', () => {
  it('führt die Tafeln aller Verkehrsstellen zusammen', async () => {
    const app = buildApp(tafelClients() as never);
    const res = await app.inject({ method: 'GET', url: '/api/board/8011160?type=dep' });
    expect(res.statusCode).toBe(200);
    const tafel = res.json() as TafelEintrag[];
    // Ohne Gruppe waere diese Liste leer - 8011160 hat keine Abfahrten.
    expect(tafel.map((e) => e.zug).sort()).toEqual(['ICE 1006', 'RE 3', 'S 5']);
  });

  it('zeigt einen Zug nur einmal, auch wenn zwei Bahnhofsteile ihn führen', async () => {
    const app = buildApp(tafelClients() as never);
    const res = await app.inject({ method: 'GET', url: '/api/board/8011160?type=dep' });
    const tafel = res.json() as TafelEintrag[];
    expect(tafel.filter((e) => e.zug === 'RE 3')).toHaveLength(1);
  });

  it('sortiert die zusammengeführte Tafel nach Sollzeit', async () => {
    const app = buildApp(tafelClients() as never);
    const res = await app.inject({ method: 'GET', url: '/api/board/8011160?type=dep' });
    const tafel = res.json() as TafelEintrag[];
    expect(tafel.map((e) => e.zeitSoll)).toEqual(['14:12', '14:18', '14:26']);
  });

  it('ein ausgefallener Bahnhofsteil nimmt die übrigen nicht mit', async () => {
    const clients = tafelClients({
      '8098160': async () => {
        throw new Error('IRIS gerade nicht erreichbar');
      },
    });
    const app = buildApp(clients as never);
    const res = await app.inject({ method: 'GET', url: '/api/board/8011160?type=dep' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as TafelEintrag[]).map((e) => e.zug)).toContain('S 5');
  });

  it('fragt die Gruppe nur einmal ab, nicht bei jedem Aufruf', async () => {
    const clients = tafelClients();
    const app = buildApp(clients as never);
    await app.inject({ method: 'GET', url: '/api/board/8011160?type=dep' });
    await app.inject({ method: 'GET', url: '/api/board/8011160?type=arr' });
    expect(clients.stations.ermittleGruppe).toHaveBeenCalledTimes(1);
  });
});

describe('Graph-Cache je Bahnhof, nicht je Verkehrsstelle', () => {
  it('zwei Mitglieder derselben Gruppe bauen nur EINEN Graphen', async () => {
    const miniOsm = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)),
        'utf8',
      ),
    ) as never;
    const evas = ['8011160', '8089021', '8098160'];
    const overpass = vi.fn(async () => miniOsm);
    const clients = {
      overpass,
      stations: {
        // Beide Mitglieder liefern dieselbe zusammengeführte Auskunft - so
        // verhaelt sich holeStationsInfo nach der Gruppenaufloesung.
        holeStationsInfo: vi.fn(async (eva: string) => ({
          eva,
          evas,
          name: 'Berlin Hbf',
          lat: 52.0,
          lon: 12.0,
          gleise: [{ gleis: '1' }, { gleis: '2' }],
        })),
        sucheBahnhoefe: vi.fn(async () => []),
        sucheBahnhoefeNahebei: vi.fn(async () => []),
        ermittleGruppe: vi.fn(async () => evas),
      },
      tafel: vi.fn(async () => []),
      wagenposition: vi.fn(async () => null),
      fasta: vi.fn(async () => []),
    };
    const app = buildApp(clients as never);
    const url = (eva: string) =>
      `/api/route?eva=${eva}&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste`;

    expect((await app.inject({ method: 'GET', url: url('8011160') })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: url('8098160') })).statusCode).toBe(200);

    // Ohne gemeinsamen Schluessel baute jeder Bahnhofsteil seinen eigenen
    // Graphen - derselbe Bahnhof, zweimal ueber Overpass geholt.
    expect(overpass).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FaSta über die StaDa-Bahnhofsnummer
// ---------------------------------------------------------------------------

/**
 * FaSta adressiert Bahnhofsnummern, nicht EVA-Nummern. Mit der EVA antwortet
 * die API nicht mit einem Fehler, sondern mit HTTP 200 und `[ ]` – ein
 * stiller leerer Erfolg. Der `catch`-Zweig mit dem ehrlichen Hinweis wurde
 * deshalb nie erreicht, und `variante=barrierefrei` kannte in Produktion nie
 * einen Aufzug. Mit der StaDa-Nummer 1071 liefert dieselbe Abfrage für
 * Berlin Hbf 70 Anlagen (gemessen 31.08.2026).
 */
describe('FaSta wird mit der Bahnhofsnummer adressiert', () => {
  const aufzugOsm = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof-aufzug.json', import.meta.url)),
      'utf8',
    ),
  ) as never;
  const BF_URL = '/api/route?eva=8011160&gleisAn=1&gleisAb=2&profil=normal&variante=barrierefrei';

  function clients(stationID: string | undefined) {
    return {
      overpass: vi.fn(async () => aufzugOsm),
      stations: {
        holeStationsInfo: vi.fn(async (eva: string) => ({
          eva,
          evas: [eva],
          name: 'Berlin Hbf',
          lat: 52.0,
          lon: 12.0,
          ...(stationID ? { stationID } : {}),
          gleise: [{ gleis: '1' }, { gleis: '2' }],
        })),
        sucheBahnhoefe: vi.fn(async () => []),
        sucheBahnhoefeNahebei: vi.fn(async () => []),
        ermittleGruppe: vi.fn(async (eva: string) => [eva]),
      },
      tafel: vi.fn(async () => []),
      wagenposition: vi.fn(async () => null),
      fasta: vi.fn(async () => [
        { typ: 'AUFZUG' as const, lat: 52.00015, lon: 12.001, status: 'ACTIVE' as const },
      ]),
    };
  }

  it('fragt gar nicht erst, wenn keine Bahnhofsnummer bekannt ist', async () => {
    // Sonst käme HTTP 200 mit leerer Liste zurück und würde als "keine
    // Aufzüge vorhanden" gelesen - eine falsche Aussage statt einer offenen.
    const c = clients(undefined);
    const app = buildApp(c as never);
    const res = await app.inject({ method: 'GET', url: BF_URL });
    expect(c.fasta).not.toHaveBeenCalled();
    expect(
      (res.json() as { hinweise: string[] }).hinweise.some((h) => h.includes('Aufzugstatus')),
    ).toBe(true);
  });
});
