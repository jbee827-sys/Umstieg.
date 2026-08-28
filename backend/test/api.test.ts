import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import type {
  FastaAnlage,
  OverpassAntwort,
  RouteErgebnis,
  StationsInfo,
} from '../src/core/typen.js';

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

const miniOsm = ladeFixture('synthetisch/mini-bahnhof');

const ministadt: StationsInfo = {
  eva: '8000001',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

function macheClients({ overpassWirft = false, abschnitt = null as string | null } = {}) {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => {
      if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
      return miniOsm;
    }),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => [
        { name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 },
      ]),
      sucheBahnhoefeNahebei: vi.fn(async () => [
        { name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 },
      ]),
    },
    tafel: vi.fn(async () => [
      {
        zug: 'ICE 1006',
        zeitSoll: '14:26',
        zeitIst: '14:35',
        gleisSoll: '14',
        gleisIst: '12',
        ziel: 'Hamburg-Altona',
      },
    ]),
    wagenposition: vi.fn(async () => (abschnitt ? { abschnitt } : null)),
  };
}

const ROUTE_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

describe('GET /api/route', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('liefert RouteErgebnis mit Schritten, Gehzeit und Karte (Fixture-Clients)', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.stufe).toBe(1);
    expect(ergebnis.schritte.length).toBeGreaterThan(0);
    expect(ergebnis.schritte[0].text).toMatch(/^Nach Ausstieg/);
    expect(ergebnis.gehzeitSek).toBeGreaterThan(0);
    expect(ergebnis.karte).toBeDefined();
    expect(Array.isArray(ergebnis.hinweise)).toBe(true);
  });

  it('Overpass-Ausfall → Stufe 3 (Synthesemodell) mit Hinweis und ca.-Angaben', async () => {
    const app = buildApp(macheClients({ overpassWirft: true }));
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.stufe).toBe(3);
    expect(ergebnis.hinweise.length).toBeGreaterThan(0);
    expect(ergebnis.schritte.some((s) => s.text.toLowerCase().includes('ca. '))).toBe(true);
  });

  it('zweiter Aufruf trifft den Graph-Cache (Clients nur 1× befragt)', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    await app.inject({ method: 'GET', url: ROUTE_URL });
    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.overpass).toHaveBeenCalledTimes(1);
    expect(clients.stations.holeStationsInfo).toHaveBeenCalledTimes(1);
  });

  it('fehlende Pflichtparameter → 400', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/route?eva=8000001&gleisAn=1' });
    expect(res.statusCode).toBe(400);
  });

  it('unbekanntes Gleis → 404 mit Fehlercode', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({
      method: 'GET',
      url: '/api/route?eva=8000001&gleisAn=1&gleisAb=99',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().fehler).toBe('gleis-unbekannt');
  });
});

describe('GET /api/route – Wagenposition', () => {
  it('nutzt die Wagenposition für den Startabschnitt', async () => {
    const clients = macheClients({ abschnitt: 'anfang' });
    const app = buildApp(clients);
    const res = await app.inject({
      method: 'GET',
      url: `${ROUTE_URL}&zugAn=1006&wagen=26`,
    });
    expect(res.statusCode).toBe(200);
    expect(clients.wagenposition).toHaveBeenCalledTimes(1);
    const [zugnummer, datum, wagen] = clients.wagenposition.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ];
    expect(zugnummer).toBe('1006');
    expect(datum).toMatch(/^\d{8}$/);
    expect(wagen).toBe('26');
  });

  it('keine Wagenreihungsdaten → Bahnsteigmitte mit transparentem Hinweis', async () => {
    const app = buildApp(macheClients({ abschnitt: null }));
    const res = await app.inject({ method: 'GET', url: `${ROUTE_URL}&zugAn=1006&wagen=26` });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('Bahnsteigmitte'))).toBe(true);
  });

  it('ohne wagen-Parameter wird die Wagenreihung nicht abgefragt', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.wagenposition).not.toHaveBeenCalled();
  });
});

describe('GET /api/board/:eva', () => {
  it('liefert die Tafel über den injizierten Client', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=dep' });
    expect(res.statusCode).toBe(200);
    const tafel = res.json() as { zug: string; gleisIst?: string }[];
    expect(tafel[0].zug).toBe('ICE 1006');
    expect(tafel[0].gleisIst).toBe('12');
    expect(clients.tafel).toHaveBeenCalledWith('8000001', 'dep');
  });

  it('ungültiger type → 400', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=xyz' });
    expect(res.statusCode).toBe(400);
  });

  it('ohne DB-Zugangsdaten → 503', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    vi.stubEnv('DB_CLIENT_SECRET', '');
    const app = buildApp(); // echte Clients ohne Schlüssel
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=dep' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'db-zugang-fehlt' });
  });
});

