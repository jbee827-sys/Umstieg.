import { LRUCache } from 'lru-cache';
import type { Stufe } from '../core/typen.js';

// Einziger Zustand des Backends: RAM-LRU-Caches (kein persistenter Speicher).
// Graphen ~24 h (Schlüssel: Bahnhof), Live-Antworten 30–60 s.
export const GRAPH_TTL_MS = 24 * 60 * 60 * 1000;
export const LIVE_TTL_MS = 30 * 1000;

/**
 * Ein Stufe-3-Graph ist kein Ergebnis, sondern ein Notbehelf: Er entsteht,
 * wenn Overpass ausfällt oder die OSM-Daten unbrauchbar sind. Ihn genauso
 * lange zu halten wie einen guten hiess, einen Bahnhof für einen ganzen Tag
 * zu degradieren – lange nachdem sich die Quelle erholt hat.
 *
 * Zehn Minuten sind der Kompromiss: lange genug, damit ein Overpass-Ausfall
 * nicht bei jedem Aufruf einen neuen Fehlversuch kostet, kurz genug, dass die
 * Erholung im selben Reiseverlauf ankommt.
 */
export const NOTBEHELF_TTL_MS = 10 * 60 * 1000;

/**
 * Der Wert ist begründet, aber nicht gemessen. `GRAPH_NOTBEHELF_TTL_MS`
 * erlaubt, ihn im Betrieb nachzuziehen, ohne neu zu bauen – und Tests, ihn
 * mit echter Zeit zu prüfen statt mit einer nachgebauten Uhr.
 */
function notbehelfTtl(): number {
  const gesetzt = Number(process.env.GRAPH_NOTBEHELF_TTL_MS);
  return Number.isFinite(gesetzt) && gesetzt > 0 ? gesetzt : NOTBEHELF_TTL_MS;
}

export function graphTtlMs(stufe: Stufe): number {
  return stufe === 3 ? notbehelfTtl() : GRAPH_TTL_MS;
}

export function erzeugeCache<V extends object>(max: number, ttlMs: number): LRUCache<string, V> {
  return new LRUCache<string, V>({ max, ttl: ttlMs });
}
