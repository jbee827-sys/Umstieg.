import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { graphTtlMs, GRAPH_TTL_MS } from '../src/cache/lru.js';
import type { OverpassAntwort } from '../src/core/typen.js';

/**
 * Der Graph-Cache vergiftete sich selbst: Ein Overpass-Ausfall erzeugt einen
 * Stufe-3-Graphen (Standardmodell, „ca."-Angaben), und der wurde genauso
 * 24 Stunden gehalten wie ein guter. Der Bahnhof blieb einen Tag degradiert,
 * lange nach der Erholung. Am 29.08.2026 beobachtet: 19:00 Uhr Stufe 3, nach
 * einem Neustart mit leerem Cache sofort wieder Stufe 1.
 */
describe('Cache-Frist nach Datenqualitaet', () => {
  it('haelt einen brauchbaren Graphen die vollen 24 Stunden', () => {
    expect(graphTtlMs(1)).toBe(GRAPH_TTL_MS);
    expect(graphTtlMs(2)).toBe(GRAPH_TTL_MS);
  });

  it('haelt einen Notbehelf nur wenige Minuten', () => {
    expect(graphTtlMs(3)).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(graphTtlMs(3)).toBeGreaterThan(0);
  });
});

const miniOsm = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)),
    'utf8',
  ),
) as OverpassAntwort;

