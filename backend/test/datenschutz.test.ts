import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import { buildApp } from '../src/app.js';
import { HaltestellenAnfrageFehler, HaltestellenNichtVerfuegbarError } from '../src/clients/motis-pausen.js';

/**
 * Die veroeffentlichte Datenschutzerklaerung sagt zwei Dinge zu, die der
 * Code halten muss (`frontend/src/components/Datenschutz.tsx`):
 *
 *   „Die Anwendung fuehrt kein Zugriffsprotokoll."
 *   „Ein Zugriffsprotokoll mit Koordinaten wird nicht gefuehrt."
 *   Sicherheits- und Diagnoseeintraege „ohne Personenbezug".
 *
 * Beide Saetze stammen aus der Zeit von `logger: false`. Als am 02.09.2026
 * die Protokollierung eingeschaltet wurde, damit Degradationen nicht laenger
 * lautlos geschehen, wurde damit unbeabsichtigt Fastifys Anfrageprotokoll
 * mitaktiviert - und das schreibt je Anfrage `url` und `remoteAddress`. Die
 * URL der Bahnhofssuche traegt die Koordinate: `/api/stations?lat=..&lon=..`.
 *
 * Eine Zusage in einer Datenschutzerklaerung ist keine Formulierung, sondern
 * eine Eigenschaft des Systems. Diese Tests halten sie fest, damit sie nicht
 * ein zweites Mal nebenbei verlorengeht.
 */
function sammelLogger() {
  const zeilen: Record<string, unknown>[] = [];
  const roh: string[] = [];
  const strom = new Writable({
    write(stueck, _kodierung, fertig) {
      for (const zeile of String(stueck).split('\n')) {
        if (!zeile.trim()) continue;
        roh.push(zeile);
        zeilen.push(JSON.parse(zeile) as Record<string, unknown>);
      }
      fertig();
    },
  });
  return { zeilen, roh, optionen: { logger: { level: 'info', stream: strom } } };
}

