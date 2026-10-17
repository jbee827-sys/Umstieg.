import { apiUrl } from './basis';
import type { OrteAntwort } from './typen';

/**
 * Suche über Bahnhöfe und Haltestellen in einem (`/api/orte`, Umstieg 2.0).
 * `nicht-verfuegbar` heißt: Keine der beiden Quellen hat geantwortet. Fällt
 * nur eine aus, kommt die Antwort trotzdem – `quellen` sagt, welche fehlt.
 */
export type OrteErgebnis =
  | { ok: true; antwort: OrteAntwort }
  | { ok: false; fehler: 'nicht-verfuegbar' | 'netz' };

async function frage(pfad: string): Promise<OrteErgebnis> {
  try {
    const res = await fetch(apiUrl(pfad));
    if (res.status === 503) return { ok: false, fehler: 'nicht-verfuegbar' };
    if (!res.ok) return { ok: false, fehler: 'netz' };
    return { ok: true, antwort: (await res.json()) as OrteAntwort };
  } catch {
    return { ok: false, fehler: 'netz' };
  }
}

export function sucheOrte(q: string): Promise<OrteErgebnis> {
  return frage(`/api/orte?q=${encodeURIComponent(q)}`);
}

/** Umkreissuche. Die Koordinaten sind bereits gerundet – siehe standort/bahnhofErkennung.ts. */
export function orteNahebei(lat: number, lon: number): Promise<OrteErgebnis> {
  return frage(`/api/orte?lat=${lat}&lon=${lon}`);
}
