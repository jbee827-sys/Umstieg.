import { retryAfterMs } from './motis-pausen.js';

/**
 * Aufrufbudget fuer Timetables.
 *
 * Der DB-Plan „Free“ erlaubt 60 Aufrufe je Minute und Anwendung - fuer ALLE
 * Nutzer zusammen, denn hinaus geht es mit einem einzigen Schluessel. Bisher
 * gab es keine Stelle, die mitzaehlte: Fuenf beobachtete Bahnhoefe reichten,
 * um die Quote voll auszuschoepfen, und ab dem sechsten scheiterte jede Tafel
 * an einem 429, den niemand vorhergesehen hatte.
 *
 * Gezaehlt wird in einem GLEITENDEN Fenster. Ein Eimer mit Nachfuellung liesse
 * an einer Minutengrenze den vollen Eimer plus die Nachfuellung durch - fast
 * das Doppelte dessen, was die DB in einer Minute annimmt.
 */

/** Unter den 60 der DB: Puffer fuer Uhrenversatz und Wiederholungen. */
export const TIMETABLES_PRO_MINUTE = 55;

/**
 * Bis hierher darf die Tafel-Route verbrauchen; der Rest gehoert dem
 * Live-Poller. Der Poller bedient Reisende, die schon mitten im Umstieg
 * stehen - die Tafel jemanden, der gerade erst auswaehlt und notfalls einen
 * alten Stand bekommt (`ALT_HOECHSTENS_MS` in `timetables.ts`).
 */
export const TAFEL_ANTEIL_PRO_MINUTE = 40;

const FENSTER_MS = 60_000;
const PAUSE_429_STANDARD_MS = 60_000;
/** Ein `Retry-After` von einem Tag schaltete die Tafel unbemerkt ab. */
const PAUSE_429_HOECHSTENS_MS = 15 * 60_000;

/** Wofuer der Aufruf ist - entscheidet, wer zuerst verzichtet. */
export type TimetablesZweck = 'live' | 'tafel';

/** Budget erschoepft oder die DB hat 429 gesagt: Wiederkommen hilft. */
export class TimetablesAusgelastetError extends Error {
  constructor() {
    super('Timetables-Aufrufbudget erschoepft');
    this.name = 'TimetablesAusgelastetError';
  }
}

export interface TimetablesBudget {
  /** Bucht einen Aufruf, wenn Platz ist. `false` = nicht hinausgehen. */
  nimm(zweck: TimetablesZweck): boolean;
  /** Die DB hat 429 gesagt: bis `Retry-After` geht nichts mehr hinaus. */
  merke429(retryAfter: string | null): void;
}

export function erzeugeTimetablesBudget(
  o: { jetzt?: () => Date; proMinute?: number; tafelAnteil?: number } = {},
): TimetablesBudget {
  const jetzt = o.jetzt ?? (() => new Date());
  const proMinute = o.proMinute ?? TIMETABLES_PRO_MINUTE;
  const tafelAnteil = o.tafelAnteil ?? TAFEL_ANTEIL_PRO_MINUTE;
  /** Zeitpunkte der Aufrufe der letzten Minute, aufsteigend. */
  const aufrufe: number[] = [];
  let pauseBis = 0;

  return {
    nimm(zweck) {
      const t = jetzt().getTime();
      if (t < pauseBis) return false;
      while (aufrufe.length > 0 && aufrufe[0] <= t - FENSTER_MS) aufrufe.shift();
      const grenze = zweck === 'live' ? proMinute : Math.min(tafelAnteil, proMinute);
      if (aufrufe.length >= grenze) return false;
      aufrufe.push(t);
      return true;
    },
    merke429(retryAfter) {
      const t = jetzt();
      // „Sofort wieder“ (0) waere die Einladung zur Wiederholungsschleife.
      const verlangt = retryAfterMs(retryAfter, t);
      const ms = Math.min(verlangt && verlangt > 0 ? verlangt : PAUSE_429_STANDARD_MS, PAUSE_429_HOECHSTENS_MS);
      pauseBis = Math.max(pauseBis, t.getTime() + ms);
    },
  };
}