function clients() {
  return {
    overpass: vi.fn(async () => ({ elements: [] })),
    stations: {
      holeStationsInfo: vi.fn(async () => ({ eva: '8000001', evas: ['8000001'], name: 'X', gleise: [] })),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

describe('Das Backend haelt seine Datenschutzzusage', () => {
  it('schreibt keine Koordinate ins Protokoll', async () => {
    const log = sammelLogger();
    const app = buildApp(clients() as never, log.optionen as never);

    await app.inject({ method: 'GET', url: '/api/stations?lat=52.52&lon=13.37' });

    // Die gerundete Koordinate ist immer noch eine Koordinate - und sie steht
    // in der URL, also in genau dem Feld, das ein Anfrageprotokoll mitnimmt.
    const alles = log.roh.join('\n');
    expect(alles).not.toContain('52.52');
    expect(alles).not.toContain('13.37');
  });

  it('schreibt keine Client-IP ins Protokoll', async () => {
    const log = sammelLogger();
    const app = buildApp(clients() as never, log.optionen as never);

    await app.inject({ method: 'GET', url: '/api/health' });

    expect(log.roh.join('\n')).not.toContain('remoteAddress');
  });

  it('fuehrt ueberhaupt kein Anfrageprotokoll', async () => {
    // „Die Anwendung fuehrt kein Zugriffsprotokoll." Diagnose- und
    // Sicherheitseintraege sind etwas anderes: Sie haengen an einem Bahnhof
    // oder an einer Route, nicht an einem Menschen. Eine gewoehnliche Anfrage
    // hinterlaesst weiterhin GAR NICHTS.
    const log = sammelLogger();
    const app = buildApp(clients() as never, log.optionen as never);

    await app.inject({ method: 'GET', url: '/api/health' });

    expect(log.zeilen).toEqual([]);
  });

  it('protokolliert Degradationen trotzdem weiter', async () => {
    // Die Gegenprobe: Das Abschalten des Anfrageprotokolls darf nicht die
    // Diagnose mitnehmen, um die es in dieser Runde ueberhaupt ging.
    const log = sammelLogger();
    const c = clients();
    c.stations.ermittleGruppe = vi.fn(async () => {
      throw new Error('RIS::Stations nicht erreichbar (Test)');
    });
    const app = buildApp(c as never, log.optionen as never);

    await app.inject({ method: 'GET', url: '/api/board/8000001?type=dep' });

    expect(log.zeilen.find((z) => z.degradation === 'gruppe-unbekannt')).toBeDefined();
  });

  /**
   * Seit der Haertungsrunde meldet das Backend auch Sicherheitsereignisse
   * (Punkt 18). Das ist die Stelle, an der die Datenschutzzusage haette
   * kippen koennen: Ein Eintrag je abgewiesener Anfrage MIT Adresse waere
   * genau das Zugriffsprotokoll, das es nicht geben soll.
   *
   * Gemeldet wird deshalb nur, DASS eine Grenze gegriffen hat und WO - nie,
   * wer sie ausgeloest hat. Faellt dieser Test, ist die
   * Datenschutzerklaerung unwahr geworden.
   */
  it('meldet eine gegriffene Grenze - ohne Adresse, ohne URL, ohne Koordinate', async () => {
    const log = sammelLogger();
    const app = buildApp(clients() as never, log.optionen as never);

    // Ueber die Grenze von 21 hinaus, und zwar auf der Route, deren URL die
    // Koordinate traegt.
    for (let i = 0; i < 24; i++) {
      await app.inject({
        method: 'GET',
        url: '/api/stations?lat=52.52&lon=13.37',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
    }

    const grenze = log.zeilen.find((z) => z.ereignis === 'ratelimit');
    expect(grenze).toBeDefined();
    expect(grenze!.route).toBe('/api/stations');

    const alles = log.roh.join('\n');
    expect(alles).not.toContain('203.0.113.9');
    expect(alles).not.toContain('52.52');
    expect(alles).not.toContain('13.37');
    expect(alles).not.toContain('remoteAddress');
  });

  it('meldet einen 500er - ohne URL und ohne IP', async () => {
    // `disableRequestLogging` nimmt Fastify auch die Fehlermeldung ab. Ohne
    // eigenen Behandler waere ein echter Serverfehler voellig still - genau
    // der Zustand, gegen den diese ganze Runde geht. Gemeldet wird deshalb
    // selbst, und zwar mit dem Routen-MUSTER (`/api/stations`) statt der
    // aufgerufenen URL: Das benennt die Stelle, ohne die Koordinate
    // mitzunehmen.
    const log = sammelLogger();
    const c = clients();
    c.stations.sucheBahnhoefeNahebei = vi.fn(async () => {
      throw new Error('unerwartet kaputt');
    });
    const app = buildApp(c as never, log.optionen as never);

    const res = await app.inject({ method: 'GET', url: '/api/stations?lat=52.52&lon=13.37' });
    expect(res.statusCode).toBe(500);

    const alles = log.roh.join('\n');
    expect(alles).toContain('unerwartet kaputt');
    expect(alles).toContain('/api/stations');
    // Die Stelle ja, der Anfragende nein.
    expect(alles).not.toContain('52.52');
    expect(alles).not.toContain('13.37');
    expect(alles).not.toContain('remoteAddress');
  });
});

/**
 * Fastify 6 entfernt die Option `disableRequestLogging` ersatzlos - bis zum
 * 04.09.2026 stand deshalb bei jedem Serverstart und jedem Testlauf die
 * Warnung "disableRequestLogging option is deprecated. Use the
 * logController option ..." im Protokoll.
 *
 * Der Umbau auf `logController` darf die Zusage weiter oben in dieser Datei
 * NICHT aendern: Es soll weiterhin nachweislich kein Zugriffsprotokoll
 * geschrieben werden. Dafuer buergen die Tests oben unveraendert - sie
 * bauen dieselbe `buildApp()` und schreiben in denselben Sammel-Logger.
 * Dieser Test prueft nur die Warnung selbst.
 */
describe('Kein Fastify-6-Deprecation-Hinweis mehr', () => {
  it('baut die App, ohne die FSTDEP023-Warnung fuer disableRequestLogging auszuloesen', async () => {
    const gesehen: string[] = [];
    const aufWarnung = (w: { code?: string }) => {
      if (w.code) gesehen.push(w.code);
    };
    process.on('warning', aufWarnung);
    try {
      buildApp(clients() as never);
      // process.emitWarning liefert ueber process.nextTick aus - ohne diese
      // kurze Wartezeit saehe der Test auch dann gruen aus, wenn die Warnung
      // schlicht noch unterwegs waere.
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off('warning', aufWarnung);
    }
    expect(gesehen).not.toContain('FSTDEP023');
  });
});

describe('Ortssuche (Umstieg 2.0): Fehler der Quellen tragen keine Nutzerdaten ins Protokoll', () => {
  /*
   * Die Fehlertexte der Clients enthalten die abgefragte URL - und damit
   * Suchtext oder Koordinate. `/api/orte` protokolliert den Ausfall einer
   * Quelle; der Grund darf nur die Art des Fehlers nennen.
   */
  function ausfallClients(geheim: string) {
    const fehler = new Error(`DB-API https://apis.deutschebahn.com/x?query=${geheim}: HTTP 500`);
    return {
      ...clients(),
      stations: {
        ...clients().stations,
        sucheBahnhoefe: vi.fn(async () => { throw fehler; }),
        sucheBahnhoefeNahebei: vi.fn(async () => { throw fehler; }),
      },
      haltestellen: {
        sucheOrte: vi.fn(async () => { throw new HaltestellenAnfrageFehler(400, `kein Treffer fuer ${geheim}`); }),
        orteNahebei: vi.fn(async () => { throw new HaltestellenNichtVerfuegbarError(`fetch ${geheim} failed`); }),
        tafel: vi.fn(), tafelFrisch: vi.fn(), fussweg: vi.fn(), fahrt: vi.fn(),
      },
    };
  }

  it('Textsuche: kein Suchtext im Protokoll, wohl aber der Ausfall', async () => {
    const log = sammelLogger();
    const app = buildApp(ausfallClients('Lindenstrasse') as never, log.optionen as never);
    await app.inject({ method: 'GET', url: '/api/orte?q=Lindenstrasse' });
    const alles = log.roh.join('\n');
    expect(alles).toContain('haltestellen-unerreichbar');
    expect(alles).toContain('HTTP 500');
    expect(alles).not.toContain('Lindenstrasse');
  });

  it('Standortsuche: keine Koordinate im Protokoll', async () => {
    const log = sammelLogger();
    const app = buildApp(ausfallClients('52.521,13.411') as never, log.optionen as never);
    await app.inject({ method: 'GET', url: '/api/orte?lat=52.521&lon=13.411' });
    const alles = log.roh.join('\n');
    expect(alles).toContain('bahnhofssuche-unerreichbar');
    expect(alles).not.toContain('52.521');
    expect(alles).not.toContain('13.411');
  });
});
