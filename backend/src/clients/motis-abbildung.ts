import type { Verkehrsmittel } from '../core/typen.js';

/**
 * MOTIS-Modus → eigenes Verkehrsmittel (Spec 5.3). Eine Tabelle statt einer
 * Verzweigung, damit ein neuer Wert eine Zeile ist. Unbekanntes fällt auf
 * `sonstiges`, nie auf einen Fehler: MOTIS hat schon drei Werte umbenannt
 * (METRO, AREAL_LIFT, REGIONAL_FAST_RAIL) und wird es wieder tun.
 *
 * Eine `Map` statt eines Objekts: Der Modus kommt von außen, und ein Wert wie
 * `constructor` träfe in einem Objekt auf eine geerbte Eigenschaft.
 */
const ZUORDNUNG = new Map<string, Verkehrsmittel>([
  ['BUS', 'bus'],
  ['COACH', 'bus'],
  ['TRAM', 'tram'],
  ['SUBWAY', 'ubahn'],
  ['METRO', 'ubahn'],
  ['SUBURBAN', 'sbahn'],
  ['RAIL', 'bahn'],
  ['HIGHSPEED_RAIL', 'bahn'],
  ['LONG_DISTANCE', 'bahn'],
  ['NIGHT_RAIL', 'bahn'],
  ['REGIONAL_RAIL', 'bahn'],
  ['REGIONAL_FAST_RAIL', 'bahn'],
  ['FERRY', 'faehre'],
]);

export function verkehrsmittelAus(mode: string): Verkehrsmittel {
  return ZUORDNUNG.get(mode) ?? 'sonstiges';
}

/**
 * Linienverkehr mit festen Halten. Mitfahrbänke (`RIDE_SHARING`), Rufbus-
 * Bereiche (`ODM`, `FLEX`) und Straßenmodi gehören nicht dazu (Spec 9:
 * „Rufbus-Bereiche ohne festen Halt nicht“).
 */
const OEV = new Set([
  ...ZUORDNUNG.keys(),
  'FUNICULAR',
  'AERIAL_LIFT',
  'AREAL_LIFT',
  'CABLE_CAR',
  'AIRPLANE',
  'OTHER',
]);

export function istOevModus(mode: string): boolean {
  return OEV.has(mode);
}
