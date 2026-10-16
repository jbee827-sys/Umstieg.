import { haversineM } from '../core/graph.js';
import { namensSchluessel } from '../core/orte.js';
import type { Ort, Verkehrsmittel } from '../core/typen.js';
import type { MotisMatch } from './motis-typen.js';

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

const REIHENFOLGE: Verkehrsmittel[] = ['bahn', 'sbahn', 'ubahn', 'tram', 'bus', 'faehre', 'sonstiges'];
/** Unter diesem Abstand ist derselbe Name derselbe Halt aus einer zweiten Quelle. */
const DOPPELT_M = 150;

export function abstandM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineM(a.lat, a.lon, b.lat, b.lon);
}

/** Verkehrsmittel eines Halts: nur Linienverkehr, jedes einmal, feste Reihenfolge. */
export function verkehrsmittelListe(modes: readonly string[] | undefined): Verkehrsmittel[] {
  const da = new Set((Array.isArray(modes) ? modes : []).filter(istOevModus).map(verkehrsmittelAus));
  return REIHENFOLGE.filter((v) => da.has(v));
}

/**
 * Suchtreffer → Orte. Gefiltert wird, was die Erkundung vom 16.10.2026
 * gefunden hat: Adressen, fremde Länder (Wien, New Hamburg), Mitfahrbänke und
 * Parkplätze ohne Linienverkehr, derselbe Halt aus zwei Quellen (DELFI und
 * VBB). Die Reihenfolge bleibt die von MOTIS – sie ist nach Relevanz.
 */
export function orteAusTreffern(treffer: MotisMatch[]): Ort[] {
  const orte: Ort[] = [];
  for (const t of Array.isArray(treffer) ? treffer : []) {
    if (t?.type !== 'STOP') continue;
    // Fehlt das Land, bleibt der Treffer: lieber ein Treffer zu viel als ein
    // deutscher Halt, dessen Quelle das Feld nicht füllt.
    if (t.country !== undefined && t.country !== 'DE') continue;
    const verkehrsmittel = verkehrsmittelListe(t.modes);
    if (verkehrsmittel.length === 0) continue;
    const schluessel = namensSchluessel(t.name);
    const doppelt = orte.some((o) => namensSchluessel(o.name) === schluessel && abstandM(o, t) <= DOPPELT_M);
    if (doppelt) continue;
    orte.push({ name: t.name, lat: t.lat, lon: t.lon, verkehrsmittel, haltestelleId: t.id });
  }
  return orte;
}
