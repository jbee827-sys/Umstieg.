import type { OverpassAntwort } from '../core/typen.js';

// Fairness gegenüber den öffentlich geteilten Overpass-Instanzen:
// identifizierbarer User-Agent, Wartezeit zwischen Wiederholversuchen,
// Graph-Ergebnisse werden vom Aufrufer 24 h gecacht.
const USER_AGENT = 'umstiegs-navigator/0.1 (dev)';
const TIMEOUT_MS = 30_000;

export function baueOverpassQL(lat: number, lon: number, radiusM: number): string {
  const um = `around:${radiusM},${lat},${lon}`;
  // Elementklassen gemäß Konzept 4.1: Bahnsteige (+ ref-Gleisnummern),
  // Fußwege/Treppen/Korridore, Aufzüge, Rolltreppen (conveying), inkl. aller
  // Tags (level, wheelchair, tunnel, bridge kommen als way-Tags automatisch mit).
  return `[out:json][timeout:25];
(
  way["railway"="platform"](${um});
  way["highway"~"footway|steps|corridor"](${um});
  node["highway"="elevator"](${um});
  way["highway"="elevator"](${um});
  way["conveying"](${um});
);
(._;>;);
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
): Promise<OverpassAntwort> {
  const ql = baueOverpassQL(lat, lon, radiusM);
  const versuche = instanzReihenfolge();
  let letzterFehler: unknown;

  for (let i = 0; i < versuche.length; i++) {
    if (i > 0 && retryWartezeitMs > 0) {
      await new Promise((r) => setTimeout(r, retryWartezeitMs));
    }
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OverpassAntwort;
    } catch (e) {
      letzterFehler = e;
    }
  }
  throw new Error(`Overpass nicht erreichbar: ${String(letzterFehler)}`);
}
