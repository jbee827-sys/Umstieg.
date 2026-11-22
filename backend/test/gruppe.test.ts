import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { holeGruppe, holeStationsInfo } from '../src/clients/stations.js';
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
    // 8089522 (S15) steht in keiner RIS-Gruppe und kommt aus ZUSATZ_MITGLIEDER.
    expect([...info.evas].sort()).toEqual(['8011160', '8089021', '8089522', '8098160']);
  });

  it('traegt die StaDa-Bahnhofsnummer fuer FaSta', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    expect(info.stationID).toBe('1071');
  });

  it('loest die Gruppe auch von einem Mitglied aus auf', async () => {
    // stop-places/{eva} liefert KEIN groupMembers - auch nicht fuer den
    // Leader. Aufgeloest wird ueber die Suche und den stationID-Abgleich.
    const info = await holeStationsInfo('8098160', gruppenMock().fetch);
    expect([...info.evas].sort()).toEqual(['8011160', '8089021', '8089522', '8098160']);
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
    // + Gleis 22 (S15)
    expect(namen).toHaveLength(21);
  });

  /**
   * Die Herkunft je Gleis ist der Trenner fuer Konzeptluecke §4.3.
   *
   * Bis zum 04.09.2026 wurde sie abgerufen und drei Zeilen spaeter verworfen:
   * `gesehen.has(p.name)` warf jeden Folgetreffer weg, samt seiner
   * Verkehrsstelle. Genau die Angabe fehlte dem Routing, um zu erkennen, dass
   * zwei Gleise NICHT am selben Bahnsteig liegen koennen.
   */
  it('merkt sich, welche Verkehrsstelle ein Gleis fuehrt', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    const gleis14 = info.gleise.find((g) => g.gleis === '14');
    const gleis6 = info.gleise.find((g) => g.gleis === '6');

    // 14 liegt in der Halle (8011160), 6 im Tiefbahnhof (8098160).
    expect(gleis14?.evas).toEqual(['8011160']);
    expect(gleis6?.evas).toEqual(['8098160']);
  });

  it('sammelt alle Verkehrsstellen, die dasselbe Gleis fuehren', async () => {
    // Fuehren mehrere Mitglieder denselben Gleisnamen, ist das ein echtes
    // "beides" - und dann darf gerade NICHT auf verschiedene Bahnsteige
    // geschlossen werden. Einen Gewinner zu kueren waere derselbe Fehler
    // eine Ebene hoeher.
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    for (const eintrag of info.gleise) {
      // Das Feld ist im Typ optional (Fixtures), der echte Erzeuger fuellt es
      // aber immer - sonst faellt das Routing stillschweigend auf OSM zurueck.
      const evas = eintrag.evas;
      expect(evas).toBeDefined();
      expect(evas?.length).toBeGreaterThan(0);
      expect(new Set(evas).size).toBe(evas?.length);
      for (const eva of evas ?? []) expect(info.evas).toContain(eva);
    }
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
    expect(abgefragt).toEqual(['8011160', '8089021', '8089522', '8098160']);
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

/**
 * S15 am Berliner Hbf (22.11.2026).
 *
 * 8089522 „Berlin Hbf (S-Bahn)“ fuehrt die S15 an Gleis 22, traegt aber KEINE
 * stationID und steht in keiner `groupMembers`-Liste. Die App zeigte die S15
 * deshalb nie. Fixtures 8089522 am 22.11.2026 von der echten API aufgezeichnet.
 */
describe('Zusatzmitglied S15 (Berlin Hbf, 8089522)', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fuehrt Gleis 22 als Gleis der S15-Verkehrsstelle', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    const gleis22 = info.gleise.find((g) => g.gleis === '22');
    expect(gleis22?.evas).toEqual(['8089522']);
  });

  it('zaehlt 8089522 zu den reinen S-Bahn-Verkehrsstellen', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    expect(info.sbahnEvas).toContain('8089522');
  });

  it('liefert die S15 auch fuer die Fahrplantafel (holeGruppe)', async () => {
    const evas = await holeGruppe('8011160', gruppenMock().fetch);
    expect([...evas].sort()).toEqual(['8011160', '8089021', '8089522', '8098160']);
  });

  it('loest von 8089522 aus den ganzen Berliner Hbf auf', async () => {
    // Ohne stationID gab es bisher gar keine Gruppe - wer die S15-Stelle
    // oeffnete, sah nur Gleis 22 und keinen Umstieg zur Halle.
    const evas = await holeGruppe('8089522', gruppenMock().fetch);
    expect([...evas].sort()).toEqual(['8011160', '8089021', '8089522', '8098160']);
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

/**
 * S-Bahn-Verkehrsstellen (sbahnEvas).
 *
 * Die Namenssuche liefert nur den fuehrenden Eintrag der Gruppe, nicht die
 * uebrigen Mitglieder; `availableTransports` je Mitglied steht erst in
 * `stop-places/{eva}` (aufgezeichnet 03.11.2026). Muenchen Hbf (tief) 8098263
 * fuehrt ausschliesslich CITY_TRAIN, die Halle 8098261 ebenfalls CITY_TRAIN,
 * aber daneben Fernverkehr - sie ist keine reine S-Bahn-Stelle.
 */
describe('sbahnEvas', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Gruppen-Mock fuer Muenchen; `kaputteStopPlaces` lassen `stop-places/{eva}` mit 502 ausfallen. */
  function muenchenMock(kaputteStopPlaces: string[] = []): GruppenMock {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (eingabe: RequestInfo | URL) => {
      const url = String(eingabe);
      urls.push(url);
      const ok = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (url.includes('/stop-places/by-name/')) return ok(ladeFixture('gruppe-suche-muenchen'));
      if (url.includes('/platforms/')) return ok({ platforms: [] });
      const eva = /\/stop-places\/(\d+)/.exec(url)?.[1];
      if (!eva) throw new Error(`unerwartete URL im Test: ${url}`);
      if (kaputteStopPlaces.includes(eva)) return new Response('kaputt', { status: 502 });
      return ok(ladeFixture(`gruppe-sp-${eva}`));
    }) as unknown as typeof fetch;
    return { fetch: fetchFn, urls };
  }

  it('Muenchen: nur die reine S-Bahn-Stelle (tief)', async () => {
    const info = await holeStationsInfo('8000261', muenchenMock().fetch);
    expect(info.sbahnEvas).toEqual(['8098263']);
  });

  it('Berlin: 8089021 und die S15-Stelle 8089522', async () => {
    const info = await holeStationsInfo('8011160', gruppenMock().fetch);
    expect([...(info.sbahnEvas ?? [])].sort()).toEqual(['8089021', '8089522']);
  });

  it('ein ausgefallenes Mitglied fehlt in sbahnEvas, der Rest bleibt', async () => {
    const mock = muenchenMock(['8098263']);
    const info = await holeStationsInfo('8000261', mock.fetch);
    expect(info.sbahnEvas).toEqual([]);
    expect(info.evas).toHaveLength(4);
    expect(info.name).toBe('München Hbf');
  });

  it('holt das fuehrende Mitglied nicht zweimal', async () => {
    const mock = muenchenMock();
    await holeStationsInfo('8000261', mock.fetch);
    const n = mock.urls.filter((u) => u.includes('/stop-places/8000261')).length;
    expect(n).toBe(1);
  });

  // Schlussreview 04.11.2026: Bis dahin bekam ein Bahnhof aus EINER
  // Verkehrsstelle gar kein sbahnEvas - Muenchen Marienplatz bedient nur die
  // S-Bahn, und seine Gleise galten als Zuege. Die Regel gilt jetzt auch fuer
  // das fuehrende Mitglied allein; es ist ohnehin schon geladen.
  const ohneGruppe = (mock: GruppenMock): typeof fetch =>
    vi.fn(async (eingabe: RequestInfo | URL) => {
      const url = String(eingabe);
      if (url.includes('/stop-places/by-name/')) return new Response('kaputt', { status: 502 });
      return (mock.fetch as typeof fetch)(eingabe);
    }) as unknown as typeof fetch;

  it('ohne Gruppe (ein Mitglied, nicht nur S-Bahn): keine Zusatzabrufe, sbahnEvas leer', async () => {
    const mock = gruppenMock();
    const info = await holeStationsInfo('8011160', ohneGruppe(mock));
    expect(info.evas).toEqual(['8011160']);
    expect(info.sbahnEvas).toEqual([]);
    expect(mock.urls.filter((u) => u.includes('/stop-places/') && !u.includes('by-name'))).toHaveLength(1);
  });

  it('ein Mitglied, das nur S-Bahn bedient, steht in sbahnEvas - ohne Zusatzabruf', async () => {
    const mock = muenchenMock();
    const info = await holeStationsInfo('8098263', ohneGruppe(mock));
    expect(info.evas).toEqual(['8098263']);
    expect(info.sbahnEvas).toEqual(['8098263']);
    expect(mock.urls.filter((u) => u.includes('/stop-places/') && !u.includes('by-name'))).toHaveLength(1);
  });
});
