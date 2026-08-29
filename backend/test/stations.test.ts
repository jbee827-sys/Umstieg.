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
