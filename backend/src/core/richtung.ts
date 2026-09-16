import type { Himmelsrichtung } from './typen.js';

/**
 * Richtungen am Bahnsteig.
 *
 * Getrennt von `schema.ts`, weil jetzt auch der Graphbau sie braucht: Seit
 * dem 15.09.2026 bestimmt die Achse einer Ebene, welches Bahnsteigende
 * „anfang" heisst (ToDo 31). Vorher war es das Ende, das OSM zufaellig zuerst
 * zeichnet - an zwei Nachbarbahnsteigen oft entgegengesetzte Enden, und kein
 * Knopf konnte sagen, welches gemeint ist.
 */

const BOGEN = Math.PI / 180;
const M_LAT = 111_320;

export interface Ort {
  lat: number;
  lon: number;
}

/** Peilung a→b in Grad (0 = Nord, im Uhrzeigersinn). */
export function peilungGrad(a: Ort, b: Ort): number {
  const dLon = (b.lon - a.lon) * BOGEN;
  const y = Math.sin(dLon) * Math.cos(b.lat * BOGEN);
  const x =
    Math.cos(a.lat * BOGEN) * Math.sin(b.lat * BOGEN) -
    Math.sin(a.lat * BOGEN) * Math.cos(b.lat * BOGEN) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Mittel mehrerer Achsrichtungen.
 *
 * Über die Winkel zu mitteln wäre falsch: Ein Bahnsteig ist richtungslos,
 * 170° und 10° sind fast dieselbe Achse, ihr arithmetisches Mittel (90°)
 * steht senkrecht darauf. Deshalb über die verdoppelten Winkel mitteln und
 * das Ergebnis halbieren – das übliche Verfahren für Achsen ohne Vorzeichen.
 */
export function mittlereAchse(grade: number[]): number {
  let x = 0;
  let y = 0;
  for (const g of grade) {
    x += Math.cos(2 * g * BOGEN);
    y += Math.sin(2 * g * BOGEN);
  }
  return (Math.atan2(y, x) / 2 / BOGEN + 360) % 180;
}

/**
 * Wohin „Anfang" zeigt: nach Nordwesten.
 *
 * Nordwest statt Nord, damit BEIDE Hauptlagen eine natuerliche Antwort
 * bekommen - eine Nord-Sued-Achse beginnt im Norden, eine West-Ost-Achse im
 * Westen, wie auf jeder Karte von links nach rechts gelesen. Mit reinem Nord
 * waere eine West-Ost-Achse ein Gleichstand.
 */
const BEZUG_GRAD = 315;

function abstandGrad(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Eine richtungslose Achse bekommt ihre Richtung: die der beiden Seiten,
 * die naeher an Nordwest liegt.
 */
export function nachNordwesten(achseGrad: number): number {
  const a = ((achseGrad % 360) + 360) % 360;
  const b = (a + 180) % 360;
  const da = abstandGrad(a, BEZUG_GRAD);
  const db = abstandGrad(b, BEZUG_GRAD);
  if (Math.abs(da - db) > 1e-9) return da < db ? a : b;
  // Gleichstand genau auf der Nordost-Suedwest-Diagonale: Der Norden
  // entscheidet, statt es dem Rechenrauschen zu ueberlassen.
  return Math.cos(a * BOGEN) >= Math.cos(b * BOGEN) ? a : b;
}

/** Die beiden Enden so geordnet, dass das erste weiter in `richtungGrad` liegt. */
export function richteEndenAus<T extends Ort>(a: T, e: T, richtungGrad: number): [T, T] {
  const mLon = M_LAT * Math.cos(((a.lat + e.lat) / 2) * BOGEN);
  const ost = (e.lon - a.lon) * mLon;
  const nord = (e.lat - a.lat) * M_LAT;
  const laengs = ost * Math.sin(richtungGrad * BOGEN) + nord * Math.cos(richtungGrad * BOGEN);
  return laengs > 0 ? [e, a] : [a, e];
}

/**
 * Was ein Knopf über die beiden Enden eines Bahnsteigs sagen darf.
 *
 * VERGLEICHEND: „N" heisst „das nördlichere der beiden Enden", nicht „genau
 * im Norden". Genau so ist es auf jedem Bahnsteig wahr, der nicht exakt
 * West-Ost liegt - und dann sagt die Antwort West und Ost. Deshalb vier
 * Richtungen statt acht: „Nordostende" wäre genauer und passte in keinen
 * Knopf, ohne dass der Reisende damit mehr wüsste.
 */
export function himmelsrichtungen(
  von: Ort,
  bis: Ort,
): { von: Himmelsrichtung; bis: Himmelsrichtung } {
  const mLon = M_LAT * Math.cos(((von.lat + bis.lat) / 2) * BOGEN);
  const ost = (von.lon - bis.lon) * mLon;
  const nord = (von.lat - bis.lat) * M_LAT;
  if (Math.abs(nord) >= Math.abs(ost)) {
    return nord >= 0 ? { von: 'N', bis: 'S' } : { von: 'S', bis: 'N' };
  }
  return ost >= 0 ? { von: 'O', bis: 'W' } : { von: 'W', bis: 'O' };
}
