import type { OverpassAntwort } from '../core/typen.js';
import { pauseFuer, type OverpassPausen } from './overpass-pausen.js';

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
  // `||` statt `??`: Eine leer gesetzte Variable faellt auf die Vorgabe zurueck.
  const primaer = process.env.OVERPASS_URL_PRIMARY || 'https://overpass-api.de/api/interpreter';
  // Ersatz seit 14.10.2026: overpass.kumi.systems (= overpass.private.coffee)
  // antwortet von nirgendwo mehr; maps.mail.ru liefert, wenn auch wackelig.
  const fallback =
    process.env.OVERPASS_URL_FALLBACK || 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
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
  pausen?: OverpassPausen,
): Promise<OverpassAntwort> {
  const ql = baueOverpassQL(lat, lon, radiusM);
  const versuche = instanzReihenfolge();
  // Wer in DIESER Abfrage mit 429, 406 oder abgewiesener Verbindung geantwortet
  // hat, bekommt keinen zweiten Versuch (Spec 2026-10-14, Abschnitt 4).
  const abgewiesen = new Set<string>();
  let gefragt = false;
  let letzterFehler: unknown;

  for (let i = 0; i < versuche.length; i++) {
    const instanz = new URL(versuche[i]).host;
    const pauseBis = pausen?.pausiertBis(instanz) ?? null;
    if (pauseBis || abgewiesen.has(instanz)) {
      const grund = pauseBis ? `pausiert bis ${pauseBis.toISOString()}` : 'pausiert';
      letzterFehler = new Error(`${instanz} ${grund}`);
      beiVersuch?.({ instanz, versuch: i + 1, ok: false, fehler: grund, dauerMs: 0 });
      continue;
    }
    if (gefragt && retryWartezeitMs > 0) {
      await new Promise((r) => setTimeout(r, retryWartezeitMs));
    }
    gefragt = true;
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
      // HTTP 200 heisst bei Overpass nicht Erfolg: Ein Zeit- oder Speicherfehler
      // kommt mit Status 200, einem `remark` und leerem oder teilweisem
      // `elements`. Als Erfolg gewertet laege so eine Antwort 30 Tage im Bestand;
      // als Fehlversuch geht es zur naechsten Instanz wie bei jedem anderen.
      if (typeof antwort.remark === 'string' && /runtime error/i.test(antwort.remark)) {
        throw new Error(`Overpass-Laufzeitfehler: ${antwort.remark.slice(0, 160)}`);
      }
      beiVersuch?.({ instanz, versuch: i + 1, ok: true, status, dauerMs: Date.now() - beginn });
      return antwort;
    } catch (e) {
      letzterFehler = e;
      const ergebnis = { status, fehler: e };
      if (pauseFuer(ergebnis) > 0) {
        abgewiesen.add(instanz);
        pausen?.merke(instanz, ergebnis);
      }
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
  if (!gefragt) throw new Error('Overpass nicht erreichbar: alle Server pausiert');
  throw new Error(`Overpass nicht erreichbar: ${String(letzterFehler)}`);
}
