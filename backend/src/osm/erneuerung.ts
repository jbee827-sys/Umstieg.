import { OVERPASS_RADIUS_M } from '../clients/overpass.js';
import type { OverpassFn } from '../routes/api.js';
import type { OsmBestand, Warner } from './bestand.js';
import { ABFRAGE_VERSION } from './version.js';

export const PAUSE_MS = 10_000;
export const MAX_PRO_STUNDE = 50;
export const SPERRE_MS = 24 * 60 * 60 * 1000;
const STUNDE_MS = 60 * 60 * 1000;
/** Spec 2026-10-14, Abschnitt 5: so lange nach einem gescheiterten Vordergrundabruf. */
export const NACHHOL_WARTEZEIT_MS = 60 * 60 * 1000;

export interface ErneuerungsAuftrag {
  schluessel: string;
  name: string;
  lat: number;
  lon: number;
  /** Alle Verkehrsstellen – deren Graph-Cache-Eintraege fallen nach einer Erneuerung heraus. */
  evas: string[];
}

export interface OsmErneuerung {
  stosseAn(auftrag: ErneuerungsAuftrag): void;
  /**
   * Nach einem gescheiterten Vordergrundabruf: in `NACHHOL_WARTEZEIT_MS` ueber
   * `stosseAn` erneut versuchen – mit dessen Grenzen. Niemand muss dafuer
   * erneut fragen.
   */
  spaeter(auftrag: ErneuerungsAuftrag): void;
  beiErneuert(fn: (auftrag: ErneuerungsAuftrag) => void): void;
  /** Wartet, bis die Warteschlange leer ist – fuer Tests. */
  leerlauf(): Promise<void>;
}

const STILL: Warner = { warn: () => {} };

/**
 * Erneuert veraltete Bahnhoefe, ohne dass jemand darauf wartet.
 *
 * Hoeflich gegenueber dem oeffentlichen Overpass: einer nach dem anderen,
 * 10 s Pause, hoechstens 50 Aufnahmen je Stunde – nach einem Deploy mit einer
 * neuen Abfrageversion waeren sonst alle Bahnhoefe auf einmal veraltet. Ein
 * Bahnhof wird hoechstens einmal am Tag versucht; scheitert es, bleiben seine
 * alten Daten.
 */
export function erzeugeErneuerung(o: {
  bestand: OsmBestand;
  overpass: OverpassFn;
  log?: Warner;
  jetzt?: () => Date;
  warte?: (ms: number) => Promise<void>;
  pauseMs?: number;
  maxProStunde?: number;
  sperreMs?: number;
  nachholWartezeitMs?: number;
  zeitgeber?: (fn: () => void, ms: number) => void;
}): OsmErneuerung {
  const log = o.log ?? STILL;
  const jetzt = o.jetzt ?? (() => new Date());
  const warte =
    o.warte ??
    ((ms: number) =>
      new Promise<void>((r) => {
        setTimeout(r, ms).unref();
      }));
  const pauseMs = o.pauseMs ?? PAUSE_MS;
  const maxProStunde = o.maxProStunde ?? MAX_PRO_STUNDE;
  const sperreMs = o.sperreMs ?? SPERRE_MS;
  const nachholMs = o.nachholWartezeitMs ?? NACHHOL_WARTEZEIT_MS;
  const zeitgeber =
    o.zeitgeber ??
    ((fn: () => void, ms: number) => {
      setTimeout(fn, ms).unref();
    });
  const vorgemerkt = new Set<string>();

  const warteschlange: ErneuerungsAuftrag[] = [];
  const wartend = new Set<string>();
  const letzterVersuch = new Map<string, number>();
  const aufnahmen: number[] = [];
  const abonnenten: ((a: ErneuerungsAuftrag) => void)[] = [];
  let lauf: Promise<void> | null = null;

  async function erneuere(a: ErneuerungsAuftrag): Promise<void> {
    letzterVersuch.set(a.schluessel, jetzt().getTime());
    try {
      const osm = await o.overpass(a.lat, a.lon, OVERPASS_RADIUS_M);
      const geschrieben = await o.bestand.schreibe({
        schluessel: a.schluessel,
        name: a.name,
        lat: a.lat,
        lon: a.lon,
        geholtAm: jetzt().toISOString(),
        abfrageVersion: ABFRAGE_VERSION,
        osm,
      });
      if (!geschrieben) return;
      for (const fn of abonnenten) {
        try {
          fn(a);
        } catch (e) {
          // Ein Abonnent darf die Warteschlange nicht anhalten.
          log.warn(
            { ereignis: 'osm-erneuerung-abonnent-fehler', schluessel: a.schluessel, bahnhof: a.name, grund: String(e) },
            'OSM-Erneuerung: Abonnent hat geworfen - Erneuerung selbst gelungen',
          );
        }
      }
    } catch (e) {
      log.warn(
        { degradation: 'osm-erneuerung-gescheitert', schluessel: a.schluessel, bahnhof: a.name, grund: String(e) },
        'OSM-Erneuerung gescheitert - alte Daten bleiben',
      );
    } finally {
      wartend.delete(a.schluessel);
    }
  }

  async function arbeite(): Promise<void> {
    let erster = true;
    while (warteschlange.length > 0) {
      if (!erster) await warte(pauseMs);
      erster = false;
      await erneuere(warteschlange.shift() as ErneuerungsAuftrag);
    }
  }

  function starte(): void {
    if (lauf) return;
    lauf = arbeite().finally(() => {
      lauf = null;
      // Was zwischen dem letzten Blick in die Schlange und hier kam, bleibt nicht liegen.
      if (warteschlange.length > 0) starte();
    });
  }

  function stosseAn(a: ErneuerungsAuftrag): void {
    const t = jetzt().getTime();
    if (wartend.has(a.schluessel)) return;
    const letzter = letzterVersuch.get(a.schluessel);
    if (letzter !== undefined && t - letzter < sperreMs) return;
    while (aufnahmen.length > 0 && t - aufnahmen[0] >= STUNDE_MS) aufnahmen.shift();
    if (aufnahmen.length >= maxProStunde) return;
    aufnahmen.push(t);
    wartend.add(a.schluessel);
    warteschlange.push(a);
    starte();
  }

  return {
    stosseAn,
    spaeter(a) {
      if (vorgemerkt.has(a.schluessel)) return;
      vorgemerkt.add(a.schluessel);
      zeitgeber(() => {
        vorgemerkt.delete(a.schluessel);
        stosseAn(a);
      }, nachholMs);
    },
    beiErneuert(fn) {
      abonnenten.push(fn);
    },
    async leerlauf() {
      while (true) {
        const current = lauf;
        if (!current) break;
        await current;
      }
    },
  };
}