const ROUTE_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function clientsMitOverpass(overpass: () => Promise<OverpassAntwort>) {
  return {
    overpass: vi.fn(overpass),
    stations: {
      holeStationsInfo: vi.fn(async (eva: string) => ({
        eva,
        evas: [eva],
        name: 'Ministadt',
        lat: 52.0,
        lon: 12.0,
        gleise: [{ gleis: '1' }, { gleis: '2' }],
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

describe('Ein degradierter Graph blockiert den Bahnhof nicht den ganzen Tag', () => {
  // Echte Zeit, keine nachgebaute Uhr: lru-cache haelt eine Referenz auf das
  // urspruengliche performance-Objekt und sieht Fake-Timer nicht. Die Frist
  // wird deshalb fuer den Test auf wenige Millisekunden gestellt.
  const KURZ_MS = 60;
  const warte = (ms: number) => new Promise((f) => setTimeout(f, ms));

  afterEach(() => vi.unstubAllEnvs());

  it('fragt Overpass nach Ablauf der kurzen Frist erneut', async () => {
    vi.stubEnv('GRAPH_NOTBEHELF_TTL_MS', String(KURZ_MS));
    const clients = clientsMitOverpass(async () => {
      throw new Error('Overpass nicht erreichbar (Test)');
    });
    const app = buildApp(clients as never);

    await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(clients.overpass).toHaveBeenCalledTimes(1);

    await warte(KURZ_MS * 2);
    await app.inject({ method: 'GET', url: ROUTE_URL });

    // Ohne qualitaetsabhaengige Frist bliebe es bei einem Aufruf - und der
    // Bahnhof bei Stufe 3, bis der Tag um ist.
    expect(clients.overpass).toHaveBeenCalledTimes(2);
  });

  it('erholt sich zu Stufe 1, sobald Overpass wieder antwortet', async () => {
    vi.stubEnv('GRAPH_NOTBEHELF_TTL_MS', String(KURZ_MS));
    let kaputt = true;
    const clients = clientsMitOverpass(async () => {
      if (kaputt) throw new Error('Overpass nicht erreichbar (Test)');
      return miniOsm;
    });
    const app = buildApp(clients as never);

    expect((await app.inject({ method: 'GET', url: ROUTE_URL })).json().stufe).toBe(3);

    kaputt = false;
    await warte(KURZ_MS * 2);
    expect((await app.inject({ method: 'GET', url: ROUTE_URL })).json().stufe).toBe(1);
  });

  it('haelt einen guten Graphen dagegen fest', async () => {
    vi.stubEnv('GRAPH_NOTBEHELF_TTL_MS', String(KURZ_MS));
    const clients = clientsMitOverpass(async () => miniOsm);
    const app = buildApp(clients as never);

    await app.inject({ method: 'GET', url: ROUTE_URL });
    await warte(KURZ_MS * 2);
    await app.inject({ method: 'GET', url: ROUTE_URL });

    // Stufe 1 faellt nicht unter die kurze Frist - sie gilt nur dem Notbehelf.
    expect(clients.overpass).toHaveBeenCalledTimes(1);
  });
});

/**
 * Der Kaltstart kostete 24 s und 61 s statt 2 s (31.08.2026 gemessen): Die
 * Oberflaeche laedt zwei Routenvarianten, beide fanden den Graph-Cache leer,
 * beide bauten den Graphen, Overpass wurde doppelt befragt. Der Cache haelt
 * nur *fertige* Eintraege - ein *laufender* Bau war fuer den Zweiten
 * unsichtbar. Das Frontend umging es durch Nacheinanderladen; hier steht der
 * Fix an der Wurzel.
 */
describe('Gleichzeitige Graphbauten werden zusammengefuehrt', () => {
  /** Overpass, das erst antwortet, wenn der Test es freigibt. */
  function angehalteneOverpass() {
    const freigaben: Array<(a: OverpassAntwort) => void> = [];
    const fn = () => new Promise<OverpassAntwort>((f) => freigaben.push(f));
    return { freigaben, fn };
  }

  const warte = (ms: number) => new Promise((f) => setTimeout(f, ms));

  it('fragt Overpass fuer zwei gleichzeitige Anfragen nur einmal', async () => {
    const overpass = angehalteneOverpass();
    const clients = clientsMitOverpass(overpass.fn);
    const app = buildApp(clients as never);

    // Beide Anfragen sind unterwegs, bevor eine von ihnen fertig ist.
    const beide = Promise.all([
      app.inject({ method: 'GET', url: ROUTE_URL }),
      app.inject({ method: 'GET', url: ROUTE_URL }),
    ]);
    await warte(30);

    // Vor der Freigabe zaehlen: danach liefe der zweite Bau in den warmen
    // Cache und der Fehler waere nicht mehr zu sehen.
    const baeuteGleichzeitig = overpass.freigaben.length;
    overpass.freigaben.forEach((f) => f(miniOsm));
    const [a, b] = await beide;

    expect(baeuteGleichzeitig).toBe(1);
    expect(clients.overpass).toHaveBeenCalledTimes(1);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json().stufe).toBe(1);
    expect(b.json().stufe).toBe(1);
  });

  it('buendelt auch zwei Verkehrsstellen desselben Bahnhofs', async () => {
    const overpass = angehalteneOverpass();
    const clients = clientsMitOverpass(overpass.fn);
    // Berlin Hbf: 8011160 und 8098160 sind derselbe Bahnhof, derselbe Graph.
    clients.stations.holeStationsInfo = vi.fn(async (eva: string) => ({
      eva,
      evas: ['8098160', '8011160'],
      name: 'Ministadt',
      lat: 52.0,
      lon: 12.0,
      gleise: [{ gleis: '1' }, { gleis: '2' }],
    }));
    const app = buildApp(clients as never);

    const beide = Promise.all([
      app.inject({ method: 'GET', url: ROUTE_URL.replace('8000001', '8011160') }),
      app.inject({ method: 'GET', url: ROUTE_URL.replace('8000001', '8098160') }),
    ]);
    await warte(30);

    const baeuteGleichzeitig = overpass.freigaben.length;
    overpass.freigaben.forEach((f) => f(miniOsm));
    const [a, b] = await beide;

    expect(baeuteGleichzeitig).toBe(1);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });

  it('merkt sich einen gescheiterten Bau nicht - der naechste Aufruf versucht es neu', async () => {
    const clients = clientsMitOverpass(async () => miniOsm);
    let ersterVersuch = true;
    clients.stations.holeStationsInfo = vi.fn(async (eva: string) => {
      if (ersterVersuch) {
        ersterVersuch = false;
        throw new Error('Stationsauskunft nicht erreichbar (Test)');
      }
      return {
        eva,
        evas: [eva],
        name: 'Ministadt',
        lat: 52.0,
        lon: 12.0,
        gleise: [{ gleis: '1' }, { gleis: '2' }],
      };
    });
    const app = buildApp(clients as never);

    // Ein haengengebliebenes Versprechen in der Karte wuerde den Bahnhof
    // dauerhaft auf den ersten Fehlschlag festnageln.
    const erste = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(erste.statusCode).toBe(500);

    const zweite = await app.inject({ method: 'GET', url: ROUTE_URL });
    expect(zweite.statusCode).toBe(200);
    expect(zweite.json().stufe).toBe(1);
  });
});
