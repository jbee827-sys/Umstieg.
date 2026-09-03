import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

/**
 * Das Backend ist ein unauthentifizierter, oeffentlicher Proxy vor vier
 * kostenpflichtigen APIs (RIS::Stations, Timetables, FaSta, Overpass). CORS
 * schuetzt davor NICHT: Es ist eine Regel fuer Browser, kein Zugriffsschutz -
 * `curl` ignoriert sie vollstaendig.
 *
 * Ohne Ratenbegrenzung kann deshalb jeder, der die Domain kennt, die Quoten
 * leerlaufen lassen. Diese Tests halten die Grenzen fest.
 *
 * Die Zahlen sind bewusst niedrig gewaehlt. Hochsetzen ist eine
 * Konfigurationsaenderung; eine verbrauchte Quote ist eine Rechnung.
 */

function clients() {
  return {
    overpass: vi.fn(async () => ({ elements: [] })),
    stations: {
      holeStationsInfo: vi.fn(async () => ({
        eva: '8000001',
        evas: ['8000001'],
        name: 'X',
        gleise: [],
      })),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

/** Ruft `url` n-mal auf und gibt die Statuscodes zurueck. */
async function rufeMehrfach(
  app: ReturnType<typeof buildApp>,
  url: string,
  anzahl: number,
  ip = '203.0.113.1',
) {
  const codes: number[] = [];
  for (let i = 0; i < anzahl; i++) {
    const res = await app.inject({ method: 'GET', url, headers: { 'x-forwarded-for': ip } });
    codes.push(res.statusCode);
  }
  return codes;
}

describe('Ratenbegrenzung', () => {
  it('laesst die erlaubten 21 Anfragen an /api/stations durch', async () => {
    const app = buildApp(clients() as never);
    const codes = await rufeMehrfach(app, '/api/stations?q=Berlin', 21);
    expect(codes.every((c) => c !== 429)).toBe(true);
  });

  it('weist die 22. Anfrage an /api/stations ab', async () => {
    const app = buildApp(clients() as never);
    await rufeMehrfach(app, '/api/stations?q=Berlin', 21);
    const res = await app.inject({
      method: 'GET',
      url: '/api/stations?q=Berlin',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    expect(res.statusCode).toBe(429);
  });

  it('antwortet in der Fehlerform, die die App ueberall benutzt', async () => {
    const app = buildApp(clients() as never);
    await rufeMehrfach(app, '/api/stations?q=Berlin', 21);
    const res = await app.inject({
      method: 'GET',
      url: '/api/stations?q=Berlin',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    expect(res.json()).toMatchObject({ fehler: 'zu-viele-anfragen' });
  });

  // Die teuerste Route bekommt die strengste Grenze - und einen EIGENEN
  // Zaehler. Sonst sperrte die Tippsuche, die pro Eingabe mehrfach anfragt,
  // die Routenberechnung mit aus.
  it('begrenzt /api/route strenger und getrennt von /api/stations', async () => {
    const app = buildApp(clients() as never);
    const route = '/api/route?eva=8000001&gleisAn=1&gleisAb=2';

    const ersten14 = await rufeMehrfach(app, route, 14);
    expect(ersten14.every((c) => c !== 429)).toBe(true);

    const fuenfzehnte = await app.inject({
      method: 'GET',
      url: route,
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    expect(fuenfzehnte.statusCode).toBe(429);

    // Der Zaehler der Bahnhofssuche ist davon unberuehrt.
    const suche = await app.inject({
      method: 'GET',
      url: '/api/stations?q=Berlin',
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    expect(suche.statusCode).not.toBe(429);
  });

  // Flys Gesundheitspruefung fragt regelmaessig an. Liefe sie in die Grenze,
  // wuerde die Plattform die Maschine fuer tot halten und neu starten - die
  // Schutzmassnahme haette den Ausfall dann selbst erzeugt.
  it('nimmt /api/health von der Begrenzung aus', async () => {
    const app = buildApp(clients() as never);
    const codes = await rufeMehrfach(app, '/api/health', 100);
    expect(codes.every((c) => c === 200)).toBe(true);
  });

  /**
   * Ohne `trustProxy` ist `req.ip` auf Fly die Adresse des Fly-Proxys. Alle
   * Besucher landeten dann in EINEM Zaehler: Die Grenze waere wirkungslos und
   * wuerde beim ersten Andrang alle gleichzeitig aussperren. Genau daran
   * scheitern solche Konfigurationen ueblicherweise.
   */
  it('zaehlt je Aufrufer getrennt, nicht ueber den Proxy hinweg', async () => {
    const app = buildApp(clients() as never);
    await rufeMehrfach(app, '/api/stations?q=Berlin', 21, '203.0.113.1');

    const andererAufrufer = await app.inject({
      method: 'GET',
      url: '/api/stations?q=Berlin',
      headers: { 'x-forwarded-for': '198.51.100.7' },
    });
    expect(andererAufrufer.statusCode).not.toBe(429);
  });
});
