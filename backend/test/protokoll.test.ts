import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { Ueberwachung } from '../src/core/ueberwachung.js';
import type { OverpassAntwort, StationsInfo } from '../src/core/typen.js';

/**
 * Das Backend lief mit `logger: false`. Jeder dokumentierte Rueckfall -
 * Overpass weg, FaSta weg, Gruppenaufloesung gescheitert - geschah damit
 * lautlos. Am 01.09.2026 fiel Overpass stundenlang aus; feststellen liess
 * sich das nur, indem man die API von Hand abfragte und aus "Stufe 3" auf
 * die Ursache schloss.
 *
 * Eine bewusste Degradation ist kein Grund zu schweigen. Sie ist der
 * wichtigste Zeitpunkt, etwas zu sagen.
 */
function sammelLogger() {
  const zeilen: Record<string, unknown>[] = [];
  const strom = new Writable({
    write(stueck, _kodierung, fertig) {
      for (const zeile of String(stueck).split('\n')) {
        if (zeile.trim()) zeilen.push(JSON.parse(zeile) as Record<string, unknown>);
      }
      fertig();
    },
  });
  return { zeilen, optionen: { logger: { level: 'info', stream: strom } } };
}

// Echte Geometrie: Eine LEERE Overpass-Antwort waere selbst schon eine
// Degradation (Stufe 3) - der Test "schweigt, wenn nichts degradiert ist"
// braucht einen Bahnhof, der sauber durchlaeuft.
const miniOsm = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/synthetisch/mini-bahnhof.json', import.meta.url)),
    'utf8',
  ),
) as OverpassAntwort;

const ministadt: StationsInfo = {
  eva: '8000001',
  evas: ['8000001'],
  stationID: '4711',
  name: 'Ministadt',
  lat: 52.0,
  lon: 12.0,
  gleise: [{ gleis: '1' }, { gleis: '2' }],
};

function clients(overpassWirft: boolean) {
  return {
    overpass: vi.fn(async (): Promise<OverpassAntwort> => {
      if (overpassWirft) throw new Error('Overpass nicht erreichbar (Test)');
      return miniOsm;
    }),
    stations: {
      holeStationsInfo: vi.fn(async () => ministadt),
      sucheBahnhoefe: vi.fn(async () => []),
      sucheBahnhoefeNahebei: vi.fn(async () => []),
      ermittleGruppe: vi.fn(async (eva: string) => [eva]),
    },
    tafel: vi.fn(async () => []),
    wagenposition: vi.fn(async () => null),
    fasta: vi.fn(async () => []),
  };
}

const ROUTE = '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=schnellste';

describe('Degradationen hinterlassen eine Spur', () => {
  it('protokolliert den Rueckfall aufs Standardmodell mit Grund', async () => {
    const log = sammelLogger();
    const app = buildApp(clients(true) as never, log.optionen as never);
    await app.inject({ method: 'GET', url: ROUTE });

    const degradation = log.zeilen.find((z) => z.degradation === 'kartendaten-fehlen');
    expect(degradation).toBeDefined();
    // Ohne die EVA im Eintrag laesst sich spaeter nicht sagen, WELCHER
    // Bahnhof betroffen war - und genau das will man wissen.
    expect(degradation?.eva).toBe('8000001');
  });

  it('schweigt, wenn nichts degradiert ist', async () => {
    const log = sammelLogger();
    const app = buildApp(clients(false) as never, log.optionen as never);
    await app.inject({ method: 'GET', url: ROUTE });

    expect(log.zeilen.filter((z) => z.degradation)).toEqual([]);
  });

  it('protokolliert eine gescheiterte Gruppenaufloesung', async () => {
    const log = sammelLogger();
    const c = clients(false);
    c.stations.ermittleGruppe = vi.fn(async () => {
      throw new Error('RIS::Stations nicht erreichbar (Test)');
    });
    const app = buildApp(c as never, log.optionen as never);
    const res = await app.inject({ method: 'GET', url: '/api/board/8000001?type=dep' });

    // Die Tafel bleibt bedienbar - aber der Ausfall darf nicht spurlos sein.
    // Sonst sieht eine leere Tafel aus wie "keine Zuege".
    expect(res.statusCode).toBe(200);
    expect(log.zeilen.find((z) => z.degradation === 'gruppe-unbekannt')?.eva).toBe('8000001');
  });

  it('laeuft in Tests ohne Logger, wenn keiner mitgegeben wird', () => {
    // Sonst uebergiesst jeder Testlauf die Ausgabe mit Anfrageprotokoll.
    const app = buildApp(clients(false) as never);
    expect(app).toBeDefined();
  });
});

/**
 * Der Live-Poller wurde bei der Protokollierungsrunde am 02.09.2026
 * uebersehen. Faellt Timetables aus, kehrt `pruefeJetzt` still zurueck: kein
 * Ereignis, kein Heartbeat, kein Eintrag. Der Strom bleibt offen und wird
 * einfach stumm - fuer den Zuschauer nicht von "es aendert sich nichts" zu
 * unterscheiden, und im Betrieb von gar nichts.
 */
