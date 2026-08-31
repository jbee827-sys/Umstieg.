import { epFastaFacilities } from './db-endpunkte.js';
import { dbAuthHeader } from './stations.js';
import type { FastaAnlage } from '../core/typen.js';

interface FastaFacility {
  type?: string; // ELEVATOR | ESCALATOR
  state?: string; // ACTIVE | INACTIVE | UNKNOWN
  description?: string;
  geocoordY?: number; // Breite
  geocoordX?: number; // Länge
}

/**
 * Aufzüge/Rolltreppen mit Betriebsstatus. Nicht-ACTIVE (auch UNKNOWN) wird
 * konservativ als INACTIVE geführt – die barrierefreie Variante verlässt
 * sich nie auf eine Anlage mit unklarem Status.
 */
export async function holeAnlagen(
  stationsnummer: string,
  fetchFn: typeof fetch = fetch,
): Promise<FastaAnlage[]> {
  const antwort = await fetchFn(epFastaFacilities(stationsnummer), {
    headers: { ...dbAuthHeader(), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok) throw new Error(`FaSta: HTTP ${antwort.status}`);
  const body = (await antwort.json()) as FastaFacility[] | { facilities?: FastaFacility[] };
  const facilities = Array.isArray(body) ? body : (body.facilities ?? []);

  return facilities
    .filter(
      (f) =>
        (f.type === 'ELEVATOR' || f.type === 'ESCALATOR') &&
        f.geocoordY !== undefined &&
        f.geocoordX !== undefined,
    )
    .map((f) => ({
      typ: f.type === 'ELEVATOR' ? ('AUFZUG' as const) : ('ROLLTREPPE' as const),
      lat: f.geocoordY!,
      lon: f.geocoordX!,
      status: f.state === 'ACTIVE' ? ('ACTIVE' as const) : ('INACTIVE' as const),
      ...(f.description ? { beschreibung: f.description } : {}),
    }));
}
