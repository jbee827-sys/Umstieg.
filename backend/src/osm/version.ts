import { createHash } from 'node:crypto';
import { ABFRAGE_MIT_BEZUGSPUNKTEN, baueOverpassQL, OVERPASS_RADIUS_M } from '../clients/overpass.js';
import { mitPtBahnsteigen } from './pt-bahnsteige.js';

const hash = (ql: string): string => createHash('sha256').update(ql).digest('hex').slice(0, 12);

/**
 * Fassung der Overpass-Abfrage – aus ihr selbst abgeleitet, nicht von Hand
 * gezaehlt. Am 02.10.2026 kamen die Bahnsteigkanten dazu; Daten aus der Zeit
 * davor kennen sie nicht. Aendert sich die Abfrage, aendert sich dieser Wert,
 * und alles Gespeicherte gilt als veraltet.
 */
export const ABFRAGE_VERSION = hash(baueOverpassQL(0, 0, OVERPASS_RADIUS_M));

/** Fassung fuer die Bahnhoefe mit Zusatzzeilen (`pt-bahnsteige.ts`). */
export const ABFRAGE_VERSION_PT = hash(baueOverpassQL(0, 0, OVERPASS_RADIUS_M, ABFRAGE_MIT_BEZUGSPUNKTEN, true));

/** Die Fassung, die ein Bahnhof tragen muss, um aktuell zu sein. */
export function abfrageVersionFuer(schluessel: string | undefined): string {
  return mitPtBahnsteigen(schluessel) ? ABFRAGE_VERSION_PT : ABFRAGE_VERSION;
}