describe('Der Live-Poller verstummt nicht lautlos', () => {
  function sammelnd() {
    const zeilen: { daten: Record<string, unknown>; nachricht: string }[] = [];
    return {
      zeilen,
      log: { warn: (daten: Record<string, unknown>, nachricht: string) => zeilen.push({ daten, nachricht }) },
    };
  }

  it('protokolliert einen Tafelausfall mit EVA und Grund', async () => {
    const { zeilen, log } = sammelnd();
    const ueberwachung = new Ueberwachung(
      async () => {
        throw new Error('Timetables nicht erreichbar (Test)');
      },
      30_000,
      log,
    );
    ueberwachung.abonniere('8011160', [], () => {});

    await ueberwachung.pruefeJetzt('8011160');

    const eintrag = zeilen.find((z) => z.daten.degradation === 'tafel-unerreichbar');
    expect(eintrag).toBeDefined();
    expect(eintrag?.daten.eva).toBe('8011160');
  });

  it('schweigt, solange die Tafel antwortet', async () => {
    const { zeilen, log } = sammelnd();
    const ueberwachung = new Ueberwachung(async () => [], 30_000, log);
    ueberwachung.abonniere('8011160', [], () => {});

    await ueberwachung.pruefeJetzt('8011160');

    expect(zeilen).toEqual([]);
  });

  it('laeuft ohne Logger weiter - der Ausfall darf den Poller nicht stoppen', async () => {
    const ueberwachung = new Ueberwachung(async () => {
      throw new Error('Timetables nicht erreichbar (Test)');
    });
    ueberwachung.abonniere('8011160', [], () => {});

    await expect(ueberwachung.pruefeJetzt('8011160')).resolves.toBeUndefined();
  });
});

/**
 * Die Degradationstabelle (Konzept, Abschnitt 8) kennt fuenf Rueckfaelle.
 * Vier hinterlassen inzwischen eine Spur; diese beiden waren die letzten
 * beiden, die nur der Nutzer zu sehen bekam - als Hinweiszeile in der
 * Antwort, waehrend im Betrieb nichts davon ankam. Ein Hinweis an den
 * Reisenden ersetzt keinen Eintrag im Protokoll: Der eine liest ihn und
 * faehrt weiter, der andere muesste die Ursache abstellen.
 */
describe('Auch die letzten beiden Rueckfaelle sind nachvollziehbar', () => {
  const BARRIEREFREI =
    '/api/route?eva=8000001&gleisAn=1&gleisAb=2&profil=normal&variante=barrierefrei';

  it('protokolliert einen FaSta-Ausfall und bleibt ehrlich zum Nutzer', async () => {
    const log = sammelLogger();
    const c = clients(false);
    c.fasta = vi.fn(async () => {
      throw new Error('FaSta nicht erreichbar (Test)');
    });
    const app = buildApp(c as never, log.optionen as never);
    const res = await app.inject({ method: 'GET', url: BARRIEREFREI });

    // Der bestehende Hinweis bleibt - er ist das, was der Reisende braucht.
    expect(JSON.stringify(res.json())).toContain('Aufzugstatus unbekannt');
    expect(log.zeilen.find((z) => z.degradation === 'aufzugstatus-unbekannt')?.eva).toBe('8000001');
  });

  it('protokolliert einen Ausfall der Wagenreihung', async () => {
    const log = sammelLogger();
    const c = clients(false);
    c.wagenposition = vi.fn(async () => {
      throw new Error('Wagenreihung nicht erreichbar (Test)');
    }) as never;
    const app = buildApp(c as never, log.optionen as never);
    const res = await app.inject({ method: 'GET', url: `${ROUTE}&zugAn=1006&wagen=26` });

    // Der Ausfall darf die Route nicht kosten - nur den Abschnitt.
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).toContain('Wagenposition unbekannt');
    expect(log.zeilen.find((z) => z.degradation === 'wagenposition-unbekannt')?.zug).toBe('1006');
  });

  it('schweigt, wenn die Wagenreihung den Wagen schlicht nicht kennt', async () => {
    // Kein Rueckfall, sondern der Normalfall (Konzept 7): Die Auskunft ist
    // da, sie kennt den Wagen nur nicht. Das ist kein Ausfall und gehoert
    // nicht ins Protokoll - sonst rauscht es dort, wo nichts kaputt ist.
    const log = sammelLogger();
    const app = buildApp(clients(false) as never, log.optionen as never);
    const res = await app.inject({ method: 'GET', url: `${ROUTE}&zugAn=1006&wagen=26` });

    expect(JSON.stringify(res.json())).toContain('Wagenposition unbekannt');
    expect(log.zeilen.filter((z) => z.degradation)).toEqual([]);
  });
});
