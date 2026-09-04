import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { Ueberwachung, type LiveEreignis } from '../src/core/ueberwachung.js';
import type { OverpassAntwort, RouteErgebnis, StationsInfo } from '../src/core/typen.js';

/**
 * Degradationstabelle des Konzepts, Abschnitt 8 - jede Zeile ein eigener Test
 * (MVP-Task 17, Schritt 1).
 *
 * Der Leitsatz dahinter ist Konzept Abschnitt 3: „Degradieren statt
 * ausfallen." Geprueft wird deshalb nicht nur, DASS die App bei einem Ausfall
 * antwortet, sondern dass sie sagt, was ihr fehlt. Eine Antwort, die einen
 * Ausfall verschweigt, ist schlimmer als gar keine - sie sieht aus wie
 * Genauigkeit.
 *
 * Zeile 6 (SSE-Abbruch) prueft die Endpunktseite; der Wiederverbindungsweg
 * liegt im Frontend und bleibt bewusst ohne Unit-Test, wie `api/sse.ts`
 * insgesamt.
 */

function ladeFixture(name: string): OverpassAntwort {
  const pfad = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(pfad, 'utf8')) as OverpassAntwort;
}

const miniOsm = ladeFixture('synthetisch/mini-bahnhof');

const ministadt: StationsInfo = {
  eva: '8000001',
  evas: ['8000001'],
  stationID: '4711',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

const ROUTE_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

function macheClients(ueber: Partial<Record<string, unknown>> = {}) {
  return {
    overpass: vi.fn(async () => miniOsm),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    ...ueber,
  };
}

describe('Zeile 1: Overpass faellt aus (beide Instanzen)', () => {
  it('rechnet mit dem Stufe-3-Synthesemodell weiter, statt zu scheitern', async () => {
    const app = buildApp(
      macheClients({
        overpass: vi.fn(async () => {
          throw new Error('Overpass nicht erreichbar (Test)');
        }),
      }),
    );
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });

    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.stufe).toBe(3);
    expect(ergebnis.schritte.length).toBeGreaterThan(0);
  });

  it('gibt sich als Schaetzung zu erkennen („ca."-Angaben)', async () => {
    // Ohne dieses Kennzeichen liest sich eine geratene Route wie eine
    // gemessene. Genau daran ist die Muenchener Fehlauskunft gescheitert.
    const app = buildApp(
      macheClients({
        overpass: vi.fn(async () => {
          throw new Error('Overpass nicht erreichbar (Test)');
        }),
      }),
    );
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });

    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.schritte.some((s) => s.text.toLowerCase().includes('ca. '))).toBe(true);
    expect(ergebnis.hinweise.length).toBeGreaterThan(0);
  });
});

describe('Zeile 2: Timetables faellt aus', () => {
  it('meldet den Ausfall an den Zuschauer, statt stumm zu werden', async () => {
    // Stumm ist vom Fall „es aendert sich gerade nichts" nicht zu
    // unterscheiden - deshalb ein eigenes Ereignis, aus dem das Frontend das
    // Banner „Echtzeitdaten derzeit nicht verfuegbar" baut.
    const ueberwachung = new Ueberwachung(async () => {
      throw new Error('Timetables nicht erreichbar (Test)');
    });
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8000001', [], (e) => empfangen.push(e));

    await ueberwachung.pruefeJetzt('8000001');

    expect(empfangen.map((e) => e.typ)).toEqual(['quelle-weg']);
  });

  it('schickt keinen Heartbeat mit veralteten Daten', async () => {
    const ueberwachung = new Ueberwachung(async () => {
      throw new Error('Timetables nicht erreichbar (Test)');
    });
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8000001', [], (e) => empfangen.push(e));

    await ueberwachung.pruefeJetzt('8000001');

    expect(empfangen.some((e) => e.typ === 'heartbeat')).toBe(false);
  });

  it('das Routing laeuft mit den manuellen Eingaben weiter', async () => {
    // Der zweite Teil der Konzeptzeile: Der Tafelausfall darf die Route nicht
    // mitnehmen. Sie haengt allein an Bahnhof und Gleisen.
    const app = buildApp(
      macheClients({
        tafel: vi.fn(async () => {
          throw new Error('Timetables nicht erreichbar (Test)');
        }),
      }),
    );
    const res = await app.inject({ method: 'GET', url: ROUTE_URL });

    expect(res.statusCode).toBe(200);
    expect((res.json() as RouteErgebnis).schritte.length).toBeGreaterThan(0);
  });
});