describe('GET /api/route – FaSta (barrierefrei)', () => {
  const aufzugOsm = ladeFixture('synthetisch/mini-bahnhof-aufzug');
  // Koordinate des Aufzugs nahe Bahnsteig 1 (Knoten 131 im Fixture).
  const AUFZUG: Omit<FastaAnlage, 'status'> = { typ: 'AUFZUG', lat: 52.00015, lon: 12.001 };
  const BF_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=barrierefrei';

  function aufzugClients(fasta: () => Promise<FastaAnlage[]>) {
    return {
      overpass: vi.fn(async () => aufzugOsm),
      stations: {
        holeStationsInfo: vi.fn(async () => ministadt),
        sucheBahnhoefe: vi.fn(async () => []),
        sucheBahnhoefeNahebei: vi.fn(async () => []),
      },
      tafel: vi.fn(async () => []),
      wagenposition: vi.fn(async () => null),
      fasta: vi.fn(fasta),
    };
  }

  it('ohne Störung existiert eine barrierefreie Route über den Aufzug', async () => {
    const app = buildApp(aufzugClients(async () => [{ ...AUFZUG, status: 'ACTIVE' }]));
    const res = await app.inject({ method: 'GET', url: BF_URL });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.schritte.some((s) => s.typ === 'aufzug')).toBe(true);
  });

  it('INACTIVE-Aufzug sperrt die barrierefreie Route', async () => {
    const app = buildApp(aufzugClients(async () => [{ ...AUFZUG, status: 'INACTIVE' }]));
    const res = await app.inject({ method: 'GET', url: BF_URL });
    expect(res.statusCode).toBe(404);
    expect(res.json().fehler).toBe('keine-route');
  });

  it('FaSta-Ausfall sperrt nichts, sondern erzeugt einen Hinweis', async () => {
    const app = buildApp(
      aufzugClients(async () => {
        throw new Error('FaSta nicht erreichbar (Test)');
      }),
    );
    const res = await app.inject({ method: 'GET', url: BF_URL });
    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('Aufzugstatus unbekannt'))).toBe(true);
  });

  it('eine Störung landet nicht im Graph-Cache', async () => {
    // Regression: Ohne Kopie des Graphen bliebe der INACTIVE-Status 24 h im
    // Cache stehen – der Aufzug wäre gesperrt, lange nachdem er wieder läuft.
    let anlagen: FastaAnlage[] = [{ ...AUFZUG, status: 'INACTIVE' }];
    const app = buildApp(aufzugClients(async () => anlagen));

    const gesperrt = await app.inject({ method: 'GET', url: BF_URL });
    expect(gesperrt.statusCode).toBe(404);

    anlagen = []; // Anlage meldet sich nicht mehr → kein Status bekannt
    const frei = await app.inject({ method: 'GET', url: BF_URL });
    expect(frei.statusCode).toBe(200);
  });

  it('andere Varianten fragen FaSta gar nicht ab', async () => {
    const clients = aufzugClients(async () => []);
    const app = buildApp(clients);
    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.fasta).not.toHaveBeenCalled();
  });

  it('fragt FaSta mit der EVA-Nummer ab', async () => {
    const clients = aufzugClients(async () => [{ ...AUFZUG, status: 'ACTIVE' }]);
    const app = buildApp(clients);
    await app.inject({ method: 'GET', url: BF_URL });
    expect(clients.fasta).toHaveBeenCalledWith('8000001');
  });
});

describe('GET /api/stations', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('liefert Treffer über den injizierten Client', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Mini' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ name: 'Ministadt', eva: '8000001', lat: 52.0, lon: 12.0 }]);
  });

  it('ohne DB-Zugangsdaten → 503 mit fehler db-zugang-fehlt', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    vi.stubEnv('DB_CLIENT_SECRET', '');
    const app = buildApp(); // echte Clients, aber ohne Schlüssel
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Berlin' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'db-zugang-fehlt' });
  });

  it('fehlendes q → 400', async () => {
    const app = buildApp(macheClients());
    const res = await app.inject({ method: 'GET', url: '/api/stations' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/stations mit Koordinaten', () => {
  it('liefert Treffer im Umkreis und reicht den Radius durch', async () => {
    const clients = macheClients();
    const app = buildApp(clients);
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=52.525&lon=13.369' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(clients.stations.sucheBahnhoefeNahebei).toHaveBeenCalledWith(52.525, 13.369, 1000);
  });

  it('q und lat gleichzeitig → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?q=Berlin&lat=52.5&lon=13.3' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('lat ohne lon → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=52.5' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('lat ausserhalb des Wertebereichs → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=200&lon=13.3' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('leere Koordinaten (?lat=&lon=) → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=&lon=' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('lon leer, lat gesetzt → 400 parameter-ungueltig', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=52.5&lon=' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-ungueltig');
  });

  it('weder q noch Koordinaten → 400 parameter-fehlt', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/stations' });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('parameter-fehlt');
  });
});
