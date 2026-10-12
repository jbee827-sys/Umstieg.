import { createHash } from 'node:crypto';
import { baueOverpassQL, OVERPASS_RADIUS_M } from '../clients/overpass.js';

/**
 * Fassung der Overpass-Abfrage – aus ihr selbst abgeleitet, nicht von Hand
 * gezaehlt. Am 02.10.2026 kamen die Bahnsteigkanten dazu; Daten aus der Zeit
 * davor kennen sie nicht. Aendert sich die Abfrage, aendert sich dieser Wert,
 * und alles Gespeicherte gilt als veraltet.
 */
export const ABFRAGE_VERSION = createHash('sha256')
  .update(baueOverpassQL(0, 0, OVERPASS_RADIUS_M))
  .digest('hex')
  .slice(0, 12);
