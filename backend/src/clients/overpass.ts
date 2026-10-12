import type { OverpassAntwort } from '../core/typen.js';

// Fairness gegenüber den öffentlich geteilten Overpass-Instanzen:
// identifizierbarer User-Agent, Wartezeit zwischen Wiederholversuchen,
// Graph-Ergebnisse werden vom Aufrufer 24 h gecacht.
const USER_AGENT = 'umstiegs-navigator/0.1 (dev)';
const TIMEOUT_MS = 30_000;

/** Umkreis der Bahnhofsabfrage. Bestand, Erneuerung und Route nutzen denselben. */
export const OVERPASS_RADIUS_M = 400;

/**
 * Ein einzelner Versuch. Bis zum 12.10.2026 kannte das Log nur den Fehler des
 * LETZTEN Versuchs – bei Berlin Ostkreuz stand dort ein Timeout des
 * Ersatzservers, was der Hauptserver vorher geantwortet hatte, blieb unbekannt.
 */
export interface OverpassVersuch {
  /** Host der Instanz, z. B. "overpass-api.de". */
  instanz: string;
  /** 1 bis 4 in der Reihenfolge der Instanzen. */
  versuch: number;
  ok: boolean;
  status?: number;
  fehler?: string;
  dauerMs: number;
}

export interface VersuchsLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export function protokolliereVersuch(log: VersuchsLogger): (v: OverpassVersuch) => void {
  return (v) => {
    const eintrag = { ereignis: 'overpass-versuch', ...v };
    if (v.ok) log.info(eintrag, 'Overpass-Versuch');
    else log.warn(eintrag, 'Overpass-Versuch');
  };
}

export function baueOverpassQL(lat: number, lon: number, radiusM: number): string {
  const um = `around:${radiusM},${lat},${lon}`;
  // Elementklassen gemäß Konzept 4.1: Bahnsteige (+ ref-Gleisnummern),
  // Fußwege/Treppen/Korridore, Aufzüge, Rolltreppen (conveying), inkl. aller
  // Tags (level, wheelchair, tunnel, bridge kommen als way-Tags automatisch mit).
  // Große Bahnhöfe mappen Bahnsteige oft als Multipolygon-RELATION – deshalb
  // relation[railway=platform] plus >> (rekursiv bis zu den Member-Nodes).
  //
  // Toiletten und Kioske sind die Zwischenziele der Variante "mit-stopp".
  // Sie kosten JEDE Abfrage etwas, auch die der Mehrheit, die die Variante
  // nie wählt: Der Graph wird je Bahnhof zwischengespeichert, nicht je
  // Variante. Vier Zeilen mehr gegen zwei parallele Cachevarianten war die
  // günstigere Seite des Tauschs. Beide Formen, weil grössere Anlagen als
  // Fläche erfasst sind und kleinere als Punkt.
  //
  // `platform_edge`: Viele grosse Bahnhoefe (Stuttgart, Karlsruhe, Mannheim
  // Hbf) tragen die Gleisnummer nicht am Bahnsteig, sondern an seiner Kante.
  return `[out:json][timeout:25];
(
  way["railway"="platform"](${um});
  relation["railway"="platform"](${um});
  way["railway"="platform_edge"](${um});
  way["highway"~"footway|steps|corridor"](${um});
  node["highway"="elevator"](${um});
  way["highway"="elevator"](${um});
  way["conveying"](${um});
  node["amenity"="toilets"](${um});
  way["amenity"="toilets"](${um});
  node["shop"="kiosk"](${um});
  way["shop"="kiosk"](${um});
);
(._;>>;);
out body;`;
}

function instanzReihenfolge(): string[] {
  const primaer = process.env.OVERPASS_URL_PRIMARY ?? 'https://overpass-api.de/api/interpreter';
  const fallback =
    process.env.OVERPASS_URL_FALLBACK ?? 'https://overpass.kumi.systems/api/interpreter';
  // 2 Versuche primär, dann 2 Versuche Fallback
  return [primaer, primaer, fallback, fallback];
}

export async function overpassQuery(
  lat: number,
  lon: number,
  radiusM: number,
  fetchFn: typeof fetch = fetch,
  retryWartezeitMs = 2000,
  beiVersuch?: (v: OverpassVersuch) => void,
): Promise<OverpassAntwort> {
  const ql = baueOverpassQL(lat, lon, radiusM);
  const versuche = instanzReihenfolge();
  let letzterFehler: unknown;

  for (let i = 0; i < versuche.length; i++) {
    if (i > 0 && retryWartezeitMs > 0) {
      await new Promise((r) => setTimeout(r, retryWartezeitMs));
    }
    const instanz = new URL(versuche[i]).host;
    const beginn = Date.now();
    let status: number | undefined;
    try {
      const res = await fetchFn(versuche[i], {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(ql)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const antwort = (await res.json()) as OverpassAntwort;
      beiVersuch?.({ instanz, versuch: i + 1, ok: true, status, dauerMs: Date.now() - beginn });
      return antwort;
    } catch (e) {
      letzterFehler = e;
      beiVersuch?.({
        instanz,
        versuch: i + 1,
        ok: false,
        status,
        fehler: String(e).slice(0, 200),
        dauerMs: Date.now() - beginn,
      });
    }
  }
  throw new Error(`Overpass nicht erreichbar: ${String(letzterFehler)}`);
}
