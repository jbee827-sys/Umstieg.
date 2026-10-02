import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FehlendeZugangsdatenError,
  holeStationsInfo,
  istGueltigeEva,
  sucheBahnhoefe,
  sucheBahnhoefeNahebei,
} from '../src/clients/stations.js';

function ladeFixture(name: string): unknown {
  const pfad = fileURLToPath(new URL(`./fixtures/db/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8'));
}

/** fetch-Mock, der je nach URL-Pfad das passende Fixture liefert. */
function fetchMock(): typeof fetch {
  return vi.fn(async (eingabe: RequestInfo | URL) => {
    const url = String(eingabe);
    let fixture: unknown;
    if (url.includes('/stop-places/by-name/')) fixture = ladeFixture('stations-suche');
    else if (url.includes('/stop-places/by-position')) fixture = ladeFixture('stations-by-position');
    else if (url.includes('/platforms/')) fixture = ladeFixture('stations-platforms');
    else if (url.includes('/stop-places/')) fixture = ladeFixture('stations-stopplace');
    else throw new Error(`unerwartete URL im Test: ${url}`);
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('stations-Client', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('sucheBahnhoefe', () => {
    it('parst Treffer aus dem Fixture (Name, EVA, Koordinaten)', async () => {
      const treffer = await sucheBahnhoefe('Berlin Hbf', fetchMock());
      expect(treffer).toHaveLength(2);
      expect(treffer[0]).toEqual({
        name: 'Berlin Hbf',
        eva: '8011160',
        lat: 52.524925,
        lon: 13.369629,
      });
    });

    it('sendet DB-Client-Id und DB-Api-Key als Header', async () => {
      const mock = fetchMock();
      await sucheBahnhoefe('Berlin', mock);
      const [, init] = (mock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect((init.headers as Record<string, string>)['DB-Client-Id']).toBe('test-id');
      expect((init.headers as Record<string, string>)['DB-Api-Key']).toBe('test-secret');
    });

    it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
      vi.stubEnv('DB_CLIENT_ID', '');
      await expect(sucheBahnhoefe('Berlin', fetchMock())).rejects.toBeInstanceOf(
        FehlendeZugangsdatenError,
      );
    });

    it('HTTP-Fehler → aussagekräftige Exception', async () => {
      const kaputt = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
      await expect(sucheBahnhoefe('Berlin', kaputt)).rejects.toThrow(/503/);
    });
  });

  describe('holeStationsInfo', () => {
    it('kombiniert Stop-Place (Name) und Platforms (Gleise) zu StationsInfo', async () => {
      const info = await holeStationsInfo('8011160', fetchMock());
      expect(info.eva).toBe('8011160');
      expect(info.name).toBe('Berlin Hbf');
      expect(info.gleise.map((g) => g.gleis)).toEqual(['7', '8', '11', '12']);
      // Stationskoordinaten für den Overpass-Abruf (Task 12)
      expect(info.lat).toBeCloseTo(52.524925, 5);
      expect(info.lon).toBeCloseTo(13.369629, 5);
    });

    it('übernimmt jeden /platforms-Eintrag vollständig – auch Teilgleise mit parentPlatform', async () => {
      // Echte Antwort vom 02.10.2026: Der Fahrplan nennt „7A-D", OSM kennt nur
      // „7". Die Zuordnung steht in `parentPlatform` – sie darf nicht verloren gehen.
      const hamburg = ladeFixture('platforms-hamburg-8002549') as { platforms: { name: string }[] };
      const mock = vi.fn(async (eingabe: RequestInfo | URL) => {
        const url = String(eingabe);
        const body = url.includes('/platforms/') ? hamburg : ladeFixture('stations-stopplace');
        return new Response(JSON.stringify(body), { status: 200 });
      }) as unknown as typeof fetch;
      const info = await holeStationsInfo('8002549', mock);
      expect(info.gleise.map((g) => g.gleis)).toEqual(hamburg.platforms.map((p) => p.name));
      const teil = info.gleise.find((g) => g.gleis === '7A-D')!;
      expect(teil.ris).toEqual(hamburg.platforms.find((p) => p.name === '7A-D'));
      expect(teil.ris?.parentPlatform).toBe('7');
      expect(info.gleise.find((g) => g.gleis === '7')!.ris?.length).toBe(603.95);
    });

    it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
      vi.stubEnv('DB_CLIENT_ID', '');
      await expect(holeStationsInfo('8011160', fetchMock())).rejects.toBeInstanceOf(
        FehlendeZugangsdatenError,
      );
    });
  });

  describe('sucheBahnhoefeNahebei', () => {
    it('parst Treffer aus dem Umkreis-Fixture', async () => {
      const treffer = await sucheBahnhoefeNahebei(52.525, 13.369, 1000, fetchMock());
      expect(treffer).toHaveLength(2);
      expect(treffer[0]).toEqual({
        name: 'Berlin Hbf',
        eva: '8011160',
        lat: 52.524925,
        lon: 13.369629,
      });
    });

    it('reicht Koordinaten und Radius als Query-Parameter durch', async () => {
      const mock = fetchMock();
      await sucheBahnhoefeNahebei(52.525, 13.369, 1000, mock);
      const [url] = (mock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(url).toContain('latitude=52.525');
      expect(url).toContain('longitude=13.369');
      expect(url).toContain('radius=1000');
    });

    it('ohne Zugangsdaten → FehlendeZugangsdatenError', async () => {
      vi.stubEnv('DB_CLIENT_ID', '');
      await expect(sucheBahnhoefeNahebei(52.525, 13.369, 1000, fetchMock())).rejects.toBeInstanceOf(
        FehlendeZugangsdatenError,
      );
    });
  });
});

/** Antwort mit gemischten Kennungen, wie RIS::Stations sie real liefert. */
function gemischteAntwort(): typeof fetch {
  const body = {
    stopPlaces: [
      {
        evaNumber: '8011160',
        names: { DE: { nameLong: 'Berlin Hbf' } },
        position: { latitude: 52.525592, longitude: 13.369545 },
      },
      {
        evaNumber: '730749',
        names: { DE: { nameLong: 'Berlin Hauptbahnhof (S+U), Berlin' } },
        position: { latitude: 52.526462, longitude: 13.369379 },
      },
      {
        evaNumber: '727269',
        names: { DE: { nameLong: 'Hauptbahnhof (S+U)/Washingtonplatz, Berlin' } },
        position: { latitude: 52.523389, longitude: 13.370497 },
      },
      {
        evaNumber: 'de:11000:900003201',
        names: { DE: { nameLong: 'Berlin Hbf (IFOPT)' } },
        position: { latitude: 52.5, longitude: 13.3 },
      },
    ],
  };
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('EVA-Filter', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('istGueltigeEva', () => {
    it('akzeptiert siebenstellige deutsche EVA-Nummern', () => {
      expect(istGueltigeEva('8011160')).toBe(true);
      expect(istGueltigeEva('8098160')).toBe(true);
      expect(istGueltigeEva('8089522')).toBe(true);
    });

    it('verwirft sechsstellige Nahverkehrs-Kennungen', () => {
      // Diese liefert RIS::Stations fuer Berlin Hbf mit; /api/board quittiert
      // sie mit HTTP 500, weil Timetables sie nicht kennt.
      expect(istGueltigeEva('730749')).toBe(false);
      expect(istGueltigeEva('727269')).toBe(false);
    });

    it('verwirft IFOPT-Kennungen und sonstige Nicht-Zahlen', () => {
      expect(istGueltigeEva('de:11000:900003201:1:50')).toBe(false);
      expect(istGueltigeEva('')).toBe(false);
      expect(istGueltigeEva('80111600')).toBe(false);
    });

    it('verwirft auslaendische Verkehrsstellen (anderer UIC-Laendercode)', () => {
      // 81 = Oesterreich, 85 = Schweiz. Timetables deckt nur Deutschland ab.
      expect(istGueltigeEva('8100002')).toBe(false);
      expect(istGueltigeEva('8500010')).toBe(false);
    });
  });

  it('sucheBahnhoefe liefert nur Treffer mit gueltiger EVA', async () => {
    const treffer = await sucheBahnhoefe('Berlin Hbf', gemischteAntwort());
    expect(treffer).toHaveLength(1);
    expect(treffer[0].eva).toBe('8011160');
  });

  it('die Umkreissuche filtert genauso', async () => {
    const treffer = await sucheBahnhoefeNahebei(52.525, 13.369, 1000, gemischteAntwort());
    expect(treffer.map((t) => t.eva)).toEqual(['8011160']);
  });
});

/**
 * Faellt die Gleisliste EINES Bahnhofsteils aus, blieb die Vereinigung
 * unvollstaendig - ohne dass irgendwo stand, dass etwas fehlt. Wer dann nach
 * dem fehlenden Gleis fragte, bekam "gleis-unbekannt". Das ist die falsche
 * Auskunft: Nicht das Gleis ist unbekannt, wir konnten nur nicht fragen.
 */
describe('holeStationsInfo: unvollstaendige Gleisliste', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  /** Wie fetchMock, aber die Gleisliste bestimmter Mitglieder faellt aus. */
  function fetchMitAusfall(kaputteEvas: string[]): typeof fetch {
    return vi.fn(async (eingabe: RequestInfo | URL) => {
      const url = String(eingabe);
      let fixture: unknown;
      if (url.includes('/stop-places/by-name/')) fixture = ladeFixture('stations-suche');
      else if (url.includes('/platforms/')) {
        if (kaputteEvas.some((e) => url.includes(e))) {
          return new Response('kaputt', { status: 502 });
        }
        fixture = ladeFixture('stations-platforms');
      } else if (url.includes('/stop-places/')) fixture = ladeFixture('stations-stopplace');
      else throw new Error(`unerwartete URL im Test: ${url}`);
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  }

  it('meldet, wie viele Bahnhofsteile die Gleisliste schuldig blieben', async () => {
    const heil = await holeStationsInfo('8011160', fetchMitAusfall([]));
    expect(heil.gleisteileOhneAntwort).toBe(0);

    const kaputt = await holeStationsInfo('8011160', fetchMitAusfall(['8011160']));
    expect(kaputt.gleisteileOhneAntwort).toBeGreaterThan(0);
  });

  it('bleibt trotzdem benutzbar - ein Teil nimmt die uebrigen nicht mit', async () => {
    const info = await holeStationsInfo('8011160', fetchMitAusfall(['8011160']));
    expect(info.name).toBeTruthy();
    expect(Array.isArray(info.gleise)).toBe(true);
  });
});
