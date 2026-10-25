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

/** Welches der beiden Bahnsteigenden die Spitze des Zuges hat. */
export type Zugspitze = 'anfang' | 'ende';

/**
 * Wie weit der vorherige Halt hoechstens neben der Bahnsteigachse liegen darf
 * (Winkel von der Bahnsteigmitte aus). Darueber ist die Seite geraten: Kurz
 * vor dem Bahnhof kann die Strecke in einer Kurve oder ueber eine Bruecke
 * kommen, und der Halt dahinter liegt dann eher neben als hinter dem
 * Bahnsteig.
 */
export const ZUGSPITZE_HOECHSTWINKEL_GRAD = 60;

/**
 * Dasselbe am Kopfgleis. Dort kommt und geht jeder Zug ueber das Gleisvorfeld
 * - eine Kurve dahinter kann die Seite nicht vertauschen, nur verschieben. In
 * Frankfurt(Main)Hbf laufen die Gleise nach Westsueden aus und biegen dann
 * nach Norden: Frankfurt-West liegt 77° neben der Achse und doch eindeutig
 * auf der Seite des Vorfelds. Nur fast genau senkrecht bleibt es offen.
 */
export const KOPFGLEIS_HOECHSTWINKEL_GRAD = 85;

/** Was ueber den Zug bekannt ist, um seine Spitze zu finden. */
export interface Zuglauf {
  /** Lage des letzten Halts vor diesem Bahnhof. */
  vorher?: Ort;
  /** Lage des naechsten Halts - fehlt, wo der Zug endet. */
  nachher?: Ort;
  /** Das Ankunftsgleis endet am Prellbock (RIS::Stations `headPlatform`). */
  kopfgleis?: boolean;
}

/**
 * Auf welcher Seite des Bahnsteigs ein Ort liegt - das Ende, hinter dem er
 * liegt. `undefined`, wenn er quer zur Achse liegt, auf dem Bahnsteig selbst
 * oder der Bahnsteig keine Laenge hat.
 */
function seiteVon(
  anfang: Ort,
  ende: Ort,
  ort: Ort | undefined,
  hoechstwinkelGrad = ZUGSPITZE_HOECHSTWINKEL_GRAD,
): Zugspitze | undefined {
  if (!ort) return undefined;
  const mitte = { lat: (anfang.lat + ende.lat) / 2, lon: (anfang.lon + ende.lon) / 2 };
  const mLon = M_LAT * Math.cos(mitte.lat * BOGEN);
  const achseOst = (ende.lon - anfang.lon) * mLon;
  const achseNord = (ende.lat - anfang.lat) * M_LAT;
  const laenge = Math.hypot(achseOst, achseNord);
  const ost = (ort.lon - mitte.lon) * mLon;
  const nord = (ort.lat - mitte.lat) * M_LAT;
  const abstand = Math.hypot(ost, nord);
  if (laenge < 1 || abstand <= laenge / 2) return undefined;
  const cos = (ost * achseOst + nord * achseNord) / (laenge * abstand);
  if (Math.abs(cos) < Math.cos(hoechstwinkelGrad * BOGEN)) return undefined;
  return cos > 0 ? 'ende' : 'anfang';
}

const gegenueber = (s: Zugspitze): Zugspitze => (s === 'anfang' ? 'ende' : 'anfang');

/**
 * Wo die Zugspitze am Ankunftsbahnsteig steht (25.10.2026).
 *
 * Die Spitze zeigt zum naechsten Bahnhof. Im Kopfbahnhof steht sie bei der
 * Ankunft am Prellbock und kehrt sich erst mit der Abfahrt um.
 *
 * - Durchgangsgleis: Zuerst der vorherige Halt - die Spitze steht am Ende,
 *   das von ihm weg zeigt. Liegt er quer (Kurve, Abzweig) oder ist seine Lage
 *   unbekannt, der naechste Halt - die Spitze steht am Ende zu ihm hin.
 * - Kopfgleis: Die Spitze steht immer entgegen dem naechsten Halt - der Zug
 *   kehrt und faehrt dorthin zurueck, woher er kam. Endet er hier, entscheidet
 *   der vorherige Halt wie sonst. Quer ist hier erst, was fast senkrecht
 *   liegt (`KOPFGLEIS_HOECHSTWINKEL_GRAD`).
 *
 * Simulation vom 25.10.2026: Bei 2865 von 2892 Ankuenften mit beiden Halten
 * laengs lag der naechste Halt hinter der Spitze - die Rueckfallregel ueber
 * den naechsten Halt widerspricht der Hauptregel also kaum.
 *
 * `undefined` heisst „nicht sicher". Die Knoepfe bleiben dann bei der
 * Himmelsrichtung.
 */
export function bestimmeZugspitze(anfang: Ort, ende: Ort, zuglauf: Zuglauf): Zugspitze | undefined {
  const winkel = zuglauf.kopfgleis ? KOPFGLEIS_HOECHSTWINKEL_GRAD : ZUGSPITZE_HOECHSTWINKEL_GRAD;
  const seiteVorher = seiteVon(anfang, ende, zuglauf.vorher, winkel);
  const seiteNachher = seiteVon(anfang, ende, zuglauf.nachher, winkel);
  if (zuglauf.kopfgleis) {
    if (seiteNachher) return gegenueber(seiteNachher);
    return seiteVorher ? gegenueber(seiteVorher) : undefined;
  }
  if (seiteVorher) return gegenueber(seiteVorher);
  return seiteNachher;
}