describe('Zeile 3: FaSta faellt aus', () => {
  // Eigenes Fixture: Der schlichte mini-bahnhof hat gar keinen stufenfreien
  // Weg zwischen den Bahnsteigen - dort waere ein 404 richtig und der Test
  // wuerde nichts ueber FaSta aussagen.
  const aufzugOsm = ladeFixture('synthetisch/mini-bahnhof-aufzug');
  const BF_URL = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=barrierefrei';

  function aufzugClients(fasta: () => Promise<never[]>) {
    return macheClients({ overpass: vi.fn(async () => aufzugOsm), fasta: vi.fn(fasta) });
  }

  it('berechnet die barrierefreie Route trotzdem und warnt vor dem unbekannten Status', async () => {
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

  it('ohne FaSta-Ausfall steht diese Warnung nicht da', async () => {
    // Sonst belegt der Test darueber nur, dass der Satz immer erscheint.
    const app = buildApp(aufzugClients(async () => []));
    const res = await app.inject({ method: 'GET', url: BF_URL });

    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('Aufzugstatus unbekannt'))).toBe(false);
  });
});

describe('Zeile 4: Gleis nicht im OSM-Graphen', () => {
  /** Gleis 9 kennt die DB, das Kartenmaterial nicht. */
  const mitGleis9: StationsInfo = {
    ...ministadt,
    gleise: [{ gleis: '1' }, { gleis: '2' }, { gleis: '9' }],
  };
  const URL_9 = '/api/route?eva=8000001&gleisAn=1&gleisAb=9&profil=normal&variante=schnellste';

  function clientsMitGleis9() {
    const clients = macheClients();
    clients.stations.holeStationsInfo = vi.fn(async () => mitGleis9);
    return clients;
  }

  it('faellt auf das Synthesemodell zurueck, statt „Gleis unbekannt" zu antworten', async () => {
    // Das Gleis IST bekannt - nur nicht kartiert. Ein 404 waere die falsche
    // Auskunft und liesse den Nutzer den Fehler bei sich suchen.
    const res = await buildApp(clientsMitGleis9()).inject({ method: 'GET', url: URL_9 });

    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.stufe).toBe(3);
  });

  it('nennt das Gleis, an dem das Kartenmaterial endet', async () => {
    // Ohne die Nummer bleibt „Gleis nicht im Kartenmaterial gefunden" ein
    // Raetsel: Der Nutzer hat zwei Gleise eingegeben und erfaehrt nicht,
    // welches von beiden die Route ungenau macht.
    const res = await buildApp(clientsMitGleis9()).inject({ method: 'GET', url: URL_9 });

    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('9'))).toBe(true);
  });
});

describe('Zeile 5: Wagenreihung leer', () => {
  const MIT_WAGEN =
    '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste&zugAn=ICE%201006&wagen=26';

  it('startet an der Bahnsteigmitte und sagt es', async () => {
    const app = buildApp(macheClients({ wagenposition: vi.fn(async () => null) }));
    const res = await app.inject({ method: 'GET', url: MIT_WAGEN });

    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('Bahnsteigmitte'))).toBe(true);
  });

  it('ein Netzfehler der Wagenreihung nimmt die Route nicht mit', async () => {
    const app = buildApp(
      macheClients({
        wagenposition: vi.fn(async () => {
          throw new Error('Wagenreihung nicht erreichbar (Test)');
        }),
      }),
    );
    const res = await app.inject({ method: 'GET', url: MIT_WAGEN });

    expect(res.statusCode).toBe(200);
    const ergebnis = res.json() as RouteErgebnis;
    expect(ergebnis.hinweise.some((h) => h.includes('Bahnsteigmitte'))).toBe(true);
  });
});

describe('Zeile 6: SSE-Verbindung bricht ab', () => {
  it('jedes Live-Ereignis traegt einen Zeitstempel', async () => {
    // Der Wiederverbindungsweg liegt im Frontend. Was das Backend dafuer
    // schulden muss, ist der Zeitstempel: Ohne ihn kann die Anzeige nach
    // einem Abriss nicht sagen, wie alt ihr Stand ist (Konzept Abschnitt 3).
    const ueberwachung = new Ueberwachung(async () => []);
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8000001', [], (e) => empfangen.push(e));

    await ueberwachung.pruefeJetzt('8000001');

    expect(empfangen.length).toBeGreaterThan(0);
    for (const ereignis of empfangen) {
      expect(Number.isNaN(new Date(ereignis.zeitstempel).getTime())).toBe(false);
    }
  });

  it('ein abgerissener Abonnent legt die Ueberwachung nicht lahm', async () => {
    // Nach einem Abriss schreibt `sende` in eine tote Verbindung. Wirft das
    // durch, faellt die Ueberwachung fuer ALLE Zuschauer derselben EVA aus.
    const ueberwachung = new Ueberwachung(async () => []);
    const lebende: LiveEreignis[] = [];
    ueberwachung.abonniere('8000001', [], () => {
      throw new Error('Verbindung abgerissen (Test)');
    });
    ueberwachung.abonniere('8000001', [], (e) => lebende.push(e));

    await expect(ueberwachung.pruefeJetzt('8000001')).resolves.toBeUndefined();
    expect(lebende.length).toBeGreaterThan(0);
  });
});
